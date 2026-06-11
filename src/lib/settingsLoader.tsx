// ─── Settings Loader & Provider ────────────────────────────────────────────
// Single source of truth for app-wide settings. Runs once on app boot
// (after login), fetches every setting key in parallel from Supabase,
// merges with defaults, and exposes via React Context.
//
// Why this exists: before, every settings page fetched its own slice,
// applied its own DOM mutations, and the app's startup had no knowledge
// of what theme the user wanted. Refreshing on any page outside Display
// Settings lost the theme. This file fixes that by loading everything
// at the App level so the very first render already has the right theme.
// ───────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from './supabase'
import {
  AllSettings, DEFAULT_ALL_SETTINGS, SETTING_KEYS,
  DEFAULT_COMPANY, DEFAULT_NUMBERING, DEFAULT_TAX, DEFAULT_NOTIFICATIONS,
  DEFAULT_SECURITY, DEFAULT_BACKUP, DEFAULT_REGIONAL, DEFAULT_DISPLAY,
} from './settingsDefaults'

// ─── Theme definitions (co-located so the loader can apply on boot) ────────
// These CSS var maps must match the THEMES object in DisplaySettings.tsx.
// Keeping them here too means we can apply the theme BEFORE DisplaySettings
// is ever rendered — fixes the "refresh drops back to default" bug.

export const THEME_VARS: Record<string, Record<string, string>> = {
  midnight: {
    '--bg': '#0a0b0f', '--surface': '#111318', '--surface2': '#181b22', '--surface3': '#1e2129',
    '--border': 'rgba(255,255,255,0.07)', '--border2': 'rgba(255,255,255,0.13)',
    '--accent': '#d4874a', '--accent2': '#b86d32', '--accent-dim': 'rgba(212,135,74,0.12)',
    '--text': '#e8eaf0', '--text2': '#9aa0b0', '--text3': '#5a6070',
  },
  sokora: {
    '--bg': '#0f1419', '--surface': '#1a2027', '--surface2': '#232b33', '--surface3': '#2c353f',
    '--border': 'rgba(133,194,190,0.12)', '--border2': 'rgba(133,194,190,0.22)',
    '--accent': '#85c2be', '--accent2': '#6ba8a4', '--accent-dim': 'rgba(133,194,190,0.12)',
    '--text': '#e8eaf0', '--text2': '#9aa0b0', '--text3': '#5a6070',
  },
  accountant: {
    '--bg': '#0d1117', '--surface': '#161b22', '--surface2': '#1c2128', '--surface3': '#22272e',
    '--border': 'rgba(48,54,61,0.8)', '--border2': 'rgba(48,54,61,1)',
    '--accent': '#58a6ff', '--accent2': '#388bfd', '--accent-dim': 'rgba(88,166,255,0.12)',
    '--text': '#c9d1d9', '--text2': '#8b949e', '--text3': '#6e7681',
  },
  obsidian: {
    '--bg': '#000000', '--surface': '#0d0d0d', '--surface2': '#171717', '--surface3': '#1f1f1f',
    '--border': 'rgba(255,255,255,0.06)', '--border2': 'rgba(255,255,255,0.12)',
    '--accent': '#a855f7', '--accent2': '#9333ea', '--accent-dim': 'rgba(168,85,247,0.12)',
    '--text': '#fafafa', '--text2': '#a1a1aa', '--text3': '#71717a',
  },
}

// ─── Apply functions (pure DOM mutations, callable from anywhere) ──────────

export function applyTheme(themeKey: string) {
  const theme = THEME_VARS[themeKey] || THEME_VARS.midnight
  Object.entries(theme).forEach(([k, v]) => document.documentElement.style.setProperty(k, v))
}

export function applyFontSize(size: number) {
  document.documentElement.style.fontSize = `${size}px`
}

export function applyBorderRadius(r: number) {
  document.documentElement.style.setProperty('--r', `${r}px`)
  document.documentElement.style.setProperty('--rl', `${r + 6}px`)
}

export function applyDisplaySettings(d: typeof DEFAULT_DISPLAY) {
  applyTheme(d.theme)
  applyFontSize(d.font_size)
  applyBorderRadius(d.border_radius)
}

// ─── Core loader ────────────────────────────────────────────────────────────
// Fetches all keys in one round-trip. Falls back silently to defaults for
// any key that doesn't exist yet in system_settings.

