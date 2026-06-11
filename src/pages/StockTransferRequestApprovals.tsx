// ════════════════════════════════════════════════════════════════════════════
// StockTransferRequestApprovals.tsx
//
// Inbox for users who can approve transfer requests at their assigned source
// location. Super admins and unrestricted users see ALL pending requests.
//
// Approval flow:
//   1. List shows only requests this user can act on (server-filtered).
//   2. Click Approve → calls approve_transfer_request RPC, which atomically:
//        - re-validates source stock
//        - posts the journal + voucher
//        - posts ledger entries
//        - updates product_locations on both sides
//        - marks request executed
//   3. Click Reject → opens a comment field; calls reject_transfer_request RPC.
//   4. The list refreshes after each action.
//
// Self-submitted requests are excluded server-side (cannot self-approve).
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { tzs } from '../lib/utils'
import { useAuth } from '../lib/useAuth'
import { useUserLocation } from '../lib/useUserLocation'
import {
  approveTransferRequest,
  rejectTransferRequest,
  listPendingApprovals,
  listRecentHistory,
  type TransferRequest,
} from '../lib/useStockTransferRequests'
import Toast from '../components/Toast'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pending:   { bg: '#f59e0b15', fg: '#f59e0b', label: 'Pending' },
  approved:  { bg: '#10b98115', fg: '#10b981', label: 'Approved' },
  executed:  { bg: '#10b98125', fg: '#059669', label: 'Executed' },
  rejected:  { bg: '#ef444415', fg: '#ef4444', label: 'Rejected' },
  cancelled: { bg: 'var(--surface2)', fg: 'var(--text3)', label: 'Cancelled' },
}

