// ════════════════════════════════════════════════════════════════════════════
// payslipTemplate.ts
//
// Single source of truth for the payslip PDF template configuration.
// Stored as JSON under the 'payslip_template' key in system_settings.
// Loaded by HRMPayslips when generating PDFs and by HRMPayslipTemplate
// (the settings page) when editing.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

export interface PayslipTemplate {
  // ── BRAND / VISUAL ────────────────────────────────────────────────
  /** Hex accent color for headers, totals, and net-pay highlight bar.
   *  Default = SOKORA teal. */
  accentColor: string
  /** Secondary accent (used sparingly — section dividers, soft
   *  highlights). Default = SOKORA purple. */
  secondaryColor: string

  // ── LOGO ──────────────────────────────────────────────────────────
  /** Public URL to the company logo (PNG/JPG). Empty = no logo, fall
   *  back to text-only header. CORS must allow direct fetch. */
  logoUrl: string
  /** Logo width in mm. Height auto-scales to keep aspect ratio. */
  logoWidthMm: number
  /** Where to place the logo in the header bar. */
  logoPosition: 'left' | 'center' | 'right'
  /** Vertical padding around the logo within the header bar (mm). */
  logoPaddingMm: number

  // ── HEADER ────────────────────────────────────────────────────────
  /** Tagline shown under the company name in the header.
   *  Default: 'Reimagining Motherhood' (SOKORA voice). */
  headerTagline: string

  // ── FOOTER ────────────────────────────────────────────────────────
  /** Footer line 1 — typically the brand purpose statement.
   *  Default: 'Reimagining Motherhood'. */
  footerTagline: string
  /** Footer line 2 — small print. Default: confidentiality + auto-gen note. */
  footerSmallPrint: string

  // ── TOGGLES ───────────────────────────────────────────────────────
  /** Show employer-cost section (NSSF Er, SDL) at the bottom. */
  showEmployerCosts: boolean
  /** Show advance-recovery section when applicable. */
  showAdvanceDetail: boolean
  /** Show year-to-date totals column (Gross, PAYE, NSSF, Net YTD). */
  showYTD: boolean
  /** Show signature lines at the bottom (Prepared By / Received By). */
  showSignatureBlock: boolean
  /** Show the per-employee notes box (when notes are set on the line). */
  showEmployeeNotes: boolean
}

export const DEFAULT_PAYSLIP_TEMPLATE: PayslipTemplate = {
  // SOKORA palette — deep teal + soft purple, soft and human.
  accentColor: '#0F766E',       // teal-700
  secondaryColor: '#7C3AED',    // violet-600

  logoUrl: '',
  logoWidthMm: 28,
  logoPosition: 'left',
  logoPaddingMm: 4,

  headerTagline: 'Reimagining Motherhood',

  footerTagline: 'Reimagining Motherhood',
  footerSmallPrint: 'This is a computer-generated payslip and does not require a signature. Please keep for your records.',

  showEmployerCosts: true,
  showAdvanceDetail: true,
  showYTD: true,
  showSignatureBlock: false,
  showEmployeeNotes: true,
}

/** Load the template from system_settings. Falls back to defaults on error. */
export async function loadPayslipTemplate(): Promise<PayslipTemplate> {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'payslip_template')
    .maybeSingle()

  if (!data?.value) return { ...DEFAULT_PAYSLIP_TEMPLATE }
  try {
    const parsed = JSON.parse(data.value)
    // Merge over defaults so a partially-saved row still works after we
    // add new fields in future iterations.
    return { ...DEFAULT_PAYSLIP_TEMPLATE, ...parsed }
  } catch {
    return { ...DEFAULT_PAYSLIP_TEMPLATE }
  }
}

/** Persist the template. */
export async function savePayslipTemplate(t: PayslipTemplate): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key: 'payslip_template', value: JSON.stringify(t) }, { onConflict: 'key' })
  return error ? { error: error.message } : {}
}

// ─── Helpers ────────────────────────────────────────────────────────

/** "#0F766E" → [15, 118, 110] for jsPDF setFillColor / setTextColor */
export function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '').padEnd(6, '0').slice(0, 6)
  const num = parseInt(cleaned, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

/**
 * Fetch the logo URL and return a data URL ready for jsPDF.addImage.
 * Returns null on any failure — the caller should render text-only.
 *
 * Why fetch + canvas dance? jsPDF.addImage accepts data URLs but not
 * arbitrary cross-origin URLs reliably. CORS-safe images decode through
 * an Image() and a canvas to base64. The full chain is wrapped in try
 * because logos hosted on Vercel/Supabase Storage almost always work,
 * but the user could plug in any URL.
 */
export async function logoToDataUrl(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!url) return null
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image load failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: img.naturalWidth,
      height: img.naturalHeight,
    }
  } catch {
    return null
  }
}
