import { useState, useEffect, lazy, Suspense, createContext, useContext, useCallback, ReactNode } from 'react'
import { BREADCRUMBS } from './lib/data'
import type { Page } from './lib/types'
import { AuthProvider, useAuth, canAccessPage } from './lib/useAuth'
import { SettingsProvider } from './lib/settingsLoader'
import { useInactivityLogout } from './lib/useInactivityLogout'
import { supabase } from './lib/supabase'
import type { HRMViewMode } from './pages/hrm/hrmTypes'

import Topbar from './components/Topbar'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Landing from './pages/Landing'
import Register from './pages/Register'

// ============================================================================
// PERFORMANCE: Eager load core pages (used immediately)
// ============================================================================
import Dashboard from './pages/Dashboard'
import ComingSoon from './pages/ComingSoon'

// ============================================================================
// PERFORMANCE: Lazy load everything else (loaded on demand)
// ============================================================================

// Accounting & Core
const ChartOfAccounts = lazy(() => import('./pages/ChartOfAccounts'))
const Inventory = lazy(() => import('./pages/Inventory'))
const ReportsHub = lazy(() => import('./pages/ReportsHub'))
const Banks = lazy(() => import('./pages/Banks'))
const Customers = lazy(() => import('./pages/Customers'))
const CustomerStatement = lazy(() => import('./pages/CustomerStatement'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const Settings = lazy(() => import('./pages/Settings'))
const DataImport = lazy(() => import('./pages/DataImport'))

// Reports
const PnL = lazy(() => import('./pages/PnL'))
const SalesRegister = lazy(() => import('./pages/SalesRegister'))
const SalesDayBook = lazy(() => import('./pages/SalesDayBook'))
const SalesInvoicesList = lazy(() => import('./pages/SalesInvoicesList'))
const TrialBalance = lazy(() => import('./pages/TrialBalance'))
const BalanceSheet = lazy(() => import('./pages/BalanceSheet'))
const ARAgingReport = lazy(() => import('./pages/ARAgingReport'))
const APAgingReport = lazy(() => import('./pages/APAgingReport'))
const StockValuationReport = lazy(() => import('./pages/StockValuationReport'))
const PurchaseRegister = lazy(() => import('./pages/PurchaseRegister'))
const PaymentRegister = lazy(() => import('./pages/PaymentRegister'))
const StockTransferRegister = lazy(() => import('./pages/StockTransferRegister'))
const ImportRegister = lazy(() => import('./pages/ImportRegister'))

// Settings Pages
const ReceiptTemplatePage = lazy(() => import('./pages/ReceiptTemplate'))
const InvoiceTemplatePage = lazy(() => import('./pages/InvoiceTemplate'))
const ProformaTemplatePage = lazy(() => import('./pages/ProformaTemplate'))
const WhatsAppSettings = lazy(() => import('./pages/WhatsAppSettings'))
const LocationSettings = lazy(() => import('./pages/LocationSettings'))
const InventorySettings = lazy(() => import('./pages/InventorySettings'))
const AccountingSettings = lazy(() => import('./pages/AccountingSettings'))
const DisplaySettings = lazy(() => import('./pages/DisplaySettings'))
const ReportTemplates = lazy(() => import('./pages/ReportTemplates'))
const CompanyFinanceSettings = lazy(() => import('./pages/CompanyFinanceSettings'))
const UsersAccessSettings = lazy(() => import('./pages/UsersAccessSettings'))
const SalesInventorySettings = lazy(() => import('./pages/SalesInventorySettings'))
const TemplatesHub = lazy(() => import('./pages/TemplatesHub'))
const CompanyBranding = lazy(() => import('./pages/CompanyBranding'))
const IntegrationsSettings = lazy(() => import('./pages/IntegrationsSettings'))
const RegionalBackupSettings = lazy(() => import('./pages/RegionalBackupSettings'))

// User Management & Approvals
const UserManagement = lazy(() => import('./pages/UserManagement'))
const ApprovalWorkflows = lazy(() => import('./pages/ApprovalWorkflows'))
const ApprovalsSettings = lazy(() => import('./pages/ApprovalsSettings'))

// Bundles
const Bundles = lazy(() => import('./pages/Bundles'))

// Pricing
const PricingPage = lazy(() => import('./pages/PricingPage'))

// Investors
const InvestorsHub = lazy(() => import('./pages/InvestorsHub'))

// Vouchers
const VouchersHub = lazy(() => import('./pages/vouchers/VouchersHub'))
const CashPayment = lazy(() => import('./pages/vouchers/CashPayment'))
const CashReceipt = lazy(() => import('./pages/vouchers/CashReceipt'))
// BankReceipt was a redundant 14-line wrapper; CustomerReceiptBatch was
// the standalone batch page. Both functions are now folded into the
// unified Receipt Voucher (CashReceipt). The route aliases below keep
// old URLs working.
const BankTransfer = lazy(() => import('./pages/vouchers/BankTransfer'))
const ContraEntry = lazy(() => import('./pages/vouchers/ContraEntry'))
const PettyCash = lazy(() => import('./pages/vouchers/PettyCash'))
const CashSale = lazy(() => import('./pages/vouchers/CashSale'))
const SalesInvoice = lazy(() => import('./pages/vouchers/SalesInvoice'))
const ProformaInvoice = lazy(() => import('./pages/vouchers/ProformaInvoice'))
const ProformasList = lazy(() => import('./pages/ProformasList'))
const SalesReturn = lazy(() => import('./pages/vouchers/SalesReturn'))
const DebitNote = lazy(() => import('./pages/vouchers/DebitNote'))
const CreditNote = lazy(() => import('./pages/vouchers/CreditNote'))
const PurchaseOrder = lazy(() => import('./pages/vouchers/PurchaseOrder'))
const GRN = lazy(() => import('./pages/vouchers/GRN'))
const Purchase = lazy(() => import('./pages/vouchers/Purchase'))
const PurchaseInvoice = lazy(() => import('./pages/vouchers/PurchaseInvoice'))
const PurchaseReturn = lazy(() => import('./pages/vouchers/PurchaseReturn'))
const OpeningStock = lazy(() => import('./pages/vouchers/OpeningStock'))
const StockAdjustment = lazy(() => import('./pages/vouchers/StockAdjustment'))
const StockTransfer = lazy(() => import('./pages/vouchers/StockTransfer'))
const JournalEntry = lazy(() => import('./pages/vouchers/JournalEntry'))
const ImportOrder = lazy(() => import('./pages/vouchers/ImportOrder'))
const InternalUse = lazy(() => import('./pages/vouchers/InternalUse'))
const InternalUseReport = lazy(() => import('./pages/reports/InternalUseReport'))

// CRM Module (lazy - entire module loads on first CRM page visit)
const CRMHub = lazy(() => import('./pages/CRMHub'))
const CRMCommandCenter = lazy(() => import('./pages/crm/CRMCommandCenter'))
const CRMInbox = lazy(() => import('./pages/CRMInbox'))
const CRMAutomations = lazy(() => import('./pages/CRMAutomations'))
const CRMPreorders = lazy(() => import('./pages/CRMPreorders'))
const CRMReferrals = lazy(() => import('./pages/CRMReferrals'))
const CRMLoyalty = lazy(() => import('./pages/CRMLoyalty'))
const CRMFeedback = lazy(() => import('./pages/CRMFeedback'))
const CRMUpsell = lazy(() => import('./pages/CRMUpsell'))
const WhatsAppTemplates = lazy(() => import('./pages/crm/WhatsAppTemplates'))
const WhatsAppResources = lazy(() => import('./pages/crm/WhatsAppResources'))
const Waitlist = lazy(() => import('./pages/crm/Waitlist'))

// HRM Module (lazy - loads on first HRM page visit)
const HRMDashboard = lazy(() => import('./pages/hrm/HRMDashboard'))
const HRMEmployees = lazy(() => import('./pages/hrm/HRMEmployees'))
const HRMAssets = lazy(() => import('./pages/hrm/HRMAssets'))
const HRMPayroll = lazy(() => import('./pages/hrm/HRMPayroll'))
const HRMPayslips = lazy(() => import('./pages/hrm/HRMPayslips'))
const HRMPayslipTemplate = lazy(() => import('./pages/hrm/HRMPayslipTemplate'))
const HRMLeave = lazy(() => import('./pages/hrm/HRMLeave'))
const HRMAttendance = lazy(() => import('./pages/hrm/HRMAttendance'))
const HRMPerformance = lazy(() => import('./pages/hrm/HRMPerformance'))
const HRMKpi = lazy(() => import('./pages/hrm/HRMKpi'))
const HRMRecruitment = lazy(() => import('./pages/hrm/HRMRecruitment'))
const HRMEvents = lazy(() => import('./pages/hrm/HRMEvents'))
const HRMSettings = lazy(() => import('./pages/hrm/HRMSettings'))

// ============================================================================
// PERFORMANCE: Global Data Cache Context
// ============================================================================
interface CacheData {
  products?: any[]
  accounts?: any[]
  customers?: any[]
  vouchers?: any[]
  ledger?: any[]
  banks?: any[]
  suppliers?: any[]
  users?: any[]
  roles?: any[]
  [key: string]: any[] | undefined
}

interface CacheContextType {
  cache: CacheData
  setCache: (key: string, data: any[]) => void
  getCache: (key: string) => any[] | undefined
  invalidate: (key: string) => void
  invalidateAll: () => void
  lastFetch: Record<string, number>
  isStale: (key: string, maxAgeMs?: number) => boolean
}

const CacheContext = createContext<CacheContextType | null>(null)

export function useDataCache() {
  const ctx = useContext(CacheContext)
  if (!ctx) throw new Error('useDataCache must be used within CacheProvider')
  return ctx
}

function CacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCacheState] = useState<CacheData>({})
  const [lastFetch, setLastFetch] = useState<Record<string, number>>({})

  const setCache = useCallback((key: string, data: any[]) => {
    setCacheState(prev => ({ ...prev, [key]: data }))
    setLastFetch(prev => ({ ...prev, [key]: Date.now() }))
  }, [])

  const getCache = useCallback((key: string) => cache[key], [cache])

  const invalidate = useCallback((key: string) => {
    setCacheState(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setLastFetch(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const invalidateAll = useCallback(() => {
    setCacheState({})
    setLastFetch({})
  }, [])

  const isStale = useCallback((key: string, maxAgeMs = 60000) => {
    const last = lastFetch[key]
    if (!last) return true
    return Date.now() - last > maxAgeMs
  }, [lastFetch])

  return (
    <CacheContext.Provider value={{ cache, setCache, getCache, invalidate, invalidateAll, lastFetch, isStale }}>
      {children}
    </CacheContext.Provider>
  )
}

// ============================================================================
// PERFORMANCE: Loading Fallback Component
// ============================================================================
const PageLoader = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text3)',
    gap: 12
  }}>
    <div style={{
      width: 20,
      height: 20,
      border: '2px solid var(--border)',
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite'
    }} />
    <span style={{ fontSize: 13 }}>Loading...</span>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
)

