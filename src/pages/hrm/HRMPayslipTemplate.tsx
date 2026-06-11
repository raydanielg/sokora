// ════════════════════════════════════════════════════════════════════════════
// HRMPayslipTemplate.tsx
//
// Settings page for tuning the payslip PDF look-and-feel:
//   • Logo URL + width + position + padding
//   • Accent + secondary colour pickers
//   • Header tagline + footer tagline + footer fine print
//   • Section toggles (employer costs, advance detail, YTD, signature, notes)
//
// Right side shows a live preview that mirrors the actual PDF layout
// closely enough to catch problems before generating real payslips.
// Saves to system_settings under key 'payslip_template' (no migration).
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import {
  loadPayslipTemplate, savePayslipTemplate,
  DEFAULT_PAYSLIP_TEMPLATE, hexToRgb,
  type PayslipTemplate,
} from '../../lib/payslipTemplate'
import { getActiveCompany } from '../../lib/supabase'
import Toast from '../../components/Toast'
import type { HRMProps } from './hrmTypes'

export default function HRMPayslipTemplate({ onNav: _onNav }: HRMProps) {
  const [template, setTemplate] = useState<PayslipTemplate>(DEFAULT_PAYSLIP_TEMPLATE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [logoOk, setLogoOk] = useState<boolean | null>(null)
  const company = getActiveCompany()

  useEffect(() => { (async () => {
    setTemplate(await loadPayslipTemplate())
    setLoading(false)
  })() }, [])

  // Probe logo URL whenever it changes — helpful UI feedback if the user
  // pastes a URL that won't load.
  useEffect(() => {
    if (!template.logoUrl) { setLogoOk(null); return }
    const img = new Image()
    img.onload = () => setLogoOk(true)
    img.onerror = () => setLogoOk(false)
    img.src = template.logoUrl
  }, [template.logoUrl])

  const set = useCallback(<K extends keyof PayslipTemplate>(k: K, v: PayslipTemplate[K]) => {
    setTemplate(prev => ({ ...prev, [k]: v }))
  }, [])

  const save = async () => {
    setSaving(true)
    const r = await savePayslipTemplate(template)
    setSaving(false)
    if (r.error) { setToast(r.error); setToastType('error'); return }
    setToast('Template saved'); setToastType('success')
  }

  const resetDefaults = () => {
    if (!confirm('Reset to SOKORA defaults? This wipes all your customisations.')) return
    setTemplate(DEFAULT_PAYSLIP_TEMPLATE)
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Payslip Template</div>
          <div className="page-sub">Logo, colors, footer, and section toggles for the payslip PDF</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={resetDefaults}>Reset Defaults</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 360px)', gap: 18 }}>
        {/* ─── LEFT: form ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Brand colors */}
          <Card title="Brand Colors">
            <Row>
              <Field label="Accent (headers, totals, net-pay bar)">
                <ColorInput value={template.accentColor} onChange={v => set('accentColor', v)} />
              </Field>
              <Field label="Secondary (taglines, soft accents)">
                <ColorInput value={template.secondaryColor} onChange={v => set('secondaryColor', v)} />
              </Field>
            </Row>
            <Hint>
              Default is SOKORA teal + violet. Stick close to your brand for recognition. Use the swatches below for inspiration.
            </Hint>
            <SwatchRow
              swatches={[
                { name: 'SOKORA Teal', value: '#0F766E' },
                { name: 'SOKORA Violet', value: '#7C3AED' },
                { name: 'Maternity Pink', value: '#DB2777' },
                { name: 'Trust Blue', value: '#2563EB' },
                { name: 'Forest', value: '#15803D' },
                { name: 'Charcoal', value: '#1F2937' },
              ]}
              onPick={v => set('accentColor', v)}
            />
          </Card>

          {/* Logo */}
          <Card title="Logo">
            <Field label="Logo URL (PNG/JPG, hosted with CORS allowed)">
              <input
                className="form-input"
                placeholder="https://yourdomain.com/logo.png"
                value={template.logoUrl}
                onChange={e => set('logoUrl', e.target.value)}
              />
              {template.logoUrl && (
                <div style={{ marginTop: 6, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {logoOk === true && <span style={{ color: '#22c55e' }}>● Logo loads OK</span>}
                  {logoOk === false && <span style={{ color: '#ef4444' }}>● Could not load this URL — check CORS / file type</span>}
                  {logoOk === null && <span style={{ color: 'var(--text3)' }}>Probing…</span>}
                </div>
              )}
            </Field>
            <Row>
              <Field label="Width on payslip (mm)">
                <input
                  type="number" min={10} max={80}
                  className="form-input"
                  value={template.logoWidthMm}
                  onChange={e => set('logoWidthMm', parseFloat(e.target.value) || 28)}
                />
                <Hint>Height auto-scales to keep aspect ratio.</Hint>
              </Field>
              <Field label="Position">
                <select
                  className="form-input"
                  value={template.logoPosition}
                  onChange={e => set('logoPosition', e.target.value as 'left' | 'center' | 'right')}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </Field>
              <Field label="Padding (mm)">
                <input
                  type="number" min={0} max={20}
                  className="form-input"
                  value={template.logoPaddingMm}
                  onChange={e => set('logoPaddingMm', parseFloat(e.target.value) || 0)}
                />
              </Field>
            </Row>
            <Hint>
              For best results use a transparent PNG with even padding. The logo
              sits inside a tinted header bar — pure white logos read fine on
              the soft background.
            </Hint>
          </Card>

          {/* Header + footer text */}
          <Card title="Header & Footer Text">
            <Field label="Header tagline (under company name)">
              <input
                className="form-input"
                placeholder="Reimagining Motherhood"
                value={template.headerTagline}
                onChange={e => set('headerTagline', e.target.value)}
              />
            </Field>
            <Field label="Footer tagline (italic, centered)">
              <input
                className="form-input"
                placeholder="Reimagining Motherhood"
                value={template.footerTagline}
                onChange={e => set('footerTagline', e.target.value)}
              />
            </Field>
            <Field label="Footer fine print">
              <textarea
                className="form-input"
                rows={2}
                value={template.footerSmallPrint}
                onChange={e => set('footerSmallPrint', e.target.value)}
              />
            </Field>
          </Card>

          {/* Toggles */}
          <Card title="Sections">
            <Toggle label="Year-to-date totals strip"
                    description="Gross, PAYE, NSSF, Net since the start of the fiscal year (April → March)."
                    value={template.showYTD}
                    onChange={v => set('showYTD', v)} />
            <Toggle label="Employer contributions box"
                    description="Shows NSSF Employer + SDL — visible reminder that employer also pays."
                    value={template.showEmployerCosts}
                    onChange={v => set('showEmployerCosts', v)} />
            <Toggle label="Advance recovery line"
                    description="When an employee is repaying a salary advance, show that as a deduction line."
                    value={template.showAdvanceDetail}
                    onChange={v => set('showAdvanceDetail', v)} />
            <Toggle label="Per-employee notes"
                    description="Render the HR note (set per employee per period) on the payslip."
                    value={template.showEmployeeNotes}
                    onChange={v => set('showEmployeeNotes', v)} />
            <Toggle label="Signature block"
                    description="Adds 'Prepared by' / 'Received by employee' lines at the bottom — useful for printed payslips."
                    value={template.showSignatureBlock}
                    onChange={v => set('showSignatureBlock', v)} />
          </Card>
        </div>

        {/* ─── RIGHT: live preview ─── */}
        <div>
          <div className="card" style={{ position: 'sticky', top: 16, padding: 0, overflow: 'hidden' }}>
            <div style={{ background: 'var(--surface2)', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
              Live preview
            </div>
            <div style={{ padding: 16, background: '#f4f5f7' }}>
              <PdfPreview template={template} companyName={company.name} />
            </div>
            <div style={{ padding: 12, fontSize: 10, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
              The actual PDF uses the same proportions but at A4 size. Open
              "Payslips" → "Download PDF" on any employee to see the real thing.
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}

// ─── Building blocks ─────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--text2)' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{label}</label>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.5 }}>{children}</div>
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 36, height: 28, padding: 0, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
      />
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        className="form-input" style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12 }}
      />
    </div>
  )
}

function SwatchRow({ swatches, onPick }: { swatches: { name: string; value: string }[]; onPick: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
      {swatches.map(s => (
        <button
          key={s.value}
          onClick={() => onPick(s.value)}
          title={`${s.name} · ${s.value}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
            border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer',
            background: 'var(--surface2)', fontSize: 10,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: s.value, display: 'inline-block' }} />
          <span style={{ color: 'var(--text2)' }}>{s.name}</span>
        </button>
      ))}
    </div>
  )
}

function Toggle({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: 6, borderRadius: 6 }}>
      <input
        type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 3, accentColor: 'var(--accent)' }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {description && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, lineHeight: 1.5 }}>{description}</div>}
      </div>
    </label>
  )
}

// ─── PDF preview (HTML approximation of the PDF layout) ───────────────
// Mirrors the proportions in HRMPayslips.generatePayslipPDF closely enough
// for the user to spot logo overflow, color clashes, or missing sections
// before printing.
function PdfPreview({ template, companyName }: { template: PayslipTemplate; companyName: string }) {
  const accent = template.accentColor
  const secondary = template.secondaryColor
  // soft tint of accent — same algorithm as generatePayslipPDF
  const [r, g, b] = hexToRgb(accent)
  const accentSoft = `rgb(${Math.round(r + (255 - r) * 0.85)}, ${Math.round(g + (255 - g) * 0.85)}, ${Math.round(b + (255 - b) * 0.85)})`

  return (
    <div style={{
      background: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      width: '100%', aspectRatio: '210/297', overflow: 'hidden',
      fontFamily: 'system-ui, sans-serif', color: '#1e1e1e',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        background: accentSoft, borderBottom: `1px solid ${accent}`,
        padding: '10px 14px', display: 'flex', alignItems: 'center',
        justifyContent: template.logoPosition === 'center' ? 'center' : 'space-between',
        minHeight: 56,
      }}>
        <div style={{
          display: 'flex',
          flexDirection: template.logoPosition === 'center' ? 'column' : 'row',
          alignItems: 'center', gap: 8,
          order: template.logoPosition === 'right' ? 2 : 1,
        }}>
          {template.logoUrl ? (
            <img
              src={template.logoUrl} alt="logo"
              style={{ width: template.logoWidthMm * 1.5, padding: template.logoPaddingMm, objectFit: 'contain', maxHeight: 50 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : null}
          {template.logoPosition !== 'center' && (
            <div>
              <div style={{ color: accent, fontWeight: 800, fontSize: 13 }}>{companyName}</div>
              {template.headerTagline && (
                <div style={{ color: secondary, fontSize: 8 }}>{template.headerTagline}</div>
              )}
            </div>
          )}
        </div>
        {template.logoPosition === 'center' && template.headerTagline && (
          <div style={{ color: accent, fontSize: 8, fontWeight: 700, marginTop: 2 }}>{template.headerTagline}</div>
        )}
        {template.logoPosition !== 'right' && (
          <div style={{ textAlign: 'right', order: 3 }}>
            <div style={{ fontSize: 7, color: '#888', textTransform: 'uppercase' }}>Payslip</div>
            <div style={{ fontSize: 9, fontWeight: 700 }}>April 2026</div>
            <div style={{ fontSize: 6, color: '#888' }}>Ref: PAY-202604</div>
          </div>
        )}
      </div>

      {/* Employee card */}
      <div style={{ padding: '8px 14px' }}>
        <div style={{ background: '#f8fafc', borderRadius: 4, padding: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 11 }}>● Sample Employee Name</div>
          <div style={{ fontSize: 7, color: '#888', marginTop: 2 }}>MWG-0001 · Job Title · Department</div>
          <div style={{ fontSize: 7, color: '#888' }}>Bank: NMB · 1234567890</div>
        </div>
      </div>

      {/* Two cols */}
      <div style={{ padding: '0 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ color: accent, fontWeight: 800, fontSize: 8, borderBottom: `1.5px solid ${accent}`, paddingBottom: 2 }}>EARNINGS</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginTop: 4 }}><span>Basic Salary</span><b>500,000</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginTop: 4, color: accent, fontWeight: 800, borderTop: '1px solid #ddd', paddingTop: 2 }}><span>Total</span><span>500,000</span></div>
        </div>
        <div>
          <div style={{ color: '#dc2626', fontWeight: 800, fontSize: 8, borderBottom: '1.5px solid #dc2626', paddingBottom: 2 }}>DEDUCTIONS</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginTop: 4 }}><span>PAYE</span><b style={{ color: '#dc2626' }}>30,000</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginTop: 4 }}><span>NSSF</span><b style={{ color: '#dc2626' }}>50,000</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginTop: 4, color: '#dc2626', fontWeight: 800, borderTop: '1px solid #ddd', paddingTop: 2 }}><span>Total</span><span>80,000</span></div>
        </div>
      </div>

      {/* Net pay hero */}
      <div style={{ margin: '0 14px 8px', background: accent, color: '#fff', padding: 10, borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 7 }}>NET PAY</div>
          <div style={{ fontSize: 6, opacity: 0.8 }}>for April 2026</div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 900 }}>TZS 420,000</div>
      </div>

      {/* YTD strip */}
      {template.showYTD && (
        <div style={{ margin: '0 14px 8px', background: accentSoft, borderRadius: 4, padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 4 }}>
          <div>
            <div style={{ color: accent, fontSize: 7, fontWeight: 800 }}>YTD</div>
            <div style={{ color: '#888', fontSize: 6 }}>since 2026/04</div>
          </div>
          {[['Gross', '500K'], ['PAYE', '30K'], ['NSSF', '50K'], ['Net', '420K']].map(([l, v]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ color: '#888', fontSize: 6 }}>{l}</div>
              <div style={{ color: accent, fontSize: 9, fontWeight: 800 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Employer costs */}
      {template.showEmployerCosts && (
        <div style={{ margin: '0 14px 8px', background: '#ecf5f4', borderRadius: 4, padding: 6 }}>
          <div style={{ color: secondary, fontSize: 6, fontWeight: 800 }}>EMPLOYER CONTRIBUTIONS</div>
          <div style={{ fontSize: 7, color: '#666' }}>NSSF Employer 50,000 · SDL 22,500</div>
        </div>
      )}

      {/* Notes preview */}
      {template.showEmployeeNotes && (
        <div style={{ margin: '0 14px 8px', background: '#ecf5f4', borderRadius: 4, padding: 6 }}>
          <div style={{ color: secondary, fontSize: 6, fontWeight: 800 }}>NOTE FROM HR</div>
          <div style={{ fontSize: 7, color: '#444', fontStyle: 'italic' }}>(Per-employee note appears here when set)</div>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Signature */}
      {template.showSignatureBlock && (
        <div style={{ padding: '8px 14px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, borderTop: '1px solid #ccc', paddingTop: 2, fontSize: 6, color: '#888' }}>Prepared by</div>
          <div style={{ flex: 1, borderTop: '1px solid #ccc', paddingTop: 2, fontSize: 6, color: '#888' }}>Received by employee</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '6px 14px 8px', borderTop: `1px solid ${accent}`, textAlign: 'center' }}>
        {template.footerTagline && (
          <div style={{ fontSize: 7, color: accent, fontStyle: 'italic' }}>{template.footerTagline}</div>
        )}
        {template.footerSmallPrint && (
          <div style={{ fontSize: 5, color: '#888', marginTop: 2 }}>{template.footerSmallPrint}</div>
        )}
      </div>
    </div>
  )
}
