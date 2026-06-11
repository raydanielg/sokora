import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import { useCategories } from '../lib/useCategories'
import CategoryFilter, { makeCategoryPredicate } from '../components/CategoryFilter'
import type { Page } from '../lib/types'
import { exportCSV as doExportCSV, exportPDF as doExportPDF, exportDetailPDF as doExportDetailPDF } from '../lib/salesDayBookExport'
import type { SDBSale, SDBExpense, SDBCreditNote, SDBTemplateSettings } from '../lib/salesDayBookExport'

interface Props {
  onNav?: (p: Page) => void
  onEdit?: (p: Page, voucherId: string) => void
}


export default function SalesDayBook({ onEdit }: Props) {
  const [sales, setSales] = useState<SDBSale[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'detail' | 'summary'>('summary')

  // 30-day trend
  const [trend30, setTrend30] = useState<{ date: string; total: number }[]>([])

  // Expenses + Credit Notes for PDF
  const [expenses, setExpenses] = useState<SDBExpense[]>([])
  const [creditNotes, setCreditNotes] = useState<SDBCreditNote[]>([])

  // PDF template settings
  const [tplSettings, setTplSettings] = useState<SDBTemplateSettings>({
    logo_url: null, logo_position: 'left', logo_width: 120, company_name: 'Your Organization', company_tagline: 'Reimagining Motherhood', primary_color: '#85c2be'
  })

  // Filters
  const today = new Date().toISOString().split('T')[0]
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [voucherType, setVoucherType] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchRef, setSearchRef] = useState('')
  const [searchCustomer, setSearchCustomer] = useState('')
  const [searchProduct, setSearchProduct] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [searchPayment, setSearchPayment] = useState('')
  const [searchSalesperson, setSearchSalesperson] = useState('')
  const { categories: _cats } = useCategories()
  const catPredicate = makeCategoryPredicate(filterCat, _cats)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => { loadSales(); loadTplSettings(); loadTrend() }, [])

  const loadTrend = async () => {
    const end = new Date()
    const start = new Date(Date.now() - 29 * 86400000)
    const startStr = start.toISOString().split('T')[0]
    const endStr = end.toISOString().split('T')[0]
    const { data } = await supabase
      .from('vouchers')
      .select('posting_date, total_amount, type')
      .in('type', ['cash_sale', 'sales_invoice'])
      .gte('posting_date', startStr)
      .lte('posting_date', endStr)
    const byDate: Record<string, number> = {}
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0]
      byDate[d] = 0
    }
    ;(data || []).forEach((v: any) => {
      if (byDate[v.posting_date] !== undefined) byDate[v.posting_date] += (v.total_amount || 0)
    })
    setTrend30(Object.entries(byDate).map(([date, total]) => ({ date, total })))
  }

  const loadSales = async (from?: string, to?: string) => {
    setLoading(true)
    const f = from || fromDate
    const t = to || toDate
    let query = supabase
      .from('vouchers')
      .select(`
        id, ref, type, posting_date, description, total_amount, subtotal,
        payment_method, payment_split, status, notes, posted_by,
        customers (name, whatsapp, pregnancy_stage, crown_points),
        voucher_lines (
          id, qty, unit_price, unit_cost, total,
          products (name, sku, category)
        )
      `)
      .in('type', ['cash_sale', 'sales_invoice'])
      .gte('posting_date', f)
      .lte('posting_date', t)
      .order('posting_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (voucherType !== 'all') query = query.eq('type', voucherType)
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)

    const { data, error } = await query
    if (!error && data) setSales(data as any)
    // Also load expenses for this period
    loadExpenses(f, t)
    setLoading(false)
  }

  const loadExpenses = async (from: string, to: string) => {
    const { data } = await supabase.from('vouchers')
      .select('ref, description, total_amount, payment_method, notes')
      .in('type', ['cash_payment', 'bank_payment', 'petty_cash'])
      .gte('posting_date', from).lte('posting_date', to)
      .eq('status', 'posted')
      .order('created_at', { ascending: false })
    if (data) setExpenses(data as any)

    const { data: cn } = await supabase.from('vouchers')
      .select('ref, description, total_amount, posting_date')
      .eq('type', 'credit_note')
      .gte('posting_date', from).lte('posting_date', to)
      .eq('status', 'posted')
      .order('created_at', { ascending: false })
    if (cn) setCreditNotes(cn as any)
  }

  const loadTplSettings = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'report_templates').single()
    if (data?.value) { try { const p = JSON.parse(data.value); setTplSettings(s => ({ ...s, ...p })) } catch {} }
  }

  // Client-side filtering
  const filtered = sales.filter(s => {
    const custName = (s.customers as any)?.name?.toLowerCase() || ''
    const custWa = (s.customers as any)?.whatsapp || ''
    const products = (s.voucher_lines || []).map((l: any) => l.products?.name?.toLowerCase() || '').join(' ')
    const payment = s.payment_method?.toLowerCase() || ''
    const salesperson = s.posted_by?.toLowerCase() || ''

    if (searchRef && !s.ref.toLowerCase().includes(searchRef.toLowerCase())) return false
    if (searchCustomer && !custName.includes(searchCustomer.toLowerCase()) && !custWa.includes(searchCustomer)) return false
    if (searchProduct && !products.includes(searchProduct.toLowerCase())) return false
    if (filterCat !== 'all' && !(s.voucher_lines || []).some((l: any) => l.products && catPredicate(l.products.category))) return false
    if (searchPayment && !payment.includes(searchPayment.toLowerCase())) return false
    if (searchSalesperson && !salesperson.includes(searchSalesperson.toLowerCase())) return false
    return true
  })

  // Totals
  const totalRevenue = filtered.reduce((s, v) => s + (v.total_amount || 0), 0)
  const totalCost = filtered.reduce((s: number, sale: any) => s + (sale.voucher_lines || []).reduce((acc: number, l: any) => acc + ((l.unit_cost || 0) * (l.qty || 0)), 0), 0)
  const totalMargin = totalRevenue - totalCost
  const marginPct = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : 0
  const podCount = filtered.filter(s => s.status === 'draft').length
  const postedCount = filtered.filter(s => s.status === 'posted').length

  // Cash vs Credit split (cash_sale = cash, sales_invoice = credit)
  const cashSales = filtered.filter(s => s.type === 'cash_sale')
  const creditSales = filtered.filter(s => s.type === 'sales_invoice')
  const cashTotal = cashSales.reduce((s, v) => s + (v.total_amount || 0), 0)
  const creditTotal = creditSales.reduce((s, v) => s + (v.total_amount || 0), 0)
  const cashPct = totalRevenue > 0 ? Math.round((cashTotal / totalRevenue) * 100) : 0
  const creditPct = totalRevenue > 0 ? Math.round((creditTotal / totalRevenue) * 100) : 0

  // Payment split — split by source (retail cash sales vs wholesale invoices)
  // so the breakdown doesn't lump them together. Previously, a single
  // paymentSplit bucket pulled in payment_method values from BOTH cash
  // sales and sales invoices; pure credit invoices fell through to their
  // raw payment_method string (often 'Debtor' or 'Credit'), causing a
  // misleading "Debtor" line to show up in what looked like a cash
  // breakdown. Now retail and wholesale are computed and rendered separately.
  const buildSplit = (rows: any[]): Record<string, number> => {
    const split: Record<string, number> = {}
    rows.forEach(s => {
      if (s.payment_split && typeof s.payment_split === 'object') {
        Object.entries(s.payment_split as Record<string, number>).forEach(([method, amount]) => {
          split[method] = (split[method] || 0) + (amount || 0)
        })
      } else {
        const method = (s.payment_method || 'Cash').trim()
        split[method] = (split[method] || 0) + (s.total_amount || 0)
      }
    })
    return split
  }
  const retailSplit: Record<string, number> = buildSplit(cashSales)
  // Wholesale (sales invoice) split. Only count what's actually been
  // received against the invoice (advance receipts), since the rest is
  // still AR and shouldn't appear as a "payment received" amount. If a
  // voucher has payment_split JSON, use it; otherwise treat the invoice
  // as unpaid and bucket it under 'Open AR (Wholesale)'.
  const wholesaleSplit: Record<string, number> = {}
  creditSales.forEach(s => {
    if (s.payment_split && typeof s.payment_split === 'object') {
      Object.entries(s.payment_split as Record<string, number>).forEach(([method, amount]) => {
        wholesaleSplit[method] = (wholesaleSplit[method] || 0) + (amount || 0)
      })
    } else {
      wholesaleSplit['Open AR (Wholesale)'] = (wholesaleSplit['Open AR (Wholesale)'] || 0) + (s.total_amount || 0)
    }
  })
  // Backward-compat: keep the combined `paymentSplit` for the CSV/PDF
  // export helpers below (they were written against the old single bucket).
  // We'll switch them later; for now build the same shape so nothing breaks.
  const paymentSplit: Record<string, number> = { ...retailSplit }
  Object.entries(wholesaleSplit).forEach(([k, v]) => {
    paymentSplit[k] = (paymentSplit[k] || 0) + v
  })

  // Expense split by payment method (bank)
  const totalExpenses = expenses.reduce((s, e) => s + (e.total_amount || 0), 0)
  const expenseSplit: Record<string, number> = {}
  expenses.forEach(e => {
    const key = e.payment_method || 'Cash'
    expenseSplit[key] = (expenseSplit[key] || 0) + (e.total_amount || 0)
  })

  // Credit notes
  const totalCreditNotes = creditNotes.reduce((s, c) => s + (c.total_amount || 0), 0)
  const netSales = totalRevenue - totalCreditNotes

  const clearFilters = () => {
    setSearchRef(''); setSearchCustomer(''); setSearchProduct('')
    setFilterCat('all'); setSearchPayment(''); setSearchSalesperson('')
    setVoucherType('all'); setStatusFilter('all')
  }

  const activeFilters = [searchRef, searchCustomer, searchProduct, searchPayment, searchSalesperson].filter(Boolean).length +
    (filterCat !== 'all' ? 1 : 0) +
    (voucherType !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)

  // ── EXPORT: CSV ──────────────────────────────────────────────────────
  const exportCSV = () => doExportCSV({ filtered, expenses, creditNotes, paymentSplit, expenseSplit, totalRevenue, totalExpenses, totalCreditNotes, netSales, totalCost, totalMargin, marginPct, cashTotal, creditTotal, cashCount: cashSales.length, creditCount: creditSales.length, cashPct, creditPct, fromDate, toDate, tplSettings })

  // ── EXPORT: PDF (Print) ──────────────────────────────────────────────
  // View-aware: Summary view → summary PDF; Detail view → per-voucher detail PDF.
  const exportPDF = () => {
    const payload = { filtered, expenses, creditNotes, paymentSplit, expenseSplit, totalRevenue, totalExpenses, totalCreditNotes, netSales, totalCost, totalMargin, marginPct, cashTotal, creditTotal, cashCount: cashSales.length, creditCount: creditSales.length, cashPct, creditPct, fromDate, toDate, tplSettings }
    if (view === 'detail') doExportDetailPDF(payload)
    else doExportPDF(payload)
  }

  return (
    <div className="page">
      {/* HEADER */}
      <div className="page-header">
        <div>
          <div className="page-title">Sales Day Book</div>
          <div className="page-sub">
            Today's transactions · {filtered.length} vouchers · <span className="sync-dot"></span> Live
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => loadSales()} style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={exportPDF} style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> {view === 'detail' ? 'Print / Detail PDF' : 'Print / PDF'}</button>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} style={{ display:"flex",alignItems:"center",gap:6  }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.09"/></svg> Export CSV</button>
        </div>
      </div>

      {/* DATE + VIEW CONTROLS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 12px' }}>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>From</span>
          <input type="date" className="form-input" style={{ width: 140, padding: '4px 8px', fontSize: 12, border: 'none', background: 'transparent' }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>To</span>
          <input type="date" className="form-input" style={{ width: 140, padding: '4px 8px', fontSize: 12, border: 'none', background: 'transparent' }} value={toDate} onChange={e => setToDate(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={() => loadSales()}>Load</button>
        </div>

        {/* Quick date presets */}
        {[
          { label: 'Today', from: new Date().toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] },
          { label: 'This Week', from: new Date(Date.now() - 6*86400000).toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] },
          { label: 'This Month', from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] },
        ].map(p => (
          <button key={p.label} className="btn btn-ghost btn-sm" onClick={() => { setFromDate(p.from); setToDate(p.to); loadSales(p.from, p.to) }}>{p.label}</button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {/* Cash/Credit quick toggle */}
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            <button onClick={() => setVoucherType('all')} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: voucherType === 'all' ? 'var(--accent)' : 'transparent', color: voucherType === 'all' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer' }}>All</button>
            <button onClick={() => setVoucherType('cash_sale')} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: voucherType === 'cash_sale' ? 'var(--green)' : 'transparent', color: voucherType === 'cash_sale' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderLeft: '1px solid var(--border)' }}>Cash</button>
            <button onClick={() => setVoucherType('sales_invoice')} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: voucherType === 'sales_invoice' ? 'var(--blue)' : 'transparent', color: voucherType === 'sales_invoice' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderLeft: '1px solid var(--border)' }}>Credit</button>
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className="btn btn-ghost btn-sm" style={{ position: 'relative' }}>
            Filters
            {activeFilters > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, background: 'var(--accent)', borderRadius: '50%', fontSize: 9, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{activeFilters}</span>}
          </button>
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            <button onClick={() => setView('summary')} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: view === 'summary' ? 'var(--accent)' : 'transparent', color: view === 'summary' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer' }}>Summary</button>
            <button onClick={() => setView('detail')} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: view === 'detail' ? 'var(--accent)' : 'transparent', color: view === 'detail' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer' }}>Detail</button>
          </div>
        </div>
      </div>

      {/* FILTER PANEL */}
      {showFilters && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700 }}>Filters</div>
            {activeFilters > 0 && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>× Clear all filters</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Voucher Ref</div>
              <input className="form-input" style={{ fontSize: 12 }} placeholder="e.g. CS-0001" value={searchRef} onChange={e => setSearchRef(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Customer / WhatsApp</div>
              <input className="form-input" style={{ fontSize: 12 }} placeholder="Name or number" value={searchCustomer} onChange={e => setSearchCustomer(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Product</div>
              <input className="form-input" style={{ fontSize: 12 }} placeholder="Product name" value={searchProduct} onChange={e => setSearchProduct(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Category / Group</div>
              <CategoryFilter value={filterCat} onChange={setFilterCat} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Payment Method</div>
              <input className="form-input" style={{ fontSize: 12 }} placeholder="Cash, M-Pesa, Bank" value={searchPayment} onChange={e => setSearchPayment(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Salesperson</div>
              <input className="form-input" style={{ fontSize: 12 }} placeholder="e.g. Joe, Lilian" value={searchSalesperson} onChange={e => setSearchSalesperson(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Voucher Type</div>
              <select className="form-input" style={{ fontSize: 12 }} value={voucherType} onChange={e => setVoucherType(e.target.value)}>
                <option value="all">All Types</option>
                <option value="cash_sale">Cash Sale</option>
                <option value="sales_invoice">Sales Invoice</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Status</div>
              <select className="form-input" style={{ fontSize: 12 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="posted">Posted</option>
                <option value="draft">POD Pending</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 30-DAY SALES TREND SPARKLINE */}
      {trend30.length > 0 && (() => {
        const maxVal = Math.max(...trend30.map(d => d.total), 1)
        const avg = trend30.reduce((s, d) => s + d.total, 0) / trend30.length
        const last7 = trend30.slice(-7).reduce((s, d) => s + d.total, 0)
        const prev7 = trend30.slice(-14, -7).reduce((s, d) => s + d.total, 0)
        const wowPct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : 0
        const w = 100, h = 28
        const points = trend30.map((d, i) => {
          const x = (i / (trend30.length - 1)) * w
          const y = h - (d.total / maxVal) * h
          return `${x},${y}`
        }).join(' ')
        const areaPoints = `0,${h} ${points} ${w},${h}`
        return (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 80 }}>30-day trend</div>
            <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ flex: 1, height: 32 }}>
              <polygon points={areaPoints} fill="var(--accent)" opacity="0.15" />
              <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </svg>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: 'var(--mono)' }}>
              <div>
                <div style={{ color: 'var(--text3)', fontSize: 9, textTransform: 'uppercase' }}>Daily Avg</div>
                <div style={{ color: 'var(--text)', fontWeight: 600 }}>{tzs(Math.round(avg))}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text3)', fontSize: 9, textTransform: 'uppercase' }}>Last 7d</div>
                <div style={{ color: 'var(--text)', fontWeight: 600 }}>{tzs(last7)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text3)', fontSize: 9, textTransform: 'uppercase' }}>WoW</div>
                <div style={{ color: wowPct >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{wowPct >= 0 ? '+' : ''}{wowPct}%</div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* STAT CARDS */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="stat-card green"><div className="stat-label">Total Revenue</div><div className="stat-value">{totalRevenue >= 1000000 ? (totalRevenue/1000000).toFixed(2)+'M' : (totalRevenue/1000).toFixed(0)+'K'}</div><div className="stat-change up">{filtered.length} vouchers</div></div>
        <div className="stat-card green"><div className="stat-label">Cash Sales</div><div className="stat-value">{cashTotal >= 1000000 ? (cashTotal/1000000).toFixed(2)+'M' : (cashTotal/1000).toFixed(0)+'K'}</div><div className="stat-change up">{cashSales.length} txns · {cashPct}%</div></div>
        <div className="stat-card blue"><div className="stat-label">Credit Sales</div><div className="stat-value">{creditTotal >= 1000000 ? (creditTotal/1000000).toFixed(2)+'M' : (creditTotal/1000).toFixed(0)+'K'}</div><div className="stat-change up">{creditSales.length} txns · {creditPct}%</div></div>
        <div className="stat-card amber"><div className="stat-label">Avg Sale</div><div className="stat-value">{filtered.length > 0 ? tzs(Math.round(totalRevenue / filtered.length)) : '—'}</div><div className="stat-change up">Per transaction</div></div>
        <div className="stat-card yellow"><div className="stat-label">Gross Margin</div><div className="stat-value">{marginPct}%</div><div className="stat-change up">{tzs(totalMargin)}</div></div>
      </div>

      {/* PAYMENT SPLIT (Retail + Wholesale) + STATUS */}
      <div className="grid g2" style={{ marginBottom: 20 }}>
        <div className="card card-sm">
          <div className="card-title" style={{ marginBottom: 12 }}>Payment Split</div>

          {/* Retail (cash sales) */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>
              Retail — Cash Sales <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({tzs(cashTotal)})</span>
            </div>
            {Object.keys(retailSplit).length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>No retail sales in this period</div>
            ) : Object.entries(retailSplit).map(([method, amount], i) => {
              const pct = cashTotal > 0 ? (amount / cashTotal) * 100 : 0
              return (
                <div key={'r' + i} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: 'var(--text3)' }}>{method}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(amount)} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{ height: 5, background: 'var(--surface3)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: method.includes('Cash') ? 'var(--green)' : method.includes('Pesa') || method.includes('pesa') ? 'var(--blue)' : 'var(--accent)', borderRadius: 3 }}></div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Wholesale (sales invoices) — separate block so debtor/AR
              entries don't get mixed into the cash breakdown. */}
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              Wholesale — Sales Invoices <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({tzs(creditTotal)})</span>
            </div>
            {Object.keys(wholesaleSplit).length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>No wholesale invoices in this period</div>
            ) : Object.entries(wholesaleSplit).map(([method, amount], i) => {
              const pct = creditTotal > 0 ? (amount / creditTotal) * 100 : 0
              const isOpenAR = method.startsWith('Open AR')
              return (
                <div key={'w' + i} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: isOpenAR ? 'var(--yellow, #f59e0b)' : 'var(--text3)', fontWeight: isOpenAR ? 600 : 400 }}>{method}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(amount)} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{ height: 5, background: 'var(--surface3)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: isOpenAR ? 'var(--yellow, #f59e0b)' : 'var(--accent)', borderRadius: 3 }}></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="card card-sm">
          <div className="card-title" style={{ marginBottom: 12 }}>Voucher Status</div>
          <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
            <div style={{ flex: 1, background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 'var(--r)', padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--display)' }}>{postedCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Posted ✓</div>
            </div>
            <div style={{ flex: 1, background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.2)', borderRadius: 'var(--r)', padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--yellow)', fontFamily: 'var(--display)' }}>{podCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>POD Pending </div>
            </div>
            <div style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--display)' }}>{filtered.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Total</div>
            </div>
          </div>
          {filtered.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Avg sale: <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(Math.round(totalRevenue / filtered.length))}</span> ·
              Avg margin: <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontWeight: 600 }}> {marginPct}%</span>
            </div>
          )}
        </div>
      </div>

      {/* ── SUMMARY VIEW ────────────────────────── */}
      {view === 'summary' && (
        <div className="card">
          <div className="card-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="card-title">Sales Register — Summary</div>
              <div className="card-sub">{filtered.length} transactions · {fromDate} to {toDate}</div>
            </div>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No sales found for this period and filters.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher No</th>
                    <th>Customer</th>
                    <th>WhatsApp</th>
                    <th>Payment / Bank</th>
                    <th>Salesperson</th>
                    <th>Status</th>
                    <th className="td-right">Amount (TZS)</th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={i} onClick={() => onEdit?.(s.type === 'sales_invoice' ? 'sales-invoice' : 'cash-sale', s.id)} style={{ cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td className="td-mono" style={{ color: 'var(--text3)', fontSize: 11 }}>{s.posting_date}</td>
                      <td className="td-mono td-amber">{s.ref}</td>
                      <td className="td-bold">{(s.customers as any)?.name || '—'}</td>
                      <td className="td-mono" style={{ color: 'var(--wa)', fontSize: 11 }}>{(s.customers as any)?.whatsapp || '—'}</td>
                      <td>
                        <span className={`pill ${s.payment_method?.includes('Cash') ? 'pill-green' : s.payment_method?.includes('M-Pesa') ? 'pill-blue' : s.payment_method?.includes('Mixx') ? 'pill-yellow' : s.payment_method?.includes('NMB') ? 'pill-blue' : s.payment_method?.includes('CRDB') ? 'pill-green' : s.payment_method?.includes('POS') ? 'pill-gray' : 'pill-amber'}`} style={{ fontSize: 10 }}>
                          {s.payment_method?.includes('Cash') ? '' : s.payment_method?.includes('M-Pesa') ? '' : s.payment_method?.includes('Mixx') ? '' : s.payment_method?.includes('NMB') ? '' : s.payment_method?.includes('CRDB') ? '' : s.payment_method?.includes('POS') ? '' : ''} {s.payment_method}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{s.posted_by || '—'}</td>
                      <td><span className={`pill ${s.status === 'posted' ? 'pill-green' : 'pill-yellow'}`} style={{ fontSize: 10 }}>{s.status === 'draft' ? 'POD' : 'Posted ✓'}</span></td>
                      <td className="td-right td-mono td-green" style={{ fontWeight: 600 }}>{s.total_amount?.toLocaleString()}</td>
                      <td style={{ width: 30 }}>
                        <svg width="14" height="14" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={7} className="td-bold" style={{ padding: '12px 14px' }}>TOTALS — {filtered.length} transactions</td>
                    <td className="td-right td-mono td-green" style={{ fontSize: 15, fontWeight: 800, padding: '12px 14px' }}>{totalRevenue.toLocaleString()}</td>
                    <td></td>
                  </tr>
                  {voucherType === 'all' && (
                    <>
                      <tr style={{ background: 'var(--surface)', fontSize: 12 }}>
                        <td colSpan={7} style={{ padding: '8px 14px 8px 30px', color: 'var(--text3)' }}>
                          <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--green)', borderRadius: 2, marginRight: 8, verticalAlign: 'middle' }}></span>
                          Cash Sales ({cashSales.length} txns · {cashPct}%)
                        </td>
                        <td className="td-right td-mono" style={{ color: 'var(--green)', fontWeight: 700, padding: '8px 14px' }}>{cashTotal.toLocaleString()}</td>
                        <td></td>
                      </tr>
                      <tr style={{ background: 'var(--surface)', fontSize: 12 }}>
                        <td colSpan={7} style={{ padding: '8px 14px 8px 30px', color: 'var(--text3)' }}>
                          <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--blue)', borderRadius: 2, marginRight: 8, verticalAlign: 'middle' }}></span>
                          Credit Sales ({creditSales.length} txns · {creditPct}%)
                        </td>
                        <td className="td-right td-mono" style={{ color: 'var(--blue)', fontWeight: 700, padding: '8px 14px' }}>{creditTotal.toLocaleString()}</td>
                        <td></td>
                      </tr>
                    </>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── DETAIL VIEW ─────────────────────────── */}
      {view === 'detail' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No sales found for this period and filters.</div>
          ) : (
            filtered.map((s, i) => {
              const custMargin = (s.voucher_lines || []).reduce((acc: number, l: any) => acc + ((l.unit_price - l.unit_cost) * l.qty), 0)
              const custMarginPct = (s.total_amount || 0) > 0 ? Math.round((custMargin / (s.total_amount || 1)) * 100) : 0
              return (
                <div key={i} className="card" style={{ borderLeft: `3px solid ${s.status === 'draft' ? 'var(--yellow)' : 'var(--green)'}` }}>
                  {/* Voucher Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{s.ref}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>{s.posting_date} · {s.posted_by}</div>
                      </div>
                      <span className={`pill ${s.status === 'posted' ? 'pill-green' : 'pill-yellow'}`}>{s.status === 'draft' ? 'POD Pending' : 'Posted ✓'}</span>
                      <span className={`pill ${s.payment_method?.includes('Cash') ? 'pill-green' : s.payment_method?.includes('M-Pesa') ? 'pill-blue' : s.payment_method?.includes('Mixx') ? 'pill-yellow' : s.payment_method?.includes('NMB') ? 'pill-blue' : s.payment_method?.includes('CRDB') ? 'pill-green' : s.payment_method?.includes('POS') ? 'pill-gray' : 'pill-amber'}`}>
                        {s.payment_method?.includes('Cash') ? '' : s.payment_method?.includes('M-Pesa') ? '' : s.payment_method?.includes('Mixx') ? '' : s.payment_method?.includes('NMB') ? '' : s.payment_method?.includes('CRDB') ? '' : s.payment_method?.includes('POS') ? '' : ''} {s.payment_method}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{tzs(s.total_amount || 0)}</div>
                      <div style={{ fontSize: 11, color: s.status === 'draft' ? 'var(--yellow)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>
                        {s.status === 'draft' ? 'Receipt pending' : '✓ Receipted'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                    {/* Customer */}
                    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>Customer</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{(s.customers as any)?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--wa)', fontFamily: 'var(--mono)' }}>{(s.customers as any)?.whatsapp || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{(s.customers as any)?.pregnancy_stage || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 4, fontFamily: 'var(--mono)' }}>{((s.customers as any)?.crown_points || 0).toLocaleString()} pts</div>
                    </div>

                    {/* Financial Summary */}
                    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>Financials</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                        <span style={{ color: 'var(--text3)' }}>Total</span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(s.total_amount || 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                        <span style={{ color: 'var(--text3)' }}>Margin</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>{custMarginPct}% · {tzs(custMargin)}</span>
                      </div>
                      {s.notes && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, fontStyle: 'italic' }}> {s.notes}</div>}
                    </div>

                    {/* Crown Points + CRM */}
                    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>CRM & Loyalty</div>
                      <div style={{ fontSize: 13, color: 'var(--yellow)', fontFamily: 'var(--mono)', fontWeight: 700, marginBottom: 6 }}>
                        +{Math.round((s.total_amount || 0) / 1000)} Crown pts earned
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>Total pts: {((s.customers as any)?.crown_points || 0).toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>WhatsApp receipt {s.status === 'draft' ? 'pending' : 'sent'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>Posted by: {s.posted_by}</div>
                    </div>
                  </div>

                  {/* Line Items */}
                  {(s.voucher_lines || []).length > 0 && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr style={{ background: 'var(--surface3)' }}>
                            <th>SKU</th><th>Product</th><th>Category</th>
                            <th className="td-right" style={{ width: 60 }}>Qty</th>
                            <th className="td-right" style={{ width: 120 }}>Unit Cost</th>
                            <th className="td-right" style={{ width: 120 }}>Unit Price</th>
                            <th className="td-right" style={{ width: 80 }}>Margin</th>
                            <th className="td-right" style={{ width: 130 }}>Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(s.voucher_lines as any[]).map((l, li) => {
                            const linePct = l.unit_price > 0 ? Math.round(((l.unit_price - l.unit_cost) / l.unit_price) * 100) : 0
                            return (
                              <tr key={li}>
                                <td className="td-mono td-amber" style={{ fontSize: 11 }}>{l.products?.sku || '—'}</td>
                                <td className="td-bold" style={{ fontSize: 12 }}>{l.products?.name || '—'}</td>
                                <td style={{ fontSize: 11, color: 'var(--text3)' }}>{l.products?.category || '—'}</td>
                                <td className="td-right td-mono" style={{ fontSize: 12 }}>{l.qty}</td>
                                <td className="td-right td-mono" style={{ fontSize: 12, color: 'var(--text3)' }}>{(l.unit_cost || 0).toLocaleString()}</td>
                                <td className="td-right td-mono" style={{ fontSize: 12 }}>{(l.unit_price || 0).toLocaleString()}</td>
                                <td className="td-right" style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'var(--mono)' }}>{linePct}%</td>
                                <td className="td-right td-mono td-green" style={{ fontWeight: 600 }}>{(l.total || 0).toLocaleString()}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* DETAIL TOTALS FOOTER */}
          {filtered.length > 0 && !loading && (
            <div style={{ background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 'var(--r)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>
                Period Totals — {fromDate} to {toDate} · {filtered.length} transactions
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                {[
                  { label: 'Revenue', value: tzs(totalRevenue), color: 'var(--green)' },
                  { label: 'Cash Sales', value: `${tzs(cashTotal)} (${cashPct}%)`, color: 'var(--green)' },
                  { label: 'Credit Sales', value: `${tzs(creditTotal)} (${creditPct}%)`, color: 'var(--blue)' },
                  { label: 'Cost of Goods', value: tzs(totalCost), color: 'var(--red)' },
                  { label: 'Gross Margin', value: `${tzs(totalMargin)} (${marginPct}%)`, color: 'var(--green)' },
                  { label: 'Avg per Sale', value: filtered.length > 0 ? tzs(Math.round(totalRevenue / filtered.length)) : '—', color: 'var(--text)' },
                ].map((item, i) => (
                  <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
