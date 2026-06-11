import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { getStatus, tzs } from '../lib/utils'
import { useCategories } from '../lib/useCategories'
import CategoryFilter from '../components/CategoryFilter'
import { makeCategoryPredicate } from '../components/CategoryFilter'
import { useUserLocation } from '../lib/useUserLocation'
import { useAuth } from '../lib/useAuth'
import { exportStockReportPDF } from '../lib/stockReportExport'
import type { Page } from '../lib/types'

interface DBProduct {
  id: string; sku: string; name: string; category: string
  cost_price: number; selling_price: number; qty_on_hand: number
  reorder_point: number; unit: string; is_active: boolean
}

interface StockLocation { id: string; code: string; name: string; branch_code: string }

interface ItemLedgerEntry {
  id: string; entry_type: string; document_type: string; document_ref: string
  posting_date: string; qty: number; cost_amount: number
  location_id: string | null
  location_code: string    // derived from stock_locations join
  location?: string
  debit_account?: string; credit_account?: string
}

const UNITS = ['Piece', 'Pack', 'Bottle', 'Tube', 'Box', 'Set']
const EMPTY_FORM = { sku: '', name: '', category: '', unit: 'Piece', cost_price: '', selling_price: '', qty_on_hand: '0', reorder_point: '10' }

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'edit')    return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  if (n === 'ledger')  return <svg {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
  if (n === 'plus')    return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  if (n === 'back')    return <svg {...p}><polyline points="15 18 9 12 15 6"/></svg>
  if (n === 'in')      return <svg {...p}><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>
  if (n === 'out')     return <svg {...p}><polyline points="8 7 12 3 16 7"/><line x1="12" y1="3" x2="12" y2="15"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>
  if (n === 'filter')  return <svg {...p}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
  if (n === 'loc')     return <svg {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
  if (n === 'printer') return <svg {...p}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const ENTRY_TYPE_LABELS: Record<string, { label: string; color: string; dr: string; cr: string }> = {
  sale:            { label: 'Sale',          color: 'var(--red)',    dr: 'COGS (5010)',      cr: 'Inventory (1110)' },
  purchase:        { label: 'Purchase',      color: 'var(--green)',  dr: 'Inventory (1110)', cr: 'GRN Interim (1121)' },
  grn:             { label: 'GRN',           color: 'var(--green)',  dr: 'Inventory (1110)', cr: 'GRN Interim (1121)' },
  return:          { label: 'Sales Return',  color: 'var(--blue)',   dr: 'Inventory (1110)', cr: 'COGS (5010)' },
  purchase_return: { label: 'Purch Return',  color: 'var(--accent)', dr: 'AP (2010)',         cr: 'Inventory (1110)' },
  adjustment:      { label: 'Adjustment',    color: 'var(--yellow)', dr: 'Stock Loss (5080)', cr: 'Inventory (1110)' },
  opening_stock:   { label: 'Opening Stock', color: 'var(--green)',  dr: 'Inventory (1110)', cr: 'Equity (3040)' },
  transfer_in:     { label: 'Transfer In',   color: 'var(--blue)',   dr: 'Inventory (dest)', cr: 'Inventory (src)' },
  transfer_out:    { label: 'Transfer Out',  color: 'var(--accent)', dr: 'Inventory (dest)', cr: 'Inventory (src)' },
}

export default function Inventory({ onNav }: { onNav?: (p: Page) => void }) {
  const userLoc = useUserLocation()
  const { user } = useAuth()
  const [products, setProducts] = useState<DBProduct[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterLoc, setFilterLoc] = useState('all')
  const [sortBy, setSortBy] = useState<'name'|'qty'|'value'|'margin'>('name')
  const [loading, setLoading] = useState(true)
  const { categories, catNames, addCategory } = useCategories()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [newCategory, setNewCategory] = useState('')

  // Views: list | ledger | edit
  const [view, setView] = useState<'list'|'ledger'|'edit'>('list')
  const [selectedProduct, setSelectedProduct] = useState<DBProduct | null>(null)
  const [ledgerEntries, setLedgerEntries] = useState<ItemLedgerEntry[]>([])
  const [loadingLedger, setLoadingLedger] = useState(false)
  const [ledgerLocFilter, setLedgerLocFilter] = useState('all')

  // Edit form
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadProducts(); loadLocations() }, [])

  const [productLocations, setProductLocations] = useState<Record<string, Record<string, number>>>({})

  const loadProducts = async () => {
    setLoading(true)
    const [{ data }, { data: plData }] = await Promise.all([
      supabase.from('products')
        .select('id, sku, name, category, cost_price, selling_price, qty_on_hand, reorder_point, unit, is_active')
        .eq('is_active', true).order('name'),
      supabase.from('product_locations')
        .select('product_id, location_code, qty_on_hand')
    ])
    if (data) setProducts(data)
    // Build product→location→qty map
    if (plData) {
      const map: Record<string, Record<string, number>> = {}
      plData.forEach((pl: any) => {
        if (!map[pl.product_id]) map[pl.product_id] = {}
        map[pl.product_id][pl.location_code] = pl.qty_on_hand
      })
      setProductLocations(map)
    }
    setLoading(false)
  }

  const loadLocations = async () => {
    const { data } = await supabase.from('stock_locations').select('id, code, name, branch_code').eq('is_active', true).order('code')
    if (data) {
      setLocations(data)
      // Locked users default to viewing their own location's stock first.
      // They can switch to "All Locations" via the dropdown to view summaries
      // from elsewhere — they just can't post against another location.
      if (userLoc.defaultLocationCode && data.find((l: any) => l.code === userLoc.defaultLocationCode)) {
        setFilterLoc(userLoc.defaultLocationCode)
      }
    }
  }

  const openLedger = async (p: DBProduct) => {
    setSelectedProduct(p)
    setView('ledger')
    setLoadingLedger(true)
    const { data } = await supabase.from('item_ledger_entries')
      .select('id, entry_type, document_type, document_ref, posting_date, qty, cost_amount, location_id, stock_locations(code)')
      .eq('product_id', p.id)
      .order('posting_date', { ascending: false })
    if (data) {
      const mapped = data.map((e: any) => {
        const code = e.stock_locations?.code || ''
        return {
          id: e.id, entry_type: e.entry_type, document_type: e.document_type,
          document_ref: e.document_ref, posting_date: e.posting_date,
          qty: e.qty, cost_amount: e.cost_amount, location_id: e.location_id,
          location_code: code, location: code,
        } as ItemLedgerEntry
      })
      setLedgerEntries(mapped)
    }
    setLoadingLedger(false)
  }

  const openEdit = (p: DBProduct) => {
    setSelectedProduct(p)
    setForm({
      sku: p.sku, name: p.name, category: p.category, unit: p.unit,
      cost_price: p.cost_price.toString(), selling_price: p.selling_price.toString(),
      qty_on_hand: p.qty_on_hand.toString(), reorder_point: p.reorder_point.toString(),
    })
    setView('edit')
  }

  const openAdd = () => {
    setSelectedProduct(null)
    setForm(EMPTY_FORM)
    setView('edit')
  }

  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  const save = async () => {
    if (!form.sku.trim()) { showToast('SKU is required', 'error'); return }
    if (!form.name.trim()) { showToast('Product name is required', 'error'); return }
    if (!form.cost_price || !form.selling_price) { showToast('Cost and selling price required', 'error'); return }
    
    // Get category - use newCategory if entered, otherwise form.category
    let categoryName = form.category === '__new__' ? newCategory.trim() : form.category
    if (!categoryName) { showToast('Category is required', 'error'); return }
    
    setSaving(true)
    
    // Auto-add new category if it doesn't exist
    if (form.category === '__new__' && newCategory.trim() && !catNames.includes(newCategory.trim())) {
      await addCategory(newCategory.trim())
    }
    
    const payload = {
      sku: form.sku.trim().toUpperCase(), name: form.name.trim(),
      category: categoryName, unit: form.unit,
      cost_price: parseFloat(form.cost_price), selling_price: parseFloat(form.selling_price),
      qty_on_hand: parseFloat(form.qty_on_hand) || 0,
      reorder_point: parseFloat(form.reorder_point) || 10,
      costing_method: 'average', is_active: true,
    }
    try {
      if (selectedProduct) {
        const { error } = await supabase.from('products').update(payload).eq('id', selectedProduct.id)
        if (error) throw new Error(error.message)
        showToast(`${form.name} updated`)
      } else {
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw new Error(error.message)
        showToast(`${form.name} added to inventory`)
      }
      setNewCategory('')
      setView('list'); loadProducts()
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error')
    } finally { setSaving(false) }
  }

  const deactivate = async (p: DBProduct) => {
    if (!confirm(`Remove ${p.name} from active inventory?`)) return
    await supabase.from('products').update({ is_active: false }).eq('id', p.id)
    showToast(`${p.name} removed`)
    loadProducts()
  }

  // Compute the qty for a product given the current location filter.
  // Centralised so filter, sort, and render all use exactly the same value.
  // Number() coercion is defensive — if Supabase ever returns a string, we
  // don't want it slipping through into rendering or comparisons.
  const getEffectiveQty = (productId: string, globalQty: number): number => {
    if (filterLoc === 'all') return Number(globalQty) || 0
    const loc = productLocations[productId]?.[filterLoc]
    return loc == null ? 0 : (Number(loc) || 0)
  }

  // Sum across all locations for a product (used for data-integrity check)
  const getLocationSum = (productId: string): number => {
    const locs = productLocations[productId]
    if (!locs) return 0
    return Object.values(locs).reduce((s, q) => s + (Number(q) || 0), 0)
  }

  // Filtering
  // When a specific location is selected, "Out of Stock" / "Low" reflects
  // the qty AT THAT LOCATION (not the global qty across all warehouses).
  // Important: a product with NO row at the selected location is treated as
  // "not stocked here" and excluded from results — NOT shown as Out of Stock.
  // Out of Stock means: there's an explicit zero at the selected location.
  const filtered = products
    .filter(p => {
      const hasRowAtLoc = filterLoc !== 'all' && productLocations[p.id]?.[filterLoc] !== undefined
      const effectiveQty = getEffectiveQty(p.id, p.qty_on_hand)
      const s = getStatus(effectiveQty, p.reorder_point)
      if (filterCat !== 'all' && !makeCategoryPredicate(filterCat, categories)(p.category)) return false

      if (filterLoc !== 'all') {
        // At a specific location: hide products not stocked here at all
        if (!hasRowAtLoc) return false
      }

      if (filterStatus === 'out' && effectiveQty > 0) return false
      if (filterStatus === 'low' && (effectiveQty === 0 || s === 'ok')) return false
      if (filterStatus === 'ok' && s !== 'ok') return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      const qa = getEffectiveQty(a.id, a.qty_on_hand)
      const qb = getEffectiveQty(b.id, b.qty_on_hand)
      if (sortBy === 'qty') return qb - qa
      if (sortBy === 'value') return (b.cost_price * qb) - (a.cost_price * qa)
      if (sortBy === 'margin') return ((b.selling_price - b.cost_price)/b.selling_price) - ((a.selling_price - a.cost_price)/a.selling_price)
      return a.name.localeCompare(b.name)
    })

  const totalValue = products.reduce((s, p) => s + p.cost_price * p.qty_on_hand, 0)
  const lowStock = products.filter(p => getStatus(p.qty_on_hand, p.reorder_point) !== 'ok').length
  const colors: Record<string, string> = { ok: 'var(--green)', low: 'var(--yellow)', critical: 'var(--red)' }

  // Ledger filtering
  const filteredLedger = ledgerLocFilter === 'all'
    ? ledgerEntries
    : ledgerEntries.filter(e => (e.location_code || e.location) === ledgerLocFilter)

  const totalIn = filteredLedger.filter(e => (e.qty || 0) > 0).reduce((s, e) => s + Math.abs(e.qty || 0), 0)
  const totalOut = filteredLedger.filter(e => (e.qty || 0) < 0).reduce((s, e) => s + Math.abs(e.qty || 0), 0)

  // ── Print stock summary ─────────────────────────────────────────────
  // Same shared exporter used by the Stock Valuation Report, but here
  // we deliberately OMIT cost / selling / value / revenue / margin so
  // the printout focuses on stock levels. Reasoning: the Inventory page
  // is used by warehouse staff and operators day-to-day; finance data
  // belongs on the Stock Valuation Report instead. If they need that
  // view, the dedicated finance report has it.
  const exportPDF = () => {
    const locName = filterLoc === 'all'
      ? 'All locations'
      : (locations.find(l => l.code === filterLoc)?.name || filterLoc)
    const catName = filterCat === 'all'
      ? 'All categories'
      : (categories.find(c => c.name === filterCat)?.name || filterCat)
    const statusLabel = filterStatus === 'all' ? 'All' : filterStatus === 'out' ? 'Out of stock only' : filterStatus === 'low' ? 'Low stock only' : 'Healthy stock only'
    exportStockReportPDF(
      filtered.map(p => ({
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        qty_on_hand: getEffectiveQty(p.id, p.qty_on_hand),
        reorder_point: p.reorder_point,
        // intentionally NOT passing cost/selling/value/revenue/margin —
        // the exporter hides those columns when undefined.
      })),
      {
        reportType: 'inventory',
        title: 'Stock Summary',
        asAt: new Date().toISOString().split('T')[0],
        filters: [
          { label: 'Location', value: locName },
          { label: 'Category', value: catName },
          { label: 'Status', value: statusLabel },
          ...(search ? [{ label: 'Search', value: search }] : []),
        ],
        generatedBy: user?.full_name,
      }
    )
  }

  // ── EDIT VIEW ───────────────────────────────────────────────────────────
  if (view === 'edit') {
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setView('list')}>
              <Ic n="back" /> Inventory
            </button>
            <div style={{ width: 1, height: 24, background: 'var(--border)' }}></div>
            <div className="page-title">{selectedProduct ? `Edit — ${selectedProduct.name}` : 'Add New Product'}</div>
          </div>
          <div className="page-actions">
            <button className="btn btn-ghost" onClick={() => setView('list')}>Cancel</button>
            {selectedProduct && (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => { deactivate(selectedProduct); setView('list') }}>
                Deactivate
              </button>
            )}
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : selectedProduct ? 'Save Changes' : 'Add Product'}</button>
          </div>
        </div>

        <div className="grid g2" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Product Details</div>
            <div className="form-row">
              <FG label="SKU" req><input className="form-input" placeholder="e.g. MK-009" value={form.sku} onChange={e => setF('sku', e.target.value)} /></FG>
              <FG label="Unit"><select className="form-input" value={form.unit} onChange={e => setF('unit', e.target.value)}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></FG>
            </div>
            <FG label="Product Name" req><input className="form-input" placeholder="e.g. Maternity Support Belt" value={form.name} onChange={e => setF('name', e.target.value)} /></FG>
            <FG label="Category" req>
              <select className="form-input" value={form.category} onChange={e => { setF('category', e.target.value); if (e.target.value !== '__new__') setNewCategory('') }}>
                <option value="">-- Select category --</option>
                {catNames.map(c => <option key={c}>{c}</option>)}
                <option value="__new__">+ Add new category...</option>
              </select>
              {(form.category === '__new__' || newCategory) && (
                <input 
                  className="form-input" 
                  style={{ marginTop: 8 }} 
                  placeholder="Enter new category name" 
                  value={newCategory} 
                  onChange={e => setNewCategory(e.target.value)} 
                  autoFocus 
                />
              )}
            </FG>
            <div className="form-row">
              <FG label="Cost Price (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={form.cost_price} onChange={e => setF('cost_price', e.target.value)} /></FG>
              <FG label="Selling Price (TZS)" req><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={form.selling_price} onChange={e => setF('selling_price', e.target.value)} /></FG>
            </div>
            <div className="form-row">
              <FG label="Qty on Hand"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={form.qty_on_hand} onChange={e => setF('qty_on_hand', e.target.value)} /></FG>
              <FG label="Reorder Point"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="10" value={form.reorder_point} onChange={e => setF('reorder_point', e.target.value)} /></FG>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {form.cost_price && form.selling_price && parseFloat(form.selling_price) > 0 && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 14 }}>Pricing Analysis</div>
                {[
                  { label: 'Gross Margin', val: `${Math.round(((parseFloat(form.selling_price) - parseFloat(form.cost_price)) / parseFloat(form.selling_price)) * 100)}%`, color: 'var(--green)' },
                  { label: 'Markup', val: tzs(parseFloat(form.selling_price) - parseFloat(form.cost_price)), color: 'var(--accent)' },
                  { label: 'Stock Value', val: tzs(parseFloat(form.cost_price) * parseFloat(form.qty_on_hand || '0')), color: 'var(--blue)' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{item.label}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: item.color }}>{item.val}</span>
                  </div>
                ))}
              </div>
            )}
            {selectedProduct && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Stock by Location</div>
                {locations.map(loc => (
                  <div key={loc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', marginRight: 6 }}>{loc.code}</span>
                      {loc.name}
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 600 }}>{(productLocations[selectedProduct?.id || '']?.[loc.code] ?? '—')} pcs</span>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { if (selectedProduct) openLedger(selectedProduct) }}>
                  <Ic n="ledger" s={12} /> View Stock Movements
                </button>
              </div>
            )}
          </div>
        </div>
        {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
      </div>
    )
  }

  // ── LEDGER VIEW ─────────────────────────────────────────────────────────
  if (view === 'ledger' && selectedProduct) {
    const p = selectedProduct
    const margin = p.selling_price > 0 ? Math.round(((p.selling_price - p.cost_price) / p.selling_price) * 100) : 0
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setView('list')}>
              <Ic n="back" /> Inventory
            </button>
            <div style={{ width: 1, height: 24, background: 'var(--border)' }}></div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{p.sku}</span>
                <div className="page-title" style={{ margin: 0 }}>{p.name}</div>
              </div>
              <div className="page-sub">Stock Movement Ledger · {ledgerEntries.length} entries</div>
            </div>
          </div>
          <div className="page-actions">
            <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => openEdit(p)}>
              <Ic n="edit" s={13} /> Edit Product
            </button>
          </div>
        </div>

        {/* Product summary banner */}
        <div style={{ background: 'linear-gradient(135deg, rgba(10,10,10,1) 0%, rgba(25,25,25,1) 100%)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 14, padding: '18px 24px', marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          {[
            { label: 'On Hand', val: `${p.qty_on_hand} ${p.unit}s`, color: p.qty_on_hand === 0 ? 'var(--red)' : p.qty_on_hand <= p.reorder_point ? 'var(--yellow)' : 'var(--green)' },
            { label: 'Cost Price', val: tzs(p.cost_price), color: 'var(--text)' },
            { label: 'Selling Price', val: tzs(p.selling_price), color: 'var(--text)' },
            { label: 'Margin', val: `${margin}%`, color: margin >= 40 ? 'var(--green)' : margin >= 20 ? 'var(--yellow)' : 'var(--red)' },
            { label: 'Stock Value', val: tzs(p.cost_price * p.qty_on_hand), color: 'var(--blue)' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: item.color }}>{item.val}</div>
            </div>
          ))}
        </div>

        {/* Period summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          <div className="stat-card green"><div className="stat-label">Total In</div><div className="stat-value">{totalIn}</div><div className="stat-change">{filteredLedger.filter(e=>(e.qty||0)>0).length} entries</div></div>
          <div className="stat-card red"><div className="stat-label">Total Out</div><div className="stat-value">{totalOut}</div><div className="stat-change">{filteredLedger.filter(e=>(e.qty||0)<0).length} entries</div></div>
          <div className="stat-card blue"><div className="stat-label">Net Movement</div><div className="stat-value">{totalIn - totalOut}</div><div className="stat-change">units</div></div>
          <div className="stat-card amber"><div className="stat-label">Cost Moved</div><div className="stat-value" style={{ fontSize: 16 }}>{tzs(filteredLedger.reduce((s,e)=>s+Math.abs(e.cost_amount||0),0))}</div></div>
        </div>

        {/* Location + type filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text3)' }}>
            <Ic n="loc" s={12} /> Location:
          </div>
          {['all', ...locations.map(l => l.code)].map(code => (
            <button key={code} className={`btn btn-ghost btn-sm ${ledgerLocFilter === code ? 'active' : ''}`}
              style={{ background: ledgerLocFilter === code ? 'var(--accent)' : 'transparent', color: ledgerLocFilter === code ? '#fff' : 'var(--text3)' }}
              onClick={() => setLedgerLocFilter(code)}>
              {code === 'all' ? 'All Locations' : `${code} — ${locations.find(l => l.code === code)?.name || code}`}
            </button>
          ))}
        </div>

        {/* Ledger table */}
        <div className="card">
          {loadingLedger ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading movements…</div>
          ) : filteredLedger.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No stock movements found.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Document Ref</th><th>Type</th><th>Location</th>
                    <th className="td-right">Qty In</th><th className="td-right">Qty Out</th>
                    <th>Debit Account</th><th>Credit Account</th><th className="td-right">Cost Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedger.map((e, i) => {
                    const info = ENTRY_TYPE_LABELS[e.entry_type] || { label: e.entry_type, color: 'var(--text3)', dr: '—', cr: '—' }
                    const isIn = (e.qty || 0) > 0
                    const locCode = e.location_code || e.location || '—'
                    const locName = locations.find(l => l.code === locCode)?.name || locCode
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.012)' }}>
                        <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{e.posting_date}</td>
                        <td className="td-mono td-amber" style={{ fontSize: 11 }}>{e.document_ref}</td>
                        <td><span className="pill pill-gray" style={{ fontSize: 9, color: info.color, background: `${info.color}15` }}>{info.label}</span></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', background: 'var(--surface2)', padding: '1px 5px', borderRadius: 3 }}>{locCode}</span>
                            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{locName}</span>
                          </div>
                        </td>
                        <td className="td-right td-mono" style={{ color: 'var(--green)', fontWeight: isIn ? 700 : 400, fontSize: 13 }}>
                          {isIn ? `+${Math.abs(e.qty || 0)}` : '—'}
                        </td>
                        <td className="td-right td-mono" style={{ color: 'var(--red)', fontWeight: !isIn ? 700 : 400, fontSize: 13 }}>
                          {!isIn ? `-${Math.abs(e.qty || 0)}` : '—'}
                        </td>
                        <td style={{ fontSize: 10, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{info.dr}</td>
                        <td style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'var(--mono)' }}>{info.cr}</td>
                        <td className="td-right td-mono" style={{ fontSize: 12 }}>{(e.cost_amount || 0).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
      </div>
    )
  }

  // ── LIST VIEW ───────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Inventory</div>
          <div className="page-sub">{products.length} products · {locations.length} locations · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={loadProducts}><Ic n="refresh" /> Refresh</button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ display:'flex',alignItems:'center',gap:6 }}
            onClick={exportPDF}
            disabled={filtered.length === 0}
            title={filtered.length === 0 ? 'No items in the current filter' : 'Open print dialog — choose Save as PDF or send to printer'}
          >
            <Ic n="printer" /> Print Stock Summary
          </button>
          <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={openAdd}><Ic n="plus" s={13} /> Add Product</button>
        </div>
      </div>

      {/* SHORTCUTS */}
      {onNav && (
        <div className="shortcut-bar">
          {[
            { icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', label: 'Cash Sale', page: 'cash-sale' as Page },
            { icon: 'M1 3h15v13H1zM16 8h7v13H8v-5', label: 'GRN', page: 'grn' as Page },
            { icon: 'M18 20V10M12 20V4M6 20v-6', label: 'Stock Valuation', page: 'stock-valuation' as Page },
            { icon: 'M16 3h5v5M4 20L21 3M21 16v5h-5M4 4l17 17', label: 'Stock Transfer', page: 'stock-transfer' as Page },
            { icon: 'M12 3v18M3 12h18 M5 8l3 4-3 4 M19 8l-3 4 3 4', label: 'Stock Adjustment', page: 'stock-adjustment' as Page },
            { icon: 'M2 20h20 M5 20V9l7-6 7 6v11 M10 20v-6h4v6', label: 'Import Order', page: 'import-order' as Page },
          ].map((s, i) => (
            <button key={i} className="shortcut-btn" onClick={() => onNav(s.page)}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d={s.icon}/></svg>
              {s.label}
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card blue"><div className="stat-label">Total Products</div><div className="stat-value">{products.length}</div><div className="stat-change up">Active SKUs</div></div>
        <div className="stat-card green"><div className="stat-label">Stock Value</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(totalValue)}</div><div className="stat-change up">At cost</div></div>
        <div className="stat-card yellow"><div className="stat-label">Low / Critical</div><div className="stat-value">{lowStock}</div><div className="stat-change down">Reorder soon</div></div>
        <div className="stat-card red"><div className="stat-label">Out of Stock</div><div className="stat-value">{products.filter(p => p.qty_on_hand === 0).length}</div><div className="stat-change down">Action needed</div></div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 260 }}>
          <input className="form-input" style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 12 }} placeholder="Search SKU or name…" value={search} onChange={e => setSearch(e.target.value)} />
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }}><Ic n="filter" s={12} c="var(--text3)" /></span>
        </div>
        <CategoryFilter value={filterCat} onChange={setFilterCat} style={{ width: 180 }} />
        <select className="form-input" style={{ fontSize: 12, padding: '7px 10px', width: filterLoc !== 'all' ? 200 : 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">{filterLoc === 'all' ? 'All Status' : `All at ${filterLoc}`}</option>
          <option value="ok">{filterLoc === 'all' ? 'In Stock' : `In Stock at ${filterLoc}`}</option>
          <option value="low">{filterLoc === 'all' ? 'Low Stock' : `Low at ${filterLoc}`}</option>
          <option value="out">{filterLoc === 'all' ? 'Out of Stock' : `Out at ${filterLoc}`}</option>
        </select>
        <select className="form-input" style={{ fontSize: 12, padding: '7px 10px', width: 150 }} value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
          <option value="all">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.code}>{l.code} — {l.name}</option>)}
        </select>
        <select className="form-input" style={{ fontSize: 12, padding: '7px 10px', width: 130 }} value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
          <option value="name">Sort: Name</option>
          <option value="qty">Sort: Qty</option>
          <option value="value">Sort: Value</option>
          <option value="margin">Sort: Margin</option>
        </select>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>
          {filtered.length} of {products.length} shown
          {filterLoc !== 'all' && (
            <div style={{ fontSize: 9, marginTop: 2, color: 'var(--text3)' }}>
              At {filterLoc} only · global qty may differ
            </div>
          )}
        </div>
      </div>

      {/* Product table */}
      <div className="card">
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, fontFamily: 'var(--mono)' }}>
          Click row → stock movements · Edit button → edit product
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading products…</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th><th>Product Name</th><th>Category</th><th>Unit</th>
                  <th className="td-right">Qty</th><th className="td-right">Reorder</th>
                  <th className="td-right">Cost</th><th className="td-right">Price</th>
                  <th className="td-right">Margin</th><th className="td-right">Value</th>
                  <th>Level</th><th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const effectiveQty = getEffectiveQty(p.id, p.qty_on_hand)
                  const locSum = getLocationSum(p.id)
                  const hasLocations = Object.keys(productLocations[p.id] || {}).length > 0
                  // Data sync mismatch: global qty doesn't equal sum of all location qtys.
                  // This usually means a stock movement updated one but not the other
                  // (e.g. legacy data, an old voucher, or an interrupted transfer).
                  const syncMismatch = hasLocations && Math.abs(p.qty_on_hand - locSum) > 0.01
                  const s = getStatus(effectiveQty, p.reorder_point)
                  const pct = Math.min(100, Math.round((effectiveQty / (p.reorder_point * 2)) * 100))
                  const margin = p.selling_price > 0 ? Math.round(((p.selling_price - p.cost_price) / p.selling_price) * 100) : 0
                  return (
                    <tr key={i} style={{ cursor: 'pointer' }}
                      onClick={() => openLedger(p)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td className="td-mono td-amber">{p.sku}</td>
                      <td className="td-bold">
                        {p.name}
                        {syncMismatch && (
                          <span title={`Data mismatch — Global qty: ${p.qty_on_hand}, Sum at locations: ${locSum}. Stock movement may have updated one record but not the other.`} style={{ marginLeft: 6, fontSize: 9, color: 'var(--yellow)', fontFamily: 'var(--mono)', cursor: 'help' }}>⚠ SYNC</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{p.category}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{p.unit}</td>
                      <td className="td-right td-mono" style={{ color: colors[s], fontWeight: 700 }}>
                        {effectiveQty}
                        {filterLoc === 'all' && hasLocations && (
                          <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 1 }}>
                            {Object.entries(productLocations[p.id] || {}).map(([code, qty]) => `${code}:${qty}`).join(' · ')}
                          </div>
                        )}
                        {filterLoc !== 'all' && (
                          <div style={{ fontSize: 8, color: p.qty_on_hand !== effectiveQty ? 'var(--yellow)' : 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 1 }}>
                            global: {p.qty_on_hand}
                          </div>
                        )}
                      </td>
                      <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{p.reorder_point}</td>
                      <td className="td-right td-mono" style={{ fontSize: 11 }}>{p.cost_price.toLocaleString()}</td>
                      <td className="td-right td-mono" style={{ fontSize: 11 }}>{p.selling_price.toLocaleString()}</td>
                      <td className="td-right td-mono" style={{ color: margin >= 40 ? 'var(--green)' : margin >= 20 ? 'var(--yellow)' : 'var(--red)', fontWeight: 600, fontSize: 12 }}>{margin}%</td>
                      <td className="td-right td-mono" style={{ fontSize: 11 }}>{(p.cost_price * effectiveQty).toLocaleString()}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div className="stock-bar"><div className={`stock-fill ${s}`} style={{ width: `${pct}%` }}></div></div>
                          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: colors[s], textTransform: 'uppercase' }}>{s}</span>
                        </div>
                      </td>
                      <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button onClick={() => openEdit(p)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text3)' }}>
                            <Ic n="edit" s={11} /> Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
