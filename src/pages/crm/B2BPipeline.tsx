// ============================================================================
// B2BPipeline.tsx
// B2B CRM main page: pipeline kanban (prospects), Customers and Lost tabs,
// stat tiles, add-prospect modal, and a slide-in detail drawer (B2BAccountPanel).
// UI + orchestration only; reads via useB2B, writes via b2bPost.
// ============================================================================

import { useState, useMemo } from 'react'
import type { Page } from '../../lib/types'
import { useAuth } from '../../lib/useAuth'
import { useB2B } from '../../lib/useB2B'
import * as b2b from '../../lib/b2bPost'
import { tzs } from '../../lib/utils'
import B2BAccountPanel from './B2BAccountPanel'
import {
  B2BAccount, B2BAccountType,
  PIPELINE_STAGES, STAGE_COLORS, STAGE_LABELS, ACCOUNT_TYPE_LABELS,
  SOURCE_LABELS, B2BSource, isProspect, isOverdue,
} from '../../lib/b2bTypes'

const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  const paths: Record<string, React.ReactNode> = {
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    dollarSign: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  }
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface Props { onNav?: (p: Page) => void; embedded?: boolean; onBack?: () => void }
type Tab = 'pipeline' | 'customers' | 'lost'

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''

export default function B2BPipeline({ embedded, onBack }: Props) {
  const { user } = useAuth()
  const actor: b2b.Actor = { id: user?.id || null, name: user?.full_name || null }
  const { accounts, loading, error, reload } = useB2B()

  const [tab, setTab] = useState<Tab>('pipeline')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, kind: 'success' | 'error' = 'success') => {
    setToast({ msg, kind }); setTimeout(() => setToast(null), 2600)
  }

  const selected = accounts.find(a => a.id === selectedId) || null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts.filter(a => !q || a.name.toLowerCase().includes(q) || (a.region || '').toLowerCase().includes(q))
  }, [accounts, search])

  const prospects = filtered.filter(isProspect)
  const customers = filtered.filter(a => a.stage === 'won' && !a.is_archived)
  const lost = filtered.filter(a => a.stage === 'lost' && !a.is_archived)
  const overdueCount = accounts.filter(isOverdue).length
  const pipelineValue = prospects.reduce((sum, a) => sum + (a.expected_monthly_value || 0), 0)

  const stats = [
    { label: 'Prospects', value: prospects.length, color: 'var(--accent)', icon: 'briefcase' },
    { label: 'Follow-ups Overdue', value: overdueCount, color: overdueCount > 0 ? '#ef4444' : 'var(--text2)', icon: 'alertCircle' },
    { label: 'Pipeline / mo', value: tzs(pipelineValue), color: '#3b82f6', icon: 'dollarSign' },
    { label: 'Customers Won', value: customers.length, color: '#10b981', icon: 'checkCircle' },
  ]

  const s = {
    page: { padding: embedded ? '4px 0 24px' : 24, maxWidth: 1600, margin: '0 auto' } as React.CSSProperties,
    head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12, flexWrap: 'wrap' as const },
    title: { fontFamily: 'var(--display)', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
    sub: { fontSize: 13, color: 'var(--text3)', marginTop: 2 },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 },
    tabs: { display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)' },
    tab: (on: boolean) => ({ padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: on ? 'var(--accent)' : 'var(--text2)', borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent', background: 'none', border: 'none' }) as React.CSSProperties,
    board: { display: 'flex', gap: 12, overflowX: 'auto' as const, paddingBottom: 8 },
    col: { minWidth: 240, flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 8 },
    colHead: (c: string) => ({ fontSize: 12, fontWeight: 700, color: c, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 2px' }) as React.CSSProperties,
    card: (od: boolean) => ({ background: 'var(--surface)', border: od ? '1px solid #ef444455' : '1px solid var(--border)', borderRadius: 10, padding: 12, cursor: 'pointer' }) as React.CSSProperties,
    input: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13 } as React.CSSProperties,
    chip: (c: string) => ({ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, color: c, background: c + '22' }) as React.CSSProperties,
    modalWrap: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
    drawerWrap: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 40, display: 'flex', justifyContent: 'flex-end' },
  }

  const Card = ({ a }: { a: B2BAccount }) => {
    const od = isOverdue(a)
    return (
      <div style={s.card(od)} onClick={() => setSelectedId(a.id)}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          {ACCOUNT_TYPE_LABELS[a.account_type]}{a.region ? ` · ${a.region}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          {a.expected_monthly_value > 0 && <span style={s.chip('#3b82f6')}>{tzs(a.expected_monthly_value)}/mo</span>}
          {a.next_action && (
            <span style={{ fontSize: 10.5, color: od ? '#ef4444' : 'var(--text3)', display: 'flex', gap: 3, alignItems: 'center' }}>
              <Icon name="clock" size={11} color={od ? '#ef4444' : 'var(--text3)'} />
              {a.next_action_date ? fmtDate(a.next_action_date) : ''} {a.next_action.slice(0, 24)}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.head}>
        <div>
          {onBack && (
            <button className="btn-ghost" style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }} onClick={onBack}>
              <Icon name="arrowLeft" size={14} /> Wholesale customers
            </button>
          )}
          <div style={s.title}><Icon name="briefcase" size={24} color="var(--accent)" /> B2B CRM</div>
          <div style={s.sub}>Pharmacies, hospitals, clinics, midwife practices, resellers and corporate accounts.</div>
        </div>
        <button className="btn-primary" style={{ padding: '10px 16px', borderRadius: 9, display: 'flex', gap: 8, alignItems: 'center' }} onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={18} /> New prospect
        </button>
      </div>

      <div style={s.statsGrid}>
        {stats.map(st => (
          <div key={st.label} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: st.color }}>{st.value}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{st.label}</div>
            </div>
            <Icon name={st.icon} size={22} color={st.color} />
          </div>
        ))}
      </div>

      <div style={s.tabs}>
        <button style={s.tab(tab === 'pipeline')} onClick={() => setTab('pipeline')}>Pipeline ({prospects.length})</button>
        <button style={s.tab(tab === 'customers')} onClick={() => setTab('customers')}>Customers ({customers.length})</button>
        <button style={s.tab(tab === 'lost')} onClick={() => setTab('lost')}>Lost ({lost.length})</button>
        <div style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Icon name="search" size={15} color="var(--text3)" style={{ position: 'absolute', left: 9 }} />
          <input style={{ ...s.input, paddingLeft: 30, width: 200 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text3)', padding: 40, textAlign: 'center' }}>Loading…</div>}
      {error && !loading && <div className="card" style={{ color: '#ef4444' }}>Failed to load: {error}. Make sure migration 027_b2b_crm.sql has been run.</div>}

      {!loading && !error && tab === 'pipeline' && (
        <div style={s.board}>
          {PIPELINE_STAGES.map(st => {
            const items = prospects.filter(a => a.stage === st.key)
            return (
              <div key={st.key} style={s.col}>
                <div style={s.colHead(st.color)}>
                  <span>{st.label}</span>
                  <span style={{ background: st.color + '22', borderRadius: 99, padding: '1px 8px' }}>{items.length}</span>
                </div>
                {items.map(a => <Card key={a.id} a={a} />)}
                {items.length === 0 && <div style={{ fontSize: 11, color: 'var(--text3)', padding: 8, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>Empty</div>}
              </div>
            )
          })}
        </div>
      )}

      {!loading && !error && tab !== 'pipeline' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {(tab === 'customers' ? customers : lost).map(a => (
            <div key={a.id} style={s.card(false)} onClick={() => setSelectedId(a.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{a.name}</div>
                <span style={s.chip(STAGE_COLORS[a.stage])}>{STAGE_LABELS[a.stage]}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{ACCOUNT_TYPE_LABELS[a.account_type]}{a.region ? ` · ${a.region}` : ''}</div>
              {a.stage === 'lost' && a.lost_reason && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{a.lost_reason}</div>}
              {a.stage === 'won' && a.expected_monthly_value > 0 && <div style={{ fontSize: 11, color: '#10b981', marginTop: 6 }}>{tzs(a.expected_monthly_value)}/mo</div>}
            </div>
          ))}
          {(tab === 'customers' ? customers : lost).length === 0 && <div style={{ color: 'var(--text3)', padding: 20 }}>Nothing here yet.</div>}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div style={s.drawerWrap} onClick={() => setSelectedId(null)}>
          <div onClick={e => e.stopPropagation()} style={{ height: '100%' }}>
            <B2BAccountPanel account={selected} actor={actor} onClose={() => setSelectedId(null)} onReload={reload} showToast={showToast} />
          </div>
        </div>
      )}

      {/* Add prospect modal */}
      {showAdd && <AddProspectModal actor={actor} s={s} onClose={() => setShowAdd(false)} onSaved={(id) => { setShowAdd(false); reload(); setSelectedId(id); showToast('Prospect added') }} onError={(m) => showToast(m, 'error')} />}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: toast.kind === 'error' ? '#ef4444' : 'var(--accent)', color: '#fff', padding: '10px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, zIndex: 60 }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Add-prospect modal (kept in-file: it is only ever used by this page) ─────
function AddProspectModal({ actor, s, onClose, onSaved, onError }: {
  actor: b2b.Actor
  s: any
  onClose: () => void
  onSaved: (id: string) => void
  onError: (m: string) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<B2BAccountType>('pharmacy')
  const [region, setRegion] = useState('')
  const [source, setSource] = useState<B2BSource | ''>('')
  const [value, setValue] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const acc = await b2b.createAccount({
        name, account_type: type, region, contact_person: contact, whatsapp: phone,
        source: (source || undefined) as B2BSource | undefined,
        expected_monthly_value: parseFloat(value) || 0,
      }, actor)
      onSaved(acc.id)
    } catch (e: any) { onError(e.message || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div style={s.modalWrap} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '94vw', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--display)' }}>New B2B prospect</div>
          <button className="btn-ghost" style={{ padding: 6, borderRadius: 8 }} onClick={onClose}><Icon name="x" /></button>
        </div>
        <input style={s.input} placeholder="Organization name *" value={name} onChange={e => setName(e.target.value)} />
        <select style={s.input} value={type} onChange={e => setType(e.target.value as B2BAccountType)}>
          {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={s.input} placeholder="Region (e.g. Dar es Salaam)" value={region} onChange={e => setRegion(e.target.value)} />
          <select style={s.input} value={source} onChange={e => setSource(e.target.value as B2BSource | '')}>
            <option value="">Source…</option>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={s.input} placeholder="Contact person" value={contact} onChange={e => setContact(e.target.value)} />
          <input style={s.input} placeholder="Phone / WhatsApp" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <input style={s.input} placeholder="Expected value per month (TZS)" value={value} onChange={e => setValue(e.target.value)} inputMode="numeric" />
        <button className="btn-primary" disabled={saving || !name.trim()} style={{ padding: '11px', borderRadius: 9, marginTop: 4 }} onClick={save}>
          {saving ? 'Saving…' : 'Add prospect'}
        </button>
      </div>
    </div>
  )
}
