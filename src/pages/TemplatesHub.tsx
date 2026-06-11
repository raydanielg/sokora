import { useState, useEffect } from 'react'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { SettingsPage, SettingsSection, SettingsRow, Toggle } from '../components/SettingsPrimitives'
import { useSettings } from '../lib/settingsLoader'
import { DEFAULT_NUMBERING, DEFAULT_TAX, NumberingRule } from '../lib/settingsDefaults'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

interface TemplateCard { title: string; description: string; page: Page; color: string }

const TEMPLATES: TemplateCard[] = [
  // Company Branding sits first because every other template inherits its
  // logo, address, bank details. Set this up before tweaking individual
  // doc templates.
  { title: 'Company Branding', description: 'Logo · company info · bank details · M-Pesa · per-doc footers',     page: 'company-branding',  color: '#85c2be' },
  { title: 'Receipt Template',  description: 'Cash sale receipts · customer-facing · thermal & A4',         page: 'receipt-template',  color: '#00e5a0' },
  { title: 'Invoice Template',  description: 'Tax invoices for credit sales · VAT breakdown · bank details', page: 'invoice-template',  color: '#3d8bff' },
  { title: 'Proforma Template', description: 'Quotes and proformas · validity period · terms',               page: 'proforma-template', color: '#a855f7' },
  { title: 'Price List',        description: 'Branded price list · print · PDF · CSV export',                page: 'pricelist-template',color: '#85c2be' },
  { title: 'Report Templates',  description: 'Sales Day Book · PnL · Trial Balance headers & footers',       page: 'report-templates',  color: '#d4874a' },
]

const NUMBERING_VOUCHERS: { key: keyof typeof DEFAULT_NUMBERING; label: string }[] = [
  { key: 'cash_sale',        label: 'Cash Sale' },
  { key: 'sales_invoice',    label: 'Sales Invoice' },
  { key: 'proforma',         label: 'Proforma' },
  { key: 'sales_return',     label: 'Sales Return' },
  { key: 'credit_note',      label: 'Credit Note' },
  { key: 'debit_note',       label: 'Debit Note' },
  { key: 'purchase_order',   label: 'Purchase Order' },
  { key: 'grn',              label: 'GRN' },
  { key: 'purchase_invoice', label: 'Purchase Invoice' },
  { key: 'purchase_return',  label: 'Purchase Return' },
  { key: 'cash_payment',     label: 'Cash Payment' },
  { key: 'cash_receipt',     label: 'Cash Receipt' },
  { key: 'bank_payment',     label: 'Bank Payment' },
  { key: 'bank_receipt',     label: 'Bank Receipt' },
  { key: 'journal_entry',    label: 'Journal Entry' },
  { key: 'stock_adjustment', label: 'Stock Adjustment' },
  { key: 'stock_transfer',   label: 'Stock Transfer' },
  { key: 'opening_stock',    label: 'Opening Stock' },
]

