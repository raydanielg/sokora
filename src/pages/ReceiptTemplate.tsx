import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ReceiptSettings {
  // Identity
  company_name: string; tagline: string; address: string
  phone: string; email: string; website: string; instagram: string
  tin: string; vrn: string
  // Colours
  primary_color: string; accent_color: string
  // Logo
  logo_url: string; logo_width: number; logo_x: number; logo_y: number; show_logo: boolean
  // Labels
  label_receipt: string; label_billed_to: string; label_items: string
  label_crown_points: string; label_midwife_tip: string; label_konnect: string
  label_cashier: string; label_total_paid: string
  // Messages
  footer_message: string; msg_pregnant: string; msg_postpartum: string; msg_general: string
  konnect_cta_text: string; konnect_sub_text: string
  // Links
  konnect_url: string; community_url: string; community_name: string
  // Toggles
  show_crown_points: boolean; show_cashier: boolean
  show_care_tip: boolean; show_stage_message: boolean; konnect_enabled: boolean
  konnect_utm_tracking: boolean; community_enabled: boolean; community_qr_enabled: boolean
}

export interface ReceiptVoucher {
  ref: string; posting_date: string; description: string
  total_amount: number; subtotal: number
  payment_method: string; notes: string; posted_by: string
  customers: { name: string; whatsapp: string; pregnancy_stage: string; crown_points: number } | null
  voucher_lines: { qty: number; unit_price: number; subtotal?: number; total: number; products: { name: string; sku: string; category: string } | null }[]
}

const DEFAULT: ReceiptSettings = {
  company_name: 'Your Organization', tagline: 'Reimagining Motherhood',
  address: 'Dar es Salaam, Tanzania', phone: '+255 700 000 000',
  email: 'hello@sokora.app', website: 'www.sokora.app', instagram: '@sokora_tz',
  tin: '—', vrn: '—',
  primary_color: '#85c2be', accent_color: '#f7a6ad',
  logo_url: '', logo_width: 60, logo_x: 0, logo_y: 0, show_logo: true,
  label_receipt: 'Receipt', label_billed_to: 'Billed To',
  label_items: 'Items Purchased', label_crown_points: 'Crown Points',
  label_midwife_tip: 'Midwife Tip', label_konnect: 'Join SOKORA Konnect',
  label_cashier: 'Served by', label_total_paid: 'Total Paid',
  footer_message: 'Share your SOKORA moment — tag us on Instagram',
  msg_pregnant: 'You are doing something extraordinary. Every choice you make matters, Mama.',
  msg_postpartum: 'The hardest work is invisible. We see you, and we are with you.',
  msg_general: 'Motherhood deserves better. That is why we exist.',
  konnect_cta_text: 'Join Konnect →', konnect_sub_text: 'Weekly guidance · Expert Q&A · Birth prep · Postpartum support',
  konnect_url: 'https://www.sokora.app/join',
  community_url: '', community_name: 'Mama Community',
  show_crown_points: true, show_cashier: true,
  show_care_tip: true, show_stage_message: true, konnect_enabled: true,
  konnect_utm_tracking: true, community_enabled: false, community_qr_enabled: false,
}

const CARE_TIPS: Record<string, string> = {
  Feeding: 'Hold your baby skin-to-skin for the first hour after birth to support natural breastfeeding.',
  Postpartum: 'Wear your belly binder 8–12 hours daily for best results. Start from day 3 postpartum.',
  Comfort: 'Use your pregnancy pillow in a C-shape — one end between your knees, one supporting your belly.',
  Supplements: 'Take your prenatal supplement with food to reduce nausea. Consistency matters most.',
  Skincare: 'Apply twice daily — morning after shower and evening before bed — for best results.',
  default: 'Questions about your purchase? WhatsApp our midwife team anytime. We are here for you.',
}

