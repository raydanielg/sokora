import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { tzs } from '../lib/utils'
import type { Page, LifeStage } from '../lib/types'
import { LIFE_STAGE_LABELS } from '../lib/types'
import { useTableSort } from '../lib/useTableSort'
import CashCustomerDetail from './customers/CashCustomerDetail'  // cash-customer profile: purchase history, top products, stage migration, notes

interface Customer {
  id: string; customer_number: string; name: string; company: string; contact_person: string
  // 'wholesale' replaces 'debtor' as the canonical label. We still accept
  // 'debtor' in the union for any rows that weren't migrated (e.g. by
  // forgetting to run migration 009) so they remain readable rather than
  // silently dropped from queries.
  customer_type: 'cash' | 'debtor' | 'wholesale'; segment: string
  whatsapp: string; email: string; phone: string
  address: string                  // physical / postal address
  tin_number: string | null        // Tanzanian TIN, raw entry, format NNN-NNN-NNN
  credit_limit: number; credit_period: number; payment_terms: string
  balance: number; crown_points: number; is_active: boolean
  is_hidden?: boolean              // soft hide flag — excluded from pickers, kept in reports
  last_purchase_date: string; last_purchase_amount: number; notes: string
  created_at: string
  // Journey fields (populated for cash customers via customer_metrics view join)
  life_stage?: LifeStage | null
  lifecycle_stage?: string | null
  owner_user_id?: string | null
  owner_name?: string | null
  stage_paused?: boolean
}

interface LedgerEntry {
  id: string; posting_date: string; document_type: string
  document_ref: string; description: string
  amount: number; remaining_amount: number; is_open: boolean; due_date: string
}

// Keyed by the customer_type literal. The dictionary still maps the legacy
// 'debtor' key to the same list so transitional rows render correctly.
const SEGMENTS: Record<'cash' | 'wholesale' | 'debtor', string[]> = {
  cash:      ['Retail', 'Wholesale'],
  wholesale: ['Corporate', 'Wholesale'],
  debtor:    ['Corporate', 'Wholesale'],
}
const PAYMENT_TERMS = ['COD', 'NET7', 'NET14', 'NET30', 'NET60', 'NET90']

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'user')    return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  if (n === 'plus')    return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  if (n === 'back')    return <svg {...p}><polyline points="15 18 9 12 15 6"/></svg>
  if (n === 'ledger')  return <svg {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
  if (n === 'edit')    return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  if (n === 'wa')      return <svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'csv')     return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const EMPTY_FORM = {
  name: '', company: '', contact_person: '',
  // Includes 'debtor' in the union to accept legacy rows opened for edit.
  // On save we coerce non-cash values to 'wholesale' so editing migrates
  // the row.
  customer_type: 'cash' as 'cash' | 'wholesale' | 'debtor',
  segment: 'Retail',
  whatsapp: '', email: '', phone: '', address: '',
  tin_number: '',
  credit_limit: '0', credit_period: '0', payment_terms: 'COD', notes: ''
}

