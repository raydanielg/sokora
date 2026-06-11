// ════════════════════════════════════════════════════════════════════════════
// approvalExecutor.ts
// When an approval_request is approved, the RPC returns the snapshot payload.
// This module takes that payload + reference metadata and actually posts the
// voucher (writes journal lines, updates balances, writes ledger entries, etc.)
//
// Each voucher type that participates in approvals must register an executor
// here. An executor:
//   1. Reads the payload (produced by the voucher's own submitForApproval call)
//   2. Flips the voucher row from 'pending_approval' → 'posted'
//   3. Writes the journal + lines + ledger entries using the same logic the
//      voucher's own post() function uses (we share helpers where possible)
//   4. Returns { success, voucherId, error }
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'
import { insertJournalWithRetry } from './refs'
import { postLedgerEntry } from './itemLedger'
import { markRequestExecuted } from './useApproval'

// ─── Tax settings reader ────────────────────────────────────────────────────
// Mirrors useSettings().settings.tax for non-React contexts (executors are
// not React components and can't call hooks). Reads the same 'tax' row from
// system_settings that the React loader merges with defaults.
async function getTaxSettings(): Promise<{ vatEnabled: boolean; vatRate: number }> {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'tax')
    .maybeSingle()
  let parsed: any = null
  try {
    parsed = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : null
  } catch { /* fall through to defaults */ }
  return {
    vatEnabled: parsed?.vat_enabled ?? false,
    vatRate: parsed?.default_vat_rate ?? 18,
  }
}

export interface ExecutorResult {
  success: boolean
  voucherId?: string
  error?: string
}

export interface ExecuteContext {
  requestId: string
  referenceType: string
  referenceId: string
  payload: any
  executedBy: string               // user.id of the approver
  executedByName: string           // user full_name
}

// ─── Type-specific executors ───────────────────────────────────────────────

