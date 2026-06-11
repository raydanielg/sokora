import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode, createElement } from 'react'
import { supabase } from './supabase'

export interface User {
  id: string
  email: string
  full_name: string
  initials: string
  phone?: string
  is_active: boolean
  is_approver: boolean
  is_away: boolean
  avatar_url?: string
  // Location locking — NULL means user can operate from any location.
  // Set means the user is locked to this single stock_locations.id for
  // posting vouchers and making inventory changes. They can still VIEW
  // other locations' summaries via the inventory page.
  allowed_location_id?: string | null
}

export interface AuthContextType {
  user: User | null
  permissions: string[]
  loading: boolean
  error: string | null
  isAuthenticated: boolean
  can: (permission: string) => boolean
  canAny: (permissions: string[]) => boolean
  canAll: (permissions: string[]) => boolean
  hasRole: (roleName: string) => boolean
  hasAnyRole: (roleNames: string[]) => boolean
  isSuperAdmin: () => boolean
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function usePermission(permission: string): boolean {
  const { can, loading } = useAuth()
  if (loading) return false
  return can(permission)
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Use a ref to track whether we've completed at least one successful load.
  // Once we have a user, subsequent re-loads (triggered by SIGNED_IN events
  // when Chrome unparks a backgrounded tab, etc.) should run silently in
  // the background rather than flashing the full-page "Loading..." splash.
  // This was Joe's complaint: switching to another Chrome tab and back was
  // showing a loading flash even though the actual user/permissions hadn't
  // changed at all.
  const hasLoadedOnceRef = useRef(false)

  // Mirror the latest `user` value into a ref so the auth event handler
  // can compare without re-creating the subscription. Used to detect
  // SIGNED_IN echo events that fire on tab refocus with the same user.
  const currentUserRef = useRef<User | null>(null)
  useEffect(() => { currentUserRef.current = user }, [user])

  const loadUser = useCallback(async (options: { silent?: boolean } = {}) => {
    // First load (or explicit non-silent reload) shows the splash.
    // Background refreshes don't flip `loading` so the UI stays mounted.
    const silent = options.silent ?? hasLoadedOnceRef.current
    try {
      if (!silent) setLoading(true)
      setError(null)
      
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.user) {
        setUser(null)
        setPermissions([])
        setLoading(false)
        return
      }

      // Load user from our users table by email
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', session.user.email?.toLowerCase())
        .single()

      if (userError || !userData) {
        console.error('User not found in users table:', userError)
        setUser(null)
        setPermissions([])
        setLoading(false)
        return
      }

      if (!userData.is_active) {
        console.error('User account is deactivated')
        await supabase.auth.signOut()
        setUser(null)
        setPermissions([])
        setLoading(false)
        return
      }

      const currentUser: User = {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        initials: userData.initials,
        phone: userData.phone,
        is_active: userData.is_active,
        is_approver: userData.is_approver,
        is_away: userData.is_away,
        avatar_url: userData.avatar_url,
        // Pre-migration users won't have this column; default to null.
        allowed_location_id: userData.allowed_location_id ?? null,
      }

      setUser(currentUser)
      setPermissions(userData.permissions || [])
      setLoading(false)
      // Mark that we've completed at least one successful load. Future
      // `loadUser()` calls (e.g. from SIGNED_IN on tab refocus) will
      // default to silent mode and not flash the splash.
      hasLoadedOnceRef.current = true

    } catch (err) {
      console.error('Auth error:', err)
      setError('Failed to load user')
      setUser(null)
      setPermissions([])
      setLoading(false)
    }
  }, [])

  const can = useCallback((permission: string): boolean => {
    if (permissions.length >= 40) return true // All permissions = super admin
    return permissions.includes(permission)
  }, [permissions])

  const canAny = useCallback((perms: string[]): boolean => {
    if (permissions.length >= 40) return true
    return perms.some(p => permissions.includes(p))
  }, [permissions])

