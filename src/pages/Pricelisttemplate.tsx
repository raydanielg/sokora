import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'

const SOKORA_LOGO = "data:image/jpeg;base64,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"

interface PLSettings {
  company_name: string; tagline: string; address: string
  phone: string; email: string; website: string
  primary_color: string; accent_color: string
  show_images: boolean; show_sku: boolean; show_category: boolean
  show_cost: boolean; show_margin: boolean
  footer_note: string; logo_url: string
}

interface PLProduct {
  id: string; sku: string; name: string; category: string
  selling_price: number; cost_price: number; unit: string
  qty_on_hand: number; is_active: boolean
}

const DEFAULT: PLSettings = {
  company_name: 'Your Organization',
  tagline: 'Reimagining Motherhood',
  address: 'Dar es Salaam, Tanzania',
  phone: '+255 700 000 000',
  email: 'hello@sokora.app',
  website: 'www.sokora.app',
  primary_color: '#85c2be',
  accent_color: '#f7a6ad',
  show_images: false,
  show_sku: true,
  show_category: true,
  show_cost: false,
  show_margin: false,
  footer_note: 'Valid for 30 days · Subject to change without notice',
  logo_url: '',
}

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'print') return <svg {...p}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
  if (n === 'csv') return <svg {...p}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 3v18M2 9h20M2 15h20"/></svg>
  if (n === 'wa') return <svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
  if (n === 'save') return <svg {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
  if (n === 'filter') return <svg {...p}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

// ── PRICELIST DOCUMENT ────────────────────────────────────────────────────
const PricelistDocument = ({ products, settings, selectedCats, listTitle }: {
  products: PLProduct[]; settings: PLSettings
  selectedCats: string[]; listTitle: string
}) => {
  const p = settings.primary_color
  const a = settings.accent_color
  const displayed = products.filter(prod => selectedCats.includes(prod.category))
  const grouped = displayed.reduce((g, prod) => {
    if (!g[prod.category]) g[prod.category] = []
    g[prod.category].push(prod)
    return g
  }, {} as Record<string, PLProduct[]>)

  return (
    <div id="sokora-pricelist" style={{ width: 680, background: '#fff', fontFamily: "'Instrument Sans', sans-serif", color: '#1a1a1a', fontSize: 12 }}>
      {/* Header */}
      <div style={{ padding: '28px 36px 20px', borderBottom: `3px solid ${p}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={settings.logo_url || SOKORA_LOGO} alt="SOKORA" style={{ height: 90, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: "'Syne', serif", fontSize: 22, fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.5px', lineHeight: 1.1 }}>{settings.company_name}</div>
              <div style={{ fontSize: 11, color: p, fontStyle: 'italic', marginTop: 3 }}>{settings.tagline}</div>
              <div style={{ fontSize: 10, color: '#888', marginTop: 5, fontFamily: "'DM Mono', monospace", lineHeight: 1.7 }}>
                {settings.address}<br/>{settings.phone} · {settings.email}<br/>{settings.website}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'Syne', serif", fontSize: 30, fontWeight: 800, color: p, letterSpacing: '-1px' }}>PRICE LIST</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginTop: 6 }}>{listTitle}</div>
            <div style={{ fontSize: 10, color: '#999', fontFamily: "'DM Mono', monospace", marginTop: 6, lineHeight: 1.7 }}>
              Date: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}<br/>
              {displayed.length} products
            </div>
          </div>
        </div>
      </div>

      {/* Products by category */}
      <div style={{ padding: '16px 36px' }}>
        {Object.entries(grouped).map(([cat, prods]) => (
          <div key={cat} style={{ marginBottom: 24 }}>
            {/* Category header */}
            <div style={{ background: `${p}15`, borderLeft: `4px solid ${p}`, padding: '8px 14px', marginBottom: 10, borderRadius: '0 6px 6px 0' }}>
              <div style={{ fontFamily: "'Syne', serif", fontSize: 14, fontWeight: 700, color: p }}>{cat}</div>
              <div style={{ fontSize: 10, color: '#999', fontFamily: "'DM Mono', monospace" }}>{prods.length} products</div>
            </div>

            {/* Products table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f8f8' }}>
                  {settings.show_sku && <th style={{ padding: '7px 10px', textAlign: 'left', fontFamily: "'DM Mono', monospace", fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: '#888', width: 70 }}>SKU</th>}
                  <th style={{ padding: '7px 10px', textAlign: 'left', fontFamily: "'DM Mono', monospace", fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: '#888' }}>Product</th>
                  <th style={{ padding: '7px 10px', textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: '#888', width: 50 }}>Unit</th>
                  {settings.show_cost && <th style={{ padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: '#888', width: 100 }}>Cost (TZS)</th>}
                  <th style={{ padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: '#888', width: 110 }}>Price (TZS)</th>
                  {settings.show_margin && <th style={{ padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: '#888', width: 60 }}>Margin</th>}
                </tr>
              </thead>
              <tbody>
                {prods.map((prod, i) => {
                  const margin = prod.selling_price > 0 ? Math.round(((prod.selling_price - prod.cost_price) / prod.selling_price) * 100) : 0
                  return (
                    <tr key={prod.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      {settings.show_sku && <td style={{ padding: '8px 10px', fontFamily: "'DM Mono', monospace", color: p, fontSize: 10 }}>{prod.sku}</td>}
                      <td style={{ padding: '8px 10px', fontWeight: 500, fontSize: 12 }}>{prod.name}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: '#888', fontSize: 11 }}>{prod.unit}</td>
                      {settings.show_cost && <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{prod.cost_price.toLocaleString()}</td>}
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: p }}>{prod.selling_price.toLocaleString()}</td>
                      {settings.show_margin && <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 11, color: margin >= 40 ? '#1a7a4a' : margin >= 20 ? '#e67e22' : '#c0392b' }}>{margin}%</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ margin: '0 36px', padding: '14px 0', borderTop: `1px solid ${p}40`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: '#999', fontStyle: 'italic', maxWidth: '60%' }}>{settings.footer_note}</div>
        <div style={{ fontFamily: "'Syne', serif", fontSize: 13, fontWeight: 700, color: p }}>{settings.company_name}</div>
      </div>
      <div style={{ height: 6, background: `linear-gradient(90deg, ${p} 0%, ${a} 100%)` }}></div>
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────
export default function PricelistTemplate() {
  const [settings, setSettings] = useState<PLSettings>(DEFAULT)
  const [products, setProducts] = useState<PLProduct[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [listTitle, setListTitle] = useState('Retail Price List')
  const [activeTab, setActiveTab] = useState<'preview'|'settings'>('preview')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const set = (k: keyof PLSettings, v: any) => setSettings(s => ({ ...s, [k]: v }))

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const [{ data: settingsData }, { data: prods }, { data: catData }] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'pricelist_template').single(),
      supabase.from('products').select('id,sku,name,category,selling_price,cost_price,unit,qty_on_hand,is_active').eq('is_active', true).order('category').order('name'),
      supabase.from('system_settings').select('value').eq('key', 'product_categories').single(),
    ])
    if (settingsData?.value) { try { setSettings({ ...DEFAULT, ...JSON.parse(settingsData.value) }) } catch {} }
    if (prods) {
      setProducts(prods)
      const cats = [...new Set(prods.map((p: PLProduct) => p.category))] as string[]
      setCategories(cats)
      setSelectedCats(cats)
    }
    if (catData?.value) { try { setCategories(JSON.parse(catData.value) as string[]) } catch {} }
  }

  const save = async () => {
    setSaving(true)
    await supabase.from('system_settings').upsert({ key: 'pricelist_template', value: JSON.stringify(settings) }, { onConflict: 'key' })
    setSaved(true); setTimeout(() => setSaved(false), 2000); setSaving(false)
    setToast('Pricelist template saved'); setToastType('success')
  }

  const printPricelist = () => {
    const el = document.getElementById('sokora-pricelist')
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Price List — ${listTitle}</title>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@500;600&display=swap" rel="stylesheet">
      <style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;justify-content:center;padding:20px;background:#f0f0f0}@media print{body{background:#fff;padding:0}}</style>
    </head><body>${el.outerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 600)
  }

  const exportCSV = () => {
    const displayed = products.filter(p => selectedCats.includes(p.category))
    const rows = [['SKU', 'Product', 'Category', 'Unit', 'Price (TZS)', settings.show_cost ? 'Cost (TZS)' : '', settings.show_margin ? 'Margin %' : ''].filter(Boolean)]
    displayed.forEach(p => {
      const margin = p.selling_price > 0 ? Math.round(((p.selling_price - p.cost_price) / p.selling_price) * 100) : 0
      rows.push([p.sku, `"${p.name}"`, p.category, p.unit, String(p.selling_price), settings.show_cost ? String(p.cost_price) : '', settings.show_margin ? String(margin) + '%' : ''].filter((_, i) => rows[0][i] !== undefined))
    })
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `SOKORA_Pricelist_${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  const Toggle = ({ label, k }: { label: string; k: keyof PLSettings }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <div onClick={() => set(k, !settings[k])} style={{ width: 40, height: 22, background: settings[k] ? 'var(--green)' : 'var(--surface3)', borderRadius: 11, cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 2, left: settings[k] ? 20 : 2, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}></div>
      </div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Price List</div>
          <div className="page-sub">Branded product price list · Print · PDF · CSV · WhatsApp</div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 4 }}>
            {(['preview', 'settings'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: activeTab === t ? 'var(--accent)' : 'transparent', color: activeTab === t ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderRadius: 'var(--r)', transition: 'all .15s', textTransform: 'capitalize' }}>{t}</button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={exportCSV}><Ic n="csv" s={13} /> CSV</button>
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={printPricelist}><Ic n="print" s={13} /> Print / PDF</button>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={save} disabled={saving}><Ic n="save" s={13} c="#fff" /> {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Template'}</button>
        </div>
      </div>

      {activeTab === 'preview' ? (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* Controls */}
          <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>List Title</div>
              <input className="form-input" style={{ fontSize: 12 }} value={listTitle} onChange={e => setListTitle(e.target.value)} placeholder="e.g. Retail Price List" />
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Categories</div>
              {categories.map(cat => {
                const checked = selectedCats.includes(cat)
                return (
                  <div key={cat} onClick={() => setSelectedCats(checked ? selectedCats.filter(c => c !== cat) : [...selectedCats, cat])}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: checked ? 'var(--accent)' : 'var(--surface3)', border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {checked && <svg width="8" height="8" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span style={{ fontSize: 12 }}>{cat}</span>
                    <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto', fontFamily: 'var(--mono)' }}>{products.filter(p => p.category === cat).length}</span>
                  </div>
                )
              })}
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>{products.filter(p => selectedCats.includes(p.category)).length} products selected</div>
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 10 }}>Show/Hide</div>
              <Toggle label="Show SKU" k="show_sku" />
              <Toggle label="Show Cost Price" k="show_cost" />
              <Toggle label="Show Margin %" k="show_margin" />
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 10 }}>Brand Color</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                <input className="form-input" style={{ flex: 1, fontSize: 12, fontFamily: 'var(--mono)' }} value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} />
              </div>
            </div>
          </div>
          {/* Preview */}
          <div style={{ flex: 1, overflowX: 'auto' }}>
            <PricelistDocument products={products} settings={settings} selectedCats={selectedCats} listTitle={listTitle} />
          </div>
        </div>
      ) : (
        <div className="grid g2" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Company Details</div>
            {([
              { label: 'Company Name', k: 'company_name' },
              { label: 'Tagline', k: 'tagline' },
              { label: 'Address', k: 'address' },
              { label: 'Phone', k: 'phone' },
              { label: 'Email', k: 'email' },
              { label: 'Website', k: 'website' },
            ] as { label: string; k: keyof PLSettings }[]).map(f => (
              <div key={f.k} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>{f.label}</div>
                <input className="form-input" style={{ fontSize: 12 }} value={String(settings[f.k])} onChange={e => set(f.k, e.target.value)} />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Footer Note</div>
              <textarea className="form-input" rows={2} style={{ resize: 'none', fontSize: 12 }} value={settings.footer_note} onChange={e => set('footer_note', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Logo</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 70, height: 70, border: '2px dashed var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={settings.logo_url || SOKORA_LOGO} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <div>
                  <label style={{ display: 'inline-block', cursor: 'pointer', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 12px', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Upload Logo
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                      const file = e.target.files?.[0]; if (!file) return
                      const reader = new FileReader()
                      reader.onload = ev => set('logo_url', ev.target?.result as string)
                      reader.readAsDataURL(file)
                    }} />
                  </label>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>PNG or JPG · Shown top-left</div>
                  {settings.logo_url && <button onClick={() => set('logo_url', '')} style={{ fontSize: 10, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>Use default logo</button>}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Brand Colors</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>Primary (Teal)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="color" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                  <input className="form-input" style={{ flex: 1, fontSize: 12, fontFamily: 'var(--mono)' }} value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>Accent (Blush)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="color" value={settings.accent_color} onChange={e => set('accent_color', e.target.value)} style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                  <input className="form-input" style={{ flex: 1, fontSize: 12, fontFamily: 'var(--mono)' }} value={settings.accent_color} onChange={e => set('accent_color', e.target.value)} />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Visibility Defaults</div>
              <Toggle label="Show SKU" k="show_sku" />
              <Toggle label="Show Cost Price" k="show_cost" />
              <Toggle label="Show Margin %" k="show_margin" />
              <Toggle label="Show Category Headers" k="show_category" />
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
