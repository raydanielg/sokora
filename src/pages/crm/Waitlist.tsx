// ════════════════════════════════════════════════════════════════════════════
// Waitlist.tsx
//
// CRM customer waitlist. Brenda's tool for "I want X, notify me when ready"
// tracking. Distinct from CRMPreorders (which is paid deposits for incoming
// shipments).
//
// Flow:
//   1. + Add to waitlist → modal picks an existing customer (search) and
//      asks for interest text + optional product + priority + notes.
//   2. List view shows all active waitlist rows with filter (status,
//      product, priority, search) and bulk-select.
//   3. Per-row actions: 📱 WA (open templates page with this customer
//      pre-selected), mark notified, mark converted, mark cancelled, edit.
//   4. Bulk actions when 1+ selected: Mark notified, Mark converted, Mark
//      cancelled, Log template as sent (uses log_whatsapp_send_bulk),
//      Open WhatsApp sequentially (one tab per customer, "next" button
//      walks through them).
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'
import { mergeTemplate, buildWhatsAppUrl, type MergeCustomer } from '../../lib/whatsappTemplates'

interface Props {
  onNav?: (p: Page) => void
}

type WaitlistStatus = 'waiting' | 'notified' | 'converted' | 'cancelled'

interface WaitlistRow {
  id: string
  customer_id: string
  customer_name: string
  customer_whatsapp: string | null
  customer_life_stage: string | null
  customer_ambassador_code: string | null
  customer_stage_paused: boolean
  customer_crown_points: number | null
  customer_edd: string | null
  customer_delivery_date: string | null
  interest: string
  product_id: string | null
  product_name: string | null
  priority: number
  status: WaitlistStatus
  notes: string | null
  created_at: string
  notified_at: string | null
  resolved_at: string | null
}

interface TemplateLite {
  id: string
  name: string
  category: string
  body: string
  is_transactional: boolean
}