// Internal Use — Dr expense (5081/5082/etc), Cr inventory (1110)
async function executeInternalUse(c: ExecuteContext): Promise<ExecutorResult> {
  const p = c.payload as {
    form: {
      date: string; ref: string; category: string;
      takenBy: string; takenByOther?: string;
      recipient?: string; locationCode: string; notes?: string;
    }
    lines: Array<{ productId: string; name: string; qty: number; unitCost: number; amount: number }>
    accountCode: string              // the expense account for this category
    total: number
    categoryLabel: string
  }

  const resolvedTakenBy = p.form.takenBy === 'Other'
    ? (p.form.takenByOther?.trim() || 'Other')
    : p.form.takenBy

  // Look up account IDs
  const { data: acctData, error: acctErr } = await supabase
    .from('accounts')
    .select('id, code')
    .in('code', [p.accountCode, '1110'])

  if (acctErr) return { success: false, error: 'Account lookup: ' + acctErr.message }
  const expenseAccId = acctData?.find(a => a.code === p.accountCode)?.id
  const inventoryAccId = acctData?.find(a => a.code === '1110')?.id
  if (!expenseAccId || !inventoryAccId) {
    return { success: false, error: 'Required account not found' }
  }

  // 1. Journal header
  const { data: journal, error: jErr } = await insertJournalWithRetry({
    ref: 'JV-' + p.form.ref,
    posting_date: p.form.date,
    description: `Internal Use — ${p.categoryLabel} — ${resolvedTakenBy}`,
    journal_type: 'internal_use',
    source_type: 'internal_use',
    source_ref: p.form.ref,
    posted_by: c.executedByName,
    status: 'posted',
  })
  if (jErr || !journal) return { success: false, error: 'Journal: ' + (jErr?.message || 'unknown') }

  // 2. Journal lines
  const descPrefix = `Internal use · ${p.categoryLabel} · ${resolvedTakenBy}`
  const { error: jlErr } = await supabase.from('journal_lines').insert([
    { journal_id: journal.id, line_number: 1, account_id: expenseAccId,
      description: descPrefix + (p.form.recipient ? ` · ${p.form.recipient}` : ''),
      debit: p.total, credit: 0 },
    { journal_id: journal.id, line_number: 2, account_id: inventoryAccId,
      description: `Inventory out · ${p.form.ref}`,
      debit: 0, credit: p.total },
  ])
  if (jlErr) return { success: false, error: 'Journal lines: ' + jlErr.message }

  // 3. Balance updates
  await Promise.all([
    supabase.rpc('update_account_balance', { p_account_id: expenseAccId, p_debit: p.total, p_credit: 0 }),
    supabase.rpc('update_account_balance', { p_account_id: inventoryAccId, p_debit: 0, p_credit: p.total }),
  ])

  // 4. Flip voucher from pending_approval → posted
  const { error: vuErr } = await supabase
    .from('vouchers')
    .update({
      status: 'posted',
      journal_id: journal.id,
      posted_by: c.executedByName,
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', c.referenceId)

  if (vuErr) return { success: false, error: 'Voucher update: ' + vuErr.message }

  // 5. Ledger entries + stock decrement
  // Resolve the location UUID for the ledger (table stores location_id)
  const { data: locRow } = await supabase.from('stock_locations')
    .select('id, code').eq('code', p.form.locationCode).maybeSingle()

  // Hard guard: a stock-decrementing voucher without a resolved location is a
  // configuration bug. Refuse rather than silently update only global qty,
  // which is what caused the historical drift we just cleaned up.
  if (!locRow) {
    return { success: false, error: `Cannot execute: location code "${p.form.locationCode || '(empty)'}" not found in stock_locations` }
  }

  for (const ln of p.lines) {
    if (!ln.productId || ln.qty <= 0) continue

    await postLedgerEntry({
      product_id: ln.productId,
      entry_type: 'internal_use',
      document_type: 'internal_use',
      document_ref: p.form.ref,
      posting_date: p.form.date,
      qty: -ln.qty,                           // negative = stock out
      cost_amount: ln.unitCost * ln.qty,      // always positive
      location: locRow,
    })

    // Decrement THIS LOCATION's qty. The product_locations trigger then
    // recomputes products.qty_on_hand = SUM(all locations), keeping global
    // in sync. Drift becomes structurally impossible.
    const { data: existingLoc } = await supabase.from('product_locations')
      .select('qty_on_hand').eq('product_id', ln.productId).eq('location_id', locRow.id).maybeSingle()
    const newLocQty = Math.max(0, (existingLoc?.qty_on_hand ?? 0) - ln.qty)
    await supabase.from('product_locations').upsert(
      { product_id: ln.productId, location_id: locRow.id, location_code: locRow.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
      { onConflict: 'product_id,location_id' }
    )
  }

  return { success: true, voucherId: c.referenceId }
}

// Stock Adjustment — uses the StockAdjustment voucher's shape
async function executeStockAdjustment(c: ExecuteContext): Promise<ExecutorResult> {
  const p = c.payload as {
    form: { date: string; ref: string; type: 'increase' | 'decrease'; reason: string; notes?: string; locationCode: string }
    lines: Array<{ productId: string; qty: number; unitCost: number; amount: number }>
    total: number
  }

  // Accounts: 1110 Inventory vs 5099 Inventory Adjustment
  const { data: acctData, error: aErr } = await supabase
    .from('accounts').select('id, code').in('code', ['1110', '5099'])
  if (aErr) return { success: false, error: 'Account lookup: ' + aErr.message }
  const invAcc = acctData?.find(a => a.code === '1110')?.id
  const adjAcc = acctData?.find(a => a.code === '5099')?.id
  if (!invAcc || !adjAcc) return { success: false, error: 'Account 1110 or 5099 missing' }

  // type=increase → Dr Inventory, Cr Adjustment (unusual; usually opening)
  // type=decrease → Dr Adjustment, Cr Inventory (write-off)
  const dr = p.form.type === 'increase' ? invAcc : adjAcc
  const cr = p.form.type === 'increase' ? adjAcc : invAcc

  const { data: journal, error: jErr } = await insertJournalWithRetry({
    ref: 'JV-' + p.form.ref,
    posting_date: p.form.date,
    description: `Stock Adjustment — ${p.form.type} — ${p.form.reason}`,
    journal_type: 'stock_adjustment',
    source_type: 'stock_adjustment',
    source_ref: p.form.ref,
    posted_by: c.executedByName,
    status: 'posted',
  })
  if (jErr || !journal) return { success: false, error: 'Journal: ' + (jErr?.message || 'unknown') }

  const { error: jlErr } = await supabase.from('journal_lines').insert([
    { journal_id: journal.id, line_number: 1, account_id: dr, description: `Stock adj ${p.form.type}`, debit: p.total, credit: 0 },
    { journal_id: journal.id, line_number: 2, account_id: cr, description: `Stock adj ${p.form.type}`, debit: 0, credit: p.total },
  ])
  if (jlErr) return { success: false, error: 'Journal lines: ' + jlErr.message }

  await Promise.all([
    supabase.rpc('update_account_balance', { p_account_id: dr, p_debit: p.total, p_credit: 0 }),
    supabase.rpc('update_account_balance', { p_account_id: cr, p_debit: 0, p_credit: p.total }),
  ])

  await supabase.from('vouchers')
    .update({ status: 'posted', journal_id: journal.id, posted_by: c.executedByName, posted_at: new Date().toISOString() })
    .eq('id', c.referenceId)

  // Apply stock changes via ledger
  const { data: locRow } = await supabase.from('stock_locations')
    .select('id, code').eq('code', p.form.locationCode).maybeSingle()

  // Hard guard — same reasoning as executeInternalUse.
  if (!locRow) {
    return { success: false, error: `Cannot execute: location code "${p.form.locationCode || '(empty)'}" not found in stock_locations` }
  }

  const sign = p.form.type === 'increase' ? 1 : -1
  for (const ln of p.lines) {
    if (!ln.productId) continue

    await postLedgerEntry({
      product_id: ln.productId,
      entry_type: sign > 0 ? 'positive_adjustment' : 'negative_adjustment',
      document_type: 'stock_adjustment',
      document_ref: p.form.ref,
      posting_date: p.form.date,
      qty: sign * ln.qty,
      cost_amount: ln.unitCost * ln.qty,
      location: locRow,
    })

    // Apply the qty change to THIS LOCATION. The product_locations trigger
    // then recomputes products.qty_on_hand = SUM(all locations).
    const { data: existingLoc } = await supabase.from('product_locations')
      .select('qty_on_hand').eq('product_id', ln.productId).eq('location_id', locRow.id).maybeSingle()
    const newLocQty = Math.max(0, (existingLoc?.qty_on_hand ?? 0) + (sign * ln.qty))
    await supabase.from('product_locations').upsert(
      { product_id: ln.productId, location_id: locRow.id, location_code: locRow.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
      { onConflict: 'product_id,location_id' }
    )
  }

  return { success: true, voucherId: c.referenceId }
}

// Petty Cash — Dr expense account(s), Cr petty cash (1040)
// Supports multiple expense lines per voucher (e.g. one petty cash run with
// tea, stationery, transport all in one).
async function executePettyCash(c: ExecuteContext): Promise<ExecutorResult> {
  const p = c.payload as {
    form: { date: string; ref: string; paidTo: string; notes?: string }
    lines: Array<{ desc: string; amount: number; accountId: string }>
    total: number
  }

  // Petty cash account — code 1040 in SOKORA's CoA
  const { data: pettyAcc, error: pcErr } = await supabase
    .from('accounts').select('id').eq('code', '1040').single()
  if (pcErr || !pettyAcc) return { success: false, error: 'Petty cash account (1040) missing' }

  // Create journal header
  const { data: journal, error: jErr } = await insertJournalWithRetry({
    ref: p.form.ref,
    posting_date: p.form.date,
    description: `Petty Cash — ${p.form.paidTo}`,
    journal_type: 'petty_cash',
    source_type: 'petty_cash',
    source_ref: p.form.ref,
    posted_by: c.executedByName,
    status: 'posted',
  })
  if (jErr || !journal) return { success: false, error: 'Journal: ' + (jErr?.message || 'unknown') }

  // Build journal lines: one Dr per expense line, one Cr to petty cash
  const jLines: any[] = []
  let lnNum = 1
  for (const line of p.lines) {
    if (!line.amount || !line.accountId) continue
    jLines.push({
      journal_id: journal.id, line_number: lnNum++, account_id: line.accountId,
      description: line.desc, debit: line.amount, credit: 0,
    })
  }
  jLines.push({
    journal_id: journal.id, line_number: lnNum, account_id: pettyAcc.id,
    description: `Petty cash out — ${p.form.paidTo}`, debit: 0, credit: p.total,
  })

  const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
  if (jlErr) return { success: false, error: 'Journal lines: ' + jlErr.message }

  // Balance updates
  await Promise.all(jLines.map(l =>
    supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })
  ))

  // Flip voucher
  await supabase.from('vouchers')
    .update({
      status: 'posted', journal_id: journal.id, posted_by: c.executedByName,
      posted_at: new Date().toISOString(), notes: p.form.notes,
    })
    .eq('id', c.referenceId)

  return { success: true, voucherId: c.referenceId }
}

// Ambassador Settings Change — applies a config update to the referral program
// (benefit shape, magnitudes, default cap, referrer reward) after an approver
// approves it. All the validation + persistence is in the
// apply_ambassador_settings_change RPC; this executor is just a thin wrapper.
async function executeAmbassadorSettings(c: ExecuteContext): Promise<ExecutorResult> {
  const p = c.payload as Record<string, unknown>

  // The payload IS the change set. Pass it straight to the RPC, which
  // validates fields and updates crm_settings + crown_manual_award_catalog
  // atomically. Any field that isn't in the payload is left unchanged.
  const { data, error } = await supabase.rpc('apply_ambassador_settings_change', {
    p_payload: p,
  })
  if (error) {
    return { success: false, error: 'Ambassador settings: ' + error.message }
  }
  const result = data as { ok?: boolean; changes_applied?: number } | null
  if (!result?.ok) {
    return { success: false, error: 'Ambassador settings: change rejected' }
  }
  return { success: true, voucherId: c.referenceId }
}

// Bank Transfer — Dr destination bank, Cr source bank
// Uses account IDs (UUIDs) directly from the payload for simplicity;
// falls back to codes if IDs not supplied.
async function executeBankTransfer(c: ExecuteContext): Promise<ExecutorResult> {
  const p = c.payload as {
    form: {
      date: string; ref: string;
      fromAccount: string;       // UUID
      toAccount: string;         // UUID
      amount: number;
      narration?: string;
    }
  }

  // Verify both accounts exist
  const { data: acctData, error: aErr } = await supabase
    .from('accounts').select('id, code').in('id', [p.form.fromAccount, p.form.toAccount])
  if (aErr) return { success: false, error: 'Account lookup: ' + aErr.message }
  const fromAcc = acctData?.find(a => a.id === p.form.fromAccount)
  const toAcc = acctData?.find(a => a.id === p.form.toAccount)
  if (!fromAcc || !toAcc) return { success: false, error: 'Bank accounts not found' }

  const { data: journal, error: jErr } = await insertJournalWithRetry({
    ref: 'JV-' + p.form.ref,
    posting_date: p.form.date,
    description: `Bank Transfer — ${fromAcc.code} to ${toAcc.code} — ${p.form.ref}`,
    journal_type: 'bank_transfer',
    source_type: 'bank_transfer',
    source_ref: p.form.ref,
    posted_by: c.executedByName,
    status: 'posted',
  })
  if (jErr || !journal) return { success: false, error: 'Journal: ' + (jErr?.message || 'unknown') }

  const { error: jlErr } = await supabase.from('journal_lines').insert([
    { journal_id: journal.id, line_number: 1, account_id: p.form.toAccount,
      description: `Transfer in — ${p.form.narration || p.form.ref}`,
      debit: p.form.amount, credit: 0 },
    { journal_id: journal.id, line_number: 2, account_id: p.form.fromAccount,
      description: `Transfer out — ${p.form.narration || p.form.ref}`,
      debit: 0, credit: p.form.amount },
  ])
  if (jlErr) return { success: false, error: 'Journal lines: ' + jlErr.message }

  await Promise.all([
    supabase.rpc('update_account_balance', { p_account_id: p.form.toAccount, p_debit: p.form.amount, p_credit: 0 }),
    supabase.rpc('update_account_balance', { p_account_id: p.form.fromAccount, p_debit: 0, p_credit: p.form.amount }),
  ])

  await supabase.from('vouchers')
    .update({
      status: 'posted', journal_id: journal.id, posted_by: c.executedByName,
      posted_at: new Date().toISOString(), notes: p.form.narration,
    })
    .eq('id', c.referenceId)

  return { success: true, voucherId: c.referenceId }
}

// Credit Note executor — faithful to CreditNote.tsx logic
//   Dr Revenue (4010)      ← sales reduction
//   Cr AR (1050) or Cash   ← customer owes less / gets cash back
//   If goods returned:
//     Dr Inventory (1110)  ← stock restored
//     Cr COGS (5010)       ← COGS reversed
async function executeCreditNote(c: ExecuteContext): Promise<ExecutorResult> {
  const p = c.payload as {
    form: { date: string; ref: string; reason: string; notes?: string; creditType: string }
    customerId: string | null
    customerName: string
    amount: number
    creditCOGS?: number
    hasInventory?: boolean
    restoreStock?: boolean
    lines?: Array<{ productId: string; name: string; creditQty: number; unitPrice: number; unitCost: number; amount: number }>
    locationCode?: string
    originalRef?: string
  }

  // Required accounts (same codes as CreditNote.tsx)
  const acctCodes = ['4010', '1050', '5010', '1110', '1100']
  const { data: acctData, error: aErr } = await supabase
    .from('accounts').select('id, code').in('code', acctCodes)
  if (aErr) return { success: false, error: 'Account lookup: ' + aErr.message }

  const acct = (code: string) => acctData?.find(a => a.code === code)?.id
  const revenueId = acct('4010')
  const arId = acct('1050')
  const cashId = acct('1100')
  const cogsId = acct('5010')
  const inventoryId = acct('1110')

  if (!revenueId) return { success: false, error: 'Revenue account (4010) missing' }
  // If no customer, credit comes out of cash; if customer, reduces AR
  const counterId = p.customerId ? arId : cashId
  if (!counterId) return { success: false, error: 'AR (1050) or Cash (1100) account missing' }

  // Journal header
  const { data: journal, error: jErr } = await insertJournalWithRetry({
    ref: 'JV-' + p.form.ref,
    posting_date: p.form.date,
    description: `Credit Note — ${p.customerName} — ${p.form.ref}`,
    journal_type: 'credit_note',
    source_type: 'credit_note',
    source_ref: p.form.ref,
    posted_by: c.executedByName,
    status: 'posted',
  })
  if (jErr || !journal) return { success: false, error: 'Journal: ' + (jErr?.message || 'unknown') }

  // Journal lines
  const jLines: any[] = []
  let ln = 1
  jLines.push({ journal_id: journal.id, line_number: ln++, account_id: revenueId,
    description: `Revenue reduced — ${p.form.reason}`, debit: p.amount, credit: 0 })
  jLines.push({ journal_id: journal.id, line_number: ln++, account_id: counterId,
    description: `${p.customerId ? 'AR reduced' : 'Cash refunded'} — ${p.customerName} — ${p.form.ref}`,
    debit: 0, credit: p.amount })

  const doRestore = p.hasInventory && p.restoreStock && cogsId && inventoryId && p.creditCOGS && p.creditCOGS > 0
  if (doRestore) {
    jLines.push({ journal_id: journal.id, line_number: ln++, account_id: inventoryId!,
      description: `Stock restored — ${p.form.ref}`, debit: p.creditCOGS!, credit: 0 })
    jLines.push({ journal_id: journal.id, line_number: ln++, account_id: cogsId!,
      description: `COGS reversal — ${p.form.ref}`, debit: 0, credit: p.creditCOGS! })
  }

  const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
  if (jlErr) return { success: false, error: 'Journal lines: ' + jlErr.message }

  await Promise.all(jLines.map(l =>
    supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })
  ))

  // Flip voucher from pending → posted
  await supabase.from('vouchers')
    .update({
      status: 'posted', journal_id: journal.id, posted_by: c.executedByName,
      posted_at: new Date().toISOString(),
    })
    .eq('id', c.referenceId)

  // Customer ledger entry
  if (p.customerId) {
    await supabase.from('customer_ledger_entries').insert({
      customer_id: p.customerId, posting_date: p.form.date,
      document_type: 'credit_note', document_ref: p.form.ref,
      description: `Credit Note — ${p.form.reason}`,
      amount: -p.amount, remaining_amount: -p.amount, is_open: true, journal_id: journal.id,
    })
  }

  // Restore stock if returned
  if (doRestore && p.lines && p.locationCode) {
    const { data: locRow } = await supabase.from('stock_locations')
      .select('id, code').eq('code', p.locationCode).maybeSingle()

    for (const line of p.lines) {
      if (!line.productId || line.creditQty <= 0) continue
      const { data: prod } = await supabase.from('products')
        .select('qty_on_hand').eq('id', line.productId).single()
      if (prod) {
        await supabase.from('products')
          .update({ qty_on_hand: (prod.qty_on_hand || 0) + line.creditQty })
          .eq('id', line.productId)
        await postLedgerEntry({
          product_id: line.productId, entry_type: 'return',
          document_type: 'credit_note', document_ref: p.form.ref,
          posting_date: p.form.date, qty: line.creditQty, cost_amount: line.unitCost * line.creditQty,
          location: locRow || null,
        })
      }
    }
  }

  return { success: true, voucherId: c.referenceId }
}

