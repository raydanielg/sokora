/**
 * Sales Day Book export functions
 * Pure functions that receive all data as arguments.
 *
 * Exports:
 *   exportCSV       — flat CSV of every transaction
 *   exportPDF       — summary PDF (gross/net/banking/expenses/products/transactions table)
 *   exportDetailPDF — per-voucher detail PDF (one card per voucher with line items)
 */

export interface SDBSale {
  id: string; ref: string; type?: string; posting_date: string; description: string
  total_amount: number; subtotal: number; payment_method: string
  payment_split?: Record<string, number> | null
  status: string; notes: string; posted_by: string
  customers: { name: string; whatsapp: string; pregnancy_stage: string; crown_points: number } | null
  voucher_lines: { id: string; qty: number; unit_price: number; unit_cost: number; total: number; products: { name: string; sku: string; category: string } | null }[]
}

export interface SDBExpense {
  ref: string; description: string; total_amount: number; payment_method: string; notes: string
}

export interface SDBCreditNote {
  ref: string; description: string; total_amount: number; posting_date: string
}

export interface SDBTemplateSettings {
  logo_url: string | null; logo_position: string; logo_width: number
  company_name: string; company_tagline: string; primary_color: string
}

export interface ExportData {
  filtered: SDBSale[]
  expenses: SDBExpense[]
  creditNotes: SDBCreditNote[]
  paymentSplit: Record<string, number>
  expenseSplit: Record<string, number>
  totalRevenue: number
  totalExpenses: number
  totalCreditNotes: number
  netSales: number
  totalCost: number
  totalMargin: number
  marginPct: number
  cashTotal: number
  creditTotal: number
  cashCount: number
  creditCount: number
  cashPct: number
  creditPct: number
  fromDate: string
  toDate: string
  tplSettings: SDBTemplateSettings
}

// ── HELPERS ────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function humanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${MONTHS[m - 1]} ${y}`
}

function shortHumanDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  if (!m || !d) return iso
  return `${d} ${MONTHS[m - 1]}`
}

/**
 * Build a friendly filename root for the report based on the date range.
 *  - Single day:  "Sales Day Book — 2 May 2026"
 *  - Same month:  "Sales Day Book — 1 to 7 May 2026"
 *  - Cross month: "Sales Day Book — 28 Apr to 3 May 2026"
 *  - Cross year:  "Sales Day Book — 28 Dec 2025 to 3 Jan 2026"
 */
function buildReportTitle(prefix: string, fromDate: string, toDate: string): string {
  if (fromDate === toDate) return `${prefix} — ${humanDate(fromDate)}`
  const [fy, fm] = fromDate.split('-')
  const [ty, tm] = toDate.split('-')
  if (fy === ty && fm === tm) {
    const fd = parseInt(fromDate.split('-')[2], 10)
    return `${prefix} — ${fd} to ${humanDate(toDate)}`
  }
  if (fy === ty) {
    return `${prefix} — ${shortHumanDate(fromDate)} to ${humanDate(toDate)}`
  }
  return `${prefix} — ${humanDate(fromDate)} to ${humanDate(toDate)}`
}

/**
 * Aggregate product unit counts across all sales lines.
 * Returns array sorted by revenue descending: [{ name, qty, revenue }, ...]
 */
function aggregateProducts(filtered: SDBSale[]): { name: string; qty: number; revenue: number }[] {
  const acc: Record<string, { name: string; qty: number; revenue: number }> = {}
  filtered.forEach(s => {
    (s.voucher_lines || []).forEach(l => {
      const name = (l.products as any)?.name || 'Unknown product'
      if (!acc[name]) acc[name] = { name, qty: 0, revenue: 0 }
      acc[name].qty += (l.qty || 0)
      acc[name].revenue += (l.total || (l.unit_price || 0) * (l.qty || 0))
    })
  })
  return Object.values(acc).sort((a, b) => b.revenue - a.revenue)
}

// ── CSV EXPORT ─────────────────────────────────────────────────────────

