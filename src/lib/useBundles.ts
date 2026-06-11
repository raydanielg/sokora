import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

export interface Bundle {
  id: string; code: string; name: string; description: string | null
  bundle_price: number; individual_total: number; is_active: boolean
  image_url: string | null; created_at: string; items: BundleItem[]
}

export interface BundleItem {
  id: string; bundle_id: string; product_id: string; qty: number
  product?: { id: string; name: string; sku: string; selling_price: number; cost_price: number; qty_on_hand: number; category: string }
}

export interface BundleSale {
  id: string; bundle_id: string; voucher_ref: string; customer_name: string
  bundle_price: number; individual_total: number; savings: number
  sold_by: string; posting_date: string
  bundle?: { name: string; code: string }
}

export interface BundleFormData {
  code: string; name: string; description: string; bundle_price: number
  is_active: boolean; items: { product_id: string; qty: number }[]
}

export function useBundles() {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(true)

  const loadBundles = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('bundles')
      .select(`id, code, name, description, bundle_price, individual_total, is_active, image_url, created_at,
        bundle_items (id, bundle_id, product_id, qty, products (id, name, sku, selling_price, cost_price, qty_on_hand, category))`)
      .order('name')
    if (data) {
      setBundles(data.map((b: any) => ({
        ...b,
        items: (b.bundle_items || []).map((bi: any) => ({
          id: bi.id, bundle_id: bi.bundle_id, product_id: bi.product_id, qty: bi.qty,
          product: bi.products || undefined
        }))
      })))
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadBundles() }, [loadBundles])

  const createBundle = async (form: BundleFormData): Promise<{ success: boolean; error?: string }> => {
    const productIds = form.items.map(i => i.product_id).filter(Boolean)
    const { data: products } = await supabase.from('products').select('id, selling_price').in('id', productIds)
    const individualTotal = form.items.reduce((sum, item) => {
      const prod = products?.find(p => p.id === item.product_id)
      return sum + ((prod?.selling_price || 0) * item.qty)
    }, 0)

    const { data: bundle, error } = await supabase.from('bundles')
      .insert({ code: form.code, name: form.name, description: form.description || null, bundle_price: form.bundle_price, individual_total: individualTotal, is_active: form.is_active })
      .select('id').single()
    if (error) return { success: false, error: error.message }

    const itemRows = form.items.filter(i => i.product_id).map(i => ({ bundle_id: bundle.id, product_id: i.product_id, qty: i.qty }))
    if (itemRows.length > 0) {
      const { error: itemErr } = await supabase.from('bundle_items').insert(itemRows)
      if (itemErr) return { success: false, error: itemErr.message }
    }
    await loadBundles()
    return { success: true }
  }

  const updateBundle = async (bundleId: string, form: BundleFormData): Promise<{ success: boolean; error?: string }> => {
    const productIds = form.items.map(i => i.product_id).filter(Boolean)
    const { data: products } = await supabase.from('products').select('id, selling_price').in('id', productIds)
    const individualTotal = form.items.reduce((sum, item) => {
      const prod = products?.find(p => p.id === item.product_id)
      return sum + ((prod?.selling_price || 0) * item.qty)
    }, 0)

    const { error } = await supabase.from('bundles')
      .update({ code: form.code, name: form.name, description: form.description || null, bundle_price: form.bundle_price, individual_total: individualTotal, is_active: form.is_active, updated_at: new Date().toISOString() })
      .eq('id', bundleId)
    if (error) return { success: false, error: error.message }

    await supabase.from('bundle_items').delete().eq('bundle_id', bundleId)
    const itemRows = form.items.filter(i => i.product_id).map(i => ({ bundle_id: bundleId, product_id: i.product_id, qty: i.qty }))
    if (itemRows.length > 0) {
      const { error: itemErr } = await supabase.from('bundle_items').insert(itemRows)
      if (itemErr) return { success: false, error: itemErr.message }
    }
    await loadBundles()
    return { success: true }
  }

  const toggleBundle = async (bundleId: string, isActive: boolean) => {
    await supabase.from('bundles').update({ is_active: isActive }).eq('id', bundleId)
    await loadBundles()
  }

  const deleteBundle = async (bundleId: string) => {
    await supabase.from('bundle_items').delete().eq('bundle_id', bundleId)
    await supabase.from('bundles').delete().eq('id', bundleId)
    await loadBundles()
  }

  return { bundles, activeBundles: bundles.filter(b => b.is_active), loading, refresh: loadBundles, createBundle, updateBundle, toggleBundle, deleteBundle }
}

// Log a bundle sale (analytics only, no journals)
export async function logBundleSale(params: {
  bundleId: string; voucherId: string; voucherRef: string; customerId?: string | null
  customerName: string; bundlePrice: number; individualTotal: number; soldBy: string; postingDate: string
}) {
  return supabase.from('bundle_sales').insert({
    bundle_id: params.bundleId, voucher_id: params.voucherId, voucher_ref: params.voucherRef,
    customer_id: params.customerId || null, customer_name: params.customerName,
    bundle_price: params.bundlePrice, individual_total: params.individualTotal,
    savings: params.individualTotal - params.bundlePrice,
    sold_by: params.soldBy, posting_date: params.postingDate,
  })
}

// Analytics hook
export function useBundleSales(fromDate?: string, toDate?: string) {
  const [sales, setSales] = useState<BundleSale[]>([])
  const [loading, setLoading] = useState(true)

  const loadSales = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('bundle_sales')
      .select('id, bundle_id, voucher_ref, customer_name, bundle_price, individual_total, savings, sold_by, posting_date, bundles(name, code)')
      .order('created_at', { ascending: false }).limit(200)
    if (fromDate) query = query.gte('posting_date', fromDate)
    if (toDate) query = query.lte('posting_date', toDate)
    const { data } = await query
    if (data) setSales(data.map((d: any) => ({ ...d, bundle: d.bundles ? (Array.isArray(d.bundles) ? d.bundles[0] : d.bundles) : undefined })))
    setLoading(false)
  }, [fromDate, toDate])

  useEffect(() => { loadSales() }, [loadSales])

  const totalBundlesSold = sales.length
  const totalRevenue = sales.reduce((s, sale) => s + sale.bundle_price, 0)
  const totalSavingsGiven = sales.reduce((s, sale) => s + sale.savings, 0)
  const byBundle: Record<string, { name: string; count: number; revenue: number; savings: number }> = {}
  sales.forEach(s => {
    const key = s.bundle_id
    if (!byBundle[key]) byBundle[key] = { name: s.bundle?.name || 'Unknown', count: 0, revenue: 0, savings: 0 }
    byBundle[key].count++; byBundle[key].revenue += s.bundle_price; byBundle[key].savings += s.savings
  })

  return { sales, loading, refresh: loadSales, totalBundlesSold, totalRevenue, totalSavingsGiven, byBundle }
}
