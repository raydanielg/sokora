import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'

interface Branch {
  id: string; code: string; name: string; city: string
  address: string; is_active: boolean; is_default: boolean
}

interface StockLocation {
  id: string; code: string; branch_id: string; branch_code: string
  name: string; location_type: string; is_active: boolean; is_default: boolean
  allow_cash_sale: boolean; allow_sales_invoice: boolean
  allow_grn: boolean; allow_stock_transfer: boolean; allow_adjustment: boolean
}

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'branch') return <svg {...p}><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="21"/><path d="M5 21V16a7 7 0 0 1 14 0v5"/></svg>
  if (n === 'loc')    return <svg {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
  if (n === 'plus')   return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  if (n === 'edit')   return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  if (n === 'info')   return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const LOCATION_TYPES = ['storage', 'display', 'transit', 'virtual']
const VOUCHER_PERMS = [
  { key: 'allow_cash_sale',      label: 'Cash Sale',       desc: 'POS sales deduct from this location' },
  { key: 'allow_sales_invoice',  label: 'Sales Invoice',   desc: 'B2B invoice deducts from this location' },
  { key: 'allow_grn',            label: 'GRN / Receiving', desc: 'Goods received into this location' },
  { key: 'allow_stock_transfer', label: 'Stock Transfer',  desc: 'Items can be transferred to/from this location' },
  { key: 'allow_adjustment',     label: 'Stock Adjustment', desc: 'Manual adjustments allowed at this location' },
]

const EMPTY_BRANCH = { code: '', name: '', city: 'Dar es Salaam', address: '' }
const EMPTY_LOC = { code: '', branch_id: '', branch_code: '', name: '', location_type: 'storage', allow_cash_sale: true, allow_sales_invoice: true, allow_grn: true, allow_stock_transfer: true, allow_adjustment: true }

export default function LocationSettings() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [activeTab, setActiveTab] = useState<'locations'|'branches'>('locations')

  // Branch modal
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH)
  const setB = (k: string, v: string) => setBranchForm(f => ({ ...f, [k]: v }))

  // Location modal
  const [showLocModal, setShowLocModal] = useState(false)
  const [editLoc, setEditLoc] = useState<StockLocation | null>(null)
  const [locForm, setLocForm] = useState<typeof EMPTY_LOC>(EMPTY_LOC)
  const setL = (k: string, v: any) => setLocForm(f => ({ ...f, [k]: v }))

  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: br }, { data: lc }] = await Promise.all([
      supabase.from('branches').select('*').order('code'),
      supabase.from('stock_locations').select('*').order('code'),
    ])
    if (br) setBranches(br)
    if (lc) setLocations(lc)
    setLoading(false)
  }

  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  // Generate next branch code
  const nextBranchCode = () => {
    const codes = branches.map(b => parseInt(b.code) || 0)
    const next = codes.length > 0 ? Math.max(...codes) + 10 : 10
    return String(next)
  }

  // Generate next location code for a branch
  const nextLocCode = (branchCode: string) => {
    const branchLocs = locations.filter(l => l.branch_code === branchCode)
    const suffixes = branchLocs.map(l => parseInt(l.code.slice(2)) || 0)
    const nextSuffix = suffixes.length > 0 ? Math.max(...suffixes) + 1 : 1
    return `${branchCode}${String(nextSuffix).padStart(2, '0')}`
  }

  const openAddBranch = () => {
    setEditBranch(null)
    setBranchForm({ ...EMPTY_BRANCH, code: nextBranchCode() })
    setShowBranchModal(true)
  }

  const openEditBranch = (b: Branch) => {
    setEditBranch(b)
    setBranchForm({ code: b.code, name: b.name, city: b.city, address: b.address || '' })
    setShowBranchModal(true)
  }

  const openAddLoc = (branchId?: string, branchCode?: string) => {
    setEditLoc(null)
    setLocForm({ ...EMPTY_LOC, branch_id: branchId || '', branch_code: branchCode || '', code: branchCode ? nextLocCode(branchCode) : '' })
    setShowLocModal(true)
  }

  const openEditLoc = (l: StockLocation) => {
    setEditLoc(l)
    setLocForm({ code: l.code, branch_id: l.branch_id, branch_code: l.branch_code, name: l.name, location_type: l.location_type, allow_cash_sale: l.allow_cash_sale, allow_sales_invoice: l.allow_sales_invoice, allow_grn: l.allow_grn, allow_stock_transfer: l.allow_stock_transfer, allow_adjustment: l.allow_adjustment })
    setShowLocModal(true)
  }

  const saveBranch = async () => {
    if (!branchForm.code.trim() || !branchForm.name.trim()) { showToast('Branch code and name required', 'error'); return }
    setSaving(true)
    const payload = { code: branchForm.code.trim(), name: branchForm.name.trim(), city: branchForm.city, address: branchForm.address, is_active: true }
    const { error } = editBranch
      ? await supabase.from('branches').update(payload).eq('id', editBranch.id)
      : await supabase.from('branches').insert({ ...payload, is_default: branches.length === 0 })
    if (error) showToast(error.message, 'error')
    else { showToast(editBranch ? 'Branch updated' : 'Branch added'); setShowBranchModal(false); load() }
    setSaving(false)
  }

  const saveLoc = async () => {
    if (!locForm.code.trim() || !locForm.name.trim() || !locForm.branch_id) { showToast('Code, name and branch are required', 'error'); return }
    if (locForm.code.length !== 4) { showToast('Location code must be exactly 4 digits', 'error'); return }
    setSaving(true)
    const payload = { code: locForm.code.trim(), branch_id: locForm.branch_id, branch_code: locForm.branch_code, name: locForm.name.trim(), location_type: locForm.location_type, is_active: true, allow_cash_sale: locForm.allow_cash_sale, allow_sales_invoice: locForm.allow_sales_invoice, allow_grn: locForm.allow_grn, allow_stock_transfer: locForm.allow_stock_transfer, allow_adjustment: locForm.allow_adjustment }
    const { error } = editLoc
      ? await supabase.from('stock_locations').update(payload).eq('id', editLoc.id)
      : await supabase.from('stock_locations').insert({ ...payload, is_default: locations.filter(l => l.branch_id === locForm.branch_id).length === 0 })
    if (error) showToast(error.message, 'error')
    else { showToast(editLoc ? 'Location updated' : 'Location added'); setShowLocModal(false); load() }
    setSaving(false)
  }

  const toggleLocPerm = async (loc: StockLocation, key: string, val: boolean) => {
    await supabase.from('stock_locations').update({ [key]: val }).eq('id', loc.id)
    setLocations(ls => ls.map(l => l.id === loc.id ? { ...l, [key]: val } : l))
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Location Management</div>
          <div className="page-sub">Branches · Stock locations · Voucher permissions · 4-digit location codes</div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 4 }}>
            {(['locations', 'branches'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: activeTab === t ? 'var(--accent)' : 'transparent', color: activeTab === t ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderRadius: 'var(--r)', transition: 'all .15s', textTransform: 'capitalize' }}>{t}</button>
            ))}
          </div>
          {activeTab === 'locations'
            ? <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => openAddLoc()}><Ic n="plus" s={13} /> Add Location</button>
            : <button className="btn btn-primary btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={openAddBranch}><Ic n="plus" s={13} /> Add Branch</button>
          }
        </div>
      </div>

      {/* Location code explanation */}
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Ic n="info" s={16} c="var(--accent)" />
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          <strong>Location Code System:</strong> 4-digit format — first 2 digits = Branch, last 2 digits = Location.
          Example: <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>1001</span> = Branch 10 (Sinza DSM), Location 01 (Front Office) ·
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}> 1002</span> = Branch 10, Location 02 (Warehouse) ·
          Future Arusha branch: <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>2001</span>, <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>2002</span>
        </div>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div> : (

        activeTab === 'locations' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {branches.map(branch => {
              const branchLocs = locations.filter(l => l.branch_id === branch.id)
              return (
                <div key={branch.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Ic n="branch" s={18} c="var(--accent)" />
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700 }}>{branch.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Branch {branch.code} · {branch.city} · {branchLocs.length} locations</div>
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:6 }} onClick={() => openAddLoc(branch.id, branch.code)}>
                      <Ic n="plus" s={12} /> Add Location
                    </button>
                  </div>

                  {branchLocs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 12 }}>No locations yet. Add one above.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {branchLocs.map(loc => (
                        <div key={loc.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                          {/* Location header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Ic n="loc" s={16} c="var(--text3)" />
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 5 }}>{loc.code}</span>
                                  <span style={{ fontWeight: 600, fontSize: 14 }}>{loc.name}</span>
                                  <span style={{ fontSize: 10, color: 'var(--text3)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--mono)' }}>{loc.location_type}</span>
                                  {loc.is_default && <span style={{ fontSize: 9, color: 'var(--green)', background: 'var(--green-dim)', padding: '2px 6px', borderRadius: 4 }}>DEFAULT</span>}
                                </div>
                              </div>
                            </div>
                            <button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:4 }} onClick={() => openEditLoc(loc)}>
                              <Ic n="edit" s={12} /> Edit
                            </button>
                          </div>
                          {/* Permissions grid */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 0 }}>
                            {VOUCHER_PERMS.map((perm, i) => {
                              const allowed = loc[perm.key as keyof StockLocation] as boolean
                              return (
                                <div key={perm.key} onClick={() => toggleLocPerm(loc, perm.key, !allowed)}
                                  style={{ padding: '10px 12px', cursor: 'pointer', borderRight: i < 4 ? '1px solid var(--border)' : 'none', background: allowed ? 'rgba(0,229,160,.04)' : 'transparent', transition: 'background .15s', userSelect: 'none' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: allowed ? 'var(--green)' : 'var(--text3)' }}>{perm.label}</span>
                                    <div style={{ width: 14, height: 14, borderRadius: 3, background: allowed ? 'var(--green)' : 'var(--surface3)', border: `2px solid ${allowed ? 'var(--green)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      {allowed && <svg width="8" height="8" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 9, color: 'var(--text3)', lineHeight: 1.4 }}>{perm.desc}</div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* BRANCHES TAB */
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Code</th><th>Branch Name</th><th>City</th><th>Locations</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {branches.map((b, i) => (
                    <tr key={i}>
                      <td className="td-mono td-amber" style={{ fontSize: 14, fontWeight: 800 }}>{b.code}</td>
                      <td className="td-bold">{b.name}{b.is_default && <span style={{ fontSize: 9, color: 'var(--green)', marginLeft: 8, background: 'var(--green-dim)', padding: '2px 6px', borderRadius: 4 }}>DEFAULT</span>}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{b.city}</td>
                      <td><span className="pill pill-blue">{locations.filter(l => l.branch_id === b.id).length} locations</span></td>
                      <td><span className={`pill ${b.is_active ? 'pill-green' : 'pill-gray'}`}>{b.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td><button className="btn btn-ghost btn-sm" style={{ display:'flex',alignItems:'center',gap:4 }} onClick={() => openEditBranch(b)}><Ic n="edit" s={12} /> Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* BRANCH MODAL */}
      {showBranchModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100 }}>
          <div style={{ background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:28,width:480 }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
              <div style={{ fontFamily:'var(--display)',fontSize:17,fontWeight:700 }}>{editBranch ? 'Edit Branch' : 'Add Branch'}</div>
              <button onClick={() => setShowBranchModal(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:20 }}>×</button>
            </div>
            <div className="form-row">
              <FG label="Branch Code (2 digits)" req>
                <input className="form-input" style={{ fontFamily:'var(--mono)',fontSize:18,fontWeight:800,textAlign:'center' }} maxLength={2} value={branchForm.code} onChange={e => setB('code', e.target.value.replace(/\D/g,''))} placeholder="10" />
              </FG>
              <FG label="City"><input className="form-input" value={branchForm.city} onChange={e => setB('city', e.target.value)} /></FG>
            </div>
            <FG label="Branch Name" req><input className="form-input" placeholder="e.g. SOKORA HQ — Dar es Salaam" value={branchForm.name} onChange={e => setB('name', e.target.value)} /></FG>
            <FG label="Address"><input className="form-input" placeholder="Full address" value={branchForm.address} onChange={e => setB('address', e.target.value)} /></FG>
            <div style={{ background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:16,fontSize:11,fontFamily:'var(--mono)',color:'var(--text3)' }}>
              Locations for this branch will use codes: <span style={{ color:'var(--accent)' }}>{branchForm.code || 'XX'}01</span>, <span style={{ color:'var(--accent)' }}>{branchForm.code || 'XX'}02</span>, etc.
            </div>
            <div style={{ display:'flex',gap:10,justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowBranchModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveBranch} disabled={saving}>{saving ? 'Saving…' : editBranch ? 'Save Changes' : 'Add Branch'}</button>
            </div>
          </div>
        </div>
      )}

      {/* LOCATION MODAL */}
      {showLocModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100 }}>
          <div style={{ background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:28,width:540,maxHeight:'90vh',overflowY:'auto' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
              <div style={{ fontFamily:'var(--display)',fontSize:17,fontWeight:700 }}>{editLoc ? 'Edit Location' : 'Add Location'}</div>
              <button onClick={() => setShowLocModal(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:20 }}>×</button>
            </div>
            <div className="form-row">
              <FG label="Location Code (4 digits)" req>
                <input className="form-input" style={{ fontFamily:'var(--mono)',fontSize:18,fontWeight:800,textAlign:'center' }} maxLength={4} value={locForm.code} onChange={e => setL('code', e.target.value.replace(/\D/g,''))} placeholder="1001" />
              </FG>
              <FG label="Location Type">
                <select className="form-input" value={locForm.location_type} onChange={e => setL('location_type', e.target.value)}>
                  {LOCATION_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </FG>
            </div>
            <FG label="Branch" req>
              <select className="form-input" value={locForm.branch_id} onChange={e => {
                const b = branches.find(b => b.id === e.target.value)
                setL('branch_id', e.target.value)
                setL('branch_code', b?.code || '')
                if (!editLoc && b) setL('code', nextLocCode(b.code))
              }}>
                <option value="">— Select branch —</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
              </select>
            </FG>
            <FG label="Location Name" req><input className="form-input" placeholder="e.g. Front Office, Warehouse, Display Area" value={locForm.name} onChange={e => setL('name', e.target.value)} /></FG>

            <div style={{ marginTop: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Voucher Permissions</div>
              {VOUCHER_PERMS.map(perm => (
                <div key={perm.key} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize:13,fontWeight:600 }}>{perm.label}</div>
                    <div style={{ fontSize:11,color:'var(--text3)' }}>{perm.desc}</div>
                  </div>
                  <div onClick={() => setL(perm.key, !locForm[perm.key as keyof typeof locForm])}
                    style={{ width:40,height:22,background:(locForm[perm.key as keyof typeof locForm] as boolean)?'var(--green)':'var(--surface3)',borderRadius:11,cursor:'pointer',position:'relative',transition:'background .2s',flexShrink:0 }}>
                    <div style={{ position:'absolute',top:2,left:(locForm[perm.key as keyof typeof locForm] as boolean)?20:2,width:18,height:18,background:'#fff',borderRadius:'50%',transition:'left .2s',boxShadow:'0 1px 4px rgba(0,0,0,.2)' }}></div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex',gap:10,justifyContent:'flex-end',marginTop:16 }}>
              <button className="btn btn-ghost" onClick={() => setShowLocModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveLoc} disabled={saving}>{saving ? 'Saving…' : editLoc ? 'Save Changes' : 'Add Location'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
