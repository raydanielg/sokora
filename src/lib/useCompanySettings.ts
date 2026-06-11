import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// ════════════════════════════════════════════════════════════════════════
// useCompanySettings — single-source read for company-wide branding.
//
// Every customer-facing document (statement, invoice, receipt) calls this
// to get logo + company info + bank details. Centralizing means:
//   - One round-trip per page load (the hook caches in a module-level
//     variable, so multiple components on the same page share the result).
//   - Edits in the Settings page are reflected next render with no hardcode
//     hunting.
//   - When we add new fields later (e.g. social media handles), only the
//     interface and this file need to change.
// ════════════════════════════════════════════════════════════════════════

export interface CompanySettings {
  id: string
  company_name: string
  tagline: string | null
  tin: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  logo_height_px: number
  logo_position: 'left' | 'center' | 'right'
  bank_name: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  bank_branch: string | null
  mpesa_till_number: string | null
  mpesa_business_number: string | null
  statement_footer_note: string | null
  invoice_footer_note: string | null
}

// Sensible defaults — used while the row is still loading, or if the
// table doesn't exist yet (e.g. migration 011 hasn't run). This keeps
// the UI rendering instead of showing blanks; the real values overwrite
// on load.
export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  id: 'company',
  company_name: 'Your Organization',
  tagline: null,
  tin: '174-205-078',
  address: 'Dar es Salaam, Tanzania',
  phone: '+255 745 555 999',
  email: 'support@sokora.app',
  website: 'www.sokora.app',
  logo_url: null,
  logo_height_px: 48,
  logo_position: 'left',
  bank_name: 'NMB Bank',
  bank_account_name: 'Your Organization',
  bank_account_number: '22510074972',
  bank_branch: 'Dar es Salaam Branch',
  mpesa_till_number: null,
  mpesa_business_number: null,
  statement_footer_note: 'Please reference the invoice number when paying. For queries, contact us.',
  invoice_footer_note: 'Thank you for your business.',
}

// Module-level cache. Multiple components in the same render cycle share
// the same result instead of each firing its own query. A simple
// in-memory cache is fine because settings change rarely; on the rare
// occasion they do, the user refreshes after saving.
let cached: CompanySettings | null = null
let inFlight: Promise<CompanySettings> | null = null

async function fetchSettings(): Promise<CompanySettings> {
  if (cached) return cached
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('id', 'company')
        .single()
      if (error || !data) {
        cached = DEFAULT_COMPANY_SETTINGS
        return cached
      }
      // Spread over defaults so any column the migration hasn't added
      // yet falls back to its default rather than `undefined`.
      cached = { ...DEFAULT_COMPANY_SETTINGS, ...(data as Partial<CompanySettings>) }
      return cached
    } catch {
      cached = DEFAULT_COMPANY_SETTINGS
      return cached
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

// Invalidate cache — call after saving from the Settings page so the
// next read fetches fresh data.
export function invalidateCompanySettings() {
  cached = null
  inFlight = null
}

export function useCompanySettings(): { settings: CompanySettings; loading: boolean } {
  const [settings, setSettings] = useState<CompanySettings>(cached || DEFAULT_COMPANY_SETTINGS)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    let mounted = true
    fetchSettings().then(s => {
      if (mounted) { setSettings(s); setLoading(false) }
    })
    return () => { mounted = false }
  }, [])

  return { settings, loading }
}
