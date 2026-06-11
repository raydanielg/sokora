import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

export interface RecurringExpense {
  id: string
  name: string
  description: string | null
  amount: number
  account_id: string | null
  supplier_id: string | null
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual'
  day_of_month: number | null
  day_of_week: number | null
  next_due_date: string | null
  last_paid_date: string | null
  last_paid_ref: string | null
  is_active: boolean
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface UnpaidRecurring {
  id: string
  name: string
  description: string | null
  amount: number
  frequency: string
  day_of_month: number | null
  next_due_date: string | null
  last_paid_date: string | null
  last_paid_ref: string | null
  account_code: string | null
  account_name: string | null
  supplier_name: string | null
  is_due: boolean
  days_until_due: number | null
}

export function useRecurringExpenses() {
  const [items, setItems] = useState<RecurringExpense[]>([])
  const [unpaid, setUnpaid] = useState<UnpaidRecurring[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: active }, { data: due }] = await Promise.all([
      supabase.from('recurring_expenses').select('*').order('name'),
      supabase.from('unpaid_recurring_this_period').select('*').order('next_due_date', { ascending: true, nullsFirst: false }),
    ])
    if (active) setItems(active as RecurringExpense[])
    if (due) setUnpaid(due as UnpaidRecurring[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const create = async (r: Partial<RecurringExpense>) => {
    const payload = {
      name: r.name, description: r.description || null, amount: r.amount,
      account_id: r.account_id || null, supplier_id: r.supplier_id || null,
      frequency: r.frequency || 'monthly',
      day_of_month: r.day_of_month || null,
      day_of_week: r.day_of_week || null,
      next_due_date: r.next_due_date || null,
      is_active: r.is_active !== false,
      notes: r.notes || null,
      created_by: r.created_by || null,
    }
    const { error } = await supabase.from('recurring_expenses').insert(payload)
    if (error) return { success: false, error: error.message }
    await load()
    return { success: true }
  }

  const update = async (id: string, r: Partial<RecurringExpense>) => {
    const { error } = await supabase.from('recurring_expenses').update(r).eq('id', id)
    if (error) return { success: false, error: error.message }
    await load()
    return { success: true }
  }

  const remove = async (id: string) => {
    const { error } = await supabase.from('recurring_expenses').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    await load()
    return { success: true }
  }

  const toggle = async (id: string, isActive: boolean) => {
    return update(id, { is_active: isActive })
  }

  // Mark a recurring expense as paid (called after posting a matching cash_payment)
  const markPaid = async (id: string, voucherRef: string, paidDate: string) => {
    const { error } = await supabase.rpc('mark_recurring_paid', {
      p_recurring_id: id, p_voucher_ref: voucherRef, p_paid_date: paidDate,
    })
    if (error) return { success: false, error: error.message }
    await load()
    return { success: true }
  }

  return { items, unpaid, loading, load, create, update, remove, toggle, markPaid }
}
