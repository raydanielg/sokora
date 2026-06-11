import { useEffect, useState, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

// ════════════════════════════════════════════════════════════════════════════
// CASH CUSTOMER DETAIL — purchase history + loyalty view (B2C / moms)
//
// Why this file exists (and why the old one was empty):
//   Cash customers settle at point of sale, so they have ZERO rows in
//   customer_ledger_entries (that table is the accounts-receivable ledger,
//   only written for credit / POD sales). The previous code fell through to
//   the AR ledger view for cash customers, which always rendered
//   "No ledger entries yet." — looking like a bug even though the AR table
//   was correctly empty.
//
//   A cash customer's real history lives in `vouchers` (type = 'cash_sale')
//   plus their `voucher_lines`. This component reads those tables DIRECTLY,
//   so it does not depend on any reporting view being present. The
//   customer_metrics view (migration 013) is used only for soft enrichment
//   (lifecycle, EDD) and degrades gracefully if a column or the view is
//   missing — a failed metrics fetch never blanks the page.
//
// Schema (verified against src/lib/cashSalePost.ts writers):
//   vouchers:       id, ref, type, posting_date, description, subtotal,
//                   total_amount, status, customer_id, payment_method, notes
//   voucher_lines:  voucher_id, line_number, product_id, description, qty,
//                   unit_cost, unit_price, subtotal, total
// ════════════════════════════════════════════════════════════════════════════

interface Props {
  customerId: string
  customerName: string
  customerNumber?: string
  crownPoints?: number
  whatsapp?: string | null
  onBack: () => void
  onViewStatement?: (customerId: string) => void
  onNav?: (p: Page) => void
}

interface VoucherRow {
  id: string
  ref: string
  posting_date: string
  total_amount: number
  status: string
  payment_method: string | null
  description: string | null
}

interface LineRow {
  voucher_id: string
  description: string | null
  product_id: string | null
  qty: number
  unit_price: number
  total: number
}

interface ProductAgg {
  name: string
  qty: number
  times: number
  spent: number
  lastDate: string
}

// Optional enrichment from customer_metrics. Everything is nullable; the page
// never hard-fails if the view or a column is absent.
interface Metrics {
  lifecycle_stage?: string | null
  life_stage?: string | null
  edd?: string | null
  days_to_edd?: number | null
  baby_age_months?: number | null
  visit_count?: number | null
  lifetime_value?: number | null
  avg_basket?: number | null
}

const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CashCustomerDetailView({
  customerId, customerName, customerNumber, crownPoints = 0, whatsapp,
  onBack, onViewStatement, onNav,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [vouchers, setVouchers] = useState<VoucherRow[]>([])
  const [linesByVoucher, setLinesByVoucher] = useState<Record<string, LineRow[]>>({})
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)

      // 1) Purchase history — cash_sale vouchers for this customer.
      //    Reads the vouchers table directly (guaranteed to exist).
      const { data: vData } = await supabase
        .from('vouchers')
        .select('id, ref, posting_date, total_amount, status, payment_method, description')
        .eq('customer_id', customerId)
        .eq('type', 'cash_sale')
        .order('posting_date', { ascending: false })

      const vList = (vData as VoucherRow[] | null) ?? []

      // 2) Lines for those vouchers (single round-trip via .in()).
      const lineMap: Record<string, LineRow[]> = {}
      if (vList.length > 0) {
        const ids = vList.map(v => v.id)
        const { data: lData } = await supabase
          .from('voucher_lines')
          .select('voucher_id, description, product_id, qty, unit_price, total')
          .in('voucher_id', ids)
        for (const l of (lData as LineRow[] | null) ?? []) {
          if (!lineMap[l.voucher_id]) lineMap[l.voucher_id] = []
          lineMap[l.voucher_id].push(l)
        }
      }

      // 3) Optional enrichment. Wrapped so a missing view/column is silent.
      let m: Metrics | null = null
      try {
        const { data: mData, error: mErr } = await supabase
          .from('customer_metrics')
          .select('*')
          .eq('customer_id', customerId)
          .maybeSingle()
        if (!mErr && mData) m = mData as Metrics
      } catch {
        // customer_metrics view not present — purchase history still renders.
      }

      if (cancelled) return
      setVouchers(vList)
      setLinesByVoucher(lineMap)
      setMetrics(m)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [customerId])

  // ── Derived stats (computed from real vouchers, not the view) ─────────────
  const postedVouchers = vouchers.filter(v => v.status === 'posted')
  const visitCount = postedVouchers.length
  const lifetimeValue = postedVouchers.reduce((s, v) => s + (v.total_amount || 0), 0)
  const avgBasket = visitCount > 0 ? lifetimeValue / visitCount : 0
  const lastVisit = postedVouchers[0]?.posting_date ?? null
  const firstVisit = postedVouchers.length
    ? postedVouchers[postedVouchers.length - 1].posting_date
    : null

  // Top products across all lines.
  const productAgg: Record<string, ProductAgg> = {}
  for (const v of vouchers) {
    if (v.status !== 'posted') continue
    for (const l of linesByVoucher[v.id] ?? []) {
      const key = l.product_id || l.description || 'unknown'
      const name = l.description || 'Unnamed item'
      if (!productAgg[key]) productAgg[key] = { name, qty: 0, times: 0, spent: 0, lastDate: v.posting_date }
      productAgg[key].qty += l.qty || 0
      productAgg[key].times += 1
      productAgg[key].spent += l.total || 0
      if (v.posting_date > productAgg[key].lastDate) productAgg[key].lastDate = v.posting_date
    }
  }
  const topProducts = Object.values(productAgg).sort((a, b) => b.spent - a.spent).slice(0, 6)

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Prefer real computed values; fall back to view values only where we have
  // nothing of our own (we always have vouchers, so these mostly win).
  const kpis = [
    { label: 'Lifetime Value', val: tzs(lifetimeValue), color: 'var(--green)' },
    { label: 'Visits', val: String(visitCount), color: 'var(--text)' },
    { label: 'Avg Basket', val: visitCount ? tzs(avgBasket) : '—', color: 'var(--text)' },
    { label: 'Crown Points', val: (crownPoints || 0).toLocaleString(), color: 'var(--yellow)' },
    { label: 'Last Visit', val: fmtDate(lastVisit), color: 'var(--text3)' },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={onBack}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
            Customers
          </button>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {customerNumber && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 4 }}>{customerNumber}</span>
              )}
              <div className="page-title" style={{ margin: 0 }}>{customerName}</div>
              {metrics?.lifecycle_stage && (
                <span className="pill pill-gray" style={{ fontSize: 9, textTransform: 'uppercase' }}>{metrics.lifecycle_stage}</span>
              )}
            </div>
            <div className="page-sub">Cash Customer · {visitCount} purchase{visitCount === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div className="page-actions">
          {onViewStatement && (
            <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => onViewStatement(customerId)}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              Statement
            </button>
          )}
          {whatsapp && onNav && (
            <button
              className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#25D366' }}
              onClick={() => {
                // Same sessionStorage shuttle the Customers list row uses, so the
                // templates page opens pre-loaded with this customer.
                sessionStorage.setItem('wa_template_target_customer', JSON.stringify({
                  id: customerId,
                  name: customerName,
                  whatsapp,
                  phone: whatsapp,
                  life_stage: metrics?.life_stage ?? null,
                  edd: metrics?.edd ?? null,
                  crown_points: crownPoints ?? 0,
                }))
                onNav('crm-whatsapp-templates')
              }}>
              <svg width="13" height="13" fill="#25D366" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z" /></svg>
              WhatsApp Template
            </button>
          )}
          {whatsapp && !onNav && (
            <a href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"
              className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#25D366' }}>
              <svg width="13" height="13" fill="#25D366" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z" /></svg>
              WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ background: 'linear-gradient(135deg,rgba(10,10,10,1) 0%,rgba(25,25,25,1) 100%)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 14, padding: '18px 24px', marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16 }}>
        {kpis.map(item => (
          <div key={item.label}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: item.color }}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* Optional journey strip — only when metrics view supplied something */}
      {metrics && (metrics.edd || metrics.baby_age_months != null || metrics.life_stage) && (
        <div style={{ marginBottom: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12 }}>
          {metrics.life_stage && (
            <div><span style={{ color: 'var(--text3)' }}>Stage: </span><span style={{ fontWeight: 600 }}>{metrics.life_stage}</span></div>
          )}
          {metrics.edd && (
            <div><span style={{ color: 'var(--text3)' }}>EDD: </span><span style={{ fontWeight: 600 }}>{fmtDate(metrics.edd)}</span>
              {metrics.days_to_edd != null && <span style={{ color: 'var(--text3)' }}> ({metrics.days_to_edd} days)</span>}
            </div>
          )}
          {metrics.baby_age_months != null && (
            <div><span style={{ color: 'var(--text3)' }}>Baby age: </span><span style={{ fontWeight: 600 }}>{metrics.baby_age_months} mo</span></div>
          )}
          {firstVisit && (
            <div><span style={{ color: 'var(--text3)' }}>Customer since: </span><span style={{ fontWeight: 600 }}>{fmtDate(firstVisit)}</span></div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Purchase history */}
        <div className="card">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Purchase History
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading purchases…</div>
          ) : vouchers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No purchases recorded for this customer yet.</div>
          ) : (
            <div className="table-wrap">
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--text3)', textAlign: 'left', fontSize: 10, textTransform: 'uppercase' }}>
                    <th style={{ padding: '8px 12px' }}>Date</th>
                    <th style={{ padding: '8px 12px' }}>Ref</th>
                    <th style={{ padding: '8px 12px' }}>Method</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '8px 12px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map(v => {
                    const isOpen = expanded.has(v.id)
                    const lines = linesByVoucher[v.id] ?? []
                    return (
                      <Fragment key={v.id}>
                        <tr
                          onClick={() => toggle(v.id)}
                          style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', opacity: v.status === 'posted' ? 1 : 0.55 }}>
                          <td style={{ padding: '8px 12px', color: 'var(--text3)' }}>{fmtDate(v.posting_date)}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontWeight: 600 }}>{v.ref}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--text3)' }}>{v.payment_method || '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{tzs(v.total_amount || 0)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text3)' }}>{isOpen ? '▲' : '▼'}</td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={5} style={{ padding: 0, background: 'var(--surface2)' }}>
                              <div style={{ padding: '8px 16px' }}>
                                {v.status !== 'posted' && (
                                  <div style={{ fontSize: 10, color: 'var(--yellow)', marginBottom: 6, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>Status: {v.status}</div>
                                )}
                                {lines.length === 0 ? (
                                  <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', padding: 6 }}>No line detail.</div>
                                ) : (
                                  <table style={{ width: '100%', fontSize: 11 }}>
                                    <tbody>
                                      {lines.map((l, i) => (
                                        <tr key={i}>
                                          <td style={{ padding: '3px 6px' }}>{l.description || 'Item'}</td>
                                          <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{l.qty} × {tzs(l.unit_price || 0)}</td>
                                          <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{tzs(l.total || 0)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top products */}
        <div className="card">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Top Products
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>Loading…</div>
          ) : topProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>No products yet.</div>
          ) : (
            <div style={{ padding: '4px 0' }}>
              {topProducts.map((p, i) => (
                <div key={i} style={{ padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{tzs(p.spent)}</div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                    {p.qty} unit{p.qty === 1 ? '' : 's'} · {p.times} order{p.times === 1 ? '' : 's'} · last {fmtDate(p.lastDate)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
