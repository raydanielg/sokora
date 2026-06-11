import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'

interface ReportTemplateSettings {
  logo_url: string | null
  logo_position: 'left' | 'center' | 'right'
  logo_width: number
  company_name: string
  company_tagline: string
  primary_color: string
  // Sales Day Book specific
  sdb_show_stats_bar: boolean
  sdb_stat_1: 'total_sales' | 'total_cash' | 'total_mobile' | 'total_bank' | 'transactions' | 'avg_sale' | 'margin' | 'none'
  sdb_stat_2: 'total_sales' | 'total_cash' | 'total_mobile' | 'total_bank' | 'transactions' | 'avg_sale' | 'margin' | 'none'
  sdb_stat_3: 'total_sales' | 'total_cash' | 'total_mobile' | 'total_bank' | 'transactions' | 'avg_sale' | 'margin' | 'none'
  sdb_stat_4: 'total_sales' | 'total_cash' | 'total_mobile' | 'total_bank' | 'transactions' | 'avg_sale' | 'margin' | 'none'
  sdb_show_whatsapp: boolean
  sdb_show_salesperson: boolean
  sdb_show_status: boolean
  sdb_show_payment_badges: boolean
  sdb_show_credit_notes: boolean
  sdb_show_footer: boolean
  sdb_footer_text: string
}

const DEFAULT_SETTINGS: ReportTemplateSettings = {
  logo_url: null,
  logo_position: 'left',
  logo_width: 120,
  company_name: 'SOKORA WELLNESS GROUP',
  company_tagline: 'Reimagining Motherhood',
  primary_color: '#85c2be',
  sdb_show_stats_bar: true,
  sdb_stat_1: 'total_sales',
  sdb_stat_2: 'transactions',
  sdb_stat_3: 'total_cash',
  sdb_stat_4: 'avg_sale',
  sdb_show_whatsapp: true,
  sdb_show_salesperson: true,
  sdb_show_status: true,
  sdb_show_payment_badges: true,
  sdb_show_credit_notes: true,
  sdb_show_footer: true,
  sdb_footer_text: 'Your Organization · Dar es Salaam, Tanzania',
}

const STAT_OPTIONS = [
  { value: 'total_sales', label: 'Total Sales' },
  { value: 'total_cash', label: 'Cash Collected' },
  { value: 'total_mobile', label: 'Mobile Money (M-Pesa/Mixx)' },
  { value: 'total_bank', label: 'Bank Transfers' },
  { value: 'transactions', label: 'Transactions Count' },
  { value: 'avg_sale', label: 'Average Sale' },
  { value: 'margin', label: 'Gross Margin %' },
  { value: 'none', label: 'Hide this box' },
]

