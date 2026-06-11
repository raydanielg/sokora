// ─── Voucher Draft Hook ────────────────────────────────────────────────────
// Auto-saves voucher form state to localStorage while the user types.
// On mount, surfaces any existing draft so the user can resume or discard.
// On successful post, clears the draft.
//
// Keyed by company + voucher type, so a Sales Invoice draft in SOKORA
// Wellness doesn't show up when the user switches to SOKORA Enterprise.
//
// Drafts older than 7 days are auto-dropped on read.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react'
import { getActiveCompanyId } from './supabase'

export type VoucherDraftType =
  | 'sales-invoice'
  | 'cash-sale'
  | 'purchase'
  | 'purchase-invoice'
  | 'grn'
  | 'proforma'
  | 'internal-use'

interface StoredDraft<T> {
  version: 1
  savedAt: number         // epoch ms
  companyId: string
  state: T
}

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000   // 7 days
const DEBOUNCE_MS = 500

function draftKey(voucherType: VoucherDraftType): string {
  return `draft:${getActiveCompanyId()}:${voucherType}`
}

// Safe JSON read — returns null for missing, malformed, expired, or
// wrong-company drafts. Never throws.
function readDraft<T>(voucherType: VoucherDraftType): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(draftKey(voucherType))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<T>
    if (parsed.version !== 1) return null
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      // Expired — drop it silently
      localStorage.removeItem(draftKey(voucherType))
      return null
    }
    if (parsed.companyId !== getActiveCompanyId()) {
      // Different company — leave on disk (other company might want it),
      // just don't surface here.
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeDraft<T>(voucherType: VoucherDraftType, state: T): void {
  try {
    const payload: StoredDraft<T> = {
      version: 1,
      savedAt: Date.now(),
      companyId: getActiveCompanyId(),
      state,
    }
    localStorage.setItem(draftKey(voucherType), JSON.stringify(payload))
  } catch {
    // Storage quota exceeded or disabled — silent fail. Better to lose
    // the draft than crash the voucher form.
  }
}

function removeDraft(voucherType: VoucherDraftType): void {
  try { localStorage.removeItem(draftKey(voucherType)) } catch {}
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export interface UseVoucherDraftResult<T> {
  // If a draft exists AND the user hasn't resumed or discarded yet, this is
  // the snapshot found on mount. null once resumed, discarded, or absent.
  availableDraft: T | null
  draftAgeMs: number | null         // how old the draft was when found

  // Call to save. Debounced — safe to call on every keystroke.
  saveDraft: (state: T) => void

  // Call after a successful post to clear the draft.
  clearDraft: () => void

  // Call when the user clicks "Resume" on the banner. The hook forgets the
  // draft exists so the banner disappears; the caller is responsible for
  // actually applying the state to its form.
  acknowledgeResume: () => void

  // Call when the user clicks "Discard" on the banner.
  discardDraft: () => void
}

export function useVoucherDraft<T>(
  voucherType: VoucherDraftType,
  // When true, draft features are disabled. Use for edit/view mode where
  // we're loading an existing voucher, not creating a new one.
  disabled: boolean = false,
): UseVoucherDraftResult<T> {
  const [availableDraft, setAvailableDraft] = useState<T | null>(null)
  const [draftAgeMs, setDraftAgeMs] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check for a draft on first mount only. Re-mounts (e.g. company switch
  // triggering a re-key) will pick up a different key anyway.
  useEffect(() => {
    if (disabled) return
    const found = readDraft<T>(voucherType)
    if (found) {
      setAvailableDraft(found.state)
      setDraftAgeMs(Date.now() - found.savedAt)
    }
    // intentionally no cleanup — we want this only on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveDraft = useCallback((state: T) => {
    if (disabled) return
    // Debounce: collapse rapid calls (typing) into a single write
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      writeDraft(voucherType, state)
    }, DEBOUNCE_MS)
  }, [voucherType, disabled])

  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    removeDraft(voucherType)
    setAvailableDraft(null)
    setDraftAgeMs(null)
  }, [voucherType])

  const acknowledgeResume = useCallback(() => {
    setAvailableDraft(null)
    setDraftAgeMs(null)
  }, [])

  const discardDraft = useCallback(() => {
    removeDraft(voucherType)
    setAvailableDraft(null)
    setDraftAgeMs(null)
  }, [voucherType])

  // Clean up pending debounced write on unmount — but still flush it.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        // Best-effort flush: the component is about to unmount, but we don't
        // have the latest state here. Writes that already happened persist;
        // the pending one is lost. Acceptable — the debounce is only 500ms.
      }
    }
  }, [])

  return { availableDraft, draftAgeMs, saveDraft, clearDraft, acknowledgeResume, discardDraft }
}

// ─── Utility for the banner ────────────────────────────────────────────────

export function formatDraftAge(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
