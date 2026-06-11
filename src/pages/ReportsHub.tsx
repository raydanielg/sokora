import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

import React from "react"

const RIcon = ({ name }: { name: string }) => {
  const p = { width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  const icons: Record<string, React.ReactNode> = {
    pnl:      <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    balance:  <svg {...p}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
    trial:    <svg {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
    ar:       <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
    ap:       <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
    stock:    <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/></svg>,
    daybook:  <svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
    register: <svg {...p}><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/></svg>,
    procure:  <svg {...p}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>,
    payment:  <svg {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
    ship:     <svg {...p}><path d="M2 20a2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1"/><path d="M4 18l-2-7h20l-2 7"/><path d="M12 11V4"/><path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/></svg>,
  }
  return <>{icons[name] ?? icons.register}</>
}

export default function ReportsHub({ onNav }: Props) {
  const SECTIONS = [
    {
      title: 'Financial Statements', reports: [
        { name: 'Profit & Loss', icon: 'pnl', page: 'pnl' as Page, desc: 'Income vs expenses · Live' },
        { name: 'Balance Sheet', icon: 'balance', page: 'balance-sheet' as Page, desc: 'Assets = Liabilities + Equity' },
        { name: 'Trial Balance', icon: 'trial', page: 'trial-balance' as Page, desc: 'All account balances · Balanced check' },
      ]
    },
    {
      title: 'Receivables & Payables', reports: [
        { name: 'AR Aging', icon: 'ar', page: 'ar-aging' as Page, desc: 'Who owes you · By age bucket' },
        { name: 'AP Aging', icon: 'ap', page: 'ap-aging' as Page, desc: 'What you owe · Supplier dues' },
      ]
    },
    {
      title: 'Inventory', reports: [
        { name: 'Stock Valuation', icon: 'stock', page: 'stock-valuation' as Page, desc: 'Inventory at cost · Margin analysis' },
        { name: 'Stock Transfer Register', icon: 'register', page: 'stock-transfer-register' as Page, desc: 'All location transfers · PDF · CSV' },
        { name: 'Internal Use Report', icon: 'register', page: 'internal-use-report' as Page, desc: 'Samples · own use · damage · training' },
      ]
    },
    {
      title: 'Registers', reports: [
        { name: 'Sales Day Book', icon: 'daybook', page: 'sales-day-book' as Page, desc: 'Full sales detail with filters' },
        { name: 'Sales Register', icon: 'register', page: 'sales-register' as Page, desc: 'All sales in date order' },
        { name: 'Purchase Register', icon: 'procure', page: 'purchase-register' as Page, desc: 'All purchase transactions' },
        { name: 'Payment Register', icon: 'payment', page: 'payment-register' as Page, desc: 'All cash and bank movements (in + out)' },
        { name: 'Expense Register', icon: 'payment', page: 'expense-register' as Page, desc: 'Money leaving the business · payments + petty cash' },
        { name: 'Import Register', icon: 'ship', page: 'import-register' as Page, desc: 'Multi-stage purchases · KPIs · PDFs' },
      ]
    },
  ]
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-sub">Financial statements and registers — all live from transactions</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm">Print</button>
          <button className="btn btn-primary btn-sm">Export</button>
        </div>
      </div>

      {SECTIONS.map((section, si) => (
        <div key={si} style={{ marginBottom: 24 }}>
          <div className="section-label">
            <div className="section-bar"></div>
            <div className="section-title-txt">{section.title}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
            {section.reports.map((r, ri) => (
              <div key={ri} className="card card-sm" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => onNav(r.page)}>
                <div style={{ width: 36, height: 36, background: 'var(--accent-dim)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}><RIcon name={r.icon} /></div>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
