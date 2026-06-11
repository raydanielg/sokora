// ============================================================================
// b2bPost.ts
// All B2B CRM writes live here (mirrors the cashSalePost.ts pattern: pure
// async functions, no React/JSX). Every function FAILS LOUDLY — it throws on
// any Supabase error instead of returning {success:false}, so a caller can
// never mistake a silent failure for success.
//
// The only non-trivial one is convertToCustomer, which is IDEMPOTENT: calling
// it twice on the same account never creates a duplicate customers row, and it
// retries on a customer_number unique-violation (same hardening the cash-sale
// path uses for voucher refs).
// ============================================================================

import { supabase } from './supabase'
import type {
  B2BAccount, B2BContact, B2BActivity, B2BStage, B2BActivityType,
} from './b2bTypes'

// Lightweight actor passed from the page (from useAuth()). Kept minimal so
// these functions stay decoupled from the auth module.
export interface Actor { id: string | null; name: string | null }

// ── Accounts ─────────────────────────────────────────────────────────────────

export async function createAccount(
  input: Partial<B2BAccount> & { name: string },
  actor?: Actor,
): Promise<B2BAccount> {
  const payload: any = {
    name: input.name.trim(),
    account_type: input.account_type || 'pharmacy',
    stage: input.stage || 'identified',
    region: input.region?.trim() || null,
    temperature: input.temperature || null,
    source: input.source || null,
    owner_user_id: input.owner_user_id ?? actor?.id ?? null,
    owner_name: input.owner_name ?? actor?.name ?? null,
    contact_person: input.contact_person?.trim() || null,
    whatsapp: input.whatsapp?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    tin_number: input.tin_number?.trim() || null,
    expected_monthly_value: Number(input.expected_monthly_value) || 0,
    payment_terms: input.payment_terms?.trim() || null,
    next_action: input.next_action?.trim() || null,
    next_action_date: input.next_action_date || null,
    notes: input.notes?.trim() || null,
  }
  const { data, error } = await supabase
    .from('b2b_accounts').insert(payload).select('*').single()
  if (error) throw new Error(`Create account failed: ${error.message}`)
  return data as B2BAccount
}

// Generic field patch. Never touches columns not in the patch, so it can never
// blank out a field the caller did not mean to change (non-regression).
export async function updateAccount(
  id: string, patch: Partial<B2BAccount>,
): Promise<void> {
  const { error } = await supabase.from('b2b_accounts').update(patch).eq('id', id)
  if (error) throw new Error(`Update account failed: ${error.message}`)
}

export async function setNextAction(
  id: string, text: string | null, date: string | null,
): Promise<void> {
  await updateAccount(id, {
    next_action: text?.trim() || null,
    next_action_date: date || null,
  })
}

export async function archiveAccount(id: string, archived: boolean): Promise<void> {
  await updateAccount(id, { is_archived: archived })
}

// Move an account to a new stage, stamp won_at/lost_at when relevant, and log
// the change to the timeline so the history is never lost.
export async function updateStage(
  account: B2BAccount, stage: B2BStage, actor?: Actor,
): Promise<void> {
  if (account.stage === stage) return
  const patch: Partial<B2BAccount> = { stage }
  if (stage === 'won' && !account.won_at) patch.won_at = new Date().toISOString()
  if (stage === 'lost' && !account.lost_at) patch.lost_at = new Date().toISOString()
  await updateAccount(account.id, patch)
  await logActivity({
    account_id: account.id,
    type: 'stage_change',
    note: `${account.stage} \u2192 ${stage}`,
  }, actor, { bumpContact: false })
}

