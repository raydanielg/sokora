import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════════════
//  SOKORA PROFORMA INVOICE TEMPLATE
//  Premium, editable quotation template · Drives ProformaInvoice preview
//  Persists to system_settings.key = 'proforma_template'
// ═══════════════════════════════════════════════════════════════════════════

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ProformaSettings {
  // Identity
  company_name: string; tagline: string; address: string; city: string
  phone: string; email: string; website: string
  tin: string; vrn: string

  // Theme
  theme: 'classic' | 'minimal' | 'bold' | 'elegant'
  primary_color: string; accent_color: string
  header_style: 'banner' | 'split' | 'minimal' | 'watermark'
  watermark_text: string; show_watermark: boolean
  watermark_opacity: number

  // Logo
  logo_url: string; logo_width: number
  logo_x: number; logo_y: number
  logo_position: 'left' | 'center' | 'right'

  // Header
  header_title: string; header_subtitle: string

  // Labels
  label_quote_to: string; label_validity: string
  label_payment_terms: string; label_notes: string
  label_delivery: string; label_prepared_by: string
  label_accept: string; label_reject: string

  // Footer
  footer_tagline: string; footer_thank_you: string
  footer_website_cta: string
  terms_conditions: string

  // Bank
  bank_name: string; bank_account_name: string
  bank_account_number: string; bank_branch: string
  bank_swift: string

  // QR Codes
  qr_enabled: boolean
  qr_mode: 'accept' | 'konnect' | 'whatsapp' | 'website' | 'custom'
  qr_custom_url: string
  qr_konnect_url: string
  qr_whatsapp_number: string
  qr_label: string
  qr_sublabel: string
  qr_position: 'bottom-left' | 'bottom-right' | 'top-right'

  // Acceptance / signature
  accept_url_base: string
  show_acceptance_block: boolean
  acceptance_cta_text: string

  // Display toggles
  show_logo: boolean; show_bank_details: boolean
  show_validity: boolean; show_delivery_terms: boolean
  show_prepared_by: boolean; show_terms: boolean
  show_vat_breakdown: boolean; show_savings_badge: boolean
  show_confidence_bar: boolean; show_sku: boolean
  show_watermark_status: boolean
}

export const DEFAULT_PROFORMA: ProformaSettings = {
  company_name: 'Your Organization',
  tagline: 'Your Partner in Motherhood',
  address: 'Dar es Salaam, Tanzania',
  city: 'Dar es Salaam',
  phone: '+255 700 000 000',
  email: 'hello@sokora.app',
  website: 'www.sokora.app',
  tin: '—', vrn: '—',

  theme: 'classic',
  primary_color: '#5EA8A2',
  accent_color: '#5E2230',
  header_style: 'banner',
  watermark_text: 'PROFORMA',
  show_watermark: true,
  watermark_opacity: 6,

  logo_url: '', logo_width: 80,
  logo_x: 0, logo_y: 0,
  logo_position: 'left',

  header_title: 'Proforma Invoice',
  header_subtitle: 'Quotation · Not a Tax Invoice',

  label_quote_to: 'Quote To',
  label_validity: 'Valid Until',
  label_payment_terms: 'Payment Terms',
  label_notes: 'Notes & Special Instructions',
  label_delivery: 'Delivery',
  label_prepared_by: 'Prepared By',
  label_accept: 'Accept This Quote',
  label_reject: 'Decline',

  footer_tagline: 'Kila mama ni SOKORA',
  footer_thank_you: 'Thank you for considering SOKORA. We look forward to partnering with you.',
  footer_website_cta: 'sokora.app · Reimagining Motherhood',
  terms_conditions: 'Prices are valid until the date shown above. Delivery within Dar es Salaam is free for orders above 500,000 TZS. Goods remain property of Your Organization until full payment is received. VAT is included where applicable.',

  bank_name: 'NMB Bank',
  bank_account_name: 'Your Organization',
  bank_account_number: '22510074972',
  bank_branch: 'Dar es Salaam Branch',
  bank_swift: 'NMIBTZTZ',

  qr_enabled: true,
  qr_mode: 'accept',
  qr_custom_url: '',
  qr_konnect_url: 'https://www.sokora.app/join',
  qr_whatsapp_number: '255700000000',
  qr_label: 'Scan to Accept',
  qr_sublabel: 'Instant confirmation · No printing needed',
  qr_position: 'bottom-right',

  accept_url_base: 'https://sokora.app/accept',
  show_acceptance_block: true,
  acceptance_cta_text: 'Scan · Sign · Send back',

  show_logo: true,
  show_bank_details: true,
  show_validity: true,
  show_delivery_terms: true,
  show_prepared_by: true,
  show_terms: true,
  show_vat_breakdown: true,
  show_savings_badge: true,
  show_confidence_bar: true,
  show_sku: false,
  show_watermark_status: true,
}

// ── Voucher shape ─────────────────────────────────────────────────────────────
export interface ProformaVoucher {
  ref: string
  posting_date: string
  valid_until?: string
  payment_terms?: string
  delivery_terms?: string
  notes?: string
  subtotal: number
  vat_amount: number
  total_amount: number
  posted_by?: string
  status?: 'proforma' | 'accepted' | 'converted' | 'expired' | 'declined'
  customers: {
    name: string
    company?: string
    contact_person?: string
    whatsapp: string
    address?: string
    email?: string
  } | null
  voucher_lines: {
    qty: number
    unit_price: number
    discount_pct?: number
    total: number
    description: string
    products: { name: string; sku: string } | null
  }[]
}