// ── Receipt Component ─────────────────────────────────────────────────────────
export function SokoraReceipt({ voucher, settings }: { voucher: ReceiptVoucher; settings: ReceiptSettings }) {
  const s = settings
  const p = s.primary_color
  const a = s.accent_color
  const cust = voucher.customers
  const stage = (cust?.pregnancy_stage || '').toLowerCase()
  const crownEarned = Math.round((voucher.total_amount || 0) / 1000)
  const crownTotal = (cust?.crown_points || 0) + crownEarned

  const stageMsg = stage.includes('pregnant') || stage.includes('wks') || stage.includes('week')
    ? s.msg_pregnant
    : stage.includes('postpartum') || stage.includes('post')
    ? s.msg_postpartum
    : s.msg_general

  const mainCat = voucher.voucher_lines?.[0]?.products?.category || 'default'
  const careTip = CARE_TIPS[mainCat] || CARE_TIPS.default
  const konnectHref = s.konnect_utm_tracking
    ? `${s.konnect_url}?ref=${voucher.ref}&utm_source=receipt&utm_medium=pdf`
    : s.konnect_url

  const mono = "'DM Mono', 'Courier New', monospace"
  const display = "'Syne', 'Georgia', serif"
  const body = "'Instrument Sans', 'Helvetica Neue', sans-serif"

  return (
    <div style={{ width: 400, background: '#fdfcfb', fontFamily: body, color: '#1a1a1a', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.14)' }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg, ${p} 0%, ${p}cc 60%, ${a}88 100%)`, padding: '22px 22px 18px', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -24, right: -24, width: 110, height: 110, borderRadius: '50%', background: `${a}25`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -28, left: 50, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,.08)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          {/* Logo + Company */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {s.show_logo && s.logo_url && (
              <img src={s.logo_url} alt="Logo"
                style={{ width: s.logo_width, height: 'auto', objectFit: 'contain',
                  marginLeft: s.logo_x, marginTop: s.logo_y, flexShrink: 0 }} />
            )}
            <div>
              <div style={{ fontFamily: display, fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.1 }}>{s.company_name}</div>
              <div style={{ fontSize: 10, color: a, fontStyle: 'italic', marginTop: 3, fontWeight: 600 }}>{s.tagline}</div>
            </div>
          </div>
          {/* Receipt label */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: mono, fontSize: 8, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 }}>{s.label_receipt}</div>
            <div style={{ fontFamily: display, fontSize: 16, fontWeight: 800, color: '#fff' }}>{voucher.ref}</div>
          </div>
        </div>

        {/* Date + payment strip */}
        <div style={{ marginTop: 14, background: 'rgba(255,255,255,.14)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: 'rgba(255,255,255,.85)' }}>{voucher.posting_date}</div>
          <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,.15)', padding: '2px 10px', borderRadius: 20 }}>
            {voucher.payment_method}
          </div>
        </div>
      </div>

      {/* ── STAGE MESSAGE ───────────────────────────────────────────────────── */}
      {s.show_stage_message && (
        <div style={{ background: `${a}15`, borderLeft: `3px solid ${a}`, padding: '10px 18px' }}>
          <div style={{ fontSize: 12, color: '#5a3838', fontStyle: 'italic', lineHeight: 1.6 }}>{stageMsg}</div>
        </div>
      )}

      {/* ── CUSTOMER ────────────────────────────────────────────────────────── */}
      {cust && (
        <div style={{ padding: '12px 20px', borderBottom: '1px dashed #ede8e8' }}>
          <div style={{ fontSize: 9, color: '#bbb', fontFamily: mono, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>{s.label_billed_to}</div>
          <div style={{ fontFamily: display, fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{cust.name}</div>
          <div style={{ fontSize: 11, color: '#999', fontFamily: mono, marginTop: 2 }}>{cust.whatsapp}{cust.pregnancy_stage ? ` · ${cust.pregnancy_stage}` : ''}</div>
        </div>
      )}

      {/* ── LINE ITEMS ───────────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 20px' }}>
        <div style={{ fontSize: 9, color: '#bbb', fontFamily: mono, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{s.label_items}</div>
        {(voucher.voucher_lines || []).map((line, i) => {
          // Discount detection: if subtotal (gross) is provided and exceeds
          // total (net), the line had a per-line discount. Show the savings
          // so the customer can see the gesture.
          const gross = Number(line.subtotal ?? (line.qty * (line.unit_price || 0)))
          const net = Number(line.total || 0)
          const hasDiscount = gross > net + 0.5  // ½-shilling tolerance for rounding
          const pct = gross > 0 ? Math.round(((gross - net) / gross) * 100) : 0
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #f5f0f0' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{line.products?.name || '—'}</div>
                <div style={{ fontSize: 10, color: '#bbb', fontFamily: mono, marginTop: 2 }}>
                  {line.products?.sku ? `${line.products.sku} · ` : ''}{line.qty} × {(line.unit_price || 0).toLocaleString()}
                </div>
                {hasDiscount && (
                  <div style={{ fontSize: 10, color: p, fontFamily: mono, marginTop: 2, fontWeight: 600 }}>
                    Less {pct}% discount (saved {Math.round(gross - net).toLocaleString()})
                  </div>
                )}
              </div>
              <div style={{ paddingLeft: 12, textAlign: 'right' }}>
                {hasDiscount && (
                  <div style={{ fontFamily: mono, fontSize: 11, color: '#bbb', textDecoration: 'line-through' }}>
                    {Math.round(gross).toLocaleString()}
                  </div>
                )}
                <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700 }}>{net.toLocaleString()}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── TOTALS ───────────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 20px 14px' }}>
        {/* Total — the hero number */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, padding: '12px 14px', background: `${p}14`, borderRadius: 10, border: `1.5px solid ${p}35` }}>
          <div>
            <div style={{ fontSize: 10, color: '#888' }}>{s.label_total_paid}</div>
            <div style={{ fontSize: 10, color: '#bbb', fontFamily: mono }}>{voucher.payment_method}</div>
          </div>
          <div style={{ fontFamily: display, fontSize: 24, fontWeight: 800, color: '#1a1a1a' }}>
            TZS {(voucher.total_amount || 0).toLocaleString()}
          </div>
        </div>
        {s.show_cashier && voucher.posted_by && (
          <div style={{ fontSize: 10, color: '#ccc', fontFamily: mono, marginTop: 6, textAlign: 'right' }}>{s.label_cashier}: {voucher.posted_by}</div>
        )}
      </div>

      {/* ── CROWN POINTS ─────────────────────────────────────────────────────── */}
      {s.show_crown_points && (
        <div style={{ margin: '0 20px 14px', background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 9, color: '#666', fontFamily: mono, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{s.label_crown_points}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: display, fontSize: 22, fontWeight: 800, color: a }}>+{crownEarned}</span>
                <span style={{ fontSize: 10, color: '#777' }}>earned this purchase</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: '#666', fontFamily: mono, marginBottom: 4 }}>Total Balance</div>
              <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: '#fff' }}>{crownTotal.toLocaleString()}</div>
              <div style={{ fontSize: 9, color: '#555', fontFamily: mono }}>pts</div>
            </div>
          </div>
        </div>
      )}

      {/* ── CARE TIP ─────────────────────────────────────────────────────────── */}
      {s.show_care_tip && (
        <div style={{ margin: '0 20px 14px', background: `${p}10`, border: `1px solid ${p}28`, borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 9, color: p, fontFamily: mono, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5, fontWeight: 700 }}>{s.label_midwife_tip}</div>
          <div style={{ fontSize: 11, color: '#5a6a6a', lineHeight: 1.6 }}>{careTip}</div>
        </div>
      )}

      {/* Divider */}
      <div style={{ margin: '0 20px', borderTop: '1px dashed #ede8e8' }} />

      {/* ── KONNECT CTA ──────────────────────────────────────────────────────── */}
      {s.konnect_enabled && (
        <div style={{ padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#ccc', fontFamily: mono, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Your Personal Midwife, On Demand</div>
          <div style={{ fontFamily: display, fontSize: 15, fontWeight: 800, color: '#1a1a1a', marginBottom: 4 }}>{s.label_konnect}</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 14, lineHeight: 1.6 }}>{s.konnect_sub_text}</div>
          <a href={konnectHref} style={{ display: 'inline-block', background: a, color: '#fff', padding: '10px 28px', borderRadius: 50, fontSize: 12, fontWeight: 700, textDecoration: 'none', letterSpacing: 0.3 }}>
            {s.konnect_cta_text}
          </a>
          <div style={{ fontSize: 9, color: '#ddd', fontFamily: mono, marginTop: 8 }}>{s.konnect_url}</div>
        </div>
      )}

      {/* ── COMMUNITY ────────────────────────────────────────────────────────── */}
      {s.community_enabled && s.community_url && (
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ background: `${p}10`, border: `1px solid ${p}25`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 9, color: p, fontFamily: mono, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: 700 }}>{s.community_name}</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Join the Community</div>
            <div style={{ fontSize: 10, color: '#888', lineHeight: 1.4, marginBottom: 6 }}>Connect with mothers at every stage of the journey</div>
            <a href={s.community_url} style={{ fontSize: 10, color: p, fontFamily: mono }}>{s.community_url}</a>
          </div>
        </div>
      )}

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <div style={{ background: '#1a1a1a', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10, color: '#555', fontFamily: mono }}>{s.instagram} · {s.website}</div>
          <div style={{ fontSize: 10, color: '#444', fontStyle: 'italic', marginTop: 2 }}>{s.footer_message}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#444', fontFamily: mono }}>TIN: {s.tin}</div>
          <div style={{ fontSize: 9, color: '#444', fontFamily: mono }}>VRN: {s.vrn}</div>
        </div>
      </div>
    </div>
  )
}

