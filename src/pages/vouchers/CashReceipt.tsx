import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, getPostedBy } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'
import {
  CustomerPaymentFlow, postCustomerReceiptLedger, buildCustomerReceiptJournalLines,
  type Debtor, type OpenInvoice,
} from '../../components/CustomerPaymentFlow'
import CustomerReceiptBatchInner from './CustomerReceiptBatchInner'

interface Props {
  // Receipt voucher unified page. Previously had a `variant` prop that
  // toggled between 'cash' and 'bank' defaults; that variant was
  // structurally redundant (same business logic, only the default
  // deposit account differed) and confused users with two hub entries
  // for one feature. Removed; old bank-receipt routes still resolve here.
  onNav: (p: Page) => void
  prefill?: { customerId?: string; amount?: number }   // from the Receipt button on the customer page
}
interface DBAccount { id: string; code: string; name: string; category: string }

type ReceiptType = 'customer' | 'batch' | 'other'

const PAYMENT_METHODS_CASH = [
  { value: 'cash',    label: 'Cash' },
  { value: 'mpesa',   label: 'M-Pesa' },
  { value: 'mixx',    label: 'Mixx by Yas' },
  { value: 'airtel',  label: 'Airtel Money' },
  { value: 'pos',     label: 'POS Card (small)' },
]
const PAYMENT_METHODS_BANK = [
  { value: 'rtgs',    label: 'RTGS / Bank Transfer' },
  { value: 'cheque',  label: 'Cheque' },
  { value: 'deposit', label: 'Cash Deposit at Bank' },
  { value: 'pos',     label: 'POS Settlement' },
  { value: 'swift',   label: 'SWIFT (International)' },
]

// Derive the payment method from a Cash & Bank account code/name.
// 1010, 1011, 1040 → cash · 1020, 1021 → mpesa · 103x, 102x bank → rtgs · etc.
// Derive the payment method label from a Cash & Bank account.
// Name-first detection — a Tanzanian Chart of Accounts can put banks in
// 102x or 103x with no fixed rule, so the account NAME is more reliable
// than the code prefix. See matching helper in CustomerReceiptBatchInner.tsx.
const deriveMethod = (code: string, name: string): string => {
  const n = (name || '').toLowerCase()
  const c = (code || '').trim()

  if (n.includes('mpesa') || n.includes('m-pesa')) return 'mpesa'
  if (n.includes('mixx') || n.includes('tigo'))    return 'mixx'
  if (n.includes('airtel'))                        return 'airtel'
  if (n.includes('halopesa') || n.includes('halo pesa')) return 'mpesa'
  const banks = ['nmb', 'crdb', 'nbc', 'stanbic', 'absa', 'dtb', 'exim', 'access', 'i&m', 'kcb', 'azania', 'amana', 'equity', 'tcb', 'mkombozi', 'tib', 'twiga', 'ecobank', 'bank']
  if (banks.some(b => n.includes(b))) return 'rtgs'
  if (n.includes('cash') || n.includes('till') || n.includes('petty')) return 'cash'

  if (c.startsWith('101') || c === '1040') return 'cash'
  if (c.startsWith('103')) return 'rtgs'
  return 'cash'
}
const methodLabel = (m: string): string => {
  const all = [...PAYMENT_METHODS_CASH, ...PAYMENT_METHODS_BANK]
  return all.find(x => x.value === m)?.label || m
}