export default function ReportTemplates() {
  const [settings, setSettings] = useState<ReportTemplateSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [activeTab, setActiveTab] = useState<'sales-day-book' | 'invoice' | 'receipt'>('sales-day-book')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'report_templates')
      .single()
    
    if (data?.value) {
      try {
        const parsed = JSON.parse(data.value)
        setSettings({ ...DEFAULT_SETTINGS, ...parsed })
      } catch {}
    }
    setLoading(false)
  }

  const saveSettings = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'report_templates', value: JSON.stringify(settings) }, { onConflict: 'key' })
    
    if (error) {
      showToast('Failed to save: ' + error.message, 'error')
    } else {
      showToast('Template settings saved')
    }
    setSaving(false)
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg)
    setToastType(type)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Convert to base64 for storage (simple approach)
    const reader = new FileReader()
    reader.onload = () => {
      setSettings(s => ({ ...s, logo_url: reader.result as string }))
    }
    reader.readAsDataURL(file)
  }

  const removeLogo = () => {
    setSettings(s => ({ ...s, logo_url: null }))
  }

  const updateSetting = <K extends keyof ReportTemplateSettings>(key: K, value: ReportTemplateSettings[K]) => {
    setSettings(s => ({ ...s, [key]: value }))
  }

  const Toggle = ({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, background: value ? '#85c2be' : 'var(--surface3)', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }}></div>
      </div>
    </div>
  )

  if (loading) {
    return <div className="page"><div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div></div>
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Report Templates</div>
          <div className="page-sub">Customize PDF exports · Logo · Colors · Sections</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
            {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {[
          { id: 'sales-day-book', label: 'Sales Day Book' },
          { id: 'invoice', label: 'Invoice (Coming Soon)' },
          { id: 'receipt', label: 'Receipt (Coming Soon)' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab.id ? '#85c2be' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--text3)',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: tab.id === 'sales-day-book' ? 'pointer' : 'not-allowed',
              opacity: tab.id === 'sales-day-book' ? 1 : 0.5,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid g2" style={{ gap: 20 }}>
        {/* Left Column - General Settings */}
        <div>
          {/* Logo Upload */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>Company Logo</div>
            
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div 
                onClick={() => fileInputRef.current?.click()}
                style={{ 
                  width: 140, 
                  height: 100, 
                  background: 'var(--surface2)', 
                  border: '2px dashed var(--border)', 
                  borderRadius: 8, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  cursor: 'pointer',
                  overflow: 'hidden',
                }}
              >
                {settings.logo_url ? (
                  <img src={settings.logo_url} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>
                    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ marginBottom: 4 }}>
                      <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <div>Click to upload</div>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
              
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Logo Position</label>
                  <select 
                    className="form-input" 
                    value={settings.logo_position} 
                    onChange={e => updateSetting('logo_position', e.target.value as any)}
                    style={{ fontSize: 12 }}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Logo Width (px)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={settings.logo_width} 
                    onChange={e => updateSetting('logo_width', parseInt(e.target.value) || 120)}
                    style={{ fontSize: 12, width: 100 }}
                  />
                </div>
                {settings.logo_url && (
                  <button className="btn btn-ghost btn-sm" onClick={removeLogo} style={{ color: 'var(--red)', fontSize: 11 }}>
                    Remove Logo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Company Info */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>Company Info</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Company Name</label>
              <input 
                className="form-input" 
                value={settings.company_name} 
                onChange={e => updateSetting('company_name', e.target.value)}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Tagline</label>
              <input 
                className="form-input" 
                value={settings.company_tagline} 
                onChange={e => updateSetting('company_tagline', e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Primary Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input 
                  type="color" 
                  value={settings.primary_color} 
                  onChange={e => updateSetting('primary_color', e.target.value)}
                  style={{ width: 40, height: 32, border: 'none', cursor: 'pointer' }}
                />
                <input 
                  className="form-input" 
                  value={settings.primary_color} 
                  onChange={e => updateSetting('primary_color', e.target.value)}
                  style={{ width: 100, fontFamily: 'var(--mono)', fontSize: 12 }}
                />
                <button 
                  className="btn btn-ghost btn-sm" 
                  onClick={() => updateSetting('primary_color', '#85c2be')}
                  style={{ fontSize: 10 }}
                >
                  Reset to SOKORA Teal
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Sales Day Book Settings */}
        <div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 6 }}>Sales Day Book Template</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>Configure what appears in the PDF export</div>

            {/* Stats Bar */}
            <div style={{ marginBottom: 20 }}>
              <Toggle 
                value={settings.sdb_show_stats_bar} 
                onChange={v => updateSetting('sdb_show_stats_bar', v)} 
                label="Show Stats Bar"
                sub="Summary boxes at the top of the report"
              />
              
              {settings.sdb_show_stats_bar && (
                <div style={{ background: 'var(--surface2)', padding: 16, borderRadius: 8, marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, fontWeight: 600 }}>STATS TO DISPLAY (4 boxes)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[1, 2, 3, 4].map(n => (
                      <div key={n}>
                        <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Box {n}</label>
                        <select 
                          className="form-input" 
                          value={settings[`sdb_stat_${n}` as keyof ReportTemplateSettings] as string}
                          onChange={e => updateSetting(`sdb_stat_${n}` as any, e.target.value)}
                          style={{ fontSize: 11 }}
                        >
                          {STAT_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Table Columns */}
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase' }}>Table Columns</div>
            
            <Toggle 
              value={settings.sdb_show_whatsapp} 
              onChange={v => updateSetting('sdb_show_whatsapp', v)} 
              label="WhatsApp Number"
              sub="Customer phone number column"
            />
            <Toggle 
              value={settings.sdb_show_salesperson} 
              onChange={v => updateSetting('sdb_show_salesperson', v)} 
              label="Posted By"
              sub="Who posted the voucher"
            />
            <Toggle 
              value={settings.sdb_show_status} 
              onChange={v => updateSetting('sdb_show_status', v)} 
              label="Status Badge"
              sub="Posted / POD indicator"
            />
            <Toggle 
              value={settings.sdb_show_payment_badges} 
              onChange={v => updateSetting('sdb_show_payment_badges', v)} 
              label="Payment Method Badges"
              sub="Colored badges for Cash, M-Pesa, etc."
            />

            {/* Sections */}
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, marginTop: 20, fontWeight: 600, textTransform: 'uppercase' }}>Sections</div>
            
            <Toggle 
              value={settings.sdb_show_credit_notes} 
              onChange={v => updateSetting('sdb_show_credit_notes', v)} 
              label="Credit Notes Section"
              sub="Show credit notes below sales with net total"
            />
            <Toggle 
              value={settings.sdb_show_footer} 
              onChange={v => updateSetting('sdb_show_footer', v)} 
              label="Footer"
            />
            
            {settings.sdb_show_footer && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Footer Text</label>
                <input 
                  className="form-input" 
                  value={settings.sdb_footer_text} 
                  onChange={e => updateSetting('sdb_footer_text', e.target.value)}
                  style={{ fontSize: 12 }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Preview</div>
        <div style={{ 
          background: '#fff', 
          border: '1px solid var(--border)', 
          borderRadius: 8, 
          padding: 20,
          color: '#1a1a1a',
          fontSize: 10,
        }}>
          {/* Header Preview */}
          <div style={{ 
            display: 'flex', 
            justifyContent: settings.logo_position === 'center' ? 'center' : 'space-between',
            flexDirection: settings.logo_position === 'center' ? 'column' : 'row',
            alignItems: settings.logo_position === 'center' ? 'center' : 'flex-start',
            borderBottom: `3px solid ${settings.primary_color}`,
            paddingBottom: 12,
            marginBottom: 16,
          }}>
            <div style={{ textAlign: settings.logo_position === 'center' ? 'center' : 'left' }}>
              {settings.logo_url && (
                <img src={settings.logo_url} alt="Logo" style={{ width: settings.logo_width, marginBottom: 6 }} />
              )}
              <div style={{ fontSize: 14, fontWeight: 800, color: settings.primary_color }}>{settings.company_name}</div>
              <div style={{ fontSize: 10, color: '#666' }}>{settings.company_tagline}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>Sales Day Book</div>
              <div style={{ fontSize: 9, color: '#888' }}>2026-03-30 to 2026-03-30</div>
            </div>
          </div>

          {/* Stats Preview */}
          {settings.sdb_show_stats_bar && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[settings.sdb_stat_1, settings.sdb_stat_2, settings.sdb_stat_3, settings.sdb_stat_4]
                .filter(s => s !== 'none')
                .map((stat, i) => (
                  <div key={i} style={{ 
                    flex: 1, 
                    background: i === 0 ? settings.primary_color : i === 1 ? '#f7a6ad' : '#2d3748',
                    borderRadius: 6, 
                    padding: 10, 
                    color: '#fff' 
                  }}>
                    <div style={{ fontSize: 7, textTransform: 'uppercase', opacity: 0.9 }}>
                      {STAT_OPTIONS.find(o => o.value === stat)?.label}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, marginTop: 2 }}>TZS 185,000</div>
                  </div>
                ))}
            </div>
          )}

          {/* Table Preview */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
            <thead>
              <tr style={{ background: settings.primary_color, color: '#fff' }}>
                <th style={{ padding: 6, textAlign: 'left' }}>Date</th>
                <th style={{ padding: 6, textAlign: 'left' }}>Voucher No</th>
                <th style={{ padding: 6, textAlign: 'left' }}>Customer</th>
                {settings.sdb_show_whatsapp && <th style={{ padding: 6, textAlign: 'left' }}>WhatsApp</th>}
                <th style={{ padding: 6, textAlign: 'left' }}>Payment</th>
                {settings.sdb_show_salesperson && <th style={{ padding: 6, textAlign: 'left' }}>Posted By</th>}
                {settings.sdb_show_status && <th style={{ padding: 6, textAlign: 'left' }}>Status</th>}
                <th style={{ padding: 6, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>2026-03-30</td>
                <td style={{ padding: 6, borderBottom: '1px solid #eee', color: settings.primary_color, fontWeight: 600 }}>CS-10-0005</td>
                <td style={{ padding: 6, borderBottom: '1px solid #eee', fontWeight: 600 }}>Zaina Khan</td>
                {settings.sdb_show_whatsapp && <td style={{ padding: 6, borderBottom: '1px solid #eee', color: '#25D366' }}>656510000</td>}
                <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>
                  {settings.sdb_show_payment_badges ? (
                    <span style={{ background: '#cce5ff', color: '#004085', padding: '2px 6px', borderRadius: 3, fontSize: 7 }}>M-Pesa</span>
                  ) : 'M-Pesa'}
                </td>
                {settings.sdb_show_salesperson && <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>Joe Gembe</td>}
                {settings.sdb_show_status && <td style={{ padding: 6, borderBottom: '1px solid #eee' }}><span style={{ background: '#d4edda', color: '#155724', padding: '2px 6px', borderRadius: 8, fontSize: 6 }}>Posted ✓</span></td>}
                <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700 }}>80,000</td>
              </tr>
              <tr style={{ background: settings.primary_color, color: '#fff' }}>
                <td colSpan={settings.sdb_show_whatsapp && settings.sdb_show_salesperson && settings.sdb_show_status ? 7 : 5} style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>SALES TOTAL</td>
                <td style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>185,000</td>
              </tr>
            </tbody>
          </table>

          {/* Footer Preview */}
          {settings.sdb_show_footer && (
            <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid #eee', fontSize: 8, color: '#888', display: 'flex', justifyContent: 'space-between' }}>
              <div>{settings.sdb_footer_text}</div>
              <div>Page 1 of 1</div>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
