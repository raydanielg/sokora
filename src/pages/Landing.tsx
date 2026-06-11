import { useEffect, useState } from 'react'

interface Props {
  onGetStarted: () => void
  onSignIn: () => void
}

// ── Color palette (clean white + indigo) ────────────────────────────────────
const C = {
  bg:       '#ffffff',
  bgAlt:    '#f8fafc',
  bgAlt2:   '#f1f5f9',
  border:   '#e2e8f0',
  borderMd: '#cbd5e1',
  text:     '#0f172a',
  textMd:   '#334155',
  textSm:   '#64748b',
  textMute: '#94a3b8',
  indigo:   '#6366f1',
  indigoDk: '#4f46e5',
  indigoLt: '#e0e7ff',
  indigoXl: '#c7d2fe',
  green:    '#10b981',
  greenLt:  '#d1fae5',
}

// ── Shared styles ────────────────────────────────────────────────────────────
const btn = (variant: 'primary' | 'outline' | 'ghost', size: 'sm' | 'md' | 'lg' = 'md'): React.CSSProperties => {
  const sizes = { sm: { padding: '7px 16px', fontSize: 13 }, md: { padding: '10px 22px', fontSize: 14 }, lg: { padding: '13px 28px', fontSize: 15 } }
  const base: React.CSSProperties = { ...sizes[size], fontWeight: 600, borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, letterSpacing: '-0.1px', transition: 'all .15s', border: '1.5px solid transparent', fontFamily: 'inherit', whiteSpace: 'nowrap' }
  if (variant === 'primary')  return { ...base, background: C.indigo, color: '#fff', border: `1.5px solid ${C.indigo}` }
  if (variant === 'outline')  return { ...base, background: 'transparent', color: C.text, border: `1.5px solid ${C.borderMd}` }
  return { ...base, background: 'transparent', color: C.textSm, border: '1.5px solid transparent' }
}

// ── SVG Icons (Next.js style — simple, clean) ────────────────────────────────
const Icon = ({ n, s = 20, c = 'currentColor', w = 1.8 }: { n: string; s?: number; c?: string; w?: number }) => {
  const p: Record<string, string> = {
    layers:    'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    users:     'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    bar:       'M18 20V10M12 20V4M6 20v-6',
    check:     'M20 6L9 17l-5-5',
    shield:    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    zap:       'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    globe:     'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
    cpu:       'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18',
    database:  'M12 2a10 3 0 1 0 0 6 10 3 0 0 0 0-6z M2 5v6c0 1.66 4.48 3 10 3s10-1.34 10-3V5 M2 11v6c0 1.66 4.48 3 10 3s10-1.34 10-3v-6',
    approval:  'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    arrow:     'M5 12h14 M12 5l7 7-7 7',
    x:         'M18 6L6 18 M6 6l12 12',
    chevron:   'M9 18l6-6-6-6',
    sparkle:   'M12 2L9.5 8.5 3 9l5 5-1.5 6.5L12 17l5.5 3.5L15.5 14l5-5-6.5-1L12 2z',
    building:  'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
    trend:     'M22 7L13.5 15.5 8.5 10.5 1 18 M16 7h6v6',
    lock:      'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4',
    whatsapp:  'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  }
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {(p[n] || '').split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : 'M' + seg} />
      ))}
    </svg>
  )
}

// ── 3D Floating object components ─────────────────────────────────────────────
function FloatCube({ size = 56, style, delay = 0 }: { size?: number; style?: React.CSSProperties; delay?: number }) {
  return (
    <div style={{
      width: size, height: size,
      position: 'absolute',
      background: `linear-gradient(135deg, ${C.indigoLt}, ${C.indigoXl})`,
      border: `1.5px solid ${C.indigoXl}`,
      borderRadius: size * 0.22,
      boxShadow: `0 ${size * 0.14}px ${size * 0.5}px rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.6)`,
      backdropFilter: 'blur(8px)',
      animation: `floatCube ${7 + delay}s ease-in-out ${delay}s infinite`,
      transform: 'perspective(600px) rotateX(20deg) rotateY(-15deg)',
      ...style,
    }} />
  )
}

function FloatRing({ size = 80, style, delay = 0 }: { size?: number; style?: React.CSSProperties; delay?: number }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: '50%',
      border: `2px solid ${C.indigoXl}`,
      position: 'absolute',
      animation: `spinRing ${10 + delay}s linear ${delay}s infinite`,
      boxShadow: `0 0 ${size * 0.25}px rgba(99,102,241,0.08)`,
      ...style,
    }} />
  )
}

function FloatDot({ size = 10, style, delay = 0 }: { size?: number; style?: React.CSSProperties; delay?: number }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: '50%',
      background: `radial-gradient(circle, ${C.indigo}, ${C.indigoDk})`,
      position: 'absolute',
      boxShadow: `0 0 ${size * 1.6}px rgba(99,102,241,0.35)`,
      animation: `floatDot ${6 + delay}s ease-in-out ${delay}s infinite`,
      ...style,
    }} />
  )
}


