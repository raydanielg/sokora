import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import Toast from '../../components/Toast'
import DraftBanner from '../../components/DraftBanner'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, tzs, getPostedBy } from '../../lib/utils'
import { postLedgerEntry } from '../../lib/itemLedger'
import { useVoucherDraft } from '../../lib/useVoucherDraft'
import type { Page } from '../../lib/types'
import { SokoraInvoice } from '../InvoiceTemplate'
import { loadWAConfig, sendWhatsApp, formatInvoiceMessage } from '../../lib/whatsapp'
import type { WAConfig } from '../../lib/whatsapp'
import { useCategories } from '../../lib/useCategories'
import { useUserLocation } from '../../lib/useUserLocation'
import { useSettings } from '../../lib/settingsLoader'

interface Props {
  onNav: (p: Page) => void
  // When set, the page loads this voucher in read-only view/reprint mode.
  // Used when coming from Sales Day Book or Invoices List.
  editVoucherId?: string
  // Callback to clear the edit ID in App state when the user closes
  // the view modal. Prevents the same invoice from re-opening on next nav.
  onClearEdit?: () => void
}

interface DBCustomer {
  id: string; name: string; company: string; contact_person: string
  whatsapp: string; balance: number; credit_limit: number
  credit_period: number; payment_terms: string; customer_number: string
}

interface DBProduct {
  id: string; sku: string; name: string; category: string
  cost_price: number; selling_price: number; qty_on_hand: number
}

interface InvLine {
  productId: string; name: string; qty: number
  price: number; discount: number; amount: number
  // How to interpret `discount`: 'percent' means 0-100 %, 'absolute' means TZS
  // off per line (before qty). Defaults to 'percent' for backward compat.
  discountMode?: 'percent' | 'absolute'
}

const TERMS = ['COD', 'NET7', 'NET14', 'NET30', 'NET45', 'NET60', 'NET90']

// Derive the payment method from a Cash & Bank account code/name.
// Mirrors the logic in CashReceipt — single source of truth for "what kind
// of money is this?" so the journal narrative and voucher.payment_method
// stay consistent across the system.
// Name-first detection — the account name is the source of truth.
// Code-prefix is only a fallback when the name is generic. See
// CustomerReceiptBatchInner.tsx for the matching helper.
const deriveMethod = (code: string, name: string): string => {
  const n = (name || '').toLowerCase()
  const c = (code || '').trim()

  if (n.includes('mpesa') || n.includes('m-pesa')) return 'mpesa'
  if (n.includes('mixx') || n.includes('tigo'))    return 'mixx'
  if (n.includes('airtel'))                        return 'airtel'
  if (n.includes('halopesa') || n.includes('halo pesa')) return 'mpesa'
  const banks = ['nmb', 'crdb', 'nbc', 'stanbic', 'absa', 'dtb', 'exim', 'access', 'i&m', 'kcb', 'azania', 'amana', 'equity', 'tcb', 'mkombozi', 'tib', 'twiga', 'ecobank', 'bank']
  if (banks.some(b => n.includes(b))) return 'rtgs'
  if (n.includes('cash') || n.includes('till') || n.includes('petty')) return 'cash'

  if (c.startsWith('101') || c === '1040') return 'cash'
  if (c.startsWith('103')) return 'rtgs'
  return 'cash'
}

// Small section-header used above each step in the new SI layout. Provides
// a visual progress cue (numbered circle) + title + optional helper text.
function StepHeader({ num, title, helper }: { num: number; title: string; helper?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: 'var(--accent)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 800, flexShrink: 0,
      }}>{num}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        {helper && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{helper}</div>}
      </div>
    </div>
  )
}

