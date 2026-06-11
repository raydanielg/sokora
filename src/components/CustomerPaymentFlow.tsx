// ─── Customer Payment Flow (shared between Cash Receipt + Bank Receipt) ───
// A reusable component that handles the full "receive payment from debtor"
// workflow: debtor search, open-invoice allocation with FIFO auto-apply,
// transaction-id capture, and journal/ledger posting.
//
// Cash Receipt and Bank Receipt import this component — the only difference
// between those two vouchers is which cash/bank account is debited by default
// and which payment methods are shown. Business logic is identical.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { insertJournalWithRetry } from '../lib/refs'
import { getPostedBy } from '../lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Debtor {
  id: string
  name: string
  company: string | null
  contact_person: string | null
  customer_number: string
  balance: number
  whatsapp: string | null
}

export interface OpenInvoice {
  id: string
  document_ref: string
  posting_date: string
  due_date: string | null
  amount: number              // original invoice total
  remaining_amount: number    // still outstanding
  allocation: number          // how much of THIS payment goes to this invoice (UI state)
}

export interface CustomerPaymentResult {
  success: boolean
  error?: string
  allocatedTotal: number
  unallocatedCredit: number   // overpayment that becomes a customer credit
}

interface Props {
  voucherRef: string
  postingDate: string
  amount: number
  paymentMethod: string       // 'cash' | 'mpesa' | 'bank' | 'pos' | 'cheque'
  transactionId: string
  narration: string
  depositAccountId: string    // the cash/bank account being debited
  onChange: (state: {
    selectedCustomer: Debtor | null
    allocatedTotal: number
    unallocatedCredit: number
    allocations: OpenInvoice[]
  }) => void
  initialCustomerId?: string   // when set, auto-selects this customer on mount (Receipt prefill)
}

// ─── Component ─────────────────────────────────────────────────────────────

