import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

interface DBAccount { id: string; code: string; name: string; type: string; category: string }
interface DBSupplier { id: string; name: string; balance_tzs: number }

export default function CashPayment({ onNav }: Props) {
  const { isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([])


  const [form, setForm] = useState({
    date: today(),
    ref: '',
    payTo: '',
    supplierId: '',
    expAccount: '',
    cashAccount: '',
    amount: '',
    narration: '',
    chequeNo: '',
    branch: 'DSM HQ',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    loadAccounts()
    loadSuppliers()
    loadNextRef()
  }, [])

  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name, type, category').eq('is_active', true).order('code')
    if (data) setAccounts(data)
  }

  const loadSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id, name, balance_tzs').eq('is_active', true).order('name')
    if (data) setSuppliers(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('cash_payment')
    setForm(f => ({ ...f, ref }))
  }

  // When supplier is selected, auto-fill Pay To
  const handleSupplierChange = (supplierId: string) => {
    set('supplierId', supplierId)
    if (supplierId) {
      const sup = suppliers.find(s => s.id === supplierId)
      if (sup) set('payTo', sup.name)
    }
  }

  const cashAccounts = accounts.filter(a => a.category === 'Cash & Bank')
  const expenseAccounts = accounts.filter(a => ['liability', 'expense', 'cogs'].includes(a.type))

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg); setToastType(type)
  }

  const post = async () => {
    if (!form.payTo.trim()) { showToast('Please enter payee name', 'error'); return }
    if (!form.amount) { showToast('Please enter amount', 'error'); return }
    if (!form.cashAccount) { showToast('Please select cash/bank account', 'error'); return }
    if (!form.expAccount) { showToast('Please select expense/debit account', 'error'); return }

    // Date lock enforcement
    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }

    setPosting(true)
    const amount = parseFloat(form.amount)

    try {
      // Get account IDs
      const cashAcct = accounts.find(a => a.id === form.cashAccount)
      const expAcct = accounts.find(a => a.id === form.expAccount)
      if (!cashAcct || !expAcct) throw new Error('Accounts not found')

      // Create journal
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref,
        posting_date: form.date,
        description: `Cash Payment — ${form.payTo} — ${form.ref}`,
        journal_type: 'cash_payment',
        source_type: 'cash_payment',
        source_ref: form.ref,
        posted_by: 'Joe Gembe',
        status: 'posted',
        branch: form.branch,
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw

      // Journal lines: Dr Expense / Cr Cash
      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: form.expAccount, description: `${form.narration || form.payTo}`, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: form.cashAccount, description: `Cash paid — ${form.payTo}`, debit: 0, credit: amount },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      // Update account balances
      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: form.expAccount, p_debit: amount, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: form.cashAccount, p_debit: 0, p_credit: amount }),
      ])

      // Create voucher
      const { error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref,
        type: 'cash_payment',
        posting_date: form.date,
        description: `Cash Payment — ${form.payTo}`,
        total_amount: amount,
        status: 'posted',
        branch: form.branch,
        supplier_id: form.supplierId || null,
        journal_id: journal.id,
        payment_method: 'cash',
        notes: form.narration,
        posted_by: 'Joe Gembe',
      })
      if (vErr) throw new Error('Voucher: ' + vErr.message)

      // Update supplier balance and create vendor ledger entry if supplier selected
      if (form.supplierId) {
        const supplier = suppliers.find(s => s.id === form.supplierId)
        if (supplier) {
          await supabase.from('suppliers').update({ balance_tzs: supplier.balance_tzs - amount }).eq('id', form.supplierId)
        }

        // Create vendor ledger entry for supplier payment
        await supabase.from('vendor_ledger_entries').insert({
          supplier_id: form.supplierId,
          posting_date: form.date,
          document_type: 'payment',
          document_ref: form.ref,
          description: `Cash Payment — ${form.payTo}${form.narration ? ' — ' + form.narration : ''}`,
          amount_tzs: -amount,
          remaining_amount: 0,
          is_open: false,
          journal_id: journal.id,
        })
      }

      showToast(`${form.ref} posted · Dr ${expAcct.code} / Cr ${cashAcct.code} · Journal created`)
      onNav('vouchers')

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      showToast(msg, 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage
      title="Payment Voucher"
      icon=""
      subtitle="Pay any expense or supplier from cash, bank, or M-Pesa"
      color="rgba(255,71,87,.12)"
      onPost={post}
      journalNote={`Dr Expense/Supplier Account · Cr Cash/Bank Account · Balance updated`}>

      <div className="grid g2" style={{ gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Payment Details</div>
          <div className="form-row">
            <FG label="Voucher Ref" req><input className="form-input" value={form.ref} readOnly  /></FG>
            <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          </div>
          <FG label="Supplier (if paying a supplier)">
            <select className="form-input" value={form.supplierId} onChange={e => handleSupplierChange(e.target.value)}>
              <option value="">— Select supplier (optional) —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} · Balance: TZS {s.balance_tzs?.toLocaleString()}</option>)}
            </select>
          </FG>
          <FG label="Pay To (Payee)" req>
            <input className="form-input" placeholder="e.g. Meditech Tanzania, John Msomi" value={form.payTo} onChange={e => set('payTo', e.target.value)} />
          </FG>
          <FG label="Amount (TZS)" req>
            <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </FG>
          <FG label="Narration">
            <textarea className="form-input" rows={3} placeholder="What was this payment for?" value={form.narration} onChange={e => set('narration', e.target.value)} style={{ resize: 'none' }} />
          </FG>
          <FG label="Cheque / Reference No">
            <input className="form-input" placeholder="e.g. CHQ-001234 or M-Pesa ref" value={form.chequeNo} onChange={e => set('chequeNo', e.target.value)} />
          </FG>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Accounting</div>
          <FG label="Cash / Bank Account (Credit)" req>
            <select className="form-input" value={form.cashAccount} onChange={e => set('cashAccount', e.target.value)}>
              <option value="">— Select account —</option>
              {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </FG>
          <FG label="Expense / Debit Account" req>
            <select className="form-input" value={form.expAccount} onChange={e => set('expAccount', e.target.value)}>
              <option value="">— Select account —</option>
              {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </FG>

          {form.amount && form.cashAccount && form.expAccount && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, marginTop: 8 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>Journal Preview</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--blue)' }}>Dr {accounts.find(a => a.id === form.expAccount)?.code} — {accounts.find(a => a.id === form.expAccount)?.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{parseInt(form.amount).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
                <span style={{ color: 'var(--red)' }}>Cr {accounts.find(a => a.id === form.cashAccount)?.code} — {accounts.find(a => a.id === form.cashAccount)?.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{parseInt(form.amount).toLocaleString()}</span>
              </div>
            </div>
          )}

          <FG label="Branch" req>
            <select className="form-input" value={form.branch} onChange={e => set('branch', e.target.value)}>
              <option>DSM HQ</option>
              <option>Arusha Branch</option>
            </select>
          </FG>

          <button className="btn btn-primary" onClick={post} disabled={posting} style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: '12px', opacity: posting ? 0.6 : 1 }}>
            {posting ? 'Posting…' : 'Post Payment'}
          </button>
        </div>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
