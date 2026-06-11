import { useState } from 'react'

interface Props {
  onBack: () => void
  onSuccess: () => void
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
  greenBd:  '#6ee7b7',
  font:     "'Geist', 'Inter', -apple-system, sans-serif",
}

// ── Icon component ────────────────────────────────────────────────────────────
function Ico({ d, s = 18, col = 'currentColor', sw = 1.75 }: { d: string; s?: number; col?: string; sw?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={col} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {d.split('|').map((seg, i) => <path key={i} d={seg} />)}
    </svg>
  )
}

const I = {
  layers:   'M12 2L2 7l10 5 10-5-10-5|M2 17l10 5 10-5|M2 12l10 5 10-5',
  users:    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 3a4 4 0 0 1 0 8|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
  userOk:   'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M8.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8|M17 11l2 2 4-4',
  bar:      'M18 20V10|M12 20V4|M6 20v-6',
  box:      'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16|M3.27 6.96L12 12.01l8.73-5.05|M12 22.08V12',
  dollar:   'M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  check:    'M20 6L9 17l-5-5',
  building: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10',
  shield:   'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10',
  clock:    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20|M12 6v6l4 2',
}

// ── Logo ──────────────────────────────────────────────────────────────────────
const Logo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
    <div style={{ width: 32, height: 32, borderRadius: 9, background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(99,102,241,0.28)' }}>
      <svg width="17" height="17" viewBox="0 0 40 40" fill="none">
        <path d="M10 26C10 22 13 20 17 20C21 20 23 18 23 14" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
        <path d="M17 20C21 20 24 22 27 24C30 26 30 30 27 30" stroke="rgba(255,255,255,0.6)" strokeWidth="3.5" strokeLinecap="round"/>
        <circle cx="10" cy="26" r="2.5" fill="white"/>
        <circle cx="27" cy="30" r="2.5" fill="rgba(255,255,255,0.6)"/>
        <circle cx="23" cy="14" r="2.5" fill="white"/>
      </svg>
    </div>
    <span style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: '-0.4px', fontFamily: C.font }}>SOKORA</span>
  </div>
)

// ── Input shared styles ───────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px',
  background: C.white, border: `1.5px solid ${C.border}`,
  borderRadius: 9, color: C.text, fontSize: 14,
  outline: 'none', fontFamily: C.font,
  transition: 'border-color .15s, box-shadow .15s',
  boxSizing: 'border-box',
}
const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = C.indigo
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.09)'
}
const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = C.border
  e.currentTarget.style.boxShadow = 'none'
}

// ── Module tiles for left panel ───────────────────────────────────────────────
const MODULES = [
  { icon: I.layers,  label: 'ERP',       sub: 'Core operations',   color: C.indigo },
  { icon: I.users,   label: 'CRM',       sub: 'Customer growth',   color: '#0ea5e9' },
  { icon: I.userOk,  label: 'HR',        sub: 'People management', color: C.green },
  { icon: I.bar,     label: 'Analytics', sub: 'Live reporting',    color: '#f59e0b' },
  { icon: I.box,     label: 'Inventory', sub: 'Stock control',     color: '#8b5cf6' },
  { icon: I.dollar,  label: 'Payroll',   sub: 'Auto payslips',     color: '#ef4444' },
]

const STEP_LABELS = ['Workspace', 'Admin Account', 'Choose Plan']