// ── Settings Components ───────────────────────────────────────────────────────
const Fld = ({ label, k, s, set, placeholder, textarea }: {
  label: string; k: keyof ReceiptSettings; s: ReceiptSettings
  set: (k: keyof ReceiptSettings, v: string) => void; placeholder?: string; textarea?: boolean
}) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
    {textarea
      ? <textarea className="form-input" value={String(s[k] || '')} rows={2} style={{ resize: 'none', fontSize: 12 }} placeholder={placeholder} onChange={e => set(k, e.target.value)} />
      : <input className="form-input" value={String(s[k] || '')} placeholder={placeholder} onChange={e => set(k, e.target.value)} />
    }
  </div>
)

const Tog = ({ label, desc, k, s, set }: {
  label: string; desc: string; k: keyof ReceiptSettings
  s: ReceiptSettings; set: (k: keyof ReceiptSettings, v: boolean) => void
}) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{desc}</div>
    </div>
    <button onClick={() => set(k, !s[k])} style={{
      width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', flexShrink: 0, marginLeft: 12,
      background: s[k] ? 'var(--accent)' : 'var(--surface3)', transition: 'background .2s', position: 'relative',
    }}>
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: s[k] ? 21 : 3, transition: 'left .2s' }} />
    </button>
  </div>
)

