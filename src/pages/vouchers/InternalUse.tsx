// ─── Internal Use Voucher ───────────────────────────────────────────────────
// Records products taken off the shelf for internal use — samples given to
// midwives/influencers, own use by founders/staff, damaged/expired stock,
// training demos, etc.
//
// Accounting behavior:
//   • Dr  5081/5082/5083/5084/5085 Internal Use Expense (by category)
//   • Cr  1110 Inventory
//   • Line amount = cost_price × qty (NOT selling price)
//   • Stock qty decrements on products table
//   • item_ledger_entries row written with entry_type='internal_use'
//   • No customer, no AR, no VAT (self-consumption, not a sale)
//
// The category determines WHICH expense account is debited — so the P&L
// can break out "Sample Expense" vs "Damage & Write-offs" cleanly without
// any reporting gymnastics.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import DraftBanner from '../../components/DraftBanner'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, tzs, getPostedBy } from '../../lib/utils'
import { postLedgerEntry } from '../../lib/itemLedger'
import { useVoucherDraft } from '../../lib/useVoucherDraft'
import { useCategories } from '../../lib/useCategories'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import { checkApprovalRequired, submitForApproval, type ApprovalTypeCode } from '../../lib/useApproval'
import type { Page } from '../../lib/types'

interface Props {
  onNav: (p: Page) => void
}
interface DBProduct {
  id: string; sku: string; name: string; category: string
  cost_price: number; selling_price: number; qty_on_hand: number
}
interface IULine {
  productId: string
  name: string
  qty: number
  unitCost: number       // editable — defaults to product cost_price
  amount: number         // qty × unitCost
}

// ─── Categories ─────────────────────────────────────────────────────────────
// Each category maps to a specific expense account. The UI shows the label;
// the posting logic uses the accountCode to find and debit the right GL.

const CATEGORIES = [
  {
    key: 'sample',
    label: 'Sample / Marketing',
    hint: 'Products given to midwives, influencers, photoshoots, hospitals',
    accountCode: '5081',
    color: '#00e5a0',
  },
  {
    key: 'damage',
    label: 'Damage / Expired',
    hint: 'Stock written off — unsaleable due to damage, expiry, or contamination',
    accountCode: '5082',
    color: '#ef4444',
  },
  {
    key: 'own_use',
    label: 'Own Use',
    hint: 'Founders / staff using the product personally (not deducted from salary)',
    accountCode: '5083',
    color: '#d4874a',
  },
  {
    key: 'training',
    label: 'Training / Demo',
    hint: 'Used during staff training or live customer demonstrations',
    accountCode: '5084',
    color: '#3d8bff',
  },
  {
    key: 'other',
    label: 'Other',
    hint: 'Anything that doesn\'t fit above — requires explanation in notes',
    accountCode: '5085',
    color: '#94a3b8',
  },
] as const

type CategoryKey = typeof CATEGORIES[number]['key']

// ─── Staff list ──────────────────────────────────────────────────────────────
// Hardcoded to the current team. Extend here when new staff join; moving to a
// DB-backed list is a future enhancement (would read from the users table).

const STAFF = ['Joe Gembe', 'Jane Mwatonoka', 'Lilian Mallya', 'Barbra Kabendera', 'Sophia Kipanta', 'Other'] as const

// ─── Component ───────────────────────────────────────────────────────────────

