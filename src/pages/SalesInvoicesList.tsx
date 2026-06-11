// ─── Sales Invoices List ──────────────────────────────────────────────────
// Dedicated list of all posted sales invoices. Unlike Sales Day Book (which
// mixes cash sales + invoices), this is invoice-only with AR-aware columns:
// Due Date, Status (Paid/Partial/Open/Overdue), Paid, Balance.
//
// Clicking a row navigates to Sales Invoice in view/reprint mode.
// ──────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { today } from '../lib/utils'
import type { Page } from '../lib/types'
import { SokoraInvoice } from './InvoiceTemplate'
import { loadWAConfig, sendWhatsApp, formatInvoiceMessage } from '../lib/whatsapp'
import type { WAConfig } from '../lib/whatsapp'
import Toast from '../components/Toast'

interface Props {
  onNav: (p: Page) => void
  onEdit?: (p: Page, voucherId: string) => void  // kept for back-compat but unused
}

interface InvoiceRow {
  id: string
  ref: string
  posting_date: string
  due_date: string | null
  total_amount: number
  subtotal: number
  status: string
  notes: string | null
  payment_terms: string | null
  customer_id: string | null
  customers: {
    id: string
    name: string
    company: string | null
    customer_number: string
    whatsapp: string | null
    payment_terms: string | null
  } | null
  // Computed client-side from AR ledger
  paid?: number
  balance?: number
  derivedStatus?: 'paid' | 'partial' | 'open' | 'overdue'
  daysOverdue?: number
}

type StatusFilter = 'all' | 'paid' | 'partial' | 'open' | 'overdue'

