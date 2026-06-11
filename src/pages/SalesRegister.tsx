import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useCategories } from '../lib/useCategories'
import CategoryFilter, { makeCategoryPredicate } from '../components/CategoryFilter'
import { useBundleSales } from '../lib/useBundles'
import { useSalesTargets, calcTargetProgress } from '../lib/useSalesTargets'
import type { SalesTarget, TargetProgress } from '../lib/useSalesTargets'
import Toast from '../components/Toast'
import { tzs, getPostedBy } from '../lib/utils'
import type { Page } from '../lib/types'

// ── Types ───────────────────────────────────────────────────
interface VoucherLine {
  id: string; qty: number; unit_price: number; unit_cost: number; total: number
  products: { id: string; name: string; sku: string; category: string } | null
}
interface Sale {
  id: string; ref: string; description: string; total_amount: number; subtotal: number
  payment_method: string; posting_date: string; status: string; type: string
  customer_id: string | null; posted_by: string | null
  customers: { id: string; name: string; whatsapp: string; segment: string; crown_points: number } | null
  voucher_lines: VoucherLine[]
}
interface ProductRow {
  productId: string; sku: string; name: string; category: string
  unitsSold: number; revenue: number; cost: number; margin: number; marginPct: number
  avgPrice: number; txCount: number
}
interface CustomerRow {
  customerId: string; name: string; whatsapp: string; segment: string
  txCount: number; unitsSold: number; revenue: number
  cashRevenue: number; creditRevenue: number
  margin: number; marginPct: number; lastPurchase: string; crownPoints: number
}
interface SalespersonRow {
  name: string; txCount: number; revenue: number; cashRevenue: number
  creditRevenue: number; avgTicket: number
}
interface LedgerEntry {
  id: string; posting_date: string; document_type: string; document_ref: string
  description: string; amount: number; remaining_amount: number
  is_open: boolean; due_date: string
  // Resolved separately after load by looking up vouchers by ref — not a schema column
  source_voucher_id?: string | null
}

interface Props {
  onEdit?: (p: Page, voucherId: string) => void
}

type Tab = 'transactions' | 'products' | 'customers' | 'salespeople' | 'bundles' | 'compare' | 'targets'
type TypeFilter = 'all' | 'cash' | 'credit'

const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
const todayStr = () => new Date().toISOString().split('T')[0]
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0]

// ── To-date period helpers ─────────────────────────────────────────────
// "Quarter" is calendar quarter: Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec
const isoDate = (d: Date) => d.toISOString().split('T')[0]
const quarterStartMonth = (m: number) => Math.floor(m / 3) * 3  // 0,3,6,9
const yearStart = (y: number) => isoDate(new Date(y, 0, 1))
const quarterStartFor = (y: number, m: number) => isoDate(new Date(y, quarterStartMonth(m), 1))
const monthStartFor = (y: number, m: number) => isoDate(new Date(y, m, 1))

/**
 * For a given anchor date (today, by default), return the "current to-date"
 * range and the "previous period to-date" range for month, quarter, and year.
 * Previous period uses same number of elapsed days within the prior period
 * for an apples-to-apples partial comparison.
 *
 * Example (anchor = 2 May 2026):
 *   month   → cur [1 May 2026, 2 May 2026], prev [1 Apr 2026, 2 Apr 2026]
 *   quarter → cur [1 Apr 2026, 2 May 2026], prev [1 Jan 2026, 2 Feb 2026]
 *   year    → cur [1 Jan 2026, 2 May 2026], prev [1 Jan 2025, 2 May 2025]
 */
function buildToDatePresets(anchor: Date = new Date()) {
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  const today = isoDate(anchor)

  // Days elapsed since the start of the period — used for prev-period offset.
  const monthElapsed = anchor.getDate() - 1  // 0-indexed days within month
  const qStartDate = new Date(y, quarterStartMonth(m), 1)
  const quarterElapsedDays = Math.floor((anchor.getTime() - qStartDate.getTime()) / 86400000)
  const yearElapsedDays = Math.floor((anchor.getTime() - new Date(y, 0, 1).getTime()) / 86400000)

  // Month-to-date vs last MTD: same day-of-month last month.
  // Use `min(today's day, last month's last day)` so e.g. 31 Mar vs 28 Feb is still safe.
  const prevMonthYear = m === 0 ? y - 1 : y
  const prevMonthMonth = m === 0 ? 11 : m - 1
  const prevMonthLastDay = new Date(prevMonthYear, prevMonthMonth + 1, 0).getDate()
  const prevMonthDay = Math.min(anchor.getDate(), prevMonthLastDay)

  // Quarter-to-date vs last QTD: take same number of elapsed days from prior quarter start.
  const prevQuarterStart = new Date(qStartDate)
  prevQuarterStart.setMonth(prevQuarterStart.getMonth() - 3)
  const prevQuarterAnchor = new Date(prevQuarterStart)
  prevQuarterAnchor.setDate(prevQuarterAnchor.getDate() + quarterElapsedDays)

  // Year-to-date vs last YTD: same date one year back.
  const prevYearAnchor = new Date(anchor)
  prevYearAnchor.setFullYear(y - 1)

  return {
    monthToDate: {
      cur: [monthStartFor(y, m), today],
      prev: [monthStartFor(prevMonthYear, prevMonthMonth), isoDate(new Date(prevMonthYear, prevMonthMonth, prevMonthDay))],
      elapsed: monthElapsed + 1,
    },
    quarterToDate: {
      cur: [quarterStartFor(y, m), today],
      prev: [isoDate(prevQuarterStart), isoDate(prevQuarterAnchor)],
      elapsed: quarterElapsedDays + 1,
    },
    yearToDate: {
      cur: [yearStart(y), today],
      prev: [yearStart(y - 1), isoDate(prevYearAnchor)],
      elapsed: yearElapsedDays + 1,
    },
  }
}

function periodLabel(type: string) {
  return type === 'annual' ? 'Annual' : type === 'quarterly' ? 'Quarterly' : 'Monthly'
}

