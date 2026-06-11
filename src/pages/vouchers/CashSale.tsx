import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { nextRef } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import { SokoraReceipt } from '../ReceiptTemplate'
import type { ReceiptSettings } from '../ReceiptTemplate'
import { loadWAConfig, sendWhatsApp, formatReceiptMessage } from '../../lib/whatsapp'
import type { WAConfig } from '../../lib/whatsapp'
import { useCategories } from '../../lib/useCategories'
import { useAuth } from '../../lib/useAuth'
import { useUserLocation } from '../../lib/useUserLocation'
import { useDataCache } from '../../App'
import BundlePicker from '../../components/BundlePicker'
import CustomerContextSection from '../../components/CustomerContextSection'
import type { CustomerContext } from '../../components/CustomerContextSection'
import type { Bundle } from '../../lib/useBundles'
import { PAYMENT_METHODS } from '../../lib/cashSaleTypes'
import type { DBProduct, DBCustomer, SaleLine, SplitLine, PaymentMethod } from '../../lib/cashSaleTypes'
import type { Page } from '../../lib/types'
import { postCashSale, updateCashSale } from '../../lib/cashSalePost'
import { useVoucherDraft } from '../../lib/useVoucherDraft'
import DraftBanner from '../../components/DraftBanner'

interface Props {
  editVoucherId?: string | null
  onClearEdit?: () => void
  onNav?: (p: Page) => void
}


