// ─── Internal Use Report ───────────────────────────────────────────────────
// Aggregates every internal-use voucher and tells the business where their
// stock is going when it's NOT being sold. Answers four questions at once:
//
//   1. How much are we writing off this period? (top KPIs)
//   2. Which category dominates? (samples vs damage vs own use etc)
//   3. Which products are consumed most? (product ranking)
//   4. Who is taking the most? (person ranking)
//
// Plus a drilldown transaction table so you can jump from any aggregate to
// the underlying vouchers and verify them against physical counts.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { tzs, today } from '../../lib/utils'
import type { Page } from '../../lib/types'
import Toast from '../../components/Toast'
import VoucherVerifyButton from '../../components/VoucherVerifyButton'

interface Props { onNav: (p: Page) => void }

// A flattened row = one voucher_line + voucher context. This is what we
// aggregate over.
interface IURow {
  voucher_id: string
  voucher_ref: string
  posting_date: string
  description: string     // holds category + taken-by in the format we wrote
  total_amount: number    // voucher total (same for every line in that voucher)
  notes: string | null
  product_id: string | null
  product_name: string
  product_sku: string
  qty: number
  unit_cost: number
  line_total: number
  // Derived from description parsing:
  category: string        // 'Sample / Marketing' etc
  takenBy: string         // 'Joe Gembe' etc
  recipient: string       // free text after · separator
}

// Parse "Internal Use — {Category} — {TakenBy} · {Recipient}" → parts.
// Voucher.description is the canonical source; this helper extracts the
// three fields we stamped at posting time.
function parseIUDescription(desc: string): { category: string; takenBy: string; recipient: string } {
  // Matches "Internal Use — CAT — BY · RECIPIENT" or without recipient
  const m = desc.match(/^Internal Use\s*—\s*(.+?)\s*—\s*([^·]+?)(?:\s*·\s*(.+))?$/)
  if (!m) return { category: 'Unknown', takenBy: 'Unknown', recipient: '' }
  return {
    category: (m[1] || '').trim(),
    takenBy: (m[2] || '').trim(),
    recipient: (m[3] || '').trim(),
  }
}

// ─── Date range presets ─────────────────────────────────────────────────
const DATE_PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Last 6 months', days: 180 },
  { label: 'This FY', days: 'fy' as const },
  { label: 'All time', days: -1 },
] as const

function rangeFromPreset(days: number | 'fy'): { from: string; to: string } {
  const to = today()
  if (days === 'fy') {
    // Tanzania FY typically July 1 → June 30. Adjust if you use calendar year.
    const now = new Date()
    const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
    return { from: `${year}-07-01`, to }
  }
  if (days < 0) return { from: '2000-01-01', to }
  const d = new Date(); d.setDate(d.getDate() - days)
  return { from: d.toISOString().split('T')[0], to }
}

// Consistent category colors, matched to the voucher form.
const CATEGORY_COLORS: Record<string, string> = {
  'Sample / Marketing': '#00e5a0',
  'Damage / Expired':   '#ef4444',
  'Own Use':            '#d4874a',
  'Training / Demo':    '#3d8bff',
  'Other':              '#94a3b8',
}
const catColor = (c: string) => CATEGORY_COLORS[c] || '#94a3b8'

// ─── Component ──────────────────────────────────────────────────────────

