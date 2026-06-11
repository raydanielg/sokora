import { useState, useEffect } from 'react'
import Toast from '../components/Toast'
import {
  useSettings, applyTheme as applyThemeGlobal,
  applyFontSize as applyFontSizeGlobal,
  applyBorderRadius as applyBorderRadiusGlobal,
  cacheDisplayLocally,
} from '../lib/settingsLoader'
import { DEFAULT_DISPLAY } from '../lib/settingsDefaults'

// Theme definitions
const THEMES = {
  midnight: {
    name: 'Midnight',
    description: 'Default dark theme with warm accents',
    preview: ['#0a0b0f', '#111318', '#d4874a', '#00e5a0'],
    vars: {
      '--bg': '#0a0b0f',
      '--surface': '#111318',
      '--surface2': '#181b22',
      '--surface3': '#1e2129',
      '--border': 'rgba(255,255,255,0.07)',
      '--border2': 'rgba(255,255,255,0.13)',
      '--accent': '#d4874a',
      '--accent2': '#b86d32',
      '--accent-dim': 'rgba(212,135,74,0.12)',
      '--text': '#e8eaf0',
      '--text2': '#9aa0b0',
      '--text3': '#5a6070',
    }
  },
  sokora: {
    name: 'SOKORA',
    description: 'Teal & blush brand colors',
    preview: ['#0f1419', '#1a2027', '#85c2be', '#f7a6ad'],
    vars: {
      '--bg': '#0f1419',
      '--surface': '#1a2027',
      '--surface2': '#232b33',
      '--surface3': '#2c353f',
      '--border': 'rgba(133,194,190,0.12)',
      '--border2': 'rgba(133,194,190,0.22)',
      '--accent': '#85c2be',
      '--accent2': '#6ba8a4',
      '--accent-dim': 'rgba(133,194,190,0.12)',
      '--text': '#e8eaf0',
      '--text2': '#9aa0b0',
      '--text3': '#5a6070',
    }
  },
  accountant: {
    name: 'Accountant',
    description: 'Classic dark with blue accents',
    preview: ['#0d1117', '#161b22', '#58a6ff', '#3fb950'],
    vars: {
      '--bg': '#0d1117',
      '--surface': '#161b22',
      '--surface2': '#1c2128',
      '--surface3': '#22272e',
      '--border': 'rgba(48,54,61,0.8)',
      '--border2': 'rgba(48,54,61,1)',
      '--accent': '#58a6ff',
      '--accent2': '#388bfd',
      '--accent-dim': 'rgba(88,166,255,0.12)',
      '--text': '#c9d1d9',
      '--text2': '#8b949e',
      '--text3': '#6e7681',
    }
  },
  obsidian: {
    name: 'Obsidian',
    description: 'Pure black with purple highlights',
    preview: ['#000000', '#0d0d0d', '#a855f7', '#f472b6'],
    vars: {
      '--bg': '#000000',
      '--surface': '#0d0d0d',
      '--surface2': '#171717',
      '--surface3': '#1f1f1f',
      '--border': 'rgba(255,255,255,0.06)',
      '--border2': 'rgba(255,255,255,0.12)',
      '--accent': '#a855f7',
      '--accent2': '#9333ea',
      '--accent-dim': 'rgba(168,85,247,0.12)',
      '--text': '#fafafa',
      '--text2': '#a1a1aa',
      '--text3': '#71717a',
    }
  },
  forest: {
    name: 'Forest',
    description: 'Deep greens for nature lovers',
    preview: ['#0c1210', '#121a17', '#10b981', '#34d399'],
    vars: {
      '--bg': '#0c1210',
      '--surface': '#121a17',
      '--surface2': '#1a2520',
      '--surface3': '#223029',
      '--border': 'rgba(16,185,129,0.12)',
      '--border2': 'rgba(16,185,129,0.22)',
      '--accent': '#10b981',
      '--accent2': '#059669',
      '--accent-dim': 'rgba(16,185,129,0.12)',
      '--text': '#e8f0ec',
      '--text2': '#9aaca2',
      '--text3': '#5a706a',
    }
  },
  light: {
    name: 'Light',
    description: 'Clean white background',
    preview: ['#ffffff', '#f8fafc', '#0ea5e9', '#10b981'],
    vars: {
      '--bg': '#f8fafc',
      '--surface': '#ffffff',
      '--surface2': '#f1f5f9',
      '--surface3': '#e2e8f0',
      '--border': 'rgba(0,0,0,0.08)',
      '--border2': 'rgba(0,0,0,0.15)',
      '--accent': '#0ea5e9',
      '--accent2': '#0284c7',
      '--accent-dim': 'rgba(14,165,233,0.12)',
      '--text': '#0f172a',
      '--text2': '#475569',
      '--text3': '#94a3b8',
    }
  },
  sepia: {
    name: 'Sepia',
    description: 'Warm paper-like tones',
    preview: ['#f5f1e8', '#ebe5d8', '#b45309', '#059669'],
    vars: {
      '--bg': '#f5f1e8',
      '--surface': '#fffbf5',
      '--surface2': '#ebe5d8',
      '--surface3': '#ddd6c8',
      '--border': 'rgba(0,0,0,0.08)',
      '--border2': 'rgba(0,0,0,0.15)',
      '--accent': '#b45309',
      '--accent2': '#92400e',
      '--accent-dim': 'rgba(180,83,9,0.12)',
      '--text': '#292524',
      '--text2': '#57534e',
      '--text3': '#a8a29e',
    }
  },
  nord: {
    name: 'Nord',
    description: 'Arctic blue-gray palette',
    preview: ['#2e3440', '#3b4252', '#88c0d0', '#a3be8c'],
    vars: {
      '--bg': '#2e3440',
      '--surface': '#3b4252',
      '--surface2': '#434c5e',
      '--surface3': '#4c566a',
      '--border': 'rgba(216,222,233,0.1)',
      '--border2': 'rgba(216,222,233,0.2)',
      '--accent': '#88c0d0',
      '--accent2': '#81a1c1',
      '--accent-dim': 'rgba(136,192,208,0.15)',
      '--text': '#eceff4',
      '--text2': '#d8dee9',
      '--text3': '#7b88a1',
    }
  },
}

