// ════════════════════════════════════════════════════════════════════════════
// customerDocuments.ts
//
// Per-customer document generation + upload + signed URL retrieval. Used
// by the WhatsApp template flow to attach statements, invoices, receipts,
// and reminders as PDF links in outbound messages.
//
// Architecture:
//   1. Generator functions render a DOM element (already on the page) to
//      a PNG via html2canvas, then wrap that PNG in a PDF via jsPDF.
//      Both libraries are loaded dynamically from CDN to avoid bundle
//      bloat (same pattern as CustomerStatement's existing PNG export).
//   2. The resulting PDF blob is uploaded to the `crm-customer-docs`
//      Storage bucket (PRIVATE — created in migration 026).
//   3. A signed URL good for 7 days is generated and returned.
//   4. The audit row is logged via the log_customer_document RPC.
//
// To add a new doc type later (e.g. 'order_reminder'):
//   • Add a case to DocumentType union
//   • Add a generator in the GENERATORS map
//   • Add a placeholder name to DOCUMENT_PLACEHOLDERS
//   • Done. No changes needed to the merge engine or send flow.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// All doc types this system can produce. Each maps to a placeholder
// token (e.g. {{statement_url}}) that templates can include.
export type DocumentType =
  | 'statement'
  | 'invoice'
  | 'receipt'
  | 'payment_reminder'
  | 'order_reminder'

// Placeholder tokens that resolve to signed URLs at template merge time.
// The merge engine scans the template body for these tokens, calls the
// appropriate generator, and substitutes in the signed URL.
export const DOCUMENT_PLACEHOLDERS: Record<DocumentType, string> = {
  statement:         '{{statement_url}}',
  invoice:           '{{invoice_url}}',         // Note: needs a ref (see below)
  receipt:           '{{receipt_url}}',         // Note: needs a ref
  payment_reminder:  '{{payment_reminder_url}}',
  order_reminder:    '{{order_reminder_url}}',
}

const STORAGE_BUCKET = 'crm-customer-docs'
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 7  // 7 days

export interface GeneratedDocument {
  url: string                // signed URL (expires in 7 days)
  storagePath: string        // path inside the bucket
  expiresAt: Date            // when the signed URL dies
  docType: DocumentType
  docRef: string | null
}

// ─── Library loaders ─────────────────────────────────────────────────────
// jsPDF + html2canvas loaded on demand. Same CDN pattern as CustomerStatement.
// This avoids ~300KB of upfront bundle bloat for users who never send docs.

async function loadHtml2Canvas(): Promise<any> {
  if ((window as any).html2canvas) return (window as any).html2canvas
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    script.onload = () => resolve((window as any).html2canvas)
    script.onerror = () => reject(new Error('Failed to load html2canvas'))
    document.body.appendChild(script)
  })
}

async function loadJsPDF(): Promise<any> {
  if ((window as any).jspdf?.jsPDF) return (window as any).jspdf.jsPDF
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    script.onload = () => resolve((window as any).jspdf.jsPDF)
    script.onerror = () => reject(new Error('Failed to load jsPDF'))
    document.body.appendChild(script)
  })
}

// ─── Core renderer ───────────────────────────────────────────────────────
// Render a DOM element to a Blob containing a PDF of that element. The
// PDF is A4 portrait; we scale the rendered PNG to fit the page width.

