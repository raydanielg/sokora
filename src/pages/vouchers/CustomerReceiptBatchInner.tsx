import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { tzs, getPostedBy } from '../../lib/utils'
import {
  postCustomerReceiptLedger,
  buildCustomerReceiptJournalLines,
  type Debtor,
  type OpenInvoice,
} from '../../components/CustomerPaymentFlow'

// ════════════════════════════════════════════════════════════════════════
// CustomerReceiptBatchInner — the batch grid, extracted from the standalone
// CustomerReceiptBatch page so it can be embedded inside the unified Receipt
// Voucher page as one of three modes (customer / batch / other).
//
// Design (revised):
//   Each ROW carries its own Deposit Account and Method, not the batch
//   header. This lets a single batch session reconcile payments that
//   landed in different bank accounts (NMB row, CRDB row, M-Pesa row).
//   New rows default to the last-used account so a long run of receipts
//   into the same account stays fast.
//
//   The Method label per row is derived from that row's deposit account
//   code (101x → cash, 102x → mpesa/mixx/airtel, 103x → rtgs). No
//   per-row Method dropdown anymore — that was visually confusing because
//   the account already implies the method.
//
//   The parent (CashReceipt.tsx) passes the *initial* deposit account
//   (typically the first Cash & Bank account from loadAccounts) so row 1
//   has a sensible default. After that, the inner component manages
//   per-row accounts on its own.
//
// Posting model unchanged: each row → its own Cash Receipt voucher,
// its own journal. Same accounting helpers as the single Cash Receipt.
// ════════════════════════════════════════════════════════════════════════

interface Props {
  postingDate: string
  // Default deposit account for row 1 (and for subsequent rows until the
  // user picks something different). Comes from the parent's Cash & Bank
  // loader — typically 1001 (cash till) unless the user changed it.
  initialDepositAccountId: string
  arAccountId: string
  // All Cash & Bank accounts the user can choose from. Passed down from
  // the parent so we don't query supabase twice.
  cashAccounts: Array<{ id: string; code: string; name: string; category: string }>
  // Tells the parent when something happened (mainly so the parent can
  // show toasts / disable its single-receipt Post button while batch
  // posting is in progress). Optional — component works fine without it.
  onStatusChange?: (s: { posting: boolean; pendingCount: number; postedCount: number }) => void
  // Imperative handle for the parent's "Post Batch" button. We expose a
  // ref-like API via a callback so the parent's existing Post button can
  // drive the batch without us needing a separate Post button inside the
  // grid.
  onReady?: (postFn: () => Promise<{ ok: number; fail: number }>) => void
  // Toast bus from the parent — we surface inline errors per row but use
  // this for the "X posted, Y failed" summary toast at the end.
  showToast: (msg: string, type?: 'success' | 'error') => void
}

interface BatchRow {
  id: string
  customer: Debtor | null
  amount: string
  // Per-row deposit account. The Method label is derived from this on
  // render and at posting time, so there's no separate method field.
  depositAccountId: string
  transactionId: string
  narration: string
  openInvoices: OpenInvoice[]
  status: 'pending' | 'posting' | 'posted' | 'failed'
  postedRef?: string
  error?: string
  expanded: boolean
}

