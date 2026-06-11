// ─── Customer Statement ────────────────────────────────────────────────────
// A full accounting statement for a single customer: opening balance,
// chronological ledger of every invoice / receipt / credit note / debit note
// within a date range, running balance column, closing balance, and
// export-to-PDF / PNG / WhatsApp actions.
//
// This is the "where does this customer stand with us?" view — the canonical
// artifact for collections, audits, and customer disputes.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs, today } from '../lib/utils'
import { useCompanySettings } from '../lib/useCompanySettings'
import { loadWAConfig, sendWhatsApp } from '../lib/whatsapp'
import type { WAConfig } from '../lib/whatsapp'
import type { Page } from '../lib/types'
import Toast from '../components/Toast'

interface Props {
  customerId: string
  onNav: (p: Page) => void
}

interface DBCustomer {
  id: string; name: string; company: string | null
  contact_person: string | null; customer_number: string
  whatsapp: string | null; address: string | null
  balance: number; credit_limit: number; credit_period: number
  payment_terms: string | null
}

interface LedgerRow {
  id: string
  posting_date: string
  document_type: string   // 'invoice' | 'receipt' | 'credit_note' | 'debit_note' | 'opening' | 'adjustment'
  document_ref: string
  description: string | null
  due_date: string | null
  amount: number          // signed: invoices positive, receipts/credits negative
  remaining_amount: number
  is_open: boolean
  // Enrichments joined from the `vouchers` table (by document_ref → ref).
  // Receipts gain payment_method ('mpesa', 'rtgs', 'cash', etc) and notes
  // (typically the M-Pesa/cheque/TT reference number entered at posting).
  // Invoices may carry voucher notes too. Optional because a ledger entry
  // might have been migrated/imported without a matching voucher.
  payment_method?: string | null
  voucher_notes?: string | null
}

interface LedgerRowWithBalance extends LedgerRow {
  runningBalance: number   // cumulative balance after this row
}

// ─── Date range presets ───────────────────────────────────────────────────
// Stored as functions that return [from, to] ISO strings at call time.
// Avoids stale dates if the user leaves the page open overnight.

const DATE_PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Last 6 months', days: 180 },
  { label: 'Last 12 months', days: 365 },
  { label: 'All time', days: -1 },
] as const

function presetRange(days: number): { from: string; to: string } {
  const to = today()
  if (days < 0) return { from: '2000-01-01', to }   // "all time" = very old from date
  const d = new Date()
  d.setDate(d.getDate() - days)
  return { from: d.toISOString().split('T')[0], to }
}

// ─── Doc-type label + color helpers ───────────────────────────────────────
// Each ledger row type gets a recognisable chip color so the eye can
// scan quickly: debits (invoices, debit notes) in red-ish, credits
// (receipts, credit notes) in green-ish, neutral in gray.

function docLabel(type: string): string {
  switch (type) {
    case 'invoice':     return 'Invoice'
    case 'receipt':     return 'Receipt'
    case 'credit_note': return 'Credit Note'
    case 'debit_note':  return 'Debit Note'
    case 'opening':     return 'Opening'
    case 'payment':     return 'Payment'
    case 'adjustment':  return 'Adjustment'
    default:            return type
  }
}
function docColor(type: string): { bg: string; fg: string } {
  switch (type) {
    case 'invoice':     return { bg: 'rgba(239,68,68,.12)', fg: '#ef4444' }
    case 'debit_note':  return { bg: 'rgba(239,68,68,.12)', fg: '#ef4444' }
    case 'receipt':     return { bg: 'rgba(34,197,94,.12)', fg: '#22c55e' }
    case 'credit_note': return { bg: 'rgba(34,197,94,.12)', fg: '#22c55e' }
    case 'opening':     return { bg: 'rgba(148,163,184,.15)', fg: '#94a3b8' }
    default:            return { bg: 'var(--surface2)', fg: 'var(--text3)' }
  }
}

