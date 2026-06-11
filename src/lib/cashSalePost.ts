/**
 * CashSale posting logic
 * Extracted from CashSale.tsx — contains post() and updateVoucher()
 * These are pure async functions that receive all data as arguments
 *
 * EDIT BEHAVIOUR (important):
 * Editing a cash sale follows the "reverse + repost" pattern.
 * On every update we:
 *   1. Reverse the old journal lines (subtract their balance impact)
 *   2. Delete the old journal_lines and voucher_lines
 *   3. Restore old stock, then re-deduct based on new lines
 *   4. Update the voucher header — payment_method AND payment_split together
 *   5. Re-post fresh journal_lines and re-roll account balances
 * This keeps the trial balance, payment_split, and the displayed
 * payment_method label permanently in sync — none of them can drift
 * independently when a cashier edits a voucher.
 */

import { supabase } from './supabase'
import { nextRef, insertJournalWithRetry } from './refs'
import { today } from './utils'
import { postLedgerEntry } from './itemLedger'
import { PAYMENT_METHODS } from './cashSaleTypes'
import type { DBProduct, SaleLine, SplitLine, PaymentMethod } from './cashSaleTypes'
import { logBundleSale } from './useBundles'
import type { Bundle } from './useBundles'

// ─── Shared helpers (single source of truth for create + edit) ─────────────

/**
 * Build the payment_method display label.
 * Used by both create and edit so the label is computed identically.
 */
function buildPaymentLabel(
  isSplit: boolean,
  splitLines: SplitLine[],
  currentMethod: PaymentMethod
): string {
  if (!isSplit) return currentMethod.label
  const parts = splitLines
    .map(l => PAYMENT_METHODS.find(m => m.id === l.methodId)?.label || l.methodId)
  return [...parts, currentMethod.label].join(' + ')
}

/**
 * Build the payment_split JSONB { methodLabel: amount }.
 * Used by both create and edit. Never call inline — always use this
 * so that payment_split and payment_method can never desync.
 */
function buildPaymentSplit(
  isSplit: boolean,
  total: number,
  totalSplitPaid: number,
  splitLines: SplitLine[],
  currentMethod: PaymentMethod
): Record<string, number> {
  const result: Record<string, number> = {}
  if (isSplit) {
    const primaryAmount = total - totalSplitPaid
    if (primaryAmount > 0) result[currentMethod.label] = primaryAmount
    for (const sl of splitLines) {
      if (!sl.amount) continue
      const m = PAYMENT_METHODS.find(pm => pm.id === sl.methodId)
      const label = m?.label || sl.methodId
      result[label] = (result[label] || 0) + sl.amount
    }
  } else {
    result[currentMethod.label] = total
  }
  return result
}

/**
 * Build the cash-receipt journal lines for a sale (debits to cash/bank/M-Pesa).
 * Excludes revenue, COGS, inventory — those are appended by the caller.
 */
