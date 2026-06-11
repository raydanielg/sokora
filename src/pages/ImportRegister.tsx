import { useState, useEffect, useMemo } from 'react'
import { supabase, getActiveCompany } from '../lib/supabase'
import Toast from '../components/Toast'
import { tzs, today } from '../lib/utils'
import type { Page } from '../lib/types'

declare global {
  interface Window { jspdf: { jsPDF: new (...args: unknown[]) => unknown } }
}

// jsPDF doc type alias — covers what we use
type DocApi = {
  setFontSize: (s: number) => void
  setFont: (f: string, w: string) => void
  setTextColor: (r: number, g: number, b: number) => void
  setDrawColor: (r: number, g: number, b: number) => void
  setFillColor: (r: number, g: number, b: number) => void
  text: (t: string, x: number, y: number, opts?: { align?: string }) => void
  rect: (x: number, y: number, w: number, h: number, style?: string) => void
  line: (x1: number, y1: number, x2: number, y2: number) => void
  addPage: () => void
  save: (n: string) => void
  setPage: (n: number) => void
  internal?: { getNumberOfPages?: () => number }
}

// ── jsPDF loader (CDN with fallback, cached) ─────────────
let jsPDFLoaded = false
const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js',
  'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
]
const loadJsPDF = async (): Promise<void> => {
  if (jsPDFLoaded && window.jspdf) return
  // If a previous attempt left the global, use it
  if (window.jspdf) { jsPDFLoaded = true; return }

  let lastErr: Error | null = null
  for (const url of CDN_URLS) {
    try {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = url
        s.async = true
        const timeout = setTimeout(() => {
          s.remove()
          reject(new Error(`Timeout loading ${url}`))
        }, 8000)
        s.onload = () => { clearTimeout(timeout); resolve() }
        s.onerror = () => { clearTimeout(timeout); s.remove(); reject(new Error(`Failed: ${url}`)) }
        document.head.appendChild(s)
      })
      // Verify the global actually appeared (avoid TS narrowing issue by using a typed alias)
      const w = window as unknown as { jspdf?: { jsPDF: new (...args: unknown[]) => unknown } }
      if (w.jspdf && w.jspdf.jsPDF) {
        jsPDFLoaded = true
        return
      }
      lastErr = new Error(`Loaded ${url} but window.jspdf not available`)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      // Try next CDN
    }
  }
  throw lastErr || new Error('All PDF library CDNs unreachable. Check your internet connection or ad blocker.')
}

// ── Types ─────────────────────────────────────────────────
interface ImportOrder {
  id: string
  ref: string
  status: string
  order_date: string
  expected_ready_date: string | null
  currency: string
  fx_rate: number
  total_usd: number
  total_tzs: number
  total_freight_tzs: number
  total_landed_tzs: number
  notes: string | null
  supplier_id: string
  suppliers: { name: string; code: string } | null
  created_at: string
}

interface OrderLine {
  id: string
  order_id: string
  product_id: string | null
  description: string
  qty: number
  qty_received: number
  unit_cost_tzs: number
  subtotal_tzs: number
  landed_unit_cost_tzs: number
}

interface Payment {
  id: string
  order_id: string
  payment_type: string
  payment_date: string
  amount_tzs: number
  agent_name: string | null
  reference: string | null
}

interface Shipment {
  id: string
  order_id: string
  shipment_number: number
  method: string
  agent_name: string | null
  ship_date: string | null
  expected_arrival: string | null
  actual_arrival: string | null
  freight_cost_tzs: number
  status: string
  tracking_ref: string | null
  import_shipment_lines?: { qty_shipped: number; qty_received: number; order_line_id: string }[]
}

interface Supplier {
  id: string
  code: string
  name: string
  balance_tzs: number
}

interface Props {
  onNav?: (p: Page) => void
}

type Tab = 'overview' | 'outstanding' | 'in-transit' | 'cost-analysis'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'in-transit', label: 'In Transit' },
  { key: 'cost-analysis', label: 'Cost Analysis' },
]

const STA_C: Record<string, string> = {
  draft: 'pill-gray', deposit_paid: 'pill-amber', in_production: 'pill-amber',
  balance_paid: 'pill-blue', shipped: 'pill-blue', at_port: 'pill-amber',
  with_carrier: 'pill-amber', partially_received: 'pill-amber', received: 'pill-green',
  closed: 'pill-green', voided: 'pill-red',
}
const STA_L: Record<string, string> = {
  draft: 'Draft', deposit_paid: 'Deposit Sent', in_production: 'Producing',
  balance_paid: 'Fully Paid', shipped: 'Shipped', at_port: 'At Port',
  with_carrier: 'With Carrier', partially_received: 'Partial', received: 'In Godown',
  closed: 'Closed', voided: 'Voided',
}

