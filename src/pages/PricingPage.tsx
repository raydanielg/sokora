import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

// ── TYPES ───────────────────────────────────────────────────
interface Product {
  id: string; sku: string; name: string; category: string
  selling_price: number; wholesale_price: number; cost_price: number
  moq: number; unit: string; qty_on_hand: number; is_active: boolean
}
interface Bundle {
  id: string; code: string; name: string; description: string | null
  bundle_price: number; wholesale_price: number; individual_total: number
  is_active: boolean; items: { product_id: string; qty: number; product?: { name: string } }[]
}
interface Customer {
  id: string; name: string; whatsapp: string; customer_type: string
  price_tier: string; segment: string
}
type Tab = 'prices' | 'customers' | 'pricelist'
type PriceTier = 'retail' | 'wholesale'

// ── HELPERS ─────────────────────────────────────────────────
const margin = (sell: number, cost: number) => sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0
const mColor = (m: number) => m >= 40 ? 'var(--green)' : m >= 20 ? 'var(--yellow)' : 'var(--red)'

// ── PRICELIST DOCUMENT ──────────────────────────────────────
function PricelistDoc({ products, bundles, config }: {
  products: Product[]; bundles: Bundle[]; config: {
    tier: PriceTier; includeBundles: boolean; showDesc: boolean
    validUntil: string; whatsapp: string; note: string; categories: string[]
  }
}) {
  const isW = config.tier === 'wholesale'
  const filtered = products.filter(p => config.categories.includes(p.category) && p.is_active)
  const grouped: Record<string, Product[]> = {}
  filtered.forEach(p => { if (!grouped[p.category]) grouped[p.category] = []; grouped[p.category].push(p) })
  const activeBundles = bundles.filter(b => b.is_active)
  const validDate = config.validUntil ? new Date(config.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const waLink = `https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}`

  return (
    <div id="sokora-pricelist-doc" style={{ width: 680, background: '#fff', fontFamily: "'Instrument Sans', sans-serif", color: '#1a1a1a', fontSize: 12 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #85c2be 0%, #6ba8a4 50%, #f7a6ad 100%)', padding: '28px 32px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 }}>SOKORA</div>
          <div style={{ fontSize: 10, opacity: 0.8, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>Your Partner in Motherhood</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 14 }}>{isW ? 'Wholesale Price List' : 'Product Price List'}</div>
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{isW ? 'Partner & Distributor Pricing' : 'Retail Catalogue'}</div>
          {validDate && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, background: 'rgba(255,255,255,0.15)', padding: '5px 12px', borderRadius: 20, fontSize: 10, fontWeight: 600 }}>
              Valid until {validDate}
            </div>
          )}
        </div>
      </div>

      {/* Trust strip */}
      <div style={{ display: 'flex', borderBottom: '1px solid #eee' }}>
        {['🏥 Hospital Grade', '✅ Clinically Tested', '🤱 Mama Approved', '🇹🇿 Available in TZ'].map((t, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', padding: '10px 6px', borderRight: i < 3 ? '1px solid #eee' : 'none', fontSize: 9, fontWeight: 700, color: '#85c2be', letterSpacing: 0.5, textTransform: 'uppercase' }}>{t}</div>
        ))}
      </div>

      {/* MOQ note for wholesale */}
      {isW && (
        <div style={{ margin: '14px 24px', padding: '10px 14px', background: '#f0faf9', borderRadius: 10, border: '1px solid #d0eae8', fontSize: 11, color: '#3d7a75' }}>
          <strong>Wholesale Terms:</strong> MOQ applies per product. Prices ex-DSM. Payment: 50% deposit, balance on delivery.
        </div>
      )}

      {/* Products by category */}
      <div style={{ padding: '16px 24px' }}>
        {Object.entries(grouped).map(([cat, prods]) => (
          <div key={cat} style={{ marginBottom: 22 }}>
            <div style={{ background: '#f0faf9', borderLeft: '4px solid #85c2be', padding: '7px 12px', marginBottom: 8, borderRadius: '0 6px 6px 0' }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: '#3d7a75' }}>{cat}</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f8f8' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 8, fontWeight: 700, color: '#999', letterSpacing: 1, textTransform: 'uppercase' }}>Product</th>
                  {isW && <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: 8, fontWeight: 700, color: '#999', letterSpacing: 1, textTransform: 'uppercase', width: 50 }}>MOQ</th>}
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 8, fontWeight: 700, color: '#999', letterSpacing: 1, textTransform: 'uppercase', width: 110 }}>Price (TZS)</th>
                </tr>
              </thead>
              <tbody>
                {prods.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 500, fontSize: 12 }}>{p.name}</td>
                    {isW && <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 11, color: '#85c2be', fontWeight: 600 }}>{p.moq}</td>}
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: '#3d7a75' }}>
                      {(isW ? p.wholesale_price : p.selling_price).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Bundles */}
        {config.includeBundles && activeBundles.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ background: '#fef5f6', borderLeft: '4px solid #f7a6ad', padding: '7px 12px', marginBottom: 8, borderRadius: '0 6px 6px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: '#c4747e' }}>Special Bundles & Kits</div>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#4a9', background: '#e6f9f1', padding: '2px 8px', borderRadius: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Save More</span>
            </div>
            {activeBundles.map(b => {
              const price = isW ? b.wholesale_price : b.bundle_price
              const savings = b.individual_total - (isW ? b.wholesale_price : b.bundle_price)
              return (
                <div key={b.id} style={{ border: '1.5px solid #f7d6da', borderRadius: 12, padding: 14, marginBottom: 10, background: 'linear-gradient(135deg, #fffbfc, #fef5f6)', position: 'relative', overflow: 'hidden' }}>
                  {savings > 0 && (
                    <div style={{ position: 'absolute', top: 10, right: -24, background: '#4a9', color: '#fff', fontSize: 8, fontWeight: 800, padding: '2px 28px', transform: 'rotate(45deg)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      SAVE {Math.round((savings / b.individual_total) * 100)}%
                    </div>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a1a', marginBottom: 4 }}>{b.name}</div>
                  {b.description && <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{b.description}</div>}
                  {b.items.map((item, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#666', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#4a9' }}>✓</span> {item.qty > 1 ? `${item.qty}x ` : ''}{item.product?.name || 'Product'}
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#3d7a75' }}>TZS {price.toLocaleString()}</span>
                    {savings > 0 && <span style={{ fontSize: 12, color: '#999', textDecoration: 'line-through' }}>TZS {b.individual_total.toLocaleString()}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {config.note && (
          <div style={{ padding: '10px 14px', background: '#f0faf9', borderRadius: 10, fontSize: 11, color: '#3d7a75', marginBottom: 16 }}>{config.note}</div>
        )}
      </div>

      {/* Footer */}
      <div style={{ background: '#1a1a1a', color: '#fff', padding: '22px 24px' }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Ready to Order?</div>
        <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 14 }}>Tap below to place your order via WhatsApp</div>
        <a href={waLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#25d366', color: '#fff', padding: '10px 22px', borderRadius: 24, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          💬 Order on WhatsApp
        </a>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, opacity: 0.4 }}>📞 {config.whatsapp} · @sokora</span>
          <span style={{ fontSize: 10, opacity: 0.3 }}>SOKORA · Your Partner in Motherhood</span>
        </div>
      </div>
    </div>
  )
}

// ── MAIN PAGE ───────────────────────────────────────────────
interface Props { onNav?: (p: Page) => void }

export default function PricingPage(_props: Props) {
  const [tab, setTab] = useState<Tab>('prices')
  const [products, setProducts] = useState<Product[]>([])
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [filterCat, setFilterCat] = useState('all')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [editId, setEditId] = useState<string | null>(null)
  const [editField, setEditField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [custSearch, setCustSearch] = useState('')
  const [custFilter, setCustFilter] = useState<'all' | PriceTier>('all')
  const previewRef = useRef<HTMLDivElement>(null)

  // Pricelist config
  const [plTier, setPlTier] = useState<PriceTier>('retail')
  const [plBundles, setPlBundles] = useState(true)
  const [plValid, setPlValid] = useState(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0])
  const [plWhatsapp, setPlWhatsapp] = useState('+255754123456')
  const [plNote, setPlNote] = useState('')
  const [plCats, setPlCats] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(true)

  const showToast = (m: string, t: 'success' | 'error' = 'success') => { setToast(m); setToastType(t) }

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const [{ data: p }, { data: b }, { data: c }] = await Promise.all([
      supabase.from('products').select('id,sku,name,category,selling_price,wholesale_price,cost_price,moq,unit,qty_on_hand,is_active').eq('is_active', true).order('category').order('name'),
      supabase.from('bundles').select('id,code,name,description,bundle_price,wholesale_price,individual_total,is_active,bundle_items(product_id,qty,products(name))').order('name'),
      supabase.from('customers').select('id,name,whatsapp,customer_type,price_tier,segment').order('name'),
    ])
    if (p) {
      setProducts(p.map((x: any) => ({ ...x, wholesale_price: x.wholesale_price || 0, moq: x.moq || 1 })))
      const cats = [...new Set(p.map((x: any) => x.category))] as string[]
      setCategories(cats)
      setPlCats(cats)
    }
    if (b) setBundles(b.map((x: any) => ({ ...x, wholesale_price: x.wholesale_price || 0, items: (x.bundle_items || []).map((i: any) => ({ product_id: i.product_id, qty: i.qty, product: i.products })) })))
    if (c) setCustomers(c.map((x: any) => ({ ...x, price_tier: x.price_tier || 'retail' })))
  }

  // ── INLINE EDIT ─────────────────────────────────────────
  const startEdit = (id: string, field: string, value: number) => {
    setEditId(id); setEditField(field); setEditValue(value.toString())
  }

  const saveEdit = async () => {
    if (!editId || !editField) return
    const num = parseInt(editValue.replace(/[^0-9]/g, ''), 10)
    if (isNaN(num) || num < 0) { showToast('Invalid price', 'error'); return }
    const { error } = await supabase.from('products').update({ [editField]: num }).eq('id', editId)
    if (error) { showToast(error.message, 'error'); return }
    setProducts(prev => prev.map(p => p.id === editId ? { ...p, [editField!]: num } : p))
    setEditId(null); setEditField(null)
    showToast('Price updated')
  }

  const saveBundleEdit = async (bundleId: string, field: string, value: number) => {
    const { error } = await supabase.from('bundles').update({ [field]: value }).eq('id', bundleId)
    if (error) { showToast(error.message, 'error'); return }
    setBundles(prev => prev.map(b => b.id === bundleId ? { ...b, [field]: value } : b))
    showToast('Bundle price updated')
  }

  const saveMoq = async (id: string, moq: number) => {
    const { error } = await supabase.from('products').update({ moq }).eq('id', id)
    if (error) { showToast(error.message, 'error'); return }
    setProducts(prev => prev.map(p => p.id === id ? { ...p, moq } : p))
  }

  const updateCustomerTier = async (custId: string, tier: PriceTier) => {
    const { error } = await supabase.from('customers').update({ price_tier: tier }).eq('id', custId)
    if (error) { showToast(error.message, 'error'); return }
    setCustomers(prev => prev.map(c => c.id === custId ? { ...c, price_tier: tier } : c))
    showToast(`Customer tier updated to ${tier}`)
  }

  // ── DOWNLOAD ────────────────────────────────────────────
  const downloadPricelist = () => {
    const el = document.getElementById('sokora-pricelist-doc')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>SOKORA ${plTier} Price List</title>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@500;600&display=swap" rel="stylesheet">
      <style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;justify-content:center;padding:20px;background:#f0f0f0}@media print{body{background:#fff;padding:0}}</style>
    </head><body>${el.outerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  // ── FILTER ──────────────────────────────────────────────
  const filtered = products
    .filter(p => filterCat === 'all' || p.category === filterCat)
    .filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))

  const filteredCust = customers
    .filter(c => custFilter === 'all' || c.price_tier === custFilter)
    .filter(c => !custSearch.trim() || c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.whatsapp || '').includes(custSearch))

  const avgRetailMargin = products.length > 0 ? Math.round(products.reduce((s, p) => s + margin(p.selling_price, p.cost_price), 0) / products.length) : 0
  const avgWholesaleMargin = products.length > 0 ? Math.round(products.reduce((s, p) => s + margin(p.wholesale_price, p.cost_price), 0) / products.length) : 0

  // ── RENDER ──────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(133,194,190,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" fill="none" stroke="#85c2be" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          </div>
          <div>
            <div className="page-title">Pricing</div>
            <div className="page-sub">Wholesale & retail prices · Customer tiers · Downloadable price lists</div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={loadAll}>Refresh</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {([['prices', 'Prices'], ['customers', 'Customer Tiers'], ['pricelist', 'Generate Pricelist']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ═══ PRICES TAB ═══════════════════════════════════ */}
      {tab === 'prices' && (
        <>
          {/* Stats */}
          <div className="grid g4" style={{ marginBottom: 20 }}>
            <div className="stat-card green"><div className="stat-label">Products</div><div className="stat-value">{products.length}</div></div>
            <div className="stat-card amber"><div className="stat-label">Avg Retail Margin</div><div className="stat-value">{avgRetailMargin}%</div></div>
            <div className="stat-card blue"><div className="stat-label">Avg Wholesale Margin</div><div className="stat-value">{avgWholesaleMargin}%</div></div>
            <div className="stat-card yellow"><div className="stat-label">Bundles</div><div className="stat-value">{bundles.filter(b => b.is_active).length}</div></div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="form-input" style={{ width: 240, fontSize: 12 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product or SKU..." />
            <select className="form-input" style={{ width: 160, fontSize: 12 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c} ({products.filter(p => p.category === c).length})</option>)}
            </select>
          </div>

          {/* Products table */}
          <div className="card" style={{ padding: 0, marginBottom: 20 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th style={{ textAlign: 'right' }}>Cost</th>
                    <th style={{ textAlign: 'right' }}>Retail Price</th>
                    <th style={{ textAlign: 'right' }}>Margin</th>
                    <th style={{ textAlign: 'right' }}>Wholesale Price</th>
                    <th style={{ textAlign: 'right' }}>Margin</th>
                    <th style={{ textAlign: 'center' }}>MOQ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const rm = margin(p.selling_price, p.cost_price)
                    const wm = margin(p.wholesale_price, p.cost_price)
                    const isEditing = editId === p.id

                    return (
                      <tr key={p.id}>
                        <td className="td-bold">{p.name}</td>
                        <td className="td-mono" style={{ color: 'var(--accent)' }}>{p.sku}</td>
                        <td className="td-right td-mono">{tzs(p.cost_price)}</td>

                        {/* Retail */}
                        <td className="td-right">
                          {isEditing && editField === 'selling_price' ? (
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              <input style={{ width: 90, padding: '4px 8px', background: 'var(--surface3)', border: '1px solid var(--accent)', borderRadius: 6, color: 'var(--text)', fontSize: 12, textAlign: 'right', outline: 'none' }}
                                value={editValue} onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }}
                                autoFocus />
                              <button onClick={saveEdit} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}>✓</button>
                            </div>
                          ) : (
                            <span onClick={() => startEdit(p.id, 'selling_price', p.selling_price)} style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>{tzs(p.selling_price)}</span>
                          )}
                        </td>
                        <td className="td-right"><span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: mColor(rm) }}>{rm}%</span></td>

                        {/* Wholesale */}
                        <td className="td-right">
                          {isEditing && editField === 'wholesale_price' ? (
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              <input style={{ width: 90, padding: '4px 8px', background: 'var(--surface3)', border: '1px solid var(--accent)', borderRadius: 6, color: 'var(--text)', fontSize: 12, textAlign: 'right', outline: 'none' }}
                                value={editValue} onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }}
                                autoFocus />
                              <button onClick={saveEdit} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}>✓</button>
                            </div>
                          ) : (
                            <span onClick={() => startEdit(p.id, 'wholesale_price', p.wholesale_price)} style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>{tzs(p.wholesale_price)}</span>
                          )}
                        </td>
                        <td className="td-right"><span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: mColor(wm) }}>{wm}%</span></td>

                        {/* MOQ */}
                        <td style={{ textAlign: 'center' }}>
                          <input style={{ width: 45, padding: '3px 6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 11, textAlign: 'center', outline: 'none' }}
                            value={p.moq} onChange={e => { const v = parseInt(e.target.value) || 1; setProducts(prev => prev.map(x => x.id === p.id ? { ...x, moq: v } : x)) }}
                            onBlur={e => saveMoq(p.id, parseInt(e.target.value) || 1)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bundles pricing */}
          {bundles.length > 0 && (
            <>
              <div className="section-label"><div className="section-bar" /><div className="section-title-txt">Bundle Pricing</div></div>
              <div className="grid g2" style={{ marginBottom: 20 }}>
                {bundles.map(b => {
                  const retailSavings = b.individual_total - b.bundle_price
                  const wholesaleSavings = b.individual_total - b.wholesale_price
                  return (
                    <div key={b.id} className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{b.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{b.items.length} products · Individual: {tzs(b.individual_total)}</div>
                        </div>
                        <span className={`pill ${b.is_active ? 'pill-green' : 'pill-red'}`}>{b.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1, padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
                          <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Retail Bundle</div>
                          <EditableNum value={b.bundle_price} onSave={v => saveBundleEdit(b.id, 'bundle_price', v)} color="var(--green)" />
                          {retailSavings > 0 && <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 4 }}>Customer saves {tzs(retailSavings)}</div>}
                        </div>
                        <div style={{ flex: 1, padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
                          <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Wholesale Bundle</div>
                          <EditableNum value={b.wholesale_price} onSave={v => saveBundleEdit(b.id, 'wholesale_price', v)} color="var(--blue)" />
                          {wholesaleSavings > 0 && <div style={{ fontSize: 10, color: 'var(--blue)', marginTop: 4 }}>Saves {tzs(wholesaleSavings)}</div>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ CUSTOMERS TAB ════════════════════════════════ */}
      {tab === 'customers' && (
        <>
          <div className="grid g3" style={{ marginBottom: 20 }}>
            <div className="stat-card green"><div className="stat-label">Total Customers</div><div className="stat-value">{customers.length}</div></div>
            <div className="stat-card amber"><div className="stat-label">Wholesale</div><div className="stat-value">{customers.filter(c => c.price_tier === 'wholesale').length}</div></div>
            <div className="stat-card blue"><div className="stat-label">Retail</div><div className="stat-value">{customers.filter(c => c.price_tier === 'retail').length}</div></div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <input className="form-input" style={{ width: 240, fontSize: 12 }} value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Search customer or phone..." />
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 3 }}>
              {(['all', 'retail', 'wholesale'] as const).map(t => (
                <button key={t} onClick={() => setCustFilter(t)} style={{ padding: '5px 14px', fontSize: 11, fontWeight: 600, background: custFilter === t ? 'var(--accent)' : 'transparent', color: custFilter === t ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderRadius: 6, textTransform: 'capitalize' }}>{t}</button>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>Phone</th><th>Type</th><th style={{ textAlign: 'center' }}>Price Tier</th></tr></thead>
                <tbody>
                  {filteredCust.map(c => (
                    <tr key={c.id}>
                      <td className="td-bold">{c.name}</td>
                      <td className="td-mono">{c.whatsapp || '-'}</td>
                      <td><span className="pill pill-gray" style={{ textTransform: 'capitalize' }}>{c.customer_type}</span></td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 2, background: 'var(--surface2)', borderRadius: 20, padding: 2 }}>
                          <button onClick={() => updateCustomerTier(c.id, 'retail')} style={{ padding: '4px 12px', fontSize: 10, fontWeight: 700, background: c.price_tier === 'retail' ? 'var(--green)' : 'transparent', color: c.price_tier === 'retail' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderRadius: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Retail</button>
                          <button onClick={() => updateCustomerTier(c.id, 'wholesale')} style={{ padding: '4px 12px', fontSize: 10, fontWeight: 700, background: c.price_tier === 'wholesale' ? 'var(--blue)' : 'transparent', color: c.price_tier === 'wholesale' ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderRadius: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Wholesale</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══ PRICELIST TAB ════════════════════════════════ */}
      {tab === 'pricelist' && (
        <>
          <div className="grid g32" style={{ alignItems: 'flex-start' }}>
            {/* Config panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Pricelist Settings</div>

                {/* Tier toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Price Tier</span>
                  <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 20, padding: 3 }}>
                    {(['retail', 'wholesale'] as PriceTier[]).map(t => (
                      <button key={t} onClick={() => setPlTier(t)} style={{ padding: '5px 16px', fontSize: 11, fontWeight: 700, background: plTier === t ? 'var(--accent)' : 'transparent', color: plTier === t ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderRadius: 16, textTransform: 'capitalize' }}>{t}</button>
                    ))}
                  </div>
                </div>

                {/* Include bundles */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600 }}>Include Bundles</div><div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Show special kits on the pricelist</div></div>
                  <div onClick={() => setPlBundles(!plBundles)} style={{ width: 40, height: 22, background: plBundles ? 'var(--green)' : 'var(--surface3)', borderRadius: 11, cursor: 'pointer', position: 'relative', transition: 'background .2s' }}>
                    <div style={{ position: 'absolute', top: 2, left: plBundles ? 20 : 2, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}></div>
                  </div>
                </div>

                {/* Valid until */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Valid Until</span>
                  <input type="date" className="form-input" style={{ width: 150, fontSize: 12, padding: '6px 10px' }} value={plValid} onChange={e => setPlValid(e.target.value)} />
                </div>

                {/* WhatsApp */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>WhatsApp</span>
                  <input className="form-input" style={{ width: 150, fontSize: 12, padding: '6px 10px' }} value={plWhatsapp} onChange={e => setPlWhatsapp(e.target.value)} />
                </div>

                {/* Custom note */}
                <div style={{ padding: '10px 0' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Custom Note</div>
                  <input className="form-input" style={{ fontSize: 12 }} value={plNote} onChange={e => setPlNote(e.target.value)} placeholder="e.g., Free delivery above TZS 200,000" />
                </div>
              </div>

              {/* Category filter */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: 10 }}>Categories</div>
                {categories.map(cat => {
                  const checked = plCats.includes(cat)
                  return (
                    <div key={cat} onClick={() => setPlCats(checked ? plCats.filter(c => c !== cat) : [...plCats, cat])}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 3, background: checked ? 'var(--accent)' : 'var(--surface3)', border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {checked && <svg width="8" height="8" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <span style={{ fontSize: 12, flex: 1 }}>{cat}</span>
                      <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{products.filter(p => p.category === cat).length}</span>
                    </div>
                  )
                })}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setShowPreview(!showPreview)}>{showPreview ? 'Hide' : 'Show'} Preview</button>
                <button className="btn btn-primary" onClick={downloadPricelist}>Print / Download</button>
              </div>
            </div>

            {/* Preview */}
            {showPreview && (
              <div ref={previewRef} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,.3)' }}>
                <PricelistDoc products={products} bundles={bundles} config={{
                  tier: plTier, includeBundles: plBundles, showDesc: false,
                  validUntil: plValid, whatsapp: plWhatsapp, note: plNote, categories: plCats,
                }} />
              </div>
            )}
          </div>
        </>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}

// ── EDITABLE NUMBER ─────────────────────────────────────────
function EditableNum({ value, onSave, color }: { value: number; onSave: (v: number) => void; color: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value.toString())

  const commit = () => {
    const num = parseInt(draft.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(num) && num >= 0) onSave(num)
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <input style={{ width: 90, padding: '4px 8px', background: 'var(--surface3)', border: '1px solid var(--accent)', borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none' }}
          value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          autoFocus />
        <button onClick={commit} style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}>✓</button>
      </div>
    )
  }

  return (
    <div onClick={() => { setDraft(value.toString()); setEditing(true) }}
      style={{ cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color, marginTop: 4 }}>
      {tzs(value)}
    </div>
  )
}