export default function Customers({ onNav, onViewStatement, onReceipt }: { onNav?: (p: Page) => void; onViewStatement?: (customerId: string) => void; onReceipt?: (customerId: string, amount: number) => void }) {
  // Tabs: 'cash' = retail walk-ins; 'wholesale' = sales-invoice customers
  // (formerly labelled "Debtors"; see migration 009).
  const [tab, setTab] = useState<'cash'|'wholesale'>('cash')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [segFilter, setSegFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState<'all'|'unclassified'|LifeStage>('all')
  const [showPausedOnly, setShowPausedOnly] = useState(false)
  // When true, the wholesale list shows soft-hidden contacts too. Hidden
  // rows are kept fully usable for reports but excluded by default so the
  // active roster stays tidy.
  const [showHidden, setShowHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')

  // Views: list | ledger | form
  const [view, setView] = useState<'list'|'ledger'|'form'>('list')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loadingLedger, setLoadingLedger] = useState(false)

  // Form
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Bulk selection of customers for "Send template to many" / "Log as sent"
  // workflows. Selection is cash-only (the bulk WhatsApp flow doesn't apply
  // to wholesale debtors).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActionOpen, setBulkActionOpen] = useState<'send' | 'log' | null>(null)
  const [bulkTemplates, setBulkTemplates] = useState<Array<{ id: string; name: string; category: string; body: string; is_transactional: boolean }>>([])
  const [bulkSelectedTemplateId, setBulkSelectedTemplateId] = useState<string>('')
  const [bulkAdvanceStage, setBulkAdvanceStage] = useState<string>('')
  const [bulkSaving, setBulkSaving] = useState(false)

  // Reset selection when switching tab or filters that change the row set
  useEffect(() => { setSelectedIds(new Set()) }, [tab, search, segFilter, stageFilter, showPausedOnly])

  // Lazy-load templates the first time a bulk action modal opens
  useEffect(() => {
    if (bulkActionOpen && bulkTemplates.length === 0) {
      supabase
        .from('whatsapp_templates')
        .select('id, name, category, body, is_transactional')
        .eq('is_active', true)
        .order('category')
        .order('name')
        .then(({ data }) => setBulkTemplates((data ?? []) as any))
    }
  }, [bulkActionOpen])

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAllVisible = (visibleIds: string[]) => {
    setSelectedIds(prev => {
      const allSelected = visibleIds.every(id => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        visibleIds.forEach(id => next.delete(id))
        return next
      }
      const next = new Set(prev)
      visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  // Single-row WhatsApp button — opens the templates page with this
  // customer pre-loaded via the sessionStorage shuttle (same pattern as
  // the "Send template" button on the customer detail page).
  const openWhatsAppForCustomer = (c: Customer) => {
    if (!onNav) return
    if (c.customer_type !== 'cash') {
      setToast('WhatsApp templates are for cash customers only'); setToastType('error'); return
    }
    sessionStorage.setItem('wa_template_target_customer', JSON.stringify({
      id:               c.id,
      name:             c.name,
      whatsapp:         c.whatsapp,
      phone:            c.whatsapp,
      ambassador_code:  (c as any).ambassador_code ?? null,
      life_stage:       c.life_stage ?? null,
      edd:              (c as any).edd ?? null,
      delivery_date:    (c as any).delivery_date ?? null,
      crown_points:     c.crown_points ?? 0,
      stage_paused:     c.stage_paused ?? false,
    }))
    onNav('crm-whatsapp-templates')
  }

  const submitBulkLog = async () => {
    if (!bulkSelectedTemplateId || selectedIds.size === 0) return
    setBulkSaving(true)
    const { error } = await supabase.rpc('log_whatsapp_send_bulk', {
      p_template_id:      bulkSelectedTemplateId,
      p_customer_ids:     Array.from(selectedIds),
      p_merged_body:      null,  // backfill: use template body as-is
      p_advance_stage_to: bulkAdvanceStage || null,
    })
    setBulkSaving(false)
    if (error) {
      setToast('Bulk log failed: ' + error.message); setToastType('error')
      return
    }
    setToast(`Logged ${selectedIds.size} send${selectedIds.size === 1 ? '' : 's'}`); setToastType('success')
    setBulkActionOpen(null)
    setBulkSelectedTemplateId('')
    setBulkAdvanceStage('')
    setSelectedIds(new Set())
    load()  // refresh in case stage was advanced
  }


  useEffect(() => { load() }, [tab])

  const load = async () => {
    setLoading(true)
    // For the wholesale tab, accept BOTH 'wholesale' (canonical) AND
    // 'debtor' (legacy) so a partially-migrated DB still renders correctly.
    // We pull hidden rows in the query and filter them out in `filtered`
    // below so the "Show hidden" toggle is a client-side flip rather than
    // a round-trip.
    const { data } = tab === 'cash'
      ? await supabase.from('customers').select('*')
          .eq('customer_type', 'cash').eq('is_active', true).order('name')
      : await supabase.from('customers').select('*')
          .in('customer_type', ['wholesale', 'debtor']).eq('is_active', true).order('name')
    if (!data) { setLoading(false); return }

    let rows = data as Customer[]

    // For cash customers, also pull life_stage/lifecycle_stage from customer_metrics view.
    // The view only includes active cash customers (matching the WHERE on the page).
    if (tab === 'cash') {
      const { data: metrics } = await supabase
        .from('customer_metrics')
        .select('customer_id, life_stage, lifecycle_stage')
      if (metrics) {
        const byId = new Map<string, { life_stage: LifeStage | null; lifecycle_stage: string | null }>()
        for (const m of metrics as Array<{ customer_id: string; life_stage: LifeStage | null; lifecycle_stage: string | null }>) {
          byId.set(m.customer_id, { life_stage: m.life_stage, lifecycle_stage: m.lifecycle_stage })
        }
        rows = rows.map(r => {
          const m = byId.get(r.id)
          return { ...r, life_stage: m?.life_stage ?? null, lifecycle_stage: m?.lifecycle_stage ?? null }
        })
      }
    }

    setCustomers(rows)
    setLoading(false)
  }

  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  const openLedger = async (c: Customer) => {
    setSelected(c); setView('ledger'); setLoadingLedger(true)
    const { data } = await supabase.from('customer_ledger_entries')
      .select('*').eq('customer_id', c.id)
      .order('posting_date', { ascending: false })
    if (data) setLedger(data as LedgerEntry[])
    setLoadingLedger(false)
  }

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, customer_type: tab === 'cash' ? 'cash' : 'wholesale', segment: tab === 'cash' ? 'Retail' : 'Corporate' })
    setSelected(null); setView('form')
  }

  const openEdit = (c: Customer) => {
    setSelected(c)
    // Always coerce legacy 'debtor' to 'wholesale' on the form so saving
    // an edited legacy row auto-migrates it. Avoids leaving 'debtor' in
    // the DB after the user has touched the record.
    const ct: 'cash' | 'wholesale' = c.customer_type === 'cash' ? 'cash' : 'wholesale'
    setForm({
      name: c.name, company: c.company || '', contact_person: c.contact_person || '',
      customer_type: ct,
      segment: c.segment, whatsapp: c.whatsapp || '', email: c.email || '',
      phone: (c as any).phone || '', address: (c as any).address || '',
      tin_number: (c as any).tin_number || '',
      credit_limit: String(c.credit_limit || 0), credit_period: String(c.credit_period || 0),
      payment_terms: c.payment_terms || 'COD', notes: c.notes || ''
    })
    setView('form')
  }

  const generateNumber = async (type: 'cash'|'wholesale'): Promise<string> => {
    if (type === 'cash') {
      const { count } = await supabase.from('customers').select('*', { count: 'exact', head: true }).eq('customer_type', 'cash')
      return `CONT-${String((count || 0) + 10001)}`
    } else {
      // Look at BOTH WHL- prefixed (new) and DEB- prefixed (legacy) numbers
      // so the next sequence never collides with a pre-migration row.
      const { data } = await supabase.from('customers')
        .select('customer_number')
        .in('customer_type', ['wholesale', 'debtor'])
        .order('customer_number', { ascending: false })
        .limit(50)
      let maxNum = 0
      for (const row of (data || []) as { customer_number: string }[]) {
        const m = row.customer_number?.match(/^(WHL|DEB)-10-(\d+)$/)
        if (m) {
          const n = parseInt(m[2], 10)
          if (!isNaN(n) && n > maxNum) maxNum = n
        }
      }
      return `WHL-10-${String(maxNum + 1).padStart(4, '0')}`
    }
  }

  const save = async () => {
    const isWholesale = form.customer_type !== 'cash'  // 'wholesale' or legacy 'debtor'
    const displayName = isWholesale ? form.company.trim() : form.name.trim()
    if (!displayName) { showToast(isWholesale ? 'Company name required' : 'Customer name required', 'error'); return }
    if (isWholesale && !(form as any).contact_person?.trim()) { showToast('Contact person required', 'error'); return }
    if (form.customer_type === 'cash' && !form.whatsapp.trim()) { showToast('WhatsApp number required for cash contacts', 'error'); return }
    setSaving(true)
    try {
      const customerNumber = selected?.customer_number || await generateNumber(form.customer_type as 'cash'|'wholesale')
      const payload: any = {
        // For wholesale: name = company name for searching; for cash: name = person name
        name: isWholesale ? form.company.trim() : form.name.trim(),
        company: form.company.trim() || null,
        contact_person: (form as any).contact_person?.trim() || null,
        customer_type: form.customer_type,
        segment: form.segment.toLowerCase(),
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
        phone: (form as any).phone?.trim() || null,
        address: (form as any).address?.trim() || null,
        tin_number: (form as any).tin_number?.trim() || null,
        credit_limit: parseFloat(form.credit_limit) || 0,
        credit_period: parseInt(form.credit_period) || 0,
        payment_terms: form.payment_terms, notes: form.notes.trim() || null,
        customer_number: customerNumber, is_active: true,
      }
      if (selected) {
        const { error } = await supabase.from('customers').update(payload).eq('id', selected.id)
        if (error) throw new Error(error.message)
        showToast(`${displayName} updated`)
      } else {
        const { error } = await supabase.from('customers').insert(payload)
        if (error) throw new Error(error.message)
        showToast(`${displayName} added — ${customerNumber}`)
      }
      setView('list'); load()
    } catch (err: any) { showToast(err.message || 'Save failed', 'error') }
    finally { setSaving(false) }
  }

  // ── Hide / unhide a wholesale contact ────────────────────────────────
  // Soft-hide: removes the contact from future pickers (Cash Sale, Sales
  // Invoice, batch receipts) but keeps every historical ledger entry,
  // statement, and AR row exactly as it was. Reversible via the same
  // button when "Show hidden" is on.
  const toggleHidden = async (c: Customer) => {
    const goingHidden = !c.is_hidden
    const ok = window.confirm(
      goingHidden
        ? `Hide "${c.company || c.name}" from pickers?\n\nThis only affects new vouchers. Existing AR balance, statements, and reports will continue to show this contact.`
        : `Un-hide "${c.company || c.name}"? It will appear in pickers again.`
    )
    if (!ok) return
    const { error } = await supabase.from('customers').update({ is_hidden: goingHidden }).eq('id', c.id)
    if (error) { showToast(error.message, 'error'); return }
    showToast(goingHidden ? `${c.company || c.name} hidden` : `${c.company || c.name} restored`)
    load()
  }

  // ── Delete (hard) ─────────────────────────────────────────────────────
  // We only allow delete when balance == 0 and no historical vouchers
  // reference the customer. Otherwise the FK on customer_ledger_entries
  // would refuse, leaving the user confused. We refuse pre-flight with a
  // clear message and suggest Hide instead.
  const deleteCustomer = async (c: Customer) => {
    if ((c.balance || 0) > 0) {
      showToast(`Cannot delete: ${c.company || c.name} has outstanding balance of ${tzs(c.balance)}. Hide instead, or settle the balance first.`, 'error')
      return
    }
    // Check for ledger entries referencing this customer. A real prior
    // relationship (even if balanced to zero) deserves preservation.
    const { count } = await supabase.from('customer_ledger_entries')
      .select('id', { count: 'exact', head: true }).eq('customer_id', c.id)
    if ((count || 0) > 0) {
      const fallback = window.confirm(
        `${c.company || c.name} has ${count} ledger entries. Deleting would corrupt audit history.\n\nHide instead? (Removes from pickers, preserves all reports.)`
      )
      if (fallback) toggleHidden({ ...c, is_hidden: false })
      return
    }
    const ok = window.confirm(`PERMANENTLY delete "${c.company || c.name}"?\n\nThis cannot be undone. (No history attached, so nothing else will break.)`)
    if (!ok) return
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
    if (error) { showToast(error.message, 'error'); return }
    showToast(`${c.company || c.name} deleted`)
    load()
  }

  // Stats
  const totalBalance = customers.reduce((s, c) => s + (c.balance || 0), 0)
  const totalCredit = customers.reduce((s, c) => s + (c.credit_limit || 0), 0)

  const filtered = customers.filter(c => {
    // On the wholesale tab, hide soft-hidden contacts unless the toggle
    // is on. The cash tab ignores this flag (no hide UI on cash side).
    if (tab === 'wholesale' && !showHidden && c.is_hidden) return false
    if (segFilter !== 'all' && c.segment !== segFilter.toLowerCase()) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.whatsapp || '').includes(search) && !(c.customer_number || '').toLowerCase().includes(search.toLowerCase())) return false
    if (tab === 'cash') {
      if (stageFilter === 'unclassified' && c.life_stage) return false
      if (stageFilter !== 'all' && stageFilter !== 'unclassified' && c.life_stage !== stageFilter) return false
      if (showPausedOnly && !c.stage_paused) return false
    }
    return true
  })

  // ── Sort wiring ────────────────────────────────────────────────────────
  // Uses useTableSort: click to sort, shift-click for multi-column.
  // Persisted per-tab so cash and debtors don't fight over the same key.
  const sortAccessor = (row: Customer, key: string): unknown => {
    switch (key) {
      case 'customer_number':   return row.customer_number
      case 'name':              return row.name
      case 'company':           return row.company || row.name
      case 'segment':           return row.segment
      case 'whatsapp':          return row.whatsapp
      case 'payment_terms':     return row.payment_terms
      case 'credit_limit':      return row.credit_limit ?? 0
      case 'balance':           return row.balance ?? 0
      case 'last_purchase':     return row.last_purchase_date
      case 'crown_points':      return row.crown_points ?? 0
      case 'life_stage':        return row.life_stage
      default:                  return undefined
    }
  }

  const sortStorageKey = tab === 'cash' ? 'sokora.customers.sort.cash' : 'sokora.customers.sort.wholesale'
  const defaultSort = useMemo(() => [{ key: 'name', direction: 'asc' as const }], [])
  const { sorted, onHeaderClick, getSortIndex, getSortDir } =
    useTableSort<Customer>(filtered, { storageKey: sortStorageKey, defaultSort, accessor: sortAccessor })

  // Running balance for ledger
  const ledgerWithBalance = () => {
    let bal = 0
    return [...ledger].reverse().map(e => {
      bal += e.amount
      return { ...e, runningBalance: bal }
    }).reverse()
  }

  const openInvoices = ledger.filter(e => e.is_open && e.amount > 0)
  const totalOutstanding = openInvoices.reduce((s, e) => s + e.remaining_amount, 0)

  // ── CASH CUSTOMER DETAIL (CRM-focused page) ─────────────────────────────
  // Cash customers (B2C / moms) get the loyalty-and-marketing CRM view
  // (purchase history, top products, life-stage migration, notes).
  // Debtors (wholesale / resellers) keep the credit-focused ledger view below.
  if (view === 'ledger' && selected && selected.customer_type === 'cash') {
    return (
      <CashCustomerDetail
        customerId={selected.id}
        onBack={() => setView('list')}
        onViewStatement={onViewStatement}
        {...(onNav ? { onNav } : {})}
      />
    )
  }

  // ── LEDGER VIEW ─────────────────────────────────────────────────────────
  if (view === 'ledger' && selected) {
    const rows = ledgerWithBalance()
    const creditUsedPct = selected.credit_limit > 0 ? Math.min(100, Math.round((selected.balance / selected.credit_limit) * 100)) : 0

    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display:'flex',alignItems:'center',gap:12 }}>
            <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => setView('list')}>
              <Ic n="back" /> Customers
            </button>
            <div style={{ width:1,height:24,background:'var(--border)' }}></div>
            <div>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <span style={{ fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',background:'var(--accent-dim)',padding:'2px 8px',borderRadius:4 }}>{selected.customer_number}</span>
                <div className="page-title" style={{ margin:0 }}>{selected.name}</div>
                <span className="pill pill-gray" style={{ fontSize:9,textTransform:'uppercase' }}>{selected.segment}</span>
              </div>
              <div className="page-sub">{selected.company || (selected.customer_type === 'cash' ? 'Cash Customer' : 'Debtor')} · {ledger.length} entries</div>
            </div>
          </div>
          <div className="page-actions">
            <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => openEdit(selected)}>
              <Ic n="edit" s={13} /> Edit
            </button>
            {onViewStatement && (
              <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }}
                onClick={() => onViewStatement(selected.id)}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                View Statement
              </button>
            )}
            {onReceipt && (selected.balance || 0) > 0 && (
              <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }}
                onClick={() => onReceipt(selected.id, selected.balance || 0)} title="Record a receipt against this balance">
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M4 3h16v18l-3-2-2 2-3-2-3 2-2-2-3 2z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                Receipt
              </button>
            )}
            {selected.whatsapp && (
              <a href={`https://wa.me/${selected.whatsapp.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer"
                className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6,color:'#25D366' }}>
                <Ic n="wa" s={13} c="#25D366" /> WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Customer summary */}
        <div style={{ background:'linear-gradient(135deg,rgba(10,10,10,1) 0%,rgba(25,25,25,1) 100%)',border:'1px solid rgba(255,255,255,.06)',borderRadius:14,padding:'18px 24px',marginBottom:20,display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:16 }}>
          {[
            { label:'Outstanding Balance', val: tzs(selected.balance || 0), color: (selected.balance||0) > 0 ? 'var(--red)' : 'var(--green)' },
            { label:'Credit Limit', val: selected.credit_limit > 0 ? tzs(selected.credit_limit) : 'Unlimited', color:'var(--text)' },
            { label:'Credit Period', val: selected.credit_period > 0 ? `${selected.credit_period} days` : 'COD', color:'var(--text)' },
            { label:'Crown Points', val: (selected.crown_points||0).toLocaleString(), color:'var(--yellow)' },
            { label:'Last Purchase', val: selected.last_purchase_date || '—', color:'var(--text3)' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize:9,fontFamily:'var(--mono)',color:'#666',textTransform:'uppercase',letterSpacing:1,marginBottom:6 }}>{item.label}</div>
              <div style={{ fontFamily:'var(--mono)',fontSize:14,fontWeight:700,color:item.color }}>{item.val}</div>
            </div>
          ))}
        </div>

        {/* Credit usage bar — wholesale contacts (and legacy debtor rows) */}
        {selected.customer_type !== 'cash' && selected.credit_limit > 0 && (
          <div style={{ marginBottom:16,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 16px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',marginBottom:8,fontSize:12 }}>
              <span style={{ color:'var(--text3)' }}>Credit Used</span>
              <span style={{ fontFamily:'var(--mono)',fontWeight:700,color:creditUsedPct > 80 ? 'var(--red)' : 'var(--accent)' }}>{creditUsedPct}%</span>
            </div>
            <div style={{ height:6,background:'var(--surface3)',borderRadius:3,overflow:'hidden' }}>
              <div style={{ height:'100%',width:`${creditUsedPct}%`,background:creditUsedPct>80?'var(--red)':creditUsedPct>60?'var(--yellow)':'var(--green)',borderRadius:3,transition:'width .3s' }}></div>
            </div>
            <div style={{ display:'flex',justifyContent:'space-between',marginTop:6,fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)' }}>
              <span>Used: {tzs(selected.balance||0)}</span>
              <span>Available: {tzs(Math.max(0,selected.credit_limit-(selected.balance||0)))}</span>
            </div>
          </div>
        )}

        {/* Open invoices summary */}
        {openInvoices.length > 0 && (
          <div style={{ background:'rgba(255,71,87,.06)',border:'1px solid rgba(255,71,87,.2)',borderRadius:10,padding:'12px 16px',marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            <div>
              <div style={{ fontSize:13,fontWeight:600,color:'var(--red)' }}>{openInvoices.length} Open Invoice{openInvoices.length>1?'s':''}</div>
              <div style={{ fontSize:11,color:'var(--text3)',marginTop:2 }}>Total outstanding: <span style={{ fontFamily:'var(--mono)',fontWeight:700,color:'var(--red)' }}>{tzs(totalOutstanding)}</span></div>
            </div>
            <div style={{ fontSize:10,color:'var(--text3)' }}>Highlighted below</div>
          </div>
        )}

        {/* Ledger table */}
        <div className="card">
          {loadingLedger ? (
            <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading ledger…</div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>No ledger entries yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Ref</th><th>Type</th><th>Description</th>
                    <th className="td-right">Debit</th>
                    <th className="td-right">Credit</th>
                    <th className="td-right">Balance</th>
                    <th>Due Date</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => {
                    const isOpen = e.is_open && e.amount > 0
                    const isOverdue = e.due_date && new Date(e.due_date) < new Date() && e.is_open
                    return (
                      <tr key={i} style={{ background: isOverdue ? 'rgba(255,71,87,.04)' : isOpen ? 'rgba(212,135,74,.04)' : 'transparent' }}>
                        <td className="td-mono" style={{ fontSize:11,color:'var(--text3)' }}>{e.posting_date}</td>
                        <td className="td-mono td-amber" style={{ fontSize:11,fontWeight:700 }}>{e.document_ref}</td>
                        <td><span className={`pill ${e.document_type==='invoice'?'pill-amber':e.document_type==='payment'?'pill-green':e.document_type==='cash_sale'?'pill-blue':'pill-gray'}`} style={{ fontSize:9 }}>{e.document_type?.replace('_',' ')}</span></td>
                        <td style={{ fontSize:11,color:'var(--text3)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{e.description}</td>
                        <td className="td-right td-mono" style={{ color:'var(--red)',fontSize:12 }}>{e.amount > 0 ? tzs(e.amount) : '—'}</td>
                        <td className="td-right td-mono" style={{ color:'var(--green)',fontSize:12 }}>{e.amount < 0 ? tzs(Math.abs(e.amount)) : '—'}</td>
                        <td className="td-right td-mono" style={{ fontWeight:700,fontSize:13,color:(e as any).runningBalance > 0 ? 'var(--red)' : 'var(--green)' }}>
                          {tzs(Math.abs((e as any).runningBalance))}
                          <span style={{ fontSize:9,marginLeft:4,color:'var(--text3)' }}>{(e as any).runningBalance > 0 ? 'DR' : 'CR'}</span>
                        </td>
                        <td className="td-mono" style={{ fontSize:10,color: isOverdue ? 'var(--red)' : 'var(--text3)' }}>{e.due_date || '—'}</td>
                        <td>
                          {e.is_open && e.amount > 0
                            ? <span className="pill pill-amber" style={{ fontSize:9 }}>{isOverdue ? 'Overdue' : 'Open'}</span>
                            : e.amount < 0
                            ? <span className="pill pill-green" style={{ fontSize:9 }}>Payment</span>
                            : <span className="pill pill-gray" style={{ fontSize:9 }}>Closed</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background:'var(--surface2)',fontWeight:800 }}>
                    <td colSpan={4} style={{ padding:'12px 14px',fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)',textTransform:'uppercase' }}>Closing Balance</td>
                    <td colSpan={3} className="td-right td-mono" style={{ color: (selected.balance||0) > 0 ? 'var(--red)' : 'var(--green)',fontSize:15,padding:'12px 14px',fontWeight:800 }}>
                      {tzs(Math.abs(selected.balance||0))} {(selected.balance||0) > 0 ? 'DR' : 'CR'}
                    </td>
                    <td colSpan={2}></td>
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

  // ── FORM VIEW ────────────────────────────────────────────────────────────
  if (view === 'form') {
    // Treat legacy 'debtor' the same as the canonical 'wholesale' on the
    // form. On save we coerce to 'wholesale', completing the migration row
    // by row as the user touches existing records.
    const isWholesale = form.customer_type !== 'cash'
    // Form select needs to render with one of the two canonical values
    // even if the underlying record still has 'debtor'.
    const formTypeValue = form.customer_type === 'debtor' ? 'wholesale' : form.customer_type
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display:'flex',alignItems:'center',gap:12 }}>
            <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => setView('list')}>
              <Ic n="back" /> Customers
            </button>
            <div style={{ width:1,height:24,background:'var(--border)' }}></div>
            <div className="page-title">{selected ? `Edit — ${selected.name}` : `Add ${isWholesale ? 'Wholesale Contact' : 'Cash Contact'}`}</div>
          </div>
          <div className="page-actions">
            <button className="btn btn-ghost" onClick={() => setView('list')}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : selected ? 'Save Changes' : 'Add Customer'}</button>
          </div>
        </div>

        <div className="grid g2" style={{ gap:20 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom:16 }}>Customer Details</div>
            <div className="form-row">
              <FG label="Customer Type" req>
                <select className="form-input" value={formTypeValue} onChange={e => { setF('customer_type', e.target.value); setF('segment', e.target.value==='cash'?'Retail':'Corporate') }}>
                  <option value="cash">Cash Contact (Dar HQ)</option>
                  <option value="wholesale">Wholesale Contact</option>
                </select>
              </FG>
              <FG label="Segment" req>
                <select className="form-input" value={form.segment} onChange={e => setF('segment', e.target.value)}>
                  {SEGMENTS[(formTypeValue as 'cash'|'wholesale')].map(s => <option key={s}>{s}</option>)}
                </select>
              </FG>
            </div>
            {isWholesale ? (
              <>
                <FG label="Company / Organization" req><input className="form-input" placeholder="e.g. Aga Khan Health Services" value={form.company} onChange={e => setF('company', e.target.value)} /></FG>
                <FG label="Contact Person" req><input className="form-input" placeholder="e.g. Dr. Sarah Kimani" value={(form as any).contact_person || ''} onChange={e => setF('contact_person', e.target.value)} /></FG>
              </>
            ) : (
              <FG label="Full Name" req><input className="form-input" placeholder="e.g. Mama Fatuma Hassan" value={form.name} onChange={e => setF('name', e.target.value)} /></FG>
            )}
            <div className="form-row">
              <FG label={`WhatsApp Number${!isWholesale?' (required)':''}`}>
                <input className="form-input" placeholder="+255 7XX XXX XXX" value={form.whatsapp} onChange={e => setF('whatsapp', e.target.value)} />
              </FG>
              <FG label={isWholesale ? 'Office Phone' : 'Email'}>
                {isWholesale
                  ? <input className="form-input" placeholder="+255 22 XXX XXXX" value={(form as any).phone || ''} onChange={e => setF('phone', e.target.value)} />
                  : <input className="form-input" placeholder="email@example.com" value={form.email} onChange={e => setF('email', e.target.value)} />}
              </FG>
            </div>
            {isWholesale && (
              <>
                <FG label="Email">
                  <input className="form-input" placeholder="accounts@example.co.tz" value={form.email} onChange={e => setF('email', e.target.value)} />
                </FG>
                <div className="form-row">
                  <FG label="TIN Number">
                    <input className="form-input" placeholder="123-456-789 (TRA)" style={{ fontFamily:'var(--mono)' }}
                      title="Tanzania Revenue Authority TIN — 9 digits, NNN-NNN-NNN"
                      value={(form as any).tin_number || ''} onChange={e => setF('tin_number', e.target.value)} />
                  </FG>
                  <FG label="Physical Address">
                    <input className="form-input" placeholder="Plot 45, Masaki, Dar es Salaam"
                      title="Used on invoices and statements"
                      value={(form as any).address || ''} onChange={e => setF('address', e.target.value)} />
                  </FG>
                </div>
              </>
            )}
            <FG label="Notes"><textarea className="form-input" rows={2} style={{ resize:'none' }} value={form.notes} onChange={e => setF('notes', e.target.value)} /></FG>
          </div>

          <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
            {isWholesale && (
              <div className="card">
                <div className="card-title" style={{ marginBottom:14 }}>Credit Terms</div>
                <div className="form-row">
                  <FG label="Credit Limit (TZS)">
                    <input type="number" className="form-input" style={{ fontFamily:'var(--mono)' }} value={form.credit_limit} onChange={e => setF('credit_limit', e.target.value)} placeholder="0 = unlimited" />
                  </FG>
                  <FG label="Credit Period (days)">
                    <input type="number" className="form-input" style={{ fontFamily:'var(--mono)' }} value={form.credit_period} onChange={e => setF('credit_period', e.target.value)} />
                  </FG>
                </div>
                <FG label="Payment Terms">
                  <select className="form-input" value={form.payment_terms} onChange={e => setF('payment_terms', e.target.value)}>
                    {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </FG>
                <div style={{ background:'var(--surface2)',borderRadius:8,padding:'10px 12px',fontSize:11,color:'var(--text3)',marginTop:8 }}>
                  Set credit limit to 0 for unlimited credit. Wholesale contacts can prepay, COD, or take credit — credit terms only matter when the contact actually buys on terms.
                </div>
              </div>
            )}

            {!isWholesale && (
              <div className="card" style={{ background:'rgba(37,211,102,.06)',border:'1px solid rgba(37,211,102,.15)' }}>
                <div className="card-title" style={{ marginBottom:8 }}>Cash Contact Note</div>
                <div style={{ fontSize:12,color:'var(--text3)',lineHeight:1.7 }}>
                  This contact is linked to the <strong>Dar HQ Cash Sales (DAR502)</strong> master account.<br/>
                  WhatsApp number is the unique identifier — used for CRM, receipt sending, and loyalty tracking.<br/>
                  No credit terms needed — all transactions are cash at point of sale.
                </div>
              </div>
            )}

            {selected && (
              <div className="card">
                <div className="card-title" style={{ marginBottom:12 }}>Account Info</div>
                {[
                  { label:'Customer Number', val: selected.customer_number },
                  { label:'Balance', val: tzs(selected.balance||0) },
                  { label:'Crown Points', val: (selected.crown_points||0).toLocaleString() },
                  { label:'Last Purchase', val: selected.last_purchase_date||'—' },
                ].map(item => (
                  <div key={item.label} style={{ display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:12 }}>
                    <span style={{ color:'var(--text3)' }}>{item.label}</span>
                    <span style={{ fontFamily:'var(--mono)',fontWeight:600 }}>{item.val}</span>
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

  // ── LIST VIEW ────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Customers</div>
          <div className="page-sub">AR · Cash contacts · Wholesale contacts · <span className="sync-dot"></span> Live</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={load}><Ic n="refresh" /> Refresh</button>
          <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={openAdd}><Ic n="plus" s={13} /> Add {tab==='cash'?'Contact':'Wholesale Contact'}</button>
        </div>
      </div>

      {/* SHORTCUTS */}
      {onNav && (
        <div className="shortcut-bar">
          {[
            { icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', label: 'Cash Sale', page: 'cash-sale' as Page },
            { icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8', label: 'Sales Invoice', page: 'sales-invoice' as Page },
            // Receipt Voucher sits next to Sales Invoice because it's the
            // counterpart: invoice creates AR, receipt settles it. Clerks
            // looking at a customer with an open balance can jump straight
            // here to take payment (single or batch mode).
            { icon: 'M12 5v14M5 12h14', label: 'Receipt Voucher', page: 'cash-receipt' as Page },
            { icon: 'M18 20V10M12 20V4M6 20v-6', label: 'AR Aging', page: 'ar-aging' as Page },
            { icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', label: 'Sales Register', page: 'sales-register' as Page },
            { icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', label: 'CRM Hub', page: 'crm-hub' as Page },
          ].map((s, i) => (
            <button key={i} className="shortcut-btn" onClick={() => onNav(s.page)}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d={s.icon}/></svg>
              {s.label}
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      )}

      {/* Master account banner */}
      <div style={{ background:'linear-gradient(135deg,rgba(133,194,190,.08) 0%,rgba(133,194,190,.04) 100%)',border:'1px solid rgba(133,194,190,.2)',borderRadius:12,padding:'14px 20px',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
        <div>
          <div style={{ fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:4 }}>
            {tab==='cash' ? 'Master AR Account' : 'AR — Wholesale Control Account'}
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <span style={{ fontFamily:'var(--mono)',fontSize:16,fontWeight:800,color:'var(--accent)',background:'var(--accent-dim)',padding:'3px 10px',borderRadius:6 }}>
              {tab==='cash' ? 'DAR502' : '1050-WHL'}
            </span>
            <span style={{ fontFamily:'var(--display)',fontSize:15,fontWeight:700 }}>
              {tab==='cash' ? 'Dar HQ Cash Sales' : 'Accounts Receivable — Wholesale'}
            </span>
          </div>
        </div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20,textAlign:'right' }}>
          {[
            { label:'Total Customers', val: customers.length },
            { label:'Total AR Balance', val: tzs(totalBalance), color: totalBalance>0?'var(--red)':'var(--green)' },
            tab==='wholesale' ? { label:'Total Credit Extended', val: tzs(totalCredit), color:'var(--accent)' } : { label:'With Balance', val: customers.filter(c=>(c.balance||0)>0).length },
          ].map((item,i) => (
            <div key={i}>
              <div style={{ fontSize:9,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',marginBottom:4 }}>{item.label}</div>
              <div style={{ fontFamily:'var(--mono)',fontSize:15,fontWeight:700,color:(item as any).color||'var(--text)' }}>{item.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex',gap:4,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:4,marginBottom:20,width:'fit-content' }}>
        {[{ id:'cash',label:'Cash Contacts (DAR502)' },{ id:'wholesale',label:'Wholesale Contacts' }].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id as any); setSegFilter('all'); setSearch(''); setStageFilter('all'); setShowPausedOnly(false); setShowHidden(false) }}
            style={{ padding:'8px 20px',fontSize:12,fontWeight:600,background:tab===t.id?'var(--accent)':'transparent',color:tab===t.id?'#fff':'var(--text3)',border:'none',cursor:'pointer',borderRadius:'var(--r)',transition:'all .15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex',gap:10,marginBottom:16,alignItems:'center',flexWrap:'wrap' }}>
        <input className="form-input" style={{ width:220,padding:'7px 10px',fontSize:12 }} placeholder={tab==='cash'?'Search name, WA, or CONT…':'Search name, WHL/DEB number…'} value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-input" style={{ fontSize:12,padding:'7px 10px',width:150 }} value={segFilter} onChange={e => setSegFilter(e.target.value)}>
          <option value="all">All Segments</option>
          {SEGMENTS[tab==='cash'?'cash':'wholesale'].map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
        </select>
        {tab==='wholesale' && (
          <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text3)',cursor:'pointer' }}
            title="Hidden contacts are excluded from pickers but still appear in reports and statements">
            <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
            Show hidden
          </label>
        )}
        {tab==='cash' && (
          <>
            <select
              className="form-input"
              style={{ fontSize:12,padding:'7px 10px',width:170 }}
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value as typeof stageFilter)}
              title="Filter by life stage"
            >
              <option value="all">All Life Stages</option>
              <option value="unclassified">⚠️ Unclassified</option>
              <option value="ttc">TTC</option>
              <option value="pregnancy">Pregnancy</option>
              <option value="postpartum">Postpartum</option>
              <option value="parenting">Parenting</option>
            </select>
            {/* Classification queue shortcut */}
            <button
              type="button"
              onClick={() => { setStageFilter('unclassified'); setSearch(''); setSegFilter('all'); setShowPausedOnly(false) }}
              title="Jump to all cash customers without a classified life stage"
              style={{ background:stageFilter==='unclassified'?'var(--accent)':'var(--surface2)',color:stageFilter==='unclassified'?'#fff':'var(--text3)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'7px 12px',fontSize:11,fontWeight:600,cursor:'pointer' }}
            >
              Classification Queue
            </button>
            {/* Paused profiles filter — sensitive exits */}
            <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text3)',cursor:'pointer' }}>
              <input type="checkbox" checked={showPausedOnly} onChange={e => setShowPausedOnly(e.target.checked)} />
              Paused profiles only
            </label>
          </>
        )}
        <div style={{ fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)',marginLeft:'auto' }}>{filtered.length} of {customers.length} shown</div>
      </div>

      {/* Customer table */}
      {loading ? (
        <div className="card" style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>Loading…</div>
      ) : (
        <div className="card">
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center',padding:'40px 0',color:'var(--text3)' }}>
              No {tab==='cash'?'cash contacts':'wholesale contacts'} found. Click + to add one.
            </div>
          ) : (
            <div className="table-wrap">
              {/* Bulk action bar — only renders when at least one customer is selected */}
              {tab === 'cash' && selectedIds.size > 0 && (
                <div style={{
                  background: 'var(--accent)', color: '#000',
                  padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
                  fontSize: 12, fontWeight: 700, marginBottom: 8, borderRadius: 8,
                }}>
                  <span>{selectedIds.size} customer{selectedIds.size === 1 ? '' : 's'} selected</span>
                  <button
                    onClick={() => setBulkActionOpen('log')}
                    style={{
                      background: '#000', color: 'var(--accent)', border: 'none',
                      borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >📋 Log template as sent</button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    style={{
                      background: 'transparent', color: '#000', border: '1px solid #000',
                      borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >Clear selection</button>
                </div>
              )}
              <table>
                <thead>
                  <tr>
                    {tab === 'cash' && (
                      <th style={{ width: 30 }}>
                        <input
                          type="checkbox"
                          checked={sorted.length > 0 && sorted.every(c => c.id && selectedIds.has(c.id))}
                          onChange={() => toggleAllVisible(sorted.map(c => c.id).filter(Boolean) as string[])}
                          onClick={e => e.stopPropagation()}
                          title="Select all visible"
                        />
                      </th>
                    )}
                    <SortableTh label="Number" sortKey="customer_number" onHeaderClick={onHeaderClick} getSortIndex={getSortIndex} getSortDir={getSortDir} />
                    <SortableTh label={tab==='cash'?'Contact Name':'Customer / Company'} sortKey={tab==='cash'?'name':'company'} onHeaderClick={onHeaderClick} getSortIndex={getSortIndex} getSortDir={getSortDir} />
                    {tab==='cash' && <SortableTh label="Life Stage" sortKey="life_stage" onHeaderClick={onHeaderClick} getSortIndex={getSortIndex} getSortDir={getSortDir} />}
                    <SortableTh label="Segment" sortKey="segment" onHeaderClick={onHeaderClick} getSortIndex={getSortIndex} getSortDir={getSortDir} />
                    {tab==='cash'
                      ? <SortableTh label="WhatsApp" sortKey="whatsapp" onHeaderClick={onHeaderClick} getSortIndex={getSortIndex} getSortDir={getSortDir} />
                      : <SortableTh label="Payment Terms" sortKey="payment_terms" onHeaderClick={onHeaderClick} getSortIndex={getSortIndex} getSortDir={getSortDir} />}
                    {tab==='wholesale' && <SortableTh label="Credit Limit" sortKey="credit_limit" align="right" onHeaderClick={onHeaderClick} getSortIndex={getSortIndex} getSortDir={getSortDir} />}
                    <SortableTh label="Balance" sortKey="balance" align="right" onHeaderClick={onHeaderClick} getSortIndex={getSortIndex} getSortDir={getSortDir} />
                    <SortableTh label="Last Purchase" sortKey="last_purchase" onHeaderClick={onHeaderClick} getSortIndex={getSortIndex} getSortDir={getSortDir} />
                    {tab==='cash' && <SortableTh label="Crown Pts" sortKey="crown_points" align="right" onHeaderClick={onHeaderClick} getSortIndex={getSortIndex} getSortDir={getSortDir} />}
                    <th style={{ width:80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c, i) => (
                    <tr key={c.id ?? i} style={{ cursor:'pointer' }}
                      onClick={() => openLedger(c)}
                      onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')}
                      onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                      {tab === 'cash' && (
                        <td onClick={e => e.stopPropagation()} style={{ width: 30 }}>
                          <input
                            type="checkbox"
                            checked={!!c.id && selectedIds.has(c.id)}
                            onChange={() => c.id && toggleSelected(c.id)}
                          />
                        </td>
                      )}
                      <td className="td-mono" style={{ fontSize:11,fontWeight:700,color:'var(--accent)' }}>{c.customer_number||'—'}</td>
                      <td>
                        <div style={{ fontWeight:600,fontSize:13,display:'flex',alignItems:'center',gap:6 }}>
                          {tab==='wholesale' ? (c.company || c.name) : c.name}
                          {tab==='cash' && c.stage_paused && (
                            <span title="Profile paused — sensitive exit" style={{ fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(255,71,87,.12)',color:'var(--red)',fontWeight:700 }}>PAUSED</span>
                          )}
                          {tab==='wholesale' && c.is_hidden && (
                            <span title="Hidden from pickers — still appears in reports" style={{ fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(255,211,42,.12)',color:'var(--yellow,#f59e0b)',fontWeight:700 }}>HIDDEN</span>
                          )}
                        </div>
                        {tab==='wholesale' ? <div style={{ fontSize:10,color:'var(--text3)' }}>{(c as any).contact_person || c.company || '—'}</div> : c.company && <div style={{ fontSize:10,color:'var(--text3)' }}>{c.company}</div>}
                      </td>
                      {tab==='cash' && (
                        <td>
                          <LifeStagePill stage={c.life_stage ?? null} />
                        </td>
                      )}
                      <td><span className="pill pill-gray" style={{ fontSize:9,textTransform:'capitalize' }}>{c.segment}</span></td>
                      {tab==='cash'
                        ? <td className="td-mono" style={{ fontSize:11,color:'#25D366' }}>{c.whatsapp||'—'}</td>
                        : <td style={{ fontSize:11,color:'var(--text3)' }}>{c.payment_terms||'COD'}</td>
                      }
                      {tab==='wholesale' && (
                        <td className="td-right td-mono" style={{ fontSize:11 }}>{c.credit_limit>0?tzs(c.credit_limit):'Unlimited'}</td>
                      )}
                      <td className="td-right td-mono" style={{ fontWeight:700,color:(c.balance||0)>0?'var(--red)':(c.balance||0)<0?'var(--green)':'var(--text3)',fontSize:12 }}>
                        {(c.balance||0)>0 ? tzs(c.balance) : (c.balance||0)<0 ? `${tzs(Math.abs(c.balance))} CR` : '—'}
                      </td>
                      <td style={{ fontSize:11,color:'var(--text3)' }}>{c.last_purchase_date||'—'}</td>
                      {tab==='cash' && <td className="td-right td-mono" style={{ fontSize:11,color:'var(--yellow)' }}>{(c.crown_points||0).toLocaleString()}</td>}
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {tab === 'cash' && c.whatsapp && (
                            <button
                              onClick={() => openWhatsAppForCustomer(c)}
                              title="Send WhatsApp template"
                              style={{
                                background: '#25D36622', border: '1px solid #25D366',
                                borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                                fontSize: 11, color: '#25D366', fontWeight: 700,
                              }}
                            >📱 WA</button>
                          )}
                          <button onClick={() => openEdit(c)} style={{ background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',cursor:'pointer',fontSize:11,color:'var(--text3)',display:'flex',alignItems:'center',gap:4 }}>
                            <Ic n="edit" s={11} /> Edit
                          </button>
                          {/* Hide / Restore — wholesale only, distinct from delete */}
                          {tab === 'wholesale' && (
                            <button onClick={() => toggleHidden(c)}
                              title={c.is_hidden ? 'Restore to pickers' : 'Hide from pickers (keep in reports)'}
                              style={{ background:c.is_hidden?'rgba(255,211,42,.12)':'var(--surface2)', border:`1px solid ${c.is_hidden?'var(--yellow,#f59e0b)':'var(--border)'}`, borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:11, color:c.is_hidden?'var(--yellow,#f59e0b)':'var(--text3)', fontWeight:600 }}>
                              {c.is_hidden ? 'Show' : 'Hide'}
                            </button>
                          )}
                          {/* Delete — wholesale only, only allowed if no history */}
                          {tab === 'wholesale' && (
                            <button onClick={() => deleteCustomer(c)}
                              title="Delete permanently (only allowed if no balance and no ledger history)"
                              style={{ background:'rgba(255,71,87,.08)', border:'1px solid rgba(255,71,87,.3)', borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:11, color:'var(--red)', fontWeight:600 }}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Bulk log-as-sent modal */}
      {bulkActionOpen === 'log' && (
        <div
          onClick={() => !bulkSaving && setBulkActionOpen(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 24, width: 520, maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
              Log template as sent
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>
              Backfill: mark this template as already sent to {selectedIds.size} customer{selectedIds.size === 1 ? '' : 's'} via WhatsApp directly (outside our app). Optionally advance their relationship stage.
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Template</label>
              <select
                value={bulkSelectedTemplateId}
                onChange={e => {
                  setBulkSelectedTemplateId(e.target.value)
                  // Smart default: if template category implies next stage, propose it
                  const t = bulkTemplates.find(x => x.id === e.target.value)
                  if (t) {
                    if (t.category === 'onboarding') setBulkAdvanceStage('onboarding')
                    else if (t.category === 'check_in') setBulkAdvanceStage('check_in')
                    else if (t.category === 'win_back') setBulkAdvanceStage('re_engagement')
                    else if (t.category === 'referral') setBulkAdvanceStage('sokora_ambassador')
                    else setBulkAdvanceStage('')
                  }
                }}
                style={{ width: '100%', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'var(--mono)' }}
              >
                <option value="">— pick a template —</option>
                {bulkTemplates.map(t => (
                  <option key={t.id} value={t.id}>[{t.category}] {t.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Advance relationship stage (optional)</label>
              <select
                value={bulkAdvanceStage}
                onChange={e => setBulkAdvanceStage(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'var(--mono)' }}
              >
                <option value="">— no stage change —</option>
                <option value="inquiry">Inquiry</option>
                <option value="onboarding">Onboarding</option>
                <option value="check_in">Check-in</option>
                <option value="crown">Crown</option>
                <option value="sokora_ambassador">SOKORA Ambassador</option>
                <option value="re_engagement">Re-engagement</option>
              </select>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                Pre-filled based on template category. Will update all {selectedIds.size} selected customer{selectedIds.size === 1 ? '' : 's'}.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setBulkActionOpen(null)}
                disabled={bulkSaving}
                style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer' }}
              >Cancel</button>
              <button
                onClick={submitBulkLog}
                disabled={bulkSaving || !bulkSelectedTemplateId}
                style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: 700,
                  background: 'var(--accent)', border: 'none',
                  borderRadius: 6, color: '#000', cursor: bulkSelectedTemplateId ? 'pointer' : 'not-allowed',
                  opacity: bulkSaving || !bulkSelectedTemplateId ? 0.5 : 1,
                }}
              >{bulkSaving ? 'Logging…' : `Log for ${selectedIds.size} customer${selectedIds.size === 1 ? '' : 's'}`}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}

// ─── Sortable table header ──────────────────────────────────────────────
// Click → sort by this column. Shift-click → add to multi-column sort.
// Shows a small arrow + priority badge (1, 2, 3) when active.
function SortableTh({
  label, sortKey, align, onHeaderClick, getSortIndex, getSortDir,
}: {
  label: string
  sortKey: string
  align?: 'right'
  onHeaderClick: (key: string, e?: { shiftKey?: boolean }) => void
  getSortIndex: (key: string) => number | null
  getSortDir: (key: string) => 'asc' | 'desc' | null
}) {
  const idx = getSortIndex(sortKey)
  const dir = getSortDir(sortKey)
  const active = idx !== null
  const arrow = dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : ''
  return (
    <th
      className={align === 'right' ? 'td-right' : undefined}
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={(e) => onHeaderClick(sortKey, { shiftKey: e.shiftKey })}
      title="Click to sort. Shift+click for multi-column sort."
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--accent)' }}>
            <span style={{ fontSize: 10 }}>{arrow}</span>
            <span style={{ fontSize: 8, fontFamily: 'var(--mono)', background: 'var(--accent-dim)', padding: '0 4px', borderRadius: 3 }}>{idx}</span>
          </span>
        )}
      </span>
    </th>
  )
}

// ─── Life stage pill ────────────────────────────────────────────────────
// Renders the 4-stage parent life_stage as a coloured pill.
// Unclassified shows a muted "Unclassified" warning pill so Brenda can spot it.
function LifeStagePill({ stage }: { stage: LifeStage | null }) {
  if (!stage) {
    return (
      <span style={{
        display: 'inline-block', fontSize: 9, padding: '2px 7px', borderRadius: 4,
        background: 'rgba(107,114,128,.15)', color: 'var(--text3)', fontWeight: 600,
        fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.4,
      }} title="Not yet classified">
        Unclassified
      </span>
    )
  }
  const palette: Record<LifeStage, { bg: string; color: string }> = {
    ttc:        { bg: 'rgba(167,139,250,.18)', color: '#a78bfa' },
    pregnancy:  { bg: 'rgba(245,158,11,.18)',  color: '#f59e0b' },
    postpartum: { bg: 'rgba(236,72,153,.18)',  color: '#ec4899' },
    parenting:  { bg: 'rgba(6,182,212,.18)',   color: '#06b6d4' },
  }
  const p = palette[stage]
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, padding: '2px 7px', borderRadius: 4,
      background: p.bg, color: p.color, fontWeight: 700,
      fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.4,
    }}>
      {LIFE_STAGE_LABELS[stage]}
    </span>
  )
}
