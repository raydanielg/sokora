// ============================================================================
// useDashboard.ts
// Single data hook for the CEO dashboard. Current-month scoped. Sensitive
// (financial) queries are SKIPPED entirely when canViewFinancials is false, so
// that data never reaches an unauthorised browser. All financial figures come
// from the general ledger (journals + journal_lines + accounts), which is the
// trustworthy source after the balance rebuild.
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import type { DashboardData, FinancialData, OperationsData, MoneyDelta } from './dashboardTypes'

const CASH_CODES = ['1010', '1011', '1020', '1021', '1022', '1030']
const LOAN_CODES = ['2110', '2120', '2130', '2140']

function monthBounds(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth()
  const iso = (dt: Date) => dt.toISOString().slice(0, 10)
  return {
    monthStart: iso(new Date(y, m, 1)),
    prevStart: iso(new Date(y, m - 1, 1)),
    prevEnd: iso(new Date(y, m, 0)),
    today: iso(d),
    label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
  }
}

function delta(current: number, previous: number): MoneyDelta {
  const deltaPct = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null
  return { current, previous, deltaPct }
}

export function useDashboard(canViewFinancials: boolean) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const b = monthBounds()
    try {
      const [operations, financial] = await Promise.all([
        loadOperations(b),
        canViewFinancials ? loadFinancial(b) : Promise.resolve(null),
      ])
      setData({ monthLabel: b.label, operations, financial })
    } catch (err: any) {
      console.error('Dashboard load failed:', err)
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [canViewFinancials])

  useEffect(() => { reload() }, [reload])

  return { data, loading, error, reload }
}

// ── Operational tier (always) ────────────────────────────────────────────────
async function loadOperations(b: ReturnType<typeof monthBounds>): Promise<OperationsData> {
  const [salesRes, prodRes, empRes, retailRes, b2bRes, apprRes, recentRes] = await Promise.all([
    supabase.from('vouchers').select('type, total_amount, posting_date, status')
      .in('type', ['cash_sale', 'sales_invoice']).eq('status', 'posted').gte('posting_date', b.monthStart),
    supabase.from('products').select('id, name, qty_on_hand, reorder_point, category, is_active').eq('is_active', true),
    supabase.from('hrm_employees').select('id, is_active, on_leave'),
    supabase.from('customers').select('id, customer_type, created_at').eq('customer_type', 'cash'),
    supabase.from('b2b_accounts').select('stage, next_action_date, won_at, is_archived'),
    supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('vouchers').select('ref, description, type, total_amount, status')
      .eq('status', 'posted').order('created_at', { ascending: false }).limit(5),
  ])

  // Sales
  const salesRows = (salesRes.data || []) as any[]
  const cash = salesRows.filter(v => v.type === 'cash_sale').reduce((s, v) => s + (v.total_amount || 0), 0)
  const credit = salesRows.filter(v => v.type === 'sales_invoice').reduce((s, v) => s + (v.total_amount || 0), 0)

  // Inventory counts + category breakdown
  const prods = (prodRes.data || []) as any[]
  const lowStock = prods.filter(p => p.qty_on_hand > 0 && p.qty_on_hand <= (p.reorder_point || 0)).length
  const outOfStock = prods.filter(p => (p.qty_on_hand || 0) <= 0).length
  const catMap: Record<string, { count: number; value: number }> = {}
  prods.forEach(p => {
    const c = p.category || 'Uncategorised'
    if (!catMap[c]) catMap[c] = { count: 0, value: 0 }
    catMap[c].count += 1
  })
  const categoryBreakdown = Object.entries(catMap)
    .map(([category, v]) => ({ category, count: v.count, value: v.value }))
    .sort((a, b) => b.count - a.count).slice(0, 6)

  // HRM
  const emps = (empRes.data || []) as any[]
  const headcount = emps.filter(e => e.is_active !== false).length
  const onLeave = emps.filter(e => e.on_leave === true).length

  // CRM retail
  const retail = (retailRes.data || []) as any[]
  const newRetailThisMonth = retail.filter(c => c.created_at && c.created_at >= b.monthStart).length

  // CRM B2B
  const b2b = (b2bRes.data || []) as any[]
  const live = b2b.filter(a => !a.is_archived && a.stage !== 'won' && a.stage !== 'lost')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const b2bOverdue = live.filter(a => a.next_action_date && new Date(a.next_action_date) < today).length
  const b2bWonThisMonth = b2b.filter(a => a.won_at && a.won_at >= b.monthStart).length

  // Stock alerts (lowest first)
  const stockAlerts = [...prods]
    .filter(p => p.qty_on_hand <= (p.reorder_point || 0))
    .sort((a, b) => (a.qty_on_hand || 0) - (b.qty_on_hand || 0))
    .slice(0, 5)
    .map(p => ({ name: p.name || p.category || 'Product', qty_on_hand: p.qty_on_hand || 0, reorder_point: p.reorder_point || 0 }))

  return {
    sales: { count: salesRows.length, total: cash + credit, cash, credit },
    inventory: { products: prods.length, lowStock, outOfStock },
    hrm: { headcount, onLeave },
    crm: {
      retailCustomers: retail.length,
      newRetailThisMonth,
      b2bProspects: live.length,
      b2bOverdue,
      b2bWonThisMonth,
    },
    approvalsPending: apprRes.count || 0,
    recentVouchers: (recentRes.data || []) as any[],
    stockAlerts,
    categoryBreakdown,
  }
}

