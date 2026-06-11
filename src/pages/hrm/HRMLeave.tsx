import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import { useAuth } from '../../lib/useAuth'
import type { HRMProps, LeaveRequest, LeaveBalance } from './hrmTypes'
import { LEAVE_LABELS } from './hrmTypes'

export default function HRMLeave({ onNav: _onNav, hrmMode = 'company', linkedEmployeeId, canManage }: HRMProps) {
  const { user } = useAuth()
  const isSelfMode = hrmMode === 'self'
  const [tab, setTab] = useState<'balances' | 'pending' | 'history'>('balances')
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [pending, setPending] = useState<LeaveRequest[]>([])
  const [history, setHistory] = useState<LeaveRequest[]>([])
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [form, setForm] = useState({ employee_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    if (isSelfMode && linkedEmployeeId) {
      // Self mode: only own data
      const [balRes, pendRes, histRes] = await Promise.all([
        supabase.from('hrm_leave_balances').select('*, employee:hrm_employees(id, full_name)').eq('employee_id', linkedEmployeeId),
        supabase.from('hrm_leave_requests').select('*, employee:hrm_employees(id, full_name)').eq('employee_id', linkedEmployeeId).eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('hrm_leave_requests').select('*, employee:hrm_employees(id, full_name)').eq('employee_id', linkedEmployeeId).neq('status', 'pending').order('start_date', { ascending: false }).limit(20),
      ])
      setEmployees([])
      setBalances(balRes.data || [])
      setPending(pendRes.data || [])
      setHistory(histRes.data || [])
    } else {
      const [empRes, balRes, pendRes, histRes] = await Promise.all([
        supabase.from('hrm_employees').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('hrm_leave_balances').select('*, employee:hrm_employees(id, full_name)').order('employee_id'),
        supabase.from('hrm_leave_requests').select('*, employee:hrm_employees(id, full_name)').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('hrm_leave_requests').select('*, employee:hrm_employees(id, full_name)').neq('status', 'pending').order('start_date', { ascending: false }).limit(20),
      ])
      setEmployees(empRes.data || [])
      setBalances(balRes.data || [])
      setPending(pendRes.data || [])
      setHistory(histRes.data || [])
    }
    setLoading(false)
  }

  const submitRequest = async () => {
    if (!form.employee_id || !form.start_date || !form.end_date) { setToast('Fill required fields'); setToastType('error'); return }
    const days = Math.ceil((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
    const { error } = await supabase.from('hrm_leave_requests').insert({
      employee_id: form.employee_id, leave_type: form.leave_type,
      start_date: form.start_date, end_date: form.end_date, days,
      reason: form.reason || null, status: 'pending',
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast('Leave request submitted'); setToastType('success'); setShowModal(false)
    setForm({ employee_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })
    load()
  }

  const approve = async (id: string) => {
    await supabase.from('hrm_leave_requests').update({ status: 'approved', approved_by: user?.full_name || 'Admin', approved_at: new Date().toISOString() }).eq('id', id)
    setToast('Leave approved'); setToastType('success'); load()
  }

  const reject = async (id: string) => {
    await supabase.from('hrm_leave_requests').update({ status: 'rejected', approved_by: user?.full_name || 'Admin', approved_at: new Date().toISOString() }).eq('id', id)
    setToast('Leave rejected'); setToastType('success'); load()
  }

  const statusColor: Record<string, string> = { approved: '#22c55e', rejected: '#ef4444', pending: '#f59e0b' }
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }
  const tabBtn = (t: typeof tab, label: string, badge?: number) => (
    <button onClick={() => setTab(t)} className={tab === t ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
      {label}{badge ? <span style={{ background: '#ef4444', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: 10, marginLeft: 4 }}>{badge}</span> : null}
    </button>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">{isSelfMode ? 'My Leave' : 'Leave Management'}</div><div className="page-sub">{isSelfMode ? 'Your leave balance and requests' : 'Annual, Sick, Maternity (84d), Paternity, Emergency'}</div></div>
        <div className="page-actions">
          {tabBtn('balances', 'Balances')}
          {tabBtn('pending', 'Pending', pending.length || undefined)}
          {tabBtn('history', 'History')}
          <button className="btn btn-primary btn-sm" onClick={() => { setForm({ ...form, employee_id: isSelfMode && linkedEmployeeId ? linkedEmployeeId : '' }); setShowModal(true) }}>+ New Request</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
      ) : tab === 'balances' ? (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 12 }}>Leave Balances</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th style={{ textAlign: 'center' }}>Entitlement</th><th style={{ textAlign: 'center' }}>Taken</th><th style={{ textAlign: 'center' }}>Pending</th><th style={{ textAlign: 'center' }}>Balance</th><th style={{ textAlign: 'center' }}>Sick Days</th><th></th></tr></thead>
              <tbody>
                {balances.map(b => {
                  const bal = b.annual_entitlement - b.annual_taken - b.annual_pending
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 700 }}>{(b.employee as any)?.full_name}</td>
                      <td style={{ textAlign: 'center' }}>{b.annual_entitlement}</td>
                      <td style={{ textAlign: 'center' }}>{b.annual_taken}</td>
                      <td style={{ textAlign: 'center', color: b.annual_pending > 0 ? '#f59e0b' : 'var(--text3)' }}>{b.annual_pending}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: bal <= 5 ? '#f59e0b' : 'var(--accent)' }}>{bal}</td>
                      <td style={{ textAlign: 'center' }}>{b.sick_taken}/{b.sick_entitlement}</td>
                      <td><button onClick={() => { setForm({ ...form, employee_id: b.employee_id }); setShowModal(true) }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>Apply</button></td>
                    </tr>
                  )
                })}
                {balances.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--text3)' }}>No leave balances configured. Add them in HR Settings or when employees are created.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'pending' ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 12 }}>Pending Approval - {pending.length} requests</div>
          {pending.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 10 }}>No pending leave requests</div>
          ) : pending.map(r => (
            <div key={r.id} className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{(r.employee as any)?.full_name} - {LEAVE_LABELS[r.leave_type] || r.leave_type}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{r.start_date} to {r.end_date} · <strong>{r.days} days</strong></div>
                  {r.reason && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Reason: {r.reason}</div>}
                </div>
                <span style={{ fontSize: 10, background: '#f59e0b22', color: '#f59e0b', padding: '3px 10px', borderRadius: 6, fontWeight: 700 }}>Pending</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {canManage && <>
                <button onClick={() => approve(r.id)} style={{ background: '#22c55e', color: '#000', border: 'none', padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Approve</button>
                <button onClick={() => reject(r.id)} style={{ background: '#ef444422', border: '1px solid #ef444444', color: '#ef4444', padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Reject</button>
                </>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 12 }}>Leave History</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th style={{ textAlign: 'center' }}>Days</th><th>Approved By</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
              <tbody>
                {history.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{(r.employee as any)?.full_name}</td>
                    <td>{LEAVE_LABELS[r.leave_type] || r.leave_type}</td>
                    <td className="td-mono" style={{ fontSize: 11 }}>{r.start_date} to {r.end_date}</td>
                    <td style={{ textAlign: 'center' }}>{r.days}</td>
                    <td style={{ fontSize: 11 }}>{r.approved_by || 'N/A'}</td>
                    <td style={{ textAlign: 'center' }}><span style={{ fontSize: 10, background: `${statusColor[r.status] || '#aaa'}22`, color: statusColor[r.status] || '#aaa', padding: '2px 8px', borderRadius: 4 }}>{r.status}</span></td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text3)' }}>No leave history yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 480, maxWidth: '95vw' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>New Leave Request</div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Employee *</label>{isSelfMode ? <div style={{ padding: 8, background: 'var(--surface2)', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>You</div> : <select style={inputStyle} value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}><option value="">Select...</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select>}</div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Leave Type *</label><select style={inputStyle} value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}>{Object.entries(LEAVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>From *</label><input type="date" style={inputStyle} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>To *</label><input type="date" style={inputStyle} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Reason</label><textarea style={{ ...inputStyle, resize: 'none', height: 60 }} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Brief reason..." /></div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitRequest}>Submit Request</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
