import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface InvoiceSettings {
  // Company
  company_name: string; tagline: string; address: string; city: string
  phone: string; email: string; website: string; tin: string; vrn: string
  primary_color: string
  // Logo
  logo_url: string; logo_width: number; logo_x: number; logo_y: number
  // Bank
  bank_name: string; bank_account_name: string
  bank_account_number: string; bank_branch: string
  payment_note: string; footer_note: string
  // Labels (editable)
  label_bill_to: string; label_invoice: string; label_payment_details: string
  label_this_invoice: string; label_account_statement: string
  label_notes: string; label_salesperson: string
  // Toggles
  show_bank_details: boolean; show_salesperson: boolean
  show_outstanding_balance: boolean
  show_payment_terms: boolean; show_notes: boolean; show_logo: boolean
}

const DEFAULT: InvoiceSettings = {
  company_name: 'Your Organization', tagline: 'Reimagining Motherhood',
  address: 'Dar es Salaam, Tanzania', city: 'Dar es Salaam',
  phone: '+255 700 000 000', email: 'hello@sokora.app', website: 'www.sokora.app',
  tin: '—', vrn: '—', primary_color: '#85c2be',
  logo_url: '', logo_width: 80, logo_x: 0, logo_y: 0,
  bank_name: 'NMB Bank', bank_account_name: 'Your Organization',
  bank_account_number: '22510074972', bank_branch: 'Dar es Salaam Branch',
  payment_note: 'Please quote the invoice number as payment reference.',
  footer_note: 'Thank you for your business. Payment is due by the date shown above.',
  label_bill_to: 'Bill To', label_invoice: 'Tax Invoice',
  label_payment_details: 'Payment Details', label_this_invoice: 'This Invoice',
  label_account_statement: 'Account Statement', label_notes: 'Notes',
  label_salesperson: 'Invoiced by',
  show_bank_details: true, show_salesperson: true,
  show_outstanding_balance: true, show_payment_terms: true, show_notes: true, show_logo: true,
}

// ── Invoice Voucher type ──────────────────────────────────────────────────────
interface Voucher {
  ref: string; posting_date: string; due_date?: string
  payment_terms?: string; notes?: string
  total_amount: number; subtotal: number
  posted_by?: string
  customers: {
    name: string; company?: string; contact_person?: string
    whatsapp: string; address: string; balance: number
  } | null
  voucher_lines: {
    qty: number; unit_price: number; total: number
    discount_pct?: number; description: string
    products: { name: string; sku: string } | null
  }[]
  // Optional view-mode fields — set by callers (SalesInvoicesList,
  // SalesInvoice view-mode loader) when previewing an existing invoice.
  // When present, the Account Statement panel shows LIVE figures as of
  // _statementDate rather than the posting-time "prev + this = now owed"
  // math. Omitting these renders the old posting-time layout.
  _viewMode?: boolean
  _invoiceRemaining?: number    // TZS still owed on THIS specific invoice
  _invoicePaid?: number         // TZS already collected against THIS invoice
  _statementDate?: string       // YYYY-MM-DD, today when loading in view mode
}

