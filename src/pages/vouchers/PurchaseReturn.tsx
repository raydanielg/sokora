import { insertJournalWithRetry } from '../../lib/refs'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { today, tzs } from '../../lib/utils'
import { postLedgerEntry } from '../../lib/itemLedger'
import { useUserLocation } from '../../lib/useUserLocation'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface ReturnLine { productId: string; qty: number; costPrice: number; amount: number }
interface StockLoc { id: string; code: string; name: string }

export default function PurchaseReturn({ onNav }: Props) {
  const userLoc = useUserLocation()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<{id:string;name:string;cost_price:number;qty_on_hand:number}[]>([])
  const [suppliers, setSuppliers] = useState<{id:string;name:string}[]>([])
  const [locations, setLocations] = useState<StockLoc[]>([])
  const [lines, setLines] = useState<ReturnLine[]>([{ productId: '', qty: 1, costPrice: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), ref: '', supplierId: '', originalGrn: '', reason: 'defective', locationCode: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const [{ data: prods }, { data: sups }, { data: locs }] = await Promise.all([
      supabase.from('products').select('id, name, cost_price, qty_on_hand').eq('is_active', true).order('name'),
      supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
      supabase.from('stock_locations').select('id, code, name').eq('is_active', true).order('code'),
    ])
    if (prods) setProducts(prods)
    if (sups) setSuppliers(sups)
    if (locs && locs.length > 0) {
      setLocations(locs)
      // Locked users get their location; otherwise prefer the godown.
      const defaultLoc =
        (userLoc.defaultLocationCode && locs.find(l => l.code === userLoc.defaultLocationCode)) ||
        locs.find(l => l.code === '1002' || /warehouse|godown/i.test(l.name)) ||
        locs[0]
      setForm(f => ({ ...f, locationCode: defaultLoc.code }))
    }
  }

  const updateLine = (i: number, field: keyof ReturnLine, val: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) { nl[i].costPrice = p.cost_price; nl[i].amount = nl[i].qty * p.cost_price }
    }
    if (field === 'qty') nl[i].amount = (val as number) * nl[i].costPrice
    setLines(nl)
  }

  const total = lines.reduce((s, l) => s + l.amount, 0)
  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!form.supplierId) { showToast('Select a supplier', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Add at least one product', 'error'); return }
    // Defence in depth: locked users cannot return stock from another location.
    if (!userLoc.canPostFrom(form.locationCode)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}. You cannot return stock from ${form.locationCode}.`, 'error')
      return
    }
    setPosting(true)
    try {
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', ['2010', '1110'])
      const apId = acctData?.find(a => a.code === '2010')?.id
      const inventoryId = acctData?.find(a => a.code === '1110')?.id
      if (!apId || !inventoryId) throw new Error('AP (2010) or Inventory (1110) account not found')

      const supplier = suppliers.find(s => s.id === form.supplierId)
      const { data: jRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Purchase Return — ${supplier?.name} — ${form.ref}`,
        journal_type: 'purchase_return', source_type: 'purchase_return', source_ref: form.ref,
        posted_by: 'Joe Gembe', status: 'posted',
      })  
      if (jErr || !jRaw) throw new Error(jErr?.message || "Journal insert failed")
      const j = jRaw

      const jLines = [
        { journal_id: j.id, line_number: 1, account_id: apId, description: `AP reduced — ${supplier?.name}`, debit: total, credit: 0 },
        { journal_id: j.id, line_number: 2, account_id: inventoryId, description: `Inventory returned — ${form.ref}`, debit: 0, credit: total },
      ]
      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error(jlErr.message)

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: apId, p_debit: total, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: inventoryId, p_debit: 0, p_credit: total }),
      ])

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'purchase_return', posting_date: form.date,
        description: `Purchase Return — ${supplier?.name}`,
        total_amount: total, status: 'posted', journal_id: j.id,
        supplier_id: form.supplierId, notes: form.reason + (form.originalGrn ? ' · GRN: ' + form.originalGrn : ''),
        posted_by: 'Joe Gembe',
      })

      // Reduce stock
      const selectedLoc = locations.find(l => l.code === form.locationCode)
      for (const line of lines) {
        if (!line.productId || !line.qty) continue
        const prod = products.find(p => p.id === line.productId)
        if (!prod) continue
        await supabase.from('products').update({ qty_on_hand: Math.max(0, prod.qty_on_hand - line.qty) }).eq('id', line.productId)
        await postLedgerEntry({
          product_id: line.productId, entry_type: 'purchase_return',
          document_type: 'purchase_return', document_ref: form.ref,
          posting_date: form.date, qty: -line.qty, cost_amount: line.costPrice * line.qty,
          location: selectedLoc || null,
        })
        // Mirror the outbound return into product_locations
        if (selectedLoc) {
          const { data: pl } = await supabase.from('product_locations')
            .select('qty_on_hand').eq('product_id', line.productId).eq('location_id', selectedLoc.id).maybeSingle()
          const newLocQty = Math.max(0, (pl?.qty_on_hand ?? 0) - line.qty)
          await supabase.from('product_locations').upsert(
            { product_id: line.productId, location_id: selectedLoc.id, location_code: selectedLoc.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' }
          )
        }
      }

      showToast(`${form.ref} posted · Dr AP (2010) / Cr Inventory (1110) · ${tzs(total)}`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  return (
    <VoucherPage title="Purchase Return" icon="" subtitle="Return goods to supplier — reduces AP and stock" color="rgba(168,85,247,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Post Return'}
      journalNote="Dr AP Suppliers (2010) · Cr Inventory (1110) · Stock reduced · Supplier balance reduced">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Return Ref" req><input className="form-input" value={form.ref} readOnly  /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        <div className="form-row">
          <FG label="Supplier" req>
            <select className="form-input" value={form.supplierId} onChange={e => set('supplierId', e.target.value)}>
              <option value="">— Select supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FG>
          <FG label="Original GRN Ref"><input className="form-input" value={form.originalGrn} onChange={e => set('originalGrn', e.target.value)} placeholder="GRN-0019" /></FG>
          <FG label="Source Location" req>
            <select
              className="form-input"
              value={form.locationCode}
              onChange={e => set('locationCode', e.target.value)}
              disabled={userLoc.isLocked}
              title={userLoc.isLocked ? `Locked to ${userLoc.defaultLocationCode}` : ''}
            >
              {locations.length === 0 && <option value="">— Loading —</option>}
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
        <FG label="Return Reason">
          <select className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)}>
            <option value="defective">Defective / Not as described</option>
            <option value="wrong">Wrong items sent</option>
            <option value="overdelivery">Over-delivery</option>
            <option value="damaged">Damaged in transit</option>
          </select>
        </FG>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Items to Return</div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 130px auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
              <option value="">— Select product —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} · Stock: {p.qty_on_hand}</option>)}
            </select>
            <input type="number" className="form-input" style={{ textAlign: 'center' }} min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)' }}>{tzs(line.amount)}</div>
            {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', qty: 1, costPrice: 0, amount: 0 }])}>+ Add item</button>
        {total > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
            <span>Return Total</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{tzs(total)}</span>
          </div>
        )}
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