export async function renderElementToPdfBlob(element: HTMLElement): Promise<Blob> {
  const [html2canvas, jsPDF] = await Promise.all([loadHtml2Canvas(), loadJsPDF()])

  const fullWidth  = element.scrollWidth  || element.offsetWidth
  const fullHeight = element.scrollHeight || element.offsetHeight

  // Render at 1.5x for crisp text on retina screens
  const canvas: HTMLCanvasElement = await html2canvas(element, {
    scale: 1.5,
    useCORS: true,
    backgroundColor: '#ffffff',
    width: fullWidth,
    height: fullHeight,
    windowWidth: fullWidth,
    windowHeight: fullHeight,
    scrollX: 0,
    scrollY: 0,
  })

  // A4 in mm: 210 × 297
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidthMm  = 210
  const pageHeightMm = 297
  const marginMm     = 10
  const usableWidth  = pageWidthMm - 2 * marginMm
  const usableHeight = pageHeightMm - 2 * marginMm

  // Scale the canvas image to fit the page width, preserve aspect ratio.
  const imgWidthMm  = usableWidth
  const imgHeightMm = (canvas.height / canvas.width) * imgWidthMm

  const imgData = canvas.toDataURL('image/png')

  if (imgHeightMm <= usableHeight) {
    // Fits on one page.
    pdf.addImage(imgData, 'PNG', marginMm, marginMm, imgWidthMm, imgHeightMm)
  } else {
    // Spans multiple pages. We slice the canvas vertically into page-sized
    // chunks and add each as a separate PDF page. This is the standard
    // long-statement multi-page pattern.
    const pxPerMm = canvas.width / imgWidthMm
    const sliceHeightPx = Math.floor(usableHeight * pxPerMm)
    let yOffset = 0
    while (yOffset < canvas.height) {
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width  = canvas.width
      sliceCanvas.height = Math.min(sliceHeightPx, canvas.height - yOffset)
      const ctx = sliceCanvas.getContext('2d')!
      ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height)
      const sliceData = sliceCanvas.toDataURL('image/png')
      const sliceHeightMm = (sliceCanvas.height / canvas.width) * imgWidthMm
      if (yOffset > 0) pdf.addPage()
      pdf.addImage(sliceData, 'PNG', marginMm, marginMm, imgWidthMm, sliceHeightMm)
      yOffset += sliceCanvas.height
    }
  }

  return pdf.output('blob')
}

// ─── Upload + sign ───────────────────────────────────────────────────────

export async function uploadAndSignDocument(
  blob: Blob,
  customerId: string,
  docType: DocumentType,
  docRef: string | null,
): Promise<GeneratedDocument> {
  // Storage path scheme: {docType}/{customer_id}/{timestamp}-{ref?}.pdf
  // Including the timestamp in the path makes every generation a unique
  // file — so a customer can have multiple statements (one per send) and
  // we can audit/delete old ones individually.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const refPart = docRef ? `-${docRef}` : ''
  const storagePath = `${docType}/${customerId}/${timestamp}${refPart}.pdf`

  // 1. Upload
  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, blob, {
      contentType: 'application/pdf',
      upsert: false,
    })
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

  // 2. Sign
  const { data: signed, error: signErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS)
  if (signErr || !signed?.signedUrl) {
    // Cleanup the orphan blob before throwing
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]).catch(() => {})
    throw new Error(`Sign URL failed: ${signErr?.message ?? 'unknown'}`)
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000)

  // 3. Audit log (best-effort: if this fails we still return the URL, but
  // log a warning. The document is usable; the audit row is the optional
  // part.)
  try {
    await supabase.rpc('log_customer_document', {
      p_customer_id:  customerId,
      p_doc_type:     docType,
      p_doc_ref:      docRef,
      p_storage_path: storagePath,
      p_signed_url:   signed.signedUrl,
      p_expires_at:   expiresAt.toISOString(),
    })
  } catch (e) {
    console.warn('log_customer_document failed (non-fatal):', e)
  }

  return {
    url: signed.signedUrl,
    storagePath,
    expiresAt,
    docType,
    docRef,
  }
}

// ─── Convenience: render + upload in one call ────────────────────────────
// Most callers want both steps together. This is the high-level entry point.

export async function generateAndUploadDocumentFromElement(
  element: HTMLElement,
  customerId: string,
  docType: DocumentType,
  docRef: string | null = null,
): Promise<GeneratedDocument> {
  const blob = await renderElementToPdfBlob(element)
  return await uploadAndSignDocument(blob, customerId, docType, docRef)
}

// ─── Placeholder utilities ───────────────────────────────────────────────
// Used by the WhatsApp template send flow. Scans the template body for any
// document placeholders, returns the list. The caller then generates each
// required doc and supplies the URLs to mergeTemplate via resourceUrls.

export interface DocumentPlaceholderRequirement {
  docType: DocumentType
  placeholder: string  // the literal token (e.g. "{{statement_url}}")
}

export function extractDocumentRequirements(templateBody: string): DocumentPlaceholderRequirement[] {
  const found: DocumentPlaceholderRequirement[] = []
  for (const [docType, placeholder] of Object.entries(DOCUMENT_PLACEHOLDERS) as Array<[DocumentType, string]>) {
    if (templateBody.includes(placeholder)) {
      found.push({ docType, placeholder })
    }
  }
  return found
}
