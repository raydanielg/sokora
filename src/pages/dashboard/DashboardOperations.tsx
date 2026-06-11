import type { OperationsData } from '../../lib/dashboardTypes'
import type { Page } from '../../lib/types'
import { tzs } from '../../lib/utils'

const Icon = ({ name, size = 18, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const p: Record<string, React.ReactNode> = {
    cart:     <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
    box:      <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></>,
    users:    <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>,
    heart:    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
    check:    <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
    warn:     <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    lightning:<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
    arrow:    <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{p[name] || <circle cx="12" cy="12" r="10" />}</svg>
}

const cardBase: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  padding: '14px 16px',
  position: 'relative',
  overflow: 'hidden',
}
const lbl: React.CSSProperties = { fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.7px', fontFamily: 'var(--mono)' }
const big: React.CSSProperties = { fontSize: 24, fontWeight: 800, margin: '6px 0 4px', letterSpacing: '-0.5px' }
const sub: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }

type VoucherType = string

const VOUCHER_LABELS: Record<VoucherType, { label: string; color: string }> = {
  cash_sale:      { label: 'Cash Sale',    color: '#5EA8A2' },
  sales_invoice:  { label: 'Invoice',      color: '#3b82f6' },
  cash_payment:   { label: 'Payment',      color: '#ef4444' },
  cash_receipt:   { label: 'Receipt',      color: '#10b981' },
  purchase:       { label: 'Purchase',     color: '#e0a458' },
  journal_entry:  { label: 'Journal',      color: '#8b5cf6' },
}

export default function DashboardOperations({ ops, monthLabel, onNav }: {
  ops: OperationsData; monthLabel: string; onNav?: (p: Page) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: '#10b981' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '.8px', fontFamily: 'var(--mono)' }}>
          Operations
        </span>
        <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>· {monthLabel}</span>
      </div>

      {/* Approvals alert — top priority if any pending */}
      {ops.approvalsPending > 0 && (
        <div
          onClick={() => onNav?.('approvals')}
          style={{
            ...cardBase,
            borderLeft: '3px solid #e0a458',
            borderTop: '2px solid #e0a45833',
            cursor: onNav ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 16px',
          }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(224,164,88,0.12)', border: '1px solid rgba(224,164,88,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="warn" size={18} color="#e0a458" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e0a458' }}>
              {ops.approvalsPending} pending approval{ops.approvalsPending !== 1 ? 's' : ''}
            </div>
            <div style={sub}>Vouchers or requests awaiting your decision</div>
          </div>
          {onNav && <Icon name="arrow" size={14} color="var(--text3)" />}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 10 }}>
        {/* Sales */}
        <div
          style={{ ...cardBase, borderTop: '2px solid #5EA8A2', cursor: onNav ? 'pointer' : 'default' }}
          onClick={() => onNav?.('sales-day-book')}
        >
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: '#5EA8A20d', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={lbl}>Sales this month</div>
            <Icon name="cart" size={15} color="#5EA8A299" />
          </div>
          <div style={{ ...big, color: '#5EA8A2' }}>{tzs(ops.sales.total)}</div>
          <div style={sub}>
            <span style={{ fontFamily: 'var(--mono)' }}>{ops.sales.count}</span> txns
            · cash {tzs(ops.sales.cash)}
            · credit {tzs(ops.sales.credit)}
          </div>
        </div>

        {/* Inventory */}
        <div
          style={{ ...cardBase, borderTop: '2px solid #3b82f6', cursor: onNav ? 'pointer' : 'default' }}
          onClick={() => onNav?.('inventory')}
        >
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: '#3b82f60d', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={lbl}>Inventory</div>
            <Icon name="box" size={15} color="#3b82f699" />
          </div>
          <div style={{ ...big, color: '#3b82f6' }}>{ops.inventory.products}</div>
          <div style={sub}>
            products
            {ops.inventory.outOfStock > 0 && <span style={{ color: '#ef4444', fontWeight: 700 }}> · {ops.inventory.outOfStock} out of stock</span>}
            {ops.inventory.lowStock > 0 && <span style={{ color: '#e0a458' }}> · {ops.inventory.lowStock} low</span>}
          </div>
        </div>

        {/* Team */}
        <div
          style={{ ...cardBase, borderTop: '2px solid #8b5cf6', cursor: onNav ? 'pointer' : 'default' }}
          onClick={() => onNav?.('hrm-employees')}
        >
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: '#8b5cf60d', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={lbl}>Team</div>
            <Icon name="users" size={15} color="#8b5cf699" />
          </div>
          <div style={{ ...big, color: '#8b5cf6' }}>{ops.hrm.headcount}</div>
          <div style={sub}>
            active employees
            {ops.hrm.onLeave > 0 && <span style={{ color: '#e0a458' }}> · {ops.hrm.onLeave} on leave</span>}
          </div>
        </div>

        {/* CRM */}
        <div
          style={{ ...cardBase, borderTop: '2px solid #ec4899', cursor: onNav ? 'pointer' : 'default' }}
          onClick={() => onNav?.('crm-hub')}
        >
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: '#ec48990d', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={lbl}>CRM</div>
            <Icon name="heart" size={15} color="#ec489999" />
          </div>
          <div style={{ ...big, color: '#ec4899' }}>{ops.crm.retailCustomers}</div>
          <div style={sub}>
            customers · <span style={{ color: '#10b981' }}>+{ops.crm.newRetailThisMonth} new</span>
            · {ops.crm.b2bProspects} B2B
            {ops.crm.b2bOverdue ? <span style={{ color: '#ef4444' }}> · {ops.crm.b2bOverdue} overdue</span> : ''}
          </div>
        </div>
      </div>

      {/* B2B won strip */}
      {ops.crm.b2bWonThisMonth > 0 && (
        <div style={{ ...cardBase, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderLeft: '3px solid #10b981', borderTop: '2px solid #10b98133' }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="lightning" size={18} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>
              {ops.crm.b2bWonThisMonth} B2B account{ops.crm.b2bWonThisMonth !== 1 ? 's' : ''} won this month
            </div>
            <div style={sub}>New wholesale accounts converted</div>
          </div>
        </div>
      )}

      {/* Recent transactions + Stock alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12 }}>

        {/* Recent transactions */}
        <div style={cardBase}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Recent Transactions</div>
            {onNav && (
              <button
                onClick={() => onNav('sales-register')}
                style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', padding: 0 }}
              >
                View all →
              </button>
            )}
          </div>
          {ops.recentVouchers.length === 0 && <div style={sub}>No recent transactions.</div>}
          {ops.recentVouchers.map((v, i) => {
            const meta = VOUCHER_LABELS[v.type] || { label: v.type, color: 'var(--text3)' }
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < ops.recentVouchers.length - 1 ? '1px solid var(--border)' : 'none', gap: 8 }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: meta.color, background: `${meta.color}15`, borderRadius: 3, padding: '1px 5px', marginRight: 6, border: `1px solid ${meta.color}30` }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.ref} {v.description ? `· ${v.description}` : ''}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#5EA8A2', fontWeight: 600, flexShrink: 0 }}>
                  {tzs(v.total_amount)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Stock alerts */}
        <div style={cardBase}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Stock Alerts</div>
            {onNav && (
              <button
                onClick={() => onNav('inventory')}
                style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', padding: 0 }}
              >
                View →
              </button>
            )}
          </div>
          {ops.stockAlerts.length === 0 && <div style={sub}>All stock healthy.</div>}
          {ops.stockAlerts.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < ops.stockAlerts.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 12.5, gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text2)', flex: 1 }}>{s.name}</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, flexShrink: 0, color: s.qty_on_hand <= 0 ? '#ef4444' : '#e0a458', fontSize: 11 }}>
                {s.qty_on_hand <= 0 ? '✗ OUT' : `${s.qty_on_hand} left`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Category breakdown */}
      {ops.categoryBreakdown.length > 0 && (
        <div style={cardBase}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Stock by Category</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ops.categoryBreakdown.map((c, i) => (
              <div key={i} style={{
                fontSize: 12, padding: '5px 10px',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 6, display: 'flex', gap: 6, alignItems: 'center',
              }}>
                <span style={{ color: 'var(--text3)' }}>{c.category}</span>
                <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
