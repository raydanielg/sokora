import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import { useCategories } from '../lib/useCategories'
import CategoryFilter, { makeCategoryPredicate } from '../components/CategoryFilter'

interface PurchaseRecord { ref: string; type: string; posting_date: string; description: string; total_amount: number; status: string; supplier_name: string; notes: string; categories: string[]; posted_by?: string }

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

export default function PurchaseRegister() {
  const [records, setRecords] = useState<PurchaseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0])
  const [typeFilter, setTypeFilter] = useState('all')
  const [filterCat, setFilterCat] = useState('all')
  const { categories } = useCategories()

  useEffect(() => { load() }, [])

  const load = async (from?: string, to?: string) => {
    const f = from || fromDate
    const t = to || toDate
    setLoading(true)
    const { data } = await supabase.from('vouchers')
      .select('ref, type, posting_date, posted_by, description, total_amount, status, notes, suppliers(name), voucher_lines(products(category))')
      .in('type', ['purchase_order', 'grn', 'purchase_invoice', 'purchase_return'])
      .gte('posting_date', f).lte('posting_date', t)
      .order('posting_date', { ascending: false })
    if (data) {
      setRecords(data.map((v: any) => ({
        ...v,
        supplier_name: v.suppliers?.name || '—',
        posted_by: v.posted_by || '—',
        categories: [...new Set((v.voucher_lines || []).map((l: any) => l.products?.category).filter(Boolean))],
      })))
    }
    setLoading(false)
  }

  const catPredicate = makeCategoryPredicate(filterCat, categories)
  const byType = typeFilter === 'all' ? records : records.filter(r => r.type === typeFilter)
  const filtered = filterCat === 'all' ? byType : byType.filter(r => r.categories.some(c => catPredicate(c)))
  const total = filtered.reduce((s, r) => s + (r.total_amount || 0), 0)

  const exportCSV = () => {
    const rows = [['Date','Ref','Type','Supplier','Description','Amount (TZS)','Status']]
    filtered.forEach(r => rows.push([r.posting_date, r.ref, r.type, `"${r.supplier_name}"`, `"${r.description}"`, String(r.total_amount||0), r.status]))
    rows.push(['TOTAL','','','','',String(total),''])
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=`Purchase_Register_${fromDate}_to_${toDate}.csv`; a.click()
  }

  const TYPE_LABEL: Record<string,string> = { purchase_order:'Purchase Order', grn:'GRN', purchase_invoice:'Purchase Invoice', purchase_return:'Purchase Return' }
  const TYPE_COLOR: Record<string,string> = { purchase_order:'pill-gray', grn:'pill-amber', purchase_invoice:'pill-blue', purchase_return:'pill-red' }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Purchase Register</div><div className="page-sub">All purchase transactions · <span className="sync-dot"></span> Live</div></div>
        <div className="page-actions">
          <div style={{ display:'flex',alignItems:'center',gap:6,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'5px 10px' }}>
            <input type="date" className="form-input" style={{ fontSize:11,padding:'3px 4px',border:'none',background:'transparent',width:120 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span style={{ fontSize:11,color:'var(--text3)' }}>to</span>
            <input type="date" className="form-input" style={{ fontSize:11,padding:'3px 4px',border:'none',background:'transparent',width:120 }} value={toDate} onChange={e => setToDate(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={() => load()}>Load</button>
          </div>
          <select className="form-input" style={{ fontSize:12,padding:'6px 10px' }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="purchase_order">Purchase Orders</option>
            <option value="grn">GRNs</option>
            <option value="purchase_invoice">Purchase Invoices</option>
            <option value="purchase_return">Purchase Returns</option>
          </select>
          <CategoryFilter value={filterCat} onChange={setFilterCat} style={{ fontSize:12, padding:'6px 10px' }} />
          <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => load()}><Ic n="refresh" /> Refresh</button>
          <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={exportCSV}><Ic n="csv" /> Export CSV</button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom:20 }}>
        <div className="stat-card blue"><div className="stat-label">Total Purchases</div><div className="stat-value">{filtered.length}</div></div>
        <div className="stat-card amber"><div className="stat-label">Total Value</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(total)}</div></div>
        <div className="stat-card green"><div className="stat-label">GRNs</div><div className="stat-value">{filtered.filter(r=>r.type==='grn').length}</div></div>
        <div className="stat-card red"><div className="stat-label">Returns</div><div className="stat-value">{filtered.filter(r=>r.type==='purchase_return').length}</div></div>
      </div>

      {loading ? <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading…</div> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Ref</th><th>Type</th><th>Supplier</th><th>Description</th><th className="td-right">Amount (TZS)</th><th>Posted By</th><th>Status</th></tr></thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i}>
                    <td className="td-mono" style={{ fontSize:11,color:'var(--text3)' }}>{r.posting_date}</td>
                    <td className="td-mono td-amber" style={{ fontSize:11 }}>{r.ref}</td>
                    <td><span className={`pill ${TYPE_COLOR[r.type]||'pill-gray'}`} style={{ fontSize:9 }}>{TYPE_LABEL[r.type]||r.type}</span></td>
                    <td style={{ fontSize:12 }}>{r.supplier_name}</td>
                    <td style={{ fontSize:11,color:'var(--text3)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.description}</td>
                    <td className="td-right td-mono" style={{ fontSize:12,fontWeight:600,color:'var(--accent)' }}>{(r.total_amount||0).toLocaleString()}</td>
                    <td style={{ fontSize:11,color:'var(--text3)' }}>{r.posted_by||'—'}</td>
                    <td><span className={`pill ${r.status==='posted'?'pill-green':'pill-gray'}`} style={{ fontSize:9 }}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'var(--surface2)',fontWeight:800 }}>
                  <td colSpan={5} style={{ padding:'12px 14px',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',color:'var(--text3)' }}>TOTALS — {filtered.length} records</td>
                  <td className="td-right td-mono" style={{ color:'var(--accent)',fontSize:14,padding:'12px 14px',fontWeight:800 }}>{tzs(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