export function exportCSV(data: ExportData) {
  const { filtered, totalRevenue, cashTotal, creditTotal, cashCount, creditCount, cashPct, creditPct, fromDate, toDate } = data
  if (filtered.length === 0) return
  const headers = ['Date','Ref','Type','Customer','WhatsApp','Payment','Salesperson','Status','Amount (TZS)']
  const rows: string[][] = filtered.map(s => [
    s.posting_date,
    s.ref,
    s.type === 'sales_invoice' ? 'Credit' : 'Cash',
    `"${(s.customers as any)?.name || s.description || ''}"`,
    (s.customers as any)?.whatsapp || '',
    s.payment_method || '',
    s.posted_by || '',
    s.status || '',
    String(s.total_amount || 0),
  ])
  rows.push(['','','','','','','','',''])
  rows.push(['TOTALS',`${filtered.length} txns`,'','','','','','',String(totalRevenue)])
  rows.push(['  Cash Sales',`${cashCount} txns`,`${cashPct}%`,'','','','','',String(cashTotal)])
  rows.push(['  Credit Sales',`${creditCount} txns`,`${creditPct}%`,'','','','','',String(creditTotal)])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `${buildReportTitle('Sales Day Book', fromDate, toDate)}.csv`
  a.click()
}

// ── SUMMARY PDF EXPORT ─────────────────────────────────────────────────