// ── QR URL builder (Google Charts — no dependency) ───────────────────────────
const buildQrUrl = (data: string, size = 180) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&margin=0&ecc=M`

const qrTarget = (s: ProformaSettings, ref: string, total: number): string => {
  switch (s.qr_mode) {
    case 'accept':
      return `${s.accept_url_base}?ref=${ref}&amt=${total}`
    case 'konnect':
      return s.qr_konnect_url
    case 'whatsapp':
      return `https://wa.me/${s.qr_whatsapp_number}?text=${encodeURIComponent(`Hi SOKORA, I'd like to accept proforma ${ref}`)}`
    case 'website':
      return `https://${s.website.replace(/^https?:\/\//, '')}`
    case 'custom':
      return s.qr_custom_url || s.website
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SokoraProforma — the actual printable document
// ═══════════════════════════════════════════════════════════════════════════
export function SokoraProforma({ voucher, settings }: {
  voucher: ProformaVoucher
  settings?: Partial<ProformaSettings>
}) {
  const s: ProformaSettings = { ...DEFAULT_PROFORMA, ...(settings || {}) }
  const p = s.primary_color
  const a = s.accent_color

  const cust = voucher.customers
  const total = voucher.total_amount || 0
  const subtotal = voucher.subtotal || Math.round(total - (voucher.vat_amount || 0))
  const vat = voucher.vat_amount || 0

  // Savings calculation (sum of line discounts if any)
  const totalSavings = voucher.voucher_lines.reduce((sum, l) => {
    if (!l.discount_pct) return sum
    const full = l.unit_price * l.qty
    const discounted = l.total
    return sum + (full - discounted)
  }, 0)

  const mono = "'DM Mono', 'Courier New', monospace"
  const display = "'Cormorant Garamond', 'Georgia', serif"
  const body = "'Instrument Sans', 'Helvetica Neue', sans-serif"

  const statusPill = (() => {
    const st = voucher.status || 'proforma'
    const map = {
      proforma:  { bg: `${p}22`, fg: p,        text: 'QUOTATION' },
      accepted:  { bg: '#10b98122', fg: '#10b981', text: 'ACCEPTED' },
      converted: { bg: '#6366f122', fg: '#6366f1', text: 'CONVERTED' },
      expired:   { bg: '#6b728022', fg: '#6b7280', text: 'EXPIRED' },
      declined:  { bg: '#ef444422', fg: '#ef4444', text: 'DECLINED' },
    }
    return map[st] || map.proforma
  })()

  // Acceptance URL for QR
  const qrData = qrTarget(s, voucher.ref, total)

  // Logo alignment
  const logoJustify = s.logo_position === 'center' ? 'center' : s.logo_position === 'right' ? 'flex-end' : 'flex-start'

  return (
    <div id="sokora-proforma" style={{
      width: 794,
      background: '#ffffff',
      fontFamily: body,
      boxShadow: '0 4px 32px rgba(0,0,0,.12)',
      borderRadius: 2,
      position: 'relative',
      overflow: 'hidden',
      color: '#1a1a1a',
    }}>

      {/* ═══ WATERMARK ═══════════════════════════════════════════════════════ */}
      {s.show_watermark && (
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%) rotate(-28deg)',
          fontFamily: display,
          fontSize: 180,
          fontWeight: 700,
          color: p,
          opacity: s.watermark_opacity / 100,
          pointerEvents: 'none',
          letterSpacing: '-4px',
          whiteSpace: 'nowrap',
          zIndex: 0,
          userSelect: 'none',
        }}>
          {s.watermark_text}
        </div>
      )}

      {/* ═══ HEADER — Banner Style ══════════════════════════════════════════ */}
      {s.header_style === 'banner' && (
        <div style={{
          background: `linear-gradient(135deg, ${p} 0%, ${p}ee 50%, ${a} 180%)`,
          padding: '28px 40px 24px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Diagonal lines overlay */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.07,
            backgroundImage: 'repeating-linear-gradient(60deg, #fff 0, #fff 1px, transparent 1px, transparent 18px)',
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
              {s.show_logo && s.logo_url && (
                <img src={s.logo_url} alt="Logo" style={{
                  width: s.logo_width, height: 'auto',
                  objectFit: 'contain',
                  marginLeft: s.logo_x, marginTop: s.logo_y,
                  filter: 'brightness(0) invert(1)',
                }} />
              )}
              <div>
                <div style={{ fontFamily: display, fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>
                  {s.company_name}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.78)', marginTop: 4, fontFamily: mono, letterSpacing: 1.8, textTransform: 'uppercase' }}>
                  {s.tagline}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.62)', marginTop: 10, lineHeight: 1.8 }}>
                  {s.address} · {s.phone}<br />
                  {s.email} · {s.website}<br />
                  <span style={{ color: 'rgba(255,255,255,.45)' }}>TIN: {s.tin}{s.vrn !== '—' && ` · VRN: ${s.vrn}`}</span>
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{
                display: 'inline-block',
                background: statusPill.bg,
                color: statusPill.fg === p ? '#fff' : statusPill.fg,
                fontFamily: mono,
                fontSize: 9,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 3,
                letterSpacing: 2,
                marginBottom: 6,
                border: statusPill.fg === p ? '1px solid rgba(255,255,255,.35)' : 'none',
              }}>
                {statusPill.text}
              </div>
              <div style={{ fontFamily: display, fontSize: 30, fontWeight: 700, color: '#fff', letterSpacing: '-1px', lineHeight: 1 }}>
                {s.header_title}
              </div>
              <div style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.7)', marginTop: 3, letterSpacing: 0.5 }}>
                {s.header_subtitle}
              </div>
              <div style={{
                fontFamily: mono, fontSize: 16, fontWeight: 700,
                color: '#fff', marginTop: 12,
                background: 'rgba(0,0,0,.18)',
                padding: '6px 12px', borderRadius: 3,
                display: 'inline-block',
                letterSpacing: 1,
              }}>
                {voucher.ref}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ HEADER — Minimal Style ════════════════════════════════════════ */}
      {s.header_style === 'minimal' && (
        <div style={{ padding: '36px 40px 20px', borderBottom: `3px solid ${p}`, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: logoJustify, marginBottom: 24 }}>
            {s.show_logo && s.logo_url && (
              <img src={s.logo_url} alt="Logo" style={{
                width: s.logo_width, height: 'auto', objectFit: 'contain',
                marginLeft: s.logo_x, marginTop: s.logo_y,
              }} />
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontFamily: display, fontSize: 28, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.5px', lineHeight: 1 }}>
                {s.header_title}
              </div>
              <div style={{ fontSize: 10, color: '#888', marginTop: 6, fontFamily: mono, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {s.header_subtitle}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: '#aaa', letterSpacing: 2, marginBottom: 2 }}>REF</div>
              <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: p, letterSpacing: 0.5 }}>
                {voucher.ref}
              </div>
              <div style={{ fontFamily: mono, fontSize: 10, color: '#888', marginTop: 4 }}>{voucher.posting_date}</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#999', marginTop: 14, lineHeight: 1.7 }}>
            <span style={{ fontWeight: 700, color: '#555' }}>{s.company_name}</span> · {s.address} · {s.phone} · {s.email} · TIN: {s.tin}
          </div>
        </div>
      )}

      {/* ═══ HEADER — Split Style ══════════════════════════════════════════ */}
      {s.header_style === 'split' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', position: 'relative', zIndex: 1 }}>
          <div style={{ padding: '28px 40px', background: '#fff' }}>
            {s.show_logo && s.logo_url && (
              <img src={s.logo_url} alt="Logo" style={{
                width: s.logo_width, height: 'auto', objectFit: 'contain',
                marginLeft: s.logo_x, marginTop: s.logo_y,
                marginBottom: 12,
              }} />
            )}
            <div style={{ fontFamily: display, fontSize: 22, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.1 }}>
              {s.company_name}
            </div>
            <div style={{ fontSize: 10, color: p, marginTop: 4, fontFamily: mono, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>
              {s.tagline}
            </div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 10, lineHeight: 1.8 }}>
              {s.address}<br />{s.phone} · {s.email}<br />
              <span style={{ color: '#999' }}>TIN: {s.tin}</span>
            </div>
          </div>
          <div style={{ background: p, padding: '28px 24px', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontFamily: mono, fontSize: 9, opacity: 0.7, letterSpacing: 2, marginBottom: 4 }}>{s.header_subtitle.toUpperCase()}</div>
            <div style={{ fontFamily: display, fontSize: 24, fontWeight: 700, lineHeight: 1, marginBottom: 10 }}>{s.header_title}</div>
            <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>{voucher.ref}</div>
            <div style={{ fontFamily: mono, fontSize: 10, opacity: 0.85, marginTop: 4 }}>Issued: {voucher.posting_date}</div>
          </div>
        </div>
      )}

      {/* ═══ META STRIP ════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `2fr 1fr 1fr ${s.show_prepared_by ? '1fr' : ''}`,
        padding: '20px 40px',
        borderBottom: '1px solid #eee',
        background: '#fafbfb',
        position: 'relative', zIndex: 1,
      }}>
        <div>
          <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, fontWeight: 600 }}>{s.label_quote_to}</div>
          <div style={{ fontFamily: display, fontSize: 16, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.2 }}>
            {cust?.company || cust?.name || '—'}
          </div>
          {cust?.contact_person && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Attn: {cust.contact_person}</div>}
          {cust?.whatsapp && <div style={{ fontSize: 10, color: '#999', fontFamily: mono, marginTop: 3 }}>{cust.whatsapp}</div>}
          {cust?.email && <div style={{ fontSize: 10, color: '#999', fontFamily: mono }}>{cust.email}</div>}
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, fontWeight: 600 }}>Issued</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{voucher.posting_date}</div>
          {s.show_validity && voucher.valid_until && (
            <>
              <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginTop: 10, marginBottom: 4, fontWeight: 600 }}>{s.label_validity}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: a }}>{voucher.valid_until}</div>
            </>
          )}
        </div>
        <div>
          {voucher.payment_terms && (
            <>
              <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, fontWeight: 600 }}>{s.label_payment_terms}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{voucher.payment_terms}</div>
            </>
          )}
          {s.show_delivery_terms && voucher.delivery_terms && (
            <>
              <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginTop: 10, marginBottom: 4, fontWeight: 600 }}>{s.label_delivery}</div>
              <div style={{ fontSize: 11, color: '#555' }}>{voucher.delivery_terms}</div>
            </>
          )}
        </div>
        {s.show_prepared_by && voucher.posted_by && (
          <div>
            <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, fontWeight: 600 }}>{s.label_prepared_by}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{voucher.posted_by}</div>
          </div>
        )}
      </div>

      {/* ═══ LINE ITEMS ════════════════════════════════════════════════════ */}
      <div style={{ padding: '0 40px', marginTop: 18, position: 'relative', zIndex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#1a1a1a' }}>
              {['#', 'Item / Description', 'Qty', 'Unit Price', s.show_vat_breakdown ? 'Disc' : '', 'Amount (TZS)'].filter(Boolean).map((h, i, arr) => (
                <th key={h} style={{
                  padding: '10px 12px',
                  textAlign: i >= 2 ? 'right' : i === 0 ? 'center' : 'left',
                  fontFamily: mono, fontSize: 9, textTransform: 'uppercase',
                  letterSpacing: 1, color: '#ccc', fontWeight: 500,
                  width: i === 0 ? 34 : i === 2 ? 48 : i === arr.length - 1 ? 120 : 'auto',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {voucher.voucher_lines.map((line, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? '#fff' : '#fbfbfb' }}>
                <td style={{ padding: '11px 12px', textAlign: 'center', fontFamily: mono, color: p, fontSize: 11, fontWeight: 600 }}>
                  {String(i + 1).padStart(2, '0')}
                </td>
                <td style={{ padding: '11px 12px' }}>
                  <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: 12 }}>{line.products?.name || line.description || '—'}</div>
                  {s.show_sku && line.products?.sku && <div style={{ fontSize: 9, color: '#bbb', fontFamily: mono, marginTop: 2 }}>SKU: {line.products.sku}</div>}
                </td>
                <td style={{ padding: '11px 12px', textAlign: 'right', fontFamily: mono, fontSize: 12 }}>{line.qty}</td>
                <td style={{ padding: '11px 12px', textAlign: 'right', fontFamily: mono, fontSize: 12 }}>{(line.unit_price || 0).toLocaleString()}</td>
                {s.show_vat_breakdown && (
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontFamily: mono, fontSize: 11, color: line.discount_pct ? '#10b981' : '#ccc', fontWeight: line.discount_pct ? 700 : 400 }}>
                    {line.discount_pct ? `−${line.discount_pct}%` : '—'}
                  </td>
                )}
                <td style={{ padding: '11px 12px', textAlign: 'right', fontFamily: mono, fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>
                  {(line.total || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ TOTALS + SAVINGS BADGE ═══════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', padding: '20px 40px 0', gap: 20, position: 'relative', zIndex: 1 }}>

        {/* Left: Savings + Confidence bar */}
        <div>
          {s.show_savings_badge && totalSavings > 0 && (
            <div style={{
              background: `linear-gradient(135deg, ${a}15, ${a}06)`,
              border: `1.5px solid ${a}40`,
              borderRadius: 10,
              padding: '14px 16px',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{
                width: 40, height: 40,
                borderRadius: '50%',
                background: a,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="20" height="20" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 10, fontFamily: mono, color: a, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 }}>You Save</div>
                <div style={{ fontFamily: display, fontSize: 20, fontWeight: 700, color: a, lineHeight: 1.1 }}>
                  TZS {totalSavings.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>Volume discount applied</div>
              </div>
            </div>
          )}

          {s.show_confidence_bar && (
            <div style={{
              display: 'flex', gap: 10, flexWrap: 'wrap',
              marginTop: 6,
            }}>
              {[
                { icon: 'M9 12l2 2 4-4 M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.42 0 2.76.33 3.95.92', text: 'Authentic imports' },
                { icon: 'M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z', text: 'Mother-approved' },
                { icon: 'M1 4h22v16H1z M1 10h22', text: 'Secure payment' },
              ].map((b, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px',
                  background: '#f5f9f9',
                  borderRadius: 20,
                  border: '1px solid #e5eeee',
                }}>
                  <svg width="11" height="11" fill="none" stroke={p} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={b.icon} /></svg>
                  <span style={{ fontSize: 10, color: '#555', fontWeight: 500 }}>{b.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Totals block */}
        <div>
          {s.show_vat_breakdown && vat > 0 && (
            <div style={{ padding: '10px 4px', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: '#666' }}>
                <span>Subtotal (excl. VAT)</span>
                <span style={{ fontFamily: mono }}>{subtotal.toLocaleString()}</span>
              </div>
              {vat > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: '#666' }}>
                  <span>VAT (18%)</span>
                  <span style={{ fontFamily: mono }}>{vat.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px',
            background: `linear-gradient(135deg, ${p}20, ${p}08)`,
            borderRadius: 10,
            marginTop: 10,
            border: `1.5px solid ${p}50`,
          }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: mono, color: p, letterSpacing: 2, fontWeight: 700 }}>QUOTED TOTAL</div>
              <div style={{ fontSize: 9, color: '#888', marginTop: 1 }}>All inclusive</div>
            </div>
            <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.5px' }}>
              TZS {total.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ BANK + ACCEPTANCE BLOCK ═══════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: s.show_bank_details && s.show_acceptance_block ? '1fr 1fr' : '1fr',
        padding: '22px 40px 0',
        gap: 18,
        position: 'relative', zIndex: 1,
      }}>
        {s.show_bank_details && (
          <div>
            <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, fontWeight: 600 }}>
              Payment Details
            </div>
            <div style={{
              background: `${p}0a`,
              border: `1px solid ${p}30`,
              borderRadius: 10,
              padding: '14px 16px',
            }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#1a1a1a', marginBottom: 8 }}>{s.bank_name}</div>
              <div style={{ fontSize: 11, color: '#555', lineHeight: 1.9, fontFamily: mono }}>
                <div>A/C Name: <span style={{ color: '#1a1a1a', fontWeight: 600 }}>{s.bank_account_name}</span></div>
                <div>A/C No: <span style={{ color: '#1a1a1a', fontWeight: 800, fontSize: 13 }}>{s.bank_account_number}</span></div>
                <div>Branch: {s.bank_branch}</div>
                {s.bank_swift && <div>SWIFT: {s.bank_swift}</div>}
              </div>
              <div style={{ fontSize: 10, color: p, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${p}30`, fontStyle: 'italic' }}>
                Please quote <strong>{voucher.ref}</strong> as payment reference.
              </div>
            </div>
          </div>
        )}

        {s.show_acceptance_block && s.qr_enabled && (
          <div>
            <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, fontWeight: 600 }}>
              {s.label_accept}
            </div>
            <div style={{
              background: `linear-gradient(135deg, ${a}08, ${p}06)`,
              border: `1.5px dashed ${a}55`,
              borderRadius: 10,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}>
              <img src={buildQrUrl(qrData, 160)} alt="Accept QR"
                style={{ width: 86, height: 86, flexShrink: 0, borderRadius: 6, background: '#fff', padding: 4, border: `1px solid ${a}30` }} />
              <div>
                <div style={{ fontFamily: display, fontSize: 15, fontWeight: 700, color: a, lineHeight: 1.1 }}>
                  {s.qr_label}
                </div>
                <div style={{ fontSize: 10, color: '#666', marginTop: 4, lineHeight: 1.5 }}>
                  {s.qr_sublabel}
                </div>
                <div style={{ fontSize: 9, fontFamily: mono, color: a, marginTop: 6, letterSpacing: 0.5, fontWeight: 600 }}>
                  {s.acceptance_cta_text}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ NOTES ═════════════════════════════════════════════════════════ */}
      {voucher.notes && (
        <div style={{ margin: '20px 40px 0', padding: '12px 16px', background: '#f9f9f9', borderLeft: `3px solid ${p}`, borderRadius: '0 6px 6px 0', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, fontFamily: mono, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 5, fontWeight: 600 }}>
            {s.label_notes}
          </div>
          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>{voucher.notes}</div>
        </div>
      )}

      {/* ═══ TERMS ═════════════════════════════════════════════════════════ */}
      {s.show_terms && s.terms_conditions && (
        <div style={{ margin: '16px 40px 0', padding: '12px 14px', background: '#fafafa', borderRadius: 8, position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, fontFamily: mono, color: '#999', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4, fontWeight: 600 }}>
            Terms & Conditions
          </div>
          <div style={{ fontSize: 10, color: '#777', lineHeight: 1.6 }}>{s.terms_conditions}</div>
        </div>
      )}

      {/* ═══ FOOTER ════════════════════════════════════════════════════════ */}
      <div style={{
        margin: '22px 40px 0',
        padding: '18px 0 12px',
        borderTop: '1px solid #eee',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontFamily: display, fontSize: 14, fontWeight: 700, color: a, lineHeight: 1.2 }}>
            {s.footer_tagline}
          </div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 4, lineHeight: 1.6 }}>
            {s.footer_thank_you}
          </div>
        </div>
        <div style={{ fontFamily: mono, fontSize: 9, color: '#bbb', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: p, fontSize: 10 }}>{s.footer_website_cta}</div>
          <div style={{ marginTop: 2 }}>Computer-generated · {voucher.ref}</div>
        </div>
      </div>

      {/* Bottom brand band */}
      <div style={{
        height: 6,
        background: `linear-gradient(90deg, ${a} 0%, ${p} 50%, ${a} 100%)`,
        marginTop: 14,
        position: 'relative', zIndex: 1,
      }} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETTINGS PANEL — Tabbed editor
// ═══════════════════════════════════════════════════════════════════════════

const Tog = ({ label, desc, k, settings, onToggle }: {
  label: string; desc: string;
  k: keyof ProformaSettings;
  settings: ProformaSettings;
  onToggle: (k: keyof ProformaSettings, v: boolean) => void
}) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{desc}</div>
    </div>
    <button onClick={() => onToggle(k, !settings[k])} style={{
      width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
      background: settings[k] ? 'var(--accent)' : 'var(--surface3)',
      transition: 'background .2s', position: 'relative', flexShrink: 0,
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, left: settings[k] ? 21 : 3, transition: 'left .2s',
      }} />
    </button>
  </div>
)

const Fld = ({ label, k, settings, onChange, placeholder, textarea }: {
  label: string; k: keyof ProformaSettings;
  settings: ProformaSettings;
  onChange: (k: keyof ProformaSettings, v: string) => void;
  placeholder?: string; textarea?: boolean
}) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
    {textarea
      ? <textarea className="form-input" value={String(settings[k] || '')} placeholder={placeholder} rows={3} style={{ resize: 'none', fontSize: 12 }} onChange={e => onChange(k, e.target.value)} />
      : <input className="form-input" value={String(settings[k] || '')} placeholder={placeholder} onChange={e => onChange(k, e.target.value)} />
    }
  </div>
)

export function ProformaTemplateSettings({ settings, onChange }: {
  settings: ProformaSettings
  onChange: (s: ProformaSettings) => void
}) {
  type SetVal = string | boolean | number
  const set = (k: keyof ProformaSettings, v: SetVal) => onChange({ ...settings, [k]: v })
  const [tab, setTab] = useState<'company' | 'header' | 'logo' | 'theme' | 'bank' | 'qr' | 'labels' | 'footer' | 'display'>('company')

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

  const tabs = [
    { id: 'company',  label: 'Company' },
    { id: 'header',   label: 'Header' },
    { id: 'logo',     label: 'Logo' },
    { id: 'theme',    label: 'Theme' },
    { id: 'bank',     label: 'Bank' },
    { id: 'qr',       label: 'QR & CTA' },
    { id: 'labels',   label: 'Labels' },
    { id: 'footer',   label: 'Footer' },
    { id: 'display',  label: 'Display' },
  ] as const

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 16, background: 'var(--surface2)', padding: 4, borderRadius: 8, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
            borderRadius: 6,
            background: tab === t.id ? 'var(--accent)' : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--text3)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Company ─────────────────────────────────── */}
      {tab === 'company' && (
        <div>
          <Fld label="Company Name"      k="company_name" settings={settings} onChange={set} />
          <Fld label="Tagline"           k="tagline"      settings={settings} onChange={set} />
          <Fld label="Address"           k="address"      settings={settings} onChange={set} />
          <Fld label="Phone"             k="phone"        settings={settings} onChange={set} />
          <Fld label="Email"             k="email"        settings={settings} onChange={set} />
          <Fld label="Website"           k="website"      settings={settings} onChange={set} />
          <Fld label="TIN (Tax ID)"      k="tin"          settings={settings} onChange={set} placeholder="e.g. 123-456-789" />
          <Fld label="VRN (VAT Number)"  k="vrn"          settings={settings} onChange={set} placeholder="—" />
        </div>
      )}

      {/* ── Header ─────────────────────────────────── */}
      {tab === 'header' && (
        <div>
          <Fld label='Header Title (top-right large text)' k="header_title" settings={settings} onChange={set} placeholder="Proforma Invoice" />
          <Fld label="Header Subtitle" k="header_subtitle" settings={settings} onChange={set} placeholder="Quotation · Not a Tax Invoice" />

          <div style={{ marginTop: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Header Style</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { v: 'banner',  label: 'Banner',  desc: 'Full-colour band' },
                { v: 'split',   label: 'Split',   desc: 'Two-column brand strip' },
                { v: 'minimal', label: 'Minimal', desc: 'Clean lines, centered' },
              ].map(opt => (
                <button key={opt.v} onClick={() => set('header_style', opt.v as ProformaSettings['header_style'])} style={{
                  padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                  background: settings.header_style === opt.v ? 'var(--accent-dim)' : 'var(--surface2)',
                  border: `1.5px solid ${settings.header_style === opt.v ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: settings.header_style === opt.v ? 'var(--accent)' : 'var(--text)' }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Watermark */}
          <div style={{ marginTop: 16, padding: 12, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <Tog label="Show Watermark" desc="Large ghost text behind line items" k="show_watermark" settings={settings} onToggle={set} />
            {settings.show_watermark && (
              <>
                <Fld label="Watermark Text" k="watermark_text" settings={settings} onChange={set} placeholder="PROFORMA" />
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    Opacity: <span style={{ color: 'var(--accent)' }}>{settings.watermark_opacity}%</span>
                  </div>
                  <input type="range" min={2} max={20} value={settings.watermark_opacity}
                    onChange={e => set('watermark_opacity', Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Logo ─────────────────────────────────── */}
      {tab === 'logo' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Upload Logo</div>
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '22px 16px', border: '2px dashed var(--border)', borderRadius: 10,
              cursor: 'pointer', background: 'var(--surface2)',
            }}>
              {settings.logo_url ? (
                <>
                  <img src={settings.logo_url} alt="Logo" style={{ maxHeight: 60, maxWidth: 200, objectFit: 'contain' }} />
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Click to replace</div>
                </>
              ) : (
                <>
                  <svg width="32" height="32" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
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
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Logo Size: <span style={{ color: 'var(--accent)' }}>{settings.logo_width}px</span>
            </div>
            <input type="range" min={40} max={200} value={settings.logo_width}
              onChange={e => set('logo_width', Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }} />
          </div>

          {/* Position offset */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Offset · X: <span style={{ color: 'var(--accent)' }}>{settings.logo_x}px</span> · Y: <span style={{ color: 'var(--accent)' }}>{settings.logo_y}px</span>
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

          {/* Alignment (only relevant for minimal header) */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Alignment (Minimal header only)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {(['left', 'center', 'right'] as const).map(pos => (
                <button key={pos} onClick={() => set('logo_position', pos)} style={{
                  padding: '8px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: settings.logo_position === pos ? 'var(--accent)' : 'var(--surface2)',
                  color: settings.logo_position === pos ? '#fff' : 'var(--text3)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  textTransform: 'capitalize',
                }}>{pos}</button>
              ))}
            </div>
          </div>

          <button onClick={() => onChange({ ...settings, logo_x: 0, logo_y: 0, logo_width: 80, logo_position: 'left' })}
            style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
            Reset logo
          </button>
        </div>
      )}

      {/* ── Theme ─────────────────────────────────── */}
      {tab === 'theme' && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Primary (Brand Colour)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4 }} />
              <input className="form-input" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ fontFamily: 'var(--mono)', width: 110 }} />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Header, totals, bank box</span>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Accent Colour</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={settings.accent_color} onChange={e => set('accent_color', e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4 }} />
              <input className="form-input" value={settings.accent_color} onChange={e => set('accent_color', e.target.value)} style={{ fontFamily: 'var(--mono)', width: 110 }} />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Savings, acceptance block</span>
            </div>
          </div>

          {/* Preset palettes */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>SOKORA Presets</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { n: 'Heritage',  p: '#5EA8A2', a: '#5E2230' },
                { n: 'Gold Royal', p: '#5E2230', a: '#C8A96E' },
                { n: 'Modern',    p: '#1a1a1a', a: '#5EA8A2' },
                { n: 'Blush',     p: '#f7a6ad', a: '#5E2230' },
              ].map(preset => (
                <button key={preset.n} onClick={() => onChange({ ...settings, primary_color: preset.p, accent_color: preset.a })} style={{
                  padding: '10px 12px', cursor: 'pointer',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, textAlign: 'left',
                }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, background: preset.p, border: '1px solid rgba(0,0,0,.1)' }} />
                    <div style={{ width: 14, height: 14, borderRadius: 3, background: preset.a, border: '1px solid rgba(0,0,0,.1)' }} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{preset.n}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Bank ─────────────────────────────────── */}
      {tab === 'bank' && (
        <div>
          <Fld label="Bank Name"      k="bank_name"           settings={settings} onChange={set} />
          <Fld label="Account Name"   k="bank_account_name"   settings={settings} onChange={set} />
          <Fld label="Account Number" k="bank_account_number" settings={settings} onChange={set} />
          <Fld label="Branch"         k="bank_branch"         settings={settings} onChange={set} />
          <Fld label="SWIFT / BIC"    k="bank_swift"          settings={settings} onChange={set} placeholder="NMIBTZTZ" />
        </div>
      )}

      {/* ── QR & CTA ─────────────────────────────── */}
      {tab === 'qr' && (
        <div>
          <Tog label="Enable QR Code" desc="Adds a scannable QR to the acceptance block" k="qr_enabled" settings={settings} onToggle={set} />
          <Tog label="Show Acceptance Block" desc="Reserves space on the right for the QR + CTA" k="show_acceptance_block" settings={settings} onToggle={set} />

          {settings.qr_enabled && (
            <>
              <div style={{ marginTop: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>QR Destination</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    { v: 'accept',   label: 'Accept Quote', desc: 'Unique accept URL' },
                    { v: 'konnect',  label: 'Join Konnect', desc: 'Upsell to Konnect' },
                    { v: 'whatsapp', label: 'WhatsApp',     desc: 'Direct chat' },
                    { v: 'website',  label: 'Website',      desc: 'Your homepage' },
                    { v: 'custom',   label: 'Custom URL',   desc: 'Any link' },
                  ].map(opt => (
                    <button key={opt.v} onClick={() => set('qr_mode', opt.v as ProformaSettings['qr_mode'])} style={{
                      padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
                      background: settings.qr_mode === opt.v ? 'var(--accent-dim)' : 'var(--surface2)',
                      border: `1.5px solid ${settings.qr_mode === opt.v ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 6,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: settings.qr_mode === opt.v ? 'var(--accent)' : 'var(--text)' }}>{opt.label}</div>
                      <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {settings.qr_mode === 'accept'   && <Fld label="Accept URL Base"    k="accept_url_base"  settings={settings} onChange={set} placeholder="https://sokora.app/accept" />}
              {settings.qr_mode === 'konnect'  && <Fld label="Konnect URL"        k="qr_konnect_url"   settings={settings} onChange={set} placeholder="https://www.sokora.app/join" />}
              {settings.qr_mode === 'whatsapp' && <Fld label="WhatsApp Number"    k="qr_whatsapp_number" settings={settings} onChange={set} placeholder="255700000000 (no +)" />}
              {settings.qr_mode === 'custom'   && <Fld label="Custom URL"         k="qr_custom_url"    settings={settings} onChange={set} placeholder="https://..." />}

              <div style={{ marginTop: 14 }}>
                <Fld label="QR Label (big text beside QR)"        k="qr_label"            settings={settings} onChange={set} placeholder="Scan to Accept" />
                <Fld label="QR Sublabel (small text)"             k="qr_sublabel"         settings={settings} onChange={set} placeholder="Instant confirmation" />
                <Fld label="Call-to-action line"                  k="acceptance_cta_text" settings={settings} onChange={set} placeholder="Scan · Sign · Send back" />
              </div>

              {/* Live QR preview */}
              <div style={{ marginTop: 12, padding: 12, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>QR Preview</div>
                <img src={buildQrUrl(qrTarget(settings, 'PF-10-0001', 520000), 220)} alt="QR preview" style={{ width: 100, height: 100, background: '#fff', padding: 4, borderRadius: 4 }} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Labels ─────────────────────────────── */}
      {tab === 'labels' && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.6 }}>
            Edit every label on the proforma. Translate to Swahili, change terminology — make it yours.
          </div>
          <Fld label='"Quote To" section header'       k="label_quote_to"     settings={settings} onChange={set} placeholder="Quote To" />
          <Fld label='"Valid Until" label'             k="label_validity"     settings={settings} onChange={set} placeholder="Valid Until" />
          <Fld label='"Payment Terms" label'           k="label_payment_terms" settings={settings} onChange={set} placeholder="Payment Terms" />
          <Fld label='"Delivery" label'                k="label_delivery"     settings={settings} onChange={set} placeholder="Delivery" />
          <Fld label='"Prepared By" label'             k="label_prepared_by"  settings={settings} onChange={set} placeholder="Prepared By" />
          <Fld label='"Accept" section header'         k="label_accept"       settings={settings} onChange={set} placeholder="Accept This Quote" />
          <Fld label='"Notes" section header'          k="label_notes"        settings={settings} onChange={set} placeholder="Notes & Special Instructions" />
        </div>
      )}

      {/* ── Footer ─────────────────────────────── */}
      {tab === 'footer' && (
        <div>
          <Fld label="Tagline (bold bottom-left)"   k="footer_tagline"     settings={settings} onChange={set} placeholder="Kila mama ni SOKORA" />
          <Fld label="Thank-you message"            k="footer_thank_you"   settings={settings} onChange={set} placeholder="Thank you for considering SOKORA..." textarea />
          <Fld label="Website / CTA line"           k="footer_website_cta" settings={settings} onChange={set} placeholder="sokora.app · Reimagining Motherhood" />
          <Fld label="Terms & Conditions paragraph" k="terms_conditions"   settings={settings} onChange={set} placeholder="Prices valid until..." textarea />
        </div>
      )}

      {/* ── Display ─────────────────────────────── */}
      {tab === 'display' && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>Toggle sections on/off.</div>
          <Tog label="Show Logo"              desc="Display logo in header"                     k="show_logo"              settings={settings} onToggle={set} />
          <Tog label="Bank Details"           desc="Payment details block"                       k="show_bank_details"      settings={settings} onToggle={set} />
          <Tog label="Validity Date"          desc="Show 'Valid Until' in meta strip"            k="show_validity"          settings={settings} onToggle={set} />
          <Tog label="Delivery Terms"         desc="Show delivery info"                          k="show_delivery_terms"    settings={settings} onToggle={set} />
          <Tog label="Prepared By"            desc="Show salesperson"                            k="show_prepared_by"       settings={settings} onToggle={set} />
          <Tog label="VAT Breakdown"          desc="Subtotal + VAT split"                        k="show_vat_breakdown"     settings={settings} onToggle={set} />
          <Tog label="Savings Badge"          desc="Highlights total discount"                   k="show_savings_badge"     settings={settings} onToggle={set} />
          <Tog label="Confidence Bar"         desc="Trust pills (authentic / secure / etc)"      k="show_confidence_bar"    settings={settings} onToggle={set} />
          <Tog label="SKU on line items"      desc="Show product codes"                          k="show_sku"               settings={settings} onToggle={set} />
          <Tog label="T&C paragraph"          desc="Terms block above footer"                    k="show_terms"             settings={settings} onToggle={set} />
          <Tog label="Status pill in header"  desc="Shows QUOTATION / ACCEPTED / etc"            k="show_watermark_status"  settings={settings} onToggle={set} />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT — Settings page with live preview
// ═══════════════════════════════════════════════════════════════════════════
export default function ProformaTemplatePage() {
  const [settings, setSettings] = useState<ProformaSettings>(DEFAULT_PROFORMA)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'proforma_template').single()
      .then(({ data }) => {
        if (data?.value) {
          try { setSettings({ ...DEFAULT_PROFORMA, ...JSON.parse(data.value) }) } catch (e) { /* ignore */ }
        }
      })
  }, [])

  const save = async () => {
    setSaving(true)
    await supabase.from('system_settings').upsert(
      { key: 'proforma_template', value: JSON.stringify(settings) },
      { onConflict: 'key' }
    )
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const resetToDefault = () => {
    if (confirm('Reset all proforma settings to SOKORA defaults?')) {
      setSettings(DEFAULT_PROFORMA)
    }
  }

  const SAMPLE: ProformaVoucher = {
    ref: 'PF-10-0042',
    posting_date: '2026-04-18',
    valid_until: '2026-04-25',
    payment_terms: 'NET 30',
    delivery_terms: 'FOB Dar es Salaam · 3 working days',
    notes: 'Bulk order discount applied. Kit includes free midwife consultation.',
    subtotal: 440678, vat_amount: 79322, total_amount: 520000,
    posted_by: 'Joe Gembe',
    status: 'proforma',
    customers: {
      name: 'Dr. Sarah Kimani',
      company: 'Aga Khan Health Services Tanzania',
      contact_person: 'Dr. Sarah Kimani',
      whatsapp: '+255 22 211 5151',
      address: 'Ocean Road, Dar es Salaam',
      email: 'procurement@agakhan.tz',
    },
    voucher_lines: [
      { qty: 10, unit_price: 32000, discount_pct: 0, total: 320000, description: 'Nipple Cream', products: { name: 'SOKORA Nipple Cream — 60ml', sku: 'MK-003' } },
      { qty: 4,  unit_price: 65000, discount_pct: 10, total: 234000, description: 'Prenatal Kit', products: { name: 'SOKORA Prenatal Bundle — Essentials', sku: 'MK-008' } },
    ],
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Proforma Template</div>
          <div className="page-sub">Design your quotations · Live preview · QR integration · Saves to system settings</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={resetToDefault}>Reset to default</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Settings panel */}
        <div className="card" style={{ position: 'sticky', top: 0, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
          <ProformaTemplateSettings settings={settings} onChange={setSettings} />
        </div>

        {/* Live preview */}
        <div>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between' }}>
            <span>Live Preview · Sample Data</span>
            <span style={{ color: 'var(--accent)' }}>Auto-updates as you edit</span>
          </div>
          <div style={{ transform: 'scale(0.62)', transformOrigin: 'top left', width: '162%' }}>
            <SokoraProforma voucher={SAMPLE} settings={settings} />
          </div>
        </div>
      </div>
    </div>
  )
}
