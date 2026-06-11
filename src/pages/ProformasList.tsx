// ─── Proformas List ──────────────────────────────────────────────────────
// Browse every proforma ever saved, search, filter, and act on them.
//
// Inline actions per row:
//   Preview      — open the full proforma template in a modal
//   Edit         — jump back to the voucher form in edit mode
//   Convert →    — turn into a Sales Invoice (with stock + GL) or Cash Sale
//   Mark Lost    — customer declined / went quiet
//   Duplicate    — clone as a starting point for a new proforma
//   Reprint      — print / PDF via browser
//   Save PNG     — image download for WhatsApp sharing
//   WhatsApp     — re-send the proforma message to the customer
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { today } from '../lib/utils'
import { nextRef } from '../lib/refs'
import { SokoraProforma, DEFAULT_PROFORMA } from './ProformaTemplate'
import type { ProformaSettings } from './ProformaTemplate'
import { loadWAConfig, sendWhatsApp, formatInvoiceMessage } from '../lib/whatsapp'
import type { WAConfig } from '../lib/whatsapp'
import type { Page } from '../lib/types'
import Toast from '../components/Toast'

interface Props {
  onNav: (p: Page) => void
  onEdit?: (p: Page, voucherId: string) => void
}

interface ProformaRow {
  id: string
  ref: string
  posting_date: string
  due_date: string | null           // "valid until" in proforma-speak
  total_amount: number
  subtotal: number
  status: string                    // 'proforma' | 'converted' | 'lost' | etc
  notes: string | null
  payment_terms: string | null
  customer_id: string | null
  customers: {
    id: string
    name: string
    company: string | null
    customer_number: string
    whatsapp: string | null
  } | null
  // Computed
  derivedStatus?: 'active' | 'expired' | 'converted' | 'lost'
  daysUntilExpiry?: number
}

type StatusFilter = 'all' | 'active' | 'expired' | 'converted' | 'lost'

// ─── Status helpers ─────────────────────────────────────────────────────
// Derive a display status that combines the stored `status` field with the
// valid-until date. An active proforma past its valid-until shows as "expired"
// but remains editable.

function deriveStatus(row: Pick<ProformaRow, 'status' | 'due_date'>): 'active' | 'expired' | 'converted' | 'lost' {
  if (row.status === 'converted') return 'converted'
  if (row.status === 'lost') return 'lost'
  if (row.due_date && row.due_date < today()) return 'expired'
  return 'active'
}

const STATUS_COLOR: Record<string, { bg: string; fg: string; label: string }> = {
  active:    { bg: 'rgba(34,197,94,.12)',   fg: '#22c55e', label: 'Active' },
  expired:   { bg: 'rgba(234,179,8,.12)',   fg: '#eab308', label: 'Expired' },
  converted: { bg: 'rgba(59,130,246,.12)',  fg: '#3b82f6', label: 'Converted' },
  lost:      { bg: 'rgba(148,163,184,.15)', fg: '#94a3b8', label: 'Lost' },
}

// ─── Component ──────────────────────────────────────────────────────────

