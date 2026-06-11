/**
 * Stock Report Export
 * ─────────────────────────────────────────────────────────────────────────
 * Single shared printer for both the Stock Valuation Report and the
 * Inventory page. Opens a print-ready window with the same branded
 * header as Sales Day Book / Investor Reports (consistent feel), then
 * fires the browser print dialog so the user can either send to a real
 * printer or pick "Save as PDF".
 *
 * Why browser print instead of jsPDF:
 *  • Multi-page pagination is free (browsers handle it natively).
 *  • Layout uses the same CSS as the screen, so we don't reinvent
 *    column sizing, fonts, kerning, etc.
 *  • The user picks the output (paper or PDF) at print time, which is
 *    actually more flexible than us deciding for them.
 *  • Zero new dependencies.
 *
 * The function accepts a generic shape that fits both pages: each row
 * has SKU, name, category, qty, optional cost/selling/value/margin.
 * The Inventory page can pass undefined for the financial fields and
 * the report will hide those columns automatically — that way the
 * cashier doesn't see cost prices on an Inventory printout, but
 * Finance sees the full picture on a Valuation Report printout.
 */

import { supabase } from './supabase'

export interface StockReportItem {
  sku: string
  name: string
  category: string
  unit?: string
  qty_on_hand: number
  reorder_point?: number
  cost_price?: number      // hidden in the printout when undefined
  selling_price?: number   // hidden when undefined
  value?: number           // hidden when undefined (qty × cost)
  potential_revenue?: number  // hidden when undefined (qty × selling)
  margin?: number          // hidden when undefined (% margin)
}

export interface StockReportMeta {
  /** What kind of report — drives the document title and which columns show */
  reportType: 'valuation' | 'inventory'
  /** Human-friendly title shown in the document */
  title: string
  /** Subtitle, e.g. "All locations · All categories" */
  subtitle?: string
  /** Date the snapshot reflects (ISO yyyy-mm-dd) */
  asAt: string
  /** Active filter labels — shown in a "Filters applied" strip */
  filters?: { label: string; value: string }[]
  /** Optional override for who's running the report */
  generatedBy?: string
}

interface ReportTemplate {
  logo_url: string | null
  logo_position: string
  logo_width: number
  company_name: string
  company_tagline: string
  primary_color: string
}

const DEFAULT_TEMPLATE: ReportTemplate = {
  logo_url: null,
  logo_position: 'left',
  logo_width: 120,
  company_name: 'Your Organization',
  company_tagline: 'Reimagining Motherhood',
  primary_color: '#85c2be',
}

/**
 * Fetches the report template from system_settings. Falls back to safe
 * defaults if the row is missing or malformed — never throws, so a
 * misconfigured DB cannot block a user from printing a report.
 */
async function loadTemplate(): Promise<ReportTemplate> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'report_templates')
      .maybeSingle()
    if (data?.value && typeof data.value === 'object') {
      return { ...DEFAULT_TEMPLATE, ...(data.value as Partial<ReportTemplate>) }
    }
  } catch {
    // swallow — defaults below
  }
  return DEFAULT_TEMPLATE
}