export default function ImportRegister({ onNav }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type?: 'success' | 'error' } | null>(null)
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }

  const [orders, setOrders] = useState<ImportOrder[]>([])
  const [allLines, setAllLines] = useState<OrderLine[]>([])
  const [allPayments, setAllPayments] = useState<Payment[]>([])
  const [allShipments, setAllShipments] = useState<Shipment[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // Filters
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCurrency, setFilterCurrency] = useState('')

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [o, l, p, sh, s] = await Promise.all([
        supabase.from('import_orders').select('*, suppliers(name, code)').order('created_at', { ascending: false }),
        supabase.from('import_order_lines').select('*'),
        supabase.from('import_payments').select('*'),
        supabase.from('import_shipments').select('*, import_shipment_lines(*)'),
        supabase.from('suppliers').select('id, code, name, balance_tzs').eq('is_active', true).order('name'),
      ])
      if (o.data) setOrders(o.data as ImportOrder[])
      if (l.data) setAllLines(l.data as OrderLine[])
      if (p.data) setAllPayments(p.data as Payment[])
      if (sh.data) setAllShipments(sh.data as Shipment[])
      if (s.data) setSuppliers(s.data as Supplier[])
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Load failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ── Filtered orders ─────────────────────────────────────
  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (o.status === 'voided') return false
      if (filterFrom && o.order_date < filterFrom) return false
      if (filterTo && o.order_date > filterTo) return false
      if (filterSupplier && o.supplier_id !== filterSupplier) return false
      if (filterStatus && o.status !== filterStatus) return false
      if (filterCurrency && o.currency !== filterCurrency) return false
      return true
    })
  }, [orders, filterFrom, filterTo, filterSupplier, filterStatus, filterCurrency])

  // ── Per-order computed metrics ──────────────────────────
  const orderMetrics = useMemo(() => {
    const map = new Map<string, {
      supplierPaid: number; logisticsPaid: number; totalPaid: number
      qtyOrdered: number; qtyReceived: number
      pctPaid: number; pctReceived: number; outstandingToSupplier: number
    }>()
    for (const o of orders) {
      const pmts = allPayments.filter(p => p.order_id === o.id)
      const supplierPaid = pmts.filter(p => p.payment_type === 'supplier_deposit' || p.payment_type === 'supplier_balance').reduce((s, p) => s + p.amount_tzs, 0)
      const logisticsPaid = pmts.filter(p => p.payment_type !== 'supplier_deposit' && p.payment_type !== 'supplier_balance').reduce((s, p) => s + p.amount_tzs, 0)
      const lns = allLines.filter(l => l.order_id === o.id)
      const qtyOrdered = lns.reduce((s, l) => s + l.qty, 0)
      const qtyReceived = lns.reduce((s, l) => s + (l.qty_received || 0), 0)
      const pctPaid = o.total_tzs > 0 ? Math.min(100, Math.round(supplierPaid / o.total_tzs * 100)) : 0
      const pctReceived = qtyOrdered > 0 ? Math.round(qtyReceived / qtyOrdered * 100) : 0
      const outstandingToSupplier = Math.max(0, o.total_tzs - supplierPaid)
      map.set(o.id, {
        supplierPaid, logisticsPaid, totalPaid: supplierPaid + logisticsPaid,
        qtyOrdered, qtyReceived, pctPaid, pctReceived, outstandingToSupplier,
      })
    }
    return map
  }, [orders, allPayments, allLines])

  // ── KPIs for Overview ───────────────────────────────────
  const kpis = useMemo(() => {
    const active = filtered.filter(o => o.status !== 'closed' && o.status !== 'voided')
    let inTransitValue = 0; let outstandingSuppliers = 0; let totalSpend = 0; let landedTotal = 0
    for (const o of filtered) {
      const m = orderMetrics.get(o.id)
      if (!m) continue
      if (['shipped', 'at_port', 'with_carrier'].includes(o.status)) inTransitValue += o.total_tzs
      outstandingSuppliers += m.outstandingToSupplier
      totalSpend += m.totalPaid
      landedTotal += o.total_landed_tzs || (o.total_tzs + (o.total_freight_tzs || 0))
    }
    // Outstanding to logistics agents — tricky: agents are stored as suppliers, balance flows through
    // For a simplified view: sum the remaining_amount on vendor_ledger_entries linked to import journals
    // For now: just show unpaid logistics entries. Approximation: agents in suppliers list with balance.
    return { active: active.length, inTransitValue, outstandingSuppliers, totalSpend, landedTotal }
  }, [filtered, orderMetrics])

  // ── Outstanding tab data ─────────────────────────────────
  const outstandingBySupplier = useMemo(() => {
    const map = new Map<string, { supplier: Supplier; orders: { ref: string; date: string; outstanding: number; status: string }[] }>()
    for (const o of filtered) {
      const m = orderMetrics.get(o.id)
      if (!m || m.outstandingToSupplier <= 0) continue
      const sup = suppliers.find(s => s.id === o.supplier_id)
      if (!sup) continue
      if (!map.has(sup.id)) map.set(sup.id, { supplier: sup, orders: [] })
      map.get(sup.id)!.orders.push({ ref: o.ref, date: o.order_date, outstanding: m.outstandingToSupplier, status: o.status })
    }
    return Array.from(map.values()).sort((a, b) => {
      const totalA = a.orders.reduce((s, o) => s + o.outstanding, 0)
      const totalB = b.orders.reduce((s, o) => s + o.outstanding, 0)
      return totalB - totalA
    })
  }, [filtered, orderMetrics, suppliers])

  const totalOutstandingSuppliers = useMemo(() =>
    outstandingBySupplier.reduce((s, x) => s + x.orders.reduce((ss, o) => ss + o.outstanding, 0), 0),
  [outstandingBySupplier])

  // ── In Transit tab data ─────────────────────────────────
  const inTransitShipments = useMemo(() => {
    const today_ = today()
    return allShipments
      .filter(sh => sh.status === 'in_transit')
      .map(sh => {
        const o = orders.find(oo => oo.id === sh.order_id)
        if (!o) return null
        const lines = sh.import_shipment_lines || []
        const qtyShipped = lines.reduce((s, l) => s + (l.qty_shipped || 0), 0)
        const qtyReceived = lines.reduce((s, l) => s + (l.qty_received || 0), 0)
        const qtyPending = qtyShipped - qtyReceived
        // Estimate value: weighted by order's avg unit cost
        const orderQty = allLines.filter(l => l.order_id === o.id).reduce((s, l) => s + l.qty, 0)
        const avgUnitCost = orderQty > 0 ? o.total_tzs / orderQty : 0
        const value = qtyPending * avgUnitCost
        const daysInTransit = sh.ship_date
          ? Math.floor((new Date(today_).getTime() - new Date(sh.ship_date).getTime()) / (1000 * 60 * 60 * 24))
          : 0
        const isOverdue = sh.expected_arrival ? today_ > sh.expected_arrival : false
        return {
          shipment: sh, order: o, qtyShipped, qtyReceived, qtyPending, value, daysInTransit, isOverdue,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (b.daysInTransit) - (a.daysInTransit))
  }, [allShipments, orders, allLines])

  const totalInTransitValue = useMemo(() => inTransitShipments.reduce((s, x) => s + x.value, 0), [inTransitShipments])

  // ── Cost Analysis tab data ──────────────────────────────
  const supplierAnalysis = useMemo(() => {
    const map = new Map<string, {
      supplier: Supplier; orderCount: number; totalSpend: number
      totalReceivedQty: number; totalReceivedValue: number; totalFreight: number
      avgLandedPerUnit: number; freightPct: number
    }>()
    for (const o of filtered) {
      if (o.status === 'voided') continue
      const sup = suppliers.find(s => s.id === o.supplier_id)
      if (!sup) continue
      if (!map.has(sup.id)) {
        map.set(sup.id, {
          supplier: sup, orderCount: 0, totalSpend: 0, totalReceivedQty: 0,
          totalReceivedValue: 0, totalFreight: 0, avgLandedPerUnit: 0, freightPct: 0,
        })
      }
      const row = map.get(sup.id)!
      row.orderCount += 1
      row.totalSpend += o.total_tzs
      row.totalFreight += o.total_freight_tzs || 0
      const lns = allLines.filter(l => l.order_id === o.id)
      const qtyR = lns.reduce((s, l) => s + (l.qty_received || 0), 0)
      const valueR = lns.reduce((s, l) => s + ((l.qty_received || 0) * (l.landed_unit_cost_tzs || l.unit_cost_tzs || 0)), 0)
      row.totalReceivedQty += qtyR
      row.totalReceivedValue += valueR
    }
    for (const row of map.values()) {
      row.avgLandedPerUnit = row.totalReceivedQty > 0 ? row.totalReceivedValue / row.totalReceivedQty : 0
      const baseSpend = row.totalSpend
      row.freightPct = baseSpend > 0 ? (row.totalFreight / baseSpend) * 100 : 0
    }
    return Array.from(map.values()).sort((a, b) => b.totalSpend - a.totalSpend)
  }, [filtered, suppliers, allLines])

  const methodAnalysis = useMemo(() => {
    const map = new Map<string, { method: string; shipmentCount: number; totalQty: number; totalFreight: number; avgFreightPerUnit: number; avgTransitDays: number }>()
    const transitDayBuckets: Record<string, number[]> = {}
    for (const sh of allShipments) {
      const o = orders.find(oo => oo.id === sh.order_id)
      if (!o || o.status === 'voided') continue
      // Apply filter
      if (filterFrom && o.order_date < filterFrom) continue
      if (filterTo && o.order_date > filterTo) continue
      if (filterSupplier && o.supplier_id !== filterSupplier) continue
      const m = sh.method || 'unknown'
      if (!map.has(m)) {
        map.set(m, { method: m, shipmentCount: 0, totalQty: 0, totalFreight: 0, avgFreightPerUnit: 0, avgTransitDays: 0 })
        transitDayBuckets[m] = []
      }
      const row = map.get(m)!
      row.shipmentCount += 1
      row.totalFreight += sh.freight_cost_tzs || 0
      const lns = sh.import_shipment_lines || []
      row.totalQty += lns.reduce((s, l) => s + (l.qty_shipped || 0), 0)
      if (sh.ship_date && sh.actual_arrival) {
        const days = Math.floor((new Date(sh.actual_arrival).getTime() - new Date(sh.ship_date).getTime()) / (1000 * 60 * 60 * 24))
        if (days >= 0 && days < 365) transitDayBuckets[m].push(days)
      }
    }
    for (const row of map.values()) {
      row.avgFreightPerUnit = row.totalQty > 0 ? row.totalFreight / row.totalQty : 0
      const arr = transitDayBuckets[row.method]
      row.avgTransitDays = arr.length > 0 ? Math.round(arr.reduce((s, d) => s + d, 0) / arr.length) : 0
    }
    return Array.from(map.values()).sort((a, b) => b.totalFreight - a.totalFreight)
  }, [allShipments, orders, filterFrom, filterTo, filterSupplier])

  const currencyExposure = useMemo(() => {
    const map = new Map<string, { currency: string; orderCount: number; totalNative: number; totalTzs: number; avgFx: number }>()
    for (const o of filtered) {
      if (o.currency === 'TZS') continue
      if (!map.has(o.currency)) map.set(o.currency, { currency: o.currency, orderCount: 0, totalNative: 0, totalTzs: 0, avgFx: 0 })
      const row = map.get(o.currency)!
      row.orderCount += 1
      row.totalNative += o.total_usd  // field is named total_usd but actually holds native amount
      row.totalTzs += o.total_tzs
    }
    for (const row of map.values()) {
      row.avgFx = row.totalNative > 0 ? row.totalTzs / row.totalNative : 0
    }
    return Array.from(map.values())
  }, [filtered])

  // ── Export Summary PDF ──────────────────────────────────
  const exportSummaryPDF = async () => {
    try {
      await loadJsPDF()
      const w = window as unknown as { jspdf: { jsPDF: new (opts: { orientation?: string; unit?: string; format?: string }) => DocApi } }
      const company = getActiveCompany()
      const doc = new w.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = 297
      const accent = [133, 194, 190] as const  // SOKORA teal #85C2BE

      // ── Header bar (brand color band)
      doc.setFillColor(accent[0], accent[1], accent[2])
      doc.rect(0, 0, pageW, 22, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(18); doc.setFont('helvetica', 'bold')
      doc.text(company.name || 'Your Organization', 15, 14)
      doc.setFontSize(10); doc.setFont('helvetica', 'normal')
      doc.text('Import Register — Summary', pageW - 15, 14, { align: 'right' })

      // ── Sub-header
      doc.setTextColor(80, 80, 80)
      doc.setFontSize(9)
      doc.text(`Generated ${today()}`, 15, 30)

      // Filters — only show ones that are set
      const fparts: string[] = []
      if (filterFrom || filterTo) fparts.push(`Period: ${filterFrom || 'start'} to ${filterTo || 'today'}`)
      if (filterSupplier) fparts.push(`Supplier: ${suppliers.find(s => s.id === filterSupplier)?.name || ''}`)
      if (filterStatus) fparts.push(`Status: ${STA_L[filterStatus]}`)
      if (filterCurrency) fparts.push(`Currency: ${filterCurrency}`)
      if (fparts.length > 0) {
        doc.text(fparts.join('   |   '), 15, 35)
      } else {
        doc.text('No filters applied · Showing all import orders', 15, 35)
      }
      doc.setTextColor(0, 0, 0)

      // ── KPI cards (horizontal row)
      const kpiCards = [
        { label: 'Active Orders', value: `${kpis.active}` },
        { label: 'In Transit Value', value: tzs(kpis.inTransitValue) },
        { label: 'Outstanding to Suppliers', value: tzs(kpis.outstandingSuppliers) },
        { label: 'Total Spend', value: tzs(kpis.totalSpend) },
        { label: 'Total Landed', value: tzs(kpis.landedTotal) },
      ]
      const cardW = (pageW - 30) / 5
      const cardY = 42
      const cardH = 18
      doc.setDrawColor(220, 220, 220)
      for (let i = 0; i < kpiCards.length; i++) {
        const x = 15 + (i * cardW)
        doc.rect(x, cardY, cardW - 2, cardH)
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120)
        doc.text(kpiCards[i].label.toUpperCase(), x + 3, cardY + 5)
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
        doc.text(kpiCards[i].value, x + 3, cardY + 13)
      }

      // ── Orders table
      let y = cardY + cardH + 10
      doc.setTextColor(30, 30, 30)
      doc.setFontSize(11); doc.setFont('helvetica', 'bold')
      doc.text(`Orders (${filtered.length})`, 15, y)
      y += 6

      // Table header bar
      doc.setFillColor(245, 245, 245)
      doc.rect(15, y - 4, pageW - 30, 7, 'F')
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80)
      const headers = ['Ref', 'Date', 'Supplier', 'Currency', 'Total TZS', 'Paid %', 'Rcv %', 'Status']
      const colX = [17, 42, 65, 130, 152, 195, 220, 245]
      for (let i = 0; i < headers.length; i++) doc.text(headers[i], colX[i], y)
      y += 5
      doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'normal')

      let rowEven = false
      for (const o of filtered) {
        if (y > 195) {
          doc.addPage()
          y = 20
        }
        if (rowEven) {
          doc.setFillColor(250, 250, 250)
          doc.rect(15, y - 3.5, pageW - 30, 5.5, 'F')
        }
        rowEven = !rowEven
        const m = orderMetrics.get(o.id)
        doc.setFont('helvetica', 'bold'); doc.setTextColor(accent[0] - 50, accent[1] - 80, accent[2] - 80)
        doc.text(o.ref, colX[0], y)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
        doc.text(o.order_date, colX[1], y)
        doc.text((o.suppliers?.name || '—').substring(0, 38), colX[2], y)
        doc.text(o.currency, colX[3], y)
        doc.text(tzs(o.total_tzs), colX[4], y)
        doc.text(`${m?.pctPaid || 0}%`, colX[5], y)
        doc.text(`${m?.pctReceived || 0}%`, colX[6], y)
        doc.text(STA_L[o.status] || o.status, colX[7], y)
        y += 5.5
      }

      // ── Footer on every page
      const pageCount = doc.internal?.getNumberOfPages?.() || 1
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        doc.setDrawColor(220, 220, 220)
        doc.line(15, 200, pageW - 15, 200)
        doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal')
        doc.text(`${company.name || 'Your Organization'} · Dar es Salaam, Tanzania`, 15, 205)
        doc.text(`Page ${p} of ${pageCount}`, pageW - 15, 205, { align: 'right' })
      }

      doc.save(`Import_Register_${today()}.pdf`)
      showToast('PDF downloaded')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error')
    }
  }

  // ── Export single order detail PDF ──────────────────────
  const exportOrderPDF = async (o: ImportOrder) => {
    try {
      await loadJsPDF()
      const w = window as unknown as { jspdf: { jsPDF: new (opts: { unit?: string; format?: string }) => DocApi } }
      const company = getActiveCompany()
      const doc = new w.jspdf.jsPDF({ unit: 'mm', format: 'a4' })
      const pageW = 210
      const accent = [133, 194, 190] as const

      const lines = allLines.filter(l => l.order_id === o.id)
      const pmts = allPayments.filter(p => p.order_id === o.id)
      const ships = allShipments.filter(sh => sh.order_id === o.id)
      const m = orderMetrics.get(o.id)

      // ── Header band
      doc.setFillColor(accent[0], accent[1], accent[2])
      doc.rect(0, 0, pageW, 24, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(16); doc.setFont('helvetica', 'bold')
      doc.text(company.name || 'Your Organization', 15, 12)
      doc.setFontSize(10); doc.setFont('helvetica', 'normal')
      doc.text(`Import Order — ${o.ref}`, pageW - 15, 12, { align: 'right' })
      doc.setFontSize(8)
      doc.text(`Status: ${STA_L[o.status]}`, pageW - 15, 18, { align: 'right' })

      // ── Order info
      doc.setTextColor(30, 30, 30)
      let y = 32
      doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text(o.suppliers?.name || '—', 15, y); y += 6
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120)
      doc.text(`Order date: ${o.order_date}   ·   Currency: ${o.currency}${o.currency !== 'TZS' ? ` @ ${o.fx_rate}` : ''}`, 15, y); y += 8
      doc.setTextColor(30, 30, 30)

      // ── Summary box
      doc.setDrawColor(220, 220, 220)
      doc.rect(15, y, pageW - 30, 32)
      const sumRows: [string, string][] = [
        ['Order Total', tzs(o.total_tzs)],
        ['Supplier Paid', `${tzs(m?.supplierPaid || 0)} (${m?.pctPaid || 0}%)`],
        ['Logistics Costs', tzs(m?.logisticsPaid || 0)],
        ['Total Landed', tzs(o.total_landed_tzs || (o.total_tzs + (o.total_freight_tzs || 0)))],
        ['Received', `${m?.qtyReceived || 0} / ${m?.qtyOrdered || 0} units`],
        ['Outstanding to Supplier', tzs(m?.outstandingToSupplier || 0)],
      ]
      doc.setFontSize(8)
      for (let i = 0; i < sumRows.length; i++) {
        const col = i % 2
        const row = Math.floor(i / 2)
        const xPos = 18 + (col * (pageW - 36) / 2)
        const yPos = y + 6 + (row * 9)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120)
        doc.text(sumRows[i][0], xPos, yPos)
        doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
        doc.text(sumRows[i][1], xPos, yPos + 4)
      }
      y += 38

      // ── Lines
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
      doc.text('Products Ordered', 15, y); y += 6
      doc.setFillColor(245, 245, 245)
      doc.rect(15, y - 4, pageW - 30, 6, 'F')
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80)
      const linesH = ['Description', 'Qty', 'Unit TZS', 'Received', 'Landed/Unit']
      const linesX = [17, 100, 120, 150, 175]
      for (let i = 0; i < linesH.length; i++) doc.text(linesH[i], linesX[i], y)
      y += 5
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
      for (const l of lines) {
        if (y > 270) { doc.addPage(); y = 20 }
        doc.text(l.description.substring(0, 40), linesX[0], y)
        doc.text(`${l.qty}`, linesX[1], y)
        doc.text(tzs(l.unit_cost_tzs), linesX[2], y)
        doc.text(`${l.qty_received}/${l.qty}`, linesX[3], y)
        doc.text(tzs(Math.round(l.landed_unit_cost_tzs || 0)), linesX[4], y)
        y += 5
      }

      // ── Payments
      if (pmts.length > 0) {
        y += 6
        if (y > 250) { doc.addPage(); y = 20 }
        doc.setFontSize(11); doc.setFont('helvetica', 'bold')
        doc.text('Payments', 15, y); y += 6
        doc.setFillColor(245, 245, 245)
        doc.rect(15, y - 4, pageW - 30, 6, 'F')
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80)
        const phs = ['Date', 'Type', 'To', 'Reference', 'Amount']
        const phsX = [17, 47, 80, 130, 170]
        for (let i = 0; i < phs.length; i++) doc.text(phs[i], phsX[i], y)
        y += 5
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
        const typeLabel: Record<string, string> = {
          supplier_deposit: 'Deposit', supplier_balance: 'Balance',
          forwarding_agent: 'Shipping', customs_duties: 'Customs',
          clearing_fees: 'Clearing', local_carrier: 'Carrier',
        }
        for (const p of pmts) {
          if (y > 270) { doc.addPage(); y = 20 }
          doc.text(p.payment_date, phsX[0], y)
          doc.text(typeLabel[p.payment_type] || p.payment_type, phsX[1], y)
          doc.text((p.agent_name || o.suppliers?.name || '').substring(0, 25), phsX[2], y)
          doc.text((p.reference || '').substring(0, 18), phsX[3], y)
          doc.text(tzs(p.amount_tzs), phsX[4], y)
          y += 5
        }
      }

      // ── Shipments
      if (ships.length > 0) {
        y += 6
        if (y > 250) { doc.addPage(); y = 20 }
        doc.setFontSize(11); doc.setFont('helvetica', 'bold')
        doc.text('Shipments', 15, y); y += 6
        doc.setFillColor(245, 245, 245)
        doc.rect(15, y - 4, pageW - 30, 6, 'F')
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80)
        const shs = ['#', 'Method', 'Agent', 'Ship Date', 'Arrived', 'Freight', 'Status']
        const shsX = [17, 27, 52, 92, 117, 142, 172]
        for (let i = 0; i < shs.length; i++) doc.text(shs[i], shsX[i], y)
        y += 5
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
        for (const sh of ships) {
          if (y > 270) { doc.addPage(); y = 20 }
          doc.text(`${sh.shipment_number}`, shsX[0], y)
          doc.text(sh.method, shsX[1], y)
          doc.text((sh.agent_name || '—').substring(0, 22), shsX[2], y)
          doc.text(sh.ship_date || '—', shsX[3], y)
          doc.text(sh.actual_arrival || '—', shsX[4], y)
          doc.text(tzs(sh.freight_cost_tzs || 0), shsX[5], y)
          doc.text(sh.status, shsX[6], y)
          y += 5
        }
      }

      // ── Footer on all pages
      const pageCount = doc.internal?.getNumberOfPages?.() || 1
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        doc.setDrawColor(220, 220, 220)
        doc.line(15, 285, pageW - 15, 285)
        doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal')
        doc.text(`${company.name || 'Your Organization'} · Generated ${today()}`, 15, 290)
        doc.text(`Page ${p} of ${pageCount}`, pageW - 15, 290, { align: 'right' })
      }

      doc.save(`Import_${o.ref}.pdf`)
      showToast('PDF downloaded')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error')
    }
  }

  const clearFilters = () => {
    setFilterFrom(''); setFilterTo(''); setFilterSupplier(''); setFilterStatus(''); setFilterCurrency('')
  }

  const hasFilters = filterFrom || filterTo || filterSupplier || filterStatus || filterCurrency

  if (loading) return <div className="page"><div className="card" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3)' }}>Loading import register…</div></div>

  return (
    <div className="page">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header">
        <div>
          <div className="page-title">Import Register</div>
          <div className="page-sub">{filtered.length} order{filtered.length !== 1 ? 's' : ''} · Live from Supabase</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={exportSummaryPDF}>Export Summary PDF</button>
          <button className="btn btn-primary btn-sm" onClick={() => onNav && onNav('import-order')}>+ New Import Order</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: 10, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>From</div>
            <input type="date" className="form-input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ fontSize: 12 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>To</div>
            <input type="date" className="form-input" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ fontSize: 12 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>Supplier</div>
            <select className="form-input" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} style={{ fontSize: 12 }}>
              <option value="">All</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>Status</div>
            <select className="form-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 12 }}>
              <option value="">All</option>
              {Object.entries(STA_L).filter(([k]) => k !== 'voided').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>Currency</div>
            <select className="form-input" value={filterCurrency} onChange={e => setFilterCurrency(e.target.value)} style={{ fontSize: 12 }}>
              <option value="">All</option>
              <option value="TZS">TZS</option>
              <option value="USD">USD</option>
              <option value="RMB">RMB</option>
              <option value="INR">INR</option>
            </select>
          </div>
          {hasFilters && <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ height: 36 }}>Clear</button>}
        </div>
      </div>

      {/* TAB BAR */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t.key ? 'var(--accent)' : 'var(--text3)',
            fontWeight: tab === t.key ? 600 : 400, fontSize: 13, whiteSpace: 'nowrap',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ═══ TAB: OVERVIEW ═══ */}
      {tab === 'overview' && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
            <div className="stat-card blue"><div className="stat-label">Active Orders</div><div className="stat-value" style={{ fontSize: 24 }}>{kpis.active}</div><div className="stat-change">Not closed/voided</div></div>
            <div className="stat-card amber"><div className="stat-label">In Transit (Value)</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(kpis.inTransitValue)}</div><div className="stat-change">Shipped, not received</div></div>
            <div className="stat-card red"><div className="stat-label">Outstanding to Suppliers</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(kpis.outstandingSuppliers)}</div><div className="stat-change">Unpaid balances</div></div>
            <div className="stat-card green"><div className="stat-label">Total Spend</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(kpis.totalSpend)}</div><div className="stat-change">All payments made</div></div>
            <div className="stat-card"><div className="stat-label">Total Landed</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(kpis.landedTotal)}</div><div className="stat-change">Inventory value added</div></div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Orders ({filtered.length})</div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: 13 }}>
                No import orders match your filters.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Date</th>
                      <th>Supplier</th>
                      <th>Cur</th>
                      <th className="td-right">Total TZS</th>
                      <th className="td-right">Paid</th>
                      <th className="td-right">Rcv</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(o => {
                      const m = orderMetrics.get(o.id)
                      return (
                        <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => onNav && onNav('import-order')}>
                          <td className="td-mono" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 11 }}>{o.ref}</td>
                          <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{o.order_date}</td>
                          <td style={{ fontSize: 12, fontWeight: 600 }}>{o.suppliers?.name || '—'}</td>
                          <td className="td-mono" style={{ fontSize: 11 }}>{o.currency}</td>
                          <td className="td-right td-mono" style={{ fontWeight: 700 }}>{tzs(o.total_tzs)}</td>
                          <td className="td-right td-mono" style={{ color: (m?.pctPaid || 0) >= 100 ? 'var(--green)' : 'var(--yellow)' }}>{m?.pctPaid || 0}%</td>
                          <td className="td-right td-mono" style={{ color: (m?.pctReceived || 0) >= 100 ? 'var(--green)' : (m?.pctReceived || 0) > 0 ? 'var(--yellow)' : 'var(--text3)' }}>{m?.pctReceived || 0}%</td>
                          <td><span className={`pill ${STA_C[o.status] || 'pill-gray'}`} style={{ fontSize: 9 }}>{STA_L[o.status] || o.status}</span></td>
                          <td onClick={e => { e.stopPropagation(); exportOrderPDF(o) }}>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '3px 8px' }}>PDF</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ TAB: OUTSTANDING ═══ */}
      {tab === 'outstanding' && (
        <>
          <div className="card" style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(255,71,87,.06)', border: '1px solid rgba(255,71,87,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 4 }}>Total Outstanding to Suppliers</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800, color: 'var(--red)' }}>{tzs(totalOutstandingSuppliers)}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{outstandingBySupplier.length} supplier{outstandingBySupplier.length !== 1 ? 's' : ''} · {outstandingBySupplier.reduce((s, x) => s + x.orders.length, 0)} order{outstandingBySupplier.reduce((s, x) => s + x.orders.length, 0) !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {outstandingBySupplier.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
              <div style={{ fontSize: 13 }}>All suppliers paid in full ✓</div>
            </div>
          ) : outstandingBySupplier.map(({ supplier, orders }) => (
            <div key={supplier.id} className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{supplier.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{supplier.code} · {orders.length} unpaid order{orders.length !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>{tzs(orders.reduce((s, o) => s + o.outstanding, 0))}</div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Ref</th><th>Date</th><th>Status</th><th className="td-right">Outstanding</th></tr></thead>
                  <tbody>
                    {orders.map((o, i) => (
                      <tr key={i}>
                        <td className="td-mono" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 11 }}>{o.ref}</td>
                        <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{o.date}</td>
                        <td><span className={`pill ${STA_C[o.status] || 'pill-gray'}`} style={{ fontSize: 9 }}>{STA_L[o.status]}</span></td>
                        <td className="td-right td-mono" style={{ fontWeight: 700, color: 'var(--red)' }}>{tzs(o.outstanding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ═══ TAB: IN TRANSIT ═══ */}
      {tab === 'in-transit' && (
        <>
          <div className="card" style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(38,100,235,.06)', border: '1px solid rgba(38,100,235,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 4 }}>Total Value in Transit</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>{tzs(totalInTransitValue)}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{inTransitShipments.length} shipment{inTransitShipments.length !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {inTransitShipments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
              <div style={{ fontSize: 13 }}>No shipments currently in transit.</div>
            </div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ship Date</th>
                      <th>Days</th>
                      <th>ETA</th>
                      <th>Method</th>
                      <th>Order</th>
                      <th>Supplier</th>
                      <th>Agent</th>
                      <th className="td-right">Pending Qty</th>
                      <th className="td-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inTransitShipments.map(x => (
                      <tr key={x.shipment.id} style={{ background: x.isOverdue ? 'rgba(255,71,87,.04)' : undefined }}>
                        <td className="td-mono" style={{ fontSize: 11 }}>{x.shipment.ship_date || '—'}</td>
                        <td className="td-mono" style={{ fontSize: 11, color: x.daysInTransit > 30 ? 'var(--yellow)' : 'var(--text3)' }}>{x.daysInTransit}d</td>
                        <td className="td-mono" style={{ fontSize: 11, color: x.isOverdue ? 'var(--red)' : 'var(--text3)' }}>{x.shipment.expected_arrival || '—'}{x.isOverdue && ' ⚠'}</td>
                        <td><span className="pill pill-blue" style={{ fontSize: 9 }}>{x.shipment.method}</span></td>
                        <td className="td-mono" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 11 }}>{x.order.ref}</td>
                        <td style={{ fontSize: 12 }}>{x.order.suppliers?.name || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{x.shipment.agent_name || '—'}</td>
                        <td className="td-right td-mono" style={{ fontWeight: 700 }}>{x.qtyPending}/{x.qtyShipped}</td>
                        <td className="td-right td-mono" style={{ fontWeight: 700, color: 'var(--blue)' }}>{tzs(Math.round(x.value))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ TAB: COST ANALYSIS ═══ */}
      {tab === 'cost-analysis' && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>By Supplier</div>
            {supplierAnalysis.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>No supplier data.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Supplier</th><th className="td-right">Orders</th><th className="td-right">Total Spend</th><th className="td-right">Freight</th><th className="td-right">Freight %</th><th className="td-right">Avg Landed/Unit</th></tr></thead>
                  <tbody>
                    {supplierAnalysis.map(r => (
                      <tr key={r.supplier.id}>
                        <td style={{ fontWeight: 600, fontSize: 12 }}>{r.supplier.name}</td>
                        <td className="td-right td-mono">{r.orderCount}</td>
                        <td className="td-right td-mono" style={{ fontWeight: 700 }}>{tzs(r.totalSpend)}</td>
                        <td className="td-right td-mono">{tzs(r.totalFreight)}</td>
                        <td className="td-right td-mono" style={{ color: r.freightPct > 30 ? 'var(--red)' : r.freightPct > 15 ? 'var(--yellow)' : 'var(--green)' }}>{r.freightPct.toFixed(1)}%</td>
                        <td className="td-right td-mono" style={{ color: 'var(--accent)' }}>{tzs(Math.round(r.avgLandedPerUnit))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>By Shipping Method</div>
            {methodAnalysis.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>No shipping data.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Method</th><th className="td-right">Shipments</th><th className="td-right">Total Qty</th><th className="td-right">Total Freight</th><th className="td-right">Avg Freight/Unit</th><th className="td-right">Avg Transit</th></tr></thead>
                  <tbody>
                    {methodAnalysis.map(r => (
                      <tr key={r.method}>
                        <td><span className="pill pill-blue" style={{ fontSize: 10, textTransform: 'uppercase' }}>{r.method}</span></td>
                        <td className="td-right td-mono">{r.shipmentCount}</td>
                        <td className="td-right td-mono">{r.totalQty}</td>
                        <td className="td-right td-mono" style={{ fontWeight: 700 }}>{tzs(r.totalFreight)}</td>
                        <td className="td-right td-mono">{tzs(Math.round(r.avgFreightPerUnit))}</td>
                        <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{r.avgTransitDays > 0 ? `${r.avgTransitDays}d` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Currency Exposure</div>
            {currencyExposure.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>No foreign currency orders.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Currency</th><th className="td-right">Orders</th><th className="td-right">Total Native</th><th className="td-right">Total TZS</th><th className="td-right">Avg FX Rate</th></tr></thead>
                  <tbody>
                    {currencyExposure.map(r => (
                      <tr key={r.currency}>
                        <td style={{ fontWeight: 700, fontSize: 13 }}>{r.currency}</td>
                        <td className="td-right td-mono">{r.orderCount}</td>
                        <td className="td-right td-mono">{r.totalNative.toLocaleString()}</td>
                        <td className="td-right td-mono" style={{ fontWeight: 700 }}>{tzs(r.totalTzs)}</td>
                        <td className="td-right td-mono" style={{ color: 'var(--accent)' }}>{r.avgFx.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
