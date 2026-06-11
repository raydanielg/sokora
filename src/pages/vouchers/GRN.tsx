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
import { useUserLocation } from '../../lib/useUserLocation'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBProduct { id: string; sku: string; name: string; cost_price: number; qty_on_hand: number }
interface DBSupplier { id: string; name: string }
interface GRNLine { productId: string; qty: number; unitCost: number; amount: number }

export default function GRN({ onNav }: Props) {
  const userLoc = useUserLocation()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([])
  const [lines, setLines] = useState<GRNLine[]>([{ productId: '', qty: 1, unitCost: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), ref: 'GRN-10-????', supplier: '', poRef: '', receivedBy: 'Joe Gembe', fxRate: '2540', condition: 'good', notes: '', location_code: '1002' })
  const [locations, setLocations] = useState<{id:string;code:string;name:string}[]>([])
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // ─── Draft persistence ─────────────────────────────────────────────────
  type GRNDraft = { form: typeof form; lines: GRNLine[] }
  const {
    availableDraft, draftAgeMs,
    saveDraft, clearDraft, acknowledgeResume, discardDraft,
  } = useVoucherDraft<GRNDraft>('grn', false)

  const resumeDraft = () => {
    if (!availableDraft) return
    setForm(availableDraft.form)
    setLines(availableDraft.lines)
    acknowledgeResume()
  }

  useEffect(() => {
    loadProducts(); loadSuppliers(); loadNextRef()
    supabase.from('stock_locations').select('id,code,name').eq('is_active',true).order('code')
      .then(({data}) => {
        if(data) {
          setLocations(data)
          // Locked users get their assigned location. Unrestricted users
          // default to the goods receiving location (code '1002') if it
          // exists, falling back to the first active location.
          if (userLoc.defaultLocationCode && data.find((l: any) => l.code === userLoc.defaultLocationCode)) {
            set('location_code', userLoc.defaultLocationCode)
          } else {
            const wh = data.find((l: any) => l.code === '1002') || data[0]
            if (wh) set('location_code', wh.code)
          }
        }
      })
  }, [])

  // Auto-save — skip while ref is still initializing and while truly empty
  useEffect(() => {
    if (!form.ref || form.ref.includes('????')) return
    const hasAnything =
      form.supplier.trim().length > 0 ||
      form.poRef.trim().length > 0 ||
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
    const { data } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name')
    if (data) setSuppliers(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('grn')
    setForm(f => ({ ...f, ref }))
  }

  const updateLine = (i: number, field: keyof GRNLine, val: string | number) => {
    const nl = [...lines]
    nl[i] = { ...nl[i], [field]: val as never }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) { nl[i].unitCost = p.cost_price; nl[i].amount = nl[i].qty * p.cost_price }
    }
    if (field === 'qty' || field === 'unitCost') nl[i].amount = nl[i].qty * nl[i].unitCost
    setLines(nl)
  }

  const totalCost = lines.reduce((s, l) => s + l.amount, 0)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!form.supplier) { showToast('Please select a supplier', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Please add at least one product', 'error'); return }
    // Defence in depth: locked users cannot receive stock into another location.
    if (!userLoc.canPostFrom(form.location_code)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}. You cannot receive stock into ${form.location_code}.`, 'error')
      return
    }
    setPosting(true)

    try {
      // Get account IDs
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', ['1110', '1121'])
      const inventoryAcctId = acctData?.find(a => a.code === '1110')?.id
      const grnInterimAcctId = acctData?.find(a => a.code === '1121')?.id
      if (!inventoryAcctId || !grnInterimAcctId) throw new Error('Inventory accounts not found. Check Chart of Accounts.')

      // Create journal: Dr Inventory / Cr GRN Interim
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref,
        posting_date: form.date,
        description: `GRN — ${suppliers.find(s => s.id === form.supplier)?.name} — ${form.ref}`,
        journal_type: 'grn',
        source_type: 'grn',
        source_ref: form.ref,
        posted_by: form.receivedBy,
        status: 'posted',
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw

      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: inventoryAcctId, description: `Stock received — ${form.ref}`, debit: totalCost, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: grnInterimAcctId, description: `GRN Interim — ${form.ref}`, debit: 0, credit: totalCost },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      // Update account balances
      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: inventoryAcctId, p_debit: totalCost, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: grnInterimAcctId, p_debit: 0, p_credit: totalCost }),
      ])

      // Create voucher
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref,
        type: 'grn',
        posting_date: form.date,
        description: `GRN — ${suppliers.find(s => s.id === form.supplier)?.name}`,
        total_amount: totalCost,
        status: 'posted',
        supplier_id: form.supplier,
        journal_id: journal.id,
        notes: form.notes,
        posted_by: form.receivedBy,
      }).select('id').single()
      if (vErr || !voucher) throw new Error(vErr?.message || 'Voucher insert failed')

      // Update stock quantities and item ledger
      const selectedLoc = locations.find(l => l.code === form.location_code)
      for (const line of lines) {
        if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId)
        if (!prod) continue

        // Recalculate average cost
        const newQty = prod.qty_on_hand + line.qty
        const newAvgCost = ((prod.qty_on_hand * prod.cost_price) + (line.qty * line.unitCost)) / newQty

        await supabase.from('products').update({ qty_on_hand: newQty, cost_price: newAvgCost }).eq('id', line.productId)

        await postLedgerEntry({
          product_id: line.productId,
          entry_type: 'purchase',
          document_type: 'grn',
          document_ref: form.ref,
          posting_date: form.date,
          qty: line.qty,
          cost_amount: line.amount,
          location: selectedLoc || null,
        })

        // Mirror the receipt into product_locations so the warehouse balance reflects GRN
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
          line_number: lines.indexOf(line) + 1,
          product_id: line.productId,
          qty: line.qty,
          unit_cost: line.unitCost,
          subtotal: line.amount,
          total: line.amount,
        })
      }

      showToast(`${form.ref} posted · Dr Inventory / Cr GRN Interim · Stock updated · Avg cost recalculated`)
      clearDraft()
      onNav('vouchers')

    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage title="Goods Received Note (GRN)" icon="" subtitle="Record goods received — updates stock and average cost" color="rgba(251,146,60,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Confirm GRN & Update Stock'}
      journalNote="Dr Inventory (1110) · Cr GRN Interim (1121) · Stock qty increases · Weighted avg cost recalculates">

      {availableDraft && draftAgeMs !== null && (
        <DraftBanner draftAgeMs={draftAgeMs} onResume={resumeDraft} onDiscard={discardDraft} />
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Receipt Details</div>
            <div className="form-row">
              <FG label="GRN Number" req><input className="form-input" value={form.ref} readOnly  /></FG>
              <FG label="Received Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
            </div>
            <FG label="Related PO Reference"><input className="form-input" placeholder="e.g. PO-0022" value={form.poRef} onChange={e => set('poRef', e.target.value)} /></FG>
            <div className="form-row">
              <FG label="FX Rate on Receipt Date"><input className="form-input" placeholder="2540" value={form.fxRate} onChange={e => set('fxRate', e.target.value)} /></FG>
              <FG label="Receive Into Location">
                <select
                  className="form-input"
                  value={form.location_code}
                  onChange={e => setForm(f => ({ ...f, location_code: e.target.value }))}
                  disabled={userLoc.isLocked}
                  title={userLoc.isLocked ? `Locked to ${userLoc.defaultLocationCode}` : ''}
                >
                  {locations.length === 0 && <option value="1002">1002 — Warehouse / Godown</option>}
                  {locations.map(l => {
                    const isMine = !userLoc.isLocked || userLoc.defaultLocationCode === l.code
                    return (
                      <option key={l.code} value={l.code} disabled={!isMine}>
                        {l.code} — {l.name}{!isMine ? ' (not assigned)' : ''}
                      </option>
                    )
                  })}
                </select>
              </FG>
              <FG label="Received By">
                <select className="form-input" value={form.receivedBy} onChange={e => set('receivedBy', e.target.value)}>
                  <option>Joe Gembe</option><option>Jane Mwatonoka</option><option>Lilian Mallya</option>
                </select>
              </FG>
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Supplier & Condition</div>
            <FG label="Supplier" req>
              <select className="form-input" value={form.supplier} onChange={e => set('supplier', e.target.value)}>
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FG>
            <FG label="Goods Condition">
              <select className="form-input" value={form.condition} onChange={e => set('condition', e.target.value)}>
                <option value="good">Good — All items accepted</option>
                <option value="partial">Partial — Some items rejected</option>
                <option value="damaged">Damaged — Return required</option>
              </select>
            </FG>
            <FG label="Notes"><textarea className="form-input" rows={2} style={{ resize: 'none' }} value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Items Received</div>
        <div className="table-wrap" style={{ marginBottom: 8 }}>
          <table>
            <thead><tr><th>Product</th><th style={{ width: 80, textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'right', width: 150 }}>Unit Cost (TZS)</th><th style={{ textAlign: 'right', width: 150 }}>Amount (TZS)</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <select className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                      <option value="">— Select product —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} (Current stock: {p.qty_on_hand})</option>)}
                    </select>
                  </td>
                  <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'center' }} value={line.qty} min={1} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} /></td>
                  <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }} value={line.unitCost} onChange={e => updateLine(i, 'unitCost', parseFloat(e.target.value) || 0)} /></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{line.amount.toLocaleString()}</td>
                  <td><button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', qty: 1, unitCost: 0, amount: 0 }])}>+ Add item</button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, width: 280 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
              <span>Total Received Value</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{tzs(totalCost)}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(212,135,74,.2)', borderRadius: 'var(--r)', padding: 14, fontSize: 11, color: 'var(--accent)', lineHeight: 1.8 }}>
        After posting: Stock qty increases · Weighted avg cost recalculates · GRN Interim (1121) clears when purchase invoice is matched
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
