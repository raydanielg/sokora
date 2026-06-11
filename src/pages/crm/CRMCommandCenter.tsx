// ════════════════════════════════════════════════════════════════════════════
// CRMCommandCenter.tsx
//
// Brenda's daily home base: a single prioritised action queue of mamas she
// should reach out to, with a small KPI strip at the top and filters above
// the list.
//
// Architecture: the prioritisation logic lives in the SQL view crm_action_queue
// (migration 011), which pre-computes priority, reason_code, and the within-
// priority sort key. This file just renders rows.
//
// Priority order (set in the view):
//   1. Just graduated      (life_stage changed in last 48 hours)
//   2. Stage-stuck         (longer than typical stage duration)
//   3. Unclassified active (life_stage NULL, visit_count >= 2)
//   4. Quiet               (days_since_last > 60)
//
// Paused profiles never enter the queue. Snoozed customers are filtered out
// until their snooze date passes. The "Skip" action uses snooze_customer()
// RPC with a Brenda-picked duration (3/7/14/30 days).
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tzs } from '../../lib/utils'
import type { Page } from '../../lib/types'
import Toast from '../../components/Toast'

interface Props {
  onNav: (p: Page) => void
  onOpenCustomer?: (customerId: string) => void
}

// ─── Types ──────────────────────────────────────────────────────────────────

type ReasonCode = 'graduated' | 'stage_stuck' | 'unclassified' | 'quiet'
type LifeStage = 'ttc' | 'pregnancy' | 'postpartum' | 'parenting' | null

interface QueueRow {
  customer_id: string
  customer_number: string | null
  name: string
  whatsapp: string | null
  life_stage: LifeStage
  lifecycle_stage: string | null
  previous_life_stage: LifeStage
  days_to_edd: number | null
  baby_age_months: number | null
  last_visit: string | null
  days_since_last: number | null
  visit_count: number
  lifetime_value: number
  crown_points: number
  owner_user_id: string | null
  days_in_stage: number | null
  current_stage_entered_at: string | null
  priority: number
  reason_code: ReasonCode
}

interface AppUser {
  id: string
  full_name: string | null
  email: string | null
}