export function exportPDF(data: ExportData) {
  const {
    filtered, expenses, creditNotes, paymentSplit, expenseSplit,
    totalRevenue, totalExpenses, totalCreditNotes, netSales,
    cashTotal, creditTotal, cashCount, creditCount, cashPct, creditPct,
    fromDate, toDate, tplSettings,
  } = data
  if (filtered.length === 0) return

  const now = new Date().toLocaleString('en-GB')
  const t = tplSettings
  const pc = t.primary_color || '#85c2be'
  const reportTitle = buildReportTitle('Sales Day Book', fromDate, toDate)

  const logoHtml = t.logo_url
    ? `<img src="${t.logo_url}" alt="Logo" style="width:${t.logo_width}px;height:auto;object-fit:contain" />`
    : `<div class="logo-mark"><div class="logo-inner"></div></div>`
  const logoAlign = t.logo_position === 'center' ? 'center' : t.logo_position === 'right' ? 'flex-end' : 'flex-start'

  const bankingRows = Object.entries(paymentSplit).map(([method, amount]) => {
    const pct = totalRevenue > 0 ? ((amount / totalRevenue) * 100).toFixed(0) : '0'
    return `<tr><td>${method}</td><td class="num">${Math.round(amount).toLocaleString()}</td><td class="num">${pct}%</td></tr>`
  }).join('')

  const expenseRows = expenses.map(e =>
    `<tr><td class="ref">${e.ref}</td><td>${e.description || '—'}</td><td>${e.payment_method || 'Cash'}</td><td class="num">${(e.total_amount || 0).toLocaleString()}</td></tr>`
  ).join('')

  // Products Sold — aggregated by name, sorted by revenue desc
  const productsAggregate = aggregateProducts(filtered)
  const productsSoldLine = productsAggregate.length > 0
    ? productsAggregate.map(p => `${p.qty} ${p.name}`).join(' · ')
    : 'No products recorded.'
  const totalUnits = productsAggregate.reduce((s, p) => s + p.qty, 0)

  const tableRows = filtered.map(s => {
    const isCredit = s.type === 'sales_invoice'
    return `<tr>
      <td>${s.posting_date}</td>
      <td class="ref">${s.ref}</td>
      <td><span class="pill ${isCredit ? 'pill-b' : 'pill-g'}">${isCredit ? 'Credit' : 'Cash'}</span></td>
      <td>${(s.customers as any)?.name || '—'}</td>
      <td class="mono">${(s.customers as any)?.whatsapp || '—'}</td>
      <td><span class="pill ${s.payment_method?.includes('Cash') ? 'pill-g' : s.payment_method?.includes('M-Pesa') ? 'pill-b' : 'pill-a'}">${s.payment_method || '—'}</span></td>
      <td>${s.posted_by || '—'}</td>
      <td><span class="pill ${s.status === 'posted' ? 'pill-g' : 'pill-y'}">${s.status === 'draft' ? 'POD' : 'Posted'}</span></td>
      <td class="num">${(s.total_amount || 0).toLocaleString()}</td>
    </tr>`
  }).join('')

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${reportTitle}</title>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@500;600&display=swap" rel="stylesheet">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Instrument Sans','Helvetica Neue',sans-serif;color:#1a1a1a;padding:0;background:#fff}
      .page{max-width:1000px;margin:0 auto;padding:0}
      .header{display:flex;justify-content:space-between;align-items:center;padding:24px 40px;background:${pc};color:#fff}
      .logo-area{display:flex;align-items:center;gap:14px;justify-content:${logoAlign}}
      .logo-mark{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center}
      .logo-inner{width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.5)}
      .company-name{font-family:'Syne',serif;font-size:20px;font-weight:800;letter-spacing:-.3px;color:#fff}
      .company-sub{font-size:10px;color:rgba(255,255,255,.75);margin-top:3px}
      .doc-title{font-family:'Syne',serif;font-size:22px;font-weight:800;text-align:right;color:#fff}
      .doc-meta{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.7);text-align:right;margin-top:4px;line-height:1.6}
      .content{padding:28px 40px}
      .stats{display:flex;gap:12px;margin-bottom:24px}
      .stat{flex:1;background:#f9f9f9;border:1px solid #eee;border-radius:10px;padding:14px 16px}
      .stat-label{font-family:'DM Mono',monospace;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
      .stat-val{font-family:'DM Mono',monospace;font-size:18px;font-weight:700}
      .stat-val.green{color:#1a7a4a} .stat-val.blue{color:#2563eb} .stat-val.amber{color:#d48744} .stat-val.red{color:#c0392b}
      .section-title{font-family:'Syne',serif;font-size:13px;font-weight:700;margin-bottom:10px;color:#333}
      .split-grid{display:flex;gap:20px;margin-bottom:24px}
      .split-grid>div{flex:1}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{text-align:left;padding:6px 10px;background:#f5f5f5;border-bottom:2px solid #ddd;font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#888}
      td{padding:7px 10px;border-bottom:1px solid #f0f0f0}
      table.compact th{padding:4px 8px;font-size:8.5px}
      table.compact td{padding:3px 8px;font-size:10.5px;line-height:1.35}
      .num{text-align:right;font-family:'DM Mono',monospace}
      .ref{font-family:'DM Mono',monospace;color:#D48744;font-weight:600}
      .mono{font-family:'DM Mono',monospace;font-size:10px;color:#888}
      .pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600}
      .pill-g{background:#e6f9f0;color:#1a7a4a} .pill-b{background:#e8f0fe;color:#2563eb}
      .pill-a{background:#fff3e0;color:#d48744} .pill-y{background:#fef9e7;color:#b8860b}
      .total-row{background:#f5f5f5;font-weight:700}
      .total-row td{padding:7px 10px;border-top:2px solid #ddd}
      table.compact .total-row td{padding:5px 8px;font-size:11px}
      .products-block{background:#fafafa;border:1px solid #eee;border-radius:10px;padding:14px 18px;margin-bottom:24px;line-height:1.7;font-size:12px;color:#333}
      .products-block .heading{font-family:'DM Mono',monospace;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
      .footer{margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:10px;color:#999;display:flex;justify-content:space-between}
      @media print{body{padding:0}.content{padding:20px 30px}@page{margin:10mm 8mm}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style>
  </head><body>
    <div class="page">
      <div class="header">
        <div class="logo-area">
          ${logoHtml}
          <div>
            <div class="company-name">${t.company_name}</div>
            <div class="company-sub">${t.company_tagline} · Sales Day Book</div>
          </div>
        </div>
        <div>
          <div class="doc-title">Sales Day Book</div>
          <div class="doc-meta">Period: ${fromDate} to ${toDate}<br>Generated: ${now}<br>${filtered.length} transactions</div>
        </div>
      </div>

      <div class="content">
      <div class="stats">
        <div class="stat"><div class="stat-label">Gross Sales</div><div class="stat-val green">TZS ${totalRevenue.toLocaleString()}</div></div>
        <div class="stat"><div class="stat-label">Credit Notes</div><div class="stat-val" style="color:${totalCreditNotes > 0 ? '#c0392b' : '#999'}">${totalCreditNotes > 0 ? '(TZS ' + totalCreditNotes.toLocaleString() + ')' : 'None'}</div></div>
        <div class="stat"><div class="stat-label">Net Sales</div><div class="stat-val green">TZS ${netSales.toLocaleString()}</div></div>
        <div class="stat"><div class="stat-label">Expenses</div><div class="stat-val red">TZS ${totalExpenses.toLocaleString()}</div></div>
        <div class="stat" style="background:${(netSales - totalExpenses) >= 0 ? '#f0faf7' : '#fef2f2'};border-color:${(netSales - totalExpenses) >= 0 ? pc + '40' : '#fca5a540'}"><div class="stat-label">Net Position</div><div class="stat-val" style="color:${(netSales - totalExpenses) >= 0 ? '#1a7a4a' : '#c0392b'}">TZS ${(netSales - totalExpenses).toLocaleString()}</div></div>
      </div>

      <div class="section-title">Sales Composition</div>
      <div class="stats" style="margin-bottom:24px">
        <div class="stat" style="background:#f0faf7;border-color:#1a7a4a20">
          <div class="stat-label">Cash Sales</div>
          <div class="stat-val green">TZS ${cashTotal.toLocaleString()}</div>
          <div style="font-family:'DM Mono',monospace;font-size:10px;color:#666;margin-top:6px">${cashCount} txns · ${cashPct}% of gross</div>
          <div style="height:4px;background:#eee;border-radius:2px;margin-top:8px"><div style="height:100%;width:${cashPct}%;background:#1a7a4a;border-radius:2px"></div></div>
        </div>
        <div class="stat" style="background:#eff6ff;border-color:#2563eb20">
          <div class="stat-label">Credit Sales</div>
          <div class="stat-val blue">TZS ${creditTotal.toLocaleString()}</div>
          <div style="font-family:'DM Mono',monospace;font-size:10px;color:#666;margin-top:6px">${creditCount} txns · ${creditPct}% of gross</div>
          <div style="height:4px;background:#eee;border-radius:2px;margin-top:8px"><div style="height:100%;width:${creditPct}%;background:#2563eb;border-radius:2px"></div></div>
        </div>
        <div class="stat">
          <div class="stat-label">Avg Cash Sale</div>
          <div class="stat-val">TZS ${cashCount > 0 ? Math.round(cashTotal / cashCount).toLocaleString() : '0'}</div>
          <div style="font-family:'DM Mono',monospace;font-size:10px;color:#666;margin-top:6px">Immediate receipt</div>
        </div>
        <div class="stat">
          <div class="stat-label">Avg Credit Sale</div>
          <div class="stat-val">TZS ${creditCount > 0 ? Math.round(creditTotal / creditCount).toLocaleString() : '0'}</div>
          <div style="font-family:'DM Mono',monospace;font-size:10px;color:#666;margin-top:6px">Payment pending</div>
        </div>
      </div>

      <div class="section-title">Products Sold</div>
      <div class="products-block">
        <div class="heading">${totalUnits} units across ${productsAggregate.length} product${productsAggregate.length === 1 ? '' : 's'} · sorted by revenue</div>
        ${productsSoldLine}
      </div>

      <div class="split-grid">
        <div>
          <div class="section-title">Banking Summary</div>
          <table class="compact"><thead><tr><th>Method / Bank</th><th class="num">Received (TZS)</th><th class="num">Share</th></tr></thead>
          <tbody>${bankingRows}</tbody>
          <tfoot><tr class="total-row"><td>Total Received</td><td class="num">${totalRevenue.toLocaleString()}</td><td class="num">100%</td></tr></tfoot>
          </table>
        </div>
        <div>
          <div class="section-title">Expense Summary</div>
          ${expenses.length > 0 ? `
            <table class="compact"><thead><tr><th>Ref</th><th>Description</th><th>Paid From</th><th class="num">Amount (TZS)</th></tr></thead>
            <tbody>${expenseRows}</tbody>
            <tfoot><tr class="total-row"><td colspan="3">Total Expenses</td><td class="num">${totalExpenses.toLocaleString()}</td></tr></tfoot>
            </table>
            ${Object.keys(expenseSplit).length > 1 ? `
              <div style="margin-top:12px;font-size:10px;color:#888;font-family:'DM Mono',monospace">
                ${Object.entries(expenseSplit).map(([m, a]) => `${m}: TZS ${Math.round(a).toLocaleString()}`).join(' · ')}
              </div>
            ` : ''}
          ` : '<div style="font-size:12px;color:#bbb;padding:16px 0">No expenses recorded for this period.</div>'}
        </div>
      </div>

      <div class="section-title">Transaction Detail</div>
      <table>
        <thead><tr><th>Date</th><th>Ref</th><th>Type</th><th>Customer</th><th>WhatsApp</th><th>Payment</th><th>Salesperson</th><th>Status</th><th class="num">Amount (TZS)</th></tr></thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr class="total-row"><td colspan="8">Sales Subtotal — ${filtered.length} transactions</td><td class="num">${totalRevenue.toLocaleString()}</td></tr>
          <tr style="background:#f0faf7;font-size:11px"><td colspan="8" style="padding-left:24px;color:#666"><span style="display:inline-block;width:8px;height:8px;background:#1a7a4a;border-radius:2px;margin-right:6px;vertical-align:middle"></span>Cash Sales (${cashCount} txns · ${cashPct}%)</td><td class="num" style="color:#1a7a4a;font-weight:700">${cashTotal.toLocaleString()}</td></tr>
          <tr style="background:#eff6ff;font-size:11px"><td colspan="8" style="padding-left:24px;color:#666"><span style="display:inline-block;width:8px;height:8px;background:#2563eb;border-radius:2px;margin-right:6px;vertical-align:middle"></span>Credit Sales (${creditCount} txns · ${creditPct}%)</td><td class="num" style="color:#2563eb;font-weight:700">${creditTotal.toLocaleString()}</td></tr>
          ${creditNotes.length > 0 ? `
            ${creditNotes.map(c => `<tr style="color:#c0392b"><td>${c.posting_date}</td><td class="ref" style="color:#c0392b">${c.ref}</td><td colspan="6">${c.description || 'Credit Note'}</td><td class="num">(${(c.total_amount || 0).toLocaleString()})</td></tr>`).join('')}
            <tr style="background:#fef2f2;font-weight:700"><td colspan="8">Total Credit Notes</td><td class="num" style="color:#c0392b">(${totalCreditNotes.toLocaleString()})</td></tr>
          ` : ''}
          <tr style="background:#e6f9f0;font-weight:800"><td colspan="8" style="padding:12px 10px;font-size:13px">NET SALES</td><td class="num" style="padding:12px 10px;font-size:15px;color:#1a7a4a">${netSales.toLocaleString()}</td></tr>
        </tfoot>
      </table>

      <div class="footer">
        <div>${t.company_name} · Dar es Salaam, Tanzania</div>
        <div>Generated ${now} · SOKORA</div>
      </div>
      </div>
    </div>
  </body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 600)
}

// ── DETAIL PDF EXPORT (per-voucher breakdown) ──────────────────────────

export function exportDetailPDF(data: ExportData) {
  const {
    filtered, totalRevenue, totalCost, totalMargin, marginPct,
    cashTotal, creditTotal, cashCount, creditCount, cashPct, creditPct,
    fromDate, toDate, tplSettings,
  } = data
  if (filtered.length === 0) return

  const now = new Date().toLocaleString('en-GB')
  const t = tplSettings
  const pc = t.primary_color || '#85c2be'
  const reportTitle = buildReportTitle('Sales Day Book — Detail', fromDate, toDate)

  const logoHtml = t.logo_url
    ? `<img src="${t.logo_url}" alt="Logo" style="width:${t.logo_width}px;height:auto;object-fit:contain" />`
    : `<div class="logo-mark"><div class="logo-inner"></div></div>`
  const logoAlign = t.logo_position === 'center' ? 'center' : t.logo_position === 'right' ? 'flex-end' : 'flex-start'

  const voucherCards = filtered.map(s => {
    const isCredit = s.type === 'sales_invoice'
    const lines = s.voucher_lines || []
    const totalQty = lines.reduce((acc, l) => acc + (l.qty || 0), 0)
    const custMargin = lines.reduce((acc, l) => acc + ((l.unit_price - l.unit_cost) * l.qty), 0)
    const custMarginPct = (s.total_amount || 0) > 0 ? Math.round((custMargin / (s.total_amount || 1)) * 100) : 0

    const lineRows = lines.length > 0
      ? lines.map(l => `<tr>
          <td>${(l.products as any)?.name || '—'}</td>
          <td class="mono">${(l.products as any)?.sku || '—'}</td>
          <td class="num">${l.qty}</td>
          <td class="num">${(l.unit_price || 0).toLocaleString()}</td>
          <td class="num">${(l.total || 0).toLocaleString()}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" style="text-align:center;color:#bbb;padding:12px 0">No line items</td></tr>`

    return `
      <div class="voucher" style="border-left:3px solid ${s.status === 'draft' ? '#d48744' : '#1a7a4a'}">
        <div class="vh">
          <div>
            <div class="vh-ref">${s.ref}</div>
            <div class="vh-meta">${s.posting_date} · ${s.posted_by || '—'}</div>
          </div>
          <div class="vh-pills">
            <span class="pill ${s.status === 'posted' ? 'pill-g' : 'pill-y'}">${s.status === 'draft' ? 'POD Pending' : 'Posted ✓'}</span>
            <span class="pill ${isCredit ? 'pill-b' : 'pill-g'}">${isCredit ? 'Credit Sale' : 'Cash Sale'}</span>
            <span class="pill pill-a">${s.payment_method || '—'}</span>
          </div>
          <div class="vh-amt">
            <div class="vh-total">TZS ${(s.total_amount || 0).toLocaleString()}</div>
            <div class="vh-status">${s.status === 'draft' ? 'Receipt pending' : '✓ Receipted'}</div>
          </div>
        </div>

        <div class="vgrid">
          <div class="vbox">
            <div class="vbox-label">Customer</div>
            <div class="vbox-name">${(s.customers as any)?.name || '—'}</div>
            <div class="vbox-sub mono">${(s.customers as any)?.whatsapp || '—'}</div>
            <div class="vbox-sub">${(s.customers as any)?.pregnancy_stage || '—'}</div>
            <div class="vbox-sub" style="color:#b8860b;margin-top:4px">${((s.customers as any)?.crown_points || 0).toLocaleString()} pts</div>
          </div>
          <div class="vbox">
            <div class="vbox-label">Financial</div>
            <div class="frow"><span>Subtotal</span><span class="mono">${(s.subtotal || 0).toLocaleString()}</span></div>
            <div class="frow"><span>Total</span><span class="mono">${(s.total_amount || 0).toLocaleString()}</span></div>
            <div class="frow"><span>Margin</span><span class="mono" style="color:${custMargin >= 0 ? '#1a7a4a' : '#c0392b'}">${custMargin.toLocaleString()} (${custMarginPct}%)</span></div>
          </div>
          <div class="vbox">
            <div class="vbox-label">Items</div>
            <div class="vbox-name">${lines.length} line${lines.length === 1 ? '' : 's'}</div>
            <div class="vbox-sub">${totalQty} unit${totalQty === 1 ? '' : 's'}</div>
            ${s.notes ? `<div class="vbox-sub" style="margin-top:6px;font-style:italic;color:#888">"${s.notes}"</div>` : ''}
          </div>
        </div>

        <table class="lines">
          <thead><tr><th>Product</th><th>SKU</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Total</th></tr></thead>
          <tbody>${lineRows}</tbody>
        </table>
      </div>
    `
  }).join('')

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${reportTitle}</title>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@500;600&display=swap" rel="stylesheet">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Instrument Sans','Helvetica Neue',sans-serif;color:#1a1a1a;padding:0;background:#fff}
      .page{max-width:1000px;margin:0 auto;padding:0}
      .header{display:flex;justify-content:space-between;align-items:center;padding:24px 40px;background:${pc};color:#fff}
      .logo-area{display:flex;align-items:center;gap:14px;justify-content:${logoAlign}}
      .logo-mark{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center}
      .logo-inner{width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.5)}
      .company-name{font-family:'Syne',serif;font-size:20px;font-weight:800;letter-spacing:-.3px;color:#fff}
      .company-sub{font-size:10px;color:rgba(255,255,255,.75);margin-top:3px}
      .doc-title{font-family:'Syne',serif;font-size:22px;font-weight:800;text-align:right;color:#fff}
      .doc-meta{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.7);text-align:right;margin-top:4px;line-height:1.6}
      .content{padding:24px 40px}
      .summary-band{display:flex;gap:10px;margin-bottom:20px}
      .sb{flex:1;background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:10px 14px}
      .sb-label{font-family:'DM Mono',monospace;font-size:8.5px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
      .sb-val{font-family:'DM Mono',monospace;font-size:14px;font-weight:700;color:#1a7a4a}
      .voucher{background:#fff;border:1px solid #eee;border-radius:10px;padding:18px 22px;margin-bottom:14px;page-break-inside:avoid}
      .vh{display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;margin-bottom:14px}
      .vh-ref{font-family:'DM Mono',monospace;font-size:15px;font-weight:800;color:#D48744}
      .vh-meta{font-family:'DM Mono',monospace;font-size:10px;color:#999;margin-top:2px}
      .vh-pills{display:flex;gap:6px;flex-wrap:wrap}
      .vh-amt{text-align:right}
      .vh-total{font-family:'Syne',serif;font-size:18px;font-weight:800;color:#1a7a4a}
      .vh-status{font-family:'DM Mono',monospace;font-size:9.5px;color:#999;margin-top:2px}
      .vgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px}
      .vbox{background:#fafafa;border:1px solid #eee;border-radius:8px;padding:10px 12px}
      .vbox-label{font-family:'DM Mono',monospace;font-size:8.5px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
      .vbox-name{font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:2px}
      .vbox-sub{font-size:10.5px;color:#777;line-height:1.5}
      .frow{display:flex;justify-content:space-between;font-size:11px;padding:2px 0;color:#555}
      .mono{font-family:'DM Mono',monospace}
      .num{text-align:right;font-family:'DM Mono',monospace}
      table.lines{width:100%;border-collapse:collapse;font-size:11px;margin-top:4px}
      table.lines th{text-align:left;padding:6px 10px;background:#f5f5f5;border-bottom:1px solid #ddd;font-family:'DM Mono',monospace;font-size:8.5px;text-transform:uppercase;letter-spacing:.6px;color:#888}
      table.lines td{padding:6px 10px;border-bottom:1px solid #f3f3f3}
      .pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600}
      .pill-g{background:#e6f9f0;color:#1a7a4a} .pill-b{background:#e8f0fe;color:#2563eb}
      .pill-a{background:#fff3e0;color:#d48744} .pill-y{background:#fef9e7;color:#b8860b}
      .footer{margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:10px;color:#999;display:flex;justify-content:space-between}
      @media print{body{padding:0}.content{padding:18px 28px}@page{margin:10mm 8mm}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style>
  </head><body>
    <div class="page">
      <div class="header">
        <div class="logo-area">
          ${logoHtml}
          <div>
            <div class="company-name">${t.company_name}</div>
            <div class="company-sub">${t.company_tagline} · Sales Day Book — Detail</div>
          </div>
        </div>
        <div>
          <div class="doc-title">Detailed Sales Day Book</div>
          <div class="doc-meta">Period: ${fromDate} to ${toDate}<br>Generated: ${now}<br>${filtered.length} vouchers</div>
        </div>
      </div>

      <div class="content">
      <div class="summary-band">
        <div class="sb"><div class="sb-label">Gross Sales</div><div class="sb-val">TZS ${totalRevenue.toLocaleString()}</div></div>
        <div class="sb"><div class="sb-label">Cash · ${cashPct}%</div><div class="sb-val" style="color:#1a7a4a">TZS ${cashTotal.toLocaleString()}</div><div style="font-size:9px;color:#999;margin-top:2px">${cashCount} txns</div></div>
        <div class="sb"><div class="sb-label">Credit · ${creditPct}%</div><div class="sb-val" style="color:#2563eb">TZS ${creditTotal.toLocaleString()}</div><div style="font-size:9px;color:#999;margin-top:2px">${creditCount} txns</div></div>
        <div class="sb"><div class="sb-label">Margin</div><div class="sb-val" style="color:${totalMargin >= 0 ? '#1a7a4a' : '#c0392b'}">TZS ${totalMargin.toLocaleString()}</div><div style="font-size:9px;color:#999;margin-top:2px">${marginPct}% on cost ${totalCost.toLocaleString()}</div></div>
      </div>

      ${voucherCards}

      <div class="footer">
        <div>${t.company_name} · Dar es Salaam, Tanzania</div>
        <div>Generated ${now} · SOKORA</div>
      </div>
      </div>
    </div>
  </body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 600)
}