export default function CashSale({ editVoucherId, onClearEdit, onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [autoRef, setAutoRef] = useState('CS-10-????')
  const [posting, setPosting] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [autoReceipt] = useState(true)
  
  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false)
  const [editVoucherData, setEditVoucherData] = useState<any>(null)
  const [appliedBundle, setAppliedBundle] = useState<Bundle | null>(null)
  const { user } = useAuth()
  const userLoc = useUserLocation()

  // Customer
  const [waInput, setWaInput] = useState('')
  const [newCustName, setNewCustName] = useState('')
  const [custResults, setCustResults] = useState<DBCustomer[]>([])
  const [selectedCust, setSelectedCust] = useState<DBCustomer | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Customer context (TTC / pregnancy / postpartum) — captured optionally at till.
  // existingContext is the snapshot from the DB for the selectedCust (read-only display).
  // pendingContext is what the cashier has entered/changed in this session.
  const [existingContext, setExistingContext] = useState<{
    ttc_duration: string | null
    edd: string | null
    delivery_date: string | null
    context_status: string | null
    internal_notes: string | null
  } | null>(null)
  const [pendingContext, setPendingContext] = useState<CustomerContext>({})

  // Referral code (SOKORA Ambassador). Cashier types the code from the new
  // mama's friend; we call apply_referral_code to validate and preview the
  // benefit. State flow:
  //   referralCodeInput  = what the cashier has typed
  //   referralPreview    = validated result from the RPC (null = not validated)
  //   referralChecking   = waiting on the RPC
  //   referralError      = message to show if the code is invalid/at-cap/etc
  type ReferralPreview = {
    referrer_id: string
    referrer_name: string
    benefit_shape: 'discount_pct' | 'discount_tzs' | 'free_item'
    benefit_amount?: number
    benefit_percent?: number
    free_product_id?: string
    free_product_name?: string
    uses_remaining: number
  }
  const [referralCodeInput, setReferralCodeInput] = useState('')
  const [referralPreview, setReferralPreview] = useState<ReferralPreview | null>(null)
  const [referralChecking, setReferralChecking] = useState(false)
  const [referralError, setReferralError] = useState<string | null>(null)

  // Products
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([])
  const [filterCat, setFilterCat] = useState('all')
  const [lines, setLines] = useState<SaleLine[]>([{ productId: '', name: '', qty: 1, price: 0, discountPct: 0, amount: 0 }])
  const { groups, catsByGroup } = useCategories()

  // Delivery
  const [showDelivery, setShowDelivery] = useState(false)
  const [townDelivery, setTownDelivery] = useState('')
  const [upcountryShipping, setUpcountryShipping] = useState('')
  const [deliveryAccountId, setDeliveryAccountId] = useState('')

  // Payment
  const [isPOD, setIsPOD] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<string>('cash')
  const [isSplit, setIsSplit] = useState(false)
  const [splitLines, setSplitLines] = useState<SplitLine[]>([])
  const [tendered, setTendered] = useState('')
  const [paymentRef, setPaymentRef] = useState('')
  const [accountMap, setAccountMap] = useState<Record<string, string>>({})

  // Dashboard
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0, avgSale: 0, crownPts: 0 })
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [paymentSplit, setPaymentSplit] = useState<Record<string, number>>({})
  const [invSettings, setInvSettings] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [waConfig, setWaConfig] = useState<WAConfig | null>(null)
  const [locations, setLocations] = useState<{id:string;code:string;name:string}[]>([])
  const [locationCode, setLocationCode] = useState('1001')
  const [sending, setSending] = useState(false)
  const [waSent, setWaSent] = useState(false)
  const [lastVoucher, setLastVoucher] = useState<any>(null)
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const { getCache, setCache, isStale } = useDataCache()

  // ─── Draft persistence ──────────────────────────────────────────────────
  type CashSaleDraft = {
    waInput: string
    newCustName: string
    selectedCust: DBCustomer | null
    lines: SaleLine[]
    selectedMethod: string
    isSplit: boolean
    splitLines: SplitLine[]
    tendered: string
    paymentRef: string
    isPOD: boolean
    showDelivery: boolean
    townDelivery: string
    upcountryShipping: string
    locationCode: string
  }
  const {
    availableDraft, draftAgeMs,
    saveDraft, clearDraft, acknowledgeResume, discardDraft,
  } = useVoucherDraft<CashSaleDraft>('cash-sale', !!editVoucherId)

  const resumeDraft = () => {
    if (!availableDraft) return
    setWaInput(availableDraft.waInput)
    setNewCustName(availableDraft.newCustName)
    setSelectedCust(availableDraft.selectedCust)
    setLines(availableDraft.lines)
    setSelectedMethod(availableDraft.selectedMethod)
    setIsSplit(availableDraft.isSplit)
    setSplitLines(availableDraft.splitLines)
    setTendered(availableDraft.tendered)
    setPaymentRef(availableDraft.paymentRef)
    setIsPOD(availableDraft.isPOD)
    setShowDelivery(availableDraft.showDelivery)
    setTownDelivery(availableDraft.townDelivery)
    setUpcountryShipping(availableDraft.upcountryShipping)
    setLocationCode(availableDraft.locationCode)
    acknowledgeResume()
    setShowModal(true)  // auto-open the modal so the user sees the restored form
  }

  useEffect(() => {
    const loadInitialData = async () => {
      setPageLoading(true)

      // Use cached products/accounts/settings if fresh (< 60s old)
      const cachedProducts = !isStale('cs_products') ? getCache('cs_products') : null
      const cachedAcctMap = !isStale('cs_acctmap') ? getCache('cs_acctmap') : null
      const cachedLocations = !isStale('cs_locations') ? getCache('cs_locations') : null

      if (cachedProducts) setDbProducts(cachedProducts as DBProduct[])
      if (cachedAcctMap) {
        const map: Record<string, string> = {}
        ;(cachedAcctMap as any[]).forEach(a => { map[a.code] = a.id })
        setAccountMap(map)
      }
      if (cachedLocations) {
        const locs = cachedLocations as {id:string;code:string;name:string}[]
        setLocations(locs)
        // Prefer the user's assigned default location over the first one in
        // the list. Previously this hardcoded locs[0], which meant cashiers
        // logged in from a satellite branch were silently defaulted to the
        // main warehouse and could deduct stock from the wrong bin if they
        // didn't notice the picker.
        const preferred = userLoc.defaultLocationCode && locs.find(l => l.code === userLoc.defaultLocationCode)
          ? userLoc.defaultLocationCode
          : locs[0]?.code
        if (preferred) setLocationCode(preferred)
      }

      await Promise.all([
        cachedProducts ? Promise.resolve() : loadProducts(),
        loadDeliveryAccount(),
        cachedAcctMap ? Promise.resolve() : loadAccountMap(),
        loadReceiptSettings(),
        loadWAConfig().then(setWaConfig),
        cachedLocations ? Promise.resolve() : supabase.from('stock_locations').select('id,code,name').eq('is_active',true).order('code').then(({data})=>{
          if(data) {
            setLocations(data); setCache('cs_locations', data)
            const preferred = userLoc.defaultLocationCode && data.find((l: any) => l.code === userLoc.defaultLocationCode)
              ? userLoc.defaultLocationCode
              : data[0]?.code
            if (preferred) setLocationCode(preferred)
          }
        }),
        supabase.from('system_settings').select('value').eq('key','inventory_settings').single().then(({data})=>{ if(data?.value) try { setInvSettings(JSON.parse(data.value)) } catch {} }),
        loadTodayStats(),
        loadRecentSales(),
      ])
      setPageLoading(false)
    }
    loadInitialData()
    
    // Check if we're in edit mode
    if (editVoucherId) {
      loadExistingVoucher(editVoucherId)
    } else {
      loadNextRef()
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editVoucherId])

  // Auto-save draft. Debounced internally by the hook. Skip while loading
  // or in edit mode, and skip when form is truly empty (no customer, no
  // meaningful lines).
  useEffect(() => {
    if (editVoucherId) return
    if (pageLoading) return
    const hasAnything =
      !!selectedCust ||
      waInput.trim().length > 0 ||
      newCustName.trim().length > 0 ||
      lines.some(l => l.productId || l.qty !== 1 || l.price > 0)
    if (!hasAnything) return
    saveDraft({
      waInput, newCustName, selectedCust, lines,
      selectedMethod, isSplit, splitLines, tendered, paymentRef, isPOD,
      showDelivery, townDelivery, upcountryShipping, locationCode,
    })
  }, [
    waInput, newCustName, selectedCust, lines,
    selectedMethod, isSplit, splitLines, tendered, paymentRef, isPOD,
    showDelivery, townDelivery, upcountryShipping, locationCode,
    editVoucherId, pageLoading, saveDraft,
  ])

  // Load existing voucher for editing
  const loadExistingVoucher = async (voucherId: string) => {
    const { data: voucher } = await supabase
      .from('vouchers')
      .select(`
        *, 
        customers (id, name, whatsapp, crown_points, pregnancy_stage, last_purchase_date, last_purchase_amount, balance),
        voucher_lines (id, product_id, qty, unit_price, unit_cost, subtotal, total, products (id, sku, name, category, cost_price, selling_price, qty_on_hand))
      `)
      .eq('id', voucherId)
      .single()
    
    if (voucher) {
      setIsEditMode(true)
      setEditVoucherData(voucher)
      setAutoRef(voucher.ref)
      
      // Set customer
      if (voucher.customers) {
        setSelectedCust(voucher.customers as DBCustomer)
        setWaInput(voucher.customers.whatsapp || '')
        setNewCustName(voucher.customers.name || '')
      }
      
      // Set lines — recover discountPct from the stored gross/net split.
      // For lines saved before this feature shipped, subtotal === total
      // and discountPct comes back as 0, which is correct.
      const editLines: SaleLine[] = (voucher.voucher_lines || []).map((l: any) => {
        const gross = Number(l.subtotal ?? (l.qty * l.unit_price))
        const net = Number(l.total ?? gross)
        const discountPct = gross > 0 && net < gross
          ? Math.round(((gross - net) / gross) * 100 * 100) / 100   // keep 2 decimals
          : 0
        return {
          productId: l.product_id,
          name: l.products?.name || '',
          qty: l.qty,
          price: l.unit_price,
          discountPct,
          amount: net,
        }
      })
      if (editLines.length > 0) setLines(editLines)
      
      // Set payment method
      const pm = voucher.payment_method || 'Cash'
      const methodId = pm.toLowerCase().includes('cash') ? 'cash' :
                       pm.toLowerCase().includes('m-pesa') ? 'mpesa' :
                       pm.toLowerCase().includes('mixx') ? 'mixx' :
                       pm.toLowerCase().includes('nmb') ? 'nmb' :
                       pm.toLowerCase().includes('crdb') ? 'crdb' :
                       pm.toLowerCase().includes('pos') ? 'pos' : 'cash'
      setSelectedMethod(methodId)
      
      // Set POD status
      setIsPOD(voucher.status === 'draft')
      
      // Auto-open modal
      setShowModal(true)
    }
  }

  const handleClickOutside = (e: MouseEvent) => {
    if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false)
  }

  const loadAccountMap = async () => {
    const codes = PAYMENT_METHODS.map(m => m.accountCode)
    const { data } = await supabase.from('accounts').select('id, code').in('code', [...new Set(codes)])
    if (data) {
      const map: Record<string, string> = {}
      data.forEach(a => { map[a.code] = a.id })
      setAccountMap(map)
      setCache('cs_acctmap', data)
    }
  }

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, sku, name, category, cost_price, selling_price, qty_on_hand').eq('is_active', true).order('name')
    if (data) { setDbProducts(data); setCache('cs_products', data) }
  }

  const loadReceiptSettings = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'receipt_template').single()
    if (data?.value) {
      try { setReceiptSettings(JSON.parse(data.value)) } catch {}
    }
  }

  const loadDeliveryAccount = async () => {
    const { data } = await supabase.from('accounts').select('id').eq('code', '2085').single()
    if (data) setDeliveryAccountId(data.id)
  }

  const loadTodayStats = async () => {
    const { data } = await supabase.from('vouchers').select('total_amount, payment_method').eq('type', 'cash_sale').eq('posting_date', today())
    if (data && data.length > 0) {
      const total = data.reduce((s, v) => s + (v.total_amount || 0), 0)
      const split: Record<string, number> = {}
      data.forEach(v => {
        const m = v.payment_method || 'Cash'
        split[m] = (split[m] || 0) + (v.total_amount || 0)
      })
      setTodayStats({ count: data.length, total, avgSale: Math.round(total / data.length), crownPts: Math.round(total / 1000) })
      setPaymentSplit(split)
    }
  }

  const loadRecentSales = async () => {
    const { data } = await supabase.from('vouchers')
      .select('ref, description, total_amount, payment_method, posting_date, status, customers(name, whatsapp)')
      .eq('type', 'cash_sale').order('created_at', { ascending: false }).limit(10)
    if (data) setRecentSales(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('cash_sale')
    setAutoRef(ref)
  }

  const searchCustomer = async (val: string) => {
    setWaInput(val)
    const cleaned = val.replace(/[\s+\-()]/g, '')
    if (cleaned.length < 3) { setCustResults([]); setShowDropdown(false); setSelectedCust(null); return }
    const { data } = await supabase.from('customers').select('*').or(`whatsapp.ilike.%${cleaned}%,name.ilike.%${val}%`).limit(6)
    if (data && data.length > 0) { setCustResults(data); setShowDropdown(true) }
    else { setCustResults([]); setShowDropdown(false) }
    setSelectedCust(null)
  }

  const selectCustomer = async (c: DBCustomer) => {
    setSelectedCust(c); setWaInput(c.whatsapp); setNewCustName(c.name)
    setShowDropdown(false); setCustResults([])
    // Load context fields for the read-only summary panel
    const { data } = await supabase
      .from('customers')
      .select('ttc_duration, edd, delivery_date, context_status, internal_notes')
      .eq('id', c.id)
      .maybeSingle()
    setExistingContext(data || null)
    setPendingContext({})
    // If a referral code was already typed, re-validate against the newly
    // selected referee (they may now fail the new-customer check)
    if (referralCodeInput.trim()) {
      validateReferralCode(referralCodeInput, c.id)
    }
  }

  // Validate a referral code via the apply_referral_code RPC. Updates the
  // preview state so the totals panel can show the benefit. Called on input
  // blur, Enter key, or when a customer is selected after a code was typed.
  const validateReferralCode = async (rawCode: string, refereeId: string | null) => {
    const code = rawCode.trim()
    if (!code) {
      setReferralPreview(null); setReferralError(null); return
    }
    setReferralChecking(true); setReferralError(null)
    const { data, error } = await supabase.rpc('apply_referral_code', {
      p_code: code,
      p_referee_id: refereeId,
      p_sale_subtotal: subtotal,  // current sale subtotal at validation time
    })
    setReferralChecking(false)
    if (error) {
      setReferralPreview(null)
      setReferralError(error.message || 'Validation failed')
      return
    }
    const result = data as any
    if (!result?.ok) {
      setReferralPreview(null)
      setReferralError(result?.error || 'Code rejected')
      return
    }
    setReferralPreview({
      referrer_id:       result.referrer_id,
      referrer_name:     result.referrer_name,
      benefit_shape:     result.benefit_shape,
      benefit_amount:    result.benefit_amount,
      benefit_percent:   result.benefit_percent,
      free_product_id:   result.free_product_id,
      free_product_name: result.free_product_name,
      uses_remaining:    result.uses_remaining,
    })
    setReferralError(null)
  }

  const clearReferralCode = () => {
    setReferralCodeInput(''); setReferralPreview(null); setReferralError(null)
  }

  const updateLine = (i: number, field: keyof SaleLine, val: string | number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val }
    if (field === 'productId') {
      const p = dbProducts.find(p => p.id === val)
      if (p) {
        nl[i].name = p.name
        nl[i].price = p.selling_price
        // Reset discount when picking a new product so we don't silently
        // carry over a discount the cashier set for the previous item.
        nl[i].discountPct = 0
      }
    }
    // Recompute amount = qty × price × (1 − discountPct / 100) on every relevant edit
    if (field === 'qty' || field === 'price' || field === 'discountPct' || field === 'productId') {
      const qty = nl[i].qty || 0
      const price = nl[i].price || 0
      const dp = Math.max(0, Math.min(100, nl[i].discountPct || 0))
      nl[i].discountPct = dp
      nl[i].amount = qty * price * (1 - dp / 100)
    }
    setLines(nl)
  }

  // Totals
  // grossSubtotal = sum of (qty × price) BEFORE per-line discounts.
  // subtotal      = sum of line.amount (already net of per-line discount).
  // discountGiven = grossSubtotal − subtotal. Surfaced in the totals panel
  //                 so the cashier can see at a glance what discount they've
  //                 applied across the whole sale.
  const grossSubtotal = lines.reduce((s, l) => s + (l.qty * l.price), 0)
  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const discountGiven = Math.max(0, grossSubtotal - subtotal)
  const deliveryTotal = (parseFloat(townDelivery) || 0) + (parseFloat(upcountryShipping) || 0)

  // Referral discount (% or flat) reduces the cash collected. Free-item shape
  // doesn't reduce the total — the free item rides as a separate line at zero
  // price, with COGS still hitting normally (handled in cashSalePost).
  //
  // IMPORTANT: We compute the discount LIVE from the current subtotal, NOT
  // from referralPreview.benefit_amount. The benefit_amount in the preview
  // was computed at validation time, which is often before products have
  // been added (subtotal=0 → discount=0). Recomputing here keeps the totals
  // panel accurate as the cashier adds/removes items after applying the code.
  // For 'discount_pct' the percent is the source of truth; for 'discount_tzs'
  // the flat amount is, clamped to never exceed the bill.
  let referralDiscount = 0
  if (referralPreview) {
    if (referralPreview.benefit_shape === 'discount_pct') {
      const pct = referralPreview.benefit_percent || 0
      referralDiscount = Math.round((subtotal + deliveryTotal) * pct / 100)
    } else if (referralPreview.benefit_shape === 'discount_tzs') {
      // benefit_amount is the configured flat TZS; clamp to bill so we
      // never go negative.
      referralDiscount = Math.min(
        referralPreview.benefit_amount || 0,
        subtotal + deliveryTotal
      )
    }
    // 'free_item' contributes no cash discount; freebie is added in cashSalePost.
  }
  const total = subtotal + deliveryTotal - referralDiscount
  const crownPoints = Math.round(total / 1000)

  // Payment amounts
  const currentMethod = PAYMENT_METHODS.find(m => m.id === selectedMethod)!
  const totalSplitPaid = splitLines.reduce((s, l) => s + l.amount, 0)
  const tenderedNum = parseFloat(tendered) || 0
  const change = isSplit ? totalSplitPaid - total : tenderedNum - total

  const margin = lines.reduce((s, l) => {
    const p = dbProducts.find(p => p.id === l.productId)
    return s + (p ? (l.price - p.cost_price) * l.qty : 0)
  }, 0)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const resetForm = () => {
    setWaInput(''); setNewCustName(''); setSelectedCust(null)
    setLines([{ productId: '', name: '', qty: 1, price: 0, discountPct: 0, amount: 0 }])
    setSelectedMethod('cash'); setIsSplit(false); setSplitLines([])
    setTendered(''); setPaymentRef(''); setIsPOD(false)
    setTownDelivery(''); setUpcountryShipping(''); setShowDelivery(false)
    setIsEditMode(false); setEditVoucherData(null); setAppliedBundle(null)
    setReferralCodeInput(''); setReferralPreview(null); setReferralError(null)
    if (onClearEdit) onClearEdit()
  }

  const openNewSale = () => { resetForm(); loadNextRef(); setShowModal(true) }

  // Update existing voucher (edit mode)
  const updateVoucher = async () => {
    if (!editVoucherData) return
    setPosting(true)
    const result = await updateCashSale({
      editVoucherData, newCustName, waInput, lines, dbProducts, selectedCust,
      isPOD, autoReceipt, selectedMethod, isSplit, splitLines, paymentRef,
      townDelivery, upcountryShipping, currentMethod,
      accountMap, deliveryAccountId, totalSplitPaid,
      userName: user?.full_name || 'Unknown',
      userId: user?.id,
      customerContext: pendingContext,
    })
    if (result.success) {
      showToast(`${editVoucherData.ref} updated successfully`)
      setShowModal(false)
      resetForm()
      loadTodayStats(); loadRecentSales(); loadProducts()
    } else {
      showToast(result.error || 'Update failed', 'error')
    }
    setPosting(false)
  }

  const addSplitLine = () => {
    const nextMethod = PAYMENT_METHODS.find(m => m.id !== selectedMethod) || PAYMENT_METHODS[1]
    setSplitLines([...splitLines, { methodId: nextMethod.id, accountId: accountMap[nextMethod.accountCode] || '', amount: 0, ref: '' }])
    setIsSplit(true)
  }

  const updateSplitLine = (i: number, field: keyof SplitLine, val: string | number) => {
    const nl = [...splitLines]; nl[i] = { ...nl[i], [field]: val }
    if (field === 'methodId') {
      const m = PAYMENT_METHODS.find(pm => pm.id === val)
      if (m) nl[i].accountId = accountMap[m.accountCode] || ''
    }
    setSplitLines(nl)
  }

  const post = async () => {
    // Referral safety guard. If the cashier typed a code but it was rejected
    // (red error chip showing, no preview), don't silently swallow it. Make
    // them explicitly confirm they want to post without any referral
    // applied. This prevents the failure mode where the customer was
    // promised a discount that never made it onto the receipt.
    if (referralCodeInput.trim() && !referralPreview && referralError) {
      const ok = window.confirm(
        `Referral code "${referralCodeInput.trim()}" is not valid:\n\n${referralError}\n\nPost the sale WITHOUT applying any referral?`
      )
      if (!ok) return
    }
    // Don't allow posting while a referral validation is in flight — the
    // cashier might hit Post a split-second before the preview lands.
    if (referralChecking) {
      showToast('Wait — still checking referral code', 'error')
      return
    }
    // Also guard the case where a code was typed but never validated
    // (no preview AND no error AND not currently checking). Could happen if
    // the cashier never blurred or pressed Enter on the code field.
    if (referralCodeInput.trim() && !referralPreview && !referralError) {
      const ok = window.confirm(
        `Referral code "${referralCodeInput.trim()}" was entered but never confirmed.\n\nPost the sale WITHOUT applying any referral?`
      )
      if (!ok) return
    }

    // Wrong-location safety check. If the cashier is about to post from a
    // location that ISN'T their assigned default, force an explicit confirm
    // before the sale lands. The picker shows all locations side-by-side and
    // it's easy to miss-tap or simply leave the default selected without
    // realising they're in a different branch. This makes "wrong location"
    // a deliberate two-step action instead of a silent slip.
    if (userLoc.defaultLocationCode && locationCode !== userLoc.defaultLocationCode && locations.length > 1) {
      const chosen = locations.find(l => l.code === locationCode)
      const myDefault = locations.find(l => l.code === userLoc.defaultLocationCode)
      const ok = window.confirm(
        `You are about to deduct stock from ${chosen?.code || locationCode} (${chosen?.name || '?'}).\n\n` +
        `Your assigned location is ${myDefault?.code || userLoc.defaultLocationCode} (${myDefault?.name || '?'}).\n\n` +
        `Continue posting from ${chosen?.code || locationCode}?`
      )
      if (!ok) return
    }

    setPosting(true)
    const result = await postCashSale({
      newCustName, waInput, lines, dbProducts, selectedCust,
      isPOD, autoReceipt, selectedMethod, isSplit, splitLines, paymentRef, accountMap,
      townDelivery, upcountryShipping, deliveryAccountId,
      locationCode, locations, invSettings,
      userName: user?.full_name || 'Unknown',
      userId: user?.id,
      appliedBundle, subtotal, total, crownPoints, deliveryTotal, totalSplitPaid,
      customerContext: pendingContext,
      // Referral (optional). Only sent if the cashier validated a code and
      // a preview is currently active. cashSalePost re-validates at post time.
      referralCode:   referralPreview ? referralCodeInput.trim().toUpperCase() : null,
      referralBenefit: referralPreview,
    })

    if (!result.success) {
      showToast(result.error || 'Something went wrong', 'error')
      setPosting(false)
      return
    }

    showToast(`${result.ref} posted · ${result.isPOD ? 'POD — receipt pending' : `${currentMethod.label} · ${crownPoints} Crown pts`}`)
    clearDraft()  // posted successfully — no draft to recover

    if (!result.isPOD && result.receiptData) {
      setLastVoucher(result.receiptData)
      setShowModal(false)
      setShowReceipt(true)
    } else {
      setShowModal(false); resetForm()
    }
    loadTodayStats(); loadRecentSales(); loadProducts()
    setPosting(false)
  }

  // ── PAYMENT BUTTON COMPONENT ──────────────────
  // ── SVG icons per payment method ─────────────
  const PayIcon = ({ id, color }: { id: string; color: string }) => {
    const s = { width: 22, height: 22 }
    if (id === 'cash') return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="6" width="20" height="12" rx="2"/>
        <circle cx="12" cy="12" r="3"/>
        <path d="M6 12h.01M18 12h.01"/>
      </svg>
    )
    if (id === 'mpesa') return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <rect x="7" y="2" width="10" height="18" rx="2"/>
        <path d="M10 18h4"/>
        <path d="M9 6l3 3 3-3"/>
        <path d="M12 9v5"/>
      </svg>
    )
    if (id === 'mixx') return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <rect x="7" y="2" width="10" height="18" rx="2"/>
        <path d="M10 18h4"/>
        <path d="M9 7h6M9 11h6M9 15h4"/>
      </svg>
    )
    if (id === 'nmb') return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M2 10h20"/>
        <path d="M6 15h4M14 15h4"/>
      </svg>
    )
    if (id === 'crdb') return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/>
        <path d="M3 9l9-5 9 5"/>
        <path d="M12 12v5"/>
      </svg>
    )
    // pos
    return (
      <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M2 10h20"/>
        <path d="M6 15h2M10 15h6"/>
        <rect x="6" y="12.5" width="2" height="1.5" rx=".5" fill={color}/>
      </svg>
    )
  }

  const PayBtn = ({ method }: { method: PaymentMethod }) => {
    const isSelected = selectedMethod === method.id
    return (
      <div onClick={() => { setSelectedMethod(method.id); setIsSplit(false); setSplitLines([]) }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: isSelected ? `${method.color}18` : 'var(--surface2)', border: `2px solid ${isSelected ? method.color : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', transition: 'all .15s' }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: method.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <PayIcon id={method.id} color={method.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? method.color : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{method.label}</div>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{method.sublabel}</div>
        </div>
        {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: method.color, flexShrink: 0 }}></div>}
      </div>
    )
  }

  // ── RENDER ────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(212,135,74,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}></div>
          <div>
            <div className="page-title">Cash Sale</div>
            <div className="page-sub">Counter sales · WhatsApp ID required · Auto-posts journal + Crown points</div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={loadRecentSales}>Refresh</button>
          <button className="btn btn-primary" onClick={openNewSale} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 700 }}>+ New Cash Sale</button>
        </div>
      </div>

      {/* Draft resume banner — auto-opens the sale modal if user clicks Resume */}
      {availableDraft && draftAgeMs !== null && (
        <DraftBanner
          draftAgeMs={draftAgeMs}
          onResume={resumeDraft}
          onDiscard={discardDraft}
        />
      )}

      {/* SHORTCUTS */}
      {onNav && (
        <div className="shortcut-bar">
          {[
            { icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', label: 'Inventory', page: 'inventory' as Page },
            { icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75', label: 'Customers', page: 'customers' as Page },
            { icon: 'M18 20V10M12 20V4M6 20v-6', label: 'Sales Register', page: 'sales-register' as Page },
            { icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', label: 'Sales Day Book', page: 'sales-day-book' as Page },
            { icon: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15', label: 'Sales Return', page: 'sales-return' as Page },
            { icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8', label: 'Sales Invoice', page: 'sales-invoice' as Page },
          ].map((s, i) => (
            <button key={i} className="shortcut-btn" onClick={() => onNav(s.page)}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d={s.icon}/></svg>
              {s.label}
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      )}

      {/* TODAY STATS */}
      {pageLoading ? (
        <div style={{ marginBottom: 20 }}>
          <div className="grid g4" style={{ marginBottom: 20 }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="stat-card" style={{ opacity: 0.4 }}>
                <div className="stat-label" style={{ background: 'var(--surface3)', width: 80, height: 10, borderRadius: 4 }}></div>
                <div className="stat-value" style={{ background: 'var(--surface3)', width: 60, height: 24, borderRadius: 4, marginTop: 8 }}></div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: 13 }}>Loading today's data...</div>
        </div>
      ) : (
      <>
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat-card green"><div className="stat-label">Sales Today</div><div className="stat-value">{todayStats.count}</div><div className="stat-change up">↑ Transactions</div></div>
        <div className="stat-card amber"><div className="stat-label">Revenue Today</div><div className="stat-value">{todayStats.total >= 1000000 ? (todayStats.total/1000000).toFixed(2)+'M' : (todayStats.total/1000).toFixed(0)+'K'}</div><div className="stat-change up">↑ TZS</div></div>
        <div className="stat-card blue"><div className="stat-label">Avg Sale</div><div className="stat-value">{todayStats.avgSale >= 1000 ? (todayStats.avgSale/1000).toFixed(0)+'K' : todayStats.avgSale || '—'}</div><div className="stat-change up">↑ TZS</div></div>
        <div className="stat-card yellow"><div className="stat-label">Crown Pts Awarded</div><div className="stat-value">{todayStats.crownPts.toLocaleString()}</div><div className="stat-change up">↑ Today</div></div>
      </div>

      <div className="grid g32" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="card-title">Today's Sales — {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              <div className="card-sub">{todayStats.count} transactions · {tzs(todayStats.total)} total</div>
            </div>
            <button className="btn btn-ghost btn-sm">Full Register →</button>
          </div>
          {recentSales.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}></div>
              <div style={{ fontSize: 14 }}>No sales yet today</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Click + New Cash Sale to start</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>Payment</th><th className="td-right">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {recentSales.map((s, i) => (
                    <tr key={i}>
                      <td>
                        <div className="td-bold">{(s.customers as any)?.name || s.description}</div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{s.ref} · {(s.customers as any)?.whatsapp}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{s.payment_method?.includes('M-Pesa') ? '' : s.payment_method?.includes('Cash') ? '' : s.payment_method?.includes('POS') ? '' : ''}</span>
                          <span style={{ fontSize: 12 }}>{s.payment_method}</span>
                        </div>
                      </td>
                      <td className="td-right td-mono td-green" style={{ fontWeight: 600 }}>{s.total_amount?.toLocaleString()}</td>
                      <td><span className={`pill ${s.status === 'posted' ? 'pill-green' : 'pill-yellow'}`} style={{ fontSize: 10 }}>{s.status === 'draft' ? 'POD' : 'Posted '}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ textAlign: 'center', padding: 28, cursor: 'pointer', border: '2px dashed var(--accent)' }} onClick={openNewSale}>
            <div style={{ fontSize: 40, marginBottom: 10 }}></div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>New Cash Sale</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>WhatsApp · Products · Payment · Crown points</div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14, fontWeight: 700 }}>+ Start New Sale</button>
          </div>

          {Object.keys(paymentSplit).length > 0 && (
            <div className="card card-sm">
              <div className="card-title" style={{ marginBottom: 12 }}>Payment Split — Today</div>
              {Object.entries(paymentSplit).map(([method, amount], i) => {
                const pct = todayStats.total > 0 ? (amount / todayStats.total) * 100 : 0
                const pm = PAYMENT_METHODS.find(m => m.label === method)
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text3)' }}>● {method}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(amount)}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pm?.color || 'var(--accent)', borderRadius: 2 }}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* ── MODAL ──────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, overflowY: 'auto', padding: '20px 0' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '94%', maxWidth: 920, margin: 'auto' }}>

            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>{isEditMode ? '✏️' : ''}</span>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800 }}>{isEditMode ? 'Edit Cash Sale' : 'New Cash Sale'}</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{isEditMode ? 'Update voucher · Stock adjusted' : 'Posts journal · Crown points · WhatsApp receipt → customer'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: isEditMode ? 'var(--yellow-dim)' : 'var(--surface2)', border: `1px solid ${isEditMode ? 'var(--yellow)' : 'var(--border)'}`, borderRadius: 8, padding: '5px 12px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{isEditMode ? 'EDITING ' : 'SALE NO. '}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: isEditMode ? 'var(--yellow)' : 'var(--accent)' }}>{autoRef}</span>
                  {!isEditMode && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 6 }}>Auto · Read only</span>}
                </div>
                <button onClick={() => { setShowModal(false); if (isEditMode) resetForm() }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--text3)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {/* LEFT — Customer, Products, Delivery */}
              <div style={{ padding: 22, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 22 }}>

                {/* STEP 1 — CUSTOMER */}
                <div>
                  <div className="step-header" style={{ marginBottom: 12 }}><div className="step-num">1</div><div className="step-title">CUSTOMER IDENTITY</div></div>
                  <div ref={searchRef} style={{ position: 'relative' }}>
                    <div style={{ display: 'flex' }}>
                      <div style={{ background: 'var(--surface3)', border: '1px solid var(--border)', borderRight: 'none', borderRadius: 'var(--r) 0 0 var(--r)', padding: '0 10px', display: 'flex', alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)', whiteSpace: 'nowrap', flexShrink: 0 }}>+255</div>
                      <input className="form-input" style={{ borderRadius: '0 var(--r) var(--r) 0', borderColor: selectedCust ? 'var(--green)' : 'var(--border)' }}
                        placeholder="7XX XXX XXX — type to search existing customers"
                        value={waInput} onChange={e => searchCustomer(e.target.value)}
                        onFocus={() => custResults.length > 0 && setShowDropdown(true)} />
                    </div>

                    {showDropdown && custResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--r)', zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,.5)', overflow: 'hidden' }}>
                        {custResults.map((c, i) => (
                          <div key={i} onClick={() => selectCustomer(c)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{c.whatsapp} · {c.pregnancy_stage || '—'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 11, color: 'var(--yellow)' }}>{(c.crown_points || 0).toLocaleString()} pts</div>
                              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{tzs(c.balance || 0)} LFV</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedCust ? (
                    <div style={{ background: 'var(--surface2)', border: '1px solid var(--green)', borderRadius: 'var(--r)', padding: 12, marginTop: 8 }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}> Existing Customer Found</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>NAME</div><div style={{ fontSize: 13, fontWeight: 600 }}>{selectedCust.name}</div></div>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>STAGE</div><div style={{ fontSize: 12 }}>{selectedCust.pregnancy_stage || '—'}</div></div>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>LAST PURCHASE</div><div style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{selectedCust.last_purchase_date || '—'}</div></div>
                        <div><div style={{ fontSize: 9, color: 'var(--text3)' }}>LIFETIME VALUE</div><div style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{tzs(selectedCust.balance || 0)}</div></div>
                      </div>
                      <div style={{ background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Crown Points Balance</span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)', fontSize: 13 }}>{(selectedCust.crown_points || 0).toLocaleString()} pts</span>
                      </div>
                    </div>
                  ) : (
                    <input className="form-input" style={{ marginTop: 8 }} placeholder="Customer name (new customer)" value={newCustName} onChange={e => setNewCustName(e.target.value)} />
                  )}

                  {/* Customer Context — optional pregnancy/baby/TTC capture.
                      Skipping is fine; missing customers flow to the back-office queue. */}
                  {(newCustName.trim() || selectedCust) && (
                    <CustomerContextSection
                      existing={existingContext}
                      onChange={setPendingContext}
                    />
                  )}

                  {/* Referral code — optional. Cashier types the code from
                      the new mama's friend; the system validates against
                      apply_referral_code and shows a benefit preview. */}
                  {(newCustName.trim() || selectedCust) && (
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
                        Referral code (optional)
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          className="form-input"
                          style={{
                            flex: 1,
                            fontFamily: 'var(--mono)',
                            textTransform: 'uppercase',
                            borderColor: referralPreview
                              ? 'var(--green)'
                              : referralError
                                ? '#ef4444'
                                : 'var(--border)',
                          }}
                          placeholder="e.g. MAL-XXXXXX"
                          value={referralCodeInput}
                          onChange={e => {
                            setReferralCodeInput(e.target.value)
                            // Clear stale preview the moment the input changes
                            if (referralPreview || referralError) {
                              setReferralPreview(null); setReferralError(null)
                            }
                          }}
                          onBlur={() => validateReferralCode(referralCodeInput, selectedCust?.id || null)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              validateReferralCode(referralCodeInput, selectedCust?.id || null)
                            }
                          }}
                          disabled={referralChecking}
                        />
                        {referralPreview && (
                          <button
                            type="button"
                            onClick={clearReferralCode}
                            style={{
                              padding: '0 12px', fontSize: 11, background: 'var(--surface2)',
                              border: '1px solid var(--border)', borderRadius: 6,
                              color: 'var(--text3)', cursor: 'pointer',
                            }}
                            title="Clear referral code"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {referralChecking && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                          Checking code…
                        </div>
                      )}

                      {referralPreview && !referralChecking && (
                        <div style={{
                          marginTop: 8, padding: '10px 12px',
                          background: 'rgba(94,168,162,.10)',
                          border: '1px solid rgba(94,168,162,.4)',
                          borderRadius: 6, fontSize: 12,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <div>
                              <span style={{ color: 'var(--text3)', fontSize: 10 }}>Referred by</span>
                              <div style={{ fontWeight: 700 }}>{referralPreview.referrer_name}</div>
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                              {referralPreview.uses_remaining} uses left
                            </div>
                          </div>
                          {referralPreview.benefit_shape === 'discount_pct' && (
                            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>
                              −{referralPreview.benefit_percent}% ({tzs(referralDiscount)} off)
                            </div>
                          )}
                          {referralPreview.benefit_shape === 'discount_tzs' && (
                            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>
                              −{tzs(referralDiscount)} off
                            </div>
                          )}
                          {referralPreview.benefit_shape === 'free_item' && (
                            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>
                              + Free: {referralPreview.free_product_name}
                            </div>
                          )}
                        </div>
                      )}

                      {referralError && !referralChecking && (
                        <div style={{
                          marginTop: 8, padding: '8px 12px',
                          background: 'rgba(239,68,68,.10)',
                          border: '1px solid rgba(239,68,68,.4)',
                          borderRadius: 6, fontSize: 11, color: '#ef4444',
                        }}>
                          {referralError}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* STEP 2 — LOCATION */}
                {locations.length > 1 && (
                  <div>
                    <div className="step-header" style={{ marginBottom: 10 }}>
                      <div className="step-num">2</div>
                      <div className="step-title">SELL FROM LOCATION</div>
                      {/* Banner showing the currently active location at a glance,
                          so the cashier can see in the corner of their eye whether
                          they're posting from the right bin. */}
                      {(() => {
                        const active = locations.find(l => l.code === locationCode)
                        const isUserDefault = userLoc.defaultLocationCode === locationCode
                        return active ? (
                          <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: isUserDefault ? 'var(--accent)' : 'var(--yellow, #f59e0b)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {!isUserDefault && <span>⚠</span>}
                            <span style={{ fontFamily: 'var(--mono)' }}>{active.code}</span>
                            <span>· {active.name}</span>
                            {!isUserDefault && <span style={{ fontWeight: 500, fontSize: 10 }}>(not your default)</span>}
                          </div>
                        ) : null
                      })()}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {locations.map(loc => {
                        const isActive = locationCode === loc.code
                        return (
                          <div key={loc.id} onClick={() => setLocationCode(loc.code)}
                            style={{
                              flex: 1,
                              padding: '12px 14px',
                              border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                              borderRadius: 10,
                              cursor: 'pointer',
                              background: isActive ? 'var(--accent-dim)' : 'var(--surface2)',
                              transition: 'all .15s',
                              boxShadow: isActive ? '0 0 0 3px var(--accent-dim)' : 'none',
                            }}>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 800, color: isActive ? 'var(--accent)' : 'var(--text3)' }}>{loc.code}{isActive && ' ✓'}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{loc.name}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* STEP 3 (was 2) — PRODUCTS */}
                <div>
                  <div className="step-header" style={{ marginBottom: 8 }}><div className="step-num">{locations.length > 1 ? '3' : '2'}</div><div className="step-title">PRODUCTS SOLD</div></div>
                  {appliedBundle && (
                    <div style={{ background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,.3)', borderRadius: 8, padding: '6px 12px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>Bundle applied: {appliedBundle.name} · Save {tzs(appliedBundle.individual_total - appliedBundle.bundle_price)}</span>
                      <button onClick={() => { setAppliedBundle(null); setLines([{ productId: '', name: '', qty: 1, price: 0, discountPct: 0, amount: 0 }]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 10, textDecoration: 'underline' }}>Clear</button>
                    </div>
                  )}
                  {/* Category filter strip */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                    <button onClick={() => setFilterCat('all')} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, border: `1px solid ${filterCat === 'all' ? 'var(--accent)' : 'var(--border)'}`, background: filterCat === 'all' ? 'var(--accent)' : 'transparent', color: filterCat === 'all' ? '#fff' : 'var(--text3)', cursor: 'pointer', fontWeight: 600 }}>All</button>
                    {groups.map((g: string) => (
                      <button key={g} onClick={() => setFilterCat(`group:${g}`)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, border: `1px solid ${filterCat === `group:${g}` ? 'var(--accent)' : 'var(--border)'}`, background: filterCat === `group:${g}` ? 'var(--accent-dim)' : 'transparent', color: filterCat === `group:${g}` ? 'var(--accent)' : 'var(--text3)', cursor: 'pointer', fontWeight: 600 }}>{g}</button>
                    ))}
                  </div>
                  {lines.map((line, i) => {
                    const visibleProducts = filterCat === 'all' ? dbProducts
                      : filterCat.startsWith('group:') ? dbProducts.filter(p => {
                          const grp = filterCat.slice(6)
                          return (catsByGroup[grp] || []).some((c: {name:string}) => c.name === p.category)
                        })
                      : dbProducts.filter(p => p.category === filterCat)
                    return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 48px 90px 64px auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                      <select className="form-input" style={{ fontSize: 12 }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                        <option value="">— Select product —</option>
                        {visibleProducts.map(p => <option key={p.id} value={p.id}>{p.name} · {tzs(p.selling_price)} · Stk:{p.qty_on_hand}</option>)}
                      </select>
                      <input type="number" className="form-input" style={{ textAlign: 'center', fontSize: 13, fontWeight: 700 }} min={1} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
                      <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }} value={line.price} onChange={e => updateLine(i, 'price', parseFloat(e.target.value) || 0)} />
                      {/* Per-line discount % (0–100). Empty/zero = no discount. */}
                      <input
                        type="number"
                        className="form-input"
                        style={{
                          fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right',
                          // Subtle highlight when a discount is active so the cashier
                          // can spot it at a glance — easy to forget you typed 50%.
                          color: line.discountPct > 0 ? 'var(--accent)' : undefined,
                          fontWeight: line.discountPct > 0 ? 700 : 400,
                        }}
                        min={0}
                        max={100}
                        step={1}
                        placeholder="0%"
                        value={line.discountPct || ''}
                        onChange={e => {
                          const v = parseFloat(e.target.value)
                          updateLine(i, 'discountPct', isNaN(v) ? 0 : v)
                        }}
                        title="Discount % for this line (0–100)"
                      />
                      {lines.length > 1 ? <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button> : <div />}
                    </div>
                    )
                  })}
                  <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>PRODUCT · QTY · PRICE · DISC% (0 = no discount)</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', name: '', qty: 1, price: 0, discountPct: 0, amount: 0 }])}>+ Add item</button>
                    <BundlePicker onApply={(bundleLines, bundle) => {
                      // BundlePicker emits its own ApplyLine[] shape (no discount field).
                      // Map to SaleLine here so the discount column on each new line
                      // starts at 0% rather than undefined.
                      setLines(bundleLines.map(bl => ({ ...bl, discountPct: 0 })))
                      setAppliedBundle(bundle)
                    }} />
                  </div>
                </div>

                {/* STEP 3 — DELIVERY (collapsible) */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setShowDelivery(!showDelivery)}>
                    <div className="step-num">3</div>
                    <div className="step-title">DELIVERY / SHIPPING FEES</div>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>{showDelivery ? '↑ Hide' : '↓ Add fees'}</span>
                  </div>
                  {showDelivery && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>Posts to 2085 Delivery & Shipping Float — not product revenue</div>
                      <div className="form-row">
                        <FG label="Town Delivery (TZS)"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={townDelivery} onChange={e => setTownDelivery(e.target.value)} /></FG>
                        <FG label="Upcountry Shipping (TZS)"><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} placeholder="0" value={upcountryShipping} onChange={e => setUpcountryShipping(e.target.value)} /></FG>
                      </div>
                      {deliveryTotal > 0 && (
                        <div style={{ background: 'var(--blue-dim)', border: '1px solid rgba(61,139,255,.2)', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text3)' }}>Total delivery/shipping</span>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 700 }}>{tzs(deliveryTotal)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT — Payment + Totals */}
              <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* STEP 4 — PAYMENT */}
                <div>
                  <div className="step-header" style={{ marginBottom: 12 }}><div className="step-num">4</div><div className="step-title">PAYMENT METHOD</div></div>

                  {/* POD toggle */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button onClick={() => setIsPOD(false)} className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12, background: !isPOD ? 'var(--green-dim)' : 'transparent', border: `1px solid ${!isPOD ? 'var(--green)' : 'var(--border)'}`, color: !isPOD ? 'var(--green)' : 'var(--text3)' }}>Paid at Counter</button>
                    <button onClick={() => setIsPOD(true)} className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12, background: isPOD ? 'var(--yellow-dim)' : 'transparent', border: `1px solid ${isPOD ? 'var(--yellow)' : 'var(--border)'}`, color: isPOD ? 'var(--yellow)' : 'var(--text3)' }}>Pay on Delivery (POD)</button>
                  </div>

                  {!isPOD && (
                    <>
                      {/* Payment method grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        {PAYMENT_METHODS.map(m => <PayBtn key={m.id} method={m} />)}
                      </div>

                      {/* Ref number for non-cash */}
                      {currentMethod.showRef && (
                        <div style={{ marginBottom: 12 }}>
                          <input className="form-input" placeholder={`${currentMethod.label} reference / transaction number`} value={paymentRef} onChange={e => setPaymentRef(e.target.value)} style={{ fontSize: 12, borderColor: 'var(--accent)' }} />
                        </div>
                      )}

                      {/* Split payment lines */}
                      {isSplit && splitLines.map((sl, i) => {
                        const slMethod = PAYMENT_METHODS.find(m => m.id === sl.methodId)!
                        return (
                          <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 10, marginBottom: 8 }}>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                              <select className="form-input" style={{ flex: 1, fontSize: 12 }} value={sl.methodId} onChange={e => updateSplitLine(i, 'methodId', e.target.value)}>
                                {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label} — {m.sublabel}</option>)}
                              </select>
                              <button onClick={() => setSplitLines(splitLines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input type="number" className="form-input" style={{ flex: 1, fontFamily: 'var(--mono)', fontWeight: 700 }} placeholder="Amount (TZS)" value={sl.amount || ''} onChange={e => updateSplitLine(i, 'amount', parseFloat(e.target.value) || 0)} />
                              {slMethod.showRef && <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="Ref / Transaction No" value={sl.ref} onChange={e => updateSplitLine(i, 'ref', e.target.value)} />}
                            </div>
                          </div>
                        )
                      })}

                      {/* Cash tendered / quick amounts */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6 }}>
                          {isSplit ? 'AMOUNT TENDERED FOR CASH PORTION' : currentMethod.id === 'cash' ? 'AMOUNT TENDERED (for change calculation)' : 'TOTAL TO COLLECT'}
                        </div>
                        <div style={{ position: 'relative' }}>
                          <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, paddingRight: 80 }}
                            placeholder={tzs(total)} value={tendered}
                            onChange={e => setTendered(e.target.value)} />
                          <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                            {total > 0 && !tendered ? tzs(total) : ''}
                          </div>
                        </div>
                      </div>

                      {/* Quick amount buttons */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        {[50000, 100000, 200000].map(amt => (
                          <button key={amt} className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center', fontFamily: 'var(--mono)' }} onClick={() => setTendered(amt.toString())}>{(amt/1000).toFixed(0)}K</button>
                        ))}
                        <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center', fontWeight: 700 }} onClick={() => setTendered(total.toString())}>Exact</button>
                      </div>

                      {/* Change */}
                      {tendered && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: change >= 0 ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${change >= 0 ? 'rgba(0,229,160,.2)' : 'rgba(255,71,87,.2)'}`, borderRadius: 'var(--r)', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: 'var(--text3)' }}>Change</span>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: change >= 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(Math.max(0, change))}</span>
                        </div>
                      )}

                      {/* Split payment button */}
                      <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={addSplitLine}>+ Split Payment (customer pays with 2+ methods)</button>
                    </>
                  )}

                  {isPOD && (
                    <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.3)', borderRadius: 'var(--r)', padding: 12, fontSize: 12, color: 'var(--yellow)' }}>
                      POD — Stock deducted and sale recorded now. Cash receipt posted manually when rider returns with payment.
                    </div>
                  )}
                </div>

                {/* TOTALS */}
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
                  {/* When at least one line has a discount, surface gross + discount + net.
                      When nothing is discounted, keep the panel as compact as before. */}
                  {discountGiven > 0 ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                        <span style={{ color: 'var(--text3)' }}>Gross subtotal (before discount)</span>
                        <span style={{ fontFamily: 'var(--mono)' }}>{grossSubtotal.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                        <span style={{ color: 'var(--accent)' }}>
                          Discount given ({grossSubtotal > 0 ? Math.round((discountGiven / grossSubtotal) * 100) : 0}%)
                        </span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>−{discountGiven.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderTop: '1px dashed var(--border)', marginTop: 4, paddingTop: 6 }}>
                        <span style={{ color: 'var(--text2)' }}>Net products subtotal</span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{subtotal.toLocaleString()}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                      <span style={{ color: 'var(--text3)' }}>Products subtotal</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{subtotal.toLocaleString()}</span>
                    </div>
                  )}
                  {deliveryTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Delivery → Float 2085</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{deliveryTotal.toLocaleString()}</span></div>}
                  {referralDiscount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                      <span style={{ color: 'var(--accent)' }}>
                        Referral discount ({referralPreview?.referrer_name})
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>−{referralDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  {referralPreview?.benefit_shape === 'free_item' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                      <span style={{ color: 'var(--accent)' }}>+ Free: {referralPreview.free_product_name}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>included</span>
                    </div>
                  )}
                  {margin > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}><span style={{ color: 'var(--text3)' }}>Gross margin</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{tzs(margin)} ({subtotal > 0 ? Math.round((margin/subtotal)*100) : 0}%)</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, padding: '12px 0 0', borderTop: '1px solid var(--border2)', marginTop: 8 }}>
                    <span>TOTAL</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{tzs(total)}</span>
                  </div>
                </div>

                {/* Info tags */}
                <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 10, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {!isPOD && <div style={{ color: 'var(--green)' }}>WhatsApp receipt auto-sent to customer</div>}
                  {isPOD && <div style={{ color: 'var(--yellow)' }}>Receipt posted manually after delivery</div>}
                  <div style={{ color: 'var(--text3)' }}>Inventory deducted · COGS → 5010 · Revenue → 4010</div>
                  <div style={{ color: 'var(--yellow)' }}>{crownPoints} Crown pts will be awarded</div>
                  {!isPOD && currentMethod.id === 'pos' && <div style={{ color: 'var(--blue)' }}>POS → tagged separately in GL reports from CRDB transfers</div>}
                  {deliveryTotal > 0 && <div style={{ color: 'var(--blue)' }}>{tzs(deliveryTotal)} → Delivery & Shipping Float (2085)</div>}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowModal(false); if (isEditMode) resetForm() }}>Cancel</button>
                  {!isEditMode && <button className="btn btn-ghost btn-sm" style={{ padding: '10px 14px' }}>Draft</button>}
                  <button className="btn btn-primary" onClick={isEditMode ? updateVoucher : post} disabled={posting} style={{ flex: 2, justifyContent: 'center', padding: '12px', fontSize: 13, fontWeight: 700, opacity: posting ? 0.6 : 1 }}>
                    {posting ? (isEditMode ? 'Updating…' : 'Posting…') : isEditMode ? 'Update Sale' : isPOD ? 'Post POD Sale' : `Post · ${currentMethod.label}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {showReceipt && lastVoucher && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', flexDirection: 'column', zIndex: 200 }}>
          {/* Sticky action bar — always visible at top */}
          <div style={{ background: 'rgba(0,0,0,.95)', borderBottom: '1px solid rgba(255,255,255,.1)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, color: '#fff' }}>
              Receipt — {lastVoucher.ref}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={() => {
                const win = window.open('', '_blank')
                if (!win) return
                const el = document.getElementById('sokora-receipt-modal')
                if (!el) return
                win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${lastVoucher.ref}</title>
                  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@600&display=swap" rel="stylesheet">
                  <style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;justify-content:center;padding:20px;background:#f0f0f0}@media print{body{background:#fff;padding:0}}</style>
                  </head><body>${el.innerHTML}</body></html>`)
                win.document.close()
                setTimeout(() => win.print(), 600)
              }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print / Save PDF
              </button>
              <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, background: waSent ? 'rgba(37,211,102,.15)' : waConfig?.enabled && waConfig?.api_key ? 'rgba(37,211,102,.1)' : 'var(--surface2)', color: waSent ? '#25D366' : waConfig?.enabled && waConfig?.api_key ? '#25D366' : 'var(--text3)', border: `1px solid ${waConfig?.enabled && waConfig?.api_key ? 'rgba(37,211,102,.3)' : 'var(--border)'}`, cursor: waConfig?.enabled && waConfig?.api_key ? 'pointer' : 'not-allowed' }}
                title={!waConfig?.enabled || !waConfig?.api_key ? 'Configure WhatsApp in Settings first' : ''}
                disabled={sending || waSent || !waConfig?.enabled || !waConfig?.api_key}
                onClick={async () => {
                  if (!lastVoucher || !waConfig) return
                  const phone = lastVoucher.customers?.whatsapp
                  if (!phone) { alert('No WhatsApp number for this customer'); return }
                  setSending(true)
                  const msg = formatReceiptMessage(waConfig.template_receipt || '', {
                    customer_name: lastVoucher.customers?.name || 'Mama',
                    ref: lastVoucher.ref, date: lastVoucher.posting_date,
                    payment_method: lastVoucher.payment_method,
                    items: lastVoucher.voucher_lines?.map((l: any) => ({ name: l.products?.name || '—', qty: l.qty, amount: l.total })) || [],
                    total: lastVoucher.total_amount,
                  })
                  const result = await sendWhatsApp(waConfig, { to: phone, message: msg, type: 'receipt', ref: lastVoucher.ref, customer_name: lastVoucher.customers?.name, customer_id: lastVoucher.customer_id, is_transactional: true })
                  setSending(false)
                  if (result.success) { setWaSent(true) } else { alert('Send failed: ' + result.error) }
                }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                {sending ? 'Sending…' : waSent ? 'Sent ✓' : 'Send via WhatsApp'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowReceipt(false); resetForm(); setWaSent(false) }}>Close</button>
            </div>
          </div>
          {/* Scrollable receipt area */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '24px 20px' }}>
            <div id="sokora-receipt-modal">
              <SokoraReceipt voucher={lastVoucher} settings={receiptSettings || {
                company_name: 'Your Organization', tagline: 'Reimagining Motherhood',
                address: 'Dar es Salaam, Tanzania', phone: '+255 700 000 000',
                email: 'hello@sokora.app', website: 'www.sokora.app', instagram: '@sokora_tz',
                tin: '—', vrn: '—', primary_color: '#85c2be', accent_color: '#f7a6ad',
                logo_url: '', logo_width: 60, logo_x: 0, logo_y: 0, show_logo: true,
                label_receipt: 'Receipt', label_billed_to: 'Billed To',
                label_items: 'Items Purchased', label_total_paid: 'Total Paid',
                label_crown_points: 'Crown Points', label_midwife_tip: 'Midwife Tip',
                label_konnect: 'Join SOKORA Konnect', label_cashier: 'Served by',
                konnect_url: 'https://www.sokora.app/join', konnect_enabled: true,
                konnect_cta_text: 'Join Konnect →',
                konnect_sub_text: 'Weekly guidance · Expert Q&A · Birth prep · Postpartum support',
                konnect_utm_tracking: true,
                community_url: '', community_enabled: false, community_name: 'Mama Community', community_qr_enabled: false,
                show_crown_points: true, show_cashier: true,
                show_care_tip: true, show_stage_message: true,
                footer_message: 'Share your SOKORA moment — tag us on Instagram',
                msg_pregnant: 'You are doing something extraordinary. Every choice you make matters, Mama.',
                msg_postpartum: 'The hardest work is invisible. We see you, and we are with you.',
                msg_general: 'Motherhood deserves better. That is why we exist.',
              }} />
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
