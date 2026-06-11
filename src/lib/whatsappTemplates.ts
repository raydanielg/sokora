// ════════════════════════════════════════════════════════════════════════════
// whatsappTemplates.ts
//
// Pure helpers for the WhatsApp Templates feature:
//   • TemplateCategory + WhatsAppTemplate types
//   • mergeTemplate(body, customer) → resolved string with placeholders filled
//   • buildWhatsAppUrl(phone, message) → wa.me URL ready to open
//   • Placeholder catalog with descriptions for the editor UI
//
// No supabase calls in here. All DB work happens in the page component.
// ════════════════════════════════════════════════════════════════════════════

import { formatPhone } from './whatsapp'

// ─── Types ─────────────────────────────────────────────────────────────────

export type TemplateCategory =
  | 'onboarding'
  | 'check_in'
  | 'feedback'
  | 'birthday'
  | 'crown_reward'
  | 'win_back'
  | 'referral'
  | 'pregnancy_tips'
  | 'postpartum_tips'
  | 'statement'              // AR statement send-out
  | 'payment_reminder'       // Payment chase, overdue invoice
  | 'invoice_share'          // Specific invoice sharing
  | 'general'

export interface WhatsAppTemplate {
  id: string
  name: string
  category: TemplateCategory
  body: string
  is_transactional: boolean
  is_active: boolean
  use_count: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

// Resource registry row. Files live in the crm-resources Supabase Storage
// bucket; we keep metadata here and reference by slug from templates.
export interface WhatsAppResource {
  id: string
  slug: string
  name: string
  description: string | null
  storage_path: string
  public_url: string
  mime_type: string
  size_bytes: number
  is_public: boolean
  is_active: boolean
  created_at: string
}

// Slugify helper used by the resource upload form. Forces the
// machine-safe charset declared in the table CHECK constraint.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')                 // strip accents
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}


/**
 * Humanize a name for customer-facing rendering. The DB sometimes stores
 * names in all-caps (cashier capslock) or all-lower (hurried typing).
 * Sending "HUJAMBO MAMA FATUMA!" feels robotic and shouty; "Hujambo Mama
 * Fatuma!" reads warm and human.
 *
 * Rules:
 *   • Leading/trailing whitespace stripped, internal whitespace collapsed.
 *   • If the input is purely digits/symbols (e.g. a phone number landed in
 *     the name field), return ''. The merge will then omit the greeting
 *     cleanly rather than produce "Hujambo 212121212!".
 *   • Each word: first letter uppercased, rest lowercased.
 *   • Hyphenated words handled: "MARY-JANE" → "Mary-Jane".
 *   • Apostrophes handled: "O'BRIEN" → "O'Brien".
 *   • If the input is already mixed-case (i.e. NOT all upper and NOT all
 *     lower), it's left alone. This preserves intentional capitalization
 *     like "iPhone Mama" or "WaSwahili" or a name the cashier already
 *     typed correctly.
 *
 * Known limitation: Western particles like "de la" or "von" aren't
 * downcased. We don't see these in Tanzania often enough to bother.
 */