function buildReceiptJournalLines(args: {
  journalId: string
  startLineNumber: number
  isPOD: boolean
  autoReceipt: boolean
  isSplit: boolean
  total: number
  totalSplitPaid: number
  splitLines: SplitLine[]
  currentMethod: PaymentMethod
  accountMap: Record<string, string>
  paymentRef: string
  custName: string
  ref: string
  deliveryTotal: number
  delivFloatId: string | null | undefined
  arId: string | undefined
}): { lines: any[]; nextLineNumber: number } {
  const lines: any[] = []
  let ln = args.startLineNumber

  if (!args.isPOD && args.autoReceipt) {
    const primaryAcctId = args.accountMap[args.currentMethod.accountCode]
    if (!primaryAcctId) {
      throw new Error(
        `Payment account not found for ${args.currentMethod.label} (code: ${args.currentMethod.accountCode}). Check Chart of Accounts.`
      )
    }

    // primaryAmount = what the PRIMARY payment method actually received.
    // Non-split  → the whole total goes to the primary method.
    // Split      → total minus what the secondary split lines collected.
    //
    // IMPORTANT: args.total already includes deliveryTotal (computed upstream
    // as `subtotal + deliveryTotal`). The credit side of this journal posts a
    // separate `Delivery float (2085)` line for deliveryTotal, which exactly
    // balances the delivery portion already inside `total` on the debit side.
    // We must NOT push an additional delivery debit line here — doing so was
    // the bug that left every cash sale with a delivery fee out of balance by
    // exactly `deliveryTotal`.
    const primaryAmount = args.isSplit ? args.total - args.totalSplitPaid : args.total

    // Only push a primary-method debit if it actually received money.
    // Previously the fallback `primaryAmount > 0 ? primaryAmount : args.total`
    // re-debited the full total when a split fully allocated to secondary
    // methods (primaryAmount === 0), producing a debit side that was double
    // the credit side. We now skip the line entirely in that case.
    if (primaryAmount > 0) {
      lines.push({
        journal_id: args.journalId, line_number: ln++,
        account_id: primaryAcctId,
        description: `${args.currentMethod.label}${args.paymentRef ? ' · ' + args.paymentRef : ''} — ${args.custName}`,
        debit: primaryAmount, credit: 0,
      })
    }

    for (const sl of args.splitLines) {
      if (!sl.accountId || !sl.amount) continue
      const m = PAYMENT_METHODS.find(pm => pm.id === sl.methodId)
      lines.push({
        journal_id: args.journalId, line_number: ln++,
        account_id: sl.accountId,
        description: `${m?.label || sl.methodId}${sl.ref ? ' · ' + sl.ref : ''} — ${args.custName}`,
        debit: sl.amount, credit: 0,
      })
    }
  } else if (args.isPOD && args.arId) {
    lines.push({
      journal_id: args.journalId, line_number: ln++,
      account_id: args.arId,
      description: `POD — ${args.custName} — ${args.ref}`,
      debit: args.total, credit: 0,
    })
  }

  return { lines, nextLineNumber: ln }
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PostParams {
  // Form state
  newCustName: string
  waInput: string
  lines: SaleLine[]
  dbProducts: DBProduct[]
  selectedCust: { id: string; crown_points: number; balance: number; whatsapp: string; pregnancy_stage: string; name: string } | null
  // Payment
  isPOD: boolean
  autoReceipt: boolean
  selectedMethod: string
  isSplit: boolean
  splitLines: SplitLine[]
  paymentRef: string
  accountMap: Record<string, string>
  // Delivery
  townDelivery: string
  upcountryShipping: string
  deliveryAccountId: string
  // Location
  locationCode: string
  locations: { id: string; code: string; name: string }[]
  // Settings
  invSettings: any
  // Auth
  userName: string
  userId?: string
  // Bundle
  appliedBundle: Bundle | null
  // Computed
  subtotal: number
  total: number
  crownPoints: number
  deliveryTotal: number
  totalSplitPaid: number
  // Optional customer context (TTC / pregnancy / postpartum) captured at till.
  // Skipped fields are not written; not provided = no change to existing.
  customerContext?: {
    stage_path?:    'ttc' | 'pregnant' | 'postpartum' | null
    ttc_duration?:  string | null
    edd?:           string | null
    delivery_date?: string | null
    notes?:         string | null
  }
  // Optional SOKORA Ambassador referral applied at the till.
  // referralCode is the trimmed/uppercased code; referralBenefit is the
  // preview returned by apply_referral_code (shape + amount + referrer).
  // When present, cashSalePost will:
  //   - add a discount journal line (Dr 4040 Sales Discounts) for percent/flat
  //   - add a giveaway voucher_line + Dr 5081 Marketing Expense for free-item
  //   - call record_referral_use(...) after the voucher posts to:
  //       atomically increment uses_count, create the credited referrals row,
  //       and award Crown points to the referrer
  referralCode?: string | null
  referralBenefit?: {
    referrer_id: string
    referrer_name: string
    benefit_shape: 'discount_pct' | 'discount_tzs' | 'free_item'
    benefit_amount?: number
    benefit_percent?: number
    free_product_id?: string
    free_product_name?: string
  } | null
}

export interface PostResult {
  success: boolean
  ref?: string
  error?: string
  receiptData?: any
  isPOD?: boolean
}

// ─── CREATE ────────────────────────────────────────────────────────────────

export async function postCashSale(params: PostParams): Promise<PostResult> {
  const {
    newCustName, waInput, lines, dbProducts, selectedCust,
    isPOD, autoReceipt, selectedMethod, isSplit, splitLines, paymentRef, accountMap,
    deliveryAccountId,
    locationCode, locations, invSettings, userName, userId, appliedBundle,
    subtotal, total, crownPoints, deliveryTotal, totalSplitPaid,
    customerContext,
    referralCode, referralBenefit,
  } = params

  const currentMethod = PAYMENT_METHODS.find(m => m.id === selectedMethod)!

  // Validations
  if (!newCustName.trim()) return { success: false, error: 'Customer name required' }
  if (lines.every(l => !l.productId)) return { success: false, error: 'Add at least one product' }

  // Stock check — UNCONDITIONAL and location-aware. Previously gated on
  // invSettings?.block_negative_stock, which meant cash sales could post
  // unbacked stock during the brief async window before invSettings loaded,
  // or any time the setting was off. We always block. We also check the
  // SELECTED location's bin qty (not just the global products.qty_on_hand),
  // because picking from an empty bin corrupts product_locations and the
  // cashier may have left the location picker on its default value.
  const selectedLocForCheck = locations.find(l => l.code === locationCode)
  if (selectedLocForCheck) {
    const productIds = lines.filter(l => l.productId).map(l => l.productId)
    const { data: locStocks } = await supabase
      .from('product_locations')
      .select('product_id, qty_on_hand')
      .eq('location_id', selectedLocForCheck.id)
      .in('product_id', productIds)
    const locStockMap = new Map((locStocks || []).map(r => [r.product_id, r.qty_on_hand || 0]))

    for (const line of lines) {
      if (!line.productId) continue
      const prod = dbProducts.find(p => p.id === line.productId)
      if (!prod) continue
      const locQty = locStockMap.get(line.productId) ?? 0
      if (locQty < line.qty) {
        return { success: false, error: `Insufficient stock at ${selectedLocForCheck.code} (${selectedLocForCheck.name}) for ${prod.name}. Available: ${locQty} · Needed: ${line.qty}. Transfer stock first or change location.` }
      }
      if (prod.qty_on_hand < line.qty) {
        return { success: false, error: `Insufficient global stock for ${prod.name}. Available: ${prod.qty_on_hand} units` }
      }
    }
  } else {
    // No location resolved — fall back to global qty only.
    for (const line of lines) {
      if (!line.productId) continue
      const prod = dbProducts.find(p => p.id === line.productId)
      if (prod && prod.qty_on_hand < line.qty) return { success: false, error: `Insufficient stock for ${prod.name}. Available: ${prod.qty_on_hand} units` }
    }
  }
  if (invSettings?.block_sell_below_cost) {
    for (const line of lines) {
      if (!line.productId || !line.price) continue
      const prod = dbProducts.find(p => p.id === line.productId)
      // Effective price = net amount per unit AFTER any line-level discount.
      // We check this rather than line.price so a deep discount that pushes
      // the unit price below cost is also caught.
      const effectivePrice = line.qty > 0 ? line.amount / line.qty : line.price
      if (prod && effectivePrice < prod.cost_price) return { success: false, error: `Selling ${prod.name} below cost price (effective TZS ${Math.round(effectivePrice).toLocaleString()} vs cost TZS ${prod.cost_price.toLocaleString()}). Adjust price/discount or change settings.` }
    }
  }
  if (invSettings?.warn_below_min_margin) {
    for (const line of lines) {
      if (!line.productId || !line.price) continue
      const prod = dbProducts.find(p => p.id === line.productId)
      if (prod && prod.selling_price > 0) {
        // Same reasoning — check the effective unit price after discount.
        const effectivePrice = line.qty > 0 ? line.amount / line.qty : line.price
        const margin = effectivePrice > 0 ? ((effectivePrice - prod.cost_price) / effectivePrice) * 100 : 0
        if (margin < (invSettings.global_min_margin || 0)) return { success: false, error: `Warning: ${prod.name} margin is ${Math.round(margin)}% — below minimum ${invSettings.global_min_margin}%` }
      }
    }
  }
  if (!isPOD && !isSplit && currentMethod.showRef && !paymentRef.trim()) {
    return { success: false, error: `Please enter the ${currentMethod.label} transaction reference number` }
  }

  const ref = await nextRef('cash_sale')
  const postingDate = today()

  try {
    // Upsert customer
    const cleaned = waInput.replace(/[\s+\-()]/g, '')
    let customerId = selectedCust?.id || null

    let customerCode: string | undefined
    if (!selectedCust?.id) {
      const { data: maxCode } = await supabase
        .from('customers').select('code').like('code', 'CONT-%')
        .order('code', { ascending: false }).limit(1)
      const lastNum = maxCode?.[0]?.code ? parseInt(maxCode[0].code.replace('CONT-', '')) || 10000 : 10000
      customerCode = `CONT-${lastNum + 1}`
    }

    // Build context fields if cashier captured anything this sale.
    // Stage_path null/undefined = nothing captured; leave existing fields as-is.
    const ctxPayload: Record<string, any> = {}
    if (customerContext?.stage_path) {
      // Mark as captured + stamp who/when
      ctxPayload.context_status      = 'captured'
      ctxPayload.context_captured_at = new Date().toISOString()
      if (userId) ctxPayload.context_captured_by = userId

      if (customerContext.stage_path === 'ttc' && customerContext.ttc_duration) {
        ctxPayload.ttc_duration  = customerContext.ttc_duration
        ctxPayload.edd           = null
        ctxPayload.delivery_date = null
      } else if (customerContext.stage_path === 'pregnant' && customerContext.edd) {
        ctxPayload.edd               = customerContext.edd
        ctxPayload.edd_source        = 'first_purchase'
        ctxPayload.edd_captured_at   = new Date().toISOString()
        ctxPayload.ttc_duration      = null
        ctxPayload.delivery_date     = null
      } else if (customerContext.stage_path === 'postpartum' && customerContext.delivery_date) {
        ctxPayload.delivery_date = customerContext.delivery_date
        ctxPayload.ttc_duration  = null
        // Don't clear edd — historical EDD has audit value even after birth
      }

      // Notes only carried for the edit view (per Joe's preference: notes are
      // back-office responsibility for first-time captures)
      if (customerContext.notes !== undefined) {
        ctxPayload.internal_notes = customerContext.notes
      }
    }

    const { data: custData } = await supabase.from('customers').upsert({
      ...(customerCode ? { code: customerCode } : {}),
      name: newCustName.trim(), whatsapp: cleaned || null, customer_type: 'cash',
      segment: 'retail',
      crown_points: (selectedCust?.crown_points || 0) + crownPoints,
      last_purchase_date: postingDate,
      last_purchase_amount: subtotal,
      balance: isPOD ? (selectedCust?.balance || 0) + total : (selectedCust?.balance || 0),
      ...ctxPayload,
    }, { onConflict: 'whatsapp' }).select('id').single()
    if (custData) customerId = custData.id

    // Get accounts
    const neededCodes = ['4010', '5010', '1110', '1050', '2085', '4040', '5081']
    const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', neededCodes)
    const acct = (code: string) => acctData?.find(a => a.code === code)?.id
    const revenueId = acct('4010'); const cogsId = acct('5010')
    const inventoryId = acct('1110')
    const arId = acct('1050'); const delivFloatId = acct('2085') || deliveryAccountId
    const salesDiscountsId = acct('4040')    // Dr for referral discounts
    const marketingExpId = acct('5081')      // Dr for referral free items
    if (!revenueId || !cogsId || !inventoryId) throw new Error('Required accounts not found')
    // If we collected delivery money but have nowhere to credit it, the
    // journal will silently go out of balance. Fail loudly instead.
    if (deliveryTotal > 0 && !delivFloatId) {
      throw new Error('Delivery & Shipping Float account (2085) not found and no fallback configured. Add it to the Chart of Accounts before posting sales with delivery.')
    }

    // Build payment label (helper — mirrored on edit path)
    const paymentLabel = buildPaymentLabel(isSplit, splitLines, currentMethod)

    // Create journal (with retry to handle ref collisions)
    const { data: journal, error: jErr } = await insertJournalWithRetry({
      ref: 'JV-' + ref, posting_date: postingDate,
      description: `Cash Sale — ${newCustName} — ${ref}`,
      journal_type: 'cash_sale', source_type: 'cash_sale', source_ref: ref,
      posted_by: userName, status: 'posted',
    })
    if (jErr) throw new Error('Journal: ' + jErr.message)
    if (!journal) throw new Error('Journal: insert returned no data')

    const cogsTotal = lines.reduce((s, l) => {
      const p = dbProducts.find(p => p.id === l.productId)
      return s + (p ? p.cost_price * l.qty : 0)
    }, 0)

    // ─── Referral benefit (applied at till) ────────────────────────────────
    // Two flavours:
    //   (a) percent / flat discount → reduces cash collected; Dr 4040 balances
    //       the gross-revenue credit against the reduced cash debit.
    //   (b) free item → cash unchanged; freebie leaves inventory at cost,
    //       full retail cost recognized as marketing expense (Dr 5081 / Cr 1110).
    // Only one shape is active per sale.
    let referralDiscountAmount = 0
    let freebieCost = 0
    let freebieProductId: string | null = null
    let freebieProductName = ''

    if (referralBenefit && referralCode) {
      if (referralBenefit.benefit_shape === 'discount_pct') {
        // Compute discount LIVE from current subtotal. The benefit_amount on
        // the validation snapshot may be stale (e.g. validated before items
        // were added). benefit_percent is the source of truth.
        const pct = referralBenefit.benefit_percent || 0
        referralDiscountAmount = Math.min(
          Math.round((subtotal + deliveryTotal) * pct / 100),
          subtotal + deliveryTotal
        )
      } else if (referralBenefit.benefit_shape === 'discount_tzs') {
        // Flat TZS — benefit_amount is the configured value (not subtotal-dependent).
        referralDiscountAmount = Math.min(
          referralBenefit.benefit_amount || 0,
          subtotal + deliveryTotal
        )
      } else if (referralBenefit.benefit_shape === 'free_item' && referralBenefit.free_product_id) {
        freebieProductId = referralBenefit.free_product_id
        freebieProductName = referralBenefit.free_product_name || ''
        // Look up the freebie's cost. If it's not in dbProducts (because the
        // cashier didn't add it as a line), fetch it directly.
        const fromList = dbProducts.find(p => p.id === freebieProductId)
        if (fromList) {
          freebieCost = fromList.cost_price
        } else {
          const { data: prod } = await supabase
            .from('products')
            .select('cost')
            .eq('id', freebieProductId)
            .maybeSingle()
          freebieCost = Number((prod as any)?.cost ?? 0)
        }
      }
    }

    // Build journal lines using the shared helper
    const { lines: receiptLines, nextLineNumber } = buildReceiptJournalLines({
      journalId: journal.id, startLineNumber: 1,
      isPOD, autoReceipt, isSplit,
      total, totalSplitPaid, splitLines, currentMethod,
      accountMap, paymentRef,
      custName: newCustName, ref,
      deliveryTotal, delivFloatId, arId,
    })

    const jLines: any[] = [...receiptLines]
    let ln = nextLineNumber
    jLines.push({ journal_id: journal.id, line_number: ln++, account_id: revenueId, description: `Sales — ${ref}`, debit: 0, credit: subtotal })
    jLines.push({ journal_id: journal.id, line_number: ln++, account_id: cogsId, description: `COGS — ${ref}`, debit: cogsTotal, credit: 0 })
    jLines.push({ journal_id: journal.id, line_number: ln++, account_id: inventoryId, description: `Inventory out — ${ref}`, debit: 0, credit: cogsTotal })
    if (deliveryTotal > 0 && delivFloatId) {
      jLines.push({ journal_id: journal.id, line_number: ln++, account_id: delivFloatId, description: `Delivery float — ${ref}`, debit: 0, credit: deliveryTotal })
    }

    // Referral discount line (Dr 4040 Sales Discounts).
    // The cash debit was already reduced by referralDiscountAmount (because
    // `total` came in reduced); this 4040 debit re-balances the journal
    // against the gross revenue credit. Net P&L effect: revenue stays at
    // gross, the discount shows as a contra-revenue line — Joe can report
    // "how much did the referral program cost us this month?" cleanly.
    if (referralDiscountAmount > 0) {
      if (!salesDiscountsId) {
        throw new Error('Sales Discounts account (4040) not found in Chart of Accounts')
      }
      jLines.push({
        journal_id: journal.id, line_number: ln++, account_id: salesDiscountsId,
        description: `Referral discount — ${ref}`,
        debit: referralDiscountAmount, credit: 0,
      })
    }

    // Free-item giveaway: freebie left inventory; full cost expensed as
    // marketing. Does NOT touch revenue (nothing was sold).
    //   Dr 5081 Marketing Expense (cost)
    //   Cr 1110 Inventory          (cost)
    if (freebieCost > 0) {
      if (!marketingExpId) {
        throw new Error('Sample & Marketing Expense account (5081) not found')
      }
      jLines.push({
        journal_id: journal.id, line_number: ln++, account_id: marketingExpId,
        description: `Referral giveaway: ${freebieProductName} — ${ref}`,
        debit: freebieCost, credit: 0,
      })
      jLines.push({
        journal_id: journal.id, line_number: ln++, account_id: inventoryId,
        description: `Giveaway out: ${freebieProductName} — ${ref}`,
        debit: 0, credit: freebieCost,
      })
    }

    const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
    if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

    await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

    // Build payment split (helper — mirrored on edit path)
    const paymentSplitData = buildPaymentSplit(isSplit, total, totalSplitPaid, splitLines, currentMethod)

    // Create voucher
    const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
      ref, type: 'cash_sale', posting_date: postingDate,
      description: `Cash Sale — ${newCustName}`,
      subtotal, total_amount: total,
      status: isPOD ? 'draft' : 'posted', branch: 'DSM HQ',
      customer_id: customerId, journal_id: journal.id,
      payment_method: paymentLabel,
      payment_split: paymentSplitData,
      notes: [
        deliveryTotal > 0 ? `Delivery: TZS ${deliveryTotal.toLocaleString()}` : '',
        currentMethod.id === 'pos' ? 'POS Card payment' : '',
        paymentRef ? `Ref: ${paymentRef}` : ''
      ].filter(Boolean).join(' · ') || null,
      posted_by: userName,
    }).select('id').single()
    if (vErr) throw new Error('Voucher: ' + vErr.message)

    // Voucher lines + stock (atomic deduction prevents overselling)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]; if (!line.productId) continue
      const prod = dbProducts.find(p => p.id === line.productId); if (!prod) continue
      // subtotal = qty × unit_price (gross, before line discount)
      // total    = line.amount (net, after line discount)
      // The split between the two columns is what tells reports how much
      // discount was given — `subtotal - total`.
      const grossLineAmount = line.qty * line.price
      await supabase.from('voucher_lines').insert({
        voucher_id: voucher.id,
        line_number: i + 1,
        product_id: line.productId,
        description: line.name,
        qty: line.qty,
        unit_cost: prod.cost_price,
        unit_price: line.price,
        subtotal: grossLineAmount,
        total: line.amount,
      })

      // Atomic stock deduction — if another cashier grabbed the last unit, this fails safely
      if (invSettings?.block_negative_stock) {
        const { error: stockErr } = await supabase.rpc('deduct_stock', { p_product_id: line.productId, p_qty: line.qty })
        if (stockErr) throw new Error(`Insufficient stock for ${prod.name}. Another sale may have just taken the last unit(s).`)
      } else {
        // Allow negative stock — just deduct
        await supabase.rpc('deduct_stock_allow_negative', { p_product_id: line.productId, p_qty: line.qty })
      }

      const locObj = locations.find(l => l.code === locationCode)
      await postLedgerEntry({
        product_id: line.productId, entry_type: 'sale',
        document_type: 'cash_sale', document_ref: ref,
        posting_date: postingDate, qty: -line.qty,
        cost_amount: prod.cost_price * line.qty,
        location: locObj || null,
      })
      if (locObj) {
        // Decrement THIS LOCATION's own qty — read it fresh, subtract this sale's qty.
        // Previously this code read the global products.qty_on_hand after the RPC ran
        // and wrote that as the location qty, which corrupted multi-location stock
        // (selling location's qty would inherit the global total). The product_locations
        // trigger will recompute products.qty_on_hand = SUM(locations) after this upsert,
        // so global stays in sync automatically.
        const { data: existingLoc } = await supabase.from('product_locations')
          .select('qty_on_hand').eq('product_id', line.productId).eq('location_id', locObj.id).maybeSingle()
        const newLocQty = Math.max(0, (existingLoc?.qty_on_hand ?? 0) - line.qty)
        await supabase.from('product_locations').upsert(
          { product_id: line.productId, location_id: locObj.id, location_code: locationCode, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
          { onConflict: 'product_id,location_id' }
        )
      }
    }

    // ─── Freebie voucher line (SOKORA Ambassador free-item benefit) ────────
    // The freebie isn't in `lines` (cashier didn't add it; the system did).
    // We insert it as a special voucher_line with is_referral_giveaway=true,
    // price=0 (so it doesn't inflate revenue), and deduct stock atomically.
    if (freebieProductId && freebieCost > 0) {
      await supabase.from('voucher_lines').insert({
        voucher_id: voucher.id,
        line_number: lines.length + 1,
        product_id: freebieProductId,
        description: `[FREE] ${freebieProductName}`,
        qty: 1,
        unit_cost: freebieCost,
        unit_price: 0,
        subtotal: 0,
        total: 0,
        is_referral_giveaway: true,
      })

      // Atomic stock deduction for the freebie
      const { error: stockErr } = await supabase.rpc('deduct_stock_allow_negative', {
        p_product_id: freebieProductId, p_qty: 1
      })
      if (stockErr) {
        console.warn('Freebie stock deduction failed:', stockErr.message)
      }

      // Ledger entry so stock-movement reports see the giveaway
      const locObj = locations.find(l => l.code === locationCode)
      await postLedgerEntry({
        product_id: freebieProductId, entry_type: 'sale',
        document_type: 'cash_sale', document_ref: ref,
        posting_date: postingDate, qty: -1,
        cost_amount: freebieCost,
        location: locObj || null,
      })
      if (locObj) {
        const { data: existingLoc } = await supabase.from('product_locations')
          .select('qty_on_hand').eq('product_id', freebieProductId).eq('location_id', locObj.id).maybeSingle()
        const newLocQty = Math.max(0, (existingLoc?.qty_on_hand ?? 0) - 1)
        await supabase.from('product_locations').upsert(
          { product_id: freebieProductId, location_id: locObj.id, location_code: locationCode, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
          { onConflict: 'product_id,location_id' }
        )
      }
    }

    if (isPOD && customerId && arId) {
      await supabase.from('customer_ledger_entries').insert({ customer_id: customerId, posting_date: postingDate, document_type: 'invoice', document_ref: ref, description: `POD — ${newCustName}`, amount: total, remaining_amount: total, is_open: true, journal_id: journal.id })
    }

    // AUTO-CREATE BANK RECEIPT VOUCHER for non-cash payments
    if (!isPOD && autoReceipt && currentMethod.id !== 'cash') {
      try {
        const receiptRef = await nextRef('cash_receipt')
        let bankAccountId = accountMap[currentMethod.accountCode]
        if (!bankAccountId) {
          const { data: bankAcct } = await supabase.from('accounts').select('id').eq('code', currentMethod.accountCode).single()
          bankAccountId = bankAcct?.id
        }
        if (bankAccountId) {
          const { data: receiptJournal, error: rjErr } = await insertJournalWithRetry({
            ref: 'JV-' + receiptRef, posting_date: postingDate,
            description: `Auto Bank Receipt — ${currentMethod.label} — ${ref}`,
            journal_type: 'cash_receipt', source_type: 'cash_sale', source_ref: ref,
            posted_by: userName, status: 'posted',
          })

          if (rjErr) {
            console.error('Receipt journal error:', rjErr)
          } else if (receiptJournal) {
            const receiptJLines: any[] = []
            const lineAmount = isSplit ? total - totalSplitPaid : total
            receiptJLines.push({ journal_id: receiptJournal.id, line_number: 1, account_id: bankAccountId, description: `${currentMethod.label}${paymentRef ? ' · ' + paymentRef : ''} — From ${ref}`, debit: lineAmount, credit: 0 })
            const primaryAcctId = accountMap[currentMethod.accountCode]
            if (primaryAcctId) {
              receiptJLines.push({ journal_id: receiptJournal.id, line_number: 2, account_id: primaryAcctId, description: `Deposit received — ${ref}`, debit: 0, credit: lineAmount })
            }
            const { error: rjlErr } = await supabase.from('journal_lines').insert(receiptJLines)
            if (!rjlErr) {
              await Promise.all(receiptJLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))
              await supabase.from('vouchers').insert({
                ref: receiptRef, type: 'cash_receipt', posting_date: postingDate,
                description: `Auto Receipt — ${currentMethod.label} — ${ref}`,
                subtotal: lineAmount, total_amount: lineAmount,
                status: 'posted', branch: 'DSM HQ',
                customer_id: customerId || null, journal_id: receiptJournal.id,
                payment_method: currentMethod.label,
                notes: `Auto-created from ${ref}${paymentRef ? ' · Ref: ' + paymentRef : ''}`,
                posted_by: userName,
              })
            }
          }
        }
      } catch (err: any) {
        console.error('Auto-receipt creation failed:', err)
      }
    }

    // Log bundle sale for analytics
    if (appliedBundle && voucher) {
      logBundleSale({
        bundleId: appliedBundle.id, voucherId: voucher.id, voucherRef: ref,
        customerId, customerName: newCustName,
        bundlePrice: appliedBundle.bundle_price, individualTotal: appliedBundle.individual_total,
        soldBy: userName, postingDate,
      }).catch(err => console.error('Bundle sale log failed:', err))
    }

    // Schedule feedback follow-ups. Fire-and-forget — a scheduling failure
    // must never break a posted sale. The RPC respects stage_paused and
    // is idempotent (won't double-schedule for the same lines).
    if (!isPOD && customerId) {
      supabase.rpc('schedule_feedback_followups', { p_voucher_id: voucher.id })
        .then(({ error }) => {
          if (error) console.warn('schedule_feedback_followups failed:', error.message)
        })
    }

    // ─── Record the referral use (atomic finalization) ─────────────────────
    // Calls record_referral_use which: locks the referrer row, increments
    // uses_count (with cap re-check), inserts the referrals row as 'credited',
    // stamps voucher.referral_id, and awards Crown points to the referrer.
    // We await because we want the result back for the receipt + because if
    // the cap was just hit by a concurrent cashier, we still want to log.
    if (!isPOD && customerId && referralCode && referralBenefit) {
      try {
        const { data: refId, error: refErr } = await supabase.rpc('record_referral_use', {
          p_code:           referralCode,
          p_referee_id:     customerId,
          p_voucher_id:     voucher.id,
          p_benefit_amount: referralDiscountAmount || freebieCost || 0,
          p_benefit_shape:  referralBenefit.benefit_shape,
        })
        if (refErr) console.warn('record_referral_use failed:', refErr.message)
        else if (!refId) console.warn('record_referral_use returned NULL (cap reached or code invalidated mid-sale)')
      } catch (err) {
        console.warn('record_referral_use threw:', err)
      }
    }

    // Build receipt data
    if (!isPOD) {
      const receiptData = {
        ref, posting_date: postingDate,
        description: `Cash Sale — ${newCustName}`,
        total_amount: total, subtotal,
        payment_method: currentMethod.label, notes: '', posted_by: userName,
        customer_id: selectedCust ? selectedCust.id : null,
        customers: selectedCust ? { name: selectedCust.name, whatsapp: selectedCust.whatsapp, pregnancy_stage: selectedCust.pregnancy_stage, crown_points: (selectedCust.crown_points || 0) + crownPoints } : { name: newCustName, whatsapp: waInput, pregnancy_stage: '', crown_points: crownPoints },
        voucher_lines: lines.filter(l => l.productId).map(l => {
          const prod = dbProducts.find(p => p.id === l.productId)
          return {
            qty: l.qty,
            unit_price: l.price,
            // gross before line discount — used by the receipt to show
            // "less X% off" when subtotal > total.
            subtotal: l.qty * l.price,
            total: l.amount,
            products: prod ? { name: prod.name, sku: prod.sku, category: '' } : null,
          }
        }),
      }
      return { success: true, ref, receiptData, isPOD: false }
    }

    return { success: true, ref, isPOD: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Something went wrong' }
  }
}