export default function StockTransferRequestApprovals({ onNav: _onNav }: Props) {
  const { user } = useAuth()
  const userLoc = useUserLocation()
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [pending, setPending] = useState<TransferRequest[]>([])
  const [history, setHistory] = useState<TransferRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)  // request id currently being acted on
  const [rejectFor, setRejectFor] = useState<string | null>(null)  // request id with the reject form open
  const [rejectReason, setRejectReason] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  useEffect(() => { reload() }, [user?.id, userLoc.allowedLocation?.id, userLoc.isUnrestricted])

  const reload = async () => {
    if (!user?.id) return
    setLoading(true)
    const [p, h] = await Promise.all([
      listPendingApprovals(user.id, userLoc.defaultLocationId, userLoc.isUnrestricted),
      listRecentHistory(50),
    ])
    setPending(p)
    setHistory(h)
    setLoading(false)
  }

  const onApprove = async (req: TransferRequest) => {
    if (!user?.id) return
    if (!confirm(`Approve transfer ${req.ref}? This will move ${(req.lines || []).length} item(s) from ${req.from_location?.code} to ${req.to_location?.code} immediately.`)) return
    setActing(req.id)
    const result = await approveTransferRequest(req.id, user.id)
    setActing(null)
    if (!result.success) {
      showToast(result.error || 'Approval failed', 'error')
      return
    }
    showToast(`Stock moved · voucher ${result.voucher_ref} posted`, 'success')
    reload()
  }

  const openReject = (req: TransferRequest) => {
    setRejectFor(req.id)
    setRejectReason('')
  }

  const submitReject = async (req: TransferRequest) => {
    if (!user?.id) return
    if (!rejectReason.trim()) { showToast('Reason required', 'error'); return }
    setActing(req.id)
    const result = await rejectTransferRequest(req.id, user.id, rejectReason.trim())
    setActing(null)
    if (!result.success) {
      showToast(result.error || 'Reject failed', 'error')
      return
    }
    showToast(`Request ${req.ref} rejected`)
    setRejectFor(null)
    setRejectReason('')
    reload()
  }

  const renderRequest = (req: TransferRequest, isPending: boolean) => {
    const st = STATUS_STYLE[req.status] || STATUS_STYLE.pending
    const isExpanded = expanded === req.id
    const isActing = acting === req.id
    const isRejecting = rejectFor === req.id

    return (
      <div key={req.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--accent)', fontSize: 13 }}>{req.ref}</span>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.fg, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{st.label}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                from <strong style={{ color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{req.from_location?.code}</strong> to <strong style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>{req.to_location?.code}</strong>
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <span>Requested by <strong>{req.requester?.full_name || '—'}</strong></span>
              <span>·</span>
              <span>{new Date(req.requested_at).toLocaleString()}</span>
              <span>·</span>
              <span>{(req.lines || []).length} item(s)</span>
              <span>·</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{tzs(req.total_value)}</span>
            </div>
            {req.reason && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, fontStyle: 'italic' }}>"{req.reason}"</div>
            )}
            {req.status === 'rejected' && req.rejected_reason && (
              <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>Rejected: {req.rejected_reason}</div>
            )}
            {req.status === 'executed' && req.approver?.full_name && (
              <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>Approved by {req.approver.full_name}</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => setExpanded(isExpanded ? null : req.id)}
              style={{ padding: '6px 12px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}
            >
              {isExpanded ? 'Hide' : 'Lines'}
            </button>
            {isPending && !isRejecting && (
              <>
                <button
                  onClick={() => onApprove(req)}
                  disabled={isActing}
                  style={{ padding: '6px 12px', fontSize: 11, borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', cursor: isActing ? 'wait' : 'pointer', fontWeight: 700, opacity: isActing ? 0.6 : 1 }}
                >
                  {isActing ? '…' : 'Approve'}
                </button>
                <button
                  onClick={() => openReject(req)}
                  disabled={isActing}
                  style={{ padding: '6px 12px', fontSize: 11, borderRadius: 6, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>

        {isExpanded && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--surface2)', borderRadius: 6 }}>
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Product</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Cost</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {(req.lines || []).map((l, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px' }}>{l.productName}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{l.qty}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{tzs(l.cost)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{tzs(l.qty * l.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isRejecting && (
          <div style={{ marginTop: 12, padding: 12, background: '#ef444408', border: '1px solid #ef444433', borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, marginBottom: 6 }}>Reason for rejection (required)</div>
            <input
              className="form-input"
              autoFocus
              placeholder="e.g. Source location is itself low on this item"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setRejectFor(null); setRejectReason('') }}
                style={{ padding: '6px 12px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => submitReject(req)}
                disabled={!rejectReason.trim() || isActing}
                style={{ padding: '6px 12px', fontSize: 11, borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: !rejectReason.trim() ? 0.5 : 1 }}
              >
                {isActing ? '…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Transfer Request Approvals</h1>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
          {userLoc.isUnrestricted
            ? 'You can approve transfers from any source location.'
            : `You can approve transfers where the source is ${userLoc.defaultLocationCode}.`}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setTab('pending')}
          style={{
            padding: '10px 16px', border: 'none', cursor: 'pointer',
            background: tab === 'pending' ? 'var(--accent)' : 'transparent',
            color: tab === 'pending' ? '#000' : 'var(--text2)',
            borderRadius: '8px 8px 0 0', fontSize: 13, fontWeight: 600,
          }}
        >
          Pending ({pending.length})
        </button>
        <button
          onClick={() => setTab('history')}
          style={{
            padding: '10px 16px', border: 'none', cursor: 'pointer',
            background: tab === 'history' ? 'var(--accent)' : 'transparent',
            color: tab === 'history' ? '#000' : 'var(--text2)',
            borderRadius: '8px 8px 0 0', fontSize: 13, fontWeight: 600,
          }}
        >
          History
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
            No pending requests {userLoc.isUnrestricted ? 'in any location' : `from ${userLoc.defaultLocationCode}`}
          </div>
        ) : (
          pending.map(req => renderRequest(req, true))
        )
      ) : (
        history.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No history yet</div>
        ) : (
          history.map(req => renderRequest(req, false))
        )
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
