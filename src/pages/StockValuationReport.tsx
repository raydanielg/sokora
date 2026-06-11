import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import { useCategories } from '../lib/useCategories'
import { useUserLocation } from '../lib/useUserLocation'
import { useAuth } from '../lib/useAuth'
import { exportStockReportPDF } from '../lib/stockReportExport'
import CategoryFilter, { makeCategoryPredicate } from '../components/CategoryFilter'

interface StockItem { id: string; sku: string; name: string; category: string; unit: string; qty_on_hand: number; cost_price: number; selling_price: number; value: number; potential_revenue: number; margin: number }
interface StockLoc { id: string; code: string; name: string }

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'pdf') return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

export default function StockValuationReport() {
  const userLoc = useUserLocation()
  const { user } = useAuth()
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [filterCat, setFilterCat] = useState('all')
  // Location filter — 'all' shows global qty (sum across locations as stored
  // on products.qty_on_hand). Specific code filters to that location's per-
  // product qty using the product_locations table.
  const [filterLoc, setFilterLoc] = useState('all')
  const [locations, setLocations] = useState<StockLoc[]>([])
  // Cache: productId → { locCode → qty }
  const [perLoc, setPerLoc] = useState<Record<string, Record<string, number>>>({})
  const [asAt] = useState(new Date().toISOString().split('T')[0])
  const { categories } = useCategories()

  useEffect(() => { load() }, [])

  // Default the filter to user's locked location once locations are known.
  useEffect(() => {
    if (userLoc.defaultLocationCode && locations.find(l => l.code === userLoc.defaultLocationCode)) {
      setFilterLoc(userLoc.defaultLocationCode)
    }
  }, [userLoc.defaultLocationCode, locations.length])

  const load = async () => {
    setLoading(true)
    const [{ data: prods }, { data: locs }, { data: perLocRows }] = await Promise.all([
      supabase.from('products').select('id, sku, name, category, unit, qty_on_hand, cost_price, selling_price').eq('is_active', true).order('category').order('name'),
      supabase.from('stock_locations').select('id, code, name').eq('is_active', true).order('code'),
      supabase.from('product_locations').select('product_id, location_code, qty_on_hand'),
    ])
    if (locs) setLocations(locs)
    if (perLocRows) {
      const map: Record<string, Record<string, number>> = {}
      perLocRows.forEach((r: any) => {
        if (!map[r.product_id]) map[r.product_id] = {}
        map[r.product_id][r.location_code] = r.qty_on_hand || 0
      })
      setPerLoc(map)
    }
    if (prods) {
      setItems(prods.map(p => ({
        ...p,
        value: p.qty_on_hand * p.cost_price,
        potential_revenue: p.qty_on_hand * p.selling_price,
        margin: p.selling_price > 0 ? Math.round(((p.selling_price - p.cost_price) / p.selling_price) * 100) : 0,
      })))
    }
    setLoading(false)
  }

  // When a location is picked, replace each item's qty / value / revenue
  // with that location's qty. Items not stocked at that location drop out.
  const effectiveItems: StockItem[] = filterLoc === 'all'
    ? items
    : items
        .map(i => {
          const q = perLoc[i.id]?.[filterLoc]
          if (q === undefined) return null  // not stocked here at all → omit
          return {
            ...i,
            qty_on_hand: q,
            value: q * i.cost_price,
            potential_revenue: q * i.selling_price,
          }
        })
        .filter((x): x is StockItem => x !== null)

  const catPredicate = makeCategoryPredicate(filterCat, categories)
  const filtered = filterCat === 'all' ? effectiveItems : effectiveItems.filter(i => catPredicate(i.category))
  const totalValue = filtered.reduce((s, i) => s + i.value, 0)
  const totalRevPotential = filtered.reduce((s, i) => s + i.potential_revenue, 0)
  const totalPotentialGP = totalRevPotential - totalValue
  const avgMargin = filtered.length > 0 ? Math.round(filtered.reduce((s, i) => s + i.margin, 0) / filtered.length) : 0
  const zeroStock = filtered.filter(i => i.qty_on_hand === 0).length
  const lowStock = filtered.filter(i => i.qty_on_hand > 0 && i.qty_on_hand <= 10).length

  const exportCSV = () => {
    const rows = [['SKU','Product','Category','Unit','Qty on Hand','Cost Price','Selling Price','Stock Value (Cost)','Potential Revenue','Margin %']]
    filtered.forEach(i => rows.push([i.sku, `"${i.name}"`, i.category, i.unit, String(i.qty_on_hand), String(i.cost_price), String(i.selling_price), String(i.value), String(i.potential_revenue), String(i.margin)+'%']))
    rows.push(['','TOTALS','','',String(filtered.reduce((s,i)=>s+i.qty_on_hand,0)),'','',String(totalValue),String(totalRevPotential),''])
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=`Stock_Valuation_${asAt}.csv`; a.click()
  }

  // ── PDF / print export ──────────────────────────────────────────────
  // Opens a branded print-ready window with the current filter applied.
  // The user picks paper or PDF from the print dialog. Same module is
  // shared with the Inventory page, but the Valuation variant exposes
  // cost / selling / value / revenue / margin columns since this is a
  // finance-facing report.
  const exportPDF = () => {
    const locName = filterLoc === 'all'
      ? 'All locations'
      : (locations.find(l => l.code === filterLoc)?.name || filterLoc)
    const catName = filterCat === 'all'
      ? 'All categories'
      : (categories.find(c => c.name === filterCat)?.name || filterCat)
    exportStockReportPDF(
      filtered.map(i => ({
        sku: i.sku, name: i.name, category: i.category, unit: i.unit,
        qty_on_hand: i.qty_on_hand,
        cost_price: i.cost_price, selling_price: i.selling_price,
        value: i.value, potential_revenue: i.potential_revenue, margin: i.margin,
      })),
      {
        reportType: 'valuation',
        title: 'Stock Valuation Report',
        asAt,
        filters: [
          { label: 'Location', value: locName },
          { label: 'Category', value: catName },
        ],
        generatedBy: user?.full_name,
      }
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Stock Valuation</div>
          <div className="page-sub">Current inventory at cost · {filtered.length} products · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <CategoryFilter value={filterCat} onChange={setFilterCat} style={{ fontSize: 12, padding: '6px 10px' }} />
          <select
            className="form-input"
            style={{ fontSize: 12, padding: '6px 10px', minWidth: 140 }}
            value={filterLoc}
            onChange={e => setFilterLoc(e.target.value)}
          >
            <option value="all">All Locations</option>
            {locations.map(l => (
              <option key={l.id} value={l.code}>{l.code} — {l.name}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={load}><Ic n="refresh" /> Refresh</button>
          <div style={{ position:'relative' }}>
            <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => setShowExport(!showExport)}><Ic n="pdf" /> Export</button>
            {showExport && (
              <div style={{ position:'absolute',top:'100%',right:0,marginTop:6,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',boxShadow:'0 8px 32px rgba(0,0,0,.4)',zIndex:50,minWidth:210,overflow:'hidden' }}>
                <button onClick={() => { exportPDF(); setShowExport(false) }} style={{ width:'100%',display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'none',border:'none',cursor:'pointer',fontSize:12,borderBottom:'1px solid var(--border)' }} onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}><Ic n="pdf" s={13} c="var(--red)" /> Print / Save as PDF</button>
                <button onClick={() => { exportCSV(); setShowExport(false) }} style={{ width:'100%',display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'none',border:'none',cursor:'pointer',fontSize:12 }} onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}><Ic n="csv" s={13} c="var(--green)" /> Export CSV / Excel</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom:20 }}>
        <div className="stat-card blue"><div className="stat-label">Stock Value (Cost)</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(totalValue)}</div><div className="stat-change">At average cost</div></div>
        <div className="stat-card green"><div className="stat-label">Potential Revenue</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(totalRevPotential)}</div><div className="stat-change">At selling price</div></div>
        <div className="stat-card amber"><div className="stat-label">Potential GP</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(totalPotentialGP)}</div><div className="stat-change">Avg margin {avgMargin}%</div></div>
        <div className="stat-card red"><div className="stat-label">Stock Alerts</div><div className="stat-value">{zeroStock + lowStock}</div><div className="stat-change">{zeroStock} out · {lowStock} low</div></div>
      </div>

      {loading ? <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading…</div> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Unit</th><th className="td-right">Qty</th><th className="td-right">Cost Price</th><th className="td-right">Sell Price</th><th className="td-right">Margin</th><th className="td-right">Stock Value</th><th className="td-right">Rev Potential</th></tr></thead>
              <tbody>
                {filtered.map((item, i) => (
                  <tr key={i} style={{ opacity: item.qty_on_hand === 0 ? 0.5 : 1 }}>
                    <td className="td-mono td-amber" style={{ fontSize:11 }}>{item.sku}</td>
                    <td className="td-bold" style={{ fontSize:12 }}>{item.name}</td>
                    <td style={{ fontSize:11,color:'var(--text3)' }}>{item.category}</td>
                    <td style={{ fontSize:11,color:'var(--text3)' }}>{item.unit}</td>
                    <td className="td-right td-mono" style={{ fontWeight:600,color:item.qty_on_hand===0?'var(--red)':item.qty_on_hand<=10?'var(--yellow)':'var(--green)' }}>{item.qty_on_hand}</td>
                    <td className="td-right td-mono" style={{ fontSize:12 }}>{item.cost_price.toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ fontSize:12 }}>{item.selling_price.toLocaleString()}</td>
                    <td className="td-right" style={{ fontSize:11,fontFamily:'var(--mono)',color:item.margin>=40?'var(--green)':item.margin>=20?'var(--yellow)':'var(--red)',fontWeight:600 }}>{item.margin}%</td>
                    <td className="td-right td-mono" style={{ fontSize:12,fontWeight:600,color:'var(--blue)' }}>{item.value.toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ fontSize:12,color:'var(--green)' }}>{item.potential_revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'var(--surface2)',fontWeight:800 }}>
                  <td colSpan={4} style={{ padding:'12px 14px',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',color:'var(--text3)' }}>TOTALS — {filtered.length} products</td>
                  <td className="td-right td-mono" style={{ padding:'12px 14px' }}>{filtered.reduce((s,i)=>s+i.qty_on_hand,0)}</td>
                  <td></td><td></td><td></td>
                  <td className="td-right td-mono" style={{ color:'var(--blue)',fontSize:14,padding:'12px 14px',fontWeight:800 }}>{tzs(totalValue)}</td>
                  <td className="td-right td-mono" style={{ color:'var(--green)',fontSize:14,padding:'12px 14px',fontWeight:800 }}>{tzs(totalRevPotential)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
