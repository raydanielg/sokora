import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function ContraEntry({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [accounts, setAccounts] = useState<{id:string;code:string;name:string}[]>([])
  const [form, setForm] = useState({ date: today(), ref: '', fromId: '', toId: '', amount: '', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadAccounts(); loadNextRef() }, [])

  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name').eq('category', 'Cash & Bank').eq('is_active', true).order('code')
    if (data) setAccounts(data)
  }
  const loadNextRef = async () => {
    const ref = await nextRef('contra')
    setForm(f => ({ ...f, ref }))
  }

  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!form.fromId || !form.toId) { showToast('Select both accounts', 'error'); return }
    if (form.fromId === form.toId) { showToast('Source and destination cannot be the same', 'error'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { showToast('Enter a valid amount', 'error'); return }
    setPosting(true)
    const amount = parseFloat(form.amount)
    const fromAcct = accounts.find(a => a.id === form.fromId)
    const toAcct = accounts.find(a => a.id === form.toId)
    try {
      const { data: jRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Contra — ${fromAcct?.name} → ${toAcct?.name} — ${form.ref}`,
        journal_type: 'contra', source_type: 'contra', source_ref: form.ref,
        posted_by: 'Joe Gembe', status: 'posted',
      })  
      if (jErr || !jRaw) throw new Error(jErr?.message || "Journal insert failed")
      const j = jRaw

      const jLines = [
        { journal_id: j.id, line_number: 1, account_id: form.toId, description: `Contra in — ${form.notes || form.ref}`, debit: amount, credit: 0 },
        { journal_id: j.id, line_number: 2, account_id: form.fromId, description: `Contra out — ${form.notes || form.ref}`, debit: 0, credit: amount },
      ]
      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error(jlErr.message)

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: form.toId, p_debit: amount, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: form.fromId, p_debit: 0, p_credit: amount }),
      ])

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'contra', posting_date: form.date,
        description: `Contra — ${fromAcct?.name} → ${toAcct?.name}`,
        total_amount: amount, status: 'posted', journal_id: j.id,
        posted_by: 'Joe Gembe', notes: form.notes,
      })

      showToast(`${form.ref} posted · Dr ${toAcct?.code} / Cr ${fromAcct?.code} · ${tzs(amount)}`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  const fromAcct = accounts.find(a => a.id === form.fromId)
  const toAcct = accounts.find(a => a.id === form.toId)

  return (
    <VoucherPage title="Contra Entry" icon="" subtitle="Cash deposit to bank or bank withdrawal to till" color="rgba(168,85,247,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Post Contra'}
      journalNote="Dr Destination Account · Cr Source Account · Both balance sheet — no P&L impact">
      <div className="card">
        <div className="form-row">
          <FG label="Ref"><input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <FG label="From (Source Account)" req>
          <select className="form-input" value={form.fromId} onChange={e => set('fromId', e.target.value)}>
            <option value="">— Select source —</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
        </FG>
        <FG label="To (Destination Account)" req>
          <select className="form-input" value={form.toId} onChange={e => set('toId', e.target.value)}>
            <option value="">— Select destination —</option>
            {accounts.filter(a => a.id !== form.fromId).map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
        </FG>
        <FG label="Amount (TZS)" req>
          <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" />
        </FG>
        <FG label="Notes"><input className="form-input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. Cash deposited to CRDB from till" /></FG>

        {form.amount && form.fromId && form.toId && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>Journal Preview</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--blue)' }}>Dr {toAcct?.code} — {toAcct?.name}</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{parseInt(form.amount).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
              <span style={{ color: 'var(--red)' }}>Cr {fromAcct?.code} — {fromAcct?.name}</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{parseInt(form.amount).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
