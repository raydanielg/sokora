// ─── Settings Hub ──────────────────────────────────────────────────────────
// Replaces the old long-scroll Settings page. Groups every ERP setting into
// 6 clean categories, each navigating to a dedicated page.
// ───────────────────────────────────────────────────────────────────────────

import { useSettings } from '../lib/settingsLoader'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

interface GroupCard {
  key: string
  page: Page
  title: string
  description: string
  bullets: string[]
  icon: string
  color: string
  gradient: string
}

const GROUPS: GroupCard[] = [
  {
    key: 'company',
    page: 'company-finance-settings' as Page,
    title: 'Company & Finance',
    description: 'Legal identity, fiscal calendar, VAT, go-live',
    bullets: ['Company name · TIN · VRN', 'Currency & fiscal year', 'VAT rate · Period locks', 'Backdate limits'],
    icon: 'M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4',
    color: '#d4874a',
    gradient: 'linear-gradient(135deg, rgba(212,135,74,.08) 0%, rgba(212,135,74,.04) 100%)',
  },
  {
    key: 'users',
    page: 'users-access-settings' as Page,
    title: 'Users & Access',
    description: 'Team members, roles, approvals, sessions',
    bullets: ['Invite users · Assign roles', 'Permission management', 'Approval workflows', 'Session timeout'],
    icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    color: '#3d8bff',
    gradient: 'linear-gradient(135deg, rgba(61,139,255,.08) 0%, rgba(61,139,255,.04) 100%)',
  },
  {
    key: 'sales',
    page: 'sales-inventory-settings' as Page,
    title: 'Sales & Inventory',
    description: 'Cashier rules, stock valuation, locations, categories',
    bullets: ['Cash sale behavior', 'Stock control · Reorder alerts', 'Locations · Branches', 'Categories · Units'],
    icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96 12 12.01 20.73 6.96 M12 22.08V12',
    color: '#00e5a0',
    gradient: 'linear-gradient(135deg, rgba(0,229,160,.08) 0%, rgba(0,229,160,.04) 100%)',
  },
  {
    key: 'templates',
    page: 'templates-hub' as Page,
    title: 'Templates & Documents',
    description: 'All branded templates, document numbering, tax display',
    bullets: ['Receipt · Invoice · Proforma', 'Pricelist · Report templates', 'Document numbering rules', 'Tax configuration'],
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
    color: '#85c2be',
    gradient: 'linear-gradient(135deg, rgba(133,194,190,.08) 0%, rgba(247,166,173,.06) 100%)',
  },
  {
    key: 'integrations',
    page: 'integrations-settings' as Page,
    title: 'Integrations',
    description: 'WhatsApp, email, SMS, payment gateways, TRA EFD',
    bullets: ['WhatsApp · Wati · Twilio', 'Email (SMTP) · SMS', 'TRA EFD integration', 'Payment gateway hooks'],
    icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    color: '#25D366',
    gradient: 'linear-gradient(135deg, rgba(37,211,102,.08) 0%, rgba(37,211,102,.04) 100%)',
  },
  {
    key: 'appearance',
    page: 'regional-backup-settings' as Page,
    title: 'Appearance & Regional',
    description: 'Themes, typography, language, date & number formats, backup',
    bullets: ['8 themes · Font size', 'Border radius · Layout density', 'Language · Date format', 'Backup · Data retention'],
    icon: 'M12 2a10 10 0 1 0 10 10c0-.7-.07-1.38-.2-2.04 M15 8a3 3 0 0 0-3-3 M8.5 13.5L12 10l3.5 3.5',
    color: '#a855f7',
    gradient: 'linear-gradient(135deg, rgba(168,85,247,.08) 0%, rgba(236,72,153,.06) 100%)',
  },
]

export default function Settings({ onNav }: Props) {
  const { settings } = useSettings()

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">
            {settings.company.company_name} · Configure your ERP system
          </div>
        </div>
      </div>

      {/* Quick-status strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12, marginBottom: 24,
      }}>
        <QuickStatus
          label="Fiscal Year Start"
          value={monthName(settings.company.fiscal_year_start_month)}
          ok={true}
        />
        <QuickStatus
          label="VAT Rate"
          value={`${settings.tax.default_vat_rate}%`}
          ok={settings.tax.vat_enabled}
          warning={!settings.tax.vat_enabled ? 'Disabled' : undefined}
        />
        <QuickStatus
          label="Session Timeout"
          value={`${settings.security.session_timeout_minutes} min`}
          ok={settings.security.session_timeout_minutes > 0 && settings.security.session_timeout_minutes <= 60}
        />
        <QuickStatus
          label="Currency"
          value={settings.company.currency}
          ok={true}
        />
        <QuickStatus
          label="Period Lock"
          value={settings.company.period_lock_enabled ? 'Enabled' : 'Off'}
          ok={settings.company.period_lock_enabled}
          warning={!settings.company.period_lock_enabled ? 'Unlocked' : undefined}
        />
        <QuickStatus
          label="Auto Backup"
          value={settings.backup.auto_export_enabled ? settings.backup.auto_export_frequency : 'Off'}
          ok={settings.backup.auto_export_enabled}
          warning={!settings.backup.auto_export_enabled ? 'Not scheduled' : undefined}
        />
      </div>

      {/* 6 group cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 16,
      }}>
        {GROUPS.map(g => (
          <button
            key={g.key}
            onClick={() => onNav(g.page)}
            style={{
              background: g.gradient,
              border: `1px solid ${g.color}33`,
              borderRadius: 14,
              padding: '20px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all .18s',
              display: 'flex', flexDirection: 'column', gap: 12,
              minHeight: 180,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${g.color}66`; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = `${g.color}33`; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `${g.color}1a`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="20" height="20" fill="none" stroke={g.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d={g.icon} />
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  {g.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {g.description}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
              {g.bullets.map((b, i) => (
                <div key={i} style={{
                  fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ color: g.color }}>·</span>
                  {b}
                </div>
              ))}
            </div>

            <div style={{
              marginTop: 'auto', paddingTop: 10,
              fontSize: 12, color: g.color, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>Configure</span>
              <span>→</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function QuickStatus({
  label, value, ok, warning,
}: {
  label: string
  value: string
  ok: boolean
  warning?: string
}) {
  const color = warning ? 'var(--yellow)' : ok ? 'var(--green)' : 'var(--text3)'
  return (
    <div style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r)',
      padding: '10px 14px',
    }}>
      <div style={{
        fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
        <div style={{
          fontSize: 10, fontFamily: 'var(--mono)', color,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
          {warning || (ok ? 'OK' : 'Review')}
        </div>
      </div>
    </div>
  )
}

function monthName(m: number): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return names[(m - 1) % 12] || 'Jan'
}