// Sales Return executor — matches SalesReturn.tsx logic
//   Dr Sales Returns (4050)  ← net return
//   Dr VAT payable (2020)    ← VAT reversal
//   Cr Cash/AR (configurable) ← refund issued
//   Dr Inventory (1110)      ← stock restored
//   Cr COGS (5010)           ← COGS reversed
async function executeSalesReturn(c: ExecuteContext): Promise<ExecutorResult> {
  const p = c.payload as {
    form: {
      date: string; ref: string; customer: string; wa?: string;
      originalRef?: string; reason: string; refundMethod: string;
      refundAccountId: string; locationCode: string;
    }
    lines: Array<{ productId: string; name: string; qty: number; salePrice: number; costPrice: number; amount: number }>
    total: number
    cogsReversal: number
  }

  const { data: acctData, error: aErr } = await supabase
    .from('accounts').select('id, code').in('code', ['4050', '5010', '1110', '2020'])
  if (aErr) return { success: false, error: 'Account lookup: ' + aErr.message }
  const acct = (code: string) => acctData?.find(a => a.code === code)?.id
  const returnsId = acct('4050')
  const cogsId = acct('5010')
  const inventoryId = acct('1110')
  const vatId = acct('2020')
  if (!returnsId || !cogsId || !inventoryId) {
    return { success: false, error: 'Required accounts missing (4050, 5010, 1110)' }
  }

  const { vatEnabled, vatRate } = await getTaxSettings()
  const vat = vatEnabled ? Math.round(p.total * vatRate / (100 + vatRate)) : 0
  const netReturn = p.total - vat

  const { data: journal, error: jErr } = await insertJournalWithRetry({
    ref: 'JV-' + p.form.ref,
    posting_date: p.form.date,
    description: `Sales Return — ${p.form.customer} — ${p.form.ref}`,
    journal_type: 'sales_return',
    source_type: 'sales_return',
    source_ref: p.form.ref,
    posted_by: c.executedByName,
    status: 'posted',
  })
  if (jErr || !journal) return { success: false, error: 'Journal: ' + (jErr?.message || 'unknown') }

  const jLines: any[] = [
    { journal_id: journal.id, line_number: 1, account_id: returnsId!,
      description: `Sales return — ${p.form.customer}`, debit: netReturn, credit: 0 },
  ]
  if (vat > 0 && vatId) {
    jLines.push({ journal_id: journal.id, line_number: 2, account_id: vatId,
      description: `VAT reversal — ${p.form.ref}`, debit: vat, credit: 0 })
  }
  if (p.form.refundAccountId) {
    jLines.push({ journal_id: journal.id, line_number: jLines.length + 1, account_id: p.form.refundAccountId,
      description: `Refund — ${p.form.customer}`, debit: 0, credit: p.total })
  }
  jLines.push({ journal_id: journal.id, line_number: jLines.length + 1, account_id: inventoryId!,
    description: `Stock restored — ${p.form.ref}`, debit: p.cogsReversal, credit: 0 })
  jLines.push({ journal_id: journal.id, line_number: jLines.length + 1, account_id: cogsId!,
    description: `COGS reversal — ${p.form.ref}`, debit: 0, credit: p.cogsReversal })

  const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
  if (jlErr) return { success: false, error: 'Journal lines: ' + jlErr.message }

  await Promise.all(jLines.map(l =>
    supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })
  ))

  // Flip voucher
  await supabase.from('vouchers')
    .update({
      status: 'posted', journal_id: journal.id, posted_by: c.executedByName,
      posted_at: new Date().toISOString(),
    })
    .eq('id', c.referenceId)

  // Restore stock — same as CreditNote
  const { data: locRow } = await supabase.from('stock_locations')
    .select('id, code, name').eq('code', p.form.locationCode).maybeSingle()

  for (const line of p.lines) {
    if (!line.productId) continue
    const { data: prod } = await supabase.from('products')
      .select('qty_on_hand').eq('id', line.productId).single()
    if (prod) {
      await supabase.from('products')
        .update({ qty_on_hand: (prod.qty_on_hand || 0) + line.qty })
        .eq('id', line.productId)
      await postLedgerEntry({
        product_id: line.productId, entry_type: 'return',
        document_type: 'sales_return', document_ref: p.form.ref,
        posting_date: p.form.date, qty: line.qty, cost_amount: line.costPrice * line.qty,
        location: locRow || null,
      })
      if (locRow) {
        const { data: pl } = await supabase.from('product_locations')
          .select('qty_on_hand').eq('product_id', line.productId).eq('location_id', locRow.id).maybeSingle()
        const newLocQty = (pl?.qty_on_hand ?? 0) + line.qty
        await supabase.from('product_locations').upsert(
          { product_id: line.productId, location_id: locRow.id, location_code: locRow.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
          { onConflict: 'product_id,location_id' }
        )
      }
    }
  }

  return { success: true, voucherId: c.referenceId }
}

