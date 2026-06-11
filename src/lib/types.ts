export type Page =
  | 'dashboard' | 'vouchers' | 'chart-of-accounts'
  | 'cash-sale' | 'cash-payment' | 'cash-receipt' | 'customer-receipt-batch'
  | 'bank-payment' | 'bank-receipt' | 'bank-transfer'
  | 'petty-cash' | 'contra' | 'sales-invoice' | 'proforma' | 'proformas-list' | 'quotation'
  | 'sales-return' | 'debit-note' | 'credit-note'
  | 'purchase-order' | 'grn' | 'purchase' | 'purchase-invoice' | 'purchase-return'
  | 'opening-stock' | 'stock-adjustment' | 'stock-transfer' | 'journal-entry' | 'import-order'
  | 'stock-transfer-request' | 'stock-transfer-approvals'
  | 'internal-use' | 'internal-use-report'
  | 'sales' | 'inventory' | 'reports' | 'pnl'
  | 'sales-register' | 'sales-day-book' | 'sales-invoices-list' | 'trial-balance' | 'balance-sheet'
  | 'ar-aging' | 'ap-aging' | 'stock-valuation'
  | 'purchase-register' | 'payment-register' | 'expense-register' | 'stock-transfer-register' | 'import-register' | 'customers' | 'customer-statement'
  | 'receipt-template' | 'invoice-template'
  | 'whatsapp-settings' | 'location-settings'
  | 'inventory-settings' | 'pricelist-template' | 'proforma-template'
  | 'banks' | 'settings' | 'data-import' | 'coming-soon' | 'bundles'
  | 'stock-levels' | 'suppliers' | 'stock-movements'
  // CRM Module Pages
  | 'crm' | 'crm-hub' | 'crm-inbox' | 'crm-automations' | 'crm-preorders'
  | 'crm-referrals' | 'crm-ambassador'  // crm-referrals kept as alias; new code uses crm-ambassador
  | 'crm-loyalty' | 'crm-feedback' | 'crm-upsell'
  | 'crm-customers' | 'crm-command-center'
  | 'crm-whatsapp-templates' | 'crm-whatsapp-resources'
  | 'crm-waitlist'
  // Settings Pages
  | 'accounting-settings' | 'display-settings' | 'report-templates'
  | 'company-finance-settings' | 'users-access-settings' | 'sales-inventory-settings'
  | 'templates-hub' | 'integrations-settings' | 'regional-backup-settings'
  | 'company-branding'
  // User Management & Approvals
  | 'users' | 'approvals' | 'approvals-settings'
  // Investors Module
  | 'investors' | 'investors-hub' | 'investors-portfolio' | 'investors-reports'
  // Bundles
  | 'bundles'
  // HRM Module Pages
  | 'hrm' | 'hrm-employees' | 'hrm-assets' | 'hrm-payroll' | 'hrm-payslips'
  | 'hrm-payslip-template'
  | 'hrm-leave' | 'hrm-attendance' | 'hrm-performance' | 'hrm-recruitment'
  | 'hrm-events' | 'hrm-settings' | 'hrm-kpi'

export interface Product {
  id: string
  sku: string
  name: string
  category: string
  cost: number
  price: number
  qty: number
  reorder: number
}

export interface Account {
  id: string
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense' | 'other'
  category: string
  balance: number
}

export interface Supplier {
  id: string
  name: string
  currency: string
  balance: number
}

export interface Customer {
  name: string
  stage: string
  last: string
  ai: string
  points: number
}

// ============================================================================
// CRM Customer Journey types (Session 1 migration 007)
// ============================================================================
// These types model the structured customer journey data added in
// 007_crm_customer_journey.sql. Page-level files (Customers.tsx, CRMHub.tsx,
// etc.) currently declare their own local Customer interfaces for DB rows;
// the types below are the canonical formal shapes those should converge on
// in Sessions 2-5.

/** Top-level life stage. NULL until manually classified by CRM team. */
export type LifeStage = 'ttc' | 'pregnancy' | 'postpartum' | 'parenting'

/** Sub-stage codes — uses the canonical 12-stage taxonomy from customer_metrics view.
 *  For TTC, the value is `ttc_<duration>` where <duration> is free text like
 *  '3_months', '6_months', '1_year', etc. */