export default function InternalUseReport({ onNav }: Props) {
  const [rows, setRows] = useState<IURow[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(() => rangeFromPreset(90))
  const [activePreset, setActivePreset] = useState<number | 'fy' | null>(90)
  const [catFilter, setCatFilter] = useState<string>('all')
  const [personFilter, setPersonFilter] = useState<string>('all')
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  // View tab for the aggregation panels
  const [viewBy, setViewBy] = useState<'category' | 'product' | 'person'>('category')

  useEffect(() => { load() }, [range.from, range.to])

  const load = async () => {
    setLoading(true)
    // Pull vouchers of type 'internal_use' in range, plus their lines + product refs
    const { data, error } = await supabase
      .from('vouchers')
      .select(`
        id, ref, posting_date, description, total_amount, notes,
        voucher_lines (
          qty, unit_cost, total, product_id,
          products ( name, sku )
        )
      `)
      .eq('type', 'internal_use')
      .eq('status', 'posted')
      .gte('posting_date', range.from)
      .lte('posting_date', range.to)
      .order('posting_date', { ascending: false })

    if (error) {
      console.error('[internal-use-report] load failed:', error.message)
      setToast(`Load failed: ${error.message}`); setToastType('error')
      setLoading(false)
      return
    }

    // Flatten: each voucher becomes N rows (one per line). Keep the
    // voucher-level total for drilldown reference.
    const flat: IURow[] = []
    for (const v of data || []) {
      const parsed = parseIUDescription(v.description || '')
      for (const line of (v.voucher_lines as any[] || [])) {
        flat.push({
          voucher_id: v.id,
          voucher_ref: v.ref,
          posting_date: v.posting_date,
          description: v.description,
          total_amount: v.total_amount || 0,
          notes: v.notes,
          product_id: line.product_id,
          product_name: line.products?.name || '(deleted product)',
          product_sku: line.products?.sku || '—',
          qty: line.qty || 0,
          unit_cost: line.unit_cost || 0,
          line_total: line.total || 0,
          ...parsed,
        })
      }
    }
    setRows(flat)
    setLoading(false)
  }

  // ─── Filters applied to rows ──────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter(r =>
      (catFilter === 'all' || r.category === catFilter) &&
      (personFilter === 'all' || r.takenBy === personFilter)
    )
  }, [rows, catFilter, personFilter])

  // Unique values for filter dropdowns (from the unfiltered set so filters
  // don't hide themselves)
  const allCategories = useMemo(() => {
    return Array.from(new Set(rows.map(r => r.category))).sort()
  }, [rows])
  const allPersons = useMemo(() => {
    return Array.from(new Set(rows.map(r => r.takenBy))).sort()
  }, [rows])

  // ─── KPIs ─────────────────────────────────────────────────────────────
  const totalValue = filtered.reduce((s, r) => s + r.line_total, 0)
  const totalQty = filtered.reduce((s, r) => s + r.qty, 0)
  const uniqueVouchers = new Set(filtered.map(r => r.voucher_ref)).size
  const uniqueProducts = new Set(filtered.map(r => r.product_id)).size

  // ─── Aggregations ─────────────────────────────────────────────────────
  // For each group-by dimension, compute {key, count, qty, value}.

  const byCategory = useMemo(() => {
    const m = new Map<string, { qty: number; value: number; count: number }>()
    for (const r of filtered) {
      const e = m.get(r.category) || { qty: 0, value: 0, count: 0 }
      e.qty += r.qty; e.value += r.line_total; e.count += 1
      m.set(r.category, e)
    }
    return Array.from(m.entries())
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.value - a.value)
  }, [filtered])

  const byProduct = useMemo(() => {
    const m = new Map<string, { product_id: string | null; qty: number; value: number; count: number }>()
    for (const r of filtered) {
      const e = m.get(r.product_name) || { product_id: r.product_id, qty: 0, value: 0, count: 0 }
      e.qty += r.qty; e.value += r.line_total; e.count += 1
      m.set(r.product_name, e)
    }
    return Array.from(m.entries())
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.value - a.value)
  }, [filtered])

  const byPerson = useMemo(() => {
    const m = new Map<string, { qty: number; value: number; count: number }>()
    for (const r of filtered) {
      const e = m.get(r.takenBy) || { qty: 0, value: 0, count: 0 }
      e.qty += r.qty; e.value += r.line_total; e.count += 1
      m.set(r.takenBy, e)
    }
    return Array.from(m.entries())
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.value - a.value)
  }, [filtered])

  const activeAggregation =
    viewBy === 'category' ? byCategory
    : viewBy === 'product'  ? byProduct
    : byPerson

  // Max value for bar-chart scaling in aggregation panel
  const maxAggValue = Math.max(1, ...activeAggregation.map(a => a.value))

  // ─── CSV export ────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (filtered.length === 0) { setToast('No data to export'); setToastType('error'); return }
    const header = ['Date', 'Voucher', 'Category', 'Taken By', 'Recipient', 'Product', 'SKU', 'Qty', 'Unit Cost', 'Line Total', 'Notes']
    const lines = filtered.map(r => [
      r.posting_date, r.voucher_ref, r.category, r.takenBy, r.recipient,
      `"${r.product_name.replace(/"/g, '""')}"`, r.product_sku,
      r.qty.toString(), r.unit_cost.toString(), r.line_total.toString(),
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ])
    const csv = [header, ...lines].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `internal-use-report-${range.from}-to-${range.to}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    setToast(`Exported ${filtered.length} rows to CSV`); setToastType('success')
  }

  // Print handler (re-uses same recipe as Invoice templates)
  const printReport = () => {
    const el = document.getElementById('iu-report-printable')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Internal Use Report — ${range.from} to ${range.to}</title>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@600&display=swap" rel="stylesheet">
      <style>
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        body{padding:20px;background:#fff;font-family:'Instrument Sans',sans-serif;color:#111}
        *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
        @media print{ body{padding:0} .no-print{display:none !important} @page{size:A4;margin:10mm} }
        table{border-collapse:collapse;width:100%;font-size:11px}
        th,td{padding:6px 10px;text-align:left;border-bottom:1px solid #e0e0e0}
        th{background:#f5f5f5;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#666;font-weight:700}
        .num{text-align:right;font-family:'DM Mono',monospace}
        h1{font-family:'Syne',serif;font-size:20px;margin-bottom:4px}
        .meta{font-size:11px;color:#888;margin-bottom:16px}
        .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
        .kpi{padding:10px 14px;border:1px solid #e0e0e0;border-radius:6px}
        .kpi-label{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:'DM Mono',monospace}
        .kpi-value{font-family:'DM Mono',monospace;font-size:15px;font-weight:700}
      </style>
    </head><body>${el.outerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(212,135,74,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              <path d="M12 7v10M9 10h6M9 14h6"/>
            </svg>
          </div>
          <div>
            <div className="page-title">Internal Use Report</div>
            <div className="page-sub">Products consumed internally — samples, own use, damage, training</div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={exportCSV}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Export CSV
          </button>
          <button className="btn btn-primary" onClick={printReport}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print / PDF
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNav('internal-use')}>
            + New Entry
          </button>
        </div>
      </div>

      {/* Filters bar (not printed) */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Period:</span>
        {DATE_PRESETS.map(p => (
          <button key={p.label} onClick={() => { setRange(rangeFromPreset(p.days as any)); setActivePreset(p.days as any) }}
            style={{
              padding: '5px 11px', fontSize: 11, fontWeight: 600,
              border: `1px solid ${activePreset === p.days ? 'var(--accent)' : 'var(--border)'}`,
              background: activePreset === p.days ? 'var(--accent-dim)' : 'var(--surface)',
              color: activePreset === p.days ? 'var(--accent)' : 'var(--text3)',
              borderRadius: 6, cursor: 'pointer',
            }}>
            {p.label}
          </button>
        ))}
        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
        <input type="date" className="form-input" value={range.from}
          onChange={e => { setRange(r => ({ ...r, from: e.target.value })); setActivePreset(null) }}
          style={{ width: 140, fontSize: 12 }} />
        <span style={{ color: 'var(--text3)', fontSize: 11 }}>to</span>
        <input type="date" className="form-input" value={range.to}
          onChange={e => { setRange(r => ({ ...r, to: e.target.value })); setActivePreset(null) }}
          style={{ width: 140, fontSize: 12 }} />

        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Category:</span>
        <select className="form-input" value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ width: 180, fontSize: 12 }}>
          <option value="all">All categories</option>
          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Person:</span>
        <select className="form-input" value={personFilter} onChange={e => setPersonFilter(e.target.value)} style={{ width: 180, fontSize: 12 }}>
          <option value="all">All people</option>
          {allPersons.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* ═════ PRINTABLE REPORT ═════════════════════════════════════════ */}
      <div id="iu-report-printable">
        {/* Title block (for print) */}
        <div style={{ marginBottom: 14 }}>
          <h1 style={{ display: 'none' }}>Internal Use Report</h1>
          <div className="no-print-hide" style={{ fontSize: 11, color: 'var(--text3)' }}>
            Period: {range.from} → {range.to}
            {catFilter !== 'all' && ` · Category: ${catFilter}`}
            {personFilter !== 'all' && ` · Person: ${personFilter}`}
          </div>
        </div>

        {/* KPI strip */}
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'Total Value Consumed', val: tzs(totalValue), color: 'var(--accent)' },
            { label: 'Total Units', val: totalQty.toLocaleString(), color: 'var(--text)' },
            { label: 'Vouchers', val: uniqueVouchers.toString(), color: 'var(--text)' },
            { label: 'Unique Products', val: uniqueProducts.toString(), color: 'var(--text)' },
          ].map(k => (
            <div key={k.label} className="kpi" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div className="kpi-label" style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{k.label}</div>
              <div className="kpi-value" style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: k.color }}>{k.val}</div>
            </div>
          ))}
        </div>

        {/* Aggregation panel with view toggle */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="card-title" style={{ margin: 0 }}>Breakdown</div>
            <div className="no-print" style={{ display: 'flex', gap: 4, background: 'var(--surface2)', padding: 3, borderRadius: 8 }}>
              {(['category', 'product', 'person'] as const).map(v => (
                <button key={v} onClick={() => setViewBy(v)}
                  style={{
                    padding: '5px 14px', fontSize: 11, fontWeight: 600,
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                    background: viewBy === v ? 'var(--accent)' : 'transparent',
                    color: viewBy === v ? '#fff' : 'var(--text3)',
                    textTransform: 'capitalize',
                  }}>
                  By {v}
                </button>
              ))}
            </div>
          </div>

          {activeAggregation.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 12, fontStyle: 'italic' }}>
              No data in this range.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeAggregation.map(row => {
                const pct = (row.value / maxAggValue) * 100
                const color = viewBy === 'category' ? catColor(row.key) : 'var(--accent)'
                return (
                  <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '240px 1fr 90px 90px', gap: 12, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {row.key}
                    </div>
                    <div style={{ position: 'relative', height: 20, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute', inset: 0, width: `${pct}%`,
                        background: color, opacity: 0.85,
                        transition: 'width .3s',
                      }} />
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', textAlign: 'right' }}>
                      {row.qty} units · {row.count} {row.count === 1 ? 'entry' : 'entries'}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>
                      {tzs(row.value)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Transaction detail table */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>Transactions</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {filtered.length} {filtered.length === 1 ? 'row' : 'rows'}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 12, fontStyle: 'italic' }}>
              No transactions match the current filters.
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)' }}>
                    {['Date', 'Ref', 'Category', 'Taken By', 'Product', 'Qty', 'Unit Cost', 'Total', 'Recipient / Notes'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: i >= 5 && i <= 7 ? 'right' : 'left', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={`${r.voucher_ref}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{r.posting_date}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{r.voucher_ref}</span>
                          <VoucherVerifyButton voucherRef={r.voucher_ref} size="pill" label="" />
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, padding: '3px 7px', borderRadius: 4, background: `${catColor(r.category)}22`, color: catColor(r.category), whiteSpace: 'nowrap' }}>
                          {r.category}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 12 }}>{r.takenBy}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{r.product_name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{r.product_sku}</div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.qty}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{r.unit_cost.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{r.line_total.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text3)', maxWidth: 240 }}>
                        {r.recipient && <div>{r.recipient}</div>}
                        {r.notes && <div style={{ fontStyle: 'italic', marginTop: 2 }}>{r.notes}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--accent)', background: 'var(--surface2)' }}>
                    <td colSpan={5} style={{ padding: '12px 12px', fontWeight: 700, fontSize: 12 }}>TOTAL · {filtered.length} rows</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{totalQty.toLocaleString()}</td>
                    <td></td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>{totalValue.toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
      {/* ═════ END PRINTABLE REPORT ═════════════════════════════════════ */}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