  const canAll = useCallback((perms: string[]): boolean => {
    if (permissions.length >= 40) return true
    return perms.every(p => permissions.includes(p))
  }, [permissions])

  const hasRole = useCallback((_roleName: string): boolean => {
    // With direct permissions, we don't use roles
    // This is kept for backward compatibility
    return permissions.length >= 40
  }, [permissions])

  const hasAnyRole = useCallback((_roleNames: string[]): boolean => {
    return permissions.length >= 40
  }, [permissions])

  const isSuperAdmin = useCallback((): boolean => {
    return permissions.length >= 40
  }, [permissions])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setPermissions([])
  }

  const refreshUser = async () => {
    await loadUser()
  }

  useEffect(() => {
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Only re-load the user on genuine identity changes.
      //
      // TOKEN_REFRESHED fires whenever Supabase rotates the JWT, which happens
      // on every tab refocus after Chrome throttles the background tab. The
      // user has NOT changed — only their token has — so re-running loadUser()
      // here flips `loading` back to true and causes the entire UI to flash
      // a spinner / re-mount. We deliberately ignore that event.
      //
      // SIGNED_IN ALSO fires on tab refocus in many Supabase versions (the
      // SDK re-verifies the session and re-emits SIGNED_IN with the same
      // user). We skip re-loading in that case by comparing the session
      // email to the user we already have. Only re-load if it's a genuinely
      // different identity (logout-then-login as someone else).
      //
      // INITIAL_SESSION also fires on every reload but the initial loadUser()
      // call above already covers that case.
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (!session) return
        // Compare against currently-loaded user. If the email matches what
        // we already have, the SIGNED_IN is a refocus echo — skip it.
        // (Using a ref to read the latest user inside the closure.)
        const sessionEmail = session.user?.email?.toLowerCase() ?? null
        const currentEmail = currentUserRef.current?.email?.toLowerCase() ?? null
        if (event === 'SIGNED_IN' && sessionEmail && currentEmail && sessionEmail === currentEmail) {
          // Same user, just a refocus. Ignore.
          return
        }
        loadUser()
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setPermissions([])
        setLoading(false)
        hasLoadedOnceRef.current = false
      }
      // TOKEN_REFRESHED, INITIAL_SESSION, PASSWORD_RECOVERY, MFA_CHALLENGE_VERIFIED
      // → no-op. Do not touch the user state.
    })

    return () => subscription.unsubscribe()
  }, [loadUser])

  const value: AuthContextType = {
    user,
    permissions,
    loading,
    error,
    isAuthenticated: !!user,
    can,
    canAny,
    canAll,
    hasRole,
    hasAnyRole,
    isSuperAdmin,
    signOut,
    refreshUser,
  }

  return createElement(AuthContext.Provider, { value }, children)
}