export default function SalesInvoicesList({ onNav: _onNav }: Props) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(today())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Preview modal state — lets users view/reprint an invoice without leaving this page
  const [previewVoucher, setPreviewVoucher] = useState<any>(null)
  const [invoiceSettings, setInvoiceSettings] = useState<any>(null)
  const [waConfig, setWaConfig] = useState<WAConfig | null>(null)
  const [sending, setSending] = useState(false)
  const [waSent, setWaSent] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => { loadInvoices() }, [fromDate, toDate])

  // Load template settings + WhatsApp config once, used for the preview modal
  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'invoice_template').single()
      .then(({ data }) => { if (data?.value) try { setInvoiceSettings(JSON.parse(data.value)) } catch {} })
    loadWAConfig().then(setWaConfig)
  }, [])

  // Open preview modal by loading the full voucher with lines + customer.
  // Also fetches the ledger remaining_amount so we can show whether this
  // specific invoice is paid/partial/outstanding, and re-reads the customer's
  // CURRENT balance (not whatever was cached at posting time).
  const openPreview = async (voucherId: string) => {
    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select(`
        *,
        customers (id, name, company, contact_person, whatsapp, address, balance, credit_limit, credit_period, payment_terms, customer_number),
        voucher_lines (id, product_id, qty, unit_price, unit_cost, total, products (id, sku, name, category))
      `)
      .eq('id', voucherId)
      .single()

    if (error || !voucher) {
      console.error('[invoices] preview load failed:', error?.message, error?.details)
      setToast(`Failed to load invoice${error?.message ? ': ' + error.message : ''}`); setToastType('error')
      return
    }

    // Pull the ledger entry for this invoice so we know its current
    // remaining_amount (what's still owed on THIS invoice specifically).
    const { data: ledger } = await supabase
      .from('customer_ledger_entries')
      .select('remaining_amount, is_open')
      .eq('document_ref', voucher.ref)
      .eq('document_type', 'invoice')
      .maybeSingle()

    // Attach the live figures as extra properties on the voucher object so
    // they flow through to the invoice template via the viewMode prop.
    const enriched = {
      ...voucher,
      _viewMode: true,
      _invoiceRemaining: ledger?.remaining_amount ?? voucher.total_amount,
      _invoicePaid: (voucher.total_amount || 0) - (ledger?.remaining_amount ?? voucher.total_amount),
      _statementDate: new Date().toISOString().split('T')[0],
    }

    setPreviewVoucher(enriched)
    setWaSent(false)
  }

  const closePreview = () => {
    setPreviewVoucher(null)
    setWaSent(false)
  }

  // Generate and download a crisp PNG of the invoice preview. Loads
  // html2canvas lazily from CDN the first time it's used; subsequent calls
  // reuse the cached global. Used for easy sharing via WhatsApp/Slack/etc.
  const downloadPNG = () => {
    const el = document.getElementById('invoice-preview')
    if (!el || !previewVoucher) return
    setToast('Generating image…'); setToastType('success')
    const existing = (window as any).html2canvas
    const generate = () => {
      // Pass explicit width/height to capture the FULL invoice even when
      // the modal's scroll container has clipped it. Without these options
      // html2canvas captures only the viewport-visible portion.
      const fullWidth = el.scrollWidth || el.offsetWidth
      const fullHeight = el.scrollHeight || el.offsetHeight
      ;(window as any).html2canvas(el, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: fullWidth,
        height: fullHeight,
        windowWidth: fullWidth,
        windowHeight: fullHeight,
        scrollX: 0,
        scrollY: 0,
      })
        .then((canvas: HTMLCanvasElement) => {
          const link = document.createElement('a')
          link.download = `Invoice-${previewVoucher.ref}.png`
          link.href = canvas.toDataURL('image/png')
          link.click()
          setToast('Image downloaded'); setToastType('success')
        })
        .catch(() => { setToast('Image generation failed'); setToastType('error') })
    }
    if (existing) {
      generate()
    } else {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
      script.onload = generate
      script.onerror = () => { setToast('Could not load image library'); setToastType('error') }
      document.body.appendChild(script)
    }
  }

  const printPreview = () => {
    const el = document.getElementById('invoice-preview')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    const brandColor = invoiceSettings?.primary_color || '#85c2be'
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${previewVoucher.ref}</title>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@600&display=swap" rel="stylesheet">
      <style>
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        body{display:flex;justify-content:center;padding:20px;background:#f0f0f0}
        /* Force Chrome/Edge/Safari to keep our teal + cream background panels
           when printing to PDF. Without this, backgrounds strip to white. */
        *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
        @media print{
          body{background:#fff;padding:0;display:block}
          /* PDF size optimizations: strip decorative patterns/gradients so
             Chrome keeps the vector path and the file stays small (~80KB
             instead of ~500KB). */
          .no-print{display:none !important}
          .print-solid-bar{background:${brandColor} !important}
          /* Remove Chrome's URL / date / page-number header & footer */
          @page{size:A4;margin:0}
        }
      </style>
    </head><body>${el.outerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  const sendViaWhatsApp = async () => {
    if (!waConfig || !previewVoucher?.customers?.whatsapp) return
    setSending(true)
    const msg = formatInvoiceMessage(waConfig.template_invoice || '', {
      customer_name: previewVoucher.customers?.name || 'Customer',
      ref: previewVoucher.ref,
      date: previewVoucher.posting_date,
      due_date: previewVoucher.due_date || '',
      payment_terms: previewVoucher.payment_terms || '',
      items: previewVoucher.voucher_lines?.map((l: any) => ({
        name: l.products?.name || l.description || '—',
        qty: l.qty,
        amount: l.total,
      })) || [],
      total: previewVoucher.total_amount,
      outstanding: previewVoucher.customers?.balance || 0,
      bank_account: '22510074972 (NMB)',
    })
    const result = await sendWhatsApp(waConfig, {
      to: previewVoucher.customers.whatsapp, message: msg,
      type: 'invoice', ref: previewVoucher.ref,
      customer_name: previewVoucher.customers?.name,
      customer_id: previewVoucher.customer_id,
      is_transactional: true,
    })
    setSending(false)
    if (result.success) {
      setWaSent(true)
      setToast('Invoice sent via WhatsApp'); setToastType('success')
    } else {
      setToast('WhatsApp send failed'); setToastType('error')
    }
  }

  const loadInvoices = async () => {
    setLoading(true)
    // 1. Fetch invoices in the date range
    const { data: vouchers, error } = await supabase
      .from('vouchers')
      .select(`
        id, ref, posting_date, due_date, total_amount, subtotal,
        status, notes, payment_terms, customer_id,
        customers (id, name, company, customer_number, whatsapp, payment_terms)
      `)
      .eq('type', 'sales_invoice')
      .eq('status', 'posted')
      .gte('posting_date', fromDate)
      .lte('posting_date', toDate)
      .order('posting_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error || !vouchers) {
      console.error('[invoices] load failed:', error?.message)
      setInvoices([])
      setLoading(false)
      return
    }

    // 2. Fetch customer ledger entries to compute paid/remaining per invoice.
    //    This is the same table AR Aging uses — single source of truth.
    //    remaining_amount is the live outstanding balance on each document;
    //    we derive "paid" as (amount - remaining_amount).
    const invoiceRefs = vouchers.map(v => v.ref)
    const ledgerByRef: Record<string, { amount: number; remaining: number }> = {}

    if (invoiceRefs.length > 0) {
      const { data: ledger } = await supabase
        .from('customer_ledger_entries')
        .select('document_ref, amount, remaining_amount')
        .in('document_ref', invoiceRefs)

      for (const e of (ledger || [])) {
        // If the same invoice has multiple rows for some reason, sum them
        if (!ledgerByRef[e.document_ref]) {
          ledgerByRef[e.document_ref] = { amount: 0, remaining: 0 }
        }
        ledgerByRef[e.document_ref].amount += e.amount || 0
        ledgerByRef[e.document_ref].remaining += e.remaining_amount || 0
      }
    }

    // 3. Compute derived status per invoice
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)

    const enriched: InvoiceRow[] = vouchers.map((v: any) => {
      const ledgerRow = ledgerByRef[v.ref]
      // If the ledger has a matching row, use it. Otherwise fall back to
      // treating the voucher total as fully open (no receipts yet).
      const balance = ledgerRow ? ledgerRow.remaining : v.total_amount
      const paid = Math.max(0, v.total_amount - balance)
      const dueDate = v.due_date ? new Date(v.due_date) : null
      const isOverdue = dueDate ? dueDate < todayDate && balance > 0.5 : false
      const daysOverdue = isOverdue && dueDate
        ? Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0

      let derivedStatus: InvoiceRow['derivedStatus']
      if (balance < 0.5) derivedStatus = 'paid'
      else if (paid > 0.5) derivedStatus = 'partial'
      else if (isOverdue) derivedStatus = 'overdue'
      else derivedStatus = 'open'

      return { ...v, paid, balance, derivedStatus, daysOverdue }
    })

    setInvoices(enriched)
    setLoading(false)
  }

  // Apply search + status filters client-side so they feel instant
  const filtered = useMemo(() => {
    let result = invoices
    if (statusFilter !== 'all') {
      result = result.filter(i => i.derivedStatus === statusFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(i =>
        i.ref.toLowerCase().includes(q) ||
        (i.customers?.name || '').toLowerCase().includes(q) ||
        (i.customers?.company || '').toLowerCase().includes(q) ||
        (i.customers?.customer_number || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [invoices, search, statusFilter])

  const totals = useMemo(() => {
    const sum = (fn: (i: InvoiceRow) => number) => filtered.reduce((a, i) => a + fn(i), 0)
    return {
      count: filtered.length,
      gross: sum(i => i.total_amount),
      paid: sum(i => i.paid || 0),
      outstanding: sum(i => i.balance || 0),
      overdue: sum(i => i.derivedStatus === 'overdue' ? (i.balance || 0) : 0),
    }
  }, [filtered])

  // Count per-status for filter pill badges
  const statusCounts = useMemo(() => {
    const c = { all: invoices.length, paid: 0, partial: 0, open: 0, overdue: 0 }
    for (const i of invoices) {
      if (i.derivedStatus) c[i.derivedStatus]++
    }
    return c
  }, [invoices])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Sales Invoices</div>
          <div className="page-sub">All posted credit invoices · View, reprint, track payments</div>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        <KPI label="Invoices"          value={totals.count.toLocaleString()} />
        <KPI label="Gross Invoiced"    value={`TZS ${totals.gross.toLocaleString()}`} />
        <KPI label="Collected"         value={`TZS ${totals.paid.toLocaleString()}`} color="var(--green)" />
        <KPI label="Outstanding"       value={`TZS ${totals.outstanding.toLocaleString()}`} color={totals.outstanding > 0 ? 'var(--yellow)' : 'var(--text3)'} />
        <KPI label="Overdue"           value={`TZS ${totals.overdue.toLocaleString()}`} color={totals.overdue > 0 ? 'var(--red)' : 'var(--text3)'} />
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 240 }}>
            <input
              className="form-input"
              placeholder="Search ref, customer, DEB number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>From</label>
            <input type="date" className="form-input" style={{ fontSize: 12, width: 140 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>To</label>
            <input type="date" className="form-input" style={{ fontSize: 12, width: 140 }} value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
        </div>

        {/* Status filter pills */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {([
            { key: 'all',      label: 'All',      color: 'var(--text2)' },
            { key: 'paid',     label: 'Paid',     color: 'var(--green)' },
            { key: 'partial',  label: 'Partial',  color: '#3d8bff' },
            { key: 'open',     label: 'Open',     color: 'var(--yellow)' },
            { key: 'overdue',  label: 'Overdue',  color: 'var(--red)' },
          ] as const).map(s => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600,
                background: statusFilter === s.key ? `${s.color}22` : 'var(--surface2)',
                color: statusFilter === s.key ? s.color : 'var(--text3)',
                border: `1px solid ${statusFilter === s.key ? s.color : 'var(--border)'}`,
                borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--mono)',
                textTransform: 'uppercase', letterSpacing: 0.5,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {s.label}
              <span style={{ opacity: 0.6 }}>{statusCounts[s.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap" style={{ maxHeight: '60vh' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>
              <tr>
                <th style={{ width: 90 }}>Date</th>
                <th style={{ width: 110 }}>Invoice #</th>
                <th>Customer</th>
                <th style={{ width: 90 }}>Due</th>
                <th style={{ width: 110 }}>Status</th>
                <th className="td-right" style={{ width: 120 }}>Total</th>
                <th className="td-right" style={{ width: 120 }}>Paid</th>
                <th className="td-right" style={{ width: 130 }}>Balance</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading invoices…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
                  No invoices match your filters. Try widening the date range or clearing the search.
                </td></tr>
              )}
              {!loading && filtered.map((inv, i) => (
                <tr key={i}
                  onClick={() => openPreview(inv.id)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{inv.posting_date}</td>
                  <td className="td-mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{inv.ref}</td>
                  <td>
                    <div className="td-bold">{inv.customers?.company || inv.customers?.name || '—'}</div>
                    {inv.customers?.customer_number && (
                      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{inv.customers.customer_number}</div>
                    )}
                  </td>
                  <td className="td-mono" style={{ fontSize: 11, color: inv.derivedStatus === 'overdue' ? 'var(--red)' : 'var(--text3)' }}>
                    {inv.due_date || '—'}
                    {inv.derivedStatus === 'overdue' && inv.daysOverdue ? (
                      <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>+{inv.daysOverdue}d</div>
                    ) : null}
                  </td>
                  <td><StatusPill status={inv.derivedStatus!} /></td>
                  <td className="td-right td-mono">{inv.total_amount.toLocaleString()}</td>
                  <td className="td-right td-mono" style={{ color: (inv.paid || 0) > 0 ? 'var(--green)' : 'var(--text3)' }}>
                    {(inv.paid || 0) > 0 ? inv.paid!.toLocaleString() : '—'}
                  </td>
                  <td className="td-right td-mono" style={{
                    fontWeight: 700,
                    color: (inv.balance || 0) > 0.5 ? (inv.derivedStatus === 'overdue' ? 'var(--red)' : 'var(--yellow)') : 'var(--green)',
                  }}>
                    {(inv.balance || 0) > 0.5 ? inv.balance!.toLocaleString() : '✓'}
                  </td>
                  <td onClick={e => e.stopPropagation()} style={{ width: 60 }}>
                    {/* Row-level quick actions — stop propagation so they don't trigger the row click */}
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => openPreview(inv.id)}
                        title="View & Reprint"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}
                      >
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PREVIEW MODAL ─────────────────────────────────────────────────── */}
      {previewVoucher && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)',
          display: 'flex', flexDirection: 'column', zIndex: 9999,
        }}>
          <div style={{
            background: 'var(--surface)', borderBottom: '1px solid var(--border)',
            padding: '12px 24px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', flexShrink: 0,
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700 }}>
              Invoice — {previewVoucher.ref}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={printPreview} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Print / PDF
              </button>
              <button className="btn btn-ghost btn-sm" onClick={downloadPNG} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                Save PNG
              </button>
              {waConfig?.enabled && waConfig?.api_key && previewVoucher.customers?.whatsapp && (
                <button className="btn btn-ghost btn-sm" disabled={sending || waSent}
                  onClick={sendViaWhatsApp}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#25D366', border: '1px solid rgba(37,211,102,.3)' }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                  </svg>
                  {sending ? 'Sending…' : waSent ? 'Sent ✓' : 'WhatsApp'}
                </button>
              )}
              <button className="btn btn-ghost" onClick={closePreview}>Close</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '32px 20px' }}>
            <div id="invoice-preview">
              <SokoraInvoice voucher={previewVoucher} settings={invoiceSettings || {
                company_name: 'Your Organization', tagline: 'Reimagining Motherhood',
                address: 'Dar es Salaam, Tanzania', city: 'Dar es Salaam',
                phone: '+255 700 000 000', email: 'hello@sokora.app', website: 'www.sokora.app',
                tin: '—', vrn: '—', primary_color: '#85c2be',
                bank_name: 'NMB Bank', bank_account_name: 'Your Organization',
                bank_account_number: '22510074972', bank_branch: 'Dar es Salaam Branch',
                show_bank_details: true, show_salesperson: true, show_vat_breakdown: true,
                show_outstanding_balance: true, show_payment_terms: true, show_notes: true,
                footer_note: 'Thank you for your business. Payment is due by the date shown above.',
                payment_note: 'Please quote the invoice number as payment reference.',
              }} />
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}

// ─── Small components ──────────────────────────────────────────────────────

function KPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', padding: '12px 16px',
    }}>
      <div style={{
        fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
      }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: color || 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: 'paid' | 'partial' | 'open' | 'overdue' }) {
  const style = {
    paid:    { bg: 'rgba(0,229,160,.15)',  fg: 'var(--green)',  label: 'Paid' },
    partial: { bg: 'rgba(61,139,255,.15)', fg: '#3d8bff',       label: 'Partial' },
    open:    { bg: 'rgba(234,179,8,.15)',  fg: 'var(--yellow)', label: 'Open' },
    overdue: { bg: 'rgba(239,68,68,.15)',  fg: 'var(--red)',    label: 'Overdue' },
  }[status]
  return (
    <span style={{
      background: style.bg, color: style.fg,
      padding: '3px 9px', borderRadius: 4, fontSize: 10, fontWeight: 700,
      fontFamily: 'var(--mono)', letterSpacing: 0.5, textTransform: 'uppercase',
    }}>
      {style.label}
    </span>
  )
}
