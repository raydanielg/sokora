import type { Page } from '../lib/types'

export interface Shortcut {
  label: string
  icon: string
  page: Page
}

interface VoucherPageProps {
  title: string
  icon: string
  subtitle: string
  color: string
  children: React.ReactNode
  onPost: () => void
  onDraft?: () => void
  postLabel?: string
  // When true, the Post button is shown but cannot be clicked. The voucher
  // uses this to block posting until required fields (e.g. customer) are set.
  postDisabled?: boolean
  // Optional tooltip shown on the disabled button so the user understands why.
  postDisabledReason?: string
  journalNote?: string
  shortcuts?: Shortcut[]
  onNav?: (p: Page) => void
}

export default function VoucherPage({
  title, icon, subtitle, color, children,
  onPost, onDraft, postLabel = 'Post Voucher',
  postDisabled = false, postDisabledReason,
  journalNote,
  shortcuts, onNav
}: VoucherPageProps) {
  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={icon}/></svg></div>
          <div>
            <div className="page-title">{title}</div>
            <div className="page-sub">{subtitle}</div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={onDraft} style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>Save Draft</button>
          <button
            className="btn btn-primary"
            onClick={onPost}
            disabled={postDisabled}
            title={postDisabled ? postDisabledReason : undefined}
            style={postDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >{postLabel}</button>
        </div>
      </div>

      {shortcuts && shortcuts.length > 0 && onNav && (
        <div className="shortcut-bar">
          {shortcuts.map((s, i) => (
            <button key={i} className="shortcut-btn" onClick={() => onNav(s.page)}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d={s.icon}/></svg>
              {s.label}
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      )}

      {journalNote && (
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 20,
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span style={{ color: 'var(--accent)' }}>Auto-journal:</span> {journalNote}
        </div>
      )}

      {children}
    </div>
  )
}
