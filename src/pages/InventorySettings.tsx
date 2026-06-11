import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import type { Page } from '../lib/types'
import { DEFAULT_CATEGORIES, DEFAULT_GROUPS, invalidateCategoryCache } from '../lib/useCategories'
import type { ProductCategory } from '../lib/useCategories'

interface Props { onNav: (p: Page) => void }

interface InvSettings {
  // Stock control
  block_negative_stock: boolean
  block_sell_below_cost: boolean
  warn_below_min_margin: boolean
  global_min_margin: number
  allow_price_edit_pos: boolean
  max_discount_pct: number
  // Costing & valuation
  costing_method: string
  default_usd_rate: number
  include_landed_cost: boolean
  // Visibility
  show_cost_to: string
  show_margin_to: string
  // Reorder alerts
  reorder_notify_whatsapp: boolean
  reorder_notify_users: string[]
  // Stock taking
  stocktake_frequency: string
  freeze_on_stocktake: boolean
  variance_threshold: number
  // Date restrictions
  lock_posting_to_today: boolean
  backdate_super_admin_only: boolean
  // Product defaults
  auto_sku_prefix: string
}

const DEFAULT: InvSettings = {
  block_negative_stock: true,
  block_sell_below_cost: true,
  warn_below_min_margin: true,
  global_min_margin: 25,
  allow_price_edit_pos: false,
  max_discount_pct: 10,
  costing_method: 'average',
  default_usd_rate: 2540,
  include_landed_cost: false,
  show_cost_to: 'admin',
  show_margin_to: 'admin',
  reorder_notify_whatsapp: false,
  reorder_notify_users: ['Joe Gembe', 'Jane Mwatonoka'],
  stocktake_frequency: 'monthly',
  freeze_on_stocktake: false,
  variance_threshold: 5,
  lock_posting_to_today: true,
  backdate_super_admin_only: true,
  auto_sku_prefix: 'MK-',
}

