import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import DraftBanner from '../../components/DraftBanner'
import { nextRef } from '../../lib/refs'
import { today, tzs, getPostedBy } from '../../lib/utils'
import { loadWAConfig, sendWhatsApp } from '../../lib/whatsapp'
import type { WAConfig } from '../../lib/whatsapp'
import { useVoucherDraft } from '../../lib/useVoucherDraft'
import { useSettings } from '../../lib/settingsLoader'
import type { Page } from '../../lib/types'
import { SokoraProforma, DEFAULT_PROFORMA } from '../ProformaTemplate'
import type { ProformaSettings, ProformaVoucher } from '../ProformaTemplate'

// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  onNav: (p: Page) => void
  editVoucherId?: string
  onClearEdit?: () => void
}

interface DBCustomer {
  id: string; name: string; company: string; contact_person: string
  whatsapp: string; balance: number; credit_limit: number
  credit_period: number; payment_terms: string; customer_number: string
  email?: string; address?: string
}

interface DBProduct {
  id: string; sku: string; name: string
  selling_price: number; cost_price: number; qty_on_hand: number
}

interface PFLine {
  productId: string; desc: string
  qty: number; price: number
  discount: number; amount: number
}

const TERMS = ['COD', 'NET7', 'NET14', 'NET30', 'NET45', 'NET60', 'PREPAY']
const VALIDITY_PRESETS = [3, 7, 14, 30]

// ─────────────────────────────────────────────────────────────────────────────
// SHORTCUT BAR — Tally-style quick navigation to related pages
// ─────────────────────────────────────────────────────────────────────────────
const SHORTCUTS: { icon: string; label: string; page: Page }[] = [
  { icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    label: 'Customers', page: 'customers' },
  { icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    label: 'Inventory', page: 'inventory' },
  { icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8',
    label: 'Sales Invoice', page: 'sales-invoice' },
  { icon: 'M18 20V10M12 20V4M6 20v-6',
    label: 'Sales Register', page: 'sales-register' },
  { icon: 'M3 3h18v18H3z M3 9h18 M9 21V9',
    label: 'Proforma Template', page: 'proforma-template' as Page },
  { icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    label: 'WhatsApp', page: 'whatsapp-settings' },
]

