import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { tzs, getPostedBy } from '../lib/utils'
import { useExpenseBudgets, loadActualSpend, buildBudgetLines, getMonthPeriod, distributeAnnual, distributeQuarterly } from '../lib/useExpenseBudgets'
import type { BudgetLine } from '../lib/useExpenseBudgets'
import { useRecurringExpenses } from '../lib/useRecurringExpenses'
import type { RecurringExpense, UnpaidRecurring } from '../lib/useRecurringExpenses'
import Toast from '../components/Toast'
import type { Page } from '../lib/types'

// ── Types ───────────────────────────────────────────────────
interface PaymentRecord {
  id: string; ref: string; type: string; posting_date: string
  description: string; total_amount: number; payment_method: string
  status: string; notes: string; posted_by: string
  supplier_id: string | null; journal_id: string | null
  expense_category: string | null; tags: string[] | null
  suppliers: { name: string } | null
}

interface AccountRow { id: string; code: string; name: string; type: string; category: string; balance: number }

interface CategoryRow {
  accountId: string; code: string; name: string; category: string
  amount: number; txCount: number
}

interface VendorRow {
  supplierId: string; name: string
  totalPaid: number; txCount: number; avgPayment: number
  lastPaid: string
}

type Tab = 'transactions' | 'budget' | 'vendors' | 'recurring'
type TypeFilter = 'all' | 'cash_payment' | 'petty_cash' | 'bank_transfer' | 'cash_receipt' | 'contra'

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  if (n === 'plus') return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  if (n === 'edit') return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  if (n === 'trash') return <svg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
const todayStr = () => new Date().toISOString().split('T')[0]

const TYPE_LABEL: Record<string, string> = {
  cash_payment: 'Payment Voucher', petty_cash: 'Petty Cash',
  bank_transfer: 'Bank Transfer', contra: 'Contra', cash_receipt: 'Cash Receipt',
}
const TYPE_COLOR: Record<string, string> = {
  cash_payment: 'pill-red', petty_cash: 'pill-yellow',
  bank_transfer: 'pill-blue', contra: 'pill-gray', cash_receipt: 'pill-green',
}

interface Props {
  onEdit?: (p: Page, voucherId: string) => void
  // Variant of this register:
  //  - 'all'     → full payment register (payments + receipts + transfers + contra)
  //  - 'expense' → expense register: only outgoing money (cash_payment + petty_cash)
  //
  // Defaults to 'all' so the existing /payment-register route is unchanged.
  // The 'expense' mode is used by the dedicated /expense-register route to
  // give Joe a focused view of money leaving the business (supplier payments,
  // petty cash, recurring expenses, vendor analytics) without receipts or
  // internal transfers cluttering the table.
  mode?: 'all' | 'expense'
}