// Access Denied Component
// Shown when the current user lacks the permission required for a page.
// Two adjustments matter for non-technical users:
//   • Always give them a way back (the previous version stranded them
//     on a dead-end screen).
//   • Special-case the `approvals` page: cashiers and other submitters
//     reach it by accident (e.g. clicking the sidebar link, or by an
//     old voucher that used to redirect them here after submission).
//     They aren't doing anything wrong — they just don't have approver
//     rights. The message should reflect that.
const AccessDenied = ({ page, onNav }: { page: string; onNav?: (p: any) => void }) => {
  const isApprovalsPage = page === 'approvals'
  const title = isApprovalsPage ? 'You\'re not an approver' : 'You don\'t have access here'
  const body = isApprovalsPage
    ? 'This page is for managers who review and approve pending requests. Any expense or voucher you submitted for approval will show up in your vouchers list once it\'s been approved — you don\'t need to be here for that to happen.'
    : 'You don\'t have permission to open this page. If you think you should, ask an admin to update your access.'
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: 'var(--text3)',
      gap: 16,
      padding: 40,
      textAlign: 'center',
      maxWidth: 520,
      margin: '0 auto',
    }}>
      <svg width="48" height="48" fill="none" stroke="var(--text3)" strokeWidth="1.5" viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          {body}
        </div>
        <div style={{ fontSize: 11, marginTop: 12, fontFamily: 'var(--mono)', color: 'var(--text3)', opacity: 0.6 }}>
          {page}
        </div>
      </div>
      {onNav && (
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onNav('vouchers')}
          >
            Go to Vouchers
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onNav('dashboard')}
          >
            Go to Home
          </button>
        </div>
      )}
    </div>
  )
}

