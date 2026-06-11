import { useState } from 'react'
import { supabase, COMPANIES, getActiveCompany, switchCompany } from '../lib/supabase'
import type { Company } from '../lib/supabase'

interface Props {
  onLogin: () => void
  onRegister?: () => void
}

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = {
  bg:       '#f9fafb',
  white:    '#ffffff',
  border:   '#e5e7eb',
  text:     '#111827',
  textMd:   '#374151',
  textSm:   '#6b7280',
  textMute: '#9ca3af',
  indigo:   '#6366f1',
  indigoDk: '#4f46e5',
  indigoLt: '#eef2ff',
  indigoXl: '#c7d2fe',
  green:    '#059669',
  greenLt:  '#d1fae5',
  font:     "'Geist', 'Inter', -apple-system, sans-serif",
}

// ── Icon component (clean SVG line icons) ─────────────────────────────────────
function Ico({ d, s = 18, col = 'currentColor', sw = 1.75 }: { d: string; s?: number; col?: string; sw?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={col} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {d.split('|').map((seg, i) => <path key={i} d={seg} />)}
    </svg>
  )
}

// Icon path library
const I = {
  layers:   'M12 2L2 7l10 5 10-5-10-5|M2 17l10 5 10-5|M2 12l10 5 10-5',
  users:    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 3a4 4 0 0 1 0 8|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
  userOk:   'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M8.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8|M17 11l2 2 4-4',
  bar:      'M18 20V10|M12 20V4|M6 20v-6',
  box:      'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16|M3.27 6.96L12 12.01l8.73-5.05|M12 22.08V12',
  dollar:   'M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  check:    'M20 6L9 17l-5-5',
  eye:      'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8|M12 9a3 3 0 0 1 0 6 3 3 0 0 1 0-6',
  eyeOff:  'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94|M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19|M1 1l22 22',
  shield:   'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10',
  zap:      'M13 2L3 14h9l-1 8 10-12h-9l1-8',
  building: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10',
}

// ── Logo ──────────────────────────────────────────────────────────────────────
const Logo = ({ size = 32 }: { size?: number }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.25), background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(99,102,241,0.28)' }}>
      <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 40 40" fill="none">
        <path d="M10 26C10 22 13 20 17 20C21 20 23 18 23 14" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
        <path d="M17 20C21 20 24 22 27 24C30 26 30 30 27 30" stroke="rgba(255,255,255,0.6)" strokeWidth="3.5" strokeLinecap="round"/>
        <circle cx="10" cy="26" r="2.5" fill="white"/>
        <circle cx="27" cy="30" r="2.5" fill="rgba(255,255,255,0.6)"/>
        <circle cx="23" cy="14" r="2.5" fill="white"/>
      </svg>
    </div>
    <span style={{ fontSize: size * 0.53, fontWeight: 800, color: C.text, letterSpacing: '-0.4px', fontFamily: C.font }}>SOKORA</span>
  </div>
)

// ── Shared input style ────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '11px 14px',
  background: C.white, border: `1.5px solid ${C.border}`,
  borderRadius: 9, color: C.text, fontSize: 14,
  outline: 'none', fontFamily: C.font,
  transition: 'border-color .15s, box-shadow .15s',
  boxSizing: 'border-box',
}
const iFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = C.indigo
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.09)'
}
const iBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = C.border
  e.currentTarget.style.boxShadow = 'none'
}

// ── Feature rows for left panel ───────────────────────────────────────────────
const FEATURES = [
  { icon: I.layers,  label: 'Full ERP Suite',       sub: 'Accounting, inventory & purchases' },
  { icon: I.users,   label: 'CRM & Customer Loyalty', sub: 'Pipeline, loyalty rewards, WhatsApp' },
  { icon: I.userOk,  label: 'HR & Payroll',          sub: 'Staff, attendance, payslips' },
  { icon: I.bar,     label: 'Real-time Analytics',   sub: 'P&L, cash flow, 20+ reports' },
]