// Pretty-print a stored payment_method enum into something a customer will
// recognise. Matches the labels used at posting time so a row in the
// statement reads the same as the receipt voucher itself.
function methodLabel(m: string | null | undefined): string {
  if (!m) return ''
  const map: Record<string, string> = {
    cash:    'Cash',
    mpesa:   'M-Pesa',
    mixx:    'Mixx by Yas',
    airtel:  'Airtel Money',
    rtgs:    'Bank Transfer',
    cheque:  'Cheque',
    deposit: 'Cash Deposit',
    pos:     'POS',
  }
  return map[m] || m
}

// Days between two ISO dates (a − b). Positive when a is later than b.
// Used for due-date overdue badges and aging buckets.
function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime()
  const b = new Date(bIso).getTime()
  return Math.floor((a - b) / (1000 * 60 * 60 * 24))
}

// Aging buckets: classify each still-open invoice by how overdue it is
// from the statement's "as of" date. Returns 5 bucket totals (current,
// 1-30, 31-60, 61-90, 90+) suitable for the summary table at the top of
// the statement. Closed invoices are skipped (remaining_amount = 0,
// is_open = false).
interface AgingBuckets {
  current: number  // not yet due (due_date >= as_of, or no due_date)
  d1_30:   number
  d31_60:  number
  d61_90:  number
  d90plus: number
  total:   number
}
function computeAging(rows: LedgerRow[], asOf: string): AgingBuckets {
  const acc: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 }
  for (const r of rows) {
    if (!r.is_open) continue
    // Aging applies to open invoices and debit notes (receivables). Skip
    // credit notes / receipts even if they happen to be flagged open.
    if (r.document_type !== 'invoice' && r.document_type !== 'debit_note') continue
    const amt = r.remaining_amount || 0
    if (amt <= 0) continue
    acc.total += amt
    if (!r.due_date) { acc.current += amt; continue }
    const overdue = daysBetween(asOf, r.due_date)
    if      (overdue <= 0)  acc.current += amt
    else if (overdue <= 30) acc.d1_30   += amt
    else if (overdue <= 60) acc.d31_60  += amt
    else if (overdue <= 90) acc.d61_90  += amt
    else                    acc.d90plus += amt
  }
  return acc
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function CustomerStatement({ customerId, onNav }: Props) {
  // Company branding — logo, name, address, bank details, footer notes.
  // Read once on mount via a module-cached singleton. Edits in the
  // settings page invalidate the cache so the next render of any
  // statement pulls fresh values.
  const { settings: brand } = useCompanySettings()

  const [customer, setCustomer] = useState<DBCustomer | null>(null)
  const [rows, setRows] = useState<LedgerRowWithBalance[]>([])
  const [openInvoicesForAging, setOpenInvoicesForAging] = useState<LedgerRow[]>([])
  const [openingBalance, setOpeningBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<{ from: string; to: string }>(() => presetRange(90))
  const [activePreset, setActivePreset] = useState<number | null>(90)    // which preset is highlighted (by days)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [waConfig, setWaConfig] = useState<WAConfig | null>(null)
  const [sendingWA, setSendingWA] = useState(false)

  useEffect(() => {
    loadCustomer()
    loadWAConfig().then(setWaConfig)
  }, [customerId])

  useEffect(() => {
    if (customer) loadLedger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, range.from, range.to])

  // ─── Data loaders ──────────────────────────────────────────────────────

  const loadCustomer = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('customers')
      .select('id, name, company, contact_person, customer_number, whatsapp, address, balance, credit_limit, credit_period, payment_terms')
      .eq('id', customerId)
      .single()
    if (error || !data) {
      setToast('Could not load customer')
      setToastType('error')
      setLoading(false)
      return
    }
    setCustomer(data)
  }

  // The ledger load is two queries:
  //   1) Sum of all entries BEFORE the from-date → the "opening balance" for
  //      the statement period.
  //   2) All entries WITHIN the date range → the body rows.
  // Running balance starts at opening and accumulates row-by-row.
  const loadLedger = async () => {
    setLoading(true)

    // 1. Opening balance = sum of all entries strictly before range.from
    const { data: priorRows } = await supabase
      .from('customer_ledger_entries')
      .select('amount')
      .eq('customer_id', customerId)
      .lt('posting_date', range.from)

    const opening = (priorRows || []).reduce((s, r) => s + (r.amount || 0), 0)
    setOpeningBalance(opening)

    // 2. Rows within the date range. We sort by date ASC, then by amount
    //    DESC so that on the same date, invoices (positive amount) appear
    //    BEFORE receipts (negative). This avoids the visually confusing
    //    case where a receipt settling that day's invoices is rendered
    //    above them, producing a temporary negative running balance.
    //    `id` is the final tie-breaker for full determinism.
    const { data: inRangeRows, error } = await supabase
      .from('customer_ledger_entries')
      .select('id, posting_date, document_type, document_ref, description, due_date, amount, remaining_amount, is_open')
      .eq('customer_id', customerId)
      .gte('posting_date', range.from)
      .lte('posting_date', range.to)
      .order('posting_date', { ascending: true })
      .order('amount', { ascending: false })   // invoices (+) before receipts (-) same day
      .order('id', { ascending: true })

    if (error) {
      console.error('[statement] ledger load failed:', error.message)
      setToast('Could not load ledger'); setToastType('error')
      setLoading(false); return
    }

    // 3. Enrichment: fetch voucher metadata for every ref in the range,
    //    so we can show "M-Pesa · ref QTA1ABC2DE" next to each receipt.
    //    Single query, then index by ref. Cheaper than per-row joins.
    const refs = (inRangeRows || []).map(r => r.document_ref).filter(Boolean)
    const voucherIndex = new Map<string, { payment_method: string | null; notes: string | null }>()
    if (refs.length > 0) {
      const { data: vouchers } = await supabase
        .from('vouchers')
        .select('ref, payment_method, notes')
        .in('ref', refs)
      if (vouchers) {
        vouchers.forEach(v => voucherIndex.set(v.ref, {
          payment_method: v.payment_method, notes: v.notes,
        }))
      }
    }

    // Compute running balance + attach voucher enrichments.
    let running = opening
    const withBalance: LedgerRowWithBalance[] = (inRangeRows || []).map(r => {
      running += (r.amount || 0)
      const voucher = voucherIndex.get(r.document_ref)
      return {
        ...r,
        runningBalance: running,
        payment_method: voucher?.payment_method ?? null,
        voucher_notes: voucher?.notes ?? null,
      }
    })
    setRows(withBalance)

    // 4. Open invoices for aging — pulled separately because we need ALL
    //    open AR regardless of the statement's chosen date range. A 6-month
    //    overdue invoice should appear in the 90+ bucket even if the user
    //    is looking at the last 30 days only.
    const { data: openInvs } = await supabase
      .from('customer_ledger_entries')
      .select('id, posting_date, document_type, document_ref, description, due_date, amount, remaining_amount, is_open')
      .eq('customer_id', customerId)
      .eq('is_open', true)
      .in('document_type', ['invoice', 'debit_note'])
      .gt('remaining_amount', 0)
    setOpenInvoicesForAging(openInvs || [])

    setLoading(false)
  }

  // ─── Date range handlers ───────────────────────────────────────────────

  const applyPreset = (days: number) => {
    setRange(presetRange(days))
    setActivePreset(days)
  }
  const setCustomFrom = (from: string) => {
    setRange(r => ({ ...r, from }))
    setActivePreset(null)
  }
  const setCustomTo = (to: string) => {
    setRange(r => ({ ...r, to }))
    setActivePreset(null)
  }

  // ─── Stats (derived from loaded rows) ──────────────────────────────────

  const totalInvoiced = rows
    .filter(r => r.document_type === 'invoice' || r.document_type === 'debit_note')
    .reduce((s, r) => s + r.amount, 0)
  const totalPaid = rows
    .filter(r => r.document_type === 'receipt' || r.document_type === 'credit_note')
    .reduce((s, r) => s + Math.abs(r.amount), 0)
  const closingBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance : openingBalance

  // Aging is computed across ALL open invoices for this customer (loaded
  // separately, see loadLedger), so a 6-month-old open invoice still
  // shows in 90+ even if the user's selected date range starts last
  // month. The statement body still respects the date range — only the
  // aging summary at the top uses the full set.
  const aging = computeAging(openInvoicesForAging, range.to)

  // ─── Export actions ────────────────────────────────────────────────────

  const printStatement = () => {
    const el = document.getElementById('customer-statement')
    if (!el || !customer) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statement — ${customer.company || customer.name}</title>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@600&display=swap" rel="stylesheet">
      <style>
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        body{padding:12px;background:#f0f0f0;font-family:'Instrument Sans',sans-serif;font-size:11px}
        *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
        /* Tighter print: 8mm margins (was 10mm) + smaller body padding fit
           an extra ~3-4 lines per page, helping multi-page statements
           collapse to one. Also tells the browser to prefer keeping
           transaction rows together (orphans/widows). */
        @media print{
          body{background:#fff;padding:0;display:block}
          .no-print{display:none !important}
          @page{size:A4;margin:8mm}
          table{page-break-inside:auto}
          tr{page-break-inside:avoid;page-break-after:auto}
          thead{display:table-header-group}
        }
      </style>
    </head><body>${el.outerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  const downloadPNG = () => {
    const el = document.getElementById('customer-statement')
    if (!el || !customer) return
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
      }).then((canvas: HTMLCanvasElement) => {
        const link = document.createElement('a')
        link.download = `Statement-${customer.customer_number}-${range.to}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
        setToast('Image downloaded'); setToastType('success')
      }).catch(() => { setToast('Image generation failed'); setToastType('error') })
    }
    if (existing) { generate(); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    script.onload = generate
    script.onerror = () => { setToast('Could not load image library'); setToastType('error') }
    document.body.appendChild(script)
  }

  const sendStatementWA = async () => {
    if (!customer?.whatsapp || !waConfig) return
    setSendingWA(true)
    const greeting = customer.contact_person
      ? `Hi ${customer.contact_person.split(' ')[0]},`
      : `Hi,`
    const body = closingBalance > 0
      ? `Your account statement as of ${range.to}:\n\n*Opening Balance:* TZS ${openingBalance.toLocaleString()}\n*Total Billed:* TZS ${totalInvoiced.toLocaleString()}\n*Total Paid:* TZS ${totalPaid.toLocaleString()}\n\n*Current Balance Owed:* TZS ${closingBalance.toLocaleString()}\n\nPlease settle at your earliest convenience.`
      : `Your account is up to date as of ${range.to}. Thank you for your business!`
    const msg = `${greeting}\n\n${body}\n\n— ${brand.company_name}`
    const res = await sendWhatsApp(waConfig, {
      to: customer.whatsapp,
      message: msg,
      type: 'custom',
      ref: `STMT-${customer.customer_number}-${range.to}`,
      customer_name: customer.name,
      customer_id: customer.id,
      is_transactional: true,
    })
    setSendingWA(false)
    if (res.success) { setToast('Statement sent via WhatsApp'); setToastType('success') }
    else { setToast(res.error || 'WhatsApp send failed'); setToastType('error') }
  }

  // ─── Send statement via WhatsApp template ───────────────────────────────
  // New, template-based flow. Generates the statement PDF, uploads to the
  // crm-customer-docs Storage bucket, gets a 7-day signed URL, and stashes
  // it in sessionStorage for the templates page to pick up. The templates
  // page then resolves {{statement_url}} from this stash and opens
  // WhatsApp Web with the merged message.
  //
  // This is Pass 1 of the customer-doc-send feature. Per-debtor only;
  // bulk send and other doc types come later.
  const [generatingDoc, setGeneratingDoc] = useState(false)

  const sendStatementViaTemplate = async () => {
    if (!customer) return
    if (!customer.whatsapp) { setToast('No WhatsApp number on file'); setToastType('error'); return }

    setGeneratingDoc(true)
    setToast('Generating statement PDF…'); setToastType('success')

    try {
      const el = document.getElementById('customer-statement')
      if (!el) throw new Error('Statement DOM element not found')

      // Generate PDF + upload + sign
      const { generateAndUploadDocumentFromElement } = await import('../lib/customerDocuments')
      const doc = await generateAndUploadDocumentFromElement(el, customer.id, 'statement', null)

      // Compute AR summary fields for the merge (these power the
      // {{outstanding_balance}}, {{open_invoice_count}}, etc. placeholders).
      // We pull them from the already-loaded ledger rows rather than
      // re-querying — cheap and consistent with what's on screen.
      const today = new Date()
      const openInvoices = rows.filter(r => r.is_open && r.amount > 0)
      const oldestInvoice = openInvoices.length > 0
        ? openInvoices.reduce((a, b) => new Date(a.posting_date) < new Date(b.posting_date) ? a : b)
        : null
      const oldestAgeDays = oldestInvoice
        ? Math.floor((today.getTime() - new Date(oldestInvoice.posting_date).getTime()) / (1000 * 60 * 60 * 24))
        : null

      // Stash everything the templates page needs into sessionStorage.
      // This is the same shuttle pattern we use elsewhere (Customers list,
      // Waitlist) — keeps the templates page free of route-coupling.
      sessionStorage.setItem('wa_template_target_customer', JSON.stringify({
        id:               customer.id,
        name:             customer.name,
        whatsapp:         customer.whatsapp,
        phone:            customer.whatsapp,
        ambassador_code:  null,  // debtors don't have ambassador codes
        life_stage:       null,
        edd:              null,
        delivery_date:    null,
        crown_points:     0,
        stage_paused:     false,
        // AR-specific fields for template merging
        balance:                  closingBalance,
        open_invoice_count:       openInvoices.length,
        oldest_invoice_ref:       oldestInvoice?.document_ref ?? null,
        oldest_invoice_age_days:  oldestAgeDays,
      }))

      // Stash the generated PDF URL keyed by the merge-engine convention.
      // The templates page reads this on mount and supplies it to
      // mergeTemplate via the resourceUrls map under 'statement_url'.
      sessionStorage.setItem('wa_template_document_urls', JSON.stringify({
        statement_url: doc.url,
      }))

      // Hint which template category is most relevant. The templates page
      // can use this to pre-filter the picker.
      sessionStorage.setItem('wa_template_preferred_category', 'statement')

      setGeneratingDoc(false)
      setToast('PDF ready. Opening template picker…'); setToastType('success')
      // Small delay so the toast registers before navigation
      setTimeout(() => onNav('crm-whatsapp-templates'), 400)
    } catch (e: any) {
      console.error('Statement send failed:', e)
      setGeneratingDoc(false)
      setToast(`Failed: ${e?.message ?? 'unknown error'}`); setToastType('error')
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading && !customer) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading statement…</div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
          Customer not found. <button onClick={() => onNav('customers')} style={{ color: 'var(--accent)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>Back to Customers</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => onNav('customers')}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Back to Customers">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <div>
            <div className="page-title">Customer Statement</div>
            <div className="page-sub">{customer.company || customer.name} · {customer.customer_number}</div>
          </div>
        </div>
        <div className="page-actions">
          {customer.whatsapp && (
            <button className="btn btn-ghost btn-sm" disabled={generatingDoc}
              onClick={sendStatementViaTemplate}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#25D366', border: '1px solid rgba(37,211,102,.3)' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
              </svg>
              {generatingDoc ? 'Generating PDF…' : '📄 Send via WA template'}
            </button>
          )}
          {customer.whatsapp && waConfig?.enabled && waConfig?.api_key && (
            <button className="btn btn-ghost btn-sm" disabled={sendingWA}
              onClick={sendStatementWA}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text3)', border: '1px solid var(--border)', fontSize: 11 }}>
              {sendingWA ? 'Sending…' : 'Send text-only'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={downloadPNG}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            Save PNG
          </button>
          <button className="btn btn-primary" onClick={printStatement}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print / PDF
          </button>
        </div>
      </div>

      {/* ── Date range toolbar (not printed) ───────────────────────────── */}
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Period:</span>
        {DATE_PRESETS.map(p => (
          <button key={p.label} onClick={() => applyPreset(p.days)}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600,
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
          onChange={e => setCustomFrom(e.target.value)}
          style={{ width: 140, fontSize: 12 }} />
        <span style={{ color: 'var(--text3)', fontSize: 11 }}>to</span>
        <input type="date" className="form-input" value={range.to}
          onChange={e => setCustomTo(e.target.value)}
          style={{ width: 140, fontSize: 12 }} />
      </div>

      {/* ═════ PRINTABLE STATEMENT ═════════════════════════════════════ */}
      {/* Everything inside this div is what gets exported to PDF / PNG.    */}
      <div id="customer-statement" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '28px 32px' }}>

        {/* Statement header — layout flips based on logo_position setting.
            • left  : logo + company info on left, statement meta on right
            • right : company info on left, logo + statement meta on right
            • center: logo centered above company info, statement meta still right
            For prints/PDFs the logo loads from a public Supabase Storage URL. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--border)', paddingBottom: 16, marginBottom: 16, flexDirection: brand.logo_position === 'center' ? 'column' : 'row', gap: brand.logo_position === 'center' ? 10 : 0 }}>
          {brand.logo_position === 'center' && brand.logo_url && (
            <img src={brand.logo_url} alt={brand.company_name}
              style={{ height: brand.logo_height_px, alignSelf: 'center' }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, order: brand.logo_position === 'right' ? 1 : 0 }}>
            {brand.logo_position === 'left' && brand.logo_url && (
              <img src={brand.logo_url} alt={brand.company_name}
                style={{ height: brand.logo_height_px }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            )}
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.5, marginBottom: 2 }}>
                {brand.company_name}
              </div>
              {brand.tagline && (
                <div style={{ fontSize: 11, color: 'var(--text2)', fontStyle: 'italic', marginBottom: 4 }}>{brand.tagline}</div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', lineHeight: 1.5 }}>
                {brand.address && <>{brand.address}{(brand.phone || brand.email) && ' · '}{brand.phone}<br/></>}
                {brand.email && <>{brand.email}{brand.website && ` · ${brand.website}`}<br/></>}
                {brand.tin && <>TIN: {brand.tin}</>}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', order: brand.logo_position === 'right' ? 0 : 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: brand.logo_position === 'right' ? 6 : 0 }}>
            {brand.logo_position === 'right' && brand.logo_url && (
              <img src={brand.logo_url} alt={brand.company_name}
                style={{ height: brand.logo_height_px, marginBottom: 4 }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            )}
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Statement</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 800, color: 'var(--accent)', marginTop: 2 }}>
              {customer.customer_number}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, lineHeight: 1.4 }}>
              Period: <span style={{ color: 'var(--text2)' }}>{range.from}</span> → <span style={{ color: 'var(--text2)' }}>{range.to}</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text3)' }}>
              Generated: {today()}
            </div>
          </div>
        </div>

        {/* Customer block + at-a-glance stats — denser layout (4 stats in
            a single row instead of 2x2 grid) frees vertical space. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Statement For</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
              {customer.company || customer.name}
            </div>
            {customer.contact_person && (
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Attn: {customer.contact_person}</div>
            )}
            {customer.address && (
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, lineHeight: 1.4 }}>{customer.address}</div>
            )}
            {customer.whatsapp && (
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>{customer.whatsapp}</div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, alignContent: 'start' }}>
            {[
              { label: 'Current Balance', val: tzs(customer.balance || 0), color: (customer.balance || 0) > 0 ? 'var(--red)' : 'var(--green)' },
              { label: 'Credit Limit', val: customer.credit_limit > 0 ? tzs(customer.credit_limit) : 'Unlimited' },
              { label: 'Payment Terms', val: customer.payment_terms || (customer.credit_period > 0 ? `${customer.credit_period} days` : 'COD') },
              { label: 'Transactions', val: rows.length.toString() },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px' }}>
                <div style={{ fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Aging summary band ────────────────────────────────────────
            What auditors, credit committees, and the customer's own AP
            staff look at first. Five buckets (current → 90+) showing how
            stale each chunk of outstanding AR is. Skipped entirely when
            there's nothing open (no point cluttering a clean account). */}
        {aging.total > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, background: 'var(--surface2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>
                Aging of Outstanding Balance (as of {range.to})
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                Total: <span style={{ fontWeight: 700, color: 'var(--red)' }}>TZS {aging.total.toLocaleString()}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
              {[
                { label: 'Current',  val: aging.current, color: '#22c55e' },
                { label: '1-30 d',   val: aging.d1_30,   color: '#fbbf24' },
                { label: '31-60 d',  val: aging.d31_60,  color: '#fb923c' },
                { label: '61-90 d',  val: aging.d61_90,  color: '#f87171' },
                { label: '90+ d',    val: aging.d90plus, color: '#dc2626' },
              ].map(b => {
                const pct = aging.total > 0 ? Math.round((b.val / aging.total) * 100) : 0
                return (
                  <div key={b.label} style={{ background: 'var(--surface)', border: `1px solid ${b.val > 0 ? b.color + '55' : 'var(--border)'}`, borderRadius: 5, padding: '5px 8px' }}>
                    <div style={{ fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>{b.label}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: b.val > 0 ? b.color : 'var(--text3)' }}>
                      {b.val > 0 ? b.val.toLocaleString() : '—'}
                    </div>
                    {b.val > 0 && pct > 0 && (
                      <div style={{ fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 1 }}>{pct}%</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Ledger table ──────────────────────────────────────────── */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, whiteSpace: 'nowrap' }}>Date</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Type</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Reference / Description</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Debit</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Credit</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance row */}
              <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{range.from}</td>
                <td colSpan={2} style={{ padding: '6px 10px', fontSize: 10, fontStyle: 'italic', color: 'var(--text3)' }}>Opening balance (brought forward)</td>
                <td style={{ padding: '6px 10px' }}></td>
                <td style={{ padding: '6px 10px' }}></td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: openingBalance > 0 ? 'var(--red)' : openingBalance < 0 ? 'var(--green)' : 'var(--text3)' }}>
                  {openingBalance.toLocaleString()}
                </td>
              </tr>

              {rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text3)', fontStyle: 'italic', fontSize: 11 }}>
                  No transactions in this period.
                </td></tr>
              ) : (
                rows.map(r => {
                  const color = docColor(r.document_type)
                  const isDebit = r.amount > 0
                  const isReceiptLike = r.document_type === 'receipt' || r.document_type === 'credit_note'
                  // Days overdue: positive number if past due, zero or
                  // negative if not yet due. Only shown on open invoices.
                  const overdueDays = (r.is_open && r.due_date)
                    ? daysBetween(range.to, r.due_date)
                    : 0
                  const isOverdue = overdueDays > 0 && r.is_open

                  // Payment method label for receipts. Falls back to the
                  // voucher's notes if no payment_method was stored
                  // (older records).
                  const paymentInfo = isReceiptLike && r.payment_method ? methodLabel(r.payment_method) : ''
                  // Transaction reference: extract from voucher notes.
                  // Notes typically look like "Batch receipt · ref ABC123"
                  // or "M-Pesa QTA1ABC2DE" — we surface whatever is there
                  // as supporting evidence of payment.
                  const txRef = r.voucher_notes && r.voucher_notes.length < 120
                    ? r.voucher_notes
                    : ''

                  return (
                    <tr key={r.id} style={{
                      borderTop: '1px solid var(--border)',
                      background: isOverdue ? 'rgba(239,68,68,.04)' : undefined,
                    }}>
                      <td style={{ padding: '5px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{r.posting_date}</td>
                      <td style={{ padding: '5px 10px', verticalAlign: 'top' }}>
                        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: color.bg, color: color.fg, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
                          {docLabel(r.document_type)}
                        </span>
                      </td>
                      <td style={{ padding: '5px 10px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{r.document_ref}</span>
                          {r.due_date && r.is_open && !isOverdue && (
                            <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                              · due {r.due_date}
                            </span>
                          )}
                          {isOverdue && (
                            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,.15)', color: '#dc2626' }}>
                              {overdueDays}d OVERDUE
                            </span>
                          )}
                          {paymentInfo && (
                            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text2)', padding: '1px 5px', borderRadius: 3, background: 'rgba(34,197,94,.08)' }}>
                              {paymentInfo}
                            </span>
                          )}
                        </div>
                        {(r.description || txRef) && (
                          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1, lineHeight: 1.3 }}>
                            {r.description}
                            {r.description && txRef ? ' · ' : ''}
                            {txRef && <span style={{ fontFamily: 'var(--mono)' }}>{txRef}</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', verticalAlign: 'top' }}>
                        {isDebit ? r.amount.toLocaleString() : ''}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)', verticalAlign: 'top' }}>
                        {!isDebit ? Math.abs(r.amount).toLocaleString() : ''}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: r.runningBalance > 0 ? 'var(--red)' : r.runningBalance < 0 ? 'var(--green)' : 'var(--text3)', verticalAlign: 'top' }}>
                        {r.runningBalance.toLocaleString()}
                      </td>
                    </tr>
                  )
                })
              )}

              {/* Closing balance summary row */}
              <tr style={{ borderTop: '2px solid var(--accent)', background: 'var(--surface2)' }}>
                <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{range.to}</td>
                <td colSpan={2} style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Closing Balance</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                  {totalInvoiced > 0 && (
                    <>
                      <div style={{ fontSize: 8, color: 'var(--text3)', marginBottom: 1 }}>Period Total</div>
                      {totalInvoiced.toLocaleString()}
                    </>
                  )}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                  {totalPaid > 0 && (
                    <>
                      <div style={{ fontSize: 8, color: 'var(--text3)', marginBottom: 1 }}>Period Total</div>
                      {totalPaid.toLocaleString()}
                    </>
                  )}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 800, color: closingBalance > 0 ? 'var(--red)' : closingBalance < 0 ? 'var(--green)' : 'var(--text3)' }}>
                  TZS {closingBalance.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer: payment instructions read from Company Branding settings.
            Bank block always shown. M-Pesa block hidden unless a till or
            business number is configured. Footer note uses statement_footer_note
            from settings (set in Templates → Company Branding). */}
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10, color: 'var(--text3)', lineHeight: 1.5 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: 600 }}>How to Pay</div>
          <div style={{ color: 'var(--text2)', display: 'grid', gridTemplateColumns: (brand.mpesa_till_number || brand.mpesa_business_number) ? '1fr 1fr' : '1fr', gap: 8, fontSize: 10 }}>
            {brand.bank_name && (
              <div>
                <strong style={{ color: 'var(--text)' }}>{brand.bank_name}</strong>
                {brand.bank_account_number && <> · A/C No: {brand.bank_account_number}</>}<br/>
                {brand.bank_account_name}
                {brand.bank_branch && <> · {brand.bank_branch}</>}
              </div>
            )}
            {(brand.mpesa_till_number || brand.mpesa_business_number) && (
              <div>
                <strong style={{ color: 'var(--text)' }}>M-Pesa</strong>: Lipa kwa M-Pesa<br/>
                {brand.mpesa_till_number && <>Till: <span style={{ fontFamily: 'var(--mono)' }}>{brand.mpesa_till_number}</span></>}
                {brand.mpesa_till_number && brand.mpesa_business_number && <> · </>}
                {brand.mpesa_business_number && <>Business: <span style={{ fontFamily: 'var(--mono)' }}>{brand.mpesa_business_number}</span></>}
                {' · Reference: invoice no.'}
              </div>
            )}
          </div>
          {brand.statement_footer_note && (
            <div style={{ marginTop: 6, fontSize: 9 }}>
              {brand.statement_footer_note}
              {brand.phone && <> Queries: {brand.phone}</>}
              {brand.email && <> · {brand.email}.</>}
            </div>
          )}
        </div>

        {/* Call to action — only when there's something owed. Gives the
            customer a concrete next step instead of a generic "please pay
            soon." Computes a suggested-by date from credit period if set. */}
        {closingBalance > 0 && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, fontSize: 11, color: 'var(--text2)' }}>
            <strong style={{ color: '#dc2626', fontFamily: 'var(--display)', fontSize: 12 }}>Amount Due: TZS {closingBalance.toLocaleString()}</strong>
            {aging.d90plus > 0 && (
              <span style={{ marginLeft: 8, fontSize: 10, color: '#dc2626', fontFamily: 'var(--mono)' }}>
                · TZS {aging.d90plus.toLocaleString()} is 90+ days overdue and requires immediate action.
              </span>
            )}
            {aging.d90plus === 0 && (aging.d31_60 > 0 || aging.d61_90 > 0) && (
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text3)' }}>
                · Please settle overdue invoices to avoid credit hold.
              </span>
            )}
          </div>
        )}

        {/* Signature line */}
        <div style={{ marginTop: 14, fontSize: 9, color: 'var(--text3)', textAlign: 'center' }}>
          Computer-generated statement · Reflects all transactions recorded as of {today()}
        </div>
      </div>
      {/* ═════ END PRINTABLE STATEMENT ════════════════════════════════ */}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
