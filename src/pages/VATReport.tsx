import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'

interface VATLine { posting_date: string; ref: string; type: string; description: string; gross: number; vat: number; net: number }

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'pdf') return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

export default function VATReport() {
  const [lines, setLines] = useState<VATLine[]>([])
  const [loading, setLoading] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { load() }, [])

  const load = async (from?: string, to?: string) => {
    const f = from || fromDate
    const t = to || toDate
    setLoading(true)
    const { data } = await supabase.from('vouchers')
      .select('ref, type, posting_date, description, total_amount, vat_amount, subtotal')
      .in('type', ['cash_sale', 'sales_invoice', 'sales_return', 'credit_note'])
      .gte('posting_date', f).lte('posting_date', t)
      .eq('status', 'posted').order('posting_date', { ascending: true })
    if (data) {
      setLines(data.map(v => ({
        posting_date: v.posting_date, ref: v.ref, type: v.type,
        description: v.description || '',
        gross: v.total_amount || 0,
        vat: v.vat_amount || 0,
        net: v.subtotal || (v.total_amount || 0) - (v.vat_amount || 0),
      })))
    }
    setLoading(false)
  }

  const totalGross = lines.reduce((s, l) => s + l.gross, 0)
  const totalVAT = lines.reduce((s, l) => s + l.vat, 0)
  const totalNet = lines.reduce((s, l) => s + l.net, 0)

  const exportCSV = () => {
    const rows = [['Date','Ref','Type','Description','Gross (TZS)','VAT 18% (TZS)','Net (TZS)']]
    lines.forEach(l => rows.push([l.posting_date, l.ref, l.type, `"${l.description}"`, String(l.gross), String(l.vat), String(l.net)]))
    rows.push(['TOTALS','','','', String(totalGross), String(totalVAT), String(totalNet)])
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    a.download = `VAT_Report_${fromDate}_to_${toDate}.csv`; a.click()
  }

  const exportPDF = () => {
    const win = window.open('', '_blank'); if (!win) return
    const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const rows = lines.map(l => `<tr><td>${l.posting_date}</td><td style="font-family:'DM Mono',monospace;color:#D48744">${l.ref}</td><td>${l.type.replace(/_/g,' ')}</td><td>${l.description}</td><td class="num">${l.gross.toLocaleString()}</td><td class="num" style="color:#c0392b">${l.vat.toLocaleString()}</td><td class="num">${l.net.toLocaleString()}</td></tr>`).join('')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>VAT Report</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@600&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Instrument Sans',sans-serif;color:#1a1a1a;padding:40px;font-size:11px}
        .header{display:flex;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #0a0a0a}
        .logo-area{display:flex;align-items:center;gap:12px}.logo-mark{width:44px;height:44px;background:#0a0a0a;border-radius:10px;display:flex;align-items:center;justify-content:center}.logo-inner{width:24px;height:24px;background:#D48744;border-radius:5px}
        .company-name{font-family:'Syne',sans-serif;font-size:16px;font-weight:800}.company-sub{font-family:'DM Mono',monospace;font-size:9px;color:#666;margin-top:2px}
        .doc-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;text-align:right}.doc-meta{font-family:'DM Mono',monospace;font-size:9px;color:#888;text-align:right;margin-top:3px;line-height:1.5}
        .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px}
        .sum-card{padding:14px 16px;border-radius:8px;background:#f8f8f8}.sum-label{font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;color:#888;margin-bottom:6px}.sum-val{font-family:'DM Mono',monospace;font-size:18px;font-weight:700}
        table{width:100%;border-collapse:collapse}th{font-family:'DM Mono',monospace;font-size:8px;text-transform:uppercase;letter-spacing:1px;padding:8px;background:#0a0a0a;color:#fff;text-align:left}
        td{padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:10px}.num{text-align:right;font-family:'DM Mono',monospace}
        .total-row{background:#0a0a0a;color:#fff}.total-row td{font-family:'DM Mono',monospace;font-weight:700;padding:10px 8px;border:none}
        .tra-note{background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:10px 14px;margin-top:16px;font-size:10px}
        .footer{margin-top:20px;padding-top:10px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:8px;color:#999;font-family:'DM Mono',monospace}
      </style></head><body>
      <div class="header">
        <div class="logo-area"><div class="logo-mark"><div class="logo-inner"></div></div><div><div class="company-name">Your Organization</div><div class="company-sub">Dar es Salaam, Tanzania · VAT Report for TRA</div></div></div>
        <div><div class="doc-title">VAT Output Report</div><div class="doc-meta">Period: ${fromDate} to ${toDate}<br>Generated: ${now}<br>VAT Rate: 18% Inclusive</div></div>
      </div>
      <div class="summary">
        <div class="sum-card"><div class="sum-label">Total Gross Sales</div><div class="sum-val">${totalGross.toLocaleString()}</div></div>
        <div class="sum-card" style="background:#fdeaea"><div class="sum-label">VAT Output (Payable to TRA)</div><div class="sum-val" style="color:#c0392b">${totalVAT.toLocaleString()}</div></div>
        <div class="sum-card" style="background:#e8f8f0"><div class="sum-label">Net Revenue (Excl. VAT)</div><div class="sum-val" style="color:#1a7a4a">${totalNet.toLocaleString()}</div></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Ref</th><th>Type</th><th>Description</th><th class="num">Gross (TZS)</th><th class="num">VAT 18% (TZS)</th><th class="num">Net (TZS)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="total-row"><td colspan="4">TOTALS — ${lines.length} transactions</td><td class="num">${totalGross.toLocaleString()}</td><td class="num">${totalVAT.toLocaleString()}</td><td class="num">${totalNet.toLocaleString()}</td></tr></tfoot>
      </table>
      <div class="tra-note">⚠ This is an output VAT report only. Input VAT (purchases) should be deducted from this amount before filing with TRA. Net VAT payable = Output VAT − Input VAT.</div>
      <div class="footer"><span>Your Organization · TIN: — · VRN: —</span><span>SOKORA v1.0 · For TRA submission preparation</span></div>
    </body></html>`)
    win.document.close(); setTimeout(() => win.print(), 500)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">VAT Report</div>
          <div className="page-sub">Output VAT for TRA filing · 18% inclusive · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <div style={{ display:'flex',alignItems:'center',gap:6,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'5px 10px' }}>
            <input type="date" className="form-input" style={{ fontSize:11,padding:'3px 4px',border:'none',background:'transparent',width:120 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span style={{ fontSize:11,color:'var(--text3)' }}>to</span>
            <input type="date" className="form-input" style={{ fontSize:11,padding:'3px 4px',border:'none',background:'transparent',width:120 }} value={toDate} onChange={e => setToDate(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={() => load()}>Load</button>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => load()}><Ic n="refresh" /> Refresh</button>
          <div style={{ position:'relative' }}>
            <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => setShowExport(!showExport)}><Ic n="pdf" /> Export</button>
            {showExport && (
              <div style={{ position:'absolute',top:'100%',right:0,marginTop:6,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',boxShadow:'0 8px 32px rgba(0,0,0,.4)',zIndex:50,minWidth:190,overflow:'hidden' }}>
                <button onClick={() => { exportPDF(); setShowExport(false) }} style={{ width:'100%',display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'none',border:'none',cursor:'pointer',fontSize:12 }} onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}><Ic n="pdf" s={13} c="var(--red)" /> Export PDF (TRA-ready)</button>
                <button onClick={() => { exportCSV(); setShowExport(false) }} style={{ width:'100%',display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'none',border:'none',cursor:'pointer',fontSize:12 }} onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}><Ic n="csv" s={13} c="var(--green)" /> Export CSV</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom:20 }}>
        <div className="stat-card blue"><div className="stat-label">Gross Sales</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(totalGross)}</div><div className="stat-change">{lines.length} transactions</div></div>
        <div className="stat-card red"><div className="stat-label">VAT Output (Due to TRA)</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(totalVAT)}</div><div className="stat-change">18% inclusive</div></div>
        <div className="stat-card green"><div className="stat-label">Net Revenue</div><div className="stat-value" style={{ fontSize:18 }}>{tzs(totalNet)}</div><div className="stat-change">Excl. VAT</div></div>
        <div className="stat-card amber"><div className="stat-label">Effective VAT Rate</div><div className="stat-value">{totalGross > 0 ? ((totalVAT/totalGross)*100).toFixed(1) : 0}%</div><div className="stat-change">Should be ~15.25%</div></div>
      </div>

      <div style={{ background:'var(--yellow-dim)',border:'1px solid rgba(255,211,42,.3)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--yellow)' }}>
        This is output VAT only. Deduct input VAT (from purchases) before filing with TRA. Net VAT payable = Output VAT − Input VAT.
      </div>

      {loading ? <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading…</div> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Ref</th><th>Type</th><th>Description</th><th className="td-right">Gross (TZS)</th><th className="td-right">VAT 18% (TZS)</th><th className="td-right">Net (TZS)</th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="td-mono" style={{ fontSize:11,color:'var(--text3)' }}>{l.posting_date}</td>
                    <td className="td-mono td-amber" style={{ fontSize:11 }}>{l.ref}</td>
                    <td><span className="pill pill-gray" style={{ fontSize:9 }}>{l.type.replace(/_/g,' ')}</span></td>
                    <td style={{ fontSize:12,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{l.description}</td>
                    <td className="td-right td-mono" style={{ fontSize:12 }}>{l.gross.toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ fontSize:12,color:'var(--red)',fontWeight:600 }}>{l.vat.toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ fontSize:12,color:'var(--green)' }}>{l.net.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'var(--surface2)',fontWeight:800 }}>
                  <td colSpan={4} style={{ padding:'12px 14px',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',color:'var(--text3)' }}>Totals — {lines.length} transactions</td>
                  <td className="td-right td-mono" style={{ fontSize:14,padding:'12px 14px' }}>{totalGross.toLocaleString()}</td>
                  <td className="td-right td-mono" style={{ fontSize:14,color:'var(--red)',fontWeight:800,padding:'12px 14px' }}>{totalVAT.toLocaleString()}</td>
                  <td className="td-right td-mono" style={{ fontSize:14,color:'var(--green)',padding:'12px 14px' }}>{totalNet.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
