import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'

interface APEntry {
  supplier_id: string; supplier_name: string
  document_ref: string; posting_date: string; due_date: string
  amount: number; remaining_amount: number; days_overdue: number; bucket: string
}

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'pdf') return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const BUCKETS = ['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days']
const BUCKET_COLORS = ['var(--green)', 'var(--yellow)', 'var(--accent)', 'var(--red)', '#8b0000']
const getBucket = (days: number) => days <= 0 ? 'Current' : days <= 30 ? '1-30 Days' : days <= 60 ? '31-60 Days' : days <= 90 ? '61-90 Days' : '90+ Days'

export default function APAgingReport() {
  const [entries, setEntries] = useState<APEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [asAt] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('vendor_ledger_entries')
      .select(`supplier_id, document_ref, posting_date, due_date, amount, remaining_amount, is_open, suppliers(name)`)
      .eq('is_open', true).gt('remaining_amount', 0).order('posting_date', { ascending: true })
    if (data) {
      const today = new Date()
      const parsed: APEntry[] = data.map((e: any) => {
        const due = e.due_date ? new Date(e.due_date) : new Date(e.posting_date)
        const days = Math.floor((today.getTime() - due.getTime()) / 86400000)
        return { supplier_id: e.supplier_id, supplier_name: e.suppliers?.name || 'Unknown', document_ref: e.document_ref, posting_date: e.posting_date, due_date: e.due_date || e.posting_date, amount: e.amount, remaining_amount: e.remaining_amount, days_overdue: days, bucket: getBucket(days) }
      })
      setEntries(parsed)
    }
    setLoading(false)
  }

  const total = entries.reduce((s, e) => s + e.remaining_amount, 0)
  const byBucket = BUCKETS.reduce((g, b) => { g[b] = entries.filter(e => e.bucket === b).reduce((s, e) => s + e.remaining_amount, 0); return g }, {} as Record<string, number>)
  const bySupplier = entries.reduce((g, e) => {
    if (!g[e.supplier_id]) g[e.supplier_id] = { name: e.supplier_name, entries: [], total: 0 }
    g[e.supplier_id].entries.push(e); g[e.supplier_id].total += e.remaining_amount; return g
  }, {} as Record<string, { name: string; entries: APEntry[]; total: number }>)

  const exportCSV = () => {
    const rows = [['Supplier','Document','Invoice Date','Due Date','Days Overdue','Original Amount','Outstanding','Bucket']]
    entries.forEach(e => rows.push([`"${e.supplier_name}"`,e.document_ref,e.posting_date,e.due_date,String(Math.max(0,e.days_overdue)),String(e.amount),String(e.remaining_amount),e.bucket]))
    rows.push(['TOTAL','','','','','',String(total),''])
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=`AP_Aging_${asAt}.csv`; a.click()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">AP Aging Report</div>
          <div className="page-sub">What you owe suppliers · {entries.length} open bills · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={load}><Ic n="refresh" /> Refresh</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => setShowExport(!showExport)}><Ic n="pdf" /> Export</button>
            {showExport && (
              <div style={{ position:'absolute',top:'100%',right:0,marginTop:6,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',boxShadow:'0 8px 32px rgba(0,0,0,.4)',zIndex:50,minWidth:190,overflow:'hidden' }}>
                <button onClick={() => { exportCSV(); setShowExport(false) }} style={{ width:'100%',display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'none',border:'none',cursor:'pointer',fontSize:12 }} onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}><Ic n="csv" s={13} c="var(--green)" /> Export CSV / Excel</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20 }}>
        {BUCKETS.map((b,i) => (
          <div key={b} style={{ background:'var(--surface)',border:`1px solid ${BUCKET_COLORS[i]}40`,borderTop:`3px solid ${BUCKET_COLORS[i]}`,borderRadius:10,padding:'12px 14px' }}>
            <div style={{ fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',marginBottom:6 }}>{b}</div>
            <div style={{ fontFamily:'var(--mono)',fontSize:16,fontWeight:700,color:BUCKET_COLORS[i] }}>{tzs(byBucket[b]||0)}</div>
            <div style={{ fontSize:10,color:'var(--text3)',marginTop:4 }}>{entries.filter(e=>e.bucket===b).length} bills</div>
          </div>
        ))}
      </div>

      {loading ? <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading…</div> : (
        <div className="card">
          <div className="card-header" style={{ marginBottom:14 }}>
            <div><div className="card-title">Outstanding by Supplier</div><div className="card-sub">As at {asAt}</div></div>
            <div style={{ fontFamily:'var(--mono)',fontSize:16,fontWeight:800,color:'var(--accent)' }}>{tzs(total)}</div>
          </div>
          {entries.length === 0 ? (
            <div style={{ textAlign:'center',padding:'30px 0',color:'var(--text3)' }}>No outstanding payables. All suppliers settled.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Supplier</th><th>Document</th><th>Due Date</th><th className="td-right">Days</th><th>Bucket</th><th className="td-right">Outstanding (TZS)</th></tr></thead>
                <tbody>
                  {Object.values(bySupplier).sort((a,b)=>b.total-a.total).map((s,si) => (
                    <>
                      <tr key={si+'_hdr'} style={{ background:'var(--surface2)' }}>
                        <td className="td-bold" colSpan={5}>{s.name}</td>
                        <td className="td-right td-mono" style={{ fontWeight:700,color:'var(--accent)',padding:'8px 14px' }}>{tzs(s.total)}</td>
                      </tr>
                      {s.entries.map((e,ei) => (
                        <tr key={`${si}_${ei}`}>
                          <td></td>
                          <td className="td-mono td-amber" style={{ fontSize:11 }}>{e.document_ref}</td>
                          <td className="td-mono" style={{ fontSize:11,color:'var(--text3)' }}>{e.due_date}</td>
                          <td className="td-right td-mono" style={{ fontSize:11,color:e.days_overdue>30?'var(--red)':'var(--text3)' }}>{Math.max(0,e.days_overdue)}</td>
                          <td><span style={{ fontSize:9,fontFamily:'var(--mono)',padding:'2px 8px',borderRadius:4,background:`${BUCKET_COLORS[BUCKETS.indexOf(e.bucket)]}22`,color:BUCKET_COLORS[BUCKETS.indexOf(e.bucket)] }}>{e.bucket}</span></td>
                          <td className="td-right td-mono" style={{ fontSize:12,fontWeight:600 }}>{e.remaining_amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:'var(--surface2)',fontWeight:800 }}>
                    <td colSpan={5} style={{ padding:'12px 14px',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',color:'var(--text3)' }}>Total Outstanding</td>
                    <td className="td-right td-mono" style={{ color:'var(--accent)',fontSize:15,padding:'12px 14px',fontWeight:800 }}>{tzs(total)}</td>
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