// ─── UPDATE (reverse + repost) ─────────────────────────────────────────────

export interface UpdateParams {
  editVoucherData: any
  newCustName: string
  waInput: string
  lines: SaleLine[]
  dbProducts: DBProduct[]
  selectedCust: { id: string } | null
  isPOD: boolean
  autoReceipt: boolean
  selectedMethod: string
  isSplit: boolean
  splitLines: SplitLine[]
  paymentRef: string
  townDelivery: string
  upcountryShipping: string
  currentMethod: PaymentMethod
  // ─ Required for the journal repost (NEW) ─
  accountMap: Record<string, string>
  deliveryAccountId: string
  totalSplitPaid: number
  userName: string
  userId?: string
  // Optional customer context update (Edit view path)
  customerContext?: {
    stage_path?:    'ttc' | 'pregnant' | 'postpartum' | null
    ttc_duration?:  string | null
    edd?:           string | null
    delivery_date?: string | null
    notes?:         string | null
  }
}

export async function updateCashSale(params: UpdateParams): Promise<{ success: boolean; error?: string }> {
  const {
    editVoucherData, newCustName, waInput, lines, dbProducts, selectedCust,
    isPOD, autoReceipt, isSplit, splitLines, paymentRef,
    townDelivery, upcountryShipping, currentMethod,
    accountMap, deliveryAccountId, totalSplitPaid, userName, userId,
    customerContext,
  } = params

  if (!newCustName.trim()) return { success: false, error: 'Customer name required' }
  if (lines.every(l => !l.productId)) return { success: false, error: 'Add at least one product' }

  const voucherId = editVoucherData.id
  const ref = editVoucherData.ref
  const journalId = editVoucherData.journal_id

  try {
    const lineItems = lines.filter(l => l.productId && l.amount > 0)
    const newSubtotal = lineItems.reduce((sum, l) => sum + l.amount, 0)
    const deliveryTotal = (parseInt(townDelivery) || 0) + (parseInt(upcountryShipping) || 0)
    const newTotal = newSubtotal + deliveryTotal

    // ── 1. Customer info
    const cleaned = waInput.replace(/[\s+\-()]/g, '')
    if (selectedCust) {
      // Build context fields if cashier captured/updated anything
      const ctxPayload: Record<string, any> = {}
      if (customerContext?.stage_path) {
        ctxPayload.context_status      = 'captured'
        ctxPayload.context_captured_at = new Date().toISOString()
        if (userId) ctxPayload.context_captured_by = userId
        if (customerContext.stage_path === 'ttc' && customerContext.ttc_duration) {
          ctxPayload.ttc_duration  = customerContext.ttc_duration
          ctxPayload.edd           = null
          ctxPayload.delivery_date = null
        } else if (customerContext.stage_path === 'pregnant' && customerContext.edd) {
          ctxPayload.edd               = customerContext.edd
          ctxPayload.edd_source        = 'manual_edit'
          ctxPayload.edd_captured_at   = new Date().toISOString()
          ctxPayload.ttc_duration      = null
          ctxPayload.delivery_date     = null
        } else if (customerContext.stage_path === 'postpartum' && customerContext.delivery_date) {
          ctxPayload.delivery_date = customerContext.delivery_date
          ctxPayload.ttc_duration  = null
        }
        if (customerContext.notes !== undefined) {
          ctxPayload.internal_notes = customerContext.notes
        }
      }
      await supabase.from('customers').update({
        name: newCustName.trim(),
        whatsapp: cleaned || null,
        ...ctxPayload,
      }).eq('id', selectedCust.id)
    }

    // ── 2. Compute label + split TOGETHER (no drift possible)
    const paymentLabel = buildPaymentLabel(isSplit, splitLines, currentMethod)
    const paymentSplitData = buildPaymentSplit(isSplit, newTotal, totalSplitPaid, splitLines, currentMethod)

    // ── 3. REVERSE old journal lines: undo balance impact, then delete them
    if (journalId) {
      const { data: oldJLines } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit')
        .eq('journal_id', journalId)

      if (oldJLines && oldJLines.length > 0) {
        await Promise.all(oldJLines.map(l =>
          supabase.rpc('update_account_balance', {
            p_account_id: l.account_id,
            p_debit: -(l.debit || 0),
            p_credit: -(l.credit || 0),
          })
        ))
        await supabase.from('journal_lines').delete().eq('journal_id', journalId)
      }
    }

    // ── 4. Update voucher header — payment_method AND payment_split together
    const { error: vErr } = await supabase.from('vouchers').update({
      subtotal: newSubtotal,
      total_amount: newTotal,
      payment_method: paymentLabel,
      payment_split: paymentSplitData,                    // ← previously missing (root cause)
      status: isPOD ? 'draft' : 'posted',
      description: `Cash Sale — ${newCustName.trim()}`,
      notes: [
        deliveryTotal > 0 ? `Delivery: TZS ${deliveryTotal.toLocaleString()}` : '',
        currentMethod.id === 'pos' ? 'POS Card payment' : '',
        paymentRef ? `Ref: ${paymentRef}` : '',
        `Edited by ${userName} on ${new Date().toISOString()}`,
      ].filter(Boolean).join(' · ') || null,
    }).eq('id', voucherId)
    if (vErr) throw new Error('Voucher update: ' + vErr.message)

    // ── 5. Restore stock from old voucher lines, then delete & re-insert
    const oldLines = editVoucherData.voucher_lines || []
    for (const oldLine of oldLines) {
      if (!oldLine.product_id) continue
      const prod = dbProducts.find(p => p.id === oldLine.product_id)
      if (prod) {
        await supabase.from('products')
          .update({ qty_on_hand: prod.qty_on_hand + oldLine.qty })
          .eq('id', oldLine.product_id)
      }
    }
    await supabase.from('voucher_lines').delete().eq('voucher_id', voucherId)

    for (let i = 0; i < lineItems.length; i++) {
      const line = lineItems[i]
      const prod = dbProducts.find(p => p.id === line.productId)
      if (!prod) continue
      const grossLineAmount = line.qty * line.price
      await supabase.from('voucher_lines').insert({
        voucher_id: voucherId, line_number: i + 1, product_id: line.productId,
        description: line.name, qty: line.qty, unit_cost: prod.cost_price,
        unit_price: line.price, subtotal: grossLineAmount, total: line.amount,
      })
      const currentQty = prod.qty_on_hand + (oldLines.find((ol: any) => ol.product_id === line.productId)?.qty || 0)
      await supabase.from('products').update({ qty_on_hand: currentQty - line.qty }).eq('id', line.productId)
    }

    // ── 6. RE-POST journal_lines with new amounts and (potentially new) accounts
    if (journalId) {
      const neededCodes = ['4010', '5010', '1110', '1050', '2085']
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', neededCodes)
      const acct = (code: string) => acctData?.find(a => a.code === code)?.id
      const revenueId = acct('4010')
      const cogsId = acct('5010')
      const inventoryId = acct('1110')
      const arId = acct('1050')
      const delivFloatId = acct('2085') || deliveryAccountId
      if (!revenueId || !cogsId || !inventoryId) throw new Error('Required accounts not found for re-post')
      if (deliveryTotal > 0 && !delivFloatId) {
        throw new Error('Delivery & Shipping Float account (2085) not found and no fallback configured. Cannot re-post.')
      }

      const cogsTotal = lineItems.reduce((s, l) => {
        const p = dbProducts.find(p => p.id === l.productId)
        return s + (p ? p.cost_price * l.qty : 0)
      }, 0)

      const { lines: receiptLines, nextLineNumber } = buildReceiptJournalLines({
        journalId, startLineNumber: 1,
        isPOD, autoReceipt, isSplit,
        total: newTotal, totalSplitPaid, splitLines, currentMethod,
        accountMap, paymentRef,
        custName: newCustName.trim(), ref,
        deliveryTotal, delivFloatId, arId,
      })

      const jLines: any[] = [...receiptLines]
      let ln = nextLineNumber
      jLines.push({ journal_id: journalId, line_number: ln++, account_id: revenueId, description: `Sales — ${ref}`, debit: 0, credit: newSubtotal })
      jLines.push({ journal_id: journalId, line_number: ln++, account_id: cogsId, description: `COGS — ${ref}`, debit: cogsTotal, credit: 0 })
      jLines.push({ journal_id: journalId, line_number: ln++, account_id: inventoryId, description: `Inventory out — ${ref}`, debit: 0, credit: cogsTotal })
      if (deliveryTotal > 0 && delivFloatId) {
        jLines.push({ journal_id: journalId, line_number: ln++, account_id: delivFloatId, description: `Delivery float — ${ref}`, debit: 0, credit: deliveryTotal })
      }

      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error('Journal lines re-post: ' + jlErr.message)

      await Promise.all(jLines.map(l =>
        supabase.rpc('update_account_balance', {
          p_account_id: l.account_id,
          p_debit: l.debit,
          p_credit: l.credit,
        })
      ))

      // Audit trail on the journal description
      await supabase.from('journals').update({
        description: `Cash Sale — ${newCustName.trim()} — ${ref} (edited by ${userName})`,
      }).eq('id', journalId)
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Update failed' }
  }
}
