// ════════════════════════════════════════════════════════════════════════════
// useApproval.ts
// Approval workflow helpers for SOKORA vouchers & sensitive actions.
//
// Flow (block-and-execute pattern):
//   1. Voucher calls checkApprovalRequired(code, context) BEFORE posting.
//   2. If required → voucher calls submitForApproval(...) with its full payload,
//      creates the voucher row with status='pending_approval', and exits.
//      The approval_request.payload stores everything needed to re-execute.
//   3. Approver opens ApprovalWorkflows, reviews, clicks Approve.
//   4. Approve → RPC approve_request() → returns payload → frontend calls
//      the voucher's own execute() function with the payload → on success
//      calls markRequestExecuted().
//
// Why this pattern?
//   • DB stays decoupled from voucher posting logic (no massive stored procs)
//   • Approver can see the exact snapshot they're approving (nothing changes
//     between submit and approve even if submitter edits something else)
//   • Every voucher type just needs an executeFromPayload() function registered
//     in the approval executor dispatcher.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// ─── Types ─────────────────────────────────────────────────────────────────

export type ApprovalTypeCode =
  | 'internal_use' | 'internal_use_own' | 'internal_use_damage'
  | 'sales_discount' | 'sales_return' | 'credit_note' | 'price_override'
  | 'stock_adjustment' | 'stock_transfer' | 'opening_stock'
  | 'petty_cash' | 'bank_transfer' | 'cash_payment' | 'journal_entry' | 'large_purchase'
  | 'overdue_invoice' | 'credit_limit_override'
  | 'void_transaction' | 'backdated_posting'
  | 'hrm_leave' | 'hrm_payroll_run'
  | 'ambassador_settings_change'

export type ThresholdType = 'any' | 'amount' | 'percentage' | 'quantity' | 'days' | 'never'
export type ThresholdOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
export type ApproverRule = 'any_approver' | 'specific_users' | 'super_admin_only'
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled' | 'executed' | 'execution_failed'

export interface ApprovalCheckContext {
  /** Main numeric value being compared (amount for 'amount', percent for 'percentage', etc.) */
  value: number
  /** For percentage discounts: the pre-discount value (so % can be computed) */
  originalValue?: number
  /** For days-based rules: the overdue/backdated days */
  days?: number
  /** For quantity-based rules */
  quantity?: number
  /** Arbitrary extra context (category, reason, etc.) used by forced rules */
  meta?: Record<string, unknown>
}

export interface ApprovalCheckResult {
  requiresApproval: boolean
  approvalType: ApprovalTypeCode | null
  reason: string | null
  threshold: number | null
  thresholdType: ThresholdType | null
  blockPosting: boolean
  /** True if super admin can bypass per settings */
  superAdminBypass: boolean
}

export interface SubmitApprovalParams {
  typeCode: ApprovalTypeCode
  referenceType: 'voucher' | 'journal' | 'hrm_leave' | 'other'
  referenceId: string
  referenceNumber: string
  summary: string
  originalValue?: number
  requestedValue?: number
  payload: Record<string, unknown>
  requestedBy: string               // user.id (UUID)
}

export interface SubmitApprovalResult {
  success: boolean
  requestId?: string
  error?: string
  /** Name of the user the request was assigned to. Lets the calling
   *  voucher show a useful toast like "Submitted to Jane Mwatonoka for
   *  approval" instead of a generic "Submitted for approval". */
  assignedToName?: string
}

// ─── checkApprovalRequired ─────────────────────────────────────────────────
/**
 * Determines whether a given action requires approval based on
 * approval_settings rules.
 *
 * Safe behaviour: if the approval_types/settings tables don't exist or
 * the type is inactive, returns { requiresApproval: false } so voucher
 * posting is never blocked by a misconfigured approval system.
 */