export default function TemplatesHub({ onNav }: Props) {
  const { settings, updateSlice } = useSettings()
  const [numbering, setNumbering] = useState({ ...DEFAULT_NUMBERING, ...settings.numbering })
  const [tax, setTax] = useState({ ...DEFAULT_TAX, ...settings.tax })
  const [activeTab, setActiveTab] = useState<'templates' | 'numbering' | 'tax'>('templates')
  const [savingNum, setSavingNum] = useState(false)
  const [savingTax, setSavingTax] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => { setNumbering({ ...DEFAULT_NUMBERING, ...settings.numbering }) }, [settings.numbering])
  useEffect(() => { setTax({ ...DEFAULT_TAX, ...settings.tax }) }, [settings.tax])

  const setRule = (key: keyof typeof DEFAULT_NUMBERING, field: keyof NumberingRule, v: any) => {
    setNumbering(n => ({ ...n, [key]: { ...n[key], [field]: v } }))
  }

  const saveNumbering = async () => {
    setSavingNum(true)
    const ok = await updateSlice('numbering', numbering)
    setSavingNum(false)
    if (ok) { setToast('Numbering rules saved'); setToastType('success') }
    else { setToast('Save failed'); setToastType('error') }
  }

  const saveTax = async () => {
    setSavingTax(true)
    const ok = await updateSlice('tax', tax)
    setSavingTax(false)
    if (ok) { setToast('Tax configuration saved'); setToastType('success') }
    else { setToast('Save failed'); setToastType('error') }
  }

  return (
    <SettingsPage
      title="Templates & Documents"
      subtitle="Branded templates, document numbering rules, and tax configuration"
      onBack={() => onNav('settings')}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {(['templates', 'numbering', 'tax'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            background: 'transparent', border: 'none', padding: '12px 20px', cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
            color: activeTab === t ? 'var(--accent)' : 'var(--text3)',
            borderBottom: `2px solid ${activeTab === t ? 'var(--accent)' : 'transparent'}`,
            textTransform: 'capitalize',
          }}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'templates' && (
        <SettingsSection title="Document Templates" description="Click any template to customize its header, footer, colors, and layout">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {TEMPLATES.map(t => (
              <button key={t.page} onClick={() => onNav(t.page)} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', padding: 16, textAlign: 'left', cursor: 'pointer',
                transition: 'border-color .15s', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120,
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = t.color}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.4 }}>{t.description}</div>
                <div style={{ fontSize: 12, color: t.color, fontWeight: 600, marginTop: 'auto' }}>Edit Template →</div>
              </button>
            ))}
          </div>
        </SettingsSection>
      )}

      {activeTab === 'numbering' && (
        <>
          <SettingsSection
            title="Document Numbering Rules"
            description="Configure prefix, padding, and reset cycle for each voucher type. Changes apply to new documents only — existing numbers stay."
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase' }}>Voucher</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase' }}>Prefix</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase' }}>Digits</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase' }}>Reset</th>
                    <th style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase' }}>Year</th>
                    <th style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase' }}>Branch</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px', color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase' }}>Example</th>
                  </tr>
                </thead>
                <tbody>
                  {NUMBERING_VOUCHERS.map(v => {
                    const rule = numbering[v.key]
                    const example = formatExample(rule)
                    return (
                      <tr key={v.key} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{v.label}</td>
                        <td style={{ padding: '8px' }}>
                          <input className="form-input" style={{ width: 80, fontSize: 13 }} value={rule.prefix} onChange={e => setRule(v.key, 'prefix', e.target.value)} />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input type="number" min={2} max={10} className="form-input" style={{ width: 60, fontSize: 13 }} value={rule.pad} onChange={e => setRule(v.key, 'pad', parseInt(e.target.value) || 4)} />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <select className="form-input" style={{ fontSize: 13 }} value={rule.reset} onChange={e => setRule(v.key, 'reset', e.target.value)}>
                            <option value="continuous">Never</option>
                            <option value="annual">Annually</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <input type="checkbox" checked={rule.include_year} onChange={e => setRule(v.key, 'include_year', e.target.checked)} />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <input type="checkbox" checked={rule.include_branch} onChange={e => setRule(v.key, 'include_branch', e.target.checked)} />
                        </td>
                        <td style={{ padding: '8px', fontFamily: 'var(--mono)', color: 'var(--text2)', fontSize: 12 }}>{example}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-primary" onClick={saveNumbering} disabled={savingNum}>{savingNum ? 'Saving…' : 'Save Numbering Rules'}</button>
            </div>
          </SettingsSection>
        </>
      )}

      {activeTab === 'tax' && (
        <>
          <SettingsSection title="VAT Configuration" description="Value-Added Tax defaults and additional rates">
            <SettingsRow label="VAT Enabled" description="Turn VAT handling on/off globally. When OFF, all documents show no tax line.">
              <Toggle value={tax.vat_enabled} onChange={v => setTax(t => ({ ...t, vat_enabled: v }))} />
            </SettingsRow>

            <FG label="Default VAT Rate (%)">
              <input type="number" min={0} max={100} step={0.1} className="form-input" value={tax.default_vat_rate} onChange={e => setTax(t => ({ ...t, default_vat_rate: parseFloat(e.target.value) || 0 }))} />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Tanzania standard rate: 18%</div>
            </FG>

            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Additional Rates</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>For products taxed differently from the default (zero-rated exports, exempt items)</div>
              {tax.vat_rates.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input className="form-input" placeholder="Label" value={r.label} style={{ flex: 1 }} onChange={e => {
                    const rates = [...tax.vat_rates]; rates[i] = { ...rates[i], label: e.target.value }; setTax(t => ({ ...t, vat_rates: rates }))
                  }} />
                  <input type="number" className="form-input" placeholder="Rate %" value={r.rate} style={{ width: 120 }} onChange={e => {
                    const rates = [...tax.vat_rates]; rates[i] = { ...rates[i], rate: parseFloat(e.target.value) || 0 }; setTax(t => ({ ...t, vat_rates: rates }))
                  }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setTax(t => ({ ...t, vat_rates: t.vat_rates.filter((_, idx) => idx !== i) }))}>Remove</button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setTax(t => ({ ...t, vat_rates: [...t.vat_rates, { label: '', rate: 0 }] }))}>+ Add Rate</button>
            </div>
          </SettingsSection>

          <SettingsSection title="Withholding Tax" description="Applied to supplier payments per TRA rules">
            <SettingsRow label="Enable Withholding Tax" description="Deduct WHT from supplier payments and remit separately">
              <Toggle value={tax.withholding_tax_enabled} onChange={v => setTax(t => ({ ...t, withholding_tax_enabled: v }))} />
            </SettingsRow>
            {tax.withholding_tax_enabled && (
              <FG label="Withholding Tax Rate (%)">
                <input type="number" min={0} max={100} step={0.1} className="form-input" value={tax.withholding_tax_rate} onChange={e => setTax(t => ({ ...t, withholding_tax_rate: parseFloat(e.target.value) || 0 }))} />
              </FG>
            )}
          </SettingsSection>

          <SettingsSection title="TRA EFD Integration" description="Electronic Fiscal Device hook for Tanzanian tax compliance (placeholder)">
            <SettingsRow label="Enable EFD Integration" description="Send every receipt to the TRA EFD device or cloud service">
              <Toggle value={tax.efd_integration_enabled} onChange={v => setTax(t => ({ ...t, efd_integration_enabled: v }))} />
            </SettingsRow>
            {tax.efd_integration_enabled && (
              <FG label="EFD Device Serial">
                <input className="form-input" value={tax.efd_serial} onChange={e => setTax(t => ({ ...t, efd_serial: e.target.value }))} placeholder="02TZXXXXXXX" />
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Coming soon — device bridge in development</div>
              </FG>
            )}
          </SettingsSection>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={saveTax} disabled={savingTax}>{savingTax ? 'Saving…' : 'Save Tax Configuration'}</button>
          </div>
        </>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </SettingsPage>
  )
}

function formatExample(rule: NumberingRule): string {
  const year = rule.include_year ? '25-' : ''
  const branch = rule.include_branch ? '10-' : ''
  const num = '1'.padStart(rule.pad, '0')
  return `${rule.prefix}${year}${branch}${num}`
}