// ── Features data ────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: 'layers',  title: 'Full ERP Suite',        desc: 'Accounting, Inventory, Purchases and Sales all in one platform. No more spreadsheets or disconnected apps.' },
  { icon: 'users',   title: 'CRM & Sales Engine',     desc: 'Customer pipeline, loyalty rewards, WhatsApp automation, and smart follow-up campaigns.' },
  { icon: 'bar',     title: 'Real-time Analytics',    desc: 'P&L, Balance Sheet, Cash Flow, and 20+ reports. One-click PDF and Excel export.' },
  { icon: 'cpu',     title: 'HR Management',          desc: 'Payroll, attendance tracking, leave management, KPI scorecards, and recruitment.' },
  { icon: 'approval','title': 'Approval Workflows',   desc: 'Multi-level approvals for purchases, expenses, and stock transfers with full audit trails.' },
  { icon: 'lock',    title: 'Role-Based Access',      desc: 'Granular permissions down to every action. Each user sees only what they need to.' },
]

const STEPS = [
  { n: '01', title: 'Create your workspace', desc: 'Set up your organization in under 2 minutes. Add your company details, choose your plan.' },
  { n: '02', title: 'Invite your team',       desc: 'Add team members and assign roles. Finance, operations, HR — each person gets the right access.' },
  { n: '03', title: 'Start running',          desc: 'Your data, your reports, your workflows — live from day one. No setup complexity.' },
]

const STATS = [
  { value: '40+',   label: 'Modules & Features' },
  { value: '99.9%', label: 'Platform Uptime' },
  { value: '< 2m',  label: 'Setup Time' },
  { value: '24/7',  label: 'Data Availability' },
]

const PLANS = [
  {
    name: 'Starter', price: '$49', period: '/mo',
    desc: 'For small teams getting started',
    features: ['Up to 5 users', 'ERP Core', 'Inventory', 'Basic Reports', 'Email Support'],
    highlight: false,
  },
  {
    name: 'Growth', price: '$129', period: '/mo',
    desc: 'For growing businesses',
    features: ['Up to 25 users', 'Everything in Starter', 'CRM & HRM', 'Advanced Reports', 'WhatsApp Integration', 'Priority Support'],
    highlight: true,
  },
  {
    name: 'Enterprise', price: 'Custom', period: '',
    desc: 'For large organizations',
    features: ['Unlimited users', 'Everything in Growth', 'Custom Integrations', 'Dedicated Manager', 'SLA & Uptime Guarantee', 'On-premise option'],
    highlight: false,
  },
]

