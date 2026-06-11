import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'

interface CRMSetting {
  id: string
  category: string
  key: string
  value: any
}

interface TierConfig {
  name: string
  min_points: number
  discount_pct: number
  free_delivery: boolean
}

const TABS = [
  { id: 'crown', label: 'Crown Loyalty', icon: 'M2 4l3 12h14l3-12-5.5 7L12 3 7.5 11z' },
  { id: 'referral', label: 'Referrals', icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
  { id: 'preorder', label: 'Pre-Orders', icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
  { id: 'leads', label: 'Leads', icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' },
  { id: 'automation', label: 'Automation', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  { id: 'scheduling', label: 'Scheduling', icon: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 6v6l4 2' },
  { id: 'feedback', label: 'Feedback', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
]

export default function CRMSettings() {
  const [activeTab, setActiveTab] = useState('crown')
  const [_settings, setSettings] = useState<CRMSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Local state for editing
  const [localSettings, setLocalSettings] = useState<Record<string, any>>({})

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('crm_settings').select('*')
    if (!error && data) {
      setSettings(data)
      // Build local settings map
      const map: Record<string, any> = {}
      data.forEach(s => {
        map[`${s.category}.${s.key}`] = s.value
      })
      setLocalSettings(map)
    }
    setLoading(false)
  }

  const getSetting = (category: string, key: string, defaultVal: any = null) => {
    return localSettings[`${category}.${key}`] ?? defaultVal
  }

  const setSetting = (category: string, key: string, value: any) => {
    setLocalSettings(prev => ({
      ...prev,
      [`${category}.${key}`]: value
    }))
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const updates = Object.entries(localSettings).map(([fullKey, value]) => {
        const [category, key] = fullKey.split('.')
        return { category, key, value, updated_at: new Date().toISOString() }
      })

      const { error } = await supabase
        .from('crm_settings')
        .upsert(updates, { onConflict: 'category,key' })

      if (error) throw error
      setToast({ msg: 'Settings saved', type: 'success' })
      loadSettings()
    } catch (err: any) {
      setToast({ msg: err.message || 'Save failed', type: 'error' })
    }
    setSaving(false)
  }

  const s = {
    page: { padding: 32, maxWidth: 1200, margin: '0 auto' } as React.CSSProperties,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 } as React.CSSProperties,
    title: { fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800, marginBottom: 4 } as React.CSSProperties,
    sub: { fontSize: 13, color: 'var(--text3)' } as React.CSSProperties,
    tabs: { display: 'flex', gap: 4, background: 'var(--surface2)', padding: 4, borderRadius: 10, marginBottom: 24, flexWrap: 'wrap' } as React.CSSProperties,
    tab: (active: boolean) => ({
      padding: '10px 16px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', borderRadius: 8,
      background: active ? 'var(--accent)' : 'transparent',
      color: active ? '#fff' : 'var(--text3)',
      display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s'
    }) as React.CSSProperties,
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 20 } as React.CSSProperties,
    cardTitle: { fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 16 } as React.CSSProperties,
    row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 } as React.CSSProperties,
    field: { marginBottom: 16 } as React.CSSProperties,
    label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.5 } as React.CSSProperties,
    input: { width: '100%', padding: '10px 12px', fontSize: 13, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' } as React.CSSProperties,
    hint: { fontSize: 11, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,
    toggle: { display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
    btn: { padding: '10px 24px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'var(--accent)', color: '#fff' } as React.CSSProperties,
  }

  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div style={s.toggle}>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
          background: checked ? 'var(--accent)' : 'var(--surface3)', transition: 'background .2s'
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3,
          left: checked ? 23 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)'
        }} />
      </button>
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  )

  const renderCrownTab = () => {
    const pointsConfig = getSetting('crown', 'points_per_tzs', { amount: 1000, points: 1 })
    const referralPoints = getSetting('crown', 'referral_points', { referrer: 100, referred: 50 })
    const reviewPoints = getSetting('crown', 'review_points', { points: 10 })
    const birthdayMult = getSetting('crown', 'birthday_multiplier', { multiplier: 2 })
    const expiry = getSetting('crown', 'points_expiry', { months: null })
    const tiers = getSetting('crown', 'tiers', []) as TierConfig[]

    return (
      <>
        <div style={s.card}>
          <div style={s.cardTitle}>Points Earning</div>
          <div style={s.row}>
            <div style={s.field}>
              <label style={s.label}>Points per TZS spent</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="number"
                  style={{ ...s.input, width: 100 }}
                  value={pointsConfig.points}
                  onChange={e => setSetting('crown', 'points_per_tzs', { ...pointsConfig, points: parseInt(e.target.value) || 1 })}
                />
                <span style={{ color: 'var(--text3)' }}>point(s) per</span>
                <input
                  type="number"
                  style={{ ...s.input, width: 120 }}
                  value={pointsConfig.amount}
                  onChange={e => setSetting('crown', 'points_per_tzs', { ...pointsConfig, amount: parseInt(e.target.value) || 1000 })}
                />
                <span style={{ color: 'var(--text3)' }}>TZS</span>
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>Birthday Multiplier</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="number"
                  style={{ ...s.input, width: 80 }}
                  value={birthdayMult.multiplier}
                  onChange={e => setSetting('crown', 'birthday_multiplier', { multiplier: parseInt(e.target.value) || 2 })}
                />
                <span style={{ color: 'var(--text3)' }}>x points during birthday month</span>
              </div>
            </div>
          </div>
          <div style={s.row}>
            <div style={s.field}>
              <label style={s.label}>Points for Product Review</label>
              <input
                type="number"
                style={{ ...s.input, width: 100 }}
                value={reviewPoints.points}
                onChange={e => setSetting('crown', 'review_points', { points: parseInt(e.target.value) || 10 })}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Points Expiry</label>
              <select
                style={s.input}
                value={expiry.months || 'never'}
                onChange={e => setSetting('crown', 'points_expiry', { months: e.target.value === 'never' ? null : parseInt(e.target.value) })}
              >
                <option value="never">Never expire</option>
                <option value="6">6 months of inactivity</option>
                <option value="12">12 months of inactivity</option>
                <option value="24">24 months of inactivity</option>
              </select>
            </div>
          </div>
          <div style={s.row}>
            <div style={s.field}>
              <label style={s.label}>Referral Points (Referrer)</label>
              <input
                type="number"
                style={{ ...s.input, width: 100 }}
                value={referralPoints.referrer}
                onChange={e => setSetting('crown', 'referral_points', { ...referralPoints, referrer: parseInt(e.target.value) || 100 })}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Referral Points (New Customer)</label>
              <input
                type="number"
                style={{ ...s.input, width: 100 }}
                value={referralPoints.referred}
                onChange={e => setSetting('crown', 'referral_points', { ...referralPoints, referred: parseInt(e.target.value) || 50 })}
              />
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Loyalty Tiers</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'var(--text3)' }}>TIER NAME</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'var(--text3)' }}>MIN POINTS</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'var(--text3)' }}>DISCOUNT %</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'var(--text3)' }}>FREE DELIVERY</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        style={{ ...s.input, width: 150 }}
                        value={tier.name}
                        onChange={e => {
                          const updated = [...tiers]
                          updated[i] = { ...tier, name: e.target.value }
                          setSetting('crown', 'tiers', updated)
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="number"
                        style={{ ...s.input, width: 100 }}
                        value={tier.min_points}
                        onChange={e => {
                          const updated = [...tiers]
                          updated[i] = { ...tier, min_points: parseInt(e.target.value) || 0 }
                          setSetting('crown', 'tiers', updated)
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="number"
                        style={{ ...s.input, width: 80 }}
                        value={tier.discount_pct}
                        onChange={e => {
                          const updated = [...tiers]
                          updated[i] = { ...tier, discount_pct: parseInt(e.target.value) || 0 }
                          setSetting('crown', 'tiers', updated)
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Toggle
                        checked={tier.free_delivery}
                        onChange={v => {
                          const updated = [...tiers]
                          updated[i] = { ...tier, free_delivery: v }
                          setSetting('crown', 'tiers', updated)
                        }}
                        label=""
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  const renderReferralTab = () => {
    const codeFormat = getSetting('referral', 'code_format', { type: 'name_based' })
    const rewards = getSetting('referral', 'rewards', { referrer_points: 100, referred_points: 50 })
    const ambassador = getSetting('referral', 'ambassador_threshold', { referrals: 15 })
    const perks = getSetting('referral', 'ambassador_perks', { discount_pct: 15, featured: true })

    return (
      <>
        <div style={s.card}>
          <div style={s.cardTitle}>Referral Code Format</div>
          <div style={s.field}>
            <label style={s.label}>Code Generation</label>
            <select
              style={s.input}
              value={codeFormat.type}
              onChange={e => setSetting('referral', 'code_format', { type: e.target.value })}
            >
              <option value="name_based">Name-based (AMINA2026)</option>
              <option value="auto">Auto-generated (REF-A7X2)</option>
            </select>
            <div style={s.hint}>Name-based codes are more personal and easier to remember</div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Referral Rewards</div>
          <div style={s.row}>
            <div style={s.field}>
              <label style={s.label}>Referrer Gets (points)</label>
              <input
                type="number"
                style={{ ...s.input, width: 120 }}
                value={rewards.referrer_points}
                onChange={e => setSetting('referral', 'rewards', { ...rewards, referrer_points: parseInt(e.target.value) || 100 })}
              />
              <div style={s.hint}>When their referral makes first purchase</div>
            </div>
            <div style={s.field}>
              <label style={s.label}>New Customer Gets (points)</label>
              <input
                type="number"
                style={{ ...s.input, width: 120 }}
                value={rewards.referred_points}
                onChange={e => setSetting('referral', 'rewards', { ...rewards, referred_points: parseInt(e.target.value) || 50 })}
              />
              <div style={s.hint}>On their first purchase</div>
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Ambassador Program</div>
          <div style={s.row}>
            <div style={s.field}>
              <label style={s.label}>Referrals to Become Ambassador</label>
              <input
                type="number"
                style={{ ...s.input, width: 100 }}
                value={ambassador.referrals}
                onChange={e => setSetting('referral', 'ambassador_threshold', { referrals: parseInt(e.target.value) || 15 })}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Ambassador Discount %</label>
              <input
                type="number"
                style={{ ...s.input, width: 100 }}
                value={perks.discount_pct}
                onChange={e => setSetting('referral', 'ambassador_perks', { ...perks, discount_pct: parseInt(e.target.value) || 15 })}
              />
            </div>
          </div>
          <Toggle
            checked={perks.featured}
            onChange={v => setSetting('referral', 'ambassador_perks', { ...perks, featured: v })}
            label="Feature ambassadors on social media"
          />
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Referral Link</div>
          <div style={s.hint}>Each customer gets a personal referral link:</div>
          <div style={{ marginTop: 12, padding: 16, background: 'var(--surface2)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 13 }}>
            https://wa.me/255712345678?text=Hi%20SOKORA!%20Referred%20by%20<span style={{ color: 'var(--accent)' }}>[CODE]</span>
          </div>
          <div style={{ ...s.hint, marginTop: 12 }}>
            When clicked, opens WhatsApp with pre-filled message containing referral code.
            Future: Custom landing page at sokora.app/r/[code]
          </div>
        </div>
      </>
    )
  }

  const renderPreorderTab = () => {
    const depositType = getSetting('preorder', 'deposit_type', { type: 'both' })
    const depositPct = getSetting('preorder', 'deposit_percentage', { percentage: 50 })
    const depositMin = getSetting('preorder', 'deposit_minimum', { amount: 50000 })
    const depositAccount = getSetting('preorder', 'deposit_account', { code: '2050' })
    const allowInstock = getSetting('preorder', 'allow_instock', { enabled: true })

    return (
      <div style={s.card}>
        <div style={s.cardTitle}>Pre-Order Deposit Settings</div>
        
        <div style={s.field}>
          <label style={s.label}>Deposit Type</label>
          <select
            style={s.input}
            value={depositType.type}
            onChange={e => setSetting('preorder', 'deposit_type', { type: e.target.value })}
          >
            <option value="percentage">Percentage only</option>
            <option value="fixed">Fixed amount only</option>
            <option value="both">Both (choose per order)</option>
          </select>
        </div>

        <div style={s.row}>
          <div style={s.field}>
            <label style={s.label}>Default Deposit Percentage</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                style={{ ...s.input, width: 100 }}
                value={depositPct.percentage}
                onChange={e => setSetting('preorder', 'deposit_percentage', { percentage: parseInt(e.target.value) || 50 })}
              />
              <span style={{ color: 'var(--text3)' }}>%</span>
            </div>
          </div>
          <div style={s.field}>
            <label style={s.label}>Minimum Deposit (TZS)</label>
            <input
              type="number"
              style={{ ...s.input, width: 150 }}
              value={depositMin.amount}
              onChange={e => setSetting('preorder', 'deposit_minimum', { amount: parseInt(e.target.value) || 50000 })}
            />
          </div>
        </div>

        <div style={s.field}>
          <label style={s.label}>Customer Deposits Account</label>
          <input
            style={{ ...s.input, width: 200 }}
            value={depositAccount.code}
            onChange={e => setSetting('preorder', 'deposit_account', { code: e.target.value })}
          />
          <div style={s.hint}>Liability account for holding deposits (e.g., 2050 - Customer Deposits)</div>
        </div>

        <div style={{ marginTop: 20 }}>
          <Toggle
            checked={allowInstock.enabled}
            onChange={v => setSetting('preorder', 'allow_instock', { enabled: v })}
            label="Allow pre-orders for in-stock products"
          />
          <div style={s.hint}>If disabled, pre-orders only for out-of-stock items</div>
        </div>
      </div>
    )
  }

  const renderLeadsTab = () => {
    const stages = getSetting('leads', 'stages', ['new', 'contacted', 'interested', 'ready_to_buy', 'converted', 'lost'])
    const sources = getSetting('leads', 'sources', ['walk_in', 'whatsapp', 'instagram', 'facebook', 'referral', 'konnect', 'other'])
    const autoAssign = getSetting('leads', 'auto_assign', { enabled: false, method: 'manual' })
    const followupDays = getSetting('leads', 'followup_days', { days: 2 })

    return (
      <>
        <div style={s.card}>
          <div style={s.cardTitle}>Lead Stages (Kanban Columns)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stages.map((stage: string, i: number) => (
              <div key={i} style={{ padding: '8px 14px', background: 'var(--surface2)', borderRadius: 6, fontSize: 12, textTransform: 'capitalize' }}>
                {stage.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
          <div style={{ ...s.hint, marginTop: 12 }}>Edit stages in database (crm_settings table)</div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Lead Sources</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sources.map((source: string, i: number) => (
              <div key={i} style={{ padding: '8px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 6, fontSize: 12, textTransform: 'capitalize' }}>
                {source.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Lead Assignment</div>
          <div style={s.field}>
            <Toggle
              checked={autoAssign.enabled}
              onChange={v => setSetting('leads', 'auto_assign', { ...autoAssign, enabled: v })}
              label="Auto-assign new leads"
            />
          </div>
          {autoAssign.enabled && (
            <div style={s.field}>
              <label style={s.label}>Assignment Method</label>
              <select
                style={s.input}
                value={autoAssign.method}
                onChange={e => setSetting('leads', 'auto_assign', { ...autoAssign, method: e.target.value })}
              >
                <option value="round_robin">Round Robin</option>
                <option value="random">Random</option>
                <option value="least_leads">Least Active Leads</option>
              </select>
            </div>
          )}
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Follow-up Reminder</div>
          <div style={s.field}>
            <label style={s.label}>Remind if no contact in</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                style={{ ...s.input, width: 80 }}
                value={followupDays.days}
                onChange={e => setSetting('leads', 'followup_days', { days: parseInt(e.target.value) || 2 })}
              />
              <span style={{ color: 'var(--text3)' }}>days</span>
            </div>
          </div>
        </div>
      </>
    )
  }

  const renderAutomationTab = () => {
    const birthday = getSetting('automation', 'birthday_message', { enabled: true, days_before: 1, send_time: '09:00', template: 'birthday_wish' })
    const postPurchase = getSetting('automation', 'post_purchase_followup', { enabled: true, days_after: 3, template: 'feedback_request' })
    const preorderArrival = getSetting('automation', 'preorder_arrival', { enabled: true, template: 'preorder_ready' })
    const reengagement = getSetting('automation', 'reengagement', { enabled: false, inactive_days: 60, template: 'we_miss_you' })

    return (
      <>
        <div style={s.card}>
          <div style={s.cardTitle}>Birthday Message</div>
          <Toggle
            checked={birthday.enabled}
            onChange={v => setSetting('automation', 'birthday_message', { ...birthday, enabled: v })}
            label="Send birthday wishes"
          />
          {birthday.enabled && (
            <div style={{ ...s.row, marginTop: 16 }}>
              <div style={s.field}>
                <label style={s.label}>Days Before Birthday</label>
                <input
                  type="number"
                  style={{ ...s.input, width: 80 }}
                  value={birthday.days_before}
                  onChange={e => setSetting('automation', 'birthday_message', { ...birthday, days_before: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>Send Time</label>
                <input
                  type="time"
                  style={{ ...s.input, width: 120 }}
                  value={birthday.send_time}
                  onChange={e => setSetting('automation', 'birthday_message', { ...birthday, send_time: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Post-Purchase Follow-up</div>
          <Toggle
            checked={postPurchase.enabled}
            onChange={v => setSetting('automation', 'post_purchase_followup', { ...postPurchase, enabled: v })}
            label="Request feedback after purchase"
          />
          {postPurchase.enabled && (
            <div style={{ ...s.field, marginTop: 16 }}>
              <label style={s.label}>Days After Purchase</label>
              <input
                type="number"
                style={{ ...s.input, width: 80 }}
                value={postPurchase.days_after}
                onChange={e => setSetting('automation', 'post_purchase_followup', { ...postPurchase, days_after: parseInt(e.target.value) || 3 })}
              />
            </div>
          )}
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Pre-Order Arrival</div>
          <Toggle
            checked={preorderArrival.enabled}
            onChange={v => setSetting('automation', 'preorder_arrival', { ...preorderArrival, enabled: v })}
            label="Notify customer when pre-order arrives"
          />
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Re-engagement</div>
          <Toggle
            checked={reengagement.enabled}
            onChange={v => setSetting('automation', 'reengagement', { ...reengagement, enabled: v })}
            label="Send message to inactive customers"
          />
          {reengagement.enabled && (
            <div style={{ ...s.field, marginTop: 16 }}>
              <label style={s.label}>After Days of Inactivity</label>
              <input
                type="number"
                style={{ ...s.input, width: 80 }}
                value={reengagement.inactive_days}
                onChange={e => setSetting('automation', 'reengagement', { ...reengagement, inactive_days: parseInt(e.target.value) || 60 })}
              />
            </div>
          )}
        </div>
      </>
    )
  }

  const renderSchedulingTab = () => {
    const windows = getSetting('scheduling', 'send_windows', {
      weekday_start: '08:00', weekday_end: '20:00',
      saturday_start: '09:00', saturday_end: '18:00',
      sunday_enabled: false
    })
    const limits = getSetting('scheduling', 'rate_limits', { per_hour: 50, per_day: 500, delay_seconds: 2 })

    return (
      <>
        <div style={s.card}>
          <div style={s.cardTitle}>Send Windows</div>
          <div style={s.hint}>Messages will only be sent during these hours</div>
          
          <div style={{ marginTop: 16 }}>
            <div style={{ ...s.row, alignItems: 'center' }}>
              <span style={{ fontSize: 13, width: 100 }}>Weekdays</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="time"
                  style={{ ...s.input, width: 120 }}
                  value={windows.weekday_start}
                  onChange={e => setSetting('scheduling', 'send_windows', { ...windows, weekday_start: e.target.value })}
                />
                <span style={{ color: 'var(--text3)' }}>to</span>
                <input
                  type="time"
                  style={{ ...s.input, width: 120 }}
                  value={windows.weekday_end}
                  onChange={e => setSetting('scheduling', 'send_windows', { ...windows, weekday_end: e.target.value })}
                />
              </div>
            </div>

            <div style={{ ...s.row, alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 13, width: 100 }}>Saturday</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="time"
                  style={{ ...s.input, width: 120 }}
                  value={windows.saturday_start}
                  onChange={e => setSetting('scheduling', 'send_windows', { ...windows, saturday_start: e.target.value })}
                />
                <span style={{ color: 'var(--text3)' }}>to</span>
                <input
                  type="time"
                  style={{ ...s.input, width: 120 }}
                  value={windows.saturday_end}
                  onChange={e => setSetting('scheduling', 'send_windows', { ...windows, saturday_end: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <Toggle
                checked={windows.sunday_enabled}
                onChange={v => setSetting('scheduling', 'send_windows', { ...windows, sunday_enabled: v })}
                label="Allow messages on Sunday"
              />
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Rate Limits</div>
          <div style={s.hint}>Prevent spam flags and respect WhatsApp limits</div>
          
          <div style={{ ...s.row, marginTop: 16 }}>
            <div style={s.field}>
              <label style={s.label}>Max Messages per Hour</label>
              <input
                type="number"
                style={{ ...s.input, width: 100 }}
                value={limits.per_hour}
                onChange={e => setSetting('scheduling', 'rate_limits', { ...limits, per_hour: parseInt(e.target.value) || 50 })}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Max Messages per Day</label>
              <input
                type="number"
                style={{ ...s.input, width: 100 }}
                value={limits.per_day}
                onChange={e => setSetting('scheduling', 'rate_limits', { ...limits, per_day: parseInt(e.target.value) || 500 })}
              />
            </div>
          </div>
          <div style={s.field}>
            <label style={s.label}>Delay Between Messages (seconds)</label>
            <input
              type="number"
              style={{ ...s.input, width: 100 }}
              value={limits.delay_seconds}
              onChange={e => setSetting('scheduling', 'rate_limits', { ...limits, delay_seconds: parseInt(e.target.value) || 2 })}
            />
          </div>
        </div>
      </>
    )
  }

  const renderFeedbackTab = () => {
    const reviews = getSetting('feedback', 'enable_reviews', { enabled: true })
    const nps = getSetting('feedback', 'enable_nps', { enabled: true })
    const autoRequest = getSetting('feedback', 'auto_request', { enabled: true, days_after: 3 })
    const ugcMin = getSetting('feedback', 'ugc_min_rating', { rating: 4 })

    return (
      <>
        <div style={s.card}>
          <div style={s.cardTitle}>Feedback Types</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Toggle
              checked={reviews.enabled}
              onChange={v => setSetting('feedback', 'enable_reviews', { enabled: v })}
              label="Enable product reviews (1-5 stars)"
            />
            <Toggle
              checked={nps.enabled}
              onChange={v => setSetting('feedback', 'enable_nps', { enabled: v })}
              label="Enable NPS surveys (0-10 score)"
            />
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Auto-Request Feedback</div>
          <Toggle
            checked={autoRequest.enabled}
            onChange={v => setSetting('feedback', 'auto_request', { ...autoRequest, enabled: v })}
            label="Automatically request feedback after purchase"
          />
          {autoRequest.enabled && (
            <div style={{ ...s.field, marginTop: 16 }}>
              <label style={s.label}>Days After Purchase</label>
              <input
                type="number"
                style={{ ...s.input, width: 80 }}
                value={autoRequest.days_after}
                onChange={e => setSetting('feedback', 'auto_request', { ...autoRequest, days_after: parseInt(e.target.value) || 3 })}
              />
            </div>
          )}
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>UGC (User Generated Content)</div>
          <div style={s.field}>
            <label style={s.label}>Minimum Rating for UGC Request</label>
            <select
              style={s.input}
              value={ugcMin.rating}
              onChange={e => setSetting('feedback', 'ugc_min_rating', { rating: parseInt(e.target.value) })}
            >
              <option value={3}>3+ stars</option>
              <option value={4}>4+ stars</option>
              <option value={5}>5 stars only</option>
            </select>
            <div style={s.hint}>Only request permission to share reviews with this rating or higher</div>
          </div>
        </div>
      </>
    )
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'crown': return renderCrownTab()
      case 'referral': return renderReferralTab()
      case 'preorder': return renderPreorderTab()
      case 'leads': return renderLeadsTab()
      case 'automation': return renderAutomationTab()
      case 'scheduling': return renderSchedulingTab()
      case 'feedback': return renderFeedbackTab()
      default: return null
    }
  }

  if (loading) {
    return (
      <div style={s.page}>
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>Loading CRM settings...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>CRM Settings</h1>
          <p style={s.sub}>Configure loyalty, referrals, pre-orders, leads, and automation</p>
        </div>
        <button style={{ ...s.btn, opacity: saving ? 0.6 : 1 }} onClick={saveSettings} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div style={s.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            style={s.tab(activeTab === tab.id)}
            onClick={() => setActiveTab(tab.id)}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={tab.icon}/></svg>
            {tab.label}
          </button>
        ))}
      </div>

      {renderTabContent()}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
