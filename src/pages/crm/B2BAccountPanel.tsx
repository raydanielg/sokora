// ============================================================================
// B2BAccountPanel.tsx
// Detail drawer for a single B2B account. Split out of B2BPipeline.tsx to keep
// the page lean. UI + local form state only; every write goes through b2bPost.
// ============================================================================

import { useState } from 'react'
import * as b2b from '../../lib/b2bPost'
import type { Actor } from '../../lib/b2bPost'
import {
  B2BAccount, B2BActivityType,
  STAGE_LABELS, STAGE_COLORS, PIPELINE_STAGES, ACCOUNT_TYPE_LABELS,
  ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ICONS, LOSS_REASONS, isOverdue,
} from '../../lib/b2bTypes'
import { tzs } from '../../lib/utils'

const Icon = ({ name, size = 16, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  const paths: Record<string, React.ReactNode> = {
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    trash2: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    messageCircle: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    mapPin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
    package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    slash: <><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
  }
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface Props {
  account: B2BAccount
  actor: Actor
  onClose: () => void
  onReload: () => void
  showToast: (msg: string, kind?: 'success' | 'error') => void
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''

export default function B2BAccountPanel({ account, actor, onClose, onReload, showToast }: Props) {
  const [busy, setBusy] = useState(false)
  const [naText, setNaText] = useState(account.next_action || '')
  const [naDate, setNaDate] = useState(account.next_action_date || '')
  const [noteText, setNoteText] = useState('')
  const [showAddContact, setShowAddContact] = useState(false)
  const [cName, setCName] = useState(''); const [cRole, setCRole] = useState(''); const [cPhone, setCPhone] = useState('')
  const [showLost, setShowLost] = useState(false)

  const run = async (fn: () => Promise<void>, ok: string) => {
    if (busy) return
    setBusy(true)
    try { await fn(); onReload(); showToast(ok) }
    catch (e: any) { showToast(e.message || 'Failed', 'error') }
    finally { setBusy(false) }
  }

  const overdue = isOverdue(account)

  const s = {
    panel: { width: 420, maxWidth: '92vw', background: 'var(--surface)', borderLeft: '1px solid var(--border)', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' } as React.CSSProperties,
    head: { padding: 18, borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, background: 'var(--surface)', zIndex: 2 },
    body: { padding: 18, display: 'flex', flexDirection: 'column' as const, gap: 18 },
    section: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
    secTitle: { fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: '.6px' },
    label: { fontSize: 11, color: 'var(--text3)' },
    input: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13 } as React.CSSProperties,
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
    chip: (c: string) => ({ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, color: c, background: c + '22' }) as React.CSSProperties,
  }

  const actBtns: { t: B2BActivityType }[] = [
    { t: 'call' }, { t: 'whatsapp' }, { t: 'visit' }, { t: 'sample' }, { t: 'quote' }, { t: 'note' },
  ]

  return (
    <div style={s.panel}>
      <div style={s.head}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--display)' }}>{account.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              {ACCOUNT_TYPE_LABELS[account.account_type]}{account.region ? ` · ${account.region}` : ''}
            </div>
          </div>
          <button className="btn-ghost" style={{ padding: 6, borderRadius: 8 }} onClick={onClose}><Icon name="x" /></button>
        </div>
        <div style={{ ...s.row, marginTop: 10 }}>
          <span style={s.chip(STAGE_COLORS[account.stage])}>{STAGE_LABELS[account.stage]}</span>
          {account.customer_id && <span style={s.chip('#10b981')}>Customer linked</span>}
          {overdue && <span style={s.chip('#ef4444')}>Follow-up overdue</span>}
          {account.owner_name && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Owner: {account.owner_name}</span>}
        </div>
      </div>

      <div style={s.body}>
        {/* Stage mover */}
        <div style={s.section}>
          <div style={s.secTitle}>Pipeline stage</div>
          <div style={s.row}>
            {PIPELINE_STAGES.map(st => (
              <button key={st.key} disabled={busy || account.stage === st.key}
                onClick={() => run(() => b2b.updateStage(account, st.key, actor), `Moved to ${st.label}`)}
                style={{ ...s.chip(st.color), cursor: 'pointer', border: account.stage === st.key ? `1px solid ${st.color}` : '1px solid transparent', opacity: account.stage === st.key ? 1 : 0.7 }}>
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Next action */}
        <div style={s.section}>
          <div style={s.secTitle}>Next action</div>
          <input style={s.input} placeholder="e.g. Send proforma, call procurement" value={naText} onChange={e => setNaText(e.target.value)} />
          <div style={s.row}>
            <input type="date" style={{ ...s.input, flex: 1 }} value={naDate} onChange={e => setNaDate(e.target.value)} />
            <button className="btn-primary" disabled={busy} style={{ padding: '8px 14px', borderRadius: 8 }}
              onClick={() => run(() => b2b.setNextAction(account.id, naText, naDate || null), 'Next action saved')}>Save</button>
          </div>
        </div>

        {/* Log activity */}
        <div style={s.section}>
          <div style={s.secTitle}>Log interaction</div>
          <div style={s.row}>
            {actBtns.map(({ t }) => (
              <button key={t} className="btn-ghost" disabled={busy} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}
                onClick={() => run(() => b2b.logActivity({ account_id: account.id, type: t, note: noteText || null }, actor).then(() => { setNoteText('') }), `Logged: ${ACTIVITY_TYPE_LABELS[t]}`)}>
                <Icon name={ACTIVITY_TYPE_ICONS[t]} size={14} /> {ACTIVITY_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <input style={s.input} placeholder="Optional note for this interaction" value={noteText} onChange={e => setNoteText(e.target.value)} />
        </div>

        {/* Contacts */}
        <div style={s.section}>
          <div style={{ ...s.row, justifyContent: 'space-between' }}>
            <div style={s.secTitle}>Contacts</div>
            <button className="btn-ghost" style={{ padding: '4px 8px', borderRadius: 8, fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }} onClick={() => setShowAddContact(v => !v)}>
              <Icon name="userPlus" size={14} /> Add
            </button>
          </div>
          {(account.contacts || []).map(c => (
            <div key={c.id} className="card-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {c.is_primary && <Icon name="star" size={12} color="var(--accent)" />}{c.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{[c.role, c.phone || c.whatsapp].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <button className="btn-ghost" style={{ padding: 6, borderRadius: 8 }} disabled={busy}
                onClick={() => run(() => b2b.deleteContact(c.id), 'Contact removed')}><Icon name="trash2" size={14} /></button>
            </div>
          ))}
          {(account.contacts || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>No contacts yet.</div>}
          {showAddContact && (
            <div className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input style={s.input} placeholder="Name" value={cName} onChange={e => setCName(e.target.value)} />
              <input style={s.input} placeholder="Role (e.g. procurement, pharmacist)" value={cRole} onChange={e => setCRole(e.target.value)} />
              <input style={s.input} placeholder="Phone / WhatsApp" value={cPhone} onChange={e => setCPhone(e.target.value)} />
              <button className="btn-primary" disabled={busy || !cName.trim()} style={{ padding: '8px', borderRadius: 8 }}
                onClick={() => run(async () => { await b2b.addContact({ account_id: account.id, name: cName, role: cRole, phone: cPhone, is_primary: (account.contacts || []).length === 0 }) }, 'Contact added').then(() => { setCName(''); setCRole(''); setCPhone(''); setShowAddContact(false) })}>
                Save contact
              </button>
            </div>
          )}
        </div>

        {/* Convert / lose / archive */}
        <div style={s.section}>
          <div style={s.secTitle}>Outcome</div>
          {!account.customer_id ? (
            <button className="btn-primary" disabled={busy} style={{ padding: '10px', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}
              onClick={() => run(async () => { const r = await b2b.convertToCustomer(account, actor); showToast(r.alreadyLinked ? 'Already a customer' : `Converted — ${r.customerNumber}`) }, 'Converted to customer')}>
              <Icon name="check" /> Convert to wholesale customer
            </button>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Linked to a wholesale customer. First order date: {fmtDate(account.last_order_date)}.</div>
          )}
          {!showLost ? (
            <button className="btn-ghost" disabled={busy} style={{ padding: '8px', borderRadius: 8, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', color: '#ef4444' }} onClick={() => setShowLost(true)}>
              <Icon name="slash" size={14} /> Mark as lost
            </button>
          ) : (
            <div className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={s.label}>Reason (required, so you learn why):</div>
              {LOSS_REASONS.map(r => (
                <button key={r} className="btn-ghost" disabled={busy} style={{ padding: '7px 10px', borderRadius: 8, fontSize: 12, textAlign: 'left' }}
                  onClick={() => run(() => b2b.markLost(account, r, actor), 'Marked lost').then(() => setShowLost(false))}>{r}</button>
              ))}
              <button className="btn-ghost" style={{ padding: '6px', borderRadius: 8, fontSize: 12 }} onClick={() => setShowLost(false)}>Cancel</button>
            </div>
          )}
          <button className="btn-ghost" disabled={busy} style={{ padding: '8px', borderRadius: 8, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
            onClick={() => run(() => b2b.archiveAccount(account.id, !account.is_archived), account.is_archived ? 'Unarchived' : 'Archived')}>
            <Icon name="archive" size={14} /> {account.is_archived ? 'Unarchive' : 'Archive'}
          </button>
        </div>

        {/* Snapshot */}
        <div style={s.section}>
          <div style={s.secTitle}>Details</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
            {account.expected_monthly_value > 0 && <div>Expected / month: <b style={{ color: 'var(--text)' }}>{tzs(account.expected_monthly_value)}</b></div>}
            {account.payment_terms && <div>Terms: {account.payment_terms}</div>}
            {account.tin_number && <div>TIN: {account.tin_number}</div>}
            <div>Last contacted: {fmtDate(account.last_contacted_at)}</div>
            {account.lost_reason && <div style={{ color: '#ef4444' }}>Lost: {account.lost_reason}</div>}
          </div>
        </div>

        {/* Timeline */}
        <div style={s.section}>
          <div style={s.secTitle}>Timeline</div>
          {(account.activities || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>No activity logged yet.</div>}
          {(account.activities || []).map(a => (
            <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ marginTop: 2, color: 'var(--text3)' }}><Icon name={ACTIVITY_TYPE_ICONS[a.type]} size={14} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5 }}><b>{ACTIVITY_TYPE_LABELS[a.type]}</b>{a.note ? ` — ${a.note}` : ''}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{fmtDateTime(a.occurred_at)}{a.performed_by_name ? ` · ${a.performed_by_name}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
