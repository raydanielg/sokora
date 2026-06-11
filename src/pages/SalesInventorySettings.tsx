import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { SettingsPage, SettingsSection, SettingsRow, Toggle } from '../components/SettingsPrimitives'
import { useSettings } from '../lib/settingsLoader'
import { DEFAULT_NOTIFICATIONS } from '../lib/settingsDefaults'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBAccount { id: string; code: string; name: string }

export default function SalesInventorySettings({ onNav }: Props) {
  const { settings, updateSlice } = useSettings()
  const [notifForm, setNotifForm] = useState({ ...DEFAULT_NOTIFICATIONS, ...settings.notifications })
  const [autoReceipt, setAutoReceipt] = useState(true)
  const [allowedBanks, setAllowedBanks] = useState<string[]>([])
  const [allBankAccounts, setAllBankAccounts] = useState<DBAccount[]>([])
  const [recipientsInput, setRecipientsInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => {
    setNotifForm({ ...DEFAULT_NOTIFICATIONS, ...settings.notifications })
    setRecipientsInput((settings.notifications.low_stock_email_recipients || []).join(', '))
  }, [settings.notifications])

  useEffect(() => { loadBankAccounts() }, [])

  const loadBankAccounts = async () => {
    const { data } = await supabase.from('accounts')
      .select('id, code, name')
      .eq('category', 'Cash & Bank').eq('is_active', true).order('code')
    if (data) {
      setAllBankAccounts(data)
      setAllowedBanks(data.map(a => a.code))
    }
  }

  const toggleBank = (code: string) => {
    setAllowedBanks(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const setNotif = <K extends keyof typeof notifForm>(k: K, v: typeof notifForm[K]) =>
    setNotifForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    // Parse email recipients from comma-separated string
    const recipients = recipientsInput.split(',').map(s => s.trim()).filter(Boolean)
    const ok = await updateSlice('notifications', { ...notifForm, low_stock_email_recipients: recipients })
    setSaving(false)
    if (ok) { setToast('Sales & Inventory settings saved'); setToastType('success') }
    else { setToast('Save failed'); setToastType('error') }
  }

  return (
    <SettingsPage
      title="Sales & Inventory"
      subtitle="Cashier behavior, stock rules, reorder alerts, categories, and locations"
      onBack={() => onNav('settings')}
      actions={<button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>}
    >
      <SettingsSection title="Detailed Configuration" description="Deep settings for stock, locations, and accounting live in dedicated pages">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <ShortcutCard title="Inventory Settings" description="Valuation method, negative stock, categories, units of measure" onClick={() => onNav('inventory-settings')} color="#00e5a0" />
          <ShortcutCard title="Location Management" description="Branches, warehouses, 4-digit location codes" onClick={() => onNav('location-settings')} color="#3d8bff" />
          <ShortcutCard title="Accounting Settings" description="Fiscal periods, posting rules, backdate limits" onClick={() => onNav('accounting-settings')} color="#6366f1" />
        </div>
      </SettingsSection>

      <SettingsSection title="Cash Sale Behavior" description="Control how the counter handles receipts and payments">
        <SettingsRow
          label="Auto-Receipt on Full Payment"
          description="When ON, posting a cash sale automatically creates the receipt journal entry. When OFF, the cashier must manually receipt each sale."
        >
          <Toggle value={autoReceipt} onChange={setAutoReceipt} />
        </SettingsRow>

        <div style={{ paddingTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Payment Accounts Shown at Counter</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Choose which bank/cash accounts appear in the Cash Sale payment dropdown. Uncheck to hide from cashiers.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {allBankAccounts.map(a => (
              <div key={a.id} onClick={() => toggleBank(a.code)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                background: allowedBanks.includes(a.code) ? 'var(--green-dim)' : 'var(--surface2)',
                border: `1px solid ${allowedBanks.includes(a.code) ? 'var(--green)' : 'var(--border)'}`,
                borderRadius: 'var(--r)', cursor: 'pointer', transition: 'all .15s',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: allowedBanks.includes(a.code) ? 'var(--green)' : 'var(--surface3)',
                  border: `2px solid ${allowedBanks.includes(a.code) ? 'var(--green)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {allowedBanks.includes(a.code) && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.name}</div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{a.code}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Low-Stock Alerts" description="Get notified when stock drops to critical levels">
        <SettingsRow label="Enable Email Alerts" description="Send email when any SKU drops below the threshold">
          <Toggle value={notifForm.low_stock_email_enabled} onChange={v => setNotif('low_stock_email_enabled', v)} />
        </SettingsRow>

        {notifForm.low_stock_email_enabled && (
          <>
            <FG label="Low-Stock Threshold (units)">
              <input type="number" min={0} max={10000} className="form-input" value={notifForm.low_stock_threshold_units} onChange={e => setNotif('low_stock_threshold_units', parseInt(e.target.value) || 0)} />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Trigger an alert when on-hand quantity for any SKU falls below this number</div>
            </FG>
            <FG label="Email Recipients">
              <input className="form-input" value={recipientsInput} onChange={e => setRecipientsInput(e.target.value)} placeholder="joe@sokora.app, barbra@sokora.app" />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Comma-separated emails that receive low-stock alerts</div>
            </FG>
          </>
        )}
      </SettingsSection>

      <SettingsSection title="Daily Sales Summary" description="Optional daily email recap of sales activity">
        <SettingsRow label="Send Daily Summary Email" description="Automatic sales recap emailed at a fixed time each day">
          <Toggle value={notifForm.daily_summary_enabled} onChange={v => setNotif('daily_summary_enabled', v)} />
        </SettingsRow>

        {notifForm.daily_summary_enabled && (
          <FG label="Send Time">
            <input type="time" className="form-input" value={notifForm.daily_summary_time} onChange={e => setNotif('daily_summary_time', e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Local time (Africa/Dar_es_Salaam)</div>
          </FG>
        )}
      </SettingsSection>

      <SettingsSection title="Overdue Payment Alerts" description="Follow up on unpaid invoices">
        <SettingsRow label="Enable Overdue Alerts" description="Email a reminder when an invoice is past its due date">
          <Toggle value={notifForm.overdue_payment_alerts} onChange={v => setNotif('overdue_payment_alerts', v)} />
        </SettingsRow>

        {notifForm.overdue_payment_alerts && (
          <FG label="Alert after (days overdue)">
            <input type="number" min={1} max={365} className="form-input" value={notifForm.overdue_threshold_days} onChange={e => setNotif('overdue_threshold_days', parseInt(e.target.value) || 14)} />
          </FG>
        )}
      </SettingsSection>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </SettingsPage>
  )
}

function ShortcutCard({ title, description, onClick, color }: { title: string; description: string; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', padding: 16, textAlign: 'left', cursor: 'pointer',
      transition: 'border-color .15s', display: 'flex', flexDirection: 'column', gap: 6,
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = color}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.4 }}>{description}</div>
      <div style={{ fontSize: 12, color, fontWeight: 600, marginTop: 'auto' }}>Open →</div>
    </button>
  )
}
