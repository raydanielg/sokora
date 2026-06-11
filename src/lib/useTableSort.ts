// ════════════════════════════════════════════════════════════════════════════
// useTableSort.ts
//
// Client-side multi-column sort hook with localStorage persistence.
//
// Why a hook (rather than just a utility function):
//   • State for the active sort lives in the page; the hook owns it.
//   • Sort state persists in localStorage so Brenda's last sort survives
//     navigation away and page reloads.
//   • A page declares the storage key so different tables don't collide.
//
// Behaviour:
//   • Click a column header → primary sort by that column, ascending.
//     If already primary and ascending → flip to descending.
//     If already primary and descending → clear sort on that column.
//   • Shift-click → add (or update) a secondary sort. Multiple shift-clicks
//     build up sort priorities (1st, 2nd, 3rd, etc.).
//   • NULL/undefined values sort to the bottom regardless of direction.
//
// Scale assumption: client-side. Holds the full list in memory and sorts
// in the browser. Fine up to ~10,000 rows. The sort function and the hook
// are decoupled so a future server-side migration is a single-file refactor.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react'

export type SortDirection = 'asc' | 'desc'

export interface SortSpec {
  key: string                  // matches the column key passed by the table
  direction: SortDirection
}

/** Accessor: given a row, return the value to compare on for a given key. */
export type SortAccessor<Row> = (row: Row, key: string) => unknown

interface UseTableSortOptions<Row> {
  /** localStorage key for persistence. Use a stable namespaced string like
   *  `sokora.customers.sort.cash`. Set to undefined to disable persistence. */
  storageKey?: string
  /** Default sort applied when no persisted state exists. */
  defaultSort?: SortSpec[]
  /** How to extract comparable values from a row. */
  accessor: SortAccessor<Row>
}

/**
 * useTableSort — owns sort state and exposes a sorted view of the rows.
 *
 * Returns:
 *   • `sorted`        the sorted array
 *   • `sortSpecs`     the current sort priority list (1st, 2nd, 3rd, etc.)
 *   • `onHeaderClick` handler to wire onto column header `<th>` elements
 *   • `getSortIndex`  for showing the 1/2/3 badge on the header
 *   • `getSortDir`    for showing the arrow direction
 */
export function useTableSort<Row>(
  rows: Row[],
  options: UseTableSortOptions<Row>
) {
  const { storageKey, defaultSort = [], accessor } = options

  // Initialise from localStorage if available, else fall back to default
  const [sortSpecs, setSortSpecs] = useState<SortSpec[]>(() => {
    if (typeof window === 'undefined') return defaultSort
    if (!storageKey) return defaultSort
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return defaultSort
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every(isValidSpec)) {
        return parsed as SortSpec[]
      }
    } catch {
      // ignore malformed localStorage; fall through to default
    }
    return defaultSort
  })

  // Persist when sortSpecs change
  useEffect(() => {
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(sortSpecs))
    } catch {
      // localStorage may be unavailable (private mode, full, etc.) — silently ignore
    }
  }, [storageKey, sortSpecs])

  const onHeaderClick = useCallback(
    (key: string, event?: { shiftKey?: boolean }) => {
      const isShift = event?.shiftKey ?? false
      setSortSpecs(prev => updateSortSpecs(prev, key, isShift))
    },
    []
  )

  const getSortIndex = useCallback(
    (key: string): number | null => {
      const idx = sortSpecs.findIndex(s => s.key === key)
      return idx === -1 ? null : idx + 1
    },
    [sortSpecs]
  )

  const getSortDir = useCallback(
    (key: string): SortDirection | null => {
      return sortSpecs.find(s => s.key === key)?.direction ?? null
    },
    [sortSpecs]
  )

  const sorted = useMemo(() => {
    if (sortSpecs.length === 0) return rows
    return applySort(rows, sortSpecs, accessor)
  }, [rows, sortSpecs, accessor])

  const clearSort = useCallback(() => setSortSpecs([]), [])

  return { sorted, sortSpecs, onHeaderClick, getSortIndex, getSortDir, clearSort }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function isValidSpec(x: unknown): x is SortSpec {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.key === 'string' && (o.direction === 'asc' || o.direction === 'desc')
}

/**
 * Updates the sort spec list when a header is clicked.
 *   single-click on already-primary key:  asc → desc → cleared
 *   single-click on new key:              becomes the only sort, ascending
 *   shift-click on existing key:          flips its direction (keeps position)
 *   shift-click on new key:               appended to end of priority list
 */
export function updateSortSpecs(
  prev: SortSpec[],
  key: string,
  shift: boolean
): SortSpec[] {
  const existing = prev.findIndex(s => s.key === key)

  if (!shift) {
    // Single click: only one active sort at a time
    if (existing === -1) {
      return [{ key, direction: 'asc' }]
    }
    const current = prev[existing]
    if (current.direction === 'asc') {
      return [{ key, direction: 'desc' }]
    }
    // already descending → clear
    return []
  }

  // Shift click: multi-sort
  if (existing === -1) {
    return [...prev, { key, direction: 'asc' }]
  }
  const updated = [...prev]
  const current = updated[existing]
  if (current.direction === 'asc') {
    updated[existing] = { key, direction: 'desc' }
    return updated
  }
  // already descending → remove this column from the sort
  updated.splice(existing, 1)
  return updated
}

/**
 * applySort — pure sort function. Stable. NULL/undefined sort to the bottom
 * regardless of direction. Strings compared case-insensitively.
 * Dates as ISO strings compare correctly lexicographically.
 */
export function applySort<Row>(
  rows: Row[],
  specs: SortSpec[],
  accessor: SortAccessor<Row>
): Row[] {
  if (specs.length === 0) return rows
  const indexed = rows.map((row, idx) => ({ row, idx }))
  indexed.sort((a, b) => {
    for (const spec of specs) {
      const av = accessor(a.row, spec.key)
      const bv = accessor(b.row, spec.key)
      const cmp = compareValues(av, bv)
      if (cmp !== 0) return spec.direction === 'asc' ? cmp : -cmp
    }
    // tie-break on original index for stability
    return a.idx - b.idx
  })
  return indexed.map(x => x.row)
}

function compareValues(a: unknown, b: unknown): number {
  const aIsNull = a === null || a === undefined || a === ''
  const bIsNull = b === null || b === undefined || b === ''
  if (aIsNull && bIsNull) return 0
  if (aIsNull) return 1      // NULLs always sort to bottom
  if (bIsNull) return -1

  // Numbers
  if (typeof a === 'number' && typeof b === 'number') {
    if (isNaN(a) && isNaN(b)) return 0
    if (isNaN(a)) return 1
    if (isNaN(b)) return -1
    return a - b
  }

  // Booleans
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b ? 0 : a ? 1 : -1
  }

  // Strings (case-insensitive, locale-aware). Also handles ISO date strings
  // correctly since ISO date strings sort lexicographically.
  const as = String(a).toLowerCase()
  const bs = String(b).toLowerCase()
  return as.localeCompare(bs)
}