// ── Sensitive tier (only when permitted) ─────────────────────────────────────
async function loadFinancial(b: ReturnType<typeof monthBounds>): Promise<FinancialData> {
  const [lineRes, acctRes, arRes, supRes] = await Promise.all([
    // Posted journal lines for prev-month-start..today, with account type/code.
    supabase.from('journal_lines')
      .select('debit, credit, journals!inner(posting_date, status), accounts!inner(type, code, name)')
      .eq('journals.status', 'posted')
      .gte('journals.posting_date', b.prevStart)
      .lte('journals.posting_date', b.today),
    supabase.from('accounts').select('code, balance'),
    supabase.from('customer_ledger_entries').select('customer_id, remaining_amount, posting_date').eq('is_open', true),
    supabase.from('suppliers').select('balance_tzs'),
  ])

  // ---- Month P&L from the ledger ----
  const lines = (lineRes.data || []) as any[]
  const acc = (cur: boolean, pred: (type: string, code: string) => boolean, sign: 1 | -1) =>
    lines.reduce((s, l) => {
      const j = Array.isArray(l.journals) ? l.journals[0] : l.journals
      const a = Array.isArray(l.accounts) ? l.accounts[0] : l.accounts
      const pd = j?.posting_date
      if (!pd) return s
      const inCur = pd >= b.monthStart
      if (cur !== inCur) return s
      const t = a?.type, code = a?.code || ''
      if (!pred(t, code)) return s
      return s + sign * ((l.debit || 0) - (l.credit || 0))
    }, 0)

  const revCur = -acc(true, t => t === 'revenue', 1)   // revenue = credit - debit
  const revPrev = -acc(false, t => t === 'revenue', 1)
  const cogsCur = acc(true, t => t === 'cogs', 1)
  const cogsPrev = acc(false, t => t === 'cogs', 1)
  const expCur = acc(true, t => t === 'expense', 1)
  const expPrev = acc(false, t => t === 'expense', 1)
  const payrollCost = acc(true, (_t, code) => code.startsWith('60'), 1)

  const gpCur = revCur - cogsCur, gpPrev = revPrev - cogsPrev
  const netCur = gpCur - expCur, netPrev = gpPrev - expPrev

  // ---- Per-account P&L breakdown (current month only) ----
  const byAcct: Record<string, { code: string; name: string; type: string; value: number }> = {}
  for (const l of lines) {
    const j = Array.isArray(l.journals) ? l.journals[0] : l.journals
    const a = Array.isArray(l.accounts) ? l.accounts[0] : l.accounts
    const pd = j?.posting_date
    if (!pd || pd < b.monthStart) continue   // current month only
    const type = a?.type || ''
    if (type !== 'revenue' && type !== 'cogs' && type !== 'expense') continue
    const code = a?.code || '', name = a?.name || code
    const signed = type === 'revenue'
      ? (l.credit || 0) - (l.debit || 0)
      : (l.debit || 0) - (l.credit || 0)
    if (!byAcct[code]) byAcct[code] = { code, name, type, value: 0 }
    byAcct[code].value += signed
  }
  const breakdownOf = (t: string) =>
    Object.values(byAcct).filter(x => x.type === t && Math.abs(x.value) > 0.5)
      .sort((a, b) => b.value - a.value)
      .map(x => ({ code: x.code, name: x.name, value: x.value }))
  const pnlBreakdown = {
    revenue: breakdownOf('revenue'),
    cogs: breakdownOf('cogs'),
    expenses: breakdownOf('expense'),
  }

  // ---- Snapshot balances ----
  const accts = (acctRes.data || []) as { code: string; balance: number }[]
  const bal = (code: string) => accts.find(a => a.code === code)?.balance || 0
  const cashPosition = CASH_CODES.reduce((s, c) => s + bal(c), 0)
  const inventoryValue = bal('1110')
  const loans = LOAN_CODES.reduce((s, c) => s + Math.abs(bal(c)), 0)

  // ---- AR aging + top debtors ----
  const arRows = (arRes.data || []) as any[]
  const now = Date.now()
  const aging = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0 }
  const byCustomer: Record<string, number> = {}
  arRows.forEach(e => {
    const amt = e.remaining_amount || 0
    const age = e.posting_date ? Math.floor((now - new Date(e.posting_date).getTime()) / 86400000) : 0
    if (age <= 30) aging.current += amt
    else if (age <= 60) aging.d31_60 += amt
    else if (age <= 90) aging.d61_90 += amt
    else aging.d90plus += amt
    if (e.customer_id) byCustomer[e.customer_id] = (byCustomer[e.customer_id] || 0) + amt
  })
  const arTotal = aging.current + aging.d31_60 + aging.d61_90 + aging.d90plus
  const topIds = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).slice(0, 5)
  let top: { name: string; amount: number }[] = []
  if (topIds.length) {
    const { data: custs } = await supabase.from('customers')
      .select('id, name, company').in('id', topIds.map(t => t[0]))
    const nameOf = (id: string) => {
      const c = (custs || []).find((x: any) => x.id === id)
      return c ? (c.company || c.name || 'Customer') : 'Customer'
    }
    top = topIds.map(([id, amount]) => ({ name: nameOf(id), amount }))
  }

  const suppliersTotal = ((supRes.data || []) as any[]).reduce((s, x) => s + (x.balance_tzs || 0), 0)

  return {
    revenue: delta(revCur, revPrev),
    grossProfit: delta(gpCur, gpPrev),
    marginPct: revCur > 0 ? (gpCur / revCur) * 100 : 0,
    expenses: delta(expCur, expPrev),
    netProfit: delta(netCur, netPrev),
    pnlBreakdown,
    cashPosition,
    inventoryValue,
    payrollCost,
    ar: { total: arTotal, customerCount: Object.keys(byCustomer).length, aging, top },
    ap: { suppliers: suppliersTotal, loans },
  }
}
