import { useState, useEffect } from 'react'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { SettingsPage, SettingsSection, SettingsRow, Toggle } from '../components/SettingsPrimitives'
import { useSettings } from '../lib/settingsLoader'
import { DEFAULT_SECURITY } from '../lib/settingsDefaults'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

export default function UsersAccessSettings({ onNav }: Props) {
  const { settings, updateSlice } = useSettings()
  const [form, setForm] = useState({ ...DEFAULT_SECURITY, ...settings.security })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => { setForm({ ...DEFAULT_SECURITY, ...settings.security }) }, [settings.security])

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    const ok = await updateSlice('security', form)
    setSaving(false)
    if (ok) { setToast('Security settings saved'); setToastType('success') }
    else { setToast('Save failed'); setToastType('error') }
  }

  return (
    <SettingsPage
      title="Users & Access"
      subtitle="Team members, roles, approvals, and security policies"
      onBack={() => onNav('settings')}
      actions={<button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Security Settings'}</button>}
    >
      {/* Shortcuts to existing pages */}
      <SettingsSection title="Team Management" description="Core user administration lives in dedicated pages">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <ShortcutCard
            title="User Management"
            description="Invite users, assign roles, manage permissions, deactivate accounts"
            onClick={() => onNav('users')}
            color="#3d8bff"
          />
          <ShortcutCard
            title="Approval Workflows"
            description="Review pending approval requests — approve, reject, or view history"
            onClick={() => onNav('approvals')}
            color="#d4874a"
          />
          <ShortcutCard
            title="Approval Rules"
            description="Configure when approvals are required, thresholds, and who approves each type"
            onClick={() => onNav('approvals-settings')}
            color="#8b5cf6"
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Session & Authentication" description="How long users stay logged in and when re-auth is required">
        <SettingsRow label="Session Timeout" description="Automatically log out users after this many minutes of inactivity">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" min={5} max={480} className="form-input" style={{ width: 100 }} value={form.session_timeout_minutes} onChange={e => set('session_timeout_minutes', parseInt(e.target.value) || 30)} />
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>minutes</span>
          </div>
        </SettingsRow>

        <SettingsRow label="Require Re-Auth for Void" description="Prompt for password before voiding/reversing any posted voucher">
          <Toggle value={form.require_reauth_for_void} onChange={v => set('require_reauth_for_void', v)} />
        </SettingsRow>

        <SettingsRow label="Require Re-Auth for Delete" description="Prompt for password before permanent deletions">
          <Toggle value={form.require_reauth_for_delete} onChange={v => set('require_reauth_for_delete', v)} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Login Security" description="Protect against brute-force login attempts">
        <SettingsRow label="Enable Failed-Login Lockout" description="Temporarily lock accounts after too many wrong passwords">
          <Toggle value={form.failed_login_lockout_enabled} onChange={v => set('failed_login_lockout_enabled', v)} />
        </SettingsRow>

        {form.failed_login_lockout_enabled && (
          <>
            <SettingsRow label="Attempts Before Lockout" description="Number of wrong passwords that trigger a lockout">
              <input type="number" min={1} max={20} className="form-input" style={{ width: 100 }} value={form.failed_login_attempts_before_lockout} onChange={e => set('failed_login_attempts_before_lockout', parseInt(e.target.value) || 5)} />
            </SettingsRow>

            <SettingsRow label="Lockout Duration" description="How long the account stays locked">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min={1} max={1440} className="form-input" style={{ width: 100 }} value={form.lockout_duration_minutes} onChange={e => set('lockout_duration_minutes', parseInt(e.target.value) || 15)} />
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>minutes</span>
              </div>
            </SettingsRow>
          </>
        )}
      </SettingsSection>

      <SettingsSection title="Audit Log" description="Retention period for user activity and change logs">
        <FG label="Audit Log Retention (days)">
          <input type="number" min={30} max={3650} className="form-input" value={form.audit_log_retention_days} onChange={e => set('audit_log_retention_days', parseInt(e.target.value) || 365)} />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Recommended: 365 days (1 year) for general business, 2555 days (7 years) for tax audit compliance</div>
        </FG>
      </SettingsSection>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </SettingsPage>
  )
}

function ShortcutCard({ title, description, onClick, color }: { title: string; description: string; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--surface2)', border: `1px solid var(--border)`,
      borderRadius: 'var(--r)', padding: 16, textAlign: 'left', cursor: 'pointer',
      transition: 'border-color .15s', display: 'flex', flexDirection: 'column', gap: 6,
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = color}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.4 }}>{description}</div>
      <div style={{ fontSize: 12, color, fontWeight: 600, marginTop: 'auto' }}>Open →</div>
    </button>
  )
}
