/**
 * Voucher date validation utility
 * Checks inventory_settings for lock_posting_to_today and backdate_super_admin_only
 * Import and call before posting any voucher with a user-chosen date
 */

import { supabase } from './supabase'
import { today } from './utils'

interface DateCheckResult {
  allowed: boolean
  error?: string
}

/**
 * Validates whether a posting date is allowed based on system settings.
 * 
 * @param postingDate - The date the user wants to post to (YYYY-MM-DD)
 * @param isSuperAdmin - Whether the current user is a super admin
 * @param invSettings - Pre-loaded inventory settings (optional, will fetch if not provided)
 * @returns { allowed: true } or { allowed: false, error: '...' }
 */
export async function validatePostingDate(
  postingDate: string,
  isSuperAdmin: boolean,
  invSettings?: any
): Promise<DateCheckResult> {
  // If posting to today, always allowed
  if (postingDate === today()) return { allowed: true }

  // Load settings if not provided
  let settings = invSettings
  if (!settings) {
    const { data } = await supabase.from('system_settings')
      .select('value').eq('key', 'inventory_settings').single()
    if (data?.value) {
      try { settings = JSON.parse(data.value) } catch { return { allowed: true } }
    }
  }

  // No settings or lock not enabled = allow
  if (!settings?.lock_posting_to_today) return { allowed: true }

  // Lock is ON — check if super admin exception applies
  if (settings.backdate_super_admin_only && isSuperAdmin) {
    return { allowed: true }
  }

  // Blocked
  const isBackdate = postingDate < today()
  return {
    allowed: false,
    error: isBackdate
      ? 'Backdating is not allowed. Posting date must be today.'
      : 'Future-dating is not allowed. Posting date must be today.',
  }
}

/**
 * Synchronous check using pre-loaded settings (for use in components)
 */
export function checkPostingDate(
  postingDate: string,
  isSuperAdmin: boolean,
  invSettings: any
): DateCheckResult {
  if (postingDate === today()) return { allowed: true }
  if (!invSettings?.lock_posting_to_today) return { allowed: true }
  if (invSettings.backdate_super_admin_only && isSuperAdmin) return { allowed: true }

  const isBackdate = postingDate < today()
  return {
    allowed: false,
    error: isBackdate
      ? 'Backdating is not allowed. Posting date must be today.'
      : 'Future-dating is not allowed. Posting date must be today.',
  }
}