// ── Receipt Template Settings Panel ──────────────────────────────────────────
export function ReceiptTemplateSettings({ settings, onChange }: { settings: ReceiptSettings; onChange: (s: ReceiptSettings) => void }) {
  const setS = (k: keyof ReceiptSettings, v: string | boolean | number) => onChange({ ...settings, [k]: v })
  const setStr = (k: keyof ReceiptSettings, v: string) => setS(k, v)
  const setBool = (k: keyof ReceiptSettings, v: boolean) => setS(k, v)
  const [tab, setTab] = useState<'identity'|'labels'|'messages'|'display'|'logo'|'konnect'>('identity')
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

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

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => onChange({ ...settings, logo_url: ev.target?.result as string, show_logo: true })
    reader.readAsDataURL(file)
  }

  const tabs = [
    { id: 'identity', label: 'Identity' }, { id: 'labels', label: 'Labels' },
    { id: 'messages', label: 'Messages' }, { id: 'display', label: 'Display' },
    { id: 'logo', label: 'Logo' }, { id: 'konnect', label: 'Konnect' },
  ] as const

  return (
    <div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 14, background: 'var(--surface2)', padding: 3, borderRadius: 8, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '5px 11px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
            borderRadius: 6, background: tab === t.id ? 'var(--accent)' : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--text3)',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'identity' && (
        <div>
          <Fld label="Company Name" k="company_name" s={settings} set={setStr} />
          <Fld label="Tagline" k="tagline" s={settings} set={setStr} />
          <Fld label="Address" k="address" s={settings} set={setStr} />
          <Fld label="Phone" k="phone" s={settings} set={setStr} />
          <Fld label="Email" k="email" s={settings} set={setStr} />
          <Fld label="Website" k="website" s={settings} set={setStr} />
          <Fld label="Instagram" k="instagram" s={settings} set={setStr} placeholder="@handle" />
          <Fld label="TIN" k="tin" s={settings} set={setStr} />
          <Fld label="VRN" k="vrn" s={settings} set={setStr} />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Colours</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Primary (Teal)</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={settings.primary_color} onChange={e => setS('primary_color', e.target.value)} style={{ width: 36, height: 32, border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4 }} />
                  <input className="form-input" value={settings.primary_color} onChange={e => setS('primary_color', e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 11 }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Accent (Blush)</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={settings.accent_color} onChange={e => setS('accent_color', e.target.value)} style={{ width: 36, height: 32, border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4 }} />
                  <input className="form-input" value={settings.accent_color} onChange={e => setS('accent_color', e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 11 }} />
                </div>
              </div>
            </div>
          </div>
          <Fld label="Footer Message" k="footer_message" s={settings} set={setStr} textarea />
        </div>
      )}

      {tab === 'labels' && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.6 }}>Edit every label that appears on the receipt. Translate to Swahili or customise freely.</div>
          <Fld label='"Receipt" heading' k="label_receipt" s={settings} set={setStr} placeholder="Receipt" />
          <Fld label='"Billed To" header' k="label_billed_to" s={settings} set={setStr} placeholder="Billed To" />
          <Fld label='"Items Purchased" header' k="label_items" s={settings} set={setStr} placeholder="Items Purchased" />
          <Fld label='"Total Paid" label' k="label_total_paid" s={settings} set={setStr} placeholder="Total Paid" />
          <Fld label='"Crown Points" header' k="label_crown_points" s={settings} set={setStr} placeholder="Crown Points" />
          <Fld label='"Midwife Tip" header' k="label_midwife_tip" s={settings} set={setStr} placeholder="Midwife Tip" />
          <Fld label='"Join Konnect" heading' k="label_konnect" s={settings} set={setStr} placeholder="Join SOKORA Konnect" />
          <Fld label='"Served by" prefix' k="label_cashier" s={settings} set={setStr} placeholder="Served by" />
        </div>
      )}

      {tab === 'messages' && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.6 }}>These emotional messages appear below the header, personalised by the customer's pregnancy stage.</div>
          <Fld label="Pregnant Customers" k="msg_pregnant" s={settings} set={setStr} textarea placeholder="Message for pregnant mamas..." />
          <Fld label="Postpartum Customers" k="msg_postpartum" s={settings} set={setStr} textarea placeholder="Message for postpartum mamas..." />
          <Fld label="General / Other" k="msg_general" s={settings} set={setStr} textarea placeholder="General message..." />
        </div>
      )}

      {tab === 'display' && (
        <div>
          <Tog label="Show Logo" desc="Display logo in receipt header" k="show_logo" s={settings} set={setBool} />
          <Tog label="Stage Message" desc="Emotional message personalised by pregnancy stage" k="show_stage_message" s={settings} set={setBool} />
          <Tog label="Crown Points" desc="Show loyalty points earned and balance" k="show_crown_points" s={settings} set={setBool} />
          <Tog label="Midwife Tip" desc="Product care tip relevant to purchase category" k="show_care_tip" s={settings} set={setBool} />
          <Tog label="Cashier Name" desc="Show name of who served the customer" k="show_cashier" s={settings} set={setBool} />
          <Tog label="Konnect CTA" desc="Show Join SOKORA Konnect section" k="konnect_enabled" s={settings} set={setBool} />
          <Tog label="Community Section" desc="Show Mama Community link" k="community_enabled" s={settings} set={setBool} />
        </div>
      )}

      {tab === 'logo' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Upload Logo</div>
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '20px 16px', border: '2px dashed var(--border)', borderRadius: 10,
              cursor: 'pointer', background: 'var(--surface2)',
            }}>
              {settings.logo_url ? (
                <>
                  <img src={settings.logo_url} alt="Logo preview" style={{ maxHeight: 60, maxWidth: 180, objectFit: 'contain' }} />
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Click to replace</div>
                </>
              ) : (
                <>
                  <svg width="28" height="28" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Click to upload logo</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>PNG, JPG, SVG · transparent bg recommended</div>
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
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Size: <span style={{ color: 'var(--accent)' }}>{settings.logo_width}px</span>
            </div>
            <input type="range" min={30} max={150} value={settings.logo_width} onChange={e => setS('logo_width', Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Offset · X: <span style={{ color: 'var(--accent)' }}>{settings.logo_x}px</span> · Y: <span style={{ color: 'var(--accent)' }}>{settings.logo_y}px</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Horizontal (X)</div>
                <input type="range" min={-50} max={50} value={settings.logo_x} onChange={e => setS('logo_x', Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Vertical (Y)</div>
                <input type="range" min={-20} max={40} value={settings.logo_y} onChange={e => setS('logo_y', Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
              </div>
            </div>
          </div>
          {settings.logo_url && (
            <div style={{ padding: '10px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 8, fontSize: 11, color: 'var(--accent)', marginBottom: 10 }}>
              You can also drag the logo directly on the live preview.
            </div>
          )}
          <button onClick={() => onChange({ ...settings, logo_x: 0, logo_y: 0, logo_width: 60 })}
            style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
            Reset position & size
          </button>
        </div>
      )}

      {tab === 'konnect' && (
        <div>
          <Tog label="Enable Konnect CTA" desc="Show Join SOKORA Konnect on receipts" k="konnect_enabled" s={settings} set={setBool} />
          <Tog label="UTM Tracking" desc="Add campaign tracking to Konnect link" k="konnect_utm_tracking" s={settings} set={setBool} />
          <Tog label="Community Section" desc="Show Mama Community link when ready" k="community_enabled" s={settings} set={setBool} />
          <div style={{ marginTop: 12 }}>
            <Fld label="Konnect URL" k="konnect_url" s={settings} set={setStr} placeholder="https://www.sokora.app/join" />
            <Fld label="Konnect CTA Button Text" k="konnect_cta_text" s={settings} set={setStr} placeholder="Join Konnect →" />
            <Fld label="Konnect Sub-text" k="konnect_sub_text" s={settings} set={setStr} textarea placeholder="Weekly guidance · Expert Q&A · Birth prep..." />
            <Fld label="Community Name" k="community_name" s={settings} set={setStr} placeholder="Mama Community" />
            <Fld label="Community URL" k="community_url" s={settings} set={setStr} placeholder="https://community.sokora.app" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Default Export: Receipt Template Page ─────────────────────────────────────
export default function ReceiptTemplatePage() {
  const [settings, setSettings] = useState<ReceiptSettings>(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0, scale: 1 })

  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'receipt_template').single()
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
    const scale = rect ? rect.width / 400 : 0.85
    isDragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, ox: settings.logo_x, oy: settings.logo_y, scale }
    e.preventDefault(); e.stopPropagation()
  }

  const save = async () => {
    setSaving(true)
    await supabase.from('system_settings').upsert({ key: 'receipt_template', value: JSON.stringify(settings) }, { onConflict: 'key' })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const printPreview = () => {
    const el = document.getElementById('sokora-receipt-preview')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt Preview</title>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@500;600&display=swap" rel="stylesheet">
      <style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;justify-content:center;padding:40px;background:#f0f0f0}@media print{body{background:#fff;padding:0}}</style>
    </head><body>${el.outerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  const SAMPLE: ReceiptVoucher = {
    ref: 'CS-10-0042', posting_date: new Date().toISOString().split('T')[0],
    description: 'Cash Sale — Fatuma Said', total_amount: 185000, subtotal: 185000,
    payment_method: 'M-Pesa', notes: '', posted_by: 'Barbra Kabendera',
    customers: { name: 'Fatuma Said', whatsapp: '+255 743 100 212', pregnancy_stage: '28 weeks Pregnant', crown_points: 1240 },
    voucher_lines: [
      { qty: 1, unit_price: 120000, total: 120000, products: { name: 'U-Shape Pregnancy Pillow', sku: 'MK-003', category: 'Comfort' } },
      { qty: 2, unit_price: 32500, total: 65000, products: { name: 'Nipple Cream — 60ml', sku: 'MK-007', category: 'Feeding' } },
    ],
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Receipt Template</div>
          <div className="page-sub">Branded cash sale receipt · Warm, consumer-facing · Mama identity</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={printPreview}>Print Preview</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Settings panel */}
        <div className="card" style={{ position: 'sticky', top: 0 }}>
          <ReceiptTemplateSettings settings={settings} onChange={setSettings} />
        </div>

        {/* Live preview */}
        <div>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between' }}>
            <span>Live Preview</span>
            {settings.logo_url && <span style={{ color: 'var(--accent)' }}>Drag logo to reposition</span>}
          </div>
          <div ref={previewRef} style={{ display: 'inline-block', userSelect: 'none' }}>
            <div style={{ position: 'relative' }}>
              <div id="sokora-receipt-preview">
                <SokoraReceipt voucher={SAMPLE} settings={settings} />
              </div>
              {/* Logo drag overlay */}
              {settings.show_logo && settings.logo_url && (
                <div onMouseDown={startLogoDrag} style={{
                  position: 'absolute',
                  top: 22 + settings.logo_y,
                  left: 22 + settings.logo_x,
                  width: settings.logo_width,
                  height: 60,
                  cursor: 'grab', zIndex: 10,
                  border: '2px dashed rgba(133,194,190,.7)',
                  borderRadius: 4,
                  background: 'rgba(133,194,190,.05)',
                }} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
