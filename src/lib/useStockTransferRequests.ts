// ════════════════════════════════════════════════════════════════════════════
// useStockTransferRequests.ts
//
// CRUD + RPC wrappers for the inter-location stock transfer request flow.
//
// Flow:
//   1. A locked user (e.g. cashier at Front Office) needs items from another
//      location (e.g. Godown). They cannot pull stock directly. They open the
//      StockTransferRequest page and submit a request.
//   2. A user assigned to the SOURCE location (or a super admin / unrestricted
//      user) opens StockTransferRequestApprovals, sees the pending request,
//      and clicks Approve. The approve_transfer_request RPC atomically:
//        - validates stock at the source
//        - creates the journal + voucher (type 'stock_transfer')
//        - posts ledger entries (transfer_out + transfer_in)
//        - updates product_locations on both sides
//        - marks the request 'executed' and links voucher_id
//   3. The destination location now has the stock. No second posting step.
//
// All RPCs are defined in migration 005_location_locking.sql.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

export type TransferRequestStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'cancelled'

export interface TransferRequestLine {
  productId: string
  productName: string
  qty: number
  cost: number
}

export interface TransferRequest {
  id: string
  ref: string
  requested_by: string
  from_location_id: string
  to_location_id: string
  status: TransferRequestStatus
  reason: string | null
  notes: string | null
  lines: TransferRequestLine[]
  total_value: number
  approved_by: string | null
  approved_at: string | null
  rejected_reason: string | null
  voucher_id: string | null
  journal_id: string | null
  execution_error: string | null
  requested_at: string
  updated_at: string
  // Joined fields (populated by some queries):
  from_location?: { code: string; name: string }
  to_location?: { code: string; name: string }
  requester?: { full_name: string; initials: string }
  approver?: { full_name: string; initials: string }
}

// ─── Generate a request ref (STR series) ──────────────────────────────────
// Mirrors the pattern in lib/refs.ts. Uses STR-{branch}-{seq}. We don't
// import nextRef directly because that helper is shaped around vouchers/
// journals; transfer_requests is its own table.
async function nextRequestRef(branch: string = '10'): Promise<string> {
  const pattern = `STR-${branch}-`
  const { data } = await supabase
    .from('stock_transfer_requests')
    .select('ref')
    .like('ref', `${pattern}%`)
    .order('ref', { ascending: false })
    .limit(1)
  let seq = 1
  if (data && data.length > 0) {
    const last = parseInt((data[0].ref as string).replace(pattern, '')) || 0
    seq = last + 1
  }
  return `${pattern}${String(seq).padStart(4, '0')}`
}

export interface CreateRequestParams {
  fromLocationId: string
  toLocationId: string
  reason?: string
  notes?: string
  lines: TransferRequestLine[]
  requestedBy: string
}

export interface CreateRequestResult {
  success: boolean
  requestId?: string
  ref?: string
  error?: string
}

/**
 * Create a new pending transfer request. The requester typically sits at
 * the to-location (they want stock moved INTO their location). The from-
 * location is the source. An approver at the source will execute it.
 */
export async function createTransferRequest(params: CreateRequestParams): Promise<CreateRequestResult> {
  if (!params.lines || params.lines.length === 0) {
    return { success: false, error: 'At least one line is required' }
  }
  if (params.fromLocationId === params.toLocationId) {
    return { success: false, error: 'From and To locations cannot be the same' }
  }

  const ref = await nextRequestRef()
  const totalValue = params.lines.reduce((s, l) => s + (l.qty * (l.cost || 0)), 0)

  const { data, error } = await supabase
    .from('stock_transfer_requests')
    .insert({
      ref,
      requested_by: params.requestedBy,
      from_location_id: params.fromLocationId,
      to_location_id: params.toLocationId,
      reason: params.reason || null,
      notes: params.notes || null,
      lines: params.lines,
      total_value: totalValue,
      status: 'pending',
    })
    .select('id, ref')
    .single()

  if (error || !data) {
    return { success: false, error: error?.message || 'Insert failed' }
  }
  return { success: true, requestId: data.id, ref: data.ref }
}

// ─── Approve via RPC ─────────────────────────────────────────────────────
export interface ApproveResult {
  success: boolean
  voucher_id?: string
  voucher_ref?: string
  error?: string
}

