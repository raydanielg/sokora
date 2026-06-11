import { useState } from 'react'
import type { Page } from '../lib/types'
import { useAuth, canAccessPage } from '../lib/useAuth'
import { getActiveCompany } from '../lib/supabase'
import { useCompanySettings } from '../lib/useCompanySettings'

const VOUCHER_PAGES: Page[] = [
  'vouchers', 'cash-sale', 'cash-payment', 'cash-receipt', 'bank-payment',
  'bank-receipt', 'bank-transfer', 'petty-cash', 'contra', 'sales-invoice',
  'quotation', 'sales-return', 'debit-note', 'credit-note', 'purchase-order',
  'grn', 'purchase', 'purchase-invoice', 'purchase-return', 'opening-stock',
  'stock-adjustment', 'stock-transfer', 'journal-entry', 'internal-use',
  'proforma', 'proformas-list'
]
const SALES_PAGES: Page[]    = ['cash-sale','sales-invoice','sales-invoices-list','sales-day-book','sales-register','sales-return','quotation','debit-note','credit-note','proforma','proformas-list']
const IMPORT_PAGES: Page[]   = ['import-register','import-order']
const CRM_PAGES: Page[]      = ['crm','crm-hub','crm-inbox','crm-automations','crm-preorders','crm-referrals','crm-loyalty','crm-feedback','crm-upsell','crm-customers']
const SETTINGS_PAGES: Page[] = ['settings','users','approvals','accounting-settings','whatsapp-settings','location-settings','inventory-settings','receipt-template','invoice-template','report-templates','company-finance-settings','users-access-settings','sales-inventory-settings','templates-hub','integrations-settings','regional-backup-settings','display-settings']
const HRM_PAGES: Page[]      = ['hrm','hrm-employees','hrm-assets','hrm-payroll','hrm-payslips','hrm-payslip-template','hrm-leave','hrm-attendance','hrm-performance','hrm-recruitment','hrm-events','hrm-settings','hrm-kpi']

interface SubItem { label: string; page: Page; icon: string }

