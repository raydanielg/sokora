// ─── Settings Defaults ─────────────────────────────────────────────────────
// Every setting key used anywhere in the app, with its default shape and
// value. When a new user signs up or the app boots for the first time,
// these are the fallbacks. When the Settings UI adds a new field, define
// its default here and it works everywhere automatically.
//
// Keep the shapes stable. If you rename a key, add a migration in
// settingsLoader.ts — don't just rename here or everyone's saved data
// stops reading.
// ───────────────────────────────────────────────────────────────────────────

export interface CompanyFinanceSettings {
  company_name: string
  tin: string
  vrn: string              // VAT Registration Number (Tanzania)
  physical_address: string
  postal_address: string
  email: string
  phone: string
  currency: string         // ISO code, e.g. 'TZS'
  fiscal_year_start_month: number   // 1-12, default 7 (July)
  vat_rate: number         // percentage, default 18
  vat_inclusive_default: boolean    // are prices quoted inclusive of VAT?
  go_live_date: string | null       // YYYY-MM-DD
  backdate_limit_days: number       // how far back users can post
  period_lock_enabled: boolean
}

export interface NumberingSettings {
  // Each voucher type has: prefix, next number, reset cycle
  // e.g. cash_sale: { prefix: 'CS-', pad: 4, next: 1, reset: 'annual' }
  cash_sale:        NumberingRule
  sales_invoice:    NumberingRule
  proforma:         NumberingRule
  sales_return:     NumberingRule
  credit_note:      NumberingRule
  debit_note:       NumberingRule
  purchase_order:   NumberingRule
  grn:              NumberingRule
  purchase_invoice: NumberingRule
  purchase_return:  NumberingRule
  cash_payment:     NumberingRule
  cash_receipt:     NumberingRule
  bank_payment:     NumberingRule
  bank_receipt:     NumberingRule
  journal_entry:    NumberingRule
  stock_adjustment: NumberingRule
  stock_transfer:   NumberingRule
  opening_stock:    NumberingRule
}

export interface NumberingRule {
  prefix: string
  pad: number              // number of digits, e.g. 4 → "0001"
  reset: 'annual' | 'continuous' | 'monthly'
  include_year: boolean    // prefix like CS-25-0042
  include_branch: boolean  // prefix like CS-10-0042
}

export interface TaxSettings {
  vat_enabled: boolean
  default_vat_rate: number     // 18 (Tanzania)
  vat_rates: { label: string; rate: number }[]  // for products that differ
  withholding_tax_enabled: boolean
  withholding_tax_rate: number
  efd_integration_enabled: boolean     // TRA EFD device hook (placeholder)
  efd_serial: string
}

export interface NotificationSettings {
  low_stock_threshold_units: number    // alert when any SKU drops below this
  low_stock_email_enabled: boolean
  low_stock_email_recipients: string[]
  daily_summary_enabled: boolean
  daily_summary_time: string           // "18:00"
  daily_summary_recipients: string[]
  overdue_payment_alerts: boolean
  overdue_threshold_days: number       // alert once an invoice is N days overdue
}

export interface SecuritySettings {
  session_timeout_minutes: number      // inactivity auto-logout
  require_reauth_for_void: boolean
  require_reauth_for_delete: boolean
  failed_login_lockout_enabled: boolean
  failed_login_attempts_before_lockout: number
  lockout_duration_minutes: number
  audit_log_retention_days: number
}

export interface BackupSettings {
  auto_export_enabled: boolean
  auto_export_frequency: 'daily' | 'weekly' | 'monthly'
  auto_export_day_of_week: number      // 0=Sun..6=Sat (for weekly)
  auto_export_time: string             // "02:00"
  auto_export_recipients: string[]
  data_retention_years: number
}

export interface RegionalSettings {
  number_format: 'comma_period' | 'period_comma' | 'space_period'
  // 1,234.56  vs  1.234,56  vs  1 234.56
  date_format: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  timezone: string                     // 'Africa/Dar_es_Salaam'
  week_start: 'sunday' | 'monday'
  language: 'en' | 'sw' | 'en-sw'      // code-mixed option per user pref
}