export default function Register({ onBack, onSuccess }: Props) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    orgName: '', orgType: '', country: 'Tanzania',
    fullName: '', email: '', password: '', confirmPassword: '', plan: 'growth',
  })
  const [errors, setErrors]     = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const validateStep = () => {
    const e: Record<string, string> = {}
    if (step === 0) {
      if (!form.orgName.trim()) e.orgName = 'Workspace name is required'
      if (!form.orgType) e.orgType = 'Please select your business type'
    }
    if (step === 1) {
      if (!form.fullName.trim()) e.fullName = 'Full name is required'
      if (!form.email.trim() || !form.email.includes('@')) e.email = 'Valid email is required'
      if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
      if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => { if (!validateStep()) return; if (step < 2) setStep(s => s + 1) }

  const handleSubmit = async () => {
    setSubmitting(true)
    await new Promise(r => setTimeout(r, 1200))
    setSubmitting(false)
    onSuccess()
  }

  const pct = Math.round(((step + 1) / STEP_LABELS.length) * 100)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: C.bg, fontFamily: C.font, overflow: 'hidden' }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .rf { animation: fadeUp .5s ease both; }
        .rf2 { animation: fadeUp .5s ease .12s both; }
        .plan-opt { transition: all .15s; }
        .plan-opt:hover { border-color: ${C.indigoXl} !important; background: ${C.indigoLt} !important; }
        input::placeholder { color: ${C.textMute}; }
        select option { color: #111; background: #fff; }
      `}</style>

      {/* ────────────────────────────────────────────────────────────
          LEFT PANEL
      ──────────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', padding: '64px 60px',
        background: C.white, borderRight: `1px solid ${C.border}`,
        position: 'relative', overflow: 'hidden',
      }}>

        {/* Line grid */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `
            linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }} />
        {/* Fade out to white at edges */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 85% 85% at 50% 50%, transparent 25%, white 100%)' }} />
        {/* Top glow */}
        <div style={{ position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)', width: 600, height: 380, background: 'radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 400, width: '100%' }}>

          {/* Step progress pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 48 }}>
            {STEP_LABELS.map((label, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEP_LABELS.length - 1 ? 1 : 'unset' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                  {/* Circle */}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: i < step ? C.greenLt : i === step ? C.indigoLt : C.bg,
                    border: `2px solid ${i < step ? C.greenBd : i === step ? C.indigo : C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .35s',
                    boxShadow: i === step ? '0 0 0 4px rgba(99,102,241,0.09)' : 'none',
                  }}>
                    {i < step
                      ? <Ico d={I.check} s={14} col={C.green} sw={2.5} />
                      : <span style={{ fontSize: 12, fontWeight: 800, color: i === step ? C.indigo : C.textMute, letterSpacing: '-0.3px' }}>{i + 1}</span>
                    }
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: i === step ? C.indigo : i < step ? C.green : C.textMute, whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </div>
                {/* Connector */}
                {i < STEP_LABELS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: i < step ? C.greenBd : C.border, margin: '0 10px', marginBottom: 22, transition: 'background .35s', borderRadius: 1 }} />
                )}
              </div>
            ))}
          </div>

          {/* Dynamic step description */}
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
              {step === 0 && 'Set up your workspace'}
              {step === 1 && 'Create your admin account'}
              {step === 2 && 'Pick the right plan'}
            </h2>
            <p style={{ fontSize: 14, color: C.textSm, margin: 0, lineHeight: 1.65 }}>
              {step === 0 && "Your workspace is your organization's private hub — all your data, your team, your modules."}
              {step === 1 && "This account will be your admin. You can invite your team after setup."}
              {step === 2 && "All plans include a 14-day free trial. No credit card needed to start."}
            </p>
          </div>

          {/* Module grid — real icons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {MODULES.map(m => (
              <div key={m.label} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '12px 12px', textAlign: 'center',
                transition: 'border-color .15s, box-shadow .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.indigoXl; e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: `${m.color}12`, border: `1px solid ${m.color}28`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 8px',
                }}>
                  <Ico d={m.icon} s={14} col={m.color} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textMd, lineHeight: 1 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: C.textMute, marginTop: 3 }}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Reassurance strip */}
          <div style={{ marginTop: 28, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { icon: I.shield, text: 'Data encrypted' },
              { icon: I.clock,  text: 'Setup in 2 min' },
              { icon: I.check,  text: 'Cancel anytime' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ico d={r.icon} s={13} col={C.green} sw={2} />
                <span style={{ fontSize: 12, color: C.textSm, fontWeight: 500 }}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────
          RIGHT PANEL — FORM
      ──────────────────────────────────────────────────────────── */}
      <div style={{
        width: 500, flexShrink: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '64px 48px', background: C.white, overflowY: 'auto',
      }}>
        <div className="rf">
          {/* Logo */}
          <div style={{ marginBottom: 30 }}><Logo /></div>

          {/* Progress bar */}
          <div style={{ height: 3, background: C.border, borderRadius: 2, marginBottom: 28, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: C.indigo, width: `${pct}%`, transition: 'width .4s ease', boxShadow: '0 0 6px rgba(99,102,241,0.4)' }} />
          </div>

          {/* Step heading */}
          <div style={{ marginBottom: 24 }} className="rf2">
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.5px' }}>
              {step === 0 && 'Create your workspace'}
              {step === 1 && 'Your admin account'}
              {step === 2 && 'Select a plan'}
            </h1>
            <p style={{ fontSize: 13, color: C.textSm, margin: 0 }}>Step {step + 1} of {STEP_LABELS.length}</p>
          </div>

          {/* ── STEP 0 — Workspace ─────────────────────────────── */}
          {step === 0 && (
            <div>
              <Field label="Workspace name" error={errors.orgName}>
                <input type="text" value={form.orgName} onChange={e => set('orgName', e.target.value)}
                  placeholder="e.g. Acme Corporation" style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} autoFocus />
              </Field>
              <Field label="Business type" error={errors.orgType}>
                <div style={{ position: 'relative' }}>
                  <select value={form.orgType} onChange={e => set('orgType', e.target.value)}
                    style={{ ...inputStyle, appearance: 'none', cursor: 'pointer', paddingRight: 36, color: form.orgType ? C.text : C.textMute }}
                    onFocus={focusStyle} onBlur={blurStyle}>
                    <option value="">Select your business type</option>
                    <option value="retail">Retail / E-commerce</option>
                    <option value="wholesale">Wholesale / Distribution</option>
                    <option value="services">Professional Services</option>
                    <option value="manufacturing">Manufacturing</option>
                    <option value="hospitality">Hospitality / F&B</option>
                    <option value="ngo">NGO / Non-profit</option>
                    <option value="other">Other</option>
                  </select>
                  <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <Ico d="M6 9l6 6 6-6" s={14} col={C.textMute} />
                  </div>
                </div>
              </Field>
              <Field label="Country">
                <div style={{ position: 'relative' }}>
                  <select value={form.country} onChange={e => set('country', e.target.value)}
                    style={{ ...inputStyle, appearance: 'none', cursor: 'pointer', paddingRight: 36 }}
                    onFocus={focusStyle} onBlur={blurStyle}>
                    {['Tanzania','Kenya','Uganda','Rwanda','Ethiopia','Nigeria','Ghana','South Africa','Other'].map(ct => (
                      <option key={ct} value={ct}>{ct}</option>
                    ))}
                  </select>
                  <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <Ico d="M6 9l6 6 6-6" s={14} col={C.textMute} />
                  </div>
                </div>
              </Field>
            </div>
          )}

          {/* ── STEP 1 — Admin Account ──────────────────────────── */}
          {step === 1 && (
            <div>
              <Field label="Full name" error={errors.fullName}>
                <input type="text" value={form.fullName} onChange={e => set('fullName', e.target.value)}
                  placeholder="Your full name" style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} autoFocus />
              </Field>
              <Field label="Work email" error={errors.email}>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="you@company.com" style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
              </Field>
              <Field label="Password" error={errors.password}>
                <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                  placeholder="At least 8 characters" style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
              </Field>
              <Field label="Confirm password" error={errors.confirmPassword}>
                <input type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
                  placeholder="Repeat your password" style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} />
              </Field>
            </div>
          )}

          {/* ── STEP 2 — Plan Selection ─────────────────────────── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { id: 'starter',    name: 'Starter',    price: '$49',   period: '/mo',  desc: 'Up to 5 users · Core ERP · Basic Reports',      popular: false },
                { id: 'growth',     name: 'Growth',     price: '$129',  period: '/mo',  desc: 'Up to 25 users · Full ERP + CRM + HRM',         popular: true  },
                { id: 'enterprise', name: 'Enterprise', price: 'Custom',period: '',     desc: 'Unlimited users · All modules · Dedicated SLA',  popular: false },
              ].map(p => {
                const sel = form.plan === p.id
                return (
                  <button key={p.id} type="button" className="plan-opt" onClick={() => set('plan', p.id)}
                    style={{
                      width: '100%', padding: '15px 18px',
                      border: `1.5px solid ${sel ? C.indigo : C.border}`,
                      background: sel ? C.indigoLt : C.white,
                      borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontFamily: C.font, position: 'relative', overflow: 'hidden',
                      boxShadow: sel ? '0 0 0 3px rgba(99,102,241,0.09)' : 'none',
                      transition: 'all .15s',
                    }}>
                    {p.popular && (
                      <div style={{ position: 'absolute', top: 0, right: 0, background: C.indigo, color: '#fff', fontSize: 10, padding: '3px 10px', borderRadius: '0 10px 0 7px', fontWeight: 700, letterSpacing: '.3px' }}>
                        POPULAR
                      </div>
                    )}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: sel ? C.indigo : C.textMute, transition: 'background .15s' }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: sel ? C.indigo : C.text }}>{p.name}</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.textSm, paddingLeft: 15 }}>{p.desc}</div>
                    </div>
                    <div style={{ flexShrink: 0, marginLeft: 16, textAlign: 'right' }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: sel ? C.indigo : C.textMd, letterSpacing: '-0.5px' }}>{p.price}</span>
                      {p.period && <span style={{ fontSize: 12, color: C.textSm }}>{p.period}</span>}
                    </div>
                  </button>
                )
              })}
              <p style={{ fontSize: 12, color: C.textMute, textAlign: 'center', marginTop: 4 }}>
                14-day free trial on all plans · No credit card required
              </p>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
            {step > 0 && (
              <button type="button" onClick={() => setStep(s => s - 1)}
                style={{ flex: 1, padding: '12px 16px', background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 9, color: C.textMd, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.indigo; e.currentTarget.style.color = C.indigo }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMd }}
              >
                ← Back
              </button>
            )}
            <button type="button" onClick={step === 2 ? handleSubmit : next} disabled={submitting}
              style={{
                flex: 2, padding: '12px 20px',
                background: submitting ? C.indigoXl : C.indigo,
                color: '#fff', border: 'none', borderRadius: 9,
                fontSize: 14, fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: C.font, transition: 'all .15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: submitting ? 'none' : '0 1px 3px rgba(99,102,241,0.3), 0 4px 16px rgba(99,102,241,0.2)',
                letterSpacing: '-0.1px',
              }}
              onMouseEnter={e => { if (!submitting) { e.currentTarget.style.background = C.indigoDk; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(99,102,241,0.35), 0 8px 24px rgba(99,102,241,0.25)' } }}
              onMouseLeave={e => { e.currentTarget.style.background = submitting ? C.indigoXl : C.indigo; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = submitting ? 'none' : '0 1px 3px rgba(99,102,241,0.3), 0 4px 16px rgba(99,102,241,0.2)' }}
            >
              {submitting
                ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />Creating workspace…</>
                : step === 2 ? 'Launch my workspace →' : 'Continue →'
              }
            </button>
          </div>

          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <span style={{ fontSize: 14, color: C.textSm }}>Already have an account? </span>
            <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.indigo, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: C.font, padding: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = C.indigoDk)}
              onMouseLeave={e => (e.currentTarget.style.color = C.indigo)}
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const C_font = "'Geist', 'Inter', -apple-system, sans-serif"
  return (
    <div style={{ marginBottom: 15 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, fontFamily: C_font }}>
        {label}
      </label>
      {children}
      {error && (
        <div style={{ fontSize: 12, color: '#dc2626', marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, fontFamily: C_font }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          {error}
        </div>
      )}
    </div>
  )
}
