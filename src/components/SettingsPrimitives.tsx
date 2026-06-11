// ─── Shared settings UI primitives ──────────────────────────────────────────
// Keeps the 6 group pages visually consistent and cuts ~80 lines per page.

import { ReactNode } from 'react'

export function SettingsPage({
  title, subtitle, children, onBack, actions,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  onBack?: () => void
  actions?: ReactNode
}) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          {onBack && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 10 }}
              onClick={onBack}
            >
              ← Back to Settings
            </button>
          )}
          <div className="page-title">{title}</div>
          {subtitle && <div className="page-sub">{subtitle}</div>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function SettingsSection({
  title, description, children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-title" style={{ marginBottom: description ? 6 : 16 }}>{title}</div>
      {description && <div className="card-sub" style={{ marginBottom: 16 }}>{description}</div>}
      {children}
    </div>
  )
}

export function SettingsRow({
  label, description, children,
}: {
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0', borderBottom: '1px solid var(--border)', gap: 16,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {description && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

export function Toggle({
  value, onChange, disabled = false,
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      onClick={() => !disabled && onChange(!value)}
      style={{
        width: 44, height: 24, background: value ? 'var(--green)' : 'var(--surface3)',
        borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background .2s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: value ? 22 : 2,
        width: 20, height: 20, background: '#fff', borderRadius: '50%',
        transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.3)',
      }} />
    </div>
  )
}