export default function InternalUse({ onNav }: Props) {
  const { user, isSuperAdmin } = useAuth()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [products, setProducts] = useState<DBProduct[]>([])
  const [locations, setLocations] = useState<{ id: string; code: string; name: string }[]>([])
  const [invSettings, setInvSettings] = useState<any>(null)
  const [productSearch, setProductSearch] = useState<Record<number, string | null>>({})
  const { groups, catsByGroup } = useCategories()
  const [filterCat, setFilterCat] = useState('all')

  const [lines, setLines] = useState<IULine[]>([{ productId: '', name: '', qty: 1, unitCost: 0, amount: 0 }])
  const [form, setForm] = useState({
    date: today(),
    ref: '',
    category: 'sample' as CategoryKey,
    takenBy: 'Joe Gembe',
    takenByOther: '',          // only used if takenBy === 'Other'
    recipient: '',             // "Given to Dr Sophia at Aga Khan" etc.
    locationCode: '1001',
    notes: '',
  })
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  // ─── Draft persistence ─────────────────────────────────────────────────
  type IUDraft = { form: typeof form; lines: IULine[] }
  const {
    availableDraft, draftAgeMs,
    saveDraft, clearDraft, acknowledgeResume, discardDraft,
  } = useVoucherDraft<IUDraft>('internal-use', false)

  const resumeDraft = () => {
    if (!availableDraft) return
    setForm(availableDraft.form)
    setLines(availableDraft.lines)
    acknowledgeResume()
  }

  // ─── Initial load ──────────────────────────────────────────────────────

  useEffect(() => {
    loadProducts()
    loadNextRef()
    loadInvSettings()
    supabase.from('stock_locations').select('id,code,name').eq('is_active', true).order('code')
      .then(({ data }) => {
        if (data) {
          setLocations(data)
          if (data[0]) setForm(f => ({ ...f, locationCode: data[0].code }))
        }
      })
  }, [])

  // Auto-save draft — only when user has typed something meaningful.
  useEffect(() => {
    if (!form.ref) return
    const hasAnything =
      form.recipient.trim().length > 0 ||
      form.notes.trim().length > 0 ||
      lines.some(l => l.productId || l.qty !== 1 || l.unitCost > 0)
    if (!hasAnything) return
    saveDraft({ form, lines })
  }, [form, lines, saveDraft])

  const loadProducts = () => {
    supabase.from('products')
      .select('id, sku, name, category, cost_price, selling_price, qty_on_hand')
      .eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setProducts(data) })
  }

  const loadInvSettings = () => {
    supabase.from('system_settings').select('value').eq('key', 'inventory_settings').single()
      .then(({ data }) => { if (data?.value) try { setInvSettings(JSON.parse(data.value)) } catch {} })
  }

  const loadNextRef = async () => {
    const ref = await nextRef('internal_use')
    setForm(f => ({ ...f, ref }))
  }

  // ─── Line helpers ──────────────────────────────────────────────────────

  const updateLine = (i: number, field: keyof IULine, val: string | number) => {
    const nl = [...lines]
    nl[i] = { ...nl[i], [field]: val } as IULine
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) {
        nl[i].name = p.name
        nl[i].unitCost = p.cost_price      // auto-fill from product
      }
    }
    const qty = field === 'qty' ? Number(val) : nl[i].qty
    const cost = field === 'unitCost' ? Number(val) : nl[i].unitCost
    nl[i].amount = Math.round(qty * cost)
    setLines(nl)
  }

  // ─── Totals & derived state ────────────────────────────────────────────

  const total = lines.reduce((s, l) => s + l.amount, 0)
  const activeCategory = CATEGORIES.find(c => c.key === form.category)!
  const resolvedTakenBy = form.takenBy === 'Other' ? form.takenByOther.trim() || 'Other' : form.takenBy
  const filledLines = lines.filter(l => l.productId && l.qty > 0)

  // ─── Validation ────────────────────────────────────────────────────────

  const postDisabledReason = (() => {
    if (filledLines.length === 0) return 'Add at least one product'
    if (total <= 0) return 'Total must be greater than zero'
    if (form.category === 'other' && !form.notes.trim()) return 'Notes required when category is Other'
    if (form.takenBy === 'Other' && !form.takenByOther.trim()) return 'Enter who took the products'
    return undefined
  })()
  const canPost = !postDisabledReason

  // ─── Approval submission ───────────────────────────────────────────────
  // When an internal use voucher needs approval, we create a 'pending_approval'
  // voucher row (no journal, no stock deduction) and an approval_request with
  // the full snapshot. When the approver clicks Approve, the executor reads
  // this payload and posts everything atomically.

  const submitInternalUseForApproval = async (approvalTypeCode: ApprovalTypeCode, reason: string) => {
    if (!user) { showToast('You must be signed in to submit for approval', 'error'); return }

    setPosting(true)
    try {
      // 1. Create pending_approval voucher
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref,
        type: 'internal_use',
        posting_date: form.date,
        description: `Internal Use — ${activeCategory.label} — ${resolvedTakenBy}` + (form.recipient ? ` · ${form.recipient}` : ''),
        total_amount: total,
        subtotal: total,
        status: 'pending_approval',
        notes: form.notes || null,
        posted_by: user.full_name,
      }).select('id').single()
      if (vErr) throw new Error('Pending voucher insert: ' + vErr.message)

      // 2. Create approval request with the full snapshot
      const snapshot = {
        form: {
          date: form.date,
          ref: form.ref,
          category: form.category,
          takenBy: form.takenBy,
          takenByOther: form.takenByOther,
          recipient: form.recipient,
          locationCode: form.locationCode,
          notes: form.notes,
        },
        lines: lines
          .filter(l => l.productId && l.qty > 0)
          .map(l => ({ productId: l.productId, name: l.name, qty: l.qty, unitCost: l.unitCost, amount: l.amount })),
        accountCode: activeCategory.accountCode,
        categoryLabel: activeCategory.label,
        total,
      }

      const res = await submitForApproval({
        typeCode: approvalTypeCode,
        referenceType: 'voucher',
        referenceId: voucher!.id,
        referenceNumber: form.ref,
        summary: `Internal Use · ${activeCategory.label} · ${resolvedTakenBy}${form.recipient ? ' · ' + form.recipient : ''}`,
        requestedValue: total,
        payload: snapshot,
        requestedBy: user.id,
      })

      if (!res.success) {
        // Roll back the voucher row since we couldn't create the approval
        await supabase.from('vouchers').delete().eq('id', voucher!.id)
        throw new Error(res.error || 'Failed to submit for approval')
      }

      clearDraft()
      showToast(`Submitted for approval · ${reason}`, 'success')
      setTimeout(() => resetForm(), 1200)
    } catch (e: any) {
      showToast(e.message || 'Submission failed', 'error')
    } finally {
      setPosting(false)
    }
  }

  // ─── Post ──────────────────────────────────────────────────────────────

  const post = async () => {
    if (!canPost) { showToast(postDisabledReason || 'Form incomplete', 'error'); return }

    const dateCheck = await validatePostingDate(form.date, isSuperAdmin())
    if (!dateCheck.allowed) { showToast(dateCheck.error || 'Date not allowed', 'error'); return }

    // Block if negative stock disallowed and any line exceeds available
    if (invSettings?.block_negative_stock) {
      for (const line of filledLines) {
        const prod = products.find(p => p.id === line.productId)
        if (prod && prod.qty_on_hand < line.qty) {
          showToast(`Insufficient stock: ${prod.name} · Available: ${prod.qty_on_hand}`, 'error')
          return
        }
      }
    }

    // ─── Approval gate ─────────────────────────────────────────────────
    // Internal Use has category-specific approval rules:
    //   - 'own_use'  → approval_type 'internal_use_own'    (always approve by default)
    //   - 'damage'   → approval_type 'internal_use_damage' (amount threshold)
    //   - other      → approval_type 'internal_use'        (off by default unless Joe turns on)
    // Super admin can bypass per setting.
    const approvalTypeCode: ApprovalTypeCode =
      form.category === 'own_use'  ? 'internal_use_own' :
      form.category === 'damage'   ? 'internal_use_damage' :
      'internal_use'

    const check = await checkApprovalRequired(approvalTypeCode, {
      value: total,
      meta: { category: form.category, takenBy: resolvedTakenBy },
    })

    const canBypass = check.superAdminBypass && isSuperAdmin()
    if (check.requiresApproval && check.blockPosting && !canBypass) {
      // Create a 'pending_approval' voucher and an approval_request, then stop.
      await submitInternalUseForApproval(approvalTypeCode, check.reason || 'Approval required')
      return
    }

    setPosting(true)
    try {
      // Resolve the category's expense account and inventory account
      const { data: acctData, error: acctErr } = await supabase
        .from('accounts')
        .select('id, code')
        .in('code', [activeCategory.accountCode, '1110'])

      if (acctErr) throw new Error('Account lookup failed: ' + acctErr.message)
      const expenseAccId = acctData?.find(a => a.code === activeCategory.accountCode)?.id
      const inventoryAccId = acctData?.find(a => a.code === '1110')?.id
      if (!expenseAccId) throw new Error(`Account ${activeCategory.accountCode} not found. Run sql/internal_use_setup.sql first.`)
      if (!inventoryAccId) throw new Error('Inventory account (1110) not found.')

      // 1. Journal header
      const { data: journal, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref,
        posting_date: form.date,
        description: `Internal Use — ${activeCategory.label} — ${resolvedTakenBy}`,
        journal_type: 'internal_use',
        source_type: 'internal_use',
        source_ref: form.ref,
        posted_by: getPostedBy(),
        status: 'posted',
      })
      if (jErr || !journal) throw new Error(jErr?.message || 'Journal insert failed')

      // 2. Journal lines (2-line: Dr expense, Cr inventory)
      const descPrefix = `Internal use · ${activeCategory.label} · ${resolvedTakenBy}`
      const { error: jlErr } = await supabase.from('journal_lines').insert([
        {
          journal_id: journal.id, line_number: 1,
          account_id: expenseAccId,
          description: descPrefix + (form.recipient ? ` · ${form.recipient}` : ''),
          debit: total, credit: 0,
        },
        {
          journal_id: journal.id, line_number: 2,
          account_id: inventoryAccId,
          description: `Inventory out · ${form.ref}`,
          debit: 0, credit: total,
        },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: expenseAccId, p_debit: total, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: inventoryAccId, p_debit: 0, p_credit: total }),
      ])

      // 3. Voucher row
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref,
        type: 'internal_use',
        posting_date: form.date,
        description: `Internal Use — ${activeCategory.label} — ${resolvedTakenBy}` + (form.recipient ? ` · ${form.recipient}` : ''),
        total_amount: total,
        subtotal: total,
        status: 'posted',
        journal_id: journal.id,
        notes: form.notes || null,
        posted_by: getPostedBy(),
      }).select('id').single()
      if (vErr) throw new Error('Voucher insert: ' + vErr.message)

      // 4. Lines + stock deduction + item ledger
      const selectedLoc = locations.find(l => l.code === form.locationCode)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.productId) continue
        const prod = products.find(p => p.id === line.productId)
        if (!prod) continue

        await supabase.from('voucher_lines').insert({
          voucher_id: voucher!.id, line_number: i + 1, product_id: line.productId,
          description: line.name, qty: line.qty, unit_cost: line.unitCost,
          unit_price: line.unitCost,    // for internal use, "unit price" = cost
          subtotal: line.amount, total: line.amount,
        })

        // Deduct stock — uses the RPC if present, otherwise falls back to
        // a straight update. Either way, stock goes down by line.qty.
        await supabase.rpc('deduct_stock_allow_negative', {
          p_product_id: prod.id,
          p_qty: line.qty,
        })

        await postLedgerEntry({
          product_id: line.productId,
          entry_type: 'internal_use',
          document_type: 'internal_use',
          document_ref: form.ref,
          posting_date: form.date,
          qty: -line.qty,              // negative = stock going out
          cost_amount: line.unitCost * line.qty,
          location: selectedLoc || null,
        })

        // Decrement THIS LOCATION's qty so per-location stock stays accurate.
        // The product_locations trigger then recomputes products.qty_on_hand
        // = SUM(all locations), keeping global in sync. Without this, every
        // direct-post internal use silently caused drift.
        if (selectedLoc) {
          const { data: existingLoc } = await supabase.from('product_locations')
            .select('qty_on_hand').eq('product_id', line.productId).eq('location_id', selectedLoc.id).maybeSingle()
          const newLocQty = Math.max(0, (existingLoc?.qty_on_hand ?? 0) - line.qty)
          await supabase.from('product_locations').upsert(
            { product_id: line.productId, location_id: selectedLoc.id, location_code: selectedLoc.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' }
          )
        }
      }

      clearDraft()
      showToast(`${form.ref} posted · Dr ${activeCategory.accountCode} ${activeCategory.label} · Cr 1110 Inventory · ${tzs(total)}`)
      setTimeout(() => resetForm(), 900)
    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  const resetForm = async () => {
    const newRef = await nextRef('internal_use')
    setForm(f => ({
      ...f,
      ref: newRef,
      recipient: '',
      notes: '',
      takenByOther: '',
      // keep: date, category, takenBy, locationCode (likely reused)
    }))
    setLines([{ productId: '', name: '', qty: 1, unitCost: 0, amount: 0 }])
    setProductSearch({})
    loadProducts()   // refresh stock counts
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <VoucherPage
      title="Internal Use"
      icon="M20 7L9 18l-5-5"
      subtitle="Record products consumed internally — samples, own use, damage, training. Posts to the right expense account and deducts stock."
      color="rgba(212,135,74,.12)"
      onPost={post}
      postLabel={posting ? 'Posting…' : 'Post Internal Use'}
      postDisabled={!canPost || posting}
      postDisabledReason={postDisabledReason}
      journalNote={`Dr ${activeCategory.accountCode} ${activeCategory.label} · Cr 1110 Inventory · Stock deducted from ${form.locationCode}`}
      onNav={onNav}
    >
      {/* Draft resume */}
      {availableDraft && draftAgeMs !== null && (
        <DraftBanner draftAgeMs={draftAgeMs} onResume={resumeDraft} onDiscard={discardDraft} />
      )}

      {/* ═══ 1. Category picker ═══════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          Category — what kind of internal use is this?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {CATEGORIES.map(cat => (
            <button key={cat.key} onClick={() => set('category', cat.key)}
              style={{
                background: form.category === cat.key ? `${cat.color}1a` : 'var(--surface2)',
                border: `1px solid ${form.category === cat.key ? cat.color : 'var(--border)'}`,
                borderRadius: 'var(--r)', padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                transition: 'all .15s',
              }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: form.category === cat.key ? cat.color : 'var(--text)', marginBottom: 4 }}>
                {cat.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.45 }}>{cat.hint}</div>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: form.category === cat.key ? cat.color : 'var(--text3)', marginTop: 6 }}>
                → {cat.accountCode}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ 2. Meta + who/where ══════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="form-row">
          <FG label="Voucher Ref" req><input className="form-input" value={form.ref} readOnly /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          <FG label="Stock Location" req>
            <select className="form-input" value={form.locationCode} onChange={e => set('locationCode', e.target.value)}>
              {locations.map(l => <option key={l.id} value={l.code}>{l.code} — {l.name}</option>)}
            </select>
          </FG>
        </div>

        <div className="form-row">
          <FG label="Taken By" req>
            <select className="form-input" value={form.takenBy} onChange={e => set('takenBy', e.target.value)}>
              {STAFF.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </FG>
          {form.takenBy === 'Other' && (
            <FG label="Name" req>
              <input className="form-input" placeholder="Enter name"
                value={form.takenByOther} onChange={e => set('takenByOther', e.target.value)} />
            </FG>
          )}
          <FG label="Recipient / Purpose">
            <input className="form-input" placeholder="e.g. Dr Sophia at Aga Khan, Photoshoot, Training Barbra"
              value={form.recipient} onChange={e => set('recipient', e.target.value)} />
          </FG>
        </div>
      </div>

      {/* ═══ 3. Products ═══════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="card-title" style={{ margin: 0 }}>Products</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={() => setFilterCat('all')} style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 12,
              border: `1px solid ${filterCat === 'all' ? 'var(--accent)' : 'var(--border)'}`,
              background: filterCat === 'all' ? 'var(--accent)' : 'transparent',
              color: filterCat === 'all' ? '#fff' : 'var(--text3)', cursor: 'pointer', fontWeight: 600,
            }}>All</button>
            {groups.map((g: string) => (
              <button key={g} onClick={() => setFilterCat(`group:${g}`)} style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 12,
                border: `1px solid ${filterCat === `group:${g}` ? 'var(--accent)' : 'var(--border)'}`,
                background: filterCat === `group:${g}` ? 'var(--accent-dim)' : 'transparent',
                color: filterCat === `group:${g}` ? 'var(--accent)' : 'var(--text3)', cursor: 'pointer', fontWeight: 600,
              }}>{g}</button>
            ))}
          </div>
        </div>

        <div>
          {lines.map((line, i) => {
            const visibleProducts = filterCat === 'all' ? products
              : filterCat.startsWith('group:') ? products.filter(p => {
                  const grp = filterCat.slice(6)
                  return (catsByGroup[grp] || []).some((c: { name: string }) => c.name === p.category)
                })
              : products.filter(p => p.category === filterCat)
            const selectedProd = products.find(p => p.id === line.productId)
            const search = productSearch[i] ?? null
            const searchMatches = search !== null && search.length > 0
              ? visibleProducts.filter(p =>
                  p.name.toLowerCase().includes(search.toLowerCase()) ||
                  p.sku.toLowerCase().includes(search.toLowerCase())
                ).slice(0, 8)
              : []
            const lowStock = selectedProd && selectedProd.qty_on_hand < line.qty

            return (
              <div key={i} style={{
                background: 'var(--surface2)', border: `1px solid ${lowStock ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 10, padding: 12, marginBottom: 8,
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: line.productId ? 'var(--accent)' : 'var(--surface3)',
                    color: line.productId ? '#fff' : 'var(--text3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 4,
                  }}>{i + 1}</div>

                  <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                    {!selectedProd ? (
                      <>
                        <input className="form-input"
                          placeholder="Search product by name or SKU…"
                          value={search ?? ''}
                          onChange={e => setProductSearch(s => ({ ...s, [i]: e.target.value }))}
                          onFocus={() => setProductSearch(s => ({ ...s, [i]: s[i] ?? '' }))}
                          style={{ fontSize: 13 }} />
                        {searchMatches.length > 0 && (
                          <div style={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                            background: 'var(--surface)', border: '1px solid var(--accent)',
                            borderRadius: 8, zIndex: 40, maxHeight: 260, overflowY: 'auto',
                            boxShadow: '0 10px 30px rgba(0,0,0,.35)',
                          }}>
                            {searchMatches.map(p => (
                              <div key={p.id}
                                onClick={() => {
                                  updateLine(i, 'productId', p.id)
                                  setProductSearch(s => ({ ...s, [i]: null }))
                                }}
                                onMouseDown={e => e.preventDefault()}
                                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                                    {p.sku} · Cost: {tzs(p.cost_price)} · Stock: <span style={{ color: p.qty_on_hand > 0 ? 'var(--green)' : 'var(--red)' }}>{p.qty_on_hand}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{selectedProd.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2, display: 'flex', gap: 10 }}>
                            <span>{selectedProd.sku}</span>
                            <span style={{ color: lowStock ? 'var(--red)' : 'var(--text3)' }}>
                              Stock: {selectedProd.qty_on_hand} {lowStock && '⚠'}
                            </span>
                          </div>
                        </div>
                        <button onClick={() => {
                          const nl = [...lines]
                          nl[i] = { productId: '', name: '', qty: 1, unitCost: 0, amount: 0 }
                          setLines(nl)
                          setProductSearch(s => ({ ...s, [i]: '' }))
                        }} style={{ fontSize: 10, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                          Change
                        </button>
                      </div>
                    )}
                  </div>

                  {lines.length > 1 && (
                    <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
                  )}
                </div>

                {/* Qty/cost/amount row only shown once a product is picked */}
                {selectedProd && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: 10, marginTop: 10, alignItems: 'end' }}>
                    <div>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>Qty</div>
                      <input type="number" className="form-input" min={1}
                        value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)}
                        style={{ width: 72, textAlign: 'center', fontSize: 14, fontWeight: 700 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>
                        Unit Cost
                        <span style={{ color: 'var(--text3)', marginLeft: 6, textTransform: 'none' }}>(from product; editable)</span>
                      </div>
                      <input type="number" className="form-input"
                        value={line.unitCost} onChange={e => updateLine(i, 'unitCost', parseFloat(e.target.value) || 0)}
                        style={{ fontFamily: 'var(--mono)', fontSize: 13, textAlign: 'right' }} />
                    </div>
                    <div style={{ alignSelf: 'end', marginBottom: 10, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>=</div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 2 }}>Line Cost Total</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
                        {tzs(line.amount)}
                      </div>
                    </div>
                  </div>
                )}

                {lowStock && (
                  <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, fontSize: 11, color: 'var(--red)' }}>
                    Requested qty exceeds stock. {invSettings?.block_negative_stock ? 'Posting will be blocked.' : 'Stock will go negative.'}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}
          onClick={() => setLines([...lines, { productId: '', name: '', qty: 1, unitCost: 0, amount: 0 }])}>
          + Add another product
        </button>
      </div>

      {/* ═══ 4. Notes + total ═══════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 100 /* room for sticky footer */ }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          Notes {form.category === 'other' && <span style={{ color: 'var(--red)' }}>*</span>}
          <span style={{ color: 'var(--text3)', marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>
            {form.category === 'other' ? 'Required — explain the reason' : 'Optional — any additional context'}
          </span>
        </div>
        <textarea className="form-input" rows={2} style={{ resize: 'none', fontSize: 12 }}
          placeholder={form.category === 'damage' ? 'Describe damage: water leak, expired batch, etc.'
            : form.category === 'training' ? 'What was being demoed or taught?'
            : form.category === 'other' ? 'Explain the reason for this internal use'
            : 'Any additional context'}
          value={form.notes} onChange={e => set('notes', e.target.value)} />

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '2px solid var(--accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>TOTAL COST</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>TZS {total.toLocaleString()}</span>
        </div>
      </div>

      {/* ═══ Sticky footer ═══════════════════════════════════════════════ */}
      <div style={{
        position: 'fixed', bottom: 0, left: 'var(--sidebar-w, 240px)', right: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, zIndex: 30, boxShadow: '0 -8px 24px rgba(0,0,0,.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Cost</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>
              TZS {total.toLocaleString()}
            </div>
          </div>
          <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {postDisabledReason ? (
              <span style={{ color: 'var(--yellow)' }}>⚠ {postDisabledReason}</span>
            ) : (
              <>
                <span style={{ color: 'var(--green)' }}>✓ Ready to post</span>
                <span style={{ color: 'var(--text3)', marginLeft: 8 }}>
                  · {filledLines.length} product{filledLines.length === 1 ? '' : 's'} · {activeCategory.label}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={post}
          disabled={!canPost || posting}
          style={{
            padding: '12px 24px', fontSize: 14, fontWeight: 800,
            opacity: (!canPost || posting) ? 0.5 : 1,
            cursor: (!canPost || posting) ? 'not-allowed' : 'pointer',
          }}>
          {posting ? 'Posting…' : 'Post Internal Use'}
        </button>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
