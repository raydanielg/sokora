import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'

interface BankAccount {
  id: string
  code: string
  name: string
  balance: number
}

interface LedgerEntry {
  id: string
  posting_date: string
  description: string
  debit: number
  credit: number
  voucher_ref: string
  voucher_type: string
  running_balance?: number
}

// ── SVG ICONS ────────────────────────────────────
const Icon = ({ name, size = 18, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const s = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'bank') return <svg {...s} viewBox="0 0 24 24"><path d="M3 10L12 3l9 7"/><rect x="5" y="10" width="3" height="8"/><rect x="10.5" y="10" width="3" height="8"/><rect x="16" y="10" width="3" height="8"/><path d="M2 18h20"/></svg>
  if (name === 'cash') return <svg {...s} viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>
  if (name === 'mobile') return <svg {...s} viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 18h4"/></svg>
  if (name === 'card') return <svg {...s} viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>
  if (name === 'arrow-in') return <svg {...s} viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M5 12l7 7 7-7"/></svg>
  if (name === 'arrow-out') return <svg {...s} viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12l7-7 7 7"/></svg>
  if (name === 'refresh') return <svg {...s} viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (name === 'export') return <svg {...s} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
  if (name === 'filter') return <svg {...s} viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
  if (name === 'chevron-right') return <svg {...s} viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
  if (name === 'chevron-left') return <svg {...s} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
  if (name === 'trend-up') return <svg {...s} viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
  if (name === 'trend-down') return <svg {...s} viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
  if (name === 'reconcile') return <svg {...s} viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
  if (name === 'calendar') return <svg {...s} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  return <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>
}

// Bank account config — maps GL code to display info
const BANK_CONFIG: Record<string, { shortName: string; iconName: string; color: string; bg: string; accentBg: string }> = {
  '1010': { shortName: 'Cash Till',   iconName: 'cash',   color: '#4ade80', bg: '#052e16', accentBg: '#14532d' },
  '1020': { shortName: 'M-Pesa',      iconName: 'mobile', color: '#f87171', bg: '#450a0a', accentBg: '#7f1d1d' },
  '1021': { shortName: 'Mixx by YAS', iconName: 'mobile', color: '#facc15', bg: '#1c1917', accentBg: '#1e3a8a' },
  '1022': { shortName: 'NMB Bank',    iconName: 'bank',   color: '#60a5fa', bg: '#0c1a35', accentBg: '#1e3a5f' },
  '1030': { shortName: 'CRDB Bank',   iconName: 'bank',   color: '#34d399', bg: '#052e16', accentBg: '#064e3b' },
  '1031': { shortName: 'CRDB USD',    iconName: 'bank',   color: '#a78bfa', bg: '#1e1b4b', accentBg: '#3730a3' },
  '1040': { shortName: 'Petty Cash',  iconName: 'cash',   color: '#fb923c', bg: '#1c0a00', accentBg: '#431407' },
}

const VOUCHER_TYPE_LABEL: Record<string, string> = {
  cash_sale: 'Cash Sale', cash_payment: 'Payment', cash_receipt: 'Receipt',
  bank_transfer: 'Transfer', grn: 'GRN', purchase_invoice: 'Purchase Inv',
  journal: 'Journal', petty_cash: 'Petty Cash', contra: 'Contra',
}

