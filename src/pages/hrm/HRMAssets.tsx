import { insertJournalWithRetry } from '../../lib/refs'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { tzs } from '../../lib/utils'
import Toast from '../../components/Toast'
import type { HRMProps, HRMAsset } from './hrmTypes'

export default function HRMAssets({ onNav: _onNav, hrmMode = 'company', linkedEmployeeId, canManage }: HRMProps) {
  const { user } = useAuth()
  const isSelfMode = hrmMode === 'self'
  const [assets, setAssets] = useState<HRMAsset[]>([])
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([])
  const [assetAccounts, setAssetAccounts] = useState<{ id: string; code: string; name: string }[]>([])
  const [cashAccounts, setCashAccounts] = useState<{ id: string; code: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [form, setForm] = useState({
    asset_name: '', asset_tag: '', employee_id: '', issued_date: '', condition: 'good',
    value: '', notes: '', asset_account_id: '', source_account_id: '', post_to_accounts: true,
  })

  // Reassign modal
  const [reassignAsset, setReassignAsset] = useState<HRMAsset | null>(null)
  const [reassignTo, setReassignTo] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [assetRes, empRes, assetAccRes, cashRes] = await Promise.all([
      isSelfMode && linkedEmployeeId
        ? supabase.from('hrm_assets').select('*, employee:hrm_employees(id, full_name, initials)').eq('employee_id', linkedEmployeeId).order('asset_name')
        : supabase.from('hrm_assets').select('*, employee:hrm_employees(id, full_name, initials)').order('asset_name'),
      supabase.from('hrm_employees').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('accounts').select('id, code, name').eq('type', 'asset').in('category', ['Fixed Assets', 'Equipment', 'Property & Equipment', 'Current Assets']).eq('is_active', true).order('code'),
      supabase.from('accounts').select('id, code, name').eq('category', 'Cash & Bank').eq('is_active', true).order('code'),
    ])
    setAssets(assetRes.data || [])
    setEmployees(empRes.data || [])
    setCashAccounts(cashRes.data || [])

    // If no fixed asset accounts found, include any asset-type accounts that aren't cash/inventory/receivables
    let faAccounts = assetAccRes.data || []
    if (faAccounts.length === 0) {
      const { data: allAssets } = await supabase.from('accounts').select('id, code, name, category')
        .eq('type', 'asset').eq('is_active', true)
        .not('category', 'in', '("Cash & Bank","Inventory","Receivables")').order('code')
      faAccounts = allAssets || []
    }
    setAssetAccounts(faAccounts)

    // Default form accounts
    if (faAccounts.length > 0 && !form.asset_account_id) setForm(f => ({ ...f, asset_account_id: faAccounts[0].id }))
    if ((cashRes.data || []).length > 0 && !form.source_account_id) setForm(f => ({ ...f, source_account_id: (cashRes.data || [])[0].id }))

    setLoading(false)
  }

  const save = async () => {
    if (!form.asset_name || !form.asset_tag) { setToast('Asset name and tag required'); setToastType('error'); return }
    const value = parseFloat(form.value) || 0
    const userName = user?.full_name || 'System'

    try {
      // Post to accounts if enabled and value > 0
      if (form.post_to_accounts && value > 0) {
        if (!form.source_account_id) { setToast('Select source Cash/Bank account'); setToastType('error'); return }

        // Ensure a fixed asset account exists
        let assetAccountId = form.asset_account_id
        if (!assetAccountId) {
          const { data: created } = await supabase.from('accounts').insert({
            code: '1200', name: 'Fixed Assets - Equipment', type: 'asset',
            // accounts table has no is_default column — see HRMPayroll for context.
            category: 'Fixed Assets', balance: 0, is_active: true,
          }).select('id').single()
          if (created) assetAccountId = (created as any).id
          else { setToast('Failed to create Fixed Asset account'); setToastType('error'); return }
        }

        const ref = `FA-${form.asset_tag}`
        const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
          ref: 'JV-' + ref, posting_date: form.issued_date || new Date().toISOString().split('T')[0],
          description: `Asset Purchase — ${form.asset_name} — ${form.asset_tag}`,
          journal_type: 'asset_purchase', source_type: 'asset_purchase', source_ref: ref,
          posted_by: userName, status: 'posted',
        })  
        if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw
        const jLines = [
          { journal_id: journal.id, line_number: 1, account_id: assetAccountId, description: `Fixed Asset — ${form.asset_name}`, debit: value, credit: 0 },
          { journal_id: journal.id, line_number: 2, account_id: form.source_account_id, description: `Asset purchase — ${form.asset_tag}`, debit: 0, credit: value },
        ]
        await supabase.from('journal_lines').insert(jLines)
        await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

        await supabase.from('vouchers').insert({
          ref, type: 'asset_purchase', posting_date: form.issued_date || new Date().toISOString().split('T')[0],
          description: `Asset Purchase — ${form.asset_name}`,
          total_amount: value, status: 'posted', journal_id: journal.id,
          notes: form.notes || null, posted_by: userName,
        })
      }

      // Create asset record
      const { error } = await supabase.from('hrm_assets').insert({
        asset_name: form.asset_name, asset_tag: form.asset_tag,
        employee_id: form.employee_id || null,
        assigned_to_name: form.employee_id ? employees.find(e => e.id === form.employee_id)?.full_name : 'Office Pool',
        issued_date: form.issued_date || null, condition: form.condition,
        value, status: form.employee_id ? 'assigned' : 'pool', notes: form.notes || null,
      })
      if (error) throw new Error(error.message)

      const acctMsg = form.post_to_accounts && value > 0
        ? ` — Dr Fixed Assets / Cr ${cashAccounts.find(a => a.id === form.source_account_id)?.code || 'Bank'}`
        : ''
      setToast(`${form.asset_name} added${acctMsg}`)
      setToastType('success'); setShowModal(false)
      setForm({ asset_name: '', asset_tag: '', employee_id: '', issued_date: '', condition: 'good', value: '', notes: '', asset_account_id: assetAccounts[0]?.id || '', source_account_id: cashAccounts[0]?.id || '', post_to_accounts: true })
      load()
    } catch (err: any) {
      setToast(err.message || 'Failed'); setToastType('error')
    }
  }

  const reassign = async () => {
    if (!reassignAsset) return
    const empName = reassignTo ? employees.find(e => e.id === reassignTo)?.full_name || 'Unknown' : 'Office Pool'
    await supabase.from('hrm_assets').update({
      employee_id: reassignTo || null, assigned_to_name: empName,
      status: reassignTo ? 'assigned' : 'pool',
    }).eq('id', reassignAsset.id)
    setToast(`${reassignAsset.asset_name} reassigned to ${empName}`); setToastType('success')
    setReassignAsset(null); setReassignTo(''); load()
  }

  const returnAsset = async (asset: HRMAsset) => {
    await supabase.from('hrm_assets').update({ employee_id: null, assigned_to_name: 'Office Pool', status: 'returned' }).eq('id', asset.id)
    setToast(`${asset.asset_name} returned to pool`); setToastType('success'); load()
  }

  const disposeAsset = async (asset: HRMAsset) => {
    await supabase.from('hrm_assets').update({ status: 'disposed' }).eq('id', asset.id)
    setToast(`${asset.asset_name} marked as disposed`); setToastType('success'); load()
  }

  const totalValue = assets.reduce((s, a) => s + (a.value || 0), 0)
  const assignedCount = assets.filter(a => a.status === 'assigned').length
  const poolCount = assets.filter(a => a.status === 'pool' || a.status === 'returned').length
  const disposedCount = assets.filter(a => a.status === 'disposed').length

  const conditionColor: Record<string, string> = { excellent: '#22c55e', good: '#22c55e', fair: '#f59e0b', poor: '#ef4444' }
  const statusColor: Record<string, string> = { assigned: '#22c55e', pool: '#f59e0b', returned: '#3b82f6', disposed: '#ef4444' }
  const statusLabel: Record<string, string> = { assigned: 'Assigned', pool: 'Pool', returned: 'Returned', disposed: 'Disposed' }
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">{isSelfMode ? 'My Assets' : 'Asset Register'}</div><div className="page-sub">{isSelfMode ? 'Equipment and items assigned to you' : 'Company assets · Wired to Fixed Assets in Chart of Accounts · Assign, return, dispose'}</div></div>
        <div className="page-actions">
          {canManage && !isSelfMode && <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ New Asset</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 18 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #6366f1' }}><div style={{ fontSize: 22, fontWeight: 900, color: '#6366f1' }}>{assets.length}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Assets</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #22c55e' }}><div style={{ fontSize: 22, fontWeight: 900, color: '#22c55e' }}>{assignedCount}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Assigned</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #f59e0b' }}><div style={{ fontSize: 22, fontWeight: 900, color: '#f59e0b' }}>{poolCount}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Pool / Returned</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #ef4444' }}><div style={{ fontSize: 22, fontWeight: 900, color: '#ef4444' }}>{disposedCount}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Disposed</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid var(--accent)' }}><div style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)' }}>{tzs(totalValue)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Value</div></div>
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Asset</th><th>Tag</th><th>Assigned To</th><th>Issued</th><th>Condition</th><th className="td-right">Value</th><th style={{ textAlign: 'center' }}>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.id} style={{ opacity: a.status === 'disposed' ? 0.5 : 1 }}>
                    <td style={{ fontWeight: 700 }}>{a.asset_name}</td>
                    <td className="td-mono" style={{ color: 'var(--accent)', fontSize: 11 }}>{a.asset_tag}</td>
                    <td style={{ fontWeight: 600 }}>{a.assigned_to_name || (a.employee as any)?.full_name || 'Office Pool'}</td>
                    <td style={{ color: 'var(--text3)' }}>{a.issued_date || 'N/A'}</td>
                    <td><span style={{ fontSize: 10, background: `${conditionColor[a.condition] || '#aaa'}22`, color: conditionColor[a.condition] || '#aaa', padding: '2px 7px', borderRadius: 4 }}>{a.condition}</span></td>
                    <td className="td-right td-mono">{(a.value || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}><span style={{ fontSize: 10, background: `${statusColor[a.status] || '#aaa'}22`, color: statusColor[a.status] || '#aaa', padding: '2px 7px', borderRadius: 4 }}>{statusLabel[a.status] || a.status}</span></td>
                    <td>
                      {a.status !== 'disposed' && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => { setReassignAsset(a); setReassignTo(a.employee_id || '') }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '3px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>Reassign</button>
                          {a.status === 'assigned' && <button onClick={() => returnAsset(a)} style={{ background: '#3b82f622', border: '1px solid #3b82f644', color: '#3b82f6', padding: '3px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>Return</button>}
                          <button onClick={() => disposeAsset(a)} style={{ background: '#ef444411', border: '1px solid #ef444433', color: '#ef4444', padding: '3px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>Dispose</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {assets.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: 'var(--text3)' }}>No assets registered yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── NEW ASSET MODAL ────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>Register New Asset</div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>Asset Name *</label><input style={inputStyle} value={form.asset_name} onChange={e => setForm({ ...form, asset_name: e.target.value })} placeholder="e.g. MacBook Pro 14" /></div>
                <div><label style={labelStyle}>Asset Tag *</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.asset_tag} onChange={e => setForm({ ...form, asset_tag: e.target.value })} placeholder="e.g. MALK-LT-003" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>Value (TZS) *</label><input type="number" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="e.g. 3200000" /></div>
                <div><label style={labelStyle}>Condition</label><select style={inputStyle} value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}><option value="excellent">Excellent (New)</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>Assign To</label><select style={inputStyle} value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}><option value="">Office Pool (unassigned)</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div>
                <div><label style={labelStyle}>Issue Date</label><input type="date" style={inputStyle} value={form.issued_date} onChange={e => setForm({ ...form, issued_date: e.target.value })} /></div>
              </div>

              {/* Accounting Section */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', marginBottom: 10 }}>
                  <input type="checkbox" checked={form.post_to_accounts} onChange={e => setForm({ ...form, post_to_accounts: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
                  <span style={{ fontWeight: 700 }}>Post to Accounts</span>
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>(Dr Fixed Assets / Cr Cash or Bank)</span>
                </label>

                {form.post_to_accounts && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Fixed Asset Account (Dr)</label>
                      <select style={inputStyle} value={form.asset_account_id} onChange={e => setForm({ ...form, asset_account_id: e.target.value })}>
                        {assetAccounts.length === 0 && <option value="">Auto-create 1200 Fixed Assets</option>}
                        {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Paid From (Cr) *</label>
                      <select style={inputStyle} value={form.source_account_id} onChange={e => setForm({ ...form, source_account_id: e.target.value })}>
                        <option value="">— Select —</option>
                        {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {!form.post_to_accounts && (
                  <div style={{ padding: '8px 12px', background: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: 6, fontSize: 10, color: '#f59e0b' }}>
                    Asset will be tracked operationally only. No accounting entry will be created. Use this for existing assets being registered for the first time.
                  </div>
                )}
              </div>

              <div><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, resize: 'none', height: 50 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Serial number, purchase details..." /></div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Register Asset</button>
            </div>
          </div>
        </div>
      )}

      {/* ── REASSIGN MODAL ─────────────────── */}
      {reassignAsset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) setReassignAsset(null) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 400, maxWidth: '95vw' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>Reassign: {reassignAsset.asset_name}</div>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Currently: {reassignAsset.assigned_to_name || 'Office Pool'}</div>
              <label style={labelStyle}>Reassign To</label>
              <select style={inputStyle} value={reassignTo} onChange={e => setReassignTo(e.target.value)}>
                <option value="">Office Pool (unassigned)</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setReassignAsset(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={reassign}>Reassign</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