export const PAGE_PERMISSIONS: Record<string, string[]> = {
  'dashboard': ['dashboard.view'],
  'vouchers': ['accounting.view'],
  'chart-of-accounts': ['accounting.coa'],
  'banks': ['accounting.view'],
  'inventory': ['inventory.view'],
  'customers': ['customers.view'],
  'suppliers': ['accounting.view'],
  'reports': ['reports.view'],
  'settings': ['settings.view'],
  'sales': ['sales.view'],
  'cash-sale': ['sales.create'],
  'sales-invoice': ['sales.create'],
  'sales-day-book': ['sales.view'],
  'sales-invoices-list': ['sales.view'],
  'sales-register': ['sales.view'],
  'sales-return': ['sales.create'],
  'cash-payment': ['accounting.create'],
  'cash-receipt': ['accounting.create'],
  'bank-payment': ['accounting.create'],
  'bank-receipt': ['accounting.create'],
  'bank-transfer': ['accounting.create'],
  'petty-cash': ['accounting.create'],
  'contra': ['accounting.create'],
  'debit-note': ['accounting.create'],
  'credit-note': ['accounting.create'],
  'purchase-order': ['accounting.create'],
  'grn': ['inventory.create'],
  'purchase-invoice': ['accounting.create'],
  'import-order': ['accounting.create'],
  'purchase-return': ['accounting.create'],
  'opening-stock': ['inventory.adjust'],
  'stock-adjustment': ['inventory.adjust'],
  'stock-transfer': ['inventory.transfer'],
  // Anyone with inventory.view can request a transfer FROM another location
  // (they don't actually do the moving — an approver at the source location does)
  'stock-transfer-request': ['inventory.view'],
  // Approvals page: any user with inventory.transfer can land here, but the
  // page itself filters the list to requests they are allowed to approve.
  'stock-transfer-approvals': ['inventory.transfer', 'inventory.view'],
  'journal-entry': ['accounting.create'],
  'crm': ['crm.view'],
  'crm-hub': ['crm.view'],
  'crm-inbox': ['crm.inbox'],
  'crm-automations': ['crm.automations'],
  'crm-preorders': ['crm.view'],
  'crm-referrals': ['crm.view'],
  'crm-loyalty': ['crm.view'],
  'crm-feedback': ['crm.view'],
  'crm-upsell': ['crm.view'],
  'users': ['settings.users'],
  'approvals': ['settings.approvals'],
  'accounting-settings': ['settings.edit'],
  'whatsapp-settings': ['settings.edit'],
  'location-settings': ['settings.edit'],
  'inventory-settings': ['settings.edit'],
  'company-finance-settings': ['settings.edit'],
  'users-access-settings': ['settings.edit'],
  'sales-inventory-settings': ['settings.edit'],
  'templates-hub': ['settings.edit'],
  'integrations-settings': ['settings.edit'],
  'regional-backup-settings': ['settings.edit'],
  'pnl': ['reports.view'],
  'trial-balance': ['reports.view'],
  'balance-sheet': ['reports.view'],
  'ar-aging': ['reports.view'],
  'ap-aging': ['reports.view'],
  'stock-valuation': ['reports.view'],
  'purchase-register': ['reports.view'],
  'payment-register': ['reports.view'],
  'expense-register': ['reports.view'],
  'stock-transfer-register': ['reports.view'],
  'data-import': ['settings.edit'],
  'report-templates': ['settings.edit'],
  'investors': ['reports.view'],
  'investors-hub': ['reports.view'],
  'investors-portfolio': ['reports.view'],
  'investors-reports': ['reports.view'],
  'bundles': ['sales.view'],
  // HRM Module — view_own gives self-service access, view_all/manage gives company mode
  'hrm': ['hrm.view', 'hrm.view_own', 'hrm.view_all', 'hrm.manage'],
  'hrm-employees': ['hrm.view', 'hrm.view_own', 'hrm.view_all', 'hrm.manage'],
  'hrm-assets': ['hrm.view', 'hrm.view_own', 'hrm.view_all', 'hrm.manage'],
  'hrm-payroll': ['hrm.payroll', 'hrm.manage'],
  'hrm-payslips': ['hrm.payroll', 'hrm.view_own'],
  'hrm-payslip-template': ['settings.edit', 'hrm.manage'],
  'hrm-leave': ['hrm.view', 'hrm.view_own', 'hrm.view_all', 'hrm.manage'],
  'hrm-attendance': ['hrm.view', 'hrm.view_own', 'hrm.view_all', 'hrm.manage'],
  'hrm-performance': ['hrm.view', 'hrm.view_own', 'hrm.view_all', 'hrm.manage'],
  'hrm-recruitment': ['hrm.recruit', 'hrm.manage'],
  'hrm-events': ['hrm.view', 'hrm.view_own', 'hrm.view_all', 'hrm.manage'],
  'hrm-settings': ['settings.edit', 'hrm.manage'],
}

export function canAccessPage(page: string, permissions: string[]): boolean {
  if (permissions.length >= 40) return true
  const requiredPerms = PAGE_PERMISSIONS[page]
  if (!requiredPerms) return true
  return requiredPerms.some(p => permissions.includes(p))
}
