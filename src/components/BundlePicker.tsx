/**
 * BundlePicker Component
 * 
 * Collapsed by default — shows a small "Apply Bundle" button.
 * When clicked, opens a full-height side panel with scrollable bundle list.
 * Each bundle expands inline to show products + apply button.
 * The panel itself is fully scrollable so expanded bundles are always reachable.
 */

import { useState, useRef, useEffect } from 'react'
import { useBundles } from '../lib/useBundles'
import type { Bundle } from '../lib/useBundles'

interface ApplyLine {
  productId: string
  name: string
  qty: number
  price: number
  amount: number
}

interface Props {
  onApply: (lines: ApplyLine[], bundle: Bundle) => void
}

export default function BundlePicker({ onApply }: Props) {
  const { activeBundles, loading } = useBundles()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const expandedRef = useRef<HTMLDivElement | null>(null)

  // Scroll expanded bundle into view
  useEffect(() => {
    if (expanded && expandedRef.current) {
      setTimeout(() => {
        expandedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    }
  }, [expanded])

  if (loading || activeBundles.length === 0) return null

  const handleApply = (bundle: Bundle) => {
    const totalIndividual = bundle.individual_total || 1
    const lines: ApplyLine[] = bundle.items
      .filter(item => item.product)
      .map(item => {
        const individualPrice = (item.product?.selling_price || 0) * item.qty
        const proportion = individualPrice / totalIndividual
        const allocatedPrice = Math.round((bundle.bundle_price * proportion) / item.qty)
        return {
          productId: item.product_id,
          name: item.product?.name || '',
          qty: item.qty,
          price: allocatedPrice,
          amount: allocatedPrice * item.qty,
        }
      })
    onApply(lines, bundle)
    setOpen(false)
    setExpanded(null)
  }

  const tzs = (n: number) => 'TZS ' + Math.round(n).toLocaleString()
  const savings = (b: Bundle) => b.individual_total - b.bundle_price
  const savingsPct = (b: Bundle) => b.individual_total > 0 ? Math.round((savings(b) / b.individual_total) * 100) : 0

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', fontSize: 11, fontWeight: 600,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 8, cursor: 'pointer', color: 'var(--accent)',
          transition: 'all .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface2)' }}
      >
        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
        Apply Bundle ({activeBundles.length})
      </button>

      {/* Full-screen overlay — the entire thing scrolls */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
            zIndex: 300, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            padding: '40px 0',
          }}
        >
          {/* Tap backdrop to close */}
          <div
            onClick={() => { setOpen(false); setExpanded(null) }}
            style={{ position: 'absolute', inset: 0 }}
          />

          {/* Modal card — not fixed height, grows with content */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 16, width: '92%', maxWidth: 560,
              margin: '0 auto',
            }}
          >
            {/* Sticky header */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              background: 'var(--surface)', borderBottom: '1px solid var(--border)',
              borderRadius: '16px 16px 0 0',
              padding: '16px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="18" height="18" fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 800 }}>Product Bundles</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{activeBundles.length} active · Tap to expand, then apply</div>
                </div>
              </div>
              <button
                onClick={() => { setOpen(false); setExpanded(null) }}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
                  color: 'var(--text3)', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >x</button>
            </div>

            {/* Bundle list — no inner scroll, the whole overlay scrolls */}
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeBundles.map(bundle => {
                const isExpanded = expanded === bundle.id
                return (
                  <div
                    key={bundle.id}
                    ref={isExpanded ? expandedRef : undefined}
                    style={{
                      background: isExpanded ? 'var(--accent-dim)' : 'var(--surface2)',
                      border: `1.5px solid ${isExpanded ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 12, overflow: 'hidden', transition: 'all .15s',
                    }}
                  >
                    {/* Bundle summary row */}
                    <div
                      onClick={() => setExpanded(isExpanded ? null : bundle.id)}
                      style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{bundle.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>{bundle.items.length} items · {bundle.code}</div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>{tzs(bundle.bundle_price)}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textDecoration: 'line-through' }}>{tzs(bundle.individual_total)}</span>
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>Save {savingsPct(bundle)}%</div>
                        </div>
                        <span style={{ fontSize: 16, color: 'var(--text3)', transition: 'transform .2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                      </div>
                    </div>

                    {/* Expanded detail — products + apply button */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid var(--border)' }}>
                        {bundle.items.map((item, i) => (
                          <div key={i} style={{
                            padding: '8px 14px', borderBottom: i < bundle.items.length - 1 ? '1px solid var(--border)' : 'none',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12,
                          }}>
                            <div>
                              <span style={{ fontWeight: 500 }}>{item.product?.name || 'Unknown'}</span>
                              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginLeft: 8 }}>
                                x{item.qty} · Stk: {item.product?.qty_on_hand || 0}
                              </span>
                            </div>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 11 }}>
                              {tzs((item.product?.selling_price || 0) * item.qty)}
                            </span>
                          </div>
                        ))}
                        <div style={{ padding: '8px 14px', display: 'flex', justifyContent: 'space-between', background: 'var(--surface)', fontSize: 12 }}>
                          <span style={{ color: 'var(--text3)' }}>You save</span>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>{tzs(savings(bundle))} ({savingsPct(bundle)}%)</span>
                        </div>
                        <div style={{ padding: '10px 12px' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleApply(bundle) }}
                            className="btn btn-primary"
                            style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 13, fontWeight: 700 }}
                          >
                            Apply Bundle to Sale
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