export type LifeSubstage =
  // TTC sub-stages are dynamic: 'ttc_<duration>' (e.g. 'ttc_3_months')
  | `ttc_${string}`
  // Pre-pregnancy (anchor known but >9 months out)
  | 'pre_pregnancy'
  // Pregnancy
  | 'first_trimester' | 'second_trimester' | 'third_trimester'
  // Postpartum + Parenting (continuous bucketing by baby age)
  | 'newborn_0_4w' | 'baby_1_3m' | 'baby_3_6m' | 'baby_6_12m'
  | 'toddler_1_2y' | 'toddler_2_3y' | 'past_3y'
  | 'unknown'

/** Relationship stage: where she is with SOKORA operationally. */
export type RelationshipStage =
  | 'inquiry' | 'onboarding' | 'check_in'
  | 'crown' | 'ambassador' | 're_engagement'

/** Reason a profile is paused (sensitive exit protocol). Free-text in DB but
 *  these are the recommended values for consistency. */
export type StagePausedReason =
  | 'pregnancy_loss' | 'infant_loss' | 'personal_request' | 'do_not_contact' | 'other'

/**
 * Canonical Customer shape from the customers table after migration 007.
 * Page-level local Customer interfaces should converge on this in Sessions 2-5.
 */
export interface CustomerRecord {
  id: string
  customer_number: string
  name: string
  company?: string | null
  contact_person?: string | null
  // Customer kind. 'wholesale' replaces the older 'debtor' label as of
  // migration 009 (the previous "debtor" framing wrongly implied every
  // sales-invoice customer carries credit; many prepay or COD). The
  // 'debtor' literal is still accepted in the type union for transition
  // safety — old code paths and any rows not yet migrated still resolve.
  customer_type: 'cash' | 'debtor' | 'wholesale'
  segment?: string | null
  whatsapp?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  tin_number?: string | null            // Tanzanian TIN, format NNN-NNN-NNN; nullable
  credit_limit: number
  credit_period: number
  payment_terms?: string | null
  balance: number
  crown_points: number
  is_active: boolean
  // Soft-hide flag (from migration 009). Distinct from is_active:
  //   is_active=false → hard-deactivated, kept only for FK integrity.
  //   is_hidden=true  → still usable, but excluded from pickers/dropdowns.
  // Reports, statements, and AR aging IGNORE is_hidden so history is preserved.
  is_hidden?: boolean
  last_purchase_date?: string | null
  last_purchase_amount?: number | null
  notes?: string | null
  created_at: string

  // Free-text descriptor used by receipts, sales day book, cash sale UI.
  // Stores human-readable strings like "28 weeks Pregnant", "1 month postpartum".
  // Coexists with the structured life_stage / life_substage fields:
  //   • pregnancy_stage = display string (what shows on receipts)
  //   • life_stage / life_substage = logic fields (drive automation)
  pregnancy_stage?: string | null

  // Structured life stage (new in 007; reconciled with pre-existing fields in 008)
  life_stage: LifeStage | null
  life_substage: LifeSubstage | null

  // Anchor dates and journey fields (pre-existing on customers, reused by 008)
  edd?: string | null                 // expected due date (pregnancy)
  edd_source?: string | null          // how the EDD was captured
  delivery_date?: string | null       // actual delivery date (postpartum/parenting anchor)
  ttc_duration?: string | null        // free text e.g. '3_months', '6_months', '1_year'
  birthday?: string | null            // for Crown birthday bonus
  context_status?: string | null      // CRM action queue status

  // Relationship stage
  relationship_stage: RelationshipStage | null

  // Stage management / graduation tracking
  previous_life_stage: LifeStage | null
  current_stage_entered_at?: string | null
  graduation_count: number
  pregnancy_count: number
  is_returning_customer: boolean

  // Ownership
  owner_user_id?: string | null

  // Sensitive exit
  stage_paused: boolean
  stage_paused_reason?: string | null
  stage_paused_at?: string | null
  stage_paused_by?: string | null

  // Ambassador program
  ambassador_code: string
  referred_by?: string | null         // pre-existing UUID FK to referring customer

  // Existing tier field; for Session 1 we keep single-tier semantics
  // (all members are simply "crown"). Field reserved for future tiering.
  crown_tier?: string | null
}

