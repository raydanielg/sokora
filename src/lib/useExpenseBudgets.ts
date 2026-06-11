import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

export interface ExpenseBudget {
  id: string
  account_id: string
  period_start: string
  period_end: string
  budget_amount: number
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface BudgetLine {
  account_id: string
  account_code: string
  account_name: string
  account_category: string
  budget: number
  actual: number
  variance: number
  pctUsed: number
  status: 'under' | 'warning' | 'over'
}

export function useExpenseBudgets() {
  const [budgets, setBudgets] = useState<ExpenseBudget[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('expense_budgets')
      .select('*')
      .order('period_start', { ascending: false })
    if (data) setBudgets(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const upsert = async (b: {
    account_id: string; period_start: string; period_end: string
    budget_amount: number; notes?: string | null; created_by?: string | null
  }) => {
    // Check if budget exists for this account + period
    const existing = budgets.find(
      x => x.account_id === b.account_id && x.period_start === b.period_start
    )
    if (existing) {
      const { error } = await supabase.from('expense_budgets')
        .update({ budget_amount: b.budget_amount, notes: b.notes || null })
        .eq('id', existing.id)
      if (error) return { success: false, error: error.message }
    } else {
      const { error } = await supabase.from('expense_budgets').insert(b)
      if (error) return { success: false, error: error.message }
    }
    await load()
    return { success: true }
  }

  const bulkUpsert = async (items: {
    account_id: string; period_start: string; period_end: string
    budget_amount: number; notes?: string | null; created_by?: string | null
  }[]) => {
    // Use upsert with onConflict
    const { error } = await supabase.from('expense_budgets')
      .upsert(items, { onConflict: 'account_id,period_start' })
    if (error) return { success: false, error: error.message }
    await load()
    return { success: true }
  }

  const remove = async (id: string) => {
    const { error } = await supabase.from('expense_budgets').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    await load()
    return { success: true }
  }

  return { budgets, loading, load, upsert, bulkUpsert, remove }
}

/**
 * Load actual spend per expense account for a given date range.
 * Queries journal_lines joined to journals for posting_date filtering.
 */
export async function loadActualSpend(
  expenseAccountIds: string[],
  fromDate: string,
  toDate: string
): Promise<Record<string, number>> {
  if (expenseAccountIds.length === 0) return {}

  // Get all journal lines for these expense accounts
  const { data: lines } = await supabase
    .from('journal_lines')
    .select('account_id, debit, credit, journals!inner(posting_date, status)')
    .in('account_id', expenseAccountIds)
    .gte('journals.posting_date', fromDate)
    .lte('journals.posting_date', toDate)
    .eq('journals.status', 'posted')

  const result: Record<string, number> = {}
  expenseAccountIds.forEach(id => { result[id] = 0 })

  if (lines) {
    lines.forEach((l: any) => {
      // Expenses are debited, so actual spend = sum of debits
      const id = l.account_id
      result[id] = (result[id] || 0) + (l.debit || 0)
    })
  }

  return result
}

/**
 * Build budget vs actual lines for display.
 */
export function buildBudgetLines(
  accounts: { id: string; code: string; name: string; category: string }[],
  budgetMap: Record<string, number>,
  actualMap: Record<string, number>
): BudgetLine[] {
  return accounts.map(a => {
    const budget = budgetMap[a.id] || 0
    const actual = actualMap[a.id] || 0
    const variance = budget - actual
    const pctUsed = budget > 0 ? Math.round((actual / budget) * 100) : actual > 0 ? 999 : 0
    const status: BudgetLine['status'] = pctUsed >= 100 ? 'over' : pctUsed >= 80 ? 'warning' : 'under'
    return {
      account_id: a.id,
      account_code: a.code,
      account_name: a.name,
      account_category: a.category,
      budget, actual, variance, pctUsed, status
    }
  }).filter(l => l.budget > 0 || l.actual > 0)
    .sort((a, b) => b.actual - a.actual)
}

/**
 * Helper: generate monthly period boundaries
 */
export function getMonthPeriod(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  }
}

/**
 * Helper: distribute annual budget evenly across 12 months
 */
export function distributeAnnual(annualAmount: number): number {
  return Math.round(annualAmount / 12)
}

/**
 * Helper: distribute quarterly budget across 3 months
 */
export function distributeQuarterly(quarterlyAmount: number): number {
  return Math.round(quarterlyAmount / 3)
}