// ── Main Component ──────────────────────────────────────────
export default function SalesRegister({ onEdit }: Props = {}) {
  const [tab, setTab] = useState<Tab>('transactions')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Cash / Credit / All filter (global across tabs)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  // Customer drawer state
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)
  const [customerLedger, setCustomerLedger] = useState<LedgerEntry[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

  // Shared date range
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(todayStr())

  // Core sales data
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState('all')
  const { categories } = useCategories()

  // Outstanding receivables
  const [outstanding, setOutstanding] = useState<{ customer_id: string; customer_name: string; remaining: number; days_overdue: number }[]>([])

  // Customers tab sort
  const [custSortCol, setCustSortCol] = useState<keyof CustomerRow>('revenue')
  const [custSortDir, setCustSortDir] = useState<'asc' | 'desc'>('desc')
  const [custSearch, setCustSearch] = useState('')

  // Salespeople tab sort
  const [spSortCol, setSpSortCol] = useState<keyof SalespersonRow>('revenue')
  const [spSortDir, setSpSortDir] = useState<'asc' | 'desc'>('desc')

  // Compare state
  const [compareFrom, setCompareFrom] = useState(daysAgo(60))
  const [compareTo, setCompareTo] = useState(daysAgo(31))
  const [compareSales, setCompareSales] = useState<Sale[]>([])
  const [compareLoading, setCompareLoading] = useState(false)

  // Targets
  const { targets, loading: targetsLoading, create: createTarget, update: updateTarget, remove: removeTarget, toggle: toggleTarget } = useSalesTargets()
  const [showTargetForm, setShowTargetForm] = useState(false)
  const [editingTarget, setEditingTarget] = useState<SalesTarget | null>(null)
  const [targetForm, setTargetForm] = useState({
    name: '', period_type: 'monthly' as SalesTarget['period_type'],
    metric: 'revenue' as SalesTarget['metric'], target_value: '',
    product_id: '', category: '', start_date: monthStart(), end_date: '',
    notes: ''
  })
  const [products, setProducts] = useState<{ id: string; name: string; sku: string; category: string }[]>([])
  const [targetProgress, setTargetProgress] = useState<TargetProgress[]>([])

  // Bundles
  const { sales: bundleSales, totalBundlesSold, totalRevenue: bundleRevenue, totalSavingsGiven, byBundle, loading: bundlesLoading, refresh: refreshBundles } = useBundleSales(fromDate, toDate)

  // Sort state for product tab
  const [sortCol, setSortCol] = useState<keyof ProductRow>('revenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Data Loading ──────────────────────────────────────────
  const loadSales = useCallback(async (from?: string, to?: string) => {
    setLoading(true)
    const f = from || fromDate, t = to || toDate
    const { data } = await supabase
      .from('vouchers')
      .select(`id, ref, description, total_amount, subtotal, payment_method, posting_date, status, type, customer_id, posted_by,
        customers(id, name, whatsapp, segment, crown_points),
        voucher_lines(id, qty, unit_price, unit_cost, total, products(id, name, sku, category))`)
      .in('type', ['cash_sale', 'sales_invoice'])
      .gte('posting_date', f).lte('posting_date', t)
      .order('posting_date', { ascending: false })
    if (data) setSales(data as any)
    setLoading(false)
    loadOutstanding()
  }, [fromDate, toDate])

  const loadOutstanding = useCallback(async () => {
    const { data } = await supabase.from('customer_ledger_entries')
      .select('customer_id, remaining_amount, due_date, posting_date, customers(name)')
      .eq('is_open', true).gt('remaining_amount', 0)
    if (!data) return
    const today = new Date()
    const byCustomer: Record<string, { customer_id: string; customer_name: string; remaining: number; days_overdue: number }> = {}
    data.forEach((e: any) => {
      const due = e.due_date ? new Date(e.due_date) : new Date(e.posting_date)
      const days = Math.floor((today.getTime() - due.getTime()) / 86400000)
      const key = e.customer_id
      if (!byCustomer[key]) byCustomer[key] = { customer_id: key, customer_name: e.customers?.name || 'Unknown', remaining: 0, days_overdue: 0 }
      byCustomer[key].remaining += (e.remaining_amount || 0)
      if (days > byCustomer[key].days_overdue) byCustomer[key].days_overdue = days
    })
    setOutstanding(Object.values(byCustomer).sort((a, b) => b.remaining - a.remaining))
  }, [])

  // Open customer ledger drawer — walk-in customers (synthetic IDs starting with __walkin_) have no ledger
  const openCustomerLedger = async (c: CustomerRow) => {
    setSelectedCustomer(c)
    if (c.customerId.startsWith('__walkin_')) {
      setCustomerLedger([])
      return
    }
    setLedgerLoading(true)

    // 1. Pull ledger entries (credit sales, POD, payments, credit/debit notes)
    const { data: ledgerData, error: ledgerErr } = await supabase
      .from('customer_ledger_entries')
      .select('id, posting_date, document_type, document_ref, description, amount, remaining_amount, is_open, due_date')
      .eq('customer_id', c.customerId)
      .order('posting_date', { ascending: false })
      .order('id', { ascending: false })
    if (ledgerErr) console.warn('[ledger] load failed:', ledgerErr.message)

    // 2. Pull cash sales for this customer (these don't create ledger entries automatically)
    // so we synthesize them as settled ledger entries to complete the picture
    const { data: cashData, error: cashErr } = await supabase
      .from('vouchers')
      .select('id, ref, posting_date, total_amount, description, status')
      .eq('customer_id', c.customerId)
      .eq('type', 'cash_sale')
      .order('posting_date', { ascending: false })
    if (cashErr) console.warn('[ledger] cash sales load failed:', cashErr.message)

    // 3. Build ref → voucher_id map for all entries (so refs are clickable)
    const refs = [...(ledgerData || []).map((e: any) => e.document_ref), ...(cashData || []).map((v: any) => v.ref)].filter(Boolean)
    const refToId: Record<string, string> = {}
    if (refs.length > 0) {
      const { data: voucherLookups } = await supabase
        .from('vouchers')
        .select('id, ref')
        .in('ref', refs)
      ;(voucherLookups || []).forEach((v: any) => { refToId[v.ref] = v.id })
    }

    // 4. Merge
    const fromLedger: LedgerEntry[] = (ledgerData || []).map((e: any) => ({
      ...e,
      source_voucher_id: refToId[e.document_ref] || null,
    }))
    const fromCashSales: LedgerEntry[] = (cashData || []).map((v: any) => ({
      id: `cash_${v.id}`,
      posting_date: v.posting_date,
      document_type: 'cash_sale',
      document_ref: v.ref,
      description: v.description || 'Cash Sale',
      amount: v.total_amount || 0,
      remaining_amount: 0,
      is_open: false,
      due_date: v.posting_date,
      source_voucher_id: v.id,
    }))
    const merged = [...fromLedger, ...fromCashSales].sort((a, b) => {
      if (a.posting_date !== b.posting_date) return a.posting_date < b.posting_date ? 1 : -1
      return a.id < b.id ? 1 : -1
    })

    setCustomerLedger(merged)
    setLedgerLoading(false)
  }

  // Open ledger for a customer referenced only by id (e.g. from the Outstanding panel).
  // Builds a synthetic CustomerRow using whatever is available from current sales data.
  const openCustomerLedgerById = (customerId: string, fallbackName: string) => {
    const existing = customerRows.find(r => r.customerId === customerId)
    if (existing) return openCustomerLedger(existing)
    const synthetic: CustomerRow = {
      customerId, name: fallbackName, whatsapp: '', segment: '',
      txCount: 0, unitsSold: 0, revenue: 0, cashRevenue: 0, creditRevenue: 0,
      margin: 0, marginPct: 0, lastPurchase: '', crownPoints: 0,
    }
    return openCustomerLedger(synthetic)
  }
  const closeCustomerLedger = () => { setSelectedCustomer(null); setCustomerLedger([]) }

  const loadCompareSales = useCallback(async () => {
    setCompareLoading(true)
    const { data } = await supabase
      .from('vouchers')
      .select(`id, ref, total_amount, posting_date, status, type,
        voucher_lines(id, qty, unit_price, unit_cost, total, products(id, name, sku, category))`)
      .in('type', ['cash_sale', 'sales_invoice'])
      .gte('posting_date', compareFrom).lte('posting_date', compareTo)
      .order('posting_date', { ascending: false })
    if (data) setCompareSales(data as any)
    setCompareLoading(false)
  }, [compareFrom, compareTo])

  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from('products').select('id, name, sku, category').eq('is_active', true).order('name')
    if (data) setProducts(data)
  }, [])

  // Load target progress
  const loadTargetProgress = useCallback(async () => {
    const activeTs = targets.filter(t => t.is_active)
    if (activeTs.length === 0) { setTargetProgress([]); return }

    const results: TargetProgress[] = []
    for (const t of activeTs) {
      if (t.product_id) {
        const { data: lines } = await supabase
          .from('voucher_lines')
          .select('qty, total, vouchers!inner(posting_date, type, status)')
          .eq('product_id', t.product_id)
          .gte('vouchers.posting_date', t.start_date)
          .lte('vouchers.posting_date', t.end_date)
          .in('vouchers.type', ['cash_sale', 'sales_invoice'])
          .eq('vouchers.status', 'posted')
        const current = t.metric === 'revenue'
          ? (lines || []).reduce((s: number, l: any) => s + (l.total || 0), 0)
          : (lines || []).reduce((s: number, l: any) => s + (l.qty || 0), 0)
        results.push(calcTargetProgress(t, current))
      } else if (t.category) {
        const { data: lines } = await supabase
          .from('voucher_lines')
          .select('qty, total, products!inner(category), vouchers!inner(posting_date, type, status)')
          .eq('products.category', t.category)
          .gte('vouchers.posting_date', t.start_date)
          .lte('vouchers.posting_date', t.end_date)
          .in('vouchers.type', ['cash_sale', 'sales_invoice'])
          .eq('vouchers.status', 'posted')
        const current = t.metric === 'revenue'
          ? (lines || []).reduce((s: number, l: any) => s + (l.total || 0), 0)
          : (lines || []).reduce((s: number, l: any) => s + (l.qty || 0), 0)
        results.push(calcTargetProgress(t, current))
      } else {
        const { data } = await supabase
          .from('vouchers')
          .select('total_amount, voucher_lines(qty)')
          .in('type', ['cash_sale', 'sales_invoice'])
          .eq('status', 'posted')
          .gte('posting_date', t.start_date)
          .lte('posting_date', t.end_date)
        const current = t.metric === 'revenue'
          ? (data || []).reduce((s: number, v: any) => s + (v.total_amount || 0), 0)
          : (data || []).reduce((s: number, v: any) => s + (v.voucher_lines || []).reduce((a: number, l: any) => a + (l.qty || 0), 0), 0)
        results.push(calcTargetProgress(t, current))
      }
    }
    setTargetProgress(results)
  }, [targets])

  useEffect(() => { loadSales() }, [])
  useEffect(() => { if (tab === 'compare') loadCompareSales() }, [tab, compareFrom, compareTo])
  useEffect(() => { if (tab === 'targets') { loadProducts(); loadTargetProgress() } }, [tab, targets])

  // ── Derived Data ──────────────────────────────────────────
  const catPredicate = makeCategoryPredicate(filterCat, categories)
  const typeFiltered = typeFilter === 'all' ? sales
    : typeFilter === 'cash' ? sales.filter(s => s.type === 'cash_sale')
    : sales.filter(s => s.type === 'sales_invoice')
  const filtered = filterCat === 'all' ? typeFiltered : typeFiltered.filter(s =>
    (s.voucher_lines || []).some(l => l.products && catPredicate(l.products.category))
  )
  const totalRevenue = filtered.reduce((s, v) => s + (v.total_amount || 0), 0)

  // Cash / Credit totals (always computed off full typeFiltered-agnostic set, so UI can always show split)
  const cashSales = filtered.filter(s => s.type === 'cash_sale')
  const creditSales = filtered.filter(s => s.type === 'sales_invoice')
  const cashTotal = cashSales.reduce((s, v) => s + (v.total_amount || 0), 0)
  const creditTotal = creditSales.reduce((s, v) => s + (v.total_amount || 0), 0)
  const cashPct = totalRevenue > 0 ? Math.round((cashTotal / totalRevenue) * 100) : 0
  const creditPct = totalRevenue > 0 ? Math.round((creditTotal / totalRevenue) * 100) : 0

  // Total outstanding from credit sales (from ledger, not sales window)
  const totalOutstanding = outstanding.reduce((s, o) => s + o.remaining, 0)
  const overdueCount = outstanding.filter(o => o.days_overdue > 0).length

  // Product aggregation
  const productRows = useMemo(() => {
    const map: Record<string, ProductRow> = {}
    const src = filterCat === 'all' ? sales : filtered
    src.forEach(s => {
      (s.voucher_lines || []).forEach(l => {
        if (!l.products) return
        if (filterCat !== 'all' && !catPredicate(l.products.category)) return
        const key = l.products.id
        if (!map[key]) {
          map[key] = {
            productId: l.products.id, sku: l.products.sku, name: l.products.name,
            category: l.products.category, unitsSold: 0, revenue: 0, cost: 0,
            margin: 0, marginPct: 0, avgPrice: 0, txCount: 0
          }
        }
        map[key].unitsSold += l.qty
        map[key].revenue += l.total || (l.qty * l.unit_price)
        map[key].cost += l.qty * (l.unit_cost || 0)
        map[key].txCount++
      })
    })
    return Object.values(map).map(r => {
      r.margin = r.revenue - r.cost
      r.marginPct = r.revenue > 0 ? Math.round((r.margin / r.revenue) * 100) : 0
      r.avgPrice = r.unitsSold > 0 ? Math.round(r.revenue / r.unitsSold) : 0
      return r
    }).sort((a, b) => sortDir === 'desc' ? (b[sortCol] as number) - (a[sortCol] as number) : (a[sortCol] as number) - (b[sortCol] as number))
  }, [sales, filtered, filterCat, catPredicate, sortCol, sortDir])

  const totalProductUnits = productRows.reduce((s, r) => s + r.unitsSold, 0)
  const totalProductRevenue = productRows.reduce((s, r) => s + r.revenue, 0)
  const totalProductMargin = productRows.reduce((s, r) => s + r.margin, 0)

  // ── Customer aggregation ────────────────────────────────
  const customerRows = useMemo<CustomerRow[]>(() => {
    const map: Record<string, CustomerRow> = {}
    filtered.forEach(s => {
      const key = s.customer_id || `__walkin_${s.customers?.name || 'Unknown'}`
      const units = (s.voucher_lines || []).reduce((a, l) => a + (l.qty || 0), 0)
      const cost = (s.voucher_lines || []).reduce((a, l) => a + (l.qty || 0) * (l.unit_cost || 0), 0)
      if (!map[key]) {
        map[key] = {
          customerId: key,
          name: s.customers?.name || s.description || 'Walk-in',
          whatsapp: s.customers?.whatsapp || '',
          segment: s.customers?.segment || (s.type === 'sales_invoice' ? 'Corporate' : 'Retail'),
          txCount: 0, unitsSold: 0, revenue: 0, cashRevenue: 0, creditRevenue: 0,
          margin: 0, marginPct: 0, lastPurchase: '', crownPoints: s.customers?.crown_points || 0,
        }
      }
      const c = map[key]
      c.txCount++
      c.unitsSold += units
      c.revenue += s.total_amount || 0
      if (s.type === 'cash_sale') c.cashRevenue += s.total_amount || 0
      else c.creditRevenue += s.total_amount || 0
      c.margin += (s.total_amount || 0) - cost
      if (!c.lastPurchase || s.posting_date > c.lastPurchase) c.lastPurchase = s.posting_date
    })
    return Object.values(map).map(c => {
      c.marginPct = c.revenue > 0 ? Math.round((c.margin / c.revenue) * 100) : 0
      return c
    }).sort((a, b) => custSortDir === 'desc'
      ? ((b[custSortCol] as any) > (a[custSortCol] as any) ? 1 : -1)
      : ((a[custSortCol] as any) > (b[custSortCol] as any) ? 1 : -1))
  }, [filtered, custSortCol, custSortDir])

  const filteredCustomerRows = custSearch
    ? customerRows.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase()) || c.whatsapp.includes(custSearch))
    : customerRows

  // Repeat vs new split (within selected window)
  const repeatStats = useMemo(() => {
    let repeatRev = 0, newRev = 0, repeatCount = 0, newCount = 0
    customerRows.forEach(c => {
      if (c.txCount > 1) { repeatRev += c.revenue; repeatCount++ }
      else { newRev += c.revenue; newCount++ }
    })
    return { repeatRev, newRev, repeatCount, newCount }
  }, [customerRows])

  // Segment roll-up
  const segmentRows = useMemo(() => {
    const map: Record<string, { segment: string; txCount: number; revenue: number; customers: Set<string> }> = {}
    customerRows.forEach(c => {
      const seg = c.segment || 'Unknown'
      if (!map[seg]) map[seg] = { segment: seg, txCount: 0, revenue: 0, customers: new Set() }
      map[seg].txCount += c.txCount
      map[seg].revenue += c.revenue
      map[seg].customers.add(c.customerId)
    })
    return Object.values(map).map(s => ({ segment: s.segment, txCount: s.txCount, revenue: s.revenue, customerCount: s.customers.size }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [customerRows])

  // ── Salesperson aggregation ─────────────────────────────
  const salespersonRows = useMemo<SalespersonRow[]>(() => {
    const map: Record<string, SalespersonRow> = {}
    filtered.forEach(s => {
      const key = s.posted_by || 'Unassigned'
      if (!map[key]) map[key] = { name: key, txCount: 0, revenue: 0, cashRevenue: 0, creditRevenue: 0, avgTicket: 0 }
      const p = map[key]
      p.txCount++
      p.revenue += s.total_amount || 0
      if (s.type === 'cash_sale') p.cashRevenue += s.total_amount || 0
      else p.creditRevenue += s.total_amount || 0
    })
    return Object.values(map).map(p => {
      p.avgTicket = p.txCount > 0 ? Math.round(p.revenue / p.txCount) : 0
      return p
    }).sort((a, b) => spSortDir === 'desc'
      ? ((b[spSortCol] as any) > (a[spSortCol] as any) ? 1 : -1)
      : ((a[spSortCol] as any) > (b[spSortCol] as any) ? 1 : -1))
  }, [filtered, spSortCol, spSortDir])

  // Compare product rows
  const compareProductRows = useMemo(() => {
    const buildMap = (data: Sale[]) => {
      const map: Record<string, { name: string; sku: string; category: string; units: number; revenue: number }> = {}
      data.forEach(s => {
        (s.voucher_lines || []).forEach(l => {
          if (!l.products) return
          const key = l.products.id
          if (!map[key]) map[key] = { name: l.products.name, sku: l.products.sku, category: l.products.category, units: 0, revenue: 0 }
          map[key].units += l.qty
          map[key].revenue += l.total || (l.qty * l.unit_price)
        })
      })
      return map
    }
    const current = buildMap(sales)
    const previous = buildMap(compareSales)
    const allKeys = new Set([...Object.keys(current), ...Object.keys(previous)])
    return Array.from(allKeys).map(k => {
      const c = current[k] || { name: previous[k]?.name || '?', sku: previous[k]?.sku || '', category: previous[k]?.category || '', units: 0, revenue: 0 }
      const p = previous[k] || { units: 0, revenue: 0 }
      const revDelta = c.revenue - p.revenue
      const unitDelta = c.units - p.units
      const revPct = p.revenue > 0 ? Math.round((revDelta / p.revenue) * 100) : c.revenue > 0 ? 100 : 0
      const unitPct = p.units > 0 ? Math.round((unitDelta / p.units) * 100) : c.units > 0 ? 100 : 0
      return { name: c.name, sku: c.sku, category: c.category, curUnits: c.units, curRevenue: c.revenue, prevUnits: p.units, prevRevenue: p.revenue, unitDelta, revDelta, revPct, unitPct }
    }).sort((a, b) => Math.abs(b.revDelta) - Math.abs(a.revDelta))
  }, [sales, compareSales])

  // ── Target Form Helpers ───────────────────────────────────
  const resetTargetForm = () => {
    setTargetForm({ name: '', period_type: 'monthly', metric: 'revenue', target_value: '', product_id: '', category: '', start_date: monthStart(), end_date: '', notes: '' })
    setEditingTarget(null)
  }
  const openNewTarget = () => { resetTargetForm(); setShowTargetForm(true) }
  const openEditTarget = (t: SalesTarget) => {
    setEditingTarget(t)
    setTargetForm({ name: t.name, period_type: t.period_type, metric: t.metric, target_value: String(t.target_value), product_id: t.product_id || '', category: t.category || '', start_date: t.start_date, end_date: t.end_date, notes: t.notes || '' })
    setShowTargetForm(true)
  }
  const autoEndDate = (startDate: string, periodType: string) => {
    const d = new Date(startDate)
    if (periodType === 'annual') d.setFullYear(d.getFullYear() + 1)
    else if (periodType === 'quarterly') d.setMonth(d.getMonth() + 3)
    else d.setMonth(d.getMonth() + 1)
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  }
  const saveTarget = async () => {
    if (!targetForm.name.trim()) { setToast({ msg: 'Target name required', type: 'error' }); return }
    const val = parseFloat(targetForm.target_value)
    if (!val || val <= 0) { setToast({ msg: 'Target value must be > 0', type: 'error' }); return }
    const endDate = targetForm.end_date || autoEndDate(targetForm.start_date, targetForm.period_type)
    const payload = {
      name: targetForm.name.trim(), period_type: targetForm.period_type, metric: targetForm.metric,
      target_value: val, product_id: targetForm.product_id || null, category: targetForm.category || null,
      start_date: targetForm.start_date, end_date: endDate, is_active: true,
      notes: targetForm.notes || null, created_by: getPostedBy(),
    }
    const res = editingTarget ? await updateTarget(editingTarget.id, payload) : await createTarget(payload as any)
    if (res.success) { setToast({ msg: editingTarget ? 'Target updated' : 'Target created', type: 'success' }); setShowTargetForm(false); resetTargetForm() }
    else { setToast({ msg: res.error || 'Failed', type: 'error' }) }
  }

  // Sort handler
  const handleSort = (col: keyof ProductRow) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }
  const sortIcon = (col: keyof ProductRow) => sortCol === col ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''

  // Tab definitions
  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'transactions', label: 'Transactions', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { key: 'products', label: 'Product Sales', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { key: 'customers', label: 'Customers', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M13 7a4 4 0 11-8 0 4 4 0 018 0zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
    { key: 'salespeople', label: 'Salespeople', icon: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 11l-3-3m0 0l-3 3m3-3v12' },
    { key: 'bundles', label: 'Bundles', icon: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z' },
    { key: 'compare', label: 'Compare', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { key: 'targets', label: 'Targets', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  ]

  return (
    <div className="page">
      {/* ── HEADER ──────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(133,194,190,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" fill="none" stroke="#85c2be" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          </div>
          <div>
            <div className="page-title">Sales Register</div>
            <div className="page-sub">Product performance, targets & comparisons · <span className="sync-dot"></span> Live</div>
          </div>
        </div>
        {tab !== 'targets' && (
          <div className="page-actions">
            <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>to</span>
            <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} value={toDate} onChange={e => setToDate(e.target.value)} />
            <CategoryFilter value={filterCat} onChange={setFilterCat} style={{ width: 170 }} />
            <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
              <button onClick={() => setTypeFilter('all')} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: typeFilter === 'all' ? 'var(--accent)' : 'transparent', color: typeFilter === 'all' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer' }}>All</button>
              <button onClick={() => setTypeFilter('cash')} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: typeFilter === 'cash' ? 'var(--green)' : 'transparent', color: typeFilter === 'cash' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderLeft: '1px solid var(--border)' }}>Cash</button>
              <button onClick={() => setTypeFilter('credit')} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: typeFilter === 'credit' ? 'var(--blue)' : 'transparent', color: typeFilter === 'credit' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderLeft: '1px solid var(--border)' }}>Credit</button>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => { loadSales(); refreshBundles() }}>Load</button>
          </div>
        )}
      </div>

      {/* ── TAB BAR ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t.key ? 'var(--accent)' : 'var(--text3)',
            fontWeight: tab === t.key ? 600 : 400, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap'
          }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={t.icon}/></svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════
          TAB 1: TRANSACTIONS
         ═══════════════════════════════════════════════════ */}
      {tab === 'transactions' && (
        <>
          {/* Target pulse bar */}
          {targetProgress.length > 0 && (() => {
            const main = targetProgress[0]
            const t = main.target
            return (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                <svg width="16" height="16" fill="none" stroke={main.onTrack ? 'var(--green)' : 'var(--yellow)'} strokeWidth="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                    <span style={{ fontFamily: 'var(--mono)', color: main.onTrack ? 'var(--green)' : 'var(--yellow)' }}>
                      {main.percentage.toFixed(1)}% · {main.daysLeft}d left
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, main.percentage)}%`, background: main.onTrack ? 'var(--green)' : 'var(--yellow)', borderRadius: 2, transition: 'width .4s ease' }}></div>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
                  {t.metric === 'revenue' ? tzs(main.current) : main.current.toLocaleString()} / {t.metric === 'revenue' ? tzs(t.target_value) : t.target_value.toLocaleString()}
                </div>
              </div>
            )
          })()}

          <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
            <div className="stat-card green"><div className="stat-label">Total Sales</div><div className="stat-value">{filtered.length}</div><div className="stat-change up">Transactions</div></div>
            <div className="stat-card amber"><div className="stat-label">Revenue</div><div className="stat-value">{tzs(totalRevenue)}</div><div className="stat-change up">Total</div></div>
            <div className="stat-card green"><div className="stat-label">Cash Sales</div><div className="stat-value">{tzs(cashTotal)}</div><div className="stat-change up">{cashSales.length} txns · {cashPct}%</div></div>
            <div className="stat-card blue"><div className="stat-label">Credit Sales</div><div className="stat-value">{tzs(creditTotal)}</div><div className="stat-change up">{creditSales.length} txns · {creditPct}%</div></div>
            <div className="stat-card yellow"><div className="stat-label">Avg Sale</div><div className="stat-value">{filtered.length > 0 ? tzs(Math.round(totalRevenue / filtered.length)) : 'TZS 0'}</div><div className="stat-change up">Per transaction</div></div>
          </div>

          {/* Outstanding receivables panel */}
          {outstanding.length > 0 && (
            <div className="card" style={{ marginBottom: 20, borderLeft: overdueCount > 0 ? '3px solid var(--red)' : '3px solid var(--yellow)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div className="card-title">Outstanding Receivables</div>
                  <div className="card-sub">Unpaid credit sales across all periods · {outstanding.length} customers</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, color: overdueCount > 0 ? 'var(--red)' : 'var(--yellow)' }}>{tzs(totalOutstanding)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{overdueCount} overdue · {outstanding.length - overdueCount} current</div>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Customer</th><th className="td-right">Outstanding</th><th className="td-right">Max Days Overdue</th><th>Status</th></tr></thead>
                  <tbody>
                    {outstanding.slice(0, 5).map((o, i) => (
                      <tr key={i} onClick={() => openCustomerLedgerById(o.customer_id, o.customer_name)} style={{ cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td className="td-bold">{o.customer_name}</td>
                        <td className="td-right td-mono" style={{ color: o.days_overdue > 30 ? 'var(--red)' : o.days_overdue > 0 ? 'var(--yellow)' : 'var(--text)', fontWeight: 600 }}>{o.remaining.toLocaleString()}</td>
                        <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{Math.max(0, o.days_overdue)}d</td>
                        <td><span className={`pill ${o.days_overdue > 30 ? 'pill-red' : o.days_overdue > 0 ? 'pill-yellow' : 'pill-green'}`} style={{ fontSize: 10 }}>{o.days_overdue > 30 ? 'Overdue 30+' : o.days_overdue > 0 ? 'Overdue' : 'Current'}</span></td>
                      </tr>
                    ))}
                    {outstanding.length > 5 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', padding: '8px 0' }}>+ {outstanding.length - 5} more · see AR Aging Report for full detail</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Date</th><th>Ref</th><th>Type</th><th>Customer</th><th>WhatsApp</th>
                <th>Payment</th><th className="td-right">Total (TZS)</th><th>Status</th>
              </tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No sales found for this period.</td></tr>
                ) : (
                  filtered.map((s, i) => (
                    <tr key={i}>
                      <td className="td-mono" style={{ color: 'var(--text3)', fontSize: 11 }}>{s.posting_date}</td>
                      <td className="td-mono td-amber">{s.ref}</td>
                      <td><span className={`pill ${s.type === 'cash_sale' ? 'pill-green' : 'pill-blue'}`} style={{ fontSize: 10 }}>{s.type === 'cash_sale' ? 'Cash' : 'Credit'}</span></td>
                      <td className="td-bold">{s.customers?.name || s.description}</td>
                      <td className="td-mono" style={{ color: 'var(--wa)', fontSize: 11 }}>{s.customers?.whatsapp || '—'}</td>
                      <td><span className={`pill ${s.payment_method === 'cash' || s.payment_method?.includes('Cash') ? 'pill-green' : s.payment_method?.includes('Pesa') ? 'pill-blue' : 'pill-amber'}`}>{s.payment_method}</span></td>
                      <td className="td-right td-mono td-green">{(s.total_amount || 0).toLocaleString()}</td>
                      <td><span className={`pill ${s.status === 'posted' ? 'pill-green' : 'pill-yellow'}`}>{s.status}</span></td>
                    </tr>
                  ))
                )}
                {!loading && filtered.length > 0 && (
                  <>
                    <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                      <td colSpan={6} className="td-bold">TOTALS — {filtered.length} transactions</td>
                      <td className="td-right td-mono td-green" style={{ fontSize: 14 }}>{totalRevenue.toLocaleString()}</td>
                      <td></td>
                    </tr>
                    {typeFilter === 'all' && (
                      <>
                        <tr style={{ background: 'var(--surface)', fontSize: 12 }}>
                          <td colSpan={6} style={{ padding: '6px 14px 6px 30px', color: 'var(--text3)' }}>
                            <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--green)', borderRadius: 2, marginRight: 8, verticalAlign: 'middle' }}></span>
                            Cash Sales ({cashSales.length} txns · {cashPct}%)
                          </td>
                          <td className="td-right td-mono" style={{ color: 'var(--green)', fontWeight: 700 }}>{cashTotal.toLocaleString()}</td>
                          <td></td>
                        </tr>
                        <tr style={{ background: 'var(--surface)', fontSize: 12 }}>
                          <td colSpan={6} style={{ padding: '6px 14px 6px 30px', color: 'var(--text3)' }}>
                            <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--blue)', borderRadius: 2, marginRight: 8, verticalAlign: 'middle' }}></span>
                            Credit Sales ({creditSales.length} txns · {creditPct}%)
                          </td>
                          <td className="td-right td-mono" style={{ color: 'var(--blue)', fontWeight: 700 }}>{creditTotal.toLocaleString()}</td>
                          <td></td>
                        </tr>
                      </>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB 2: PRODUCT SALES REGISTER
         ═══════════════════════════════════════════════════ */}
      {tab === 'products' && (
        <>
          <div className="grid g4" style={{ marginBottom: 20 }}>
            <div className="stat-card green"><div className="stat-label">Products Sold</div><div className="stat-value">{productRows.length}</div><div className="stat-change up">Unique SKUs</div></div>
            <div className="stat-card amber"><div className="stat-label">Total Units</div><div className="stat-value">{totalProductUnits.toLocaleString()}</div><div className="stat-change up">Items sold</div></div>
            <div className="stat-card blue"><div className="stat-label">Revenue</div><div className="stat-value">{tzs(totalProductRevenue)}</div><div className="stat-change up">Product sales</div></div>
            <div className="stat-card green"><div className="stat-label">Gross Margin</div><div className="stat-value">{totalProductRevenue > 0 ? Math.round((totalProductMargin / totalProductRevenue) * 100) : 0}%</div><div className="stat-change up">{tzs(totalProductMargin)}</div></div>
          </div>

          {/* Top 5 visual bar chart */}
          {productRows.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-title" style={{ marginBottom: 14 }}>Top 5 Products by Revenue</div>
              {productRows.slice(0, 5).map((r, i) => {
                const pct = totalProductRevenue > 0 ? (r.revenue / totalProductRevenue) * 100 : 0
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{i + 1}. {r.name}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{tzs(r.revenue)} · {r.unitsSold} units</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface3)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width .4s ease' }}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead><tr>
                <th style={{ width: 40 }}>#</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('sku')}>SKU{sortIcon('sku')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Product{sortIcon('name')}</th>
                <th>Category</th>
                <th className="td-right" style={{ cursor: 'pointer' }} onClick={() => handleSort('unitsSold')}>Units{sortIcon('unitsSold')}</th>
                <th className="td-right" style={{ cursor: 'pointer' }} onClick={() => handleSort('revenue')}>Revenue{sortIcon('revenue')}</th>
                <th className="td-right" style={{ cursor: 'pointer' }} onClick={() => handleSort('cost')}>Cost{sortIcon('cost')}</th>
                <th className="td-right" style={{ cursor: 'pointer' }} onClick={() => handleSort('marginPct')}>Margin{sortIcon('marginPct')}</th>
                <th className="td-right" style={{ cursor: 'pointer' }} onClick={() => handleSort('avgPrice')}>Avg Price{sortIcon('avgPrice')}</th>
                <th className="td-right" style={{ cursor: 'pointer' }} onClick={() => handleSort('txCount')}>Sales{sortIcon('txCount')}</th>
              </tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>Loading...</td></tr>
                ) : productRows.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No product sales found for this period.</td></tr>
                ) : (
                  productRows.map((r, i) => (
                    <tr key={r.productId}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{i + 1}</td>
                      <td className="td-mono td-amber" style={{ fontSize: 11 }}>{r.sku}</td>
                      <td className="td-bold" style={{ fontSize: 12 }}>{r.name}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{r.category}</td>
                      <td className="td-right td-mono">{r.unitsSold.toLocaleString()}</td>
                      <td className="td-right td-mono td-green" style={{ fontWeight: 600 }}>{r.revenue.toLocaleString()}</td>
                      <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{r.cost.toLocaleString()}</td>
                      <td className="td-right" style={{ fontFamily: 'var(--mono)', color: r.marginPct >= 40 ? 'var(--green)' : r.marginPct >= 20 ? 'var(--yellow)' : 'var(--red)' }}>{r.marginPct}%</td>
                      <td className="td-right td-mono">{r.avgPrice.toLocaleString()}</td>
                      <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{r.txCount}</td>
                    </tr>
                  ))
                )}
                {!loading && productRows.length > 0 && (
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={4} className="td-bold">TOTALS — {productRows.length} products</td>
                    <td className="td-right td-mono">{totalProductUnits.toLocaleString()}</td>
                    <td className="td-right td-mono td-green">{totalProductRevenue.toLocaleString()}</td>
                    <td className="td-right td-mono">{(totalProductRevenue - totalProductMargin).toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ color: 'var(--green)' }}>{totalProductRevenue > 0 ? Math.round((totalProductMargin / totalProductRevenue) * 100) : 0}%</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB: CUSTOMERS SALES REGISTER
         ═══════════════════════════════════════════════════ */}
      {tab === 'customers' && (
        <>
          {/* Repeat vs New split */}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            <div className="stat-card green"><div className="stat-label">Total Customers</div><div className="stat-value">{customerRows.length}</div><div className="stat-change up">{repeatStats.repeatCount} repeat · {repeatStats.newCount} new</div></div>
            <div className="stat-card amber"><div className="stat-label">Repeat Revenue</div><div className="stat-value">{tzs(repeatStats.repeatRev)}</div><div className="stat-change up">{totalRevenue > 0 ? Math.round((repeatStats.repeatRev / totalRevenue) * 100) : 0}% of total</div></div>
            <div className="stat-card blue"><div className="stat-label">New Customer Revenue</div><div className="stat-value">{tzs(repeatStats.newRev)}</div><div className="stat-change up">{totalRevenue > 0 ? Math.round((repeatStats.newRev / totalRevenue) * 100) : 0}% of total</div></div>
            <div className="stat-card yellow"><div className="stat-label">Avg per Customer</div><div className="stat-value">{customerRows.length > 0 ? tzs(Math.round(totalRevenue / customerRows.length)) : 'TZS 0'}</div><div className="stat-change up">Lifetime in period</div></div>
          </div>

          {/* Segment roll-up */}
          {segmentRows.length > 1 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header"><div className="card-title">By Segment</div><div className="card-sub">Revenue breakdown across customer segments</div></div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(segmentRows.length, 5)}, 1fr)`, gap: 12, marginTop: 12 }}>
                {segmentRows.slice(0, 5).map((s, i) => {
                  const pct = totalRevenue > 0 ? Math.round((s.revenue / totalRevenue) * 100) : 0
                  return (
                    <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>{s.segment}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{tzs(s.revenue)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{s.customerCount} customers · {pct}%</div>
                      <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2, marginTop: 6 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }}></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Search */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <input className="form-input" style={{ maxWidth: 320, fontSize: 12 }} placeholder="Search customer or WhatsApp..." value={custSearch} onChange={e => setCustSearch(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{filteredCustomerRows.length} of {customerRows.length} customers</div>
          </div>

          {/* Customer table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th onClick={() => { if (custSortCol === 'name') setCustSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setCustSortCol('name'); setCustSortDir('asc') } }} style={{ cursor: 'pointer' }}>Customer{custSortCol === 'name' ? (custSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th>WhatsApp</th>
                  <th>Segment</th>
                  <th className="td-right" onClick={() => { if (custSortCol === 'txCount') setCustSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setCustSortCol('txCount'); setCustSortDir('desc') } }} style={{ cursor: 'pointer' }}>Txns{custSortCol === 'txCount' ? (custSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th className="td-right" onClick={() => { if (custSortCol === 'unitsSold') setCustSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setCustSortCol('unitsSold'); setCustSortDir('desc') } }} style={{ cursor: 'pointer' }}>Units{custSortCol === 'unitsSold' ? (custSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th className="td-right" onClick={() => { if (custSortCol === 'cashRevenue') setCustSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setCustSortCol('cashRevenue'); setCustSortDir('desc') } }} style={{ cursor: 'pointer' }}>Cash{custSortCol === 'cashRevenue' ? (custSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th className="td-right" onClick={() => { if (custSortCol === 'creditRevenue') setCustSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setCustSortCol('creditRevenue'); setCustSortDir('desc') } }} style={{ cursor: 'pointer' }}>Credit{custSortCol === 'creditRevenue' ? (custSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th className="td-right" onClick={() => { if (custSortCol === 'revenue') setCustSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setCustSortCol('revenue'); setCustSortDir('desc') } }} style={{ cursor: 'pointer' }}>Revenue{custSortCol === 'revenue' ? (custSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th className="td-right">Margin</th>
                  <th className="td-right">Last</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>Loading...</td></tr>
                ) : filteredCustomerRows.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No customers found for this period.</td></tr>
                ) : filteredCustomerRows.map((c, i) => (
                  <tr key={i} onClick={() => openCustomerLedger(c)} style={{ cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td className="td-bold">{c.name}{c.txCount > 1 && <span style={{ fontSize: 9, color: 'var(--green)', marginLeft: 6, fontWeight: 600 }}>● REPEAT</span>}{c.customerId.startsWith('__walkin_') && <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 6, fontWeight: 500 }}>Walk-in</span>}</td>
                    <td className="td-mono" style={{ color: 'var(--wa)', fontSize: 11 }}>{c.whatsapp || '—'}</td>
                    <td><span className="pill pill-gray" style={{ fontSize: 10 }}>{c.segment}</span></td>
                    <td className="td-right td-mono">{c.txCount}</td>
                    <td className="td-right td-mono">{c.unitsSold.toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ color: 'var(--green)' }}>{c.cashRevenue > 0 ? c.cashRevenue.toLocaleString() : '—'}</td>
                    <td className="td-right td-mono" style={{ color: 'var(--blue)' }}>{c.creditRevenue > 0 ? c.creditRevenue.toLocaleString() : '—'}</td>
                    <td className="td-right td-mono td-green" style={{ fontWeight: 700 }}>{c.revenue.toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{c.marginPct}%</td>
                    <td className="td-right td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{c.lastPurchase}</td>
                  </tr>
                ))}
                {!loading && filteredCustomerRows.length > 0 && (
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={3} className="td-bold">TOTALS — {filteredCustomerRows.length} customers</td>
                    <td className="td-right td-mono">{filteredCustomerRows.reduce((s, c) => s + c.txCount, 0)}</td>
                    <td className="td-right td-mono">{filteredCustomerRows.reduce((s, c) => s + c.unitsSold, 0).toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ color: 'var(--green)' }}>{filteredCustomerRows.reduce((s, c) => s + c.cashRevenue, 0).toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ color: 'var(--blue)' }}>{filteredCustomerRows.reduce((s, c) => s + c.creditRevenue, 0).toLocaleString()}</td>
                    <td className="td-right td-mono td-green">{filteredCustomerRows.reduce((s, c) => s + c.revenue, 0).toLocaleString()}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Top 5 / Bottom 5 */}
          {customerRows.length >= 4 && (
            <div className="grid g2" style={{ marginTop: 20 }}>
              <div className="card card-sm">
                <div className="card-title" style={{ marginBottom: 12 }}>Top 5 Customers</div>
                {customerRows.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                    <span><span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', marginRight: 6 }}>#{i + 1}</span>{c.name}</span>
                    <span className="td-mono td-green" style={{ fontWeight: 600 }}>{tzs(c.revenue)}</span>
                  </div>
                ))}
              </div>
              <div className="card card-sm">
                <div className="card-title" style={{ marginBottom: 12 }}>Bottom 5 Customers</div>
                {customerRows.slice().sort((a, b) => a.revenue - b.revenue).slice(0, 5).map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                    <span><span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', marginRight: 6 }}>#{i + 1}</span>{c.name}</span>
                    <span className="td-mono" style={{ color: 'var(--text3)' }}>{tzs(c.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB: SALESPEOPLE LEADERBOARD
         ═══════════════════════════════════════════════════ */}
      {tab === 'salespeople' && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            <div className="stat-card green"><div className="stat-label">Active Salespeople</div><div className="stat-value">{salespersonRows.length}</div><div className="stat-change up">With sales in period</div></div>
            <div className="stat-card amber"><div className="stat-label">Top Performer</div><div className="stat-value" style={{ fontSize: 16 }}>{salespersonRows[0]?.name || '—'}</div><div className="stat-change up">{salespersonRows[0] ? tzs(salespersonRows[0].revenue) : ''}</div></div>
            <div className="stat-card blue"><div className="stat-label">Avg Revenue / Person</div><div className="stat-value">{salespersonRows.length > 0 ? tzs(Math.round(totalRevenue / salespersonRows.length)) : 'TZS 0'}</div><div className="stat-change up">Per salesperson</div></div>
            <div className="stat-card yellow"><div className="stat-label">Avg Ticket</div><div className="stat-value">{filtered.length > 0 ? tzs(Math.round(totalRevenue / filtered.length)) : 'TZS 0'}</div><div className="stat-change up">Across all</div></div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th onClick={() => { if (spSortCol === 'name') setSpSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSpSortCol('name'); setSpSortDir('asc') } }} style={{ cursor: 'pointer' }}>Salesperson{spSortCol === 'name' ? (spSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th className="td-right" onClick={() => { if (spSortCol === 'txCount') setSpSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSpSortCol('txCount'); setSpSortDir('desc') } }} style={{ cursor: 'pointer' }}>Txns{spSortCol === 'txCount' ? (spSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th className="td-right" onClick={() => { if (spSortCol === 'cashRevenue') setSpSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSpSortCol('cashRevenue'); setSpSortDir('desc') } }} style={{ cursor: 'pointer' }}>Cash{spSortCol === 'cashRevenue' ? (spSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th className="td-right" onClick={() => { if (spSortCol === 'creditRevenue') setSpSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSpSortCol('creditRevenue'); setSpSortDir('desc') } }} style={{ cursor: 'pointer' }}>Credit{spSortCol === 'creditRevenue' ? (spSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th className="td-right" onClick={() => { if (spSortCol === 'revenue') setSpSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSpSortCol('revenue'); setSpSortDir('desc') } }} style={{ cursor: 'pointer' }}>Total Revenue{spSortCol === 'revenue' ? (spSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th className="td-right" onClick={() => { if (spSortCol === 'avgTicket') setSpSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSpSortCol('avgTicket'); setSpSortDir('desc') } }} style={{ cursor: 'pointer' }}>Avg Ticket{spSortCol === 'avgTicket' ? (spSortDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
                  <th>Mix</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>Loading...</td></tr>
                ) : salespersonRows.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No salespeople activity for this period.</td></tr>
                ) : salespersonRows.map((p, i) => {
                  const cashPctP = p.revenue > 0 ? (p.cashRevenue / p.revenue) * 100 : 0
                  return (
                    <tr key={i}>
                      <td className="td-mono" style={{ color: i === 0 ? 'var(--yellow)' : 'var(--text3)', fontWeight: 700 }}>#{i + 1}</td>
                      <td className="td-bold">{p.name}</td>
                      <td className="td-right td-mono">{p.txCount}</td>
                      <td className="td-right td-mono" style={{ color: 'var(--green)' }}>{p.cashRevenue > 0 ? p.cashRevenue.toLocaleString() : '—'}</td>
                      <td className="td-right td-mono" style={{ color: 'var(--blue)' }}>{p.creditRevenue > 0 ? p.creditRevenue.toLocaleString() : '—'}</td>
                      <td className="td-right td-mono td-green" style={{ fontWeight: 700 }}>{p.revenue.toLocaleString()}</td>
                      <td className="td-right td-mono">{tzs(p.avgTicket)}</td>
                      <td style={{ width: 140 }}>
                        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--surface3)' }}>
                          <div style={{ width: `${cashPctP}%`, background: 'var(--green)' }}></div>
                          <div style={{ width: `${100 - cashPctP}%`, background: 'var(--blue)' }}></div>
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>{Math.round(cashPctP)}% cash</div>
                      </td>
                    </tr>
                  )
                })}
                {!loading && salespersonRows.length > 0 && (
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={2} className="td-bold">TOTALS</td>
                    <td className="td-right td-mono">{salespersonRows.reduce((s, p) => s + p.txCount, 0)}</td>
                    <td className="td-right td-mono" style={{ color: 'var(--green)' }}>{salespersonRows.reduce((s, p) => s + p.cashRevenue, 0).toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ color: 'var(--blue)' }}>{salespersonRows.reduce((s, p) => s + p.creditRevenue, 0).toLocaleString()}</td>
                    <td className="td-right td-mono td-green">{totalRevenue.toLocaleString()}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB 3: BUNDLE SALES
         ═══════════════════════════════════════════════════ */}
      {tab === 'bundles' && (
        <>
          <div className="grid g4" style={{ marginBottom: 20 }}>
            <div className="stat-card green"><div className="stat-label">Bundles Sold</div><div className="stat-value">{totalBundlesSold}</div><div className="stat-change up">Total</div></div>
            <div className="stat-card amber"><div className="stat-label">Bundle Revenue</div><div className="stat-value">{tzs(bundleRevenue)}</div><div className="stat-change up">From bundles</div></div>
            <div className="stat-card blue"><div className="stat-label">Savings Given</div><div className="stat-value">{tzs(totalSavingsGiven)}</div><div className="stat-change">Customer benefit</div></div>
            <div className="stat-card green"><div className="stat-label">Avg Bundle Value</div><div className="stat-value">{totalBundlesSold > 0 ? tzs(Math.round(bundleRevenue / totalBundlesSold)) : 'TZS 0'}</div><div className="stat-change up">Per sale</div></div>
          </div>

          {Object.keys(byBundle).length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-title" style={{ marginBottom: 14 }}>Bundle Performance</div>
              {Object.entries(byBundle).sort((a, b) => b[1].revenue - a[1].revenue).map(([id, data]) => {
                const pct = bundleRevenue > 0 ? (data.revenue / bundleRevenue) * 100 : 0
                return (
                  <div key={id} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{data.name}</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>
                        <span style={{ color: 'var(--green)' }}>{tzs(data.revenue)}</span>
                        <span style={{ color: 'var(--text3)', marginLeft: 8 }}>{data.count} sold</span>
                        <span style={{ color: 'var(--yellow)', marginLeft: 8 }}>Saved: {tzs(data.savings)}</span>
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface3)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width .4s ease' }}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Date</th><th>Voucher</th><th>Bundle</th><th>Customer</th>
                <th className="td-right">Price</th><th className="td-right">Savings</th><th>Sold By</th>
              </tr></thead>
              <tbody>
                {bundlesLoading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>Loading...</td></tr>
                ) : bundleSales.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No bundle sales in this period.</td></tr>
                ) : (
                  bundleSales.map((bs, i) => (
                    <tr key={i}>
                      <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{bs.posting_date}</td>
                      <td className="td-mono td-amber">{bs.voucher_ref}</td>
                      <td className="td-bold">{bs.bundle?.name || '—'}</td>
                      <td style={{ fontSize: 12 }}>{bs.customer_name}</td>
                      <td className="td-right td-mono td-green">{bs.bundle_price.toLocaleString()}</td>
                      <td className="td-right td-mono" style={{ color: 'var(--yellow)' }}>{bs.savings.toLocaleString()}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{bs.sold_by}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB 4: COMPARE PERIODS
         ═══════════════════════════════════════════════════ */}
      {tab === 'compare' && (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--display)', marginBottom: 12 }}>Period Comparison</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Current Period</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="date" className="form-input" style={{ width: 140, padding: '4px 8px', fontSize: 12 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>to</span>
                  <input type="date" className="form-input" style={{ width: 140, padding: '4px 8px', fontSize: 12 }} value={toDate} onChange={e => setToDate(e.target.value)} />
                </div>
              </div>
              <div style={{ fontSize: 20, color: 'var(--text3)', fontWeight: 700 }}>vs</div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Previous Period</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="date" className="form-input" style={{ width: 140, padding: '4px 8px', fontSize: 12 }} value={compareFrom} onChange={e => setCompareFrom(e.target.value)} />
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>to</span>
                  <input type="date" className="form-input" style={{ width: 140, padding: '4px 8px', fontSize: 12 }} value={compareTo} onChange={e => setCompareTo(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => { loadSales(); loadCompareSales() }}>Compare</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { label: 'This Month vs Last Month', cur: [monthStart(), todayStr()], prev: [new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0], new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]] },
                { label: 'This Week vs Last Week', cur: [daysAgo(6), todayStr()], prev: [daysAgo(13), daysAgo(7)] },
                { label: 'Last 30 vs Prior 30', cur: [daysAgo(29), todayStr()], prev: [daysAgo(59), daysAgo(30)] },
              ].map((p, i) => (
                <button key={i} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => {
                  setFromDate(p.cur[0]); setToDate(p.cur[1]); setCompareFrom(p.prev[0]); setCompareTo(p.prev[1])
                  setTimeout(() => { loadSales(p.cur[0], p.cur[1]) }, 50)
                }}>{p.label}</button>
              ))}
              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
              <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>To-Date</span>
              {(() => {
                const td = buildToDatePresets()
                return [
                  { label: 'MTD vs Last MTD', cur: td.monthToDate.cur, prev: td.monthToDate.prev },
                  { label: 'QTD vs Last QTD', cur: td.quarterToDate.cur, prev: td.quarterToDate.prev },
                  { label: 'YTD vs Last YTD', cur: td.yearToDate.cur, prev: td.yearToDate.prev },
                ].map((p, i) => (
                  <button key={`td-${i}`} className="btn btn-ghost btn-sm" style={{ fontSize: 11, borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={() => {
                    setFromDate(p.cur[0]); setToDate(p.cur[1]); setCompareFrom(p.prev[0]); setCompareTo(p.prev[1])
                    setTimeout(() => { loadSales(p.cur[0], p.cur[1]) }, 50)
                  }}>{p.label}</button>
                ))
              })()}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid g3" style={{ marginBottom: 20 }}>
            {(() => {
              const curRev = sales.reduce((s, v) => s + (v.total_amount || 0), 0)
              const prevRev = compareSales.reduce((s, v) => s + (v.total_amount || 0), 0)
              const revDelta = curRev - prevRev
              const revPct = prevRev > 0 ? Math.round((revDelta / prevRev) * 100) : 0
              const curTx = sales.length, prevTx = compareSales.length, txDelta = curTx - prevTx
              const curUnits = sales.reduce((s, v) => s + (v.voucher_lines || []).reduce((a, l) => a + l.qty, 0), 0)
              const prevUnits = compareSales.reduce((s, v) => s + (v.voucher_lines || []).reduce((a: number, l: any) => a + l.qty, 0), 0)
              const unitDelta = curUnits - prevUnits
              return (<>
                <div className={`stat-card ${revDelta >= 0 ? 'green' : 'red'}`}>
                  <div className="stat-label">Revenue Change</div>
                  <div className="stat-value">{revDelta >= 0 ? '+' : ''}{tzs(revDelta)}</div>
                  <div className={`stat-change ${revDelta >= 0 ? 'up' : 'down'}`}>{revDelta >= 0 ? '↑' : '↓'} {Math.abs(revPct)}% vs previous</div>
                </div>
                <div className={`stat-card ${txDelta >= 0 ? 'green' : 'red'}`}>
                  <div className="stat-label">Transactions</div>
                  <div className="stat-value">{curTx} vs {prevTx}</div>
                  <div className={`stat-change ${txDelta >= 0 ? 'up' : 'down'}`}>{txDelta >= 0 ? '+' : ''}{txDelta} transactions</div>
                </div>
                <div className={`stat-card ${unitDelta >= 0 ? 'green' : 'red'}`}>
                  <div className="stat-label">Units Sold</div>
                  <div className="stat-value">{curUnits.toLocaleString()} vs {prevUnits.toLocaleString()}</div>
                  <div className={`stat-change ${unitDelta >= 0 ? 'up' : 'down'}`}>{unitDelta >= 0 ? '+' : ''}{unitDelta} units</div>
                </div>
              </>)
            })()}
          </div>

          {/* Product comparison table */}
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Product</th><th>Category</th>
                <th className="td-right">Cur Units</th><th className="td-right">Prev Units</th><th className="td-right">Δ Units</th>
                <th className="td-right">Cur Revenue</th><th className="td-right">Prev Revenue</th><th className="td-right">Δ Revenue</th>
              </tr></thead>
              <tbody>
                {compareLoading || loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>Loading...</td></tr>
                ) : compareProductRows.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No data to compare. Adjust dates and click Compare.</td></tr>
                ) : (
                  compareProductRows.map((r, i) => (
                    <tr key={i}>
                      <td className="td-bold" style={{ fontSize: 12 }}>{r.name}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{r.category}</td>
                      <td className="td-right td-mono">{r.curUnits}</td>
                      <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{r.prevUnits}</td>
                      <td className="td-right td-mono" style={{ color: r.unitDelta > 0 ? 'var(--green)' : r.unitDelta < 0 ? 'var(--red)' : 'var(--text3)' }}>
                        {r.unitDelta > 0 ? '+' : ''}{r.unitDelta} <span style={{ fontSize: 10 }}>({r.unitDelta > 0 ? '↑' : r.unitDelta < 0 ? '↓' : '='}{Math.abs(r.unitPct)}%)</span>
                      </td>
                      <td className="td-right td-mono td-green">{r.curRevenue.toLocaleString()}</td>
                      <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{r.prevRevenue.toLocaleString()}</td>
                      <td className="td-right td-mono" style={{ fontWeight: 600, color: r.revDelta > 0 ? 'var(--green)' : r.revDelta < 0 ? 'var(--red)' : 'var(--text3)' }}>
                        {r.revDelta > 0 ? '+' : ''}{r.revDelta.toLocaleString()} <span style={{ fontSize: 10 }}>({r.revDelta > 0 ? '↑' : r.revDelta < 0 ? '↓' : '='}{Math.abs(r.revPct)}%)</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB 5: TARGETS & COUNTDOWN
         ═══════════════════════════════════════════════════ */}
      {tab === 'targets' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>{targets.filter(t => t.is_active).length} active target{targets.filter(t => t.is_active).length !== 1 ? 's' : ''}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={loadTargetProgress}>Refresh Progress</button>
              <button className="btn btn-primary" onClick={openNewTarget}>+ New Target</button>
            </div>
          </div>

          {/* Active target cards */}
          {targetProgress.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
              {targetProgress.map((tp) => {
                const t = tp.target
                const progressColor = tp.percentage >= 100 ? 'var(--green)' : tp.onTrack ? 'var(--accent)' : 'var(--yellow)'
                const statusText = tp.percentage >= 100 ? 'TARGET HIT!' : tp.onTrack ? 'On Track' : 'Behind Pace'
                const statusColor = tp.percentage >= 100 ? 'var(--green)' : tp.onTrack ? 'var(--green)' : 'var(--red)'
                return (
                  <div key={t.id} className="card" style={{ borderLeft: `3px solid ${progressColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--display)' }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                          {periodLabel(t.period_type)} · {t.metric === 'revenue' ? 'Revenue' : 'Units'} · {t.start_date} to {t.end_date}
                        </div>
                        {t.product_id && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>Product: {products.find(p => p.id === t.product_id)?.name || 'Loading...'}</div>}
                        {t.category && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>Category: {t.category}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 10 }} onClick={() => openEditTarget(t)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text3)' }} onClick={() => toggleTarget(t.id, false)}>Pause</button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 10, color: 'var(--red)' }} onClick={async () => {
                          if (confirm('Delete this target?')) { await removeTarget(t.id); setToast({ msg: 'Target deleted', type: 'success' }) }
                        }}>×</button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: progressColor }}>
                          {t.metric === 'revenue' ? tzs(tp.current) : tp.current.toLocaleString() + ' units'}
                        </span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                          {t.metric === 'revenue' ? tzs(t.target_value) : t.target_value.toLocaleString() + ' units'}
                        </span>
                      </div>
                      <div style={{ height: 10, background: 'var(--surface3)', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${Math.min(100, tp.percentage)}%`,
                          background: tp.percentage >= 100
                            ? 'linear-gradient(90deg, var(--green), #4ade80)'
                            : progressColor,
                          borderRadius: 5, transition: 'width .6s ease',
                          boxShadow: tp.percentage >= 100 ? '0 0 12px rgba(0,229,160,.5)' : 'none'
                        }}></div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: progressColor }}>{tp.percentage.toFixed(1)}%</span>
                        <span style={{ color: statusColor, fontWeight: 700 }}>{statusText}</span>
                      </div>
                    </div>

                    {/* Countdown stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--display)', color: tp.daysLeft <= 7 ? 'var(--red)' : 'var(--text)' }}>{tp.daysLeft}</div>
                        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>Days Left</div>
                      </div>
                      <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                          {t.metric === 'revenue'
                            ? (tp.dailyRunRate >= 1000000 ? (tp.dailyRunRate / 1000000).toFixed(1) + 'M' : (tp.dailyRunRate / 1000).toFixed(0) + 'K')
                            : tp.dailyRunRate.toFixed(1)}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>Daily Rate</div>
                      </div>
                      <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: tp.onTrack ? 'var(--green)' : 'var(--red)' }}>
                          {t.metric === 'revenue'
                            ? (tp.requiredDailyRate === Infinity ? '∞' : tp.requiredDailyRate >= 1000000 ? (tp.requiredDailyRate / 1000000).toFixed(1) + 'M' : (tp.requiredDailyRate / 1000).toFixed(0) + 'K')
                            : (tp.requiredDailyRate === Infinity ? '∞' : tp.requiredDailyRate.toFixed(1))}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>Need/Day</div>
                      </div>
                    </div>

                    {tp.remaining > 0 && (
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textAlign: 'center' }}>
                        Remaining: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{t.metric === 'revenue' ? tzs(tp.remaining) : tp.remaining.toLocaleString() + ' units'}</span>
                        {' · '}Projected: <span style={{ color: tp.onTrack ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{t.metric === 'revenue' ? tzs(tp.projectedTotal) : Math.round(tp.projectedTotal).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Past targets */}
          {targets.filter(t => !t.is_active).length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--display)', marginBottom: 12, color: 'var(--text3)' }}>Past / Paused Targets</div>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Name</th><th>Period</th><th>Metric</th><th className="td-right">Target</th><th>Dates</th><th style={{ width: 80 }}></th>
                  </tr></thead>
                  <tbody>
                    {targets.filter(t => !t.is_active).map(t => (
                      <tr key={t.id}>
                        <td className="td-bold">{t.name}</td>
                        <td style={{ fontSize: 11 }}>{periodLabel(t.period_type)}</td>
                        <td style={{ fontSize: 11 }}>{t.metric}</td>
                        <td className="td-right td-mono">{t.metric === 'revenue' ? tzs(t.target_value) : t.target_value.toLocaleString()}</td>
                        <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{t.start_date} to {t.end_date}</td>
                        <td><button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => toggleTarget(t.id, true)}>Reactivate</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {targetsLoading && <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading targets...</div>}
          {!targetsLoading && targets.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No targets set</div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Set revenue or unit targets to track progress with live countdowns.</div>
              <button className="btn btn-primary" onClick={openNewTarget}>+ Create First Target</button>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          TARGET FORM MODAL
         ═══════════════════════════════════════════════════ */}
      {showTargetForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={e => { if (e.target === e.currentTarget) { setShowTargetForm(false); resetTargetForm() } }}>
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>
              {editingTarget ? 'Edit Target' : 'New Sales Target'}
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Target Name *</div>
                <input className="form-input" placeholder="e.g. April Revenue Target" value={targetForm.name} onChange={e => setTargetForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Period Type</div>
                  <select className="form-input" value={targetForm.period_type} onChange={e => {
                    const pt = e.target.value as SalesTarget['period_type']
                    setTargetForm(f => ({ ...f, period_type: pt, end_date: autoEndDate(f.start_date, pt) }))
                  }}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Metric</div>
                  <select className="form-input" value={targetForm.metric} onChange={e => setTargetForm(f => ({ ...f, metric: e.target.value as SalesTarget['metric'] }))}>
                    <option value="revenue">Revenue (TZS)</option>
                    <option value="units">Units Sold</option>
                  </select>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Target Value ({targetForm.metric === 'revenue' ? 'TZS' : 'units'}) *
                </div>
                <input className="form-input" type="number" placeholder={targetForm.metric === 'revenue' ? 'e.g. 50000000' : 'e.g. 500'} value={targetForm.target_value} onChange={e => setTargetForm(f => ({ ...f, target_value: e.target.value }))} />
                {targetForm.target_value && targetForm.metric === 'revenue' && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                    = {tzs(parseFloat(targetForm.target_value) || 0)}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Product (optional)</div>
                  <select className="form-input" value={targetForm.product_id} onChange={e => setTargetForm(f => ({ ...f, product_id: e.target.value, category: '' }))}>
                    <option value="">All Products</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Category (optional)</div>
                  <CategoryFilter value={targetForm.category || 'all'} onChange={v => setTargetForm(f => ({ ...f, category: v === 'all' ? '' : v, product_id: '' }))} style={{ width: '100%' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Start Date</div>
                  <input type="date" className="form-input" value={targetForm.start_date} onChange={e => {
                    const sd = e.target.value
                    setTargetForm(f => ({ ...f, start_date: sd, end_date: autoEndDate(sd, f.period_type) }))
                  }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>End Date</div>
                  <input type="date" className="form-input" value={targetForm.end_date || autoEndDate(targetForm.start_date, targetForm.period_type)} onChange={e => setTargetForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Notes (optional)</div>
                <textarea className="form-input" style={{ height: 60, resize: 'vertical' }} placeholder="Internal notes..." value={targetForm.notes} onChange={e => setTargetForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setShowTargetForm(false); resetTargetForm() }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTarget}>{editingTarget ? 'Update Target' : 'Create Target'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          CUSTOMER LEDGER DRAWER
         ═══════════════════════════════════════════════════ */}
      {selectedCustomer && (() => {
        const c = selectedCustomer
        const isWalkIn = c.customerId.startsWith('__walkin_')
        // Compute running balance (oldest → newest)
        const ordered = customerLedger.slice().reverse()
        let running = 0
        const withBalance = ordered.map(e => {
          const isDebit = e.document_type === 'invoice' || e.document_type === 'cash_sale' || e.document_type === 'debit_note'
          const signed = isDebit ? (e.amount || 0) : -(e.amount || 0)
          running += signed
          return { ...e, running_balance: running }
        }).reverse()

        const totalInvoiced = customerLedger.filter(e => e.document_type === 'invoice' || e.document_type === 'cash_sale').reduce((s, e) => s + (e.amount || 0), 0)
        const totalPaid = customerLedger.filter(e => e.document_type === 'payment' || e.document_type === 'receipt').reduce((s, e) => s + (e.amount || 0), 0)
        const totalOpen = customerLedger.filter(e => e.is_open).reduce((s, e) => s + (e.remaining_amount || 0), 0)
        const today = new Date()

        return (
          <>
            {/* Backdrop */}
            <div onClick={closeCustomerLedger} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 998, animation: 'fadeIn .15s ease' }} />
            {/* Drawer */}
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(920px, 95vw)', background: 'var(--bg)', zIndex: 999, boxShadow: '-8px 0 32px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', animation: 'slideInRight .25s ease' }}>
              {/* Drawer header */}
              <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(133,194,190,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="18" height="18" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                        {c.whatsapp || '—'} · <span className="pill pill-gray" style={{ fontSize: 9 }}>{c.segment}</span>
                        {c.txCount > 1 && <span style={{ color: 'var(--green)', marginLeft: 8, fontWeight: 600 }}>● REPEAT</span>}
                        {isWalkIn && <span style={{ color: 'var(--text3)', marginLeft: 8 }}>Walk-in contact</span>}
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={closeCustomerLedger} className="btn btn-ghost btn-sm" style={{ padding: '6px 10px' }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* KPI strip — period summary */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Period summary · {fromDate} to {toDate}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 10 }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Transactions</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }}>{c.txCount}</div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 10 }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Units Sold</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }}>{c.unitsSold.toLocaleString()}</div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 'var(--r)', padding: 10 }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Cash</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{tzs(c.cashRevenue)}</div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid rgba(38,100,235,.2)', borderRadius: 'var(--r)', padding: 10 }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Credit</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{tzs(c.creditRevenue)}</div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid rgba(255,211,42,.2)', borderRadius: 'var(--r)', padding: 10 }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Revenue</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--yellow)' }}>{tzs(c.revenue)}</div>
                  </div>
                </div>
                {/* Lifetime stats */}
                {!isWalkIn && !ledgerLoading && customerLedger.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                    <span>LIFETIME: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{customerLedger.length}</span> entries</span>
                    <span>Invoiced: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{tzs(totalInvoiced)}</span></span>
                    <span>Paid: <span style={{ color: 'var(--green)', fontWeight: 600 }}>{tzs(totalPaid)}</span></span>
                    <span style={{ marginLeft: 'auto' }}>Outstanding: <span style={{ color: totalOpen > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{tzs(totalOpen)}</span></span>
                  </div>
                )}
              </div>

              {/* Ledger body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700 }}>Customer Ledger</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>Credit sales, payments &amp; cash purchases · sorted newest first</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {ledgerLoading ? 'Loading…' : isWalkIn ? 'No ledger for walk-in contacts' : `${customerLedger.length} entries`}
                  </div>
                </div>

                {isWalkIn ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 'var(--r)' }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>Walk-in contacts don't have a ledger</div>
                    <div style={{ fontSize: 11 }}>Only registered customers have accounting entries tracked in the ledger</div>
                  </div>
                ) : ledgerLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading ledger…</div>
                ) : customerLedger.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No ledger entries for this customer.</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Document</th>
                          <th>Description</th>
                          <th className="td-right">Debit</th>
                          <th className="td-right">Credit</th>
                          <th className="td-right">Balance</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {withBalance.map((e, i) => {
                          const isDebit = e.document_type === 'invoice' || e.document_type === 'cash_sale' || e.document_type === 'debit_note'
                          const isPaymentLike = e.document_type === 'payment' || e.document_type === 'receipt' || e.document_type === 'credit_note'
                          const overdue = e.is_open && e.due_date && new Date(e.due_date) < today
                          const daysOverdue = overdue ? Math.floor((today.getTime() - new Date(e.due_date).getTime()) / 86400000) : 0
                          const docLabel = e.document_type?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
                          const clickable = !!onEdit && e.document_type === 'cash_sale'
                          const onEditCash = () => { if (onEdit && e.source_voucher_id) { onEdit('cash-sale', e.source_voucher_id); closeCustomerLedger() } }
                          const onEditInvoice = () => { if (onEdit && e.source_voucher_id) { onEdit('sales-invoice', e.source_voucher_id); closeCustomerLedger() } }
                          return (
                            <tr key={e.id || i}>
                              <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{e.posting_date}</td>
                              <td>
                                <span className={`pill ${e.document_type === 'invoice' ? 'pill-amber' : e.document_type === 'payment' || e.document_type === 'receipt' ? 'pill-green' : e.document_type === 'cash_sale' ? 'pill-blue' : e.document_type === 'credit_note' ? 'pill-red' : 'pill-gray'}`} style={{ fontSize: 9 }}>
                                  {docLabel}
                                </span>
                              </td>
                              <td className="td-mono td-amber" onClick={clickable ? onEditCash : (e.document_type === 'invoice' && onEdit ? onEditInvoice : undefined)} style={{ cursor: (clickable || (e.document_type === 'invoice' && onEdit)) ? 'pointer' : 'default', textDecoration: (clickable || (e.document_type === 'invoice' && onEdit)) ? 'underline' : 'none' }}>{e.document_ref}</td>
                              <td style={{ fontSize: 11 }}>{e.description || '—'}</td>
                              <td className="td-right td-mono" style={{ color: isDebit ? 'var(--red)' : 'var(--text3)' }}>{isDebit ? (e.amount || 0).toLocaleString() : '—'}</td>
                              <td className="td-right td-mono" style={{ color: isPaymentLike ? 'var(--green)' : 'var(--text3)' }}>{isPaymentLike ? (e.amount || 0).toLocaleString() : '—'}</td>
                              <td className="td-right td-mono" style={{ fontWeight: 700, color: (e.running_balance || 0) > 0 ? 'var(--red)' : (e.running_balance || 0) < 0 ? 'var(--green)' : 'var(--text)' }}>{Math.abs(e.running_balance || 0).toLocaleString()}{(e.running_balance || 0) < 0 ? ' Cr' : ''}</td>
                              <td>
                                {e.is_open ? (
                                  <span className={`pill ${overdue ? (daysOverdue > 30 ? 'pill-red' : 'pill-yellow') : 'pill-amber'}`} style={{ fontSize: 9 }}>
                                    {overdue ? `Overdue ${daysOverdue}d` : `Open · ${(e.remaining_amount || 0).toLocaleString()}`}
                                  </span>
                                ) : (
                                  <span className="pill pill-green" style={{ fontSize: 9 }}>Settled</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                          <td colSpan={4} className="td-bold" style={{ padding: '10px 14px' }}>LIFETIME TOTALS</td>
                          <td className="td-right td-mono" style={{ color: 'var(--red)' }}>{totalInvoiced.toLocaleString()}</td>
                          <td className="td-right td-mono" style={{ color: 'var(--green)' }}>{totalPaid.toLocaleString()}</td>
                          <td className="td-right td-mono" style={{ color: totalOpen > 0 ? 'var(--red)' : 'var(--green)' }}>{totalOpen.toLocaleString()}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Drawer footer actions */}
              {!isWalkIn && customerLedger.length > 0 && (
                <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    Current balance: <span style={{ color: totalOpen > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700, fontSize: 13 }}>{tzs(totalOpen)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {c.whatsapp && (
                      <a href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                        Message
                      </a>
                    )}
                    <button onClick={closeCustomerLedger} className="btn btn-primary btn-sm">Close</button>
                  </div>
                </div>
              )}
            </div>
            <style>{`
              @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
              @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
          </>
        )
      })()}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
