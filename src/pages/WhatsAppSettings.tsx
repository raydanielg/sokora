import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_WA_CONFIG, saveWAConfig, sendWhatsApp } from '../lib/whatsapp'
import type { WAConfig } from '../lib/whatsapp'
import Toast from '../components/Toast'

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'wa')     return <svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
  if (n === 'check')  return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>
  if (n === 'test')   return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12 19.79 19.79 0 0 1 2 3.18 2 2 0 0 1 3.96 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
  if (n === 'save')   return <svg {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
  if (n === 'log')    return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  if (n === 'key')    return <svg {...p}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
  if (n === 'eye')    return <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  if (n === 'eyeoff') return <svg {...p}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}

const PROVIDERS = [
  { id: 'wati',    name: 'Wati',    desc: 'Best for SMEs · Easy setup · Flat monthly fee',          color: '#25D366', docs: 'https://docs.wati.io' },
  { id: 'twilio',  name: 'Twilio',  desc: 'Most reliable · Pay per message · $0.005/msg',            color: '#F22F46', docs: 'https://www.twilio.com/docs/whatsapp' },
  { id: 'infobip', name: 'Infobip', desc: 'Strong Africa coverage · Good deliverability',            color: '#FF4B26', docs: 'https://www.infobip.com/docs/whatsapp' },
  { id: 'custom',  name: 'Custom',  desc: 'Your own webhook · Full control · Any provider',          color: '#6366f1', docs: '' },
]

const FIELD_LABELS: Record<string, Record<string, { label: string; placeholder: string; hint: string }>> = {
  wati: {
    api_key:       { label: 'API Token', placeholder: 'eyJhbGciOiJIUzI1NiIs...', hint: 'Found in Wati Dashboard → Settings → API' },
    api_url:       { label: 'Wati Server URL', placeholder: 'https://live-server-12345.wati.io', hint: 'Your Wati instance URL — found in dashboard URL' },
    sender_number: { label: 'Sender Number', placeholder: '+255700000000', hint: 'Your WhatsApp Business number registered with Wati' },
  },
  twilio: {
    api_key:       { label: 'Account SID : Auth Token', placeholder: 'ACxxxxxxxx:your_auth_token', hint: 'Format: AccountSID:AuthToken — found in Twilio Console' },
    api_url:       { label: 'API URL (leave default)', placeholder: 'https://api.twilio.com', hint: 'Leave blank to use default Twilio API URL' },
    sender_number: { label: 'Twilio WhatsApp Number', placeholder: '+14155238886', hint: 'Your Twilio sandbox or approved WhatsApp number' },
  },
  infobip: {
    api_key:       { label: 'API Key', placeholder: 'your-infobip-api-key', hint: 'Found in Infobip Portal → Developer Tools → API Keys' },
    api_url:       { label: 'Base URL', placeholder: 'https://xxxxx.api.infobip.com', hint: 'Your Infobip base URL — unique to your account' },
    sender_number: { label: 'Sender Number', placeholder: '+255700000000', hint: 'Your WhatsApp Business number on Infobip' },
  },
  custom: {
    api_key:       { label: 'API Key / Bearer Token', placeholder: 'your-api-key', hint: 'Sent as Authorization: Bearer {key}' },
    api_url:       { label: 'Webhook URL', placeholder: 'https://your-api.com/send-whatsapp', hint: 'POST endpoint that accepts {to, message, type}' },
    sender_number: { label: 'Sender Number', placeholder: '+255700000000', hint: 'Your WhatsApp sender number' },
  },
}

