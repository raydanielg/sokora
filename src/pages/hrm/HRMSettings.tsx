import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import type { HRMProps, HRSettings } from './hrmTypes'
import { DEFAULT_HR_SETTINGS } from './hrmTypes'

export default function HRMSettings({ onNav: _onNav, hrmMode: _hrmMode = 'company', linkedEmployeeId: _linkedEmployeeId }: HRMProps) {
  const [settings, setSettings] = useState<HRSettings>(DEFAULT_HR_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [newDept, setNewDept] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'hr_settings').single()
    if (data?.value) {
      try { setSettings({ ...DEFAULT_HR_SETTINGS, ...JSON.parse(data.value) }) } catch {}
    }
    setLoading(false)
  }

  const save = async () => {
    const { error } = await supabase.from('system_settings').upsert({ key: 'hr_settings', value: JSON.stringify(settings) }, { onConflict: 'key' })
    if (error) { setToast(error.message); setToastType('error'); return }
    setToast('HR settings saved'); setToastType('success')
  }

  const addDepartment = () => {
    if (!newDept.trim() || settings.departments.includes(newDept.trim())) return
    setSettings({ ...settings, departments: [...settings.departments, newDept.trim()] })
    setNewDept('')
  }

  const removeDept = (d: string) => {
    setSettings({ ...settings, departments: settings.departments.filter((x: string) => x !== d) })
  }

  const update = (field: keyof HRSettings, val: any) => setSettings({ ...settings, [field]: val })

  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }

  if (loading) return <div className="page"><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading settings...</div></div>

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">HR Settings</div><div className="page-sub">Departments, statutory rates, leave entitlements, automations</div></div>
        <button className="btn btn-primary btn-sm" onClick={save}>Save Settings</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Departments */}
        <div className="card">
          <div style={{ fontWeight: 700, color: '#6366f1', marginBottom: 14 }}>Departments</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {settings.departments.map((d: string) => (
              <div key={d} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 12 }}>
                <span>{d}</span>
                <button onClick={() => removeDept(d)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14 }}>x</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ ...inputStyle, flex: 1 }} value={newDept} onChange={e => setNewDept(e.target.value)} placeholder="New department..." onKeyDown={e => e.key === 'Enter' && addDepartment()} />
            <button onClick={addDepartment} style={{ background: 'var(--accent)', border: 'none', color: '#000', padding: '8px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Add</button>
          </div>
        </div>

        {/* Statutory Rates */}
        <div className="card">
          <div style={{ fontWeight: 700, color: '#6366f1', marginBottom: 14 }}>Statutory Rates (Tanzania)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><label style={labelStyle}>NSSF Employee Contribution (%)</label><input type="number" step="0.1" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={settings.nssf_ee_rate} onChange={e => update('nssf_ee_rate', parseFloat(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>NSSF Employer Contribution (%)</label><input type="number" step="0.1" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={settings.nssf_er_rate} onChange={e => update('nssf_er_rate', parseFloat(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>SDL Rate (%)</label><input type="number" step="0.1" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={settings.sdl_rate} onChange={e => update('sdl_rate', parseFloat(e.target.value) || 0)} /></div>
            <div><label style={labelStyle}>WCF Rate (%)</label><input type="number" step="0.1" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} value={settings.wcf_rate} onChange={e => update('wcf_rate', parseFloat(e.target.value) || 0)} /></div>
          </div>
          <div style={{ marginTop: 10, padding: '8px 10px', background: '#6366f111', border: '1px solid #6366f133', borderRadius: 6, fontSize: 10, color: '#6366f1' }}>
            NSSF is optional per employee. Enable it on each employee's profile when they're enrolled.
          </div>
        </div>

        {/* Leave Entitlements */}
        <div className="card">
          <div style={{ fontWeight: 700, color: '#6366f1', marginBottom: 14 }}>Leave Entitlements</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', gap: 8, fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}><span>Type</span><span>Annual</span><span>Sick</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <span>Full-time Permanent</span>
              <input type="number" style={{ ...inputStyle, textAlign: 'center', fontFamily: 'var(--mono)' }} value={settings.annual_leave_ft} onChange={e => update('annual_leave_ft', parseInt(e.target.value) || 0)} />
              <input type="number" style={{ ...inputStyle, textAlign: 'center', fontFamily: 'var(--mono)' }} value={settings.sick_leave_ft} onChange={e => update('sick_leave_ft', parseInt(e.target.value) || 0)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <span>Fixed-term / Contract</span>
              <input type="number" style={{ ...inputStyle, textAlign: 'center', fontFamily: 'var(--mono)' }} value={settings.annual_leave_contract} onChange={e => update('annual_leave_contract', parseInt(e.target.value) || 0)} />
              <input type="number" style={{ ...inputStyle, textAlign: 'center', fontFamily: 'var(--mono)' }} value={settings.sick_leave_contract} onChange={e => update('sick_leave_contract', parseInt(e.target.value) || 0)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <span>Maternity (Tanzania Employment Act)</span>
              <input type="number" style={{ ...inputStyle, textAlign: 'center', fontFamily: 'var(--mono)' }} value={settings.maternity_days} onChange={e => update('maternity_days', parseInt(e.target.value) || 0)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <span>Paternity</span>
              <input type="number" style={{ ...inputStyle, textAlign: 'center', fontFamily: 'var(--mono)' }} value={settings.paternity_days} onChange={e => update('paternity_days', parseInt(e.target.value) || 0)} />
            </div>
          </div>
        </div>

        {/* Birthday Automations */}
        <div className="card">
          <div style={{ fontWeight: 700, color: '#6366f1', marginBottom: 14 }}>Birthday Automations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { key: 'auto_birthday_wa' as const, label: 'Auto WhatsApp on birthday', desc: 'Sends birthday message to employee on the day' },
              { key: 'birthday_mgr_notify' as const, label: 'Notify manager 3 days before', desc: 'Gives time to plan a gesture' },
              { key: 'birthday_team_notify' as const, label: 'Notify team on birthday day', desc: 'Group WhatsApp so everyone can celebrate' },
            ].map(item => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface2)', borderRadius: 7 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{item.desc}</div>
                </div>
                <div onClick={() => update(item.key, !settings[item.key])} style={{ width: 40, height: 22, background: settings[item.key] ? 'var(--accent)' : 'var(--border)', borderRadius: 11, cursor: 'pointer', position: 'relative', flexShrink: 0, marginLeft: 12, transition: 'background .2s' }}>
                  <div style={{ position: 'absolute', [settings[item.key] ? 'right' : 'left']: 3, top: 3, width: 16, height: 16, background: settings[item.key] ? '#000' : 'var(--text3)', borderRadius: '50%', transition: 'all .2s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