export default function Login({ onLogin, onRegister }: Props) {
  const [email, setEmail]   = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<Company>(getActiveCompany())

  const handleCompanySelect = (company: Company) => {
    setSelectedCompany(company)
    switchCompany(company.id)
    setError('')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    switchCompany(selectedCompany.id)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }

    const { data: userData, error: userError } = await supabase
      .from('users').select('id, is_active').eq('email', email.toLowerCase()).single()

    if (userError || !userData) {
      setError('Account not found in this workspace. Check you selected the right one.')
      await supabase.auth.signOut(); setLoading(false); return
    }
    if (!userData.is_active) {
      setError('Your account has been deactivated. Contact your administrator.')
      await supabase.auth.signOut(); setLoading(false); return
    }
    setLoading(false)
    onLogin()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: C.bg, fontFamily: C.font, overflow: 'hidden' }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .lf  { animation: fadeUp .55s ease both; }
        .lf2 { animation: fadeUp .55s ease .1s both; }
        .lf3 { animation: fadeUp .55s ease .2s both; }
        .ws-card { transition: all .15s !important; }
        .ws-card:hover { border-color: ${C.indigoXl} !important; background: ${C.indigoLt} !important; }
        .feat-row { transition: background .15s; border-radius:10px; padding: 11px 12px; }
        .feat-row:hover { background: ${C.indigoLt}; }
        input::placeholder { color: ${C.textMute}; }
        select { color: ${C.textMd}; }
        select option { color: #111; background: #fff; }
      `}</style>

      {/* ────────────────────────────────────────────────────────────
          LEFT PANEL
      ──────────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '64px 60px', background: C.white,
        borderRight: `1px solid ${C.border}`,
        position: 'relative', overflow: 'hidden',
      }}>

        {/* Line grid background */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `
            linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }} />

        {/* Radial fade — grid visible only at center */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, white 100%)',
        }} />

        {/* Top indigo glow */}
        <div style={{ position: 'absolute', top: -140, left: '50%', transform: 'translateX(-50%)', width: 700, height: 420, background: 'radial-gradient(ellipse, rgba(99,102,241,0.09) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 440 }}>

          {/* Brand mark */}
          <div style={{ marginBottom: 48 }}>
            <Logo size={34} />
          </div>

          {/* Headline */}
          <h2 style={{ fontSize: 30, fontWeight: 800, color: C.text, letterSpacing: '-0.7px', lineHeight: 1.2, margin: '0 0 10px' }}>
            Your business,<br />fully in control.
          </h2>
          <p style={{ fontSize: 15, color: C.textSm, lineHeight: 1.65, margin: '0 0 40px' }}>
            One platform for every operation — accounting, people, customers, and growth.
          </p>

          {/* Feature list with real icons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="feat-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: C.indigoLt, border: `1px solid ${C.indigoXl}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ico d={f.icon} s={16} col={C.indigo} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: C.textSm, marginTop: 3 }}>{f.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: C.border, margin: '36px 0' }} />

          {/* Trust strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex' }}>
              {['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6'].map((col, i) => (
                <div key={i} style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: col, border: '2.5px solid white',
                  marginLeft: i ? -8 : 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: 'white',
                }}>
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>500+ businesses running on SOKORA</div>
              <div style={{ fontSize: 12, color: C.textSm }}>East Africa's leading business platform</div>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────
          RIGHT PANEL — FORM
      ──────────────────────────────────────────────────────────── */}
      <div style={{
        width: 460, flexShrink: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '64px 48px', background: C.white,
        borderLeft: `1px solid ${C.border}`,
      }}>

        <div className="lf" style={{ marginBottom: 36 }}>
          <Logo size={30} />
        </div>

        <div className="lf2" style={{ marginBottom: 30 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 5px', letterSpacing: '-0.5px' }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14, color: C.textSm, margin: 0 }}>Sign in to your workspace</p>
        </div>

        <div className="lf3">
          {/* Workspace selector */}
          <div style={{ marginBottom: 22 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textMd, marginBottom: 8 }}>
              Workspace
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {COMPANIES.map(company => {
                const sel = selectedCompany.id === company.id
                return (
                  <button
                    key={company.id}
                    type="button"
                    className="ws-card"
                    onClick={() => handleCompanySelect(company)}
                    style={{
                      flex: 1, padding: '11px 14px', borderRadius: 9,
                      border: `1.5px solid ${sel ? C.indigo : C.border}`,
                      background: sel ? C.indigoLt : C.white,
                      cursor: 'pointer', textAlign: 'left', fontFamily: C.font,
                      boxShadow: sel ? '0 0 0 3px rgba(99,102,241,0.09)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: sel ? C.indigo : C.textMute, transition: 'background .15s', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: sel ? C.indigo : C.textMd }}>{company.shortName}</div>
                        <div style={{ fontSize: 11, color: C.textMute, marginTop: 1 }}>{company.hideCRM ? 'Wholesale' : 'Retail + CRM'}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin}>
            {error && (
              <div style={{ padding: '11px 14px', borderRadius: 9, marginBottom: 18, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Ico d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20|M12 8v4|M12 16h.01" s={16} col="#dc2626" />
                {error}
              </div>
            )}

            {/* Email */}
            <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textMd, marginBottom: 6 }}>Email address</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com" required autoFocus
                style={inp} onFocus={iFocus} onBlur={iBlur}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textMd, marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password" required
                  style={{ ...inp, paddingRight: 42 }} onFocus={iFocus} onBlur={iBlur}
                />
                <button
                  type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.textMute, display: 'flex', padding: 4 }}
                >
                  <Ico d={showPw ? I.eyeOff : I.eye} s={16} col={C.textMute} />
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '12px 20px',
                background: loading ? C.indigoXl : C.indigo,
                color: '#fff', border: 'none', borderRadius: 9,
                fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: C.font, transition: 'all .15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : '0 1px 3px rgba(99,102,241,0.3), 0 4px 16px rgba(99,102,241,0.2)',
                letterSpacing: '-0.1px',
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = C.indigoDk; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(99,102,241,0.35), 0 8px 24px rgba(99,102,241,0.25)' } }}
              onMouseLeave={e => { e.currentTarget.style.background = loading ? C.indigoXl : C.indigo; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = loading ? 'none' : '0 1px 3px rgba(99,102,241,0.3), 0 4px 16px rgba(99,102,241,0.2)' }}
            >
              {loading
                ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />Signing in…</>
                : `Sign in to ${selectedCompany.shortName}`
              }
            </button>
          </form>

          {onRegister && (
            <div style={{ marginTop: 22, textAlign: 'center', paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 14, color: C.textSm }}>Don't have an account? </span>
              <button onClick={onRegister} style={{ background: 'none', border: 'none', color: C.indigo, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: C.font, padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = C.indigoDk)}
                onMouseLeave={e => (e.currentTarget.style.color = C.indigo)}
              >
                Create workspace
              </button>
            </div>
          )}

          <p style={{ fontSize: 12, color: C.textMute, textAlign: 'center', marginTop: 32 }}>
            © 2026 SOKORA · Business Operating System
          </p>
        </div>
      </div>
    </div>
  )
}