export function humanizeName(input: string | null | undefined): string {
  if (!input) return ''
  const cleaned = input.trim().replace(/\s+/g, ' ')
  if (!cleaned) return ''

  // Phone-in-name-field guard: if there are no letters at all, drop it.
  if (!/[a-zA-Z]/.test(cleaned)) return ''

  // Mixed-case guard: if the cashier already capitalized intentionally,
  // leave it alone. "Already mixed" = contains both upper and lower
  // letters AND isn't simply a single-word that happens to be one of them.
  const hasUpper = /[A-Z]/.test(cleaned)
  const hasLower = /[a-z]/.test(cleaned)
  const isMixed = hasUpper && hasLower
  // Treat "MAMA Fatuma" or "fatuma HASSAN" (inconsistent) as needing fix
  // by checking if every word starts with uppercase + rest lowercase.
  if (isMixed) {
    const wellFormed = cleaned.split(' ').every(w => {
      if (w.length === 0) return true
      // Allow Title Case words; reject ALL-CAPS or all-lower words
      return /^[A-Z][a-z'-]*$/.test(w) || /^[A-Z][a-z'-]*-[A-Z][a-z'-]*$/.test(w)
    })
    if (wellFormed) return cleaned
  }

  // Title-case each word, splitting on hyphens AND apostrophes so multi-
  // segment names work: "MARY-JANE" → ["MARY", "JANE"] → "Mary-Jane".
  return cleaned.split(' ').map(word => {
    return word.split('-').map(seg => {
      return seg.split("'").map(piece => {
        if (piece.length === 0) return ''
        return piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase()
      }).join("'")
    }).join('-')
  }).join(' ')
}

// Shape of the customer data needed to merge. Kept narrow so callers can
// pass any object as long as it has these fields; avoids coupling to the
// full CustomerRecord shape.
export interface MergeCustomer {
  id: string
  name: string
  whatsapp?: string | null
  phone?: string | null
  ambassador_code?: string | null
  life_stage?: string | null
  edd?: string | null
  delivery_date?: string | null
  crown_points?: number | null
  stage_paused?: boolean | null

  // AR-related fields, populated when merging templates for debtors.
  // These power the {{outstanding_balance}}, {{open_invoice_count}}, etc.
  // placeholders. NULL/undefined → renders as empty.
  balance?: number | null               // current AR balance in TZS
  open_invoice_count?: number | null    // how many open invoices
  oldest_invoice_ref?: string | null    // e.g. 'SI-10-0012'
  oldest_invoice_age_days?: number | null  // days since oldest open invoice
}


// ─── Placeholder catalog ───────────────────────────────────────────────────
// Shown in the editor as a clickable reference. Each entry has a token, a
// description, and a sample value used when rendering the live preview.

export const PLACEHOLDERS: Array<{ token: string; description: string; sample: string }> = [
  { token: '{{customer_name}}',         description: 'Full name',                                   sample: 'Mama Amina Hassan' },
  { token: '{{customer_first_name}}',   description: 'First word of the name',                      sample: 'Amina' },
  { token: '{{ambassador_code}}',       description: 'Customer ambassador code',                    sample: 'MAL-AMINHAS37' },
  { token: '{{life_stage}}',            description: 'Life stage in human-readable form',           sample: 'pregnancy' },
  { token: '{{pregnancy_week}}',        description: 'Current pregnancy week, computed from EDD',   sample: '28' },
  { token: '{{baby_age_months}}',       description: 'Baby age in months, from delivery_date',      sample: '3' },
  { token: '{{crown_points}}',          description: 'Raw integer points balance',                  sample: '1250' },
  { token: '{{crown_balance_formatted}}',description: 'Formatted with thousands separator and pts', sample: '1,250 pts' },
  // AR / debtor placeholders. Render as empty for non-debtor customers.
  { token: '{{outstanding_balance}}',   description: 'AR balance formatted in TZS',                 sample: 'TZS 761,952' },
  { token: '{{open_invoice_count}}',    description: 'Number of open invoices',                     sample: '3' },
  { token: '{{oldest_invoice_ref}}',    description: 'Reference of the oldest open invoice',        sample: 'SI-10-0012' },
  { token: '{{oldest_invoice_age_days}}',description: 'Days since the oldest open invoice was issued',sample: '23' },
  // Document URL placeholders. Resolved at send time to signed PDF URLs.
  // The send flow generates the corresponding PDFs and supplies the URLs
  // to mergeTemplate via the resourceUrls map (under these exact keys).
  { token: '{{statement_url}}',         description: 'Link to current AR statement PDF',            sample: 'https://…/statement.pdf' },
  { token: '{{invoice_url}}',           description: 'Link to a specific invoice PDF',              sample: 'https://…/invoice.pdf' },
  { token: '{{receipt_url}}',           description: 'Link to a specific receipt PDF',              sample: 'https://…/receipt.pdf' },
  { token: '{{payment_reminder_url}}',  description: 'Link to payment reminder PDF',                sample: 'https://…/reminder.pdf' },
  { token: '{{order_reminder_url}}',    description: 'Link to order reminder PDF',                  sample: 'https://…/order.pdf' },
]


// ─── Category metadata for the UI ─────────────────────────────────────────

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  onboarding:       'Onboarding',
  check_in:         'Check-in',
  feedback:         'Feedback',
  birthday:         'Birthday',
  crown_reward:     'Crown reward',
  win_back:         'Win-back',
  referral:         'Referral',
  pregnancy_tips:   'Pregnancy tips',
  postpartum_tips:  'Postpartum tips',
  statement:        'AR statement',
  payment_reminder: 'Payment reminder',
  invoice_share:    'Invoice share',
  general:          'General',
}

export const CATEGORY_ORDER: TemplateCategory[] = [
  'onboarding', 'check_in', 'feedback', 'birthday',
  'crown_reward', 'referral', 'win_back',
  'pregnancy_tips', 'postpartum_tips',
  'statement', 'payment_reminder', 'invoice_share',
  'general',
]


