import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import type { HRMProps, JobOpening, Applicant } from './hrmTypes'

const STAGE_COLORS: Record<string, string> = { applied: '#6366f1', screening: '#f59e0b', interview: '#3b82f6', offer: '#85c2be', hired: '#22c55e', rejected: '#ef4444' }
const STAGE_LABELS: Record<string, string> = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected' }
const STAGE_ORDER = ['applied', 'screening', 'interview', 'offer', 'hired']

export default function HRMRecruitment({ onNav: _onNav, hrmMode: _hrmMode = 'company', linkedEmployeeId: _linkedEmployeeId }: HRMProps) {
  const [jobs, setJobs] = useState<JobOpening[]>([])
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [loading, setLoading] = useState(true)
  const [showJobModal, setShowJobModal] = useState(false)
  const [showAppModal, setShowAppModal] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [jobForm, setJobForm] = useState({ title: '', department: 'Marketing', contract_type: 'Full-time', salary_range: '', deadline: '', description: '' })
  const [appForm, setAppForm] = useState({ job_opening_id: '', full_name: '', phone: '', stage: 'applied', application_date: new Date().toISOString().split('T')[0], notes: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [jobRes, appRes] = await Promise.all([
      supabase.from('hrm_job_openings').select('*').order('created_at', { ascending: false }),
      supabase.from('hrm_applicants').select('*, job_opening:hrm_job_openings(id, title)').order('application_date', { ascending: false }),
    ])
    setJobs(jobRes.data || [])
    setApplicants(appRes.data || [])
    setLoading(false)
  }

  const saveJob = async () => {
    if (!jobForm.title) { setToast('Job title required'); setToastType('error'); return }
    const { error } = await supabase.from('hrm_job_openings').insert({
      title: jobForm.title, department: jobForm.department, contract_type: jobForm.contract_type,
      salary_range: jobForm.salary_range || null, deadline: jobForm.deadline || null,
      description: jobForm.description || null, status: 'open',
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast('Role posted'); setToastType('success'); setShowJobModal(false); load()
  }

  const saveApplicant = async () => {
    if (!appForm.job_opening_id || !appForm.full_name) { setToast('Fill required fields'); setToastType('error'); return }
    const { error } = await supabase.from('hrm_applicants').insert({
      job_opening_id: appForm.job_opening_id, full_name: appForm.full_name,
      phone: appForm.phone || null, stage: appForm.stage,
      application_date: appForm.application_date, notes: appForm.notes || null,
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast('Applicant added'); setToastType('success'); setShowAppModal(false); load()
  }

  const advanceApplicant = async (id: string, currentStage: string) => {
    const idx = STAGE_ORDER.indexOf(currentStage)
    if (idx < 0 || idx >= STAGE_ORDER.length - 1) return
    const nextStage = STAGE_ORDER[idx + 1]
    await supabase.from('hrm_applicants').update({ stage: nextStage }).eq('id', id)
    setToast(`Advanced to ${STAGE_LABELS[nextStage]}`); setToastType('success'); load()
  }

  const rejectApplicant = async (id: string) => {
    await supabase.from('hrm_applicants').update({ stage: 'rejected' }).eq('id', id)
    setToast('Applicant rejected'); setToastType('success'); load()
  }

  // Pipeline counts
  const stageCounts = STAGE_ORDER.concat(['rejected']).reduce((acc, s) => {
    acc[s] = applicants.filter(a => a.stage === s).length; return acc
  }, {} as Record<string, number>)

  const openJobs = jobs.filter(j => j.status === 'open')
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Recruitment Pipeline</div><div className="page-sub">Open roles, applicant tracking, interview scheduling</div></div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAppModal(true)}>+ Add Applicant</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowJobModal(true)}>Post New Role</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 18 }}>
        <div className="card" style={{ padding: 12, textAlign: 'center', borderLeft: '3px solid #6366f1' }}><div style={{ fontSize: 20, fontWeight: 900, color: '#6366f1' }}>{openJobs.length}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Open Roles</div></div>
        <div className="card" style={{ padding: 12, textAlign: 'center', borderLeft: '3px solid #f59e0b' }}><div style={{ fontSize: 20, fontWeight: 900, color: '#f59e0b' }}>{applicants.length}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Applicants</div></div>
        <div className="card" style={{ padding: 12, textAlign: 'center', borderLeft: '3px solid #3b82f6' }}><div style={{ fontSize: 20, fontWeight: 900, color: '#3b82f6' }}>{stageCounts.interview || 0}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Interviews</div></div>
        <div className="card" style={{ padding: 12, textAlign: 'center', borderLeft: '3px solid #22c55e' }}><div style={{ fontSize: 20, fontWeight: 900, color: '#22c55e' }}>{stageCounts.offer || 0}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Offers Pending</div></div>
        <div className="card" style={{ padding: 12, textAlign: 'center', borderLeft: '3px solid #ef4444' }}><div style={{ fontSize: 20, fontWeight: 900, color: '#ef4444' }}>{stageCounts.rejected || 0}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Rejected</div></div>
      </div>

      {/* Pipeline Funnel */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 0 }}>
        {[...STAGE_ORDER, 'rejected'].map((stage, i) => (
          <div key={stage} style={{ flex: 1, textAlign: 'center', padding: 8, background: `${STAGE_COLORS[stage]}22`, border: `1px solid ${STAGE_COLORS[stage]}44`, borderLeft: i === 0 ? undefined : 'none', borderRadius: i === 0 ? '6px 0 0 6px' : i === 5 ? '0 6px 6px 0' : undefined }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: STAGE_COLORS[stage] }}>{stageCounts[stage] || 0}</div>
            <div style={{ fontSize: 10, color: STAGE_COLORS[stage], fontWeight: 700 }}>{STAGE_LABELS[stage]}</div>
          </div>
        ))}
      </div>

      {/* Role Cards with Applicants */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {openJobs.map(job => {
            const jobApps = applicants.filter(a => a.job_opening_id === job.id && a.stage !== 'rejected')
            return (
              <div key={job.id} className="card" style={{ borderTop: '3px solid #6366f1', padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><div style={{ fontWeight: 800, fontSize: 13 }}>{job.title}</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>{job.department} · {job.contract_type}{job.salary_range ? ` · ${job.salary_range}` : ''}{job.deadline ? ` · Deadline: ${job.deadline}` : ''}</div></div>
                  <span style={{ fontSize: 10, background: '#22c55e22', color: '#22c55e', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>Open</span>
                </div>
                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {jobApps.map(app => (
                    <div key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: app.stage === 'offer' ? 'var(--accent-dim)' : 'var(--surface2)', border: app.stage === 'offer' ? '1px solid var(--accent)' : 'none', borderRadius: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{app.full_name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>Applied {app.application_date}{app.notes ? ` · ${app.notes}` : ''}</div>
                      </div>
                      <span style={{ fontSize: 10, background: `${STAGE_COLORS[app.stage]}22`, color: STAGE_COLORS[app.stage], padding: '2px 8px', borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>{STAGE_LABELS[app.stage]}</span>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {app.stage !== 'hired' && (
                          <button onClick={() => advanceApplicant(app.id, app.stage)} style={{ background: app.stage === 'offer' ? '#22c55e' : 'var(--surface2)', border: app.stage === 'offer' ? 'none' : '1px solid var(--border)', color: app.stage === 'offer' ? '#000' : 'var(--text)', padding: '4px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>
                            {app.stage === 'offer' ? 'Hired' : `> ${STAGE_LABELS[STAGE_ORDER[STAGE_ORDER.indexOf(app.stage) + 1]] || 'Next'}`}
                          </button>
                        )}
                        <button onClick={() => rejectApplicant(app.id)} style={{ background: '#ef444422', border: '1px solid #ef444444', color: '#ef4444', padding: '4px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>x</button>
                      </div>
                    </div>
                  ))}
                  {jobApps.length === 0 && <div style={{ padding: 10, textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>No applicants yet</div>}
                  <button onClick={() => { setAppForm({ ...appForm, job_opening_id: job.id }); setShowAppModal(true) }} style={{ width: '100%', background: 'none', border: '1px dashed var(--border)', color: 'var(--text3)', padding: 7, borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>+ Add Applicant</button>
                </div>
              </div>
            )
          })}
          {openJobs.length === 0 && <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No open roles. Post a new role to start recruiting.</div>}
        </div>
      )}

      {/* Post Role Modal */}
      {showJobModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) setShowJobModal(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 500, maxWidth: '95vw' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>Post New Role</div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1/-1' }}><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Job Title *</label><input style={inputStyle} value={jobForm.title} onChange={e => setJobForm({ ...jobForm, title: e.target.value })} placeholder="e.g. Social Media Manager" /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Department</label><select style={inputStyle} value={jobForm.department} onChange={e => setJobForm({ ...jobForm, department: e.target.value })}><option>Marketing</option><option>Sales</option><option>Operations</option><option>Clinical</option><option>Management</option></select></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Contract Type</label><select style={inputStyle} value={jobForm.contract_type} onChange={e => setJobForm({ ...jobForm, contract_type: e.target.value })}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option></select></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Salary Range</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={jobForm.salary_range} onChange={e => setJobForm({ ...jobForm, salary_range: e.target.value })} placeholder="800K-1M" /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Deadline</label><input type="date" style={inputStyle} value={jobForm.deadline} onChange={e => setJobForm({ ...jobForm, deadline: e.target.value })} /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Description</label><textarea style={{ ...inputStyle, resize: 'none', height: 70 }} value={jobForm.description} onChange={e => setJobForm({ ...jobForm, description: e.target.value })} placeholder="Key responsibilities..." /></div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowJobModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveJob}>Post Role</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Applicant Modal */}
      {showAppModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) setShowAppModal(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 500, maxWidth: '95vw' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>Add Applicant</div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1/-1' }}><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Full Name *</label><input style={inputStyle} value={appForm.full_name} onChange={e => setAppForm({ ...appForm, full_name: e.target.value })} placeholder="e.g. Amina Said" /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Role *</label><select style={inputStyle} value={appForm.job_opening_id} onChange={e => setAppForm({ ...appForm, job_opening_id: e.target.value })}><option value="">Select...</option>{jobs.filter(j => j.status === 'open').map(j => <option key={j.id} value={j.id}>{j.title}</option>)}</select></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Phone</label><input style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={appForm.phone} onChange={e => setAppForm({ ...appForm, phone: e.target.value })} placeholder="+255 7XX" /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Stage</label><select style={inputStyle} value={appForm.stage} onChange={e => setAppForm({ ...appForm, stage: e.target.value })}><option value="applied">Applied</option><option value="screening">Screening</option><option value="interview">Interview</option><option value="offer">Offer</option></select></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Date</label><input type="date" style={inputStyle} value={appForm.application_date} onChange={e => setAppForm({ ...appForm, application_date: e.target.value })} /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Notes</label><textarea style={{ ...inputStyle, resize: 'none', height: 60 }} value={appForm.notes} onChange={e => setAppForm({ ...appForm, notes: e.target.value })} placeholder="Experience, source..." /></div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowAppModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveApplicant}>Add to Pipeline</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