export async function approveTransferRequest(
  requestId: string,
  approverId: string,
  comment?: string
): Promise<ApproveResult> {
  const { data, error } = await supabase.rpc('approve_transfer_request', {
    p_request_id: requestId,
    p_approver_id: approverId,
    p_comment: comment ?? null,
  })

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'No response from approve_transfer_request RPC' }
  if (!data.success) return { success: false, error: data.error }

  return {
    success: true,
    voucher_id: data.voucher_id,
    voucher_ref: data.voucher_ref,
  }
}

// ─── Reject via RPC ──────────────────────────────────────────────────────
export async function rejectTransferRequest(
  requestId: string,
  approverId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  if (!reason || !reason.trim()) {
    return { success: false, error: 'Rejection reason is required' }
  }
  const { data, error } = await supabase.rpc('reject_transfer_request', {
    p_request_id: requestId,
    p_approver_id: approverId,
    p_reason: reason,
  })
  if (error) return { success: false, error: error.message }
  if (!data?.success) return { success: false, error: data?.error || 'Reject failed' }
  return { success: true }
}

// ─── Cancel (by requester only) ──────────────────────────────────────────
export async function cancelTransferRequest(
  requestId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('cancel_transfer_request', {
    p_request_id: requestId,
    p_user_id: userId,
  })
  if (error) return { success: false, error: error.message }
  if (!data?.success) return { success: false, error: data?.error || 'Cancel failed' }
  return { success: true }
}

// ─── List queries ────────────────────────────────────────────────────────
// All list queries are written defensively: missing joins, missing rows, or
// permission errors should produce an empty array, never throw. The pages
// using these helpers handle the empty case in their own UI.

/** Requests created by this user — for the "My Requests" tab. */
export async function listMyRequests(userId: string): Promise<TransferRequest[]> {
  const { data } = await supabase
    .from('stock_transfer_requests')
    .select(`
      *,
      from_location:from_location_id(code, name),
      to_location:to_location_id(code, name),
      approver:approved_by(full_name, initials)
    `)
    .eq('requested_by', userId)
    .order('requested_at', { ascending: false })
    .limit(100)
  return (data || []) as unknown as TransferRequest[]
}

/**
 * Pending requests this user is allowed to approve.
 *   - Super admin or unrestricted user → all pending requests
 *   - Locked user → requests where from_location_id = their allowed_location_id
 * Self-submitted requests are always excluded (cannot self-approve).
 */
export async function listPendingApprovals(
  userId: string,
  allowedLocationId: string | null,
  isUnrestricted: boolean
): Promise<TransferRequest[]> {
  let query = supabase
    .from('stock_transfer_requests')
    .select(`
      *,
      from_location:from_location_id(code, name),
      to_location:to_location_id(code, name),
      requester:requested_by(full_name, initials)
    `)
    .eq('status', 'pending')
    .neq('requested_by', userId)
    .order('requested_at', { ascending: true })
    .limit(100)

  if (!isUnrestricted && allowedLocationId) {
    query = query.eq('from_location_id', allowedLocationId)
  }

  const { data } = await query
  return (data || []) as unknown as TransferRequest[]
}

/** Count pending approvals for the sidebar badge. */
export async function countPendingApprovals(
  userId: string,
  allowedLocationId: string | null,
  isUnrestricted: boolean
): Promise<number> {
  let query = supabase
    .from('stock_transfer_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .neq('requested_by', userId)

  if (!isUnrestricted && allowedLocationId) {
    query = query.eq('from_location_id', allowedLocationId)
  }

  const { count } = await query
  return count ?? 0
}

/** Recent history (executed/rejected/cancelled) — for register page. */
export async function listRecentHistory(limit = 50): Promise<TransferRequest[]> {
  const { data } = await supabase
    .from('stock_transfer_requests')
    .select(`
      *,
      from_location:from_location_id(code, name),
      to_location:to_location_id(code, name),
      requester:requested_by(full_name, initials),
      approver:approved_by(full_name, initials)
    `)
    .in('status', ['executed', 'rejected', 'cancelled'])
    .order('updated_at', { ascending: false })
    .limit(limit)
  return (data || []) as unknown as TransferRequest[]
}
