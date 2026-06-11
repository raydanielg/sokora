// ════════════════════════════════════════════════════════════════════════════
// CashCustomerDetail.tsx
//
// CRM-focused detail view for B2C / cash customers (moms, end-consumers).
// Built for retention, loyalty, and marketing — not credit collection.
//
// Replaces the credit-focused detail panel for cash customers only.
// Wholesale customers (customer_type = 'debtor') keep the existing detail.
//
// Data source: customer_metrics, customer_auto_tags, customer_top_products views
// (created in migration 013). Plus direct queries to vouchers + voucher_lines
// for the purchase history tab.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tzs } from '../../lib/utils'
import Toast from '../../components/Toast'
import type { Page } from '../../lib/types'

interface Props {
  customerId: string
  onBack: () => void
  onViewStatement?: (id: string) => void
  onNav?: (p: Page) => void  // for "Send template" jumping to crm-whatsapp-templates
}

interface Metrics {
  customer_id: string
  customer_number: string
  name: string
  whatsapp: string | null
  segment: string
  crown_points: number
  edd: string | null
  edd_source: string | null
  delivery_date: string | null
  ttc_duration: string | null
  birthday: string | null
  first_purchase_at: string | null
  visit_count: number
  lifetime_value: number
  avg_basket: number
  biggest_basket: number
  first_visit: string | null
  last_visit: string | null
  days_since_last: number | null
  visits_per_30d: number
  lifecycle_stage: string
  life_stage: 'ttc' | 'pregnancy' | 'postpartum' | 'parenting' | null
  days_to_edd: number | null
  baby_age_months: number | null
}

interface Purchase {
  // One row per (cash sale × product line). Multiple lines from the same
  // sale share the same voucher_id, posting_date, and ref — the renderer
  // groups them visually so the date/ref shows once per voucher.
  voucher_id: string
  ref: string
  posting_date: string
  voucher_total: number     // total for the whole cash sale
  line_number: number       // for stable ordering within a voucher
  product_name: string
  qty: number
  line_total: number        // post-discount line total
}

interface TopProduct {
  product_id: string
  product_name: string
  product_sku: string
  times_purchased: number
  total_qty: number
  total_spent: number
  last_purchased: string
  avg_gap_days: number | null
  predicted_next: string | null
}

interface CustomerRow {
  id: string
  manual_tags: string[] | null
  internal_notes: string | null
  // Journey anchor fields (source of truth — view derives lifecycle_stage from these)
  edd: string | null
  delivery_date: string | null
  ttc_duration: string | null
  pregnancy_stage: string | null
  // Stage management
  life_stage: 'ttc' | 'pregnancy' | 'postpartum' | 'parenting' | null
  relationship_stage:
    | 'inquiry' | 'onboarding' | 'check_in' | 'crown' | 'sokora_ambassador' | 're_engagement'
    | null
  owner_user_id: string | null
  stage_paused: boolean
  stage_paused_reason: string | null
  stage_paused_at: string | null
  // Ambassador
  ambassador_code: string | null
}

interface StageHistoryEntry {
  id: string
  customer_id: string
  from_life_stage: string | null
  to_life_stage: string | null
  changed_at: string
  changed_by: string | null
  reason: string | null
}

interface CrownAwardCatalogEntry {
  reason_code: string
  label: string
  description: string | null
  default_points: number
  requires_approval: boolean
  approval_threshold: number | null
  is_active: boolean
  icon: string | null
}

interface AppUser {
  id: string
  full_name: string | null
  email: string | null
}

const STAGE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  unknown:           { label: 'Stage unknown',          emoji: '❓', color: '#6b7280' },
  pre_pregnancy:     { label: 'Pre-pregnancy',          emoji: '🌸', color: '#a78bfa' },
  first_trimester:   { label: 'First trimester',        emoji: '🌱', color: '#10b981' },
  second_trimester:  { label: 'Second trimester',       emoji: '🌿', color: '#10b981' },
  third_trimester:   { label: 'Third trimester',        emoji: '🤰', color: '#f59e0b' },
  newborn_0_4w:      { label: 'Newborn (0–4 weeks)',    emoji: '👶', color: '#ec4899' },
  baby_1_3m:         { label: 'Baby (1–3 months)',      emoji: '🍼', color: '#ec4899' },
  baby_3_6m:         { label: 'Baby (3–6 months)',      emoji: '🍼', color: '#ec4899' },
  baby_6_12m:        { label: 'Baby (6–12 months)',     emoji: '🥄', color: '#06b6d4' },
  toddler_1_2y:      { label: 'Toddler (1–2 years)',    emoji: '🚶', color: '#06b6d4' },
  toddler_2_3y:      { label: 'Toddler (2–3 years)',    emoji: '🧸', color: '#3b82f6' },
  past_3y:           { label: 'Past 3 years',           emoji: '📚', color: '#6b7280' },
}

