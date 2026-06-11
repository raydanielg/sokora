import { useState, useEffect } from 'react'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { SettingsPage, SettingsSection, SettingsRow, Toggle } from '../components/SettingsPrimitives'
import { useSettings } from '../lib/settingsLoader'
import { DEFAULT_COMPANY } from '../lib/settingsDefaults'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

const MONTHS = [
  { v: 1, n: 'January' }, { v: 2, n: 'February' }, { v: 3, n: 'March' },
  { v: 4, n: 'April' },   { v: 5, n: 'May' },      { v: 6, n: 'June' },
  { v: 7, n: 'July' },    { v: 8, n: 'August' },   { v: 9, n: 'September' },
  { v: 10, n: 'October' },{ v: 11, n: 'November' },{ v: 12, n: 'December' },
]

export default function CompanyFinanceSettings({ onNav }: Props) {
  const { settings, updateSlice } = useSettings()
  const [form, setForm] = useState({ ...DEFAULT_COMPANY, ...settings.company })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => { setForm({ ...DEFAULT_COMPANY, ...settings.company }) }, [settings.company])

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    const ok = await updateSlice('company', form)
    setSaving(false)
    if (ok) { setToast('Company settings saved'); setToastType('success') }
    else { setToast('Save failed'); setToastType('error') }
  }

  return (
    <SettingsPage
      title="Company & Finance"
      subtitle="Legal identity, fiscal calendar, VAT, and financial period controls"
      onBack={() => onNav('settings')}
      actions={<button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>}
    >
      <SettingsSection title="Legal Identity" description="Registered name and tax identifiers used on every invoice and report">
        <div className="form-row">
          <FG label="Company Name" req><input className="form-input" value={form.company_name} onChange={e => set('company_name', e.target.value)} /></FG>
          <FG label="Phone"><input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+255 ..." /></FG>
        </div>
        <div className="form-row">
          <FG label="TIN Number"><input className="form-input" value={form.tin} onChange={e => set('tin', e.target.value)} placeholder="123-456-789" /></FG>
          <FG label="VRN (VAT Registration)"><input className="form-input" value={form.vrn} onChange={e => set('vrn', e.target.value)} placeholder="40-xxxxxxx-A" /></FG>
        </div>
        <div className="form-row">
          <FG label="Physical Address"><input className="form-input" value={form.physical_address} onChange={e => set('physical_address', e.target.value)} /></FG>
          <FG label="Postal Address"><input className="form-input" value={form.postal_address} onChange={e => set('postal_address', e.target.value)} placeholder="P.O. Box ..." /></FG>
        </div>
        <FG label="Contact Email"><input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></FG>
      </SettingsSection>

      <SettingsSection title="Currency & Fiscal Year" description="Controls how reports aggregate and when new financial years begin">
        <div className="form-row">
          <FG label="Currency">
            <select className="form-input" value={form.currency} onChange={e => set('currency', e.target.value)}>
              <option value="TZS">TZS — Tanzanian Shilling</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="KES">KES — Kenyan Shilling</option>
              <option value="UGX">UGX — Ugandan Shilling</option>
            </select>
          </FG>
          <FG label="Fiscal Year Starts">
            <select className="form-input" value={form.fiscal_year_start_month} onChange={e => set('fiscal_year_start_month', parseInt(e.target.value))}>
              {MONTHS.map(m => <option key={m.v} value={m.v}>{m.n}</option>)}
            </select>
          </FG>
        </div>
        <div className="form-row">
          <FG label="Go-Live Date">
            <input type="date" className="form-input" value={form.go_live_date || ''} onChange={e => set('go_live_date', e.target.value || null)} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>When historical data migration ended and live posting began</div>
          </FG>
          <FG label="Backdate Limit (days)">
            <input type="number" min={0} max={365} className="form-input" value={form.backdate_limit_days} onChange={e => set('backdate_limit_days', parseInt(e.target.value) || 0)} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>How far back users can post vouchers</div>
          </FG>
        </div>
      </SettingsSection>

      <SettingsSection title="VAT & Tax" description="Default VAT rate and inclusive/exclusive pricing convention">
        <div className="form-row">
          <FG label="Default VAT Rate (%)">
            <input type="number" min={0} max={100} step={0.1} className="form-input" value={form.vat_rate} onChange={e => set('vat_rate', parseFloat(e.target.value) || 0)} />
          </FG>
          <FG label="Pricing Convention">
            <select className="form-input" value={form.vat_inclusive_default ? 'inclusive' : 'exclusive'} onChange={e => set('vat_inclusive_default', e.target.value === 'inclusive')}>
              <option value="inclusive">VAT Inclusive (prices include VAT)</option>
              <option value="exclusive">VAT Exclusive (VAT added at checkout)</option>
            </select>
          </FG>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 4 }}>
          Note: Detailed tax rates (multiple rates, withholding tax, TRA EFD) are configured under Templates & Documents → Tax Configuration.
        </div>
      </SettingsSection>

      <SettingsSection title="Period Controls" description="Lock closed accounting periods to prevent backdated edits">
        <SettingsRow
          label="Enable Period Lock"
          description="When ON, once a period is closed it cannot be posted to without explicit unlock. Required for audit compliance."
        >
          <Toggle value={form.period_lock_enabled} onChange={v => set('period_lock_enabled', v)} />
        </SettingsRow>
      </SettingsSection>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </SettingsPage>
  )
}