export function CustomerPaymentFlow({
  amount, onChange, initialCustomerId,
}: Props) {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Debtor[]>([])
  // Full cached list of active debtors. Loaded once on mount so the user can
  // browse without typing and so filtering happens instantly client-side
  // (no Supabase round-trip per keystroke). This is the same pattern the
  // Sales Invoice page uses for its customer picker.
  const [allDebtors, setAllDebtors] = useState<Debtor[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selected, setSelected] = useState<Debtor | null>(null)
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  // Load all active wholesale contacts once on mount. Lets the user click
  // the browse icon and see everyone immediately, instead of having to
  // guess at search terms. We pull BOTH 'wholesale' (canonical) and
  // 'debtor' (legacy) so a partially-migrated DB still works, and we
  // filter out is_hidden rows because pickers should not surface
  // soft-hidden contacts (reports / statements still see them).
  useEffect(() => {
    let cancelled = false
    const loadAll = async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name, company, contact_person, customer_number, balance, whatsapp')
        .in('customer_type', ['wholesale', 'debtor'])
        .eq('is_active', true)
        .eq('is_hidden', false)
        .order('name')
      if (!cancelled && data) setAllDebtors(data)
    }
    loadAll()
    return () => { cancelled = true }
  }, [])

  // Auto-select a customer when one is prefilled (Receipt button on the customer page).
  // Runs once, after the debtor list has loaded, and only if nothing is selected yet.
  const autoPicked = useRef(false)
  useEffect(() => {
    if (autoPicked.current || !initialCustomerId || selected) return
    const match = allDebtors.find(d => d.id === initialCustomerId)
    if (match) { autoPicked.current = true; pickCustomer(match) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCustomerId, allDebtors, selected])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Emit state changes up to parent whenever something relevant changes
  useEffect(() => {
    const allocatedTotal = openInvoices.reduce((s, i) => s + i.allocation, 0)
    const unallocatedCredit = Math.max(0, amount - allocatedTotal)
    onChange({
      selectedCustomer: selected,
      allocatedTotal,
      unallocatedCredit,
      allocations: openInvoices,
    })
  }, [selected, openInvoices, amount, onChange])

  // Re-run FIFO auto-allocation when the amount changes
  useEffect(() => {
    if (openInvoices.length === 0 || amount <= 0) return
    applyFIFOAllocation(amount)
    // Intentionally exclude openInvoices from deps — we only want to re-allocate
    // when the user types a new amount, not when we modify allocations below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount])

  // ─── Customer search (debtors only, client-side filter) ──────────────────
  //
  // Filters the cached debtor list by name / company / contact / DEB number.
  // An empty query shows everyone (up to 50 rows) so the user can browse
  // without having to type — the previous implementation searched the
  // server with a literal space character on focus, which silently capped
  // results at 10 matching customers with a space in their name. That
  // forced users to scroll endlessly past the wrong people.
  const searchDebtors = (q: string) => {
    setSearch(q)
    const trimmed = q.trim().toLowerCase()
    if (!trimmed) {
      // Empty query: show everyone (capped at 50 for performance; typing
      // narrows further). The dropdown is scrollable for the rest.
      setSearchResults(allDebtors.slice(0, 50))
      setShowDropdown(allDebtors.length > 0)
      return
    }
    const filtered = allDebtors.filter(c =>
      (c.name || '').toLowerCase().includes(trimmed) ||
      (c.company || '').toLowerCase().includes(trimmed) ||
      (c.contact_person || '').toLowerCase().includes(trimmed) ||
      (c.customer_number || '').toLowerCase().includes(trimmed)
    ).slice(0, 50)
    setSearchResults(filtered)
    setShowDropdown(true)  // always open while searching so the "no results" panel can render
  }

  const pickCustomer = async (c: Debtor) => {
    setSelected(c)
    setSearch(c.company || c.name)
    setShowDropdown(false)
    setLoadingInvoices(true)

    // Load open invoices for this customer, oldest first (for FIFO)
    const { data: ledger } = await supabase
      .from('customer_ledger_entries')
      .select('id, document_ref, posting_date, due_date, amount, remaining_amount, document_type')
      .eq('customer_id', c.id)
      .eq('is_open', true)
      .gt('remaining_amount', 0)
      .in('document_type', ['invoice'])  // only unpaid invoices — ignore credits/other
      .order('posting_date', { ascending: true })

    const invoices: OpenInvoice[] = (ledger || []).map(l => ({
      id: l.id,
      document_ref: l.document_ref,
      posting_date: l.posting_date,
      due_date: l.due_date,
      amount: l.amount,
      remaining_amount: l.remaining_amount,
      allocation: 0,
    }))

    setOpenInvoices(invoices)
    setLoadingInvoices(false)

    // Auto-allocate using FIFO immediately (once invoices are in state, the
    // useEffect-watcher won't retrigger, so we apply here explicitly)
    setTimeout(() => applyFIFOAllocationInternal(invoices, amount), 0)
  }

  // ─── FIFO allocation ─────────────────────────────────────────────────────
  // Applies the payment amount across invoices oldest-first. Each invoice
  // receives up to its remaining_amount. Leftover (overpayment) shows in the
  // parent as "unallocated credit".

  const applyFIFOAllocationInternal = (invoices: OpenInvoice[], remaining: number) => {
    const next = invoices.map(inv => {
      if (remaining <= 0) return { ...inv, allocation: 0 }
      const apply = Math.min(inv.remaining_amount, remaining)
      remaining -= apply
      return { ...inv, allocation: apply }
    })
    setOpenInvoices(next)
  }

  const applyFIFOAllocation = (newAmount: number) => {
    applyFIFOAllocationInternal(openInvoices, newAmount)
  }

  // User edits a specific invoice allocation — we don't cascade, we let them
  // fully control allocation from that point. They can always click "Auto
  // Allocate" to reset to FIFO.
  const updateAllocation = (idx: number, value: number) => {
    setOpenInvoices(prev => prev.map((inv, i) => {
      if (i !== idx) return inv
      const clamped = Math.max(0, Math.min(inv.remaining_amount, value))
      return { ...inv, allocation: clamped }
    }))
  }

  const resetToFIFO = () => applyFIFOAllocation(amount)

  const clearAll = () => {
    setOpenInvoices(prev => prev.map(i => ({ ...i, allocation: 0 })))
  }

  const changeCustomer = () => {
    setSelected(null)
    setSearch('')
    setOpenInvoices([])
    setSearchResults([])
  }

  // ─── Derived values for UI ──────────────────────────────────────────────

  const allocatedTotal = openInvoices.reduce((s, i) => s + i.allocation, 0)
  const unallocatedCredit = Math.max(0, amount - allocatedTotal)
  const overallocation = Math.max(0, allocatedTotal - amount)

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Info strip explaining AR allocation */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14,
        padding: '10px 12px', background: 'rgba(0,229,160,.08)',
        border: '1px solid rgba(0,229,160,.25)', borderRadius: 8,
        fontSize: 12, color: 'var(--text2)',
      }}>
        <svg width="14" height="14" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 2 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <span>
          Payments reduce <strong>Accounts Receivable (1050)</strong>. Pick a debtor,
          and we'll auto-apply the amount oldest-invoice-first. You can override
          how it's split across invoices.
        </span>
      </div>

      {/* Customer selection */}
      {!selected ? (
        <div ref={dropRef} style={{ position: 'relative', marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block' }}>
            Customer (debtor) <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <div style={{ position: 'relative' }}>
            {/* Browse icon — click to open the full debtor list. Same UX as
                Sales Invoice. Keeps the input focus from auto-opening,
                so tabbing into the field doesn't pop up a list the user
                didn't ask for. */}
            <button
              type="button"
              onClick={() => {
                if (showDropdown) {
                  setShowDropdown(false)
                } else {
                  // Pass the current search so the icon respects any
                  // existing filter; empty string shows everyone.
                  searchDebtors(search)
                }
              }}
              title={showDropdown ? 'Close list' : 'Browse all debtors'}
              style={{
                position: 'absolute', left: 6, top: '50%',
                transform: 'translateY(-50%)',
                background: showDropdown ? 'var(--accent-dim)' : 'transparent',
                border: 'none', borderRadius: 6,
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', zIndex: 2,
                color: showDropdown ? 'var(--accent)' : 'var(--text3)',
                transition: 'background .15s, color .15s',
              }}
              onMouseEnter={e => { if (!showDropdown) (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
              onMouseLeave={e => { if (!showDropdown) (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </button>
            <input
              className="form-input"
              style={{ paddingLeft: 44, fontSize: 14, height: 44 }}
              placeholder="Click person icon to browse, or type name / company / DEB number…"
              value={search}
              onChange={e => searchDebtors(e.target.value)}
            />
          </div>
          {showDropdown && searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: 'var(--surface)', border: '1px solid var(--accent)',
              borderRadius: 10, zIndex: 50, boxShadow: '0 12px 40px rgba(0,0,0,.4)',
              overflow: 'hidden', maxHeight: 360, overflowY: 'auto',
            }}>
              {/* Dropdown header — tells the user what they're seeing.
                  Matches the Sales Invoice pattern: a sticky strip showing
                  "X matches" while typing, or "All debtors (N)" while browsing. */}
              <div style={{
                padding: '8px 14px', background: 'var(--surface2)',
                borderBottom: '1px solid var(--border)',
                fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: 0.5,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                position: 'sticky', top: 0, zIndex: 1,
              }}>
                <span>
                  {search.trim().length > 0
                    ? `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'}`
                    : `All registered debtors${allDebtors.length > 50 ? ` (showing 50 of ${allDebtors.length})` : ` (${allDebtors.length})`}`}
                </span>
                <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text3)' }}>
                  {search.trim().length === 0 && allDebtors.length > 50 && 'Type to filter…'}
                </span>
              </div>
              {searchResults.map((c, i) => (
                <div key={i} onClick={() => pickCustomer(c)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.company || c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {c.contact_person && `Attn: ${c.contact_person} · `}{c.customer_number}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                    {(c.balance || 0) > 0 ? (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
                        Owes {(c.balance || 0).toLocaleString()}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--green)' }}>No balance</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {showDropdown && searchResults.length === 0 && search.trim().length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, zIndex: 50, padding: '14px', fontSize: 12, color: 'var(--text3)',
            }}>
              No matching debtors for "<strong>{search}</strong>". Make sure the customer is registered with type "Debtor".
            </div>
          )}
        </div>
      ) : (
        /* Selected customer card */
        <div style={{
          background: 'var(--surface2)', borderRadius: 10, padding: '14px 18px',
          marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
              {selected.company || selected.name}
            </div>
            {selected.contact_person && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Attn: {selected.contact_person}</div>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 4 }}>
                {selected.customer_number}
              </span>
              {selected.whatsapp && (
                <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{selected.whatsapp}</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Outstanding</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: (selected.balance || 0) > 0 ? 'var(--red)' : 'var(--green)' }}>
              TZS {(selected.balance || 0).toLocaleString()}
            </div>
            <button
              onClick={changeCustomer}
              style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: 4 }}
            >
              Change customer
            </button>
          </div>
        </div>
      )}

      {/* Open invoices table */}
      {selected && (
        <div>
          {loadingInvoices ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              Loading open invoices…
            </div>
          ) : openInvoices.length === 0 ? (
            <div style={{
              padding: '16px 14px', background: 'rgba(234,179,8,.08)',
              border: '1px solid rgba(234,179,8,.3)', borderRadius: 8,
              fontSize: 12, color: 'var(--text2)',
            }}>
              This customer has no open invoices. The full amount ({amount.toLocaleString()}) will post as an
              unallocated credit on their account, available to apply to future invoices.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  Open Invoices ({openInvoices.length})
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={resetToFIFO} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
                    Auto Allocate (FIFO)
                  </button>
                  <button onClick={clearAll} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
                    Clear All
                  </button>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
                <table style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>Invoice</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>Due</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>Original</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>Outstanding</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>Apply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openInvoices.map((inv, i) => {
                      const today = new Date(); today.setHours(0,0,0,0)
                      const due = inv.due_date ? new Date(inv.due_date) : null
                      const overdue = due && due < today
                      return (
                        <tr key={inv.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600 }}>{inv.document_ref}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{inv.posting_date}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', color: overdue ? 'var(--red)' : 'var(--text3)' }}>
                            {inv.due_date || '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{inv.amount.toLocaleString()}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--yellow)' }}>{inv.remaining_amount.toLocaleString()}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="number"
                              className="form-input"
                              style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, height: 32, padding: '4px 8px' }}
                              value={inv.allocation || ''}
                              min={0}
                              max={inv.remaining_amount}
                              onChange={e => updateAllocation(i, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Allocation summary */}
              <div style={{
                marginTop: 10, padding: '10px 14px',
                background: overallocation > 0 ? 'rgba(239,68,68,.08)' : 'var(--surface2)',
                border: `1px solid ${overallocation > 0 ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 'var(--r)',
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12,
              }}>
                <div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>Payment</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{amount.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>Allocated</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{allocatedTotal.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>
                    {overallocation > 0 ? 'Over-Allocated' : 'Credit Balance'}
                  </div>
                  <div style={{
                    fontFamily: 'var(--mono)', fontWeight: 700,
                    color: overallocation > 0 ? 'var(--red)' : unallocatedCredit > 0 ? 'var(--yellow)' : 'var(--text3)',
                  }}>
                    {(overallocation > 0 ? overallocation : unallocatedCredit).toLocaleString()}
                  </div>
                </div>
              </div>

              {overallocation > 0 && (
                <div style={{
                  marginTop: 8, padding: '8px 12px',
                  background: 'rgba(239,68,68,.08)', border: '1px solid var(--red)',
                  borderRadius: 6, fontSize: 11, color: 'var(--red)',
                }}>
                  Allocations exceed payment amount by {overallocation.toLocaleString()}. Reduce one or more invoice allocations before posting.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Posting helpers (called from parent after validation) ─────────────────
// These are the DB writes that happen after the user clicks Post. The parent
// voucher owns the main journal and voucher row; this helper posts the AR
// ledger entries that link the payment to specific invoices.

interface PostReceiptArgs {
  customerId: string
  voucherRef: string
  postingDate: string
  amount: number
  allocations: OpenInvoice[]
  journalId: string
  narration: string
}

export async function postCustomerReceiptLedger(args: PostReceiptArgs): Promise<{ success: boolean; error?: string }> {
  const { customerId, voucherRef, postingDate, amount, allocations, journalId, narration } = args

  // 1. Post the receipt itself as a negative AR ledger entry (credits the customer)
  //    This is what appears on customer statements as "Payment received."
  const { error: receiptErr } = await supabase.from('customer_ledger_entries').insert({
    customer_id: customerId,
    posting_date: postingDate,
    document_type: 'receipt',
    document_ref: voucherRef,
    description: narration || `Payment received — ${voucherRef}`,
    amount: -amount,              // negative: reduces AR
    remaining_amount: 0,          // receipts are closed at posting time
    is_open: false,
    journal_id: journalId,
  })
  if (receiptErr) return { success: false, error: 'Receipt ledger: ' + receiptErr.message }

  // 2. For each invoice that received an allocation, update its remaining_amount
  //    and is_open flag. This is what makes AR Aging and Invoices List reflect
  //    the payment immediately.
  for (const inv of allocations) {
    if (inv.allocation <= 0) continue
    const newRemaining = Math.max(0, inv.remaining_amount - inv.allocation)
    const stillOpen = newRemaining > 0.5

    const { error: updateErr } = await supabase
      .from('customer_ledger_entries')
      .update({ remaining_amount: newRemaining, is_open: stillOpen })
      .eq('id', inv.id)

    if (updateErr) return { success: false, error: `Allocation to ${inv.document_ref}: ${updateErr.message}` }
  }

  // 3. Update the customer's top-level balance.
  //
  //    Previously: blind subtraction with `Math.max(0, balance - amount)`.
  //    That had two bugs:
  //      a) drift accumulated silently — if a single posting wrote both an
  //         allocation update AND a customers.balance subtraction, but the
  //         allocation update was for a different amount than `amount`
  //         (over-allocation / under-allocation), the two paths diverged
  //         and the stored balance gradually fell out of sync with the
  //         ledger sum. We saw this on Afeni Baby Shop where the stored
  //         balance was 250K lower than the true AR.
  //      b) the Math.max(0, ...) floor masked overpayments: receiving more
  //         than the customer owed silently clamped balance to 0 instead of
  //         leaving a negative AR (= credit on account), so the credit
  //         disappeared from the header card but still existed in the
  //         ledger — accounting drift from the GL side.
  //
  //    Now: after writing the receipt + allocation rows above, re-derive
  //    the customer's balance as the SUM of THEIR ledger entries. The
  //    ledger is the source of truth (it's also what statements and AR
  //    aging read), so the stored balance just mirrors that sum. No
  //    drift possible; no clamping; overpayments survive as negative
  //    balances (credit on account).
  const { data: sumRow } = await supabase
    .from('customer_ledger_entries')
    .select('amount')
    .eq('customer_id', customerId)
  if (sumRow) {
    const total = sumRow.reduce((s: number, r: { amount: number }) => s + (r.amount || 0), 0)
    await supabase
      .from('customers')
      .update({ balance: total })
      .eq('id', customerId)
  }

  return { success: true }
}

// Build the journal posting args for a customer receipt — caller passes
// the AR account ID and the cash/bank account ID, we return the lines.
export function buildCustomerReceiptJournalLines(args: {
  depositAccountId: string
  arAccountId: string
  amount: number
  customerName: string
  narration: string
}) {
  return [
    {
      line_number: 1,
      account_id: args.depositAccountId,
      description: `Received from ${args.customerName}`,
      debit: args.amount,
      credit: 0,
    },
    {
      line_number: 2,
      account_id: args.arAccountId,
      description: args.narration || `AR payment — ${args.customerName}`,
      debit: 0,
      credit: args.amount,
    },
  ]
}

// Re-export for parent convenience
export { insertJournalWithRetry, getPostedBy }
