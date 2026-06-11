// ─── Item Ledger Helper ────────────────────────────────────────────────────
// Single source of truth for writing to item_ledger_entries.
//
// The ledger table stores location by UUID (location_id). For display,
// callers join stock_locations to resolve the code and name.
//
// Rule: NEVER call supabase.from('item_ledger_entries').insert(...) directly.
// Always go through postLedgerEntry() or postLedgerEntries() in this file.
// ─────────────────────────────────────────────────────────────────────────── 

import { supabase } from './supabase'

export type LedgerEntryType =
  | 'sale'
  | 'purchase'
  | 'grn'
  | 'return'                // sales return (stock coming back in)
  | 'purchase_return'       // stock going back to supplier
  | 'opening_stock'
  | 'positive_adjustment'
  | 'negative_adjustment'
  | 'write_off'
  | 'transfer_in'
  | 'transfer_out'
  | 'internal_use'          // product consumed internally (sample / own use / damage / training)

export type LedgerDocumentType =
  | 'cash_sale'
  | 'sales_invoice'
  | 'grn'
  | 'purchase'
  | 'credit_note'
  | 'sales_return'
  | 'purchase_return'
  | 'stock_transfer'
  | 'stock_adjustment'
  | 'opening_stock'
  | 'data_import'
  | 'backfill'
  | 'internal_use'          // matches the InternalUse voucher type

export interface LedgerEntryInput {
  product_id: string
  entry_type: LedgerEntryType
  document_type: LedgerDocumentType
  document_ref: string
  posting_date: string        // YYYY-MM-DD
  qty: number                 // positive = stock in, negative = stock out
  cost_amount: number         // always stored positive

  // Location by UUID. Either pass location_id directly, or pass a
  // { id, code? } object via `location` — both reach the same place.
  location_id?: string | null
  location?: { id: string; code?: string } | null
}

export interface LedgerPostResult {
  success: boolean
  error?: string
}

/**
 * Post a single item ledger entry.
 *
 * Enforces: required fields present, cost_amount non-negative, posting_date
 * looks like YYYY-MM-DD, qty non-zero.
 *
 * Warns (does not throw) when location is omitted — some edge cases like
 * pure journal reversals may genuinely lack location context.
 */
export async function postLedgerEntry(input: LedgerEntryInput): Promise<LedgerPostResult> {
  const row = normalize(input)
  const validationError = validate(row)
  if (validationError) {
    console.error('[ledger] validation failed:', validationError, row)
    return { success: false, error: validationError }
  }

  const { error } = await supabase.from('item_ledger_entries').insert(row)
  if (error) {
    console.error('[ledger] insert failed:', error.message, row)
    return { success: false, error: error.message }
  }
  return { success: true }
}

/**
 * Post multiple ledger entries in a single round-trip. Atomic from the
 * Supabase side — either all rows go in or none do.
 */
export async function postLedgerEntries(inputs: LedgerEntryInput[]): Promise<LedgerPostResult> {
  if (inputs.length === 0) return { success: true }

  const rows = inputs.map(normalize)
  for (const row of rows) {
    const validationError = validate(row)
    if (validationError) {
      console.error('[ledger] batch validation failed:', validationError, row)
      return { success: false, error: validationError }
    }
  }

  const { error } = await supabase.from('item_ledger_entries').insert(rows)
  if (error) {
    console.error('[ledger] batch insert failed:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true }
}

// ─── Internals ──────────────────────────────────────────────────────────────

interface NormalizedRow {
  product_id: string
  entry_type: LedgerEntryType
  document_type: LedgerDocumentType
  document_ref: string
  posting_date: string
  qty: number
  cost_amount: number
  location_id: string | null
}

function normalize(input: LedgerEntryInput): NormalizedRow {
  // Source of truth for location: prefer the `location` object if provided,
  // fall back to location_id passed directly.
  const locId = input.location?.id ?? input.location_id ?? null

  return {
    product_id:    input.product_id,
    entry_type:    input.entry_type,
    document_type: input.document_type,
    document_ref:  input.document_ref,
    posting_date:  input.posting_date,
    qty:           input.qty,
    cost_amount:   Math.abs(input.cost_amount),
    location_id:   locId,
  }
}

function validate(row: NormalizedRow): string | null {
  if (!row.product_id)    return 'product_id is required'
  if (!row.entry_type)    return 'entry_type is required'
  if (!row.document_type) return 'document_type is required'
  if (!row.document_ref)  return 'document_ref is required'
  if (!row.posting_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.posting_date)) {
    return `posting_date must be YYYY-MM-DD, got: ${row.posting_date}`
  }
  if (typeof row.qty !== 'number' || !isFinite(row.qty) || row.qty === 0) {
    return 'qty must be a non-zero number'
  }
  if (typeof row.cost_amount !== 'number' || !isFinite(row.cost_amount) || row.cost_amount < 0) {
    return 'cost_amount must be a non-negative number'
  }

  // Soft warning — entry will still post but won't appear under any
  // location filter. Watch your console in dev.
  if (!row.location_id) {
    console.warn(
      '[ledger] posting entry without location_id. ' +
      `product=${row.product_id} type=${row.entry_type} ref=${row.document_ref}. ` +
      'This entry will not appear under any location filter.'
    )
  }

  return null
}
