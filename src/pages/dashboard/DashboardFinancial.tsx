import type { FinancialData, MoneyDelta } from '../../lib/dashboardTypes'
import { tzs } from '../../lib/utils'

const Icon = ({ name, size = 18, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const p: Record<string, React.ReactNode> = {
    up:           <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />,
    down:         <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />,
    wallet:       <><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></>,
    box:          <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></>,
    users:        <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>,
    arrowDown:    <><line x1="17" y1="7" x2="7" y2="17" /><polyline points="17 17 7 17 7 7" /></>,
    arrowUp:      <><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></>,
    trendUp:      <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{p[name] || <circle cx="12" cy="12" r="10" />}</svg>
}

function Delta({ d, invert = false }: { d: MoneyDelta; invert?: boolean }) {
  if (d.deltaPct === null) return <span style={{ fontSize: 11, color: 'var(--text3)' }}>no prior data</span>
  const good = invert ? d.deltaPct < 0 : d.deltaPct >= 0
  const color = good ? '#10b981' : '#ef4444'
  const bg = good ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'
  return (
    <span style={{ fontSize: 10.5, color, background: bg, borderRadius: 4, padding: '2px 6px', display: 'inline-flex', gap: 3, alignItems: 'center', fontFamily: 'var(--mono)', fontWeight: 600 }}>
      <Icon name={d.deltaPct >= 0 ? 'up' : 'down'} size={11} color={color} />
      {Math.abs(d.deltaPct).toFixed(0)}% vs last mo
    </span>
  )
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

function MetricCard({ label, value, delta, color, icon, sub }: {
  label: string; value: string; delta?: MoneyDelta; color: string;
  icon: string; sub?: string; invert?: boolean
}) {
  return (
    <div style={{ ...cardBase, borderTop: `2px solid ${color}` }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: `${color}0d`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={lbl}>{label}</div>
        <Icon name={icon} size={16} color={`${color}99`} />
      </div>
      <div style={{ ...big, color }}>{value}</div>
      {delta && <Delta d={delta} />}
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function DashboardFinancial({ fin, monthLabel, companyName }: {
  fin: FinancialData; monthLabel: string; companyName?: string
}) {
  const neg = (n: number) => n < 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--accent)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.8px', fontFamily: 'var(--mono)' }}>
            Financials
          </span>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>· {monthLabel}</span>
        </div>
        {companyName && (
          <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{companyName}</span>
        )}
      </div>

      {/* P&L row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <MetricCard
          label="Revenue"
          value={tzs(fin.revenue.current)}
          delta={fin.revenue}
          color="#5EA8A2"
          icon="trendUp"
        />
        <MetricCard
          label={`Gross Profit · ${fin.marginPct.toFixed(0)}% margin`}
          value={tzs(fin.grossProfit.current)}
          delta={fin.grossProfit}
          color={neg(fin.grossProfit.current) ? '#ef4444' : '#10b981'}
          icon="trendUp"
        />
        <MetricCard
          label="Operating Expenses"
          value={tzs(fin.expenses.current)}
          delta={fin.expenses}
          color="#e0a458"
          icon="arrowUp"
        />
        <MetricCard
          label="Net Profit"
          value={tzs(fin.netProfit.current)}
          delta={fin.netProfit}
          color={neg(fin.netProfit.current) ? '#ef4444' : '#10b981'}
          icon="trendUp"
        />
      </div>

      {/* Balance row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {/* Cash card */}
        <div style={{ ...cardBase, borderTop: '2px solid #5EA8A2', gridColumn: 'span 1' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: '#5EA8A20d', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={lbl}>Cash Position</div>
            <Icon name="wallet" size={16} color="#5EA8A299" />
          </div>
          <div style={{ ...big, color: '#5EA8A2' }}>{tzs(fin.cashPosition)}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{ fontSize: 10.5, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Inventory {tzs(fin.inventoryValue)}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Payroll/mo {tzs(fin.payrollCost)}</span>
          </div>
        </div>

        {/* AR card */}
        <div style={{ ...cardBase, borderTop: '2px solid #3b82f6' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: '#3b82f60d', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={lbl}>Receivables · {fin.ar.customerCount} customers</div>
            <Icon name="arrowDown" size={16} color="#3b82f699" />
          </div>
          <div style={{ ...big, color: '#3b82f6' }}>{tzs(fin.ar.total)}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text3)', fontFamily: 'var(--mono)', lineHeight: 1.7 }}>
            0–30d: {tzs(fin.ar.aging.current)}
            {fin.ar.aging.d90plus > 0 && <span style={{ color: '#ef4444' }}> · 90+d: {tzs(fin.ar.aging.d90plus)}</span>}
            {fin.ar.top[0] && <div>Top: {fin.ar.top[0].name} {tzs(fin.ar.top[0].amount)}</div>}
          </div>
        </div>

        {/* AP card */}
        <div style={{ ...cardBase, borderTop: '2px solid #ef4444' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: '#ef44440d', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={lbl}>Payables &amp; Debt</div>
            <Icon name="arrowUp" size={16} color="#ef444499" />
          </div>
          <div style={{ ...big, color: '#ef4444' }}>{tzs(fin.ap.suppliers + fin.ap.loans)}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            Suppliers {tzs(fin.ap.suppliers)} · Loans {tzs(fin.ap.loans)}
          </div>
        </div>
      </div>

      {/* P&L breakdown table */}
      <div style={{ ...cardBase, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Icon name="trendUp" size={15} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 13 }}>Profit &amp; Loss — {monthLabel}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          <PnlGroup title="Revenue" lines={fin.pnlBreakdown.revenue} total={fin.revenue.current} color="#10b981" />
          <PnlGroup title="Cost of Goods Sold" lines={fin.pnlBreakdown.cogs} total={fin.revenue.current - fin.grossProfit.current} color="#ef4444" negative />
          <PnlGroup title="Operating Expenses" lines={fin.pnlBreakdown.expenses} total={fin.expenses.current} color="#e0a458" negative />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12, fontWeight: 800, fontSize: 13 }}>
          <span style={{ color: 'var(--text)' }}>Net Profit — {monthLabel}</span>
          <span style={{ fontFamily: 'var(--mono)', color: fin.netProfit.current < 0 ? '#ef4444' : '#10b981', fontSize: 15 }}>
            {tzs(fin.netProfit.current)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── P&L group (breakdown table) ────────────────────────────────────────────
function PnlGroup({ title, lines, total, color, negative = false }: {
  title: string; lines: { code: string; name: string; value: number }[]; total: number; color: string; negative?: boolean
}) {
  return (
    <div>
      <div style={{ ...lbl, color, marginBottom: 8 }}>{title}</div>
      {lines.map(l => (
        <div key={l.code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', gap: 8, borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{negative ? `(${tzs(l.value)})` : tzs(l.value)}</span>
        </div>
      ))}
      {lines.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>None this month</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 7, fontWeight: 700, fontSize: 12.5 }}>
        <span style={{ color: 'var(--text)' }}>Total</span>
        <span style={{ fontFamily: 'var(--mono)', color }}>{negative ? `(${tzs(total)})` : tzs(total)}</span>
      </div>
    </div>
  )
}