// ─── Merge engine ─────────────────────────────────────────────────────────

/**
 * Compute pregnancy week from EDD. A full term is 40 weeks; the start of
 * gestation is EDD minus 280 days. Returns null if no EDD or out-of-range.
 */
function pregnancyWeekFromEdd(edd: string | null | undefined): string {
  if (!edd) return ''
  const eddDate = new Date(edd)
  if (isNaN(eddDate.getTime())) return ''
  const gestationStart = new Date(eddDate)
  gestationStart.setDate(gestationStart.getDate() - 280)
  const now = new Date()
  const daysSinceStart = Math.floor((now.getTime() - gestationStart.getTime()) / (1000 * 60 * 60 * 24))
  const weeks = Math.floor(daysSinceStart / 7)
  if (weeks < 1 || weeks > 42) return ''  // out of plausible range, just blank it
  return String(weeks)
}

/**
 * Compute baby age in months from delivery_date.
 */
function babyAgeMonthsFromDeliveryDate(deliveryDate: string | null | undefined): string {
  if (!deliveryDate) return ''
  const d = new Date(deliveryDate)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
  if (months < 0) return ''
  return String(months)
}

/**
 * Format a points balance as "1,250 pts".
 */
function formatCrownBalance(points: number | null | undefined): string {
  if (points === null || points === undefined) return '0 pts'
  return `${points.toLocaleString('en-US')} pts`
}

/**
 * Format a TZS amount with thousands separators and prefix. Returns empty
 * string for null/undefined so the merge engine drops the placeholder
 * cleanly rather than printing "TZS undefined" or "TZS 0" when no balance
 * is on file.
 */
function formatTzs(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return ''
  return `TZS ${Math.round(amount).toLocaleString('en-US')}`
}

/**
 * The merge step. Replaces all {{token}} placeholders in the template body
 * with values resolved from the customer. Missing data → empty string (per
 * Joe's spec: if a placeholder can't be resolved, send without it rather
 * than leaving the raw token visible).
 *
 * Returns the merged message AND a list of any placeholder tokens that
 * resolved to empty so the UI can warn the user before they send.
 *
 * Resources: tokens of the form {{resource:slug}} are resolved from the
 * resourceUrls map, which the caller pre-fetches from whatsapp_resources.
 */
export interface MergeResult {
  body: string
  emptyPlaceholders: string[]
}

export function mergeTemplate(
  body: string,
  customer: MergeCustomer,
  resourceUrls?: Record<string, string>,  // slug → public URL
): MergeResult {
  // Humanize the name at merge-time only (NOT in the DB). The cashier
  // entered the name however they entered it (often all-caps with
  // capslock); the customer should still see warm, human capitalization
  // in WhatsApp messages. If the name field contains only digits/symbols
  // (e.g. a phone number stored there by mistake), humanizeName returns
  // '' which naturally drops the greeting line.
  const humanFull = humanizeName(customer.name)
  const humanFirst = humanFull ? humanFull.split(/\s+/)[0] : ''
  const values: Record<string, string> = {
    '{{customer_name}}':          humanFull,
    '{{customer_first_name}}':    humanFirst,
    '{{ambassador_code}}':        customer.ambassador_code || '',
    '{{life_stage}}':             customer.life_stage || '',
    '{{pregnancy_week}}':         pregnancyWeekFromEdd(customer.edd),
    '{{baby_age_months}}':        babyAgeMonthsFromDeliveryDate(customer.delivery_date),
    '{{crown_points}}':           customer.crown_points !== null && customer.crown_points !== undefined
                                    ? String(customer.crown_points) : '0',
    '{{crown_balance_formatted}}': formatCrownBalance(customer.crown_points),
    // AR fields. Render as empty when not supplied (i.e. non-debtor customer).
    '{{outstanding_balance}}':    formatTzs(customer.balance),
    '{{open_invoice_count}}':     customer.open_invoice_count !== null && customer.open_invoice_count !== undefined
                                    ? String(customer.open_invoice_count) : '',
    '{{oldest_invoice_ref}}':     customer.oldest_invoice_ref || '',
    '{{oldest_invoice_age_days}}':customer.oldest_invoice_age_days !== null && customer.oldest_invoice_age_days !== undefined
                                    ? String(customer.oldest_invoice_age_days) : '',
    // Document URL placeholders. Caller is responsible for generating the
    // PDFs ahead of time and passing the URLs in the resourceUrls map under
    // keys that match the token names below (without the braces).
    // Example: resourceUrls['statement_url'] = 'https://....'
    '{{statement_url}}':          resourceUrls?.['statement_url'] || '',
    '{{invoice_url}}':            resourceUrls?.['invoice_url'] || '',
    '{{receipt_url}}':            resourceUrls?.['receipt_url'] || '',
    '{{payment_reminder_url}}':   resourceUrls?.['payment_reminder_url'] || '',
    '{{order_reminder_url}}':     resourceUrls?.['order_reminder_url'] || '',
  }

  const empties: string[] = []
  let result = body

  // 1. Customer-field placeholders
  for (const [token, value] of Object.entries(values)) {
    if (result.includes(token)) {
      if (!value) empties.push(token)
      result = result.split(token).join(value)
    }
  }

  // 2. Resource placeholders: {{resource:slug}} → public URL
  // We find all {{resource:...}} tokens in the body and replace each.
  // Unresolved (slug not in the map) → empty + warn.
  const resourceTokens = result.match(/\{\{resource:[a-z0-9_-]+\}\}/g) ?? []
  for (const token of resourceTokens) {
    const slug = token.slice('{{resource:'.length, -2)  // strip `{{resource:` and `}}`
    const url = resourceUrls?.[slug] ?? ''
    if (!url) empties.push(token)
    result = result.split(token).join(url)
  }

  // Light cleanup: collapse double spaces and orphan punctuation that
  // happens when a placeholder resolves to empty.
  //   "Hujambo  Mama!" → "Hujambo Mama!"   (double space)
  //   "Hujambo ! Karibu" → "Hujambo! Karibu"  (space before punctuation)
  //   "Hujambo , dada"   → "Hujambo, dada"
  result = result.replace(/ {2,}/g, ' ')
  result = result.replace(/ ([!?.,;:])/g, '$1')

  return { body: result, emptyPlaceholders: empties }
}