export async function loadAllSettings(): Promise<AllSettings> {
  const keys = [
    SETTING_KEYS.COMPANY_FINANCE,
    SETTING_KEYS.NUMBERING,
    SETTING_KEYS.TAX,
    SETTING_KEYS.NOTIFICATIONS,
    SETTING_KEYS.SECURITY,
    SETTING_KEYS.BACKUP,
    SETTING_KEYS.REGIONAL,
    SETTING_KEYS.DISPLAY,
  ]

  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', keys)

  if (error) {
    // Don't block the app — just return defaults.
    // (Common when the user is offline or the table hasn't been created yet.)
    console.warn('[settings] load failed, using defaults:', error.message)
    return DEFAULT_ALL_SETTINGS
  }

  // Build a map of what came back
  const map: Record<string, any> = {}
  for (const row of data || []) {
    try {
      map[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    } catch {
      // Malformed JSON — fall back to default for that key
      console.warn(`[settings] malformed JSON for key "${row.key}", using default`)
    }
  }

  // Merge each slice with its default, so any missing fields in stored
  // data (e.g. after we add a new field) get sensible fallbacks.
  return {
    company:       { ...DEFAULT_COMPANY,       ...(map[SETTING_KEYS.COMPANY_FINANCE] || {}) },
    numbering:     { ...DEFAULT_NUMBERING,     ...(map[SETTING_KEYS.NUMBERING]       || {}) },
    tax:           { ...DEFAULT_TAX,           ...(map[SETTING_KEYS.TAX]             || {}) },
    notifications: { ...DEFAULT_NOTIFICATIONS, ...(map[SETTING_KEYS.NOTIFICATIONS]   || {}) },
    security:      { ...DEFAULT_SECURITY,      ...(map[SETTING_KEYS.SECURITY]        || {}) },
    backup:        { ...DEFAULT_BACKUP,        ...(map[SETTING_KEYS.BACKUP]          || {}) },
    regional:      { ...DEFAULT_REGIONAL,      ...(map[SETTING_KEYS.REGIONAL]        || {}) },
    display:       { ...DEFAULT_DISPLAY,       ...(map[SETTING_KEYS.DISPLAY]         || {}) },
  }
}

// ─── Save helpers ───────────────────────────────────────────────────────────

export async function saveSettingSlice(key: string, value: unknown): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('system_settings').upsert(
    { key, value: JSON.stringify(value) },
    { onConflict: 'key' }
  )
  if (error) {
    console.error(`[settings] save failed for ${key}:`, error.message)
    return { success: false, error: error.message }
  }
  return { success: true }
}

// ─── React Context ─────────────────────────────────────────────────────────

interface SettingsContextValue {
  settings: AllSettings
  loading: boolean
  // Update one slice. Writes to DB and updates the in-memory copy.
  updateSlice: <K extends keyof AllSettings>(slice: K, value: AllSettings[K]) => Promise<boolean>
  // Force a reload from DB (useful after external changes)
  refresh: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AllSettings>(DEFAULT_ALL_SETTINGS)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const loaded = await loadAllSettings()
    setSettings(loaded)
    // Apply display settings to DOM immediately so the UI reflects them
    // on first render, not only after the user visits Display Settings.
    applyDisplaySettings(loaded.display)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const updateSlice = useCallback(async <K extends keyof AllSettings>(
    slice: K, value: AllSettings[K]
  ): Promise<boolean> => {
    // Map slice name → DB key
    const sliceKeyMap: Record<keyof AllSettings, string> = {
      company: SETTING_KEYS.COMPANY_FINANCE,
      numbering: SETTING_KEYS.NUMBERING,
      tax: SETTING_KEYS.TAX,
      notifications: SETTING_KEYS.NOTIFICATIONS,
      security: SETTING_KEYS.SECURITY,
      backup: SETTING_KEYS.BACKUP,
      regional: SETTING_KEYS.REGIONAL,
      display: SETTING_KEYS.DISPLAY,
    }
    const dbKey = sliceKeyMap[slice]
    const result = await saveSettingSlice(dbKey, value)
    if (!result.success) return false

    // Update in-memory state
    setSettings(prev => ({ ...prev, [slice]: value }))

    // Special case: if this was the display slice, apply to DOM too
    if (slice === 'display') applyDisplaySettings(value as typeof DEFAULT_DISPLAY)
    return true
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSlice, refresh: load }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used inside <SettingsProvider>')
  }
  return ctx
}

// ─── Pre-render display bootstrap ──────────────────────────────────────────
// Call this BEFORE React mounts (from main.tsx), so the first paint
// already has the right theme. Uses localStorage as a fast synchronous
// cache so we don't flash the default theme while Supabase loads.

const LOCAL_CACHE_KEY = 'sokora_display_cache'

export function bootstrapDisplayFromCache() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY)
    if (!raw) return
    const cached = JSON.parse(raw)
    if (cached && typeof cached === 'object') {
      applyDisplaySettings({ ...DEFAULT_DISPLAY, ...cached })
    }
  } catch {
    // ignore — defaults will render
  }
}

export function cacheDisplayLocally(d: typeof DEFAULT_DISPLAY) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(d))
  } catch {
    // ignore — cache is best-effort
  }
}