// Derive the human-readable payment method label from a Cash & Bank
// account's code/name. Mirrors the logic in the single CashReceipt page
// so a batch row and a single receipt for the same account show the
// same Method label.
//
// Priority: the account NAME is the source of truth (it's what the
// human typed when they set up the Chart of Accounts). Code prefixes
// are only used as a fallback when the name is generic. This avoids
// the "1022 NMB Bank → M-Pesa" bug that came from assuming all 102x
// accounts were mobile money — a Tanzanian CoA often puts banks in
// 102x or 1020-1030 range, not strictly 103x.
function deriveMethod(code: string, name: string): { value: string; label: string } {
  const n = (name || '').toLowerCase()
  const c = (code || '').trim()

  // Name-based detection first — handles any code numbering scheme.
  if (n.includes('mpesa') || n.includes('m-pesa')) return { value: 'mpesa', label: 'M-Pesa' }
  if (n.includes('mixx') || n.includes('tigo'))    return { value: 'mixx',  label: 'Mixx by Yas' }
  if (n.includes('airtel'))                        return { value: 'airtel', label: 'Airtel Money' }
  if (n.includes('halopesa') || n.includes('halo pesa')) return { value: 'mpesa', label: 'HaloPesa' }
  // Specific bank names common in Tanzania — if the user named their
  // account after a bank, that's a bank account regardless of code.
  const banks = ['nmb', 'crdb', 'nbc', 'stanbic', 'absa', 'dtb', 'exim', 'access', 'i&m', 'kcb', 'azania', 'amana', 'equity', 'tcb', 'mkombozi', 'tib', 'twiga', 'ecobank', 'bank']
  if (banks.some(b => n.includes(b))) return { value: 'rtgs', label: 'RTGS / Bank Transfer' }
  if (n.includes('cash') || n.includes('till') || n.includes('petty')) return { value: 'cash', label: 'Cash' }

  // Fallback: code-prefix heuristics for accounts with generic names.
  if (c.startsWith('101') || c === '1040') return { value: 'cash', label: 'Cash' }
  if (c.startsWith('103')) return { value: 'rtgs', label: 'RTGS / Bank Transfer' }

  // Safe final fallback. Marked as cash so the placeholder reads
  // "Optional" rather than something potentially misleading.
  return { value: 'cash', label: 'Cash' }
}

const newRowId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const emptyRow = (depositAccountId = ''): BatchRow => ({
  id: newRowId(),
  customer: null,
  amount: '',
  depositAccountId,
  transactionId: '',
  narration: '',
  openInvoices: [],
  status: 'pending',
  expanded: true,
})

