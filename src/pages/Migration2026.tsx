import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'

interface MigrationSale {
  id: string
  month: string
  sales: number
  imported: boolean
}

interface MigrationPayment {
  id: string
  month: string
  expense_account: string
  amount: number
  imported: boolean
}

const MONTHS = ['January', 'February', 'March']

export default function Migration2026() {
  const [activeTab, setActiveTab] = useState<'sales' | 'payments'>('sales')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Sales state
  const [sales, setSales] = useState<MigrationSale[]>([])
  const [newSaleMonth, setNewSaleMonth] = useState('January')
  const [newSaleAmount, setNewSaleAmount] = useState('')

  // Payments state
  const [payments, setPayments] = useState<MigrationPayment[]>([])
  const [newPayMonth, setNewPayMonth] = useState('January')
  const [newPayAccount, setNewPayAccount] = useState('')
  const [newPayAmount, setNewPayAmount] = useState('')
  const [expenseAccounts, setExpenseAccounts] = useState<{ code: string; name: string }[]>([])

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    // Load sales
    const { data: salesData } = await supabase
      .from('migration_sales_2026')
      .select('*')
      .order('id')
    if (salesData) {
      const sorted = salesData.sort((a, b) => MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month))
      setSales(sorted)
    }

    // Load payments
    const { data: payData } = await supabase
      .from('migration_payments_2026')
      .select('*')
      .order('id')
    if (payData) setPayments(payData)

    // Load expense accounts
    const { data: accData } = await supabase
      .from('accounts')
      .select('code, name')
      .eq('type', 'expense')
      .eq('is_active', true)
      .order('code')
    if (accData) setExpenseAccounts(accData)

    setLoading(false)
  }

  const addSale = async () => {
    const amount = parseFloat(newSaleAmount.replace(/,/g, ''))
    if (!newSaleMonth || isNaN(amount)) {
      setToast({ msg: 'Enter month and amount', type: 'error' })
      return
    }

    const { error } = await supabase
      .from('migration_sales_2026')
      .upsert({ month: newSaleMonth, year: 2026, sales: amount }, { onConflict: 'month,year' })

    if (error) {
      setToast({ msg: error.message, type: 'error' })
    } else {
      setToast({ msg: `Added ${newSaleMonth} 2026 sales`, type: 'success' })
      setNewSaleAmount('')
      loadData()
    }
  }

  const addPayment = async () => {
    const amount = parseFloat(newPayAmount.replace(/,/g, ''))
    if (!newPayMonth || !newPayAccount || isNaN(amount)) {
      setToast({ msg: 'Enter month, account, and amount', type: 'error' })
      return
    }

    const { error } = await supabase
      .from('migration_payments_2026')
      .insert({ month: newPayMonth, year: 2026, expense_account: newPayAccount, amount })

    if (error) {
      setToast({ msg: error.message, type: 'error' })
    } else {
      setToast({ msg: `Added ${newPayAccount} payment for ${newPayMonth}`, type: 'success' })
      setNewPayAmount('')
      loadData()
    }
  }

  const deletePayment = async (id: string) => {
    await supabase.from('migration_payments_2026').delete().eq('id', id)
    loadData()
  }

  const postToLedger = async () => {
    // This will create journal entries for sales and payments
    // Sales: Dr Cash/Bank, Cr Sales Revenue
    // Payments: Dr Expense Account, Cr Cash/Bank

    let posted = 0

    // Post sales
    for (const sale of sales.filter(s => !s.imported)) {
      const postingDate = sale.month === 'January' ? '2026-01-31' : sale.month === 'February' ? '2026-02-28' : '2026-03-31'

      const { error } = await supabase.from('journals').insert([
        {
          posting_date: postingDate,
          account_code: '1001', // Cash in Hand
          debit: sale.sales,
          credit: 0,
          narration: `Tally migration: ${sale.month} 2026 sales`,
          voucher_type: 'migration',
          voucher_ref: `MIG-SALES-${sale.month.toUpperCase().slice(0, 3)}-2026`
        },
        {
          posting_date: postingDate,
          account_code: '4001', // Sales Revenue
          debit: 0,
          credit: sale.sales,
          narration: `Tally migration: ${sale.month} 2026 sales`,
          voucher_type: 'migration',
          voucher_ref: `MIG-SALES-${sale.month.toUpperCase().slice(0, 3)}-2026`
        }
      ])

      if (!error) {
        await supabase.from('migration_sales_2026').update({ imported: true }).eq('id', sale.id)
        posted++
      }
    }

    // Post payments
    for (const pay of payments.filter(p => !p.imported)) {
      const postingDate = pay.month === 'January' ? '2026-01-31' : pay.month === 'February' ? '2026-02-28' : '2026-03-31'

      const { error } = await supabase.from('journals').insert([
        {
          posting_date: postingDate,
          account_code: pay.expense_account,
          debit: pay.amount,
          credit: 0,
          narration: `Tally migration: ${pay.month} 2026 ${pay.expense_account}`,
          voucher_type: 'migration',
          voucher_ref: `MIG-PAY-${pay.month.toUpperCase().slice(0, 3)}-2026`
        },
        {
          posting_date: postingDate,
          account_code: '1001', // Cash in Hand
          debit: 0,
          credit: pay.amount,
          narration: `Tally migration: ${pay.month} 2026 ${pay.expense_account}`,
          voucher_type: 'migration',
          voucher_ref: `MIG-PAY-${pay.month.toUpperCase().slice(0, 3)}-2026`
        }
      ])

      if (!error) {
        await supabase.from('migration_payments_2026').update({ imported: true }).eq('id', pay.id)
        posted++
      }
    }

    if (posted > 0) {
      setToast({ msg: `Posted ${posted} entries to ledger`, type: 'success' })
      loadData()
    } else {
      setToast({ msg: 'Nothing to post (all already imported)', type: 'error' })
    }
  }

  const salesToPost = sales.filter(s => !s.imported).length
  const paymentsToPost = payments.filter(p => !p.imported).length
  const totalToPost = salesToPost + paymentsToPost

  const salesTotal = sales.reduce((sum, s) => sum + s.sales, 0)
  const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Tally Migration (Jan-Mar 2026)</div>
          <div className="page-sub">Import sales and payments from Tally into SOKORA ledger</div>
        </div>
        <div className="page-actions">
          <button 
            className="btn btn-primary" 
            onClick={postToLedger}
            disabled={totalToPost === 0}
            style={{ opacity: totalToPost === 0 ? 0.5 : 1 }}
          >
            Post {totalToPost} Entries to Ledger
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid g3" style={{ marginBottom: 20 }}>
        <div className="stat-card green">
          <div className="stat-label">Sales Total</div>
          <div className="stat-value">TZS {(salesTotal / 1000000).toFixed(1)}M</div>
          <div className="stat-change up">{sales.length} months</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Payments Total</div>
          <div className="stat-value">TZS {(paymentsTotal / 1000000).toFixed(1)}M</div>
          <div className="stat-change down">{payments.length} entries</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">Pending</div>
          <div className="stat-value">{totalToPost}</div>
          <div className="stat-change">To post to ledger</div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('sales')}
          style={{
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'sales' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'sales' ? 'var(--accent)' : 'var(--text3)',
            fontWeight: activeTab === 'sales' ? 600 : 400, fontSize: 13
          }}
        >
          Sales (Jan-Mar)
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          style={{
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'payments' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'payments' ? 'var(--accent)' : 'var(--text3)',
            fontWeight: activeTab === 'payments' ? 600 : 400, fontSize: 13
          }}
        >
          Payments (Jan-Mar)
        </button>
      </div>

      {/* Sales Tab */}
      {activeTab === 'sales' && (
        <div>
          {/* Add Sale Form */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Add Monthly Sales</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <FG label="Month">
                <select className="form-input" value={newSaleMonth} onChange={e => setNewSaleMonth(e.target.value)} style={{ width: 140 }}>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </FG>
              <FG label="Sales Amount (TZS)">
                <input
                  className="form-input"
                  type="text"
                  placeholder="21,345,900"
                  value={newSaleAmount}
                  onChange={e => setNewSaleAmount(e.target.value)}
                  style={{ width: 180, fontFamily: 'var(--mono)' }}
                />
              </FG>
              <button className="btn btn-primary" onClick={addSale}>Add</button>
            </div>
          </div>

          {/* Sales Table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Year</th>
                  <th className="td-right">Sales (TZS)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20 }}>Loading...</td></tr>
                ) : sales.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>No sales added yet. Add Jan, Feb, Mar totals above.</td></tr>
                ) : (
                  sales.map(s => (
                    <tr key={s.id}>
                      <td className="td-bold">{s.month}</td>
                      <td>2026</td>
                      <td className="td-right td-mono td-green" style={{ fontSize: 14 }}>{s.sales.toLocaleString()}</td>
                      <td>
                        <span className={`pill ${s.imported ? 'pill-green' : 'pill-amber'}`}>
                          {s.imported ? 'Posted' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
                {sales.length > 0 && (
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={2}>TOTAL</td>
                    <td className="td-right td-mono td-green">{salesTotal.toLocaleString()}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div>
          {/* Add Payment Form */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Add Payment</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <FG label="Month">
                <select className="form-input" value={newPayMonth} onChange={e => setNewPayMonth(e.target.value)} style={{ width: 140 }}>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </FG>
              <FG label="Expense Account">
                <select className="form-input" value={newPayAccount} onChange={e => setNewPayAccount(e.target.value)} style={{ width: 220 }}>
                  <option value="">Select account...</option>
                  {expenseAccounts.map(a => (
                    <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </FG>
              <FG label="Amount (TZS)">
                <input
                  className="form-input"
                  type="text"
                  placeholder="500,000"
                  value={newPayAmount}
                  onChange={e => setNewPayAmount(e.target.value)}
                  style={{ width: 150, fontFamily: 'var(--mono)' }}
                />
              </FG>
              <button className="btn btn-primary" onClick={addPayment}>Add</button>
            </div>
          </div>

          {/* Payments Table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Expense Account</th>
                  <th className="td-right">Amount (TZS)</th>
                  <th>Status</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>Loading...</td></tr>
                ) : payments.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>No payments added yet.</td></tr>
                ) : (
                  payments.map(p => (
                    <tr key={p.id}>
                      <td className="td-bold">{p.month}</td>
                      <td>{p.expense_account}</td>
                      <td className="td-right td-mono" style={{ color: '#ef4444' }}>{p.amount.toLocaleString()}</td>
                      <td>
                        <span className={`pill ${p.imported ? 'pill-green' : 'pill-amber'}`}>
                          {p.imported ? 'Posted' : 'Pending'}
                        </span>
                      </td>
                      <td>
                        {!p.imported && (
                          <button 
                            className="btn btn-ghost btn-sm" 
                            onClick={() => deletePayment(p.id)}
                            style={{ color: '#ef4444', fontSize: 11 }}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
                {payments.length > 0 && (
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={2}>TOTAL</td>
                    <td className="td-right td-mono" style={{ color: '#ef4444' }}>{paymentsTotal.toLocaleString()}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, padding: 16, background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text3)' }}>
        <strong>How it works:</strong><br />
        1. Add your Jan, Feb, Mar 2026 sales totals from Tally<br />
        2. Add your Jan, Feb, Mar 2026 payments by expense account<br />
        3. Click "Post to Ledger" to create journal entries<br />
        4. This will update your Trial Balance and PnL
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
