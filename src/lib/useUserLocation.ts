// ════════════════════════════════════════════════════════════════════════════
// useUserLocation.ts
//
// Single source of truth for "what location is this user allowed to operate
// from?" Used by every voucher page, by Inventory, and by stock-related
// reports. Replaces the scattered hardcoded defaults ('1001', '1002', etc.)
// that lived inside individual voucher files.
//
// Rules summary:
//   • user.allowed_location_id = NULL → can operate from any location
//     (super admins, managers, multi-site staff)
//   • user.allowed_location_id set → user is "locked" to that single location.
//     They can:
//       - post vouchers from that location only
//       - initiate a Stock Transfer where the source = their location
//       - request a transfer from another location to their own
//       - VIEW inventory at any location (read-only)
//     They cannot:
//       - post any voucher tied to a different location
//       - initiate a Stock Transfer with someone else's location as source
//       - approve transfer requests where source ≠ their location
//   • A super admin (40+ permissions) bypasses all of the above.
//
// Loading:
//   The hook fetches the user's allowed_location object once per mount.
//   Locations rarely change, so we don't bother memoising globally — the
//   underlying record is small and the cache provider will dedupe if you
//   want to add it later.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './useAuth'

export interface AllowedLocation {
  id: string
  code: string
  name: string
  branch_code: string
  is_default: boolean
}

export interface UserLocationContext {
  /** Whether the user is locked to a single location. */
  isLocked: boolean
  /** Whether the user can operate from anywhere (NULL allowed_location_id OR super admin). */
  isUnrestricted: boolean
  /** The user's locked location, if any. NULL when unrestricted. */
  allowedLocation: AllowedLocation | null
  /** Default location to pre-select in pickers. The user's locked loc, or null = "use first available". */
  defaultLocationCode: string | null
  defaultLocationId: string | null
  /** Loading flag — true while we resolve the locked location row. */
  loading: boolean

  /** Can this user POST a voucher tied to the given location code? */
  canPostFrom: (locationCode: string | null | undefined) => boolean
  /** Can this user initiate a Stock Transfer with the given source location code? */
  canTransferFrom: (locationCode: string | null | undefined) => boolean
  /** Can this user APPROVE a transfer request whose source is the given location id? */
  canApproveTransferFrom: (sourceLocationId: string | null | undefined) => boolean
}

/**
 * Resolve the user's location context. Safe to call on any page.
 */
export function useUserLocation(): UserLocationContext {
  const { user, isSuperAdmin } = useAuth()
  const [allowedLocation, setAllowedLocation] = useState<AllowedLocation | null>(null)
  const [loading, setLoading] = useState(true)

  const superAdmin = isSuperAdmin()
  const lockedLocId = user?.allowed_location_id || null

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      // Super admins are unrestricted regardless of allowed_location_id.
      // Plain users with NULL allowed_location_id are also unrestricted.
      if (!user || superAdmin || !lockedLocId) {
        if (!cancelled) {
          setAllowedLocation(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      const { data, error } = await supabase
        .from('stock_locations')
        .select('id, code, name, branch_code, is_default')
        .eq('id', lockedLocId)
        .maybeSingle()

      if (cancelled) return

      if (error || !data) {
        // Defensive fallback: if the locked location was deleted under us,
        // we treat the user as unrestricted rather than locking them out
        // entirely. The error is logged for debugging.
        console.warn('[useUserLocation] could not resolve allowed_location_id, defaulting to unrestricted:', error?.message)
        setAllowedLocation(null)
      } else {
        setAllowedLocation(data as AllowedLocation)
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [user?.id, lockedLocId, superAdmin])

  // Unrestricted = super admin, OR not locked, OR couldn't resolve the locked row.
  // Once we've finished loading and have no allowedLocation, the user is unrestricted.
  const isUnrestricted = superAdmin || !lockedLocId || (!loading && !allowedLocation)
  const isLocked = !isUnrestricted

  const defaultLocationCode = allowedLocation?.code ?? null
  const defaultLocationId = allowedLocation?.id ?? null

  const canPostFrom = (code: string | null | undefined): boolean => {
    if (isUnrestricted) return true
    if (!code) return false
    return allowedLocation?.code === code
  }

  const canTransferFrom = (code: string | null | undefined): boolean => {
    if (isUnrestricted) return true
    if (!code) return false
    return allowedLocation?.code === code
  }

  const canApproveTransferFrom = (sourceLocationId: string | null | undefined): boolean => {
    if (isUnrestricted) return true
    if (!sourceLocationId) return false
    return allowedLocation?.id === sourceLocationId
  }

  return {
    isLocked,
    isUnrestricted,
    allowedLocation,
    defaultLocationCode,
    defaultLocationId,
    loading,
    canPostFrom,
    canTransferFrom,
    canApproveTransferFrom,
  }
}