/** Append-only audit log of life-stage transitions. */
export interface CustomerStageHistory {
  id: string
  customer_id: string
  from_stage: LifeStage | null
  to_stage: LifeStage
  transitioned_at: string
  transitioned_by?: string | null
  notes?: string | null
  metadata?: Record<string, unknown>
  created_at: string
}

/** Maps life_stage (+ optional substage) to recommended products. */
export interface StageProductRecommendation {
  id: string
  life_stage: LifeStage
  life_substage: LifeSubstage | null
  product_id: string
  priority: number
  notes?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Catalog entry for manually awarding Crown points (UGC, tagging, events). */
export interface CrownManualAwardCatalogEntry {
  id: string
  reason_code: CrownAwardReasonCode | string
  label: string
  description?: string | null
  default_points: number
  requires_approval: boolean
  approval_threshold?: number | null
  is_active: boolean
  icon?: string | null
}

/** Canonical reason codes for Crown point awards. */
export type CrownAwardReasonCode =
  | 'purchase'              // automatic from cash sale / invoice
  | 'ugc_submission'        // user-generated content
  | 'tag_permission'        // allowed SOKORA to tag her
  | 'event_attendance'      // attended a SOKORA event
  | 'photo_testimonial'
  | 'video_testimonial'
  | 'birthday_bonus'
  | 'graduation_milestone'  // automatic on life-stage graduation
  | 'feedback_completion'
  | 'referral_conversion'   // her referred friend purchased
  | 'goodwill_adjustment'   // service make-good
  | 'manual_correction'     // always requires approval
  | 'other'

/** Crown points log row (matches crown_points_log after 007). */
export interface CrownPointsLogEntry {
  id: string
  customer_id: string
  points: number
  type: 'earn' | 'redeem'
  reason_code?: CrownAwardReasonCode | string | null
  reason_note?: string | null
  source_voucher_id?: string | null
  awarded_by_user_id?: string | null
  requires_approval: boolean
  approval_status?: 'pending' | 'approved' | 'rejected' | null
  approval_request_id?: string | null
  created_at: string
}

/** Crown points earning rules (read from crm_settings 'crown' category). */
export interface CrownEarningRules {
  /** Base earning rate: `points` per `per_tzs` TZS spent. */
  earning_rate: { points: number; per_tzs: number }
  /** Minimum purchase amount to earn any points. */
  minimum_purchase: { tzs: number }
  /** Optional cap on points per single transaction (null = uncapped). */
  max_points_per_txn: { cap: number | null }
  /** Value of 1 point in TZS at redemption time. */
  redemption_value: { tzs_per_point: number }
  /** Manual awards above this absolute point amount require approval. */
  manual_approval_threshold: { points: number }
}

/** Display-friendly labels for life stages. */
export const LIFE_STAGE_LABELS: Record<LifeStage, string> = {
  ttc: 'TTC',
  pregnancy: 'Pregnancy',
  postpartum: 'Postpartum',
  parenting: 'Parenting',
}

/** Display-friendly labels for sub-stages (12-stage canonical taxonomy).
 *  TTC sub-stages are dynamic (`ttc_<duration>`) and handled by
 *  formatLifeSubstage() rather than a fixed map. */
export const LIFE_SUBSTAGE_LABELS: Partial<Record<LifeSubstage, string>> = {
  pre_pregnancy:    'Pre-pregnancy',
  first_trimester:  'Pregnancy · 1st trimester',
  second_trimester: 'Pregnancy · 2nd trimester',
  third_trimester:  'Pregnancy · 3rd trimester',
  newborn_0_4w:     'Newborn (0-4 weeks)',
  baby_1_3m:        'Baby (1-3 months)',
  baby_3_6m:        'Baby (3-6 months)',
  baby_6_12m:       'Baby (6-12 months)',
  toddler_1_2y:     'Toddler (1-2 years)',
  toddler_2_3y:     'Toddler (2-3 years)',
  past_3y:          'Past 3 years',
  unknown:          'Stage unknown',
}

/** Map a canonical sub-stage to its parent 4-stage life_stage.
 *  Returns null if the substage doesn't have a parent (e.g. pre_pregnancy). */
export function parentLifeStage(sub: LifeSubstage | null): LifeStage | null {
  if (!sub) return null
  if (sub.startsWith('ttc_')) return 'ttc'
  if (sub === 'first_trimester' || sub === 'second_trimester' || sub === 'third_trimester') return 'pregnancy'
  if (sub === 'newborn_0_4w') return 'postpartum'
  if (sub === 'baby_1_3m' || sub === 'baby_3_6m' || sub === 'baby_6_12m'
      || sub === 'toddler_1_2y' || sub === 'toddler_2_3y' || sub === 'past_3y') return 'parenting'
  return null
}

/** Render a sub-stage as a human-readable string, including dynamic TTC values. */
export function formatLifeSubstage(sub: LifeSubstage | null): string {
  if (!sub) return ''
  if (sub.startsWith('ttc_')) {
    const duration = sub.slice(4).replace(/_/g, ' ')
    return `TTC · ${duration}`
  }
  return LIFE_SUBSTAGE_LABELS[sub] ?? sub
}

/** Display labels for relationship stages. */
export const RELATIONSHIP_STAGE_LABELS: Record<RelationshipStage, string> = {
  inquiry: 'Inquiry',
  onboarding: 'Onboarding',
  check_in: 'Check-in',
  crown: 'Crown',
  ambassador: 'SOKORA Ambassador',
  re_engagement: 'Re-engagement',
}

/**
 * Returns the relevant anchor date for a given life stage.
 *   Pregnancy → edd (expected due date)
 *   Postpartum / Parenting → delivery_date (actual delivery)
 *   TTC has no single anchor date; ttc_duration is a free-text descriptor.
 */
export function anchorDateFor(
  stage: LifeStage | null,
  customer: Pick<CustomerRecord, 'edd' | 'delivery_date'>
): string | null {
  if (!stage) return null
  switch (stage) {
    case 'ttc':        return null
    case 'pregnancy':  return customer.edd ?? null
    case 'postpartum': return customer.delivery_date ?? customer.edd ?? null
    case 'parenting':  return customer.delivery_date ?? customer.edd ?? null
  }
}

/**
 * Friendly display string for receipts and exports.
 * e.g. "28 weeks pregnant", "3 weeks postpartum", "baby 8 months", "TTC · 6 months"
 * Returns the legacy free-text if present and no structured stage exists.
 */
export function formatLifeStageDisplay(
  customer: Pick<
    CustomerRecord,
    'life_stage' | 'edd' | 'delivery_date' | 'ttc_duration' | 'pregnancy_stage'
  >,
  today: Date = new Date()
): string {
  // Fall back to free-text descriptor if no structured stage
  if (!customer.life_stage) return customer.pregnancy_stage ?? ''

  const msPerDay = 24 * 60 * 60 * 1000
  const stage = customer.life_stage

  if (stage === 'pregnancy' && customer.edd) {
    const due = new Date(customer.edd)
    const daysUntilDue = Math.floor((due.getTime() - today.getTime()) / msPerDay)
    let week = 40 - Math.max(0, Math.floor(daysUntilDue / 7))
    week = Math.max(1, Math.min(42, week))
    return `${week} weeks pregnant`
  }

  const deliveryAnchor = customer.delivery_date ?? customer.edd ?? null

  if (stage === 'postpartum' && deliveryAnchor) {
    const delivered = new Date(deliveryAnchor)
    const days = Math.floor((today.getTime() - delivered.getTime()) / msPerDay)
    if (days < 14) return `${days} days postpartum`
    const weeks = Math.floor(days / 7)
    return `${weeks} weeks postpartum`
  }

  if (stage === 'parenting' && deliveryAnchor) {
    const delivered = new Date(deliveryAnchor)
    const months = (today.getFullYear() - delivered.getFullYear()) * 12 +
                   (today.getMonth() - delivered.getMonth())
    if (months < 24) return `baby ${months} month${months === 1 ? '' : 's'}`
    const years = Math.floor(months / 12)
    return `child ${years} year${years === 1 ? '' : 's'}`
  }

  if (stage === 'ttc' && customer.ttc_duration) {
    return `TTC · ${customer.ttc_duration.replace(/_/g, ' ')}`
  }

  // Stage classified but no anchor info yet
  return LIFE_STAGE_LABELS[stage]
}

export interface LineItem {
  productId: string
  desc: string
  qty: number
  price: number
  amount: number
}

export interface JournalLine {
  account: string
  dr: number
  cr: number
  desc: string
}
