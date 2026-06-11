// ════════════════════════════════════════════════════════════════════════════
// CustomerContextSection.tsx
//
// A pluggable section for the Cash Sale form that captures pregnancy/baby/TTC
// context at point of sale. Optional — never blocks the sale.
//
// Three render states based on what's already known about the customer:
//
//   1. NEW CUSTOMER (no record yet)        → soft inline radio prompt
//   2. RETURNING, no context captured yet  → soft inline radio prompt (same)
//   3. RETURNING, context already captured → read-only summary + Edit button
//
// All three lead to the same outcome: a small payload (`ctx`) the parent form
// passes through to cashSalePost.ts on submit. Anything not captured at the
// till is left as `context_status='pending'` and surfaces in the back-office
// queue (customer_context_queue view) for the CRM hire to follow up.
//
// Customer context never blocks posting. Skip = quietly leave as pending.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'

export type StagePath = 'ttc' | 'pregnant' | 'postpartum' | null

export interface CustomerContext {
  // Set if the cashier captured something this sale.
  // Null/undefined fields are not written.
  stage_path?:    StagePath
  ttc_duration?:  string | null   // 'lt_3m' | '3_6m' | '6_12m' | '1_2y' | '2y_plus'
  edd?:           string | null   // ISO date for pregnancy
  delivery_date?: string | null   // ISO date for postpartum
  notes?:         string | null   // only when editing existing record
  declined?:      boolean         // customer explicitly declined to share
}

interface ExistingContext {
  ttc_duration: string | null
  edd: string | null
  delivery_date: string | null
  context_status: string | null   // 'pending' | 'captured' | 'declined'
  internal_notes?: string | null
}

interface Props {
  // Null = new customer, no record yet (cashier hasn't selected one)
  existing: ExistingContext | null
  // Called every time the user changes anything; parent stores in form state
  onChange: (ctx: CustomerContext) => void
}

const TTC_OPTIONS: { value: string; label: string }[] = [
  { value: 'lt_3m',   label: 'Less than 3 months' },
  { value: '3_6m',    label: '3 to 6 months' },
  { value: '6_12m',   label: '6 to 12 months' },
  { value: '1_2y',    label: '1 to 2 years' },
  { value: '2y_plus', label: 'Over 2 years' },
]

