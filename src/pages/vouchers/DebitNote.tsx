import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

export default function DebitNote({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [custResults, setCustResults] = useState<{id:string;name:string;balance:number}[]>([])
  const [selectedCust, setSelectedCust] = useState<{id:string;name:string;balance:number}|null>(null)
  const [showDrop, setShowDrop] = useState(false)
  const [form, setForm] = useState({ date: today(), ref: '', customer: '', originalInv: '', amount: '', reason: '', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadNextRef() }, [])
  const loadNextRef = async () => {
    const ref = await nextRef('debit_note')
    setForm(f => ({ ...f, ref }))
  }

  const searchCust = async (val: string) => {
    set('customer', val)
    if (val.length < 2) { setCustResults([]); setShowDrop(false); return }
    const { data } = await supabase.from('customers').select('id, name, balance').or(`name.ilike.%${val}%`).limit(6)
    if (data && data.length > 0) { setCustResults(data); setShowDrop(true) }
    setSelectedCust(null)
  }

  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!form.customer.trim()) { showToast('Customer name required', 'error'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { showToast('Amount required', 'error'); return }
    if (!form.reason) { showToast('Select a reason', 'error'); return }
    setPosting(true)
    const amount = parseFloat(form.amount)
    try {
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', ['4010', '1050'])
      const revenueId = acctData?.find(a => a.code === '4010')?.id
      const arId = acctData?.find(a => a.code === '1050')?.id
      if (!revenueId || !arId) throw new Error('Revenue (4010) or AR (1050) account not found')

      const { data: jRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Debit Note — ${form.customer} — ${form.ref}`,
        journal_type: 'debit_note', source_type: 'debit_note', source_ref: form.ref,
        posted_by: 'Joe Gembe', status: 'posted',
      })  
      if (jErr || !jRaw) throw new Error(jErr?.message || "Journal insert failed")
      const j = jRaw

      const jLines = [
        { journal_id: j.id, line_number: 1, account_id: arId, description: `AR increased — ${form.customer} — ${form.ref}`, debit: amount, credit: 0 },
        { journal_id: j.id, line_number: 2, account_id: revenueId, description: `Revenue — ${form.reason}`, debit: 0, credit: amount },
      ]
      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error(jlErr.message)

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: arId, p_debit: amount, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: revenueId, p_debit: 0, p_credit: amount }),
      ])

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'debit_note', posting_date: form.date,
        description: `Debit Note — ${form.customer}`,
        total_amount: amount, status: 'posted', journal_id: j.id,
        customer_id: selectedCust?.id || null,
        notes: `${form.reason}${form.originalInv ? ' · Orig: ' + form.originalInv : ''} ${form.notes}`.trim(),
        posted_by: 'Joe Gembe',
      })

      if (selectedCust?.id) {
        await supabase.from('customer_ledger_entries').insert({
          customer_id: selectedCust.id, posting_date: form.date,
          document_type: 'debit_note', document_ref: form.ref,
          description: `Debit Note — ${form.reason}`,
          amount, remaining_amount: amount, is_open: true, journal_id: j.id,
        })
      }

      showToast(`${form.ref} posted · Dr AR (1050) / Cr Revenue (4010) · ${form.customer} balance increased by ${tzs(amount)}`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  return (
    <VoucherPage title="Debit Note" icon="" subtitle="Charge customer additional amount — increases their balance" color="rgba(255,71,87,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Post Debit Note'}
      journalNote="Dr Accounts Receivable (1050) · Cr Revenue (4010) · Customer owes more">
      <div className="card">
        <div className="form-row">
          <FG label="Debit Note Ref" req><input className="form-input" value={form.ref} readOnly  /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <div style={{ position: 'relative' }}>
          <FG label="Customer" req>
            <input className="form-input" placeholder="Type to search…" value={form.customer} onChange={e => searchCust(e.target.value)} />
          </FG>
          {showDrop && custResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--r)', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,.4)', overflow: 'hidden' }}>
              {custResults.map((c, i) => (
                <div key={i} onClick={() => { setSelectedCust(c); set('customer', c.name); setShowDrop(false) }}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Balance: {tzs(c.balance || 0)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {selectedCust && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text3)' }}>Current AR balance</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 700 }}>{tzs(selectedCust.balance || 0)}</span>
          </div>
        )}
        <div className="form-row">
          <FG label="Original Invoice Ref"><input className="form-input" value={form.originalInv} onChange={e => set('originalInv', e.target.value)} placeholder="INV-0018" /></FG>
          <FG label="Amount (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" /></FG>
        </div>
        <FG label="Reason" req>
          <select className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)}>
            <option value="">— Select reason —</option>
            <option>Underbilling correction</option>
            <option>Additional delivery charges</option>
            <option>Interest on overdue invoice</option>
            <option>Price adjustment</option>
          </select>
        </FG>
        <FG label="Notes"><textarea className="form-input" rows={2} style={{ resize: 'none' }} value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
