import { insertJournalWithRetry } from '../../lib/refs'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { tzs } from '../../lib/utils'
import Toast from '../../components/Toast'
import type { HRMProps, Employee, EmployeeLetter, HRMAsset, SalaryAdvance, EmergencyContact } from './hrmTypes'
import { CONTRACT_LABELS, CONTRACT_COLORS, DEPT_COLORS, getInitials, DEFAULT_HR_SETTINGS } from './hrmTypes'

const EMPTY_EC: EmergencyContact = { name: '', relationship: '', phone: '', alt_phone: '', address: '', email: '', notes: '' }

export default function HRMEmployees({ onNav, hrmMode = 'company', linkedEmployeeId, canManage }: HRMProps) {
  const { user } = useAuth()
  const isSelfMode = hrmMode === 'self'
  const readOnly = isSelfMode
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDept, setFilterDept] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [departments, setDepartments] = useState<string[]>(DEFAULT_HR_SETTINGS.departments)

  // Drawer
  const [drawerEmp, setDrawerEmp] = useState<Employee | null>(null)
  const [drawerTab, setDrawerTab] = useState<'profile' | 'emergency' | 'letters' | 'assets' | 'advances' | 'salary_history'>('profile')
  const [letters, setLetters] = useState<EmployeeLetter[]>([])
  const [empAssets, setEmpAssets] = useState<HRMAsset[]>([])
  const [advances, setAdvances] = useState<SalaryAdvance[]>([])
  const [salaryHistory, setSalaryHistory] = useState<any[]>([])

  // New employee form
  const [form, setForm] = useState({
    full_name: '', job_title: '', department: 'Management', contract_type: 'full_time',
    start_date: '', end_date: '', gross_salary: '', whatsapp: '', bank_name: '', bank_account: '',
    nssf_number: '', nssf_enabled: false, paye_enabled: true, sdl_enabled: true,
    tin_number: '', nida_number: '', email: '', date_of_birth: '',
    emergency_contacts: [{ ...EMPTY_EC }] as EmergencyContact[],
    notes: '',
  })

  // Letter modal
  const [showLetterModal, setShowLetterModal] = useState(false)
  const [letterForm, setLetterForm] = useState({ letter_type: 'Offer Letter', issued_date: '', issued_by: '', notes: '' })

  // Advance modal
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [advanceForm, setAdvanceForm] = useState({ amount: '', monthly_deduction: '', issued_date: '', source_account: '', notes: '' })
  const [cashAccounts, setCashAccounts] = useState<{ id: string; code: string; name: string }[]>([])

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)

  useEffect(() => { load(); loadSettings() }, [hrmMode, linkedEmployeeId])

  // Self mode: auto-open own profile
  useEffect(() => {
    if (isSelfMode && linkedEmployeeId && employees.length > 0) {
      const me = employees.find(e => e.id === linkedEmployeeId)
      if (me) openDrawer(me)
    }
  }, [isSelfMode, linkedEmployeeId, employees])

  const load = async () => {
    setLoading(true)
    if (isSelfMode && linkedEmployeeId) {
      const { data } = await supabase.from('hrm_employees').select('*').eq('id', linkedEmployeeId).single()
      if (data) setEmployees([data])
      else setEmployees([])
    } else {
      const { data } = await supabase.from('hrm_employees').select('*').eq('is_active', true).order('full_name')
      if (data) setEmployees(data)
    }
    setLoading(false)
  }

  const loadSettings = async () => {
    const [settRes, cashRes] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'hr_settings').single(),
      supabase.from('accounts').select('id, code, name').eq('category', 'Cash & Bank').eq('is_active', true).order('code'),
    ])
    if (settRes.data?.value) {
      try {
        const s = JSON.parse(settRes.data.value)
        if (s.departments) setDepartments(s.departments)
      } catch {}
    }
    if (cashRes.data) setCashAccounts(cashRes.data)
  }

  const openDrawer = async (emp: Employee) => {
    setDrawerEmp(emp)
    setDrawerTab('profile')
    setEditing(false)
    const [letRes, assetRes, advRes, salRes] = await Promise.all([
      supabase.from('hrm_letters').select('*').eq('employee_id', emp.id).order('issued_date', { ascending: false }),
      supabase.from('hrm_assets').select('*').eq('employee_id', emp.id),
      supabase.from('hrm_salary_advances').select('*').eq('employee_id', emp.id).order('issued_date', { ascending: false }),
      supabase.from('hrm_salary_history').select('*').eq('employee_id', emp.id).order('effective_date', { ascending: false }),
    ])
    setLetters(letRes.data || [])
    setEmpAssets(assetRes.data || [])
    setAdvances(advRes.data || [])
    setSalaryHistory(salRes.data || [])
  }

  const saveEmployee = async () => {
    if (!form.full_name.trim() || !form.start_date || !form.gross_salary) {
      setToast('Fill in required fields'); setToastType('error'); return
    }
    const initials = getInitials(form.full_name)
    // Generate emp code — MWG-0001 series (Your Organization)
    const { data: allCodes } = await supabase.from('hrm_employees').select('emp_code').like('emp_code', 'MWG-%').order('created_at', { ascending: false }).limit(50)
    let maxNum = 0
    for (const row of (allCodes || [])) {
      const num = parseInt((row.emp_code || '').replace('MWG-', '')) || 0
      if (num > maxNum) maxNum = num
    }
    const empCode = `MWG-${String(maxNum + 1).padStart(4, '0')}`

    const { error } = await supabase.from('hrm_employees').insert({
      emp_code: empCode,
      full_name: form.full_name.trim(),
      initials,
      job_title: form.job_title.trim(),
      department: form.department,
      contract_type: form.contract_type,
      start_date: form.start_date,
      end_date: form.end_date || null,
      gross_salary: parseFloat(form.gross_salary) || 0,
      whatsapp: form.whatsapp || null,
      bank_name: form.bank_name || null,
      bank_account: form.bank_account || null,
      nssf_number: form.nssf_number || null,
      nssf_enabled: form.nssf_enabled,
      paye_enabled: form.paye_enabled,
      sdl_enabled: form.sdl_enabled,
      tin_number: form.tin_number || null,
      nida_number: form.nida_number || null,
      email: form.email || null,
      date_of_birth: form.date_of_birth || null,
      emergency_contact: form.emergency_contacts?.[0]?.name ? `${form.emergency_contacts[0].name} - ${form.emergency_contacts[0].phone}` : null,
      emergency_contacts: form.emergency_contacts.filter(ec => ec.name.trim()) || null,
      notes: form.notes || null,
      is_active: true,
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    // Also record initial salary in history
    const { data: newEmp } = await supabase.from('hrm_employees').select('id').eq('emp_code', empCode).single()
    if (newEmp) {
      await supabase.from('hrm_salary_history').insert({
        employee_id: newEmp.id, effective_date: form.start_date,
        old_gross: 0, new_gross: parseFloat(form.gross_salary) || 0,
        reason: 'Initial hire', approved_by: 'System',
      })
    }
    setToast(`${form.full_name} added as ${empCode}`)
    setToastType('success')
    setShowModal(false)
    setForm({ full_name: '', job_title: '', department: 'Management', contract_type: 'full_time', start_date: '', end_date: '', gross_salary: '', whatsapp: '', bank_name: '', bank_account: '', nssf_number: '', nssf_enabled: false, paye_enabled: true, sdl_enabled: true, tin_number: '', nida_number: '', date_of_birth: '', email: '', emergency_contacts: [{ ...EMPTY_EC }], notes: '' })
    load()
  }

  const issueLetter = async () => {
    if (!drawerEmp || !letterForm.letter_type || !letterForm.issued_date) return
    const { error } = await supabase.from('hrm_letters').insert({
      employee_id: drawerEmp.id,
      letter_type: letterForm.letter_type,
      issued_date: letterForm.issued_date,
      issued_by: letterForm.issued_by || 'Management',
      notes: letterForm.notes || null,
      status: 'pending',
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast(`${letterForm.letter_type} issued to ${drawerEmp.full_name}`)
    setToastType('success')
    setShowLetterModal(false)
    openDrawer(drawerEmp)
  }

  const issueAdvance = async () => {
    if (!drawerEmp) return
    const amount = parseFloat(advanceForm.amount)
    const monthlyDed = parseFloat(advanceForm.monthly_deduction)
    if (!amount || amount <= 0) { setToast('Enter advance amount'); setToastType('error'); return }
    if (!monthlyDed || monthlyDed <= 0) { setToast('Enter monthly deduction'); setToastType('error'); return }
    if (!advanceForm.source_account) { setToast('Select source account (Cash/Bank)'); setToastType('error'); return }
    if (!advanceForm.issued_date) { setToast('Enter issue date'); setToastType('error'); return }

    try {
      // Ensure Salary Advance Receivable account exists (1060)
      let { data: advAcct } = await supabase.from('accounts').select('id').eq('code', '1060').single()
      if (!advAcct) {
        const { data: created, error: createErr } = await supabase.from('accounts').insert({
          code: '1060', name: 'Salary Advance Receivable', type: 'asset',
          // accounts table has no is_default column — see HRMPayroll for context.
          category: 'Current Assets', balance: 0, is_active: true,
        }).select('id').single()
        if (createErr) throw new Error(createErr.message)
        advAcct = created
      }

      // Create journal: Dr Salary Advance Receivable (1060) / Cr Cash/Bank
      const ref = `ADV-${drawerEmp.emp_code}-${advanceForm.issued_date.replace(/-/g, '')}`
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + ref, posting_date: advanceForm.issued_date,
        description: `Salary Advance — ${drawerEmp.full_name} — ${ref}`,
        journal_type: 'salary_advance', source_type: 'salary_advance', source_ref: ref,
        posted_by: user?.full_name || 'System', status: 'posted',
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw

      const jLines = [
        { journal_id: journal.id, line_number: 1, account_id: advAcct!.id, description: `Advance to ${drawerEmp.full_name}`, debit: amount, credit: 0 },
        { journal_id: journal.id, line_number: 2, account_id: advanceForm.source_account, description: `Cash/Bank out — Advance ${ref}`, debit: 0, credit: amount },
      ]
      await supabase.from('journal_lines').insert(jLines)
      await Promise.all(jLines.map(l => supabase.rpc('update_account_balance', { p_account_id: l.account_id, p_debit: l.debit, p_credit: l.credit })))

      // Create voucher
      await supabase.from('vouchers').insert({
        ref, type: 'salary_advance', posting_date: advanceForm.issued_date,
        description: `Salary Advance — ${drawerEmp.full_name}`,
        total_amount: amount, status: 'posted', journal_id: journal.id,
        notes: advanceForm.notes || null, posted_by: user?.full_name || 'System',
      })

      // Create advance record
      await supabase.from('hrm_salary_advances').insert({
        employee_id: drawerEmp.id, amount, remaining: amount,
        monthly_deduction: monthlyDed, issued_date: advanceForm.issued_date,
        status: 'active', notes: advanceForm.notes || null,
      })

      setToast(`Advance ${tzs(amount)} issued to ${drawerEmp.full_name} — Dr 1060 / Cr ${cashAccounts.find(a => a.id === advanceForm.source_account)?.code || 'Bank'}`)
      setToastType('success')
      setShowAdvanceModal(false)
      setAdvanceForm({ amount: '', monthly_deduction: '', issued_date: '', source_account: '', notes: '' })
      openDrawer(drawerEmp)
    } catch (err: any) {
      setToast(err.message || 'Failed'); setToastType('error')
    }
  }

  const filtered = filterDept === 'all' ? employees : employees.filter(e => e.department === filterDept)

  const startEdit = () => {
    if (!drawerEmp) return
    const ecs: EmergencyContact[] = drawerEmp.emergency_contacts && Array.isArray(drawerEmp.emergency_contacts) && drawerEmp.emergency_contacts.length > 0
      ? drawerEmp.emergency_contacts
      : [{ ...EMPTY_EC, name: drawerEmp.emergency_contact?.split(' - ')?.[0] || '', phone: drawerEmp.emergency_contact?.split(' - ')?.[1] || '' }]
    setEditForm({
      full_name: drawerEmp.full_name, job_title: drawerEmp.job_title, department: drawerEmp.department,
      contract_type: drawerEmp.contract_type, start_date: drawerEmp.start_date || '', end_date: drawerEmp.end_date || '',
      gross_salary: String(drawerEmp.gross_salary || 0), whatsapp: drawerEmp.whatsapp || '',
      bank_name: drawerEmp.bank_name || '', bank_account: drawerEmp.bank_account || '',
      nssf_number: drawerEmp.nssf_number || '', nssf_enabled: drawerEmp.nssf_enabled,
      paye_enabled: drawerEmp.paye_enabled !== false, sdl_enabled: drawerEmp.sdl_enabled !== false,
      tin_number: drawerEmp.tin_number || '', nida_number: drawerEmp.nida_number || '',
      email: drawerEmp.email || '',
      date_of_birth: drawerEmp.date_of_birth || '',
      emergency_contacts: ecs,
      notes: drawerEmp.notes || '',
    })
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!drawerEmp) return
    const oldGross = drawerEmp.gross_salary || 0
    const newGross = parseFloat(editForm.gross_salary) || 0
    const initials = getInitials(editForm.full_name || drawerEmp.full_name)

    const { error } = await supabase.from('hrm_employees').update({
      full_name: editForm.full_name.trim(), initials,
      job_title: editForm.job_title.trim(), department: editForm.department,
      contract_type: editForm.contract_type,
      start_date: editForm.start_date || drawerEmp.start_date,
      end_date: editForm.end_date || null,
      gross_salary: newGross, whatsapp: editForm.whatsapp || null,
      bank_name: editForm.bank_name || null, bank_account: editForm.bank_account || null,
      nssf_number: editForm.nssf_number || null, nssf_enabled: editForm.nssf_enabled,
      paye_enabled: editForm.paye_enabled, sdl_enabled: editForm.sdl_enabled,
      tin_number: editForm.tin_number || null,
      nida_number: editForm.nida_number || null,
      email: editForm.email || null,
      date_of_birth: editForm.date_of_birth || null,
      emergency_contact: (editForm.emergency_contacts || []).filter((ec: EmergencyContact) => ec.name.trim()).length > 0 ? `${editForm.emergency_contacts[0].name} - ${editForm.emergency_contacts[0].phone}` : null,
      emergency_contacts: (editForm.emergency_contacts || []).filter((ec: EmergencyContact) => ec.name.trim()).length > 0 ? editForm.emergency_contacts.filter((ec: EmergencyContact) => ec.name.trim()) : null,
      notes: editForm.notes || null,
    }).eq('id', drawerEmp.id)

    if (error) { setToast(error.message); setToastType('error'); return }

    // Track salary change
    if (newGross !== oldGross && newGross > 0) {
      await supabase.from('hrm_salary_history').insert({
        employee_id: drawerEmp.id, effective_date: new Date().toISOString().split('T')[0],
        old_gross: oldGross, new_gross: newGross,
        reason: 'Profile update', approved_by: user?.full_name || 'System',
      })
    }

    setToast('Employee updated'); setToastType('success')
    setEditing(false)
    load()
    // Refresh drawer
    const { data: refreshed } = await supabase.from('hrm_employees').select('*').eq('id', drawerEmp.id).single()
    if (refreshed) setDrawerEmp(refreshed)
  }

  const deactivateEmployee = async () => {
    if (!drawerEmp) return
    await supabase.from('hrm_employees').update({ is_active: false }).eq('id', drawerEmp.id)
    setToast(`${drawerEmp.full_name} deactivated`); setToastType('success')
    setShowDeactivateConfirm(false); setDrawerEmp(null); load()
  }

  const daysUntilExpiry = (d: string | null) => {
    if (!d) return null
    return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }

  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }

  // Self mode: show not-linked message
  if (isSelfMode && !linkedEmployeeId) {
    return (
      <div className="page">
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>👤</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Profile Not Linked</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Your account email is not linked to an employee profile. Please contact your HR administrator.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{isSelfMode ? 'My Profile' : 'Employees'}</div>
          <div className="page-sub">{isSelfMode ? 'Your personal HR profile' : 'Profiles, letters, assets, contract details'}</div>
        </div>
        {!isSelfMode && (
          <div className="page-actions">
            <select style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {canManage && <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ New Employee</button>}
          </div>
        )}
      </div>

      {!isSelfMode && (loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading employees...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {filtered.map(emp => {
            const daysLeft = daysUntilExpiry(emp.end_date)
            const empColor = DEPT_COLORS[emp.department] || '#6366f1'
            return (
              <div key={emp.id} className="card" style={{ padding: 0, overflow: 'hidden', borderTop: `3px solid ${empColor}` }}>
                {/* Header */}
                <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${empColor}22`, color: empColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{emp.initials}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{emp.full_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{emp.job_title}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <span style={{ fontSize: 10, background: `${CONTRACT_COLORS[emp.contract_type]}22`, color: CONTRACT_COLORS[emp.contract_type], padding: '1px 5px', borderRadius: 4 }}>{CONTRACT_LABELS[emp.contract_type]}</span>
                      {emp.nssf_enabled && <span style={{ fontSize: 10, background: '#3b82f622', color: '#3b82f6', padding: '1px 5px', borderRadius: 4 }}>NSSF</span>}
                      {emp.paye_enabled === false && <span style={{ fontSize: 10, background: '#f59e0b22', color: '#f59e0b', padding: '1px 5px', borderRadius: 4 }}>No PAYE</span>}
                      {emp.sdl_enabled === false && <span style={{ fontSize: 10, background: '#a78bfa22', color: '#a78bfa', padding: '1px 5px', borderRadius: 4 }}>No SDL</span>}
                      {emp.paye_enabled === false && <span style={{ fontSize: 10, background: '#f59e0b22', color: '#f59e0b', padding: '1px 5px', borderRadius: 4 }}>No PAYE</span>}
                      {emp.sdl_enabled === false && <span style={{ fontSize: 10, background: '#f59e0b22', color: '#f59e0b', padding: '1px 5px', borderRadius: 4 }}>No SDL</span>}
                      {daysLeft !== null && daysLeft <= 90 && daysLeft > 0 && (
                        <span style={{ fontSize: 10, background: '#ef444422', color: '#ef4444', padding: '1px 5px', borderRadius: 4 }}>Renew {daysLeft}d</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => openDrawer(emp)} style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '5px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>View</button>
                </div>
                {/* Details */}
                <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, fontSize: 11 }}>
                  <div style={{ color: 'var(--text3)' }}>ID</div><div style={{ fontFamily: 'var(--mono)' }}>{emp.emp_code}</div>
                  <div style={{ color: 'var(--text3)' }}>Start</div><div>{emp.start_date}</div>
                  <div style={{ color: 'var(--text3)' }}>Gross</div><div style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{(emp.gross_salary || 0).toLocaleString()}</div>
                </div>
              </div>
            )
          })}

          {/* Add Employee card */}
          {canManage && (
            <div className="card" onClick={() => setShowModal(true)} style={{ padding: 0, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, cursor: 'pointer', background: 'var(--surface2)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>+</div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>Add Employee</div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Self mode loading */}
      {isSelfMode && loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading your profile...</div>
      )}

      {/* ── EMPLOYEE DRAWER ──────────────────── */}
      {drawerEmp && (
        <div style={{ position: isSelfMode ? 'relative' : 'fixed', top: isSelfMode ? undefined : 0, right: isSelfMode ? undefined : 0, width: isSelfMode ? '100%' : 500, height: isSelfMode ? undefined : '100vh', background: 'var(--surface)', borderLeft: isSelfMode ? 'none' : '1px solid var(--border)', zIndex: isSelfMode ? 0 : 200, overflowY: 'auto', boxShadow: isSelfMode ? 'none' : '-4px 0 24px rgba(0,0,0,.4)', maxWidth: isSelfMode ? 700 : undefined, margin: isSelfMode ? '0 auto' : undefined }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: isSelfMode ? undefined : 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{isSelfMode ? 'My Profile' : 'Employee Profile'}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {!editing && canManage && !readOnly ? (
                <>
                  <button onClick={startEdit} style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '5px 12px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => setShowDeactivateConfirm(true)} style={{ background: '#ef444422', border: '1px solid #ef444444', color: '#ef4444', padding: '5px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Deactivate</button>
                </>
              ) : (
                <>
                  <button onClick={saveEdit} style={{ background: '#22c55e', color: '#000', border: 'none', padding: '5px 12px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditing(false)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 10px', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}>Cancel</button>
                </>
              )}
              {!isSelfMode && <button onClick={() => { setDrawerEmp(null); setEditing(false) }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text)' }}>x</button>}
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {/* Avatar & Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: `${DEPT_COLORS[drawerEmp.department] || '#6366f1'}22`, color: DEPT_COLORS[drawerEmp.department] || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800 }}>{drawerEmp.initials}</div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 15 }}>{drawerEmp.full_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{drawerEmp.job_title} · {drawerEmp.department} · {CONTRACT_LABELS[drawerEmp.contract_type]}</div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
              {(['profile', 'emergency', 'letters', 'assets', 'advances', 'salary_history'] as const).map(tab => (
                <button key={tab} onClick={() => setDrawerTab(tab)} style={{ flex: 1, padding: 8, fontSize: 10, fontWeight: drawerTab === tab ? 700 : 600, background: drawerTab === tab ? 'var(--accent)' : 'var(--surface2)', color: drawerTab === tab ? '#000' : 'var(--text3)', border: 'none', cursor: 'pointer', borderLeft: tab !== 'profile' ? '1px solid var(--border)' : 'none' }}>
                  {tab === 'profile' ? 'Profile' : tab === 'emergency' ? 'Emergency' : tab === 'letters' ? 'Letters' : tab === 'assets' ? 'Assets' : tab === 'advances' ? 'Advances' : 'Salary'}
                </button>
              ))}
            </div>

            {/* PROFILE TAB */}
            {drawerTab === 'profile' && !editing && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, marginBottom: 12 }}>
                  {[
                    ['Employee ID', drawerEmp.emp_code],
                    ['Department', drawerEmp.department],
                    ['Contract', CONTRACT_LABELS[drawerEmp.contract_type]],
                    ['Start Date', drawerEmp.start_date],
                    ['End Date', drawerEmp.end_date || 'N/A'],
                    ['Email', (drawerEmp as any).email || 'N/A'],
                    ...(isSelfMode ? [] : [['Gross Salary', `TZS ${(drawerEmp.gross_salary || 0).toLocaleString()}`]]),
                    ['Bank', `${drawerEmp.bank_name || ''} ${drawerEmp.bank_account || ''}`],
                    ['NSSF', drawerEmp.nssf_enabled ? (drawerEmp.nssf_number || 'Enabled') : 'Not enrolled'],
                    ...(isSelfMode ? [] : [['PAYE', drawerEmp.paye_enabled !== false ? 'Subject to PAYE' : 'Exempt']]),
                    ...(isSelfMode ? [] : [['SDL', drawerEmp.sdl_enabled !== false ? 'Subject to SDL' : 'Exempt']]),
                    ['TIN', drawerEmp.tin_number || 'N/A'],
                    ['NIDA', (drawerEmp as any).nida_number || 'N/A'],
                    ['WhatsApp', drawerEmp.whatsapp || 'N/A'],
                    ['DOB', drawerEmp.date_of_birth || 'N/A'],
                  ].map(([label, val], i) => (
                    <div key={i} style={{ background: 'var(--surface2)', padding: 9, borderRadius: 6 }}>
                      <div style={{ color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontWeight: 700, fontFamily: ['Employee ID', 'Gross Salary', 'Bank', 'NSSF', 'TIN', 'NIDA'].includes(label as string) ? 'var(--mono)' : undefined }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PROFILE TAB — EDIT MODE */}
            {drawerTab === 'profile' && editing && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                <div><label style={labelStyle}>Full Name</label><input style={inputStyle} value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} /></div>
                <div><label style={labelStyle}>Job Title</label><input style={inputStyle} value={editForm.job_title} onChange={e => setEditForm({ ...editForm, job_title: e.target.value })} /></div>
                <div><label style={labelStyle}>Department</label><select style={inputStyle} value={editForm.department} onChange={e => setEditForm({ ...editForm, department: e.target.value })}>{departments.map(d => <option key={d}>{d}</option>)}</select></div>
                <div><label style={labelStyle}>Contract Type</label><select style={inputStyle} value={editForm.contract_type} onChange={e => setEditForm({ ...editForm, contract_type: e.target.value })}><option value="full_time">Full-time</option><option value="fixed_term">Fixed-term</option><option value="part_time">Part-time</option><option value="intern">Intern</option><option value="consultant">Consultant</option></select></div>
                <div><label style={labelStyle}>Start Date</label><input type="date" style={inputStyle} value={editForm.start_date} onChange={e => setEditForm({ ...editForm, start_date: e.target.value })} /></div>
                <div><label style={labelStyle}>End Date</label><input type="date" style={inputStyle} value={editForm.end_date} onChange={e => setEditForm({ ...editForm, end_date: e.target.value })} /></div>
                <div><label style={labelStyle}>Gross Salary (TZS)</label><input type="number" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={editForm.gross_salary} onChange={e => setEditForm({ ...editForm, gross_salary: e.target.value })} /></div>
                <div><label style={labelStyle}>Email (self-service link)</label><input type="email" style={inputStyle} value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} placeholder="Links employee to login" /></div>
                <div><label style={labelStyle}>WhatsApp</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={editForm.whatsapp} onChange={e => setEditForm({ ...editForm, whatsapp: e.target.value })} /></div>
                <div><label style={labelStyle}>Bank Name</label><input style={inputStyle} value={editForm.bank_name} onChange={e => setEditForm({ ...editForm, bank_name: e.target.value })} /></div>
                <div><label style={labelStyle}>Bank Account</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={editForm.bank_account} onChange={e => setEditForm({ ...editForm, bank_account: e.target.value })} /></div>
                <div><label style={labelStyle}>TIN Number</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={editForm.tin_number} onChange={e => setEditForm({ ...editForm, tin_number: e.target.value })} /></div>
                <div><label style={labelStyle}>NIDA Number</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={editForm.nida_number || ''} onChange={e => setEditForm({ ...editForm, nida_number: e.target.value })} placeholder="National ID (NIDA)" /></div>
                <div><label style={labelStyle}>Date of Birth</label><input type="date" style={inputStyle} value={editForm.date_of_birth} onChange={e => setEditForm({ ...editForm, date_of_birth: e.target.value })} /></div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editForm.nssf_enabled} onChange={e => setEditForm({ ...editForm, nssf_enabled: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
                    Enroll in NSSF
                  </label>
                  {editForm.nssf_enabled && <input style={{ ...inputStyle, marginTop: 6, fontFamily: 'var(--mono)' }} value={editForm.nssf_number} onChange={e => setEditForm({ ...editForm, nssf_number: e.target.value })} placeholder="NSSF Number" />}
                </div>
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editForm.paye_enabled !== false} onChange={e => setEditForm({ ...editForm, paye_enabled: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
                    Subject to PAYE
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editForm.sdl_enabled !== false} onChange={e => setEditForm({ ...editForm, sdl_enabled: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
                    Subject to SDL
                  </label>
                </div>
                <div style={{ gridColumn: '1/-1' }}><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, resize: 'none', height: 50 }} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></div>
                {parseFloat(editForm.gross_salary) !== (drawerEmp.gross_salary || 0) && parseFloat(editForm.gross_salary) > 0 && (
                  <div style={{ gridColumn: '1/-1', padding: '8px 12px', background: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: 6, fontSize: 11, color: '#f59e0b' }}>
                    Salary change: {(drawerEmp.gross_salary || 0).toLocaleString()} &rarr; {parseFloat(editForm.gross_salary).toLocaleString()} ({Math.round(((parseFloat(editForm.gross_salary) - (drawerEmp.gross_salary || 0)) / Math.max(drawerEmp.gross_salary || 1, 1)) * 100)}%). Will be recorded in salary history.
                  </div>
                )}
              </div>
            )}

            {/* EMERGENCY CONTACTS TAB */}
            {drawerTab === 'emergency' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>EMERGENCY CONTACTS</div>
                {(() => {
                  const ecs = (drawerEmp as any).emergency_contacts && Array.isArray((drawerEmp as any).emergency_contacts) && (drawerEmp as any).emergency_contacts.length > 0
                    ? (drawerEmp as any).emergency_contacts as EmergencyContact[]
                    : drawerEmp.emergency_contact ? [{ name: drawerEmp.emergency_contact.split(' - ')[0] || drawerEmp.emergency_contact, phone: drawerEmp.emergency_contact.split(' - ')[1] || '', relationship: '', address: '' } as EmergencyContact] : []
                  if (ecs.length === 0) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>No emergency contacts on file</div>
                  return ecs.map((ec: EmergencyContact, i: number) => (
                    <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{ec.name || 'Unnamed'}</div>
                        {ec.relationship && <span style={{ fontSize: 10, background: '#6366f122', color: '#6366f1', padding: '2px 8px', borderRadius: 4 }}>{ec.relationship}</span>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                        {ec.phone && <div><span style={{ color: 'var(--text3)' }}>Phone: </span><span style={{ fontFamily: 'var(--mono)' }}>{ec.phone}</span></div>}
                        {ec.alt_phone && <div><span style={{ color: 'var(--text3)' }}>Alt Phone: </span><span style={{ fontFamily: 'var(--mono)' }}>{ec.alt_phone}</span></div>}
                        {ec.email && <div><span style={{ color: 'var(--text3)' }}>Email: </span>{ec.email}</div>}
                        {ec.address && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text3)' }}>Address: </span>{ec.address}</div>}
                        {ec.notes && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text3)' }}>Notes: </span>{ec.notes}</div>}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}

            {/* LETTERS TAB */}
            {drawerTab === 'letters' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)' }}>COMPANY LETTERS</div>
                  {canManage && !readOnly && <button onClick={() => { setLetterForm({ letter_type: 'Offer Letter', issued_date: new Date().toISOString().split('T')[0], issued_by: '', notes: '' }); setShowLetterModal(true) }} style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '5px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>+ Issue Letter</button>}
                </div>
                {letters.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>No letters issued yet</div>
                ) : letters.map(l => (
                  <div key={l.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{l.letter_type}</span>
                      <span style={{ fontSize: 10, background: l.status === 'acknowledged' ? '#22c55e22' : '#f59e0b22', color: l.status === 'acknowledged' ? '#22c55e' : '#f59e0b', padding: '2px 7px', borderRadius: 4 }}>{l.status === 'acknowledged' ? 'Acknowledged' : 'Pending'}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{l.issued_date} · {l.issued_by}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ASSETS TAB */}
            {drawerTab === 'assets' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>ASSIGNED ASSETS</div>
                {empAssets.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>No assets assigned</div>
                ) : empAssets.map(a => (
                  <div key={a.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', marginBottom: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{a.asset_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{a.asset_tag} · {a.issued_date}</div>
                    </div>
                    <span style={{ fontSize: 10, background: '#22c55e22', color: '#22c55e', padding: '2px 7px', borderRadius: 4 }}>{a.condition}</span>
                  </div>
                ))}
                <button onClick={() => onNav('hrm-assets')} style={{ width: '100%', marginTop: 10, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Manage All Assets</button>
              </div>
            )}

            {/* ADVANCES TAB */}
            {drawerTab === 'advances' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)' }}>SALARY ADVANCES / LOANS</div>
                  {canManage && !readOnly && <button onClick={() => { setAdvanceForm({ amount: '', monthly_deduction: '', issued_date: new Date().toISOString().split('T')[0], source_account: cashAccounts[0]?.id || '', notes: '' }); setShowAdvanceModal(true) }} style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '5px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>+ Issue Advance</button>}
                </div>
                {advances.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>No advances on record</div>
                ) : advances.map(a => (
                  <div key={a.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{tzs(a.amount)}</span>
                      <span style={{ fontSize: 10, background: a.status === 'active' ? '#f59e0b22' : '#22c55e22', color: a.status === 'active' ? '#f59e0b' : '#22c55e', padding: '2px 7px', borderRadius: 4 }}>{a.status}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>Remaining: {tzs(a.remaining)} · Monthly deduction: {tzs(a.monthly_deduction)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>Issued: {a.issued_date}</div>
                    {a.remaining > 0 && (
                      <div style={{ marginTop: 4, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(((a.amount - a.remaining) / a.amount) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* SALARY HISTORY TAB */}
            {drawerTab === 'salary_history' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>SALARY REVISION HISTORY</div>
                {salaryHistory.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>No salary history</div>
                ) : salaryHistory.map((s, i) => (
                  <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                      <span style={{ fontFamily: 'var(--mono)' }}>{s.effective_date}</span>
                      <span style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{(s.new_gross || 0).toLocaleString()}</span>
                    </div>
                    {s.old_gross > 0 && (
                      <div style={{ fontSize: 10, color: s.new_gross > s.old_gross ? '#22c55e' : '#ef4444' }}>
                        From {(s.old_gross || 0).toLocaleString()} ({s.new_gross > s.old_gross ? '+' : ''}{Math.round(((s.new_gross - s.old_gross) / s.old_gross) * 100)}%)
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{s.reason} · {s.approved_by}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── NEW EMPLOYEE MODAL ──────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 620, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 800 }}>New Employee</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text3)' }}>x</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Full Name *</label><input style={inputStyle} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Full name" /></div>
                <div><label style={labelStyle}>Job Title *</label><input style={inputStyle} value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} placeholder="e.g. Sales Representative" /></div>
                <div><label style={labelStyle}>Department</label><select style={inputStyle} value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>{departments.map(d => <option key={d}>{d}</option>)}</select></div>
                <div><label style={labelStyle}>Contract Type</label><select style={inputStyle} value={form.contract_type} onChange={e => setForm({ ...form, contract_type: e.target.value })}><option value="full_time">Full-time Permanent</option><option value="fixed_term">Fixed-term Contract</option><option value="part_time">Part-time</option><option value="intern">Intern</option><option value="consultant">Consultant</option></select></div>
                <div><label style={labelStyle}>Start Date *</label><input type="date" style={inputStyle} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><label style={labelStyle}>End Date (if fixed-term)</label><input type="date" style={inputStyle} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
                <div><label style={labelStyle}>Gross Salary (TZS/month) *</label><input type="number" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.gross_salary} onChange={e => setForm({ ...form, gross_salary: e.target.value })} placeholder="e.g. 900000" /></div>
                <div><label style={labelStyle}>Email (self-service)</label><input type="email" style={inputStyle} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Links to login for self-service" /></div>
                <div><label style={labelStyle}>WhatsApp Number</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="+255 7XX XXX XXX" /></div>
                <div><label style={labelStyle}>NIDA Number</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.nida_number} onChange={e => setForm({ ...form, nida_number: e.target.value })} placeholder="National ID" /></div>
                <div><label style={labelStyle}>Bank Name</label><input style={inputStyle} value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. NMB Bank" /></div>
                <div><label style={labelStyle}>Bank Account No.</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.bank_account} onChange={e => setForm({ ...form, bank_account: e.target.value })} placeholder="For payroll transfer" /></div>
                <div><label style={labelStyle}>TIN Number</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.tin_number} onChange={e => setForm({ ...form, tin_number: e.target.value })} placeholder="TIN-XXX-XXX" /></div>
                <div><label style={labelStyle}>Date of Birth</label><input type="date" style={inputStyle} value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /></div>
              </div>
              {/* Emergency Contacts */}
              <div style={{ marginTop: 14, padding: 12, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>Emergency Contacts</div>
                  <button onClick={() => setForm({ ...form, emergency_contacts: [...form.emergency_contacts, { ...EMPTY_EC }] })} style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
                </div>
                {form.emergency_contacts.map((ec, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 20px', gap: 6, marginBottom: 6, alignItems: 'end' }}>
                    <div><label style={labelStyle}>Name</label><input style={inputStyle} value={ec.name} onChange={e => { const ecs = [...form.emergency_contacts]; ecs[i] = { ...ecs[i], name: e.target.value }; setForm({ ...form, emergency_contacts: ecs }) }} /></div>
                    <div><label style={labelStyle}>Relationship</label><select style={inputStyle} value={ec.relationship} onChange={e => { const ecs = [...form.emergency_contacts]; ecs[i] = { ...ecs[i], relationship: e.target.value }; setForm({ ...form, emergency_contacts: ecs }) }}>
                      <option value="">-</option>
                      {['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Relative', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select></div>
                    <div><label style={labelStyle}>Phone</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={ec.phone} onChange={e => { const ecs = [...form.emergency_contacts]; ecs[i] = { ...ecs[i], phone: e.target.value }; setForm({ ...form, emergency_contacts: ecs }) }} placeholder="+255..." /></div>
                    <button onClick={() => { const ecs = form.emergency_contacts.filter((_, j) => j !== i); setForm({ ...form, emergency_contacts: ecs.length ? ecs : [{ ...EMPTY_EC }] }) }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>x</button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.nssf_enabled} onChange={e => setForm({ ...form, nssf_enabled: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
                    Enroll in NSSF
                  </label>
                  {form.nssf_enabled && <input style={{ ...inputStyle, marginTop: 6, fontFamily: 'var(--mono)' }} value={form.nssf_number} onChange={e => setForm({ ...form, nssf_number: e.target.value })} placeholder="NSSF Number" />}
                </div>
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.paye_enabled} onChange={e => setForm({ ...form, paye_enabled: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
                    Subject to PAYE
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.sdl_enabled} onChange={e => setForm({ ...form, sdl_enabled: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
                    Subject to SDL
                  </label>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, resize: 'none', height: 60 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes..." />
              </div>
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#6366f111', border: '1px solid #6366f133', borderRadius: 6, fontSize: 10, color: '#6366f1' }}>
                Employee will be added to payroll from next cycle. Set their <strong>email</strong> to link them for self-service HRM access.
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEmployee}>Save Employee</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ISSUE LETTER MODAL ─────────────── */}
      {showLetterModal && drawerEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }} onClick={e => { if (e.target === e.currentTarget) setShowLetterModal(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 480, maxWidth: '95vw' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>Issue Letter to {drawerEmp.full_name}</div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label style={labelStyle}>Letter Type *</label><select style={inputStyle} value={letterForm.letter_type} onChange={e => setLetterForm({ ...letterForm, letter_type: e.target.value })}>
                {['Offer Letter', 'Employment Contract', 'Confirmation of Employment', 'Salary Review Letter', 'Warning Letter', 'Commendation Letter', 'Contract Renewal', 'Maternity Leave Approval', 'Termination Letter'].map(t => <option key={t}>{t}</option>)}
              </select></div>
              <div><label style={labelStyle}>Date *</label><input type="date" style={inputStyle} value={letterForm.issued_date} onChange={e => setLetterForm({ ...letterForm, issued_date: e.target.value })} /></div>
              <div><label style={labelStyle}>Issued By</label><input style={inputStyle} value={letterForm.issued_by} onChange={e => setLetterForm({ ...letterForm, issued_by: e.target.value })} placeholder="e.g. Joe Gembe (COO)" /></div>
              <div><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, resize: 'none', height: 60 }} value={letterForm.notes} onChange={e => setLetterForm({ ...letterForm, notes: e.target.value })} placeholder="Key points..." /></div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowLetterModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={issueLetter}>Issue Letter</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ISSUE ADVANCE MODAL ────────────── */}
      {showAdvanceModal && drawerEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }} onClick={e => { if (e.target === e.currentTarget) setShowAdvanceModal(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 480, maxWidth: '95vw' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>Issue Salary Advance to {drawerEmp.full_name}</div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label style={labelStyle}>Advance Amount (TZS) *</label><input type="number" style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700 }} value={advanceForm.amount} onChange={e => setAdvanceForm({ ...advanceForm, amount: e.target.value })} placeholder="e.g. 500000" /></div>
              <div><label style={labelStyle}>Monthly Deduction (TZS) *</label><input type="number" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={advanceForm.monthly_deduction} onChange={e => setAdvanceForm({ ...advanceForm, monthly_deduction: e.target.value })} placeholder="e.g. 100000" /></div>
              {advanceForm.amount && advanceForm.monthly_deduction && parseFloat(advanceForm.monthly_deduction) > 0 && (
                <div style={{ padding: '8px 12px', background: '#6366f111', border: '1px solid #6366f133', borderRadius: 6, fontSize: 11, color: '#6366f1' }}>
                  Recovery: {Math.ceil(parseFloat(advanceForm.amount) / parseFloat(advanceForm.monthly_deduction))} months at {tzs(parseFloat(advanceForm.monthly_deduction))}/month
                </div>
              )}
              <div><label style={labelStyle}>Issue Date *</label><input type="date" style={inputStyle} value={advanceForm.issued_date} onChange={e => setAdvanceForm({ ...advanceForm, issued_date: e.target.value })} /></div>
              <div><label style={labelStyle}>Pay From Account *</label><select style={inputStyle} value={advanceForm.source_account} onChange={e => setAdvanceForm({ ...advanceForm, source_account: e.target.value })}>
                <option value="">— Select Cash/Bank Account —</option>
                {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select></div>
              <div><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, resize: 'none', height: 50 }} value={advanceForm.notes} onChange={e => setAdvanceForm({ ...advanceForm, notes: e.target.value })} placeholder="Reason for advance..." /></div>
              <div style={{ padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10, color: 'var(--text3)' }}>
                Journal: Dr Salary Advance Receivable (1060) / Cr Cash or Bank · Auto-deducted monthly from payroll.
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowAdvanceModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={issueAdvance}>Issue Advance</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DEACTIVATE CONFIRM ──────────────── */}
      {showDeactivateConfirm && drawerEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }} onClick={e => { if (e.target === e.currentTarget) setShowDeactivateConfirm(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid #ef444444', borderRadius: 16, width: 400, maxWidth: '95vw', padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>!</div>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Deactivate {drawerEmp.full_name}?</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              They will be removed from active employee lists, payroll, and attendance.
              This does not delete their records. They can be reactivated later from the database.
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button onClick={() => setShowDeactivateConfirm(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={deactivateEmployee} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Deactivate</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
