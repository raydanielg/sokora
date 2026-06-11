// ════════════════════════════════════════════════════════════════════════════
// ApprovalsSettings.tsx
// Admin page for configuring approval workflow rules.
//
// Per approval type, admins can set:
//   - Active/inactive
//   - Threshold type & value (any | amount | percentage | quantity | days | never)
//   - Threshold operator (>, ≥, <, ≤, =)
//   - Block posting vs post-then-review
//   - Escalation hours
//   - Expiry hours
//   - Approver rule (any_approver | specific_users | super_admin_only)
//   - Specific approvers (when rule = specific_users)
//   - Super admin bypass toggle
//
// Grouped by category for scannability. Collapsible cards per type.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import Toast from '../components/Toast'
import type { Page } from '../lib/types'

interface Props { onNav: (p: Page) => void }

interface ApprovalTypeRow {
  id: string
  code: string
  name: string
  category: string
  description: string | null
  icon: string | null
  color: string | null
}

interface ApprovalSettingRow {
  id: string
  approval_type_id: string
  threshold_type: 'any' | 'amount' | 'percentage' | 'quantity' | 'days' | 'never'
  threshold_value: number | null
  threshold_operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
  block_posting: boolean
  retain_on_reject: boolean
  escalation_hours: number
  expiry_hours: number
  approver_rule: 'any_approver' | 'specific_users' | 'super_admin_only'
  super_admin_bypass: boolean
  is_active: boolean
}

interface UserRow {
  id: string
  full_name: string
  email: string
  is_approver: boolean
  is_active: boolean
}

interface TypeApproverRow {
  approval_type_id: string
  user_id: string
}

const CATEGORY_LABELS: Record<string, string> = {
  voucher:   'Voucher Approvals',
  inventory: 'Inventory Controls',
  finance:   'Finance & Cash',
  hrm:       'HRM',
  other:     'System',
}

const CATEGORY_ORDER = ['voucher', 'finance', 'inventory', 'hrm', 'other']

const OP_LABELS: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' }