const RECENCY_COLORS: Record<string, string> = {
  recent:        '#10b981',
  engaged:       '#10b981',
  first_time:    '#a78bfa',
  lapsing:       '#f59e0b',
  lapsed:        '#ef4444',
  churned:       '#dc2626',
  inactive:      '#6b7280',
  never_purchased: '#6b7280',
}

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const buildWhatsAppLink = (whatsapp: string | null, message: string) => {
  if (!whatsapp) return null
  // Normalize: drop leading 0, add 255 country code
  let n = whatsapp.replace(/\D/g, '')
  if (n.startsWith('0')) n = n.substring(1)
  if (n.length === 9) n = '255' + n
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`
}

export default function CashCustomerDetail({ customerId, onBack, onViewStatement, onNav }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [autoTags, setAutoTags] = useState<string[]>([])
  const [customerRow, setCustomerRow] = useState<CustomerRow | null>(null)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [waTemplate, setWaTemplate] = useState(
    'Habari {name} 🌸, salama? Ni muda wa kuongeza {product} tena. Naomba ujibu hapa.'
  )

  const [activeTab, setActiveTab] = useState<'overview' | 'purchases' | 'top_products' | 'discounts' | 'notes' | 'wa_history'>('overview')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  // EDD modal state
  const [showEddModal, setShowEddModal] = useState(false)
  const [eddInput, setEddInput] = useState('')
  const [savingEdd, setSavingEdd] = useState(false)

  // Notes editing
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  // Tag editor
  const [newTagInput, setNewTagInput] = useState('')

  // Stage management
  const [stageHistory, setStageHistory] = useState<StageHistoryEntry[]>([])
  const [crownCatalog, setCrownCatalog] = useState<CrownAwardCatalogEntry[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [stageRefreshNonce, setStageRefreshNonce] = useState(0)

  useEffect(() => { loadAll() }, [customerId, stageRefreshNonce])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([
      loadMetrics(),
      loadAutoTags(),
      loadCustomerRow(),
      loadPurchases(),
      loadTopProducts(),
      loadWaTemplate(),
      loadStageHistory(),
      loadCrownCatalog(),
      loadUsers(),
    ])
    setLoading(false)
  }

  // Called by child panels after they save changes
  const refreshStageData = () => setStageRefreshNonce(n => n + 1)

  const loadMetrics = async () => {
    const { data } = await supabase
      .from('customer_metrics')
      .select('*')
      .eq('customer_id', customerId)
      .maybeSingle()
    if (data) setMetrics(data as Metrics)
  }

  const loadAutoTags = async () => {
    const { data } = await supabase
      .from('customer_auto_tags')
      .select('tag')
      .eq('customer_id', customerId)
    if (data) setAutoTags(data.map((r: { tag: string }) => r.tag))
  }

  const loadCustomerRow = async () => {
    const { data } = await supabase
      .from('customers')
      .select(`
        id, manual_tags, internal_notes,
        edd, delivery_date, ttc_duration, pregnancy_stage,
        life_stage, relationship_stage, owner_user_id,
        stage_paused, stage_paused_reason, stage_paused_at,
        ambassador_code
      `)
      .eq('id', customerId)
      .maybeSingle()
    if (data) {
      setCustomerRow(data as CustomerRow)
      setNotesDraft(data.internal_notes || '')
    }
  }

  const loadStageHistory = async () => {
    const { data } = await supabase
      .from('customer_stage_history')
      .select('*')
      .eq('customer_id', customerId)
      .order('changed_at', { ascending: false })
      .limit(20)
    if (data) setStageHistory(data as StageHistoryEntry[])
  }

  const loadCrownCatalog = async () => {
    const { data } = await supabase
      .from('crown_manual_award_catalog')
      .select('*')
      .eq('is_active', true)
      .order('label')
    if (data) setCrownCatalog(data as CrownAwardCatalogEntry[])
  }

  const loadUsers = async () => {
    // Pull staff list for the Owner picker.
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name')
    if (data) setUsers(data as AppUser[])
  }

  const loadPurchases = async () => {
    type VoucherRow = { id: string; ref: string; posting_date: string; total_amount: number }
    type LineRow = { voucher_id: string; line_number: number; description: string | null; qty: number; total: number | null }

    // Pull this customer's cash sales (most recent first).
    const { data: vouchersData } = await supabase
      .from('vouchers')
      .select('id, ref, posting_date, total_amount')
      .eq('customer_id', customerId)
      .eq('type', 'cash_sale')
      .eq('status', 'posted')
      .order('posting_date', { ascending: false })
      .limit(50)
    const vouchers = (vouchersData ?? []) as VoucherRow[]

    if (vouchers.length === 0) { setPurchases([]); return }

    // Pull all line items for those sales in one go, then expand into
    // one row per (voucher × line). The renderer groups them visually.
    const ids = vouchers.map((v: VoucherRow) => v.id)
    const { data: linesData } = await supabase
      .from('voucher_lines')
      .select('voucher_id, line_number, description, qty, total')
      .in('voucher_id', ids)
      .order('voucher_id', { ascending: false })
      .order('line_number', { ascending: true })
    const lines = (linesData ?? []) as LineRow[]

    if (lines.length === 0) { setPurchases([]); return }

    // Index voucher metadata for quick lookup
    const voucherById: Record<string, VoucherRow> = {}
    for (const v of vouchers) voucherById[v.id] = v

    const expanded: Purchase[] = lines
      .map((l: LineRow) => {
        const v = voucherById[l.voucher_id]
        if (!v) return null
        return {
          voucher_id:    v.id,
          ref:           v.ref,
          posting_date:  v.posting_date,
          voucher_total: v.total_amount,
          line_number:   l.line_number,
          product_name:  l.description || '—',
          qty:           l.qty,
          line_total:    l.total ?? 0,
        } as Purchase
      })
      .filter((p): p is Purchase => p !== null)
      // Sort: most recent voucher first (vouchers already came back desc, but
      // the join may have shuffled). Within voucher, by line_number ascending.
      .sort((a: Purchase, b: Purchase) => {
        const dateCmp = b.posting_date.localeCompare(a.posting_date)
        if (dateCmp !== 0) return dateCmp
        const refCmp = b.ref.localeCompare(a.ref)
        if (refCmp !== 0) return refCmp
        return a.line_number - b.line_number
      })

    setPurchases(expanded)
  }

  const loadTopProducts = async () => {
    const { data } = await supabase
      .from('customer_top_products')
      .select('*')
      .eq('customer_id', customerId)
      .order('total_spent', { ascending: false })
      .limit(20)
    if (data) setTopProducts(data as TopProduct[])
  }

  const loadWaTemplate = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'crm_reorder_whatsapp_template')
      .maybeSingle()
    if (data?.value) {
      try {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
        if (parsed?.template) setWaTemplate(parsed.template)
      } catch { /* keep default */ }
    }
  }

  // Auto-pop EDD modal once per session if customer is engaged but EDD not set
  useEffect(() => {
    if (!metrics || loading) return
    if (metrics.edd) return
    if ((metrics.visit_count ?? 0) < 2) return
    const sessionKey = `edd_prompt_shown_${customerId}`
    if (sessionStorage.getItem(sessionKey)) return
    sessionStorage.setItem(sessionKey, '1')
    setShowEddModal(true)
  }, [metrics, loading, customerId])

  const saveEdd = async () => {
    if (!eddInput) {
      setToast('Pick a date'); setToastType('error'); return
    }
    setSavingEdd(true)
    const { error } = await supabase
      .from('customers')
      .update({
        edd: eddInput,
        edd_source: metrics?.edd ? 'manual_edit' : 'manual_edit',
        edd_captured_at: new Date().toISOString(),
      })
      .eq('id', customerId)
    setSavingEdd(false)

    if (error) {
      setToast('Save failed: ' + error.message); setToastType('error'); return
    }
    setToast('EDD saved'); setToastType('success')
    setShowEddModal(false)
    setEddInput('')
    loadMetrics()
  }

  const saveNotes = async () => {
    setSavingNotes(true)
    const { error } = await supabase
      .from('customers')
      .update({ internal_notes: notesDraft })
      .eq('id', customerId)
    setSavingNotes(false)
    if (error) {
      setToast('Save failed: ' + error.message); setToastType('error'); return
    }
    setToast('Notes saved'); setToastType('success')
    loadCustomerRow()
  }

  const addManualTag = async () => {
    const tag = newTagInput.trim().toLowerCase().replace(/\s+/g, '_')
    if (!tag) return
    const current = customerRow?.manual_tags || []
    if (current.includes(tag)) {
      setNewTagInput(''); return
    }
    const next = [...current, tag]
    const { error } = await supabase
      .from('customers')
      .update({ manual_tags: next })
      .eq('id', customerId)
    if (error) {
      setToast('Failed to add tag: ' + error.message); setToastType('error'); return
    }
    setNewTagInput('')
    loadCustomerRow()
  }

  const removeManualTag = async (tag: string) => {
    const next = (customerRow?.manual_tags || []).filter(t => t !== tag)
    const { error } = await supabase
      .from('customers')
      .update({ manual_tags: next })
      .eq('id', customerId)
    if (error) {
      setToast('Failed to remove: ' + error.message); setToastType('error'); return
    }
    loadCustomerRow()
  }

  // ─── Computed ───────────────────────────────────────────────────────────

  const recencyTag = useMemo(() => {
    return autoTags.find(t => RECENCY_COLORS[t]) || 'inactive'
  }, [autoTags])

  const spendTier = useMemo(() => {
    if (autoTags.includes('top_10pct')) return { label: 'Top 10%', color: '#facc15' }
    if (autoTags.includes('top_25pct')) return { label: 'Top 25%', color: '#a78bfa' }
    return null
  }, [autoTags])

  const stageInfo = metrics ? STAGE_LABELS[metrics.lifecycle_stage] || STAGE_LABELS.unknown : STAGE_LABELS.unknown
  const recencyColor = RECENCY_COLORS[recencyTag] || '#6b7280'

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading || !metrics) {
    return (
      <div style={{ padding: 40, color: 'var(--text3)' }}>Loading customer…</div>
    )
  }

  const sendWhatsAppFor = (productName: string) => {
    const msg = waTemplate
      .replace(/\{name\}/g, metrics.name)
      .replace(/\{product\}/g, productName)
      .replace(/\{stage\}/g, stageInfo.label)
    const url = buildWhatsAppLink(metrics.whatsapp, msg)
    if (!url) {
      setToast('Customer has no WhatsApp number'); setToastType('error'); return
    }
    window.open(url, '_blank')
  }

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1200 }}>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
            color: 'var(--text)', fontSize: 12, fontWeight: 600,
          }}
        >← Back</button>

        {/* Send WhatsApp template — opens the templates page with this
            customer pre-selected via the sessionStorage shuttle. Hidden
            when onNav isn't available (defensive). */}
        {onNav && (
          <button
            onClick={() => {
              sessionStorage.setItem('wa_template_target_customer', JSON.stringify({
                id:               metrics.customer_id,
                name:             metrics.name,
                whatsapp:         metrics.whatsapp,
                phone:            metrics.whatsapp,  // metrics view only has whatsapp; fine
                ambassador_code:  customerRow?.ambassador_code ?? null,
                life_stage:       customerRow?.life_stage ?? null,
                edd:              customerRow?.edd ?? null,
                delivery_date:    customerRow?.delivery_date ?? null,
                crown_points:     metrics.crown_points ?? 0,
                stage_paused:     customerRow?.stage_paused ?? false,
              }))
              onNav('crm-whatsapp-templates')
            }}
            style={{
              background: '#25d36620', border: '1px solid #25d366',
              borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
              color: '#25d366', fontSize: 12, fontWeight: 700,
            }}
            title="Open WhatsApp templates with this customer pre-selected"
          >📱 Send template</button>
        )}

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 28 }}>{metrics.name}</h1>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
              {metrics.customer_number || '—'}
            </span>
            <span style={{
              fontSize: 9, fontFamily: 'var(--mono)', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 4, background: 'var(--surface2)',
              color: 'var(--text3)', letterSpacing: 0.6,
            }}>{metrics.segment}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Tag color={recencyColor} icon="🔵">{recencyTag.replace(/_/g, ' ')}</Tag>
            {spendTier && <Tag color={spendTier.color} icon="💰">{spendTier.label}</Tag>}
            <Tag color={stageInfo.color} icon={stageInfo.emoji}>{stageInfo.label}</Tag>
            {autoTags.includes('frequent_buyer') && <Tag color="#10b981" icon="⚡">Frequent buyer</Tag>}
            {autoTags.includes('crown_gold')   && <Tag color="#facc15" icon="👑">Crown Gold</Tag>}
            {autoTags.includes('crown_silver') && <Tag color="#94a3b8" icon="👑">Crown Silver</Tag>}
            {autoTags.includes('crown_bronze') && <Tag color="#a16207" icon="👑">Crown Bronze</Tag>}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>
            📱 {metrics.whatsapp || '—'} · Customer since {formatDate(metrics.first_purchase_at || metrics.first_visit)}
          </div>
        </div>
      </div>

      {/* ─── KPI Strip ──────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 14, marginBottom: 18,
      }}>
        <Kpi label="Lifetime Value"   value={tzs(metrics.lifetime_value)} accent="var(--accent)" />
        <Kpi label="Visits"           value={String(metrics.visit_count)} />
        <Kpi label="Avg Basket"       value={tzs(metrics.avg_basket)} />
        <Kpi label="Days Since Last"  value={metrics.days_since_last !== null ? `${metrics.days_since_last}` : '—'}
             accent={metrics.days_since_last !== null && metrics.days_since_last > 60 ? 'var(--red)' : undefined} />
        <Kpi label="Crown Points"     value={String(metrics.crown_points || 0)} accent="#facc15" />
        <Kpi
          label={metrics.days_to_edd && metrics.days_to_edd > 0 ? 'Days to EDD' : 'Baby Age'}
          value={
            metrics.edd
              ? (metrics.days_to_edd && metrics.days_to_edd > 0
                  ? `${metrics.days_to_edd} d`
                  : metrics.baby_age_months !== null ? `${metrics.baby_age_months} mo` : '—')
              : 'Not set'
          }
          accent={metrics.edd ? '#ec4899' : 'var(--text3)'}
          onClick={() => { setEddInput(metrics.edd || ''); setShowEddModal(true) }}
        />
      </div>

      {/* ─── Tabs ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {[
          { k: 'overview',     label: 'Overview' },
          { k: 'purchases',    label: `Purchases (${metrics.visit_count})` },
          { k: 'top_products', label: 'Top Products & Reorder' },
          { k: 'discounts',    label: 'Discounts' },
          { k: 'notes',        label: 'Notes & Tags' },
          { k: 'wa_history',   label: 'WhatsApp History' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setActiveTab(t.k as any)}
            style={{
              background: 'transparent', border: 'none',
              padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              color: activeTab === t.k ? 'var(--accent)' : 'var(--text3)',
              borderBottom: activeTab === t.k ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ─── Tab Content ────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <OverviewTab
          metrics={metrics}
          customer={customerRow}
          purchases={purchases}
          topProducts={topProducts}
          autoTags={autoTags}
          users={users}
          stageHistory={stageHistory}
          crownCatalog={crownCatalog}
          onStageSaved={refreshStageData}
          onViewStatement={onViewStatement ? () => onViewStatement(customerId) : undefined}
        />
      )}

      {activeTab === 'purchases' && (
        <PurchasesTab purchases={purchases} />
      )}

      {activeTab === 'top_products' && (
        <TopProductsTab
          products={topProducts}
          onWhatsApp={sendWhatsAppFor}
          hasWhatsApp={!!metrics.whatsapp}
        />
      )}

      {activeTab === 'discounts' && (
        <DiscountsTab customerId={customerId} />
      )}

      {activeTab === 'notes' && (
        <NotesTab
          notes={notesDraft}
          onChangeNotes={setNotesDraft}
          onSaveNotes={saveNotes}
          savingNotes={savingNotes}
          manualTags={customerRow?.manual_tags || []}
          autoTags={autoTags}
          newTagInput={newTagInput}
          onChangeNewTag={setNewTagInput}
          onAddTag={addManualTag}
          onRemoveTag={removeManualTag}
        />
      )}

      {activeTab === 'wa_history' && (
        <WhatsAppHistoryTab customerId={customerId} />
      )}

      {/* ─── EDD Modal ──────────────────────────────────────────── */}
      {showEddModal && (
        <div
          onClick={() => setShowEddModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 16, width: '100%', maxWidth: 440, padding: 24,
            }}
          >
            <h3 style={{ margin: '0 0 6px 0', fontFamily: 'var(--display)', fontSize: 20 }}>
              Expected Delivery Date
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 12, color: 'var(--text3)' }}>
              When is {metrics.name} due? Setting this unlocks pregnancy + baby-age based recommendations.
              You can change it anytime.
            </p>

            <input
              type="date"
              value={eddInput}
              onChange={e => setEddInput(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', marginBottom: 16,
                fontFamily: 'var(--mono)',
              }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEddModal(false)}
                disabled={savingEdd}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 14px', fontSize: 12,
                  color: 'var(--text)', cursor: 'pointer', fontWeight: 600,
                }}
              >Skip</button>
              <button
                onClick={saveEdd}
                disabled={savingEdd || !eddInput}
                style={{
                  background: 'var(--accent)', border: 'none',
                  borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700,
                  color: '#000', cursor: savingEdd ? 'wait' : 'pointer',
                  opacity: !eddInput ? 0.5 : 1,
                }}
              >{savingEdd ? 'Saving…' : 'Save EDD'}</button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} type={toastType} onClose={() => setToast('')} />
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────

function Tag({ children, color, icon }: { children: React.ReactNode; color: string; icon?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700,
      background: color + '20', color, textTransform: 'uppercase', letterSpacing: 0.5,
      fontFamily: 'var(--mono)',
    }}>
      {icon && <span>{icon}</span>}
      {children}
    </span>
  )
}

function Kpi({ label, value, accent, onClick }: { label: string; value: string; accent?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 700, color: accent || 'var(--text)',
        fontFamily: 'var(--display)',
      }}>{value}</div>
    </div>
  )
}

// ─── Overview Tab ────────────────────────────────────────────────────────

function OverviewTab({
  metrics, customer, purchases, topProducts, autoTags,
  users, stageHistory, crownCatalog, onStageSaved, onViewStatement,
}: {
  metrics: Metrics
  customer: CustomerRow | null
  purchases: Purchase[]
  topProducts: TopProduct[]
  autoTags: string[]
  users: AppUser[]
  stageHistory: StageHistoryEntry[]
  crownCatalog: CrownAwardCatalogEntry[]
  onStageSaved: () => void
  onViewStatement?: () => void
}) {
  const overdueCount = topProducts.filter(p =>
    p.predicted_next && new Date(p.predicted_next) < new Date()
  ).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ─── DATA MISSING BANNER ─────────────────────────────────── */}
      <DataMissingBanner metrics={metrics} customer={customer} />

      {/* ─── STAGE PANEL (full width, top of page) ───────────────── */}
      <StagePanel
        metrics={metrics}
        customer={customer}
        users={users}
        crownCatalog={crownCatalog}
        onSaved={onStageSaved}
      />

      {/* ─── Existing two-column grid: Actions + Snapshot ──────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={panelStyle}>
        <h4 style={panelTitleStyle}>Recommended Actions</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {overdueCount > 0 && (
            <ActionRow
              icon="📦"
              text={`${overdueCount} product${overdueCount > 1 ? 's' : ''} overdue for reorder — see Top Products tab`}
              tone="warning"
            />
          )}
          {!metrics.edd && (metrics.visit_count >= 2) && (
            <ActionRow
              icon="🤰"
              text="No EDD set — ask her if she's expecting and capture due date"
              tone="info"
            />
          )}
          {(metrics.days_since_last ?? 0) > 60 && metrics.visit_count > 1 && (
            <ActionRow
              icon="⏰"
              text={`Hasn't bought in ${metrics.days_since_last} days — re-engagement message overdue`}
              tone="warning"
            />
          )}
          {autoTags.includes('top_10pct') && (
            <ActionRow icon="⭐" text="Top 10% spender — consider Crown loyalty upgrade" tone="success" />
          )}
          {metrics.lifecycle_stage === 'newborn_0_4w' && (
            <ActionRow icon="👶" text="Newborn stage — recommend nipple cream, breast pads, perineal care" tone="info" />
          )}
          {metrics.lifecycle_stage === 'baby_3_6m' && (
            <ActionRow icon="🍼" text="Baby 3–6m — weaning bowls, feeding spoons coming up" tone="info" />
          )}
          {metrics.visit_count === 0 && (
            <ActionRow icon="🆕" text="Hasn't purchased yet — onboarding outreach" tone="info" />
          )}
        </div>
      </div>

      <div style={panelStyle}>
        <h4 style={panelTitleStyle}>Snapshot</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <SnapshotRow label="First visit"  value={formatDate(metrics.first_visit)} />
          <SnapshotRow label="Last visit"   value={formatDate(metrics.last_visit)} />
          <SnapshotRow label="Biggest basket" value={tzs(metrics.biggest_basket)} />
          <SnapshotRow label="Frequency"   value={`${metrics.visits_per_30d.toFixed(1)} / 30d`} />
          <SnapshotRow label="EDD"         value={metrics.edd ? formatDate(metrics.edd) : 'Not set'} />
          <SnapshotRow label="Birthday"    value={formatDate(metrics.birthday)} />
        </div>
        {onViewStatement && (
          <button
            onClick={onViewStatement}
            style={{
              marginTop: 14, width: '100%',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px', fontSize: 11, fontWeight: 600,
              color: 'var(--text)', cursor: 'pointer',
            }}
          >View full statement →</button>
        )}
      </div>

      <div style={{ ...panelStyle, gridColumn: '1 / -1' }}>
        <h4 style={panelTitleStyle}>Recent Activity</h4>
        {purchases.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
            No purchases yet
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {/* purchases is now line-level — aggregate back to voucher level
                for the activity feed (one entry per visit). */}
            {aggregateByVoucher(purchases).slice(0, 5).map(v => (
              <div key={v.voucher_id} style={timelineRow}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{v.ref}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {formatDate(v.posting_date)} · {v.line_count} item{v.line_count !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
                  {tzs(v.voucher_total)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
      {/* ─── end inner two-column grid ─────────────────────────── */}

      {/* ─── STAGE HISTORY TIMELINE ────────────────────────────── */}
      <StageHistoryTimeline history={stageHistory} users={users} />

    </div>
  )
}

// Aggregate line-level purchases back to one row per voucher for activity feed
function aggregateByVoucher(lines: Purchase[]): {
  voucher_id: string
  ref: string
  posting_date: string
  voucher_total: number
  line_count: number
}[] {
  const byVoucher: Record<string, {
    voucher_id: string
    ref: string
    posting_date: string
    voucher_total: number
    line_count: number
  }> = {}
  for (const line of lines) {
    if (!byVoucher[line.voucher_id]) {
      byVoucher[line.voucher_id] = {
        voucher_id:    line.voucher_id,
        ref:           line.ref,
        posting_date:  line.posting_date,
        voucher_total: line.voucher_total,
        line_count:    0,
      }
    }
    byVoucher[line.voucher_id].line_count += 1
  }
  // Already sorted by date desc in loadPurchases, so iteration order preserves that
  const seen = new Set<string>()
  const out: typeof byVoucher[string][] = []
  for (const line of lines) {
    if (seen.has(line.voucher_id)) continue
    seen.add(line.voucher_id)
    out.push(byVoucher[line.voucher_id])
  }
  return out
}

// ─── Purchases Tab ───────────────────────────────────────────────────────
// Line-level view: one row per (cash sale × product line). Date and ref
// merge visually across rows from the same sale via rowSpan.

function PurchasesTab({ purchases }: { purchases: Purchase[] }) {
  if (purchases.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No purchases yet</div>
  }

  // Pre-compute how many lines belong to each voucher so the first row of
  // each group spans rowSpan=N for the date/ref cells.
  const linesByVoucher: Record<string, number> = {}
  for (const p of purchases) {
    linesByVoucher[p.voucher_id] = (linesByVoucher[p.voucher_id] || 0) + 1
  }

  // Track which voucher we're rendering — only render date/ref on first line
  const renderedVouchers = new Set<string>()

  return (
    <div style={panelStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Ref</th>
            <th style={thStyle}>Product</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((p, i) => {
            const isFirstLineOfVoucher = !renderedVouchers.has(p.voucher_id)
            if (isFirstLineOfVoucher) renderedVouchers.add(p.voucher_id)
            const rowSpan = linesByVoucher[p.voucher_id]

            // Visual: top border on first line of each new voucher group;
            // light border between lines within the same voucher.
            const isLastLineOfVoucher =
              i === purchases.length - 1 || purchases[i + 1].voucher_id !== p.voucher_id

            const rowStyle: React.CSSProperties = {
              borderBottom: isLastLineOfVoucher
                ? '1px solid var(--border)'
                : '1px dashed rgba(255,255,255,.06)',
            }

            return (
              <tr key={`${p.voucher_id}-${p.line_number}`} style={rowStyle}>
                {isFirstLineOfVoucher && (
                  <>
                    <td
                      rowSpan={rowSpan}
                      style={{
                        ...tdStyle,
                        verticalAlign: 'top',
                        borderRight: '1px solid var(--border)',
                        background: 'var(--surface2)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatDate(p.posting_date)}
                    </td>
                    <td
                      rowSpan={rowSpan}
                      style={{
                        ...tdStyle,
                        verticalAlign: 'top',
                        borderRight: '1px solid var(--border)',
                        background: 'var(--surface2)',
                        fontFamily: 'var(--mono)',
                        color: 'var(--accent)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div>{p.ref}</div>
                      {rowSpan > 1 && (
                        <div style={{
                          fontSize: 10, fontWeight: 400, color: 'var(--text3)',
                          marginTop: 4,
                        }}>
                          {tzs(p.voucher_total)} · {rowSpan} items
                        </div>
                      )}
                    </td>
                  </>
                )}
                <td style={tdStyle}>{p.product_name}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.qty}</td>
                <td style={{
                  ...tdStyle,
                  textAlign: 'right',
                  fontFamily: 'var(--mono)',
                  fontWeight: 700,
                }}>
                  {tzs(p.line_total)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Top Products Tab ────────────────────────────────────────────────────

function TopProductsTab({ products, onWhatsApp, hasWhatsApp }: {
  products: TopProduct[]
  onWhatsApp: (productName: string) => void
  hasWhatsApp: boolean
}) {
  if (products.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No purchase history yet</div>
  }
  return (
    <div style={panelStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={thStyle}>Product</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Times</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Spent</th>
            <th style={thStyle}>Last</th>
            <th style={thStyle}>Avg Gap</th>
            <th style={thStyle}>Predicted Next</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => {
            const isOverdue = p.predicted_next && new Date(p.predicted_next) < new Date()
            const isDueSoon = p.predicted_next && !isOverdue &&
              (new Date(p.predicted_next).getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000
            return (
              <tr key={p.product_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600 }}>{p.product_name}</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{p.product_sku}</div>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.times_purchased}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                  {tzs(p.total_spent)}
                </td>
                <td style={tdStyle}>{formatDate(p.last_purchased)}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--mono)' }}>
                  {p.avg_gap_days ? `${p.avg_gap_days} d` : '—'}
                </td>
                <td style={{
                  ...tdStyle,
                  color: isOverdue ? 'var(--red)' : isDueSoon ? '#f59e0b' : 'var(--text)',
                  fontWeight: (isOverdue || isDueSoon) ? 700 : 400,
                }}>
                  {p.predicted_next ? formatDate(p.predicted_next) : '—'}
                  {isOverdue && <span style={{ marginLeft: 6, fontSize: 9 }}>⚠ OVERDUE</span>}
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => onWhatsApp(p.product_name)}
                    disabled={!hasWhatsApp}
                    title={hasWhatsApp ? 'Send WhatsApp' : 'No WhatsApp number'}
                    style={{
                      background: '#25d36620', border: '1px solid #25d366',
                      borderRadius: 6, padding: '4px 10px', cursor: hasWhatsApp ? 'pointer' : 'not-allowed',
                      fontSize: 11, color: '#25d366', fontWeight: 600,
                      opacity: hasWhatsApp ? 1 : 0.4,
                    }}
                  >📱 Send</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Discounts Tab ───────────────────────────────────────────────────────

function DiscountsTab({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState({ saved: 0, count: 0 })

  useEffect(() => {
    (async () => {
      type DiscVoucher = { id: string; ref: string; posting_date: string }
      type DiscLine = {
        voucher_id: string; description: string | null; qty: number;
        unit_price: number | null; discount_pct: number | null;
        subtotal: number | null; total: number | null;
      }
      setLoading(true)
      // Pull voucher_lines with discount > 0 joined to vouchers (this customer's cash sales)
      const { data: vouchersData } = await supabase
        .from('vouchers')
        .select('id, ref, posting_date')
        .eq('customer_id', customerId)
        .eq('type', 'cash_sale')
        .eq('status', 'posted')
        .order('posting_date', { ascending: false })
      const vouchers = (vouchersData ?? []) as DiscVoucher[]

      if (vouchers.length === 0) {
        setRows([]); setLoading(false); return
      }

      const ids = vouchers.map((v: DiscVoucher) => v.id)
      const { data: linesData } = await supabase
        .from('voucher_lines')
        .select('voucher_id, description, qty, unit_price, discount_pct, subtotal, total')
        .in('voucher_id', ids)
      const lines = (linesData ?? []) as DiscLine[]

      const discounted = lines.filter((l: DiscLine) => (l.discount_pct || 0) > 0)
      const byVoucher: Record<string, DiscVoucher> = {}
      for (const v of vouchers) byVoucher[v.id] = v

      let totalSaved = 0
      const built = discounted.map((l: DiscLine) => {
        const v = byVoucher[l.voucher_id]
        const saved = (l.subtotal || 0) - (l.total || 0)
        totalSaved += saved
        return {
          ref: v?.ref,
          posting_date: v?.posting_date,
          description: l.description,
          qty: l.qty,
          discount_pct: l.discount_pct,
          subtotal: l.subtotal,
          total: l.total,
          saved,
        }
      })

      setRows(built)
      setTotals({ saved: totalSaved, count: discounted.length })
      setLoading(false)
    })()
  }, [customerId])

  if (loading) return <div style={{ padding: 40, color: 'var(--text3)' }}>Loading…</div>
  if (rows.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No discounts given to this customer yet</div>
  }

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14,
      }}>
        <Kpi label="Total saved by customer" value={tzs(totals.saved)} accent="#10b981" />
        <Kpi label="Discounted purchases"    value={String(totals.count)} />
      </div>

      <div style={panelStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle}>Ref</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Item</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Discount %</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Saved</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...tdStyle, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{r.ref}</td>
                <td style={tdStyle}>{formatDate(r.posting_date)}</td>
                <td style={tdStyle}>{r.description}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                  {r.discount_pct}%
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', color: '#10b981', fontWeight: 700 }}>
                  {tzs(r.saved)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Notes Tab ───────────────────────────────────────────────────────────

function NotesTab({
  notes, onChangeNotes, onSaveNotes, savingNotes,
  manualTags, autoTags,
  newTagInput, onChangeNewTag, onAddTag, onRemoveTag,
}: {
  notes: string
  onChangeNotes: (v: string) => void
  onSaveNotes: () => void
  savingNotes: boolean
  manualTags: string[]
  autoTags: string[]
  newTagInput: string
  onChangeNewTag: (v: string) => void
  onAddTag: () => void
  onRemoveTag: (t: string) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={panelStyle}>
        <h4 style={panelTitleStyle}>Internal Notes</h4>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '4px 0 10px' }}>
          Visible to staff only. Use for personal context, preferences, allergies, family notes, etc.
        </p>
        <textarea
          value={notes}
          onChange={e => onChangeNotes(e.target.value)}
          placeholder="e.g. Prefers pickup in Sinza · Loves Folic Acid · Follow up after delivery"
          rows={6}
          style={{
            width: '100%', padding: '10px 12px', fontSize: 12,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text)', resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={onSaveNotes}
          disabled={savingNotes}
          style={{
            marginTop: 10,
            background: 'var(--accent)', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 12, fontWeight: 700,
            color: '#000', cursor: savingNotes ? 'wait' : 'pointer',
          }}
        >{savingNotes ? 'Saving…' : 'Save Notes'}</button>
      </div>

      <div style={panelStyle}>
        <h4 style={panelTitleStyle}>Tags</h4>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '4px 0 10px' }}>
          Auto tags (computed from data) on top, your manual tags below.
        </p>

        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
          }}>Auto tags ({autoTags.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {autoTags.length === 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>None</span>}
            {autoTags.map(t => (
              <span key={t} style={{
                fontSize: 10, fontFamily: 'var(--mono)', padding: '3px 8px',
                background: 'var(--surface2)', borderRadius: 4, color: 'var(--text3)',
              }}>{t}</span>
            ))}
          </div>
        </div>

        <div>
          <div style={{
            fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
          }}>Manual tags ({manualTags.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {manualTags.map(t => (
              <span key={t} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 10, fontFamily: 'var(--mono)', padding: '3px 4px 3px 8px',
                background: 'var(--accent)', borderRadius: 4, color: '#000', fontWeight: 700,
              }}>
                {t}
                <button
                  onClick={() => onRemoveTag(t)}
                  style={{
                    background: 'rgba(0,0,0,.2)', border: 'none', borderRadius: 3,
                    width: 14, height: 14, cursor: 'pointer', padding: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: '#000', fontSize: 11,
                  }}
                >×</button>
              </span>
            ))}
            {manualTags.length === 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>None yet</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={newTagInput}
              onChange={e => onChangeNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onAddTag() }}
              placeholder="e.g. vip, flagged, callback"
              style={{
                flex: 1, padding: '6px 10px', fontSize: 11,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text)',
              }}
            />
            <button
              onClick={onAddTag}
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 600,
                color: 'var(--text)', cursor: 'pointer',
              }}
            >Add</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function ActionRow({ icon, text, tone }: { icon: string; text: string; tone: 'success' | 'warning' | 'info' }) {
  const colors = {
    success: { bg: '#10b98120', fg: '#10b981' },
    warning: { bg: '#f59e0b20', fg: '#f59e0b' },
    info:    { bg: '#3b82f620', fg: '#3b82f6' },
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: 10, borderRadius: 8,
      background: colors[tone].bg,
      borderLeft: `2px solid ${colors[tone].fg}`,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{text}</div>
    </div>
  )
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
}

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--display)',
  fontSize: 14,
  fontWeight: 700,
}

const thStyle: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'var(--mono)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text3)',
  textAlign: 'left',
  padding: '8px 12px',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 12,
  color: 'var(--text)',
}

const timelineRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 0',
  borderBottom: '1px solid var(--border)',
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE PANEL — full-width editor at top of Overview
// ═══════════════════════════════════════════════════════════════════════════

const PAUSE_REASONS = [
  { code: 'pregnancy_loss',     label: 'Pregnancy loss' },
  { code: 'stillbirth',          label: 'Stillbirth / infant loss' },
  { code: 'medical_pause',       label: 'Medical / health concern' },
  { code: 'customer_request',    label: 'Customer requested pause' },
  { code: 'unreachable',         label: 'Unreachable / inactive' },
  { code: 'other',               label: 'Other (see notes)' },
]

const LIFE_STAGE_OPTIONS: Array<{ value: 'ttc'|'pregnancy'|'postpartum'|'parenting'|''; label: string }> = [
  { value: '',           label: 'Not yet classified' },
  { value: 'ttc',        label: 'TTC (trying to conceive)' },
  { value: 'pregnancy',  label: 'Pregnancy' },
  { value: 'postpartum', label: 'Postpartum (first 6 weeks)' },
  { value: 'parenting',  label: 'Parenting' },
]

const RELATIONSHIP_STAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '',                   label: 'Not set' },
  { value: 'inquiry',            label: 'Inquiry' },
  { value: 'onboarding',         label: 'Onboarding' },
  { value: 'check_in',           label: 'Check-in (active customer)' },
  { value: 'crown',              label: 'Crown member' },
  { value: 'sokora_ambassador',  label: 'SOKORA Ambassador' },
  { value: 're_engagement',      label: 'Re-engagement' },
]

// ────────────────────────────────────────────────────────────────────────
// WhatsApp History tab — shows every send_log entry for this customer,
// most recent first. Each row links the template (if it still exists),
// when, by whom, and the merged body that was sent. Useful for Brenda to
// see at a glance: "When did we last reach out to her?"
// ────────────────────────────────────────────────────────────────────────
function WhatsAppHistoryTab({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Array<{
    id: string
    sent_at: string
    sent_by: string | null
    sent_by_name: string | null
    merged_body: string
    template_id: string | null
    template_name: string | null
    template_category: string | null
  }>>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const run = async () => {
      // Pull log + join template name/category. We rely on the FK
      // relationship for template_id; for sent_by we fetch names in a
      // second query because users live in a different schema in some
      // Supabase setups.
      const { data: logs, error } = await supabase
        .from('whatsapp_send_log')
        .select('id, sent_at, sent_by, merged_body, template_id, whatsapp_templates(name, category)')
        .eq('customer_id', customerId)
        .order('sent_at', { ascending: false })
        .limit(100)
      if (error) {
        console.error('WA history load failed:', error.message)
        if (!cancelled) { setRows([]); setLoading(false) }
        return
      }

      // Collect sent_by user ids to look up display names in one go
      const userIds = Array.from(new Set((logs ?? []).map((l: any) => l.sent_by).filter(Boolean)))
      let userNames: Record<string, string> = {}
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, email')
          .in('id', userIds)
        for (const u of (users ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
          userNames[u.id] = u.full_name || u.email || u.id.slice(0, 8)
        }
      }

      if (!cancelled) {
        setRows((logs ?? []).map((l: any) => ({
          id: l.id,
          sent_at: l.sent_at,
          sent_by: l.sent_by,
          sent_by_name: l.sent_by ? (userNames[l.sent_by] || null) : null,
          merged_body: l.merged_body,
          template_id: l.template_id,
          template_name: l.whatsapp_templates?.name ?? null,
          template_category: l.whatsapp_templates?.category ?? null,
        })))
        setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [customerId])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading WhatsApp history…</div>
  }

  if (rows.length === 0) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: 'var(--text3)',
        background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 12,
      }}>
        No WhatsApp messages logged yet for this customer.
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)',
        textTransform: 'uppercase', letterSpacing: 1,
      }}>
        {rows.length} message{rows.length === 1 ? '' : 's'} logged
      </div>
      {rows.map(r => {
        const isExpanded = expandedId === r.id
        return (
          <div key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <div
              onClick={() => setExpandedId(isExpanded ? null : r.id)}
              style={{
                padding: '12px 16px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {r.template_name || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>Template removed</span>}
                  </div>
                  {r.template_category && (
                    <span style={{
                      fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 6px',
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5,
                      color: 'var(--text3)',
                    }}>{r.template_category.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                  {new Date(r.sent_at).toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                  {r.sent_by_name && ` · by ${r.sent_by_name}`}
                </div>
              </div>
              <span style={{ fontSize: 14, color: 'var(--text3)' }}>{isExpanded ? '▼' : '▶'}</span>
            </div>
            {isExpanded && (
              <div style={{
                padding: '12px 16px', background: 'var(--surface2)',
                fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                borderTop: '1px solid var(--border)', fontFamily: 'system-ui, sans-serif',
              }}>
                {r.merged_body}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StagePanel({
  metrics, customer, users, crownCatalog, onSaved,
}: {
  metrics: Metrics
  customer: CustomerRow | null
  users: AppUser[]
  crownCatalog: CrownAwardCatalogEntry[]
  onSaved: () => void
}) {
  // Local form state. Initialised from customer; reset when customer changes.
  const [lifeStage, setLifeStage] = useState<string>('')
  const [relationshipStage, setRelationshipStage] = useState<string>('')
  const [edd, setEdd] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [ttcDuration, setTtcDuration] = useState('')
  const [pregnancyStage, setPregnancyStage] = useState('')
  const [ownerUserId, setOwnerUserId] = useState<string>('')
  const [stagePaused, setStagePaused] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCrownModal, setShowCrownModal] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  // Sync local state when customer row changes (e.g. after refresh).
  useEffect(() => {
    if (!customer) return
    setLifeStage(customer.life_stage ?? '')
    setRelationshipStage(customer.relationship_stage ?? '')
    setEdd(customer.edd ?? '')
    setDeliveryDate(customer.delivery_date ?? '')
    setTtcDuration(customer.ttc_duration ?? '')
    setPregnancyStage(customer.pregnancy_stage ?? '')
    setOwnerUserId(customer.owner_user_id ?? '')
    setStagePaused(customer.stage_paused ?? false)
    setPauseReason(customer.stage_paused_reason ?? '')
  }, [customer])

  if (!customer) return null

  // Has the form drifted from the saved state?
  const dirty =
    lifeStage !== (customer.life_stage ?? '') ||
    relationshipStage !== (customer.relationship_stage ?? '') ||
    edd !== (customer.edd ?? '') ||
    deliveryDate !== (customer.delivery_date ?? '') ||
    ttcDuration !== (customer.ttc_duration ?? '') ||
    pregnancyStage !== (customer.pregnancy_stage ?? '') ||
    ownerUserId !== (customer.owner_user_id ?? '') ||
    stagePaused !== (customer.stage_paused ?? false) ||
    pauseReason !== (customer.stage_paused_reason ?? '')

  const handleSave = async () => {
    setSaving(true)
    try {
      // Build update payload. Empty strings → NULL.
      const payload: Record<string, unknown> = {
        life_stage:         lifeStage || null,
        relationship_stage: relationshipStage || null,
        edd:                edd || null,
        delivery_date:      deliveryDate || null,
        ttc_duration:       ttcDuration || null,
        pregnancy_stage:    pregnancyStage || null,
        owner_user_id:      ownerUserId || null,
        stage_paused:       stagePaused,
        stage_paused_reason: stagePaused ? (pauseReason || null) : null,
        stage_paused_at:    stagePaused && !customer.stage_paused
          ? new Date().toISOString()
          : (stagePaused ? customer.stage_paused_at : null),
      }
      // Note: the BEFORE UPDATE trigger trg_customers_stage_change in migration 007
      // automatically writes a row to customer_stage_history when life_stage changes,
      // captures previous_life_stage, and increments graduation_count / pregnancy_count.
      const { error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', customer.id)
      if (error) {
        setToastType('error')
        setToast(`Save failed: ${error.message}`)
      } else {
        setToastType('success')
        setToast('Stage saved')
        onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (!customer) return
    setLifeStage(customer.life_stage ?? '')
    setRelationshipStage(customer.relationship_stage ?? '')
    setEdd(customer.edd ?? '')
    setDeliveryDate(customer.delivery_date ?? '')
    setTtcDuration(customer.ttc_duration ?? '')
    setPregnancyStage(customer.pregnancy_stage ?? '')
    setOwnerUserId(customer.owner_user_id ?? '')
    setStagePaused(customer.stage_paused ?? false)
    setPauseReason(customer.stage_paused_reason ?? '')
  }

  const fieldStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 4,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
    textTransform: 'uppercase', color: 'var(--text3)',
  }
  const inputStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '6px 8px', fontSize: 12, color: 'var(--text)',
  }

  return (
    <div style={{ ...panelStyle, borderLeft: '3px solid var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ ...panelTitleStyle, margin: 0 }}>Mom Stage & Ownership</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>

          {/* Ambassador code chip — copy share message to clipboard on click */}
          {customer.ambassador_code && (
            <button
              onClick={() => {
                const message =
                  `Hujambo dada! 💕\n\n` +
                  `Tumia code yangu ${customer.ambassador_code} ukinunua bidhaa za SOKORA. ` +
                  `Tutapata zawadi sote!\n\n` +
                  `Tafuta Your Organization kwenye WhatsApp au Instagram.`
                navigator.clipboard.writeText(message)
                setCodeCopied(true)
                setTimeout(() => setCodeCopied(false), 2000)
              }}
              title="Click to copy a Swanglish share message with this code"
              style={{
                background: 'rgba(94,168,162,.12)', color: 'var(--accent)',
                border: '1px solid rgba(94,168,162,.4)', borderRadius: 6,
                padding: '6px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--mono)', letterSpacing: 0.5, display: 'flex',
                alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ opacity: 0.7 }}>CODE</span> {customer.ambassador_code}
              <span style={{ fontSize: 10 }}>{codeCopied ? '✓' : '📋'}</span>
            </button>
          )}

          <div style={{
            fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)',
          }}>
            Computed: <span style={{ color: 'var(--accent)' }}>
              {STAGE_LABELS[metrics.lifecycle_stage]?.label ?? metrics.lifecycle_stage}
            </span>
          </div>
          <button
            onClick={() => setShowCrownModal(true)}
            style={{
              background: 'rgba(200,169,110,.15)', color: '#C8A96E',
              border: '1px solid #C8A96E', borderRadius: 6,
              padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            👑 Award Crown Points
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>

        {/* Row 1: Life stage + EDD + Delivery date */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Life Stage</label>
          <select
            value={lifeStage}
            onChange={e => setLifeStage(e.target.value)}
            style={inputStyle}
          >
            {LIFE_STAGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Expected Due Date (EDD)</label>
          <input
            type="date"
            value={edd}
            onChange={e => setEdd(e.target.value)}
            style={inputStyle}
            disabled={lifeStage === 'ttc' || lifeStage === ''}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Delivery Date (actual)</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={e => setDeliveryDate(e.target.value)}
            style={inputStyle}
            disabled={lifeStage === 'ttc' || lifeStage === 'pregnancy' || lifeStage === ''}
          />
        </div>

        {/* Row 2: TTC duration + Pregnancy stage display + Owner */}
        <div style={fieldStyle}>
          <label style={labelStyle}>TTC Duration (free text)</label>
          <input
            type="text"
            value={ttcDuration}
            placeholder={lifeStage === 'ttc' ? 'e.g. 6_months, 1_year' : '—'}
            onChange={e => setTtcDuration(e.target.value)}
            style={inputStyle}
            disabled={lifeStage !== 'ttc'}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Display Descriptor (receipts)</label>
          <input
            type="text"
            value={pregnancyStage}
            placeholder="e.g. 28 weeks pregnant, 3 months postpartum"
            onChange={e => setPregnancyStage(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Owner (CRM contact person)</label>
          <select
            value={ownerUserId}
            onChange={e => setOwnerUserId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Unassigned (default: Brenda)</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
        </div>

        {/* Row 3: Relationship stage */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Relationship Stage</label>
          <select
            value={relationshipStage}
            onChange={e => setRelationshipStage(e.target.value)}
            style={inputStyle}
          >
            {RELATIONSHIP_STAGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Row 3 cols 2-3: Pause toggle */}
        <div style={{ ...fieldStyle, gridColumn: 'span 2' }}>
          <label style={labelStyle}>Sensitive Pause</label>
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center',
            background: stagePaused ? 'rgba(255,71,87,.08)' : 'var(--surface)',
            border: `1px solid ${stagePaused ? 'rgba(255,71,87,.4)' : 'var(--border)'}`,
            borderRadius: 6, padding: '6px 10px',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={stagePaused}
                onChange={e => setStagePaused(e.target.checked)}
              />
              Pause this profile
            </label>
            {stagePaused && (
              <select
                value={pauseReason}
                onChange={e => setPauseReason(e.target.value)}
                style={{ ...inputStyle, flex: 1, padding: '4px 6px' }}
              >
                <option value="">Select reason…</option>
                {PAUSE_REASONS.map(r => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            )}
            {stagePaused && (
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                Pausing stops all automations. Only Brenda/Jane may respond personally.
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Save / cancel buttons */}
      {dirty && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button
            onClick={handleCancel}
            disabled={saving}
            style={{
              background: 'transparent', color: 'var(--text3)',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}

      {showCrownModal && (
        <CrownAwardModal
          customerId={customer.id}
          catalog={crownCatalog}
          onClose={() => setShowCrownModal(false)}
          onAwarded={() => {
            setShowCrownModal(false)
            onSaved()
            setToastType('success')
            setToast('Crown points awarded')
          }}
        />
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA MISSING BANNER — flags edge cases needing classification
// ═══════════════════════════════════════════════════════════════════════════

function DataMissingBanner({
  metrics, customer,
}: { metrics: Metrics; customer: CustomerRow | null }) {
  if (!customer) return null

  const today = new Date()
  const issues: string[] = []

  // EDD passed without delivery_date being entered
  if (customer.edd && !customer.delivery_date) {
    const eddDate = new Date(customer.edd)
    if (eddDate < today) {
      const daysPast = Math.floor((today.getTime() - eddDate.getTime()) / 86400000)
      issues.push(
        `EDD was ${customer.edd} (${daysPast} day${daysPast === 1 ? '' : 's'} ago) and no delivery date is recorded. Capture the actual delivery date.`
      )
    }
  }

  // life_stage set but no anchor data (e.g. pregnancy with no EDD)
  if (customer.life_stage === 'pregnancy' && !customer.edd) {
    issues.push('Classified as Pregnancy but EDD is missing. Capture due date.')
  }
  if ((customer.life_stage === 'postpartum' || customer.life_stage === 'parenting') && !customer.delivery_date) {
    issues.push(`Classified as ${customer.life_stage} but delivery date is missing.`)
  }
  if (customer.life_stage === 'ttc' && !customer.ttc_duration) {
    issues.push('Classified as TTC but duration is missing. Add how long she\'s been trying.')
  }

  // Active customer with 2+ visits and no life_stage classified
  if (!customer.life_stage && metrics.visit_count >= 2) {
    issues.push(`Active customer (${metrics.visit_count} visits) but life stage is not yet classified.`)
  }

  if (issues.length === 0) return null

  return (
    <div style={{
      background: 'rgba(245,158,11,.08)',
      border: '1px solid rgba(245,158,11,.35)',
      borderRadius: 8,
      padding: '10px 14px',
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 18 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
          Data missing
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {issues.map((msg, i) => (
            <li key={i} style={{ fontSize: 12, color: 'var(--text)' }}>• {msg}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE HISTORY TIMELINE — collapsible list of past stage changes
// ═══════════════════════════════════════════════════════════════════════════

function StageHistoryTimeline({
  history, users,
}: { history: StageHistoryEntry[]; users: AppUser[] }) {
  const [expanded, setExpanded] = useState(false)
  if (history.length === 0) return null

  const userById = new Map(users.map(u => [u.id, u]))
  const stageLabel = (s: string | null) => {
    if (!s) return 'Unclassified'
    return LIFE_STAGE_OPTIONS.find(o => o.value === s)?.label ?? s
  }

  return (
    <div style={panelStyle}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
          padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <h4 style={{ ...panelTitleStyle, margin: 0 }}>
          Stage History ({history.length})
        </h4>
        <span style={{ fontSize: 14, color: 'var(--text3)' }}>{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.map(h => {
            const user = h.changed_by ? userById.get(h.changed_by) : null
            return (
              <div key={h.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 10px', background: 'var(--surface)',
                borderRadius: 6, fontSize: 12,
              }}>
                <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10, minWidth: 110 }}>
                  {new Date(h.changed_at).toLocaleString()}
                </span>
                <span style={{ color: 'var(--text)' }}>
                  <span style={{ color: 'var(--text3)' }}>{stageLabel(h.from_life_stage)}</span>
                  <span style={{ color: 'var(--accent)', margin: '0 8px' }}>→</span>
                  <span style={{ fontWeight: 700 }}>{stageLabel(h.to_life_stage)}</span>
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                  {user ? (user.full_name || user.email) : 'System'}
                </span>
                {h.reason && (
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>
                    {h.reason}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CROWN AWARD MODAL — manual Crown points with approval routing
// ═══════════════════════════════════════════════════════════════════════════

function CrownAwardModal({
  customerId, catalog, onClose, onAwarded,
}: {
  customerId: string
  catalog: CrownAwardCatalogEntry[]
  onClose: () => void
  onAwarded: () => void
}) {
  const [reasonCode, setReasonCode] = useState<string>(catalog[0]?.reason_code ?? '')
  const [points, setPoints] = useState<number>(catalog[0]?.default_points ?? 0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const selected = catalog.find(c => c.reason_code === reasonCode) ?? null

  // When reason changes, snap points to its default
  useEffect(() => {
    if (selected) setPoints(selected.default_points)
  }, [reasonCode]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    setSaving(true)
    setErrMsg(null)
    try {
      // award_crown_points() RPC handles approval routing based on the catalog's
      // requires_approval flag and the configured manual_approval_threshold.
      const { error } = await supabase.rpc('award_crown_points', {
        p_customer_id: customerId,
        p_points:      points,
        p_reason_code: reasonCode,
        p_reason_note: note || null,
      })
      if (error) {
        setErrMsg(error.message)
      } else {
        onAwarded()
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  // Note: requires approval if either the catalog entry says so OR points are
  // unusually high (the DB function compares against crm_settings threshold).
  const willRouteToApproval =
    (selected?.requires_approval ?? false) || points >= 500

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, maxWidth: 480, width: '90vw',
        }}
      >
        <h3 style={{ margin: '0 0 16px 0', color: '#C8A96E', display: 'flex', alignItems: 'center', gap: 8 }}>
          👑 Award Crown Points
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Reason</label>
            <select
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
              style={{
                width: '100%', marginTop: 4, padding: '8px 10px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 12, color: 'var(--text)',
              }}
            >
              {catalog.map(c => (
                <option key={c.reason_code} value={c.reason_code}>
                  {c.label} ({c.default_points} pts{c.requires_approval ? ' · needs approval' : ''})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Points</label>
            <input
              type="number"
              value={points}
              onChange={e => setPoints(Number(e.target.value))}
              style={{
                width: '100%', marginTop: 4, padding: '8px 10px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 14, fontWeight: 700, color: '#C8A96E',
                fontFamily: 'var(--mono)',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Note (optional)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="Context for this award…"
              style={{
                width: '100%', marginTop: 4, padding: '8px 10px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 12, color: 'var(--text)', resize: 'vertical',
              }}
            />
          </div>

          {willRouteToApproval && (
            <div style={{
              background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)',
              borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#f59e0b',
            }}>
              ⚠️ This award will be routed for approval before points are credited.
            </div>
          )}

          {errMsg && (
            <div style={{
              background: 'rgba(255,71,87,.1)', border: '1px solid rgba(255,71,87,.3)',
              borderRadius: 6, padding: '8px 10px', fontSize: 11, color: 'var(--red)',
            }}>
              {errMsg}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              background: 'transparent', color: 'var(--text3)',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '8px 16px', fontSize: 12, cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !reasonCode || points <= 0}
            style={{
              background: '#C8A96E', color: '#fff', border: 'none',
              borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >{saving ? 'Awarding…' : willRouteToApproval ? 'Request Approval' : 'Award Points'}</button>
        </div>
      </div>
    </div>
  )
}