// ─── Cash Sale ─────────────────────────────────────────────────────────────
// When a cash sale is gated for approval (e.g. by sales_discount), the
// page will create a 'pending_approval' voucher and stash the snapshot
// payload below. Approval here re-executes the post by delegating to
// postCashSale() — the same code path the live cashier uses.
//
// Why delegate rather than inline the journal logic? Cash sale's posting
// flow is non-trivial (split payments, delivery floats, cash drawer, customer
// upserts, ledger entries, bundle logging, receipt generation) and lives in
// lib/cashSalePost.ts. Re-implementing it here would drift over time.
//
// The trade-off: postCashSale creates a NEW voucher row. So after success,
// we need to delete the old 'pending_approval' voucher row that was created
// when the request was submitted, then return the NEW voucher id.
async function executeCashSale(c: ExecuteContext): Promise<ExecutorResult> {
  // Lazy-import to avoid a circular dep between cashSalePost <-> approvalExecutor
  const { postCashSale } = await import('./cashSalePost')

  const p = c.payload as {
    // Mirrors PostParams in cashSalePost.ts. The submitForApproval call
    // (to be wired in CashSale.tsx in a later session) will store exactly
    // these fields. We accept any shape and pass through.
    params: any
  }

  if (!p.params) {
    return { success: false, error: 'Cash sale payload missing `params`' }
  }

  // Re-post the sale — same code path as the cashier-driven create.
  const result = await postCashSale({ ...p.params, userName: c.executedByName })

  if (!result.success) {
    return { success: false, error: result.error || 'Cash sale post failed on approval' }
  }

  // The new posted voucher has a fresh ID. The old pending_approval row
  // referenced by c.referenceId is now redundant — delete it so it doesn't
  // pollute registers. (If the row was somehow already removed, the delete
  // is a no-op.)
  await supabase.from('vouchers').delete().eq('id', c.referenceId).eq('status', 'pending_approval')

  // Resolve the new voucher's UUID by ref — postCashSale returns the ref
  // string but not the id directly.
  const { data: newRow } = await supabase
    .from('vouchers').select('id').eq('ref', result.ref!).maybeSingle()

  return { success: true, voucherId: newRow?.id ?? c.referenceId }
}