const TTC_LABELS: Record<string, string> = Object.fromEntries(
  TTC_OPTIONS.map(o => [o.value, o.label])
)

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CustomerContextSection({ existing, onChange }: Props) {
  // Local state for the form
  const [stage, setStage] = useState<StagePath>(null)
  const [ttcDuration, setTtcDuration] = useState<string>('')
  const [edd, setEdd] = useState<string>('')
  const [deliveryDate, setDeliveryDate] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [editing, setEditing] = useState<boolean>(false)

  const hasExisting = !!existing && existing.context_status === 'captured' && (
    existing.ttc_duration || existing.edd || existing.delivery_date
  )

  // When the customer changes (parent passes a new `existing`), reset local
  // state. Pre-fill if editing.
  useEffect(() => {
    setStage(null)
    setTtcDuration('')
    setEdd('')
    setDeliveryDate('')
    setNotes('')
    setEditing(false)
  }, [existing?.context_status, existing?.edd, existing?.delivery_date, existing?.ttc_duration])

  // Bubble changes up to parent
  useEffect(() => {
    if (!stage && !editing) {
      onChange({})
      return
    }
    onChange({
      stage_path:    stage,
      ttc_duration:  stage === 'ttc' ? ttcDuration : null,
      edd:           stage === 'pregnant' ? edd : null,
      delivery_date: stage === 'postpartum' ? deliveryDate : null,
      notes:         editing ? (notes || null) : undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, ttcDuration, edd, deliveryDate, notes, editing])

  // ─── State 3: existing data, read-only summary ──────────────────────────
  if (hasExisting && !editing) {
    return (
      <div style={summaryPanelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={labelStyle}>Customer Context</div>
            <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600 }}>
              {summaryFor(existing)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              // Pre-fill the editor with existing values
              if (existing!.ttc_duration) {
                setStage('ttc'); setTtcDuration(existing!.ttc_duration)
              } else if (existing!.delivery_date) {
                setStage('postpartum'); setDeliveryDate(existing!.delivery_date)
              } else if (existing!.edd) {
                setStage('pregnant'); setEdd(existing!.edd)
              }
              setNotes(existing!.internal_notes || '')
              setEditing(true)
            }}
            style={editButtonStyle}
          >Edit</button>
        </div>
      </div>
    )
  }

  // ─── States 1, 2, and 3-being-edited: capture or recapture ───────────────
  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div style={labelStyle}>Customer Context (optional)</div>
        {editing && (
          <button
            type="button"
            onClick={() => { setStage(null); setEditing(false); }}
            style={cancelLinkStyle}
          >Cancel</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <StageButton
          active={stage === 'ttc'}
          icon="🌱"
          label="TTC (Trying)"
          onClick={() => setStage('ttc')}
        />
        <StageButton
          active={stage === 'pregnant'}
          icon="🤰"
          label="Pregnant"
          onClick={() => setStage('pregnant')}
        />
        <StageButton
          active={stage === 'postpartum'}
          icon="👶"
          label="Postpartum"
          onClick={() => setStage('postpartum')}
        />
        {!editing && (
          <StageButton
            active={false}
            icon="⏭"
            label="Skip"
            onClick={() => setStage(null)}
            secondary
          />
        )}
      </div>

      {/* Reveal the right input based on path */}
      {stage === 'ttc' && (
        <div>
          <div style={subLabelStyle}>How long has she been trying?</div>
          <select
            value={ttcDuration}
            onChange={e => setTtcDuration(e.target.value)}
            style={selectStyle}
          >
            <option value="">— Select —</option>
            {TTC_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {stage === 'pregnant' && (
        <div>
          <div style={subLabelStyle}>Expected delivery date</div>
          <input
            type="date"
            value={edd}
            onChange={e => setEdd(e.target.value)}
            style={selectStyle}
          />
        </div>
      )}

      {stage === 'postpartum' && (
        <div>
          <div style={subLabelStyle}>Baby's date of birth</div>
          <input
            type="date"
            value={deliveryDate}
            onChange={e => setDeliveryDate(e.target.value)}
            style={selectStyle}
          />
        </div>
      )}

      {/* Notes — only when editing an existing record. Comprehensive notes
          are a back-office responsibility per the CRM workflow. */}
      {editing && stage && (
        <div style={{ marginTop: 12 }}>
          <div style={subLabelStyle}>Notes (optional, visible to staff only)</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. preferences, allergies, follow-up reminders"
            rows={2}
            style={{ ...selectStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
      )}

      <div style={hintStyle}>
        Skipping is fine — anything not captured here flows to the CRM follow-up queue.
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function summaryFor(ctx: ExistingContext): string {
  if (ctx.ttc_duration) return `🌱 TTC · ${TTC_LABELS[ctx.ttc_duration] || ctx.ttc_duration}`
  if (ctx.delivery_date) {
    const months = Math.floor((Date.now() - new Date(ctx.delivery_date).getTime()) / (30 * 24 * 60 * 60 * 1000))
    return `👶 Postpartum · baby ${months} mo · DOB ${formatDate(ctx.delivery_date)}`
  }
  if (ctx.edd) {
    const days = Math.ceil((new Date(ctx.edd).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    if (days > 0) return `🤰 Pregnant · EDD ${formatDate(ctx.edd)} (${days} days)`
    const months = Math.floor(-days / 30)
    return `👶 Postpartum · baby ~${months} mo (EDD-derived)`
  }
  return '—'
}

// ─── Sub-components ───────────────────────────────────────────────────────

function StageButton({
  active, icon, label, onClick, secondary,
}: { active: boolean; icon: string; label: string; onClick: () => void; secondary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 12px',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent-dim)' : (secondary ? 'transparent' : 'var(--surface2)'),
        color: active ? 'var(--accent)' : (secondary ? 'var(--text3)' : 'var(--text)'),
        borderRadius: 8,
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </button>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  padding: 12,
  marginTop: 10,
}

const summaryPanelStyle: React.CSSProperties = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  padding: 12,
  marginTop: 10,
}

const labelStyle: React.CSSProperties = {
  fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 1,
}

const subLabelStyle: React.CSSProperties = {
  fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)',
}

const editButtonStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text)',
  cursor: 'pointer',
}

const cancelLinkStyle: React.CSSProperties = {
  background: 'transparent', border: 'none',
  color: 'var(--text3)', fontSize: 11,
  cursor: 'pointer', padding: 0,
  textDecoration: 'underline',
}

const hintStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--text3)', marginTop: 10, fontStyle: 'italic',
}
