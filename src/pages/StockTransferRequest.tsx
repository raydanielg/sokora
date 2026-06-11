// ════════════════════════════════════════════════════════════════════════════
// StockTransferRequest.tsx
//
// Page where a user (typically a locked user — e.g. cashier at Front Office)
// requests stock from another location. They cannot pull stock directly;
// instead they submit a request that an approver at the SOURCE location
// (or a super admin) executes.
//
// Layout:
//   Top — request form (From, To, Lines, Reason, Notes, Submit)
//   Bottom — list of "My Requests" with status pills and live updates.
//
// Constraints applied:
//   - The TO location is forced to the user's allowed_location for locked
//     users (you only request stock to be moved INTO your own location).
//   - The FROM location dropdown excludes the user's own location.
//   - Unrestricted users can pick any From + To. (They typically wouldn't
//     use this page — they can just use Stock Transfer directly. But it's
//     legal in case a manager wants to formalise a request workflow.)
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import VoucherPage from '../components/VoucherPage'
import { FG } from '../components/FormHelpers'
import Toast from '../components/Toast'
import { tzs } from '../lib/utils'
import { useAuth } from '../lib/useAuth'
import { useUserLocation } from '../lib/useUserLocation'
import {
  createTransferRequest,
  cancelTransferRequest,
  listMyRequests,
  type TransferRequest,
  type TransferRequestLine,
} from '../lib/useStockTransferRequests'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBProduct { id: string; name: string; cost_price: number }
interface StockLoc { id: string; code: string; name: string; branch_code: string }
interface ReqLine { productId: string; qty: number; cost: number }

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pending:   { bg: '#f59e0b15', fg: '#f59e0b', label: 'Pending' },
  approved:  { bg: '#10b98115', fg: '#10b981', label: 'Approved' },
  executed:  { bg: '#10b98125', fg: '#059669', label: 'Executed' },
  rejected:  { bg: '#ef444415', fg: '#ef4444', label: 'Rejected' },
  cancelled: { bg: 'var(--surface2)', fg: 'var(--text3)', label: 'Cancelled' },
}