// ─── Cash Payment ──────────────────────────────────────────────────────────
// Dr expense / Cr cash account. Mirrors the page-side post() in CashPayment.tsx.
async function executeCashPayment(c: ExecuteContext): Promise<ExecutorResult> {
  const p = c.payload as {
    form: { date: string; ref: string; paidTo: string; notes?: string }
    /** lines[].accountId is the EXPENSE account being debited */
    lines: Array<{ desc: string; amount: number; accountId: string }>
    /** UUID of the cash account being credited */
    cashAccountId: string
    total: number
  }

  if (!p.cashAccountId) {
    return { success: false, error: 'Cash account id missing in payload' }
  }

  const { data: journal, error: jErr } = await insertJournalWithRetry({
    ref: 'JV-' + p.form.ref,
    posting_date: p.form.date,
    description: `Cash Payment — ${p.form.paidTo}`,
    journal_type: 'cash_payment',
    source_type: 'cash_payment',
    source_ref: p.form.ref,
    posted_by: c.executedByName,
    status: 'posted',
  })
  if (jErr || !journal) return { success: false, error: 'Journal: ' + (jErr?.message || 'unknown') }

  const jLines: any[] = []
  let lnNum = 1
  for (const line of p.lines) {
    if (!line.amount || !line.accountId) continue
    jLines.push({
      journal_id: journal.id, line_number: lnNum++, account_id: line.accountId,
      description: line.desc || `Cash payment to ${p.form.paidTo}`,
      debit: line.amount, credit: 0,
    })
  }
  jLines.push({
    journal_id: journal.id, line_number: lnNum, account_id: p.cashAccountId,
    description: `Cash out — ${p.form.paidTo}`,
    debit: 0, credit: p.total,
  })

  const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
  if (jlErr) return { success: false, error: 'Journal lines: ' + jlErr.message }

  await Promise.all(jLines.map(l =>
    supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })
  ))

  await supabase.from('vouchers')
    .update({
      status: 'posted', journal_id: journal.id, posted_by: c.executedByName,
      posted_at: new Date().toISOString(), notes: p.form.notes,
    })
    .eq('id', c.referenceId)

  return { success: true, voucherId: c.referenceId }
}

