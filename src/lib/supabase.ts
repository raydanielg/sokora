import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── WORKSPACE REGISTRY ───────────────────────────────────────────────────────
// Each entry represents a Supabase project (a SOKORA workspace/tenant).
// For the SAAS version, workspaces are selected at login time.
export interface Company {
  id:            string
  name:          string
  shortName:     string
  url:           string
  key:           string
  color:         string    // brand color for this workspace
  hideCRM:       boolean
  hideBundles:   boolean
  showInvestors: boolean
}

export const COMPANIES: Company[] = [
  {
    id:           'sokora-ws-1',
    name:         'Your Organization',
    shortName:    'SOKORA',
    url:          'https://ebokhvibnypiomzqimfg.supabase.co',
    key:          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVib2todmlibnlwaW9tenFpbWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzA3MDIsImV4cCI6MjA4OTYwNjcwMn0.yqaB42lvEN_vkUt1q6VBAAHdwSYOaIwt8bH5Vg9MTQk',
    color:        '#6366f1',
    hideCRM:      false,
    hideBundles:  false,
    showInvestors:false,
  },
  {
    id:           'sokora-ws-2',
    name:         'Your Organization',
    shortName:    'SOKORA Enterprise',
    url:          'https://hkfxoocyelstrbjvgkbr.supabase.co',
    key:          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrZnhvb2N5ZWxzdHJianZna2JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTQ5NDksImV4cCI6MjA5MDczMDk0OX0.QHnNROu7lPzeUlU9kmCzvHE_WbcPjt0jLxDM0qMlyD0',
    color:        '#10b981',
    hideCRM:      true,
    hideBundles:  true,
    showInvestors:true,
  },
]

// ── ACTIVE WORKSPACE ─────────────────────────────────────────────────────────
const STORAGE_KEY = 'sokora_workspace'

export function getActiveCompanyId(): string {
  return localStorage.getItem(STORAGE_KEY) || COMPANIES[0].id
}

export function getActiveCompany(): Company {
  const id = getActiveCompanyId()
  return COMPANIES.find(c => c.id === id) || COMPANIES[0]
}

export function setActiveCompany(companyId: string) {
  localStorage.setItem(STORAGE_KEY, companyId)
}

// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────
function buildClient(company: Company): SupabaseClient {
  return createClient(company.url, company.key, {
    auth: {
      persistSession:   true,
      autoRefreshToken: true,
      storageKey:       `sb-${company.id}-auth`,
    },
  })
}

let activeCompany = getActiveCompany()
let _supabase     = buildClient(activeCompany)

export let supabase: SupabaseClient = _supabase

/**
 * Switch to a different SOKORA workspace.
 * Rebuilds the Supabase client for the new workspace.
 */
export function switchCompany(companyId: string): Company {
  const company = COMPANIES.find(c => c.id === companyId)
  if (!company) throw new Error(`Unknown workspace: ${companyId}`)
  setActiveCompany(companyId)
  activeCompany = company
  _supabase     = buildClient(company)
  supabase      = _supabase
  return company
}
