import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { tzs, formatDate } from '../lib/utils'
import type { Page } from '../lib/types'

interface SupplierRow {
  id: string; code: string; name: string; contact_person: string
  phone: string; email: string; address: string
  payment_terms: string; balance_tzs: number; balance_usd: number
  is_active: boolean; created_at: string
}

interface VendorLedgerEntry {
  id: string; posting_date: string; document_type: string
  document_ref: string; description: string
  amount: number; amount_tzs: number; remaining_amount: number
  is_open: boolean; journal_id: string; import_order_ref: string
}

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'plus')    return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  if (n === 'back')    return <svg {...p}><polyline points="15 18 9 12 15 6"/></svg>
  if (n === 'edit')    return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'pdf')     return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  if (n === 'csv')     return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const EMPTY_FORM = {
  name: '', contact_person: '', phone: '', email: '',
  address: '', payment_terms: 'NET30', balance_tzs: '0',
}

export default function Suppliers({ onNav }: { onNav?: (p: Page) => void }) {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  const [view, setView] = useState<'list' | 'ledger' | 'form'>('list')
  const [selected, setSelected] = useState<SupplierRow | null>(null)
  const [ledger, setLedger] = useState<VendorLedgerEntry[]>([])
  const [loadingLedger, setLoadingLedger] = useState(false)

  // Statement date range
  const [stmtFrom, setStmtFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3)
    return d.toISOString().split('T')[0]
  })
  const [stmtTo, setStmtTo] = useState(() => new Date().toISOString().split('T')[0])

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { load() }, [filterActive])

  const load = async () => {
    setLoading(true)
    let query = supabase.from('suppliers').select('*').order('name')
    if (filterActive === 'active') query = query.eq('is_active', true)
    if (filterActive === 'inactive') query = query.eq('is_active', false)
    const { data } = await query
    if (data) setSuppliers(data as SupplierRow[])
    setLoading(false)
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const openLedger = async (s: SupplierRow) => {
    setSelected(s); setView('ledger'); setLoadingLedger(true)
    const { data } = await supabase.from('vendor_ledger_entries')
      .select('*').eq('supplier_id', s.id)
      .gte('posting_date', stmtFrom).lte('posting_date', stmtTo)
      .order('posting_date', { ascending: true })
    if (data) setLedger(data as VendorLedgerEntry[])
    setLoadingLedger(false)
  }

  const reloadLedger = async () => {
    if (!selected) return
    setLoadingLedger(true)
    const { data } = await supabase.from('vendor_ledger_entries')
      .select('*').eq('supplier_id', selected.id)
      .gte('posting_date', stmtFrom).lte('posting_date', stmtTo)
      .order('posting_date', { ascending: true })
    if (data) setLedger(data as VendorLedgerEntry[])
    setLoadingLedger(false)
  }

  const openAdd = () => {
    setForm({ ...EMPTY_FORM })
    setSelected(null); setView('form')
  }

  const openEdit = (s: SupplierRow) => {
    setSelected(s)
    setForm({
      name: s.name || '', contact_person: s.contact_person || '',
      phone: s.phone || '', email: s.email || '',
      address: s.address || '', payment_terms: s.payment_terms || 'NET30',
      balance_tzs: String(s.balance_tzs || 0),
    })
    setView('form')
  }

  const generateCode = async (): Promise<string> => {
    const { data } = await supabase.from('suppliers')
      .select('code').order('code', { ascending: false }).limit(1)
    const last = data?.[0]?.code
    const lastNum = last ? parseInt(last.replace('SUP-', '')) || 0 : 0
    return `SUP-${String(lastNum + 1).padStart(3, '0')}`
  }

  const save = async () => {
    if (!form.name.trim()) { showToast('Supplier name required', 'error'); return }
    setSaving(true)
    try {
      const code = selected?.code || await generateCode()
      const payload: Record<string, unknown> = {
        code,
        name: form.name.trim(),
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        payment_terms: form.payment_terms,
        is_active: true,
      }
      if (selected) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', selected.id)
        if (error) throw new Error(error.message)
        showToast(`${form.name} updated`)
      } else {
        const { error } = await supabase.from('suppliers').insert(payload)
        if (error) throw new Error(error.message)
        showToast(`${form.name} added as ${code}`)
      }
      setView('list'); load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      showToast(msg, 'error')
    } finally { setSaving(false) }
  }

  const filtered = suppliers.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())
        && !(s.code || '').toLowerCase().includes(search.toLowerCase())
        && !(s.contact_person || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalBalance = suppliers.reduce((sum, s) => sum + (s.balance_tzs || 0), 0)

  // Ledger with running balance
  const ledgerWithBalance = () => {
    let bal = 0
    return ledger.map(e => {
      const amt = e.amount_tzs ?? e.amount ?? 0
      bal += amt
      return { ...e, _amount: amt, runningBalance: bal }
    })
  }

  // ── EXPORT STATEMENT PDF ──────────────────────────────
  const exportStatementPDF = async () => {
    if (!selected) return
    const rows = ledgerWithBalance()
    let tplSettings = { company_name: 'Your Organization', company_tagline: 'Reimagining Motherhood', primary_color: '#85c2be', logo_url: null as string | null, logo_position: 'left', logo_width: 50 }
    try {
      const { data } = await supabase.from('report_templates').select('*').limit(1).single()
      if (data) tplSettings = { ...tplSettings, ...data }
    } catch { /* use defaults */ }
    const t = tplSettings
    const pc = t.primary_color || '#85c2be'
    const now = new Date().toLocaleString('en-GB')
    const closingBal = rows.length > 0 ? rows[rows.length - 1].runningBalance : 0
    const logoHtml = t.logo_url ? `<img src="${t.logo_url}" style="height:${t.logo_width || 50}px;margin-right:14px;border-radius:8px"/>` : ''

    const tableRows = rows.map(e => `
      <tr>
        <td class="mono">${e.posting_date}</td>
        <td class="ref">${e.document_ref || ''}</td>
        <td><span class="pill ${e.document_type === 'invoice' ? 'pill-a' : e.document_type === 'payment' ? 'pill-g' : 'pill-b'}">${(e.document_type || '').replace('_', ' ')}</span></td>
        <td>${e.description || ''}</td>
        <td class="num">${e._amount > 0 ? Math.round(e._amount).toLocaleString() : ''}</td>
        <td class="num">${e._amount < 0 ? Math.round(Math.abs(e._amount)).toLocaleString() : ''}</td>
        <td class="num" style="font-weight:700;color:${e.runningBalance > 0 ? '#c0392b' : '#1a7a4a'}">${Math.round(Math.abs(e.runningBalance)).toLocaleString()} ${e.runningBalance > 0 ? 'DR' : 'CR'}</td>
      </tr>
    `).join('')

    const win = window.open('', '_blank')
    if (!win) { showToast('Pop-up blocked', 'error'); return }
    win.document.write(`<!DOCTYPE html><html><head><title>Vendor Statement - ${selected.name}</title>
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
      .supplier-info{background:#f9f9f9;border:1px solid #eee;border-radius:10px;padding:16px 20px;margin-bottom:24px;display:flex;justify-content:space-between}
      .supplier-info .left div{font-size:12px;color:#888;margin-bottom:4px}
      .supplier-info .left .sname{font-size:18px;font-weight:700;color:#222;margin-bottom:2px}
      .stats{display:flex;gap:12px;margin-bottom:24px}
      .stat{flex:1;background:#f9f9f9;border:1px solid #eee;border-radius:10px;padding:14px 16px}
      .stat-label{font-family:'DM Mono',monospace;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
      .stat-val{font-family:'DM Mono',monospace;font-size:18px;font-weight:700}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{text-align:left;padding:8px 10px;background:#f5f5f5;border-bottom:2px solid #ddd;font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#888}
      td{padding:7px 10px;border-bottom:1px solid #f0f0f0}
      .num{text-align:right;font-family:'DM Mono',monospace}
      .ref{font-family:'DM Mono',monospace;color:#D48744;font-weight:600}
      .mono{font-family:'DM Mono',monospace;font-size:10px;color:#888}
      .pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600}
      .pill-g{background:#e6f9f0;color:#1a7a4a} .pill-b{background:#e8f0fe;color:#2563eb} .pill-a{background:#fff3e0;color:#d48744}
      .total-row{background:#f5f5f5;font-weight:700}
      .total-row td{padding:10px;border-top:2px solid #ddd}
      .footer{margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:10px;color:#999;display:flex;justify-content:space-between}
      @media print{body{padding:0}.content{padding:20px 30px}@page{margin:10mm 8mm}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="page">
      <div class="header">
        <div class="logo-area">
          ${logoHtml}
          <div>
            <div class="company-name">${t.company_name}</div>
            <div class="company-sub">${t.company_tagline} · Vendor Statement</div>
          </div>
        </div>
        <div>
          <div class="doc-title">Vendor Statement</div>
          <div class="doc-meta">Period: ${stmtFrom} to ${stmtTo}<br>Generated: ${now}<br>${rows.length} entries</div>
        </div>
      </div>
      <div class="content">
        <div class="supplier-info">
          <div class="left">
            <div class="sname">${selected.name}</div>
            <div>${selected.code} · ${selected.contact_person || ''}</div>
            <div>${selected.phone || ''} ${selected.email ? '· ' + selected.email : ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;color:#888;margin-bottom:4px">Payment Terms</div>
            <div style="font-size:14px;font-weight:700">${selected.payment_terms || 'NET30'}</div>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><div class="stat-label">Opening Balance</div><div class="stat-val">TZS 0</div></div>
          <div class="stat"><div class="stat-label">Invoices</div><div class="stat-val" style="color:#c0392b">TZS ${Math.round(rows.filter(r => r._amount > 0).reduce((s, r) => s + r._amount, 0)).toLocaleString()}</div></div>
          <div class="stat"><div class="stat-label">Payments</div><div class="stat-val" style="color:#1a7a4a">TZS ${Math.round(Math.abs(rows.filter(r => r._amount < 0).reduce((s, r) => s + r._amount, 0))).toLocaleString()}</div></div>
          <div class="stat" style="background:${closingBal > 0 ? '#fef2f2' : '#f0faf7'}"><div class="stat-label">Closing Balance</div><div class="stat-val" style="color:${closingBal > 0 ? '#c0392b' : '#1a7a4a'}">TZS ${Math.round(Math.abs(closingBal)).toLocaleString()} ${closingBal > 0 ? 'DR' : 'CR'}</div></div>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Ref</th><th>Type</th><th>Description</th><th class="num">Debit (TZS)</th><th class="num">Credit (TZS)</th><th class="num">Balance (TZS)</th></tr></thead>
          <tbody>${tableRows}</tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="4">Closing Balance</td>
              <td colspan="3" class="num" style="font-size:14px;color:${closingBal > 0 ? '#c0392b' : '#1a7a4a'}">${Math.round(Math.abs(closingBal)).toLocaleString()} ${closingBal > 0 ? 'DR' : 'CR'}</td>
            </tr>
          </tfoot>
        </table>
        <div class="footer">
          <div>${t.company_name} · Dar es Salaam, Tanzania</div>
          <div>Generated ${now} · SOKORA</div>
        </div>
      </div>
    </div>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  // ── EXPORT STATEMENT CSV ──────────────────────────────
  const exportStatementCSV = () => {
    if (!selected) return
    const rows = ledgerWithBalance()
    const headers = ['Date', 'Ref', 'Type', 'Description', 'Debit', 'Credit', 'Balance']
    const csvRows = rows.map(e => [
      e.posting_date, e.document_ref, e.document_type, `"${(e.description || '').replace(/"/g, '""')}"`,
      e._amount > 0 ? Math.round(e._amount) : '',
      e._amount < 0 ? Math.round(Math.abs(e._amount)) : '',
      Math.round(e.runningBalance),
    ].join(','))
    const csv = [headers.join(','), ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `vendor_statement_${selected.code}_${stmtFrom}_${stmtTo}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── LEDGER VIEW ─────────────────────────────────────────
  if (view === 'ledger' && selected) {
    const rows = ledgerWithBalance()
    const closingBal = rows.length > 0 ? rows[rows.length - 1].runningBalance : 0
    const openEntries = ledger.filter(e => e.is_open && (e.amount_tzs ?? e.amount ?? 0) > 0)
    const importOrderRefs = [...new Set(ledger.map(e => e.import_order_ref).filter(Boolean))]

    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setView('list')}>
              <Ic n="back" /> Suppliers
            </button>
            <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 4 }}>{selected.code}</span>
                <div className="page-title" style={{ margin: 0 }}>{selected.name}</div>
              </div>
              <div className="page-sub">{selected.contact_person || 'Vendor'} · {ledger.length} entries · {selected.payment_terms}</div>
            </div>
          </div>
          <div className="page-actions">
            <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => openEdit(selected)}>
              <Ic n="edit" s={13} /> Edit
            </button>
            <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={exportStatementCSV}>
              <Ic n="csv" s={13} /> CSV
            </button>
            <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={exportStatementPDF}>
              <Ic n="pdf" s={13} /> Statement PDF
            </button>
          </div>
        </div>

        {/* Supplier summary */}
        <div style={{ background: 'linear-gradient(135deg,rgba(10,10,10,1) 0%,rgba(25,25,25,1) 100%)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 14, padding: '18px 24px', marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16 }}>
          {[
            { label: 'AP Balance', val: tzs(selected.balance_tzs || 0), color: (selected.balance_tzs || 0) > 0 ? 'var(--red)' : 'var(--green)' },
            { label: 'Payment Terms', val: selected.payment_terms || 'NET30', color: 'var(--text)' },
            { label: 'Total Entries', val: String(ledger.length), color: 'var(--text)' },
            { label: 'Open Entries', val: String(openEntries.length), color: openEntries.length > 0 ? 'var(--yellow)' : 'var(--text3)' },
            { label: 'Import Orders', val: String(importOrderRefs.length), color: importOrderRefs.length > 0 ? 'var(--accent)' : 'var(--text3)' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: item.color }}>{item.val}</div>
            </div>
          ))}
        </div>

        {/* Consignment breakdown */}
        {importOrderRefs.length > 0 && (
          <div style={{ background: 'rgba(133,194,190,.06)', border: '1px solid rgba(133,194,190,.15)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Consignments Linked</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {importOrderRefs.map(ref => {
                const refEntries = ledger.filter(e => e.import_order_ref === ref)
                const refTotal = refEntries.reduce((s, e) => s + Math.abs(e.amount_tzs ?? e.amount ?? 0), 0)
                return (
                  <div key={ref} style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{ref}</span>
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>{refEntries.length} entries</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600 }}>{tzs(refTotal)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Date range filter */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <FG label="From"><input type="date" className="form-input" style={{ padding: '6px 8px', fontSize: 12 }} value={stmtFrom} onChange={e => setStmtFrom(e.target.value)} /></FG>
          <FG label="To"><input type="date" className="form-input" style={{ padding: '6px 8px', fontSize: 12 }} value={stmtTo} onChange={e => setStmtTo(e.target.value)} /></FG>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 18 }} onClick={reloadLedger}>Filter</button>
        </div>

        {/* Ledger table */}
        <div className="card">
          {loadingLedger ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading ledger…</div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No ledger entries for this period.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Ref</th><th>Type</th><th>Description</th>
                    <th className="td-right">Debit</th>
                    <th className="td-right">Credit</th>
                    <th className="td-right">Balance</th>
                    <th>Consignment</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => {
                    const isOpen = e.is_open && e._amount > 0
                    return (
                      <tr key={i} style={{ background: isOpen ? 'rgba(212,135,74,.04)' : 'transparent' }}>
                        <td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{e.posting_date}</td>
                        <td className="td-mono td-amber" style={{ fontSize: 11, fontWeight: 700 }}>{e.document_ref}</td>
                        <td><span className={`pill ${e.document_type === 'invoice' ? 'pill-amber' : e.document_type === 'payment' ? 'pill-green' : 'pill-gray'}`} style={{ fontSize: 9 }}>{(e.document_type || '').replace('_', ' ')}</span></td>
                        <td style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</td>
                        <td className="td-right td-mono" style={{ color: 'var(--red)', fontSize: 12 }}>{e._amount > 0 ? tzs(e._amount) : ''}</td>
                        <td className="td-right td-mono" style={{ color: 'var(--green)', fontSize: 12 }}>{e._amount < 0 ? tzs(Math.abs(e._amount)) : ''}</td>
                        <td className="td-right td-mono" style={{ fontWeight: 700, fontSize: 13, color: e.runningBalance > 0 ? 'var(--red)' : 'var(--green)' }}>
                          {tzs(Math.abs(e.runningBalance))}
                          <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--text3)' }}>{e.runningBalance > 0 ? 'DR' : 'CR'}</span>
                        </td>
                        <td>
                          {(e as VendorLedgerEntry).import_order_ref
                            ? <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 6px', borderRadius: 4 }}>{(e as VendorLedgerEntry).import_order_ref}</span>
                            : <span style={{ fontSize: 10, color: 'var(--text3)' }}></span>
                          }
                        </td>
                        <td>
                          {isOpen
                            ? <span className="pill pill-amber" style={{ fontSize: 9 }}>Open</span>
                            : e._amount < 0
                            ? <span className="pill pill-green" style={{ fontSize: 9 }}>Payment</span>
                            : <span className="pill pill-gray" style={{ fontSize: 9 }}>Closed</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface2)', fontWeight: 800 }}>
                    <td colSpan={4} style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>Closing Balance</td>
                    <td colSpan={3} className="td-right td-mono" style={{ color: closingBal > 0 ? 'var(--red)' : 'var(--green)', fontSize: 15, padding: '12px 14px', fontWeight: 800 }}>
                      {tzs(Math.abs(closingBal))} {closingBal > 0 ? 'DR' : 'CR'}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
      </div>
    )
  }

  // ── FORM VIEW ─────────────────────────────────────────
  if (view === 'form') {
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setView('list')}>
              <Ic n="back" /> Suppliers
            </button>
            <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
            <div className="page-title">{selected ? `Edit — ${selected.name}` : 'Add Supplier'}</div>
          </div>
          <div className="page-actions">
            <button className="btn btn-ghost" onClick={() => setView('list')}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : selected ? 'Save Changes' : 'Add Supplier'}</button>
          </div>
        </div>

        <div className="grid g2" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Supplier Details</div>
            <FG label="Supplier Name" req>
              <input className="form-input" placeholder="e.g. Meditech Tanzania Ltd" value={form.name} onChange={e => setF('name', e.target.value)} />
            </FG>
            <FG label="Contact Person">
              <input className="form-input" placeholder="e.g. John Mwema" value={form.contact_person} onChange={e => setF('contact_person', e.target.value)} />
            </FG>
            <div className="form-row">
              <FG label="Phone"><input className="form-input" placeholder="+255 7XX XXX XXX" value={form.phone} onChange={e => setF('phone', e.target.value)} /></FG>
              <FG label="Email"><input className="form-input" placeholder="supplier@email.com" value={form.email} onChange={e => setF('email', e.target.value)} /></FG>
            </div>
            <FG label="Address">
              <textarea className="form-input" rows={2} style={{ resize: 'none' }} placeholder="P.O. Box 1234, Dar es Salaam" value={form.address} onChange={e => setF('address', e.target.value)} />
            </FG>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Payment Terms</div>
              <FG label="Payment Terms" req>
                <select className="form-input" value={form.payment_terms} onChange={e => setF('payment_terms', e.target.value)}>
                  {['COD', 'NET7', 'NET14', 'NET30', 'NET45', 'NET60', 'NET90'].map(t => <option key={t}>{t}</option>)}
                </select>
              </FG>
            </div>

            {selected && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Account Info</div>
                {[
                  { label: 'Supplier Code', val: selected.code },
                  { label: 'AP Balance (TZS)', val: tzs(selected.balance_tzs || 0) },
                  { label: 'USD Balance', val: `USD ${(selected.balance_usd || 0).toLocaleString()}` },
                  { label: 'Created', val: selected.created_at ? formatDate(selected.created_at) : '' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ color: 'var(--text3)' }}>{item.label}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{item.val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
      </div>
    )
  }

  // ── LIST VIEW ─────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Suppliers</div>
          <div className="page-sub">AP · Vendor management · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={load}><Ic n="refresh" /> Refresh</button>
          <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={openAdd}><Ic n="plus" s={13} /> Add Supplier</button>
        </div>
      </div>

      {/* SHORTCUTS */}
      {onNav && (
        <div className="shortcut-bar">
          {[
            { icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z M9 12h6 M9 16h6', label: 'Purchase Order', page: 'purchase-order' as Page },
            { icon: 'M1 3h15v13H1zM16 8h7v13H8v-5', label: 'GRN', page: 'grn' as Page },
            { icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8', label: 'Purchase Invoice', page: 'purchase-invoice' as Page },
            { icon: 'M18 20V10M12 20V4M6 20v-6', label: 'AP Aging', page: 'ap-aging' as Page },
            { icon: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', label: 'Payment Voucher', page: 'cash-payment' as Page },
            { icon: 'M2 20h20 M5 20V9l7-6 7 6v11 M10 20v-6h4v6', label: 'Import Order', page: 'import-order' as Page },
          ].map((s, i) => (
            <button key={i} className="shortcut-btn" onClick={() => onNav(s.page)}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d={s.icon}/></svg>
              {s.label}
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      )}

      {/* Summary banner */}
      <div style={{ background: 'linear-gradient(135deg,rgba(168,85,247,.08) 0%,rgba(168,85,247,.04) 100%)', border: '1px solid rgba(168,85,247,.2)', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>AP — Accounts Payable Control</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '3px 10px', borderRadius: 6 }}>2010</span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700 }}>Import Suppliers</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, textAlign: 'right' }}>
          {[
            { label: 'Total Suppliers', val: suppliers.length },
            { label: 'Total AP Balance', val: tzs(totalBalance), color: totalBalance > 0 ? 'var(--red)' : 'var(--green)' },
            { label: 'With Balance', val: suppliers.filter(s => (s.balance_tzs || 0) > 0).length },
          ].map((item, i) => (
            <div key={i}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: (item as { color?: string }).color || 'var(--text)' }}>{item.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input className="form-input" style={{ width: 220, padding: '7px 10px', fontSize: 12 }} placeholder="Search name, code, contact…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-input" style={{ fontSize: 12, padding: '7px 10px', width: 150 }} value={filterActive} onChange={e => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>{filtered.length} of {suppliers.length} shown</div>
      </div>

      {/* Supplier table */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div>
      ) : (
        <div className="card">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No suppliers found. Click + to add one.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th><th>Supplier Name</th><th>Contact</th>
                    <th>Phone</th><th>Terms</th>
                    <th className="td-right">AP Balance (TZS)</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={i} style={{ cursor: 'pointer' }}
                      onClick={() => openLedger(s)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td className="td-mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{s.code || ''}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                        {s.email && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{s.email}</div>}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{s.contact_person || ''}</td>
                      <td className="td-mono" style={{ fontSize: 11 }}>{s.phone || ''}</td>
                      <td><span className="pill pill-gray" style={{ fontSize: 9 }}>{s.payment_terms || 'NET30'}</span></td>
                      <td className="td-right td-mono" style={{ fontWeight: 700, color: (s.balance_tzs || 0) > 0 ? 'var(--red)' : 'var(--text3)', fontSize: 12 }}>
                        {(s.balance_tzs || 0) > 0 ? tzs(s.balance_tzs) : ''}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(s)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Ic n="edit" s={11} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