// ─────────────────────────────────────────────────────────────────────────────
export default function ProformaInvoice({ onNav, editVoucherId, onClearEdit }: Props) {
  const { settings } = useSettings()
  const vatEnabled = settings.tax?.vat_enabled ?? false
  const vatRate = settings.tax?.default_vat_rate ?? 18
  // ── UI state ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [converting, setConverting] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [showPreview, setShowPreview] = useState(false)
  const [lastVoucher, setLastVoucher] = useState<ProformaVoucher | null>(null)

  const [templateSettings, setTemplateSettings] = useState<ProformaSettings>(DEFAULT_PROFORMA)
  const [waConfig, setWaConfig] = useState<WAConfig | null>(null)
  const [sending, setSending] = useState(false)
  const [waSent, setWaSent] = useState(false)

  // ── Data state ────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<DBProduct[]>([])
  const [custResults, setCustResults] = useState<DBCustomer[]>([])
  const [selectedCust, setSelectedCust] = useState<DBCustomer | null>(null)
  const [showDrop, setShowDrop] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  // ── Form state ────────────────────────────────────────────────────────────
  const [lines, setLines] = useState<PFLine[]>([
    { productId: '', desc: '', qty: 1, price: 0, discount: 0, amount: 0 }
  ])
  const [form, setForm] = useState({
    ref: '',
    date: today(),
    validUntil: '',
    validity: '7',
    customer: '',
    wa: '',
    paymentTerms: 'NET30',
    deliveryTerms: 'Delivery within Dar es Salaam — 2 working days',
    notes: '',
    salesperson: getPostedBy(),
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const showToast = (m: string, t: 'success' | 'error' = 'success') => { setToast(m); setToastType(t) }

  // ─── Draft persistence ─────────────────────────────────────────────────
  type PFDraft = { form: typeof form; lines: PFLine[]; selectedCust: DBCustomer | null }
  const {
    availableDraft, draftAgeMs,
    saveDraft, clearDraft, acknowledgeResume, discardDraft,
  } = useVoucherDraft<PFDraft>('proforma', !!editVoucherId)

  const resumeDraft = () => {
    if (!availableDraft) return
    setForm(availableDraft.form)
    setLines(availableDraft.lines)
    setSelectedCust(availableDraft.selectedCust)
    acknowledgeResume()
  }

  // Auto-save
  useEffect(() => {
    if (!form.ref) return
    const hasAnything =
      !!selectedCust ||
      form.customer.trim().length > 0 ||
      form.notes.trim().length > 0 ||
      lines.some(l => l.productId || l.qty !== 1 || l.price > 0)
    if (!hasAnything) return
    saveDraft({ form, lines, selectedCust })
  }, [form, lines, selectedCust, saveDraft])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadProducts()
    if (editVoucherId) {
      loadExistingProforma(editVoucherId)
    } else {
      loadNextRef()
    }
    loadSettings()
    loadWAConfig().then(setWaConfig)

    // Auto-calc validUntil from validity (only for new proformas)
    if (!editVoucherId) {
      const d = new Date(); d.setDate(d.getDate() + 7)
      set('validUntil', d.toISOString().split('T')[0])
    }

    const close = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editVoucherId])

  // Recalculate valid-until when validity days change — but NOT in edit mode
  // (we want to preserve the stored date)
  useEffect(() => {
    if (editingId) return
    const days = parseInt(form.validity) || 7
    const d = new Date(form.date); d.setDate(d.getDate() + days)
    set('validUntil', d.toISOString().split('T')[0])
  }, [form.validity, form.date, editingId])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter = Save Proforma
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        saveProforma()
      }
      // Ctrl/Cmd + Shift + C = Convert to Sales Invoice
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        if (selectedCust || form.customer.trim()) convertToInvoice()
      }
      // Alt + N = New line
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        addLine()
      }
      // Esc = Close preview
      if (e.key === 'Escape' && showPreview) {
        setShowPreview(false); setWaSent(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [form, lines, selectedCust, showPreview])

  // ── Data loaders ──────────────────────────────────────────────────────────
  const loadProducts = () => {
    supabase.from('products').select('id, sku, name, selling_price, cost_price, qty_on_hand')
      .eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setProducts(data) })
  }

  const loadNextRef = async () => {
    const ref = await nextRef('proforma')
    set('ref', ref)
  }

  // ── Edit-mode: fetch existing proforma with lines + customer ────────────
  // Hydrates the form state so the user sees exactly what they saved earlier
  // and can make corrections. Pulls the linked customer from the `customers`
  // table by customer_id to keep the selector chip populated correctly.
  const loadExistingProforma = async (voucherId: string) => {
    setLoadingExisting(true)
    try {
      const { data: v, error } = await supabase.from('vouchers')
        .select(`
          id, ref, posting_date, due_date, description, subtotal, vat_amount,
          total_amount, status, notes, payment_terms, customer_id, posted_by,
          customers (
            id, name, company, contact_person, whatsapp, address, email, customer_number,
            balance, credit_limit, credit_period, payment_terms
          ),
          voucher_lines (
            line_number, product_id, description, qty, unit_price, discount_pct,
            subtotal, total, products ( id, name, sku )
          )
        `)
        .eq('id', voucherId)
        .eq('type', 'proforma')
        .single()

      if (error || !v) {
        showToast('Could not load proforma: ' + (error?.message || 'not found'), 'error')
        setLoadingExisting(false)
        return
      }

      setEditingId(v.id)
      const cust = (v.customers as any) || null
      if (cust) setSelectedCust(cust)

      setForm(f => ({
        ...f,
        ref: v.ref,
        date: v.posting_date,
        validUntil: v.due_date || '',
        validity: '',  // leave blank; stored valid-until is the source of truth
        customer: cust?.name || '',
        wa: cust?.whatsapp || '',
        paymentTerms: v.payment_terms || 'NET30',
        notes: v.notes || '',
        salesperson: v.posted_by || getPostedBy(),
      }))

      const sortedLines = ((v.voucher_lines as any[]) || [])
        .sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
        .map(l => ({
          productId: l.product_id || '',
          desc: l.description || l.products?.name || '',
          qty: l.qty || 1,
          price: l.unit_price || 0,
          discount: l.discount_pct || 0,
          amount: l.total || 0,
        }))
      setLines(sortedLines.length > 0 ? sortedLines : [{ productId: '', desc: '', qty: 1, price: 0, discount: 0, amount: 0 }])
    } catch (err: any) {
      showToast('Load failed: ' + err.message, 'error')
    } finally {
      setLoadingExisting(false)
    }
  }

  const loadSettings = () => {
    supabase.from('system_settings').select('value').eq('key', 'proforma_template').single()
      .then(({ data }) => {
        if (data?.value) {
          try { setTemplateSettings({ ...DEFAULT_PROFORMA, ...JSON.parse(data.value) }) } catch (e) { /* ignore */ }
        }
      })
  }

  // ── Customer search ──────────────────────────────────────────────────────
  const searchCustomer = async (val: string) => {
    set('customer', val); setSelectedCust(null)
    if (val.length < 1) { setCustResults([]); setShowDrop(false); return }
    const { data } = await supabase.from('customers')
      .select('*').eq('is_active', true)
      .or(`name.ilike.%${val}%,company.ilike.%${val}%,contact_person.ilike.%${val}%,customer_number.ilike.%${val}%`)
      .order('name').limit(8)
    setCustResults(data || [])
    setShowDrop((data || []).length > 0)
  }

  const selectCust = (c: DBCustomer) => {
    setSelectedCust(c)
    set('customer', c.company || c.name)
    set('wa', c.whatsapp || '')
    if (c.payment_terms) set('paymentTerms', c.payment_terms)
    setShowDrop(false); setCustResults([])
  }

  // ── Line handlers ─────────────────────────────────────────────────────────
  const updateLine = (i: number, field: keyof PFLine, val: string | number) => {
    const nl = [...lines]
    nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) { nl[i].desc = p.name; nl[i].price = p.selling_price }
    }
    const qty = field === 'qty' ? Number(val) : nl[i].qty
    const price = field === 'price' ? Number(val) : nl[i].price
    const disc = field === 'discount' ? Number(val) : nl[i].discount
    nl[i].amount = Math.round(price * qty * (1 - disc / 100))
    setLines(nl)
  }

  const addLine = () => setLines([...lines, { productId: '', desc: '', qty: 1, price: 0, discount: 0, amount: 0 }])
  const removeLine = (i: number) => {
    if (lines.length <= 1) return
    setLines(lines.filter((_, idx) => idx !== i))
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const vat = vatEnabled ? Math.round(subtotal * vatRate / (100 + vatRate)) : 0
  const netRevenue = subtotal - vat
  const totalSavings = lines.reduce((s, l) => {
    if (!l.discount) return s
    const full = l.price * l.qty
    return s + (full - l.amount)
  }, 0)

  // ── Build voucher object for preview (also used after save) ─────────────
  const buildVoucher = (ref: string, status: ProformaVoucher['status'] = 'proforma'): ProformaVoucher => ({
    ref,
    posting_date: form.date,
    valid_until: form.validUntil,
    payment_terms: form.paymentTerms,
    delivery_terms: form.deliveryTerms,
    notes: form.notes,
    subtotal: netRevenue,
    vat_amount: vat,
    total_amount: subtotal,
    posted_by: form.salesperson,
    status,
    customers: {
      name: selectedCust?.name || form.customer,
      company: selectedCust?.company || '',
      contact_person: selectedCust?.contact_person || '',
      whatsapp: selectedCust?.whatsapp || form.wa || '',
      address: selectedCust?.address || '',
      email: selectedCust?.email || '',
    },
    voucher_lines: lines.filter(l => l.productId || l.desc).map(l => ({
      qty: l.qty, unit_price: l.price, discount_pct: l.discount, total: l.amount,
      description: l.desc,
      products: {
        name: l.desc || products.find(p => p.id === l.productId)?.name || '—',
        sku: products.find(p => p.id === l.productId)?.sku || '',
      },
    })),
  })

  // ── Save proforma ─────────────────────────────────────────────────────────
  const saveProforma = async () => {
    if (!form.customer.trim()) { showToast('Customer name required', 'error'); return }
    if (lines.every(l => !l.productId && !l.desc)) { showToast('Add at least one line', 'error'); return }
    setPosting(true)
    try {
      // ── Edit branch: update existing proforma in place ────────────────
      if (editingId) {
        const { error: upErr } = await supabase.from('vouchers').update({
          posting_date: form.date,
          description: `Proforma Invoice — ${form.customer} — ${form.ref}`,
          subtotal: netRevenue, vat_amount: vat, total_amount: subtotal,
          due_date: form.validUntil || null,
          payment_terms: form.paymentTerms,
          customer_id: selectedCust?.id || null,
          notes: form.notes || null,
          posted_by: form.salesperson,
        }).eq('id', editingId)
        if (upErr) throw new Error(upErr.message)

        // Replace all lines — simpler than diffing
        await supabase.from('voucher_lines').delete().eq('voucher_id', editingId)
        const lineInserts = lines.filter(l => l.productId || l.desc).map((l, i) => ({
          voucher_id: editingId, line_number: i + 1,
          product_id: l.productId || null,
          description: l.desc, qty: l.qty,
          unit_price: l.price, discount_pct: l.discount,
          subtotal: l.amount, vat_amount: vatEnabled ? Math.round(l.amount * vatRate / (100 + vatRate)) : 0,
          total: l.amount,
        }))
        if (lineInserts.length) {
          const { error: liErr } = await supabase.from('voucher_lines').insert(lineInserts)
          if (liErr) throw new Error(liErr.message)
        }

        const built = buildVoucher(form.ref)
        setLastVoucher(built)
        setShowPreview(true)
        showToast(`${form.ref} updated`)
        // Stay in edit mode so further saves update again. User clicks back/close to exit.
        return
      }

      // ── Insert branch: new proforma ──────────────────────────────────
      const { error } = await supabase.from('vouchers').insert({
        ref: form.ref, type: 'proforma', posting_date: form.date,
        description: `Proforma Invoice — ${form.customer} — ${form.ref}`,
        subtotal: netRevenue, vat_amount: vat, total_amount: subtotal,
        status: 'proforma',
        due_date: form.validUntil || null,
        payment_terms: form.paymentTerms,
        customer_id: selectedCust?.id || null,
        notes: form.notes || null,
        posted_by: form.salesperson,
      })
      if (error) throw new Error(error.message)

      // Save lines for future reference (no stock / GL impact)
      const { data: voucher } = await supabase.from('vouchers')
        .select('id').eq('ref', form.ref).eq('type', 'proforma').maybeSingle()

      if (voucher?.id) {
        const lineInserts = lines.filter(l => l.productId || l.desc).map((l, i) => ({
          voucher_id: voucher.id, line_number: i + 1,
          product_id: l.productId || null,
          description: l.desc, qty: l.qty,
          unit_price: l.price, discount_pct: l.discount,
          subtotal: l.amount, vat_amount: vatEnabled ? Math.round(l.amount * vatRate / (100 + vatRate)) : 0,
          total: l.amount,
        }))
        if (lineInserts.length) {
          await supabase.from('voucher_lines').insert(lineInserts)
        }
      }

      const built = buildVoucher(form.ref)
      setLastVoucher(built)
      setShowPreview(true)
      showToast(`${form.ref} saved — no GL or stock impact`)
      clearDraft()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      showToast(msg, 'error')
    } finally { setPosting(false) }
  }

  // ── Convert to sales invoice ──────────────────────────────────────────────
  const convertToInvoice = async () => {
    if (!selectedCust && !form.customer.trim()) { showToast('Customer required', 'error'); return }
    setConverting(true)
    try {
      const siRef = await nextRef('sales_invoice')
      localStorage.setItem('prefill_invoice', JSON.stringify({
        customerId: selectedCust?.id,
        customer: form.customer, wa: form.wa, ref: siRef,
        paymentTerms: form.paymentTerms, notes: form.notes,
        lines: lines.map(l => ({
          productId: l.productId, desc: l.desc,
          qty: l.qty, price: l.price, discount: l.discount, amount: l.amount,
        })),
        pfRef: form.ref,
      }))
      if (form.ref) {
        await supabase.from('vouchers')
          .update({ status: 'converted', notes: `Converted to ${siRef}` })
          .eq('ref', form.ref).eq('type', 'proforma')
      }
      showToast(`Converting to Sales Invoice ${siRef}…`)
      setTimeout(() => onNav('sales-invoice'), 700)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Conversion failed'
      showToast(msg, 'error')
    } finally { setConverting(false) }
  }

  // ── Export helpers ────────────────────────────────────────────────────────
  const printProforma = () => {
    const el = document.getElementById('sokora-proforma')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Proforma ${lastVoucher?.ref}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&family=DM+Mono:wght@500&family=Instrument+Sans:wght@600;700&display=block" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
        html,body{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
        body{display:flex;justify-content:center;padding:20px;background:#f0f0f0;font-family:'Instrument Sans',sans-serif}
        @page{size:A4 portrait;margin:0}
        @media print{
          body{background:#fff !important;padding:0 !important;margin:0 !important}
          #sokora-proforma{box-shadow:none !important;border-radius:0 !important;width:100% !important}
        }
      </style>
      </head><body>${el.outerHTML}
      <script>
        // Wait for fonts to load before printing — prevents Times New Roman fallback
        Promise.all([
          document.fonts ? document.fonts.ready : Promise.resolve(),
          new Promise(r => setTimeout(r, 1200))
        ]).then(() => { window.focus(); window.print(); });
      </script>
      </body></html>`)
    win.document.close()
  }

  const copyShareLink = () => {
    if (!lastVoucher) return
    const url = `${templateSettings.accept_url_base}?ref=${lastVoucher.ref}&amt=${lastVoucher.total_amount}`
    navigator.clipboard.writeText(url)
      .then(() => showToast('Share link copied to clipboard'))
      .catch(() => showToast('Copy failed — manual copy required', 'error'))
  }

  const sendViaWhatsApp = async () => {
    if (!waConfig?.enabled || !waConfig?.api_key) {
      showToast('Configure WhatsApp API first', 'error'); return
    }
    if (!lastVoucher?.customers?.whatsapp) {
      showToast('No WhatsApp number for this customer', 'error'); return
    }
    setSending(true)
    const msg = `Habari *${lastVoucher.customers.name || 'Customer'}*,

Hii ni quotation yako kutoka Your Organization.

📄 *Proforma: ${lastVoucher.ref}*
📅 Tarehe: ${lastVoucher.posting_date}
⏰ Inafanya hadi: ${lastVoucher.valid_until}
💰 *Jumla: TZS ${lastVoucher.total_amount.toLocaleString()}*

Unaweza kukubali quotation hii kupitia link hapa chini au WhatsApp sisi:
${templateSettings.accept_url_base}?ref=${lastVoucher.ref}

Asante kwa kuchagua SOKORA! 🌸
_Your Organization_`

    const result = await sendWhatsApp(waConfig, {
      to: lastVoucher.customers.whatsapp,
      message: msg,
      type: 'custom',
      ref: lastVoucher.ref,
      customer_name: lastVoucher.customers.name,
      is_transactional: true,
    })
    setSending(false)
    if (result.success) { setWaSent(true); showToast('Proforma sent via WhatsApp') }
    else showToast(result.error || 'WhatsApp send failed', 'error')
  }

  const downloadAsImage = () => {
    // Uses html2canvas via CDN — lazy-loaded only when needed
    const el = document.getElementById('sokora-proforma')
    if (!el) return
    showToast('Generating image…')
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    script.onload = () => {
      // @ts-expect-error html2canvas loaded via CDN
      window.html2canvas(el, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' }).then((canvas: HTMLCanvasElement) => {
        const link = document.createElement('a')
        link.download = `Proforma-${lastVoucher?.ref}.jpg`
        // JPEG at 0.85 quality — ~80% smaller than lossless PNG, visually identical for business docs
        link.href = canvas.toDataURL('image/jpeg', 0.85)
        link.click()
        showToast('Image downloaded')
      })
    }
    document.body.appendChild(script)
  }

  // ═══ Render ══════════════════════════════════════════════════════════════
  const icon = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 18v-6 M9 15h6'

  return (
    <>
      <VoucherPage
        title="Proforma Invoice"
        icon={icon}
        subtitle="Premium quotation · No GL or stock impact · Convert to Sales Invoice when confirmed"
        color="rgba(94,168,162,.12)"
        onPost={saveProforma}
        postLabel={posting ? 'Saving…' : 'Save & Preview'}
        journalNote="Proforma — no journal entries · No stock deduction · Safe to edit · Ctrl+Enter to save · Ctrl+Shift+C to convert"
        shortcuts={SHORTCUTS}
        onNav={onNav}
      >

        {availableDraft && draftAgeMs !== null && (
          <DraftBanner draftAgeMs={draftAgeMs} onResume={resumeDraft} onDiscard={discardDraft} />
        )}

        {/* Edit-mode banner — shown when we're editing an existing proforma.
            Gives the user a clear way to bail out of editing and back to a
            fresh proforma without losing the reference link. */}
        {editingId && (
          <div style={{
            background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.3)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="16" height="16" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>
                  Editing {form.ref}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                  {loadingExisting ? 'Loading…' : 'Changes overwrite the existing proforma. Save to confirm.'}
                </div>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm"
              onClick={() => {
                if (onClearEdit) onClearEdit()
                onNav('proformas-list')
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
              Back to list
            </button>
          </div>
        )}

        {/* ── Header / meta ────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="form-row">
            <FG label="Proforma Ref">
              <input className="form-input" value={form.ref} readOnly
                style={{ fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', cursor: 'default', color: 'var(--accent)' }} />
            </FG>
            <FG label="Issue Date" req>
              <input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} />
            </FG>
            <FG label="Valid For (days)">
              <div style={{ display: 'flex', gap: 4 }}>
                {VALIDITY_PRESETS.map(d => (
                  <button key={d} onClick={() => set('validity', String(d))}
                    style={{
                      flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      background: form.validity === String(d) ? 'var(--accent)' : 'var(--surface2)',
                      color: form.validity === String(d) ? '#fff' : 'var(--text3)',
                      border: '1px solid var(--border)', borderRadius: 6,
                    }}>{d}d</button>
                ))}
                <input type="number" className="form-input" value={form.validity}
                  onChange={e => set('validity', e.target.value)}
                  style={{ width: 60, fontSize: 11, textAlign: 'center' }} />
              </div>
            </FG>
            <FG label="Valid Until">
              <input type="date" className="form-input" value={form.validUntil}
                onChange={e => set('validUntil', e.target.value)}
                style={{ color: 'var(--accent)', fontWeight: 600 }} />
            </FG>
          </div>
        </div>

        {/* ── Customer hero block ─────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="card-title">Quote To</div>
            {selectedCust && (
              <button onClick={() => { setSelectedCust(null); set('customer', ''); set('wa', '') }}
                style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Change customer
              </button>
            )}
          </div>

          {!selectedCust ? (
            <div ref={dropRef} style={{ position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                  width="14" height="14" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input className="form-input" style={{ paddingLeft: 36, fontSize: 14, height: 48 }}
                  placeholder="Search customers by name, company, or contact · Or type a new name…"
                  value={form.customer}
                  onChange={e => searchCustomer(e.target.value)}
                  autoFocus />
              </div>
              {showDrop && custResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: 'var(--surface)', border: '1px solid var(--accent)',
                  borderRadius: 10, zIndex: 50, boxShadow: '0 12px 40px rgba(0,0,0,.4)',
                  overflow: 'hidden', maxHeight: 320, overflowY: 'auto',
                }}>
                  {custResults.map((c, i) => (
                    <div key={i} onClick={() => selectCust(c)}
                      style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.company || c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                          {c.contact_person && `Attn: ${c.contact_person} · `}{c.customer_number || '—'} · {c.payment_terms || 'COD'}
                          {c.whatsapp && ` · ${c.whatsapp}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                <FG label="WhatsApp (if not in directory)">
                  <input className="form-input" placeholder="+255 7XX XXX XXX" value={form.wa}
                    onChange={e => set('wa', e.target.value)} />
                </FG>
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800, marginBottom: 2 }}>
                {selectedCust.company || selectedCust.name}
              </div>
              {selectedCust.contact_person && (
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Attn: {selectedCust.contact_person}</div>
              )}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                {selectedCust.customer_number && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 4 }}>
                    {selectedCust.customer_number}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{selectedCust.payment_terms || 'COD'}</span>
                {selectedCust.whatsapp && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{selectedCust.whatsapp}</span>}
              </div>
            </div>
          )}
        </div>

        {/* ── Line items ──────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>Line Items</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 110px 70px 110px 32px', gap: 8, padding: '0 4px 8px', borderBottom: '1px solid var(--border)' }}>
            {['Product / Description', 'Qty', 'Unit Price', 'Disc%', 'Amount', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, textAlign: i >= 1 && i !== 5 ? 'right' : 'left', fontWeight: 600 }}>
                {h}
              </div>
            ))}
          </div>

          {lines.map((line, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 110px 70px 110px 32px', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <select className="form-input" style={{ fontSize: 12 }} value={line.productId}
                onChange={e => updateLine(i, 'productId', e.target.value)}>
                <option value="">— Select product —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {tzs(p.selling_price)} · Stock: {p.qty_on_hand}
                  </option>
                ))}
              </select>
              <input type="number" className="form-input" style={{ textAlign: 'center', fontSize: 13 }}
                min={1} value={line.qty}
                onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
              <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', textAlign: 'right', fontSize: 12 }}
                value={line.price}
                onChange={e => updateLine(i, 'price', parseFloat(e.target.value) || 0)} />
              <input type="number" className="form-input" style={{ textAlign: 'center', fontSize: 12 }}
                min={0} max={100} value={line.discount}
                onChange={e => updateLine(i, 'discount', parseFloat(e.target.value) || 0)} />
              <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
                {line.amount.toLocaleString()}
              </div>
              <button onClick={() => removeLine(i)} disabled={lines.length <= 1}
                style={{ background: 'none', border: 'none', cursor: lines.length > 1 ? 'pointer' : 'not-allowed', color: lines.length > 1 ? 'var(--text3)' : 'var(--surface3)', fontSize: 16 }}>
                ×
              </button>
            </div>
          ))}

          <button className="btn btn-ghost btn-sm" onClick={addLine} style={{ marginTop: 12 }}>
            + Add line <span style={{ opacity: 0.5, fontSize: 10, marginLeft: 6 }}>Alt+N</span>
          </button>

          {/* Totals */}
          {subtotal > 0 && (
            <div style={{ maxWidth: 340, marginLeft: 'auto', marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {totalSavings > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--green)', fontWeight: 600 }}>
                  <span>Volume savings applied</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>−{totalSavings.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--text3)' }}>
                <span>{vatEnabled ? 'Subtotal (excl. VAT)' : 'Subtotal'}</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{netRevenue.toLocaleString()}</span>
              </div>
              {vatEnabled && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--text3)' }}>
                  <span>VAT ({vatRate}% incl.)</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{vat.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTop: '2px solid var(--accent)' }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>QUOTED TOTAL</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>
                  TZS {subtotal.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Terms ───────────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="form-row">
            <FG label="Payment Terms">
              <select className="form-input" value={form.paymentTerms}
                onChange={e => set('paymentTerms', e.target.value)}>
                {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FG>
            <FG label="Delivery">
              <input className="form-input" value={form.deliveryTerms}
                onChange={e => set('deliveryTerms', e.target.value)} />
            </FG>
          </div>
          <FG label="Notes / Special Instructions">
            <textarea className="form-input" rows={2} value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Bulk-order notes, delivery preferences, free add-ons…"
              style={{ resize: 'none', fontSize: 12 }} />
          </FG>
        </div>

        {/* ── Convert button ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--accent)' }}>⌘⏎</span> Save · <span style={{ color: 'var(--accent)' }}>⌘⇧C</span> Convert · <span style={{ color: 'var(--accent)' }}>⌥N</span> New line
          </div>
          <button className="btn btn-primary"
            style={{ background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
            onClick={convertToInvoice}
            disabled={converting || (!selectedCust && !form.customer.trim())}>
            {converting ? 'Converting…' : '→ Convert to Sales Invoice'}
          </button>
        </div>

        <div style={{ background: 'rgba(94,168,162,.06)', border: '1px solid rgba(94,168,162,.2)', borderRadius: 10, padding: '12px 16px', marginTop: 12, fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
          This is a <strong>Proforma Invoice</strong> — for quotation purposes only. No journal entries are created, no stock is deducted. When the customer confirms, click <strong>"Convert to Sales Invoice"</strong> to post the actual invoice with full GL and stock impact.
        </div>

        {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
      </VoucherPage>

      {/* ═══ PREMIUM EXPORT / PREVIEW MODAL ══════════════════════════════ */}
      {showPreview && lastVoucher && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)',
          display: 'flex', flexDirection: 'column', zIndex: 9999,
        }}>
          {/* Top bar with actions */}
          <div style={{
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            padding: '12px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700 }}>
                  Proforma — {lastVoucher.ref}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  TZS {lastVoucher.total_amount.toLocaleString()} · Valid until {lastVoucher.valid_until}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8 }}>

              {/* Print / PDF — primary */}
              <button className="btn btn-primary" onClick={printProforma}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print / PDF
              </button>

              {/* Download PNG */}
              <button className="btn btn-ghost btn-sm" onClick={downloadAsImage}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                PNG
              </button>

              {/* Copy Share Link */}
              <button className="btn btn-ghost btn-sm" onClick={copyShareLink}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Copy Link
              </button>

              {/* WhatsApp */}
              {waConfig?.enabled && waConfig?.api_key && lastVoucher.customers?.whatsapp && (
                <button className="btn btn-ghost btn-sm" onClick={sendViaWhatsApp}
                  disabled={sending || waSent}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#25D366', border: '1px solid rgba(37,211,102,.3)' }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  {sending ? 'Sending…' : waSent ? 'Sent ✓' : 'WhatsApp'}
                </button>
              )}

              {/* Convert to Sales Invoice */}
              <button className="btn btn-ghost btn-sm" onClick={convertToInvoice}
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', border: '1px solid var(--accent-dim)' }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M5 12h14 M12 5l7 7-7 7" />
                </svg>
                Convert
              </button>

              {/* Close */}
              <button className="btn btn-ghost" onClick={() => { setShowPreview(false); setWaSent(false); onNav('vouchers') }}>
                Close
              </button>
            </div>
          </div>

          {/* Document preview */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '32px 20px' }}>
            <SokoraProforma voucher={lastVoucher} settings={templateSettings} />
          </div>
        </div>
      )}
    </>
  )
}