// Simple SVG icon set reused from other pages
const Icon = ({ name, size = 18, color = 'currentColor' }: { name: string; size?: number; color?: string }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  const paths: Record<string, React.ReactNode> = {
    package:       <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    percent:       <><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></>,
    dollarSign:    <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    creditCard:    <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    user:          <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    rotateCcw:     <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></>,
    fileText:      <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    trash2:        <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    alertTriangle: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    clock:         <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    chevronDown:   <polyline points="6 9 12 15 18 9"/>,
    chevronRight:  <polyline points="9 18 15 12 9 6"/>,
    save:          <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>,
    check:         <polyline points="20 6 9 17 4 12"/>,
  }
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

export default function ApprovalsSettings({ onNav }: Props) {
  void onNav
  const { user, isSuperAdmin } = useAuth()
  const [types, setTypes] = useState<ApprovalTypeRow[]>([])
  const [settings, setSettings] = useState<Record<string, ApprovalSettingRow>>({})
  const [users, setUsers] = useState<UserRow[]>([])
  const [typeApprovers, setTypeApprovers] = useState<TypeApproverRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [typesRes, settingsRes, usersRes, approversRes] = await Promise.all([
      supabase.from('approval_types').select('*').order('category').order('name'),
      supabase.from('approval_settings').select('*'),
      supabase.from('users').select('id, full_name, email, is_approver, is_active').eq('is_active', true).order('full_name'),
      supabase.from('approval_type_approvers').select('approval_type_id, user_id'),
    ])

    if (typesRes.error) {
      showToast('Failed to load approval types. Run migration 004.', 'error')
      setLoading(false)
      return
    }

    setTypes((typesRes.data || []) as ApprovalTypeRow[])

    const sMap: Record<string, ApprovalSettingRow> = {}
    for (const s of (settingsRes.data || []) as ApprovalSettingRow[]) {
      sMap[s.approval_type_id] = s
    }
    setSettings(sMap)
    setUsers((usersRes.data || []) as UserRow[])
    setTypeApprovers((approversRes.data || []) as TypeApproverRow[])
    setLoading(false)
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg); setToastType(type)
  }

  const updateSetting = (typeId: string, patch: Partial<ApprovalSettingRow>) => {
    setSettings(prev => ({ ...prev, [typeId]: { ...prev[typeId], ...patch } }))
  }

  const saveSetting = async (typeId: string) => {
    const s = settings[typeId]
    if (!s) return
    setSaving(typeId)

    const { error } = await supabase
      .from('approval_settings')
      .upsert({
        id: s.id,
        approval_type_id: typeId,
        threshold_type: s.threshold_type,
        threshold_value: s.threshold_type === 'any' || s.threshold_type === 'never' ? null : s.threshold_value,
        threshold_operator: s.threshold_operator,
        block_posting: s.block_posting,
        retain_on_reject: s.retain_on_reject,
        escalation_hours: s.escalation_hours,
        expiry_hours: s.expiry_hours,
        approver_rule: s.approver_rule,
        super_admin_bypass: s.super_admin_bypass,
        is_active: s.is_active,
      }, { onConflict: 'approval_type_id' })

    setSaving(null)
    if (error) {
      showToast(`Save failed: ${error.message}`, 'error')
    } else {
      showToast('Settings saved', 'success')
    }
  }

  const toggleApprover = async (typeId: string, userId: string) => {
    if (!isSuperAdmin()) {
      showToast('Only super admins can assign approvers', 'error'); return
    }
    const exists = typeApprovers.some(a => a.approval_type_id === typeId && a.user_id === userId)
    if (exists) {
      const { error } = await supabase
        .from('approval_type_approvers')
        .delete()
        .eq('approval_type_id', typeId)
        .eq('user_id', userId)
      if (error) return showToast(error.message, 'error')
      setTypeApprovers(prev => prev.filter(a => !(a.approval_type_id === typeId && a.user_id === userId)))
    } else {
      const { error } = await supabase
        .from('approval_type_approvers')
        .insert({ approval_type_id: typeId, user_id: userId })
      if (error) return showToast(error.message, 'error')
      setTypeApprovers(prev => [...prev, { approval_type_id: typeId, user_id: userId }])
    }
  }

  const toggleExpanded = (typeId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(typeId)) next.delete(typeId); else next.add(typeId)
      return next
    })
  }

  // Group types by category
  const byCategory: Record<string, ApprovalTypeRow[]> = {}
  for (const t of types) {
    (byCategory[t.category] ||= []).push(t)
  }

  const formatThresholdDisplay = (s: ApprovalSettingRow): string => {
    if (!s.is_active) return 'Inactive'
    if (s.threshold_type === 'never') return 'Never requires approval'
    if (s.threshold_type === 'any') return 'Always requires approval'
    const op = OP_LABELS[s.threshold_operator]
    const val = s.threshold_value
    if (s.threshold_type === 'amount') return `When amount ${op} TZS ${val?.toLocaleString()}`
    if (s.threshold_type === 'percentage') return `When % ${op} ${val}%`
    if (s.threshold_type === 'quantity') return `When qty ${op} ${val}`
    if (s.threshold_type === 'days') return `When days ${op} ${val}`
    return ''
  }

  // ─── Styles ─────────────────────────────────────────────────────────────
  const st = {
    page: { padding: 24, maxWidth: 1100, margin: '0 auto' } as React.CSSProperties,
    header: { marginBottom: 20 } as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700 } as React.CSSProperties,
    sub: { fontSize: 13, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,
    categoryHeader: { fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 1, margin: '28px 0 10px' } as React.CSSProperties,
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 8, overflow: 'hidden' } as React.CSSProperties,
    cardHeader: { padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' } as React.CSSProperties,
    cardIcon: (color: string) => ({ width: 36, height: 36, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as React.CSSProperties,
    cardTitle: { flex: 1, minWidth: 0 } as React.CSSProperties,
    cardName: { fontWeight: 600, fontSize: 14 } as React.CSSProperties,
    cardMeta: { fontSize: 11, color: 'var(--text3)', marginTop: 2 } as React.CSSProperties,
    toggle: (on: boolean) => ({ width: 40, height: 22, borderRadius: 11, background: on ? '#10b981' : 'var(--border)', position: 'relative' as const, cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }) as React.CSSProperties,
    toggleKnob: (on: boolean) => ({ position: 'absolute' as const, top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left .2s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }) as React.CSSProperties,
    cardBody: { padding: 16, borderTop: '1px solid var(--border)', background: 'var(--bg)' } as React.CSSProperties,
    fieldGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 14 } as React.CSSProperties,
    field: {} as React.CSSProperties,
    label: { fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6, display: 'block' } as React.CSSProperties,
    input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' as const } as React.CSSProperties,
    select: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' as const } as React.CSSProperties,
    row: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } as React.CSSProperties,
    checkbox: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' as const } as React.CSSProperties,
    approverPill: (selected: boolean) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: selected ? 'var(--accent)' : 'var(--surface)', color: selected ? '#000' : 'var(--text)', border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, fontSize: 12, cursor: 'pointer', transition: 'all .15s' }) as React.CSSProperties,
    footer: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' } as React.CSSProperties,
    btn: { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
    btnPrimary: { background: 'var(--accent)', color: '#000' } as React.CSSProperties,
  }

  if (loading) {
    return <div style={st.page}><div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>Loading approval configuration...</div></div>
  }

  return (
    <div style={st.page}>
      <div style={st.header}>
        <div style={st.title}>Approval Settings</div>
        <div style={st.sub}>Configure which actions require approval, by type, threshold, and approver.</div>
      </div>

      {!isSuperAdmin() && (
        <div style={{ padding: 12, background: '#f59e0b15', border: '1px solid #f59e0b40', borderRadius: 8, marginBottom: 20, fontSize: 13, color: 'var(--text2)' }}>
          <Icon name="alertTriangle" size={14} color="#f59e0b" />&nbsp;
          You can view these settings, but only super admins can edit them.
        </div>
      )}

      {CATEGORY_ORDER.map(cat => {
        const list = byCategory[cat]
        if (!list || list.length === 0) return null
        return (
          <div key={cat}>
            <div style={st.categoryHeader}>{CATEGORY_LABELS[cat] || cat}</div>
            {list.map(type => {
              const s = settings[type.id]
              if (!s) return null
              const isOpen = expanded.has(type.id)
              const assigned = typeApprovers.filter(a => a.approval_type_id === type.id).map(a => a.user_id)

              return (
                <div key={type.id} style={st.card}>
                  <div style={st.cardHeader} onClick={() => toggleExpanded(type.id)}>
                    <div style={st.cardIcon(type.color || '#6b7280')}>
                      <Icon name={type.icon || 'fileText'} size={18} color={type.color || '#6b7280'} />
                    </div>
                    <div style={st.cardTitle}>
                      <div style={st.cardName}>{type.name}</div>
                      <div style={st.cardMeta}>{formatThresholdDisplay(s)}</div>
                    </div>
                    <div
                      style={st.toggle(s.is_active)}
                      onClick={e => { e.stopPropagation(); updateSetting(type.id, { is_active: !s.is_active }); saveSetting(type.id) }}
                    >
                      <div style={st.toggleKnob(s.is_active)} />
                    </div>
                    <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={16} color="var(--text3)" />
                  </div>

                  {isOpen && (
                    <div style={st.cardBody}>
                      {type.description && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, fontStyle: 'italic' }}>
                          {type.description}
                        </div>
                      )}

                      <div style={st.fieldGrid}>
                        <div style={st.field}>
                          <label style={st.label}>Rule Type</label>
                          <select style={st.select} value={s.threshold_type}
                            onChange={e => updateSetting(type.id, { threshold_type: e.target.value as any })}>
                            <option value="never">Never require approval</option>
                            <option value="any">Always require approval</option>
                            <option value="amount">By amount (TZS)</option>
                            <option value="percentage">By percentage</option>
                            <option value="quantity">By quantity</option>
                            <option value="days">By days</option>
                          </select>
                        </div>

                        {s.threshold_type !== 'any' && s.threshold_type !== 'never' && (
                          <div style={st.field}>
                            <label style={st.label}>Threshold</label>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <select style={{ ...st.select, width: 80 }} value={s.threshold_operator}
                                onChange={e => updateSetting(type.id, { threshold_operator: e.target.value as any })}>
                                <option value="gt">&gt;</option>
                                <option value="gte">≥</option>
                                <option value="lt">&lt;</option>
                                <option value="lte">≤</option>
                                <option value="eq">=</option>
                              </select>
                              <input type="number" style={st.input} value={s.threshold_value ?? ''}
                                onChange={e => updateSetting(type.id, { threshold_value: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                placeholder={s.threshold_type === 'amount' ? 'e.g. 100000' : 'e.g. 10'} />
                            </div>
                          </div>
                        )}

                        <div style={st.field}>
                          <label style={st.label}>Who Can Approve</label>
                          <select style={st.select} value={s.approver_rule}
                            onChange={e => updateSetting(type.id, { approver_rule: e.target.value as any })}>
                            <option value="any_approver">Any user with approver flag</option>
                            <option value="specific_users">Only listed users (see below)</option>
                            <option value="super_admin_only">Super admins only</option>
                          </select>
                        </div>

                        <div style={st.field}>
                          <label style={st.label}>Escalation (hrs)</label>
                          <input type="number" style={st.input} value={s.escalation_hours}
                            onChange={e => updateSetting(type.id, { escalation_hours: parseInt(e.target.value) || 24 })} />
                        </div>

                        <div style={st.field}>
                          <label style={st.label}>Auto-expire after (hrs)</label>
                          <input type="number" style={st.input} value={s.expiry_hours}
                            onChange={e => updateSetting(type.id, { expiry_hours: parseInt(e.target.value) || 72 })} />
                        </div>

                        <div style={st.field}>
                          <label style={st.label}>Posting Behaviour</label>
                          <select style={st.select} value={s.block_posting ? 'block' : 'post'}
                            onChange={e => updateSetting(type.id, { block_posting: e.target.value === 'block' })}>
                            <option value="block">Block until approved</option>
                            <option value="post">Post then review</option>
                          </select>
                        </div>
                      </div>

                      <div style={st.row}>
                        <label style={st.checkbox}>
                          <input type="checkbox" checked={s.super_admin_bypass}
                            onChange={e => updateSetting(type.id, { super_admin_bypass: e.target.checked })} />
                          Super admins can bypass this approval (audit logged)
                        </label>
                      </div>
                      <div style={st.row}>
                        <label style={st.checkbox}>
                          <input type="checkbox" checked={s.retain_on_reject}
                            onChange={e => updateSetting(type.id, { retain_on_reject: e.target.checked })} />
                          Keep rejected vouchers as history (otherwise deleted)
                        </label>
                      </div>

                      {s.approver_rule === 'specific_users' && (
                        <div style={{ marginTop: 14 }}>
                          <label style={st.label}>Approvers for this type</label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {users.filter(u => u.is_approver).map(u => {
                              const selected = assigned.includes(u.id)
                              return (
                                <div key={u.id} style={st.approverPill(selected)}
                                  onClick={() => toggleApprover(type.id, u.id)}>
                                  {selected && <Icon name="check" size={12} />}
                                  {u.full_name}
                                </div>
                              )
                            })}
                            {users.filter(u => u.is_approver).length === 0 && (
                              <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
                                No users have the approver flag. Enable it in User Management.
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div style={st.footer}>
                        <button
                          style={{ ...st.btn, ...st.btnPrimary, opacity: saving === type.id ? 0.6 : 1 }}
                          onClick={() => saveSetting(type.id)}
                          disabled={saving === type.id || !isSuperAdmin()}>
                          <Icon name="save" size={14} />
                          {saving === type.id ? 'Saving…' : 'Save changes'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}

      {/* Avoid unused var warning */}
      <div style={{ display: 'none' }}>{user?.id}</div>
    </div>
  )
}
