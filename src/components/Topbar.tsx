import { useState, useEffect, useRef } from 'react'
import type { Page } from '../lib/types'
import { useAuth } from '../lib/useAuth'
import { supabase } from '../lib/supabase'
import { useCompanySettings } from '../lib/useCompanySettings'

function getFYLabel() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  return m >= 7 ? `FY ${y}-${String(y + 1).slice(2)}` : `FY ${y - 1}-${String(y).slice(2)}`
}

interface Props {
  breadcrumb: string
  onNav: (p: Page) => void
  onBack: () => void
  canGoBack: boolean
}

const SEARCHABLE_PAGES: { page: Page; label: string; keywords: string }[] = [
  { page: 'dashboard',          label: 'Dashboard',        keywords: 'home overview stats' },
  { page: 'cash-sale',          label: 'New Cash Sale',    keywords: 'sell pos point of sale' },
  { page: 'sales-day-book',     label: 'Sales Day Book',   keywords: 'sales register transactions' },
  { page: 'inventory',          label: 'Inventory',        keywords: 'stock products items' },
  { page: 'customers',          label: 'Customers',        keywords: 'clients contacts' },
  { page: 'chart-of-accounts',  label: 'Chart of Accounts',keywords: 'ledger accounts coa' },
  { page: 'vouchers',           label: 'Vouchers Hub',     keywords: 'receipts payments' },
  { page: 'reports',            label: 'Reports Hub',      keywords: 'analytics' },
  { page: 'pnl',                label: 'Profit & Loss',    keywords: 'income statement' },
  { page: 'balance-sheet',      label: 'Balance Sheet',    keywords: 'assets liabilities' },
  { page: 'trial-balance',      label: 'Trial Balance',    keywords: 'tb' },
  { page: 'banks',              label: 'Banks & Accounts', keywords: 'bank accounts' },
  { page: 'settings',           label: 'Settings',         keywords: 'config preferences' },
  { page: 'petty-cash',         label: 'Petty Cash',       keywords: 'expenses' },
  { page: 'cash-payment',       label: 'Payment Voucher',  keywords: 'pay expense cash bank' },
  { page: 'cash-receipt',       label: 'Cash Receipt',     keywords: 'receive money' },
  { page: 'credit-note',        label: 'Credit Note',      keywords: 'refund return' },
  { page: 'opening-stock',      label: 'Opening Stock',    keywords: 'initial inventory' },
  { page: 'stock-adjustment',   label: 'Stock Adjustment', keywords: 'adjust inventory' },
  { page: 'users',              label: 'User Management',  keywords: 'team staff employees' },
  { page: 'crm-hub',            label: 'CRM Hub',          keywords: 'customer relations' },
]

interface SearchResult {
  type: 'page' | 'voucher' | 'product' | 'customer'
  id: string
  title: string
  subtitle: string
  page?: Page
}

const TYPE_COLORS: Record<string, string> = {
  page:     'var(--accent)',
  voucher:  'var(--blue)',
  product:  'var(--green)',
  customer: 'var(--yellow)',
}