export default function CashReceipt({ onNav: _onNav, prefill }: Props) {
  const { isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [accounts, setAccounts] = useState<DBAccount[]>([])

  const [receiptType, setReceiptType] = useState<ReceiptType>('customer')

  const [form, setForm] = useState({
    date: today(),
    ref: '',
    amount: '',
    method: 'cash',
    transactionId: '',
    narration: '',
    depositAccountId: '',
    otherReceivedFrom: '',
    otherIncomeAccountId: '',
  })
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const [paymentState, setPaymentState] = useState<{
    selectedCustomer: Debtor | null
    allocatedTotal: number
    unallocatedCredit: number
    allocations: OpenInvoice[]
  }>({ selectedCustomer: null, allocatedTotal: 0, unallocatedCredit: 0, allocations: [] })

  const handlePaymentChange = useCallback((s: typeof paymentState) => setPaymentState(s), [])

  // Prefill the amount from a customer's outstanding balance (Receipt button).
  // The customer itself is auto-selected by CustomerPaymentFlow via initialCustomerId.
  useEffect(() => {
    if (prefill?.amount != null) setForm(f => ({ ...f, amount: String(prefill.amount) }))
  }, [prefill])

  useEffect(() => { loadAccounts(); loadNextRef() }, [])

  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts')
      .select('id, code, name, category').eq('is_active', true).order('code')
    if (data) {
      setAccounts(data)
      // Default deposit account: the first Cash & Bank account (typically
      // the main cash till 1001). Users can pick any other Cash & Bank
      // account from the dropdown — including bank accounts — so this
      // page no longer needs separate cash vs bank variants.
      const cashAcc = data.find(a => a.category === 'Cash & Bank' && a.code === '1001')
        || data.find(a => a.category === 'Cash & Bank')
      if (cashAcc) setForm(f => ({ ...f, depositAccountId: cashAcc.id }))
    }
  }

  const loadNextRef = async () => {
    const ref = await nextRef('cash_receipt')
    setForm(f => ({ ...f, ref }))
  }

  const cashAccounts = accounts.filter(a => a.category === 'Cash & Bank')
  const arAccount = accounts.find(a => a.code === '1050')

  // Auto-update method whenever deposit account changes (single source of truth)
  useEffect(() => {
    if (!form.depositAccountId) return
    const acc = accounts.find(a => a.id === form.depositAccountId)
    if (acc) {
      const derived = deriveMethod(acc.code, acc.name)
      if (derived !== form.method) setForm(f => ({ ...f, method: derived }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.depositAccountId, accounts])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  // Reset the form after a successful post. Keeps the user on the same page
  // with a clean slate — no page reload, no scroll jump, no lost toast.
  const resetFormAfterPost = async () => {
    const newRef = await nextRef('cash_receipt')
    setReceiptType('customer')
    setForm(f => ({
      ...f,
      ref: newRef,
      amount: '',
      transactionId: '',
      narration: '',
      otherReceivedFrom: '',
      otherIncomeAccountId: '',
      // keep: date, method, depositAccountId — likely reused for next receipt
    }))
    setPaymentState({ selectedCustomer: null, allocatedTotal: 0, unallocatedCredit: 0, allocations: [] })
  }

  // Batch mode posts through the embedded grid. The grid registers its
  // own postFn via onReady; we hold the ref and dispatch when our Post
  // button is clicked. The shared header fields (date, deposit, AR) feed
  // into the grid as props, so the grid uses identical accounting paths.
  const batchPostRef = useRef<null | (() => Promise<{ ok: number; fail: number }>)>(null)
  const [batchStatus, setBatchStatus] = useState<{ posting: boolean; pendingCount: number; postedCount: number }>({
    posting: false, pendingCount: 0, postedCount: 0,
  })

  const post = async () => {
    // Date check is shared by all three modes.
    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }

    // Batch mode delegates to the grid component. The grid owns its own
    // per-row validation (each row needs a deposit account, customer,
    // and amount), so we only check the batch-level prerequisites here.
    if (receiptType === 'batch') {
      if (!arAccount) { showToast('Accounts Receivable (1050) not found — check Chart of Accounts', 'error'); return }
      if (!batchPostRef.current) { showToast('Batch grid not ready yet — try again in a second', 'error'); return }
      await batchPostRef.current()
      return
    }

    // Single-receipt modes (customer and other) share these checks.
    const amount = parseFloat(form.amount) || 0
    if (amount <= 0) { showToast('Enter a valid amount', 'error'); return }
    if (!form.depositAccountId) { showToast('Select a deposit account', 'error'); return }

    if (receiptType === 'customer') {
      if (!paymentState.selectedCustomer) { showToast('Select a customer first', 'error'); return }
      if (!arAccount) { showToast('Accounts Receivable (1050) not found — check Chart of Accounts', 'error'); return }
      if (paymentState.allocatedTotal > amount + 0.5) {
        showToast('Invoice allocations exceed payment amount. Reduce allocations.', 'error'); return
      }
      if (paymentState.unallocatedCredit > 0.5) {
        const nm = (paymentState.selectedCustomer as any).company || paymentState.selectedCustomer.name || 'this customer'
        const ok = window.confirm(`This receipt is TZS ${Math.round(paymentState.unallocatedCredit).toLocaleString()} more than ${nm} currently owes.\n\nThe extra will sit as a credit on their account (they will show as in credit). Post anyway?`)
        if (!ok) return
      }
      await postCustomerReceipt(amount)
    } else {
      if (!form.otherReceivedFrom.trim()) { showToast('Enter who paid', 'error'); return }
      if (!form.otherIncomeAccountId) { showToast('Select income / credit account', 'error'); return }
      await postOtherIncome(amount)
    }
  }

  const postCustomerReceipt = async (amount: number) => {
    if (!paymentState.selectedCustomer || !arAccount) return
    setPosting(true)
    const cust = paymentState.selectedCustomer
    const custName = cust.company || cust.name

    try {
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Customer Receipt — ${custName} — ${form.ref}`,
        journal_type: 'cash_receipt', source_type: 'cash_receipt',
        source_ref: form.ref, posted_by: getPostedBy(), status: 'posted',
      })
      if (jErr || !journalRaw) throw new Error(jErr?.message || 'Journal insert failed')
      const journal = journalRaw

      const lines = buildCustomerReceiptJournalLines({
        depositAccountId: form.depositAccountId,
        arAccountId: arAccount.id,
        amount, customerName: custName, narration: form.narration,
      }).map(l => ({ ...l, journal_id: journal.id }))

      const { error: jlErr } = await supabase.from('journal_lines').insert(lines)
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      await Promise.all(lines.map(l =>
        supabase.rpc('update_account_balance', {
          p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit,
        })
      ))

      const ledgerResult = await postCustomerReceiptLedger({
        customerId: cust.id, voucherRef: form.ref, postingDate: form.date,
        amount, allocations: paymentState.allocations, journalId: journal.id,
        narration: form.narration,
      })
      if (!ledgerResult.success) {
        console.error('[receipt] ledger posting failed:', ledgerResult.error)
        showToast('Journal posted but ledger update failed: ' + ledgerResult.error, 'error')
        setPosting(false); return
      }

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'cash_receipt', posting_date: form.date,
        description: `Customer Receipt — ${custName}`,
        total_amount: amount, status: 'posted', journal_id: journal.id,
        payment_method: form.method, notes: form.narration,
        posted_by: getPostedBy(), customer_id: cust.id,
      })

      const allocCount = paymentState.allocations.filter(a => a.allocation > 0).length
      showToast(
        allocCount > 0
          ? `${form.ref} posted · ${allocCount} invoice${allocCount > 1 ? 's' : ''} settled · TZS ${paymentState.allocatedTotal.toLocaleString()}`
          : `${form.ref} posted · TZS ${amount.toLocaleString()} credit on account`
      )
      await resetFormAfterPost()
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  const postOtherIncome = async (amount: number) => {
    setPosting(true)
    try {
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Receipt — ${form.otherReceivedFrom} — ${form.ref}`,
        journal_type: 'cash_receipt', source_type: 'cash_receipt',
        source_ref: form.ref, posted_by: getPostedBy(), status: 'posted',
      })
      if (jErr || !journalRaw) throw new Error(jErr?.message || 'Journal insert failed')
      const journal = journalRaw

      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: form.depositAccountId, description: `Received from ${form.otherReceivedFrom}`, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: form.otherIncomeAccountId, description: form.narration || form.otherReceivedFrom, debit: 0, credit: amount },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: form.depositAccountId, p_debit: amount, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: form.otherIncomeAccountId, p_debit: 0, p_credit: amount }),
      ])

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'cash_receipt', posting_date: form.date,
        description: `Receipt — ${form.otherReceivedFrom}`,
        total_amount: amount, status: 'posted', journal_id: journal.id,
        payment_method: form.method, notes: form.narration, posted_by: getPostedBy(),
      })

      // Describe the actual posting using the chosen deposit account so
      // the toast still tells the user where the money went. The old
      // "Cash"/"Bank" label was inferred from the (now removed) variant
      // prop; the deposit account name is the real source of truth.
      const depositAcc = accounts.find(a => a.id === form.depositAccountId)
      showToast(`${form.ref} posted · Dr ${depositAcc?.name || 'Cash/Bank'} · Cr Income`)
      await resetFormAfterPost()
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  const amount = parseFloat(form.amount) || 0
  const depositAcc = accounts.find(a => a.id === form.depositAccountId)
  const journalPreview = (() => {
    if (amount <= 0 || !depositAcc) return null
    if (receiptType === 'customer' && paymentState.selectedCustomer && arAccount) {
      return { debit: { code: depositAcc.code, name: depositAcc.name }, credit: { code: arAccount.code, name: arAccount.name + ' (AR)' } }
    }
    if (receiptType === 'other' && form.otherIncomeAccountId) {
      const incAcc = accounts.find(a => a.id === form.otherIncomeAccountId)
      if (!incAcc) return null
      return { debit: { code: depositAcc.code, name: depositAcc.name }, credit: { code: incAcc.code, name: incAcc.name } }
    }
    return null
  })()

  // Unified page title — Bank Receipt was a redundant variant of the same
  // page (same business logic, only the default deposit account differed).
  // Removed in this rewrite; old bank-receipt routes still resolve to here.
  const pageTitle = 'Receipt Voucher'
  const pageSubtitle = 'Record money received from customers or other sources'

  const canPost = (() => {
    if (receiptType === 'batch') {
      // Batch validity is owned by the grid: each row carries its own
      // deposit account. Enable Post as long as AR exists and at least
      // one row is pending. The grid surfaces per-row "pick a deposit
      // account" errors itself.
      if (!arAccount) return false
      if (batchStatus.posting) return false
      return batchStatus.pendingCount > 0
    }
    if (!form.depositAccountId) return false
    if (amount <= 0) return false
    if (receiptType === 'customer') {
      if (!paymentState.selectedCustomer) return false
      if (paymentState.allocatedTotal > amount + 0.5) return false
      return true
    }
    return !!form.otherReceivedFrom.trim() && !!form.otherIncomeAccountId
  })()

  return (
    <VoucherPage
      title={pageTitle} icon="" subtitle={pageSubtitle} color="rgba(0,229,160,.12)"
      onPost={post}
      postLabel={
        receiptType === 'batch'
          ? (batchStatus.posting ? 'Posting batch…' : `Post Batch (${batchStatus.pendingCount} pending)`)
          : (posting ? 'Posting…' : `Post ${pageTitle}`)
      }
      postDisabled={!canPost || posting || batchStatus.posting}
      postDisabledReason={!canPost ? (
        receiptType === 'batch' ? 'Add at least one row with a customer and amount, and pick a deposit account.'
        : receiptType === 'customer' ? 'Select customer, enter amount, pick deposit account. Allocations must not exceed payment.'
        : 'Enter who paid, amount, and select deposit + income accounts.'
      ) : undefined}
      journalNote={
        receiptType === 'batch' ? 'Dr Cash/Bank · Cr AR (1050) — one voucher per row'
        : receiptType === 'customer' ? 'Dr Cash/Bank · Cr AR (1050) · Invoice allocations'
        : 'Dr Cash/Bank · Cr Income'
      }
    >
      {/* Type toggle */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          What kind of receipt is this?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {([
            { key: 'customer', title: 'Customer Receipt',          sub: 'One customer · Settles open invoices · Reduces AR',         color: '#00e5a0' },
            { key: 'batch',    title: 'Customer Receipt — Batch',  sub: 'Many customers in one entry · Each posts as its own voucher', color: '#3d8bff' },
            { key: 'other',    title: 'Other Income / Deposit',    sub: 'Refunds, interest, misc · Not AR-related',                  color: '#d4874a' },
          ] as const).map(opt => (
            <button key={opt.key} onClick={() => setReceiptType(opt.key)}
              style={{
                background: receiptType === opt.key ? `${opt.color}1a` : 'var(--surface2)',
                border: `1px solid ${receiptType === opt.key ? opt.color : 'var(--border)'}`,
                borderRadius: 'var(--r)', padding: '12px 16px', cursor: 'pointer', textAlign: 'left',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: `2px solid ${receiptType === opt.key ? opt.color : 'var(--border)'}`,
                  background: receiptType === opt.key ? opt.color : 'transparent', flexShrink: 0,
                }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: receiptType === opt.key ? opt.color : 'var(--text)' }}>
                  {opt.title}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.4 }}>{opt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Date + deposit account — shared across ALL modes. We render this
          at the top in batch mode (so the grid below knows where to deposit)
          and inline inside the Receipt Details card in single modes. To
          keep the JSX simple, we conditionally render two whole layouts. */}

      {receiptType === 'batch' ? (
        <>
          {/* Slim shared header for batch mode — only Date + Ref Prefix.
              Deposit Account is now per-row (each customer may have paid
              into a different bank), so it doesn't belong in the header. */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Batch Header</div>
            <div className="form-row">
              <FG label="Voucher Ref Prefix" req><input className="form-input" value={form.ref} readOnly /></FG>
              <FG label="Posting Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, fontFamily: 'var(--mono)' }}>
              Each row picks its own deposit account (different customers may have paid into different banks). Method label is auto-derived from the chosen account. New rows default to the last-picked account.
            </div>
          </div>

          {arAccount && (
            <CustomerReceiptBatchInner
              postingDate={form.date}
              initialDepositAccountId={form.depositAccountId}
              arAccountId={arAccount.id}
              cashAccounts={cashAccounts}
              onStatusChange={setBatchStatus}
              onReady={(fn: () => Promise<{ ok: number; fail: number }>) => { batchPostRef.current = fn }}
              showToast={showToast}
            />
          )}
          {!arAccount && (
            <div className="card" style={{ background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.3)', color: 'var(--red)' }}>
              Accounts Receivable (1050) not found in Chart of Accounts. Add it first to enable batch receipts.
            </div>
          )}
        </>
      ) : (
        <>
          {/* Single-receipt layout: shared details + accounting + customer flow */}
          <div className="grid g2" style={{ gap: 20 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>Receipt Details</div>
              <div className="form-row">
                <FG label="Voucher Ref" req><input className="form-input" value={form.ref} readOnly /></FG>
                <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
              </div>

              {receiptType === 'other' && (
                <FG label="Received From" req>
                  <input className="form-input" placeholder="e.g. Supplier refund, Bank interest, Grant received"
                    value={form.otherReceivedFrom} onChange={e => set('otherReceivedFrom', e.target.value)} />
                </FG>
              )}

              <div className="form-row">
                <FG label="Amount (TZS)" req>
                  <input type="number" className="form-input"
                    style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }}
                    placeholder="0" value={form.amount}
                    onChange={e => set('amount', e.target.value)} />
                </FG>
                {form.method !== 'cash' && (
                  <FG label={form.method === 'cheque' ? 'Cheque Number' : form.method === 'rtgs' ? 'Reference / TT Number' : 'Transaction ID'}>
                    <input className="form-input"
                      placeholder={
                        form.method === 'mpesa'  ? 'e.g. QTA1BCD2EFG' :
                        form.method === 'cheque' ? 'e.g. 000123' :
                        form.method === 'rtgs'   ? 'e.g. TT-REF-2026-01-01' :
                        'Reference number'
                      }
                      value={form.transactionId} onChange={e => set('transactionId', e.target.value)} />
                  </FG>
                )}
              </div>

              <FG label="Narration"><textarea className="form-input" rows={2}
                style={{ resize: 'none', fontSize: 12 }}
                placeholder="Purpose of payment, any notes for the ledger…"
                value={form.narration} onChange={e => set('narration', e.target.value)} /></FG>
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>Accounting</div>
              <FG label="Deposit To (Cash / M-Pesa / Bank)" req>
                <select className="form-input" value={form.depositAccountId} onChange={e => set('depositAccountId', e.target.value)}>
                  <option value="">— Select account —</option>
                  {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
                {form.depositAccountId && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, fontFamily: 'var(--mono)' }}>
                    Method: <span style={{ color: 'var(--accent)' }}>{methodLabel(form.method)}</span> <span style={{ color: 'var(--text3)' }}>(auto-detected from account)</span>
                  </div>
                )}
              </FG>

              {receiptType === 'customer' ? (
                <div style={{ padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>Credit Account</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>
                    {arAccount ? `${arAccount.code} — ${arAccount.name}` : 'AR account not found'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.4 }}>
                    Locked to Accounts Receivable. The payment reduces specific open invoices below.
                  </div>
                </div>
              ) : (
                <FG label="Income / Credit Account" req>
                  <select className="form-input" value={form.otherIncomeAccountId} onChange={e => set('otherIncomeAccountId', e.target.value)}>
                    <option value="">— Select account —</option>
                    {accounts.filter(a => ['4010','4011','4020','4110','2070','2085'].includes(a.code) || a.category === 'Other Income')
                      .map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                </FG>
              )}

              {journalPreview && (
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>Journal Preview</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--blue)' }}>Dr {journalPreview.debit.code} — {journalPreview.debit.name}</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{amount.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
                    <span style={{ color: 'var(--green)' }}>Cr {journalPreview.credit.code} — {journalPreview.credit.name}</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{amount.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Customer flow (single) */}
          {receiptType === 'customer' && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Customer & Invoice Allocation</div>
              <CustomerPaymentFlow
                voucherRef={form.ref}
                postingDate={form.date}
                amount={amount}
                paymentMethod={form.method}
                transactionId={form.transactionId}
                narration={form.narration}
                depositAccountId={form.depositAccountId}
                onChange={handlePaymentChange}
                initialCustomerId={prefill?.customerId}
              />
            </div>
          )}
        </>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