// ─── WhatsApp URL builder ─────────────────────────────────────────────────

/**
 * Build a WhatsApp pre-filled message URL.
 *
 * IMPORTANT: We use api.whatsapp.com/send instead of wa.me. Both endpoints
 * exist but they differ in how they handle the `text` parameter:
 *   - wa.me/<phone>?text=<msg>     — Landing page intended for short ASCII
 *                                    links. Strips or mangles emojis and
 *                                    other non-BMP UTF-8 in some browsers,
 *                                    especially when opened via window.open
 *                                    from another tab.
 *   - api.whatsapp.com/send?phone=<phone>&text=<msg>
 *                                    Legacy programmatic endpoint that
 *                                    reliably preserves UTF-8 including
 *                                    emoji (U+1F000+). This is what
 *                                    Customer.io / Trengo / Manychat use.
 *
 * Phone is normalized via formatPhone (Tanzania-aware) then stripped of
 * the leading + because the endpoint wants digits only.
 *
 * Returns null if the phone is empty or normalizes to something too short
 * to be a real number, or if the resulting URL would exceed 3,500 chars
 * (WhatsApp's effective limit on pre-filled message length).
 */
export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null
  const normalized = formatPhone(phone).replace(/[^0-9]/g, '')
  if (normalized.length < 9) return null  // too short to be a real intl number
  const encoded = encodeURIComponent(message)
  const url = `https://api.whatsapp.com/send?phone=${normalized}&text=${encoded}`
  // Defensive cap: WhatsApp truncates pre-filled messages somewhere around
  // 3,500-4,000 chars post-encoding. If we're approaching that, prefer
  // null and let the UI surface a "message too long" error.
  if (url.length > 3500) return null
  return url
}


// ─── Validation helpers ───────────────────────────────────────────────────

/**
 * Template body soft limits. wa.me query strings start to break around
 * 2,000 chars on some platforms after URL-encoding (which doubles spaces,
 * emoji, etc.). We warn at 1,200 and hard-block at 1,500 in the editor.
 */
export const TEMPLATE_BODY_WARN_LENGTH = 1200
export const TEMPLATE_BODY_MAX_LENGTH = 1500

/**
 * Returns the list of placeholder tokens used in a template body, in order
 * of first appearance. Useful for the editor's "this template uses:" chip.
 * Handles both simple tokens like {{customer_name}} and namespaced ones
 * like {{resource:onboarding_guide}}.
 */
export function extractUsedPlaceholders(body: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  // Match {{anything}} where "anything" is alphanumeric, underscore, dash,
  // or colon (for resource:slug syntax). Greedy until the closing }}.
  const re = /\{\{[a-z0-9_:-]+\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (!seen.has(m[0])) {
      seen.add(m[0])
      found.push(m[0])
    }
  }
  return found
}
