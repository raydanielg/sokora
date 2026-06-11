import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { today, tzs } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { checkApprovalRequired, submitForApproval, formatApprovalNotice, type ApprovalCheckResult } from '../../lib/useApproval'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface ExpLine { desc: string; amount: number; accountId: string }

export default function PettyCash({ onNav }: Props) {
  const { user, isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [expAccounts, setExpAccounts] = useState<{id:string;code:string;name:string}[]>([])
  const [pettyCashId, setPettyCashId] = useState('')
  const [pettyCashBal, setPettyCashBal] = useState(0)
  const [lines, setLines] = useState<ExpLine[]>([{ desc: '', amount: 0, accountId: '' }])
  const [form, setForm] = useState({ date: today(), ref: '', paidTo: '', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const [{ data: accts }, { data: petty }, newRef] = await Promise.all([
      supabase.from('accounts').select('id, code, name').eq('type', 'expense').eq('is_active', true).order('code'),
      supabase.from('accounts').select('id, balance').eq('code', '1040').single(),
      nextRef('petty_cash'),
    ])
    if (accts) setExpAccounts(accts)
    if (petty) { setPettyCashId(petty.id); setPettyCashBal(petty.balance || 0) }
    setForm(f => ({ ...f, ref: newRef }))
  }

  const updateLine = (i: number, k: keyof ExpLine, v: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [k]: v as never }; setLines(nl)
  }
  const total = lines.reduce((s, l) => s + (l.amount || 0), 0)
  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  // ─── Live approval pre-check ──────────────────────────────────────────
  // Run checkApprovalRequired whenever the total changes so the UI can
  // tell the cashier ahead of time that this expense will need approval.
  // The check is cheap (single Supabase row lookup) and debounced via a
  // 250ms timer to avoid hammering the DB while she's still typing.
  // Result drives the pre-submit banner + the button label below — no
  // surprise "Access Denied"-feel padlock at posting time.
  const [approvalCheck, setApprovalCheck] = useState<ApprovalCheckResult | null>(null)
  useEffect(() => {
    if (total <= 0) { setApprovalCheck(null); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const res = await checkApprovalRequired('petty_cash', { value: total })
      if (!cancelled) setApprovalCheck(res)
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [total])

  const canBypassApproval = (approvalCheck?.superAdminBypass ?? false) && isSuperAdmin()
  const needsApproval = !!approvalCheck?.requiresApproval && !!approvalCheck?.blockPosting && !canBypassApproval
  const approvalNotice = approvalCheck ? formatApprovalNotice(approvalCheck) : ''

  // Reset the form after a successful post or submission — keeps the
  // cashier on the same page with a fresh ref, ready to log the next
  // expense. Replaces the old onNav('approvals') redirect which sent
  // her to an approver-only page she couldn't access.
  const resetForm = async () => {
    const newRef = await nextRef('petty_cash')
    setForm({ date: today(), ref: newRef, paidTo: '', notes: '' })
    setLines([{ desc: '', amount: 0, accountId: '' }])
    setApprovalCheck(null)
  }

  const post = async () => {
    if (!form.paidTo.trim()) { showToast('Paid to is required', 'error'); return }
    if (lines.every(l => !l.desc || !l.amount)) { showToast('Add at least one expense line', 'error'); return }
    if (lines.some(l => l.amount > 0 && !l.accountId)) { showToast('Select expense account for each line', 'error'); return }
    if (!pettyCashId) { showToast('Petty Cash account (1040) not found', 'error'); return }
    if (!form.ref) { showToast('Reference number not generated', 'error'); return }
    if (!user) { showToast('You must be signed in', 'error'); return }
    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }

    // ─── Approval gate ─────────────────────────────────────────────────
    // We already have a cached approval pre-check from the live useEffect
    // above. Re-run it here as a safety net (in case approval rules
    // changed mid-session) so we never submit something that no longer
    // needs approval, or vice versa.
    const check = await checkApprovalRequired('petty_cash', { value: total })
    const canBypass = check.superAdminBypass && isSuperAdmin()
    if (check.requiresApproval && check.blockPosting && !canBypass) {
      await submitPettyCashForApproval(check.reason || 'Approval required')
      return
    }

    setPosting(true)
    try {
      const { data: jRaw, error: jErr } = await insertJournalWithRetry({
        ref: form.ref, posting_date: form.date,
        description: `Petty Cash — ${form.paidTo}`,
        journal_type: 'petty_cash', source_type: 'petty_cash', source_ref: form.ref,
        posted_by: user.full_name, status: 'posted',
      })  
      if (jErr || !jRaw) throw new Error(jErr?.message || "Journal insert failed")
      const j = jRaw

      const jLines: any[] = []
      let ln = 1
      for (const line of lines) {
        if (!line.amount || !line.accountId) continue
        jLines.push({ journal_id: j.id, line_number: ln++, account_id: line.accountId, description: line.desc, debit: line.amount, credit: 0 })
      }
      jLines.push({ journal_id: j.id, line_number: ln, account_id: pettyCashId, description: `Petty cash out — ${form.paidTo}`, debit: 0, credit: total })

      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error(jlErr.message)

      await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'petty_cash', posting_date: form.date,
        description: `Petty Cash — ${form.paidTo}`, total_amount: total,
        status: 'posted', journal_id: j.id, posted_by: user.full_name, notes: form.notes,
      })

      showToast(`${form.ref} posted · Dr Expense / Cr Petty Cash (1040) · TZS ${total.toLocaleString()}`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  // ─── Approval submission ───────────────────────────────────────────────
  const submitPettyCashForApproval = async (reason: string) => {
    if (!user) return
    setPosting(true)
    try {
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'petty_cash', posting_date: form.date,
        description: `Petty Cash — ${form.paidTo}`, total_amount: total,
        status: 'pending_approval', posted_by: user.full_name, notes: form.notes,
      }).select('id').single()
      if (vErr) throw new Error('Pending voucher: ' + vErr.message)

      const snapshot = {
        form: { date: form.date, ref: form.ref, paidTo: form.paidTo, notes: form.notes },
        lines: lines
          .filter(l => l.amount > 0 && l.accountId)
          .map(l => ({ desc: l.desc, amount: l.amount, accountId: l.accountId })),
        total,
      }

      const res = await submitForApproval({
        typeCode: 'petty_cash',
        referenceType: 'voucher',
        referenceId: voucher!.id,
        referenceNumber: form.ref,
        summary: `Petty cash to ${form.paidTo} · ${snapshot.lines.length} line(s)`,
        requestedValue: total,
        payload: snapshot,
        requestedBy: user.id,
      })
      if (!res.success) {
        await supabase.from('vouchers').delete().eq('id', voucher!.id)
        throw new Error(res.error || 'Submission failed')
      }

      // Success toast: name the approver if we know them so the cashier
      // knows exactly who to chase. Stay on the page (clean form) so she
      // can immediately log another expense — DO NOT redirect to the
      // /approvals page, which is approver-only and would slap her with
      // an Access Denied screen.
      const approverPhrase = res.assignedToName
        ? ` · Sent to ${res.assignedToName}`
        : ''
      showToast(`Submitted for approval · ${reason}${approverPhrase}`, 'success')
      setTimeout(() => resetForm(), 1500)
    } catch (e: any) {
      showToast(e.message || 'Submission failed', 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage title="Petty Cash Expense" icon="" subtitle="Small office expenses from petty cash float" color="rgba(255,211,42,.12)"
      onPost={post}
      postLabel={
        posting
          ? (needsApproval ? 'Submitting…' : 'Posting…')
          : needsApproval ? 'Submit for Approval' : 'Post Expense'
      }
      journalNote="Dr Expense Account(s) · Cr Petty Cash (1040)">

      {/* Pre-submit approval notice — appears whenever the entered total
          crosses a configured threshold. Tells the cashier ahead of time
          what will happen on post, so the workflow feels intentional
          instead of "I tried something and the system shouted at me." */}
      {needsApproval && approvalNotice && (
        <div style={{
          background: 'rgba(255,211,42,.08)',
          border: '1px solid rgba(255,211,42,.4)',
          borderRadius: 'var(--r)', padding: '12px 14px',
          marginBottom: 16,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <svg width="18" height="18" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              This expense needs approval
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
              {approvalNotice} Click <strong>Submit for Approval</strong> below — your manager will be notified and the
              entry will appear in your voucher list once they approve it.
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref"><input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Paid To" req><input className="form-input" placeholder="e.g. Office supplies shop" value={form.paidTo} onChange={e => set('paidTo', e.target.value)} /></FG>
          <FG label="Submitted By">
            <input className="form-input" readOnly value={user?.full_name || ''} style={{ background: 'var(--surface2)', cursor: 'default' }} />
          </FG>
        </div>
        <FG label="Notes"><input className="form-input" placeholder="Purpose of expense" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title">Expense Lines</div>
          <div style={{ background: 'var(--surface2)', border: `1px solid ${pettyCashBal < total ? 'var(--red)' : 'var(--green)'}`, borderRadius: 'var(--r)', padding: '6px 14px', fontFamily: 'var(--mono)', fontSize: 12 }}>
            Petty Cash Balance: <span style={{ color: pettyCashBal < total ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{tzs(pettyCashBal)}</span>
          </div>
        </div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input className="form-input" style={{ fontSize: 12 }} placeholder="Description" value={line.desc} onChange={e => updateLine(i, 'desc', e.target.value)} />
            <select className="form-input" style={{ fontSize: 12 }} value={line.accountId} onChange={e => updateLine(i, 'accountId', e.target.value)}>
              <option value="">— Expense account —</option>
              {expAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
            <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', textAlign: 'right' }} placeholder="Amount" value={line.amount || ''} onChange={e => updateLine(i, 'amount', parseFloat(e.target.value) || 0)} />
            {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { desc: '', amount: 0, accountId: '' }])}>+ Add line</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '1px solid var(--border)', marginTop: 12 }}>
          <span style={{ fontWeight: 600 }}>Total</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: pettyCashBal < total ? 'var(--red)' : 'var(--green)' }}>{tzs(total)}</span>
        </div>
        {pettyCashBal < total && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>Exceeds petty cash balance. Replenishment required after posting.</div>}
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
