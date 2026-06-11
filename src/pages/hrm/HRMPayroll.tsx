import { insertJournalWithRetry } from '../../lib/refs'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import { useAuth } from '../../lib/useAuth'
import type { HRMProps, Employee } from './hrmTypes'
import { computePayrollLine, DEFAULT_HR_SETTINGS } from './hrmTypes'

interface PayLine {
  empId: string; name: string; title: string; code: string; contractType: string
  gross: number; nssfEnabled: boolean; payeEnabled: boolean; sdlEnabled: boolean
  allowances: number; deductions: number; advanceDeduction: number
  paye: number; nssfEe: number; nssfEr: number; sdl: number; net: number; band: string
}

export default function HRMPayroll({ onNav: _onNav, hrmMode = 'company', linkedEmployeeId, canManage }: HRMProps) {
  const { user } = useAuth()
  const isSelfMode = hrmMode === 'self'
  const [_employees, setEmployees] = useState<Employee[]>([])
  const [lines, setLines] = useState<PayLine[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [posting, setPosting] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [settings, setSettings] = useState(DEFAULT_HR_SETTINGS)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [empRes, settRes, advRes] = await Promise.all([
      supabase.from('hrm_employees').select('*').eq('is_active', true).order('full_name'),
      supabase.from('system_settings').select('value').eq('key', 'hr_settings').single(),
      supabase.from('hrm_salary_advances').select('employee_id, monthly_deduction').eq('status', 'active'),
    ])
    const emps = empRes.data || []
    setEmployees(emps)
    let s = DEFAULT_HR_SETTINGS
    if (settRes.data?.value) { try { s = { ...DEFAULT_HR_SETTINGS, ...JSON.parse(settRes.data.value) } } catch {} }
    setSettings(s)
    const advMap: Record<string, number> = {}
    ;(advRes.data || []).forEach((a: any) => { advMap[a.employee_id] = (advMap[a.employee_id] || 0) + a.monthly_deduction })

    const computed = emps.map(emp => {
      const advDed = advMap[emp.id] || 0
      const payeOn = emp.paye_enabled !== false  // default true for backwards compat
      const sdlOn = emp.sdl_enabled !== false
      const r = computePayrollLine(emp.gross_salary || 0, emp.nssf_enabled, s.nssf_ee_rate, s.nssf_er_rate, s.sdl_rate, 0, 0, advDed, payeOn, sdlOn)
      return {
        empId: emp.id, name: emp.full_name, title: emp.job_title, code: emp.emp_code,
        contractType: emp.contract_type, gross: emp.gross_salary || 0,
        nssfEnabled: emp.nssf_enabled, payeEnabled: payeOn, sdlEnabled: sdlOn,
        allowances: 0, deductions: 0, advanceDeduction: advDed,
        paye: r.paye, nssfEe: r.nssfEe, nssfEr: r.nssfEr, sdl: r.sdl, net: r.net, band: r.band,
      }
    })
    setLines(computed)
    setLoading(false)
  }

  const recalcLine = (i: number, newGross: number) => {
    const nl = [...lines]
    const line = nl[i]
    const r = computePayrollLine(newGross, line.nssfEnabled, settings.nssf_ee_rate, settings.nssf_er_rate, settings.sdl_rate, line.allowances, line.deductions, line.advanceDeduction, line.payeEnabled, line.sdlEnabled)
    nl[i] = { ...line, gross: newGross, paye: r.paye, nssfEe: r.nssfEe, nssfEr: r.nssfEr, sdl: r.sdl, net: r.net, band: r.band }
    setLines(nl)
  }

  const totals = lines.reduce((acc, l) => ({
    gross: acc.gross + l.gross, paye: acc.paye + l.paye,
    nssfEe: acc.nssfEe + l.nssfEe, nssfEr: acc.nssfEr + l.nssfEr,
    sdl: acc.sdl + l.sdl, net: acc.net + l.net,
    advDed: acc.advDed + l.advanceDeduction,
  }), { gross: 0, paye: 0, nssfEe: 0, nssfEr: 0, sdl: 0, net: 0, advDed: 0 })

  /**
   * Wipe a previously-posted payroll run cleanly.
   *
   * Order matters here. Account balances must be reversed BEFORE the
   * underlying journal_lines are deleted, otherwise we lose the figures
   * needed for the reversal. Salary advances must be restored BEFORE the
   * payroll lines are deleted, since the lines hold the advance_deduction
   * amounts we need to add back.
   *
   * Steps:
   *   1. Pull the old journal id from the payroll run.
   *   2. Pull all journal_lines for that journal — these are the source
   *      of truth for what hit the GL.
   *   3. Reverse each line's balance impact (call update_account_balance
   *      with negated debit/credit).
   *   4. Restore salary advances using the per-line advance_deduction
   *      figures from hrm_payroll_lines.
   *   5. Delete journal_lines, then the journal row.
   *   6. Delete the voucher row that mirrored the journal.
   *   7. Delete hrm_payroll_lines for this run.
   *   8. Delete the hrm_payroll_runs row itself.
   *
   * If anything throws partway through, we surface it to the caller so
   * the user sees a real error instead of a half-cleaned database. There
   * is no automatic compensating rollback — the operations aren't all
   * reversible without a transaction, and Supabase RPCs don't span
   * multiple table writes from the JS client. In practice the steps are
   * ordered so that an early failure leaves the data more-or-less intact.
   */
  const purgeExistingRun = async (runId: string) => {
    // 1. Find the journal — we look it up by source_ref since the run row
    //    only stores journal_ref (a string), not the journal UUID.
    const oldRef = `PAY-${period.replace('-', '')}`
    const { data: oldJournal } = await supabase
      .from('journals').select('id').eq('source_ref', oldRef).maybeSingle()

    if (oldJournal?.id) {
      // 2. Pull old journal lines for the balance reversal
      const { data: oldJLines } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit')
        .eq('journal_id', oldJournal.id)

      // 3. Reverse balances — flip the sign of each side
      if (oldJLines && oldJLines.length > 0) {
        await Promise.all(oldJLines.map(l =>
          supabase.rpc('update_account_balance', {
            p_account_id: l.account_id,
            p_debit: -(l.debit || 0),
            p_credit: -(l.credit || 0),
          })
        ))
      }

      // 5a. Delete journal_lines
      await supabase.from('journal_lines').delete().eq('journal_id', oldJournal.id)
      // 5b. Delete the journal itself
      await supabase.from('journals').delete().eq('id', oldJournal.id)
      // 6. And the voucher row that mirrored it
      await supabase.from('vouchers').delete().eq('ref', oldRef).eq('type', 'payroll')
    }

    // 4. Restore salary advances — read advance_deduction from the old
    //    payroll lines and add it back to the active advance row(s) for
    //    each employee. We mirror the original "deduct from advance with
    //    earliest active advance first" approach, so we restore in the
    //    same order.
    const { data: oldPayLines } = await supabase
      .from('hrm_payroll_lines')
      .select('employee_id, advance_deduction')
      .eq('payroll_run_id', runId)

    for (const pl of (oldPayLines || [])) {
      if (!pl.advance_deduction || pl.advance_deduction <= 0) continue
      // Look up the most recently-touched advance for this employee
      // (status active OR cleared — a fully-cleared advance from the
      // previous post needs to come back to active when restored).
      const { data: advs } = await supabase
        .from('hrm_salary_advances')
        .select('id, remaining, total, monthly_deduction, status')
        .eq('employee_id', pl.employee_id)
        .in('status', ['active', 'cleared'])
        .order('updated_at', { ascending: false })
        .limit(1)

      if (advs && advs.length > 0) {
        const adv = advs[0]
        const restored = Math.min((adv.total || 0), (adv.remaining || 0) + pl.advance_deduction)
        await supabase.from('hrm_salary_advances').update({
          remaining: restored,
          status: restored > 0 ? 'active' : 'cleared',
        }).eq('id', adv.id)
      }
    }

    // 7. Delete payroll lines for this run
    await supabase.from('hrm_payroll_lines').delete().eq('payroll_run_id', runId)
    // 8. Delete the run itself
    await supabase.from('hrm_payroll_runs').delete().eq('id', runId)
  }

  const postPayroll = async () => {
    if (lines.length === 0) return
    const userName = user?.full_name || 'System'
    const ref = `PAY-${period.replace('-', '')}`

    // ── PRE-CHECK: is this period already posted? ──────────────────
    // Earlier versions of this file blindly tried to insert a fresh journal
    // every click, which collided with the unique constraint on journals.ref
    // and looked to the user like an opaque "Journal ref collision" error
    // that retried itself out and never resolved. The right semantics for
    // payroll is "one posted run per period at a time". If the user wants
    // to redo the period, they need to wipe the previous one first.
    const { data: existing } = await supabase
      .from('hrm_payroll_runs')
      .select('id, posted_at, posted_by, status')
      .eq('period', period)
      .eq('status', 'posted')
      .order('posted_at', { ascending: false })
      .limit(1)

    if (existing && existing.length > 0) {
      const prev = existing[0]
      const when = prev.posted_at ? new Date(prev.posted_at).toLocaleString() : '(no timestamp)'
      const ok = confirm(
        `Payroll for ${period} has already been posted.\n\n` +
        `  Previously posted by: ${prev.posted_by || '(unknown)'}\n` +
        `  Previously posted at: ${when}\n\n` +
        `Re-posting will REPLACE the existing run:\n` +
        `  • Reverse the old journal's account-balance impact\n` +
        `  • Delete the old journal + its lines\n` +
        `  • Delete the old payroll run + its line items\n` +
        `  • Restore previously-deducted salary advances\n` +
        `  • Then post a fresh run with the figures shown on screen\n\n` +
        `This is irreversible. Continue?`
      )
      if (!ok) return

      setPosting(true)
      try {
        await purgeExistingRun(prev.id)
      } catch (err: any) {
        setToast(`Failed to clear previous ${period} run: ${err.message || err}`); setToastType('error')
        setPosting(false)
        return
      }
    } else {
      setPosting(true)
    }

    try {
      // ── 1. Resolve payroll accounts by NAME (with code fallback) ────────
      // Why name-first: account codes have drifted in the past (e.g. 2040 was
      // "NSSF Payable" then got repurposed to "Accrued Expenses"). Hardcoding
      // 2040 then blindly posting silently routed payroll to the wrong account
      // for an entire month. By looking up by name and only falling back to
      // a known set of historical codes, we still find the account when the
      // code drifts AND fail loudly with a clear error if neither hits.
      //
      // The 'preferredCode' is just what we use if we have to CREATE the
      // account from scratch — never used for lookup of existing accounts.
      type PayrollAcctSpec = {
        key: string
        names: string[]              // accepted name variants (case-insensitive contains-match)
        fallbackCodes: string[]      // historical codes to try if name lookup fails
        preferredCode: string        // code used if we need to CREATE the account
        type: 'expense' | 'liability' | 'asset'
        category: string
      }

      const payrollAccountSpecs: PayrollAcctSpec[] = [
        { key: 'salary',     names: ['Salaries', 'Salary'],            fallbackCodes: ['6010'],         preferredCode: '6010', type: 'expense',   category: 'People' },
        { key: 'nssfExp',    names: ['NSSF Expense', 'NSSF Employer'], fallbackCodes: ['6020'],         preferredCode: '6020', type: 'expense',   category: 'People' },
        { key: 'sdlExp',     names: ['SDL Expense'],                   fallbackCodes: ['6030'],         preferredCode: '6030', type: 'expense',   category: 'People' },
        { key: 'payePay',    names: ['PAYE Payable', 'PAYE'],          fallbackCodes: ['2030'],         preferredCode: '2030', type: 'liability', category: 'Payroll Tax' },
        { key: 'nssfPay',    names: ['NSSF Payable', 'NSSF / WCF'],    fallbackCodes: ['2031', '2040'], preferredCode: '2031', type: 'liability', category: 'Payroll Tax' },
        { key: 'sdlPay',     names: ['SDL Payable'],                   fallbackCodes: ['2033', '2050'], preferredCode: '2033', type: 'liability', category: 'Payroll Tax' },
        { key: 'netPay',     names: ['Net Salary Payable', 'Net Pay Payable'], fallbackCodes: ['2032', '2060'], preferredCode: '2032', type: 'liability', category: 'Payroll' },
      ]

      // Pull every active account once — we'll do all the resolution in memory.
      const { data: allAccounts } = await supabase
        .from('accounts')
        .select('id, code, name, type, is_active')
        .eq('is_active', true)
      if (!allAccounts) throw new Error('Could not load chart of accounts')

      const resolved: Record<string, string> = {}     // key → account_id
      const toCreate: PayrollAcctSpec[] = []

      for (const spec of payrollAccountSpecs) {
        // 1) Try matching by name (case-insensitive contains).
        //    We require the matched account to be of the expected `type` so a
        //    coincidental name collision (e.g. "PAYE adjustment expense") doesn't
        //    misroute a liability posting.
        let hit = allAccounts.find(a =>
          a.type === spec.type &&
          spec.names.some(n => a.name.toLowerCase().includes(n.toLowerCase()))
        )
        // 2) Fall back to known historical codes — but only if the name there
        //    doesn't actively conflict with another payroll account name.
        if (!hit) {
          for (const code of spec.fallbackCodes) {
            const candidate = allAccounts.find(a => a.code === code && a.type === spec.type)
            if (candidate) { hit = candidate; break }
          }
        }
        if (hit) {
          resolved[spec.key] = hit.id
        } else {
          toCreate.push(spec)
        }
      }

      // Auto-create any accounts that don't exist anywhere — using their preferred code.
      // If the preferred code is already taken (by an unrelated account), we surface
      // the conflict to the user loudly rather than overwrite anything.
      if (toCreate.length > 0) {
        const conflictingCodes: string[] = []
        for (const spec of toCreate) {
          const existing = allAccounts.find(a => a.code === spec.preferredCode)
          if (existing) {
            conflictingCodes.push(`${spec.preferredCode} ("${existing.name}") wanted by ${spec.names[0]}`)
          }
        }
        if (conflictingCodes.length > 0) {
          throw new Error(
            `Cannot create payroll accounts — preferred codes are taken by other accounts:\n` +
            conflictingCodes.join('\n') +
            `\n\nFix: open Chart of Accounts and either rename the conflicting accounts or` +
            ` manually create the missing payroll accounts with available codes, then retry.`
          )
        }

        const { data: created, error: insertErr } = await supabase.from('accounts').insert(
          toCreate.map(s => ({
            code: s.preferredCode, name: s.names[0], type: s.type, category: s.category,
            balance: 0, is_active: true,
          }))
        ).select('id, code, name, type')
        if (insertErr || !created) throw new Error(`Failed to create payroll accounts: ${insertErr?.message || 'unknown'}`)

        // Wire the freshly-created ids into resolved
        for (const spec of toCreate) {
          const c = created.find(x => x.code === spec.preferredCode)
          if (!c) throw new Error(`Could not find created account for ${spec.names[0]}`)
          resolved[spec.key] = c.id
        }
      }

      // Final sanity check — every spec must have an id by now.
      for (const spec of payrollAccountSpecs) {
        if (!resolved[spec.key]) {
          throw new Error(`Payroll account "${spec.names[0]}" could not be resolved or created. Check Chart of Accounts.`)
        }
      }

      const salaryId = resolved.salary
      const nssfExpId = resolved.nssfExp
      const sdlExpId = resolved.sdlExp
      const payePayId = resolved.payePay
      const nssfPayId = resolved.nssfPay
      const sdlPayId = resolved.sdlPay
      const netPayId = resolved.netPay


      // ── 2. Create payroll run in HRM ──────────────────
      const { data: run, error: runErr } = await supabase.from('hrm_payroll_runs').insert({
        period, status: 'posted', journal_ref: ref,
        posted_by: userName, posted_at: new Date().toISOString(),
      }).select('id').single()
      if (runErr || !run) throw new Error(runErr?.message || 'Payroll run insert failed')

      // ── 3. Insert payroll lines ───────────────────────
      const payLines = lines.map(l => ({
        payroll_run_id: run.id, employee_id: l.empId,
        gross: l.gross, allowances: l.allowances, deductions: l.deductions,
        advance_deduction: l.advanceDeduction,
        paye: l.paye, nssf_ee: l.nssfEe, nssf_er: l.nssfEr, sdl: l.sdl, net_pay: l.net,
        payslip_sent: false,
      }))
      const { error: lineErr } = await supabase.from('hrm_payroll_lines').insert(payLines)
      if (lineErr) throw new Error(lineErr.message)

      // ── 4. Create accounting journal ──────────────────
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + ref, posting_date: `${period}-28`,
        description: `Payroll — ${period} — ${lines.length} employees`,
        journal_type: 'payroll', source_type: 'payroll', source_ref: ref,
        posted_by: userName, status: 'posted',
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw

      // ── 5. Build journal lines ────────────────────────
      const jLines: { journal_id: string; line_number: number; account_id: string; description: string; debit: number; credit: number }[] = []
      let ln = 1

      // Dr Salary Expense (6010) — total gross
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: salaryId,
        description: `Gross salaries — ${period}`, debit: totals.gross, credit: 0 })

      // Cr PAYE Payable (2030) — total PAYE withheld
      if (totals.paye > 0) {
        jLines.push({ journal_id: journal.id, line_number: ln++, account_id: payePayId,
          description: `PAYE withheld — ${period}`, debit: 0, credit: totals.paye })
      }

      // Cr NSSF Payable (2040) — employee NSSF contribution
      if (totals.nssfEe > 0) {
        jLines.push({ journal_id: journal.id, line_number: ln++, account_id: nssfPayId,
          description: `NSSF employee contribution — ${period}`, debit: 0, credit: totals.nssfEe })
      }

      // Cr Net Salary Payable (2060) — net pay owed (before advance deduction)
      // Advance deduction is handled separately below as Dr 2060 / Cr 1060
      const preAdvanceNet = totals.net + totals.advDed
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: netPayId,
        description: `Net salary payable — ${period}`, debit: 0, credit: preAdvanceNet })

      // Dr NSSF Expense (6020) / Cr NSSF Payable (2040) — employer NSSF
      if (totals.nssfEr > 0) {
        jLines.push({ journal_id: journal.id, line_number: ln++, account_id: nssfExpId,
          description: `NSSF employer contribution — ${period}`, debit: totals.nssfEr, credit: 0 })
        jLines.push({ journal_id: journal.id, line_number: ln++, account_id: nssfPayId,
          description: `NSSF employer payable — ${period}`, debit: 0, credit: totals.nssfEr })
      }

      // Dr SDL Expense (6030) / Cr SDL Payable (2050) — SDL
      if (totals.sdl > 0) {
        jLines.push({ journal_id: journal.id, line_number: ln++, account_id: sdlExpId,
          description: `SDL — ${period}`, debit: totals.sdl, credit: 0 })
        jLines.push({ journal_id: journal.id, line_number: ln++, account_id: sdlPayId,
          description: `SDL payable — ${period}`, debit: 0, credit: totals.sdl })
      }

      // Advance recovery: Cr Salary Advance Receivable — reduces employee debt
      // The net pay (Net Salary Payable) is already reduced by advance amount
      // in the computation, so we need to explicitly clear the advance asset.
      // Same name-first / fallback-code resolution pattern as the main payroll
      // accounts above. Code 1060 was used historically but got repurposed
      // to "VAT Receivable" — never trust just the code.
      if (totals.advDed > 0) {
        let advAcctId: string | null = null

        // Try by name first
        const advByName = allAccounts.find(a =>
          a.type === 'asset' && a.name.toLowerCase().includes('salary advance')
        )
        if (advByName) {
          advAcctId = advByName.id
        } else {
          // Fall back to historical codes (1061 is the new home, 1060 was the old one)
          for (const code of ['1061', '1060']) {
            const candidate = allAccounts.find(a => a.code === code && a.type === 'asset' && a.name.toLowerCase().includes('advance'))
            if (candidate) { advAcctId = candidate.id; break }
          }
        }

        // If still missing, create at the new preferred code 1061 — but only
        // if 1061 isn't taken by something unrelated.
        if (!advAcctId) {
          const conflict = allAccounts.find(a => a.code === '1061')
          if (conflict && !conflict.name.toLowerCase().includes('advance')) {
            throw new Error(
              `Cannot create Salary Advance Receivable — code 1061 is already used by "${conflict.name}". ` +
              `Open Chart of Accounts and free up code 1061 (or create the advance account manually under a different code) before posting.`
            )
          }
          if (!conflict) {
            const { data: created, error: createErr } = await supabase.from('accounts').insert({
              code: '1061', name: 'Salary Advance Receivable', type: 'asset',
              category: 'Current Assets', balance: 0, is_active: true,
            }).select('id').single()
            if (createErr || !created) throw new Error(`Failed to create Salary Advance Receivable: ${createErr?.message || 'unknown'}`)
            advAcctId = created.id
          } else {
            // conflict is itself the advance account by name — reuse
            advAcctId = conflict.id
          }
        }

        if (advAcctId) {
          // The net pay credited to Net Salary Payable is already net of advances.
          // To balance: Dr Net Salary Payable / Cr Salary Advance Receivable.
          jLines.push({ journal_id: journal.id, line_number: ln++, account_id: netPayId,
            description: `Advance recovery from salaries — ${period}`, debit: totals.advDed, credit: 0 })
          jLines.push({ journal_id: journal.id, line_number: ln++, account_id: advAcctId,
            description: `Advance recovery — ${period}`, debit: 0, credit: totals.advDed })
        }
      }

      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error(jlErr.message)

      // ── 6. Update account balances ────────────────────
      await Promise.all(jLines.map(l =>
        supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })
      ))

      // ── 7. Create voucher record ──────────────────────
      await supabase.from('vouchers').insert({
        ref, type: 'payroll', posting_date: `${period}-28`,
        description: `Payroll — ${period} — ${lines.length} employees`,
        total_amount: totals.gross + totals.nssfEr + totals.sdl,
        status: 'posted', journal_id: journal.id,
        notes: `Gross: ${totals.gross.toLocaleString()} · PAYE: ${totals.paye.toLocaleString()} · NSSF Ee: ${totals.nssfEe.toLocaleString()} · Er: ${totals.nssfEr.toLocaleString()} · SDL: ${totals.sdl.toLocaleString()} · Net: ${totals.net.toLocaleString()}`,
        posted_by: userName,
      })

      // ── 8. Deduct salary advances ─────────────────────
      for (const l of lines) {
        if (l.advanceDeduction > 0) {
          const { data: advs } = await supabase.from('hrm_salary_advances')
            .select('id, remaining, monthly_deduction')
            .eq('employee_id', l.empId).eq('status', 'active')
          for (const adv of (advs || [])) {
            const newRemaining = Math.max(0, adv.remaining - adv.monthly_deduction)
            await supabase.from('hrm_salary_advances').update({
              remaining: newRemaining, status: newRemaining <= 0 ? 'cleared' : 'active',
            }).eq('id', adv.id)
          }
        }
      }

      setToast(`Payroll ${period} posted to accounts · Dr Salaries (6010) ${totals.gross.toLocaleString()} · Cr PAYE (2030) · Cr NSSF (2040) · Cr Net Pay (2060)`)
      setToastType('success')
    } catch (err: any) {
      setToast(err.message || 'Post failed'); setToastType('error')
    }
    setPosting(false)
  }

  // Self mode: show only own line
  const displayLines = isSelfMode && linkedEmployeeId
    ? lines.filter(l => l.empId === linkedEmployeeId)
    : lines

  const bandColor = (b: string) => b === '30%' ? '#ef4444' : b === '25%' ? '#f59e0b' : b === '20%' ? '#3b82f6' : b === '8%' ? '#22c55e' : 'var(--text3)'
  const fmt = (n: number) => n.toLocaleString()

  const displayTotals = displayLines.reduce((acc, l) => ({
    gross: acc.gross + l.gross, paye: acc.paye + l.paye,
    nssfEe: acc.nssfEe + l.nssfEe, nssfEr: acc.nssfEr + l.nssfEr,
    sdl: acc.sdl + l.sdl, net: acc.net + l.net,
    advDed: acc.advDed + l.advanceDeduction,
  }), { gross: 0, paye: 0, nssfEe: 0, nssfEr: 0, sdl: 0, net: 0, advDed: 0 })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{isSelfMode ? 'My Payroll' : 'Payroll Run'}</div>
          <div className="page-sub">{isSelfMode ? 'Your salary breakdown' : `TRA 2024 PAYE bands · NSSF optional per employee · SDL ${settings.sdl_rate}% · Posts to accounts: 6010, 2030, 2040, 2050, 2060`}</div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>
            <span>Month</span>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer', outline: 'none' }} />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={load}>Recompute</button>
          {canManage && <button className="btn btn-primary btn-sm" onClick={postPayroll} disabled={posting}>{posting ? 'Posting...' : 'Post Journal'}</button>}
        </div>
      </div>

      {/* PAYE Reference — hide in self mode */}
      {!isSelfMode && (
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', background: '#6366f108', border: '1px solid #6366f133' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Tanzania PAYE Bands 2024 (TRA) - Monthly</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11 }}>
          <span>0-270K: <strong>0%</strong></span>
          <span>270K-520K: <strong>8%</strong></span>
          <span>520K-760K: <strong>20%</strong></span>
          <span>760K-1M: <strong>25%</strong></span>
          <span>Above 1M: <strong>30%</strong></span>
          <span style={{ marginLeft: 'auto', color: 'var(--text3)' }}>NSSF: Ee {settings.nssf_ee_rate}% + Er {settings.nssf_er_rate}% (when enrolled) · SDL: {settings.sdl_rate}%</span>
        </div>
      </div>
      )}

      {/* KPI Strip — hide in self mode */}
      {!isSelfMode && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 18 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #6366f1' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#6366f1' }}>{loading ? '...' : fmt(displayTotals.gross)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Gross (TZS)</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #ef4444' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#ef4444' }}>{loading ? '...' : fmt(displayTotals.paye)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>PAYE</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #f59e0b' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>{loading ? '...' : fmt(displayTotals.nssfEe)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Ee NSSF</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid var(--accent)' }}><div style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)' }}>{loading ? '...' : fmt(displayTotals.net)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Net Pay</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #a78bfa' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#a78bfa' }}>{loading ? '...' : fmt(displayTotals.nssfEr + displayTotals.sdl)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Er Costs</div></div>
      </div>
      )}

      {/* Payroll Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{isSelfMode ? `My Salary — ${period}` : `Employee Payroll - ${period}`}</div>
          {!isSelfMode && <div style={{ fontSize: 10, color: 'var(--text3)' }}>Edit gross to recalculate live</div>}
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1000 }}>
              <thead><tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: 'var(--text3)' }}>EMPLOYEE</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: 'var(--text3)' }}>GROSS</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: '#ef4444' }}>PAYE</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: '#f59e0b' }}>NSSF Ee</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: 'var(--text3)' }}>Adv. Ded</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: 'var(--accent)', fontWeight: 800 }}>NET PAY</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: '#a78bfa' }}>Er NSSF</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: '#a78bfa' }}>SDL</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 10, color: 'var(--text3)' }}>BAND</th>
              </tr></thead>
              <tbody>
                {displayLines.map((l, i) => (
                  <tr key={l.empId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px' }}><div style={{ fontWeight: 700 }}>{l.name}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>{l.title} · {l.code}{!l.nssfEnabled ? ' · No NSSF' : ''}{!l.payeEnabled ? ' · No PAYE' : ''}{!l.sdlEnabled ? ' · No SDL' : ''}</div></td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                      {isSelfMode
                        ? <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt(l.gross)}</span>
                        : <input type="number" value={l.gross} onChange={e => recalcLine(i, parseFloat(e.target.value) || 0)} style={{ width: 110, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 5, fontSize: 12, fontFamily: 'var(--mono)', textAlign: 'right' }} />
                      }
                    </td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', color: '#ef4444' }}>{fmt(l.paye)}</td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', color: l.nssfEe > 0 ? '#f59e0b' : 'var(--text3)' }}>{l.nssfEe > 0 ? fmt(l.nssfEe) : '---'}</td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', color: l.advanceDeduction > 0 ? '#ef4444' : 'var(--text3)' }}>{l.advanceDeduction > 0 ? `(${fmt(l.advanceDeduction)})` : '---'}</td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--accent)' }}>{fmt(l.net)}</td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', color: l.nssfEr > 0 ? '#a78bfa' : 'var(--text3)' }}>{l.nssfEr > 0 ? fmt(l.nssfEr) : '---'}</td>
                    <td className="td-right td-mono" style={{ padding: '10px 14px', color: '#a78bfa' }}>{fmt(l.sdl)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}><span style={{ fontSize: 10, background: `${bandColor(l.band)}22`, color: bandColor(l.band), padding: '2px 8px', borderRadius: 4 }}>{l.band}</span></td>
                  </tr>
                ))}
              </tbody>
              {!isSelfMode && (
              <tfoot>
                <tr style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 800, fontSize: 12 }}>TOTALS</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800 }}>{fmt(totals.gross)}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: '#ef4444' }}>{fmt(totals.paye)}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: '#f59e0b' }}>{fmt(totals.nssfEe)}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: '#ef4444' }}>{totals.advDed > 0 ? `(${fmt(totals.advDed)})` : '---'}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--accent)' }}>{fmt(totals.net)}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: '#a78bfa' }}>{fmt(totals.nssfEr)}</td>
                  <td className="td-right td-mono" style={{ padding: '10px 14px', fontWeight: 800, color: '#a78bfa' }}>{fmt(totals.sdl)}</td>
                  <td></td>
                </tr>
              </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