// ── Main component ────────────────────────────────────────────────────────────
export default function Landing({ onGetStarted, onSignIn }: Props) {
  const [announcementVisible, setAnnouncementVisible] = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const [activeFeature, setActiveFeature] = useState<number | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Geist', -apple-system, sans-serif", overflowX: 'hidden' }}>

      {/* ── CSS Animations ── */}
      <style>{`
        @keyframes floatCube {
          0%, 100% { transform: perspective(600px) rotateX(20deg) rotateY(-15deg) translateY(0px); }
          50%       { transform: perspective(600px) rotateX(28deg) rotateY(-8deg)  translateY(-18px); }
        }
        @keyframes spinRing {
          from { transform: rotate(0deg) scale(1); }
          50%  { transform: rotate(180deg) scale(1.04); }
          to   { transform: rotate(360deg) scale(1); }
        }
        @keyframes floatDot {
          0%, 100% { transform: translateY(0) scale(1); }
          50%       { transform: translateY(-14px) scale(1.15); }
        }
        @keyframes gradMove {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%       { transform: translate(40px, -30px) scale(1.05); }
          66%       { transform: translate(-20px, 20px) scale(0.97); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .hero-fade { animation: fadeUp .7s ease both; }
        .hero-fade-2 { animation: fadeUp .7s ease .15s both; }
        .hero-fade-3 { animation: fadeUp .7s ease .3s both; }
        .nav-link { color: ${C.textSm}; text-decoration: none; font-size: 14px; font-weight: 500; transition: color .12s; cursor: pointer; }
        .nav-link:hover { color: ${C.text}; }
        .feat-card { transition: all .2s; border-radius: 14px; cursor: default; }
        .feat-card:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(99,102,241,.1); border-color: ${C.indigoXl} !important; }
        .plan-card { transition: all .2s; }
        .plan-card:hover { transform: translateY(-4px); }
        .step-num { font-size: 13px; font-weight: 800; color: ${C.indigo}; font-family: 'Geist Mono', monospace; letter-spacing: -.5px; }
        .scroll-indicator { display: flex; flex-direction: column, align-items: center; gap: 4px; cursor: pointer; animation: fadeUp 1s ease .8s both; }
        .scroll-indicator:hover .scroll-arrow { transform: translateY(3px); }
        .scroll-arrow { transition: transform .2s; }
        .toast-enter { animation: slideDown .4s ease; }
        .mobile-menu-overlay { animation: slideInRight .3s ease; }
        .hamburger-btn { display: none; }
        .mobile-menu-panel { display: none; }
        .mobile-menu-panel.open { display: flex !important; }
        @media (max-width: 768px) {
          .feat-grid  { grid-template-columns: 1fr !important; }
          .plan-grid  { grid-template-columns: 1fr !important; }
          .stats-grid { grid-template-columns: 1fr 1fr !important; }
          .nav-links-desktop { display: none !important; }
          .nav-links-mobile { display: none !important; }
          .hamburger-btn { display: flex !important; }
          .hero-headline { font-size: 42px !important; letter-spacing: -1.5px !important; }
          .hero-subheadline { font-size: 16px !important; }
          .dashboard-mockup { display: none !important; }
          .footer-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .trusted-by-scroll { overflow-x: auto !important; flex-wrap: nowrap !important; padding-bottom: 8px !important; }
          .trusted-by-scroll::-webkit-scrollbar { height: 4px; }
          .trusted-by-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
          .responsive-header { padding: 0 20px !important; }
          .hero-section { padding: 60px 20px 0 !important; }
          .section-padding { padding: 60px 20px !important; }
          .cta-buttons { flex-direction: column !important; width: 100% !important; }
          .cta-buttons button { width: 100% !important; }
          .announcement-bar { padding: 12px 16px !important; flex-wrap: wrap !important; }
          .announcement-text { font-size: 12px !important; flex: 1 !important; }
          .announcement-cta { display: none !important; }
        }
        @media (max-width: 480px) {
          .hero-headline { font-size: 32px !important; letter-spacing: -1px !important; }
          .hero-subheadline { font-size: 14px !important; }
          .stats-grid { grid-template-columns: 1fr !important; }
          .responsive-header { padding: 0 16px !important; }
          .hero-section { padding: 40px 16px 0 !important; }
          .section-padding { padding: 40px 16px !important; }
          .announcement-bar { padding: 10px 12px !important; }
          .announcement-text { font-size: 11px !important; }
        }
      `}</style>

      {/* ──────────────────────────────────────────────────────────────
          ANNOUNCEMENT BAR (Lovable-style notification)
      ────────────────────────────────────────────────────────────── */}
      {announcementVisible && (
        <div className="toast-enter announcement-bar" style={{
          background: C.indigo,
          color: '#fff',
          padding: '9px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          fontSize: 13,
          fontWeight: 500,
          position: 'relative',
        }}>
          <span style={{ fontSize: 15 }}>✨</span>
          <span className="announcement-text">Introducing <strong>SOKORA 2.0</strong> — Multi-tenant SaaS platform for East African businesses</span>
          <span className="announcement-cta" style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.18)', borderRadius: 5, fontSize: 12, fontWeight: 700, letterSpacing: '.2px', cursor: 'pointer' }} onClick={onGetStarted}>
            Get started free →
          </span>
          <button
            onClick={() => setAnnouncementVisible(false)}
            style={{ position: 'absolute', right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', padding: 4, borderRadius: 4 }}
          >
            <Icon n="x" s={14} c="rgba(255,255,255,0.8)" />
          </button>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────
          NAVIGATION
      ────────────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: scrolled ? 'rgba(255,255,255,0.92)' : C.bg,
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: `1px solid ${scrolled ? C.border : 'transparent'}`,
        transition: 'all .2s',
        padding: '0 40px',
      }} className="responsive-header">
        <div style={{ maxWidth: 1200, margin: '0 auto', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
            <img src="/icons/icons8-logo-50 (1).png" alt="SOKORA Logo" style={{ width: 32, height: 32, borderRadius: 8, boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }} />
            <span style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: '-0.4px' }}>SOKORA</span>
          </div>

          {/* Nav links - desktop */}
          <nav className="nav-links-desktop" style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            <span className="nav-link">Product</span>
            <span className="nav-link">Features</span>
            <span className="nav-link">Pricing</span>
            <span className="nav-link">Docs</span>
          </nav>

          {/* Nav links - mobile (hidden by default) */}
          <nav className="nav-links-mobile" style={{ display: 'none', gap: 16, alignItems: 'center' }}>
            <span className="nav-link" style={{ fontSize: 13 }}>Product</span>
            <span className="nav-link" style={{ fontSize: 13 }}>Features</span>
            <span className="nav-link" style={{ fontSize: 13 }}>Pricing</span>
          </nav>

          {/* Hamburger button - mobile only */}
          <button
            className="hamburger-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              display: 'none',
              flexDirection: 'column',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 4,
            }}
          >
            <span style={{ width: 20, height: 2, background: C.text, borderRadius: 1, transition: 'all .2s' }} />
            <span style={{ width: 20, height: 2, background: C.text, borderRadius: 1, transition: 'all .2s' }} />
            <span style={{ width: 20, height: 2, background: C.text, borderRadius: 1, transition: 'all .2s' }} />
          </button>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={btn('ghost', 'sm')} onClick={onSignIn}
              onMouseEnter={e => e.currentTarget.style.color = C.text}
              onMouseLeave={e => e.currentTarget.style.color = C.textSm}
            >
              Sign in
            </button>
            <button style={btn('primary', 'sm')} onClick={onGetStarted}
              onMouseEnter={e => { e.currentTarget.style.background = C.indigoDk; e.currentTarget.style.borderColor = C.indigoDk }}
              onMouseLeave={e => { e.currentTarget.style.background = C.indigo; e.currentTarget.style.borderColor = C.indigo }}
            >
              Get started free
            </button>
          </div>
        </div>
      </header>

      {/* ──────────────────────────────────────────────────────────────
          MOBILE MENU PANEL
      ────────────────────────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <>
          <div
            className="mobile-menu-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 200,
            }}
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            className={`mobile-menu-panel mobile-menu-overlay ${mobileMenuOpen ? 'open' : ''}`}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: '280px',
              height: '100%',
              background: C.bg,
              zIndex: 201,
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
              flexDirection: 'column',
              padding: '24px 20px',
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              style={{
                alignSelf: 'flex-end',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 8,
                borderRadius: 4,
                marginBottom: 24,
              }}
            >
              <Icon n="x" s={20} c={C.text} />
            </button>

            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
              <img src="/icons/icons8-logo-50 (1).png" alt="SOKORA Logo" style={{ width: 32, height: 32, borderRadius: 8 }} />
              <span style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: '-0.4px' }}>SOKORA</span>
            </div>

            {/* Navigation links */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
              {['Product', 'Features', 'Pricing', 'Docs'].map(link => (
                <span
                  key={link}
                  className="nav-link"
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: C.text,
                    padding: '12px 16px',
                    borderRadius: 8,
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgAlt }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link}
                </span>
              ))}
            </nav>

            {/* CTA buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 'auto' }}>
              <button
                style={btn('outline', 'md')}
                onClick={() => { setMobileMenuOpen(false); onSignIn() }}
              >
                Sign in
              </button>
              <button
                style={btn('primary', 'md')}
                onClick={() => { setMobileMenuOpen(false); onGetStarted() }}
              >
                Get started free
              </button>
            </div>
          </div>
        </>
      )}

      {/* ──────────────────────────────────────────────────────────────
          HERO SECTION
      ────────────────────────────────────────────────────────────── */}
      <section className="hero-section" style={{ position: 'relative', overflow: 'hidden', padding: '80px 40px 0', background: C.bg }}>

        {/* Dot grid background */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `radial-gradient(circle, ${C.borderMd} 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
          opacity: 0.45,
          maskImage: 'radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 100%)',
        }} />

        {/* Soft indigo glow at center-top */}
        <div style={{ position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)', width: 900, height: 500, background: 'radial-gradient(ellipse, rgba(99,102,241,0.10) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Centered headline block */}
        <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>

          {/* Badge */}
          <div className="hero-fade" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: C.indigoLt, border: `1px solid ${C.indigoXl}`, borderRadius: 20, marginBottom: 26 }}>
            <Icon n="sparkle" s={12} c={C.indigo} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.indigo, letterSpacing: '.4px' }}>Business Operating System · East Africa</span>
          </div>

          {/* Main headline */}
          <h1 className="hero-fade-2 hero-headline" style={{ fontSize: 70, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-2.5px', color: C.text, margin: '0 0 22px' }}>
            Run your entire business
            <br />
            from{' '}
            <span style={{
              background: `linear-gradient(135deg, ${C.indigo} 0%, #818cf8 50%, #a5b4fc 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              one platform
            </span>
          </h1>

          {/* Sub-headline */}
          <p className="hero-fade-3 hero-subheadline" style={{ fontSize: 19, color: C.textSm, lineHeight: 1.65, margin: '0 auto 38px', maxWidth: 560 }}>
            SOKORA unifies accounting, inventory, HR, and CRM for modern East African businesses — real-time, multi-tenant, and ready in minutes.
          </p>

          {/* CTA buttons */}
          <div className="hero-fade-3 cta-buttons" style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              style={{ ...btn('primary', 'lg'), boxShadow: '0 4px 24px rgba(99,102,241,0.35)', paddingLeft: 28, paddingRight: 28 }}
              onClick={onGetStarted}
              onMouseEnter={e => { e.currentTarget.style.background = C.indigoDk; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(99,102,241,0.45)' }}
              onMouseLeave={e => { e.currentTarget.style.background = C.indigo; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(99,102,241,0.35)' }}
            >
              Start for free
              <Icon n="arrow" s={16} c="#fff" />
            </button>
            <button
              style={{ ...btn('outline', 'lg'), paddingLeft: 24, paddingRight: 24 }}
              onClick={onSignIn}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgAlt; e.currentTarget.style.borderColor = C.indigo; e.currentTarget.style.color = C.indigo }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = C.borderMd; e.currentTarget.style.color = C.text }}
            >
              Sign in to workspace
            </button>
          </div>

          {/* Social proof row */}
          <div className="hero-fade-3" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 28 }}>
            <div style={{ display: 'flex' }}>
              {['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6'].map((col, i) => (
                <div key={i} style={{ width: 26, height: 26, borderRadius: '50%', background: col, border: '2px solid white', marginLeft: i ? -7 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'white' }}>
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <span style={{ fontSize: 13, color: C.textSm, fontWeight: 500 }}>
              <strong style={{ color: C.text }}>500+</strong> businesses already running on SOKORA
            </span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.borderMd, display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: C.textSm }}>No credit card required</span>
          </div>
        </div>

        {/* ── Wide perspective dashboard mockup ────────────────────── */}
        <div className="hero-fade-3 dashboard-mockup" style={{ maxWidth: 1140, margin: '52px auto 0', position: 'relative', zIndex: 1 }}>

          {/* Glow beneath the mockup */}
          <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', width: '70%', height: 120, background: `radial-gradient(ellipse, rgba(99,102,241,0.18) 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />

          {/* Browser frame — perspective tilt (modern SaaS style) */}
          <div style={{
            transform: 'perspective(1800px) rotateX(5deg)',
            transformOrigin: '50% 100%',
            borderRadius: '16px 16px 0 0',
            border: `1px solid ${C.border}`,
            borderBottom: 'none',
            boxShadow: '0 -4px 0 rgba(99,102,241,0.08), 0 32px 100px rgba(15,23,42,0.14), 0 8px 24px rgba(15,23,42,0.07)',
            overflow: 'hidden',
            background: '#fff',
            position: 'relative',
            zIndex: 1,
          }}>

            {/* Browser chrome */}
            <div style={{ background: C.bgAlt, borderBottom: `1px solid ${C.border}`, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {['#ef4444','#f59e0b','#10b981'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
              </div>
              {/* Tab strip */}
              <div style={{ display: 'flex', gap: 2 }}>
                {['Dashboard', 'Sales', 'Inventory', 'Reports'].map((tab, i) => (
                  <div key={tab} style={{ padding: '4px 12px', borderRadius: '6px 6px 0 0', background: i === 0 ? '#fff' : 'transparent', border: i === 0 ? `1px solid ${C.border}` : '1px solid transparent', borderBottom: i === 0 ? '1px solid #fff' : '1px solid transparent', fontSize: 11, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? C.text : C.textMute, marginBottom: i === 0 ? -1 : 0, cursor: 'default' }}>
                    {tab}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, height: 22, background: C.bgAlt2, borderRadius: 5, display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 6, maxWidth: 280, marginLeft: 'auto' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green }} />
                <span style={{ fontSize: 10, color: C.textMute }}>app.sokora.io/dashboard</span>
              </div>
            </div>

            {/* App shell */}
            <div style={{ display: 'flex', height: 400 }}>

              {/* Sidebar mockup */}
              <div style={{ width: 180, background: C.bgAlt, borderRight: `1px solid ${C.border}`, padding: '14px 0', flexShrink: 0 }}>
                <div style={{ padding: '0 12px 12px', borderBottom: `1px solid ${C.border}`, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: C.indigo }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Acme Ltd</div>
                      <div style={{ fontSize: 9, color: C.textMute }}>LIVE · FY 2025-26</div>
                    </div>
                  </div>
                </div>
                {[
                  { label: 'Dashboard',  active: true },
                  { label: 'Sales',      active: false },
                  { label: 'Purchases',  active: false },
                  { label: 'Inventory',  active: false },
                  { label: 'Accounting', active: false },
                  { label: 'HR & Payroll', active: false },
                  { label: 'CRM',        active: false },
                  { label: 'Reports',    active: false },
                ].map(item => (
                  <div key={item.label} style={{ padding: '7px 14px', fontSize: 11, fontWeight: item.active ? 700 : 400, color: item.active ? C.indigo : C.textSm, background: item.active ? C.indigoLt : 'transparent', borderLeft: `2px solid ${item.active ? C.indigo : 'transparent'}`, cursor: 'default' }}>
                    {item.label}
                  </div>
                ))}
              </div>

              {/* Main content */}
              <div style={{ flex: 1, padding: '16px 20px', background: C.bg, overflowY: 'hidden' }}>

                {/* Topbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.text, letterSpacing: '-0.3px' }}>Dashboard</div>
                    <div style={{ fontSize: 10, color: C.textMute }}>Acme Ltd · June 2026</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ padding: '4px 9px', background: C.indigoLt, border: `1px solid ${C.indigoXl}`, borderRadius: 5, fontSize: 10, color: C.indigo, fontWeight: 700 }}>FY 2025-26</div>
                    <div style={{ padding: '4px 9px', background: C.greenLt, border: '1px solid #a7f3d0', borderRadius: 5, fontSize: 10, color: C.green, fontWeight: 700 }}>● LIVE</div>
                  </div>
                </div>

                {/* KPI cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: 'Revenue',    val: 'TZS 48.2M', delta: '+12.4%', good: true,  color: '#5EA8A2' },
                    { label: 'Net Profit', val: 'TZS 9.1M',  delta: '+8.7%',  good: true,  color: C.indigo },
                    { label: 'Customers',  val: '1,247',     delta: '+34',     good: true,  color: '#f59e0b' },
                    { label: 'Cash',       val: 'TZS 12.4M', delta: 'Healthy', good: true,  color: C.green },
                  ].map((m, i) => (
                    <div key={i} style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderTop: `2px solid ${m.color}`, borderRadius: 8, padding: '9px 11px' }}>
                      <div style={{ fontSize: 9, color: C.textMute, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.4px' }}>{m.val}</div>
                      <div style={{ fontSize: 9, color: m.good ? C.green : '#ef4444', fontWeight: 700, marginTop: 2 }}>{m.good ? '↑' : '↓'} {m.delta}</div>
                    </div>
                  ))}
                </div>

                {/* Chart + tables row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 8 }}>
                  {/* Chart */}
                  <div style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: '11px 13px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.text, marginBottom: 10 }}>Monthly Revenue · Jan–Jun 2026</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 68 }}>
                      {[42,58,51,71,65,100].map((h, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: '100%', height: `${h}%`, borderRadius: '3px 3px 0 0', background: i === 5 ? C.indigo : `${C.indigo}30` }} />
                          <div style={{ fontSize: 8, color: C.textMute }}>
                            {['J','F','M','A','M','J'][i]}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Recent */}
                  <div style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: '11px 13px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.text, marginBottom: 8 }}>Recent Transactions</div>
                    {[
                      { ref: 'CS-2240', type: 'Cash Sale',  amt: '480K' },
                      { ref: 'SI-1093', type: 'Invoice',    amt: '1.2M' },
                      { ref: 'PO-0341', type: 'Purchase',   amt: '720K' },
                      { ref: 'CR-0088', type: 'Receipt',    amt: '950K' },
                    ].map((v, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < 3 ? `1px solid ${C.border}` : 'none', fontSize: 10 }}>
                        <div>
                          <span style={{ fontWeight: 600, color: C.text, fontFamily: 'monospace' }}>{v.ref}</span>
                          <span style={{ color: C.textMute, marginLeft: 5 }}>{v.type}</span>
                        </div>
                        <span style={{ color: '#5EA8A2', fontWeight: 700, fontFamily: 'monospace' }}>TZS {v.amt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          TRUSTED BY STRIP
      ────────────────────────────────────────────────────────────── */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: '18px 40px' }}>
        <div className="trusted-by-scroll" style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: C.textMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.8px', flexShrink: 0 }}>Trusted by</span>
          <div style={{ flex: 1, height: 1, background: C.border }} />
          {['Retailers', 'Distributors', 'Manufacturers', 'Service Firms', 'Import/Export'].map(name => (
            <div key={name} style={{ padding: '5px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, color: C.textSm, whiteSpace: 'nowrap' }}>
              {name}
            </div>
          ))}
          <div style={{ flex: 1, height: 1, background: C.border }} />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          FEATURES
      ────────────────────────────────────────────────────────────── */}
      <section className="section-padding" style={{ padding: '90px 40px', background: C.bg, position: 'relative', overflow: 'hidden' }}>
        {/* 3D bg objects */}
        <FloatCube size={64} style={{ top: '5%', right: '2%', opacity: 0.4 }} delay={2} />
        <FloatRing size={200} style={{ bottom: '-60px', right: '-40px', opacity: 0.15 }} delay={0} />
        <FloatDot size={10} style={{ top: '30%', left: '2%', opacity: 0.3 }} delay={1} />
        <FloatDot size={6} style={{ bottom: '20%', right: '4%', opacity: 0.25 }} delay={3} />

        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {/* Section header */}
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: C.indigoLt, border: `1px solid ${C.indigoXl}`, borderRadius: 20, marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.indigo, textTransform: 'uppercase', letterSpacing: '.8px' }}>Everything You Need</span>
            </div>
            <h2 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-1px', color: C.text, margin: '0 0 14px' }}>
              One platform. Every workflow.
            </h2>
            <p style={{ fontSize: 17, color: C.textSm, maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
              Replace 6 different tools with SOKORA. Everything connected, everything real-time.
            </p>
          </div>

          {/* 6-card grid */}
          <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="feat-card"
                onMouseEnter={() => setActiveFeature(i)}
                onMouseLeave={() => setActiveFeature(null)}
                style={{
                  background: activeFeature === i ? C.indigoLt : C.bg,
                  border: `1.5px solid ${activeFeature === i ? C.indigoXl : C.border}`,
                  borderRadius: 14,
                  padding: '24px 22px',
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: activeFeature === i ? C.indigo : C.indigoLt, border: `1px solid ${C.indigoXl}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, transition: 'all .2s' }}>
                  <Icon n={f.icon} s={18} c={activeFeature === i ? '#fff' : C.indigo} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, letterSpacing: '-0.2px' }}>{f.title}</div>
                <div style={{ fontSize: 14, color: C.textSm, lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          HOW IT WORKS
      ────────────────────────────────────────────────────────────── */}
      <section className="section-padding" style={{ padding: '90px 40px', background: C.bgAlt, borderTop: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
        {/* 3D bg objects */}
        <FloatCube size={44} style={{ top: '10%', left: '2%', opacity: 0.5 }} delay={1} />
        <FloatDot size={14} style={{ bottom: '15%', left: '6%', opacity: 0.4 }} delay={0} />
        <FloatRing size={120} style={{ top: '5%', right: '3%', opacity: 0.2 }} delay={2} />

        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: C.greenLt, border: '1px solid #a7f3d0', borderRadius: 20, marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '.8px' }}>Simple Onboarding</span>
            </div>
            <h2 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-1px', color: C.text, margin: '0 0 14px' }}>Up and running in minutes</h2>
            <p style={{ fontSize: 17, color: C.textSm, lineHeight: 1.6 }}>No complex setup. No technical team needed. Just create and start.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {STEPS.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 28, position: 'relative' }}>
                {/* Left: number + connector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 48, flexShrink: 0 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: C.bg,
                    border: `2px solid ${C.indigo}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 0 4px rgba(99,102,241,0.08)',
                    flexShrink: 0,
                  }}>
                    <span className="step-num">{step.n}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ width: 2, flex: 1, background: `linear-gradient(to bottom, ${C.indigoXl}, transparent)`, margin: '6px 0', minHeight: 40 }} />
                  )}
                </div>

                {/* Right: content */}
                <div style={{ paddingBottom: i < STEPS.length - 1 ? 40 : 0, paddingTop: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-0.3px', marginBottom: 8 }}>{step.title}</div>
                  <div style={{ fontSize: 15, color: C.textSm, lineHeight: 1.65, maxWidth: 480 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          STATS — dark indigo strip
      ────────────────────────────────────────────────────────────── */}
      <section className="section-padding" style={{ padding: '70px 40px', background: C.indigo, position: 'relative', overflow: 'hidden' }}>
        {/* Subtle bg geometry */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -80, right: '10%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
          <div style={{ position: 'absolute', bottom: -60, left: '5%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
        </div>

        <div className="stats-grid" style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44, fontWeight: 900, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 8, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          PRICING
      ────────────────────────────────────────────────────────────── */}
      <section className="section-padding" style={{ padding: '90px 40px', background: C.bg, position: 'relative', overflow: 'hidden' }}>
        {/* 3D bg objects */}
        <FloatCube size={70} style={{ top: '5%', left: '1%', opacity: 0.35 }} delay={0} />
        <FloatCube size={40} style={{ bottom: '10%', right: '3%', opacity: 0.4 }} delay={2} />
        <FloatRing size={160} style={{ top: '-40px', right: '-40px', opacity: 0.15 }} delay={1} />
        <FloatDot size={8} style={{ top: '40%', right: '7%', opacity: 0.3 }} delay={2} />

        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: C.indigoLt, border: `1px solid ${C.indigoXl}`, borderRadius: 20, marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.indigo, textTransform: 'uppercase', letterSpacing: '.8px' }}>Simple Pricing</span>
            </div>
            <h2 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-1px', color: C.text, margin: '0 0 14px' }}>Choose your plan</h2>
            <p style={{ fontSize: 17, color: C.textSm, lineHeight: 1.6 }}>Start free. Upgrade as you grow. Cancel anytime.</p>
          </div>

          <div className="plan-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {PLANS.map((plan, i) => (
              <div
                key={i}
                className="plan-card"
                style={{
                  background: plan.highlight ? C.indigo : C.bg,
                  border: `1.5px solid ${plan.highlight ? C.indigo : C.border}`,
                  borderRadius: 16,
                  padding: '28px 24px',
                  position: 'relative',
                  boxShadow: plan.highlight ? '0 8px 40px rgba(99,102,241,0.25)' : '0 2px 8px rgba(15,23,42,0.04)',
                }}
              >
                {plan.highlight && (
                  <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: C.indigoDk, color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 12px', borderRadius: 20, letterSpacing: '.5px', whiteSpace: 'nowrap' }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: plan.highlight ? 'rgba(255,255,255,0.7)' : C.textSm, textTransform: 'uppercase', letterSpacing: '.6px' }}>{plan.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, margin: '10px 0 4px' }}>
                  <span style={{ fontSize: 40, fontWeight: 900, color: plan.highlight ? '#fff' : C.text, letterSpacing: '-1.5px' }}>{plan.price}</span>
                  {plan.period && <span style={{ fontSize: 14, color: plan.highlight ? 'rgba(255,255,255,0.6)' : C.textSm }}>{plan.period}</span>}
                </div>
                <div style={{ fontSize: 13, color: plan.highlight ? 'rgba(255,255,255,0.65)' : C.textSm, marginBottom: 20 }}>{plan.desc}</div>

                <button
                  style={{
                    ...btn(plan.highlight ? 'outline' : 'primary', 'md'),
                    width: '100%',
                    justifyContent: 'center',
                    background: plan.highlight ? 'rgba(255,255,255,0.15)' : C.indigo,
                    color: '#fff',
                    borderColor: plan.highlight ? 'rgba(255,255,255,0.3)' : C.indigo,
                    marginBottom: 22,
                  }}
                  onClick={onGetStarted}
                  onMouseEnter={e => { e.currentTarget.style.background = plan.highlight ? 'rgba(255,255,255,0.22)' : C.indigoDk }}
                  onMouseLeave={e => { e.currentTarget.style.background = plan.highlight ? 'rgba(255,255,255,0.15)' : C.indigo }}
                >
                  {plan.name === 'Enterprise' ? 'Contact us' : 'Get started'}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {plan.features.map((feat, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: plan.highlight ? 'rgba(255,255,255,0.15)' : C.indigoLt, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon n="check" s={10} c={plan.highlight ? '#fff' : C.indigo} w={2.5} />
                      </div>
                      <span style={{ fontSize: 13, color: plan.highlight ? 'rgba(255,255,255,0.85)' : C.textMd }}>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: C.textMute }}>
            All plans include 14-day free trial · No credit card required · Cancel anytime
          </p>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          CTA SECTION
      ────────────────────────────────────────────────────────────── */}
      <section className="section-padding" style={{ padding: '90px 40px', background: C.bgAlt, borderTop: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
        {/* 3D bg objects */}
        <FloatCube size={80} style={{ top: '10%', left: '3%', opacity: 0.4 }} delay={0} />
        <FloatCube size={44} style={{ bottom: '10%', right: '5%', opacity: 0.5 }} delay={3} />
        <FloatRing size={180} style={{ top: '-60px', right: '-60px', opacity: 0.18 }} delay={1} />
        <FloatDot size={16} style={{ top: '30%', right: '8%', opacity: 0.35 }} delay={2} />
        <FloatDot size={8} style={{ bottom: '25%', left: '5%', opacity: 0.3 }} delay={1} />

        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 6px 24px rgba(99,102,241,0.3)' }}>
            <Icon n="zap" s={26} c="#fff" />
          </div>
          <h2 style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-1.2px', color: C.text, margin: '0 0 16px', lineHeight: 1.1 }}>
            Start running your business smarter
          </h2>
          <p style={{ fontSize: 17, color: C.textSm, lineHeight: 1.65, margin: '0 0 36px' }}>
            Join 500+ East African businesses on SOKORA. Setup takes less than 2 minutes.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              style={{ ...btn('primary', 'lg'), boxShadow: '0 4px 20px rgba(99,102,241,0.3)', paddingLeft: 32, paddingRight: 32 }}
              onClick={onGetStarted}
              onMouseEnter={e => { e.currentTarget.style.background = C.indigoDk; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(99,102,241,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.background = C.indigo; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.3)' }}
            >
              Create free workspace
              <Icon n="arrow" s={17} c="#fff" />
            </button>
            <button
              style={btn('outline', 'lg')}
              onClick={onSignIn}
              onMouseEnter={e => { e.currentTarget.style.background = C.bg; e.currentTarget.style.borderColor = C.indigo; e.currentTarget.style.color = C.indigo }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = C.borderMd; e.currentTarget.style.color = C.text }}
            >
              Sign in
            </button>
          </div>

          {/* Feature chips */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
            {['Free 14-day trial', 'No credit card', 'Cancel anytime', 'Instant setup', 'Real support'].map(feat => (
              <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, fontSize: 12, color: C.textSm, fontWeight: 500 }}>
                <Icon n="check" s={11} c={C.green} w={2.5} />
                {feat}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          FOOTER
      ────────────────────────────────────────────────────────────── */}
      <footer style={{ background: C.text, color: 'rgba(255,255,255,0.6)', padding: '48px 40px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40, marginBottom: 40 }}>
            {/* Brand */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <img src="/icons/icons8-logo.svg" alt="SOKORA Logo" style={{ width: 30, height: 30, borderRadius: 7 }} />
                <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>SOKORA</span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 260 }}>Business Operating System for East African companies. Accounting, Inventory, HR, and CRM — all in one.</p>
              <div style={{ marginTop: 16, fontSize: 12 }}>
                <a href="mailto:support@sokora.app" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>support@sokora.app</a>
              </div>
            </div>

            {/* Links */}
            {[
              { title: 'Product', links: ['Features', 'Pricing', 'Changelog', 'Roadmap'] },
              { title: 'Company', links: ['About', 'Blog', 'Careers', 'Contact'] },
              { title: 'Legal', links: ['Privacy Policy', 'Terms of Service', 'Security', 'Cookie Policy'] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 14 }}>{col.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {col.links.map(link => (
                    <span key={link} style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', cursor: 'pointer', transition: 'color .12s' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                      onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}
                    >{link}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 12 }}>© {new Date().getFullYear()} SOKORA. All rights reserved.</span>
            <div style={{ display: 'flex', gap: 16 }}>
              {['Privacy', 'Terms', 'Cookies'].map(l => (
                <span key={l} style={{ fontSize: 12, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', transition: 'color .12s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                >{l}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