export default function StockTransferRequest({ onNav: _onNav }: Props) {
  const { user } = useAuth()
  const userLoc = useUserLocation()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [submitting, setSubmitting] = useState(false)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [locations, setLocations] = useState<StockLoc[]>([])
  // Per-(product, location) stock map so the requester can see what's
  // available at the source before submitting. Keyed by `${productId}@${locCode}`.
  const [sourceStock, setSourceStock] = useState<Record<string, number>>({})
  const [myRequests, setMyRequests] = useState<TransferRequest[]>([])
  const [lines, setLines] = useState<ReqLine[]>([{ productId: '', qty: 1, cost: 0 }])
  const [form, setForm] = useState({
    fromLocationId: '',
    toLocationId: '',
    reason: '',
    notes: '',
  })
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const fromLoc = locations.find(l => l.id === form.fromLocationId)
  const toLoc = locations.find(l => l.id === form.toLocationId)

  // ─── Initial load ──────────────────────────────────────────────────────
  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const [{ data: prods }, { data: locs }] = await Promise.all([
      supabase.from('products').select('id, name, cost_price').eq('is_active', true).order('name'),
      supabase.from('stock_locations').select('id, code, name, branch_code').eq('is_active', true).order('code'),
    ])
    if (prods) setProducts(prods)
    if (locs && locs.length > 0) {
      setLocations(locs)
      // If user is locked, force destination = their location.
      if (userLoc.isLocked && userLoc.defaultLocationId) {
        setForm(f => ({
          ...f,
          toLocationId: userLoc.defaultLocationId!,
          // Pick a sensible default source: any location that's NOT theirs.
          fromLocationId: locs.find(l => l.id !== userLoc.defaultLocationId)?.id || '',
        }))
      } else {
        // Unrestricted: default to first two locations.
        setForm(f => ({
          ...f,
          fromLocationId: locs[0].id,
          toLocationId: locs.length >= 2 ? locs[1].id : locs[0].id,
        }))
      }
    }
    if (user?.id) {
      const reqs = await listMyRequests(user.id)
      setMyRequests(reqs)
    }
  }

  // ─── Reload source stock when fromLocation changes ────────────────────
  useEffect(() => {
    const loadSourceStock = async () => {
      if (!fromLoc) { setSourceStock({}); return }
      const { data } = await supabase
        .from('product_locations')
        .select('product_id, qty_on_hand')
        .eq('location_code', fromLoc.code)
      const map: Record<string, number> = {}
      ;(data || []).forEach((r: any) => { map[`${r.product_id}@${fromLoc.code}`] = r.qty_on_hand || 0 })
      setSourceStock(map)
    }
    loadSourceStock()
  }, [form.fromLocationId, fromLoc?.code])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const updateLine = (i: number, field: keyof ReqLine, val: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val as never }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) nl[i].cost = p.cost_price
    }
    setLines(nl)
  }

  const addLine = () => setLines([...lines, { productId: '', qty: 1, cost: 0 }])
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i))

  const totalValue = lines.reduce((s, l) => s + (l.qty * l.cost), 0)

  // ─── Submit ────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!user) { showToast('You must be signed in', 'error'); return }
    if (!form.fromLocationId || !form.toLocationId) { showToast('Pick both From and To locations', 'error'); return }
    if (form.fromLocationId === form.toLocationId) { showToast('From and To cannot be the same', 'error'); return }
    const validLines = lines.filter(l => l.productId && l.qty > 0)
    if (validLines.length === 0) { showToast('Add at least one product with qty > 0', 'error'); return }

    // Pre-flight stock check at source (advisory — the RPC also re-checks
    // at approval time, but warning the requester now is more useful).
    if (fromLoc) {
      const insufficient: string[] = []
      const aggregated: Record<string, number> = {}
      validLines.forEach(l => { aggregated[l.productId] = (aggregated[l.productId] || 0) + l.qty })
      for (const [pid, qty] of Object.entries(aggregated)) {
        const avail = sourceStock[`${pid}@${fromLoc.code}`] || 0
        if (avail < qty) {
          const name = products.find(p => p.id === pid)?.name || pid
          insufficient.push(`${name} (need ${qty}, have ${avail})`)
        }
      }
      if (insufficient.length > 0) {
        showToast(`Source ${fromLoc.code} doesn't have enough: ${insufficient.join(' · ')}`, 'error')
        return
      }
    }

    setSubmitting(true)
    const payloadLines: TransferRequestLine[] = validLines.map(l => {
      const p = products.find(pp => pp.id === l.productId)
      return {
        productId: l.productId,
        productName: p?.name || '',
        qty: l.qty,
        cost: l.cost || (p?.cost_price ?? 0),
      }
    })

    const result = await createTransferRequest({
      fromLocationId: form.fromLocationId,
      toLocationId: form.toLocationId,
      reason: form.reason,
      notes: form.notes,
      lines: payloadLines,
      requestedBy: user.id,
    })

    if (!result.success) {
      showToast(result.error || 'Submission failed', 'error')
      setSubmitting(false)
      return
    }

    showToast(`Request ${result.ref} submitted · awaiting approval at ${fromLoc?.code}`, 'success')
    // Reset form (but keep From/To since the user might want to make another).
    setLines([{ productId: '', qty: 1, cost: 0 }])
    setForm(f => ({ ...f, reason: '', notes: '' }))
    // Refresh list
    if (user.id) setMyRequests(await listMyRequests(user.id))
    setSubmitting(false)
  }

  const cancelOne = async (req: TransferRequest) => {
    if (!user) return
    if (!confirm(`Cancel request ${req.ref}?`)) return
    const r = await cancelTransferRequest(req.id, user.id)
    if (!r.success) { showToast(r.error || 'Cancel failed', 'error'); return }
    showToast(`Request ${req.ref} cancelled`)
    setMyRequests(await listMyRequests(user.id))
  }

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <VoucherPage
      title="Stock Transfer Request"
      icon=""
      subtitle="Request stock from another location. An approver at the source location will execute the transfer."
      color="rgba(61,139,255,.12)"
      onPost={submit}
      postLabel={submitting ? 'Submitting…' : 'Submit Request'}
      journalNote="No accounting entries are posted on submission. Stock moves only on approval."
    >
      {userLoc.isLocked && (
        <div style={{ background: '#3d8bff14', border: '1px solid #3d8bff44', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
          You are locked to <strong style={{ color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{userLoc.defaultLocationCode}</strong>. Stock will be moved INTO your location once an approver at the source location confirms availability and approves the request.
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="From Location (source)" req>
            <select className="form-input" value={form.fromLocationId} onChange={e => set('fromLocationId', e.target.value)}>
              <option value="">— Select source —</option>
              {locations.map(l => {
                // Don't let the user pick their own location as the source —
                // that's not a request, it's a no-op.
                const isSelf = userLoc.defaultLocationId === l.id
                return (
                  <option key={l.id} value={l.id} disabled={isSelf}>
                    {l.code} — {l.name}{isSelf ? ' (your location)' : ''}
                  </option>
                )
              })}
            </select>
          </FG>
          <FG label="To Location (destination)" req>
            <select
              className="form-input"
              value={form.toLocationId}
              onChange={e => set('toLocationId', e.target.value)}
              disabled={userLoc.isLocked}
              title={userLoc.isLocked ? `Locked to ${userLoc.defaultLocationCode}` : ''}
            >
              <option value="">— Select destination —</option>
              {locations.map(l => {
                const isMine = !userLoc.isLocked || userLoc.defaultLocationId === l.id
                return (
                  <option key={l.id} value={l.id} disabled={!isMine}>
                    {l.code} — {l.name}{!isMine ? ' (not assigned)' : ''}
                  </option>
                )
              })}
            </select>
          </FG>
        </div>

        {fromLoc && toLoc && form.fromLocationId !== form.toLocationId && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{fromLoc.code}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fromLoc.name}</div>
            </div>
            <svg width="32" height="16" viewBox="0 0 32 16" fill="none"><path d="M0 8h28M22 2l8 6-8 6" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round"/></svg>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{toLoc.code}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{toLoc.name}</div>
            </div>
          </div>
        )}

        <FG label="Reason for Request">
          <input
            className="form-input"
            placeholder="e.g. Front office stock running low; expecting walk-ins for breast pumps"
            value={form.reason}
            onChange={e => set('reason', e.target.value)}
          />
        </FG>
        <FG label="Notes">
          <input
            className="form-input"
            placeholder="Anything the approver should know"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </FG>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Items Requested</div>
        {lines.map((line, i) => {
          const atSource = fromLoc ? (sourceStock[`${line.productId}@${fromLoc.code}`] || 0) : null
          const insufficient = line.productId && atSource !== null && atSource < line.qty
          return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
              <FG label={i === 0 ? 'Product' : ''}>
                <select
                  className="form-input"
                  style={{ fontSize: 12 }}
                  value={line.productId}
                  onChange={e => updateLine(i, 'productId', e.target.value)}
                >
                  <option value="">— Select product —</option>
                  {products.map(p => {
                    const avail = fromLoc ? (sourceStock[`${p.id}@${fromLoc.code}`] || 0) : null
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name}{avail !== null ? ` · ${avail} at ${fromLoc?.code}` : ''}
                      </option>
                    )
                  })}
                </select>
              </FG>
              <FG label={i === 0 ? 'Qty' : ''}>
                <input
                  type="number"
                  className="form-input"
                  style={{ width: 90, fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'center', borderColor: insufficient ? 'var(--red)' : undefined }}
                  value={line.qty}
                  min={1}
                  onChange={e => updateLine(i, 'qty', parseFloat(e.target.value) || 0)}
                />
              </FG>
              <button
                onClick={() => removeLine(i)}
                disabled={lines.length === 1}
                title="Remove line"
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: lines.length === 1 ? 'not-allowed' : 'pointer', opacity: lines.length === 1 ? 0.4 : 1 }}
              >
                ×
              </button>
            </div>
          )
        })}
        <button onClick={addLine} style={{ marginTop: 6, padding: '6px 14px', borderRadius: 6, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}>+ Add line</button>
        <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>
          Estimated value: <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>{tzs(totalValue)}</span>
        </div>
      </div>

      {/* My recent requests */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>My Recent Requests</div>
        {myRequests.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>No requests yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myRequests.map(req => {
              const st = STATUS_STYLE[req.status] || STATUS_STYLE.pending
              return (
                <div key={req.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--accent)', fontSize: 13 }}>{req.ref}</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.fg, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{st.label}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                      {new Date(req.requested_at).toLocaleDateString()} · {tzs(req.total_value)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{req.from_location?.code}</span>
                    <span style={{ color: 'var(--text3)' }}>→</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{req.to_location?.code}</span>
                    <span style={{ color: 'var(--text3)' }}>·</span>
                    <span>{(req.lines || []).length} item(s)</span>
                  </div>
                  {req.reason && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontStyle: 'italic' }}>"{req.reason}"</div>
                  )}
                  {req.status === 'rejected' && req.rejected_reason && (
                    <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>Rejected: {req.rejected_reason}</div>
                  )}
                  {req.status === 'executed' && req.voucher_id && (
                    <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>Stock moved · voucher posted</div>
                  )}
                  {req.status === 'pending' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                      <button
                        onClick={() => cancelOne(req)}
                        style={{ padding: '4px 10px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