export async function checkApprovalRequired(
  typeCode: ApprovalTypeCode,
  ctx: ApprovalCheckContext
): Promise<ApprovalCheckResult> {

  const noop = (): ApprovalCheckResult => ({
    requiresApproval: false,
    approvalType: null,
    reason: null,
    threshold: null,
    thresholdType: null,
    blockPosting: false,
    superAdminBypass: true,
  })

  try {
    // Get the type + its setting in one query
    const { data, error } = await supabase
      .from('approval_types')
      .select(`
        id, code, name,
        approval_settings!inner(
          threshold_type, threshold_value, threshold_operator,
          block_posting, approver_rule, super_admin_bypass, is_active
        )
      `)
      .eq('code', typeCode)
      .maybeSingle()

    if (error) {
      console.warn('[useApproval] check failed, allowing action:', error.message)
      return noop()
    }
    if (!data) {
      // Type not in catalog → no rule → allow
      return noop()
    }

    const setting = Array.isArray(data.approval_settings)
      ? data.approval_settings[0]
      : (data.approval_settings as any)

    if (!setting || !setting.is_active || setting.threshold_type === 'never') {
      return noop()
    }

    const t: ThresholdType = setting.threshold_type
    const op: ThresholdOperator = setting.threshold_operator || 'gt'
    const thr: number | null = setting.threshold_value

    let triggers = false
    let reason = ''

    const cmp = (actual: number, threshold: number): boolean => {
      switch (op) {
        case 'gt':  return actual > threshold
        case 'gte': return actual >= threshold
        case 'lt':  return actual < threshold
        case 'lte': return actual <= threshold
        case 'eq':  return actual === threshold
        default:    return actual > threshold
      }
    }

    if (t === 'any') {
      triggers = true
      reason = `${data.name} requires approval`
    } else if (t === 'amount' && thr !== null) {
      if (cmp(ctx.value, thr)) {
        triggers = true
        reason = `Amount TZS ${ctx.value.toLocaleString()} ${op.replace('gt','>').replace('gte','≥').replace('lt','<').replace('lte','≤').replace('eq','=')} threshold of TZS ${thr.toLocaleString()}`
      }
    } else if (t === 'percentage' && thr !== null && ctx.originalValue) {
      const pct = ((ctx.originalValue - ctx.value) / ctx.originalValue) * 100
      if (cmp(pct, thr)) {
        triggers = true
        reason = `Discount of ${pct.toFixed(1)}% exceeds threshold of ${thr}%`
      }
    } else if (t === 'quantity' && thr !== null) {
      const qty = ctx.quantity ?? ctx.value
      if (cmp(qty, thr)) {
        triggers = true
        reason = `Quantity ${qty} exceeds threshold of ${thr}`
      }
    } else if (t === 'days' && thr !== null) {
      const d = ctx.days ?? ctx.value
      if (cmp(d, thr)) {
        triggers = true
        reason = `${d} days exceeds threshold of ${thr} days`
      }
    }

    return {
      requiresApproval: triggers,
      approvalType: triggers ? typeCode : null,
      reason: triggers ? reason : null,
      threshold: thr,
      thresholdType: t,
      blockPosting: !!setting.block_posting,
      superAdminBypass: !!setting.super_admin_bypass,
    }
  } catch (e: any) {
    console.warn('[useApproval] exception, allowing action:', e?.message)
    return noop()
  }
}

// ─── submitForApproval ─────────────────────────────────────────────────────
/**
 * Creates an approval_request with the full voucher payload snapshot.
 * Assigns to a default approver (first active is_approver user who isn't
 * the requester; for super_admin_only, first super admin who isn't the
 * requester).
 */
