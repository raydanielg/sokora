import { ReactNode } from 'react'
import { useAuth } from '../lib/useAuth'

// ============================================================================
// PERMISSION GATE COMPONENT
// Hides or disables children based on permission checks
// ============================================================================

interface PermissionGateProps {
  children: ReactNode
  
  // Permission requirements (use ONE of these)
  permission?: string           // Single permission required
  permissions?: string[]        // Multiple permissions
  requireAll?: boolean          // If true, ALL permissions required. If false (default), ANY permission
  
  // Role requirements (use ONE of these)  
  role?: string                 // Single role required
  roles?: string[]              // Any of these roles
  
  // Behavior when not permitted
  fallback?: ReactNode          // Show this instead (default: null/hidden)
  disabled?: boolean            // If true, render children but disabled (for buttons)
  
  // For debugging
  debug?: boolean               // Log permission checks to console
}

export function PermissionGate({
  children,
  permission,
  permissions,
  requireAll = false,
  role,
  roles,
  fallback = null,
  disabled = false,
  debug = false,
}: PermissionGateProps) {
  const { can, canAny, canAll, hasRole, hasAnyRole, loading } = useAuth()

  // While loading, show nothing or fallback
  if (loading) {
    return <>{fallback}</>
  }

  let hasPermission = true

  // Check single permission
  if (permission) {
    hasPermission = can(permission)
    if (debug) console.log(`[PermissionGate] ${permission}: ${hasPermission}`)
  }

  // Check multiple permissions
  if (permissions && permissions.length > 0) {
    hasPermission = requireAll ? canAll(permissions) : canAny(permissions)
    if (debug) console.log(`[PermissionGate] ${permissions.join(', ')} (${requireAll ? 'ALL' : 'ANY'}): ${hasPermission}`)
  }

  // Check single role
  if (role) {
    hasPermission = hasPermission && hasRole(role)
    if (debug) console.log(`[PermissionGate] role=${role}: ${hasRole(role)}`)
  }

  // Check multiple roles
  if (roles && roles.length > 0) {
    hasPermission = hasPermission && hasAnyRole(roles)
    if (debug) console.log(`[PermissionGate] roles=${roles.join(',')}: ${hasAnyRole(roles)}`)
  }

  // If not permitted
  if (!hasPermission) {
    // If disabled mode, wrap children in disabled container
    if (disabled) {
      return (
        <div style={{ opacity: 0.5, pointerEvents: 'none', cursor: 'not-allowed' }}>
          {children}
        </div>
      )
    }
    // Otherwise show fallback (default: nothing)
    return <>{fallback}</>
  }

  // Has permission - render children
  return <>{children}</>
}

// ============================================================================
// ROLE GATE - Simplified component for role-only checks
// ============================================================================

interface RoleGateProps {
  children: ReactNode
  role?: string
  roles?: string[]
  fallback?: ReactNode
}

export function RoleGate({ children, role, roles, fallback = null }: RoleGateProps) {
  const { hasRole, hasAnyRole, loading } = useAuth()

  if (loading) return <>{fallback}</>

  if (role && !hasRole(role)) return <>{fallback}</>
  if (roles && !hasAnyRole(roles)) return <>{fallback}</>

  return <>{children}</>
}

// ============================================================================
// SUPER ADMIN GATE - Only super admins can see
// ============================================================================

interface SuperAdminGateProps {
  children: ReactNode
  fallback?: ReactNode
}

export function SuperAdminGate({ children, fallback = null }: SuperAdminGateProps) {
  const { isSuperAdmin, loading } = useAuth()

  if (loading) return <>{fallback}</>
  if (!isSuperAdmin()) return <>{fallback}</>

  return <>{children}</>
}

// ============================================================================
// APPROVER GATE - Only users who can approve
// ============================================================================

interface ApproverGateProps {
  children: ReactNode
  fallback?: ReactNode
}

export function ApproverGate({ children, fallback = null }: ApproverGateProps) {
  const { user, loading } = useAuth()

  if (loading) return <>{fallback}</>
  if (!user?.is_approver) return <>{fallback}</>

  return <>{children}</>
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*

// Hide a button if user can't create sales
<PermissionGate permission="sales.create">
  <button onClick={handleNewSale}>New Sale</button>
</PermissionGate>

// Show disabled button instead of hiding
<PermissionGate permission="inventory.delete" disabled>
  <button onClick={handleDelete}>Delete Product</button>
</PermissionGate>

// Require multiple permissions (ANY)
<PermissionGate permissions={['sales.approve', 'accounting.approve']}>
  <button>Approve</button>
</PermissionGate>

// Require ALL permissions
<PermissionGate permissions={['sales.view', 'sales.export']} requireAll>
  <button>Export Sales</button>
</PermissionGate>

// Role-based check
<RoleGate roles={['super_admin', 'cx_manager']}>
  <AdminPanel />
</RoleGate>

// Super admin only
<SuperAdminGate>
  <DangerZone />
</SuperAdminGate>

// Show fallback when not permitted
<PermissionGate 
  permission="reports.export" 
  fallback={<span>Upgrade to export</span>}
>
  <button>Export PDF</button>
</PermissionGate>

*/
