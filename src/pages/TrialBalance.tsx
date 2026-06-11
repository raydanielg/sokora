import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'

interface TBAccount {
  code: string; name: string; type: string; category: string
  debit: number; credit: number; balance: number
}

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'pdf') return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  if (n === 'check') return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>
  if (n === 'warn') return <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const SOKORA_PDF_HEADER = (title: string, subtitle: string, date: string) => `
<div class="header">
  <div class="logo-area">
    <div class="logo-mark"><div class="logo-inner"></div></div>
    <div class="company">
      <div class="company-name">Your Organization</div>
      <div class="company-sub">Dar es Salaam, Tanzania · SOKORA Financial Reports</div>
    </div>
  </div>
  <div class="doc-info">
    <div class="doc-title">${title}</div>
    <div class="doc-meta">${subtitle}<br>Generated: ${date}</div>
  </div>
</div>`

const PDF_BASE_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@500;600&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Instrument Sans', sans-serif; background: #fff; color: #1a1a1a; padding: 40px; font-size: 12px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 18px; border-bottom: 3px solid #0a0a0a; }
.logo-area { display: flex; align-items: center; gap: 14px; }
.logo-mark { width: 48px; height: 48px; background: #0a0a0a; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.logo-inner { width: 26px; height: 26px; background: #D48744; border-radius: 6px; }
.company-name { font-family: 'Syne', sans-serif; font-size: 17px; font-weight: 800; letter-spacing: -0.5px; }
.company-sub { font-family: 'DM Mono', monospace; font-size: 10px; color: #666; margin-top: 3px; }
.doc-info { text-align: right; }
.doc-title { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 800; }
.doc-meta { font-family: 'DM Mono', monospace; font-size: 10px; color: #888; margin-top: 4px; line-height: 1.6; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
thead tr { background: #0a0a0a; color: #fff; }
th { font-family: 'DM Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; padding: 10px; text-align: left; }
td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; }
.num { text-align: right; font-family: 'DM Mono', monospace; }
.pos { color: #1a7a4a; } .neg { color: #c0392b; }
.section-row { background: #f8f8f8; font-weight: 600; font-size: 11px; }
.total-row { background: #0a0a0a; color: #fff; font-weight: 700; }
.total-row td { font-family: 'DM Mono', monospace; padding: 12px 10px; border: none; }
.balanced { background: #e8f8f0; color: #1a7a4a; padding: 10px 16px; border-radius: 8px; margin-top: 16px; font-family: 'DM Mono', monospace; font-size: 11px; display: flex; align-items: center; gap: 8px; }
.footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 9px; color: #999; font-family: 'DM Mono', monospace; }
`

export default function TrialBalance() {
  const [accounts, setAccounts] = useState<TBAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [asAt, setAsAt] = useState(new Date().toISOString().split('T')[0])
  const [showExport, setShowExport] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('accounts').select('code, name, type, category, balance, is_active').eq('is_active', true).order('code')
    if (data) {
      const tb: TBAccount[] = data
        .filter(a => !['heading','end_total','begin_total'].includes(a.type))
        .filter(a => a.balance !== 0)
        .map(a => ({
          code: a.code, name: a.name, type: a.type, category: a.category,
          debit: a.balance > 0 ? a.balance : 0,
          credit: a.balance < 0 ? Math.abs(a.balance) : 0,
          balance: a.balance,
        }))
      setAccounts(tb)
    }
    setLoading(false)
  }

  const totalDebit = accounts.reduce((s, a) => s + a.debit, 0)
  const totalCredit = accounts.reduce((s, a) => s + a.credit, 0)
  const balanced = Math.abs(totalDebit - totalCredit) < 1

  const grouped = accounts.reduce((g, a) => {
    const key = a.type.charAt(0).toUpperCase() + a.type.slice(1)
    if (!g[key]) g[key] = []
    g[key].push(a)
    return g
  }, {} as Record<string, TBAccount[]>)

  const exportPDF = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const rows = Object.entries(grouped).map(([type, accts]) => `
      <tr class="section-row"><td colspan="4">${type}</td></tr>
      ${accts.map(a => `<tr>
        <td style="font-family:'DM Mono',monospace;color:#D48744">${a.code}</td>
        <td>${a.name}</td>
        <td class="num pos">${a.debit > 0 ? a.debit.toLocaleString() : '—'}</td>
        <td class="num neg">${a.credit > 0 ? a.credit.toLocaleString() : '—'}</td>
      </tr>`).join('')}
    `).join('')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Trial Balance</title><style>${PDF_BASE_STYLES}</style></head><body>
      ${SOKORA_PDF_HEADER('Trial Balance', `As at ${asAt}`, now)}
      <table>
        <thead><tr><th>Code</th><th>Account Name</th><th class="num">Debit (TZS)</th><th class="num">Credit (TZS)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="total-row"><td colspan="2">TOTALS</td><td class="num">${totalDebit.toLocaleString()}</td><td class="num">${totalCredit.toLocaleString()}</td></tr></tfoot>
      </table>
      <div class="balanced">${balanced ? '✓ BALANCED — Debits equal Credits' : `⚠ DIFFERENCE: ${Math.abs(totalDebit - totalCredit).toLocaleString()} TZS`}</div>
      <div class="footer"><span>Your Organization · Dar es Salaam, Tanzania</span><span>SOKORA v1.0 · Confidential</span></div>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  const exportCSV = () => {
    const rows = accounts.map(a => [a.code, `"${a.name}"`, a.type, a.debit || '', a.credit || ''].join(','))
    const csv = ['Code,Account Name,Type,Debit (TZS),Credit (TZS)', ...rows, `,,TOTALS,${totalDebit},${totalCredit}`].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `Trial_Balance_${asAt}.csv`; a.click()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Trial Balance</div>
          <div className="page-sub">All account balances · {balanced ? 'Balanced ✓' : 'UNBALANCED ⚠'} · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 10px' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>As at</span>
            <input type="date" className="form-input" style={{ fontSize: 12, padding: '3px 6px', border: 'none', background: 'transparent', width: 130 }} value={asAt} onChange={e => setAsAt(e.target.value)} />
          </div>
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={load}><Ic n="refresh" /> Refresh</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowExport(!showExport)}><Ic n="pdf" /> Export</button>
            {showExport && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: '0 8px 32px rgba(0,0,0,.4)', zIndex: 50, minWidth: 200, overflow: 'hidden' }}>
                <button onClick={() => { exportPDF(); setShowExport(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }} onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                  <Ic n="pdf" s={14} c="var(--red)" /> Export PDF (Branded)
                </button>
                <button onClick={() => { exportCSV(); setShowExport(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }} onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                  <Ic n="csv" s={14} c="var(--green)" /> Export CSV / Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Balance indicator */}
      <div style={{ background: balanced ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${balanced ? 'rgba(0,229,160,.3)' : 'rgba(255,71,87,.3)'}`, borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ic n={balanced ? 'check' : 'warn'} s={16} c={balanced ? 'var(--green)' : 'var(--red)'} />
          <span style={{ fontWeight: 600, fontSize: 13, color: balanced ? 'var(--green)' : 'var(--red)' }}>
            {balanced ? 'Books are BALANCED — Debits equal Credits' : `Books UNBALANCED — Difference: ${tzs(Math.abs(totalDebit - totalCredit))}`}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>As at {asAt}</div>
      </div>

      {/* Summary cards */}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card blue"><div className="stat-label">Total Debits</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(totalDebit)}</div></div>
        <div className="stat-card red"><div className="stat-label">Total Credits</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(totalCredit)}</div></div>
        <div className="stat-card green"><div className="stat-label">Active Accounts</div><div className="stat-value">{accounts.length}</div></div>
        <div className="stat-card amber"><div className="stat-label">Difference</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(Math.abs(totalDebit - totalCredit))}</div></div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Account Name</th><th>Type</th><th>Category</th><th className="td-right">Debit (TZS)</th><th className="td-right">Credit (TZS)</th></tr></thead>
              <tbody>
                {Object.entries(grouped).map(([type, accts]) => (
                  <>
                    <tr key={type + '_hdr'} style={{ background: 'var(--surface2)' }}>
                      <td colSpan={6} style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text3)', padding: '8px 14px', fontWeight: 700 }}>{type}</td>
                    </tr>
                    {accts.map((a, i) => (
                      <tr key={i}>
                        <td className="td-mono td-amber">{a.code}</td>
                        <td className="td-bold">{a.name}</td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{a.type}</td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{a.category}</td>
                        <td className="td-right td-mono" style={{ color: 'var(--blue)', fontWeight: a.debit > 0 ? 600 : 400 }}>{a.debit > 0 ? a.debit.toLocaleString() : '—'}</td>
                        <td className="td-right td-mono" style={{ color: 'var(--red)', fontWeight: a.credit > 0 ? 600 : 400 }}>{a.credit > 0 ? a.credit.toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface2)', fontWeight: 800 }}>
                  <td colSpan={4} style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>TOTALS</td>
                  <td className="td-right td-mono" style={{ color: 'var(--blue)', fontSize: 14, padding: '12px 14px' }}>{totalDebit.toLocaleString()}</td>
                  <td className="td-right td-mono" style={{ color: 'var(--red)', fontSize: 14, padding: '12px 14px' }}>{totalCredit.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