export async function submitForApproval(
  params: SubmitApprovalParams
): Promise<SubmitApprovalResult> {

  try {
    // Get type + setting to know approver rule + expiry
    const { data: typeRow, error: typeErr } = await supabase
      .from('approval_types')
      .select('id, approval_settings!inner(approver_rule, expiry_hours)')
      .eq('code', params.typeCode)
      .maybeSingle()

    if (typeErr || !typeRow) {
      return { success: false, error: 'Approval type not configured. Run migration 004.' }
    }

    const setting = Array.isArray(typeRow.approval_settings)
      ? typeRow.approval_settings[0]
      : (typeRow.approval_settings as any)
    const expiryHours: number = setting?.expiry_hours ?? 72
    const approverRule: ApproverRule = setting?.approver_rule ?? 'any_approver'

    // Pick an approver — anyone eligible who isn't the requester
    let assignedTo: string | null = null

    if (approverRule === 'specific_users') {
      const { data } = await supabase
        .from('approval_type_approvers')
        .select('user_id, users!inner(id, is_active)')
        .eq('approval_type_id', typeRow.id)
        .neq('user_id', params.requestedBy)
        .eq('users.is_active', true)
        .limit(1)
      assignedTo = data?.[0]?.user_id ?? null
    } else if (approverRule === 'super_admin_only') {
      // Try is_super_admin column first; fall back to is_approver if column missing
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('is_active', true)
        .neq('id', params.requestedBy)
        .or('is_super_admin.eq.true,is_approver.eq.true')
        .limit(1)
      assignedTo = data?.[0]?.id ?? null
    } else {
      // any_approver
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('is_active', true)
        .eq('is_approver', true)
        .neq('id', params.requestedBy)
        .limit(1)
      assignedTo = data?.[0]?.id ?? null
    }

    if (!assignedTo) {
      return {
        success: false,
        error: 'No eligible approver found. Ask an admin to mark at least one other user as approver.',
      }
    }

    // Resolve the approver's display name so the calling voucher can show
    // a useful toast ("Submitted to Jane for approval"). If the lookup
    // fails we still proceed — the assignment is already correct, the
    // name is just nice-to-have.
    let assignedToName: string | undefined
    const { data: approverRow } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', assignedTo)
      .maybeSingle()
    if (approverRow?.full_name) assignedToName = approverRow.full_name

    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString()

    // Insert the request
    const { data: req, error: insErr } = await supabase
      .from('approval_requests')
      .insert({
        approval_type_id: typeRow.id,
        reference_type: params.referenceType,
        reference_id: params.referenceId,
        reference_number: params.referenceNumber,
        request_summary: params.summary,
        original_value: params.originalValue ?? null,
        requested_value: params.requestedValue ?? null,
        payload: params.payload,
        requested_by: params.requestedBy,
        assigned_to: assignedTo,
        expires_at: expiresAt,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insErr || !req) {
      return { success: false, error: insErr?.message || 'Insert failed' }
    }

    // Log the submission
    await supabase.from('approval_actions').insert({
      request_id: req.id,
      action: 'submitted',
      performed_by: params.requestedBy,
      comment: params.summary,
    })

    // Link the voucher → approval_request (if reference is a voucher)
    if (params.referenceType === 'voucher') {
      await supabase
        .from('vouchers')
        .update({ approval_request_id: req.id, status: 'pending_approval' })
        .eq('id', params.referenceId)
    }

    return { success: true, requestId: req.id, assignedToName }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Unknown error' }
  }
}

// ─── approveRequest (uses RPC) ─────────────────────────────────────────────
export async function approveRequest(
  requestId: string,
  approverId: string,
  comment?: string
): Promise<{ success: boolean; error?: string; payload?: any; referenceType?: string; referenceId?: string }> {

  const { data, error } = await supabase.rpc('approve_request', {
    p_request_id: requestId,
    p_approver_id: approverId,
    p_comment: comment ?? null,
  })

  if (error) return { success: false, error: error.message }
  // RPC returns a JSONB object directly (not an array of rows)
  if (!data) return { success: false, error: 'No response from approve_request RPC' }
  if (!data.success) return { success: false, error: data.error }

  return {
    success: true,
    payload: data.payload,
    referenceType: data.reference_type,
    referenceId: data.reference_id,
  }
}

// ─── rejectRequest (uses RPC) ──────────────────────────────────────────────
export async function rejectRequest(
  requestId: string,
  approverId: string,
  comment: string
): Promise<{ success: boolean; error?: string }> {

  if (!comment || !comment.trim()) {
    return { success: false, error: 'Rejection comment is required' }
  }

  const { data, error } = await supabase.rpc('reject_request', {
    p_request_id: requestId,
    p_approver_id: approverId,
    p_comment: comment,
  })

  if (error) return { success: false, error: error.message }
  if (!data?.success) return { success: false, error: data?.error || 'Reject failed' }
  return { success: true }
}

// ─── markRequestExecuted ───────────────────────────────────────────────────
export async function markRequestExecuted(
  requestId: string,
  voucherId?: string,
  error?: string
): Promise<void> {
  await supabase.rpc('mark_request_executed', {
    p_request_id: requestId,
    p_voucher_id: voucherId ?? null,
    p_error: error ?? null,
  })
}

// ─── cancelRequest (by the original requester) ─────────────────────────────
export async function cancelRequest(
  requestId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {

  // Only the requester can cancel their own pending request
  const { data: req } = await supabase
    .from('approval_requests')
    .select('id, requested_by, status, reference_type, reference_id')
    .eq('id', requestId)
    .single()

  if (!req) return { success: false, error: 'Request not found' }
  if (req.requested_by !== userId) return { success: false, error: 'Only the requester can cancel' }
  if (req.status !== 'pending') return { success: false, error: `Cannot cancel a ${req.status} request` }

  const { error } = await supabase
    .from('approval_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', requestId)

  if (error) return { success: false, error: error.message }

  await supabase.from('approval_actions').insert({
    request_id: requestId,
    action: 'cancelled',
    performed_by: userId,
    comment: 'Cancelled by requester',
  })

  // Clean up the blocked voucher
  if (req.reference_type === 'voucher' && req.reference_id) {
    await supabase
      .from('vouchers')
      .delete()
      .eq('id', req.reference_id)
      .eq('status', 'pending_approval')
  }

  return { success: true }
}

// ─── getPendingCountForUser ────────────────────────────────────────────────
export async function getPendingCountForUser(userId: string): Promise<number> {
  const { count } = await supabase
    .from('approval_requests')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', userId)
    .eq('status', 'pending')
  return count ?? 0
}

// ─── formatApprovalNotice ──────────────────────────────────────────────────
/**
 * Produces a short, friendly message explaining WHY an action needs approval
 * — for use in the pre-submit banner shown to the requester.
 *
 * We deliberately don't say "blocked" or "denied" anywhere. The cashier did
 * nothing wrong; she just crossed a threshold. The message should reassure
 * her that her work will be saved and someone will look at it.
 *
 * Examples produced:
 *   • "Above the TZS 50,000 petty cash threshold — needs a manager's approval."
 *   • "Discount above 15% — needs a manager's approval."
 *   • "This action requires a manager's approval."
 */
export function formatApprovalNotice(check: ApprovalCheckResult): string {
  if (!check.requiresApproval) return ''
  if (check.thresholdType === 'amount' && check.threshold !== null) {
    return `Above the TZS ${check.threshold.toLocaleString()} threshold — needs a manager's approval before it can post.`
  }
  if (check.thresholdType === 'percentage' && check.threshold !== null) {
    return `Above the ${check.threshold}% threshold — needs a manager's approval before it can post.`
  }
  if (check.thresholdType === 'quantity' && check.threshold !== null) {
    return `Above the ${check.threshold}-unit threshold — needs a manager's approval before it can post.`
  }
  if (check.thresholdType === 'days' && check.threshold !== null) {
    return `Older than ${check.threshold} days — needs a manager's approval before it can post.`
  }
  return check.reason || `This action requires a manager's approval before it can post.`
}

// ─── getMyPendingSubmissions ───────────────────────────────────────────────
export async function getMyPendingSubmissions(userId: string) {
  const { data } = await supabase
    .from('approval_requests')
    .select('id, reference_number, request_summary, status, requested_at, approval_types(name, icon, color)')
    .eq('requested_by', userId)
    .in('status', ['pending', 'rejected'])
    .order('requested_at', { ascending: false })
    .limit(10)
  return data || []
}