type ThemeKey = keyof typeof THEMES

const FONT_SIZES = [
  { value: 12, label: 'Compact' },
  { value: 14, label: 'Default' },
  { value: 16, label: 'Large' },
  { value: 18, label: 'X-Large' },
]

const RADIUS_OPTIONS = [
  { value: 0, label: 'Sharp' },
  { value: 6, label: 'Subtle' },
  { value: 10, label: 'Default' },
  { value: 16, label: 'Rounded' },
  { value: 24, label: 'Pill' },
]

export default function DisplaySettings() {
  const { settings, updateSlice } = useSettings()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [saving, setSaving] = useState(false)

  // Local draft state — initialized from the shared settings, updated as
  // the user tweaks controls. Saved back via updateSlice().
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>(settings.display.theme as ThemeKey)
  const [fontSize, setFontSize] = useState(settings.display.font_size)
  const [borderRadius, setBorderRadius] = useState(settings.display.border_radius)
  const [animationsEnabled, setAnimationsEnabled] = useState(settings.display.animations_enabled)
  const [compactMode, setCompactMode] = useState(settings.display.compact_mode)
  const [showGridLines, setShowGridLines] = useState(settings.display.show_grid_lines)
  const [highlightOnHover, setHighlightOnHover] = useState(settings.display.highlight_on_hover)
  const [monoNumbers, setMonoNumbers] = useState(settings.display.mono_numbers)
  const [stickyHeaders, setStickyHeaders] = useState(settings.display.sticky_headers)

  // Keep local draft in sync when global settings change (e.g. another tab
  // saves, or useSettings() hydrates after initial load)
  useEffect(() => {
    setCurrentTheme(settings.display.theme as ThemeKey)
    setFontSize(settings.display.font_size)
    setBorderRadius(settings.display.border_radius)
    setAnimationsEnabled(settings.display.animations_enabled)
    setCompactMode(settings.display.compact_mode)
    setShowGridLines(settings.display.show_grid_lines)
    setHighlightOnHover(settings.display.highlight_on_hover)
    setMonoNumbers(settings.display.mono_numbers)
    setStickyHeaders(settings.display.sticky_headers)
  }, [settings.display])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  // Live preview — apply to DOM while user is still tweaking controls.
  // Saving persists; previewing does not.
  const handleThemeChange = (k: ThemeKey) => { setCurrentTheme(k); applyThemeGlobal(k) }
  const handleFontSizeChange = (s: number) => { setFontSize(s); applyFontSizeGlobal(s) }
  const handleRadiusChange = (r: number) => { setBorderRadius(r); applyBorderRadiusGlobal(r) }

  const saveSettings = async () => {
    setSaving(true)
    const next = {
      theme: currentTheme, font_size: fontSize, border_radius: borderRadius,
      animations_enabled: animationsEnabled, compact_mode: compactMode,
      show_grid_lines: showGridLines, highlight_on_hover: highlightOnHover,
      mono_numbers: monoNumbers, sticky_headers: stickyHeaders,
    }
    const ok = await updateSlice('display', next)
    if (ok) {
      cacheDisplayLocally(next)   // fast-boot cache for the next reload
      showToast('Display settings saved · Changes apply across all devices')
    } else {
      showToast('Save failed — changes may not persist', 'error')
    }
    setSaving(false)
  }

  const resetDefaults = async () => {
    setCurrentTheme(DEFAULT_DISPLAY.theme as ThemeKey)
    setFontSize(DEFAULT_DISPLAY.font_size)
    setBorderRadius(DEFAULT_DISPLAY.border_radius)
    setAnimationsEnabled(DEFAULT_DISPLAY.animations_enabled)
    setCompactMode(DEFAULT_DISPLAY.compact_mode)
    setShowGridLines(DEFAULT_DISPLAY.show_grid_lines)
    setHighlightOnHover(DEFAULT_DISPLAY.highlight_on_hover)
    setMonoNumbers(DEFAULT_DISPLAY.mono_numbers)
    setStickyHeaders(DEFAULT_DISPLAY.sticky_headers)
    applyThemeGlobal(DEFAULT_DISPLAY.theme)
    applyFontSizeGlobal(DEFAULT_DISPLAY.font_size)
    applyBorderRadiusGlobal(DEFAULT_DISPLAY.border_radius)
    const ok = await updateSlice('display', DEFAULT_DISPLAY)
    if (ok) {
      cacheDisplayLocally(DEFAULT_DISPLAY)
      showToast('Settings reset to defaults')
    }
  }

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, background: value ? 'var(--accent)' : 'var(--surface3)', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} />
    </div>
  )

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Display Settings</div>
          <div className="page-sub">Customize the look and feel of SOKORA</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={resetDefaults}>Reset Defaults</button>
          <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
        </div>
      </div>

      {/* Theme Selection */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Color Theme</div>
        <div className="card-sub" style={{ marginBottom: 20 }}>Choose a color scheme that suits your preference</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, theme]) => (
            <div key={key} onClick={() => handleThemeChange(key)} style={{ padding: 14, background: currentTheme === key ? 'var(--accent-dim)' : 'var(--surface2)', border: `2px solid ${currentTheme === key ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12, cursor: 'pointer', transition: 'all .15s' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {theme.preview.map((color, i) => (<div key={i} style={{ width: 24, height: 24, borderRadius: 6, background: color, border: '1px solid rgba(255,255,255,0.1)' }} />))}
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>
                {theme.name}{currentTheme === key && <span style={{ marginLeft: 6, color: 'var(--accent)' }}>✓</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{theme.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g2" style={{ gap: 20, marginBottom: 20 }}>
        {/* Typography */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>Typography</div>
          <div className="card-sub" style={{ marginBottom: 20 }}>Adjust text size for readability</div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Base Font Size</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {FONT_SIZES.map(size => (
                <div key={size.value} onClick={() => handleFontSizeChange(size.value)} style={{ flex: 1, padding: '10px 12px', background: fontSize === size.value ? 'var(--accent-dim)' : 'var(--surface2)', border: `1px solid ${fontSize === size.value ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: size.value, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{size.value}px</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{size.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Monospace Numbers</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Use fixed-width digits</div></div>
            <Toggle value={monoNumbers} onChange={setMonoNumbers} />
          </div>
        </div>

        {/* Layout */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>Layout</div>
          <div className="card-sub" style={{ marginBottom: 20 }}>Customize spacing and corners</div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Border Radius</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {RADIUS_OPTIONS.map(opt => (
                <div key={opt.value} onClick={() => handleRadiusChange(opt.value)} style={{ flex: 1, padding: '10px 8px', background: borderRadius === opt.value ? 'var(--accent-dim)' : 'var(--surface2)', border: `1px solid ${borderRadius === opt.value ? 'var(--accent)' : 'var(--border)'}`, borderRadius: opt.value, cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{opt.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Compact Mode</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Reduce padding</div></div>
            <Toggle value={compactMode} onChange={setCompactMode} />
          </div>
        </div>
      </div>

      {/* Tables */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Tables & Data</div>
        <div className="card-sub" style={{ marginBottom: 20 }}>How data is presented</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Grid Lines</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Borders between rows</div></div>
            <Toggle value={showGridLines} onChange={setShowGridLines} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Hover Highlight</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Highlight rows on hover</div></div>
            <Toggle value={highlightOnHover} onChange={setHighlightOnHover} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Sticky Headers</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Keep headers visible</div></div>
            <Toggle value={stickyHeaders} onChange={setStickyHeaders} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Animations</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Smooth transitions</div></div>
            <Toggle value={animationsEnabled} onChange={setAnimationsEnabled} />
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 6 }}>Preview</div>
        <div className="card-sub" style={{ marginBottom: 20 }}>See how your settings look</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div className="stat-card amber"><div className="stat-icon"><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div className="stat-label">Revenue</div><div className="stat-value">2.4M</div><div className="stat-change up">↑ 12%</div></div>
          <div className="stat-card green"><div className="stat-icon"><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div><div className="stat-label">Orders</div><div className="stat-value">847</div><div className="stat-change up">↑ 8%</div></div>
          <div className="stat-card blue"><div className="stat-icon"><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div className="stat-label">Customers</div><div className="stat-value">1,234</div><div className="stat-change up">↑ 15%</div></div>
          <div className="stat-card red"><div className="stat-icon"><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M23 6l-9.5 9.5-5-5L1 18"/></svg></div><div className="stat-label">Returns</div><div className="stat-value">23</div><div className="stat-change down">↓ 5%</div></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Reference</th><th>Customer</th><th>Status</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              <tr><td className="td-mono">2026-03-30</td><td className="td-mono" style={{ color: 'var(--accent)' }}>CS-10-0042</td><td className="td-bold">Angela Laurian</td><td><span className="pill pill-green">Posted</span></td><td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)' }}>150,000</td></tr>
              <tr><td className="td-mono">2026-03-30</td><td className="td-mono" style={{ color: 'var(--accent)' }}>CS-10-0041</td><td className="td-bold">Baraka Zakayo</td><td><span className="pill pill-yellow">Draft</span></td><td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)' }}>85,000</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-primary">Primary</button>
          <button className="btn btn-ghost">Ghost</button>
          <button className="btn btn-success">Success</button>
          <button className="btn btn-danger">Danger</button>
          <span className="pill pill-amber">Amber</span>
          <span className="pill pill-blue">Blue</span>
        </div>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
