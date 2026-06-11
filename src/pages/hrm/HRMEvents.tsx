import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import type { HRMProps, HRMEvent } from './hrmTypes'
import { EVENT_COLORS, EVENT_LABELS } from './hrmTypes'

export default function HRMEvents({ onNav: _onNav, hrmMode: _hrmMode = 'company', linkedEmployeeId: _linkedEmployeeId }: HRMProps) {
  const [events, setEvents] = useState<HRMEvent[]>([])
  const [employees, setEmployees] = useState<{ id: string; full_name: string; date_of_birth: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [form, setForm] = useState({ title: '', event_type: 'team_building', event_date: '', end_date: '', location: '', organizer: '', budget: '', attendees: [] as string[], notes: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [evtRes, empRes] = await Promise.all([
      supabase.from('hrm_events').select('*').order('event_date', { ascending: false }),
      supabase.from('hrm_employees').select('id, full_name, date_of_birth').eq('is_active', true).order('full_name'),
    ])
    setEvents(evtRes.data || [])
    setEmployees(empRes.data || [])
    setLoading(false)
  }

  const saveEvent = async () => {
    if (!form.title || !form.event_date) { setToast('Title and date required'); setToastType('error'); return }
    const { error } = await supabase.from('hrm_events').insert({
      title: form.title, event_type: form.event_type, event_date: form.event_date,
      end_date: form.end_date || null, location: form.location || null,
      organizer: form.organizer || null, budget: parseFloat(form.budget) || 0,
      actual_spend: 0, attendees: form.attendees, status: 'planned', notes: form.notes || null,
    })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast('Event created'); setToastType('success'); setShowModal(false); load()
  }

  const today = new Date().toISOString().split('T')[0]
  const upcoming = events.filter(e => e.event_date >= today)
  const filtered = filterType === 'all' ? events : events.filter(e => e.event_type === filterType)
  const filteredUpcoming = filtered.filter(e => e.event_date >= today)
  const filteredPast = filtered.filter(e => e.event_date < today)

  // Birthdays this month
  const currentMonth = new Date().getMonth() + 1
  const birthdays = employees.filter(e => {
    if (!e.date_of_birth) return false
    return new Date(e.date_of_birth).getMonth() + 1 === currentMonth
  }).sort((a, b) => new Date(a.date_of_birth!).getDate() - new Date(b.date_of_birth!).getDate())

  // Budget totals
  const totalBudget = events.reduce((s, e) => s + (e.budget || 0), 0)
  const totalSpent = events.reduce((s, e) => s + (e.actual_spend || 0), 0)

  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">HR Events</div><div className="page-sub">Team building, training, celebrations, birthdays</div></div>
        <div className="page-actions">
          <select style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Events</option>
            {Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ New Event</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #6366f1' }}><div style={{ fontSize: 22, fontWeight: 900, color: '#6366f1' }}>{upcoming.length}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Upcoming</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #f59e0b' }}><div style={{ fontSize: 22, fontWeight: 900, color: '#f59e0b' }}>{birthdays.length}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Birthdays This Month</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid var(--accent)' }}><div style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)' }}>{totalBudget >= 1000000 ? (totalBudget / 1000000).toFixed(1) + 'M' : (totalBudget / 1000).toFixed(0) + 'K'}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Budget</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #22c55e' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#22c55e' }}>{(totalBudget - totalSpent) >= 0 ? (totalBudget - totalSpent >= 1000000 ? ((totalBudget - totalSpent) / 1000000).toFixed(1) + 'M' : ((totalBudget - totalSpent) / 1000).toFixed(0) + 'K') : '0'}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Remaining</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        {/* Events List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
          ) : (
            <>
              {filteredUpcoming.length > 0 && <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Upcoming</div>}
              {filteredUpcoming.map(evt => {
                const color = EVENT_COLORS[evt.event_type] || '#85c2be'
                const d = new Date(evt.event_date)
                return (
                  <div key={evt.id} className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${color}` }}>
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 10, background: `${color}22`, border: `1px solid ${color}33`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color, lineHeight: 1 }}>{d.getDate()}</div>
                        <div style={{ fontSize: 10, color, fontWeight: 700 }}>{d.toLocaleString('en', { month: 'short' }).toUpperCase()}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <div style={{ fontWeight: 800, fontSize: 13 }}>{evt.title}</div>
                          <span style={{ fontSize: 10, background: `${color}22`, color, padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>{EVENT_LABELS[evt.event_type] || evt.event_type}</span>
                          <span style={{ fontSize: 10, background: evt.status === 'confirmed' ? '#22c55e22' : '#f59e0b22', color: evt.status === 'confirmed' ? '#22c55e' : '#f59e0b', padding: '2px 7px', borderRadius: 4 }}>{evt.status}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{evt.location || 'TBD'} · {evt.event_date}{evt.end_date ? ` to ${evt.end_date}` : ''}</div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11 }}>
                          {evt.attendees?.length > 0 && <span>{evt.attendees.length} attending</span>}
                          {evt.budget > 0 && <span style={{ fontFamily: 'var(--mono)' }}>Budget: TZS {evt.budget.toLocaleString()}</span>}
                          {evt.organizer && <span>By: {evt.organizer}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {filteredPast.length > 0 && <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.6px', marginTop: 8 }}>Past</div>}
              {filteredPast.slice(0, 5).map(evt => {
                const color = EVENT_COLORS[evt.event_type] || '#85c2be'
                return (
                  <div key={evt.id} className="card" style={{ padding: '12px 16px', borderLeft: `4px solid ${color}`, opacity: 0.7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{evt.title}</div>
                      <span style={{ fontSize: 10, background: `${color}22`, color, padding: '2px 7px', borderRadius: 4 }}>{EVENT_LABELS[evt.event_type]}</span>
                      <span style={{ fontSize: 10, background: '#22c55e22', color: '#22c55e', padding: '2px 7px', borderRadius: 4 }}>Done</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{evt.event_date}{evt.actual_spend > 0 ? ` · Spent: TZS ${evt.actual_spend.toLocaleString()}` : ''}</div>
                  </div>
                )
              })}
              {filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No events found</div>}
            </>
          )}
        </div>

        {/* Birthdays Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Birthdays This Month</div>
            {birthdays.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>No birthdays this month</div>
            ) : birthdays.map(emp => {
              const bday = new Date(emp.date_of_birth!)
              const isPast = bday.getDate() < new Date().getDate()
              return (
                <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: isPast ? '#22c55e11' : '#6366f111', border: `1px solid ${isPast ? '#22c55e33' : '#6366f133'}`, borderRadius: 7, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{emp.full_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{bday.getDate()} {bday.toLocaleString('en', { month: 'short' })}{isPast ? ' (past)' : ''}</div>
                  </div>
                  {isPast && <span style={{ fontSize: 10, background: '#22c55e22', color: '#22c55e', padding: '2px 6px', borderRadius: 4 }}>Done</span>}
                </div>
              )
            })}
          </div>

          {/* All birthdays */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>All Birthdays</div>
            {employees.filter(e => e.date_of_birth).sort((a, b) => {
              const am = new Date(a.date_of_birth!).getMonth() * 31 + new Date(a.date_of_birth!).getDate()
              const bm = new Date(b.date_of_birth!).getMonth() * 31 + new Date(b.date_of_birth!).getDate()
              return am - bm
            }).map(emp => (
              <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'var(--surface2)', borderRadius: 5, marginBottom: 4, fontSize: 11 }}>
                <span>{emp.full_name}</span>
                <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{new Date(emp.date_of_birth!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New Event Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>New HR Event</div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Event Title *</label><input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Q3 Team Building Day" /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Type *</label><select style={inputStyle} value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })}>{Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Organizer</label><input style={inputStyle} value={form.organizer} onChange={e => setForm({ ...form, organizer: e.target.value })} placeholder="e.g. Joe Gembe" /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Date *</label><input type="date" style={inputStyle} value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>End Date</label><input type="date" style={inputStyle} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Location</label><input style={inputStyle} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Coco Beach, DSM" /></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Budget (TZS)</label><input type="number" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} placeholder="e.g. 500000" /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Notes / Agenda</label><textarea style={{ ...inputStyle, resize: 'none', height: 60 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Event agenda..." /></div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEvent}>Create Event</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
