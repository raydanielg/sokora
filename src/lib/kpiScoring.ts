/**
 * KPI Scorecard scoring engine (pure, no I/O).
 * Mirrors the math used in the SOKORA KPI spreadsheets, now with MULTIPLE gates.
 *
 *   - attainment (actual/target, or target/actual for "lower is better"), capped
 *   - KRA score = average of its KPI attainments
 *   - overall   = sum of (KRA weight x KRA score)   [gates do NOT change this]
 *   - rating    = 1-5 band
 *   - PRP       = pool split by KRA weight, paid by KRA score
 *   - gates     = each gate watches one KRA; if that KRA's score is below the
 *                 gate's threshold it either zeroes JUST that KRA's payout
 *                 (scope 'this_kra') or zeroes the WHOLE PRP (scope 'whole_prp').
 */

export type Direction = 'H' | 'L'
export type GateScope = 'this_kra' | 'whole_prp'

export interface Gate {
  kra: string
  threshold: number   // fraction, e.g. 0.70
  scope: GateScope
  label?: string
}

export interface ScoringLine {
  kra: string
  kra_weight: number
  kpi: string
  direction: Direction
  target: number | null
  actual: number | null
}

export interface KraResult {
  kra: string
  weight: number
  score: number | null
  weighted: number
  slice: number
  payout: number      // AFTER gates applied
}

export interface FailedGate { kra: string; threshold: number; scope: GateScope; label?: string }

export interface ScorecardResult {
  kras: KraResult[]
  overall: number
  rating: string
  grossPrp: number    // before gates
  finalPrp: number    // after gates
  gatePass: boolean   // false if any whole_prp gate failed
  failedGates: FailedGate[]
  weightTotal: number
}

/** Single KPI attainment, capped. Returns null if not scorable. */
export function attainment(direction: Direction, target: number | null, actual: number | null, cap: number): number | null {
  if (target === null || target === undefined || actual === null || actual === undefined) return null
  if (direction === 'H') {
    if (target === 0) return null
    return Math.min(cap, actual / target)
  }
  if (actual === 0) return cap
  return Math.min(cap, target / actual)
}

export function ratingLabel(score: number | null): string {
  if (score === null || score === undefined) return '—'
  if (score >= 1.0) return '5 - Outstanding'
  if (score >= 0.90) return '4 - Strong'
  if (score >= 0.75) return '3 - On track'
  if (score >= 0.60) return '2 - Needs improvement'
  return '1 - Underperforming'
}

export interface ScoreOptions {
  pool: number
  cap: number
  gates?: Gate[]            // new multi-gate input (preferred)
  // legacy single-gate fallback (used only when gates is empty):
  salesGate?: number
  salesKra?: string | null
}

export function computeScorecard(lines: ScoringLine[], opts: ScoreOptions): ScorecardResult {
  const cap = opts.cap && opts.cap >= 1 ? opts.cap : 1
  const order: string[] = []
  const groups = new Map<string, ScoringLine[]>()
  for (const l of lines) {
    if (!groups.has(l.kra)) { groups.set(l.kra, []); order.push(l.kra) }
    groups.get(l.kra)!.push(l)
  }

  const kras: KraResult[] = []
  let overall = 0
  let weightTotal = 0
  let grossPrp = 0

  for (const name of order) {
    const ls = groups.get(name)!
    const weight = ls[0]?.kra_weight ?? 0
    const atts = ls.map(l => attainment(l.direction, l.target, l.actual, cap)).filter((v): v is number => v !== null)
    const score = atts.length ? atts.reduce((a, b) => a + b, 0) / atts.length : null
    const weighted = score === null ? 0 : weight * score
    const slice = opts.pool * weight
    const payout = score === null ? 0 : slice * score
    kras.push({ kra: name, weight, score, weighted, slice, payout })
    weightTotal += weight
    if (score !== null) { overall += weighted; grossPrp += payout }
  }

  // Resolve effective gates: prefer the new array; otherwise fall back to the
  // legacy single sales gate so older assignments keep their behaviour.
  let gates: Gate[] = opts.gates && opts.gates.length ? opts.gates : []
  if (!gates.length && opts.salesGate && opts.salesGate > 0) {
    gates = [{ kra: opts.salesKra || '', threshold: opts.salesGate, scope: 'whole_prp', label: 'Sales gate' }]
  }

  const scoreOf = (kraName: string): number | null => {
    const k = kraName ? kras.find(x => x.kra === kraName) : kras.find(x => /sales/i.test(x.kra))
    return k ? k.score : null
  }

  const failedGates: FailedGate[] = []
  let wholeFail = false
  for (const g of gates) {
    const s = scoreOf(g.kra)
    if (s !== null && s < g.threshold) {
      failedGates.push({ kra: g.kra, threshold: g.threshold, scope: g.scope, label: g.label })
      if (g.scope === 'whole_prp') wholeFail = true
      if (g.scope === 'this_kra') {
        const target = kras.find(x => x.kra === g.kra)
        if (target) target.payout = 0
      }
    }
  }

  const finalAfterKraGates = kras.reduce((sum, k) => sum + k.payout, 0)
  const finalPrp = wholeFail ? 0 : finalAfterKraGates

  return {
    kras,
    overall,
    rating: ratingLabel(overall),
    grossPrp,
    finalPrp,
    gatePass: !wholeFail,
    failedGates,
    weightTotal,
  }
}