export default function SalesInvoice({ onNav, editVoucherId, onClearEdit }: Props) {
  const userLoc = useUserLocation()
  const { settings } = useSettings()
  const vatEnabled = settings.tax?.vat_enabled ?? false
  const vatRate = settings.tax?.default_vat_rate ?? 18
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [lastInvoice, setLastInvoice] = useState<any>(null)
  const [invoiceSettings, setInvoiceSettings] = useState<any>(null)
  const [waConfig, setWaConfig] = useState<WAConfig | null>(null)
  const [sending, setSending] = useState(false)
  const [waSent, setWaSent] = useState(false)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [filterCat, setFilterCat] = useState('all')
  const { groups, catsByGroup } = useCategories()
  const [custResults, setCustResults] = useState<DBCustomer[]>([])
  const [allCustomers, setAllCustomers] = useState<DBCustomer[]>([])  // full cached list for instant browse
  // Cash/M-Pesa/Bank accounts for the optional "Payment received at issue"
  // block. Loaded once on mount; same source as Cash Receipt's deposit picker.
  const [cashAccounts, setCashAccounts] = useState<{ id: string; code: string; name: string }[]>([])
  const [selectedCust, setSelectedCust] = useState<DBCustomer | null>(null)
  const [showDrop, setShowDrop] = useState(false)
  const [locations, setLocations] = useState<{id:string;code:string;name:string}[]>([])
  const [locationCode, setLocationCode] = useState('1001')
  const [invSettings, setInvSettings] = useState<any>(null)
  // Per-line search query for the inline searchable product picker. Keyed
  // by line index. `null` = picker closed, string = picker open with query.
  const [productSearch, setProductSearch] = useState<Record<number, string | null>>({})
  const [lines, setLines] = useState<InvLine[]>([{ productId: '', name: '', qty: 1, price: 0, discount: 0, amount: 0, discountMode: 'percent' }])
  const [form, setForm] = useState({
    date: today(), dueDate: '', ref: '',
    customer: '', wa: '', paymentTerms: 'NET30', notes: '', salesperson: 'Joe Gembe',
    poRef: '',                // Customer's PO number (B2B)
    deliveryAddress: '',      // If blank, use customer registered address
    // ── Optional advance payment captured at issue time ────────────────
    // For wholesale customers who pay (fully or partially) in cash at the
    // moment of invoicing — they still get a proper Sales Invoice (their
    // ledger and AR aging show it) but we capture the receipt in the same
    // post so the books stay tight. Different from Cash Sale, which is
    // reserved for retail walk-ins (CASH001 etc.).
    paidNow: '',              // TZS string; 0 / empty = no advance payment
    paidDepositAccountId: '', // cash/bank account to debit
    paidTransactionId: '',    // M-Pesa code / cheque no / TT ref (optional)
  })
  const dropRef = useRef<HTMLDivElement>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // ─── Draft persistence ──────────────────────────────────────────────────
  // Snapshot of everything the user typed, so we can restore it after a
  // navigation accident or refresh. Disabled in view mode — we don't want
  // to draft while someone is just reprinting an existing invoice.
  type DraftSnapshot = {
    form: typeof form
    lines: InvLine[]
    selectedCust: DBCustomer | null
    locationCode: string
  }
  const {
    availableDraft, draftAgeMs,
    saveDraft, clearDraft, acknowledgeResume, discardDraft,
  } = useVoucherDraft<DraftSnapshot>('sales-invoice', !!editVoucherId)

  const resumeDraft = () => {
    if (!availableDraft) return
    // Apply each slice back into its respective state
    setForm(availableDraft.form)
    setLines(availableDraft.lines)
    setSelectedCust(availableDraft.selectedCust)
    setLocationCode(availableDraft.locationCode)
    acknowledgeResume()
  }

  useEffect(() => {
    loadProducts(); loadSettings(); loadAllCustomers(); loadCashAccounts()
    supabase.from('stock_locations').select('id,code,name').eq('is_active', true).order('code')
      .then(({ data }) => {
        if (data) {
          setLocations(data)
          // Prefer the user's locked location if available; otherwise first.
          const initial = userLoc.defaultLocationCode && data.find((l: any) => l.code === userLoc.defaultLocationCode)
            ? userLoc.defaultLocationCode
            : (data[0]?.code ?? '')
          if (initial) setLocationCode(initial)
        }
      })
    const close = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false)
    }
    document.addEventListener('mousedown', close)

    // View mode: load existing invoice for reprint. Otherwise: fresh form.
    if (editVoucherId) {
      loadExistingInvoice(editVoucherId)
    } else {
      loadNextRef()
    }

    return () => document.removeEventListener('mousedown', close)
  }, [editVoucherId])

  // Auto-save draft on any meaningful form change. Hook debounces internally
  // so this is cheap — effectively one localStorage write per ~0.5s of typing.
  useEffect(() => {
    if (editVoucherId) return    // view mode: never draft
    // Skip while form is still initializing (no ref yet)
    if (!form.ref) return
    // Skip if the form looks truly empty (only the default single blank line,
    // no customer, no meaningful input). Avoids creating a "draft" for a
    // page the user just opened and never touched.
    const hasAnything =
      !!selectedCust ||
      form.customer.trim().length > 0 ||
      form.notes.trim().length > 0 ||
      lines.some(l => l.productId || l.qty !== 1 || l.price > 0)
    if (!hasAnything) return
    saveDraft({ form, lines, selectedCust, locationCode })
  }, [form, lines, selectedCust, locationCode, editVoucherId, saveDraft])

  // Ctrl+Enter (or Cmd+Enter on Mac) posts the invoice from anywhere on the
  // page. Escape closes the product-search dropdowns if any are open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        // Only fire when we're on this page — if a modal is open (showInvoice),
        // leave that in charge of its own key handling.
        if (showInvoice) return
        e.preventDefault()
        post()
      }
      if (e.key === 'Escape') {
        setProductSearch({})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCust, lines, form, showInvoice])

  // Load a previously posted sales invoice into the preview modal for
  // reprint. Does NOT populate the form — posted invoices are read-only
  // by design (edit them by issuing a Credit Note then a new Invoice).
  const loadExistingInvoice = async (voucherId: string) => {
    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select(`
        *,
        customers (id, name, company, contact_person, whatsapp, address, balance, credit_limit, credit_period, payment_terms, customer_number),
        voucher_lines (id, product_id, qty, unit_price, unit_cost, total, products (id, sku, name, category))
      `)
      .eq('id', voucherId)
      .single()

    if (error || !voucher) {
      console.error('[sales-invoice] view-mode load failed:', error?.message, error?.details)
      showToast(`Failed to load invoice${error?.message ? ': ' + error.message : ''}`, 'error')
      return
    }

    // Pull live figures: the ledger remaining_amount for THIS invoice and
    // the customer's current balance. This lets the template show the
    // account state "as of today" instead of frozen at posting time.
    const { data: ledger } = await supabase
      .from('customer_ledger_entries')
      .select('remaining_amount, is_open')
      .eq('document_ref', voucher.ref)
      .eq('document_type', 'invoice')
      .maybeSingle()

    const enriched = {
      ...voucher,
      _viewMode: true,
      _invoiceRemaining: ledger?.remaining_amount ?? voucher.total_amount,
      _invoicePaid: (voucher.total_amount || 0) - (ledger?.remaining_amount ?? voucher.total_amount),
      _statementDate: new Date().toISOString().split('T')[0],
    }

    setLastInvoice(enriched)
    setShowInvoice(true)
  }

  const loadSettings = () => {
    supabase.from('system_settings').select('value').eq('key', 'invoice_template').single()
      .then(({ data }) => { if (data?.value) try { setInvoiceSettings(JSON.parse(data.value)) } catch {} })
    supabase.from('system_settings').select('value').eq('key', 'inventory_settings').single()
      .then(({ data }) => { if (data?.value) try { setInvSettings(JSON.parse(data.value)) } catch {} })
    loadWAConfig().then(setWaConfig)
  }

  const loadProducts = () => {
    supabase.from('products').select('id, sku, name, category, cost_price, selling_price, qty_on_hand')
      .eq('is_active', true).order('name').then(({ data }) => { if (data) setProducts(data) })
  }

  // Pull the full list of active wholesale contacts once on mount. This
  // lets the user browse without typing, and filter instantly client-side
  // as they type (faster than a round-trip on every keystroke). We
  // accept both the canonical 'wholesale' label and legacy 'debtor' rows,
  // and we exclude soft-hidden contacts (kept in reports but not pickers).
  const loadAllCustomers = () => {
    supabase.from('customers')
      .select('*')
      .in('customer_type', ['wholesale', 'debtor'])
      .eq('is_active', true)
      .eq('is_hidden', false)
      .order('name')
      .then(({ data }) => { if (data) setAllCustomers(data) })
  }

  // Pull active Cash & Bank accounts for the optional "Payment received at
  // issue" picker. Filtered to category='Cash & Bank' so we don't show
  // revenue/expense accounts in the deposit dropdown.
  const loadCashAccounts = () => {
    supabase.from('accounts')
      .select('id, code, name, category')
      .eq('is_active', true)
      .eq('category', 'Cash & Bank')
      .order('code')
      .then(({ data }) => { if (data) setCashAccounts(data) })
  }

  const loadNextRef = async () => {
    const ref = await nextRef('sales_invoice')
    setForm(f => ({ ...f, ref }))
  }

  // Filter the cached customer list by the search string. Matches against
  // company, name, contact person, or customer number (case-insensitive).
  // An empty query returns the full list, so focusing the input immediately
  // shows everyone.
  const searchCustomer = (val: string) => {
    set('customer', val)
    setSelectedCust(null)
    const q = val.trim().toLowerCase()
    if (!q) {
      // Empty query: show everyone. Show up to 50 rows; user can scroll the
      // dropdown. If they have more than 50 debtors, typing narrows it down.
      setCustResults(allCustomers.slice(0, 50))
      setShowDrop(allCustomers.length > 0)
      return
    }
    const filtered = allCustomers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.contact_person || '').toLowerCase().includes(q) ||
      (c.customer_number || '').toLowerCase().includes(q)
    ).slice(0, 50)
    setCustResults(filtered)
    setShowDrop(true)  // always open dropdown while searching, even if no matches (to show "no results" panel)
  }

  const selectCust = (c: DBCustomer) => {
    setSelectedCust(c)
    set('customer', c.company || c.name)
    set('wa', c.whatsapp || '')
    if (c.payment_terms) set('paymentTerms', c.payment_terms)
    if (c.credit_period > 0) {
      const due = new Date(); due.setDate(due.getDate() + c.credit_period)
      set('dueDate', due.toISOString().split('T')[0])
    }
    setShowDrop(false); setCustResults([])
  }

  const updateLine = (i: number, field: keyof InvLine, val: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val } as InvLine
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) { nl[i].name = p.name; nl[i].price = p.selling_price }
    }
    const price = field === 'price' ? Number(val) : nl[i].price
    const qty = field === 'qty' ? Number(val) : nl[i].qty
    const disc = field === 'discount' ? Number(val) : nl[i].discount
    const mode = field === 'discountMode' ? (val as 'percent' | 'absolute') : (nl[i].discountMode || 'percent')
    // Discount: percent = % off unit price, absolute = TZS off per unit
    const lineGross = price * qty
    const lineDiscount = mode === 'percent'
      ? lineGross * (disc / 100)
      : disc * qty
    nl[i].amount = Math.max(0, Math.round(lineGross - lineDiscount))
    setLines(nl)
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  // VAT only applies when org is VAT-registered. When disabled, the line price
  // IS the revenue (no VAT split). Toggle lives in Settings → Tax.
  const vat = vatEnabled ? Math.round(subtotal * vatRate / (100 + vatRate)) : 0
  const netRevenue = subtotal - vat
  const cogsTotal = lines.reduce((s, l) => {
    const p = products.find(p => p.id === l.productId)
    return s + (p ? p.cost_price * l.qty : 0)
  }, 0)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!selectedCust) { showToast('Select a customer from the database first', 'error'); return }
    if (lines.every(l => !l.productId)) { showToast('Add at least one product', 'error'); return }
    if (subtotal <= 0) { showToast('Invoice total must be greater than zero', 'error'); return }

    // Optional advance payment validation. If the user typed an amount in
    // the "Payment received at issue" block we need a deposit account and
    // the amount can't exceed the invoice total — any overpayment should
    // be entered later via a normal Cash Receipt so it becomes credit on
    // the customer's account, separate from this invoice.
    const paidNow = parseFloat(form.paidNow) || 0
    if (paidNow < 0) { showToast('Advance payment cannot be negative', 'error'); return }
    if (paidNow > 0 && !form.paidDepositAccountId) {
      showToast('Select where the cash was deposited (cash / M-Pesa / bank account)', 'error'); return
    }
    if (paidNow > subtotal + 0.5) {
      showToast(`Advance payment (${paidNow.toLocaleString()}) is more than the invoice total. Post the invoice first, then receive the extra via Cash Receipt.`, 'error'); return
    }

    // Defence in depth: even if the UI is bypassed, a locked user cannot
    // post an invoice that deducts from someone else's location.
    if (!userLoc.canPostFrom(locationCode)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}. You cannot invoice from ${locationCode}.`, 'error')
      return
    }

    // Wrong-location safety check (unlocked users). If the user has a
    // default location and is posting from a different one, force an
    // explicit confirm. The picker shows all locations side-by-side and
    // it's easy to leave the wrong one selected.
    if (
      !userLoc.isLocked &&
      userLoc.defaultLocationCode &&
      locationCode !== userLoc.defaultLocationCode &&
      locations.length > 1
    ) {
      const chosen = locations.find(l => l.code === locationCode)
      const myDefault = locations.find(l => l.code === userLoc.defaultLocationCode)
      const ok = window.confirm(
        `You are about to invoice from ${chosen?.code || locationCode} (${chosen?.name || '?'}).\n\n` +
        `Your assigned location is ${myDefault?.code || userLoc.defaultLocationCode} (${myDefault?.name || '?'}).\n\n` +
        `Continue posting from ${chosen?.code || locationCode}?`
      )
      if (!ok) return
    }
    // Stock check — UNCONDITIONAL. Previously this was gated on
    // invSettings?.block_negative_stock, which meant invoices could post
    // for items we didn't have (and during the brief async window before
    // invSettings loads, the check was always skipped). A sales invoice
    // posting unbacked stock corrupts the COGS journal line (cost basis
    // becomes wrong) and creates negative product_locations rows that
    // poison downstream stock valuation. Always block.
    //
    // We check against BOTH the selected location's qty AND the global qty.
    // The location check is the operationally correct one (we can't pick
    // stock that isn't physically in that bin), and the global check is a
    // safety net for products that haven't been allocated to locations yet.
    const selectedLocForCheck = locations.find(l => l.code === locationCode)
    if (selectedLocForCheck) {
      const productIds = lines.filter(l => l.productId).map(l => l.productId)
      const { data: locStocks } = await supabase
        .from('product_locations')
        .select('product_id, qty_on_hand')
        .eq('location_id', selectedLocForCheck.id)
        .in('product_id', productIds)
      const locStockMap = new Map((locStocks || []).map(r => [r.product_id, r.qty_on_hand || 0]))

      for (const line of lines) {
        if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId)
        if (!prod) continue
        const locQty = locStockMap.get(line.productId) ?? 0
        if (locQty < line.qty) {
          showToast(
            `Insufficient stock at ${selectedLocForCheck.code} (${selectedLocForCheck.name}): ${prod.name} · Available: ${locQty} · Needed: ${line.qty}. Transfer stock first or change location.`,
            'error'
          )
          return
        }
        // Global safety net — should never trip if location check passed,
        // but catches the rare case where the master qty_on_hand has drifted.
        if (prod.qty_on_hand < line.qty) {
          showToast(`Insufficient global stock: ${prod.name} · Available: ${prod.qty_on_hand} · Needed: ${line.qty}`, 'error')
          return
        }
      }
    } else {
      // No location selected at all — fall back to the global check so we
      // still never post unbacked stock.
      for (const line of lines) {
        if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId)
        if (prod && prod.qty_on_hand < line.qty) {
          showToast(`Insufficient stock: ${prod.name} · Available: ${prod.qty_on_hand}`, 'error'); return
        }
      }
    }
    setPosting(true)
    try {
      const customerId = selectedCust.id
      const { data: acctData } = await supabase.from('accounts').select('id, code')
        .in('code', ['4011', '5010', '1110', '2020', '1050'])
      const acct = (code: string) => acctData?.find(a => a.code === code)?.id
      const revenueId = acct('4011'); const cogsId = acct('5010')
      const inventoryId = acct('1110'); const vatId = acct('2020'); const arId = acct('1050')
      if (!revenueId || !cogsId || !inventoryId || !arId) throw new Error('Required GL accounts not found')

      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Sales Invoice — ${selectedCust.company || selectedCust.name} — ${form.ref}`,
        journal_type: 'sales_invoice', source_type: 'sales_invoice', source_ref: form.ref,
        posted_by: getPostedBy(), status: 'posted',
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw

      const jLines: any[] = [
        { journal_id: journal.id, line_number: 1, account_id: arId, description: `AR — ${selectedCust.company || selectedCust.name} — ${form.ref}`, debit: subtotal, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: revenueId, description: `Revenue — ${form.ref}`, debit: 0, credit: netRevenue },
      ]
      if (vat > 0 && vatId) {
        jLines.push({ journal_id: journal.id, line_number: jLines.length + 1, account_id: vatId, description: `VAT — ${form.ref}`, debit: 0, credit: vat })
      }
      jLines.push({ journal_id: journal.id, line_number: jLines.length + 1, account_id: cogsId, description: `COGS — ${form.ref}`, debit: cogsTotal, credit: 0 })
      jLines.push({ journal_id: journal.id, line_number: jLines.length + 1, account_id: inventoryId, description: `Inventory out — ${form.ref}`, debit: 0, credit: cogsTotal })
      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error(jlErr.message)
      await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

      const voucherPayload: Record<string, unknown> = {
        ref: form.ref, type: 'sales_invoice', posting_date: form.date,
        description: `Sales Invoice — ${selectedCust.company || selectedCust.name}`,
        subtotal: netRevenue, vat_amount: vat, total_amount: subtotal,
        status: 'posted', customer_id: customerId, journal_id: journal.id,
        notes: form.notes || null, posted_by: getPostedBy(),
      }
      if (form.dueDate) voucherPayload.due_date = form.dueDate
      if (form.paymentTerms) voucherPayload.payment_terms = form.paymentTerms
      // New fields — requires migration add_sales_invoice_fields.sql to have run.
      // If the columns don't exist yet, Supabase will return an error; the
      // try/catch path already surfaces that to the user.
      if (form.poRef.trim()) voucherPayload.po_reference = form.poRef.trim()
      if (form.deliveryAddress.trim()) voucherPayload.delivery_address = form.deliveryAddress.trim()

      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert(voucherPayload).select('id').single()
      if (vErr) throw new Error(vErr.message)

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]; if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId); if (!prod) continue
        // When discountMode === 'absolute', convert to equivalent % for
        // backward-compat with discount_pct column, so reporting continues
        // to show a meaningful discount figure.
        const discPctEquiv = (line.discountMode === 'absolute' && line.price > 0)
          ? Math.round((line.discount / line.price) * 100 * 100) / 100
          : line.discount
        await supabase.from('voucher_lines').insert({
          voucher_id: voucher.id, line_number: i + 1, product_id: line.productId,
          description: line.name, qty: line.qty, unit_cost: prod.cost_price,
          unit_price: line.price, subtotal: line.amount, discount_pct: discPctEquiv,
          vat_amount: vat > 0 ? Math.round(line.amount * vatRate / (100 + vatRate)) : 0, total: line.amount,
        })
        await supabase.rpc('deduct_stock_allow_negative', { p_product_id: prod.id, p_qty: line.qty })
        const selectedLoc = locations.find(l => l.code === locationCode)
        await postLedgerEntry({
          product_id: line.productId, entry_type: 'sale',
          document_type: 'sales_invoice', document_ref: form.ref,
          posting_date: form.date, qty: -line.qty, cost_amount: prod.cost_price * line.qty,
          location: selectedLoc || null,
        })
        // Decrement THIS LOCATION's qty so per-location stock stays accurate.
        // The product_locations trigger then recomputes products.qty_on_hand
        // as SUM(all locations), keeping global in sync. Without this, every
        // sales invoice silently caused drift (global went down, no location
        // bumped down to match).
        if (selectedLoc) {
          const { data: existingLoc } = await supabase.from('product_locations')
            .select('qty_on_hand').eq('product_id', line.productId).eq('location_id', selectedLoc.id).maybeSingle()
          const newLocQty = Math.max(0, (existingLoc?.qty_on_hand ?? 0) - line.qty)
          await supabase.from('product_locations').upsert(
            { product_id: line.productId, location_id: selectedLoc.id, location_code: selectedLoc.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' }
          )
        }
      }

      // Update customer balance and ledger. When the customer paid in
      // advance, the *net* balance change is subtotal − paidNow (invoice
      // adds receivable, receipt reduces it). Both ledger rows are still
      // posted individually for an audit trail.
      //
      // Additive update is safe here because netBalanceChange exactly
      // matches the ledger rows we write below (one invoice row + one
      // optional receipt row, summing to subtotal - paidNow). The receipt
      // path was rewritten in CustomerPaymentFlow.postCustomerReceiptLedger
      // to re-derive from ledger after writing, because that path had a
      // drift bug where Math.max(0, ...) clamped overpayments and silently
      // de-synced. Don't replicate that bug here.
      const netBalanceChange = subtotal - paidNow
      await supabase.from('customers').update({
        balance: (selectedCust.balance || 0) + netBalanceChange,
        last_purchase_date: form.date, last_purchase_amount: subtotal,
      }).eq('id', customerId)

      // Customer ledger entry — must be awaited. Previously this was fire-and-forget
      // (.then(...) without await), meaning if the insert silently failed, the
      // voucher would post but the AR ledger would have no record of the receivable.
      // The customer balance trigger relies on this row existing.
      //
      // remaining_amount and is_open reflect the advance payment: if the
      // wholesaler paid in full at issue, this invoice closes immediately;
      // partial payments leave it open with a reduced remaining_amount.
      const invoiceRemaining = Math.max(0, subtotal - paidNow)
      const invoiceStillOpen = invoiceRemaining > 0.5
      const { error: ledgerErr } = await supabase.from('customer_ledger_entries').insert({
        customer_id: customerId, posting_date: form.date,
        document_type: 'invoice', document_ref: form.ref,
        description: `Sales Invoice — ${selectedCust.company || selectedCust.name}`,
        amount: subtotal, remaining_amount: invoiceRemaining,
        due_date: form.dueDate || null, is_open: invoiceStillOpen, journal_id: journal.id,
      })
      if (ledgerErr) {
        console.error('Customer ledger insert failed:', ledgerErr.message)
        showToast(`Voucher posted but AR ledger entry failed: ${ledgerErr.message}`, 'error')
      }

      // ── Advance payment: post a sibling Cash Receipt ──────────────────
      // When the wholesaler paid cash at issue time, we record a normal
      // Cash Receipt against the same customer, so it shows on their
      // statement as "Payment received against INV-…" and the AR aging
      // report reflects the reduced outstanding amount immediately.
      // This keeps the books clean: invoice and receipt are two separate
      // vouchers and two separate journals (audit-friendly), tied
      // together by the customer ledger entries' remaining_amount.
      if (paidNow > 0 && form.paidDepositAccountId) {
        try {
          const depositAcc = cashAccounts.find(a => a.id === form.paidDepositAccountId)
          const payMethod = depositAcc ? deriveMethod(depositAcc.code, depositAcc.name) : 'cash'
          const receiptRef = await nextRef('cash_receipt')
          const custName = selectedCust.company || selectedCust.name

          const { data: receiptJournalRaw, error: rjErr } = await insertJournalWithRetry({
            ref: 'JV-' + receiptRef, posting_date: form.date,
            description: `Customer Receipt (advance on ${form.ref}) — ${custName} — ${receiptRef}`,
            journal_type: 'cash_receipt', source_type: 'cash_receipt',
            source_ref: receiptRef, posted_by: getPostedBy(), status: 'posted',
          })
          if (rjErr || !receiptJournalRaw) throw new Error(rjErr?.message || 'Receipt journal insert failed')

          const { error: rlErr } = await supabase.from('journal_lines').insert([
            {
              journal_id: receiptJournalRaw.id, line_number: 1,
              account_id: form.paidDepositAccountId,
              description: `Received from ${custName} — advance on ${form.ref}`,
              debit: paidNow, credit: 0,
            },
            {
              journal_id: receiptJournalRaw.id, line_number: 2,
              account_id: arId,
              description: `AR payment — ${custName} — ${form.ref}`,
              debit: 0, credit: paidNow,
            },
          ])
          if (rlErr) throw new Error('Receipt journal lines: ' + rlErr.message)

          await Promise.all([
            supabase.rpc('update_account_balance', { p_account_id: form.paidDepositAccountId, p_debit: paidNow, p_credit: 0 }),
            supabase.rpc('update_account_balance', { p_account_id: arId, p_debit: 0, p_credit: paidNow }),
          ])

          // Receipt voucher row — links the receipt to the customer and
          // exposes it in the Payment Register page.
          await supabase.from('vouchers').insert({
            ref: receiptRef, type: 'cash_receipt', posting_date: form.date,
            description: `Customer Receipt (advance on ${form.ref}) — ${custName}`,
            total_amount: paidNow, status: 'posted', journal_id: receiptJournalRaw.id,
            payment_method: payMethod,
            notes: form.paidTransactionId
              ? `Advance payment for ${form.ref} · ${payMethod.toUpperCase()} ref: ${form.paidTransactionId}`
              : `Advance payment for ${form.ref}`,
            posted_by: getPostedBy(), customer_id: customerId,
          })

          // Receipt ledger entry — negative amount on the customer's AR
          // ledger, marks the receipt itself as closed. Settling specific
          // invoices (i.e. matching this receipt to the invoice ledger
          // entry above so it reduces remaining_amount further) is already
          // handled at insert time via the invoiceRemaining math; the
          // receipt row exists for audit and customer statement display.
          await supabase.from('customer_ledger_entries').insert({
            customer_id: customerId, posting_date: form.date,
            document_type: 'receipt', document_ref: receiptRef,
            description: `Payment received against ${form.ref}`,
            amount: -paidNow, remaining_amount: 0,
            is_open: false, journal_id: receiptJournalRaw.id,
          })
        } catch (advErr: any) {
          // Invoice already posted at this point — surface the receipt
          // failure so the user knows to retry the receipt manually rather
          // than thinking the whole thing failed.
          console.error('Advance receipt failed after invoice posted:', advErr.message)
          showToast(`Invoice ${form.ref} posted, but advance receipt failed: ${advErr.message}. Please post the receipt manually via Cash Receipt.`, 'error')
        }
      }

      // Post-update balance: what the customer now owes after this invoice
      // (and after the optional advance receipt, if any). InvoiceTemplate in
      // view mode reads this as the live current balance and derives prior
      // debt from it. Reusing the same value the DB update wrote keeps the
      // first print and the sidebar reprint perfectly in sync.
      const newCustomerBalance = (selectedCust.balance || 0) + netBalanceChange
      const thisInvoiceRemaining = Math.max(0, subtotal - paidNow)

      const invoiceData = {
        ref: form.ref, posting_date: form.date, due_date: form.dueDate,
        payment_terms: form.paymentTerms, notes: form.notes,
        total_amount: subtotal, vat_amount: vat, subtotal: netRevenue,
        posted_by: form.salesperson,
        customers: {
          name: selectedCust.name, company: selectedCust.company || '',
          contact_person: selectedCust.contact_person || '',
          whatsapp: selectedCust.whatsapp || '', address: '',
          balance: newCustomerBalance,
        },
        voucher_lines: lines.filter(l => l.productId).map(l => ({
          qty: l.qty, unit_price: l.price, total: l.amount,
          discount_pct: l.discount, description: l.name,
          products: { name: l.name, sku: products.find(p => p.id === l.productId)?.sku || '' }
        })),
        // Always enter view mode for the post-save preview. Previously this
        // was conditional on paidNow > 0, which meant pure credit invoices
        // fell into the template's "posting mode" branch — that branch adds
        // total_amount on top of cust.balance to compute totalNowOwed, and
        // since cust.balance was already the post-update figure, the
        // outstanding shown on screen was doubled. View mode (matching the
        // reprint path) reads cust.balance as the live current AR and
        // derives this invoice's status from _invoiceRemaining.
        _viewMode: true,
        _invoicePaid: paidNow,
        _invoiceRemaining: thisInvoiceRemaining,
        _statementDate: form.date,
      }
      setLastInvoice(invoiceData)
      setShowInvoice(true)
      // Status-aware toast: tells the user at a glance whether the invoice
      // was fully settled, partially paid, or left fully open.
      const paidLabel = paidNow >= subtotal - 0.5
        ? ' · PAID IN FULL'
        : paidNow > 0
          ? ` · Paid TZS ${paidNow.toLocaleString()} (balance ${(subtotal - paidNow).toLocaleString()})`
          : ''
      showToast(`${form.ref} posted · TZS ${subtotal.toLocaleString()}${paidLabel}`)
      clearDraft()  // posted successfully — no draft to recover
    } catch (err: any) {
      showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  const creditUsedPct = selectedCust && selectedCust.credit_limit > 0
    ? Math.min(100, Math.round(((selectedCust.balance || 0) / selectedCust.credit_limit) * 100)) : 0
  const availableCredit = selectedCust && selectedCust.credit_limit > 0
    ? Math.max(0, selectedCust.credit_limit - (selectedCust.balance || 0)) : null

  return (
    <>
    <VoucherPage title="Sales Invoice" icon="" subtitle="Credit sale — creates open AR · Stock deducted · Customer ledger updated"
      color="rgba(0,229,160,.12)" onPost={post}
      postLabel={posting ? 'Posting…' : 'Post Invoice'}
      postDisabled={!selectedCust || posting}
      postDisabledReason={!selectedCust ? 'Select a registered customer before posting. Walk-in or typed names are not accepted on wholesale invoices.' : undefined}
      journalNote={vatEnabled
        ? 'Dr AR (1050) · Cr Revenue (4011) · Cr VAT (2020) · Dr COGS (5010) · Cr Inventory (1110)'
        : 'Dr AR (1050) · Cr Revenue (4011) · Dr COGS (5010) · Cr Inventory (1110)'}>

      {/* Draft resume banner — only shows if we found a saved draft on mount */}
      {availableDraft && draftAgeMs !== null && (
        <DraftBanner
          draftAgeMs={draftAgeMs}
          onResume={resumeDraft}
          onDiscard={discardDraft}
        />
      )}

      {/* ── CUSTOMER SELECTION (full width hero) ─────────────────────────── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="card-title">Bill To</div>
          {selectedCust && (
            <button onClick={() => { setSelectedCust(null); set('customer', ''); set('wa', '') }}
              style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Change customer
            </button>
          )}
        </div>

        {!selectedCust ? (
          /* Customer search */
          <div ref={dropRef} style={{ position: 'relative' }}>
            {/* Requirement notice — explains why free-text won't work */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              padding: '8px 12px', background: 'var(--accent-dim)',
              border: '1px solid var(--accent)', borderRadius: 8,
              fontSize: 12, color: 'var(--text2)',
            }}>
              <svg width="14" height="14" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>Sales invoices require a <strong>registered customer</strong>. Walk-ins and typed names are not accepted — use Cash Sale for walk-ins.</span>
            </div>

            <div style={{ position: 'relative' }}>
              {/* Clickable person icon — opens the full debtor list on click.
                  Keeps focus from auto-opening so clicking near the input or
                  tabbing in doesn't trigger an unwanted dropdown. */}
              <button
                type="button"
                onClick={() => {
                  if (showDrop) {
                    // Already open — treat click as a close toggle
                    setShowDrop(false)
                  } else {
                    searchCustomer(form.customer)  // shows all or current filter
                  }
                }}
                title={showDrop ? 'Close list' : 'Browse all wholesale contacts'}
                style={{
                  position: 'absolute', left: 6, top: '50%',
                  transform: 'translateY(-50%)',
                  background: showDrop ? 'var(--accent-dim)' : 'transparent',
                  border: 'none', borderRadius: 6,
                  width: 32, height: 32,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', zIndex: 2,
                  color: showDrop ? 'var(--accent)' : 'var(--text3)',
                  transition: 'background .15s, color .15s',
                }}
                onMouseEnter={e => { if (!showDrop) (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
                onMouseLeave={e => { if (!showDrop) (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </button>
              <input className="form-input" style={{ paddingLeft: 44, fontSize: 14, height: 48 }}
                placeholder="Click the person icon to browse, or type to filter by name / company / WHL/DEB number…"
                value={form.customer}
                onChange={e => searchCustomer(e.target.value)}
              />
            </div>
            {showDrop && custResults.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: 'var(--surface)', border: '1px solid var(--accent)',
                borderRadius: 10, zIndex: 50, boxShadow: '0 12px 40px rgba(0,0,0,.4)',
                overflow: 'hidden', maxHeight: 420, overflowY: 'auto'
              }}>
                {/* Dropdown header — tells the user what they're seeing */}
                <div style={{
                  padding: '8px 16px', background: 'var(--surface2)',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)',
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  position: 'sticky', top: 0, zIndex: 1,
                }}>
                  <span>
                    {form.customer.trim().length > 0
                      ? `${custResults.length} match${custResults.length === 1 ? '' : 'es'}`
                      : `All wholesale contacts${allCustomers.length > 50 ? ` (showing 50 of ${allCustomers.length})` : ` (${allCustomers.length})`}`}
                  </span>
                  <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text3)' }}>
                    {form.customer.trim().length === 0 && allCustomers.length > 50 && 'Type to filter…'}
                  </span>
                </div>
                {custResults.map((c, i) => (
                  <div key={i} onClick={() => selectCust(c)}
                    style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.company || c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {c.contact_person && `Attn: ${c.contact_person} · `}{c.customer_number} · {c.payment_terms || 'COD'}
                        {c.whatsapp && ` · ${c.whatsapp}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                      {(c.balance || 0) > 0 && (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
                          AR: {(c.balance || 0).toLocaleString()}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
                        {c.credit_limit > 0 ? `Limit: ${c.credit_limit.toLocaleString()}` : 'Unlimited credit'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* No-results hint — only show if the user has actually typed something */}
            {showDrop && custResults.length === 0 && form.customer.trim().length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, zIndex: 50, boxShadow: '0 12px 40px rgba(0,0,0,.4)',
                padding: '16px 18px',
              }}>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
                  No customer matches <strong>"{form.customer}"</strong>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                  This customer is not registered in your wholesale contacts. You must register them first before posting an invoice.
                </div>
                <button
                  onClick={() => onNav('customers')}
                  className="btn btn-primary btn-sm"
                  style={{ background: 'var(--accent)' }}
                >
                  + Register New Customer
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Selected customer card */
          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>
                  {selectedCust.company || selectedCust.name}
                </div>
                {selectedCust.contact_person && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Attn: {selectedCust.contact_person}</div>
                )}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 4 }}>
                    {selectedCust.customer_number}
                  </span>
                  {selectedCust.whatsapp && (
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{selectedCust.whatsapp}</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{selectedCust.payment_terms || 'COD'}</span>
                </div>
              </div>

              {/* Credit info panel */}
              <div style={{ textAlign: 'right', minWidth: 200 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginBottom: 8 }}>
                  {[
                    { label: 'Outstanding AR', val: tzs(selectedCust.balance || 0), color: (selectedCust.balance||0) > 0 ? 'var(--red)' : 'var(--green)' },
                    { label: 'Credit Limit', val: selectedCust.credit_limit > 0 ? tzs(selectedCust.credit_limit) : 'Unlimited' },
                    { label: 'Credit Period', val: selectedCust.credit_period > 0 ? `${selectedCust.credit_period} days` : 'COD' },
                    { label: 'Available', val: availableCredit !== null ? tzs(availableCredit) : 'Unlimited', color: 'var(--green)' },
                  ].map(item => (
                    <div key={item.label} style={{ padding: '4px 0' }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: item.color || 'var(--text)' }}>{item.val}</div>
                    </div>
                  ))}
                </div>
                {selectedCust.credit_limit > 0 && (
                  <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${creditUsedPct}%`, background: creditUsedPct > 80 ? 'var(--red)' : creditUsedPct > 60 ? 'var(--yellow)' : 'var(--green)', borderRadius: 2, transition: 'width .3s' }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ STEP 1: INVOICE LINES ══════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 14 }}>
        <StepHeader num={1} title="Add Products" helper={
          lines.filter(l => l.productId).length === 0
            ? 'Search a product below, click to add. You can add as many as you need.'
            : `${lines.filter(l => l.productId).length} product${lines.filter(l => l.productId).length === 1 ? '' : 's'} in this invoice`
        } />

        {/* Category filter pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          <button onClick={() => setFilterCat('all')} style={{
            fontSize: 10, padding: '4px 10px', borderRadius: 12,
            border: `1px solid ${filterCat === 'all' ? 'var(--accent)' : 'var(--border)'}`,
            background: filterCat === 'all' ? 'var(--accent)' : 'transparent',
            color: filterCat === 'all' ? '#fff' : 'var(--text3)',
            cursor: 'pointer', fontWeight: 600,
          }}>All</button>
          {groups.map((g: string) => (
            <button key={g} onClick={() => setFilterCat(`group:${g}`)} style={{
              fontSize: 10, padding: '4px 10px', borderRadius: 12,
              border: `1px solid ${filterCat === `group:${g}` ? 'var(--accent)' : 'var(--border)'}`,
              background: filterCat === `group:${g}` ? 'var(--accent-dim)' : 'transparent',
              color: filterCat === `group:${g}` ? 'var(--accent)' : 'var(--text3)',
              cursor: 'pointer', fontWeight: 600,
            }}>{g}</button>
          ))}
        </div>

        {/* Line item rows */}
        <div>
          {lines.map((line, i) => {
            const visibleProducts = filterCat === 'all' ? products
              : filterCat.startsWith('group:') ? products.filter(p => {
                  const grp = filterCat.slice(6)
                  return (catsByGroup[grp] || []).some((c: {name:string}) => c.name === p.category)
                })
              : products.filter(p => p.category === filterCat)
            const selectedProd = products.find(p => p.id === line.productId)
            const search = productSearch[i] ?? null
            const searchMatches = search !== null && search.length > 0
              ? visibleProducts.filter(p =>
                  p.name.toLowerCase().includes(search.toLowerCase()) ||
                  p.sku.toLowerCase().includes(search.toLowerCase())
                ).slice(0, 8)
              : []
            const lowStock = selectedProd && selectedProd.qty_on_hand < line.qty
            const discountMode = line.discountMode || 'percent'
            return (
              <div key={i} style={{
                background: 'var(--surface2)', border: `1px solid ${lowStock ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 10, padding: 12, marginBottom: 8,
                position: 'relative',
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {/* Line number */}
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: line.productId ? 'var(--accent)' : 'var(--surface3)',
                    color: line.productId ? '#fff' : 'var(--text3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 4,
                  }}>{i + 1}</div>

                  {/* Product picker / selected display */}
                  <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                    {!selectedProd ? (
                      <>
                        <input
                          className="form-input"
                          placeholder="Type to search product by name or SKU…"
                          value={search ?? ''}
                          onChange={e => setProductSearch(s => ({ ...s, [i]: e.target.value }))}
                          onFocus={() => setProductSearch(s => ({ ...s, [i]: s[i] ?? '' }))}
                          style={{ fontSize: 13 }}
                        />
                        {searchMatches.length > 0 && (
                          <div style={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                            background: 'var(--surface)', border: '1px solid var(--accent)',
                            borderRadius: 8, zIndex: 40, maxHeight: 260, overflowY: 'auto',
                            boxShadow: '0 10px 30px rgba(0,0,0,.35)',
                          }}>
                            {searchMatches.map(p => (
                              <div key={p.id}
                                onClick={() => {
                                  updateLine(i, 'productId', p.id)
                                  setProductSearch(s => ({ ...s, [i]: null }))
                                }}
                                onMouseDown={e => e.preventDefault()}
                                style={{
                                  padding: '8px 12px', cursor: 'pointer',
                                  borderBottom: '1px solid var(--border)',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                                    {p.sku} · Stock: <span style={{ color: p.qty_on_hand > 0 ? 'var(--green)' : 'var(--red)' }}>{p.qty_on_hand}</span>
                                  </div>
                                </div>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginLeft: 12 }}>
                                  {tzs(p.selling_price)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {search !== null && search.length > 0 && searchMatches.length === 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, fontStyle: 'italic' }}>
                            No products match "{search}"
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{selectedProd.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2, display: 'flex', gap: 10 }}>
                            <span>{selectedProd.sku}</span>
                            <span style={{ color: lowStock ? 'var(--red)' : 'var(--text3)' }}>
                              Stock: {selectedProd.qty_on_hand} {lowStock && '⚠'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const nl = [...lines]
                            nl[i] = { productId: '', name: '', qty: 1, price: 0, discount: 0, amount: 0, discountMode: 'percent' }
                            setLines(nl)
                            setProductSearch(s => ({ ...s, [i]: '' }))
                          }}
                          style={{ fontSize: 10, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                          Change
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Line delete */}
                  {lines.length > 1 && (
                    <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1, marginTop: 2, flexShrink: 0 }}>×</button>
                  )}
                </div>

                {/* Qty / price / discount row — only when a product is picked */}
                {selectedProd && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto auto', gap: 10, marginTop: 10, alignItems: 'end' }}>
                    <div>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>Qty</div>
                      <input type="number" className="form-input" min={1}
                        value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)}
                        style={{ width: 72, textAlign: 'center', fontSize: 14, fontWeight: 700 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>Unit Price</div>
                      <input type="number" className="form-input"
                        value={line.price} onChange={e => updateLine(i, 'price', parseFloat(e.target.value) || 0)}
                        style={{ fontFamily: 'var(--mono)', fontSize: 13, textAlign: 'right' }} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' }}>Discount</div>
                        {/* % / TZS toggle */}
                        <button
                          onClick={() => updateLine(i, 'discountMode', discountMode === 'percent' ? 'absolute' : 'percent')}
                          style={{
                            fontSize: 9, padding: '0 6px', borderRadius: 4,
                            background: 'var(--surface3)', border: '1px solid var(--border)',
                            color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--mono)',
                          }}>
                          {discountMode === 'percent' ? '%' : 'TZS'}
                        </button>
                      </div>
                      <input type="number" className="form-input" min={0}
                        value={line.discount} onChange={e => updateLine(i, 'discount', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        style={{ fontFamily: 'var(--mono)', fontSize: 13, textAlign: 'right' }} />
                    </div>
                    <div style={{ alignSelf: 'end', marginBottom: 10, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>=</div>
                    <div style={{ alignSelf: 'end', textAlign: 'right', paddingBottom: 8 }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 2 }}>Line Total</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>
                        {tzs(line.amount)}
                      </div>
                    </div>
                  </div>
                )}

                {lowStock && (
                  <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, fontSize: 11, color: 'var(--red)' }}>
                    Requested qty exceeds stock. {invSettings?.block_negative_stock ? 'Posting will be blocked.' : 'Stock will go negative.'}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}
          onClick={() => setLines([...lines, { productId: '', name: '', qty: 1, price: 0, discount: 0, amount: 0, discountMode: 'percent' }])}>
          + Add another product
        </button>
      </div>

      {/* ═══ STEP 2: TERMS & EXTRAS ═════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 14 }}>
        <StepHeader num={2} title="Invoice Terms" helper="Dates, payment terms, PO reference, delivery" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Invoice No', content: <input className="form-input" value={form.ref} readOnly style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', background: 'var(--surface2)', cursor: 'default' }} /> },
            { label: 'Date', content: <input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /> },
            { label: 'Due Date', content: <input type="date" className="form-input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /> },
            { label: 'Payment Terms', content: (
              <select className="form-input" value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}>
                {TERMS.map(t => <option key={t}>{t}</option>)}
              </select>
            )},
            { label: 'Salesperson', content: (
              <select className="form-input" value={form.salesperson} onChange={e => set('salesperson', e.target.value)}>
                <option>Joe Gembe</option><option>Jane Mwatonoka</option>
                <option>Lilian Mallya</option><option>Barbra Kabendera</option>
              </select>
            )},
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{item.label}</div>
              {item.content}
            </div>
          ))}
        </div>

        {/* PO Ref + Stock Location strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 12 }}>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Customer PO Reference <span style={{ color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </div>
            <input className="form-input" placeholder="e.g. PO-2026-0044"
              value={form.poRef} onChange={e => set('poRef', e.target.value)}
              style={{ fontFamily: 'var(--mono)' }} />
          </div>
          {locations.length > 0 && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Deduct Stock From</span>
                {userLoc.isLocked && (
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#f59e0b15', color: '#f59e0b', fontWeight: 700, letterSpacing: 0 }}>
                    LOCKED
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {locations.map(loc => {
                  const isMine = !userLoc.isLocked || userLoc.defaultLocationCode === loc.code
                  return (
                    <button
                      key={loc.id}
                      onClick={() => { if (isMine) setLocationCode(loc.code) }}
                      title={isMine ? '' : 'You are not assigned to this location'}
                      style={{
                        padding: '5px 12px',
                        border: `1.5px solid ${locationCode === loc.code ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 6,
                        background: locationCode === loc.code ? 'var(--accent-dim)' : 'var(--surface)',
                        cursor: isMine ? 'pointer' : 'not-allowed',
                        opacity: isMine ? 1 : 0.4,
                        fontSize: 11, fontWeight: 600,
                        color: locationCode === loc.code ? 'var(--accent)' : 'var(--text3)',
                      }}>
                      {loc.code} — {loc.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Delivery Address override */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>Delivery Address <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text3)' }}>(leave blank to use customer registered address)</span></span>
          </div>
          <input className="form-input" placeholder="e.g. Deliver to site office, Plot 45, Masaki"
            value={form.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)} />
        </div>

        {/* Notes */}
        <div>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Notes / Payment Instructions</div>
          <textarea className="form-input" rows={2} style={{ resize: 'none', fontSize: 12 }}
            placeholder="Bank details, delivery instructions, payment reference…"
            value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>

      {/* ═══ STEP 3: PAYMENT RECEIVED AT ISSUE (OPTIONAL) ═════════════════ */}
      {/*
        Wholesale customers occasionally pay cash up-front. They are NOT
        cash sale walk-ins (Cash Sale is reserved for retail, CASH001 etc.)
        so the document still has to be a Sales Invoice — they're on the
        debtor list with credit terms and they want it on their statement.
        Capturing the receipt right here in the same posting means:
          • The PnL and bank balance reflect the money immediately
          • The invoice shows on the customer statement as PAID or PARTIAL
          • No "post invoice, then go to Cash Receipt, then search again"
            workflow that's easy to forget halfway through.
        Leave blank for normal credit invoices — this is purely additive.
      */}
      <div className="card" style={{ marginBottom: 14 }}>
        <StepHeader num={3} title="Payment Received at Issue" helper="Optional — only if the customer is paying cash / M-Pesa / bank now (e.g. wholesalers who pay upfront)" />

        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12,
          padding: '10px 12px', background: 'rgba(0,229,160,.06)',
          border: '1px solid rgba(0,229,160,.2)', borderRadius: 8,
          fontSize: 12, color: 'var(--text2)',
        }}>
          <svg width="14" height="14" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>
            Leave the amount blank for a normal credit invoice. If the customer
            is paying now, type the amount — a matching <strong>Cash Receipt</strong> is
            posted automatically and the invoice shows as <strong>Paid</strong> or <strong>Partially Paid</strong>.
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gap: 10 }}>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Amount Paid Now (TZS)
            </div>
            <input
              type="number"
              className="form-input"
              placeholder="0 — leave blank for full credit"
              value={form.paidNow}
              onChange={e => set('paidNow', e.target.value)}
              style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }}
              min={0}
              max={subtotal}
            />
            {/* Quick-fill buttons let the user pop common amounts without
                fiddly typing — "Full" is the typical wholesaler upfront case. */}
            {subtotal > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => set('paidNow', subtotal.toString())}
                  style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 4,
                    border: '1px solid var(--accent)', background: 'var(--accent-dim)',
                    color: 'var(--accent)', cursor: 'pointer', fontWeight: 600,
                  }}>
                  Full ({tzs(subtotal)})
                </button>
                <button
                  type="button"
                  onClick={() => set('paidNow', Math.round(subtotal / 2).toString())}
                  style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 4,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--text3)', cursor: 'pointer',
                  }}>
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => { set('paidNow', ''); set('paidTransactionId', '') }}
                  style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 4,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--text3)', cursor: 'pointer',
                  }}>
                  Clear
                </button>
              </div>
            )}
          </div>

          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Deposit To {parseFloat(form.paidNow || '0') > 0 && <span style={{ color: 'var(--red)', textTransform: 'none', letterSpacing: 0 }}>*</span>}
            </div>
            <select
              className="form-input"
              value={form.paidDepositAccountId}
              onChange={e => set('paidDepositAccountId', e.target.value)}
              disabled={!(parseFloat(form.paidNow || '0') > 0)}
            >
              <option value="">— Select cash / M-Pesa / bank account —</option>
              {cashAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
            {form.paidDepositAccountId && parseFloat(form.paidNow || '0') > 0 && (() => {
              const acc = cashAccounts.find(a => a.id === form.paidDepositAccountId)
              if (!acc) return null
              const method = deriveMethod(acc.code, acc.name)
              return (
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                  Method: <span style={{ color: 'var(--accent)' }}>{method.toUpperCase()}</span> (auto-detected)
                </div>
              )
            })()}
          </div>

          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Reference <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text3)' }}>(M-Pesa / cheque / TT no.)</span>
            </div>
            <input
              className="form-input"
              placeholder="e.g. QTA1BCD2EFG"
              value={form.paidTransactionId}
              onChange={e => set('paidTransactionId', e.target.value)}
              disabled={!(parseFloat(form.paidNow || '0') > 0)}
              style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
            />
          </div>
        </div>

        {/* Live status strip — tells the user exactly what will happen on post */}
        {parseFloat(form.paidNow || '0') > 0 && (() => {
          const paid = parseFloat(form.paidNow) || 0
          const balance = Math.max(0, subtotal - paid)
          const isFull = paid >= subtotal - 0.5
          const over = paid > subtotal + 0.5
          return (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: over ? 'rgba(239,68,68,.08)' : isFull ? 'rgba(0,229,160,.08)' : 'rgba(234,179,8,.08)',
              border: `1px solid ${over ? 'var(--red)' : isFull ? 'var(--green)' : 'var(--yellow)'}`,
              borderRadius: 8, fontSize: 12, color: 'var(--text2)',
            }}>
              {over ? (
                <span style={{ color: 'var(--red)', fontWeight: 600 }}>
                  ⚠ Amount paid ({tzs(paid)}) exceeds invoice total ({tzs(subtotal)}). Reduce it, or post the invoice first then receive the extra via Cash Receipt as a credit on account.
                </span>
              ) : isFull ? (
                <span>
                  <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ Invoice will be marked PAID IN FULL.</span> A Cash Receipt for {tzs(paid)} will post alongside the invoice, both journals settle the AR.
                </span>
              ) : (
                <span>
                  <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>Partial payment.</span> {tzs(paid)} will be received now; {tzs(balance)} remains as open AR on the customer's statement.
                </span>
              )}
            </div>
          )
        })()}
      </div>

      {/* ═══ STEP 4: REVIEW & POST ══════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 100 /* space for sticky footer */ }}>
        <StepHeader num={4} title="Review & Post" helper="Check totals, then post to create the invoice, update AR, and deduct stock" />

        {/* Totals — right-aligned block */}
        <div style={{ maxWidth: 420, marginLeft: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', color: 'var(--text2)' }}>
            <span>{vatEnabled ? 'Subtotal (ex VAT)' : 'Subtotal'}</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{netRevenue.toLocaleString()}</span>
          </div>
          {vatEnabled && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', color: 'var(--text2)' }}>
              <span>VAT {vatRate}%</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{vat.toLocaleString()}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, paddingTop: 10, borderTop: '2px solid var(--accent)' }}>
            <span style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Due</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>TZS {subtotal.toLocaleString()}</span>
          </div>

          {/* Paid-now summary appears whenever an advance payment is entered.
              Shows total → paid now → balance for a quick sanity check. */}
          {parseFloat(form.paidNow || '0') > 0 && (() => {
            const paid = parseFloat(form.paidNow) || 0
            const balance = Math.max(0, subtotal - paid)
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', color: 'var(--text2)', marginTop: 6 }}>
                  <span>Paid at issue</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>− {paid.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: balance > 0.5 ? 'var(--yellow)' : 'var(--green)' }}>
                    {balance > 0.5 ? 'Balance Outstanding' : 'PAID IN FULL'}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: balance > 0.5 ? 'var(--yellow)' : 'var(--green)' }}>
                    TZS {balance.toLocaleString()}
                  </span>
                </div>
              </>
            )
          })()}

          {/* Credit impact warning if applicable */}
          {selectedCust && selectedCust.credit_limit > 0 && availableCredit !== null && subtotal > availableCredit && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>⚠ Credit limit exceeded</div>
              <div style={{ color: 'var(--text2)' }}>
                This invoice is {tzs(subtotal - availableCredit)} over the available credit. Posting will still succeed, but consider collecting an upfront payment or raising the credit limit first.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ STICKY FOOTER — always visible action bar ══════════════════════ */}
      <div style={{
        position: 'fixed', bottom: 0, left: 'var(--sidebar-w, 240px)', right: 0,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, zIndex: 30,
        boxShadow: '0 -8px 24px rgba(0,0,0,.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Invoice Total</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>
              TZS {subtotal.toLocaleString()}
            </div>
          </div>
          {/* Show "Paid now / Balance" splits in the footer when an advance is entered */}
          {parseFloat(form.paidNow || '0') > 0 && (() => {
            const paid = parseFloat(form.paidNow) || 0
            const balance = Math.max(0, subtotal - paid)
            const isFull = balance <= 0.5
            return (
              <>
                <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
                <div>
                  <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Paid Now</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                    {paid.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {isFull ? 'Status' : 'Balance'}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: isFull ? 'var(--green)' : 'var(--yellow)' }}>
                    {isFull ? 'PAID' : balance.toLocaleString()}
                  </div>
                </div>
              </>
            )
          })()}
          <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
          <div style={{ fontSize: 11, color: 'var(--text3)', minWidth: 0 }}>
            {!selectedCust ? (
              <span style={{ color: 'var(--yellow)' }}>⚠ Pick a customer first</span>
            ) : lines.every(l => !l.productId) ? (
              <span style={{ color: 'var(--yellow)' }}>⚠ Add at least one product</span>
            ) : subtotal <= 0 ? (
              <span style={{ color: 'var(--yellow)' }}>⚠ Invoice total must be &gt; 0</span>
            ) : parseFloat(form.paidNow || '0') > subtotal + 0.5 ? (
              <span style={{ color: 'var(--red)' }}>⚠ Paid amount exceeds invoice total</span>
            ) : parseFloat(form.paidNow || '0') > 0 && !form.paidDepositAccountId ? (
              <span style={{ color: 'var(--yellow)' }}>⚠ Pick where the cash was deposited</span>
            ) : (
              <>
                <span style={{ color: 'var(--green)' }}>✓ Ready to post</span>
                <span style={{ color: 'var(--text3)', marginLeft: 8 }}>· {lines.filter(l => l.productId).length} line{lines.filter(l => l.productId).length === 1 ? '' : 's'}</span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', display: 'none' }} className="kbd-hint">
            Ctrl+Enter
          </div>
          <button
            className="btn btn-primary"
            onClick={post}
            disabled={!selectedCust || posting}
            style={{
              padding: '12px 24px', fontSize: 14, fontWeight: 800,
              opacity: (!selectedCust || posting) ? 0.5 : 1,
              cursor: (!selectedCust || posting) ? 'not-allowed' : 'pointer',
            }}>
            {posting
              ? 'Posting…'
              : parseFloat(form.paidNow || '0') >= subtotal - 0.5 && parseFloat(form.paidNow || '0') > 0
                ? 'Post Invoice + Receipt'
                : parseFloat(form.paidNow || '0') > 0
                  ? 'Post Invoice + Part Receipt'
                  : 'Post Invoice'}
          </button>
        </div>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>

    {/* ── INVOICE MODAL ────────────────────────────────────────────────── */}
    {showInvoice && lastInvoice && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', display: 'flex', flexDirection: 'column', zIndex: 9999 }}>
        <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700 }}>Invoice — {lastInvoice.ref}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={() => {
              const el = document.getElementById('sokora-invoice')
              if (!el) return
              const win = window.open('', '_blank')
              if (!win) return
              // Read the active brand color so print CSS can flatten the
              // 3-color bottom gradient to this solid value.
              const brandColor = invoiceSettings?.primary_color || '#85c2be'
              win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${lastInvoice.ref}</title>
                <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@600&display=swap" rel="stylesheet">
                <style>
                  /* Core reset */
                  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
                  body{display:flex;justify-content:center;padding:20px;background:#f0f0f0}

                  /* Force background colors to print in Chrome/Edge/Safari.
                     Without these, the teal hero banner and cream Account
                     Statement panel would render as plain white in the PDF. */
                  *{
                    -webkit-print-color-adjust:exact !important;
                    print-color-adjust:exact !important;
                    color-adjust:exact !important;
                  }

                  @media print{
                    body{background:#fff;padding:0;display:block}

                    /* PDF SIZE OPTIMIZATIONS:
                       Chrome rasterizes pages with complex patterns/gradients
                       into images, which explodes the PDF size from ~80KB
                       (vector) to ~500KB+ (raster). Stripping decorative
                       non-essentials lets Chrome keep the vector path. */

                    /* Hide the diagonal stripe overlay on the hero banner.
                       It's a repeating-linear-gradient Chrome embeds as an
                       image; invisible loss in PDF, major size drop. */
                    .no-print{display:none !important}

                    /* Flatten the 3-color gradient bottom bar to solid teal.
                       Uses the current brand color from invoice settings. */
                    .print-solid-bar{background:${brandColor} !important}

                    /* Remove Chrome's browser-inserted URL / date / page-number
                       headers and footers by zeroing page margin. The invoice
                       has its own internal padding so this still looks good. */
                    @page{size:A4;margin:0}
                  }
                </style>
              </head><body>${el.outerHTML}</body></html>`)
              win.document.close()
              setTimeout(() => win.print(), 600)
            }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print / PDF
            </button>

            {/* Save as PNG — generates a crisp image of the invoice for easy
                sharing on WhatsApp, social, or slide decks. Uses html2canvas
                loaded lazily from CDN (same pattern as ProformaInvoice). */}
            <button className="btn btn-ghost btn-sm" onClick={() => {
              const el = document.getElementById('sokora-invoice')
              if (!el) return
              showToast('Generating image…')
              const existing = (window as any).html2canvas
              const generate = () => {
                // Scroll the container to the top and pass explicit width+height
                // so html2canvas captures the ENTIRE invoice, not just the
                // viewport-visible portion. Without these options, if the
                // modal's scroll container has cropped the invoice, the
                // captured image only contains the top ~800px.
                const fullWidth = el.scrollWidth || el.offsetWidth
                const fullHeight = el.scrollHeight || el.offsetHeight
                ;(window as any).html2canvas(el, {
                  scale: 1.5,
                  useCORS: true,
                  backgroundColor: '#ffffff',
                  width: fullWidth,
                  height: fullHeight,
                  windowWidth: fullWidth,
                  windowHeight: fullHeight,
                  scrollX: 0,
                  scrollY: 0,
                })
                  .then((canvas: HTMLCanvasElement) => {
                    const link = document.createElement('a')
                    link.download = `Invoice-${lastInvoice.ref}.png`
                    link.href = canvas.toDataURL('image/png')
                    link.click()
                    showToast('Image downloaded')
                  })
                  .catch(() => showToast('Image generation failed', 'error'))
              }
              if (existing) {
                generate()
              } else {
                const script = document.createElement('script')
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
                script.onload = generate
                script.onerror = () => showToast('Could not load image library', 'error')
                document.body.appendChild(script)
              }
            }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              Save PNG
            </button>
            {waConfig?.enabled && waConfig?.api_key && lastInvoice.customers?.whatsapp && (
              <button className="btn btn-ghost btn-sm" disabled={sending || waSent}
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#25D366', border: '1px solid rgba(37,211,102,.3)' }}
                onClick={async () => {
                  if (!lastInvoice || !waConfig) return
                  setSending(true)
                  const msg = formatInvoiceMessage(waConfig.template_invoice || '', {
                    customer_name: lastInvoice.customers?.name || 'Customer',
                    ref: lastInvoice.ref, date: lastInvoice.posting_date,
                    due_date: lastInvoice.due_date || '', payment_terms: lastInvoice.payment_terms || '',
                    items: lastInvoice.voucher_lines?.map((l: any) => ({ name: l.products?.name || l.description || '—', qty: l.qty, amount: l.total })) || [],
                    total: lastInvoice.total_amount,
                    outstanding: lastInvoice.customers?.balance || 0,
                    bank_account: waConfig ? '22510074972 (NMB)' : '—',
                  })
                  const result = await sendWhatsApp(waConfig, { to: lastInvoice.customers.whatsapp, message: msg, type: 'invoice', ref: lastInvoice.ref, customer_name: lastInvoice.customers?.name, customer_id: lastInvoice.customer_id, is_transactional: true })
                  setSending(false)
                  if (result.success) setWaSent(true)
                }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                {sending ? 'Sending…' : waSent ? 'Sent ✓' : 'WhatsApp'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => {
              setShowInvoice(false)
              setWaSent(false)
              // If we loaded this invoice in view mode, go back to the list we came from.
              // Otherwise (post-success modal), go to the vouchers hub.
              if (editVoucherId) {
                onClearEdit?.()
                onNav('sales-day-book')
              } else {
                onNav('vouchers')
              }
            }}>Close</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '32px 20px' }}>
          <div id="sokora-invoice">
            <SokoraInvoice voucher={lastInvoice} settings={invoiceSettings || {
              company_name: 'Your Organization', tagline: 'Reimagining Motherhood',
              address: 'Dar es Salaam, Tanzania', city: 'Dar es Salaam',
              phone: '+255 700 000 000', email: 'hello@sokora.app', website: 'www.sokora.app',
              tin: '—', vrn: '—', primary_color: '#85c2be',
              bank_name: 'NMB Bank', bank_account_name: 'Your Organization',
              bank_account_number: '22510074972', bank_branch: 'Dar es Salaam Branch',
              show_bank_details: true, show_salesperson: true, show_vat_breakdown: true,
              show_outstanding_balance: true, show_payment_terms: true, show_notes: true,
              footer_note: 'Thank you for your business. Payment is due by the date shown above.',
              payment_note: 'Please quote the invoice number as payment reference.',
            }} />
          </div>
        </div>
      </div>
    )}
    </>
  )
}
