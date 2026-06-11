import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import { useCategories } from '../lib/useCategories'
import { useUserLocation } from '../lib/useUserLocation'
import CategoryFilter, { makeCategoryPredicate } from '../components/CategoryFilter'

interface TransferRecord {
  ref: string; posting_date: string; description: string
  total_amount: number; status: string; notes: string
  from_location: string; to_location: string
  categories: string[]; posted_by?: string
}

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'csv')     return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  if (n === 'arrow')   return <svg {...p}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

// Parse from/to location from notes field — format: "1001 — Front Office → 1002 — Warehouse / Godown"
const parseLocations = (notes: string) => {
  if (!notes) return { from: '—', to: '—' }
  const parts = notes.split(' → ')
  if (parts.length >= 2) {
    return { from: parts[0].trim(), to: parts[1].split('·')[0].trim() }
  }
  return { from: notes.slice(0, 30), to: '—' }
}

export default function StockTransferRegister() {
  const userLoc = useUserLocation()
  const [records, setRecords] = useState<TransferRecord[]>([])
  const [loading, setLoading] = useState(true)
  // Default to start of the current year (not current month) so the register
  // shows transfer history by default instead of hiding it behind a 1-day window.
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0])
  const [locFilter, setLocFilter] = useState('all')
  const [filterCat, setFilterCat] = useState('all')
  const [locations, setLocations] = useState<{code:string;name:string}[]>([])
  const { categories } = useCategories()

  useEffect(() => {
    load()
    supabase.from('stock_locations').select('code,name').eq('is_active', true).order('code')
      .then(({ data }) => {
        if (data) {
          setLocations(data)
          // Locked users default to filtering by their assigned location.
          // Reports stay global by default per Joe's design call, but stock
          // transfer history is genuinely location-scoped so a sensible
          // default helps. The user can flip to 'all' anytime.
          if (userLoc.defaultLocationCode && data.find((l: any) => l.code === userLoc.defaultLocationCode)) {
            setLocFilter(userLoc.defaultLocationCode)
          }
        }
      })
  }, [userLoc.defaultLocationCode])

  const load = async (from?: string, to?: string) => {
    const f = from || fromDate
    const t = to || toDate
    setLoading(true)
    const { data } = await supabase.from('vouchers')
      .select('ref, posted_by, posting_date, description, total_amount, status, notes, voucher_lines(products(category))')
      .eq('type', 'stock_transfer')
      .gte('posting_date', f)
      .lte('posting_date', t)
      .order('posting_date', { ascending: false })
    if (data) {
      setRecords(data.map((v: any) => {
        const locs = parseLocations(v.notes || '')
        return {
          ...v,
          from_location: locs.from,
          to_location: locs.to,
          categories: [...new Set((v.voucher_lines || []).map((l: any) => l.products?.category).filter(Boolean))],
        }
      }))
    }
    setLoading(false)
  }

  const catPredicate = makeCategoryPredicate(filterCat, categories)
  const byLoc = locFilter === 'all'
    ? records
    : records.filter(r => r.from_location.includes(locFilter) || r.to_location.includes(locFilter))
  const filtered = filterCat === 'all' ? byLoc : byLoc.filter(r => r.categories.some(c => catPredicate(c)))

  const totalValue = filtered.reduce((s, r) => s + (r.total_amount || 0), 0)
  const uniqueFroms = [...new Set(records.map(r => r.from_location))]
  const uniqueTos = [...new Set(records.map(r => r.to_location))]

  const exportCSV = () => {
    const rows = [['Date', 'Ref', 'From Location', 'To Location', 'Description', 'Value at Cost (TZS)', 'Status']]
    filtered.forEach(r => rows.push([
      r.posting_date, r.ref,
      `"${r.from_location}"`, `"${r.to_location}"`,
      `"${r.description}"`,
      String(r.total_amount || 0), r.status
    ]))
    rows.push(['TOTAL', '', '', '', '', String(totalValue), ''])
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `Stock_Transfer_Register_${fromDate}_to_${toDate}.csv`
    a.click()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Stock Transfer Register</div>
          <div className="page-sub">All stock movements between locations · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <div style={{ display:'flex',alignItems:'center',gap:6,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'5px 10px' }}>
            <input type="date" className="form-input" style={{ fontSize:11,padding:'3px 4px',border:'none',background:'transparent',width:120 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span style={{ fontSize:11,color:'var(--text3)' }}>to</span>
            <input type="date" className="form-input" style={{ fontSize:11,padding:'3px 4px',border:'none',background:'transparent',width:120 }} value={toDate} onChange={e => setToDate(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={() => load()}>Load</button>
          </div>
          {[
            { label: 'Today', f: new Date().toISOString().split('T')[0], t: new Date().toISOString().split('T')[0] },
            { label: 'This Week', f: new Date(Date.now()-6*86400000).toISOString().split('T')[0], t: new Date().toISOString().split('T')[0] },
            { label: 'This Month', f: new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().split('T')[0], t: new Date().toISOString().split('T')[0] },
          ].map(p => (
            <button key={p.label} className="btn btn-ghost btn-sm" onClick={() => { setFromDate(p.f); setToDate(p.t); load(p.f, p.t) }}>{p.label}</button>
          ))}
          <select className="form-input" style={{ fontSize:12,padding:'6px 10px' }} value={locFilter} onChange={e => setLocFilter(e.target.value)}>
            <option value="all">All Locations</option>
            {locations.map(l => <option key={l.code} value={l.code}>{l.code} — {l.name}</option>)}
          </select>
          <CategoryFilter value={filterCat} onChange={setFilterCat} style={{ fontSize:12, padding:'6px 10px' }} />
          <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => load()}><Ic n="refresh" /> Refresh</button>
          <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={exportCSV}><Ic n="csv" /> CSV</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid g4" style={{ marginBottom:20 }}>
        <div className="stat-card blue">
          <div className="stat-label">Total Transfers</div>
          <div className="stat-value">{filtered.length}</div>
          <div className="stat-change">{fromDate} to {toDate}</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">Total Value Moved</div>
          <div className="stat-value" style={{ fontSize:18 }}>{tzs(totalValue)}</div>
          <div className="stat-change">At cost price</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Unique From Locations</div>
          <div className="stat-value">{uniqueFroms.length}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Unique To Locations</div>
          <div className="stat-value">{uniqueTos.length}</div>
        </div>
      </div>

      {loading ? <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading…</div> : (
        <div className="card">
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>No stock transfers found for this period.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Ref</th>
                    <th>From</th>
                    <th style={{ width:24 }}></th>
                    <th>To</th>
                    <th>Description</th>
                    <th className="td-right">Value at Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={i}>
                      <td className="td-mono" style={{ fontSize:11,color:'var(--text3)' }}>{r.posting_date}</td>
                      <td className="td-mono td-amber" style={{ fontSize:11,fontWeight:700 }}>{r.ref}</td>
                      <td>
                        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                          <span style={{ fontFamily:'var(--mono)',fontSize:10,fontWeight:800,color:'var(--accent)',background:'var(--accent-dim)',padding:'1px 6px',borderRadius:4 }}>
                            {r.from_location.split(' — ')[0]}
                          </span>
                          <span style={{ fontSize:11,color:'var(--text3)' }}>{r.from_location.split(' — ')[1] || ''}</span>
                        </div>
                      </td>
                      <td style={{ textAlign:'center' }}>
                        <Ic n="arrow" s={12} c="var(--blue)" />
                      </td>
                      <td>
                        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                          <span style={{ fontFamily:'var(--mono)',fontSize:10,fontWeight:800,color:'var(--green)',background:'rgba(0,229,160,.1)',padding:'1px 6px',borderRadius:4 }}>
                            {r.to_location.split(' — ')[0]}
                          </span>
                          <span style={{ fontSize:11,color:'var(--text3)' }}>{r.to_location.split(' — ')[1] || ''}</span>
                        </div>
                      </td>
                      <td style={{ fontSize:11,color:'var(--text3)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.description}</td>
                      <td className="td-right td-mono" style={{ fontSize:12,fontWeight:600,color:'var(--accent)' }}>{(r.total_amount||0).toLocaleString()}</td>
                      <td style={{ fontSize:11,color:'var(--text3)' }}>{r.posted_by||'—'}</td>
                    <td><span className={`pill ${r.status==='posted'?'pill-green':'pill-gray'}`} style={{ fontSize:9 }}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:'var(--surface2)',fontWeight:800 }}>
                    <td colSpan={6} style={{ padding:'12px 14px',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',color:'var(--text3)' }}>
                      TOTAL — {filtered.length} transfers
                    </td>
                    <td className="td-right td-mono" style={{ color:'var(--accent)',fontSize:14,padding:'12px 14px',fontWeight:800 }}>{tzs(totalValue)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