export default function Topbar({ breadcrumb, onNav, onBack, canGoBack }: Props) {
  const { user, signOut } = useAuth()
  const { settings: cs } = useCompanySettings()
  const companyName = cs.company_name || 'SOKORA'
  const [query, setQuery]             = useState('')
  const [results, setResults]         = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowResults(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setShowResults(false); return }
    const search = async () => {
      setLoading(true)
      const q = query.toLowerCase()
      const all: SearchResult[] = []

      SEARCHABLE_PAGES
        .filter(p => p.label.toLowerCase().includes(q) || p.keywords.includes(q))
        .slice(0, 3)
        .forEach(p => all.push({ type: 'page', id: p.page, title: p.label, subtitle: 'Navigate to page', page: p.page }))

      const { data: vouchers } = await supabase
        .from('vouchers')
        .select('id, ref, type, total_amount, posting_date')
        .or(`ref.ilike.%${q}%,description.ilike.%${q}%`)
        .order('posting_date', { ascending: false })
        .limit(4)
      vouchers?.forEach(v => all.push({ type: 'voucher', id: v.id, title: v.ref, subtitle: `${v.type} · TZS ${(v.total_amount||0).toLocaleString()} · ${v.posting_date}` }))

      const { data: products } = await supabase
        .from('products')
        .select('id, name, sku, selling_price, qty_on_hand')
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .eq('is_active', true)
        .limit(3)
      products?.forEach(p => all.push({ type: 'product', id: p.id, title: p.name, subtitle: `${p.sku} · TZS ${(p.selling_price||0).toLocaleString()} · Stock: ${p.qty_on_hand||0}` }))

      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, whatsapp, crown_points')
        .or(`name.ilike.%${q}%,whatsapp.ilike.%${q}%`)
        .limit(3)
      customers?.forEach(c => all.push({ type: 'customer', id: c.id, title: c.name, subtitle: `${c.whatsapp||'No phone'} · ${c.crown_points||0} pts` }))

      setResults(all)
      setShowResults(true)
      setSelectedIndex(0)
      setLoading(false)
    }
    const t = setTimeout(search, 200)
    return () => clearTimeout(t)
  }, [query])

  const handleSelect = (r: SearchResult) => {
    setQuery(''); setShowResults(false)
    if (r.type === 'page' && r.page)    onNav(r.page)
    else if (r.type === 'voucher')      onNav('sales-day-book')
    else if (r.type === 'product')      onNav('inventory')
    else if (r.type === 'customer')     onNav('customers')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || !results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => (i+1) % results.length) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIndex(i => (i-1+results.length) % results.length) }
    if (e.key === 'Enter')     { e.preventDefault(); handleSelect(results[selectedIndex]) }
    if (e.key === 'Escape')    setShowResults(false)
  }

  const handleLogout = async () => {
    if (confirm(`Sign out of ${companyName}?`)) await signOut()
  }

  const initials = user?.initials || user?.full_name?.slice(0,2).toUpperCase() || 'U'

  return (
    <header style={{
      height: 'var(--topbar)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      gap: 16,
      flexShrink: 0,
      zIndex: 50,
    }}>

      {/* ── Left: back + breadcrumb ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {canGoBack && (
          <button
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text3)',
              cursor: 'pointer',
              transition: 'all .12s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)';  e.currentTarget.style.color = 'var(--text3)' }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', minWidth: 0 }}>
          <span style={{ color: 'var(--text3)', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{companyName}</span>
          <svg width="12" height="12" fill="none" stroke="var(--text3)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
          <span style={{ fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {breadcrumb}
          </span>
        </div>
      </div>

      {/* ── Center: search ── */}
      <div style={{ flex: 1, maxWidth: 480 }} ref={searchRef}>
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 12px',
            height: 34,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            transition: 'border-color .12s',
          }}>
            <svg width="14" height="14" fill="none" stroke="var(--text3)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search anything…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => query && setShowResults(true)}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text)',
                fontSize: 13,
                fontFamily: 'var(--font)',
              }}
            />
            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {loading ? (
                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
              ) : (
                <>
                  <kbd>⌘</kbd>
                  <kbd>K</kbd>
                </>
              )}
            </div>
          </div>

          {/* Dropdown */}
          {showResults && results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              marginTop: 4,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: 'var(--shadow-lg)',
              zIndex: 1000,
              overflow: 'hidden',
            }}>
              {results.map((r, i) => (
                <div
                  key={`${r.type}-${r.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 14px',
                    cursor: 'pointer',
                    background: i === selectedIndex ? 'var(--surface2)' : 'transparent',
                    borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background .08s',
                  }}
                  onClick={() => handleSelect(r)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: `${TYPE_COLORS[r.type]}12`,
                    border: `1px solid ${TYPE_COLORS[r.type]}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="12" height="12" fill="none" stroke={TYPE_COLORS[r.type]} strokeWidth="2" viewBox="0 0 24 24">
                      <path d={r.type === 'page' ? 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' :
                               r.type === 'product' ? 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8' :
                               r.type === 'customer' ? 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' :
                               'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M16 13H8'}/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.subtitle}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--mono)',
                    color: TYPE_COLORS[r.type],
                    background: `${TYPE_COLORS[r.type]}12`,
                    border: `1px solid ${TYPE_COLORS[r.type]}22`,
                    borderRadius: 4, padding: '2px 6px',
                    textTransform: 'uppercase', letterSpacing: '.5px',
                    flexShrink: 0,
                  }}>
                    {r.type}
                  </span>
                </div>
              ))}
            </div>
          )}
          {showResults && query && !results.length && !loading && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 1000,
              padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13,
            }}>
              No results for "{query}"
            </div>
          )}
        </div>
      </div>

      {/* ── Right: user ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* FY badge */}
        <div style={{
          padding: '0 10px', height: 26,
          display: 'flex', alignItems: 'center',
          background: 'var(--accent-dim)',
          border: '1px solid rgba(99,102,241,.2)',
          borderRadius: 6,
          fontSize: 11, fontFamily: 'var(--mono)',
          color: 'var(--accent)', letterSpacing: '.3px',
        }}>
          {getFYLabel()}
        </div>

        {/* User avatar + info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff',
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
              {user?.full_name || 'User'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              {user?.is_approver ? 'Approver' : 'Member'}
            </div>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          title="Sign out"
          style={{
            width: 30, height: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text3)',
            cursor: 'pointer', transition: 'all .12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-dim)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.background = 'transparent' }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </header>
  )
}
