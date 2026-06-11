import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import { checkApprovalRequired, submitForApproval } from '../../lib/useApproval'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBAccount { id: string; code: string; name: string }

export default function BankTransfer({ onNav }: Props) {
  const { user, isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [form, setForm] = useState({
    date: today(), ref: '', fromAccount: '', toAccount: '',
    amount: '', fxRate: '', narration: ''
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadAccounts(); loadNextRef() }, [])

  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name')
      .eq('type', 'asset').eq('category', 'Cash & Bank').eq('is_active', true).order('code')
    if (data) setAccounts(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('bank_transfer')
    setForm(f => ({ ...f, ref }))
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!form.fromAccount || !form.toAccount) { showToast('Please select both accounts', 'error'); return }
    if (form.fromAccount === form.toAccount) { showToast('From and To accounts cannot be the same', 'error'); return }
    if (!form.amount) { showToast('Please enter amount', 'error'); return }
    if (!user) { showToast('You must be signed in', 'error'); return }
    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }
    const amount = parseFloat(form.amount)

    // ─── Approval gate ─────────────────────────────────────────────────
    // Large transfers (default > 1M TZS) require super admin approval.
    const check = await checkApprovalRequired('bank_transfer', { value: amount })
    const canBypass = check.superAdminBypass && isSuperAdmin()
    if (check.requiresApproval && check.blockPosting && !canBypass) {
      await submitBankTransferForApproval(amount, check.reason || 'Approval required')
      return
    }

    setPosting(true)

    try {
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Bank Transfer — ${accounts.find(a => a.id === form.fromAccount)?.code} to ${accounts.find(a => a.id === form.toAccount)?.code} — ${form.ref}`,
        journal_type: 'bank_transfer', source_type: 'bank_transfer',
        source_ref: form.ref, posted_by: user.full_name, status: 'posted',
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw

      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: form.toAccount, description: `Transfer in — ${form.narration || form.ref}`, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: form.fromAccount, description: `Transfer out — ${form.narration || form.ref}`, debit: 0, credit: amount },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: form.toAccount, p_debit: amount, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: form.fromAccount, p_debit: 0, p_credit: amount }),
      ])

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'bank_transfer', posting_date: form.date,
        description: `Bank Transfer — ${form.ref}`, total_amount: amount,
        status: 'posted', journal_id: journal.id, posted_by: user.full_name, notes: form.narration,
      })

      showToast(`${form.ref} posted · Dr ${accounts.find(a => a.id === form.toAccount)?.code} / Cr ${accounts.find(a => a.id === form.fromAccount)?.code}`)
      onNav('vouchers')
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  // ─── Approval submission ───────────────────────────────────────────────
  const submitBankTransferForApproval = async (amount: number, reason: string) => {
    if (!user) return
    setPosting(true)
    try {
      const fromAcc = accounts.find(a => a.id === form.fromAccount)
      const toAcc = accounts.find(a => a.id === form.toAccount)

      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'bank_transfer', posting_date: form.date,
        description: `Bank Transfer — ${fromAcc?.code} to ${toAcc?.code} — ${form.ref}`,
        total_amount: amount, status: 'pending_approval',
        posted_by: user.full_name, notes: form.narration,
      }).select('id').single()
      if (vErr) throw new Error('Pending voucher: ' + vErr.message)

      const snapshot = {
        form: {
          date: form.date, ref: form.ref,
          fromAccount: form.fromAccount, toAccount: form.toAccount,
          amount, narration: form.narration,
        },
      }

      const res = await submitForApproval({
        typeCode: 'bank_transfer',
        referenceType: 'voucher',
        referenceId: voucher!.id,
        referenceNumber: form.ref,
        summary: `Bank transfer ${fromAcc?.code} → ${toAcc?.code}${form.narration ? ' · ' + form.narration : ''}`,
        requestedValue: amount,
        payload: snapshot,
        requestedBy: user.id,
      })
      if (!res.success) {
        await supabase.from('vouchers').delete().eq('id', voucher!.id)
        throw new Error(res.error || 'Submission failed')
      }

      // Don't redirect to /approvals — that's approver-only and would
      // show an Access Denied screen to non-approvers. Just confirm the
      // submission and head back to the vouchers hub.
      const approverPhrase = res.assignedToName ? ` · Sent to ${res.assignedToName}` : ''
      showToast(`Submitted for approval · ${reason}${approverPhrase}`, 'success')
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (e: any) {
      showToast(e.message || 'Submission failed', 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage title="Bank Transfer" icon="" subtitle="Move funds between your own bank accounts" color="rgba(61,139,255,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Post Transfer'}
      journalNote="Dr Target Account · Cr Source Account · FX difference to 7010/7011 if cross-currency">
      <div className="grid g2" style={{ gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Transfer Details</div>
          <div className="form-row">
            <FG label="Ref"><input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          </div>
          <FG label="From Account" req>
            <select className="form-input" value={form.fromAccount} onChange={e => set('fromAccount', e.target.value)}>
              <option value="">— Select source account —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </FG>
          <FG label="To Account" req>
            <select className="form-input" value={form.toAccount} onChange={e => set('toAccount', e.target.value)}>
              <option value="">— Select destination account —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </FG>
          <div className="form-row">
            <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700 }} placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} /></FG>
            <FG label="FX Rate (if USD)"><input className="form-input" placeholder="e.g. 2540" value={form.fxRate} onChange={e => set('fxRate', e.target.value)} /></FG>
          </div>
          <FG label="Narration"><textarea className="form-input" rows={2} placeholder="Purpose of transfer" value={form.narration} onChange={e => set('narration', e.target.value)} style={{ resize: 'none' }} /></FG>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Journal Preview</div>
          {form.amount && form.fromAccount && form.toAccount ? (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--blue)' }}>Dr {accounts.find(a => a.id === form.toAccount)?.code} — {accounts.find(a => a.id === form.toAccount)?.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{parseInt(form.amount).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
                <span style={{ color: 'var(--red)' }}>Cr {accounts.find(a => a.id === form.fromAccount)?.code} — {accounts.find(a => a.id === form.fromAccount)?.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{parseInt(form.amount).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text3)', fontSize: 12 }}>Fill in the form to see journal preview</div>
          )}
          <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.2)', borderRadius: 'var(--r)', padding: 12, marginTop: 14, fontSize: 11, color: 'var(--yellow)' }}>
            If transferring between TZS and USD accounts, manually post the FX difference via Journal Entry to account 7010 or 7011.
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
