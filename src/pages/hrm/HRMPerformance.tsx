import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import type { HRMProps, Appraisal } from './hrmTypes'
import { DEPT_COLORS } from './hrmTypes'

export default function HRMPerformance({ onNav: _onNav, hrmMode = 'company', linkedEmployeeId, canManage }: HRMProps) {
  const isSelfMode = hrmMode === 'self'
  const [tab, setTab] = useState<'appraisals' | 'policies' | 'sops'>('appraisals')
  const [appraisals, setAppraisals] = useState<Appraisal[]>([])
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [form, setForm] = useState({ employee_id: '', period: 'Q2 2025', kpis: [{ name: '', target: 100, actual: 0 }, { name: '', target: 100, actual: 0 }], manager_notes: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [appRes, empRes] = await Promise.all([
      isSelfMode && linkedEmployeeId
        ? supabase.from('hrm_appraisals').select('*, employee:hrm_employees(id, full_name, initials, job_title, department)').eq('employee_id', linkedEmployeeId).order('created_at', { ascending: false })
        : supabase.from('hrm_appraisals').select('*, employee:hrm_employees(id, full_name, initials, job_title, department)').order('created_at', { ascending: false }),
      supabase.from('hrm_employees').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    setAppraisals(appRes.data || [])
    setEmployees(empRes.data || [])
    setLoading(false)
  }

  const saveAppraisal = async () => {
    if (!form.employee_id) { setToast('Select an employee'); setToastType('error'); return }
    const validKPIs = form.kpis.filter(k => k.name.trim())
    const overall = validKPIs.length > 0 ? Math.round(validKPIs.reduce((s, k) => s + (k.actual / Math.max(k.target, 1)) * 100, 0) / validKPIs.length) : null
    const { error } = await supabase.from('hrm_appraisals').insert({
      employee_id: form.employee_id, period: form.period, kpis: validKPIs,
      overall_score: overall, manager_notes: form.manager_notes || null,
      status: overall !== null ? 'reviewed' : 'draft',
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast('Appraisal saved'); setToastType('success'); setShowModal(false); load()
  }

  const addKPI = () => setForm({ ...form, kpis: [...form.kpis, { name: '', target: 100, actual: 0 }] })

  const updateKPI = (i: number, field: string, val: any) => {
    const kpis = [...form.kpis]
    kpis[i] = { ...kpis[i], [field]: field === 'name' ? val : parseFloat(val) || 0 }
    setForm({ ...form, kpis })
  }

  const scoreColor = (s: number) => s >= 90 ? 'var(--accent)' : s >= 75 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444'
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">{isSelfMode ? 'My Performance' : 'Standards & Performance'}</div><div className="page-sub">{isSelfMode ? 'Your KPI appraisals and scores' : 'KPI appraisals, policies, SOPs'}</div></div>
        <div className="page-actions">
          <button onClick={() => setTab('appraisals')} className={tab === 'appraisals' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>Appraisals</button>
          <button onClick={() => setTab('policies')} className={tab === 'policies' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>Policies</button>
          <button onClick={() => setTab('sops')} className={tab === 'sops' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>SOPs</button>
          {canManage && <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ New Appraisal</button>}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
      ) : tab === 'appraisals' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {appraisals.map(a => {
            const emp = a.employee as any
            const color = DEPT_COLORS[emp?.department] || '#6366f1'
            const kpis = (a.kpis as any[]) || []
            return (
              <div key={a.id} className="card" style={{ borderTop: `3px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div><div style={{ fontWeight: 800 }}>{emp?.full_name}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>{emp?.job_title} · {a.period}</div></div>
                  <span style={{ fontSize: 10, background: a.status === 'reviewed' ? '#22c55e22' : '#f59e0b22', color: a.status === 'reviewed' ? '#22c55e' : '#f59e0b', padding: '2px 8px', borderRadius: 4 }}>{a.status === 'reviewed' ? 'Reviewed' : 'Draft'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {kpis.map((k: any, i: number) => {
                    const pct = k.target > 0 ? Math.round((k.actual / k.target) * 100) : 0
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}><span>{k.name}</span><span style={{ fontWeight: 700, color: scoreColor(pct) }}>{pct}%</span></div>
                        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: scoreColor(pct), borderRadius: 3 }} /></div>
                      </div>
                    )
                  })}
                </div>
                {a.overall_score !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 900 }}>Overall: <span style={{ color: scoreColor(a.overall_score) }}>{a.overall_score}%</span></span>
                  </div>
                )}
              </div>
            )
          })}
          {appraisals.length === 0 && (
            <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No appraisals yet. Create your first one.</div>
          )}
        </div>
      ) : tab === 'policies' ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Company Policies</div>
          <div style={{ fontSize: 12 }}>Upload and track policy acknowledgements here. Coming in next update.</div>
        </div>
      ) : (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Standard Operating Procedures</div>
          <div style={{ fontSize: 12 }}>Role-specific SOPs with versioning. Coming in next update.</div>
        </div>
      )}

      {/* New Appraisal Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 540, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>New Appraisal</div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Employee *</label><select style={inputStyle} value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}><option value="">Select...</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div>
                <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Period *</label><select style={inputStyle} value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}><option>Q1 2025</option><option>Q2 2025</option><option>Q3 2025</option><option>Q4 2025</option><option>H1 2025</option><option>FY 2025</option></select></div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>KPI Targets</div>
              {form.kpis.map((k, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input style={inputStyle} placeholder="KPI name" value={k.name} onChange={e => updateKPI(i, 'name', e.target.value)} />
                  <input type="number" style={{ ...inputStyle, textAlign: 'right', fontFamily: 'var(--mono)' }} placeholder="Target %" value={k.target} onChange={e => updateKPI(i, 'target', e.target.value)} />
                  <input type="number" style={{ ...inputStyle, textAlign: 'right', fontFamily: 'var(--mono)' }} placeholder="Actual %" value={k.actual || ''} onChange={e => updateKPI(i, 'actual', e.target.value)} />
                </div>
              ))}
              <button onClick={addKPI} style={{ width: '100%', marginTop: 4, background: 'none', border: '1px dashed var(--border)', color: 'var(--text3)', padding: 6, borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>+ Add KPI</button>
              <div style={{ marginTop: 12 }}><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Manager Notes</label><textarea style={{ ...inputStyle, resize: 'none', height: 70 }} value={form.manager_notes} onChange={e => setForm({ ...form, manager_notes: e.target.value })} placeholder="Overall assessment..." /></div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAppraisal}>Save Appraisal</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