export default function PaymentRegister({ onEdit, mode = 'all' }: Props = {}) {
  // Which voucher types this register cares about. Expense mode shows only
  // outgoing-money vouchers; payment mode shows everything.
  // ──────────────────────────────────────────────────────────────────────
  // Bank transfers and contra are excluded from expense mode because they
  // move money between your own accounts — the cash didn't actually leave
  // the business, it just changed which till/bank it sits in. Including
  // them would inflate the "total expenses" KPI and make the budget vs
  // actual comparison wrong.
  const RELEVANT_TYPES = mode === 'expense'
    ? ['cash_payment', 'petty_cash']
    : ['cash_payment', 'petty_cash', 'bank_transfer', 'contra', 'cash_receipt']

  const [tab, setTab] = useState<Tab>('transactions')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Period filter
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(todayStr())

  // Transactions tab
  const [records, setRecords] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [categoryMap, setCategoryMap] = useState<Record<string, { account_id: string; account_code: string; account_name: string; category: string }>>({})
  const [pendingCount, setPendingCount] = useState(0)

  // Accounts (shared across tabs)
  const [accounts, setAccounts] = useState<AccountRow[]>([])

  // Budget tab
  const { budgets, bulkUpsert } = useExpenseBudgets()
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([])
  const [budgetMonth, setBudgetMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [showBudgetSetup, setShowBudgetSetup] = useState(false)
  const [setupMode, setSetupMode] = useState<'monthly' | 'quarterly' | 'annual'>('monthly')
  const [setupMonth, setSetupMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [setupYear, setSetupYear] = useState(() => new Date().getFullYear())
  const [setupQuarter, setSetupQuarter] = useState(() => Math.floor(new Date().getMonth() / 3) + 1)
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({})
  const [savingBudget, setSavingBudget] = useState(false)

  // Recurring tab
  const { items: recurring, unpaid, create: createRecurring, update: updateRecurring, remove: removeRecurring, toggle: toggleRecurring } = useRecurringExpenses()
  const [showRecurringForm, setShowRecurringForm] = useState(false)
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null)
  const [recurringForm, setRecurringForm] = useState({
    name: '', description: '', amount: '', frequency: 'monthly' as RecurringExpense['frequency'],
    day_of_month: '1', day_of_week: '1',
    account_id: '', supplier_id: '', notes: '',
  })
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])

  // ─── Data loading ────────────────────────────────────────
  const loadAccounts = useCallback(async () => {
    const { data } = await supabase.from('accounts')
      .select('id, code, name, type, category, balance')
      .eq('is_active', true).order('code')
    if (data) setAccounts(data as AccountRow[])
  }, [])

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name')
    if (data) setSuppliers(data)
  }, [])

  const loadPayments = useCallback(async (from?: string, to?: string) => {
    setLoading(true)
    const f = from || fromDate
    const t = to || toDate
    const { data } = await supabase.from('vouchers')
      .select('id, ref, type, posting_date, description, total_amount, payment_method, status, notes, posted_by, supplier_id, journal_id, expense_category, tags, suppliers(name)')
      .in('type', RELEVANT_TYPES)
      .gte('posting_date', f).lte('posting_date', t)
      .order('posting_date', { ascending: false })
      .order('ref', { ascending: false })
    if (data) setRecords(data as any)

    // Build expense-category map by looking up the debit line of each journal
    const journalIds = (data || []).map((d: any) => d.journal_id).filter(Boolean)
    if (journalIds.length > 0) {
      const { data: lines } = await supabase
        .from('journal_lines')
        .select('journal_id, account_id, debit, accounts(code, name, category, type)')
        .in('journal_id', journalIds)
        .gt('debit', 0)
      const map: typeof categoryMap = {}
      ;(lines || []).forEach((l: any) => {
        if (!l.accounts) return
        // Pick the expense-type line as the category for that voucher
        if (l.accounts.type === 'expense' || l.accounts.type === 'cogs' || !map[l.journal_id]) {
          map[l.journal_id] = {
            account_id: l.account_id,
            account_code: l.accounts.code,
            account_name: l.accounts.name,
            category: l.accounts.category,
          }
        }
      })
      setCategoryMap(map)
    } else {
      setCategoryMap({})
    }

    // Count pending approvals (shows as alert banner). Limit to the
    // same voucher types this register cares about — in expense mode
    // a pending bank transfer isn't actionable from this page.
    const pendingTypes = mode === 'expense'
      ? ['cash_payment', 'petty_cash']
      : ['cash_payment', 'petty_cash', 'bank_transfer']
    const { count } = await supabase.from('vouchers')
      .select('id', { count: 'exact', head: true })
      .in('type', pendingTypes)
      .eq('status', 'pending_approval')
    setPendingCount(count || 0)

    setLoading(false)
    // RELEVANT_TYPES is derived from `mode` (a prop). It only changes if a
    // parent unmounts and remounts this component with a different mode,
    // so it's effectively stable for the lifetime of this instance. Adding
    // it here keeps the lint rule happy without causing extra reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate])

  // Budget comparison
  const loadBudgetComparison = useCallback(async () => {
    const [y, m] = budgetMonth.split('-').map(Number)
    const period = getMonthPeriod(y, m - 1)
    const expenseAccounts = accounts.filter(a => ['expense', 'cogs'].includes(a.type))
    const actualMap = await loadActualSpend(expenseAccounts.map(a => a.id), period.start, period.end)
    const monthBudgets = budgets.filter(b => b.period_start === period.start)
    const budgetMap: Record<string, number> = {}
    monthBudgets.forEach(b => { budgetMap[b.account_id] = b.budget_amount })
    setBudgetLines(buildBudgetLines(expenseAccounts, budgetMap, actualMap))
  }, [budgetMonth, accounts, budgets])

  useEffect(() => { loadPayments(); loadAccounts(); loadSuppliers() }, [])
  useEffect(() => { if (tab === 'budget' && accounts.length > 0) loadBudgetComparison() }, [tab, budgetMonth, accounts, budgets])

  // ─── Derivations ─────────────────────────────────────────
  const filtered = typeFilter === 'all' ? records : records.filter(r => r.type === typeFilter)

  const totalOut = filtered.filter(r => ['cash_payment', 'petty_cash', 'bank_transfer'].includes(r.type))
    .reduce((s, r) => s + (r.total_amount || 0), 0)
  const totalIn = filtered.filter(r => r.type === 'cash_receipt').reduce((s, r) => s + (r.total_amount || 0), 0)
  const net = totalIn - totalOut

  const cashOut = filtered.filter(r => ['cash_payment', 'petty_cash'].includes(r.type) && (r.payment_method?.toLowerCase().includes('cash') || r.type === 'petty_cash'))
    .reduce((s, r) => s + (r.total_amount || 0), 0)
  const bankOut = filtered.filter(r => r.type === 'bank_transfer' || (r.type === 'cash_payment' && !r.payment_method?.toLowerCase().includes('cash')))
    .reduce((s, r) => s + (r.total_amount || 0), 0)

  // Top 5 expense categories
  const categoryRows = useMemo<CategoryRow[]>(() => {
    const map: Record<string, CategoryRow> = {}
    filtered.forEach(r => {
      if (r.type !== 'cash_payment' && r.type !== 'petty_cash' && r.type !== 'bank_transfer') return
      const cat = r.journal_id ? categoryMap[r.journal_id] : null
      const key = cat?.account_id || `__uncat_${r.type}`
      if (!map[key]) {
        map[key] = {
          accountId: key,
          code: cat?.account_code || '—',
          name: cat?.account_name || 'Uncategorized',
          category: cat?.category || '—',
          amount: 0, txCount: 0,
        }
      }
      map[key].amount += (r.total_amount || 0)
      map[key].txCount++
    })
    return Object.values(map).sort((a, b) => b.amount - a.amount)
  }, [filtered, categoryMap])

  // Vendor rows
  const vendorRows = useMemo<VendorRow[]>(() => {
    const map: Record<string, VendorRow> = {}
    filtered.forEach(r => {
      if (r.type !== 'cash_payment' && r.type !== 'bank_transfer') return
      const key = r.supplier_id || `__no_supplier_${r.description}`
      const name = r.suppliers?.name || r.description?.replace(/^Cash Payment — /, '') || '—'
      if (!map[key]) {
        map[key] = { supplierId: key, name, totalPaid: 0, txCount: 0, avgPayment: 0, lastPaid: '' }
      }
      map[key].totalPaid += (r.total_amount || 0)
      map[key].txCount++
      if (!map[key].lastPaid || r.posting_date > map[key].lastPaid) map[key].lastPaid = r.posting_date
    })
    return Object.values(map).map(v => ({ ...v, avgPayment: Math.round(v.totalPaid / v.txCount) }))
      .sort((a, b) => b.totalPaid - a.totalPaid)
  }, [filtered])

  // ─── Budget form helpers ─────────────────────────────────
  const openBudgetSetup = () => {
    const inputs: Record<string, string> = {}
    const expAccts = accounts.filter(a => ['expense', 'cogs'].includes(a.type))
    if (setupMode === 'monthly') {
      const [y, m] = setupMonth.split('-').map(Number)
      const period = getMonthPeriod(y, m - 1)
      expAccts.forEach(a => {
        const existing = budgets.find(b => b.account_id === a.id && b.period_start === period.start)
        inputs[a.id] = existing ? String(existing.budget_amount) : ''
      })
    } else {
      expAccts.forEach(a => { inputs[a.id] = '' })
    }
    setBudgetInputs(inputs)
    setShowBudgetSetup(true)
  }

  const saveBudgets = async () => {
    setSavingBudget(true)
    const expAccts = accounts.filter(a => ['expense', 'cogs'].includes(a.type))
    const items: { account_id: string; period_start: string; period_end: string; budget_amount: number; notes: string | null; created_by: string }[] = []
    const by = getPostedBy() || 'System'

    if (setupMode === 'monthly') {
      const [y, m] = setupMonth.split('-').map(Number)
      const period = getMonthPeriod(y, m - 1)
      expAccts.forEach(a => {
        const val = parseFloat(budgetInputs[a.id] || '0')
        if (val > 0) items.push({ account_id: a.id, period_start: period.start, period_end: period.end, budget_amount: val, notes: null, created_by: by })
      })
    } else if (setupMode === 'quarterly') {
      const qStartMonth = (setupQuarter - 1) * 3
      for (let i = 0; i < 3; i++) {
        const period = getMonthPeriod(setupYear, qStartMonth + i)
        expAccts.forEach(a => {
          const qVal = parseFloat(budgetInputs[a.id] || '0')
          if (qVal > 0) items.push({ account_id: a.id, period_start: period.start, period_end: period.end, budget_amount: distributeQuarterly(qVal), notes: `Q${setupQuarter} ${setupYear} budget`, created_by: by })
        })
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const period = getMonthPeriod(setupYear, i)
        expAccts.forEach(a => {
          const aVal = parseFloat(budgetInputs[a.id] || '0')
          if (aVal > 0) items.push({ account_id: a.id, period_start: period.start, period_end: period.end, budget_amount: distributeAnnual(aVal), notes: `${setupYear} annual budget`, created_by: by })
        })
      }
    }

    if (items.length === 0) { setSavingBudget(false); setShowBudgetSetup(false); return }
    const res = await bulkUpsert(items)
    if (res.success) {
      setToast({ msg: `Saved ${items.length} budget line(s)`, type: 'success' })
      setShowBudgetSetup(false)
      loadBudgetComparison()
    } else {
      setToast({ msg: res.error || 'Save failed', type: 'error' })
    }
    setSavingBudget(false)
  }

  const copyLastMonth = () => {
    const [y, m] = budgetMonth.split('-').map(Number)
    const prevMonth = m - 2 < 0 ? 11 : m - 2
    const prevYear = m - 2 < 0 ? y - 1 : y
    const prevPeriod = getMonthPeriod(prevYear, prevMonth)
    const expAccts = accounts.filter(a => ['expense', 'cogs'].includes(a.type))
    const inputs: Record<string, string> = {}
    expAccts.forEach(a => {
      const prev = budgets.find(b => b.account_id === a.id && b.period_start === prevPeriod.start)
      inputs[a.id] = prev ? String(prev.budget_amount) : ''
    })
    setSetupMode('monthly')
    setSetupMonth(budgetMonth)
    setBudgetInputs(inputs)
    setShowBudgetSetup(true)
    setToast({ msg: 'Copied last month — review and save', type: 'success' })
  }

  // ─── Recurring form helpers ──────────────────────────────
  const resetRecurringForm = () => {
    setRecurringForm({ name: '', description: '', amount: '', frequency: 'monthly', day_of_month: '1', day_of_week: '1', account_id: '', supplier_id: '', notes: '' })
    setEditingRecurring(null)
  }
  const openNewRecurring = () => { resetRecurringForm(); setShowRecurringForm(true) }
  const openEditRecurring = (r: RecurringExpense) => {
    setEditingRecurring(r)
    setRecurringForm({
      name: r.name, description: r.description || '', amount: String(r.amount),
      frequency: r.frequency,
      day_of_month: r.day_of_month ? String(r.day_of_month) : '1',
      day_of_week: r.day_of_week != null ? String(r.day_of_week) : '1',
      account_id: r.account_id || '', supplier_id: r.supplier_id || '',
      notes: r.notes || '',
    })
    setShowRecurringForm(true)
  }
  const saveRecurring = async () => {
    if (!recurringForm.name.trim()) { setToast({ msg: 'Name is required', type: 'error' }); return }
    const amount = parseFloat(recurringForm.amount)
    if (!amount || amount <= 0) { setToast({ msg: 'Amount must be > 0', type: 'error' }); return }
    const payload: Partial<RecurringExpense> = {
      name: recurringForm.name.trim(),
      description: recurringForm.description || null,
      amount,
      frequency: recurringForm.frequency,
      day_of_month: recurringForm.frequency === 'weekly' ? null : parseInt(recurringForm.day_of_month),
      day_of_week: recurringForm.frequency === 'weekly' ? parseInt(recurringForm.day_of_week) : null,
      account_id: recurringForm.account_id || null,
      supplier_id: recurringForm.supplier_id || null,
      notes: recurringForm.notes || null,
      is_active: true,
    }
    const res = editingRecurring
      ? await updateRecurring(editingRecurring.id, payload)
      : await createRecurring({ ...payload, created_by: getPostedBy() })
    if (res.success) {
      setToast({ msg: editingRecurring ? 'Recurring expense updated' : 'Recurring expense created', type: 'success' })
      setShowRecurringForm(false)
      resetRecurringForm()
    } else {
      setToast({ msg: res.error || 'Save failed', type: 'error' })
    }
  }
  const deleteRecurring = async (r: RecurringExpense) => {
    if (!confirm(`Delete recurring expense "${r.name}"? This cannot be undone.`)) return
    const res = await removeRecurring(r.id)
    if (res.success) setToast({ msg: 'Recurring expense deleted', type: 'success' })
    else setToast({ msg: res.error || 'Delete failed', type: 'error' })
  }

  // ─── CSV export ──────────────────────────────────────────
  const exportCSV = () => {
    const rows = [['Date', 'Ref', 'Type', 'Vendor/Payee', 'Expense Category', 'Description', 'Method', 'Amount (TZS)', 'Status', 'Posted By']]
    filtered.forEach(r => {
      const cat = r.journal_id ? categoryMap[r.journal_id] : null
      rows.push([
        r.posting_date, r.ref, TYPE_LABEL[r.type] || r.type,
        `"${r.suppliers?.name || '—'}"`,
        cat ? `${cat.account_code} ${cat.account_name}` : '—',
        `"${r.description}"`,
        r.payment_method || '', String(r.total_amount || 0),
        r.status, r.posted_by || '',
      ])
    })
    rows.push([])
    rows.push(['TOTALS', `${filtered.length} records`, '', '', '', '', '', '', '', ''])
    rows.push(['  Cash Out', '', '', '', '', '', '', String(cashOut), '', ''])
    rows.push(['  Bank Out', '', '', '', '', '', '', String(bankOut), '', ''])
    if (mode !== 'expense') {
      rows.push(['  Receipts', '', '', '', '', '', '', String(totalIn), '', ''])
      rows.push(['  Net Flow', '', '', '', '', '', '', String(net), '', ''])
    } else {
      rows.push(['  Total Paid Out', '', '', '', '', '', '', String(totalOut), '', ''])
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const filePrefix = mode === 'expense' ? 'Expense_Register' : 'Payment_Register'
    a.download = `${filePrefix}_${fromDate}_to_${toDate}.csv`
    a.click()
  }

  // ─── Tab definitions ─────────────────────────────────────
  const TABS: { key: Tab; label: string }[] = [
    { key: 'transactions', label: 'Transactions' },
    { key: 'budget', label: 'Budget vs Actual' },
    { key: 'vendors', label: 'Vendors' },
    { key: 'recurring', label: 'Recurring' },
  ]

  const expenseAccountsOnly = accounts.filter(a => ['expense', 'cogs'].includes(a.type))

  return (
    <div className="page">
      {/* HEADER */}
      <div className="page-header">
        <div>
          <div className="page-title">{mode === 'expense' ? 'Expense Register' : 'Payment Register'}</div>
          <div className="page-sub">
            {mode === 'expense'
              ? 'Money leaving the business · payment vouchers · petty cash · budgets · vendors · recurring · '
              : 'All cash and bank movements · budgets · vendors · recurring · '}
            <span className="sync-dot"></span> Live
          </div>
        </div>
        {tab !== 'recurring' && (
          <div className="page-actions">
            <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>to</span>
            <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} value={toDate} onChange={e => setToDate(e.target.value)} />
            <button className="btn btn-ghost btn-sm" onClick={() => loadPayments()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic n="refresh" /> Refresh</button>
            <button className="btn btn-primary btn-sm" onClick={() => loadPayments()}>Load</button>
            {tab === 'transactions' && <button className="btn btn-ghost btn-sm" onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic n="csv" /> Export CSV</button>}
          </div>
        )}
      </div>

      {/* Pending-approval banner */}
      {pendingCount > 0 && (
        <div style={{ background: 'rgba(255,211,42,.1)', border: '1px solid rgba(255,211,42,.3)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="18" height="18" fill="none" stroke="var(--yellow)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div style={{ flex: 1, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{pendingCount} expense voucher{pendingCount > 1 ? 's' : ''} pending approval</span>
            <span style={{ color: 'var(--text3)', marginLeft: 8, fontSize: 12 }}>Review in the Approvals page</span>
          </div>
        </div>
      )}

      {/* TAB BAR */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t.key ? 'var(--accent)' : 'var(--text3)',
            fontWeight: tab === t.key ? 600 : 400, fontSize: 13, whiteSpace: 'nowrap',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════
          TAB 1: TRANSACTIONS
         ═══════════════════════════════════════════════════ */}
      {tab === 'transactions' && (
        <>
          <div className="grid" style={{ gridTemplateColumns: mode === 'expense' ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
            <div className="stat-card red"><div className="stat-label">Cash Out</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(cashOut)}</div><div className="stat-change">Cash + petty cash</div></div>
            <div className="stat-card red"><div className="stat-label">Bank Out</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(bankOut)}</div><div className="stat-change">{mode === 'expense' ? 'Bank payments' : 'Bank payments + transfers'}</div></div>
            <div className="stat-card amber"><div className="stat-label">Total Paid Out</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(totalOut)}</div><div className="stat-change">{mode === 'expense' ? `${filtered.length} expense txns` : 'All outflows'}</div></div>
            {mode !== 'expense' && (
              <>
                <div className="stat-card green"><div className="stat-label">Receipts</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(totalIn)}</div><div className="stat-change up">Cash received</div></div>
                <div className={`stat-card ${net >= 0 ? 'green' : 'red'}`}><div className="stat-label">Net Flow</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(net)}</div><div className="stat-change">{filtered.length} txns</div></div>
              </>
            )}
          </div>

          {/* Top 5 categories + Top 5 vendors */}
          {(categoryRows.length > 0 || vendorRows.length > 0) && (
            <div className="grid g2" style={{ marginBottom: 20 }}>
              <div className="card card-sm">
                <div className="card-title" style={{ marginBottom: 12 }}>Top Expense Categories</div>
                {categoryRows.slice(0, 5).map((c, i) => {
                  const pct = totalOut > 0 ? Math.round((c.amount / totalOut) * 100) : 0
                  return (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', marginRight: 6 }}>{c.code}</span>
                          {c.name}
                        </span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(c.amount)} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({pct}%)</span></span>
                      </div>
                      <div style={{ height: 5, background: 'var(--surface3)', borderRadius: 3 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3 }}></div>
                      </div>
                    </div>
                  )
                })}
                {categoryRows.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>No categorized expenses</div>}
              </div>
              <div className="card card-sm">
                <div className="card-title" style={{ marginBottom: 12 }}>Top Vendors Paid</div>
                {vendorRows.slice(0, 5).map((v, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                    <span>
                      <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', marginRight: 6 }}>#{i + 1}</span>
                      {v.name}
                      <span style={{ color: 'var(--text3)', fontSize: 10, marginLeft: 6 }}>({v.txCount} txn)</span>
                    </span>
                    <span className="td-mono" style={{ fontWeight: 600, color: 'var(--red)' }}>{tzs(v.totalPaid)}</span>
                  </div>
                ))}
                {vendorRows.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>No vendor payments</div>}
              </div>
            </div>
          )}

          {/* Type filter pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {(mode === 'expense'
              ? [
                  { key: 'all' as TypeFilter, label: 'All Expenses' },
                  { key: 'cash_payment' as TypeFilter, label: 'Payment Vouchers' },
                  { key: 'petty_cash' as TypeFilter, label: 'Petty Cash' },
                ]
              : [
                  { key: 'all' as TypeFilter, label: 'All' },
                  { key: 'cash_payment' as TypeFilter, label: 'Payment Vouchers' },
                  { key: 'petty_cash' as TypeFilter, label: 'Petty Cash' },
                  { key: 'bank_transfer' as TypeFilter, label: 'Bank Transfers' },
                  { key: 'cash_receipt' as TypeFilter, label: 'Receipts' },
                  { key: 'contra' as TypeFilter, label: 'Contra' },
                ]
            ).map(t => (
              <button key={t.key} onClick={() => setTypeFilter(t.key)} style={{
                padding: '6px 12px', fontSize: 11, fontWeight: 600,
                background: typeFilter === t.key ? 'var(--accent)' : 'var(--surface)',
                color: typeFilter === t.key ? '#fff' : 'var(--text3)',
                border: '1px solid var(--border)', borderRadius: 'var(--r)', cursor: 'pointer',
              }}>{t.label}</button>
            ))}
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Date</th><th>Ref</th><th>Type</th><th>Vendor/Payee</th>
                    <th>Expense Category</th><th>Method</th><th>Posted By</th>
                    <th className="td-right">Amount (TZS)</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No {mode === 'expense' ? 'expense' : 'payment'} records for this period.</td></tr>
                    ) : filtered.map((r, i) => {
                      const cat = r.journal_id ? categoryMap[r.journal_id] : null
                      const clickable = onEdit && ['cash_payment', 'petty_cash', 'bank_transfer'].includes(r.type)
                      const editPage: Page = r.type === 'cash_payment' ? 'cash-payment' : r.type === 'petty_cash' ? 'petty-cash' : 'bank-transfer'
                      return (
                        <tr key={i}
                          onClick={clickable ? () => onEdit!(editPage, r.id) : undefined}
                          style={{ cursor: clickable ? 'pointer' : 'default' }}
                          onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'var(--surface2)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                          <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{r.posting_date}</td>
                          <td className="td-mono td-amber" style={{ fontSize: 11 }}>{r.ref}</td>
                          <td><span className={`pill ${TYPE_COLOR[r.type] || 'pill-gray'}`} style={{ fontSize: 9 }}>{TYPE_LABEL[r.type] || r.type}</span></td>
                          <td style={{ fontSize: 11 }}>{r.suppliers?.name || <span style={{ color: 'var(--text3)' }}>{r.description?.replace(/^Cash Payment — /, '') || '—'}</span>}</td>
                          <td style={{ fontSize: 11 }}>
                            {cat ? (
                              <span>
                                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', marginRight: 4, fontSize: 10 }}>{cat.account_code}</span>
                                {cat.account_name}
                              </span>
                            ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--text3)' }}>{r.payment_method || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--text3)' }}>{r.posted_by || '—'}</td>
                          <td className="td-right td-mono" style={{ fontSize: 12, fontWeight: 600, color: r.type === 'cash_receipt' ? 'var(--green)' : 'var(--red)' }}>{(r.total_amount || 0).toLocaleString()}</td>
                          <td><span className={`pill ${r.status === 'posted' ? 'pill-green' : r.status === 'pending_approval' ? 'pill-yellow' : 'pill-gray'}`} style={{ fontSize: 9 }}>{r.status}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--surface2)', fontWeight: 800 }}>
                      <td colSpan={7} style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 11, textTransform: 'uppercase', color: 'var(--text3)' }}>TOTALS — {filtered.length} records</td>
                      <td className="td-right td-mono" style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 14, padding: '12px 14px', fontWeight: 800 }}>{tzs(net)}</td>
                      <td></td>
                    </tr>
                    <tr style={{ background: 'var(--surface)', fontSize: 12 }}>
                      <td colSpan={7} style={{ padding: '6px 14px 6px 30px', color: 'var(--text3)' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--red)', borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }}></span>
                        Cash Out
                      </td>
                      <td className="td-right td-mono" style={{ color: 'var(--red)', fontWeight: 600 }}>{cashOut.toLocaleString()}</td>
                      <td></td>
                    </tr>
                    <tr style={{ background: 'var(--surface)', fontSize: 12 }}>
                      <td colSpan={7} style={{ padding: '6px 14px 6px 30px', color: 'var(--text3)' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--blue)', borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }}></span>
                        Bank Out
                      </td>
                      <td className="td-right td-mono" style={{ color: 'var(--blue)', fontWeight: 600 }}>{bankOut.toLocaleString()}</td>
                      <td></td>
                    </tr>
                    <tr style={{ background: 'var(--surface)', fontSize: 12 }}>
                      <td colSpan={7} style={{ padding: '6px 14px 6px 30px', color: 'var(--text3)' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--green)', borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }}></span>
                        Receipts In
                      </td>
                      <td className="td-right td-mono" style={{ color: 'var(--green)', fontWeight: 600 }}>{totalIn.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB 2: BUDGET vs ACTUAL
         ═══════════════════════════════════════════════════ */}
      {tab === 'budget' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>Month</div>
              <input type="month" className="form-input" style={{ width: 160, fontSize: 12 }} value={budgetMonth} onChange={e => setBudgetMonth(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={copyLastMonth}>Copy last month</button>
              <button className="btn btn-primary btn-sm" onClick={openBudgetSetup} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic n="plus" /> Set budgets</button>
            </div>
          </div>

          {budgetLines.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>No budgets or spend for {budgetMonth}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Click "Set budgets" to plan expenses for this month.</div>
              <button className="btn btn-primary btn-sm" onClick={openBudgetSetup}>Set budgets now</button>
            </div>
          ) : (() => {
            const totalBudget = budgetLines.reduce((s, l) => s + l.budget, 0)
            const totalActual = budgetLines.reduce((s, l) => s + l.actual, 0)
            const totalVariance = totalBudget - totalActual
            const totalPct = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0
            const overCount = budgetLines.filter(l => l.status === 'over').length
            const warnCount = budgetLines.filter(l => l.status === 'warning').length
            return (
              <>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
                  <div className="stat-card blue"><div className="stat-label">Total Budget</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(totalBudget)}</div><div className="stat-change">{budgetLines.filter(l => l.budget > 0).length} categories</div></div>
                  <div className="stat-card amber"><div className="stat-label">Total Spent</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(totalActual)}</div><div className="stat-change">{totalPct}% of budget</div></div>
                  <div className={`stat-card ${totalVariance >= 0 ? 'green' : 'red'}`}><div className="stat-label">Variance</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(Math.abs(totalVariance))}</div><div className="stat-change">{totalVariance >= 0 ? 'Under' : 'Over'} budget</div></div>
                  <div className={`stat-card ${overCount > 0 ? 'red' : warnCount > 0 ? 'yellow' : 'green'}`}><div className="stat-label">Status</div><div className="stat-value" style={{ fontSize: 18 }}>{overCount > 0 ? overCount + ' over' : warnCount > 0 ? warnCount + ' warn' : 'OK'}</div><div className="stat-change">Budget alerts</div></div>
                </div>

                <div className="card">
                  <div className="table-wrap">
                    <table>
                      <thead><tr>
                        <th>Code</th><th>Account</th><th>Category</th>
                        <th className="td-right">Budget</th><th className="td-right">Actual</th>
                        <th className="td-right">Variance</th><th>Progress</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                      </tr></thead>
                      <tbody>
                        {budgetLines.map((l, i) => (
                          <tr key={i}>
                            <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{l.account_code}</td>
                            <td className="td-bold" style={{ fontSize: 12 }}>{l.account_name}</td>
                            <td style={{ fontSize: 11, color: 'var(--text3)' }}>{l.account_category}</td>
                            <td className="td-right td-mono" style={{ color: 'var(--blue)' }}>{l.budget.toLocaleString()}</td>
                            <td className="td-right td-mono" style={{ color: 'var(--text)' }}>{l.actual.toLocaleString()}</td>
                            <td className="td-right td-mono" style={{ color: l.variance >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{Math.abs(l.variance).toLocaleString()}{l.variance >= 0 ? '' : ''}</td>
                            <td style={{ width: 180 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, height: 6, background: 'var(--surface3)', borderRadius: 3 }}>
                                  <div style={{ height: '100%', width: `${Math.min(100, l.pctUsed)}%`, background: l.status === 'over' ? 'var(--red)' : l.status === 'warning' ? 'var(--yellow)' : 'var(--green)', borderRadius: 3 }}></div>
                                </div>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, minWidth: 40, textAlign: 'right', color: l.status === 'over' ? 'var(--red)' : 'var(--text3)' }}>{l.pctUsed >= 999 ? '—' : l.pctUsed + '%'}</div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`pill ${l.status === 'over' ? 'pill-red' : l.status === 'warning' ? 'pill-yellow' : 'pill-green'}`} style={{ fontSize: 9 }}>
                                {l.status === 'over' ? 'OVER' : l.status === 'warning' ? 'WARN' : 'OK'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                          <td colSpan={3} className="td-bold">TOTALS</td>
                          <td className="td-right td-mono" style={{ color: 'var(--blue)' }}>{totalBudget.toLocaleString()}</td>
                          <td className="td-right td-mono">{totalActual.toLocaleString()}</td>
                          <td className="td-right td-mono" style={{ color: totalVariance >= 0 ? 'var(--green)' : 'var(--red)' }}>{Math.abs(totalVariance).toLocaleString()}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )
          })()}
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB 3: VENDORS
         ═══════════════════════════════════════════════════ */}
      {tab === 'vendors' && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            <div className="stat-card green"><div className="stat-label">Active Vendors</div><div className="stat-value">{vendorRows.length}</div><div className="stat-change">Paid in period</div></div>
            <div className="stat-card amber"><div className="stat-label">Top Vendor</div><div className="stat-value" style={{ fontSize: 14 }}>{vendorRows[0]?.name || '—'}</div><div className="stat-change up">{vendorRows[0] ? tzs(vendorRows[0].totalPaid) : ''}</div></div>
            <div className="stat-card red"><div className="stat-label">Total Paid</div><div className="stat-value" style={{ fontSize: 18 }}>{tzs(vendorRows.reduce((s, v) => s + v.totalPaid, 0))}</div><div className="stat-change">To all vendors</div></div>
            <div className="stat-card blue"><div className="stat-label">Avg Payment</div><div className="stat-value" style={{ fontSize: 18 }}>{vendorRows.length > 0 ? tzs(Math.round(vendorRows.reduce((s, v) => s + v.totalPaid, 0) / vendorRows.reduce((s, v) => s + v.txCount, 0))) : 'TZS 0'}</div><div className="stat-change">Per transaction</div></div>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Rank</th><th>Vendor / Payee</th>
                <th className="td-right">Payments</th>
                <th className="td-right">Total Paid</th>
                <th className="td-right">Avg Payment</th>
                <th className="td-right">Last Paid</th>
                <th>Share</th>
              </tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>Loading…</td></tr>
                ) : vendorRows.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No vendor payments in this period.</td></tr>
                ) : (() => {
                  const total = vendorRows.reduce((s, v) => s + v.totalPaid, 0)
                  return vendorRows.map((v, i) => {
                    const pct = total > 0 ? (v.totalPaid / total) * 100 : 0
                    return (
                      <tr key={i}>
                        <td className="td-mono" style={{ color: i === 0 ? 'var(--yellow)' : 'var(--text3)', fontWeight: 700 }}>#{i + 1}</td>
                        <td className="td-bold">{v.name}{v.supplierId.startsWith('__no_supplier') && <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 6, fontWeight: 500 }}>(no supplier record)</span>}</td>
                        <td className="td-right td-mono">{v.txCount}</td>
                        <td className="td-right td-mono" style={{ color: 'var(--red)', fontWeight: 700 }}>{v.totalPaid.toLocaleString()}</td>
                        <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{v.avgPayment.toLocaleString()}</td>
                        <td className="td-right td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{v.lastPaid}</td>
                        <td style={{ width: 180 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 5, background: 'var(--surface3)', borderRadius: 3 }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3 }}></div>
                            </div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 34, textAlign: 'right' }}>{pct.toFixed(0)}%</div>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                })()}
                {!loading && vendorRows.length > 0 && (
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={2} className="td-bold">TOTALS</td>
                    <td className="td-right td-mono">{vendorRows.reduce((s, v) => s + v.txCount, 0)}</td>
                    <td className="td-right td-mono" style={{ color: 'var(--red)' }}>{vendorRows.reduce((s, v) => s + v.totalPaid, 0).toLocaleString()}</td>
                    <td colSpan={3}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB 4: RECURRING EXPENSES
         ═══════════════════════════════════════════════════ */}
      {tab === 'recurring' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                Set up rent, salaries, subscriptions and other expenses that happen on a fixed schedule.
                The system flags which ones are overdue this month.
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openNewRecurring} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic n="plus" /> Add recurring expense</button>
          </div>

          {/* Unpaid / due alerts */}
          {unpaid.filter((u: UnpaidRecurring) => u.is_due).length > 0 && (
            <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--yellow)' }}>
              <div className="card-header" style={{ marginBottom: 12 }}>
                <div>
                  <div className="card-title">Due This Period</div>
                  <div className="card-sub">{unpaid.filter((u: UnpaidRecurring) => u.is_due).length} recurring expense{unpaid.filter((u: UnpaidRecurring) => u.is_due).length > 1 ? 's' : ''} not yet paid</div>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Expense</th><th>Account / Vendor</th><th>Frequency</th>
                    <th className="td-right">Amount</th><th className="td-right">Due in</th>
                    <th>Last Paid</th>
                  </tr></thead>
                  <tbody>
                    {unpaid.filter((u: UnpaidRecurring) => u.is_due).map((u: UnpaidRecurring) => (
                      <tr key={u.id}>
                        <td className="td-bold">{u.name}{u.description && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{u.description}</div>}</td>
                        <td style={{ fontSize: 11 }}>
                          {u.account_code ? (
                            <span><span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', marginRight: 4 }}>{u.account_code}</span>{u.account_name}</span>
                          ) : u.supplier_name ? u.supplier_name : <span style={{ color: 'var(--text3)' }}>—</span>}
                        </td>
                        <td><span className="pill pill-gray" style={{ fontSize: 9 }}>{u.frequency}</span></td>
                        <td className="td-right td-mono" style={{ color: 'var(--red)', fontWeight: 600 }}>{u.amount.toLocaleString()}</td>
                        <td className="td-right td-mono" style={{ color: u.days_until_due != null && u.days_until_due < 0 ? 'var(--red)' : u.days_until_due != null && u.days_until_due <= 3 ? 'var(--yellow)' : 'var(--text3)', fontSize: 11 }}>
                          {u.days_until_due == null ? 'now' : u.days_until_due < 0 ? `${Math.abs(u.days_until_due)}d overdue` : u.days_until_due === 0 ? 'today' : `${u.days_until_due}d`}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{u.last_paid_date || 'Never'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* All recurring expenses */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: 12 }}>
              <div>
                <div className="card-title">All Recurring Expenses</div>
                <div className="card-sub">{recurring.length} total · {recurring.filter((r: RecurringExpense) => r.is_active).length} active</div>
              </div>
            </div>
            {recurring.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>
                <div style={{ fontSize: 13, marginBottom: 8 }}>No recurring expenses yet</div>
                <div style={{ fontSize: 11, marginBottom: 16 }}>Add rent, salaries, subscriptions, airtime, internet etc. to track them.</div>
                <button className="btn btn-primary btn-sm" onClick={openNewRecurring}>Add your first recurring expense</button>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Name</th><th>Frequency</th><th>Day</th>
                    <th className="td-right">Amount</th>
                    <th>Last Paid</th><th>Next Due</th>
                    <th style={{ textAlign: 'center' }}>Active</th>
                    <th></th>
                  </tr></thead>
                  <tbody>
                    {recurring.map((r: RecurringExpense) => (
                      <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                        <td>
                          <div className="td-bold">{r.name}</div>
                          {r.description && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.description}</div>}
                        </td>
                        <td><span className="pill pill-gray" style={{ fontSize: 9 }}>{r.frequency}</span></td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {r.frequency === 'weekly' && r.day_of_week != null
                            ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][r.day_of_week]
                            : r.day_of_month ? `day ${r.day_of_month}` : '—'}
                        </td>
                        <td className="td-right td-mono" style={{ fontWeight: 600 }}>{r.amount.toLocaleString()}</td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{r.last_paid_date || 'Never'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{r.next_due_date || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                            <input type="checkbox" checked={r.is_active} onChange={e => toggleRecurring(r.id, e.target.checked)} />
                          </label>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', marginRight: 4 }} onClick={() => openEditRecurring(r)}><Ic n="edit" s={12} /></button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', color: 'var(--red)' }} onClick={() => deleteRecurring(r)}><Ic n="trash" s={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                      <td colSpan={3}>TOTAL MONTHLY COMMITMENT</td>
                      <td className="td-right td-mono" style={{ color: 'var(--red)' }}>
                        {recurring
                          .filter((r: RecurringExpense) => r.is_active)
                          .reduce((s: number, r: RecurringExpense) => s + (r.frequency === 'monthly' ? r.amount : r.frequency === 'weekly' ? r.amount * 4 : r.frequency === 'quarterly' ? r.amount / 3 : r.amount / 12), 0)
                          .toLocaleString()}
                      </td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          BUDGET SETUP MODAL
         ═══════════════════════════════════════════════════ */}
      {showBudgetSetup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowBudgetSetup(false)}>
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', maxWidth: 780, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800 }}>Set Expense Budgets</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Amounts in TZS — leave blank to skip</div>
              </div>
              <button onClick={() => setShowBudgetSetup(false)} className="btn btn-ghost btn-sm">×</button>
            </div>

            {/* Mode + period */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
                {(['monthly', 'quarterly', 'annual'] as const).map(m => (
                  <button key={m} onClick={() => setSetupMode(m)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, background: setupMode === m ? 'var(--accent)' : 'transparent', color: setupMode === m ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', textTransform: 'capitalize' }}>{m}</button>
                ))}
              </div>
              {setupMode === 'monthly' && (
                <input type="month" className="form-input" style={{ fontSize: 12 }} value={setupMonth} onChange={e => setSetupMonth(e.target.value)} />
              )}
              {setupMode === 'quarterly' && (
                <>
                  <select className="form-input" style={{ fontSize: 12, width: 90 }} value={setupQuarter} onChange={e => setSetupQuarter(parseInt(e.target.value))}>
                    <option value={1}>Q1</option><option value={2}>Q2</option><option value={3}>Q3</option><option value={4}>Q4</option>
                  </select>
                  <input type="number" className="form-input" style={{ fontSize: 12, width: 90 }} value={setupYear} onChange={e => setSetupYear(parseInt(e.target.value))} />
                </>
              )}
              {setupMode === 'annual' && (
                <input type="number" className="form-input" style={{ fontSize: 12, width: 100 }} value={setupYear} onChange={e => setSetupYear(parseInt(e.target.value))} />
              )}
              <div style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto', alignSelf: 'center' }}>
                {setupMode === 'monthly' ? 'Monthly amounts' : setupMode === 'quarterly' ? 'Quarterly total — split across 3 months' : 'Annual total — split across 12 months'}
              </div>
            </div>

            <div className="table-wrap" style={{ maxHeight: '55vh', overflow: 'auto' }}>
              <table>
                <thead><tr><th>Code</th><th>Expense Account</th><th className="td-right">{setupMode === 'monthly' ? 'Monthly' : setupMode === 'quarterly' ? 'Quarterly' : 'Annual'} Budget (TZS)</th></tr></thead>
                <tbody>
                  {expenseAccountsOnly.map(a => (
                    <tr key={a.id}>
                      <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{a.code}</td>
                      <td style={{ fontSize: 12 }}>{a.name} <span style={{ color: 'var(--text3)', fontSize: 10 }}>· {a.category}</span></td>
                      <td style={{ width: 180 }}>
                        <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', textAlign: 'right', fontSize: 12 }} placeholder="0" value={budgetInputs[a.id] || ''} onChange={e => setBudgetInputs({ ...budgetInputs, [a.id]: e.target.value })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setShowBudgetSetup(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveBudgets} disabled={savingBudget}>{savingBudget ? 'Saving…' : 'Save budgets'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          RECURRING EXPENSE MODAL
         ═══════════════════════════════════════════════════ */}
      {showRecurringForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => { setShowRecurringForm(false); resetRecurringForm() }}>
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', maxWidth: 560, width: '100%', padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800 }}>{editingRecurring ? 'Edit Recurring Expense' : 'Add Recurring Expense'}</div>
              <button onClick={() => { setShowRecurringForm(false); resetRecurringForm() }} className="btn btn-ghost btn-sm">×</button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Name</div>
                <input className="form-input" placeholder="e.g. Office rent, Staff airtime" value={recurringForm.name} onChange={e => setRecurringForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Description (optional)</div>
                <input className="form-input" placeholder="Short note" value={recurringForm.description} onChange={e => setRecurringForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Amount (TZS)</div>
                  <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={recurringForm.amount} onChange={e => setRecurringForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Frequency</div>
                  <select className="form-input" value={recurringForm.frequency} onChange={e => setRecurringForm(f => ({ ...f, frequency: e.target.value as RecurringExpense['frequency'] }))}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>
                  {recurringForm.frequency === 'weekly' ? 'Day of Week' : 'Day of Month'}
                </div>
                {recurringForm.frequency === 'weekly' ? (
                  <select className="form-input" value={recurringForm.day_of_week} onChange={e => setRecurringForm(f => ({ ...f, day_of_week: e.target.value }))}>
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                    <option value="0">Sunday</option>
                  </select>
                ) : (
                  <input type="number" min="1" max="31" className="form-input" value={recurringForm.day_of_month} onChange={e => setRecurringForm(f => ({ ...f, day_of_month: e.target.value }))} />
                )}
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Expense Account (optional)</div>
                <select className="form-input" value={recurringForm.account_id} onChange={e => setRecurringForm(f => ({ ...f, account_id: e.target.value }))}>
                  <option value="">— Select account —</option>
                  {expenseAccountsOnly.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Supplier (optional)</div>
                <select className="form-input" value={recurringForm.supplier_id} onChange={e => setRecurringForm(f => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">— Select supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Notes (optional)</div>
                <textarea className="form-input" style={{ height: 60, resize: 'vertical' }} value={recurringForm.notes} onChange={e => setRecurringForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => { setShowRecurringForm(false); resetRecurringForm() }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveRecurring}>{editingRecurring ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