export interface DisplaySettings {
  theme: string                        // theme key from DisplaySettings.tsx THEMES
  font_size: number                    // px, 12-18
  border_radius: number                // px
  animations_enabled: boolean
  compact_mode: boolean
  show_grid_lines: boolean
  highlight_on_hover: boolean
  mono_numbers: boolean
  sticky_headers: boolean
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_COMPANY: CompanyFinanceSettings = {
  company_name: 'Your Organization',
  tin: '',
  vrn: '',
  physical_address: 'Dar es Salaam, Tanzania',
  postal_address: '',
  email: '',
  phone: '',
  currency: 'TZS',
  fiscal_year_start_month: 7,
  vat_rate: 18,
  vat_inclusive_default: true,
  go_live_date: null,
  backdate_limit_days: 30,
  period_lock_enabled: false,
}

const defaultRule = (prefix: string): NumberingRule => ({
  prefix, pad: 4, reset: 'continuous', include_year: false, include_branch: true,
})

export const DEFAULT_NUMBERING: NumberingSettings = {
  cash_sale:        defaultRule('CS-'),
  sales_invoice:    defaultRule('SI-'),
  proforma:         defaultRule('PF-'),
  sales_return:     defaultRule('SR-'),
  credit_note:      defaultRule('CN-'),
  debit_note:       defaultRule('DN-'),
  purchase_order:   defaultRule('PO-'),
  grn:              defaultRule('GRN-'),
  purchase_invoice: defaultRule('PI-'),
  purchase_return:  defaultRule('PR-'),
  cash_payment:     defaultRule('CP-'),
  cash_receipt:     defaultRule('CR-'),
  bank_payment:     defaultRule('BP-'),
  bank_receipt:     defaultRule('BR-'),
  journal_entry:    defaultRule('JV-'),
  stock_adjustment: defaultRule('SA-'),
  stock_transfer:   defaultRule('ST-'),
  opening_stock:    defaultRule('OS-'),
}

export const DEFAULT_TAX: TaxSettings = {
  // VAT is disabled by default. Tanzanian SMEs only register for VAT once
  // turnover crosses 100M TZS. Flip this on in Settings → Tax once the
  // organisation is registered and starts charging VAT on invoices.
  vat_enabled: false,
  default_vat_rate: 18,
  vat_rates: [
    { label: 'Standard', rate: 18 },
    { label: 'Zero-rated', rate: 0 },
    { label: 'Exempt', rate: 0 },
  ],
  withholding_tax_enabled: false,
  withholding_tax_rate: 5,
  efd_integration_enabled: false,
  efd_serial: '',
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  low_stock_threshold_units: 5,
  low_stock_email_enabled: false,
  low_stock_email_recipients: [],
  daily_summary_enabled: false,
  daily_summary_time: '18:00',
  daily_summary_recipients: [],
  overdue_payment_alerts: false,
  overdue_threshold_days: 14,
}

export const DEFAULT_SECURITY: SecuritySettings = {
  session_timeout_minutes: 30,
  require_reauth_for_void: true,
  require_reauth_for_delete: true,
  failed_login_lockout_enabled: true,
  failed_login_attempts_before_lockout: 5,
  lockout_duration_minutes: 15,
  audit_log_retention_days: 365,
}

export const DEFAULT_BACKUP: BackupSettings = {
  auto_export_enabled: false,
  auto_export_frequency: 'weekly',
  auto_export_day_of_week: 1,
  auto_export_time: '02:00',
  auto_export_recipients: [],
  data_retention_years: 7,
}

export const DEFAULT_REGIONAL: RegionalSettings = {
  number_format: 'comma_period',
  date_format: 'DD/MM/YYYY',
  timezone: 'Africa/Dar_es_Salaam',
  week_start: 'monday',
  language: 'en-sw',
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  theme: 'midnight',
  font_size: 14,
  border_radius: 10,
  animations_enabled: true,
  compact_mode: false,
  show_grid_lines: true,
  highlight_on_hover: true,
  mono_numbers: true,
  sticky_headers: true,
}

// ─── Setting keys (as stored in system_settings.key) ────────────────────────
// Keep these as exported constants so there's one place that defines them.
// No more magic strings scattered across 10 pages.

export const SETTING_KEYS = {
  COMPANY_FINANCE: 'company_finance',
  NUMBERING:       'numbering',
  TAX:             'tax',
  NOTIFICATIONS:   'notifications',
  SECURITY:        'security',
  BACKUP:          'backup',
  REGIONAL:        'regional',
  DISPLAY:         'display',

  // Existing keys already in use — kept for backwards compat
  WHATSAPP:             'whatsapp_config',
  INVENTORY_LEGACY:     'inventory_settings',
  PRODUCT_CATEGORIES:   'product_categories_v2',
  PRODUCT_UNITS:        'product_units',
  HR:                   'hr_settings',
  RECEIPT_TEMPLATE:     'receipt_template',
  INVOICE_TEMPLATE:     'invoice_template',
  PROFORMA_TEMPLATE:    'proforma_template',
  REPORT_TEMPLATES:     'report_templates',
  ACCOUNTING_SETTINGS:  'accounting_settings',
} as const

export type SettingKey = typeof SETTING_KEYS[keyof typeof SETTING_KEYS]

// ─── Aggregate shape — what useSettings() returns ───────────────────────────

export interface AllSettings {
  company:       CompanyFinanceSettings
  numbering:     NumberingSettings
  tax:           TaxSettings
  notifications: NotificationSettings
  security:      SecuritySettings
  backup:        BackupSettings
  regional:      RegionalSettings
  display:       DisplaySettings
}

export const DEFAULT_ALL_SETTINGS: AllSettings = {
  company:       DEFAULT_COMPANY,
  numbering:     DEFAULT_NUMBERING,
  tax:           DEFAULT_TAX,
  notifications: DEFAULT_NOTIFICATIONS,
  security:      DEFAULT_SECURITY,
  backup:        DEFAULT_BACKUP,
  regional:      DEFAULT_REGIONAL,
  display:       DEFAULT_DISPLAY,
}