// ── SokoraInvoice Component ───────────────────────────────────────────────────
export function SokoraInvoice({ voucher, settings }: { voucher: Voucher; settings?: Partial<InvoiceSettings> }) {
  const s: InvoiceSettings = { ...DEFAULT, ...(settings || {}) }
  const p = s.primary_color   // brand teal
  const cust = voucher.customers
  const total = voucher.total_amount || 0
  // View mode: use CURRENT customer balance (live figure) as the displayed
  // outstanding, and compute the status of THIS invoice from ledger data.
  // Posting mode: use classic "prev + this = now owed" math.
  const isViewMode = voucher._viewMode === true
  const currentBalance = cust?.balance || 0
  const prevBalance = isViewMode
    ? currentBalance                       // label becomes "Current Balance"
    : currentBalance                       // posting mode: balance before this invoice was added (rows not yet written in UI)
  const totalNowOwed = isViewMode
    ? currentBalance                       // view mode: today's actual AR
    : prevBalance + total                  // posting mode: running total after this invoice
  const thisInvoiceRemaining = voucher._invoiceRemaining ?? total
  const thisInvoicePaid = voucher._invoicePaid ?? 0
  const isPaid = isViewMode && thisInvoiceRemaining <= 0.5
  const isPartial = isViewMode && thisInvoicePaid > 0.5 && thisInvoiceRemaining > 0.5
  const statementDate = voucher._statementDate || new Date().toISOString().split('T')[0]
  const mono = "'DM Mono', 'Courier New', monospace"
  const display = "'Syne', 'Georgia', serif"
  const body = "'Instrument Sans', 'Helvetica Neue', sans-serif"
  const headerBg = p   // teal header
  const headerText = '#ffffff'

  return (
    <div style={{ width: 794, background: '#ffffff', fontFamily: body, boxShadow: '0 4px 32px rgba(0,0,0,.12)', borderRadius: 2 }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ background: headerBg, padding: '24px 40px', position: 'relative', overflow: 'hidden' }}>

        {/* Subtle pattern overlay — visible on screen for polish, but hidden
            in print (via .no-print class) to reduce PDF file size by ~40%.
            Chrome otherwise tiles this as an embedded image. */}
        <div className="no-print" style={{ position: 'absolute', inset: 0, opacity: 0.08, backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '12px 12px', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>

          {/* Left: Logo + Company */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            {s.show_logo && s.logo_url && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={s.logo_url} alt="Logo"
                  style={{ width: s.logo_width, height: 'auto', objectFit: 'contain', display: 'block',
                    marginLeft: s.logo_x, marginTop: s.logo_y }} />
              </div>
            )}
            <div>
              <div style={{ fontFamily: display, fontSize: 22, fontWeight: 800, color: headerText, letterSpacing: '-0.3px', lineHeight: 1.1 }}>
                {s.company_name}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 3, fontFamily: mono, letterSpacing: 1.5 }}>
                {s.tagline.toUpperCase()}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 8, lineHeight: 1.8 }}>
                {s.address} · {s.phone}<br />
                {s.email} · {s.website}<br />
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>TIN: {s.tin}</span>
              </div>
            </div>
          </div>

          {/* Right: Invoice number + meta */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>
              {s.label_invoice}
            </div>
            <div style={{ fontFamily: display, fontSize: 28, fontWeight: 800, color: headerText, letterSpacing: '-0.5px', lineHeight: 1 }}>
              {voucher.ref}
            </div>
            <div style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 8, lineHeight: 1.9 }}>
              <div>Date: <span style={{ color: headerText }}>{voucher.posting_date}</span></div>
              {s.show_payment_terms && voucher.due_date && (
                <div>Due: <span style={{ color: headerText, fontWeight: 700 }}>{voucher.due_date}</span></div>
              )}
              {s.show_payment_terms && voucher.payment_terms && (
                <div>Terms: <span style={{ color: headerText }}>{voucher.payment_terms}</span></div>
              )}
              {s.show_salesperson && voucher.posted_by && (
                <div>{s.label_salesperson}: <span style={{ color: headerText }}>{voucher.posted_by}</span></div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── BILL TO + ACCOUNT SUMMARY ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: cust && s.show_outstanding_balance && (isViewMode || prevBalance > 0) ? '1fr 1fr' : '1fr', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ padding: '22px 40px' }}>
          <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontWeight: 600 }}>{s.label_bill_to}</div>
          <div style={{ fontFamily: display, fontSize: 16, fontWeight: 800, color: '#1a1a1a', marginBottom: 3 }}>{cust?.company || cust?.name || '—'}</div>
          {cust?.contact_person && <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>Attn: {cust.contact_person}</div>}
          {cust?.address && <div style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>{cust.address}</div>}
          {cust?.whatsapp && <div style={{ fontSize: 10, color: '#aaa', fontFamily: mono, marginTop: 6 }}>{cust.whatsapp}</div>}
        </div>

        {cust && s.show_outstanding_balance && (isViewMode || prevBalance > 0) && (
          <div style={{ padding: '22px 40px', background: isPaid ? '#f4fbf7' : '#fff8f4', borderLeft: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontWeight: 600 }}>
              {isViewMode
                ? `Account Statement — as of ${statementDate}`
                : s.label_account_statement}
            </div>

            {isViewMode ? (
              <>
                {/* View mode:
                    1) Running math at top: prior debt + this invoice = current total owed
                       (what the customer's account looks like right now).
                    2) A separate status line for THIS invoice specifically:
                       paid in full / partial / outstanding.
                    Keeps the big picture at the top and the invoice-specific
                    detail close to where the invoice total is shown below. */}
                {(() => {
                  // Prior debt = what the customer owed BEFORE this invoice was raised.
                  // Since the current balance already includes this invoice's outstanding
                  // amount, subtract what's still owed on this invoice to get
                  // the prior debt figure. Clamp to 0 for safety.
                  const priorDebt = Math.max(0, currentBalance - thisInvoiceRemaining)
                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', color: '#888' }}>
                        <span>Prior Balance (before this invoice)</span>
                        <span style={{ fontFamily: mono }}>{priorDebt.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', color: '#888' }}>
                        <span>+ This Invoice ({voucher.ref})</span>
                        <span style={{ fontFamily: mono }}>{total.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 1, background: '#f0d0c0', margin: '8px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: currentBalance > 0 ? '#c0392b' : '#2d7a4f' }}>
                          {currentBalance > 0 ? 'Total Now Owed' : 'Account Balance'}
                        </span>
                        <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 800, color: currentBalance > 0 ? '#c0392b' : '#2d7a4f' }}>
                          TZS {currentBalance.toLocaleString()}
                        </span>
                      </div>

                      {/* Status of THIS specific invoice — separate micro-block
                          so the reader doesn't confuse "paid in full" with the
                          account-level balance above. */}
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e0d0c0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 10, fontFamily: mono, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
                            Status of this invoice
                          </span>
                          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700,
                            color: isPaid ? '#2d7a4f' : isPartial ? '#b8860b' : '#c0392b' }}>
                            {isPaid ? 'PAID IN FULL'
                              : isPartial ? `PARTIAL · ${thisInvoiceRemaining.toLocaleString()} outstanding`
                              : `OUTSTANDING · ${thisInvoiceRemaining.toLocaleString()}`}
                          </span>
                        </div>
                        {thisInvoicePaid > 0 && !isPaid && (
                          <div style={{ fontSize: 9, color: '#888', marginTop: 3, fontStyle: 'italic' }}>
                            {thisInvoicePaid.toLocaleString()} already paid
                          </div>
                        )}
                      </div>

                      <div style={{ fontSize: 9, color: '#aaa', marginTop: 8, fontStyle: 'italic' }}>
                        Reflects all invoices and payments as of {statementDate}
                      </div>
                    </>
                  )
                })()}
              </>
            ) : (
              <>
                {/* Posting mode (fresh invoice): prev + this = now owed */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', color: '#888' }}>
                  <span>Previous Outstanding</span>
                  <span style={{ fontFamily: mono }}>{prevBalance.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', color: '#888' }}>
                  <span>+ This Invoice</span>
                  <span style={{ fontFamily: mono }}>{total.toLocaleString()}</span>
                </div>
                <div style={{ height: 1, background: '#f0d0c0', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#c0392b' }}>Total Now Owed</span>
                  <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 800, color: '#c0392b' }}>TZS {totalNowOwed.toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 9, color: '#aaa', marginTop: 5, fontStyle: 'italic' }}>Includes this invoice + unpaid prior balance</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── LINE ITEMS ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
          <thead>
            <tr style={{ background: '#1a1a1a' }}>
              {['#', 'Item / Description', 'Qty', 'Unit Price', 'Disc', 'Amount (TZS)'].map((h, i) => (
                <th key={h} style={{ padding: '9px 12px', textAlign: i >= 2 ? 'right' : i === 0 ? 'center' : 'left', fontFamily: mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#ccc', fontWeight: 500, width: i === 0 ? 36 : i === 2 ? 50 : i === 3 ? 110 : i === 4 ? 60 : i === 5 ? 130 : 'auto' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {voucher.voucher_lines.map((line, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: mono, color: p, fontSize: 11, fontWeight: 600 }}>{String(i+1).padStart(2,'0')}</td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: 12 }}>{line.products?.name || line.description || '—'}</div>
                  {line.products?.sku && <div style={{ fontSize: 9, color: '#bbb', fontFamily: mono, marginTop: 2 }}>SKU: {line.products.sku}</div>}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, fontSize: 12 }}>{line.qty}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, fontSize: 12 }}>{(line.unit_price||0).toLocaleString()}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, fontSize: 11, color: '#aaa' }}>{line.discount_pct ? `${line.discount_pct}%` : '—'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: mono, fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{(line.total||0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── TOTALS + BANK ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '24px 40px 0' }}>
        {s.show_bank_details && (
          <div style={{ paddingRight: 24 }}>
            <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontWeight: 600 }}>{s.label_payment_details}</div>
            <div style={{ background: `${p}12`, border: `1px solid ${p}30`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#1a1a1a', marginBottom: 8 }}>{s.bank_name}</div>
              <div style={{ fontSize: 11, color: '#555', lineHeight: 2, fontFamily: mono }}>
                <div>A/C Name: <span style={{ color: '#1a1a1a', fontWeight: 600 }}>{s.bank_account_name}</span></div>
                <div>A/C No: <span style={{ color: '#1a1a1a', fontWeight: 800, fontSize: 13 }}>{s.bank_account_number}</span></div>
                <div>Branch: {s.bank_branch}</div>
              </div>
              {s.payment_note && <div style={{ fontSize: 10, color: p, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${p}30`, fontStyle: 'italic' }}>{s.payment_note}</div>}
            </div>
          </div>
        )}

        <div style={{ borderLeft: s.show_bank_details ? '1px solid #f0f0f0' : 'none', paddingLeft: s.show_bank_details ? 24 : 0 }}>
          <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontWeight: 600 }}>{s.label_this_invoice}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: `${p}18`, borderRadius: 8, marginTop: 10, border: `1.5px solid ${p}40` }}>
            <span style={{ fontFamily: display, fontSize: 13, fontWeight: 800, color: '#1a1a1a' }}>Invoice Total</span>
            <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: '#1a1a1a' }}>TZS {total.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* ── NOTES ───────────────────────────────────────────────────────────── */}
      {s.show_notes && voucher.notes && (
        <div style={{ margin: '20px 40px 0', padding: '12px 16px', background: '#f9f9f9', borderLeft: `3px solid ${p}`, borderRadius: '0 6px 6px 0' }}>
          <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 5, fontWeight: 600 }}>{s.label_notes}</div>
          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>{voucher.notes}</div>
        </div>
      )}

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <div style={{ margin: '20px 40px 0', padding: '14px 0', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: '#aaa', fontStyle: 'italic', maxWidth: 400 }}>{s.footer_note}</div>
        <div style={{ fontFamily: mono, fontSize: 9, color: '#ccc', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: p }}>{s.company_name}</div>
          <div>Computer-generated invoice · No signature required</div>
        </div>
      </div>

      {/* Bottom band — gradient on screen, solid teal in print to avoid Chrome
          rasterizing the whole doc. The gradient is purely decorative. */}
      <div className="print-solid-bar" style={{ height: 6, background: `linear-gradient(90deg, #1a1a1a 0%, ${p} 50%, #1a1a1a 100%)`, marginTop: 16 }} />
    </div>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────────
const Tog = ({ label, desc, k, settings, onToggle }: { label: string; desc: string; k: keyof InvoiceSettings; settings: InvoiceSettings; onToggle: (k: keyof InvoiceSettings, v: boolean) => void }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{desc}</div>
    </div>
    <button onClick={() => onToggle(k, !settings[k])} style={{
      width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
      background: settings[k] ? 'var(--accent)' : 'var(--surface3)', transition: 'background .2s', position: 'relative', flexShrink: 0,
    }}>
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: settings[k] ? 21 : 3, transition: 'left .2s' }} />
    </button>
  </div>
)

const Fld = ({ label, k, settings, onChange, placeholder, textarea }: { label: string; k: keyof InvoiceSettings; settings: InvoiceSettings; onChange: (k: keyof InvoiceSettings, v: string) => void; placeholder?: string; textarea?: boolean }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
    {textarea
      ? <textarea className="form-input" value={String(settings[k] || '')} placeholder={placeholder} rows={2} style={{ resize: 'none', fontSize: 12 }} onChange={e => onChange(k, e.target.value)} />
      : <input className="form-input" value={String(settings[k] || '')} placeholder={placeholder} onChange={e => onChange(k, e.target.value)} />
    }
  </div>
)

export function InvoiceTemplateSettings({ settings, onChange }: { settings: InvoiceSettings; onChange: (s: InvoiceSettings) => void }) {
  const set = (k: keyof InvoiceSettings, v: string | boolean | number) => onChange({ ...settings, [k]: v })
  const [tab, setTab] = useState<'company'|'bank'|'labels'|'display'|'logo'>('company')
  const logoRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

  // Logo upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const url = ev.target?.result as string
      onChange({ ...settings, logo_url: url, show_logo: true })
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const dx = Math.round(e.clientX - dragStart.current.x)
      const dy = Math.round(e.clientY - dragStart.current.y)
      onChange({ ...settings, logo_x: dragStart.current.ox + dx, logo_y: dragStart.current.oy + dy })
    }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [settings, onChange])

  const tabs = [
    { id: 'company', label: 'Company' },
    { id: 'bank', label: 'Bank' },
    { id: 'labels', label: 'Labels' },
    { id: 'display', label: 'Display' },
    { id: 'logo', label: 'Logo' },
  ] as const

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 16, background: 'var(--surface2)', padding: 4, borderRadius: 8, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 14px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
            borderRadius: 6, background: tab === t.id ? 'var(--accent)' : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--text3)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Company tab */}
      {tab === 'company' && (
        <div>
          <Fld label="Company Name" k="company_name" settings={settings} onChange={set} />
          <Fld label="Tagline" k="tagline" settings={settings} onChange={set} />
          <Fld label="Address" k="address" settings={settings} onChange={set} />
          <Fld label="Phone" k="phone" settings={settings} onChange={set} />
          <Fld label="Email" k="email" settings={settings} onChange={set} />
          <Fld label="Website" k="website" settings={settings} onChange={set} />
          <Fld label="TIN (Tax ID)" k="tin" settings={settings} onChange={set} placeholder="e.g. 123-456-789" />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Brand Colour</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4 }} />
              <input className="form-input" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ fontFamily: 'var(--mono)', width: 110 }} />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Used for header, accents</span>
            </div>
          </div>
        </div>
      )}

      {/* Bank tab */}
      {tab === 'bank' && (
        <div>
          <Fld label="Bank Name" k="bank_name" settings={settings} onChange={set} />
          <Fld label="Account Name" k="bank_account_name" settings={settings} onChange={set} />
          <Fld label="Account Number" k="bank_account_number" settings={settings} onChange={set} />
          <Fld label="Branch" k="bank_branch" settings={settings} onChange={set} />
          <Fld label="Payment Note (inside bank box)" k="payment_note" settings={settings} onChange={set} placeholder="Please quote invoice number as reference" textarea />
          <Fld label="Footer Note (bottom of invoice)" k="footer_note" settings={settings} onChange={set} placeholder="Thank you for your business…" textarea />
        </div>
      )}

      {/* Labels tab — editable text for every label on the invoice */}
      {tab === 'labels' && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.6 }}>
            Edit the text labels that appear on every invoice. These are section headers and field names — translate or customise freely.
          </div>
          <Fld label='"Tax Invoice" heading (top right)' k="label_invoice" settings={settings} onChange={set} placeholder="Tax Invoice" />
          <Fld label='"Bill To" section header' k="label_bill_to" settings={settings} onChange={set} placeholder="Bill To" />
          <Fld label='"Account Statement" section header' k="label_account_statement" settings={settings} onChange={set} placeholder="Account Statement" />
          <Fld label='"This Invoice" section header' k="label_this_invoice" settings={settings} onChange={set} placeholder="This Invoice" />
          <Fld label='"Payment Details" section header' k="label_payment_details" settings={settings} onChange={set} placeholder="Payment Details" />
          <Fld label='"Notes" section header' k="label_notes" settings={settings} onChange={set} placeholder="Notes" />
          <Fld label='"Invoiced by" prefix' k="label_salesperson" settings={settings} onChange={set} placeholder="Invoiced by" />
        </div>
      )}

      {/* Display tab — toggles WITH editable descriptions */}
      {tab === 'display' && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>Toggle sections on/off. Each toggle has an editable label above it.</div>
          <Tog label="Show Logo" desc="Display company logo in header" k="show_logo" settings={settings} onToggle={set} />
          <Tog label="Bank Details" desc="Show bank/payment info section" k="show_bank_details" settings={settings} onToggle={set} />
          <Tog label="Outstanding Balance" desc="Show prior balance in account statement" k="show_outstanding_balance" settings={settings} onToggle={set} />
          <Tog label="Payment Terms" desc="Show due date and terms in header" k="show_payment_terms" settings={settings} onToggle={set} />
          <Tog label="Salesperson" desc="Show who issued the invoice" k="show_salesperson" settings={settings} onToggle={set} />
          <Tog label="Notes" desc="Show notes / payment instructions at bottom" k="show_notes" settings={settings} onToggle={set} />
        </div>
      )}

      {/* Logo tab */}
      {tab === 'logo' && (
        <div>
          {/* Upload */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Upload Logo</div>
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '24px 16px', border: '2px dashed var(--border)', borderRadius: 10,
              cursor: 'pointer', background: 'var(--surface2)', transition: 'border-color .15s'
            }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'}
               onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
              {settings.logo_url ? (
                <>
                  <img src={settings.logo_url} alt="Logo preview" style={{ maxHeight: 60, maxWidth: 200, objectFit: 'contain' }} />
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Click to replace</div>
                </>
              ) : (
                <>
                  <svg width="32" height="32" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Click to upload logo</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>PNG, JPG, SVG — transparent background recommended</div>
                </>
              )}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
            </label>
            {settings.logo_url && (
              <button onClick={() => onChange({ ...settings, logo_url: '', show_logo: false })}
                style={{ marginTop: 8, fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Remove logo
              </button>
            )}
          </div>

          {/* Size */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Logo Size: <span style={{ color: 'var(--accent)' }}>{settings.logo_width}px</span>
            </div>
            <input type="range" min={40} max={200} value={settings.logo_width} onChange={e => set('logo_width', Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
              <span>40px (small)</span><span>200px (large)</span>
            </div>
          </div>

          {/* Position */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Position Offset · X: <span style={{ color: 'var(--accent)' }}>{settings.logo_x}px</span> · Y: <span style={{ color: 'var(--accent)' }}>{settings.logo_y}px</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Horizontal (X)</div>
                <input type="range" min={-60} max={60} value={settings.logo_x} onChange={e => set('logo_x', Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Vertical (Y)</div>
                <input type="range" min={-30} max={60} value={settings.logo_y} onChange={e => set('logo_y', Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
              </div>
            </div>
          </div>

          {/* Live drag tip */}
          {settings.logo_url && (
            <div ref={logoRef} style={{ padding: '10px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 8, fontSize: 11, color: 'var(--accent)' }}>
              You can also drag the logo directly in the live preview on the right.
            </div>
          )}

          {/* Reset position */}
          <button onClick={() => onChange({ ...settings, logo_x: 0, logo_y: 0, logo_width: 80 })}
            style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
            Reset to default position & size
          </button>
        </div>
      )}
    </div>
  )
}

// ── Default Export: Settings Page ─────────────────────────────────────────────
export default function InvoiceTemplatePage() {
  const [settings, setSettings] = useState<InvoiceSettings>(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  // Logo drag on preview
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0, scale: 1 })

  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'invoice_template').single()
      .then(({ data }) => { if (data?.value) try { setSettings({ ...DEFAULT, ...JSON.parse(data.value) }) } catch {} })
  }, [])

  // Preview logo drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const scale = dragStart.current.scale
      const dx = Math.round((e.clientX - dragStart.current.x) / scale)
      const dy = Math.round((e.clientY - dragStart.current.y) / scale)
      setSettings(s => ({ ...s, logo_x: dragStart.current.ox + dx, logo_y: dragStart.current.oy + dy }))
    }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const startLogoDrag = (e: React.MouseEvent) => {
    const rect = previewRef.current?.getBoundingClientRect()
    const scale = rect ? rect.width / 794 : 0.63
    isDragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, ox: settings.logo_x, oy: settings.logo_y, scale }
    e.preventDefault(); e.stopPropagation()
  }

  const save = async () => {
    setSaving(true)
    await supabase.from('system_settings').upsert({ key: 'invoice_template', value: JSON.stringify(settings) }, { onConflict: 'key' })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const SAMPLE: Voucher = {
    ref: 'SI-10-0001', posting_date: '2026-03-27', due_date: '2026-04-26',
    payment_terms: 'NET30', notes: 'Please transfer to the account above and quote invoice number.',
    total_amount: 520000, subtotal: 520000, posted_by: 'Joe Gembe',
    customers: { name: 'Dr. Sarah Kimani', company: 'Aga Khan Health Services Tanzania', contact_person: 'Dr. Sarah Kimani', whatsapp: '+255 22 211 5151', address: 'Ocean Road, Dar es Salaam', balance: 185000 },
    voucher_lines: [
      { qty: 10, unit_price: 32000, total: 320000, discount_pct: 0, description: 'Nipple Cream', products: { name: 'Nipple Cream — 60ml', sku: 'MK-003' } },
      { qty: 4, unit_price: 50000, total: 200000, discount_pct: 0, description: 'Prenatal Bundle', products: { name: 'Prenatal Bundle', sku: 'MK-008' } },
    ],
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Invoice Template</div>
          <div className="page-sub">Customise your sales invoice appearance · Changes save to system settings</div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Settings panel */}
        <div className="card" style={{ position: 'sticky', top: 0 }}>
          <InvoiceTemplateSettings settings={settings} onChange={setSettings} />
        </div>

        {/* Live preview */}
        <div>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Live Preview</span>
            {settings.logo_url && <span style={{ color: 'var(--accent)' }}>Drag logo to reposition</span>}
          </div>
          <div ref={previewRef} style={{ transform: 'scale(0.63)', transformOrigin: 'top left', width: '159%', userSelect: 'none' }}>
            {/* Wrap SokoraInvoice and intercept logo mousedown for dragging */}
            <div style={{ position: 'relative' }}>
              <SokoraInvoice voucher={SAMPLE} settings={settings} />
              {/* Drag overlay for logo */}
              {settings.show_logo && settings.logo_url && (
                <div
                  onMouseDown={startLogoDrag}
                  style={{
                    position: 'absolute',
                    top: 24 + settings.logo_y,
                    left: 40 + settings.logo_x,
                    width: settings.logo_width,
                    height: 80,
                    cursor: 'grab',
                    zIndex: 10,
                    border: '2px dashed rgba(133,194,190,0.6)',
                    borderRadius: 4,
                    background: 'rgba(133,194,190,0.05)',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