export default function WhatsAppSettings() {
  const [config, setConfig] = useState<WAConfig>(DEFAULT_WA_CONFIG)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [activeTab, setActiveTab] = useState<'setup' | 'templates' | 'logs'>('setup')
  const [logs, setLogs] = useState<any[]>([])
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => { loadConfig(); loadLogs() }, [])

  const loadConfig = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'whatsapp_config').single()
    if (data?.value) { try { setConfig({ ...DEFAULT_WA_CONFIG, ...JSON.parse(data.value) }) } catch {} }
  }

  const loadLogs = async () => {
    const { data } = await supabase.from('whatsapp_sends').select('*').order('sent_at', { ascending: false }).limit(50)
    if (data) setLogs(data)
  }

  const set = (k: keyof WAConfig, v: any) => setConfig(c => ({ ...c, [k]: v }))

  const save = async () => {
    setSaving(true)
    await saveWAConfig(config)
    setSaved(true); setTimeout(() => setSaved(false), 2000); setSaving(false)
    setToast('WhatsApp settings saved'); setToastType('success')
  }

  const testConnection = async () => {
    if (!testPhone) { setToast('Enter a test phone number'); setToastType('error'); return }
    setTesting(true); setTestResult(null)
    const result = await sendWhatsApp(config, {
      to: testPhone, type: 'custom', ref: 'TEST-001',
      customer_name: 'Test',
      message: `✅ SOKORA WhatsApp test message!\n\nIf you received this, your ${config.provider} integration is working correctly.\n\n_Your Organization_`,
    })
    setTestResult({ success: result.success, message: result.success ? `Sent successfully! Message ID: ${result.message_id}` : `Failed: ${result.error}` })
    setTesting(false)
  }

  const selectedProvider = PROVIDERS.find(p => p.id === config.provider)
  const fields = config.provider ? FIELD_LABELS[config.provider] : null

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(37,211,102,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic n="wa" s={22} c="#25D366" />
          </div>
          <div>
            <div className="page-title">WhatsApp Integration</div>
            <div className="page-sub">Send receipts and invoices directly to customers via WhatsApp</div>
          </div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 4 }}>
            {(['setup', 'templates', 'logs'] as const).map(t => (
              <button key={t} onClick={() => { setActiveTab(t); if (t === 'logs') loadLogs() }}
                style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: activeTab === t ? '#25D366' : 'transparent', color: activeTab === t ? '#fff' : 'var(--text3)', border: 'none', cursor: 'pointer', borderRadius: 'var(--r)', transition: 'all .15s', textTransform: 'capitalize' }}>
                {t}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" style={{ background: '#25D366', border: 'none', display: 'flex', alignItems: 'center', gap: 6 }} onClick={save} disabled={saving}>
            <Ic n="save" s={13} c="#fff" /> {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Status banner */}
      <div style={{ background: config.enabled && config.api_key ? 'rgba(37,211,102,.08)' : 'var(--surface2)', border: `1px solid ${config.enabled && config.api_key ? 'rgba(37,211,102,.3)' : 'var(--border)'}`, borderRadius: 12, padding: '12px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: config.enabled && config.api_key ? '#25D366' : 'var(--text3)', boxShadow: config.enabled && config.api_key ? '0 0 8px #25D366' : 'none' }}></div>
          <span style={{ fontSize: 13, fontWeight: 600, color: config.enabled && config.api_key ? '#25D366' : 'var(--text3)' }}>
            {config.enabled && config.api_key ? `Connected via ${selectedProvider?.name || config.provider}` : 'Not configured — set up below to activate'}
          </span>
        </div>
        <div onClick={() => set('enabled', !config.enabled)} style={{ width: 48, height: 26, background: config.enabled ? '#25D366' : 'var(--surface3)', borderRadius: 13, cursor: 'pointer', position: 'relative', transition: 'background .2s' }}>
          <div style={{ position: 'absolute', top: 3, left: config.enabled ? 25 : 3, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }}></div>
        </div>
      </div>

      {/* SETUP TAB */}
      {activeTab === 'setup' && (
        <div className="grid g2" style={{ gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Provider selection */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>Choose Provider</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {PROVIDERS.map(prov => (
                  <div key={prov.id} onClick={() => set('provider', prov.id as any)}
                    style={{ padding: '12px 14px', border: `2px solid ${config.provider === prov.id ? prov.color : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', background: config.provider === prov.id ? `${prov.color}10` : 'var(--surface2)', transition: 'all .15s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, color: config.provider === prov.id ? prov.color : 'var(--text)' }}>{prov.name}</div>
                      {config.provider === prov.id && <Ic n="check" s={14} c={prov.color} />}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.4 }}>{prov.desc}</div>
                    {prov.docs && <a href={prov.docs} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: prov.color, marginTop: 6, display: 'block' }}>View docs →</a>}
                  </div>
                ))}
              </div>
            </div>

            {/* Credentials */}
            {fields && config.provider && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>Credentials — {selectedProvider?.name}</div>
                {Object.entries(fields).map(([k, f]) => (
                  <div key={k} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>{f.label}</div>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="form-input"
                        type={k === 'api_key' && !showKey ? 'password' : 'text'}
                        style={{ fontSize: 12, paddingRight: k === 'api_key' ? 36 : 12 }}
                        value={String(config[k as keyof WAConfig] || '')}
                        onChange={e => set(k as keyof WAConfig, e.target.value)}
                        placeholder={f.placeholder}
                      />
                      {k === 'api_key' && (
                        <button onClick={() => setShowKey(!showKey)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
                          <Ic n={showKey ? 'eyeoff' : 'eye'} s={14} />
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{f.hint}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Test connection */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 6 }}>Test Connection</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Send a test message to verify your setup is working.</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Test Phone Number</div>
              <input className="form-input" style={{ fontSize: 12, marginBottom: 10 }} placeholder="+255 743 100 212" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
              <button className="btn btn-primary" style={{ background: '#25D366', border: 'none', display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }} onClick={testConnection} disabled={testing || !config.provider || !config.api_key}>
                <Ic n="test" s={13} c="#fff" /> {testing ? 'Sending…' : 'Send Test Message'}
              </button>
              {testResult && (
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: testResult.success ? 'rgba(37,211,102,.08)' : 'var(--red-dim)', border: `1px solid ${testResult.success ? 'rgba(37,211,102,.3)' : 'rgba(255,71,87,.3)'}`, fontSize: 12, color: testResult.success ? '#25D366' : 'var(--red)' }}>
                  {testResult.success ? '✓ ' : '✗ '}{testResult.message}
                </div>
              )}
            </div>

            {/* Send triggers */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Send Triggers</div>
              {[
                { k: 'send_on_cash_sale' as any, label: 'After Cash Sale', desc: 'Send receipt when cash sale posts' },
                { k: 'send_on_invoice' as any, label: 'After Sales Invoice', desc: 'Send invoice after posting' },
              ].map(item => (
                <div key={item.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{item.desc}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', padding: '4px 10px', background: 'var(--surface2)', borderRadius: 6 }}>Manual only</div>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, lineHeight: 1.6 }}>
                Sending is manual for now — a "Send via WhatsApp" button appears after every Cash Sale and Invoice posts. Auto-send on post will be available in CRM settings.
              </div>
            </div>

            {/* Quick stats */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Send Stats</div>
              <div className="grid g2" style={{ gap: 10 }}>
                {[
                  { label: 'Total Sent', val: logs.filter(l => l.status === 'sent').length, color: 'var(--green)' },
                  { label: 'Failed', val: logs.filter(l => l.status === 'failed').length, color: 'var(--red)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATES TAB */}
      {activeTab === 'templates' && (
        <div className="grid g2" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 6 }}>Receipt Message Template</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.6 }}>
              Variables: <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{'{{customer_name}} {{ref}} {{date}} {{payment_method}} {{items}} {{total}}'}</span>
            </div>
            <textarea className="form-input" rows={12} style={{ fontSize: 12, fontFamily: 'var(--mono)', resize: 'vertical' }}
              value={config.template_receipt}
              onChange={e => set('template_receipt', e.target.value)} />
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => set('template_receipt', DEFAULT_WA_CONFIG.template_receipt)}>Reset to default</button>
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 6 }}>Invoice Message Template</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.6 }}>
              Variables: <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{'{{customer_name}} {{ref}} {{date}} {{due_date}} {{payment_terms}} {{items}} {{total}} {{outstanding_block}} {{bank_account}}'}</span>
            </div>
            <textarea className="form-input" rows={12} style={{ fontSize: 12, fontFamily: 'var(--mono)', resize: 'vertical' }}
              value={config.template_invoice}
              onChange={e => set('template_invoice', e.target.value)} />
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => set('template_invoice', DEFAULT_WA_CONFIG.template_invoice)}>Reset to default</button>
          </div>
        </div>
      )}

      {/* LOGS TAB */}
      {activeTab === 'logs' && (
        <div className="card">
          <div className="card-header" style={{ marginBottom: 14 }}>
            <div><div className="card-title">Send Log</div><div className="card-sub">Last 50 WhatsApp sends</div></div>
            <button className="btn btn-ghost btn-sm" onClick={loadLogs}>Refresh</button>
          </div>
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No messages sent yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Time</th><th>Customer</th><th>Phone</th><th>Type</th><th>Voucher</th><th>Provider</th><th>Status</th></tr></thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i}>
                      <td className="td-mono" style={{ fontSize: 10, color: 'var(--text3)' }}>{new Date(log.sent_at).toLocaleString()}</td>
                      <td style={{ fontSize: 12 }}>{log.customer_name || '—'}</td>
                      <td className="td-mono" style={{ fontSize: 11 }}>{log.phone}</td>
                      <td><span className="pill pill-gray" style={{ fontSize: 9 }}>{log.message_type}</span></td>
                      <td className="td-mono td-amber" style={{ fontSize: 11 }}>{log.voucher_ref}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{log.provider}</td>
                      <td>
                        <span className={`pill ${log.status === 'sent' ? 'pill-green' : 'pill-red'}`} style={{ fontSize: 9 }}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
