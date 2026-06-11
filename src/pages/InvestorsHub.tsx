import { insertJournalWithRetry } from '../lib/refs'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { tzs, today } from '../lib/utils'
import { validatePostingDate } from '../lib/dateValidation'
import { useAuth } from '../lib/useAuth'

interface Shareholder {
  id: string; name: string; share_class: string
  shares_subscribed: number; amount_per_share: number
  total_paid: number; contact_phone: string; contact_email: string
  is_active: boolean; created_at: string
}

interface EquityJournal {
  id: string; ref: string; posting_date: string; description: string
  journal_type: string; status: string; posted_by: string
}

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'plus')    return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  if (n === 'edit')    return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'pdf')     return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const TABS = ['Shareholders', 'Equity Journals', 'Investor Reports'] as const
type Tab = typeof TABS[number]

const EMPTY_SH = {
  name: '', share_class: 'A', shares_subscribed: '1',
  amount_per_share: '1000000', total_paid: '0',
  contact_phone: '', contact_email: '',
}

type EqAction = 'share_payment' | 'ip_contribution' | 'dividend' | 'drawing'

export default function InvestorsHub() {
  const { isSuperAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('Shareholders')
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  // Shareholders
  const [shareholders, setShareholders] = useState<Shareholder[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editSH, setEditSH] = useState<Shareholder | null>(null)
  const [shForm, setShForm] = useState(EMPTY_SH)
  const [saving, setSaving] = useState(false)

  // Equity Journals
  const [eqAction, setEqAction] = useState<EqAction | null>(null)
  const [eqJournals, setEqJournals] = useState<EquityJournal[]>([])
  const [eqForm, setEqForm] = useState({ shareholderId: '', amount: '', bankAccount: '', assetDesc: '', date: today() })
  const [eqPosting, setEqPosting] = useState(false)
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string; category: string; type: string }[]>([])

  // Reports
  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().split('T')[0]
  })
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().split('T')[0])
  const [reportNotes, setReportNotes] = useState('Key milestones and strategic plans for the next quarter.')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }
  const setShF = (k: string, v: string) => setShForm(f => ({ ...f, [k]: v }))
  const setEqF = (k: string, v: string) => setEqForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadShareholders(); loadAccounts() }, [])
  useEffect(() => { if (tab === 'Equity Journals') loadEqJournals() }, [tab])

  const loadShareholders = async () => {
    setLoading(true)
    const { data } = await supabase.from('shareholders').select('*').eq('is_active', true).order('name')
    if (data) setShareholders(data as Shareholder[])
    setLoading(false)
  }

  const loadAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, code, name, category, type').eq('is_active', true).order('code')
    if (data) setAccounts(data)
  }

  const loadEqJournals = async () => {
    const { data } = await supabase.from('journals').select('*')
      .or('journal_type.eq.equity,source_type.eq.equity')
      .order('posting_date', { ascending: false }).limit(50)
    if (data) setEqJournals(data as EquityJournal[])
  }

  const totalShares = shareholders.reduce((s, sh) => s + sh.shares_subscribed, 0)
  const totalCapital = shareholders.reduce((s, sh) => s + sh.shares_subscribed * sh.amount_per_share, 0)
  const totalPaid = shareholders.reduce((s, sh) => s + sh.total_paid, 0)
  const totalReceivable = totalCapital - totalPaid

  const bankAccounts = accounts.filter(a =>
    a.category === 'Cash & Bank'
    || a.category?.toLowerCase().includes('cash')
    || a.category?.toLowerCase().includes('bank')
    || (a.type === 'asset' && /^10[1-4]/.test(a.code))
  )

  // ── SAVE SHAREHOLDER ──────────────────────────────
  const saveShareholder = async () => {
    if (!shForm.name.trim()) { showToast('Shareholder name required', 'error'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: shForm.name.trim(),
        share_class: shForm.share_class,
        shares_subscribed: parseInt(shForm.shares_subscribed) || 1,
        amount_per_share: parseFloat(shForm.amount_per_share) || 1000000,
        total_paid: parseFloat(shForm.total_paid) || 0,
        contact_phone: shForm.contact_phone.trim() || null,
        contact_email: shForm.contact_email.trim() || null,
        is_active: true,
      }
      if (editSH) {
        const { error } = await supabase.from('shareholders').update(payload).eq('id', editSH.id)
        if (error) throw new Error(error.message)
        showToast(`${shForm.name} updated`)
      } else {
        const { error } = await supabase.from('shareholders').insert(payload)
        if (error) throw new Error(error.message)
        showToast(`${shForm.name} added`)
      }
      setShowForm(false); setEditSH(null); loadShareholders()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      showToast(msg, 'error')
    } finally { setSaving(false) }
  }

  const openEditSH = (sh: Shareholder) => {
    setEditSH(sh)
    setShForm({
      name: sh.name, share_class: sh.share_class,
      shares_subscribed: String(sh.shares_subscribed),
      amount_per_share: String(sh.amount_per_share),
      total_paid: String(sh.total_paid),
      contact_phone: sh.contact_phone || '', contact_email: sh.contact_email || '',
    })
    setShowForm(true)
  }

  // ── POST EQUITY JOURNAL ────────────────────────────
  const postEquityJournal = async () => {
    if (!eqForm.shareholderId) { showToast('Select a shareholder', 'error'); return }
    const amount = parseFloat(eqForm.amount)
    if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return }
    if ((eqAction === 'share_payment' || eqAction === 'dividend' || eqAction === 'drawing') && !eqForm.bankAccount) {
      showToast('Select a bank account', 'error'); return
    }

    const dateCheck = await validatePostingDate(eqForm.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }

    setEqPosting(true)
    try {
      const sh = shareholders.find(s => s.id === eqForm.shareholderId)
      if (!sh) throw new Error('Shareholder not found')

      // Find account IDs
      const shareCapitalAcct = accounts.find(a => a.code === '3000')
      const fixedAssetsAcct = accounts.find(a => a.code === '1500')
      const drawingsAcct = accounts.find(a => a.code === '3200')

      let drAcctId: string, crAcctId: string, desc: string, refPrefix: string

      if (eqAction === 'share_payment') {
        if (!shareCapitalAcct) throw new Error('Account 3000 Share Capital not found')
        drAcctId = eqForm.bankAccount
        crAcctId = shareCapitalAcct.id
        desc = `Share payment received from ${sh.name}`
        refPrefix = 'EQ-SPR'
      } else if (eqAction === 'ip_contribution') {
        if (!shareCapitalAcct || !fixedAssetsAcct) throw new Error('Account 3000 or 1500 not found')
        drAcctId = fixedAssetsAcct.id
        crAcctId = shareCapitalAcct.id
        desc = `IP/Non-cash contribution from ${sh.name}: ${eqForm.assetDesc || 'Asset'}`
        refPrefix = 'EQ-IPC'
      } else if (eqAction === 'dividend') {
        if (!drawingsAcct) throw new Error('Account 3200 Owner Drawings not found')
        drAcctId = drawingsAcct.id
        crAcctId = eqForm.bankAccount
        desc = `Dividend payment to ${sh.name}`
        refPrefix = 'EQ-DIV'
      } else {
        if (!drawingsAcct) throw new Error('Account 3200 Owner Drawings not found')
        drAcctId = drawingsAcct.id
        crAcctId = eqForm.bankAccount
        desc = `Owner drawing by ${sh.name}`
        refPrefix = 'EQ-DRW'
      }

      const jRef = `${refPrefix}-${Date.now().toString(36).toUpperCase()}`

      // Create journal
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: jRef,
        posting_date: eqForm.date,
        description: desc,
        journal_type: 'equity',
        source_type: 'equity',
        source_ref: jRef,
        posted_by: 'Joe Gembe',
        status: 'posted',
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw

      // Journal lines
      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: drAcctId, description: desc, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: crAcctId, description: desc, debit: 0, credit: amount },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      // Update balances
      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: drAcctId, p_debit: amount, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: crAcctId, p_debit: 0, p_credit: amount }),
      ])

      // Update shareholder total_paid for share_payment and ip_contribution
      if (eqAction === 'share_payment' || eqAction === 'ip_contribution') {
        await supabase.from('shareholders').update({ total_paid: sh.total_paid + amount }).eq('id', sh.id)
      }

      showToast(`${jRef} posted successfully`)
      setEqAction(null)
      setEqForm({ shareholderId: '', amount: '', bankAccount: '', assetDesc: '', date: today() })
      loadShareholders()
      loadEqJournals()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Posting failed'
      showToast(msg, 'error')
    } finally { setEqPosting(false) }
  }

  // ── GENERATE INVESTOR REPORT PDF ──────────────────
  const generateReportPDF = async () => {
    let tplSettings = { company_name: 'Your Organization', company_tagline: 'Building African Brands', primary_color: '#d48744', logo_url: null as string | null, logo_position: 'left', logo_width: 50 }
    try {
      const { data } = await supabase.from('report_templates').select('*').limit(1).single()
      if (data) tplSettings = { ...tplSettings, ...data }
    } catch { /* defaults */ }

    // Fetch revenue + expenses from vouchers
    const { data: revData } = await supabase.from('vouchers')
      .select('total_amount').in('type', ['cash_sale', 'sales_invoice'])
      .gte('posting_date', reportFrom).lte('posting_date', reportTo).eq('status', 'posted')
    const totalRevenue = (revData || []).reduce((s: number, v: { total_amount: number }) => s + (v.total_amount || 0), 0)

    const { data: expData } = await supabase.from('vouchers')
      .select('total_amount').in('type', ['cash_payment', 'purchase_invoice'])
      .gte('posting_date', reportFrom).lte('posting_date', reportTo).eq('status', 'posted')
    const totalExpenses = (expData || []).reduce((s: number, v: { total_amount: number }) => s + (v.total_amount || 0), 0)

    // Fetch cash position from key accounts
    const cashCodes = ['1010', '1020', '1021', '1022', '1030']
    const { data: cashAccts } = await supabase.from('accounts').select('code, name, balance').in('code', cashCodes)
    const totalCash = (cashAccts || []).reduce((s: number, a: { balance: number }) => s + (a.balance || 0), 0)

    const t = tplSettings
    const pc = t.primary_color || '#d48744'
    const now = new Date().toLocaleString('en-GB')
    const logoHtml = t.logo_url ? `<img src="${t.logo_url}" style="height:${t.logo_width || 50}px;margin-right:14px;border-radius:8px"/>` : ''

    const shRows = shareholders.map(sh => {
      const subscribed = sh.shares_subscribed * sh.amount_per_share
      const owing = subscribed - sh.total_paid
      const pct = totalShares > 0 ? ((sh.shares_subscribed / totalShares) * 100).toFixed(1) : '0'
      return `<tr>
        <td style="font-weight:600">${sh.name}</td>
        <td>${sh.share_class === 'A' ? 'A (Ordinary)' : 'B (Preference)'}</td>
        <td class="num">${sh.shares_subscribed.toLocaleString()}</td>
        <td class="num">${Math.round(sh.total_paid).toLocaleString()}</td>
        <td class="num">${Math.round(owing).toLocaleString()}</td>
        <td class="num" style="font-weight:700">${pct}%</td>
        <td><span class="pill ${owing <= 0 ? 'pill-g' : 'pill-a'}">${owing <= 0 ? 'Fully Paid' : 'Partial'}</span></td>
      </tr>`
    }).join('')

    const cashRows = (cashAccts || []).map((a: { code: string; name: string; balance: number }) =>
      `<tr><td class="mono">${a.code}</td><td>${a.name}</td><td class="num" style="font-weight:700">${Math.round(a.balance || 0).toLocaleString()}</td></tr>`
    ).join('')

    const win = window.open('', '_blank')
    if (!win) { showToast('Pop-up blocked', 'error'); return }
    win.document.write(`<!DOCTYPE html><html><head><title>Investor Report - ${t.company_name}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@500&family=DM+Sans:wght@500;700&family=Syne:wght@700;800&display=swap" rel="stylesheet">
    <style>
      *{margin:0;padding:0;box-sizing:border-box} body{font-family:'DM Sans',sans-serif;color:#222;background:#fff}
      .page{max-width:900px;margin:0 auto}
      .header{background:linear-gradient(135deg,${pc} 0%,${pc}dd 100%);padding:28px 40px;display:flex;justify-content:space-between;align-items:center;border-radius:0 0 16px 16px}
      .logo-area{display:flex;align-items:center}
      .company-name{font-family:'Syne',serif;font-size:20px;font-weight:800;letter-spacing:-.3px;color:#fff}
      .company-sub{font-size:10px;color:rgba(255,255,255,.75);margin-top:3px}
      .doc-title{font-family:'Syne',serif;font-size:22px;font-weight:800;text-align:right;color:#fff}
      .doc-meta{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.7);text-align:right;margin-top:4px;line-height:1.6}
      .content{padding:28px 40px}
      .stats{display:flex;gap:12px;margin-bottom:24px}
      .stat{flex:1;background:#f9f9f9;border:1px solid #eee;border-radius:10px;padding:14px 16px}
      .stat-label{font-family:'DM Mono',monospace;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
      .stat-val{font-family:'DM Mono',monospace;font-size:18px;font-weight:700}
      .section-title{font-family:'Syne',serif;font-size:14px;font-weight:700;margin:24px 0 10px;color:#333;border-bottom:2px solid #eee;padding-bottom:8px}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px}
      th{text-align:left;padding:8px 10px;background:#f5f5f5;border-bottom:2px solid #ddd;font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#888}
      td{padding:7px 10px;border-bottom:1px solid #f0f0f0}
      .num{text-align:right;font-family:'DM Mono',monospace}
      .mono{font-family:'DM Mono',monospace;font-size:10px;color:#888}
      .pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600}
      .pill-g{background:#e6f9f0;color:#1a7a4a} .pill-a{background:#fff3e0;color:#d48744}
      .notes-box{background:#f9f9f9;border:1px solid #eee;border-radius:10px;padding:16px 20px;font-size:12px;line-height:1.8;color:#555;white-space:pre-wrap}
      .footer{margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:10px;color:#999;display:flex;justify-content:space-between}
      @media print{body{padding:0}.content{padding:20px 30px}@page{margin:10mm 8mm}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="page">
      <div class="header">
        <div class="logo-area">${logoHtml}<div><div class="company-name">${t.company_name}</div><div class="company-sub">${t.company_tagline} · Quarterly Investor Report</div></div></div>
        <div><div class="doc-title">Investor Update</div><div class="doc-meta">Period: ${reportFrom} to ${reportTo}<br>Generated: ${now}<br>CONFIDENTIAL</div></div>
      </div>
      <div class="content">
        <div class="stats">
          <div class="stat"><div class="stat-label">Total Revenue</div><div class="stat-val" style="color:#1a7a4a">TZS ${Math.round(totalRevenue).toLocaleString()}</div></div>
          <div class="stat"><div class="stat-label">Total Expenses</div><div class="stat-val" style="color:#c0392b">TZS ${Math.round(totalExpenses).toLocaleString()}</div></div>
          <div class="stat" style="background:${(totalRevenue - totalExpenses) >= 0 ? '#f0faf7' : '#fef2f2'}"><div class="stat-label">Net Position</div><div class="stat-val" style="color:${(totalRevenue - totalExpenses) >= 0 ? '#1a7a4a' : '#c0392b'}">TZS ${Math.round(totalRevenue - totalExpenses).toLocaleString()}</div></div>
          <div class="stat"><div class="stat-label">Cash Position</div><div class="stat-val" style="color:#2563eb">TZS ${Math.round(totalCash).toLocaleString()}</div></div>
        </div>

        <div class="section-title">Share Capital Status</div>
        <div class="stats" style="margin-bottom:16px">
          <div class="stat"><div class="stat-label">Total Share Capital</div><div class="stat-val">TZS ${Math.round(totalCapital).toLocaleString()}</div></div>
          <div class="stat"><div class="stat-label">Paid Up</div><div class="stat-val" style="color:#1a7a4a">TZS ${Math.round(totalPaid).toLocaleString()}</div></div>
          <div class="stat"><div class="stat-label">Receivable</div><div class="stat-val" style="color:${totalReceivable > 0 ? '#d48744' : '#1a7a4a'}">TZS ${Math.round(totalReceivable).toLocaleString()}</div></div>
        </div>
        <table>
          <thead><tr><th>Shareholder</th><th>Class</th><th class="num">Shares</th><th class="num">Paid (TZS)</th><th class="num">Owing (TZS)</th><th class="num">Ownership</th><th>Status</th></tr></thead>
          <tbody>${shRows}</tbody>
        </table>

        <div class="section-title">Cash Position</div>
        <table>
          <thead><tr><th>Code</th><th>Account</th><th class="num">Balance (TZS)</th></tr></thead>
          <tbody>${cashRows}</tbody>
          <tfoot><tr style="background:#f5f5f5;font-weight:700"><td colspan="2">Total Cash</td><td class="num" style="font-size:14px;color:#2563eb">${Math.round(totalCash).toLocaleString()}</td></tr></tfoot>
        </table>

        <div class="section-title">Next Steps & Notes</div>
        <div class="notes-box">${reportNotes}</div>

        <div class="footer">
          <div>${t.company_name} · Dar es Salaam, Tanzania</div>
          <div>Generated ${now} · SOKORA · Confidential</div>
        </div>
      </div>
    </div></body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  // ── RENDER ─────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Investors Hub</div>
          <div className="page-sub">Shareholders · Equity · Investor Reports</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={loadShareholders} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic n="refresh" /> Refresh</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Share Capital', val: tzs(totalCapital), color: 'var(--text)' },
          { label: 'Total Paid Up', val: tzs(totalPaid), color: 'var(--green)' },
          { label: 'Total Receivable', val: tzs(totalReceivable), color: totalReceivable > 0 ? 'var(--yellow)' : 'var(--green)' },
          { label: 'Shareholders', val: String(shareholders.length), color: 'var(--accent)' },
        ].map(item => (
          <div key={item.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: item.color }}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 4, marginBottom: 20, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 20px', fontSize: 12, fontWeight: 600, background: tab === t ? 'var(--accent)' : 'transparent', color: tab === t ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderRadius: 'var(--r)', transition: 'all .15s' }}>
            {t}
          </button>
        ))}
      </div>

      {/* ═══ TAB 1: SHAREHOLDERS ═══ */}
      {tab === 'Shareholders' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditSH(null); setShForm(EMPTY_SH); setShowForm(true) }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic n="plus" s={13} /> Add Shareholder
            </button>
          </div>

          {/* Add/Edit modal */}
          {showForm && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setShowForm(false)}>
              <div className="card" style={{ width: 500, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="card-title" style={{ marginBottom: 16 }}>{editSH ? `Edit — ${editSH.name}` : 'Add Shareholder'}</div>
                <FG label="Name" req><input className="form-input" placeholder="e.g. Joe Gembe" value={shForm.name} onChange={e => setShF('name', e.target.value)} /></FG>
                <div className="form-row">
                  <FG label="Share Class" req>
                    <select className="form-input" value={shForm.share_class} onChange={e => setShF('share_class', e.target.value)}>
                      <option value="A">A (Ordinary)</option>
                      <option value="B">B (Preference)</option>
                    </select>
                  </FG>
                  <FG label="Shares Subscribed" req>
                    <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} value={shForm.shares_subscribed} onChange={e => setShF('shares_subscribed', e.target.value)} />
                  </FG>
                </div>
                <div className="form-row">
                  <FG label="Amount per Share (TZS)">
                    <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} value={shForm.amount_per_share} onChange={e => setShF('amount_per_share', e.target.value)} />
                  </FG>
                  <FG label="Total Paid (TZS)">
                    <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} value={shForm.total_paid} onChange={e => setShF('total_paid', e.target.value)} />
                  </FG>
                </div>
                <div className="form-row">
                  <FG label="Phone"><input className="form-input" placeholder="+255..." value={shForm.contact_phone} onChange={e => setShF('contact_phone', e.target.value)} /></FG>
                  <FG label="Email"><input className="form-input" placeholder="email@..." value={shForm.contact_email} onChange={e => setShF('contact_email', e.target.value)} /></FG>
                </div>
                {/* Auto-calc preview */}
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 8, lineHeight: 1.8 }}>
                  Subscribed: {tzs((parseInt(shForm.shares_subscribed) || 0) * (parseFloat(shForm.amount_per_share) || 0))}<br />
                  Owing: {tzs(Math.max(0, (parseInt(shForm.shares_subscribed) || 0) * (parseFloat(shForm.amount_per_share) || 0) - (parseFloat(shForm.total_paid) || 0)))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveShareholder} disabled={saving}>{saving ? 'Saving…' : editSH ? 'Save' : 'Add'}</button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div>
          ) : shareholders.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No shareholders registered. Click + to add one.</div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Shareholder</th><th>Class</th>
                      <th className="td-right">Shares</th>
                      <th className="td-right">Amount Paid (TZS)</th>
                      <th className="td-right">Amount Owing (TZS)</th>
                      <th className="td-right">Ownership %</th>
                      <th>Status</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shareholders.map(sh => {
                      const subscribed = sh.shares_subscribed * sh.amount_per_share
                      const owing = subscribed - sh.total_paid
                      const pct = totalShares > 0 ? ((sh.shares_subscribed / totalShares) * 100).toFixed(1) : '0'
                      return (
                        <tr key={sh.id}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{sh.name}</div>
                            {sh.contact_email && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sh.contact_email}</div>}
                          </td>
                          <td><span className="pill pill-gray" style={{ fontSize: 9 }}>{sh.share_class === 'A' ? 'A Ordinary' : 'B Preference'}</span></td>
                          <td className="td-right td-mono" style={{ fontSize: 12 }}>{sh.shares_subscribed.toLocaleString()}</td>
                          <td className="td-right td-mono" style={{ fontSize: 12, color: 'var(--green)' }}>{tzs(sh.total_paid)}</td>
                          <td className="td-right td-mono" style={{ fontSize: 12, color: owing > 0 ? 'var(--yellow)' : 'var(--text3)' }}>{owing > 0 ? tzs(owing) : ''}</td>
                          <td className="td-right td-mono" style={{ fontWeight: 700, fontSize: 13 }}>{pct}%</td>
                          <td>
                            <span className={`pill ${owing <= 0 ? 'pill-green' : 'pill-amber'}`} style={{ fontSize: 9 }}>
                              {owing <= 0 ? 'Fully Paid' : 'Partial'}
                            </span>
                          </td>
                          <td>
                            <button onClick={() => openEditSH(sh)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Ic n="edit" s={11} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ TAB 2: EQUITY JOURNALS ═══ */}
      {tab === 'Equity Journals' && (
        <>
          {/* Quick-post buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {([
              { action: 'share_payment' as EqAction, label: 'Record Share Payment', icon: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', color: 'rgba(26,122,74,.1)', border: 'rgba(26,122,74,.3)' },
              { action: 'ip_contribution' as EqAction, label: 'IP/Non-Cash Contribution', icon: 'M2 20h20 M5 20V9l7-6 7 6v11 M10 20v-6h4v6', color: 'rgba(37,99,235,.1)', border: 'rgba(37,99,235,.3)' },
              { action: 'dividend' as EqAction, label: 'Record Dividend', icon: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6 M2 8l4-4 4 4', color: 'rgba(212,135,68,.1)', border: 'rgba(212,135,68,.3)' },
              { action: 'drawing' as EqAction, label: 'Owner Drawing', icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12', color: 'rgba(192,57,43,.1)', border: 'rgba(192,57,43,.3)' },
            ]).map(item => (
              <button key={item.action} onClick={() => { setEqAction(item.action); setEqForm({ shareholderId: '', amount: '', bankAccount: '', assetDesc: '', date: today() }) }}
                style={{ background: item.color, border: `1px solid ${item.border}`, borderRadius: 12, padding: '16px', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
                <div style={{ marginBottom: 8 }}><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={item.icon}/></svg></div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{item.label}</div>
              </button>
            ))}
          </div>

          {/* Equity action modal */}
          {eqAction && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setEqAction(null)}>
              <div className="card" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
                <div className="card-title" style={{ marginBottom: 16 }}>
                  {eqAction === 'share_payment' && 'Record Share Payment Received'}
                  {eqAction === 'ip_contribution' && 'Record IP/Non-Cash Contribution'}
                  {eqAction === 'dividend' && 'Record Dividend Payment'}
                  {eqAction === 'drawing' && 'Record Owner Drawing'}
                </div>
                <FG label="Shareholder" req>
                  <select className="form-input" value={eqForm.shareholderId} onChange={e => setEqF('shareholderId', e.target.value)}>
                    <option value="">— Select —</option>
                    {shareholders.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
                  </select>
                </FG>
                <div className="form-row">
                  <FG label="Amount (TZS)" req>
                    <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }} value={eqForm.amount} onChange={e => setEqF('amount', e.target.value)} placeholder="0" />
                  </FG>
                  <FG label="Date" req>
                    <input type="date" className="form-input" value={eqForm.date} onChange={e => setEqF('date', e.target.value)} />
                  </FG>
                </div>
                {(eqAction === 'share_payment' || eqAction === 'dividend' || eqAction === 'drawing') && (
                  <FG label="Bank Account" req>
                    <select className="form-input" value={eqForm.bankAccount} onChange={e => setEqF('bankAccount', e.target.value)}>
                      <option value="">— Select —</option>
                      {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </FG>
                )}
                {eqAction === 'ip_contribution' && (
                  <FG label="Asset Description">
                    <input className="form-input" placeholder="e.g. Brand IP, Equipment" value={eqForm.assetDesc} onChange={e => setEqF('assetDesc', e.target.value)} />
                  </FG>
                )}
                {/* Journal preview */}
                {eqForm.amount && (
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginTop: 8, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                    {eqAction === 'share_payment' && <>Dr Bank · Cr 3000 Share Capital</>}
                    {eqAction === 'ip_contribution' && <>Dr 1500 Fixed Assets · Cr 3000 Share Capital</>}
                    {eqAction === 'dividend' && <>Dr 3200 Owner Drawings · Cr Bank</>}
                    {eqAction === 'drawing' && <>Dr 3200 Owner Drawings · Cr Bank</>}
                    {' · TZS '}{parseInt(eqForm.amount).toLocaleString()}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setEqAction(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={postEquityJournal} disabled={eqPosting}>{eqPosting ? 'Posting…' : 'Post Journal'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Equity journal history */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Equity Journal History</div>
            {eqJournals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No equity journals yet. Use the buttons above to post.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Ref</th><th>Description</th><th>Status</th><th>Posted By</th></tr></thead>
                  <tbody>
                    {eqJournals.map(j => (
                      <tr key={j.id}>
                        <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{j.posting_date}</td>
                        <td className="td-mono td-amber" style={{ fontSize: 11, fontWeight: 700 }}>{j.ref}</td>
                        <td style={{ fontSize: 11 }}>{j.description}</td>
                        <td><span className="pill pill-green" style={{ fontSize: 9 }}>{j.status}</span></td>
                        <td style={{ fontSize: 11, color: 'var(--text3)' }}>{j.posted_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ TAB 3: INVESTOR REPORTS ═══ */}
      {tab === 'Investor Reports' && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Quarterly Investor Update Generator</div>
            <div className="form-row">
              <FG label="Period From"><input type="date" className="form-input" value={reportFrom} onChange={e => setReportFrom(e.target.value)} /></FG>
              <FG label="Period To"><input type="date" className="form-input" value={reportTo} onChange={e => setReportTo(e.target.value)} /></FG>
            </div>
            <FG label="Next Steps / Notes (editable, included in report)">
              <textarea className="form-input" rows={4} style={{ resize: 'vertical' }} value={reportNotes} onChange={e => setReportNotes(e.target.value)} />
            </FG>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-primary" onClick={generateReportPDF} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ic n="pdf" s={14} c="#fff" /> Generate Investor Report PDF
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', lineHeight: 1.8 }}>
            The report auto-pulls from: vouchers (revenue/expenses), accounts (cash position), shareholders table (capital status).
            It generates a branded PDF with your company header from Report Templates settings.
          </div>
        </>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