// ─── Journal Entry ─────────────────────────────────────────────────────────
// Free-form Dr/Cr entries. The page collects an array of {accountId, debit, credit, narration}
// rows. The executor just writes them verbatim; the page-side post() already validated
// that debits = credits. Trusts the snapshot.
async function executeJournalEntry(c: ExecuteContext): Promise<ExecutorResult> {
  const p = c.payload as {
    form: { date: string; ref: string; narration: string; notes?: string }
    lines: Array<{ accountId: string; debit: number; credit: number; description?: string }>
    total: number   // sum of debits (== sum of credits)
  }

  // Sanity: balanced?
  const totalDr = p.lines.reduce((s, l) => s + (l.debit || 0), 0)
  const totalCr = p.lines.reduce((s, l) => s + (l.credit || 0), 0)
  if (Math.abs(totalDr - totalCr) > 0.01) {
    return { success: false, error: `Journal entry not balanced (Dr ${totalDr} ≠ Cr ${totalCr})` }
  }

  const { data: journal, error: jErr } = await insertJournalWithRetry({
    ref: p.form.ref,
    posting_date: p.form.date,
    description: p.form.narration || `Journal Entry — ${p.form.ref}`,
    journal_type: 'journal_entry',
    source_type: 'journal_entry',
    source_ref: p.form.ref,
    posted_by: c.executedByName,
    status: 'posted',
  })
  if (jErr || !journal) return { success: false, error: 'Journal: ' + (jErr?.message || 'unknown') }

  const jLines = p.lines
    .filter(l => l.accountId && (l.debit > 0 || l.credit > 0))
    .map((l, i) => ({
      journal_id: journal.id, line_number: i + 1, account_id: l.accountId,
      description: l.description || p.form.narration,
      debit: l.debit || 0, credit: l.credit || 0,
    }))

  const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
  if (jlErr) return { success: false, error: 'Journal lines: ' + jlErr.message }

  await Promise.all(jLines.map(l =>
    supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })
  ))

  await supabase.from('vouchers')
    .update({
      status: 'posted', journal_id: journal.id, posted_by: c.executedByName,
      posted_at: new Date().toISOString(), notes: p.form.notes,
    })
    .eq('id', c.referenceId)

  return { success: true, voucherId: c.referenceId }
}