// Extended breadcrumbs for CRM and Settings
const EXTENDED_BREADCRUMBS: Record<string, string> = {
  'crm-hub': 'CRM Hub',
  'crm-command-center': 'CRM / Command Center',
  'crm-inbox': 'CRM / Inbox',
  'crm-automations': 'CRM / Automations',
  'crm-preorders': 'CRM / Pre-Orders',
  'crm-referrals': 'CRM / Referrals',
  'crm-loyalty': 'CRM / Crown Rewards',
  'crm-feedback': 'CRM / Feedback',
  'crm-upsell': 'CRM / Upsell Engine',
  'crm-whatsapp-templates': 'CRM / WhatsApp Templates',
  'crm-whatsapp-resources': 'CRM / Resources',
  'crm-waitlist': 'CRM / Waitlist',
  'users': 'Settings / User Management',
  'approvals': 'Settings / Approval Workflows',
  'approvals-settings': 'Settings / Approval Rules',
  'accounting-settings': 'Settings / Accounting',
  'display-settings': 'Settings / Display',
  'report-templates': 'Settings / Report Templates',
  'suppliers': 'Suppliers',
  'investors-hub': 'Investors Hub',
  'import-order': 'Import Orders',
  'purchase': 'Purchase',
  'internal-use': 'Internal Use',
  'internal-use-report': 'Internal Use Report',
  // HRM Module
  'hrm': 'HR Dashboard',
  'hrm-employees': 'HRM / Employees',
  'hrm-assets': 'HRM / Asset Allocation',
  'hrm-payroll': 'HRM / Payroll',
  'hrm-payslips': 'HRM / Payslips',
  'hrm-payslip-template': 'HRM / Payslip Template',
  'hrm-leave': 'HRM / Leave',
  'hrm-attendance': 'HRM / Attendance',
  'hrm-performance': 'HRM / Performance',
  'hrm-kpi': 'HRM / KPI Scorecards',
  'hrm-recruitment': 'HRM / Recruitment',
  'hrm-events': 'HRM / Events',
  'hrm-settings': 'HRM / Settings',
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

function AppContent() {
  // ── URL-based routing helpers ───────────────────────────────────
  // Pages use window.location.hash as a URL so browser back/forward and
  // page reload preserve the current view. e.g. .../#/inventory
  // Nothing about component signatures changed — navigate() still takes
  // a Page string, it just also updates the hash now.
  const hashToPage = (): Page => {
    const raw = window.location.hash.replace(/^#\/?/, '').trim()
    // Empty hash → dashboard. Any non-empty value is trusted as a Page
    // because canAccessPage() below will reject invalid/forbidden routes
    // and fall through to a ComingSoon/access-denied render.
    return (raw || 'dashboard') as Page
  }
  const pageToHash = (p: Page) => {
    const target = `#/${p}`
    if (window.location.hash !== target) window.location.hash = target
  }

  const [page, setPage] = useState<Page>(() => hashToPage())
  const [history, setHistory] = useState<Page[]>([])
  const [editVoucherId, setEditVoucherId] = useState<string | null>(null)
  const [statementCustomerId, setStatementCustomerId] = useState<string | null>(null)
  const [receiptPrefill, setReceiptPrefill] = useState<{ customerId?: string; amount?: number } | null>(null)
  const { user, permissions, loading: authLoading, isAuthenticated, refreshUser, can, canAny, isSuperAdmin } = useAuth()
  useInactivityLogout()

  // Keep internal page state in sync with browser back/forward buttons
  // and manual URL edits. The hashchange event fires for both.
  useEffect(() => {
    const onHashChange = () => {
      const next = hashToPage()
      setPage(prev => (prev === next ? prev : next))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // On first render, if the hash is empty, write the default into it
  // so reload stays on dashboard rather than "no hash" ambiguity.
  useEffect(() => {
    if (!window.location.hash) pageToHash(page)
  }, [])

  // ── HRM Mode: Self vs Company ──────────────────────────
  const [hrmMode, setHrmMode] = useState<HRMViewMode>('self')
  const [linkedEmployeeId, setLinkedEmployeeId] = useState<string | null>(null)
  const [hrmLinked, setHrmLinked] = useState(false)

  // Determine HRM access level
  const hrmCanManage = isSuperAdmin() || canAny(['hrm.manage', 'hrm.view_all', 'hrm.view', 'hrm.payroll'])
  const hrmSelfOnly = !hrmCanManage && can('hrm.view_own')

  // Link logged-in user to their employee record (by email)
  useEffect(() => {
    if (!user?.email) return
    const linkEmployee = async () => {
      const { data } = await supabase
        .from('hrm_employees')
        .select('id')
        .eq('email', user.email.toLowerCase())
        .eq('is_active', true)
        .single()
      setLinkedEmployeeId(data?.id || null)
      setHrmLinked(true)
      // Self-only users always stay in self mode
      if (hrmSelfOnly) setHrmMode('self')
    }
    linkEmployee()
  }, [user?.email])

  // For self-only users, force self mode
  const effectiveHrmMode = hrmSelfOnly ? 'self' : hrmMode

  const navigate = (p: Page) => {
    if (p !== 'cash-receipt') setReceiptPrefill(null)   // clear stale prefill when leaving the receipt page
    setHistory(h => [...h.slice(-19), page])
    setPage(p)
    pageToHash(p)
  }

  const navigateToEdit = (p: Page, voucherId: string) => {
    setEditVoucherId(voucherId)
    navigate(p)
  }

  const navigateToStatement = (customerId: string) => {
    setStatementCustomerId(customerId)
    navigate('customer-statement')
  }
  const navigateToReceipt = (customerId: string, amount: number) => {
    setReceiptPrefill({ customerId, amount })
    navigate('cash-receipt')
  }

  const goBack = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setPage(prev)
    pageToHash(prev)
  }

  const [authView, setAuthView] = useState<'landing' | 'login' | 'register'>('landing')

  // Show loading while checking auth
  if (authLoading) {
    return <PageLoader />
  }

  // Show public screens if not authenticated
  if (!isAuthenticated) {
    if (authView === 'landing') {
      return (
        <Landing
          onGetStarted={() => setAuthView('register')}
          onSignIn={() => setAuthView('login')}
        />
      )
    }
    if (authView === 'register') {
      return (
        <Register
          onBack={() => setAuthView('login')}
          onSuccess={() => setAuthView('login')}
        />
      )
    }
    return (
      <Login
        onLogin={refreshUser}
        onRegister={() => setAuthView('register')}
      />
    )
  }

  // Check if current user can access the page
  const hasAccess = canAccessPage(page, permissions)

  const renderPage = () => {
    // Show access denied if user doesn't have permission
    if (!hasAccess && !authLoading) {
      return <AccessDenied page={page} onNav={navigate} />
    }

    switch (page) {
      // Eager loaded (no Suspense needed)
      case 'dashboard':         return <Dashboard onNav={navigate} />
      
      // Lazy loaded pages
      case 'vouchers':          return <VouchersHub onNav={navigate} />
      case 'chart-of-accounts': return <ChartOfAccounts />
      case 'inventory':         return <Inventory onNav={navigate} />
      case 'reports':           return <ReportsHub onNav={navigate} />
      case 'pnl':               return <PnL />
      case 'sales-register':    return <SalesRegister onEdit={navigateToEdit} />
      case 'sales-day-book':    return <SalesDayBook onNav={navigate} onEdit={navigateToEdit} />
      case 'sales-invoices-list': return <SalesInvoicesList onNav={navigate} onEdit={navigateToEdit} />
      case 'trial-balance':     return <TrialBalance />
      case 'balance-sheet':     return <BalanceSheet />
      case 'ar-aging':          return <ARAgingReport />
      case 'ap-aging':          return <APAgingReport />
      case 'stock-valuation':   return <StockValuationReport />
      case 'purchase-register': return <PurchaseRegister />
      case 'payment-register':  return <PaymentRegister onEdit={navigateToEdit} />
      case 'expense-register':  return <PaymentRegister onEdit={navigateToEdit} mode="expense" />
      case 'import-register':   return <ImportRegister onNav={navigate} />
      case 'receipt-template':  return <ReceiptTemplatePage />
      case 'invoice-template':  return <InvoiceTemplatePage />
      case 'proforma-template': return <ProformaTemplatePage />
      case 'whatsapp-settings': return <WhatsAppSettings />
      case 'location-settings': return <LocationSettings />
      case 'inventory-settings': return <InventorySettings onNav={navigate} />
      case 'pricelist-template': return <PricingPage onNav={navigate} />
      case 'banks':             return <Banks />
      case 'settings':          return <Settings onNav={navigate} />
      case 'cash-payment':      return <CashPayment onNav={navigate} />
      case 'bank-payment':      return <CashPayment onNav={navigate} />  // legacy alias — single Payment Voucher handles both
      case 'cash-receipt':              return <CashReceipt onNav={navigate} prefill={receiptPrefill ?? undefined} />
      // Legacy routes: 'bank-receipt' was a redundant variant; the new
      // unified Receipt Voucher handles cash, bank, and batch. Old URLs
      // and bookmarks still resolve here. 'customer-receipt-batch' was
      // the standalone batch page from session 2; its UI is now a tab
      // inside the unified page.
      case 'bank-receipt':              return <CashReceipt onNav={navigate} />
      case 'customer-receipt-batch':    return <CashReceipt onNav={navigate} />
      case 'bank-transfer':     return <BankTransfer onNav={navigate} />
      case 'petty-cash':        return <PettyCash onNav={navigate} />
      case 'contra':            return <ContraEntry onNav={navigate} />
      case 'cash-sale':         return <CashSale editVoucherId={editVoucherId} onClearEdit={() => setEditVoucherId(null)} onNav={navigate} />
      case 'sales':             return <CashSale editVoucherId={editVoucherId} onClearEdit={() => setEditVoucherId(null)} onNav={navigate} />
      case 'sales-invoice':     return <SalesInvoice onNav={navigate} editVoucherId={editVoucherId || undefined} onClearEdit={() => setEditVoucherId(null)} />
      case 'proforma':          return <ProformaInvoice onNav={navigate} editVoucherId={editVoucherId || undefined} onClearEdit={() => setEditVoucherId(null)} />
      case 'proformas-list':    return <ProformasList onNav={navigate} onEdit={navigateToEdit} />
      case 'sales-return':      return <SalesReturn onNav={navigate} />
      case 'debit-note':        return <DebitNote onNav={navigate} />
      case 'credit-note':       return <CreditNote onNav={navigate} />
      case 'purchase-order':    return <PurchaseOrder onNav={navigate} />
      case 'grn':               return <GRN onNav={navigate} />
      case 'purchase-invoice':  return <PurchaseInvoice onNav={navigate} />
      case 'purchase':          return <Purchase onNav={navigate} />
      case 'purchase-return':   return <PurchaseReturn onNav={navigate} />
      case 'opening-stock':     return <OpeningStock onNav={navigate} />
      case 'stock-adjustment':  return <StockAdjustment onNav={navigate} />
      case 'stock-transfer':    return <StockTransfer onNav={navigate} />
      case 'stock-transfer-register': return <StockTransferRegister />
      case 'customers':         return <Customers onNav={navigate} onViewStatement={navigateToStatement} onReceipt={navigateToReceipt} />
      case 'customer-statement':
        if (!statementCustomerId) { navigate('customers'); return null }
        return <CustomerStatement customerId={statementCustomerId} onNav={navigate} />
      case 'suppliers':         return <Suppliers onNav={navigate} />
      case 'journal-entry':     return <JournalEntry onNav={navigate} />
      case 'import-order':      return <ImportOrder onNav={navigate} />
      case 'internal-use':      return <InternalUse onNav={navigate} />
      case 'internal-use-report': return <InternalUseReport onNav={navigate} />
      case 'data-import':       return <DataImport />
      case 'bundles':           return <Bundles />
      
      // User Management & Approvals
      case 'users':             return <UserManagement onNav={navigate} />
      case 'approvals':         return <ApprovalWorkflows onNav={navigate} />
      case 'approvals-settings':return <ApprovalsSettings onNav={navigate} />
      case 'accounting-settings': return <AccountingSettings />
      case 'display-settings':  return <DisplaySettings />
      case 'report-templates':  return <ReportTemplates />
      case 'company-finance-settings':  return <CompanyFinanceSettings onNav={navigate} />
      case 'users-access-settings':     return <UsersAccessSettings onNav={navigate} />
      case 'sales-inventory-settings':  return <SalesInventorySettings onNav={navigate} />
      case 'templates-hub':             return <TemplatesHub onNav={navigate} />
      case 'company-branding':          return <CompanyBranding onNav={navigate} />
      case 'integrations-settings':     return <IntegrationsSettings onNav={navigate} />
      case 'regional-backup-settings':  return <RegionalBackupSettings onNav={navigate} />

      // Investors
      case 'investors':
      case 'investors-hub':     return <InvestorsHub />
      
      // CRM Module Routes
      case 'crm':
      case 'crm-hub':           return <CRMHub onNav={navigate} />
      case 'crm-command-center': return <CRMCommandCenter onNav={navigate} />
      case 'crm-inbox':         return <CRMInbox />
      case 'crm-automations':   return <CRMAutomations onNav={navigate} />
      case 'crm-preorders':     return <CRMPreorders onNav={navigate} />
      case 'crm-referrals':     return <CRMReferrals onNav={navigate} />
      case 'crm-loyalty':       return <CRMLoyalty onNav={navigate} />
      case 'crm-feedback':      return <CRMFeedback onNav={navigate} />
      case 'crm-upsell':        return <CRMUpsell onNav={navigate} />
      case 'crm-whatsapp-templates': return <WhatsAppTemplates onNav={navigate} />
      case 'crm-whatsapp-resources': return <WhatsAppResources onNav={navigate} />
      case 'crm-waitlist': return <Waitlist onNav={navigate} />
      case 'crm-customers':     return <Customers onNav={navigate} onViewStatement={navigateToStatement} onReceipt={navigateToReceipt} />
      
      // HRM Module Routes — pass mode, linked employee, and manage permission
      case 'hrm':               return <HRMDashboard onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-employees':     return <HRMEmployees onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-assets':        return <HRMAssets onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-payroll':       return <HRMPayroll onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-payslips':      return <HRMPayslips onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-payslip-template': return <HRMPayslipTemplate onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-leave':         return <HRMLeave onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-attendance':    return <HRMAttendance onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-performance':   return <HRMPerformance onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-kpi':           return <HRMKpi onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-recruitment':   return <HRMRecruitment onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-events':        return <HRMEvents onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      case 'hrm-settings':      return <HRMSettings onNav={navigate} hrmMode={effectiveHrmMode} linkedEmployeeId={linkedEmployeeId} canManage={hrmCanManage} />
      
      default:                  return <ComingSoon module={BREADCRUMBS[page] || EXTENDED_BREADCRUMBS[page] || page} />
    }
  }

  const breadcrumb = BREADCRUMBS[page] || EXTENDED_BREADCRUMBS[page] || 'Dashboard'
  const isHrmPage = page === 'hrm' || page.startsWith('hrm-')

  return (
      <CacheProvider>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <Topbar breadcrumb={breadcrumb} onNav={navigate} onBack={goBack} canGoBack={history.length > 0} />
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Sidebar current={page} onNav={navigate} />
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {/* HRM Mode Toggle Bar — only for managers/HR with dual access */}
              {isHrmPage && hrmCanManage && hrmLinked && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 20px', background: effectiveHrmMode === 'self' ? '#6366f10d' : '#22c55e0d', borderBottom: `2px solid ${effectiveHrmMode === 'self' ? '#6366f1' : '#22c55e'}`, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={effectiveHrmMode === 'self' ? '#6366f1' : '#22c55e'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {effectiveHrmMode === 'self'
                        ? <><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></>
                        : <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>
                      }
                    </svg>
                    <span style={{ fontSize: 12, fontWeight: 700, color: effectiveHrmMode === 'self' ? '#6366f1' : '#22c55e' }}>
                      {effectiveHrmMode === 'self' ? 'My Profile' : 'Company HRM'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                      {effectiveHrmMode === 'self' ? 'Viewing your own HR data' : 'Managing all employees'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <button
                      onClick={() => setHrmMode('self')}
                      style={{ padding: '5px 14px', fontSize: 11, fontWeight: effectiveHrmMode === 'self' ? 800 : 500, background: effectiveHrmMode === 'self' ? '#6366f1' : 'transparent', color: effectiveHrmMode === 'self' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer' }}
                    >My Profile</button>
                    <button
                      onClick={() => setHrmMode('company')}
                      style={{ padding: '5px 14px', fontSize: 11, fontWeight: effectiveHrmMode === 'company' ? 800 : 500, background: effectiveHrmMode === 'company' ? '#22c55e' : 'transparent', color: effectiveHrmMode === 'company' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer' }}
                    >Company</button>
                  </div>
                </div>
              )}
              {/* Not-linked warning for self-only users */}
              {isHrmPage && hrmSelfOnly && hrmLinked && !linkedEmployeeId && (
                <div style={{ padding: '12px 20px', background: '#f59e0b11', borderBottom: '2px solid #f59e0b', fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                  Your account is not linked to an employee profile. Please ask an administrator to set your email address on your employee record.
                </div>
              )}
              <Suspense fallback={<PageLoader />}>
                {renderPage()}
              </Suspense>
            </div>
          </div>
        </div>
      </CacheProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </AuthProvider>
  )
}
