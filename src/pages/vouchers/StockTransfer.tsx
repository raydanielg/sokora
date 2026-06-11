import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import { postLedgerEntries } from '../../lib/itemLedger'
import { useAuth } from '../../lib/useAuth'
import { useUserLocation } from '../../lib/useUserLocation'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface TxLine { productId: string; qty: number; cost: number }
interface StockLocation { id: string; code: string; name: string; branch_code: string }

export default function StockTransfer({ onNav }: Props) {
  const { user } = useAuth()
  const userLoc = useUserLocation()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<{id:string;name:string;cost_price:number;qty_on_hand:number}[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [fromLocStocks, setFromLocStocks] = useState<Record<string, number>>({})
  const [lines, setLines] = useState<TxLine[]>([{ productId: '', qty: 1, cost: 0 }])
  const [form, setForm] = useState({ date: today(), ref: '', fromLocation: '', toLocation: '', notes: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadData() }, [])

  // Reload per-location stock whenever the source location changes
  useEffect(() => {
    const loadFromLocStock = async () => {
      if (!form.fromLocation) { setFromLocStocks({}); return }
      const { data } = await supabase
        .from('product_locations')
        .select('product_id, qty_on_hand')
        .eq('location_code', form.fromLocation)
      const map: Record<string, number> = {}
      ;(data || []).forEach((r: any) => { map[r.product_id] = r.qty_on_hand || 0 })
      setFromLocStocks(map)
    }
    loadFromLocStock()
  }, [form.fromLocation])

  const loadData = async () => {
    const [{ data: prods }, { data: locs }] = await Promise.all([
      supabase.from('products').select('id, name, cost_price, qty_on_hand').eq('is_active', true).order('name'),
      supabase.from('stock_locations').select('id, code, name, branch_code').eq('is_active', true).order('code'),
    ])
    if (prods) setProducts(prods)
    // Use nextRef from refs.ts — handles count internally with fallback
    const stpRef = await nextRef('stock_transfer')
    if (locs && locs.length > 0) {
      setLocations(locs)
      // Locked users get their own location forced as the source. The
      // destination defaults to a different location (or stays equal — the
      // form will prompt them to change it). Unrestricted users see the
      // first two locations as a sensible default pair.
      const defaultFrom = userLoc.defaultLocationCode && locs.find(l => l.code === userLoc.defaultLocationCode)
        ? userLoc.defaultLocationCode
        : locs[0].code
      const defaultTo = locs.find(l => l.code !== defaultFrom)?.code ?? defaultFrom
      setForm(f => ({ ...f, ref: stpRef, fromLocation: defaultFrom, toLocation: defaultTo }))
    } else {
      setForm(f => ({ ...f, ref: stpRef }))
    }
  }

  const updateLine = (i: number, field: keyof TxLine, val: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) nl[i].cost = p.cost_price
    }
    setLines(nl)
  }

  const totalValue = lines.reduce((s, l) => s + l.qty * l.cost, 0)
  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }
  const fromLoc = locations.find(l => l.code === form.fromLocation)
  const toLoc = locations.find(l => l.code === form.toLocation)

  const post = async () => {
    if (!form.fromLocation || !form.toLocation) { showToast('Select From and To locations', 'error'); return }
    if (form.fromLocation === form.toLocation) { showToast('From and To locations cannot be the same', 'error'); return }
    if (lines.every(l => !l.productId || !l.qty)) { showToast('Add at least one product', 'error'); return }
    if (!fromLoc || !toLoc) { showToast('Invalid locations', 'error'); return }
    if (!user) { showToast('You must be signed in', 'error'); return }
    // Defence in depth: locked users can only transfer OUT of their own
    // location. To pull stock FROM somewhere else they must use the Transfer
    // Request flow (which an approver at that source will execute).
    if (!userLoc.canTransferFrom(form.fromLocation)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}. To pull stock from ${form.fromLocation}, use Stock Transfer Request instead.`, 'error')
      // Helpful nav: send them to the Request page directly.
      setTimeout(() => onNav('stock-transfer-request'), 1500)
      return
    }
    setPosting(true)
    try {
      const fromLabel = `${fromLoc.code} — ${fromLoc.name}`
      const toLabel = `${toLoc.code} — ${toLoc.name}`

      // ─── PRE-FLIGHT STOCK CHECK (BEFORE any insert) ───────────────────
      // Validate every line against actual qty AT THE FROM-LOCATION (not global qty).
      // If ANY line fails, abort the whole post — no journal, no voucher, no ledger.
      const validLines = lines.filter(l => l.productId && l.qty)
      const productIds = validLines.map(l => l.productId)

      const { data: freshProducts } = await supabase
        .from('products')
        .select('id, name, cost_price')
        .in('id', productIds)
      if (!freshProducts || freshProducts.length !== productIds.length) {
        throw new Error('Could not load product data — try again')
      }
      const prodById: Record<string, { id: string; name: string; cost_price: number }> = {}
      freshProducts.forEach((p: any) => { prodById[p.id] = p })

      const { data: fromLocStock } = await supabase
        .from('product_locations')
        .select('product_id, qty_on_hand')
        .in('product_id', productIds)
        .eq('location_code', fromLoc.code)
      const fromQtyByProduct: Record<string, number> = {}
      ;(fromLocStock || []).forEach((row: any) => { fromQtyByProduct[row.product_id] = row.qty_on_hand || 0 })

      // Aggregate quantities per product (in case the same product appears on multiple lines)
      const requestedByProduct: Record<string, number> = {}
      validLines.forEach(l => {
        requestedByProduct[l.productId] = (requestedByProduct[l.productId] || 0) + l.qty
      })

      // Validate every product's available stock at from-location
      const insufficientItems: string[] = []
      for (const productId of Object.keys(requestedByProduct)) {
        const requested = requestedByProduct[productId]
        const available = fromQtyByProduct[productId] || 0
        if (available < requested) {
          const name = prodById[productId]?.name || productId
          insufficientItems.push(`${name} (need ${requested}, have ${available} at ${fromLoc.code})`)
        }
      }
      if (insufficientItems.length > 0) {
        showToast(`Insufficient stock at ${fromLoc.code}: ${insufficientItems.join(' · ')}`, 'error')
        setPosting(false)
        return
      }

      // ─── ALL CHECKS PASSED — safe to post ────────────────────────────
      const { data: jRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Stock Transfer — ${fromLabel} → ${toLabel} — ${form.ref}`,
        journal_type: 'stock_transfer', source_type: 'stock_transfer', source_ref: form.ref,
        posted_by: user.full_name, status: 'posted',
      })
      if (jErr || !jRaw) throw new Error(jErr?.message || 'Journal insert failed')
      const j = jRaw

      const { error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'stock_transfer', posting_date: form.date,
        description: `Stock Transfer — ${fromLabel} → ${toLabel}`,
        total_amount: totalValue, status: 'posted', journal_id: j.id,
        notes: `${fromLabel} → ${toLabel}${form.notes ? ' · ' + form.notes : ''}`,
        posted_by: user.full_name,
      })
      if (vErr) throw new Error('Voucher insert failed: ' + vErr.message)

      for (const line of validLines) {
        const prod = prodById[line.productId]
        if (!prod) continue
        const result = await postLedgerEntries([
          {
            product_id: line.productId, entry_type: 'transfer_out',
            document_type: 'stock_transfer', document_ref: form.ref,
            posting_date: form.date, qty: -line.qty,
            cost_amount: (prod.cost_price || 0) * line.qty,
            location: fromLoc,
          },
          {
            product_id: line.productId, entry_type: 'transfer_in',
            document_type: 'stock_transfer', document_ref: form.ref,
            posting_date: form.date, qty: line.qty,
            cost_amount: (prod.cost_price || 0) * line.qty,
            location: toLoc,
          },
        ])
        if (!result.success) console.error('item_ledger_entries error:', result.error)

        // Update product_locations using values fetched at the start (fresh enough)
        const fromQtyBefore = fromQtyByProduct[line.productId] || 0
        const fromQty = Math.max(0, fromQtyBefore - line.qty)
        // Subtract from local cache so subsequent lines for the same product don't double-count
        fromQtyByProduct[line.productId] = fromQty

        const { data: toPL } = await supabase.from('product_locations').select('qty_on_hand').eq('product_id', line.productId).eq('location_code', toLoc.code).maybeSingle()
        const toQty = (toPL?.qty_on_hand || 0) + line.qty

        await supabase.from('product_locations').upsert(
          { product_id: line.productId, location_id: fromLoc.id, location_code: fromLoc.code, qty_on_hand: fromQty, last_updated: new Date().toISOString() },
          { onConflict: 'product_id,location_id' }
        )
        await supabase.from('product_locations').upsert(
          { product_id: line.productId, location_id: toLoc.id, location_code: toLoc.code, qty_on_hand: toQty, last_updated: new Date().toISOString() },
          { onConflict: 'product_id,location_id' }
        )
        // Total stock unchanged — no update to products.qty_on_hand needed
      }
      showToast(`${form.ref} posted · ${fromLabel} → ${toLabel} · ${tzs(totalValue)}`)
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  return (
    <VoucherPage title="Stock Transfer" icon="" subtitle="Move stock between locations — total inventory unchanged" color="rgba(61,139,255,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Confirm Transfer'}
      journalNote="Item ledger updated · Location balances updated · Total stock unchanged">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref"><input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        {/* For locked users: explain that this page is for OUTBOUND transfers
            from their own location only. To pull stock IN from elsewhere they
            must use the Transfer Request flow (which an approver at the source
            executes for them). The banner doubles as a nav shortcut. */}
        {userLoc.isLocked && (
          <div style={{ background: '#3d8bff14', border: '1px solid #3d8bff44', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
              You are locked to <strong style={{ color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{userLoc.defaultLocationCode}</strong>. You can only transfer stock OUT to other locations. To pull stock IN from another location, request a transfer.
            </div>
            <button
              onClick={() => onNav('stock-transfer-request')}
              style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              Request Stock In
            </button>
          </div>
        )}
        <div className="form-row">
          <FG label="From Location" req>
            <select
              className="form-input"
              value={form.fromLocation}
              onChange={e => set('fromLocation', e.target.value)}
              disabled={userLoc.isLocked}
              title={userLoc.isLocked ? `Locked to ${userLoc.defaultLocationCode} — locked users cannot pick another source. Use Transfer Request to pull stock from elsewhere.` : ''}
            >
              <option value="">— Select source —</option>
              {locations.map(l => {
                const isMine = !userLoc.isLocked || userLoc.defaultLocationCode === l.code
                return (
                  <option key={l.id} value={l.code} disabled={!isMine}>
                    {l.code} — {l.name}{!isMine ? ' (use Transfer Request)' : ''}
                  </option>
                )
              })}
            </select>
          </FG>
          <FG label="To Location" req>
            <select className="form-input" value={form.toLocation} onChange={e => set('toLocation', e.target.value)}>
              <option value="">— Select destination —</option>
              {locations.map(l => <option key={l.id} value={l.code}>{l.code} — {l.name}</option>)}
            </select>
          </FG>
        </div>
        {fromLoc && toLoc && form.fromLocation !== form.toLocation && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 4 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{fromLoc.code}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fromLoc.name}</div>
            </div>
            <svg width="32" height="16" viewBox="0 0 32 16" fill="none"><path d="M0 8h28M22 2l8 6-8 6" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round"/></svg>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{toLoc.code}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{toLoc.name}</div>
            </div>
          </div>
        )}
        {form.fromLocation === form.toLocation && form.fromLocation && (
          <div style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'var(--mono)' }}>From and To cannot be the same location</div>
        )}
        <FG label="Notes"><input className="form-input" placeholder="e.g. Restocking front office from warehouse" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Items to Transfer</div>
        {lines.map((line, i) => {
          const atSource = line.productId ? (fromLocStocks[line.productId] ?? 0) : null
          const overLimit = atSource != null && line.qty > atSource
          return (
            <div key={i}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 8, marginBottom: overLimit ? 4 : 8, alignItems: 'center' }}>
                <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                  <option value="">— Select product —</option>
                  {products.map(p => {
                    const a = fromLocStocks[p.id] ?? 0
                    const total = p.qty_on_hand
                    const elsewhere = Math.max(0, total - a)
                    const elsewhereNote = elsewhere > 0 ? ` (${elsewhere} at other locations)` : ''
                    return (
                      <option key={p.id} value={p.id} disabled={a <= 0}>
                        {p.name} · {a} at {form.fromLocation || 'source'}{elsewhereNote}
                      </option>
                    )
                  })}
                </select>
                <input type="number" className="form-input" style={{ textAlign: 'center', borderColor: overLimit ? 'var(--red)' : undefined }} min={1} max={atSource ?? undefined} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
                {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>}
              </div>
              {overLimit && (
                <div style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'var(--mono)', marginBottom: 8, paddingLeft: 4 }}>
                  Only {atSource} available at {form.fromLocation} — reduce qty
                </div>
              )}
            </div>
          )
        })}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', qty: 1, cost: 0 }])}>+ Add item</button>
        {totalValue > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
            <span style={{ color: 'var(--text3)' }}>Transfer value at cost</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{tzs(totalValue)}</span>
          </div>
        )}
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