const HRM_SUB: SubItem[] = [
  { label: 'Dashboard',   page: 'hrm',             icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { label: 'Employees',   page: 'hrm-employees',   icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { label: 'Payroll',     page: 'hrm-payroll',     icon: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { label: 'Leave',       page: 'hrm-leave',       icon: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z' },
  { label: 'Attendance',  page: 'hrm-attendance',  icon: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 6v6l4 2' },
  { label: 'Events',      page: 'hrm-events',      icon: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18' },
  { label: 'KPI',         page: 'hrm-kpi',         icon: 'M3 3v18h18 M7 14l4-4 3 3 5-6' },
]

const SETTINGS_SUB: SubItem[] = [
  { label: 'General',    page: 'settings',             icon: 'M12 3a9 9 0 0 0-9 9v1h6v-1a3 3 0 0 1 6 0v1h6v-1a9 9 0 0 0-9-9zM3 14v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4' },
  { label: 'Users',      page: 'users',                icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
  { label: 'Approvals',  page: 'approvals',            icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { label: 'Accounting', page: 'accounting-settings',  icon: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { label: 'Reports',    page: 'report-templates',     icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8' },
]

const SALES_SUB: SubItem[] = [
  { label: 'Cash Sale',      page: 'cash-sale',          icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' },
  { label: 'Sales Invoice',  page: 'sales-invoice',      icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
  { label: 'Invoices List',  page: 'sales-invoices-list',icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h6' },
  { label: 'Proformas',      page: 'proformas-list',     icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 18v-6 M9 15h6' },
  { label: 'Day Book',       page: 'sales-day-book',     icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { label: 'Register',       page: 'sales-register',     icon: 'M18 20V10M12 20V4M6 20v-6' },
]

const CRM_SUB: SubItem[] = [
  { label: 'Hub',          page: 'crm-hub',          icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { label: 'Inbox',        page: 'crm-inbox',        icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' },
  { label: 'Automations',  page: 'crm-automations',  icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  { label: 'Pre-Orders',   page: 'crm-preorders',    icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
  { label: 'Referrals',    page: 'crm-referrals',    icon: 'M18 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98' },
  { label: 'Crown Loyalty',page: 'crm-loyalty',      icon: 'M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zM3 20h18' },
  { label: 'Feedback',     page: 'crm-feedback',     icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { label: 'Upsell',       page: 'crm-upsell',       icon: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6' },
]

interface SidebarProps { current: Page; onNav: (p: Page) => void }

function NavIcon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg width="15" height="15" fill="none"
      stroke={active ? 'var(--accent)' : 'var(--text3)'}
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path d={d}/>
    </svg>
  )
}

const NAV_ICONS: Record<string, string> = {
  home:      'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  vouchers:  'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8',
  accounts:  'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  bank:      'M3 10L12 3l9 7 M5 10v8a1 1 0 0 0 1 1h3v-5h6v5h3a1 1 0 0 0 1-1v-8 M9 21v-5 M15 21v-5',
  sales:     'M3 3h2l.4 2M7 13h10l4-8H5.4 M7 13l-2 5h12 M9 19a1 1 0 1 0 0 2 1 1 0 0 0 0-2 M18 19a1 1 0 1 0 0 2 1 1 0 0 0 0-2',
  customers: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  suppliers: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  ship:      'M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11 M14 9h4l4 4v4c0 .6-.4 1-1 1h-2 M7 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0 M9 18h5 M16 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  inventory: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96L12 12.01 20.73 6.96 M12 22.08V12',
  reports:   'M18 20V10 M12 20V4 M6 20v-6',
  crm:       'M21 11.5a8.38 8.38 0 0 1-.9 3.8A8.5 8.5 0 0 1 12 20a8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 8.5-8.5 8.5 8.5 0 0 1 8.5 8.5z',
  hrm:       'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  import:    'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  investors: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  settings:  'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  bundles:   'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
  dataimport:'M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1 M12 12V3 M8 8l4-5 4 5',
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="12" height="12" fill="none" stroke="var(--text3)" strokeWidth="2"
    viewBox="0 0 24 24"
    style={{ transition: 'transform .18s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
    <path d="M9 18l6-6-6-6"/>
  </svg>
)

function SubMenu({ items, current, onNav }: { items: SubItem[]; current: Page; onNav: (p: Page) => void }) {
  return (
    <div style={{ paddingBottom: 4 }}>
      {items.map(sub => {
        const active = current === sub.page
        return (
          <div
            key={sub.page}
            onClick={() => onNav(sub.page)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px 6px 36px',
              cursor: 'pointer',
              borderRadius: 6,
              margin: '1px 8px',
              background: active ? 'var(--accent-dim)' : 'transparent',
              transition: 'background .1s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
          >
            <NavIcon d={sub.icon} active={active} />
            <span style={{
              fontSize: 13, fontWeight: active ? 500 : 400,
              color: active ? 'var(--text)' : 'var(--text2)',
            }}>
              {sub.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function Sidebar({ current, onNav }: SidebarProps) {
  const [salesOpen, setSalesOpen]       = useState(false)
  const [crmOpen, setCrmOpen]           = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hrmOpen, setHrmOpen]           = useState(false)

  const { permissions, user } = useAuth()
  const company = getActiveCompany()
  const { settings: companySettings } = useCompanySettings()

  const canAccess = (page: Page) => canAccessPage(page, permissions)

  const visibleSalesSub    = SALES_SUB.filter(s => canAccess(s.page))
  const visibleCrmSub      = CRM_SUB.filter(s => canAccess(s.page))
  const visibleSettingsSub = SETTINGS_SUB.filter(s => canAccess(s.page))
  const visibleHrmSub      = HRM_SUB.filter(s => canAccess(s.page))

  const isVoucherActive  = VOUCHER_PAGES.includes(current) && !SALES_PAGES.includes(current)
  const isSalesActive    = SALES_PAGES.includes(current)
  const isCrmActive      = CRM_PAGES.includes(current)
  const isSettingsActive = SETTINGS_PAGES.includes(current)
  const isHrmActive      = HRM_PAGES.includes(current)
  const isImportActive   = IMPORT_PAGES.includes(current)

  type NavEntry =
    | { type: 'sep'; key: string }
    | { type: 'label'; text: string; key: string }
    | {
        type: 'item'
        key: string
        icon: string
        label: string
        page: Page
        hasSub?: boolean
        coming?: boolean
        hidden?: boolean
      }

  const NAV: NavEntry[] = [
    { type: 'item',  key: 'dashboard',  icon: 'home',      label: 'Dashboard',   page: 'dashboard' },
    { type: 'sep',   key: 's1' },
    { type: 'label', key: 'fin',        text: 'Finance' },
    { type: 'item',  key: 'vouchers',   icon: 'vouchers',  label: 'Vouchers',    page: 'vouchers' },
    { type: 'item',  key: 'accounts',   icon: 'accounts',  label: 'Accounts',    page: 'chart-of-accounts' },
    { type: 'item',  key: 'banks',      icon: 'bank',      label: 'Banks',       page: 'banks' },
    { type: 'item',  key: 'sales',      icon: 'sales',     label: 'Sales',       page: 'sales',        hasSub: true },
    { type: 'sep',   key: 's2' },
    { type: 'label', key: 'ops',        text: 'Operations' },
    { type: 'item',  key: 'customers',  icon: 'customers', label: 'Customers',   page: 'customers' },
    { type: 'item',  key: 'suppliers',  icon: 'suppliers', label: 'Suppliers',   page: 'suppliers' },
    { type: 'item',  key: 'imports',    icon: 'ship',      label: 'Imports',     page: 'import-register' },
    { type: 'item',  key: 'inventory',  icon: 'inventory', label: 'Inventory',   page: 'inventory' },
    ...(!company.hideBundles ? [{ type: 'item' as const, key: 'bundles', icon: 'bundles', label: 'Bundles', page: 'bundles' as Page }] : []),
    { type: 'item',  key: 'reports',    icon: 'reports',   label: 'Reports',     page: 'reports' },
    { type: 'sep',   key: 's3' },
    { type: 'label', key: 'modules',    text: 'Modules' },
    ...(company.showInvestors ? [{ type: 'item' as const, key: 'investors', icon: 'investors', label: 'Investors', page: 'investors-hub' as Page }] : []),
    ...(!company.hideCRM ? [{ type: 'item' as const, key: 'crm', icon: 'crm', label: 'CRM', page: 'crm-hub' as Page, hasSub: true }] : []),
    { type: 'item',  key: 'hrm',        icon: 'hrm',       label: 'HR Management', page: 'hrm',       hasSub: true },
    { type: 'sep',   key: 's4' },
    { type: 'item',  key: 'dataimport', icon: 'dataimport',label: 'Data Import', page: 'data-import' },
    { type: 'item',  key: 'settings',   icon: 'settings',  label: 'Settings',    page: 'settings',  hasSub: true },
  ]

  const toggle = (which: 'sales'|'crm'|'settings'|'hrm') => {
    setSalesOpen(o => which === 'sales' ? !o : false)
    setCrmOpen(o => which === 'crm' ? !o : false)
    setSettingsOpen(o => which === 'settings' ? !o : false)
    setHrmOpen(o => which === 'hrm' ? !o : false)
  }

  return (
    <aside style={{
      width: 'var(--sidebar)',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      scrollbarWidth: 'none',
    }}>
      {/* ── Logo ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
      }} onClick={() => onNav('dashboard')}>
        <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="9" fill="#6366f1"/>
          <path d="M10 26C10 22 13 20 17 20C21 20 23 18 23 14" stroke="white" strokeWidth="3" strokeLinecap="round"/>
          <path d="M17 20C21 20 24 22 27 24C30 26 30 30 27 30" stroke="#a5b4fc" strokeWidth="3" strokeLinecap="round"/>
          <circle cx="10" cy="26" r="2.5" fill="white"/>
          <circle cx="27" cy="30" r="2.5" fill="#a5b4fc"/>
          <circle cx="23" cy="14" r="2.5" fill="white"/>
        </svg>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>
          SOKORA
        </span>
      </div>

      {/* ── Nav items ── */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {NAV.map(entry => {
          if (entry.type === 'sep') {
            return <div key={entry.key} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          }
          if (entry.type === 'label') {
            return (
              <div key={entry.key} style={{
                padding: '8px 16px 4px',
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text3)',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                fontFamily: 'var(--mono)',
              }}>
                {entry.text}
              </div>
            )
          }

          const { icon, label, page, hasSub, coming } = entry

          const isActive =
            current === page ||
            (page === 'vouchers'        && isVoucherActive) ||
            (page === 'sales'           && isSalesActive) ||
            (page === 'import-register' && isImportActive) ||
            (page === 'crm-hub'         && isCrmActive) ||
            (page === 'settings'        && isSettingsActive) ||
            (page === 'hrm'             && isHrmActive)

          const isOpen =
            (page === 'sales'    && (salesOpen    || isSalesActive)) ||
            (page === 'crm-hub'  && (crmOpen      || isCrmActive)) ||
            (page === 'settings' && (settingsOpen  || isSettingsActive)) ||
            (page === 'hrm'      && (hrmOpen       || isHrmActive))

          const d = NAV_ICONS[icon] || NAV_ICONS['home']

          return (
            <div key={entry.key}>
              <div
                onClick={() => {
                  if (coming) return
                  if (page === 'sales')    { toggle('sales');    onNav('sales') }
                  else if (page === 'crm-hub')  { toggle('crm');     onNav('crm-hub') }
                  else if (page === 'settings') { toggle('settings'); onNav('settings') }
                  else if (page === 'hrm')      { toggle('hrm');      onNav('hrm') }
                  else {
                    setSalesOpen(false); setCrmOpen(false)
                    setSettingsOpen(false); setHrmOpen(false)
                    onNav(page)
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  margin: '1px 8px',
                  borderRadius: 6,
                  cursor: coming ? 'default' : 'pointer',
                  background: isActive ? 'var(--accent-dim)' : 'transparent',
                  opacity: coming ? 0.4 : 1,
                  transition: 'background .1s',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!isActive && !coming) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <NavIcon d={d} active={isActive} />
                <span style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? 'var(--text)' : 'var(--text2)',
                  letterSpacing: '-0.1px',
                }}>
                  {label}
                </span>
                {hasSub && <ChevronIcon open={isOpen} />}
                {coming && (
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--mono)',
                    color: 'var(--text3)', background: 'var(--surface3)',
                    border: '1px solid var(--border)', borderRadius: 4,
                    padding: '1px 4px', letterSpacing: '.5px',
                  }}>
                    SOON
                  </span>
                )}
              </div>

              {/* Sub-menus */}
              {page === 'sales'    && isOpen && <SubMenu items={visibleSalesSub}    current={current} onNav={onNav} />}
              {page === 'crm-hub'  && isOpen && <SubMenu items={visibleCrmSub}      current={current} onNav={onNav} />}
              {page === 'settings' && isOpen && <SubMenu items={visibleSettingsSub} current={current} onNav={onNav} />}
              {page === 'hrm'      && isOpen && <SubMenu items={visibleHrmSub}      current={current} onNav={onNav} />}
            </div>
          )
        })}
      </nav>

      {/* ── Workspace + User footer ── */}
      <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        {/* Company identity */}
        <div style={{
          padding: '10px 14px 8px',
          display: 'flex', alignItems: 'center', gap: 9,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7,
            background: `${company.color}22`,
            border: `1px solid ${company.color}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            fontSize: 12, fontWeight: 800, color: company.color,
            letterSpacing: '-0.3px',
          }}>
            {(companySettings.company_name || 'W').charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
              {companySettings.company_name || company.shortName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 1 }}>
              {company.hideCRM ? 'Wholesale' : 'Retail + CRM'}
            </div>
          </div>
          <div style={{
            fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700,
            color: '#10b981', background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.2)', borderRadius: 4,
            padding: '2px 5px', letterSpacing: '.3px', flexShrink: 0,
          }}>LIVE</div>
        </div>

        {/* User identity */}
        {user && (
          <div style={{
            padding: '8px 14px 10px',
            display: 'flex', alignItems: 'center', gap: 8,
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              fontSize: 10, fontWeight: 800, color: '#fff',
              letterSpacing: '-0.3px',
            }}>
              {user.initials || user.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.full_name}
              </div>
              <div style={{ fontSize: 9.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
                {user.email}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
