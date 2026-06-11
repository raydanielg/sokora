import type { Page } from '../lib/types'
import { useAuth } from '../lib/useAuth'
import { useDashboard } from '../lib/useDashboard'
import { useCompanySettings } from '../lib/useCompanySettings'
import DashboardFinancial from './dashboard/DashboardFinancial'
import DashboardOperations from './dashboard/DashboardOperations'

interface Props { onNav: (p: Page) => void }

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard({ onNav }: Props) {
  const { user, can, isSuperAdmin } = useAuth()
  const canViewFinancials = can('dashboard.view_financials') || isSuperAdmin()
  const { data, loading, error, reload } = useDashboard(canViewFinancials)
  const { settings: cs } = useCompanySettings()

  const firstName = user?.full_name?.split(' ')[0] || 'there'
  const companyName = cs.company_name || 'Your Organization'

  return (
    <div className="page">
      {/* ── Company identity banner ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 20px',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.04) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--rl)',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Ambient glow */}
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(99,102,241,0.08)', filter: 'blur(40px)',
          pointerEvents: 'none',
        }} />

        {/* Company logo initial */}
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 18, fontWeight: 900, color: '#fff',
          letterSpacing: '-0.5px', boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
        }}>
          {companyName.charAt(0).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>
            {companyName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>
            {cs.address || 'Dar es Salaam, Tanzania'}
            {cs.phone ? ` · ${cs.phone}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
            color: '#10b981', background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.2)', borderRadius: 5,
            padding: '4px 8px',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s ease-in-out infinite', display: 'inline-block' }} />
            LIVE
          </div>
          <div style={{
            fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600,
            color: 'var(--accent)', background: 'var(--accent-dim)',
            border: '1px solid rgba(99,102,241,0.2)', borderRadius: 5,
            padding: '4px 8px',
          }}>
            {new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">{greeting()}, {firstName}</div>
          <div className="page-sub">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' '}· {companyName} · <span className="sync-dot"></span> Live
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={reload} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg> Refresh
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNav('cash-sale')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></svg> New Cash Sale
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onNav('vouchers')}>+ New Voucher</button>
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text3)', padding: '40px 0', justifyContent: 'center' }}>
          <div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Loading {companyName} data…
        </div>
      )}
      {error && !loading && (
        <div className="card" style={{ color: '#ef4444', display: 'flex', gap: 8, alignItems: 'center' }}>
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Failed to load: {error}
        </div>
      )}

      {data && !loading && (
        <>
          {canViewFinancials && data.financial && (
            <DashboardFinancial fin={data.financial} monthLabel={data.monthLabel} companyName={companyName} />
          )}
          <DashboardOperations ops={data.operations} monthLabel={data.monthLabel} onNav={onNav} />
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