const escapeHtml = (s: string | undefined | null): string => {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const fmt = (n: number | undefined): string => {
  if (n == null || isNaN(n)) return '—'
  return Math.round(n).toLocaleString()
}

const fmtQty = (n: number): string => {
  // Quantities can be fractional (e.g. ml-based products) so we don't
  // round, but we still strip trailing zeros for readability.
  if (n == null || isNaN(n)) return '0'
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/**
 * Open a print-ready window with the stock report. The dialog fires
 * automatically once fonts and any logo image have loaded; the user
 * picks paper or PDF from there.
 *
 * The function returns immediately — printing is handled by the spawned
 * window, so the caller doesn't await anything.
 */
export async function exportStockReportPDF(
  items: StockReportItem[],
  meta: StockReportMeta,
): Promise<void> {
  if (items.length === 0) {
    alert('Nothing to print — the current filter has no items.')
    return
  }

  const tpl = await loadTemplate()
  const pc = tpl.primary_color || '#85c2be'
  const now = new Date().toLocaleString('en-GB')

  // Decide which financial columns to show. The Inventory page passes
  // undefined for these to keep the printout focused on stock levels,
  // not cost data which shouldn't be on every operator's printout.
  const hasCost = items.some(i => i.cost_price != null)
  const hasSelling = items.some(i => i.selling_price != null)
  const hasValue = items.some(i => i.value != null)
  const hasRevenue = items.some(i => i.potential_revenue != null)
  const hasMargin = items.some(i => i.margin != null)
  const hasReorder = items.some(i => i.reorder_point != null)

  // Totals row — only sums what makes sense. Quantities are always
  // summed; cost/revenue are summed when shown; margin is averaged.
  const totalQty = items.reduce((s, i) => s + (i.qty_on_hand || 0), 0)
  const totalValue = hasValue ? items.reduce((s, i) => s + (i.value || 0), 0) : 0
  const totalRevenue = hasRevenue ? items.reduce((s, i) => s + (i.potential_revenue || 0), 0) : 0
  const avgMargin = hasMargin && items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.margin || 0), 0) / items.length)
    : 0
  const zeroStock = items.filter(i => (i.qty_on_hand || 0) === 0).length
  const lowStock = items.filter(i => {
    const q = i.qty_on_hand || 0
    const rp = i.reorder_point ?? 10
    return q > 0 && q <= rp
  }).length

  // Build the column headers + data rows in one place so the row
  // structure and the header line up unambiguously.
  type Col = { label: string; align?: 'left' | 'right'; width?: string }
  const cols: Col[] = [
    { label: '#', align: 'right', width: '40px' },
    { label: 'SKU', width: '90px' },
    { label: 'Product' },
    { label: 'Category', width: '120px' },
  ]
  if (items.some(i => i.unit)) cols.push({ label: 'Unit', width: '60px' })
  cols.push({ label: 'Qty', align: 'right', width: '70px' })
  if (hasReorder) cols.push({ label: 'Reorder', align: 'right', width: '70px' })
  if (hasCost) cols.push({ label: 'Cost', align: 'right', width: '80px' })
  if (hasSelling) cols.push({ label: 'Selling', align: 'right', width: '80px' })
  if (hasValue) cols.push({ label: 'Stock Value', align: 'right', width: '110px' })
  if (hasRevenue) cols.push({ label: 'Pot. Revenue', align: 'right', width: '110px' })
  if (hasMargin) cols.push({ label: 'Margin %', align: 'right', width: '70px' })

  const headerHtml = cols.map(c =>
    `<th style="text-align:${c.align || 'left'}${c.width ? `;width:${c.width}` : ''}">${escapeHtml(c.label)}</th>`
  ).join('')

  // Stock-status pill colors mirror the on-screen palette so the printout
  // feels like a real continuation of the app, not a separate document.
  const statusPill = (qty: number, reorder: number = 10): string => {
    if (qty === 0) return `<span class="pill pill-r">OUT</span>`
    if (qty <= reorder) return `<span class="pill pill-y">LOW</span>`
    return ''
  }

  const rowsHtml = items.map((it, idx) => {
    const cells: string[] = []
    cells.push(`<td class="num mono" style="color:#aaa">${idx + 1}</td>`)
    cells.push(`<td class="mono">${escapeHtml(it.sku)}</td>`)
    cells.push(`<td>${escapeHtml(it.name)} ${statusPill(it.qty_on_hand || 0, it.reorder_point ?? 10)}</td>`)
    cells.push(`<td>${escapeHtml(it.category)}</td>`)
    if (items.some(i => i.unit)) cells.push(`<td class="mono" style="color:#888">${escapeHtml(it.unit || '')}</td>`)
    cells.push(`<td class="num"><strong>${fmtQty(it.qty_on_hand || 0)}</strong></td>`)
    if (hasReorder) cells.push(`<td class="num mono" style="color:#888">${fmtQty(it.reorder_point || 0)}</td>`)
    if (hasCost) cells.push(`<td class="num">${fmt(it.cost_price)}</td>`)
    if (hasSelling) cells.push(`<td class="num">${fmt(it.selling_price)}</td>`)
    if (hasValue) cells.push(`<td class="num">${fmt(it.value)}</td>`)
    if (hasRevenue) cells.push(`<td class="num">${fmt(it.potential_revenue)}</td>`)
    if (hasMargin) cells.push(`<td class="num mono" style="color:${(it.margin || 0) >= 30 ? '#1a7a4a' : (it.margin || 0) >= 15 ? '#d48744' : '#c0392b'}">${it.margin != null ? it.margin + '%' : '—'}</td>`)
    return `<tr>${cells.join('')}</tr>`
  }).join('')

  // Totals row — same column set as headers, only the numeric fields
  // are populated. Non-applicable cells render empty to preserve the
  // grid alignment.
  const totalsCells: string[] = []
  let placed = 0
  totalsCells.push(`<td colspan="${items.some(i => i.unit) ? 5 : 4}"><strong>TOTALS · ${items.length} items</strong></td>`)
  placed += items.some(i => i.unit) ? 5 : 4
  totalsCells.push(`<td class="num"><strong>${fmtQty(totalQty)}</strong></td>`); placed++
  if (hasReorder) { totalsCells.push(`<td></td>`); placed++ }
  if (hasCost) { totalsCells.push(`<td></td>`); placed++ }
  if (hasSelling) { totalsCells.push(`<td></td>`); placed++ }
  if (hasValue) { totalsCells.push(`<td class="num"><strong>${fmt(totalValue)}</strong></td>`); placed++ }
  if (hasRevenue) { totalsCells.push(`<td class="num"><strong>${fmt(totalRevenue)}</strong></td>`); placed++ }
  if (hasMargin) { totalsCells.push(`<td class="num mono"><strong>${avgMargin}%</strong></td>`); placed++ }
  void placed  // (kept for readability while building the row)

  const totalsHtml = `<tr class="total-row">${totalsCells.join('')}</tr>`

  // Filter strip — small grey row under the title telling whoever reads
  // the print what slice of data this represents. Important for audit:
  // a printout filtered to "Main Warehouse, Skincare category, low
  // stock only" looks identical to a full export unless we say so.
  const filterStrip = (meta.filters || [])
    .filter(f => f.value && f.value !== 'all' && f.value !== 'All')
    .map(f => `<span class="filter-chip"><span class="filter-label">${escapeHtml(f.label)}:</span> ${escapeHtml(f.value)}</span>`)
    .join('')

  const logoHtml = tpl.logo_url
    ? `<img src="${tpl.logo_url}" alt="Logo" style="width:${tpl.logo_width}px;height:auto;object-fit:contain" />`
    : `<div class="logo-mark"><div class="logo-inner"></div></div>`

  // Stats strip — chosen per report type. Inventory shows operational
  // numbers (alerts, item count); Valuation shows financial numbers.
  const statsHtml = meta.reportType === 'valuation'
    ? `
        <div class="stat"><div class="stat-label">Stock Value (at cost)</div><div class="stat-val blue">TZS ${fmt(totalValue)}</div></div>
        <div class="stat"><div class="stat-label">Potential Revenue</div><div class="stat-val green">TZS ${fmt(totalRevenue)}</div></div>
        <div class="stat"><div class="stat-label">Potential GP</div><div class="stat-val amber">TZS ${fmt(totalRevenue - totalValue)}</div></div>
        <div class="stat"><div class="stat-label">Avg Margin</div><div class="stat-val">${avgMargin}%</div></div>
        <div class="stat"><div class="stat-label">Stock Alerts</div><div class="stat-val red">${zeroStock + lowStock}</div></div>
      `
    : `
        <div class="stat"><div class="stat-label">Active Products</div><div class="stat-val blue">${items.length}</div></div>
        <div class="stat"><div class="stat-label">Total Units</div><div class="stat-val">${fmtQty(totalQty)}</div></div>
        <div class="stat"><div class="stat-label">Out of Stock</div><div class="stat-val red">${zeroStock}</div></div>
        <div class="stat"><div class="stat-label">Low Stock</div><div class="stat-val amber">${lowStock}</div></div>
        <div class="stat"><div class="stat-label">Healthy Stock</div><div class="stat-val green">${items.length - zeroStock - lowStock}</div></div>
      `

  const win = window.open('', '_blank')
  if (!win) {
    alert('Could not open the print window — please allow pop-ups for this site and try again.')
    return
  }

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(meta.title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@500;600&display=swap" rel="stylesheet">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Instrument Sans','Helvetica Neue',sans-serif;color:#1a1a1a;background:#fff}
      .page{max-width:1100px;margin:0 auto}
      .header{display:flex;justify-content:space-between;align-items:center;padding:24px 40px;background:${pc};color:#fff}
      .logo-area{display:flex;align-items:center;gap:14px}
      .logo-mark{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center}
      .logo-inner{width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.5)}
      .company-name{font-family:'Syne',serif;font-size:20px;font-weight:800;letter-spacing:-.3px;color:#fff}
      .company-sub{font-size:10px;color:rgba(255,255,255,.75);margin-top:3px}
      .doc-title{font-family:'Syne',serif;font-size:22px;font-weight:800;text-align:right;color:#fff}
      .doc-meta{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.7);text-align:right;margin-top:4px;line-height:1.6}
      .content{padding:24px 40px}
      .filter-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
      .filter-chip{background:#f5f5f5;border:1px solid #e5e5e5;border-radius:14px;padding:4px 10px;font-size:10px;color:#444}
      .filter-label{font-family:'DM Mono',monospace;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-right:4px}
      .stats{display:flex;gap:10px;margin-bottom:20px}
      .stat{flex:1;background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:11px 13px}
      .stat-label{font-family:'DM Mono',monospace;font-size:8.5px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
      .stat-val{font-family:'DM Mono',monospace;font-size:15px;font-weight:700}
      .stat-val.green{color:#1a7a4a} .stat-val.blue{color:#2563eb}
      .stat-val.amber{color:#d48744} .stat-val.red{color:#c0392b}
      table{width:100%;border-collapse:collapse;font-size:10.5px;table-layout:auto}
      th{text-align:left;padding:7px 8px;background:#f5f5f5;border-bottom:2px solid #ddd;font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#888;position:sticky;top:0}
      td{padding:6px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top}
      .num{text-align:right;font-family:'DM Mono',monospace}
      .mono{font-family:'DM Mono',monospace}
      .pill{display:inline-block;padding:1px 6px;border-radius:8px;font-size:8.5px;font-weight:700;margin-left:4px;vertical-align:middle}
      .pill-y{background:#fef9e7;color:#b8860b}
      .pill-r{background:#fee;color:#c0392b}
      .total-row td{background:#f5f5f5;padding:8px;border-top:2px solid #ddd;border-bottom:none;font-size:11px}
      tbody tr:nth-child(even):not(.total-row) td{background:#fcfcfc}
      .footer{margin-top:18px;padding-top:14px;border-top:1px solid #eee;font-size:9.5px;color:#999;display:flex;justify-content:space-between}
      @media print{
        body{padding:0}
        .content{padding:18px 28px}
        @page{size:A4 landscape;margin:8mm 6mm}
        .header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
        thead{display:table-header-group}
        tr{page-break-inside:avoid}
        .total-row{page-break-before:avoid}
      }
    </style>
  </head><body>
    <div class="page">
      <div class="header">
        <div class="logo-area">
          ${logoHtml}
          <div>
            <div class="company-name">${escapeHtml(tpl.company_name)}</div>
            <div class="company-sub">${escapeHtml(tpl.company_tagline)} · ${escapeHtml(meta.title)}</div>
          </div>
        </div>
        <div>
          <div class="doc-title">${escapeHtml(meta.title)}</div>
          <div class="doc-meta">
            As at: ${escapeHtml(meta.asAt)}<br>
            Generated: ${now}<br>
            ${items.length} item${items.length === 1 ? '' : 's'}${meta.generatedBy ? `<br>By: ${escapeHtml(meta.generatedBy)}` : ''}
          </div>
        </div>
      </div>

      <div class="content">
        ${filterStrip ? `<div class="filter-row">${filterStrip}</div>` : ''}

        <div class="stats">${statsHtml}</div>

        <table>
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>
            ${rowsHtml}
            ${totalsHtml}
          </tbody>
        </table>

        <div class="footer">
          <span>${escapeHtml(tpl.company_name)} · ${escapeHtml(meta.title)}</span>
          <span>Page <span class="pageno"></span></span>
        </div>
      </div>
    </div>
    <script>
      // Wait for fonts + logo image (if any) before firing the print
      // dialog. Logo loading is the slow path — without this, the print
      // preview renders with a missing image.
      const ready = () => { try { window.focus(); window.print(); } catch(e){} }
      const img = document.querySelector('img')
      if (img && !img.complete) {
        img.addEventListener('load', ready)
        img.addEventListener('error', ready)
        // Safety net: print after 2s even if the logo is wedged
        setTimeout(ready, 2000)
      } else if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(ready).catch(ready)
      } else {
        setTimeout(ready, 400)
      }
    </script>
  </body></html>`)
  win.document.close()
}
