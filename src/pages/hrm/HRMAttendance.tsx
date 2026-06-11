import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import type { HRMProps, AttendanceEntry } from './hrmTypes'
import { DEPT_COLORS } from './hrmTypes'

const OFFICE_START = '08:30'
const TYPE_LABELS: Record<string, string> = { office: 'Office', field: 'Field Sales', remote: 'Remote', consultation: 'Consultation', leave: 'Leave', absent: 'Absent' }
const STATUS_COLORS: Record<string, string> = { present: '#22c55e', absent: '#ef4444', on_leave: '#3b82f6', late: '#f59e0b' }
const TYPE_COLORS: Record<string, string> = { office: '#6366f1', field: '#f59e0b', remote: '#3b82f6', consultation: '#85c2be', leave: '#a78bfa', absent: '#ef4444' }

type EmpPartial = { id: string; full_name: string; initials: string; department: string; job_title: string }

export default function HRMAttendance({ onNav: _onNav, hrmMode = 'company', linkedEmployeeId, canManage }: HRMProps) {
  const isSelfMode = hrmMode === 'self'
  const [employees, setEmployees] = useState<EmpPartial[]>([])
  const [entries, setEntries] = useState<AttendanceEntry[]>([])
  const [todayStatus, setTodayStatus] = useState<Record<string, AttendanceEntry>>({})
  const [loading, setLoading] = useState(true)
  const [clock, setClock] = useState('')
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  // Filters & View
  const [tab, setTab] = useState<'today' | 'log' | 'weekly'>('today')
  const [filterDept, setFilterDept] = useState('all')
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0])
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1)
    return d.toISOString().split('T')[0]
  })

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ employee_id: '', date: new Date().toISOString().split('T')[0], clock_in: '', clock_out: '', entry_type: 'office', status: 'present', notes: '' })

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    load()
    const timer = setInterval(() => setClock(new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' })), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => { if (tab === 'log') loadLog() }, [logDate])
  useEffect(() => { if (tab === 'weekly') loadWeekly() }, [weekStart])

  const selfFilter = isSelfMode && linkedEmployeeId

  const load = async () => {
    setLoading(true)
    const [empRes, todayRes] = await Promise.all([
      selfFilter
        ? supabase.from('hrm_employees').select('id, full_name, initials, department, job_title').eq('id', linkedEmployeeId)
        : supabase.from('hrm_employees').select('id, full_name, initials, department, job_title').eq('is_active', true).order('full_name'),
      selfFilter
        ? supabase.from('hrm_attendance').select('*').eq('date', today).eq('employee_id', linkedEmployeeId)
        : supabase.from('hrm_attendance').select('*').eq('date', today),
    ])
    setEmployees(empRes.data || [])
    const statusMap: Record<string, AttendanceEntry> = {}
    ;(todayRes.data || []).forEach((e: AttendanceEntry) => { statusMap[e.employee_id] = e })
    setTodayStatus(statusMap)
    setLoading(false)
  }

  const loadLog = async () => {
    setLoading(true)
    let query = supabase.from('hrm_attendance').select('*, employee:hrm_employees(id, full_name, department)').eq('date', logDate).order('clock_in')
    if (selfFilter) query = query.eq('employee_id', linkedEmployeeId)
    const { data } = await query
    setEntries(data || [])
    setLoading(false)
  }

  const [weeklyData, setWeeklyData] = useState<AttendanceEntry[]>([])
  const loadWeekly = async () => {
    setLoading(true)
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    let query = supabase.from('hrm_attendance').select('*, employee:hrm_employees(id, full_name, department)')
      .gte('date', weekStart).lte('date', end.toISOString().split('T')[0]).order('date')
    if (selfFilter) query = query.eq('employee_id', linkedEmployeeId)
    const { data } = await query
    setWeeklyData(data || [])
    setLoading(false)
  }

  const calcHours = (inTime: string, outTime: string): number => {
    const [inH, inM] = inTime.split(':').map(Number)
    const [outH, outM] = outTime.split(':').map(Number)
    return Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 10) / 10
  }

  const isLate = (clockIn: string | null): boolean => {
    if (!clockIn) return false
    return clockIn > OFFICE_START
  }

  const clockIn = async (empId: string, type: string = 'office') => {
    const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', hour: '2-digit', minute: '2-digit' })
    const late = isLate(now)
    const { error } = await supabase.from('hrm_attendance').insert({
      employee_id: empId, date: today, clock_in: now, entry_type: type,
      status: late ? 'late' : 'present',
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast(late ? `Clocked in (Late: ${now})` : `Clocked in at ${now}`); setToastType(late ? 'error' : 'success'); load()
  }

  const clockOut = async (empId: string) => {
    const entry = todayStatus[empId]
    if (!entry) return
    const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', hour: '2-digit', minute: '2-digit' })
    const hours = calcHours(entry.clock_in || '08:00', now)
    await supabase.from('hrm_attendance').update({ clock_out: now, hours }).eq('id', entry.id)
    setToast(`Clocked out (${hours}h)`); setToastType('success'); load()
  }

  const markAbsent = async (empId: string) => {
    const { error } = await supabase.from('hrm_attendance').insert({
      employee_id: empId, date: today, entry_type: 'absent', status: 'absent',
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast('Marked absent'); setToastType('success'); load()
  }

  const bulkClockIn = async () => {
    const notIn = filteredEmployees.filter(e => !todayStatus[e.id])
    if (notIn.length === 0) { setToast('Everyone already clocked in'); setToastType('error'); return }
    const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', hour: '2-digit', minute: '2-digit' })
    const late = isLate(now)
    const statusVal: 'late' | 'present' = late ? 'late' : 'present'
    const rows = notIn.map(e => ({ employee_id: e.id, date: today, clock_in: now, entry_type: 'office' as const, status: statusVal }))
    const { error } = await supabase.from('hrm_attendance').insert(rows)
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast(`${notIn.length} employees clocked in`); setToastType('success'); load()
  }

  const saveEntry = async () => {
    if (!form.employee_id || !form.date) { setToast('Select employee and date'); setToastType('error'); return }
    let hours: number | null = null
    if (form.clock_in && form.clock_out) hours = calcHours(form.clock_in, form.clock_out)
    const late = form.clock_in ? isLate(form.clock_in) : false
    const payload = {
      employee_id: form.employee_id, date: form.date, clock_in: form.clock_in || null,
      clock_out: form.clock_out || null, hours, entry_type: form.entry_type,
      status: form.entry_type === 'leave' ? 'on_leave' : form.entry_type === 'absent' ? 'absent' : late ? 'late' : 'present',
      notes: form.notes || null,
    }
    let error
    if (editId) {
      const res = await supabase.from('hrm_attendance').update(payload).eq('id', editId)
      error = res.error
    } else {
      const res = await supabase.from('hrm_attendance').insert(payload)
      error = res.error
    }
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast(editId ? 'Entry updated' : 'Entry logged'); setToastType('success')
    setShowModal(false); setEditId(null); load(); if (tab === 'log') loadLog(); if (tab === 'weekly') loadWeekly()
  }

  const openEdit = (entry: AttendanceEntry) => {
    setEditId(entry.id)
    setForm({ employee_id: entry.employee_id, date: entry.date, clock_in: entry.clock_in || '', clock_out: entry.clock_out || '', entry_type: entry.entry_type, status: entry.status, notes: entry.notes || '' })
    setShowModal(true)
  }

  const openNew = () => {
    setEditId(null)
    setForm({ employee_id: '', date: today, clock_in: '', clock_out: '', entry_type: 'office', status: 'present', notes: '' })
    setShowModal(true)
  }

  const filteredEmployees = filterDept === 'all' ? employees : employees.filter(e => e.department === filterDept)
  const departments = [...new Set(employees.map(e => e.department))].sort()

  const kpis = useMemo(() => {
    const total = filteredEmployees.length
    const present = filteredEmployees.filter(e => todayStatus[e.id] && todayStatus[e.id].status !== 'absent').length
    const late = filteredEmployees.filter(e => todayStatus[e.id]?.status === 'late').length
    const absent = filteredEmployees.filter(e => todayStatus[e.id]?.status === 'absent').length
    const notIn = total - Object.keys(todayStatus).filter(id => filteredEmployees.some(e => e.id === id)).length
    const totalHours = filteredEmployees.reduce((s, e) => s + (todayStatus[e.id]?.hours || 0), 0)
    const avgHours = present > 0 ? Math.round(totalHours / present * 10) / 10 : 0
    return { total, present, late, absent, notIn, avgHours }
  }, [filteredEmployees, todayStatus])

  const weekDays = useMemo(() => {
    const days: string[] = []
    const start = new Date(weekStart)
    for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d.toISOString().split('T')[0]) }
    return days
  }, [weekStart])

  const weeklyMap = useMemo(() => {
    const map: Record<string, Record<string, AttendanceEntry>> = {}
    weeklyData.forEach((e: AttendanceEntry) => { if (!map[e.employee_id]) map[e.employee_id] = {}; map[e.employee_id][e.date] = e })
    return map
  }, [weeklyData])

  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{isSelfMode ? 'My Attendance' : 'Attendance Tracker'}</div>
          <div className="page-sub">{isSelfMode ? 'Your clock-in/out records and weekly summary' : `Live clock-in/out · Late detection (${OFFICE_START} cutoff) · Weekly summaries`}</div>
        </div>
        <div className="page-actions">
          {!isSelfMode && (
            <select style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <button onClick={() => setTab('today')} className={tab === 'today' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>Today</button>
          <button onClick={() => { setTab('log'); loadLog() }} className={tab === 'log' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>Daily Log</button>
          <button onClick={() => { setTab('weekly'); loadWeekly() }} className={tab === 'weekly' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>Weekly</button>
          {canManage && <button className="btn btn-ghost btn-sm" onClick={openNew}>+ Log Entry</button>}
        </div>
      </div>

      {/* KPI Strip — hide team KPIs in self mode */}
      {!isSelfMode && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Team Size', value: kpis.total, color: '#6366f1' },
          { label: 'Present', value: kpis.present, color: '#22c55e' },
          { label: 'Late', value: kpis.late, color: '#f59e0b' },
          { label: 'Absent', value: kpis.absent, color: '#ef4444' },
          { label: 'Not In Yet', value: kpis.notIn, color: 'var(--text3)' },
          { label: 'Avg Hours', value: kpis.avgHours > 0 ? kpis.avgHours + 'h' : '--', color: 'var(--accent)' },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: 12, textAlign: 'center', borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{loading ? '...' : s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>{s.label}</div>
          </div>
        ))}
      </div>
      )}

      {/* TODAY TAB */}
      {tab === 'today' && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{isSelfMode ? 'Today' : 'Today - Live Status'}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {canManage && !isSelfMode && <button onClick={bulkClockIn} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Bulk Clock-In All</button>}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 30, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{clock || '--:--:--'}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>EAT (UTC+3) · Late after {OFFICE_START}</div>
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>Loading...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(filteredEmployees.length || 1, 5)},1fr)`, gap: 10 }}>
              {filteredEmployees.map(emp => {
                const status = todayStatus[emp.id]
                const isIn = status && status.clock_in && !status.clock_out
                const isDone = status && status.clock_out
                const isAbsent = status?.status === 'absent'
                const wasLate = status?.status === 'late'
                const borderColor = isAbsent ? '#ef4444' : isIn ? '#22c55e' : isDone ? (wasLate ? '#f59e0b' : 'var(--text3)') : 'var(--accent)'
                const deptColor = DEPT_COLORS[emp.department] || '#6366f1'

                return (
                  <div key={emp.id} className="card" style={{ padding: 10, textAlign: 'center', borderTop: `3px solid ${borderColor}` }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${deptColor}22`, color: deptColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, margin: '0 auto 6px' }}>{emp.initials}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>{emp.full_name.split(' ')[0]}</div>
                    <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 6 }}>{emp.department}</div>

                    {isAbsent ? (
                      <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 700, marginBottom: 6 }}>ABSENT</div>
                    ) : isDone ? (
                      <>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: wasLate ? '#f59e0b' : 'var(--text3)', marginBottom: 2 }}>{status.clock_in} - {status.clock_out}</div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>{status.hours || 0}h</div>
                        {wasLate && <span style={{ fontSize: 9, background: '#f59e0b22', color: '#f59e0b', padding: '1px 5px', borderRadius: 4 }}>Late</span>}
                        <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>Done</div>
                      </>
                    ) : isIn ? (
                      <>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: wasLate ? '#f59e0b' : '#22c55e', marginBottom: 4 }}>IN {status.clock_in}</div>
                        {wasLate && <span style={{ fontSize: 9, background: '#f59e0b22', color: '#f59e0b', padding: '1px 5px', borderRadius: 4, marginBottom: 4, display: 'inline-block' }}>Late</span>}
                        <button onClick={() => clockOut(emp.id)} style={{ width: '100%', marginTop: 4, background: '#ef444422', border: '1px solid #ef444444', color: '#ef4444', padding: 5, borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Clock Out</button>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>Not clocked in</div>
                        <button onClick={() => clockIn(emp.id, 'office')} style={{ width: '100%', background: 'var(--accent)', border: 'none', color: '#000', padding: 5, borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer', marginBottom: 4 }}>Clock In</button>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button onClick={() => clockIn(emp.id, 'field')} style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 4, borderRadius: 4, fontSize: 9, cursor: 'pointer' }}>Field</button>
                          <button onClick={() => clockIn(emp.id, 'remote')} style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 4, borderRadius: 4, fontSize: 9, cursor: 'pointer' }}>Remote</button>
                          {canManage && <button onClick={() => markAbsent(emp.id)} style={{ flex: 1, background: '#ef444411', border: '1px solid #ef444433', color: '#ef4444', padding: 4, borderRadius: 4, fontSize: 9, cursor: 'pointer' }}>Absent</button>}
                        </div>
                      </>
                    )}

                    {status && status.entry_type !== 'absent' && (
                      <div style={{ marginTop: 6, fontSize: 9, color: TYPE_COLORS[status.entry_type] || 'var(--text3)', fontWeight: 700 }}>{TYPE_LABELS[status.entry_type] || status.entry_type}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* DAILY LOG TAB */}
      {tab === 'log' && (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 800 }}>Daily Attendance Log</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => { const d = new Date(logDate); d.setDate(d.getDate() - 1); setLogDate(d.toISOString().split('T')[0]) }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>&lt;</button>
              <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontFamily: 'var(--mono)' }} />
              <button onClick={() => { const d = new Date(logDate); d.setDate(d.getDate() + 1); setLogDate(d.toISOString().split('T')[0]) }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>&gt;</button>
              {logDate !== today && <button onClick={() => setLogDate(today)} style={{ background: 'var(--accent)', border: 'none', color: '#000', padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Today</button>}
            </div>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Dept</th><th style={{ textAlign: 'center' }}>In</th><th style={{ textAlign: 'center' }}>Out</th><th style={{ textAlign: 'center' }}>Hours</th><th style={{ textAlign: 'center' }}>Type</th><th style={{ textAlign: 'center' }}>Status</th><th>Notes</th><th></th></tr></thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 700 }}>{(e.employee as any)?.full_name}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{(e.employee as any)?.department}</td>
                      <td className="td-mono" style={{ textAlign: 'center', color: isLate(e.clock_in) ? '#f59e0b' : undefined }}>{e.clock_in || '---'}</td>
                      <td className="td-mono" style={{ textAlign: 'center' }}>{e.clock_out || '---'}</td>
                      <td className="td-mono" style={{ textAlign: 'center', fontWeight: 700, color: e.hours && e.hours >= 8 ? '#22c55e' : e.hours ? '#f59e0b' : 'var(--text3)' }}>{e.hours ? `${e.hours}h` : '---'}</td>
                      <td style={{ textAlign: 'center' }}><span style={{ fontSize: 10, background: `${TYPE_COLORS[e.entry_type] || '#aaa'}22`, color: TYPE_COLORS[e.entry_type] || '#aaa', padding: '2px 7px', borderRadius: 4 }}>{TYPE_LABELS[e.entry_type] || e.entry_type}</span></td>
                      <td style={{ textAlign: 'center' }}><span style={{ fontSize: 10, background: `${STATUS_COLORS[e.status] || '#aaa'}22`, color: STATUS_COLORS[e.status] || '#aaa', padding: '2px 7px', borderRadius: 4 }}>{e.status}</span></td>
                      <td style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes || ''}</td>
                      {canManage && <td><button onClick={() => openEdit(e)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '3px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>Edit</button></td>}
                    </tr>
                  ))}
                  {entries.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: 'var(--text3)' }}>No entries for {logDate}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* WEEKLY TAB */}
      {tab === 'weekly' && (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 800 }}>Weekly Summary</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d.toISOString().split('T')[0]) }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>&lt; Prev</button>
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{weekStart} to {weekDays[6]}</span>
              <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d.toISOString().split('T')[0]) }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Next &gt;</button>
            </div>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 900 }}>
                <thead><tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', position: 'sticky', left: 0, background: 'var(--surface2)', zIndex: 1 }}>EMPLOYEE</th>
                  {weekDays.map(d => {
                    const dayName = new Date(d).toLocaleDateString('en', { weekday: 'short' })
                    const dayNum = new Date(d).getDate()
                    const isT = d === today
                    return <th key={d} style={{ padding: '10px 6px', textAlign: 'center', fontSize: 10, color: isT ? 'var(--accent)' : 'var(--text3)', fontWeight: isT ? 800 : 600, minWidth: 80 }}>{dayName} {dayNum}</th>
                  })}
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 10, color: 'var(--accent)', fontWeight: 800 }}>TOTAL</th>
                </tr></thead>
                <tbody>
                  {filteredEmployees.map(emp => {
                    const empWeek = weeklyMap[emp.id] || {}
                    const totalHours = weekDays.reduce((s, d) => s + (empWeek[d]?.hours || 0), 0)
                    const daysPresent = weekDays.filter(d => empWeek[d] && empWeek[d].status !== 'absent').length
                    return (
                      <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>
                          <div>{emp.full_name}</div>
                          <div style={{ fontSize: 9, color: 'var(--text3)' }}>{emp.department}</div>
                        </td>
                        {weekDays.map(d => {
                          const entry = empWeek[d]
                          if (!entry) return <td key={d} style={{ textAlign: 'center', padding: 6, color: 'var(--text3)' }}><span style={{ fontSize: 10 }}>---</span></td>
                          const color = STATUS_COLORS[entry.status] || 'var(--text3)'
                          return (
                            <td key={d} style={{ textAlign: 'center', padding: 6 }}>
                              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color }}>{entry.hours ? `${entry.hours}h` : entry.status === 'absent' ? 'ABS' : entry.clock_in || '?'}</div>
                              {entry.clock_in && entry.clock_out && <div style={{ fontSize: 9, color: 'var(--text3)' }}>{entry.clock_in}-{entry.clock_out}</div>}
                              {entry.status === 'late' && <span style={{ fontSize: 8, color: '#f59e0b' }}>Late</span>}
                            </td>
                          )
                        })}
                        <td style={{ textAlign: 'center', padding: '10px 14px' }}>
                          <div style={{ fontWeight: 800, fontSize: 13, fontFamily: 'var(--mono)', color: totalHours >= 40 ? '#22c55e' : totalHours >= 30 ? '#f59e0b' : '#ef4444' }}>{Math.round(totalHours * 10) / 10}h</div>
                          <div style={{ fontSize: 9, color: 'var(--text3)' }}>{daysPresent}/7 days</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* LOG / EDIT MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setEditId(null) } }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 480, maxWidth: '95vw' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>{editId ? 'Edit Attendance Entry' : 'Log Attendance Entry'}</div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Employee *</label>
                <select style={inputStyle} value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} disabled={!!editId}>
                  <option value="">Select...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.department})</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Date *</label><input type="date" style={inputStyle} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div><label style={labelStyle}>Entry Type</label><select style={inputStyle} value={form.entry_type} onChange={e => setForm({ ...form, entry_type: e.target.value })}><option value="office">Office</option><option value="field">Field Sales</option><option value="consultation">Consultation</option><option value="remote">Remote</option><option value="leave">Leave</option><option value="absent">Absent</option></select></div>
              <div><label style={labelStyle}>Clock In</label><input type="time" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.clock_in} onChange={e => setForm({ ...form, clock_in: e.target.value })} /></div>
              <div><label style={labelStyle}>Clock Out</label><input type="time" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.clock_out} onChange={e => setForm({ ...form, clock_out: e.target.value })} /></div>
              {form.clock_in && form.clock_out && (
                <div style={{ gridColumn: '1/-1', padding: '8px 12px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 6, fontSize: 11 }}>
                  Calculated: <strong>{calcHours(form.clock_in, form.clock_out)}h</strong>
                  {isLate(form.clock_in) && <span style={{ marginLeft: 10, color: '#f59e0b', fontWeight: 700 }}>LATE (after {OFFICE_START})</span>}
                </div>
              )}
              <div style={{ gridColumn: '1/-1' }}><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, resize: 'none', height: 50 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Hospital visit, client meeting at Masaki..." /></div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setShowModal(false); setEditId(null) }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEntry}>{editId ? 'Update Entry' : 'Save Entry'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