const STATUS_COLORS: Record<WaitlistStatus, { bg: string; fg: string; label: string }> = {
  waiting:   { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b', label: 'Waiting' },
  notified:  { bg: 'rgba(94,168,162,0.15)', fg: '#5EA8A2', label: 'Notified' },
  converted: { bg: 'rgba(34,197,94,0.15)',  fg: '#22c55e', label: 'Converted' },
  cancelled: { bg: 'rgba(115,115,115,0.15)', fg: '#737373', label: 'Cancelled' },
}

const PRIORITY_LABELS: Record<number, string> = {
  1: 'P1 · VIP',
  2: 'P2 · High',
  3: 'P3 · Normal',
  4: 'P4 · Low',
  5: 'P5 · Best-effort',
}


export default function Waitlist({ onNav }: Props) {
  const { user } = useAuth()

  const [rows, setRows] = useState<WaitlistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<WaitlistStatus | 'all'>('waiting')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  // Add / edit modal
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorRow, setEditorRow] = useState<WaitlistRow | null>(null)

  // Bulk send / log
  const [bulkOpen, setBulkOpen] = useState<'log' | 'send_sequential' | null>(null)
  const [bulkTemplates, setBulkTemplates] = useState<TemplateLite[]>([])
  const [bulkTemplateId, setBulkTemplateId] = useState<string>('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [resourceUrls, setResourceUrls] = useState<Record<string, string>>({})

  // Sequential sender state
  const [seqIndex, setSeqIndex] = useState(0)

  // ─── Load ─────────────────────────────────────────────────────────────
  useEffect(() => { load() }, [])
  useEffect(() => { setSelectedIds(new Set()) }, [filterStatus, search])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('waitlist_active')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })  // FIFO within priority
    if (error) {
      console.error('Waitlist load failed:', error.message)
      setRows([])
    } else {
      setRows((data ?? []) as WaitlistRow[])
    }
    setLoading(false)
  }

  // Lazy-load templates + resources when a bulk action opens
  useEffect(() => {
    if (bulkOpen && bulkTemplates.length === 0) {
      supabase
        .from('whatsapp_templates')
        .select('id, name, category, body, is_transactional')
        .eq('is_active', true)
        .order('category').order('name')
        .then(({ data }) => setBulkTemplates((data ?? []) as TemplateLite[]))
      supabase
        .from('whatsapp_resources')
        .select('slug, public_url')
        .eq('is_public', true).eq('is_active', true)
        .then(({ data }) => {
          const map: Record<string, string> = {}
          for (const r of (data ?? []) as Array<{ slug: string; public_url: string }>) {
            map[r.slug] = r.public_url
          }
          setResourceUrls(map)
        })
    }
  }, [bulkOpen])

  // ─── Filtered view ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false
      if (q) {
        const hay = `${r.customer_name} ${r.interest} ${r.product_name ?? ''} ${r.customer_whatsapp ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, filterStatus, search])

  const selectedRows = useMemo(
    () => filtered.filter(r => selectedIds.has(r.id)),
    [filtered, selectedIds]
  )

  // ─── Helpers ──────────────────────────────────────────────────────────
  const flashToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id))
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(r => r.id)))
  }

  // Per-row: open templates page with this customer pre-selected
  const openWhatsApp = (r: WaitlistRow) => {
    if (!onNav) return
    if (!r.customer_whatsapp) { flashToast('No WhatsApp number on file'); return }
    sessionStorage.setItem('wa_template_target_customer', JSON.stringify({
      id:               r.customer_id,
      name:             r.customer_name,
      whatsapp:         r.customer_whatsapp,
      phone:            r.customer_whatsapp,
      ambassador_code:  r.customer_ambassador_code,
      life_stage:       r.customer_life_stage,
      edd:              r.customer_edd,
      delivery_date:    r.customer_delivery_date,
      crown_points:     r.customer_crown_points,
      stage_paused:     r.customer_stage_paused,
    }))
    onNav('crm-whatsapp-templates')
  }

  // Bulk: change status
  const bulkSetStatus = async (newStatus: WaitlistStatus) => {
    if (selectedIds.size === 0) return
    const verb = newStatus === 'notified' ? 'notified' :
                 newStatus === 'converted' ? 'converted' :
                 newStatus === 'cancelled' ? 'cancelled' : 'waiting'
    if (!confirm(`Mark ${selectedIds.size} entr${selectedIds.size === 1 ? 'y' : 'ies'} as ${verb}?`)) return
    const { error } = await supabase.rpc('waitlist_set_status', {
      p_ids: Array.from(selectedIds),
      p_new_status: newStatus,
    })
    if (error) { flashToast('Status update failed: ' + error.message); return }
    flashToast(`${selectedIds.size} marked ${verb}`)
    setSelectedIds(new Set())
    load()
  }

  // Bulk: log a template as sent + flip status to notified
  const submitBulkLog = async () => {
    if (!bulkTemplateId || selectedIds.size === 0) return
    setBulkSaving(true)

    const customerIds = selectedRows.map(r => r.customer_id)

    const { error: logErr } = await supabase.rpc('log_whatsapp_send_bulk', {
      p_template_id:      bulkTemplateId,
      p_customer_ids:     customerIds,
      p_merged_body:      null,
      p_advance_stage_to: null,  // waitlist doesn't auto-advance customer life stage
    })
    if (logErr) {
      flashToast('Log failed: ' + logErr.message)
      setBulkSaving(false)
      return
    }

    // Flip waitlist entries to "notified"
    const { error: stErr } = await supabase.rpc('waitlist_set_status', {
      p_ids: Array.from(selectedIds),
      p_new_status: 'notified',
    })
    if (stErr) {
      flashToast(`Logged ${selectedIds.size} sends but status update failed: ${stErr.message}`)
    } else {
      flashToast(`${selectedIds.size} marked notified`)
    }

    setBulkSaving(false)
    setBulkOpen(null)
    setBulkTemplateId('')
    setSelectedIds(new Set())
    load()
  }

  // Sequential sender state — open WhatsApp for one customer at a time.
  // Brenda clicks Next after sending each, which (a) opens the next tab,
  // (b) logs the previous one as sent, (c) advances the counter.
  const seqQueue = useMemo(() => selectedRows, [selectedRows])
  const seqTemplate = bulkTemplates.find(t => t.id === bulkTemplateId)

  const seqSendCurrent = async () => {
    const r = seqQueue[seqIndex]
    if (!r || !seqTemplate) return

    const mergeCustomer: MergeCustomer = {
      id: r.customer_id,
      name: r.customer_name,
      whatsapp: r.customer_whatsapp,
      phone: r.customer_whatsapp,
      ambassador_code: r.customer_ambassador_code,
      life_stage: r.customer_life_stage,
      edd: r.customer_edd,
      delivery_date: r.customer_delivery_date,
      crown_points: r.customer_crown_points,
      stage_paused: r.customer_stage_paused,
    }
    const merged = mergeTemplate(seqTemplate.body, mergeCustomer, resourceUrls)
    const url = buildWhatsAppUrl(r.customer_whatsapp, merged.body)
    if (!url) {
      flashToast(`Skipped ${r.customer_name}: invalid phone`)
      setSeqIndex(seqIndex + 1)
      return
    }

    // Log + flip status BEFORE opening, so even if the tab fails to open
    // we still have the audit trail.
    await supabase.rpc('log_whatsapp_send', {
      p_template_id: seqTemplate.id,
      p_customer_id: r.customer_id,
      p_merged_body: merged.body,
    })
    await supabase.rpc('waitlist_set_status', {
      p_ids: [r.id],
      p_new_status: 'notified',
    })

    window.open(url, '_blank', 'noopener,noreferrer')
    setSeqIndex(seqIndex + 1)
  }

  const seqFinish = () => {
    setBulkOpen(null)
    setBulkTemplateId('')
    setSelectedIds(new Set())
    setSeqIndex(0)
    load()
  }

  // ─── Edit / Add ──────────────────────────────────────────────────────
  const openAddNew = () => {
    setEditorRow({
      id: '', customer_id: '', customer_name: '', customer_whatsapp: null,
      customer_life_stage: null, customer_ambassador_code: null,
      customer_stage_paused: false, customer_crown_points: 0,
      customer_edd: null, customer_delivery_date: null,
      interest: '', product_id: null, product_name: null,
      priority: 3, status: 'waiting', notes: null,
      created_at: '', notified_at: null, resolved_at: null,
    })
    setEditorOpen(true)
  }

  const openEdit = (r: WaitlistRow) => {
    setEditorRow({ ...r })
    setEditorOpen(true)
  }

  // Counts for filter chips
  const counts = useMemo(() => {
    const c: Record<WaitlistStatus, number> = { waiting: 0, notified: 0, converted: 0, cancelled: 0 }
    for (const r of rows) c[r.status]++
    return c
  }, [rows])


  // ════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800 }}>
            Waitlist
          </h1>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text3)' }}>
            Customers waiting on something · {counts.waiting} active
          </div>
        </div>
        <button onClick={openAddNew} style={primaryBtn}>+ Add to waitlist</button>
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['waiting', 'notified', 'converted', 'cancelled', 'all'] as const).map(s => {
          const active = filterStatus === s
          const label = s === 'all' ? 'All' : STATUS_COLORS[s as WaitlistStatus].label
          const count = s === 'all' ? rows.length : counts[s as WaitlistStatus]
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '8px 14px', fontSize: 11, fontWeight: 700,
                background: active ? 'var(--accent)' : 'var(--surface2)',
                color: active ? '#000' : 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >{label}<span style={{ opacity: 0.7 }}>({count})</span></button>
          )
        })}
      </div>

      {/* Search */}
      <input
        placeholder="Search name, interest, product, phone…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '10px 14px', fontSize: 13,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, color: 'var(--text)', marginBottom: 16,
        }}
      />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          background: 'var(--accent)', color: '#000',
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, fontWeight: 700, marginBottom: 12, borderRadius: 8,
          flexWrap: 'wrap',
        }}>
          <span style={{ marginRight: 8 }}>{selectedIds.size} selected</span>
          <button onClick={() => setBulkOpen('send_sequential')} style={bulkBtn}>📱 Send via WhatsApp</button>
          <button onClick={() => setBulkOpen('log')} style={bulkBtn}>📋 Log template as sent</button>
          <button onClick={() => bulkSetStatus('notified')}  style={bulkBtn}>Mark notified</button>
          <button onClick={() => bulkSetStatus('converted')} style={bulkBtn}>Mark converted</button>
          <button onClick={() => bulkSetStatus('cancelled')} style={bulkBtn}>Mark cancelled</button>
          <button onClick={() => setSelectedIds(new Set())} style={{ ...bulkBtn, background: 'transparent', border: '1px solid #000' }}>Clear</button>
        </div>
      )}

      {/* Table */}
      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--text3)',
          background: 'var(--card)', border: '1px dashed var(--border)', borderRadius: 12,
        }}>
          {rows.length === 0
            ? 'Nobody on the waitlist yet. Click "+ Add to waitlist".'
            : 'No entries match the current filter.'}
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                <th style={th(40)}>
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every(r => selectedIds.has(r.id))}
                    onChange={toggleAll}
                  />
                </th>
                <th style={th()}>Customer</th>
                <th style={th()}>Interest</th>
                <th style={th()}>Priority</th>
                <th style={th()}>Status</th>
                <th style={th()}>Added</th>
                <th style={th(140)}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelected(r.id)}
                    />
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{r.customer_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      {r.customer_whatsapp || 'no phone'}
                      {r.customer_life_stage && ` · ${r.customer_life_stage}`}
                      {r.customer_stage_paused && <span style={{ color: '#f59e0b', marginLeft: 4 }}>· PAUSED</span>}
                    </div>
                  </td>
                  <td style={td}>
                    <div>{r.interest}</div>
                    {r.product_name && (
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>→ {r.product_name}</div>
                    )}
                  </td>
                  <td style={td}>
                    <span style={{
                      fontSize: 10, fontFamily: 'var(--mono)', padding: '2px 6px',
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 4,
                    }}>{PRIORITY_LABELS[r.priority]}</span>
                  </td>
                  <td style={td}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px',
                      background: STATUS_COLORS[r.status].bg,
                      color: STATUS_COLORS[r.status].fg,
                      borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>{STATUS_COLORS[r.status].label}</span>
                  </td>
                  <td style={{ ...td, fontSize: 10, color: 'var(--text3)' }}>
                    {new Date(r.created_at).toLocaleDateString('en-GB')}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      {r.customer_whatsapp && (
                        <button
                          onClick={() => openWhatsApp(r)}
                          title="Send WhatsApp template"
                          style={waBtn}
                        >📱</button>
                      )}
                      <button onClick={() => openEdit(r)} style={editBtn}>Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / edit modal */}
      {editorOpen && editorRow && (
        <EditorModal
          row={editorRow}
          userId={user?.id ?? null}
          onClose={() => setEditorOpen(false)}
          onSaved={() => { setEditorOpen(false); load() }}
          onError={flashToast}
        />
      )}

      {/* Bulk log modal */}
      {bulkOpen === 'log' && (
        <BulkLogModal
          count={selectedIds.size}
          templates={bulkTemplates}
          templateId={bulkTemplateId}
          setTemplateId={setBulkTemplateId}
          saving={bulkSaving}
          onCancel={() => { setBulkOpen(null); setBulkTemplateId('') }}
          onSubmit={submitBulkLog}
        />
      )}

      {/* Sequential sender modal */}
      {bulkOpen === 'send_sequential' && (
        <SequentialSenderModal
          queue={seqQueue}
          index={seqIndex}
          template={seqTemplate ?? null}
          templates={bulkTemplates}
          templateId={bulkTemplateId}
          setTemplateId={setBulkTemplateId}
          resourceUrls={resourceUrls}
          onSendCurrent={seqSendCurrent}
          onSkip={() => setSeqIndex(seqIndex + 1)}
          onFinish={seqFinish}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          background: 'var(--card)', border: '1px solid var(--accent)',
          borderRadius: 8, padding: '10px 16px', fontSize: 12,
          color: 'var(--text)', fontWeight: 700,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>{toast}</div>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// Add / Edit modal — with customer picker (search existing) and inline
// quick-add if no match. Includes product picker (search products), priority,
// interest text, notes.
// ════════════════════════════════════════════════════════════════════════════

function EditorModal({ row, userId, onClose, onSaved, onError }: {
  row: WaitlistRow
  userId: string | null
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const isEdit = !!row.id
  const [interest, setInterest] = useState(row.interest)
  const [priority, setPriority] = useState(row.priority)
  const [status, setStatus] = useState<WaitlistStatus>(row.status)
  const [notes, setNotes] = useState(row.notes ?? '')
  const [productId, setProductId] = useState<string | null>(row.product_id)
  const [productName, setProductName] = useState<string | null>(row.product_name)

  // Customer picker — only used when adding new
  const [customerId, setCustomerId] = useState<string | null>(isEdit ? row.customer_id : null)
  const [customerName, setCustomerName] = useState<string>(isEdit ? row.customer_name : '')
  const [customerSearchQ, setCustomerSearchQ] = useState('')
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; name: string; whatsapp: string | null }>>([])
  const [customerSearching, setCustomerSearching] = useState(false)

  // Product picker
  const [productSearchQ, setProductSearchQ] = useState('')
  const [productResults, setProductResults] = useState<Array<{ id: string; name: string }>>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Customer search
  useEffect(() => {
    if (isEdit) return
    const q = customerSearchQ.trim()
    if (q.length < 2) { setCustomerResults([]); return }
    let cancelled = false
    setCustomerSearching(true)
    const run = async () => {
      const safe = q.replace(/[,%]/g, ' ').trim()
      if (!safe) { setCustomerResults([]); setCustomerSearching(false); return }
      const pattern = `%${safe}%`
      const [byName, byPhone] = await Promise.all([
        supabase.from('customers').select('id, name, whatsapp').ilike('name', pattern).limit(10),
        supabase.from('customers').select('id, name, whatsapp').ilike('whatsapp', pattern).limit(10),
      ])
      const seen = new Set<string>()
      const merged: Array<{ id: string; name: string; whatsapp: string | null }> = []
      for (const res of [byName.data, byPhone.data]) {
        for (const r of (res ?? []) as any[]) {
          if (!seen.has(r.id)) { seen.add(r.id); merged.push(r) }
        }
      }
      if (!cancelled) { setCustomerResults(merged.slice(0, 10)); setCustomerSearching(false) }
    }
    run()
    return () => { cancelled = true }
  }, [customerSearchQ, isEdit])

  // Product search
  useEffect(() => {
    const q = productSearchQ.trim()
    if (q.length < 2) { setProductResults([]); return }
    let cancelled = false
    const run = async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name')
        .ilike('name', `%${q}%`)
        .eq('is_active', true)
        .limit(10)
      if (!cancelled) setProductResults((data ?? []) as any)
    }
    run()
    return () => { cancelled = true }
  }, [productSearchQ])

  const save = async () => {
    setError(null)
    if (!customerId) { setError('Pick a customer'); return }
    if (!interest.trim()) { setError('Interest is required'); return }

    setSaving(true)

    if (isEdit) {
      const { error } = await supabase
        .from('customer_waitlist')
        .update({
          interest: interest.trim(),
          priority,
          status,
          notes: notes.trim() || null,
          product_id: productId,
        })
        .eq('id', row.id)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase
        .from('customer_waitlist')
        .insert({
          customer_id: customerId,
          interest: interest.trim(),
          priority,
          status,
          notes: notes.trim() || null,
          product_id: productId,
          created_by: userId,
        })
      if (error) { setError(error.message); setSaving(false); return }
    }

    setSaving(false)
    onSaved()
    onError(isEdit ? 'Updated' : 'Added to waitlist')
  }

  return (
    <ModalShell onClose={() => !saving && onClose()}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>
        {isEdit ? 'Edit waitlist entry' : 'Add to waitlist'}
      </div>

      {/* Customer picker (only when adding) */}
      {!isEdit && (
        <div style={{ marginBottom: 14 }}>
          <label style={modalLabel}>Customer</label>
          {customerId ? (
            <div style={pickedRow}>
              <span style={{ fontWeight: 700 }}>{customerName}</span>
              <button onClick={() => { setCustomerId(null); setCustomerName('') }} style={chipBtn}>Change</button>
            </div>
          ) : (
            <>
              <input
                style={modalInput}
                placeholder="Search by name or phone…"
                value={customerSearchQ}
                onChange={e => setCustomerSearchQ(e.target.value)}
                autoFocus
              />
              {customerSearching && <div style={hintText}>Searching…</div>}
              {!customerSearching && customerSearchQ.trim().length >= 2 && customerResults.length === 0 && (
                <div style={hintText}>No customers match. Add the customer via the Customers page first, then come back here.</div>
              )}
              {customerResults.map(c => (
                <div
                  key={c.id}
                  onClick={() => { setCustomerId(c.id); setCustomerName(c.name); setCustomerSearchQ('') }}
                  style={resultRow}
                >
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{c.whatsapp || 'no phone'}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Interest */}
      <div style={{ marginBottom: 14 }}>
        <label style={modalLabel}>Interest</label>
        <input
          style={modalInput}
          value={interest}
          onChange={e => setInterest(e.target.value)}
          placeholder="e.g. Maternity Pants size M, next breastfeeding workshop…"
          maxLength={200}
        />
      </div>

      {/* Optional product */}
      <div style={{ marginBottom: 14 }}>
        <label style={modalLabel}>Linked product (optional)</label>
        {productId && productName ? (
          <div style={pickedRow}>
            <span style={{ fontWeight: 700 }}>{productName}</span>
            <button onClick={() => { setProductId(null); setProductName(null) }} style={chipBtn}>Change</button>
          </div>
        ) : (
          <>
            <input
              style={modalInput}
              placeholder="Search products…"
              value={productSearchQ}
              onChange={e => setProductSearchQ(e.target.value)}
            />
            {productResults.map(p => (
              <div
                key={p.id}
                onClick={() => { setProductId(p.id); setProductName(p.name); setProductSearchQ('') }}
                style={resultRow}
              >{p.name}</div>
            ))}
          </>
        )}
      </div>

      {/* Priority + status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={modalLabel}>Priority</label>
          <select
            style={modalInput}
            value={priority}
            onChange={e => setPriority(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map(p => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={modalLabel}>Status</label>
          <select
            style={modalInput}
            value={status}
            onChange={e => setStatus(e.target.value as WaitlistStatus)}
          >
            <option value="waiting">Waiting</option>
            <option value="notified">Notified</option>
            <option value="converted">Converted</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 18 }}>
        <label style={modalLabel}>Notes (optional)</label>
        <textarea
          style={{ ...modalInput, height: 60, fontFamily: 'inherit', resize: 'vertical' }}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Size details, delivery preferences, special requests…"
        />
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onClose} disabled={saving} style={cancelBtn}>Cancel</button>
        <button onClick={save} disabled={saving} style={primaryBtn}>
          {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Add to waitlist')}
        </button>
      </div>
    </ModalShell>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// Bulk log modal (mark-as-already-sent backfill)
// ════════════════════════════════════════════════════════════════════════════

function BulkLogModal({ count, templates, templateId, setTemplateId, saving, onCancel, onSubmit }: {
  count: number
  templates: TemplateLite[]
  templateId: string
  setTemplateId: (id: string) => void
  saving: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <ModalShell onClose={() => !saving && onCancel()}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
        Log template as sent
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>
        Mark this template as already sent to {count} customer{count === 1 ? '' : 's'} on the waitlist (e.g. you messaged them from your personal WhatsApp). Their waitlist status will flip to "notified".
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={modalLabel}>Template</label>
        <select style={modalInput} value={templateId} onChange={e => setTemplateId(e.target.value)}>
          <option value="">— pick a template —</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>[{t.category}] {t.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} disabled={saving} style={cancelBtn}>Cancel</button>
        <button onClick={onSubmit} disabled={saving || !templateId} style={primaryBtn}>
          {saving ? 'Logging…' : `Log for ${count}`}
        </button>
      </div>
    </ModalShell>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// Sequential sender modal — opens WhatsApp Web for one customer at a time.
// Brenda picks a template, then clicks "Send & next" which (a) logs +
// flips status, (b) opens wa.me in a new tab, (c) advances to the next.
// ════════════════════════════════════════════════════════════════════════════

function SequentialSenderModal({
  queue, index, template, templates, templateId, setTemplateId,
  resourceUrls, onSendCurrent, onSkip, onFinish,
}: {
  queue: WaitlistRow[]
  index: number
  template: TemplateLite | null
  templates: TemplateLite[]
  templateId: string
  setTemplateId: (id: string) => void
  resourceUrls: Record<string, string>
  onSendCurrent: () => void
  onSkip: () => void
  onFinish: () => void
}) {
  const current = queue[index]
  const isDone = index >= queue.length

  const preview = useMemo(() => {
    if (!current || !template) return null
    return mergeTemplate(template.body, {
      id: current.customer_id,
      name: current.customer_name,
      whatsapp: current.customer_whatsapp,
      phone: current.customer_whatsapp,
      ambassador_code: current.customer_ambassador_code,
      life_stage: current.customer_life_stage,
      edd: current.customer_edd,
      delivery_date: current.customer_delivery_date,
      crown_points: current.customer_crown_points,
      stage_paused: current.customer_stage_paused,
    }, resourceUrls)
  }, [current, template, resourceUrls])

  const blocked = (() => {
    if (!current) return null
    if (!template) return 'Pick a template to start'
    if (current.customer_stage_paused && !template.is_transactional) {
      return 'Profile is paused (sensitive exit). Pick a transactional template or skip.'
    }
    if (!current.customer_whatsapp) return 'No WhatsApp number on file. Skip.'
    return null
  })()

  return (
    <ModalShell onClose={onFinish}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
        Send via WhatsApp · sequential
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>
        WhatsApp Web opens one chat at a time. After sending each, click "Send & next" to advance.
        {queue.length > 0 && ` · ${index} of ${queue.length} done`}
      </div>

      {/* Template picker (lives at top so changing it updates preview) */}
      <div style={{ marginBottom: 14 }}>
        <label style={modalLabel}>Template</label>
        <select style={modalInput} value={templateId} onChange={e => setTemplateId(e.target.value)}>
          <option value="">— pick a template —</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>[{t.category}] {t.name}</option>
          ))}
        </select>
      </div>

      {!isDone && current && (
        <>
          <div style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 12, marginBottom: 12,
          }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
              Next ({index + 1} / {queue.length})
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{current.customer_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {current.customer_whatsapp || 'no phone'}
              {current.customer_stage_paused && <span style={{ color: '#f59e0b', marginLeft: 6 }}>· PAUSED</span>}
              {' · '}
              <span style={{ fontStyle: 'italic' }}>{current.interest}</span>
            </div>
          </div>

          {preview && (
            <div style={{
              background: '#e7f7ed', border: '1px solid #5EA8A2',
              borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12,
              whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto',
              color: '#222', lineHeight: 1.5, fontFamily: 'system-ui, sans-serif',
            }}>{preview.body}</div>
          )}

          {blocked && <div style={errorBox}>{blocked}</div>}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <button onClick={onFinish} style={cancelBtn}>Stop</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onSkip} style={cancelBtn}>Skip</button>
              <button onClick={onSendCurrent} disabled={!!blocked} style={{
                ...primaryBtn,
                opacity: blocked ? 0.5 : 1,
                cursor: blocked ? 'not-allowed' : 'pointer',
              }}>📱 Send & next</button>
            </div>
          </div>
        </>
      )}

      {isDone && (
        <>
          <div style={{
            padding: 20, textAlign: 'center', fontSize: 13,
            background: 'var(--surface2)', borderRadius: 8, marginBottom: 12,
          }}>
            ✓ All {queue.length} customer{queue.length === 1 ? '' : 's'} done
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onFinish} style={primaryBtn}>Close</button>
          </div>
        </>
      )}
    </ModalShell>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// Shared shell + style constants
// ════════════════════════════════════════════════════════════════════════════

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, width: 520, maxHeight: '90vh', overflowY: 'auto',
        }}
      >{children}</div>
    </div>
  )
}

const th = (w?: number): React.CSSProperties => ({
  padding: '10px 12px', fontSize: 10, fontWeight: 700,
  color: 'var(--text3)', fontFamily: 'var(--mono)',
  textTransform: 'uppercase', letterSpacing: 1,
  width: w,
})
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }
const modalLabel: React.CSSProperties = {
  fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)',
  textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4,
}
const modalInput: React.CSSProperties = {
  width: '100%', background: 'var(--surface)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 6,
  padding: '8px 10px', fontSize: 13, fontFamily: 'var(--mono)',
}
const primaryBtn: React.CSSProperties = {
  padding: '8px 16px', fontSize: 12, fontWeight: 700,
  background: 'var(--accent)', border: 'none',
  borderRadius: 6, color: '#000', cursor: 'pointer',
}
const cancelBtn: React.CSSProperties = {
  padding: '8px 14px', fontSize: 12, fontWeight: 700,
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)', cursor: 'pointer',
}
const chipBtn: React.CSSProperties = {
  padding: '4px 10px', fontSize: 10, fontFamily: 'var(--mono)',
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)', cursor: 'pointer',
}
const bulkBtn: React.CSSProperties = {
  background: '#000', color: 'var(--accent)', border: 'none',
  borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
}
const waBtn: React.CSSProperties = {
  background: '#25D36622', border: '1px solid #25D366',
  borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
  fontSize: 11, color: '#25D366', fontWeight: 700,
}
const editBtn: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
  fontSize: 11, color: 'var(--text3)',
}
const pickedRow: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '8px 10px',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}
const resultRow: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderTop: 'none', padding: '8px 10px', fontSize: 12, cursor: 'pointer',
}
const hintText: React.CSSProperties = {
  fontSize: 10, color: 'var(--text3)', padding: 6,
}
const errorBox: React.CSSProperties = {
  padding: '10px 12px', marginBottom: 12,
  background: 'rgba(239,68,68,0.10)',
  border: '1px solid rgba(239,68,68,0.4)',
  borderRadius: 6, fontSize: 11, color: '#ef4444', lineHeight: 1.5,
}
