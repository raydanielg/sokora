// ════════════════════════════════════════════════════════════════════════════
// VoucherVerifyButton.tsx
//
// One-click integrity check for any posted voucher.
//
// Why this exists:
//   The voucher post() functions in SOKORA do 4-6 sequential writes
//   (voucher row, journal header, journal lines, voucher lines, stock
//   deduction, item ledger entry) without a transaction wrapper. If any
//   silently fails, the toast still says "posted" but the books drift.
//   This button calls the verify_voucher_posting RPC and shows a green/red
//   checklist so a human can spot drift the moment it happens.
//
// Usage:
//   import VoucherVerifyButton from '../components/VoucherVerifyButton'
//   <VoucherVerifyButton ref="IU-10-0008" />
//
// Drop into any voucher list, register, or detail page.
// Requires migration 008_verify_voucher_posting_rpc.sql to be installed.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface VerifyResult {
  ref: string
  voucher_type?: string
  voucher_exists: boolean
  voucher_status?: string
  voucher_total?: number
  posting_date?: string
  expected_journal?: boolean
  journal_exists?: boolean
  journal_balanced?: boolean
  total_debit?: number
  total_credit?: number
  imbalance?: number
  expected_voucher_lines?: boolean
  voucher_lines_count?: number
  expected_item_ledger?: boolean
  item_ledger_count?: number
  lines_match_ledger?: boolean
  overall_pass: boolean
  issues?: string[]
}

interface Props {
  voucherRef: string
  // Optional: small pill style for inline use in tables, full button for detail pages
  size?: 'pill' | 'button'
  // Optional: render a custom label instead of "Verify"
  label?: string
}

const tzs = (n?: number) =>
  n === undefined || n === null ? '—' : 'TZS ' + Math.round(n).toLocaleString()

