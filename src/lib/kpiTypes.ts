/**
 * KPI Scorecard module — shared types.
 * Mirrors tables in migrations 009_kpi_scorecards.sql and 010_kpi_gates.sql.
 */
import type { Direction, GateScope } from './kpiScoring'

export type KpiValueType = 'percent' | 'currency' | 'number'
export type AssignmentStatus = 'draft' | 'self_rated' | 'approved' | 'rejected'
export type { GateScope } from './kpiScoring'

export interface KpiTemplate {
  id: string
  name: string
  role_label: string | null
  prp_pool: number
  payout_cap: number
  sales_gate: number
  sales_kra: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface KpiKra {
  id: string
  template_id: string
  name: string
  weight: number
  sort_order: number
  created_at?: string
  kpis?: KpiKpi[]
}

export interface KpiKpi {
  id: string
  kra_id: string
  name: string
  direction: Direction
  value_type: KpiValueType
  default_target: number | null
  sort_order: number
  created_at?: string
}

export interface KpiGate {
  id: string
  template_id: string
  kra_name: string
  threshold: number          // fraction, e.g. 0.70
  scope: GateScope           // 'this_kra' | 'whole_prp'
  label: string | null
  sort_order: number
  created_at?: string
}

// snapshot shape stored on an assignment's `gates` jsonb column
export interface GateSnapshot { kra: string; threshold: number; scope: GateScope; label?: string }

export interface KpiAssignment {
  id: string
  template_id: string | null
  template_name: string | null
  employee_id: string
  period: string
  prp_pool: number
  payout_cap: number
  sales_gate: number
  sales_kra: string | null
  gates: GateSnapshot[] | null   // snapshot of gates in force on this card
  status: AssignmentStatus
  overall_score: number | null
  rating: string | null
  gross_prp: number | null
  final_prp: number | null
  gate_pass: boolean | null
  employee_notes: string | null
  manager_notes: string | null
  self_submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  employee?: { id: string; full_name: string; job_title?: string; department?: string; phone?: string | null; whatsapp?: string | null }
  lines?: KpiAssignmentLine[]
}

export interface KpiAssignmentLine {
  id: string
  assignment_id: string
  kra: string
  kra_weight: number
  kpi: string
  direction: Direction
  value_type: KpiValueType
  target: number | null
  self_actual: number | null
  actual: number | null
  sort_order: number
}

// ── value display helpers (percent stored as fraction internally) ──
export function toDisplay(v: number | null, type: KpiValueType): string {
  if (v === null || v === undefined || Number.isNaN(v)) return ''
  if (type === 'percent') return `${+(v * 100).toFixed(1)}`
  return `${v}`
}
export function fromInput(raw: string, type: KpiValueType): number | null {
  if (raw === '' || raw === null || raw === undefined) return null
  const n = parseFloat(raw)
  if (Number.isNaN(n)) return null
  return type === 'percent' ? n / 100 : n
}
export function formatValue(v: number | null, type: KpiValueType): string {
  if (v === null || v === undefined) return '—'
  if (type === 'percent') return `${+(v * 100).toFixed(1)}%`
  if (type === 'currency') return `${Math.round(v).toLocaleString()} TZS`
  return `${v}`
}

// normalize a phone number for a wa.me link (digits only, drop leading 0/+ noise)
export function waNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/[^\d]/g, '')
  if (!d) return null
  if (d.startsWith('0')) d = '255' + d.slice(1)   // Tanzania local -> intl
  return d
}
