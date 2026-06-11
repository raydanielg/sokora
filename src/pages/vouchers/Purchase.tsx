import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import DraftBanner from '../../components/DraftBanner'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import { postLedgerEntry } from '../../lib/itemLedger'
import { useVoucherDraft } from '../../lib/useVoucherDraft'
import { useAuth } from '../../lib/useAuth'
import { useUserLocation } from '../../lib/useUserLocation'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBProduct { id: string; sku: string; name: string; cost_price: number; qty_on_hand: number }
interface DBSupplier { id: string; name: string; balance_tzs: number }
interface DBAccount { id: string; code: string; name: string; type: string }
interface PurchaseLine { productId: string; description: string; qty: number; unitCost: number; amount: number }

type PaymentMode = 'credit' | 'cash' | 'bank' | 'mpesa'

export default function Purchase({ onNav }: Props) {
  const { user } = useAuth()
  const userLoc = useUserLocation()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([])
  const [accounts, setAccounts] = useState<DBAccount[]>([])
  const [locations, setLocations] = useState<{id:string;code:string;name:string}[]>([])

  const [lines, setLines] = useState<PurchaseLine[]>([{ productId: '', description: '', qty: 1, unitCost: 0, amount: 0 }])
  const [form, setForm] = useState({
    date: today(),
    ref: 'PUR-10-????',
    supplier: '',
    invoiceRef: '',
    paymentMode: 'credit' as PaymentMode,
    payAccount: '',
    dueDate: '',
    location_code: '1002',
    notes: '',
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // ─── Draft persistence ─────────────────────────────────────────────────
  type PurchaseDraft = { form: typeof form; lines: PurchaseLine[] }
  const {
    availableDraft, draftAgeMs,
    saveDraft, clearDraft, acknowledgeResume, discardDraft,
  } = useVoucherDraft<PurchaseDraft>('purchase', false)

  const resumeDraft = () => {
    if (!availableDraft) return
    setForm(availableDraft.form)
    setLines(availableDraft.lines)
    acknowledgeResume()
  }

  useEffect(() => {
    loadProducts(); loadSuppliers(); loadAccounts(); loadNextRef()
    supabase.from('stock_locations').select('id,code,name').eq('is_active', true).order('code')
      .then(({ data }) => {
        if (data) {
          setLocations(data)
          // Locked users get their assigned location. Unrestricted users
          // default to godown (1002) where most purchases land.
          if (userLoc.defaultLocationCode && data.find(l => l.code === userLoc.defaultLocationCode)) {
            set('location_code', userLoc.defaultLocationCode)
          } else {
            const wh = data.find(l => l.code === '1002') || data[0]
            if (wh) set('location_code', wh.code)
          }
        }
      })
  }, [])

  // Auto-save — skip while ref is initializing or form is empty
  useEffect(() => {
    if (!form.ref || form.ref.includes('????')) return
    const hasAnything =
      form.supplier.trim().length > 0 ||
      form.invoiceRef.trim().length > 0 ||
      form.notes.trim().length > 0 ||
      lines.some(l => l.productId || l.qty !== 1 || l.unitCost > 0)
    if (!hasAnything) return
    saveDraft({ form, lines })
  }, [form, lines, saveDraft])

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, sku, name, cost_price, qty_on_hand').eq('is_active', true).order('name')
    if (data) setProducts(data)
  }
  const loadSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id, name, balance_tzs').eq('is_active', true).order('name')
    if (data) setSuppliers(data)
  }
  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name, type').eq('is_active', true).order('code')
    if (data) setAccounts(data)
  }
  const loadNextRef = async () => {
    const newRef = await nextRef('purchase')
    set('ref', newRef)
  }

  const addLine = () => setLines([...lines, { productId: '', description: '', qty: 1, unitCost: 0, amount: 0 }])
  const removeLine = (i: number) => setLines(lines.length > 1 ? lines.filter((_, idx) => idx !== i) : lines)

  const updateLine = (i: number, field: keyof PurchaseLine, value: string | number) => {
    const newLines = [...lines]
    newLines[i] = { ...newLines[i], [field]: value as never }
    if (field === 'productId') {
      const p = products.find(pp => pp.id === value)
      if (p) {
        newLines[i].description = p.name
        if (newLines[i].unitCost === 0) newLines[i].unitCost = p.cost_price || 0
      }
    }
    if (field === 'qty' || field === 'unitCost') {
      newLines[i].amount = newLines[i].qty * newLines[i].unitCost
    }
    setLines(newLines)
  }

  const totalCost = lines.reduce((s, l) => s + (l.amount || 0), 0)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg); setToastType(type)
  }

  // Bank/Cash accounts to choose from for "Pay now"
  // Note: Excludes inventory account 1110 (which would create Dr Inventory / Cr Inventory and silently zero out)
  const bankCashAccounts = accounts.filter(a => {
    if (a.code === '1100' || a.code === '1101') return true            // Cash on hand
    if (a.code.startsWith('112')) return true                          // Bank accounts (1120-1129 typical convention)
    if (a.code.startsWith('113')) return true                          // M-Pesa / mobile money (1130+)
    // Type-based fallback: anything classified as 'bank' or 'cash' in chart of accounts
    if (a.type === 'bank' || a.type === 'cash') return true
    return false
  })

  const post = async () => {
    if (!form.supplier) { showToast('Please select a supplier', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Please add at least one product', 'error'); return }
    // Catch the silent-skip bug: lines with qty/cost typed but no product picked
    const incompleteLines = lines.filter(l => !l.productId && (l.qty > 0 || l.unitCost > 0 || l.description.trim() !== ''))
    if (incompleteLines.length > 0) {
      showToast(`${incompleteLines.length} line(s) have data but no product selected. Pick from the product dropdown or remove the line.`, 'error')
      return
    }
    if (totalCost <= 0) { showToast('Total must be greater than zero', 'error'); return }
    if (form.paymentMode !== 'credit' && !form.payAccount) {
      showToast('Select the cash/bank account you paid from', 'error'); return
    }
    if (!user) { showToast('You must be signed in', 'error'); return }
    // Defence in depth: locked users cannot receive purchases into another location.
    if (!userLoc.canPostFrom(form.location_code)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}. You cannot receive a purchase into ${form.location_code}.`, 'error')
      return
    }
    setPosting(true)

    try {
      // Resolve key accounts
      const inventoryAcct = accounts.find(a => a.code === '1110')
      const apAcct = accounts.find(a => a.code === '2010')
      if (!inventoryAcct) {
        const codes = accounts.filter(a => a.type === 'asset').slice(0, 8).map(a => a.code).join(', ')
        throw new Error(`Inventory account (code 1110) not found in Chart of Accounts. Asset accounts present: ${codes || 'none'}. Add 1110 = Inventory in Chart of Accounts and try again.`)
      }
      if (form.paymentMode === 'credit' && !apAcct) throw new Error('Accounts Payable (2010) not found in Chart of Accounts. Add it and try again.')
      // Sanity: pay account must not be the inventory account itself
      if (form.paymentMode !== 'credit' && form.payAccount === inventoryAcct.id) {
        throw new Error('You selected the Inventory account as the pay-from account. Pick a Cash or Bank account instead.')
      }

      const supplierObj = suppliers.find(s => s.id === form.supplier)
      const supplierName = supplierObj?.name || 'Supplier'
      const isCredit = form.paymentMode === 'credit'

      // ─── Create journal ────────────────────────────────────────────────
      // Credit purchase: Dr Inventory / Cr Accounts Payable
      // Cash purchase:   Dr Inventory / Cr Bank or Cash
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref,
        posting_date: form.date,
        description: `Purchase — ${supplierName} — ${form.ref}`,
        journal_type: 'purchase',
        source_type: 'purchase',
        source_ref: form.ref,
        posted_by: user.full_name,
        status: 'posted',
      })
      if (jErr || !journalRaw) throw new Error(jErr?.message || 'Journal insert failed')
      const journal = journalRaw

      const creditAcctId = isCredit ? apAcct!.id : form.payAccount
      const creditAcctLabel = isCredit ? `AP — ${supplierName}` : `Paid via ${accounts.find(a => a.id === form.payAccount)?.name || ''}`

      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: inventoryAcct.id, description: `Stock purchase — ${form.ref}`, debit: totalCost, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: creditAcctId, description: creditAcctLabel, debit: 0, credit: totalCost },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      // Update account balances via RPC
      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: inventoryAcct.id, p_debit: totalCost, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: creditAcctId, p_debit: 0, p_credit: totalCost }),
      ])

      // ─── Create the voucher ─────────────────────────────────────────────
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref,
        type: 'purchase',
        posting_date: form.date,
        due_date: isCredit && form.dueDate ? form.dueDate : null,
        description: `Purchase — ${supplierName}${form.invoiceRef ? ` — Inv ${form.invoiceRef}` : ''}`,
        total_amount: totalCost,
        payment_method: form.paymentMode === 'credit' ? 'On Account' : form.paymentMode === 'cash' ? 'Cash' : form.paymentMode === 'bank' ? 'Bank' : 'M-Pesa',
        status: 'posted',
        supplier_id: form.supplier,
        journal_id: journal.id,
        notes: form.notes,
        posted_by: user.full_name,
      }).select('id').single()
      if (vErr || !voucher) throw new Error(vErr?.message || 'Voucher insert failed')

      // ─── Stock + ledger ─────────────────────────────────────────────────
      const selectedLoc = locations.find(l => l.code === form.location_code)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId)
        if (!prod) continue

        // Weighted average cost
        const newQty = prod.qty_on_hand + line.qty
        const newAvgCost = newQty > 0
          ? ((prod.qty_on_hand * prod.cost_price) + (line.qty * line.unitCost)) / newQty
          : line.unitCost

        await supabase.from('products')
          .update({ qty_on_hand: newQty, cost_price: newAvgCost })
          .eq('id', line.productId)

        await postLedgerEntry({
          product_id: line.productId,
          entry_type: 'purchase',
          document_type: 'purchase',
          document_ref: form.ref,
          posting_date: form.date,
          qty: line.qty,
          cost_amount: line.amount,
          location: selectedLoc || null,
        })

        // Mirror into product_locations
        if (selectedLoc) {
          const { data: pl } = await supabase.from('product_locations')
            .select('qty_on_hand').eq('product_id', line.productId).eq('location_id', selectedLoc.id).maybeSingle()
          const newLocQty = (pl?.qty_on_hand ?? 0) + line.qty
          await supabase.from('product_locations').upsert(
            { product_id: line.productId, location_id: selectedLoc.id, location_code: selectedLoc.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' }
          )
        }

        await supabase.from('voucher_lines').insert({
          voucher_id: voucher.id,
          line_number: i + 1,
          product_id: line.productId,
          description: line.description,
          qty: line.qty,
          unit_cost: line.unitCost,
          subtotal: line.amount,
          total: line.amount,
        })
      }

      // ─── Supplier-side accounting ────────────────────────────────────────
      if (isCredit) {
        // Credit purchase: increase supplier balance + create open AP entry
        if (supplierObj) {
          await supabase.from('suppliers')
            .update({ balance_tzs: (supplierObj.balance_tzs || 0) + totalCost })
            .eq('id', form.supplier)
        }
        await supabase.from('vendor_ledger_entries').insert({
          supplier_id: form.supplier,
          posting_date: form.date,
          document_type: 'invoice',
          document_ref: form.ref,
          description: `Purchase — ${supplierName}${form.invoiceRef ? ` (Inv ${form.invoiceRef})` : ''}`,
          amount_tzs: totalCost,
          remaining_amount: totalCost,
          is_open: true,
          due_date: form.dueDate || null,
          journal_id: journal.id,
        })
      } else {
        // Cash/bank purchase: log a closed entry against the supplier so their statement shows the activity
        await supabase.from('vendor_ledger_entries').insert({
          supplier_id: form.supplier,
          posting_date: form.date,
          document_type: 'cash_purchase',
          document_ref: form.ref,
          description: `Cash Purchase — ${supplierName}${form.invoiceRef ? ` (Inv ${form.invoiceRef})` : ''}`,
          amount_tzs: 0,             // No outstanding amount; settled at point of purchase
          remaining_amount: 0,
          is_open: false,
          journal_id: journal.id,
        })
      }

      showToast(
        isCredit
          ? `${form.ref} posted · Stock added · Supplier balance updated · Dr Inventory / Cr AP`
          : `${form.ref} posted · Stock added · Paid immediately · Dr Inventory / Cr ${form.paymentMode === 'cash' ? 'Cash' : 'Bank'}`
      )
      clearDraft()
      setTimeout(() => onNav('vouchers'), 1200)

    } catch (err: any) {
      showToast(err.message || 'Something went wrong', 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage
      title="Purchase Voucher"
      icon=""
      subtitle="One-shot — stock + supplier liability in one entry"
      color="rgba(133,194,190,.12)"
      onPost={post}
      postLabel={posting ? 'Posting…' : (form.paymentMode === 'credit' ? 'Post on Account' : 'Post & Pay')}
      journalNote={
        form.paymentMode === 'credit'
          ? 'Dr Inventory (1110) · Cr Accounts Payable (2010) · Stock updated immediately · Open AP entry created'
          : `Dr Inventory (1110) · Cr ${form.paymentMode === 'cash' ? 'Cash' : 'Bank'} · Stock updated immediately · No open AP`
      }
    >
      {availableDraft && draftAgeMs !== null && (
        <DraftBanner draftAgeMs={draftAgeMs} onResume={resumeDraft} onDiscard={discardDraft} />
      )}

      <div className="form-row">
        <FG label="Ref">
          <input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }} />
        </FG>
        <FG label="Date" req>
          <input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} />
        </FG>
        <FG label="Receive at Location" req>
          <select
            className="form-input"
            value={form.location_code}
            onChange={e => set('location_code', e.target.value)}
            disabled={userLoc.isLocked}
            title={userLoc.isLocked ? `Locked to ${userLoc.defaultLocationCode}` : ''}
          >
            {locations.map(l => {
              const isMine = !userLoc.isLocked || userLoc.defaultLocationCode === l.code
              return (
                <option key={l.id} value={l.code} disabled={!isMine}>
                  {l.code} — {l.name}{!isMine ? ' (not assigned)' : ''}
                </option>
              )
            })}
          </select>
        </FG>
      </div>

      <div className="form-row">
        <FG label="Supplier" req>
          <select className="form-input" value={form.supplier} onChange={e => set('supplier', e.target.value)}>
            <option value="">— Select supplier —</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.balance_tzs > 0 ? ` (owes TZS ${s.balance_tzs.toLocaleString()})` : ''}
              </option>
            ))}
          </select>
        </FG>
        <FG label="Supplier Invoice #">
          <input className="form-input" value={form.invoiceRef} onChange={e => set('invoiceRef', e.target.value)} placeholder="Optional" />
        </FG>
      </div>

      {/* Payment mode toggle */}
      <div style={{ marginTop: 14, marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Payment</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([
            { key: 'credit' as PaymentMode, label: 'On Account', sub: 'Pay later' },
            { key: 'cash' as PaymentMode, label: 'Cash', sub: 'Petty cash / on hand' },
            { key: 'bank' as PaymentMode, label: 'Bank', sub: 'Bank transfer' },
            { key: 'mpesa' as PaymentMode, label: 'M-Pesa', sub: 'Mobile money' },
          ]).map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => set('paymentMode', opt.key)}
              style={{
                flex: '1 1 140px',
                background: form.paymentMode === opt.key ? 'var(--accent-dim)' : 'var(--surface)',
                border: `1px solid ${form.paymentMode === opt.key ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--r)',
                padding: '10px 14px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: form.paymentMode === opt.key ? 'var(--accent)' : 'var(--text)' }}>{opt.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{opt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Conditional fields based on payment mode */}
      {form.paymentMode === 'credit' && (
        <div className="form-row" style={{ marginTop: 14 }}>
          <FG label="Due Date">
            <input type="date" className="form-input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
          </FG>
        </div>
      )}
      {form.paymentMode !== 'credit' && (
        <div className="form-row" style={{ marginTop: 14 }}>
          <FG label="Pay From" req>
            <select className="form-input" value={form.payAccount} onChange={e => set('payAccount', e.target.value)}>
              <option value="">— Select account —</option>
              {bankCashAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </FG>
        </div>
      )}

      {/* Product lines */}
      <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Items Purchased</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}>+ Add line</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Description</th>
                <th style={{ width: 80, textAlign: 'right' }}>Qty</th>
                <th style={{ width: 130, textAlign: 'right' }}>Unit Cost</th>
                <th style={{ width: 140, textAlign: 'right' }}>Subtotal</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <select className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                      <option value="">— Select —</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.sku} — {p.name} (in stock: {p.qty_on_hand})</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Item description" />
                  </td>
                  <td>
                    <input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }} value={line.qty} min={1} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
                  </td>
                  <td>
                    <input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }} value={line.unitCost} min={0} step="0.01" onChange={e => updateLine(i, 'unitCost', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>
                    {Math.round(line.amount).toLocaleString()}
                  </td>
                  <td>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--surface2)' }}>
                <td colSpan={4} style={{ fontWeight: 700, padding: '10px 14px' }}>Total Purchase Value</td>
                <td className="td-right td-mono" style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', padding: '10px 14px' }}>{tzs(totalCost)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <FG label="Notes">
        <textarea className="form-input" rows={2} style={{ resize: 'none' }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional — delivery notes, batch info, etc." />
      </FG>

      {/* What this voucher does — explainer */}
      <div style={{ background: 'rgba(133,194,190,.05)', border: '1px solid rgba(133,194,190,.15)', borderRadius: 'var(--r)', padding: '12px 14px', marginTop: 14, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4, fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>What this does</div>
        <div>Stock enters your inventory immediately at the unit cost shown. Average cost recalculated automatically.</div>
        {form.paymentMode === 'credit'
          ? <div>Supplier balance increases by the total — settle later via Payment Voucher or Bank Transfer.</div>
          : <div>Money leaves the selected account at posting — no separate payment voucher needed.</div>
        }
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
