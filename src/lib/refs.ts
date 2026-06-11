// ── SOKORA VOUCHER NUMBER SERIES ─────────────────────────────────────────
// Format: PREFIX-BRANCH-SEQUENCE
// Example: CS-10-0001 (Cash Sale, Branch 10, sequence 1)
// 2-letter prefix = sales side, 3-letter prefix = operational/other
//
// FIX: Race condition eliminated. When two cashiers post simultaneously,
// the old code would query the same MAX, generate the same ref, and the
// second insert would crash on journals_ref_key unique constraint.
// Now we query journals + vouchers for the true max, and the caller
// (cashSalePost.ts) retries on collision.

import { supabase } from './supabase'

export const VOUCHER_PREFIXES: Record<string, string> = {
  cash_sale:        'CS',
  sales_invoice:    'SI',
  sales_return:     'SR',
  proforma:         'PF',
  credit_note:      'CN',
  debit_note:       'DN',
  cash_payment:     'PAY',
  cash_receipt:     'RCP',
  bank_transfer:    'BNK',
  contra:           'CTR',
  petty_cash:       'PCT',
  purchase_invoice: 'PIP',
  purchase_order:   'PO',
  grn:              'GRN',
  purchase_return:  'PRN',
  stock_transfer:   'STP',
  stock_adjustment: 'ADJ',
  opening_stock:    'OST',
  journal_entry:    'JNL',
  import_order:     'IMP',
  internal_use:     'IU',
}

const DEFAULT_BRANCH = '10'

/**
 * Generate next ref by checking BOTH vouchers and journals tables
 * for the true maximum sequence number, preventing collisions.
 */
export const nextRef = async (type: string, branchCode: string = DEFAULT_BRANCH): Promise<string> => {
  const prefix = VOUCHER_PREFIXES[type] || type.toUpperCase().slice(0, 3)
  const pattern = `${prefix}-${branchCode}-`

  try {
    // Check vouchers table
    const { data: vData } = await supabase
      .from('vouchers')
      .select('ref')
      .like('ref', `${pattern}%`)
      .order('ref', { ascending: false })
      .limit(1)

    // Also check journals table (refs there are prefixed with JV-)
    // The journal ref is 'JV-CS-10-0165', the voucher ref is 'CS-10-0165'
    // We also check journals.source_ref which stores the raw ref
    const { data: jData } = await supabase
      .from('journals')
      .select('source_ref')
      .like('source_ref', `${pattern}%`)
      .order('source_ref', { ascending: false })
      .limit(1)

    let maxSeq = 0

    if (vData && vData.length > 0) {
      const seq = parseInt((vData[0].ref as string).replace(pattern, '')) || 0
      if (seq > maxSeq) maxSeq = seq
    }

    if (jData && jData.length > 0) {
      const seq = parseInt((jData[0].source_ref as string).replace(pattern, '')) || 0
      if (seq > maxSeq) maxSeq = seq
    }

    return `${pattern}${String(maxSeq + 1).padStart(4, '0')}`
  } catch {
    // Fallback using timestamp if Supabase call fails
    const seq = String(Date.now()).slice(-4)
    return `${pattern}${seq}`
  }
}

/**
 * Retry wrapper: attempts to insert into journals, and if it hits
 * a unique constraint violation on ref, bumps the sequence and retries.
 * Use this instead of a raw .insert() on journals.
 */
export const insertJournalWithRetry = async (
  journalData: Record<string, unknown>,
  maxRetries: number = 3
): Promise<{ data: { id: string } | null; error: Error | null }> => {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await supabase
      .from('journals')
      .insert(journalData)
      .select('id')
      .single()

    if (!error) {
      return { data, error: null }
    }

    // Check if it's the duplicate ref error
    if (error.message?.includes('journals_ref_key') || error.code === '23505') {
      lastError = new Error(`Journal ref collision (attempt ${attempt + 1}), retrying...`)

      // Extract the voucher type from the ref to regenerate
      // ref format is 'JV-CS-10-0165', source_ref is 'CS-10-0165'
      const sourceRef = journalData.source_ref as string

      if (sourceRef) {
        // Parse out the type from the source_ref pattern
        const parts = sourceRef.split('-')
        if (parts.length >= 3) {
          const prefix = parts[0]
          const branch = parts[1]
          const typeKey = Object.entries(VOUCHER_PREFIXES).find(([_, v]) => v === prefix)?.[0] || ''

          if (typeKey) {
            const newRef = await nextRef(typeKey, branch)
            journalData = {
              ...journalData,
              ref: 'JV-' + newRef,
              source_ref: newRef,
              description: (journalData.description as string || '').replace(sourceRef, newRef),
            }
          } else {
            // Can't determine type, just bump the number
            const seq = parseInt(parts[2]) || 0
            const bumped = `${prefix}-${branch}-${String(seq + 1).padStart(4, '0')}`
            journalData = {
              ...journalData,
              ref: 'JV-' + bumped,
              source_ref: bumped,
            }
          }
        }
      }
      continue
    }

    // Some other error, don't retry
    return { data: null, error: new Error(error.message) }
  }

  return { data: null, error: lastError || new Error('Max retries exceeded for journal insert') }
}

// Sync version for display
export const previewRef = (type: string, branchCode: string = DEFAULT_BRANCH): string => {
  const prefix = VOUCHER_PREFIXES[type] || type.toUpperCase().slice(0, 3)
  return `${prefix}-${branchCode}-????`
}
