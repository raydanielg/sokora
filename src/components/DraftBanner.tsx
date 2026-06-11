// ─── Draft Banner ──────────────────────────────────────────────────────────
// Small strip rendered at the top of a voucher when a saved draft exists.
// Offers the user two explicit actions: Resume or Discard. Never
// auto-resumes — we don't want to silently overwrite a user's fresh start
// with stale data.
// ───────────────────────────────────────────────────────────────────────────

import { formatDraftAge } from '../lib/useVoucherDraft'

interface Props {
  // Milliseconds since the draft was saved. Rendered as "X minutes ago".
  draftAgeMs: number
  // Called when the user clicks Resume. Parent should apply the draft state
  // to its form, then call the hook's acknowledgeResume() to hide the banner.
  onResume: () => void
  // Called when the user clicks Discard. Parent should call the hook's
  // discardDraft() to both hide the banner and clear localStorage.
  onDiscard: () => void
}

export default function DraftBanner({ draftAgeMs, onResume, onDiscard }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 14, padding: '10px 14px', marginBottom: 14,
      background: 'rgba(234,179,8,.08)',
      border: '1px solid rgba(234,179,8,.35)',
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <svg width="18" height="18" fill="none" stroke="var(--yellow)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            You have an unsaved draft
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            Saved {formatDraftAge(draftAgeMs)}. Resume to continue where you left off, or discard to start fresh.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={onDiscard}
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--text3)' }}
        >
          Discard
        </button>
        <button
          onClick={onResume}
          className="btn btn-primary btn-sm"
          style={{ background: 'var(--yellow)', color: '#000', border: 'none' }}
        >
          Resume Draft
        </button>
      </div>
    </div>
  )
}
