import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'

interface AREntry {
  customer_id: string; customer_name: string; whatsapp: string
  document_ref: string; document_type: string; posting_date: string
  due_date: string; amount: number; remaining_amount: number
  days_overdue: number; bucket: string
}

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'pdf') return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const BUCKETS = ['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days']
const BUCKET_COLORS = ['var(--green)', 'var(--yellow)', 'var(--accent)', 'var(--red)', '#c0392b']

const getBucket = (days: number) => {
  if (days <= 0) return 'Current'
  if (days <= 30) return '1-30 Days'
  if (days <= 60) return '31-60 Days'
  if (days <= 90) return '61-90 Days'
  return '90+ Days'
}

export default function ARAgingReport() {
  const [entries, setEntries] = useState<AREntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [asAt] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('customer_ledger_entries')
      .select(`customer_id, document_ref, document_type, posting_date, due_date, amount, remaining_amount, is_open, customers(name, whatsapp)`)
      .eq('is_open', true).gt('remaining_amount', 0).order('posting_date', { ascending: true })
    if (data) {
      const today = new Date()
      const parsed: AREntry[] = data.map((e: any) => {
        const due = e.due_date ? new Date(e.due_date) : new Date(e.posting_date)
        const days = Math.floor((today.getTime() - due.getTime()) / 86400000)
        return {
          customer_id: e.customer_id,
          customer_name: e.customers?.name || 'Unknown',
          whatsapp: e.customers?.whatsapp || '—',
          document_ref: e.document_ref,
          document_type: e.document_type,
          posting_date: e.posting_date,
          due_date: e.due_date || e.posting_date,
          amount: e.amount,
          remaining_amount: e.remaining_amount,
          days_overdue: days,
          bucket: getBucket(days),
        }
      })
      setEntries(parsed)
    }
    setLoading(false)
  }

  const total = entries.reduce((s, e) => s + e.remaining_amount, 0)
  const byBucket = BUCKETS.reduce((g, b) => {
    g[b] = entries.filter(e => e.bucket === b).reduce((s, e) => s + e.remaining_amount, 0)
    return g
  }, {} as Record<string, number>)

  // Group by customer
  const byCustomer = entries.reduce((g, e) => {
    if (!g[e.customer_id]) g[e.customer_id] = { name: e.customer_name, whatsapp: e.whatsapp, entries: [], total: 0 }
    g[e.customer_id].entries.push(e)
    g[e.customer_id].total += e.remaining_amount
    return g
  }, {} as Record<string, { name: string; whatsapp: string; entries: AREntry[]; total: number }>)

  const exportCSV = () => {
    const rows = [['Customer', 'WhatsApp', 'Document', 'Type', 'Invoice Date', 'Due Date', 'Days Overdue', 'Original Amount', 'Outstanding', 'Aging Bucket']]
    entries.forEach(e => rows.push([`"${e.customer_name}"`, e.whatsapp, e.document_ref, e.document_type, e.posting_date, e.due_date, String(Math.max(0, e.days_overdue)), String(e.amount), String(e.remaining_amount), e.bucket]))
    rows.push(['TOTAL', '', '', '', '', '', '', '', String(total), ''])
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `AR_Aging_${asAt}.csv`; a.click()
  }

  const exportPDF = () => {
    const win = window.open('', '_blank'); if (!win) return
    const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const custRows = Object.values(byCustomer).sort((a, b) => b.total - a.total).map(c => `
      <tr style="background:#f8f8f8;font-weight:600"><td colspan="5">${c.name} <span style="color:#888;font-size:10px;font-family:'DM Mono',monospace">${c.whatsapp}</span></td><td class="num" style="font-weight:700">${c.total.toLocaleString()}</td></tr>
      ${c.entries.map(e => `<tr><td style="font-family:'DM Mono',monospace;color:#D48744;font-size:10px">${e.document_ref}</td><td>${e.document_type}</td><td>${e.due_date}</td><td>${Math.max(0, e.days_overdue)} days</td><td style="color:${e.bucket==='Current'?'#1a7a4a':e.bucket.includes('90+')?'#c0392b':'#e67e22'}">${e.bucket}</td><td class="num">${e.remaining_amount.toLocaleString()}</td></tr>`).join('')}
    `).join('')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>AR Aging</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@600&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Instrument Sans',sans-serif;color:#1a1a1a;padding:40px;font-size:11px}
        .header{display:flex;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #0a0a0a}
        .logo-area{display:flex;align-items:center;gap:12px}.logo-mark{width:44px;height:44px;background:#0a0a0a;border-radius:10px;display:flex;align-items:center;justify-content:center}.logo-inner{width:24px;height:24px;background:#D48744;border-radius:5px}
        .company-name{font-family:'Syne',sans-serif;font-size:16px;font-weight:800}.company-sub{font-family:'DM Mono',monospace;font-size:9px;color:#666;margin-top:2px}
        .doc-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;text-align:right}.doc-meta{font-family:'DM Mono',monospace;font-size:9px;color:#888;text-align:right;margin-top:3px;line-height:1.5}
        .buckets{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
        .bucket{padding:10px 12px;border-radius:8px;background:#f5f5f5}.bucket-label{font-family:'DM Mono',monospace;font-size:9px;color:#888;text-transform:uppercase;margin-bottom:4px}.bucket-val{font-family:'DM Mono',monospace;font-size:14px;font-weight:700}
        table{width:100%;border-collapse:collapse}th{font-family:'DM Mono',monospace;font-size:8px;text-transform:uppercase;letter-spacing:1px;padding:8px 8px;background:#0a0a0a;color:#fff;text-align:left}
        td{padding:6px 8px;border-bottom:1px solid #f0f0f0}.num{text-align:right;font-family:'DM Mono',monospace}
        .total-row{background:#0a0a0a;color:#fff}.total-row td{font-family:'DM Mono',monospace;font-weight:700;padding:10px 8px;border:none}
        .footer{margin-top:20px;padding-top:10px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:8px;color:#999;font-family:'DM Mono',monospace}
      </style></head><body>
      <div class="header">
        <div class="logo-area"><div class="logo-mark"><div class="logo-inner"></div></div><div><div class="company-name">Your Organization</div><div class="company-sub">Dar es Salaam, Tanzania · AR Aging Report</div></div></div>
        <div><div class="doc-title">Accounts Receivable Aging</div><div class="doc-meta">As at ${asAt}<br>Generated: ${now}<br>${entries.length} open invoices · ${Object.keys(byCustomer).length} customers</div></div>
      </div>
      <div class="buckets">
        ${BUCKETS.map((b, i) => `<div class="bucket"><div class="bucket-label">${b}</div><div class="bucket-val" style="color:${['#1a7a4a','#e67e22','#D48744','#c0392b','#8b0000'][i]}">${(byBucket[b]||0).toLocaleString()}</div></div>`).join('')}
      </div>
      <table>
        <thead><tr><th>Ref</th><th>Type</th><th>Due Date</th><th>Days</th><th>Bucket</th><th class="num">Outstanding (TZS)</th></tr></thead>
        <tbody>${custRows}</tbody>
        <tfoot><tr class="total-row"><td colspan="5">TOTAL OUTSTANDING</td><td class="num">${total.toLocaleString()}</td></tr></tfoot>
      </table>
      <div class="footer"><span>Your Organization · Dar es Salaam, Tanzania</span><span>SOKORA v1.0 · Confidential</span></div>
    </body></html>`)
    win.document.close(); setTimeout(() => win.print(), 500)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">AR Aging Report</div>
          <div className="page-sub">Who owes you · {entries.length} open invoices · {Object.keys(byCustomer).length} customers · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={load}><Ic n="refresh" /> Refresh</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowExport(!showExport)}><Ic n="pdf" /> Export</button>
            {showExport && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: '0 8px 32px rgba(0,0,0,.4)', zIndex: 50, minWidth: 190, overflow: 'hidden' }}>
                <button onClick={() => { exportPDF(); setShowExport(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }} onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background='transparent')}><Ic n="pdf" s={13} c="var(--red)" /> Export PDF</button>
                <button onClick={() => { exportCSV(); setShowExport(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }} onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background='transparent')}><Ic n="csv" s={13} c="var(--green)" /> Export CSV</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Aging buckets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {BUCKETS.map((b, i) => (
          <div key={b} style={{ background: 'var(--surface)', border: `1px solid ${BUCKET_COLORS[i]}40`, borderTop: `3px solid ${BUCKET_COLORS[i]}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>{b}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: BUCKET_COLORS[i] }}>{tzs(byBucket[b] || 0)}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{entries.filter(e => e.bucket === b).length} invoices</div>
          </div>
        ))}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div> : (
        <div className="card">
          <div className="card-header" style={{ marginBottom: 14 }}>
            <div><div className="card-title">Outstanding by Customer</div><div className="card-sub">Sorted by amount · As at {asAt}</div></div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--red)' }}>{tzs(total)}</div>
          </div>
          {entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No outstanding receivables. All accounts settled.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>WhatsApp</th><th>Document</th><th>Type</th><th>Due Date</th><th className="td-right">Days</th><th>Bucket</th><th className="td-right">Outstanding (TZS)</th></tr></thead>
                <tbody>
                  {Object.values(byCustomer).sort((a, b) => b.total - a.total).map((c, ci) => (
                    <>
                      <tr key={ci + '_hdr'} style={{ background: 'var(--surface2)' }}>
                        <td className="td-bold" colSpan={7}>{c.name}</td>
                        <td className="td-right td-mono" style={{ fontWeight: 700, color: 'var(--red)', padding: '8px 14px' }}>{tzs(c.total)}</td>
                      </tr>
                      {c.entries.map((e, ei) => (
                        <tr key={`${ci}_${ei}`}>
                          <td style={{ fontSize: 11, color: 'var(--text3)' }}></td>
                          <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{c.whatsapp}</td>
                          <td className="td-mono td-amber" style={{ fontSize: 11 }}>{e.document_ref}</td>
                          <td style={{ fontSize: 11 }}>{e.document_type}</td>
                          <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{e.due_date}</td>
                          <td className="td-right td-mono" style={{ fontSize: 11, color: e.days_overdue > 30 ? 'var(--red)' : 'var(--text3)' }}>{Math.max(0, e.days_overdue)}</td>
                          <td>
                            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 4, background: `${BUCKET_COLORS[BUCKETS.indexOf(e.bucket)]}22`, color: BUCKET_COLORS[BUCKETS.indexOf(e.bucket)] }}>{e.bucket}</span>
                          </td>
                          <td className="td-right td-mono" style={{ fontSize: 12, fontWeight: 600 }}>{e.remaining_amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface2)', fontWeight: 800 }}>
                    <td colSpan={7} style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 11, textTransform: 'uppercase', color: 'var(--text3)' }}>Total Outstanding</td>
                    <td className="td-right td-mono" style={{ color: 'var(--red)', fontSize: 15, padding: '12px 14px', fontWeight: 800 }}>{tzs(total)}</td>
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