export default function Banks() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [selected, setSelected] = useState<BankAccount | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [loadingLedger, setLoadingLedger] = useState(false)
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0])
  const [monthStats, setMonthStats] = useState<Record<string, { in: number; out: number }>>({})
  const [statementBalance, setStatementBalance] = useState('')
  const [showReconcile, setShowReconcile] = useState(false)

  useEffect(() => { loadAccounts() }, [])

  const loadAccounts = async () => {
    setLoadingAccounts(true)
    const codes = Object.keys(BANK_CONFIG)
    const { data } = await supabase.from('accounts').select('id, code, name, balance').in('code', codes).eq('is_active', true).order('code')
    if (data) {
      setAccounts(data)
      loadMonthStats(data)
      if (!selected && data.length > 0) {
        setSelected(data[0])
        loadLedger(data[0])
      }
    }
    setLoadingAccounts(false)
  }

  const loadMonthStats = async (accts: BankAccount[]) => {
    const stats: Record<string, { in: number; out: number }> = {}
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]

    // Fetch all month journal lines for bank accounts in one query
    const ids = accts.map(a => a.id)
    const { data } = await supabase
      .from('journal_lines')
      .select('account_id, debit, credit, journals(posting_date)')
      .in('account_id', ids)

    if (data) {
      // Filter by month in JS
      data.forEach((l: any) => {
        const pd = l.journals?.posting_date || ''
        if (pd >= monthStart && pd <= todayStr) {
          if (!stats[l.account_id]) stats[l.account_id] = { in: 0, out: 0 }
          stats[l.account_id].in += (l.debit || 0)
          stats[l.account_id].out += (l.credit || 0)
        }
      })
    }
    setMonthStats(stats)
  }

  const loadLedger = async (acct: BankAccount, from?: string, to?: string) => {
    const f = from || fromDate
    const t = to || toDate
    setLoadingLedger(true)
    // Step 1: get all journal lines for this account
    const { data: lines } = await supabase
      .from('journal_lines')
      .select('id, debit, credit, description, journal_id')
      .eq('account_id', acct.id)
      .order('created_at', { ascending: true })

    if (!lines || lines.length === 0) { setLedger([]); setLoadingLedger(false); return }

    // Step 2: get journal headers to filter by date and get ref/type
    const journalIds = [...new Set(lines.map((l: any) => l.journal_id))]
    const { data: journals } = await supabase
      .from('journals')
      .select('id, ref, posting_date, journal_type, source_ref, status')
      .in('id', journalIds)
      .gte('posting_date', f)
      .lte('posting_date', t)
      .eq('status', 'posted')

    if (!journals) { setLedger([]); setLoadingLedger(false); return }

    const journalMap: Record<string, any> = {}
    journals.forEach((j: any) => { journalMap[j.id] = j })

    // Step 3: join and build ledger
    let running = 0
    const entries = lines
      .filter((l: any) => journalMap[l.journal_id])
      .map((l: any) => {
        const j = journalMap[l.journal_id]
        running += (l.debit || 0) - (l.credit || 0)
        return {
          id: l.id,
          posting_date: j.posting_date,
          description: l.description || '—',
          debit: l.debit || 0,
          credit: l.credit || 0,
          voucher_ref: j.source_ref || j.ref || '—',
          voucher_type: j.journal_type || '',
          running_balance: running,
        }
      })
      .sort((a: any, b: any) => b.posting_date.localeCompare(a.posting_date))

    setLedger(entries)
    setLoadingLedger(false)
  }

  const selectAccount = (acct: BankAccount) => {
    setSelected(acct)
    setShowReconcile(false)
    loadLedger(acct)
  }

  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0)
  const cfg = (code: string) => BANK_CONFIG[code] || { shortName: code, iconName: 'bank', color: 'var(--accent)', bg: 'var(--surface2)', accentBg: 'var(--surface3)' }
  const totalIn = ledger.reduce((s, l) => s + l.debit, 0)
  const totalOut = ledger.reduce((s, l) => s + l.credit, 0)
  const netFlow = totalIn - totalOut
  const diff = selected ? (parseFloat(statementBalance.replace(/,/g, '')) || 0) - selected.balance : 0

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* HEADER */}
      <div className="page-header">
        <div>
          <div className="page-title">Bank & Cash Accounts</div>
          <div className="page-sub">Live balances · Full ledger per account · Reconciliation · <span className="sync-dot"></span> Supabase</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={loadAccounts}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="export" size={14} /> Export
          </button>
        </div>
      </div>

      {/* TOTAL BALANCE BANNER */}
      <div style={{ background: 'linear-gradient(135deg, rgba(212,135,74,.15) 0%, rgba(0,229,160,.08) 100%)', border: '1px solid rgba(212,135,74,.2)', borderRadius: 'var(--r)', padding: '16px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Total Cash & Bank Position</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 800, color: totalBalance >= 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(totalBalance)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>{accounts.length} active accounts · FY 2025-26</div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Month In</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
              {tzs(Object.values(monthStats).reduce((s, v) => s + v.in, 0))}
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }}></div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Month Out</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)', fontFamily: 'var(--mono)' }}>
              {tzs(Object.values(monthStats).reduce((s, v) => s + v.out, 0))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, flex: 1, minHeight: 0 }}>

        {/* LEFT — ACCOUNT LIST */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          {loadingAccounts ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading accounts…</div>
          ) : accounts.map(acct => {
            const c = cfg(acct.code)
            const stats = monthStats[acct.id] || { in: 0, out: 0 }
            const isSelected = selected?.id === acct.id
            return (
              <div key={acct.id} onClick={() => selectAccount(acct)} style={{ background: isSelected ? `${c.color}12` : 'var(--surface)', border: `2px solid ${isSelected ? c.color : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all .15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: c.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={c.iconName} size={20} color={c.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? c.color : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.shortName}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{acct.code} · {acct.name.split('—')[1]?.trim() || acct.name}</div>
                  </div>
                  <Icon name="chevron-right" size={14} color={isSelected ? c.color : 'var(--text3)'} />
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: acct.balance >= 0 ? (isSelected ? c.color : 'var(--text)') : 'var(--red)', marginBottom: 8 }}>
                  {tzs(acct.balance)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--mono)' }}>
                  <span style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="trend-up" size={10} color="#4ade80" /> {tzs(stats.in)}
                  </span>
                  <span style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="trend-down" size={10} color="#f87171" /> {tzs(stats.out)}
                  </span>
                </div>
                <div style={{ height: 3, background: 'var(--surface3)', borderRadius: 2, marginTop: 8 }}>
                  <div style={{ height: '100%', width: `${totalBalance > 0 ? Math.min(100, (acct.balance / totalBalance) * 100) : 0}%`, background: c.color, borderRadius: 2, transition: 'width .4s' }}></div>
                </div>
              </div>
            )
          })}
        </div>

        {/* RIGHT — LEDGER */}
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            {(() => {
              const c = cfg(selected.code)
              return (
                <>
                  {/* Account header */}
                  <div style={{ background: 'var(--surface)', border: `1px solid ${c.color}40`, borderRadius: 12, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: c.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name={c.iconName} size={26} color={c.color} />
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{selected.name}</div>
                          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>GL Account {selected.code} · Cash & Bank</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>Current Balance</div>
                        <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, color: selected.balance >= 0 ? c.color : 'var(--red)' }}>{tzs(selected.balance)}</div>
                      </div>
                    </div>

                    {/* Period stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                      {[
                        { label: 'Money In', value: totalIn, color: 'var(--green)', icon: 'arrow-in' },
                        { label: 'Money Out', value: totalOut, color: 'var(--red)', icon: 'arrow-out' },
                        { label: 'Net Flow', value: netFlow, color: netFlow >= 0 ? 'var(--green)' : 'var(--red)', icon: netFlow >= 0 ? 'trend-up' : 'trend-down' },
                        { label: 'Transactions', value: ledger.length, color: 'var(--accent)', icon: 'filter', isCount: true },
                      ].map((s, i) => (
                        <div key={i} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Icon name={s.icon} size={12} color={s.color} />
                            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>{s.label}</span>
                          </div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: s.color }}>
                            {(s as any).isCount ? s.value : tzs(s.value as number)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Date filter + Reconcile */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 12px' }}>
                      <Icon name="calendar" size={13} color="var(--text3)" />
                      <input type="date" className="form-input" style={{ width: 130, padding: '3px 6px', fontSize: 12, border: 'none', background: 'transparent' }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>to</span>
                      <input type="date" className="form-input" style={{ width: 130, padding: '3px 6px', fontSize: 12, border: 'none', background: 'transparent' }} value={toDate} onChange={e => setToDate(e.target.value)} />
                      <button className="btn btn-primary btn-sm" onClick={() => loadLedger(selected)}>Load</button>
                    </div>
                    {[
                        { label: 'Today', f: new Date().toISOString().split('T')[0], t: new Date().toISOString().split('T')[0] },
                        { label: 'This Week', f: new Date(Date.now()-6*86400000).toISOString().split('T')[0], t: new Date().toISOString().split('T')[0] },
                        { label: 'This Month', f: new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().split('T')[0], t: new Date().toISOString().split('T')[0] },
                      ].map(p => (
                      <button key={p.label} className="btn btn-ghost btn-sm" onClick={() => {
                        setFromDate(p.f); setToDate(p.t)
                        if (selected) loadLedger(selected, p.f, p.t)
                      }}>{p.label}</button>
                    ))}
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: showReconcile ? 'var(--green)' : 'var(--text3)' }} onClick={() => setShowReconcile(!showReconcile)}>
                      <Icon name="reconcile" size={14} color={showReconcile ? 'var(--green)' : 'var(--text3)'} /> Reconcile
                    </button>
                  </div>

                  {/* RECONCILIATION PANEL */}
                  {showReconcile && (
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="reconcile" size={16} color="var(--accent)" /> Bank Reconciliation
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6 }}>STATEMENT BALANCE (from bank)</div>
                          <input className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} placeholder="Enter bank statement balance" value={statementBalance} onChange={e => setStatementBalance(e.target.value)} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6 }}>GL BALANCE (system)</div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--text)', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>{tzs(selected.balance)}</div>
                        </div>
                      </div>
                      {statementBalance && (
                        <div style={{ marginTop: 12, padding: '12px 16px', background: Math.abs(diff) < 1 ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${Math.abs(diff) < 1 ? 'rgba(0,229,160,.3)' : 'rgba(255,71,87,.3)'}`, borderRadius: 'var(--r)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Icon name={Math.abs(diff) < 1 ? 'reconcile' : 'filter'} size={16} color={Math.abs(diff) < 1 ? 'var(--green)' : 'var(--red)'} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: Math.abs(diff) < 1 ? 'var(--green)' : 'var(--red)' }}>
                              {Math.abs(diff) < 1 ? 'RECONCILED — Balances match' : 'DIFFERENCE FOUND — Investigate unmatched entries'}
                            </span>
                          </div>
                          {Math.abs(diff) >= 1 && (
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--red)' }}>
                              {diff > 0 ? '+' : ''}{tzs(diff)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* LEDGER TABLE */}
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header" style={{ marginBottom: 14 }}>
                      <div>
                        <div className="card-title">{selected.name} — Statement</div>
                        <div className="card-sub">{fromDate} to {toDate} · {ledger.length} entries</div>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="export" size={13} /> Export
                      </button>
                    </div>

                    {loadingLedger ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading ledger…</div>
                    ) : ledger.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
                        <div style={{ marginBottom: 8 }}><Icon name="bank" size={32} color="var(--surface3)" /></div>
                        No transactions found for this period.
                      </div>
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Ref</th>
                              <th>Type</th>
                              <th>Description</th>
                              <th className="td-right" style={{ width: 140 }}>Money In</th>
                              <th className="td-right" style={{ width: 140 }}>Money Out</th>
                              <th className="td-right" style={{ width: 150 }}>Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ledger.map((entry, i) => (
                              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)' }}>
                                <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{entry.posting_date}</td>
                                <td className="td-mono td-amber" style={{ fontSize: 11 }}>{entry.voucher_ref}</td>
                                <td>
                                  <span className="pill pill-gray" style={{ fontSize: 9 }}>
                                    {VOUCHER_TYPE_LABEL[entry.voucher_type] || entry.voucher_type || '—'}
                                  </span>
                                </td>
                                <td style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.description}</td>
                                <td className="td-right td-mono" style={{ color: entry.debit > 0 ? 'var(--green)' : 'var(--text3)', fontWeight: entry.debit > 0 ? 600 : 400, fontSize: 12 }}>
                                  {entry.debit > 0 ? tzs(entry.debit) : '—'}
                                </td>
                                <td className="td-right td-mono" style={{ color: entry.credit > 0 ? 'var(--red)' : 'var(--text3)', fontWeight: entry.credit > 0 ? 600 : 400, fontSize: 12 }}>
                                  {entry.credit > 0 ? `(${tzs(entry.credit)})` : '—'}
                                </td>
                                <td className="td-right td-mono" style={{ fontSize: 12, fontWeight: 600, color: (entry.running_balance || 0) >= 0 ? 'var(--text)' : 'var(--red)' }}>
                                  {tzs(entry.running_balance || 0)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                              <td colSpan={4} style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>Period Totals</td>
                              <td className="td-right td-mono" style={{ color: 'var(--green)', fontSize: 13, padding: '10px 14px' }}>{tzs(totalIn)}</td>
                              <td className="td-right td-mono" style={{ color: 'var(--red)', fontSize: 13, padding: '10px 14px' }}>({tzs(totalOut)})</td>
                              <td className="td-right td-mono" style={{ color: netFlow >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 14, fontWeight: 800, padding: '10px 14px' }}>{tzs(selected.balance)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
