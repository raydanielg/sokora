import { useState, useEffect } from 'react'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { SettingsPage, SettingsSection, SettingsRow, Toggle } from '../components/SettingsPrimitives'
import { useSettings } from '../lib/settingsLoader'
import { DEFAULT_REGIONAL, DEFAULT_BACKUP } from '../lib/settingsDefaults'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

const TIMEZONES = [
  'Africa/Dar_es_Salaam', 'Africa/Nairobi', 'Africa/Kampala', 'Africa/Lagos',
  'Africa/Cairo', 'Africa/Johannesburg', 'Europe/London', 'Europe/Berlin',
  'Asia/Dubai', 'Asia/Singapore', 'America/New_York', 'UTC',
]

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function RegionalBackupSettings({ onNav }: Props) {
  const { settings, updateSlice } = useSettings()
  const [regional, setRegional] = useState({ ...DEFAULT_REGIONAL, ...settings.regional })
  const [backup, setBackup] = useState({ ...DEFAULT_BACKUP, ...settings.backup })
  const [recipientsInput, setRecipientsInput] = useState('')
  const [savingReg, setSavingReg] = useState(false)
  const [savingBackup, setSavingBackup] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => { setRegional({ ...DEFAULT_REGIONAL, ...settings.regional }) }, [settings.regional])
  useEffect(() => {
    setBackup({ ...DEFAULT_BACKUP, ...settings.backup })
    setRecipientsInput((settings.backup.auto_export_recipients || []).join(', '))
  }, [settings.backup])

  const saveRegional = async () => {
    setSavingReg(true)
    const ok = await updateSlice('regional', regional)
    setSavingReg(false)
    if (ok) { setToast('Regional settings saved'); setToastType('success') }
    else { setToast('Save failed'); setToastType('error') }
  }

  const saveBackup = async () => {
    setSavingBackup(true)
    const recipients = recipientsInput.split(',').map(s => s.trim()).filter(Boolean)
    const ok = await updateSlice('backup', { ...backup, auto_export_recipients: recipients })
    setSavingBackup(false)
    if (ok) { setToast('Backup settings saved'); setToastType('success') }
    else { setToast('Save failed'); setToastType('error') }
  }

  const numberExample = (() => {
    const n = 1234567.89
    switch (regional.number_format) {
      case 'comma_period':  return n.toLocaleString('en-US')
      case 'period_comma':  return n.toLocaleString('de-DE')
      case 'space_period':  return n.toLocaleString('fr-FR').replace(/,/g, '.').replace(/\u202f/g, ' ')
    }
  })()

  const dateExample = (() => {
    const d = new Date(2025, 2, 15)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    switch (regional.date_format) {
      case 'DD/MM/YYYY': return `${dd}/${mm}/${yyyy}`
      case 'MM/DD/YYYY': return `${mm}/${dd}/${yyyy}`
      case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`
    }
  })()

  return (
    <SettingsPage
      title="Regional & Backup"
      subtitle="Language, formats, timezone, and automated data exports"
      onBack={() => onNav('settings')}
    >
      <SettingsSection title="Language & Formats" description="How SOKORA displays text, numbers, and dates across the app">
        <div className="form-row">
          <FG label="Primary Language">
            <select className="form-input" value={regional.language} onChange={e => setRegional(r => ({ ...r, language: e.target.value as any }))}>
              <option value="en">English</option>
              <option value="sw">Kiswahili</option>
              <option value="en-sw">Mixed (English + Kiswahili)</option>
            </select>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Affects labels, messages, and receipt text where translations exist</div>
          </FG>
          <FG label="Timezone">
            <select className="form-input" value={regional.timezone} onChange={e => setRegional(r => ({ ...r, timezone: e.target.value }))}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </FG>
        </div>

        <div className="form-row">
          <FG label="Date Format">
            <select className="form-input" value={regional.date_format} onChange={e => setRegional(r => ({ ...r, date_format: e.target.value as any }))}>
              <option value="DD/MM/YYYY">DD/MM/YYYY (15/03/2025)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (03/15/2025)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (2025-03-15)</option>
            </select>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Example: {dateExample}</div>
          </FG>
          <FG label="Number Format">
            <select className="form-input" value={regional.number_format} onChange={e => setRegional(r => ({ ...r, number_format: e.target.value as any }))}>
              <option value="comma_period">1,234,567.89 (US/UK)</option>
              <option value="period_comma">1.234.567,89 (EU)</option>
              <option value="space_period">1 234 567.89 (SI/FR)</option>
            </select>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Example: {numberExample}</div>
          </FG>
        </div>

        <FG label="Week Starts On">
          <select className="form-input" value={regional.week_start} onChange={e => setRegional(r => ({ ...r, week_start: e.target.value as any }))}>
            <option value="monday">Monday (ISO standard, most of world)</option>
            <option value="sunday">Sunday (US calendar)</option>
          </select>
        </FG>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-primary" onClick={saveRegional} disabled={savingReg}>{savingReg ? 'Saving…' : 'Save Regional Settings'}</button>
        </div>
      </SettingsSection>

      <SettingsSection title="Automated Backup & Export" description="Scheduled data exports for auditors, accountants, and offsite backup">
        <SettingsRow label="Enable Automated Export" description="Automatically export key reports on a schedule">
          <Toggle value={backup.auto_export_enabled} onChange={v => setBackup(b => ({ ...b, auto_export_enabled: v }))} />
        </SettingsRow>

        {backup.auto_export_enabled && (
          <>
            <div className="form-row">
              <FG label="Frequency">
                <select className="form-input" value={backup.auto_export_frequency} onChange={e => setBackup(b => ({ ...b, auto_export_frequency: e.target.value as any }))}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly (1st of month)</option>
                </select>
              </FG>
              {backup.auto_export_frequency === 'weekly' && (
                <FG label="Day of Week">
                  <select className="form-input" value={backup.auto_export_day_of_week} onChange={e => setBackup(b => ({ ...b, auto_export_day_of_week: parseInt(e.target.value) }))}>
                    {DAYS_OF_WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </FG>
              )}
              <FG label="Time">
                <input type="time" className="form-input" value={backup.auto_export_time} onChange={e => setBackup(b => ({ ...b, auto_export_time: e.target.value }))} />
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Local time ({regional.timezone})</div>
              </FG>
            </div>

            <FG label="Email Recipients">
              <input className="form-input" value={recipientsInput} onChange={e => setRecipientsInput(e.target.value)} placeholder="joe@sokora.app, accountant@firm.co.tz" />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Comma-separated emails that receive the export bundle</div>
            </FG>
          </>
        )}
      </SettingsSection>

      <SettingsSection title="Data Retention" description="How long to keep historical records and audit logs">
        <FG label="Data Retention (years)">
          <input type="number" min={1} max={20} className="form-input" value={backup.data_retention_years} onChange={e => setBackup(b => ({ ...b, data_retention_years: parseInt(e.target.value) || 7 }))} />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            Tanzania Revenue Authority requires 5 years minimum · 7 years recommended for general business · 10+ for large taxpayers
          </div>
        </FG>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-primary" onClick={saveBackup} disabled={savingBackup}>{savingBackup ? 'Saving…' : 'Save Backup Settings'}</button>
        </div>
      </SettingsSection>

      <SettingsSection title="Appearance & Theme" description="Theme selection, typography, and layout customization">
        <div style={{
          padding: 16, background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Theme & Visual Customization</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Change theme, font size, border radius, table style and more</div>
          </div>
          <button className="btn btn-primary" style={{ background: '#a855f7', border: 'none' }} onClick={() => onNav('display-settings')}>
            Open Appearance →
          </button>
        </div>
      </SettingsSection>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </SettingsPage>
  )
}