// ─── Registry ──────────────────────────────────────────────────────────────
type Executor = (c: ExecuteContext) => Promise<ExecutorResult>

const EXECUTORS: Record<string, Executor> = {
  // Map approval_types.code → executor
  'internal_use':         executeInternalUse,
  'internal_use_own':     executeInternalUse,
  'internal_use_damage':  executeInternalUse,
  'stock_adjustment':     executeStockAdjustment,
  'petty_cash':           executePettyCash,
  'bank_transfer':        executeBankTransfer,
  'credit_note':          executeCreditNote,
  'sales_return':         executeSalesReturn,
  // Newly registered — ready for when the page-side gates are wired.
  // The 'sales_discount' approval code dispatches to the cash sale executor
  // because that's where the gated post lives. Same payload shape.
  'cash_sale':            executeCashSale,
  'sales_discount':       executeCashSale,
  'cash_payment':         executeCashPayment,
  'journal_entry':        executeJournalEntry,
  // Settings changes — apply the new config when an approver approves.
  'ambassador_settings_change': executeAmbassadorSettings,
}

// ─── Main entry point ──────────────────────────────────────────────────────
/**
 * Executes an approved request. Call this AFTER approveRequest() succeeds.
 * Looks up the type code, dispatches to the right executor, then calls
 * markRequestExecuted() with the result.
 */
