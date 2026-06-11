import { SettingsPage, SettingsSection } from '../components/SettingsPrimitives'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

interface IntegrationCard {
  title: string
  description: string
  status: 'live' | 'beta' | 'planned'
  onClick?: () => void
  color: string
}

export default function IntegrationsSettings({ onNav }: Props) {
  const integrations: IntegrationCard[] = [
    {
      title: 'WhatsApp',
      description: 'Send receipts and invoices via Wati, Twilio, or Infobip · Message templates · Delivery logs',
      status: 'live',
      onClick: () => onNav('whatsapp-settings'),
      color: '#25D366',
    },
    {
      title: 'SMS Gateway',
      description: 'OTP codes · Low-stock alerts · Delivery notifications · Tanzania carriers',
      status: 'planned',
      color: '#3d8bff',
    },
    {
      title: 'Email (SMTP)',
      description: 'Send invoices, statements, and reports via your own SMTP server or SendGrid',
      status: 'planned',
      color: '#d4874a',
    },
    {
      title: 'TRA EFD',
      description: 'Tanzania Electronic Fiscal Device integration for tax compliance',
      status: 'planned',
      color: '#a855f7',
    },
    {
      title: 'Payment Gateways',
      description: 'M-Pesa, Tigo Pesa, Airtel Money, Selcom, Stripe (online checkout)',
      status: 'planned',
      color: '#00e5a0',
    },
    {
      title: 'Accounting Export',
      description: 'Sync to QuickBooks, Xero, or Sage for external auditors',
      status: 'planned',
      color: '#85c2be',
    },
  ]

  return (
    <SettingsPage
      title="Integrations"
      subtitle="Connect SOKORA to external services — messaging, payments, tax compliance"
      onBack={() => onNav('settings')}
    >
      <SettingsSection
        title="Available Integrations"
        description="Live integrations are configured and sending data. Planned integrations show the roadmap."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {integrations.map((i, idx) => {
            const interactive = i.status === 'live' && i.onClick
            return (
              <button
                key={idx}
                onClick={interactive ? i.onClick : undefined}
                disabled={!interactive}
                style={{
                  background: 'var(--surface2)',
                  border: `1px solid ${interactive ? `${i.color}44` : 'var(--border)'}`,
                  borderRadius: 'var(--r)',
                  padding: 18,
                  textAlign: 'left',
                  cursor: interactive ? 'pointer' : 'default',
                  opacity: interactive ? 1 : 0.65,
                  transition: 'border-color .15s',
                  display: 'flex', flexDirection: 'column', gap: 10, minHeight: 140,
                }}
                onMouseEnter={e => { if (interactive) e.currentTarget.style.borderColor = i.color }}
                onMouseLeave={e => { if (interactive) e.currentTarget.style.borderColor = `${i.color}44` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{i.title}</div>
                  <StatusBadge status={i.status} color={i.color} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, flex: 1 }}>{i.description}</div>
                {interactive && (
                  <div style={{ fontSize: 12, color: i.color, fontWeight: 600, marginTop: 'auto' }}>
                    Configure →
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="API Access" description="Build custom integrations using the SOKORA API (Supabase REST endpoints)">
        <div style={{ padding: 14, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          <div style={{ marginBottom: 6, fontWeight: 700, color: 'var(--text2)' }}>Base URL</div>
          <div>Your Supabase project URL · use service-role key for server-to-server calls only</div>
          <div style={{ marginTop: 12, fontWeight: 700, color: 'var(--text2)' }}>Documentation</div>
          <div>Coming soon — comprehensive REST API docs for third-party developers</div>
        </div>
      </SettingsSection>
    </SettingsPage>
  )
}

function StatusBadge({ status, color }: { status: 'live' | 'beta' | 'planned'; color: string }) {
  const style = {
    live:    { bg: `${color}22`, fg: color, text: 'LIVE' },
    beta:    { bg: 'rgba(234,179,8,.15)', fg: '#eab308', text: 'BETA' },
    planned: { bg: 'var(--surface3)', fg: 'var(--text3)', text: 'PLANNED' },
  }[status]
  return (
    <span style={{
      background: style.bg, color: style.fg, fontSize: 10, fontWeight: 700,
      padding: '3px 8px', borderRadius: 4, fontFamily: 'var(--mono)', letterSpacing: .5,
    }}>
      {style.text}
    </span>
  )
}
