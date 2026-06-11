import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { tzs, getPostedBy } from '../lib/utils'
import { useExpenseBudgets, loadActualSpend, buildBudgetLines, getMonthPeriod, distributeAnnual, distributeQuarterly } from '../lib/useExpenseBudgets'
import type { BudgetLine } from '../lib/useExpenseBudgets'
import Toast from '../components/Toast'

interface AccountBalance { id: string; code: string; name: string; type: string; category: string; balance: number }

type Tab = 'actuals' | 'budget'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function PnL() {
  const [tab, setTab] = useState<Tab>('actuals')
  const [accounts, setAccounts] = useState<AccountBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // ── Actuals tab: period filtering ─────────────────────────
  const [periodType, setPeriodType] = useState<'cumulative' | 'monthly' | 'custom'>('cumulative')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [customFrom, setCustomFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split('T')[0])

  // Period-filtered actuals (for monthly/custom views)
  const [periodActuals, setPeriodActuals] = useState<Record<string, { debit: number; credit: number }>>({})
  const [periodLoading, setPeriodLoading] = useState(false)

  // ── Budget tab state ──────────────────────────────────────
  const { budgets, bulkUpsert, load: reloadBudgets } = useExpenseBudgets()
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
  const [saving, setSaving] = useState(false)

  // ── Load accounts ─────────────────────────────────────────
  const loadPnL = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('accounts')
      .select('id, code, name, type, category, balance')
      .in('type', ['revenue', 'cogs', 'expense', 'other'])
      .eq('is_active', true)
      .order('code')
    if (data) setAccounts(data)
    setLoading(false)
  }, [])

  // ── Load period-filtered actuals ──────────────────────────
  const loadPeriodActuals = useCallback(async () => {
    if (periodType === 'cumulative') return

    let fromDate: string, toDate: string
    if (periodType === 'monthly') {
      const [y, m] = selectedMonth.split('-').map(Number)
      const p = getMonthPeriod(y, m - 1)
      fromDate = p.start; toDate = p.end
    } else {
      fromDate = customFrom; toDate = customTo
    }

    setPeriodLoading(true)
    const accountIds = accounts.map(a => a.id)
    if (accountIds.length === 0) { setPeriodLoading(false); return }

    const { data: lines } = await supabase
      .from('journal_lines')
      .select('account_id, debit, credit, journals!inner(posting_date, status)')
      .in('account_id', accountIds)
      .gte('journals.posting_date', fromDate)
      .lte('journals.posting_date', toDate)
      .eq('journals.status', 'posted')

    const result: Record<string, { debit: number; credit: number }> = {}
    accountIds.forEach(id => { result[id] = { debit: 0, credit: 0 } })
    if (lines) {
      lines.forEach((l: any) => {
        if (!result[l.account_id]) result[l.account_id] = { debit: 0, credit: 0 }
        result[l.account_id].debit += (l.debit || 0)
        result[l.account_id].credit += (l.credit || 0)
      })
    }
    setPeriodActuals(result)
    setPeriodLoading(false)
  }, [periodType, selectedMonth, customFrom, customTo, accounts])

  // ── Load budget vs actual ─────────────────────────────────
  const loadBudgetComparison = useCallback(async () => {
    const [y, m] = budgetMonth.split('-').map(Number)
    const period = getMonthPeriod(y, m - 1)

    const expenseAccounts = accounts.filter(a => a.type === 'expense')
    if (expenseAccounts.length === 0) return

    // Get budgets for this month
    const monthBudgets = budgets.filter(b => b.period_start === period.start)
    const budgetMap: Record<string, number> = {}
    monthBudgets.forEach(b => { budgetMap[b.account_id] = b.budget_amount })

    // Get actual spend
    const actualMap = await loadActualSpend(expenseAccounts.map(a => a.id), period.start, period.end)

    const lines = buildBudgetLines(
      expenseAccounts.map(a => ({ id: a.id, code: a.code, name: a.name, category: a.category })),
      budgetMap,
      actualMap
    )
    setBudgetLines(lines)
  }, [budgetMonth, accounts, budgets])

  useEffect(() => { loadPnL() }, [loadPnL])
  useEffect(() => { if (accounts.length > 0 && periodType !== 'cumulative') loadPeriodActuals() }, [accounts, periodType, selectedMonth, customFrom, customTo])
  useEffect(() => { if (tab === 'budget' && accounts.length > 0) loadBudgetComparison() }, [tab, budgetMonth, accounts, budgets])

  // ── Account value helper (cumulative vs period) ───────────
  const getAccountValue = (a: AccountBalance): number => {
    if (periodType === 'cumulative') return Math.abs(a.balance)
    const pa = periodActuals[a.id]
    if (!pa) return 0
    // Revenue accounts: value = credits - debits (revenue is credited)
    if (a.type === 'revenue') return Math.max(0, pa.credit - pa.debit)
    // Expense/COGS accounts: value = debits - credits (expenses are debited)
    return Math.max(0, pa.debit - pa.credit)
  }

  // ── PnL calculations ─────────────────────────────────────
  const revenue = accounts.filter(a => a.type === 'revenue')
  const cogs = accounts.filter(a => a.type === 'cogs')
  const expenses = accounts.filter(a => a.type === 'expense')

  const totalRevenue = revenue.reduce((s, a) => s + getAccountValue(a), 0)
  const totalCogs = cogs.reduce((s, a) => s + getAccountValue(a), 0)
  const grossProfit = totalRevenue - totalCogs
  const totalExpenses = expenses.reduce((s, a) => s + getAccountValue(a), 0)
  const netProfit = grossProfit - totalExpenses
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0'

  // ── Budget setup helpers ──────────────────────────────────
  const openBudgetSetup = () => {
    const expAccounts = accounts.filter(a => a.type === 'expense')
    const inputs: Record<string, string> = {}

    if (setupMode === 'monthly') {
      const [y, m] = setupMonth.split('-').map(Number)
      const period = getMonthPeriod(y, m - 1)
      expAccounts.forEach(a => {
        const existing = budgets.find(b => b.account_id === a.id && b.period_start === period.start)
        inputs[a.id] = existing ? String(existing.budget_amount) : ''
      })
    } else {
      expAccounts.forEach(a => { inputs[a.id] = '' })
    }

    setBudgetInputs(inputs)
    setShowBudgetSetup(true)
  }

  const saveBudgets = async () => {
    setSaving(true)
    const expAccounts = accounts.filter(a => a.type === 'expense')
    const items: {
      account_id: string; period_start: string; period_end: string
      budget_amount: number; notes: string | null; created_by: string
    }[] = []

    if (setupMode === 'monthly') {
      const [y, m] = setupMonth.split('-').map(Number)
      const period = getMonthPeriod(y, m - 1)
      expAccounts.forEach(a => {
        const val = parseFloat(budgetInputs[a.id] || '0')
        if (val > 0) {
          items.push({
            account_id: a.id, period_start: period.start, period_end: period.end,
            budget_amount: val, notes: null, created_by: getPostedBy()
          })
        }
      })
    } else if (setupMode === 'quarterly') {
      const startMonth = (setupQuarter - 1) * 3
      for (let i = 0; i < 3; i++) {
        const period = getMonthPeriod(setupYear, startMonth + i)
        expAccounts.forEach(a => {
          const qVal = parseFloat(budgetInputs[a.id] || '0')
          if (qVal > 0) {
            items.push({
              account_id: a.id, period_start: period.start, period_end: period.end,
              budget_amount: distributeQuarterly(qVal), notes: `Q${setupQuarter} ${setupYear} auto-split`,
              created_by: getPostedBy()
            })
          }
        })
      }
    } else {
      for (let m = 0; m < 12; m++) {
        const period = getMonthPeriod(setupYear, m)
        expAccounts.forEach(a => {
          const annVal = parseFloat(budgetInputs[a.id] || '0')
          if (annVal > 0) {
            items.push({
              account_id: a.id, period_start: period.start, period_end: period.end,
              budget_amount: distributeAnnual(annVal), notes: `FY${setupYear} auto-split`,
              created_by: getPostedBy()
            })
          }
        })
      }
    }

    if (items.length === 0) {
      setToast({ msg: 'No budget amounts entered', type: 'error' })
      setSaving(false); return
    }

    const res = await bulkUpsert(items)
    setSaving(false)
    if (res.success) {
      setToast({ msg: `Saved ${items.length} budget entries`, type: 'success' })
      setShowBudgetSetup(false)
    } else {
      setToast({ msg: res.error || 'Failed to save', type: 'error' })
    }
  }

  // ── Budget totals ─────────────────────────────────────────
  const totalBudget = budgetLines.reduce((s, l) => s + l.budget, 0)
  const totalActual = budgetLines.reduce((s, l) => s + l.actual, 0)
  const totalVariance = totalBudget - totalActual
  const totalPctUsed = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0

  // ── Period label ──────────────────────────────────────────
  const periodLabel = () => {
    if (periodType === 'cumulative') return 'Cumulative (All time)'
    if (periodType === 'monthly') {
      const [y, m] = selectedMonth.split('-').map(Number)
      return `${MONTHS_SHORT[m - 1]} ${y}`
    }
    return `${customFrom} to ${customTo}`
  }

  // Days into month / total days for burn rate
  const getBudgetMonthProgress = () => {
    const [y, m] = budgetMonth.split('-').map(Number)
    const period = getMonthPeriod(y, m - 1)
    const totalDays = Math.ceil((new Date(period.end).getTime() - new Date(period.start).getTime()) / 86400000) + 1
    const today = new Date()
    const start = new Date(period.start)
    const elapsed = Math.max(1, Math.min(totalDays, Math.ceil((today.getTime() - start.getTime()) / 86400000)))
    const isCurrent = today >= start && today <= new Date(period.end)
    return { totalDays, elapsed, remaining: Math.max(0, totalDays - elapsed), isCurrent }
  }

  // ── Row component ─────────────────────────────────────────
  const Row = ({ label, value, indent, bold, negative }: { label: string; value: number; indent?: boolean; bold?: boolean; negative?: boolean; key?: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? 14 : 12, fontWeight: bold ? 700 : 400, padding: bold ? '10px 0' : '5px 0', borderTop: bold ? '1px solid var(--border2)' : 'none', marginTop: bold ? 6 : 0 }}>
      <span style={{ color: indent ? 'var(--text3)' : 'var(--text)', paddingLeft: indent ? 16 : 0 }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', color: negative ? 'var(--red)' : value >= 0 ? 'var(--green)' : 'var(--red)' }}>
        {negative ? `(${Math.abs(value).toLocaleString()})` : value.toLocaleString()}
      </span>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(133,194,190,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" fill="none" stroke="#85c2be" strokeWidth="1.8" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
          <div>
            <div className="page-title">Profit & Loss</div>
            <div className="page-sub">{tab === 'actuals' ? periodLabel() : `Budget vs Actual`} · <span className="sync-dot"></span> Live</div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => { loadPnL(); reloadBudgets() }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Refresh
          </button>
        </div>
      </div>

      {/* ── TAB BAR ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[
          { key: 'actuals' as Tab, label: 'P&L Statement', icon: 'M18 20V10M12 20V4M6 20v-6' },
          { key: 'budget' as Tab, label: 'Budget vs Actual', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t.key ? 'var(--accent)' : 'var(--text3)',
            fontWeight: tab === t.key ? 600 : 400, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={t.icon}/></svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════
          TAB 1: P&L ACTUALS
         ═══════════════════════════════════════════════════ */}
      {tab === 'actuals' && (
        <>
          {/* Period selector */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
              {(['cumulative', 'monthly', 'custom'] as const).map(p => (
                <button key={p} onClick={() => setPeriodType(p)} style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: periodType === p ? 'var(--accent)' : 'transparent',
                  color: periodType === p ? '#fff' : 'var(--text3)'
                }}>{p === 'cumulative' ? 'All Time' : p === 'monthly' ? 'Monthly' : 'Custom'}</button>
              ))}
            </div>
            {periodType === 'monthly' && (
              <input type="month" className="form-input" style={{ width: 160, padding: '6px 10px', fontSize: 12 }} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
            )}
            {periodType === 'custom' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>to</span>
                <input type="date" className="form-input" style={{ width: 140, padding: '6px 10px', fontSize: 12 }} value={customTo} onChange={e => setCustomTo(e.target.value)} />
                <button className="btn btn-primary btn-sm" onClick={loadPeriodActuals}>Load</button>
              </div>
            )}
            {periodType !== 'cumulative' && periodLoading && (
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Loading...</span>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3)' }}>Loading P&L...</div>
          ) : (
            <div className="grid g2">
              <div className="card">
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 14, letterSpacing: 1 }}>Revenue</div>
                {revenue.filter(a => getAccountValue(a) > 0).map((a, i) => (
                  <Row key={i} label={`${a.code} — ${a.name}`} value={getAccountValue(a)} indent />
                ))}
                {revenue.filter(a => getAccountValue(a) > 0).length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', paddingLeft: 16 }}>No revenue posted yet</div>}
                <Row label="Total Revenue" value={totalRevenue} bold />

                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginTop: 20, marginBottom: 14, letterSpacing: 1 }}>Cost of Goods Sold</div>
                {cogs.filter(a => getAccountValue(a) > 0).map((a, i) => (
                  <Row key={i} label={`${a.code} — ${a.name}`} value={getAccountValue(a)} indent negative />
                ))}
                {cogs.filter(a => getAccountValue(a) > 0).length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', paddingLeft: 16 }}>No COGS posted yet</div>}
                <Row label="Total COGS" value={totalCogs} bold negative />
                <Row label="Gross Profit" value={grossProfit} bold />
              </div>

              <div className="card">
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 14, letterSpacing: 1 }}>Operating Expenses</div>
                {expenses.filter(a => getAccountValue(a) > 0).map((a, i) => (
                  <Row key={i} label={`${a.code} — ${a.name}`} value={getAccountValue(a)} indent negative />
                ))}
                {expenses.filter(a => getAccountValue(a) > 0).length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', paddingLeft: 16 }}>No expenses posted yet</div>}
                <Row label="Total Expenses" value={totalExpenses} bold negative />

                <div style={{ height: 1, background: 'var(--border2)', margin: '20px 0' }}></div>

                <div style={{ background: netProfit >= 0 ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${netProfit >= 0 ? 'rgba(0,229,160,.2)' : 'rgba(255,71,87,.2)'}`, borderRadius: 'var(--r)', padding: 16 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Net Profit — {periodLabel()}</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 800, color: netProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    TZS {Math.abs(netProfit).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                    Margin: {margin}% · Revenue: {tzs(totalRevenue)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB 2: BUDGET VS ACTUAL
         ═══════════════════════════════════════════════════ */}
      {tab === 'budget' && (
        <>
          {/* Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>Viewing:</span>
              <input type="month" className="form-input" style={{ width: 160, padding: '6px 10px', fontSize: 12 }} value={budgetMonth} onChange={e => setBudgetMonth(e.target.value)} />
              {/* Quick presets */}
              {(() => {
                const now = new Date()
                const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                const lastMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0')}`
                return (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setBudgetMonth(thisMonth)}>This Month</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setBudgetMonth(lastMonth)}>Last Month</button>
                  </div>
                )
              })()}
            </div>
            <button className="btn btn-primary" onClick={openBudgetSetup}>Set Budgets</button>
          </div>

          {/* Summary cards */}
          <div className="grid g4" style={{ marginBottom: 20 }}>
            <div className="stat-card blue">
              <div className="stat-label">Total Budget</div>
              <div className="stat-value">{tzs(totalBudget)}</div>
              <div className="stat-change">{budgetLines.filter(l => l.budget > 0).length} accounts budgeted</div>
            </div>
            <div className={`stat-card ${totalPctUsed > 100 ? 'red' : totalPctUsed > 80 ? 'amber' : 'green'}`}>
              <div className="stat-label">Total Spent</div>
              <div className="stat-value">{tzs(totalActual)}</div>
              <div className={`stat-change ${totalPctUsed > 100 ? 'down' : 'up'}`}>{totalPctUsed}% of budget used</div>
            </div>
            <div className={`stat-card ${totalVariance >= 0 ? 'green' : 'red'}`}>
              <div className="stat-label">Variance</div>
              <div className="stat-value">{totalVariance >= 0 ? '+' : ''}{tzs(totalVariance)}</div>
              <div className={`stat-change ${totalVariance >= 0 ? 'up' : 'down'}`}>{totalVariance >= 0 ? 'Under budget' : 'Over budget'}</div>
            </div>
            {(() => {
              const mp = getBudgetMonthProgress()
              return (
                <div className="stat-card amber">
                  <div className="stat-label">Month Progress</div>
                  <div className="stat-value">{mp.isCurrent ? `Day ${mp.elapsed}/${mp.totalDays}` : 'Ended'}</div>
                  <div className="stat-change">{mp.remaining} days remaining</div>
                </div>
              )
            })()}
          </div>

          {/* Overall progress bar */}
          {totalBudget > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>Overall Budget Utilization</span>
                <span style={{ fontFamily: 'var(--mono)', color: totalPctUsed > 100 ? 'var(--red)' : totalPctUsed > 80 ? 'var(--yellow)' : 'var(--green)', fontWeight: 700 }}>{totalPctUsed}%</span>
              </div>
              <div style={{ height: 12, background: 'var(--surface3)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                {/* Time progress marker */}
                {(() => {
                  const mp = getBudgetMonthProgress()
                  const timePct = mp.isCurrent ? Math.round((mp.elapsed / mp.totalDays) * 100) : 100
                  return (
                    <div style={{
                      position: 'absolute', left: `${timePct}%`, top: 0, bottom: 0,
                      width: 2, background: 'var(--text3)', zIndex: 2, opacity: 0.5
                    }} title={`${timePct}% of month elapsed`}></div>
                  )
                })()}
                <div style={{
                  height: '100%', width: `${Math.min(100, totalPctUsed)}%`,
                  background: totalPctUsed > 100 ? 'var(--red)' : totalPctUsed > 80 ? 'var(--yellow)' : 'var(--green)',
                  borderRadius: 6, transition: 'width .6s ease'
                }}></div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                Thin line = time elapsed in month ({getBudgetMonthProgress().isCurrent ? `${Math.round((getBudgetMonthProgress().elapsed / getBudgetMonthProgress().totalDays) * 100)}%` : 'month ended'})
              </div>
            </div>
          )}

          {/* Budget lines table */}
          {budgetLines.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Code</th><th>Account</th><th>Category</th>
                  <th className="td-right">Budget</th><th className="td-right">Actual</th>
                  <th className="td-right">Variance</th><th style={{ width: 160 }}>Usage</th>
                  <th style={{ width: 60 }}>Status</th>
                </tr></thead>
                <tbody>
                  {budgetLines.map((l, i) => (
                    <tr key={i}>
                      <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{l.account_code}</td>
                      <td className="td-bold" style={{ fontSize: 12 }}>{l.account_name}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{l.account_category}</td>
                      <td className="td-right td-mono" style={{ color: 'var(--text3)' }}>{l.budget.toLocaleString()}</td>
                      <td className="td-right td-mono" style={{ fontWeight: 600 }}>{l.actual.toLocaleString()}</td>
                      <td className="td-right td-mono" style={{ color: l.variance >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                        {l.variance >= 0 ? '+' : ''}{l.variance.toLocaleString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${Math.min(100, l.pctUsed)}%`,
                              background: l.status === 'over' ? 'var(--red)' : l.status === 'warning' ? 'var(--yellow)' : 'var(--green)',
                              borderRadius: 3, transition: 'width .4s ease'
                            }}></div>
                          </div>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 32, textAlign: 'right' }}>{l.pctUsed}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${l.status === 'over' ? 'pill-red' : l.status === 'warning' ? 'pill-yellow' : 'pill-green'}`} style={{ fontSize: 9 }}>
                          {l.status === 'over' ? 'OVER' : l.status === 'warning' ? 'WARN' : 'OK'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={3} className="td-bold">TOTALS</td>
                    <td className="td-right td-mono">{totalBudget.toLocaleString()}</td>
                    <td className="td-right td-mono">{totalActual.toLocaleString()}</td>
                    <td className="td-right td-mono" style={{ color: totalVariance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {totalVariance >= 0 ? '+' : ''}{totalVariance.toLocaleString()}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ marginBottom: 12 }}><svg width="40" height="40" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg></div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No budgets set for this month</div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Set expense budgets to track spending against your plan.</div>
              <button className="btn btn-primary" onClick={openBudgetSetup}>Set Budgets</button>
            </div>
          )}

          {/* Accounts with spend but no budget */}
          {(() => {
            const unbugeted = budgetLines.filter(l => l.budget === 0 && l.actual > 0)
            if (unbugeted.length === 0) return null
            return (
              <div style={{ marginTop: 20, padding: 16, background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--yellow)' }}>Unbudgeted Spend</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>These accounts have actual spend but no budget set:</div>
                {unbugeted.map((l, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                    <span>{l.account_code} — {l.account_name}</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{tzs(l.actual)}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          BUDGET SETUP MODAL
         ═══════════════════════════════════════════════════ */}
      {showBudgetSetup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={e => { if (e.target === e.currentTarget) setShowBudgetSetup(false) }}>
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Set Expense Budgets</div>

            {/* Mode selector */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
                {(['monthly', 'quarterly', 'annual'] as const).map(m => (
                  <button key={m} onClick={() => setSetupMode(m)} style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: setupMode === m ? 'var(--accent)' : 'transparent',
                    color: setupMode === m ? '#fff' : 'var(--text3)'
                  }}>{m === 'monthly' ? 'Monthly' : m === 'quarterly' ? 'Quarterly' : 'Annual'}</button>
                ))}
              </div>
              {setupMode === 'monthly' && (
                <input type="month" className="form-input" style={{ width: 160, padding: '6px 10px', fontSize: 12 }} value={setupMonth} onChange={e => setSetupMonth(e.target.value)} />
              )}
              {setupMode === 'quarterly' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select className="form-input" style={{ width: 80, padding: '6px 10px', fontSize: 12 }} value={setupQuarter} onChange={e => setSetupQuarter(parseInt(e.target.value))}>
                    <option value={1}>Q1</option><option value={2}>Q2</option><option value={3}>Q3</option><option value={4}>Q4</option>
                  </select>
                  <input type="number" className="form-input" style={{ width: 80, padding: '6px 10px', fontSize: 12 }} value={setupYear} onChange={e => setSetupYear(parseInt(e.target.value))} />
                </div>
              )}
              {setupMode === 'annual' && (
                <input type="number" className="form-input" style={{ width: 100, padding: '6px 10px', fontSize: 12 }} value={setupYear} onChange={e => setSetupYear(parseInt(e.target.value))} />
              )}
            </div>

            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14, background: 'var(--surface2)', padding: 10, borderRadius: 'var(--r)' }}>
              {setupMode === 'monthly' && 'Enter the budget amount for each expense account for this specific month.'}
              {setupMode === 'quarterly' && 'Enter the total quarterly amount per account. It will be split evenly across 3 months.'}
              {setupMode === 'annual' && 'Enter the total annual amount per account. It will be split evenly across 12 months.'}
            </div>

            {/* Account budget inputs */}
            <div style={{ display: 'grid', gap: 8, maxHeight: 400, overflow: 'auto' }}>
              {accounts.filter(a => a.type === 'expense').map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{a.code} · {a.category}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 180 }}>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>TZS</span>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: 140, padding: '6px 8px', fontSize: 12, fontFamily: 'var(--mono)', textAlign: 'right' }}
                      placeholder="0"
                      value={budgetInputs[a.id] || ''}
                      onChange={e => setBudgetInputs(prev => ({ ...prev, [a.id]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Total preview */}
            {(() => {
              let total = 0
              Object.keys(budgetInputs).forEach(k => { total += parseFloat(budgetInputs[k]) || 0 })
              const monthlyTotal = setupMode === 'annual' ? distributeAnnual(total) * 12 : setupMode === 'quarterly' ? total : total
              return total > 0 ? (
                <div style={{ marginTop: 14, padding: 12, background: 'var(--surface2)', borderRadius: 'var(--r)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>
                    Total {setupMode === 'annual' ? 'Annual' : setupMode === 'quarterly' ? 'Quarterly' : 'Monthly'} Budget:
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 700 }}>
                    {tzs(monthlyTotal)}
                    {setupMode === 'annual' && <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 8 }}>({tzs(distributeAnnual(total))}/mo)</span>}
                    {setupMode === 'quarterly' && <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 8 }}>({tzs(distributeQuarterly(total))}/mo)</span>}
                  </span>
                </div>
              ) : null
            })()}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowBudgetSetup(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveBudgets} disabled={saving}>
                {saving ? 'Saving...' : 'Save Budgets'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
