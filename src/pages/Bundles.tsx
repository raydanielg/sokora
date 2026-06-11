import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useBundles, useBundleSales } from '../lib/useBundles'
import type { Bundle, BundleFormData } from '../lib/useBundles'
import Toast from '../components/Toast'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props { onNav?: (p: Page) => void }
interface DBProduct { id: string; sku: string; name: string; category: string; selling_price: number; qty_on_hand: number }

export default function Bundles(_props: Props) {
  const { bundles, loading, createBundle, updateBundle, toggleBundle, deleteBundle, refresh } = useBundles()
  const [tab, setTab] = useState<'bundles' | 'analytics'>('bundles')
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [showForm, setShowForm] = useState(false)
  const [editBundle, setEditBundle] = useState<Bundle | null>(null)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<BundleFormData>({ code: '', name: '', description: '', bundle_price: 0, is_active: true, items: [{ product_id: '', qty: 1 }] })

  const today = new Date().toISOString().split('T')[0]
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const [fromDate, setFromDate] = useState(thirtyAgo)
  const [toDate, setToDate] = useState(today)
  const { sales: bundleSales, totalBundlesSold, totalRevenue, totalSavingsGiven, byBundle, loading: salesLoading, refresh: refreshSales } = useBundleSales(fromDate, toDate)

  useEffect(() => { supabase.from('products').select('id, sku, name, category, selling_price, qty_on_hand').eq('is_active', true).order('name').then(({ data }) => { if (data) setProducts(data) }) }, [])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }
  const openNew = () => { setEditBundle(null); setForm({ code: '', name: '', description: '', bundle_price: 0, is_active: true, items: [{ product_id: '', qty: 1 }] }); setShowForm(true) }
  const openEdit = (b: Bundle) => { setEditBundle(b); setForm({ code: b.code, name: b.name, description: b.description || '', bundle_price: b.bundle_price, is_active: b.is_active, items: b.items.length > 0 ? b.items.map(i => ({ product_id: i.product_id, qty: i.qty })) : [{ product_id: '', qty: 1 }] }); setShowForm(true) }

  const save = async () => {
    if (!form.code.trim()) { showToast('Bundle code required', 'error'); return }
    if (!form.name.trim()) { showToast('Bundle name required', 'error'); return }
    if (form.items.every(i => !i.product_id)) { showToast('Add at least one product', 'error'); return }
    if (form.bundle_price <= 0) { showToast('Bundle price must be greater than 0', 'error'); return }
    setSaving(true)
    const result = editBundle ? await updateBundle(editBundle.id, form) : await createBundle(form)
    setSaving(false)
    if (result.success) { showToast(editBundle ? `${form.name} updated` : `${form.name} created`); setShowForm(false) }
    else { showToast(result.error || 'Failed to save', 'error') }
  }

  const individualTotal = form.items.reduce((sum, item) => { const prod = products.find(p => p.id === item.product_id); return sum + ((prod?.selling_price || 0) * item.qty) }, 0)
  const formSavings = individualTotal - form.bundle_price
  const formSavingsPct = individualTotal > 0 ? Math.round((formSavings / individualTotal) * 100) : 0

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(133,194,190,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" fill="none" stroke="#85c2be" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          </div>
          <div><div className="page-title">Product Bundles</div><div className="page-sub">Create bundles for upselling · Track sales · Auto-fills in Cash Sale</div></div>
        </div>
        <div className="page-actions"><button className="btn btn-ghost btn-sm" onClick={refresh}>Refresh</button><button className="btn btn-primary" onClick={openNew}>+ New Bundle</button></div>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {(['bundles', 'analytics'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', color: tab === t ? 'var(--accent)' : 'var(--text3)', fontWeight: tab === t ? 600 : 400, fontSize: 13 }}>{t === 'bundles' ? 'Bundles' : 'Sales Analytics'}</button>
        ))}
      </div>

      {tab === 'bundles' && (<>
        {loading ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading...</div>
        : bundles.length === 0 ? <div style={{ textAlign: 'center', padding: '60px 0' }}><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No bundles yet</div><div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Create product bundles to upsell customers at checkout.</div><button className="btn btn-primary" onClick={openNew}>+ Create First Bundle</button></div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>{bundles.map(b => {
          const sv = b.individual_total - b.bundle_price; const svPct = b.individual_total > 0 ? Math.round((sv / b.individual_total) * 100) : 0
          return (<div key={b.id} className="card" style={{ borderLeft: `3px solid ${b.is_active ? 'var(--green)' : 'var(--text3)'}`, opacity: b.is_active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div><div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{b.code}</div><div style={{ fontSize: 15, fontWeight: 700 }}>{b.name}</div>{b.description && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{b.description}</div>}</div>
              <span className={`pill ${b.is_active ? 'pill-green' : 'pill-gray'}`} style={{ fontSize: 9 }}>{b.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, marginBottom: 12 }}>{b.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: i < b.items.length - 1 ? '1px solid var(--border)' : 'none' }}><span>{item.product?.name || 'Unknown'} x{item.qty}</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{tzs((item.product?.selling_price || 0) * item.qty)}</span></div>
            ))}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div><span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{tzs(b.bundle_price)}</span><span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', textDecoration: 'line-through', marginLeft: 8 }}>{tzs(b.individual_total)}</span></div>
              <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>Save {svPct}%</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}><button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => openEdit(b)}>Edit</button><button className="btn btn-ghost btn-sm" onClick={() => toggleBundle(b.id, !b.is_active)}>{b.is_active ? 'Deactivate' : 'Activate'}</button><button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => { if (confirm(`Delete "${b.name}"?`)) deleteBundle(b.id) }}>Del</button></div>
          </div>)
        })}</div>}
      </>)}

      {tab === 'analytics' && (<>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}><input type="date" className="form-input" style={{ width: 140, fontSize: 12 }} value={fromDate} onChange={e => setFromDate(e.target.value)} /><span style={{ color: 'var(--text3)' }}>to</span><input type="date" className="form-input" style={{ width: 140, fontSize: 12 }} value={toDate} onChange={e => setToDate(e.target.value)} /><button className="btn btn-primary btn-sm" onClick={refreshSales}>Load</button></div>
        <div className="grid g4" style={{ marginBottom: 20 }}>
          <div className="stat-card green"><div className="stat-label">Bundles Sold</div><div className="stat-value">{totalBundlesSold}</div></div>
          <div className="stat-card blue"><div className="stat-label">Bundle Revenue</div><div className="stat-value">{totalRevenue >= 1000000 ? (totalRevenue/1000000).toFixed(2)+'M' : (totalRevenue/1000).toFixed(0)+'K'}</div></div>
          <div className="stat-card amber"><div className="stat-label">Savings Given</div><div className="stat-value">{totalSavingsGiven >= 1000000 ? (totalSavingsGiven/1000000).toFixed(1)+'M' : (totalSavingsGiven/1000).toFixed(0)+'K'}</div></div>
          <div className="stat-card yellow"><div className="stat-label">Avg Discount</div><div className="stat-value">{totalBundlesSold > 0 && totalSavingsGiven > 0 ? Math.round((totalSavingsGiven / (totalRevenue + totalSavingsGiven)) * 100) : 0}%</div></div>
        </div>
        {Object.keys(byBundle).length > 0 && <div className="card" style={{ marginBottom: 20 }}><div className="card-title" style={{ marginBottom: 14 }}>Performance by Bundle</div><div className="table-wrap"><table><thead><tr><th>Bundle</th><th className="td-right">Sold</th><th className="td-right">Revenue</th><th className="td-right">Savings Given</th></tr></thead><tbody>{Object.entries(byBundle).map(([id, data]) => (<tr key={id}><td className="td-bold">{data.name}</td><td className="td-right td-mono">{data.count}</td><td className="td-right td-mono td-green">{data.revenue.toLocaleString()}</td><td className="td-right td-mono td-amber">{data.savings.toLocaleString()}</td></tr>))}</tbody></table></div></div>}
        <div className="card"><div className="card-title" style={{ marginBottom: 14 }}>Recent Bundle Sales</div>
          {salesLoading ? <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)' }}>Loading...</div>
          : bundleSales.length === 0 ? <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No bundle sales in this period.</div>
          : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>Bundle</th><th>Customer</th><th className="td-right">Price</th><th className="td-right">Saved</th><th>Sold By</th></tr></thead><tbody>{bundleSales.map((s, i) => (<tr key={i}><td className="td-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{s.posting_date}</td><td className="td-mono td-amber">{s.voucher_ref}</td><td className="td-bold">{s.bundle?.name || '-'}</td><td>{s.customer_name || '-'}</td><td className="td-right td-mono td-green">{s.bundle_price.toLocaleString()}</td><td className="td-right td-mono td-amber">{s.savings.toLocaleString()}</td><td style={{ fontSize: 11, color: 'var(--text3)' }}>{s.sold_by}</td></tr>))}</tbody></table></div>}
        </div>
      </>)}

      {showForm && (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '94%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800 }}>{editBundle ? 'Edit Bundle' : 'New Bundle'}</div><button onClick={() => setShowForm(false)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--text3)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button></div>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Bundle Code</label><input className="form-input" placeholder="e.g. BDL-001" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Bundle Name</label><input className="form-input" placeholder="e.g. New Mom Essentials" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            </div>
            <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Description</label><input className="form-input" placeholder="Short description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 8 }}>Products in Bundle</label>
              {form.items.map((item, i) => (<div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <select className="form-input" style={{ fontSize: 12 }} value={item.product_id} onChange={e => { const items = [...form.items]; items[i] = { ...items[i], product_id: e.target.value }; setForm({ ...form, items }) }}><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({tzs(p.selling_price)})</option>)}</select>
                <input type="number" className="form-input" style={{ textAlign: 'center', fontSize: 13, fontWeight: 700 }} min={1} value={item.qty} onChange={e => { const items = [...form.items]; items[i] = { ...items[i], qty: parseInt(e.target.value) || 1 }; setForm({ ...form, items }) }} />
                {form.items.length > 1 ? <button onClick={() => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>x</button> : <div />}
              </div>))}
              <button className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, items: [...form.items, { product_id: '', qty: 1 }] })}>+ Add product</button>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', color: 'var(--text3)' }}><span>Individual total</span><span style={{ fontFamily: 'var(--mono)', textDecoration: 'line-through' }}>{tzs(individualTotal)}</span></div>
              <div style={{ marginTop: 10 }}><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Bundle Price (TZS)</label><input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800 }} value={form.bundle_price} onChange={e => setForm({ ...form, bundle_price: parseFloat(e.target.value) || 0 })} /></div>
              {form.bundle_price > 0 && individualTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, padding: '10px 0 0', borderTop: '1px solid var(--border)', marginTop: 10 }}><span style={{ color: 'var(--accent)' }}>Customer saves</span><span style={{ fontFamily: 'var(--mono)', color: formSavings > 0 ? 'var(--green)' : 'var(--red)' }}>{tzs(formSavings)} ({formSavingsPct}%)</span></div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowForm(false)}>Cancel</button><button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>{saving ? 'Saving...' : editBundle ? 'Update Bundle' : 'Create Bundle'}</button></div>
          </div>
        </div>
      </div>)}
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