// Mark lost with a reason (reason capture is the only way to learn why you lose).
export async function markLost(
  account: B2BAccount, reason: string, actor?: Actor,
): Promise<void> {
  await updateAccount(account.id, {
    stage: 'lost',
    lost_reason: reason,
    lost_at: new Date().toISOString(),
  })
  await logActivity({
    account_id: account.id,
    type: 'stage_change',
    note: `Marked Lost: ${reason}`,
  }, actor, { bumpContact: false })
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export async function addContact(
  input: Partial<B2BContact> & { account_id: string; name: string },
): Promise<B2BContact> {
  // If this is being set primary, demote any existing primary first.
  if (input.is_primary) {
    const { error: clr } = await supabase
      .from('b2b_contacts').update({ is_primary: false })
      .eq('account_id', input.account_id).eq('is_primary', true)
    if (clr) throw new Error(`Contact update failed: ${clr.message}`)
  }
  const payload: any = {
    account_id: input.account_id,
    name: input.name.trim(),
    role: input.role?.trim() || null,
    phone: input.phone?.trim() || null,
    whatsapp: input.whatsapp?.trim() || null,
    email: input.email?.trim() || null,
    is_primary: !!input.is_primary,
    notes: input.notes?.trim() || null,
  }
  const { data, error } = await supabase
    .from('b2b_contacts').insert(payload).select('*').single()
  if (error) throw new Error(`Add contact failed: ${error.message}`)
  return data as B2BContact
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('b2b_contacts').delete().eq('id', id)
  if (error) throw new Error(`Delete contact failed: ${error.message}`)
}

// ── Activities ───────────────────────────────────────────────────────────────

export async function logActivity(
  input: { account_id: string; type: B2BActivityType; note?: string | null; occurred_at?: string },
  actor?: Actor,
  opts: { bumpContact?: boolean } = { bumpContact: true },
): Promise<B2BActivity> {
  const payload: any = {
    account_id: input.account_id,
    type: input.type,
    note: input.note?.trim() || null,
    performed_by: actor?.id ?? null,
    performed_by_name: actor?.name ?? null,
    occurred_at: input.occurred_at || new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('b2b_activities').insert(payload).select('*').single()
  if (error) throw new Error(`Log activity failed: ${error.message}`)

  // A real interaction bumps last_contacted_at; a stage_change does not.
  if (opts.bumpContact !== false && input.type !== 'stage_change') {
    const { error: upd } = await supabase
      .from('b2b_accounts')
      .update({ last_contacted_at: payload.occurred_at })
      .eq('id', input.account_id)
    if (upd) throw new Error(`Update last_contacted failed: ${upd.message}`)
  }
  return data as B2BActivity
}

// ── Convert prospect -> real wholesale customer ──────────────────────────────

// Mirrors the WHL-10-NNNN numbering used in Customers.tsx (regex ^(WHL|DEB)-10-(\d+)$).
async function nextWholesaleNumber(): Promise<string> {
  const { data, error } = await supabase
    .from('customers').select('customer_number')
    .order('customer_number', { ascending: false }).limit(500)
  if (error) throw new Error(`Read customer numbers failed: ${error.message}`)
  let max = 0, width = 4
  for (const row of (data || []) as { customer_number: string }[]) {
    const m = row.customer_number?.match(/^(WHL|DEB)-10-(\d+)$/)
    if (m) {
      const n = parseInt(m[2], 10)
      if (n > max) max = n
      if (m[2].length > width) width = m[2].length
    }
  }
  return `WHL-10-${String(max + 1).padStart(width, '0')}`
}

export interface ConvertResult { customerId: string; customerNumber: string; alreadyLinked: boolean }

// IDEMPOTENT: if the account is already linked to a customer, returns that link
// and does nothing else. Otherwise creates a wholesale customers row, links it,
// flips the account to 'won', and logs the conversion. Retries on a
// customer_number unique-violation (race hardening, same as the voucher-ref path).
export async function convertToCustomer(
  account: B2BAccount, actor?: Actor,
): Promise<ConvertResult> {
  if (account.customer_id) {
    return { customerId: account.customer_id, customerNumber: '', alreadyLinked: true }
  }

  let customerId = ''
  let customerNumber = ''
  let lastErr: any = null
  for (let attempt = 0; attempt < 3; attempt++) {
    customerNumber = await nextWholesaleNumber()
    const payload: any = {
      name: account.name.trim(),
      company: account.name.trim(),
      contact_person: account.contact_person?.trim() || null,
      customer_type: 'wholesale',
      segment: 'corporate',
      whatsapp: account.whatsapp?.trim() || null,
      email: account.email?.trim() || null,
      phone: account.phone?.trim() || null,
      address: account.address?.trim() || null,
      tin_number: account.tin_number?.trim() || null,
      payment_terms: account.payment_terms || null,
      notes: account.notes?.trim() || null,
      customer_number: customerNumber,
      is_active: true,
    }
    const { data, error } = await supabase
      .from('customers').insert(payload).select('id').single()
    if (!error && data) { customerId = (data as any).id; lastErr = null; break }
    lastErr = error
    // Only retry the duplicate-number case; anything else fails immediately.
    if (!error || !/duplicate|unique/i.test(error.message)) break
  }
  if (!customerId) throw new Error(`Convert failed: ${lastErr?.message || 'could not create customer'}`)

  await updateAccount(account.id, {
    customer_id: customerId,
    stage: 'won',
    won_at: account.won_at || new Date().toISOString(),
  })
  await logActivity({
    account_id: account.id,
    type: 'stage_change',
    note: `Converted to customer ${customerNumber}`,
  }, actor, { bumpContact: false })

  return { customerId, customerNumber, alreadyLinked: false }
}