export default function ProformasList({ onNav, onEdit }: Props) {
  const [rows, setRows] = useState<ProformaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(today())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Preview modal state
  const [previewVoucher, setPreviewVoucher] = useState<any>(null)
  const [previewRow, setPreviewRow] = useState<ProformaRow | null>(null)
  const [templateSettings, setTemplateSettings] = useState<ProformaSettings>(DEFAULT_PROFORMA)
  const [waConfig, setWaConfig] = useState<WAConfig | null>(null)
  const [sending, setSending] = useState(false)
  const [waSent, setWaSent] = useState(false)
  const [actionRowId, setActionRowId] = useState<string | null>(null)  // which row's action menu is open
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => { load() }, [fromDate, toDate])
  useEffect(() => {
    // Load template settings + WA config once
    supabase.from('system_settings').select('value').eq('key', 'proforma_template').single()
      .then(({ data }) => {
        if (data?.value) try { setTemplateSettings({ ...DEFAULT_PROFORMA, ...JSON.parse(data.value) }) } catch {}
      })
    loadWAConfig().then(setWaConfig)
  }, [])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('vouchers')
      .select(`
        id, ref, posting_date, due_date, total_amount, subtotal, status, notes, payment_terms, customer_id,
        customers ( id, name, company, customer_number, whatsapp )
      `)
      .eq('type', 'proforma')
      .gte('posting_date', fromDate)
      .lte('posting_date', toDate)
      .order('posting_date', { ascending: false })
      .order('ref', { ascending: false })
    if (error) {
      setToast(`Load failed: ${error.message}`); setToastType('error')
      setLoading(false); return
    }
    const hydrated = (data || []).map((r: any) => {
      const derived = deriveStatus(r)
      const daysUntilExpiry = r.due_date
        ? Math.floor((new Date(r.due_date).getTime() - new Date(today()).getTime()) / 86400000)
        : undefined
      return { ...r, derivedStatus: derived, daysUntilExpiry }
    })
    setRows(hydrated)
    setLoading(false)
  }

  // ─── Client-side search + status filter ────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.derivedStatus !== statusFilter) return false
      if (!q) return true
      return (
        r.ref.toLowerCase().includes(q) ||
        r.customers?.name?.toLowerCase().includes(q) ||
        r.customers?.company?.toLowerCase().includes(q) ||
        r.customers?.customer_number?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q)
      )
    })
  }, [rows, search, statusFilter])

  // ─── Stats ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = rows.filter(r => r.derivedStatus === 'active')
    const converted = rows.filter(r => r.derivedStatus === 'converted')
    const totalActiveValue = active.reduce((s, r) => s + (r.total_amount || 0), 0)
    const totalConvertedValue = converted.reduce((s, r) => s + (r.total_amount || 0), 0)
    const conversionRate = rows.length > 0 ? (converted.length / rows.length) * 100 : 0
    return {
      total: rows.length,
      active: active.length,
      activeValue: totalActiveValue,
      converted: converted.length,
      convertedValue: totalConvertedValue,
      conversionRate,
    }
  }, [rows])

  // ─── Open preview modal ──────────────────────────────────────────────
  const openPreview = async (row: ProformaRow) => {
    const { data, error } = await supabase.from('vouchers')
      .select(`
        id, ref, posting_date, due_date, total_amount, subtotal, vat_amount, status, notes, payment_terms, posted_by,
        customers ( name, company, contact_person, whatsapp, address, email ),
        voucher_lines ( line_number, description, qty, unit_price, discount_pct, total, products ( name, sku ) )
      `)
      .eq('id', row.id)
      .single()
    if (error || !data) {
      setToast(`Load failed: ${error?.message || 'not found'}`); setToastType('error'); return
    }
    // Build a voucher shape the SokoraProforma template expects
    const v: any = {
      ref: data.ref,
      posting_date: data.posting_date,
      valid_until: data.due_date,
      payment_terms: data.payment_terms,
      delivery_terms: '',
      notes: data.notes,
      subtotal: data.subtotal,
      vat_amount: data.vat_amount || 0,
      total_amount: data.total_amount,
      posted_by: data.posted_by,
      status: data.status,
      customers: data.customers,
      voucher_lines: (data.voucher_lines || []).sort((a: any, b: any) => (a.line_number || 0) - (b.line_number || 0)),
    }
    setPreviewVoucher(v)
    setPreviewRow(row)
    setWaSent(false)
  }

  const closePreview = () => { setPreviewVoucher(null); setPreviewRow(null); setWaSent(false) }

  // ─── Actions ───────────────────────────────────────────────────────────

  // Edit: jump back into the voucher form in edit mode.
  const editProforma = (row: ProformaRow) => {
    if (row.derivedStatus === 'converted') {
      setToast('This proforma was already converted. Edit the resulting invoice instead.'); setToastType('error'); return
    }
    if (onEdit) onEdit('proforma', row.id)
    else onNav('proforma')
  }

  // Mark a proforma as lost (customer declined / went quiet).
  const markAsLost = async (row: ProformaRow) => {
    if (!confirm(`Mark ${row.ref} as lost? This is reversible — you can re-open it later.`)) return
    const { error } = await supabase.from('vouchers')
      .update({ status: 'lost', notes: `${row.notes || ''}\n[Marked lost on ${today()}]`.trim() })
      .eq('id', row.id)
    if (error) { setToast(`Update failed: ${error.message}`); setToastType('error'); return }
    setToast(`${row.ref} marked as lost`)
    load()
  }

  // Re-open a lost proforma back to active.
  const reopenProforma = async (row: ProformaRow) => {
    const { error } = await supabase.from('vouchers')
      .update({ status: 'proforma' })
      .eq('id', row.id)
    if (error) { setToast(`Update failed: ${error.message}`); setToastType('error'); return }
    setToast(`${row.ref} reopened`)
    load()
  }

  // Convert: stash prefill data in localStorage so SalesInvoice (or CashSale)
  // picks it up on mount. Mark this proforma as converted so it shows the
  // right status in the list. Same pattern as the existing convertToInvoice
  // in ProformaInvoice.tsx.
  const convertTo = async (row: ProformaRow, target: 'sales-invoice' | 'cash-sale') => {
    try {
      // Load full voucher + lines to build prefill
      const { data: v, error } = await supabase.from('vouchers')
        .select(`
          id, ref, posting_date, due_date, notes, payment_terms, customer_id,
          customers ( id, name, whatsapp ),
          voucher_lines ( line_number, product_id, description, qty, unit_price, discount_pct, total )
        `)
        .eq('id', row.id)
        .single()
      if (error || !v) throw new Error(error?.message || 'not found')

      const targetRefType = target === 'sales-invoice' ? 'sales_invoice' : 'cash_sale'
      const newRef = await nextRef(targetRefType)
      const prefillKey = target === 'sales-invoice' ? 'prefill_invoice' : 'prefill_cash_sale'
      const cust = v.customers as any

      localStorage.setItem(prefillKey, JSON.stringify({
        customerId: v.customer_id,
        customer: cust?.name || '',
        wa: cust?.whatsapp || '',
        ref: newRef,
        paymentTerms: v.payment_terms,
        notes: v.notes,
        lines: ((v.voucher_lines as any[]) || [])
          .sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
          .map(l => ({
            productId: l.product_id, desc: l.description,
            qty: l.qty, price: l.unit_price, discount: l.discount_pct, amount: l.total,
          })),
        pfRef: v.ref,
      }))

      await supabase.from('vouchers')
        .update({ status: 'converted', notes: `${v.notes || ''}\n[Converted to ${newRef} on ${today()}]`.trim() })
        .eq('id', row.id)

      setToast(`Converting ${row.ref} → ${newRef}…`)
      setTimeout(() => onNav(target), 500)
    } catch (err: any) {
      setToast(`Conversion failed: ${err.message}`); setToastType('error')
    }
  }

  // Duplicate: clone an existing proforma into the form as a new draft.
  // Stashes in localStorage under 'prefill_proforma' (handled by
  // ProformaInvoice; if not wired there, it still no-ops gracefully because
  // the user just lands on a fresh form).
  const duplicateProforma = async (row: ProformaRow) => {
    const { data: v, error } = await supabase.from('vouchers')
      .select(`
        ref, posting_date, due_date, notes, payment_terms, customer_id,
        customers ( id, name, whatsapp ),
        voucher_lines ( line_number, product_id, description, qty, unit_price, discount_pct, total )
      `)
      .eq('id', row.id)
      .single()
    if (error || !v) { setToast(`Load failed: ${error?.message || 'not found'}`); setToastType('error'); return }
    const cust = v.customers as any
    localStorage.setItem('prefill_proforma', JSON.stringify({
      customerId: v.customer_id,
      customer: cust?.name || '',
      wa: cust?.whatsapp || '',
      paymentTerms: v.payment_terms,
      notes: v.notes,
      lines: ((v.voucher_lines as any[]) || [])
        .sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
        .map(l => ({
          productId: l.product_id, desc: l.description,
          qty: l.qty, price: l.unit_price, discount: l.discount_pct, amount: l.total,
        })),
      sourceRef: v.ref,
    }))
    setToast(`Duplicating ${v.ref}…`)
    setTimeout(() => onNav('proforma'), 500)
  }

  // ─── Preview modal: print / PNG / WhatsApp ──────────────────────────

  const printPreview = () => {
    const el = document.getElementById('proforma-preview')
    if (!el || !previewVoucher) return
    const win = window.open('', '_blank')
    if (!win) return
    const brandColor = templateSettings?.primary_color || '#5EA8A2'
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Proforma ${previewVoucher.ref}</title>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@600&display=swap" rel="stylesheet">
      <style>
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        body{padding:0;background:#fff;font-family:'Instrument Sans',sans-serif}
        *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
        @media print{ .no-print{display:none !important} .print-solid-bar{background:${brandColor} !important} @page{size:A4;margin:0} }
      </style>
    </head><body>${el.outerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  const downloadPNG = () => {
    const el = document.getElementById('proforma-preview')
    if (!el || !previewVoucher) return
    setToast('Generating image…'); setToastType('success')
    const existing = (window as any).html2canvas
    const generate = () => {
      const fullWidth = el.scrollWidth || el.offsetWidth
      const fullHeight = el.scrollHeight || el.offsetHeight
      ;(window as any).html2canvas(el, {
        scale: 1.5, useCORS: true, backgroundColor: '#ffffff',
        width: fullWidth, height: fullHeight,
        windowWidth: fullWidth, windowHeight: fullHeight,
        scrollX: 0, scrollY: 0,
      })
        .then((canvas: HTMLCanvasElement) => {
          const link = document.createElement('a')
          link.download = `Proforma-${previewVoucher.ref}.png`
          link.href = canvas.toDataURL('image/png')
          link.click()
          setToast('Image downloaded')
        })
        .catch(() => { setToast('Image generation failed'); setToastType('error') })
    }
    if (existing) { generate(); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    script.onload = generate
    script.onerror = () => { setToast('Could not load image library'); setToastType('error') }
    document.body.appendChild(script)
  }

  const sendViaWhatsApp = async () => {
    if (!previewVoucher || !waConfig || !previewVoucher.customers?.whatsapp) return
    setSending(true)
    const msg = formatInvoiceMessage(waConfig.template_invoice || '', {
      customer_name: previewVoucher.customers?.name || 'Customer',
      ref: previewVoucher.ref,
      date: previewVoucher.posting_date,
      due_date: previewVoucher.valid_until || '',
      payment_terms: previewVoucher.payment_terms || '',
      items: (previewVoucher.voucher_lines || []).map((l: any) => ({
        name: l.products?.name || l.description || '—',
        qty: l.qty, amount: l.total,
      })),
      total: previewVoucher.total_amount,
      outstanding: 0,
      bank_account: '22510074972 (NMB)',
    })
    const res = await sendWhatsApp(waConfig, {
      to: previewVoucher.customers.whatsapp,
      message: msg, type: 'custom',
      ref: previewVoucher.ref,
      customer_name: previewVoucher.customers?.name,
      customer_id: previewVoucher.customer_id,
      is_transactional: true,
    })
    setSending(false)
    if (res.success) { setToast('Proforma sent via WhatsApp'); setWaSent(true) }
    else { setToast(res.error || 'WhatsApp send failed'); setToastType('error') }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Proforma Invoices</div>
          <div className="page-sub">
            {stats.total} total · {stats.active} active · {stats.converted} converted · {stats.conversionRate.toFixed(0)}% conversion rate
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => onNav('proforma')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Proforma
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Active Value', val: `TZS ${stats.activeValue.toLocaleString()}`, color: '#22c55e', hint: `${stats.active} open` },
          { label: 'Converted Value', val: `TZS ${stats.convertedValue.toLocaleString()}`, color: '#3b82f6', hint: `${stats.converted} closed-won` },
          { label: 'Conversion Rate', val: `${stats.conversionRate.toFixed(1)}%`, color: 'var(--accent)', hint: `${stats.converted} of ${stats.total}` },
          { label: 'Total Proformas', val: stats.total.toString(), color: 'var(--text)', hint: 'in selected period' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{s.hint}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="Search ref, customer, company, notes…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: 280, fontSize: 12 }} />

        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Date:</span>
        <input type="date" className="form-input" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: 140, fontSize: 12 }} />
        <span style={{ color: 'var(--text3)', fontSize: 11 }}>to</span>
        <input type="date" className="form-input" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: 140, fontSize: 12 }} />

        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
        {(['all', 'active', 'expired', 'converted', 'lost'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{
              padding: '5px 12px', fontSize: 11, fontWeight: 600,
              border: `1px solid ${statusFilter === s ? 'var(--accent)' : 'var(--border)'}`,
              background: statusFilter === s ? 'var(--accent-dim)' : 'var(--surface)',
              color: statusFilter === s ? 'var(--accent)' : 'var(--text3)',
              borderRadius: 6, cursor: 'pointer', textTransform: 'capitalize',
            }}>
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
            No proformas found. <button onClick={() => onNav('proforma')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Create one</button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Date', 'Ref', 'Customer', 'Valid Until', 'Status', 'Total', 'Actions'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: i === 5 ? 'right' : 'left', fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const derived = row.derivedStatus || 'active'
                const clr = STATUS_COLOR[derived]
                const daysLeft = row.daysUntilExpiry
                const expiryHint =
                  derived === 'active' && daysLeft !== undefined
                    ? (daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `${daysLeft}d left`)
                    : derived === 'expired' && daysLeft !== undefined
                      ? `${Math.abs(daysLeft)}d ago`
                      : ''
                const isMenuOpen = actionRowId === row.id

                return (
                  <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{row.posting_date}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      onClick={() => openPreview(row)}>
                      {row.ref}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {row.customers?.company || row.customers?.name || '—'}
                      </div>
                      {row.customers?.customer_number && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{row.customers.customer_number}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {row.due_date || '—'}
                      {expiryHint && (
                        <div style={{ fontSize: 10, color: derived === 'expired' ? '#eab308' : 'var(--text3)', marginTop: 2 }}>
                          {expiryHint}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: clr.bg, color: clr.fg, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        {clr.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>
                      {row.total_amount.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', position: 'relative' }}>
                      {/* Quick actions: Preview inline, rest behind a menu */}
                      <button onClick={() => openPreview(row)}
                        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, color: 'var(--text3)', marginRight: 4 }}>
                        Preview
                      </button>
                      <button onClick={() => setActionRowId(isMenuOpen ? null : row.id)}
                        onBlur={() => setTimeout(() => setActionRowId(null), 150)}
                        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 14, color: 'var(--text3)', lineHeight: 1 }}>
                        ⋯
                      </button>
                      {isMenuOpen && (
                        <div style={{
                          position: 'absolute', right: 10, top: 36,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 8, minWidth: 200, zIndex: 40,
                          boxShadow: '0 10px 30px rgba(0,0,0,.35)', overflow: 'hidden',
                        }}>
                          <ActionItem label="Edit" disabled={derived === 'converted'} onClick={() => editProforma(row)} />
                          <ActionItem label="Duplicate" onClick={() => duplicateProforma(row)} />
                          <div style={{ height: 1, background: 'var(--border)' }} />
                          {derived !== 'converted' && (
                            <>
                              <ActionItem label="→ Convert to Sales Invoice" onClick={() => convertTo(row, 'sales-invoice')} highlight />
                              <ActionItem label="→ Convert to Cash Sale" onClick={() => convertTo(row, 'cash-sale')} />
                              <div style={{ height: 1, background: 'var(--border)' }} />
                            </>
                          )}
                          {derived !== 'lost' && derived !== 'converted' && (
                            <ActionItem label="Mark as Lost" onClick={() => markAsLost(row)} danger />
                          )}
                          {derived === 'lost' && (
                            <ActionItem label="Reopen" onClick={() => reopenProforma(row)} />
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Preview Modal */}
      {previewVoucher && previewRow && (
        <div onClick={closePreview} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surface)', borderRadius: 12, width: '100%',
            maxWidth: 900, maxHeight: '95vh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700 }}>
                Proforma — {previewVoucher.ref}
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: STATUS_COLOR[previewRow.derivedStatus || 'active'].bg, color: STATUS_COLOR[previewRow.derivedStatus || 'active'].fg, marginLeft: 10, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {STATUS_COLOR[previewRow.derivedStatus || 'active'].label}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {previewRow.derivedStatus !== 'converted' && (
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => { closePreview(); editProforma(previewRow) }}>
                    Edit
                  </button>
                )}
                <button className="btn btn-primary" onClick={printPreview}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <polyline points="6 9 6 2 18 2 18 9"/>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  Print / PDF
                </button>
                <button className="btn btn-ghost btn-sm" onClick={downloadPNG}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Save PNG
                </button>
                {waConfig?.enabled && waConfig?.api_key && previewVoucher.customers?.whatsapp && (
                  <button className="btn btn-ghost btn-sm" disabled={sending || waSent} onClick={sendViaWhatsApp}
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
              <div id="proforma-preview">
                <SokoraProforma voucher={previewVoucher} settings={templateSettings} />
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}

// ─── ActionItem component ───────────────────────────────────────────────

function ActionItem({ label, onClick, disabled, highlight, danger }: {
  label: string; onClick: () => void; disabled?: boolean; highlight?: boolean; danger?: boolean
}) {
  const color = disabled ? 'var(--text3)' : danger ? '#ef4444' : highlight ? 'var(--accent)' : 'var(--text)'
  return (
    <div onMouseDown={e => e.preventDefault()}
      onClick={() => { if (!disabled) onClick() }}
      style={{
        padding: '10px 14px', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
        color, opacity: disabled ? 0.5 : 1, fontWeight: highlight ? 600 : 500,
        transition: 'background .1s',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = 'var(--surface2)' }}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
      {label}
    </div>
  )
}