export default function VoucherVerifyButton({ voucherRef, size = 'button', label }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runCheck = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('verify_voucher_posting', {
        p_ref: voucherRef,
      })
      if (rpcErr) {
        setError(rpcErr.message)
      } else if (!data) {
        setError('No response from verify_voucher_posting RPC')
      } else {
        setResult(data as VerifyResult)
      }
    } catch (e: any) {
      setError(e?.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const close = () => {
    setResult(null)
    setError(null)
  }

  // ─── Trigger button ──────────────────────────────────────────────────
  const triggerStyle = size === 'pill'
    ? {
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '3px 10px',
        fontSize: 10,
        fontFamily: 'var(--mono)',
        color: 'var(--text3)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }
    : {
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '7px 14px',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--text)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
      }

  return (
    <>
      <button
        onClick={runCheck}
        disabled={loading}
        style={{
          ...triggerStyle,
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'wait' : 'pointer',
        } as React.CSSProperties}
        title={`Verify integrity of ${voucherRef}`}
      >
        {loading ? (
          <span style={{
            width: 10, height: 10, border: '1.5px solid var(--text3)',
            borderTopColor: 'transparent', borderRadius: '50%',
            animation: 'spin 0.6s linear infinite', display: 'inline-block',
          }} />
        ) : (
          <svg width={size === 'pill' ? 11 : 13} height={size === 'pill' ? 11 : 13}
               fill="none" stroke="currentColor" strokeWidth="2.2"
               strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M9 12l2 2 4-4" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        )}
        {label !== '' && <span>{label || 'Verify'}</span>}
      </button>

      {/* ─── Result modal ─── */}
      {(result || error) && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              width: '100%', maxWidth: 520,
              maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Icon ok={result?.overall_pass ?? false} large />
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 700 }}>
                    {error
                      ? 'Verification Error'
                      : result?.overall_pass
                        ? 'Posting Verified'
                        : 'Issues Found'}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
                    {voucherRef}{result?.voucher_type ? ` · ${result.voucher_type}` : ''}
                  </div>
                </div>
              </div>
              <button
                onClick={close}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 6, width: 28, height: 28, cursor: 'pointer',
                  color: 'var(--text3)', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >×</button>
            </div>

            {/* Body */}
            <div style={{ padding: '16px 20px' }}>
              {error ? (
                <div style={{
                  background: 'var(--red-dim)',
                  border: '1px solid var(--red)',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 12,
                  color: 'var(--red)',
                  fontFamily: 'var(--mono)',
                }}>
                  {error}
                </div>
              ) : result && !result.voucher_exists ? (
                <Row ok={false} label="Voucher exists" detail="No row found in vouchers table for this ref" />
              ) : result ? (
                <>
                  {/* Voucher row */}
                  <Row
                    ok={result.voucher_exists}
                    label="Voucher row"
                    detail={`status: ${result.voucher_status} · total ${tzs(result.voucher_total)} · ${result.posting_date}`}
                  />

                  {/* Journal */}
                  {result.expected_journal ? (
                    <>
                      <Row
                        ok={!!result.journal_exists}
                        label="Journal entry"
                        detail={result.journal_exists ? 'Linked to voucher' : 'Missing'}
                      />
                      {result.journal_exists && (
                        <Row
                          ok={!!result.journal_balanced}
                          label="Debits = Credits"
                          detail={`Dr ${tzs(result.total_debit)} · Cr ${tzs(result.total_credit)} · diff ${tzs(result.imbalance)}`}
                        />
                      )}
                    </>
                  ) : (
                    <Row ok skip label="Journal entry" detail="Not expected for this voucher type" />
                  )}

                  {/* Voucher lines */}
                  {result.expected_voucher_lines ? (
                    <Row
                      ok={(result.voucher_lines_count ?? 0) > 0}
                      label="Voucher lines"
                      detail={`${result.voucher_lines_count ?? 0} line(s)`}
                    />
                  ) : (
                    <Row ok skip label="Voucher lines" detail="Not expected for this voucher type" />
                  )}

                  {/* Item ledger */}
                  {result.expected_item_ledger ? (
                    <>
                      <Row
                        ok={(result.item_ledger_count ?? 0) > 0}
                        label="Item ledger entries"
                        detail={`${result.item_ledger_count ?? 0} entry(ies)`}
                      />
                      <Row
                        ok={!!result.lines_match_ledger}
                        label="Lines match ledger"
                        detail={
                          result.lines_match_ledger
                            ? 'Stock movements complete'
                            : `${result.voucher_lines_count} lines vs ${result.item_ledger_count} ledger entries — partial failure`
                        }
                      />
                    </>
                  ) : (
                    <Row ok skip label="Item ledger" detail="No stock impact for this voucher type" />
                  )}

                  {/* Issues list */}
                  {result.issues && result.issues.length > 0 && (
                    <div style={{
                      marginTop: 14,
                      padding: 12,
                      background: 'var(--red-dim)',
                      border: '1px solid var(--red)',
                      borderRadius: 8,
                    }}>
                      <div style={{
                        fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                        color: 'var(--red)', textTransform: 'uppercase',
                        letterSpacing: 0.6, marginBottom: 6,
                      }}>
                        Issues
                      </div>
                      {result.issues.map((issue, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--text)', marginTop: 4 }}>
                          · {issue}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button
                onClick={close}
                style={{
                  background: 'var(--accent)', border: 'none', borderRadius: 8,
                  padding: '8px 18px', fontSize: 12, fontWeight: 700,
                  color: '#000', cursor: 'pointer',
                }}
              >Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function Icon({ ok, large = false }: { ok: boolean; large?: boolean }) {
  const size = large ? 28 : 16
  const color = ok ? 'var(--green)' : 'var(--red)'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: ok ? 'var(--green-dim)' : 'var(--red-dim)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width={size * 0.6} height={size * 0.6} fill="none"
           stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
           viewBox="0 0 24 24">
        {ok
          ? <polyline points="20 6 9 17 4 12" />
          : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
        }
      </svg>
    </div>
  )
}

function Row({ ok, label, detail, skip = false }: { ok: boolean; label: string; detail?: string; skip?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      {skip ? (
        <div style={{
          width: 16, height: 16, borderRadius: '50%',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text3)', fontSize: 9, flexShrink: 0,
        }}>—</div>
      ) : (
        <Icon ok={ok} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {detail && (
          <div style={{
            fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)',
            marginTop: 2, wordBreak: 'break-word',
          }}>{detail}</div>
        )}
      </div>
    </div>
  )
}