export async function executeApprovedRequest(
  requestId: string,
  executedBy: string,
  executedByName: string
): Promise<ExecutorResult> {

  // Load the full request + its type code
  const { data: req, error: reqErr } = await supabase
    .from('approval_requests')
    .select(`
      id, reference_type, reference_id, payload, status,
      approval_types!inner(code)
    `)
    .eq('id', requestId)
    .single()

  if (reqErr || !req) {
    return { success: false, error: 'Request not found' }
  }

  if (req.status !== 'approved') {
    return { success: false, error: `Request status is ${req.status}, expected approved` }
  }

  const typeCode = Array.isArray(req.approval_types)
    ? (req.approval_types[0] as any)?.code
    : (req.approval_types as any)?.code

  const executor = EXECUTORS[typeCode]
  if (!executor) {
    // Not every approval type has an executor (e.g. HRM leave handles itself)
    // Still mark as executed so it clears from pending
    await markRequestExecuted(requestId, req.reference_id)
    return { success: true, voucherId: req.reference_id }
  }

  if (!req.reference_id) {
    return { success: false, error: 'Request has no reference_id' }
  }

  try {
    const result = await executor({
      requestId,
      referenceType: req.reference_type,
      referenceId: req.reference_id,
      payload: req.payload,
      executedBy,
      executedByName,
    })

    await markRequestExecuted(
      requestId,
      result.success ? result.voucherId : undefined,
      result.success ? undefined : result.error
    )

    return result
  } catch (e: any) {
    const msg = e?.message || 'Executor threw'
    await markRequestExecuted(requestId, undefined, msg)
    return { success: false, error: msg }
  }
}