const USERS = ['Joe Gembe', 'Jane Mwatonoka', 'Barbra Kabendera', 'Lilian Mallya', 'Sophia Kipanta']
const ACCESS_OPTIONS = [{ v: 'admin', l: 'Super Admin only' }, { v: 'all', l: 'All users' }, { v: 'sales', l: 'Sales & Admin' }]

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'save')    return <svg {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
  if (n === 'pricelist') return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
  if (n === 'alert')   return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
  if (n === 'lock')    return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  if (n === 'usd')     return <svg {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
  if (n === 'eye')     return <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  if (n === 'box')     return <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
  if (n === 'tag')     return <svg {...p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const Toggle = ({ label, desc, val, onChange }: { label: string; desc: string; val: boolean; onChange: (v: boolean) => void }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
    <div><div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div><div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{desc}</div></div>
    <div onClick={() => onChange(!val)} style={{ width: 44, height: 24, background: val ? 'var(--green)' : 'var(--surface3)', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0, marginLeft: 16 }}>
      <div style={{ position: 'absolute', top: 2, left: val ? 22 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}></div>
    </div>
  </div>
)

const Section = ({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) => (
  <div className="card" style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Ic n={icon} s={16} c="var(--accent)" />
      </div>
      <div className="card-title" style={{ margin: 0 }}>{title}</div>
    </div>
    {children}
  </div>
)

export default function InventorySettings({ onNav }: Props) {
  const [settings, setSettings] = useState<InvSettings>(DEFAULT)
  const [categories, setCategories] = useState<ProductCategory[]>(DEFAULT_CATEGORIES)
  const [groups, setGroups] = useState<string[]>(DEFAULT_GROUPS)
  const [units, setUnits] = useState<string[]>(['Piece', 'Pack', 'Bottle', 'Tube', 'Box', 'Set'])
  const [newCat, setNewCat] = useState('')
  const [newCatGroup, setNewCatGroup] = useState('Other')
  const [newCatColor, setNewCatColor] = useState('#85c2be')
  const [newGroup, setNewGroup] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [activeTab, setActiveTab] = useState<'stock'|'valuation'|'visibility'|'alerts'|'stocktake'|'products'>('stock')

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'inventory_settings').single()
    if (data?.value) { try { setSettings({ ...DEFAULT, ...JSON.parse(data.value) }) } catch {} }

    // Load structured categories (v2 format)
    const { data: catV2 } = await supabase.from('system_settings').select('value').eq('key', 'product_categories_v2').single()
    if (catV2?.value) {
      try {
        const parsed = JSON.parse(catV2.value)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCategories(parsed)
          setGroups([...new Set(parsed.map((c: ProductCategory) => c.group))] as string[])
        }
      } catch {}
    } else {
      // Migrate from legacy flat list
      const { data: catLegacy } = await supabase.from('system_settings').select('value').eq('key', 'product_categories').single()
      if (catLegacy?.value) {
        try {
          // legacy flat list exists -- migrate to structured defaults
          setCategories(DEFAULT_CATEGORIES)
        } catch {}
      }
    }

    const { data: unitData } = await supabase.from('system_settings').select('value').eq('key', 'product_units').single()
    if (unitData?.value) { try { setUnits(JSON.parse(unitData.value)) } catch {} }
  }

  const set = (k: keyof InvSettings, v: any) => setSettings(s => ({ ...s, [k]: v }))

  const save = async () => {
    setSaving(true)
    await Promise.all([
      supabase.from('system_settings').upsert({ key: 'inventory_settings', value: JSON.stringify(settings) }, { onConflict: 'key' }),
      supabase.from('system_settings').upsert({ key: 'product_categories_v2', value: JSON.stringify(categories) }, { onConflict: 'key' }),
      // Keep legacy key in sync for backward compat
      supabase.from('system_settings').upsert({ key: 'product_categories', value: JSON.stringify(categories.map(c => c.name)) }, { onConflict: 'key' }),
      supabase.from('system_settings').upsert({ key: 'product_units', value: JSON.stringify(units) }, { onConflict: 'key' }),
    ])
    invalidateCategoryCache()
    setSaved(true); setTimeout(() => setSaved(false), 2000); setSaving(false)
    setToast('Inventory settings saved'); setToastType('success')
  }

  const addCategory = () => {
    if (!newCat.trim() || categories.find(c => c.name === newCat.trim())) return
    const newEntry: ProductCategory = {
      name: newCat.trim(),
      group: newCatGroup,
      color: newCatColor,
      sort_order: categories.length + 1,
    }
    setCategories([...categories, newEntry])
    setNewCat('')
  }

  const addGroup = () => {
    if (!newGroup.trim() || groups.includes(newGroup.trim())) return
    setGroups([...groups, newGroup.trim()])
    setNewGroup('')
  }

  const removeCategory = (name: string) => setCategories(categories.filter(c => c.name !== name))
  const removeGroup = (group: string) => {
    setGroups(groups.filter(g => g !== group))
    // Move orphaned categories to 'Other'
    setCategories(categories.map(c => c.group === group ? { ...c, group: 'Other' } : c))
  }

  const addUnit = () => {
    if (!newUnit.trim() || units.includes(newUnit.trim())) return
    setUnits([...units, newUnit.trim()]); setNewUnit('')
  }

  const TABS = [
    { id: 'stock', label: 'Stock Control' },
    { id: 'valuation', label: 'Valuation' },
    { id: 'visibility', label: 'Visibility' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'stocktake', label: 'Stock Taking' },
    { id: 'products', label: 'Products' },
  ] as const

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic n="box" s={22} c="var(--accent)" />
          </div>
          <div>
            <div className="page-title">Inventory Settings</div>
            <div className="page-sub">Stock control · Valuation · Alerts · Product configuration</div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => onNav('pricelist-template')}>
            <Ic n="pricelist" s={13} /> Price List Template
          </button>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={save} disabled={saving}>
            <Ic n="save" s={13} c="#fff" /> {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save All Settings'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── STOCK CONTROL ─────────────────────────────── */}
      {activeTab === 'stock' && (
        <div className="grid g2" style={{ gap: 20 }}>
          <div>
            <Section icon="lock" title="Stock Restrictions">
              <Toggle label="Block Negative Stock" desc="Prevent posting if stock would go below zero. Recommended ON." val={settings.block_negative_stock} onChange={v => set('block_negative_stock', v)} />
              <Toggle label="Block Selling Below Cost" desc="Block cash sale and invoice if selling price is below cost." val={settings.block_sell_below_cost} onChange={v => set('block_sell_below_cost', v)} />
              <Toggle label="Warn Below Minimum Margin" desc="Show warning when margin is below the threshold set below." val={settings.warn_below_min_margin} onChange={v => set('warn_below_min_margin', v)} />
              <div style={{ marginTop: 14 }}>
                <FG label="Global Minimum Margin (%)">
                  <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', width: 120 }} value={settings.global_min_margin} onChange={e => set('global_min_margin', parseFloat(e.target.value) || 0)} />
                </FG>
              </div>
            </Section>
            <Section icon="tag" title="POS / Sales Restrictions">
              <Toggle label="Allow Price Editing at POS" desc="Allow cashiers to change selling price during Cash Sale." val={settings.allow_price_edit_pos} onChange={v => set('allow_price_edit_pos', v)} />
              <div style={{ marginTop: 14 }}>
                <FG label="Maximum Discount % at POS">
                  <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', width: 120 }} value={settings.max_discount_pct} onChange={e => set('max_discount_pct', parseFloat(e.target.value) || 0)} />
                </FG>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Set to 0 to block all discounts. Max 100.</div>
              </div>
            </Section>
            <Section icon="lock" title="Date & Posting Restrictions">
              <Toggle label="Lock All Entries to Today's Date" desc="All vouchers (sales, payments, journals) can only be posted on today's date. No backdating allowed." val={settings.lock_posting_to_today} onChange={v => set('lock_posting_to_today', v)} />
              <Toggle label="Super Admin Can Backdate" desc="When date lock is ON, super admins can still post to past dates. Other users are blocked." val={settings.backdate_super_admin_only} onChange={v => set('backdate_super_admin_only', v)} />
              {settings.lock_posting_to_today && (
                <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 11, color: 'var(--accent)' }}>
                  Date lock is active. {settings.backdate_super_admin_only ? 'Only super admins can backdate entries.' : 'Nobody can backdate entries, including admins.'}
                </div>
              )}
            </Section>
          </div>
          <div>
            <div className="card" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Current Rules Summary</div>
              {[
                { label: 'Negative stock', val: settings.block_negative_stock ? 'Blocked' : 'Allowed', ok: settings.block_negative_stock },
                { label: 'Sell below cost', val: settings.block_sell_below_cost ? 'Blocked' : 'Allowed', ok: settings.block_sell_below_cost },
                { label: 'Min margin', val: `${settings.global_min_margin}%`, ok: settings.warn_below_min_margin },
                { label: 'Price edit at POS', val: settings.allow_price_edit_pos ? 'Allowed' : 'Blocked', ok: !settings.allow_price_edit_pos },
                { label: 'Max discount', val: `${settings.max_discount_pct}%`, ok: settings.max_discount_pct <= 15 },
                { label: 'Date lock', val: settings.lock_posting_to_today ? 'Today only' : 'Any date', ok: settings.lock_posting_to_today },
                { label: 'Admin backdate', val: settings.backdate_super_admin_only ? 'Super admin only' : 'Disabled', ok: settings.backdate_super_admin_only },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ color: 'var(--text3)' }}>{item.label}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: item.ok ? 'var(--green)' : 'var(--yellow)' }}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── VALUATION ─────────────────────────────────── */}
      {activeTab === 'valuation' && (
        <div className="grid g2" style={{ gap: 20 }}>
          <Section icon="usd" title="Costing & Currency">
            <div style={{ marginBottom: 14 }}>
              <FG label="Costing Method">
                <select className="form-input" value={settings.costing_method} onChange={e => set('costing_method', e.target.value)}>
                  <option value="average">Average Cost (Recommended for SOKORA)</option>
                  <option value="fifo">FIFO — First In First Out</option>
                  <option value="specific">Specific Identification</option>
                </select>
              </FG>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Average cost recalculates on every GRN. Best for SOKORA's import model.</div>
            </div>
            <FG label="Default USD/TZS Exchange Rate">
              <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)' }} value={settings.default_usd_rate} onChange={e => set('default_usd_rate', parseFloat(e.target.value) || 2540)} />
            </FG>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>Used in Purchase Orders and GRN costing. Update when rate changes significantly.</div>
            <Toggle label="Include Landed Cost in Average Cost" desc="Add freight, customs, and handling to product cost on GRN." val={settings.include_landed_cost} onChange={v => set('include_landed_cost', v)} />
          </Section>
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(212,135,74,.08) 0%, rgba(212,135,74,.04) 100%)', border: '1px solid rgba(212,135,74,.2)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--accent)' }}>How Average Cost Works</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.8 }}>
              When you receive goods (GRN), the average cost recalculates:<br/>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontSize: 11 }}>New Avg = (Old Qty × Old Cost + New Qty × New Cost) ÷ Total Qty</span><br/><br/>
              This is the correct method for SOKORA because you buy in USD and the rate changes. Each shipment may have a different landed cost. Average cost smooths this out across your entire stock.
            </div>
          </div>
        </div>
      )}

      {/* ── VISIBILITY ────────────────────────────────── */}
      {activeTab === 'visibility' && (
        <div className="grid g2" style={{ gap: 20 }}>
          <Section icon="eye" title="Data Visibility">
            <div style={{ marginBottom: 14 }}>
              <FG label="Show Cost Prices to">
                <select className="form-input" value={settings.show_cost_to} onChange={e => set('show_cost_to', e.target.value)}>
                  {ACCESS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </FG>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Controls who sees cost prices in Inventory and reports.</div>
            </div>
            <div>
              <FG label="Show Margin % to">
                <select className="form-input" value={settings.show_margin_to} onChange={e => set('show_margin_to', e.target.value)}>
                  {ACCESS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </FG>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Controls who sees margin % in product list and reports.</div>
            </div>
          </Section>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Visibility Matrix</div>
            <table style={{ width: '100%', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>User Role</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Cost Price</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Margin %</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { role: 'Super Admin (Joe, Jane)', canCost: true, canMargin: true },
                  { role: 'Sales (Lilian)', canCost: settings.show_cost_to === 'all' || settings.show_cost_to === 'sales', canMargin: settings.show_margin_to === 'all' || settings.show_margin_to === 'sales' },
                  { role: 'CRM (Barbra)', canCost: settings.show_cost_to === 'all', canMargin: settings.show_margin_to === 'all' },
                ].map(row => (
                  <tr key={row.role} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px' }}>{row.role}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: row.canCost ? 'var(--green)' : 'var(--red)' }}>{row.canCost ? '✓' : '✗'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: row.canMargin ? 'var(--green)' : 'var(--red)' }}>{row.canMargin ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ALERTS ────────────────────────────────────── */}
      {activeTab === 'alerts' && (
        <div className="grid g2" style={{ gap: 20 }}>
          <Section icon="alert" title="Reorder Alerts">
            <Toggle label="Send WhatsApp Reorder Alerts" desc="Send WhatsApp message when a product hits its reorder point." val={settings.reorder_notify_whatsapp} onChange={v => set('reorder_notify_whatsapp', v)} />
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Notify These Users</div>
              {USERS.map(u => {
                const checked = settings.reorder_notify_users.includes(u)
                return (
                  <div key={u} onClick={() => set('reorder_notify_users', checked ? settings.reorder_notify_users.filter(x => x !== u) : [...settings.reorder_notify_users, u])}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: checked ? 'var(--green)' : 'var(--surface3)', border: `2px solid ${checked ? 'var(--green)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {checked && <svg width="10" height="10" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span style={{ fontSize: 13 }}>{u}</span>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', padding: '10px 12px', borderRadius: 8 }}>
              Alerts trigger when qty_on_hand ≤ reorder_point during any stock-reducing voucher (Cash Sale, Sales Invoice, Stock Adjustment).
              {!settings.reorder_notify_whatsapp && <div style={{ color: 'var(--yellow)', marginTop: 4 }}>Configure WhatsApp in Settings → WhatsApp to activate sending.</div>}
            </div>
          </Section>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Recent Reorder Alerts</div>
            <ReorderAlerts />
          </div>
        </div>
      )}

      {/* ── STOCK TAKING ──────────────────────────────── */}
      {activeTab === 'stocktake' && (
        <div className="grid g2" style={{ gap: 20 }}>
          <Section icon="box" title="Stock Taking Configuration">
            <div style={{ marginBottom: 14 }}>
              <FG label="Stock Take Frequency">
                <select className="form-input" value={settings.stocktake_frequency} onChange={e => set('stocktake_frequency', e.target.value)}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                </select>
              </FG>
            </div>
            <Toggle label="Freeze Transactions During Stock Take" desc="Block all stock-affecting vouchers while counting is in progress." val={settings.freeze_on_stocktake} onChange={v => set('freeze_on_stocktake', v)} />
            <div style={{ marginTop: 14 }}>
              <FG label="Acceptable Variance Threshold (%)">
                <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', width: 120 }} value={settings.variance_threshold} onChange={e => set('variance_threshold', parseFloat(e.target.value) || 0)} />
              </FG>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Variances above this % require Super Admin approval before posting.</div>
            </div>
          </Section>
          <div className="card" style={{ background: 'var(--surface2)' }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Stock Take Process</div>
            {[
              '1. Go to Vouchers → Stock Adjustment',
              '2. Set Adjustment Type to "Stock Take"',
              '3. Enter counted quantities per location (1001, 1002)',
              '4. System calculates variance vs expected qty',
              '5. Variances above threshold require approval',
              '6. Post adjustment — Dr/Cr Stock Loss account',
            ].map((step, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text2)', padding: '6px 0', borderBottom: '1px solid var(--border)', lineHeight: 1.5 }}>{step}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── PRODUCTS ──────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="grid g2" style={{ gap: 20 }}>
          <div>
            {/* Groups */}
            <Section icon="tag" title="Inventory Groups">
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.6 }}>
                Groups are the top level. Each category belongs to a group. Filter any report by group to see all its categories at once.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {groups.map(g => (
                  <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 10px 4px 12px', fontSize: 12, fontWeight: 600 }}>
                    {g}
                    {g !== 'Other' && (
                      <button onClick={() => removeGroup(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="New group name (e.g. Maternity)" value={newGroup} onChange={e => setNewGroup(e.target.value)} onKeyDown={e => e.key === 'Enter' && addGroup()} />
                <button className="btn btn-primary btn-sm" onClick={addGroup}>Add Group</button>
              </div>
            </Section>

            {/* Categories */}
            <Section icon="tag" title="Product Categories">
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.6 }}>
                Categories are assigned to each product. Use them to filter reports, sales, stock summaries, and more.
              </div>

              {/* Categories grouped */}
              {groups.map(group => {
                const groupCats = categories.filter(c => c.group === group)
                if (groupCats.length === 0) return null
                return (
                  <div key={group} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{group}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {groupCats.map(cat => (
                        <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface2)', border: `1.5px solid ${cat.color}22`, borderRadius: 20, padding: '4px 10px 4px 10px', fontSize: 12 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                          {cat.name}
                          <button onClick={() => removeCategory(cat.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Add new category */}
              <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 10 }}>Add New Category</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="form-input" style={{ flex: 2, minWidth: 120, fontSize: 12 }} placeholder="Category name" value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} />
                  <select className="form-input" style={{ flex: 1, minWidth: 100, fontSize: 12 }} value={newCatGroup} onChange={e => setNewCatGroup(e.target.value)}>
                    {groups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'var(--card)' }} title="Category color" />
                  <button className="btn btn-primary btn-sm" onClick={addCategory}>Add</button>
                </div>
              </div>
            </Section>
          </div>

          <div>
            {/* Units of measure */}
            <Section icon="box" title="Units of Measure">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {units.map(u => (
                  <div key={u} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 10px 4px 12px', fontSize: 12 }}>
                    {u}
                    <button onClick={() => setUnits(units.filter(x => x !== u))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="New unit" value={newUnit} onChange={e => setNewUnit(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUnit()} />
                <button className="btn btn-primary btn-sm" onClick={addUnit}>Add</button>
              </div>
            </Section>

            {/* SKU defaults */}
            <Section icon="tag" title="SKU & Product Defaults">
              <FG label="Auto SKU Prefix">
                <input className="form-input" style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700 }} value={settings.auto_sku_prefix} onChange={e => set('auto_sku_prefix', e.target.value)} placeholder="MK-" />
              </FG>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>New products get SKU: {settings.auto_sku_prefix}001, {settings.auto_sku_prefix}002 etc.</div>

              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Category filter appears in:</div>
                {[
                  'Inventory page', 'Cash Sale product search',
                  'Sales Invoice product search', 'Sales Day Book report',
                  'Sales Register', 'Stock Valuation Report',
                  'Purchase Register', 'Stock Transfer Register', 'Dashboard breakdown',
                ].map((item, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                    {item}
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}

// ── REORDER ALERTS SUB-COMPONENT ─────────────────────────────────────────
function ReorderAlerts() {
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.from('reorder_alerts').select('*').eq('acknowledged', false).order('alerted_at', { ascending: false }).limit(10)
        if (data) setAlerts(data as any[])
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const acknowledge = async (id: string) => {
    await supabase.from('reorder_alerts').update({ acknowledged: true, acknowledged_by: 'Joe Gembe', acknowledged_at: new Date().toISOString() }).eq('id', id)
    setAlerts(a => a.filter(x => x.id !== id))
  }

  if (loading) return <div style={{ fontSize: 12, color: 'var(--text3)' }}>Loading…</div>
  if (alerts.length === 0) return (
    <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--text3)' }}>
      No unacknowledged reorder alerts.
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {alerts.map(a => (
        <div key={a.id} style={{ background: 'var(--red-dim)', border: '1px solid rgba(255,71,87,.2)', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{a.product_name}</div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
              {a.sku} · Qty: <span style={{ color: 'var(--red)', fontWeight: 700 }}>{a.qty_on_hand}</span> · Reorder: {a.reorder_point}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => acknowledge(a.id)}>Acknowledge</button>
        </div>
      ))}
    </div>
  )
}