export default function CustomerReceiptBatchInner({
  postingDate, initialDepositAccountId, arAccountId, cashAccounts,
  onStatusChange, onReady, showToast,
}: Props) {
  const [contacts, setContacts] = useState<Debtor[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [rows, setRows] = useState<BatchRow[]>([emptyRow(initialDepositAccountId)])
  const [openPickerRowId, setOpenPickerRowId] = useState<string | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [posting, setPosting] = useState(false)

  // If the parent's default deposit account loads AFTER the component
  // mounts (async loadAccounts), apply it to row 1 if row 1 doesn't
  // already have one. Avoids the awkward "first row has no account
  // selected" state right after page load.
  useEffect(() => {
    if (!initialDepositAccountId) return
    setRows(prev => {
      if (prev.length === 1 && !prev[0].depositAccountId && !prev[0].customer && !prev[0].amount) {
        return [{ ...prev[0], depositAccountId: initialDepositAccountId }]
      }
      return prev
    })
  }, [initialDepositAccountId])

  // Load wholesale contacts (and legacy debtors). Excludes is_hidden.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data } = await supabase.from('customers')
        .select('id, name, company, contact_person, customer_number, balance, whatsapp')
        .in('customer_type', ['wholesale', 'debtor'])
        .eq('is_active', true)
        .eq('is_hidden', false)
        .order('name')
      if (!cancelled && data) setContacts(data as Debtor[])
      setContactsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Notify parent of status whenever anything changes.
  useEffect(() => {
    const pendingCount = rows.filter(r => r.status !== 'posted' && r.customer && (parseFloat(r.amount) || 0) > 0).length
    const postedCount = rows.filter(r => r.status === 'posted').length
    onStatusChange?.({ posting, pendingCount, postedCount })
  }, [rows, posting, onStatusChange])

  // Expose the post function to the parent. The parent's Post button
  // will call this when receiptType === 'batch'.
  useEffect(() => {
    if (!onReady) return
    onReady(postBatch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, arAccountId, postingDate])

  const updateRow = (id: string, patch: Partial<BatchRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const addRow = () => {
    // Inherit the previous row's deposit account so a long run of
    // receipts into the same account (e.g. 20 M-Pesa payments) doesn't
    // require re-picking. User can change any row independently.
    const lastAccount = rows[rows.length - 1]?.depositAccountId || initialDepositAccountId
    setRows(prev => [...prev, emptyRow(lastAccount)])
  }

  const removeRow = (id: string) => {
    setRows(prev => {
      if (prev.length === 1) return [emptyRow(prev[0].depositAccountId || initialDepositAccountId)]
      const target = prev.find(r => r.id === id)
      if (target?.status === 'posted') return prev
      return prev.filter(r => r.id !== id)
    })
  }

  const resetBatch = () => {
    const hasPosted = rows.some(r => r.status === 'posted')
    if (hasPosted) {
      const ok = window.confirm(`This batch has ${rows.filter(r => r.status === 'posted').length} posted receipt(s). Clearing won't undo them — they remain in the books. Continue?`)
      if (!ok) return
    }
    setRows([emptyRow(initialDepositAccountId)])
  }

  const pickCustomer = async (rowId: string, c: Debtor) => {
    updateRow(rowId, { customer: c, openInvoices: [], status: 'pending', error: undefined })
    setOpenPickerRowId(null)
    setPickerSearch('')
    const { data, error } = await supabase
      .from('customer_ledger_entries')
      .select('id, document_ref, posting_date, due_date, amount, remaining_amount')
      .eq('customer_id', c.id)
      .eq('document_type', 'invoice')
      .eq('is_open', true)
      .gt('remaining_amount', 0)
      .order('posting_date', { ascending: true })
    if (error) {
      updateRow(rowId, { error: 'Failed to load open invoices: ' + error.message })
      return
    }
    const openInvs: OpenInvoice[] = (data || []).map(i => ({
      id: i.id,
      document_ref: i.document_ref,
      posting_date: i.posting_date,
      due_date: i.due_date,
      amount: i.amount || 0,
      remaining_amount: i.remaining_amount || 0,
      allocation: 0,
    }))
    updateRow(rowId, { openInvoices: openInvs })
  }

  const setAmountAndAutoAllocate = (rowId: string, amountStr: string) => {
    const amt = parseFloat(amountStr) || 0
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r
      if (!r.customer || r.openInvoices.length === 0) {
        return { ...r, amount: amountStr }
      }
      let remaining = amt
      const newAllocs = r.openInvoices.map(inv => {
        if (remaining <= 0) return { ...inv, allocation: 0 }
        const take = Math.min(remaining, inv.remaining_amount)
        remaining -= take
        return { ...inv, allocation: take }
      })
      return { ...r, amount: amountStr, openInvoices: newAllocs }
    }))
  }

  const setInvoiceAllocation = (rowId: string, invoiceId: string, allocStr: string) => {
    const a = Math.max(0, parseFloat(allocStr) || 0)
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r
      return {
        ...r,
        openInvoices: r.openInvoices.map(inv =>
          inv.id === invoiceId
            ? { ...inv, allocation: Math.min(a, inv.remaining_amount) }
            : inv
        ),
      }
    }))
  }

  const validateRow = (r: BatchRow): string | null => {
    if (!r.customer) return 'Pick a customer'
    const amt = parseFloat(r.amount) || 0
    if (amt <= 0) return 'Amount must be > 0'
    if (!r.depositAccountId) return 'Pick a deposit account'
    const allocated = r.openInvoices.reduce((s, i) => s + i.allocation, 0)
    if (allocated > amt + 0.5) return `Allocated TZS ${allocated.toLocaleString()} > amount TZS ${amt.toLocaleString()}`
    return null
  }

  const filteredContacts = (() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return contacts.slice(0, 50)
    return contacts.filter(c =>
      (c.company || '').toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      (c.contact_person || '').toLowerCase().includes(q) ||
      (c.customer_number || '').toLowerCase().includes(q)
    ).slice(0, 50)
  })()

  // Post the batch. Called by the parent's Post button via onReady.
  // Each row uses ITS OWN deposit account (set per row in the grid).
  // Method label is derived from that account's code/name.
  const postBatch = async (): Promise<{ ok: number; fail: number }> => {
    if (!arAccountId) { showToast('AR control account (1050) not found', 'error'); return { ok: 0, fail: 0 } }

    const toPost = rows.filter(r => r.status !== 'posted')
    if (toPost.length === 0) { showToast('Nothing to post — all rows are already posted', 'error'); return { ok: 0, fail: 0 } }

    const errors: { rowId: string; reason: string }[] = []
    for (const r of toPost) {
      const reason = validateRow(r)
      if (reason) errors.push({ rowId: r.id, reason })
    }
    if (errors.length > 0) {
      setRows(prev => prev.map(r => {
        const e = errors.find(x => x.rowId === r.id)
        return e ? { ...r, error: e.reason } : r
      }))
      showToast(`${errors.length} row(s) need fixing before posting`, 'error')
      return { ok: 0, fail: errors.length }
    }

    setPosting(true)
    let okCount = 0
    let failCount = 0

    for (const r of toPost) {
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: 'posting', error: undefined } : x))
      try {
        const cust = r.customer!
        const amount = parseFloat(r.amount) || 0
        const custName = cust.company || cust.name
        const ref = await nextRef('cash_receipt')

        // Resolve this row's deposit account + derive method label.
        const rowAcc = cashAccounts.find(a => a.id === r.depositAccountId)
        if (!rowAcc) throw new Error('Deposit account not found in chart of accounts')
        const method = deriveMethod(rowAcc.code, rowAcc.name)

        const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
          ref: 'JV-' + ref, posting_date: postingDate,
          description: `Customer Receipt — ${custName} — ${ref} (batch)`,
          journal_type: 'cash_receipt', source_type: 'cash_receipt',
          source_ref: ref, posted_by: getPostedBy(), status: 'posted',
        })
        if (jErr || !journalRaw) throw new Error(jErr?.message || 'Journal insert failed')

        const lines = buildCustomerReceiptJournalLines({
          depositAccountId: r.depositAccountId, arAccountId, amount, customerName: custName, narration: r.narration,
        }).map(l => ({ ...l, journal_id: journalRaw.id }))

        const { error: jlErr } = await supabase.from('journal_lines').insert(lines)
        if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

        await Promise.all(lines.map(l =>
          supabase.rpc('update_account_balance', {
            p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit,
          })
        ))

        const ledgerResult = await postCustomerReceiptLedger({
          customerId: cust.id, voucherRef: ref, postingDate, amount,
          allocations: r.openInvoices, journalId: journalRaw.id, narration: r.narration,
        })
        if (!ledgerResult.success) throw new Error(ledgerResult.error || 'Ledger update failed')

        await supabase.from('vouchers').insert({
          ref, type: 'cash_receipt', posting_date: postingDate,
          description: `Customer Receipt — ${custName} (batch)`,
          total_amount: amount, status: 'posted', journal_id: journalRaw.id,
          payment_method: method.value,
          notes: r.narration || `Batch receipt · ${r.transactionId ? `ref ${r.transactionId}` : ''}`,
          posted_by: getPostedBy(), customer_id: cust.id,
        })

        setRows(prev => prev.map(x => x.id === r.id
          ? { ...x, status: 'posted', postedRef: ref, error: undefined, expanded: false }
          : x))
        okCount++
      } catch (err: any) {
        const msg = err?.message || 'Unknown error'
        setRows(prev => prev.map(x => x.id === r.id
          ? { ...x, status: 'failed', error: msg }
          : x))
        failCount++
      }
    }

    setPosting(false)
    if (failCount === 0) {
      showToast(`Batch complete · ${okCount} receipt${okCount === 1 ? '' : 's'} posted`)
    } else if (okCount === 0) {
      showToast(`Batch failed — ${failCount} row(s) errored. Fix and retry.`, 'error')
    } else {
      showToast(`Partial: ${okCount} posted, ${failCount} failed. See inline errors and retry.`, 'error')
    }
    return { ok: okCount, fail: failCount }
  }

  // Derived totals
  const batchTotal = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const postedTotal = rows.filter(r => r.status === 'posted').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const pendingCount = rows.filter(r => r.status !== 'posted' && r.customer && (parseFloat(r.amount) || 0) > 0).length

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="card-title">Receipt Rows ({rows.length})</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={resetBatch} className="btn btn-ghost btn-sm">Reset Batch</button>
          <button onClick={addRow} className="btn btn-primary btn-sm">+ Add Row</button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        {[
          { label: 'Rows', val: rows.length },
          { label: 'Batch Total', val: tzs(batchTotal) },
          { label: 'Posted So Far', val: tzs(postedTotal), color: 'var(--green)' },
          { label: 'Pending Post', val: pendingCount, color: pendingCount > 0 ? 'var(--accent)' : 'var(--text3)' },
        ].map((s, i) => (
          <div key={i} style={{
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: (s as any).color || 'var(--text)' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {contactsLoading && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>Loading wholesale contacts…</div>
      )}

      {!contactsLoading && rows.map((r, idx) => {
        const amt = parseFloat(r.amount) || 0
        const allocated = r.openInvoices.reduce((s, i) => s + i.allocation, 0)
        const overflow = allocated - amt
        const credit = amt - allocated
        const locked = r.status === 'posted'

        return (
          <div key={r.id} style={{
            border: `1px solid ${
              r.status === 'posted' ? 'rgba(0,229,160,.4)'
              : r.status === 'failed' ? 'rgba(255,71,87,.4)'
              : 'var(--border)'
            }`,
            borderRadius: 10, padding: 12, marginBottom: 10,
            background: r.status === 'posted' ? 'rgba(0,229,160,.05)' : 'var(--surface)',
            opacity: locked ? 0.85 : 1,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', fontWeight: 700 }}>#{idx + 1}</span>
                {r.status === 'posted' && (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'rgba(0,229,160,.15)', color: 'var(--green)', fontWeight: 700 }}>
                    ✓ POSTED · {r.postedRef}
                  </span>
                )}
                {r.status === 'posting' && (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700 }}>POSTING…</span>
                )}
                {r.status === 'failed' && (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'rgba(255,71,87,.15)', color: 'var(--red)', fontWeight: 700 }}>FAILED — RETRY</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {r.customer && (
                  <button onClick={() => updateRow(r.id, { expanded: !r.expanded })}
                    disabled={locked}
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: locked ? 'not-allowed' : 'pointer', color: 'var(--text3)' }}>
                    {r.expanded ? 'Collapse' : 'Allocate'} ({r.openInvoices.filter(i => i.allocation > 0).length}/{r.openInvoices.length})
                  </button>
                )}
                <button onClick={() => removeRow(r.id)}
                  disabled={locked}
                  style={{ background: locked ? 'transparent' : 'rgba(255,71,87,.08)', border: `1px solid ${locked ? 'var(--border)' : 'rgba(255,71,87,.3)'}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: locked ? 'not-allowed' : 'pointer', color: locked ? 'var(--text3)' : 'var(--red)' }}
                  title={locked ? 'Posted rows cannot be removed (audit trail)' : 'Remove row'}>
                  Remove
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, alignItems: 'start' }}>
              {/* Customer picker */}
              <div style={{ position: 'relative' }}>
                <label className="form-label" style={{ fontSize: 10 }}>Customer</label>
                {r.customer ? (
                  <div style={{
                    padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
                    background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.customer.company || r.customer.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{r.customer.customer_number} · Balance {tzs(r.customer.balance || 0)}</div>
                    </div>
                    {!locked && (
                      <button onClick={() => updateRow(r.id, { customer: null, openInvoices: [], amount: '' })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 11 }}>
                        Change
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <input className="form-input"
                      placeholder="Click to pick a customer…"
                      value={openPickerRowId === r.id ? pickerSearch : ''}
                      onFocus={() => { setOpenPickerRowId(r.id); setPickerSearch('') }}
                      onChange={e => setPickerSearch(e.target.value)}
                      disabled={locked}
                    />
                    {openPickerRowId === r.id && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                        background: 'var(--surface)', border: '1px solid var(--accent)',
                        borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.3)',
                        maxHeight: 280, overflowY: 'auto',
                      }}>
                        <div style={{ padding: '6px 12px', background: 'var(--surface2)', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
                          {filteredContacts.length} of {contacts.length}
                        </div>
                        {filteredContacts.length === 0 ? (
                          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>No match</div>
                        ) : filteredContacts.map(c => (
                          <div key={c.id}
                            onClick={() => pickCustomer(r.id, c)}
                            style={{ padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.company || c.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                              {c.customer_number} · Owes {tzs(c.balance || 0)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 10 }}>Amount (TZS)</label>
                <input className="form-input" type="number" min="0"
                  placeholder="0"
                  style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}
                  value={r.amount}
                  onChange={e => setAmountAndAutoAllocate(r.id, e.target.value)}
                  disabled={locked || !r.customer}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 10 }}>Deposit Account</label>
                <select className="form-input" value={r.depositAccountId}
                  onChange={e => updateRow(r.id, { depositAccountId: e.target.value })}
                  disabled={locked}
                  title="Which account did this customer's money land in? Method label is auto-derived.">
                  <option value="">— Select —</option>
                  {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
                {r.depositAccountId && (() => {
                  const acc = cashAccounts.find(a => a.id === r.depositAccountId)
                  if (!acc) return null
                  const m = deriveMethod(acc.code, acc.name)
                  return (
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                      → {m.label}
                    </div>
                  )
                })()}
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 10 }}>Reference</label>
                {(() => {
                  // Reference placeholder depends on the derived method
                  // for this row's account — cheque needs a cheque #,
                  // RTGS needs a TT ref, M-Pesa needs the M-Pesa code, etc.
                  const acc = cashAccounts.find(a => a.id === r.depositAccountId)
                  const method = acc ? deriveMethod(acc.code, acc.name).value : 'cash'
                  const placeholder =
                    method === 'rtgs'   ? 'RTGS / cheque ref' :
                    method === 'mpesa'  ? 'M-Pesa ref' :
                    method === 'mixx'   ? 'Mixx ref' :
                    method === 'airtel' ? 'Airtel ref' :
                    'Optional'
                  return (
                    <input className="form-input"
                      placeholder={placeholder}
                      value={r.transactionId}
                      onChange={e => updateRow(r.id, { transactionId: e.target.value })}
                      disabled={locked}
                    />
                  )
                })()}
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              <input className="form-input" placeholder="Narration (optional)"
                style={{ fontSize: 12 }}
                value={r.narration}
                onChange={e => updateRow(r.id, { narration: e.target.value })}
                disabled={locked}
              />
            </div>

            {r.error && (
              <div style={{
                marginTop: 10, padding: '8px 12px',
                background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.3)',
                borderRadius: 6, color: 'var(--red)', fontSize: 12,
              }}>
                ⚠ {r.error}
              </div>
            )}

            {r.expanded && r.customer && !locked && (
              <div style={{
                marginTop: 12, padding: 10,
                background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Allocate Across Open Invoices (FIFO Pre-Filled)
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>
                    <span style={{ color: 'var(--text3)' }}>Allocated </span>
                    <span style={{ fontWeight: 700, color: overflow > 0.5 ? 'var(--red)' : 'var(--text)' }}>{tzs(allocated)}</span>
                    <span style={{ color: 'var(--text3)' }}> / {tzs(amt)}</span>
                    {credit > 0.5 && (
                      <span style={{ marginLeft: 8, padding: '1px 6px', background: 'var(--yellow-dim, rgba(255,211,42,.15))', color: 'var(--yellow, #f59e0b)', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                        {tzs(credit)} → credit on account
                      </span>
                    )}
                  </div>
                </div>
                {r.openInvoices.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', padding: 8 }}>
                    No open invoices — full amount will post as credit on account.
                  </div>
                ) : (
                  <table style={{ width: '100%', fontSize: 11 }}>
                    <thead>
                      <tr style={{ color: 'var(--text3)', textAlign: 'left', fontSize: 10, textTransform: 'uppercase' }}>
                        <th style={{ padding: '4px 8px' }}>Invoice</th>
                        <th style={{ padding: '4px 8px' }}>Date</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right' }}>Outstanding</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right' }}>Allocate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.openInvoices.map(inv => (
                        <tr key={inv.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '4px 8px', fontFamily: 'var(--mono)', fontWeight: 600 }}>{inv.document_ref}</td>
                          <td style={{ padding: '4px 8px', color: 'var(--text3)' }}>{inv.posting_date}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{inv.remaining_amount.toLocaleString()}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                            <input type="number" min="0" max={inv.remaining_amount}
                              value={inv.allocation || ''}
                              onChange={e => setInvoiceAllocation(r.id, inv.id, e.target.value)}
                              style={{
                                width: 100, padding: '3px 6px', fontFamily: 'var(--mono)',
                                textAlign: 'right', fontSize: 11,
                                border: '1px solid var(--border)', borderRadius: 4,
                                background: 'var(--surface)',
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