interface Kpis {
  active_mamas: number
  paused_profiles: number
  unclassified: number
  just_graduated: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const REASON_META: Record<ReasonCode, { label: string; emoji: string; bg: string; color: string }> = {
  graduated:    { label: 'Just graduated',   emoji: '🎉', bg: 'rgba(94,168,162,.18)', color: '#5EA8A2' },
  stage_stuck:  { label: 'Stage-stuck',      emoji: '⚠️', bg: 'rgba(245,158,11,.18)', color: '#f59e0b' },
  unclassified: { label: 'Needs classifying', emoji: '❓', bg: 'rgba(167,139,250,.18)', color: '#a78bfa' },
  quiet:        { label: 'Quiet',            emoji: '💤', bg: 'rgba(107,114,128,.18)', color: '#9ca3af' },
}

const STAGE_LABEL: Record<NonNullable<LifeStage>, string> = {
  ttc:        'TTC',
  pregnancy:  'Pregnancy',
  postpartum: 'Postpartum',
  parenting:  'Parenting',
}

const SNOOZE_OPTIONS = [
  { days: 3,  label: '3 days' },
  { days: 7,  label: '7 days' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
]

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CRMCommandCenter({ onNav, onOpenCustomer }: Props) {
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [kpis, setKpis] = useState<Kpis>({ active_mamas: 0, paused_profiles: 0, unclassified: 0, just_graduated: 0 })
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [ownerFilter, setOwnerFilter] = useState<string>('all')        // 'all' | userId | 'unowned'
  const [reasonFilter, setReasonFilter] = useState<'all' | ReasonCode>('all')

  // Snooze menu state
  const [snoozeMenuFor, setSnoozeMenuFor] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => { loadAll() }, [refreshNonce])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadQueue(), loadKpis(), loadUsers()])
    setLoading(false)
  }

  const loadQueue = async () => {
    // The view does the heavy lifting; we just SELECT. We don't filter by
    // owner here at the DB level because the user can switch filters often.
    const { data, error } = await supabase
      .from('crm_action_queue')
      .select('*')
      .limit(500)
    if (error) {
      setToastType('error')
      setToast(`Failed to load queue: ${error.message}`)
      return
    }
    setQueue((data ?? []) as QueueRow[])
  }

  const loadKpis = async () => {
    // Active mamas and paused profiles are universe-level counts that don't
    // depend on snooze state. Just graduated and Needs classifying are
    // queue-level counts — we derive them from crm_action_queue so they
    // stay in sync with what's actually actionable.
    const [active, paused, queueGroups] = await Promise.all([
      // Active: classified, not paused
      supabase.from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('customer_type', 'cash').eq('is_active', true).eq('stage_paused', false)
        .not('life_stage', 'is', null),
      // Paused profiles
      supabase.from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('customer_type', 'cash').eq('is_active', true).eq('stage_paused', true),
      // Queue groups — counts per reason_code, already filtered for snoozes
      supabase.from('crm_action_queue').select('reason_code'),
    ])

    const groups = (queueGroups.data ?? []) as Array<{ reason_code: string }>
    const unclassified = groups.filter(g => g.reason_code === 'unclassified').length
    const graduated    = groups.filter(g => g.reason_code === 'graduated').length

    setKpis({
      active_mamas:    active.count ?? 0,
      paused_profiles: paused.count ?? 0,
      unclassified,
      just_graduated:  graduated,
    })
  }

  const loadUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name')
    if (data) setUsers(data as AppUser[])
  }

  // ── Filtering (client-side, queue is already small after view filtering) ──
  const filtered = useMemo(() => {
    return queue.filter(row => {
      if (reasonFilter !== 'all' && row.reason_code !== reasonFilter) return false
      if (ownerFilter === 'unowned' && row.owner_user_id !== null) return false
      if (ownerFilter !== 'all' && ownerFilter !== 'unowned' && row.owner_user_id !== ownerFilter) return false
      return true
    })
  }, [queue, reasonFilter, ownerFilter])

  // ── Snooze handler ────────────────────────────────────────────────────────
  const handleSnooze = async (customerId: string, days: number) => {
    setSnoozeMenuFor(null)

    // Optimistically remove the row from local state so the UI feels instant.
    // Even if the server write somehow fails, the next page refresh will
    // bring her back since the view is the source of truth.
    setQueue(prev => prev.filter(r => r.customer_id !== customerId))

    const { error } = await supabase.rpc('snooze_customer', {
      p_customer_id: customerId,
      p_days:        days,
    })
    if (error) {
      setToastType('error')
      setToast(`Snooze failed: ${error.message}`)
      // Roll back the optimistic removal by reloading
      loadAll()
      return
    }
    setToastType('success')
    setToast(`Snoozed for ${days} day${days === 1 ? '' : 's'}`)
    // Refresh KPIs in background; the queue is already updated optimistically.
    loadKpis()
  }

  // ── Open customer profile ────────────────────────────────────────────────
  const handleOpen = (customerId: string) => {
    if (onOpenCustomer) {
      onOpenCustomer(customerId)
    } else {
      // Fallback: navigate to customers list, which doesn't accept a specific
      // ID. Best we can do without a navigation system that supports params.
      onNav('crm-customers')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>

      {/* ─── Header ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            CRM Command Center
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Today's prioritised action queue. Paused profiles never appear here.
          </div>
        </div>
        <button
          onClick={() => setRefreshNonce(n => n + 1)}
          style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600,
            color: 'var(--text3)', cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {/* ─── KPI Strip ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <Kpi label="Active mamas" value={kpis.active_mamas.toString()} hint="classified, not paused" />
        <Kpi label="Just graduated" value={kpis.just_graduated.toString()} hint="last 7 days" accent="#5EA8A2" />
        <Kpi label="Needs classifying" value={kpis.unclassified.toString()} hint="2+ visits, no stage" accent="#a78bfa" />
        <Kpi label="Paused profiles" value={kpis.paused_profiles.toString()} hint="sensitive exit" accent="#ec4899" />
      </div>

      {/* ─── Filters ───────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '10px 12px', marginBottom: 12,
      }}>
        <label style={labelStyle}>Owner</label>
        <select
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
          style={inputStyle}
        >
          <option value="all">All</option>
          <option value="unowned">Unowned</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
          ))}
        </select>

        <label style={{ ...labelStyle, marginLeft: 14 }}>Reason</label>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'graduated', 'stage_stuck', 'unclassified', 'quiet'] as const).map(r => (
            <button
              key={r}
              onClick={() => setReasonFilter(r)}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                borderRadius: 4, cursor: 'pointer',
                border: '1px solid ' + (reasonFilter === r ? 'var(--accent)' : 'var(--border)'),
                background: reasonFilter === r ? 'var(--accent)' : 'transparent',
                color: reasonFilter === r ? '#fff' : 'var(--text3)',
              }}
            >
              {r === 'all' ? 'All' : REASON_META[r].label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          {filtered.length} in queue
        </div>
      </div>

      {/* ─── Queue ─────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
          Loading queue…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13,
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
          🎉 Inbox zero. No actions needed right now.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(row => (
            <ActionRow
              key={row.customer_id}
              row={row}
              users={users}
              onOpen={() => handleOpen(row.customer_id)}
              snoozeMenuOpen={snoozeMenuFor === row.customer_id}
              onSnoozeToggle={() => setSnoozeMenuFor(prev => prev === row.customer_id ? null : row.customer_id)}
              onSnoozePick={days => handleSnooze(row.customer_id, days)}
            />
          ))}
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}

// ─── KPI tile ───────────────────────────────────────────────────────────────
function Kpi({ label, value, hint, accent }: {
  label: string; value: string; hint?: string; accent?: string
}) {
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text3)' }}>
        {label}
      </div>
      <div style={{
        fontSize: 24, fontWeight: 800, marginTop: 4, color: accent ?? 'var(--text)',
        fontFamily: 'var(--mono)',
      }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

// ─── Action queue row ───────────────────────────────────────────────────────
function ActionRow({
  row, users, onOpen, snoozeMenuOpen, onSnoozeToggle, onSnoozePick,
}: {
  row: QueueRow
  users: AppUser[]
  onOpen: () => void
  snoozeMenuOpen: boolean
  onSnoozeToggle: () => void
  onSnoozePick: (days: number) => void
}) {
  const meta = REASON_META[row.reason_code]
  const owner = users.find(u => u.id === row.owner_user_id)

  // Build the "why" sub-text
  let whyText: string
  switch (row.reason_code) {
    case 'graduated': {
      const from = row.previous_life_stage ? STAGE_LABEL[row.previous_life_stage] : 'Unclassified'
      const to   = row.life_stage ? STAGE_LABEL[row.life_stage] : 'Unclassified'
      const hours = row.current_stage_entered_at
        ? Math.floor((Date.now() - new Date(row.current_stage_entered_at).getTime()) / 3_600_000)
        : null
      whyText = `${from} → ${to}${hours !== null ? ` · ${hours}h ago` : ''}`
      break
    }
    case 'stage_stuck':
      whyText = `${row.life_stage ? STAGE_LABEL[row.life_stage] : 'Unknown'} for ${row.days_in_stage ?? '?'} days`
      break
    case 'unclassified':
      whyText = `${row.visit_count} visits, no stage`
      break
    case 'quiet':
      whyText = `${row.days_since_last ?? '?'} days quiet · ${row.life_stage ? STAGE_LABEL[row.life_stage] : ''}`
      break
  }

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', cursor: 'pointer',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 8, transition: 'background .12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface3, #1f1f24)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface2)')}
    >
      {/* Reason pill */}
      <div style={{
        background: meta.bg, color: meta.color,
        fontSize: 10, fontWeight: 700, padding: '3px 8px',
        borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5,
        minWidth: 130, textAlign: 'center', fontFamily: 'var(--mono)',
      }}>
        {meta.emoji} {meta.label}
      </div>

      {/* Customer + why */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          {row.name}
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text3)', marginLeft: 8, fontFamily: 'var(--mono)' }}>
            {row.customer_number ?? ''}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          {whyText}
        </div>
      </div>

      {/* WhatsApp + last visit */}
      <div style={{ textAlign: 'right', minWidth: 90 }}>
        {row.whatsapp && (
          <div style={{ fontSize: 11, color: '#25D366', fontFamily: 'var(--mono)' }}>
            {row.whatsapp}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
          {row.last_visit ? `Last: ${row.last_visit}` : 'No visits'}
        </div>
      </div>

      {/* Owner */}
      <div style={{ minWidth: 80, textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Owner
        </div>
        <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 2 }}>
          {owner ? (owner.full_name?.split(' ')[0] || owner.email) : 'Unowned'}
        </div>
      </div>

      {/* LTV */}
      <div style={{ minWidth: 80, textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          LTV
        </div>
        <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', marginTop: 2 }}>
          {tzs(row.lifetime_value)}
        </div>
      </div>

      {/* Snooze button */}
      <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button
          onClick={onSnoozeToggle}
          title="Skip this mama for a while"
          style={{
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 600,
            color: 'var(--text3)', cursor: 'pointer',
          }}
        >
          Skip
        </button>
        {snoozeMenuOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 6, padding: 4, zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,.4)', minWidth: 110,
          }}>
            {SNOOZE_OPTIONS.map(opt => (
              <button
                key={opt.days}
                onClick={() => onSnoozePick(opt.days)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '6px 10px', fontSize: 11, color: 'var(--text)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderRadius: 4,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Skip {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Local styles ───────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
  textTransform: 'uppercase', color: 'var(--text3)',
}
const inputStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--text)',
}
