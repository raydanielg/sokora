// ============================================================================
// b2bTypes.ts
// Shared types + display constants for the B2B CRM (accounts, contacts,
// activities). Imported by b2bPost.ts, useB2B.ts, B2BPipeline.tsx and
// B2BAccountPanel.tsx so page and logic can never disagree about a shape.
// ============================================================================

export type B2BStage =
  | 'identified'
  | 'contacted'
  | 'engaged'
  | 'quoted'
  | 'negotiating'
  | 'won'
  | 'lost'

export type B2BAccountType =
  | 'pharmacy'
  | 'hospital'
  | 'clinic'
  | 'midwife_practice'
  | 'reseller'
  | 'corporate'
  | 'ngo'
  | 'other'

export type B2BTemperature = 'cold' | 'warm' | 'hot'

export type B2BActivityType =
  | 'call'
  | 'whatsapp'
  | 'visit'
  | 'sample'
  | 'quote'
  | 'email'
  | 'note'
  | 'stage_change'

export type B2BSource =
  | 'referral'
  | 'event'
  | 'instagram'
  | 'walk_in'
  | 'tender'
  | 'midwife'
  | 'other'

export interface B2BAccount {
  id: string
  name: string
  account_type: B2BAccountType
  stage: B2BStage
  region: string | null
  temperature: B2BTemperature | null
  source: B2BSource | null
  owner_user_id: string | null
  owner_name: string | null
  contact_person: string | null
  whatsapp: string | null
  email: string | null
  phone: string | null
  address: string | null
  tin_number: string | null
  expected_monthly_value: number
  payment_terms: string | null
  next_action: string | null
  next_action_date: string | null   // ISO date (yyyy-mm-dd)
  last_contacted_at: string | null
  last_order_date: string | null
  lost_reason: string | null
  lost_at: string | null
  won_at: string | null
  customer_id: string | null
  notes: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
  // hydrated by useB2B via nested select
  contacts?: B2BContact[]
  activities?: B2BActivity[]
}

export interface B2BContact {
  id: string
  account_id: string
  name: string
  role: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  is_primary: boolean
  notes: string | null
  created_at: string
}

export interface B2BActivity {
  id: string
  account_id: string
  type: B2BActivityType
  note: string | null
  performed_by: string | null
  performed_by_name: string | null
  occurred_at: string
  created_at: string
}

// ── Display metadata ─────────────────────────────────────────────────────────
// Pipeline columns shown left-to-right. 'won' and 'lost' are exits, not columns,
// so the kanban iterates PIPELINE_STAGES and surfaces won/lost separately.
export const PIPELINE_STAGES: { key: B2BStage; label: string; color: string }[] = [
  { key: 'identified',  label: 'Identified',  color: '#6b7280' },
  { key: 'contacted',   label: 'Contacted',   color: '#3b82f6' },
  { key: 'engaged',     label: 'Engaged',     color: '#8b5cf6' },
  { key: 'quoted',      label: 'Quoted',      color: '#f59e0b' },
  { key: 'negotiating', label: 'Negotiating', color: '#d4874a' },
]

export const STAGE_LABELS: Record<B2BStage, string> = {
  identified: 'Identified',
  contacted: 'Contacted',
  engaged: 'Engaged',
  quoted: 'Quoted',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
}

export const STAGE_COLORS: Record<B2BStage, string> = {
  identified: '#6b7280',
  contacted: '#3b82f6',
  engaged: '#8b5cf6',
  quoted: '#f59e0b',
  negotiating: '#d4874a',
  won: '#10b981',
  lost: '#ef4444',
}

export const ACCOUNT_TYPE_LABELS: Record<B2BAccountType, string> = {
  pharmacy: 'Pharmacy',
  hospital: 'Hospital',
  clinic: 'Clinic',
  midwife_practice: 'Midwife Practice',
  reseller: 'Reseller / Shop',
  corporate: 'Corporate',
  ngo: 'NGO / Tender',
  other: 'Other',
}

export const ACTIVITY_TYPE_LABELS: Record<B2BActivityType, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  visit: 'Visit',
  sample: 'Sample given',
  quote: 'Quote sent',
  email: 'Email',
  note: 'Note',
  stage_change: 'Stage change',
}

export const ACTIVITY_TYPE_ICONS: Record<B2BActivityType, string> = {
  call: 'phone',
  whatsapp: 'messageCircle',
  visit: 'mapPin',
  sample: 'package',
  quote: 'fileText',
  email: 'mail',
  note: 'edit',
  stage_change: 'arrowRight',
}

export const SOURCE_LABELS: Record<B2BSource, string> = {
  referral: 'Referral',
  event: 'Event',
  instagram: 'Instagram',
  walk_in: 'Walk-in',
  tender: 'Tender notice',
  midwife: 'Midwife intro',
  other: 'Other',
}

export const LOSS_REASONS = [
  'Price too high',
  'Chose competitor',
  'No response / went cold',
  'Not a fit',
  'No budget',
  'Other',
] as const

// A prospect is any live account still in the pipeline (not won/lost/archived).
export const isProspect = (a: B2BAccount) =>
  !a.is_archived && a.stage !== 'won' && a.stage !== 'lost'

// Overdue = has a next_action_date in the past and is still a live prospect.
export const isOverdue = (a: B2BAccount) => {
  if (!isProspect(a) || !a.next_action_date) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return new Date(a.next_action_date) < today
}
