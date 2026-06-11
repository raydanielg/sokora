// ════════════════════════════════════════════════════════════════════════════
// WhatsAppTemplates.tsx
//
// Single-page UI for the WhatsApp Templates feature. Three modes:
//
//   1. LIST — browse, search, filter by category, see use stats. Click
//      a row to edit, or click the "Send" button on a row to launch the
//      sender directly with that template pre-selected.
//
//   2. EDITOR — modal for creating / editing a template. Includes a live
//      preview against a sample customer, placeholder reference panel,
//      and category + is_transactional toggle.
//
//   3. SENDER — modal where staff picks a customer (or arrives with one
//      pre-selected from a customer detail page), sees the merged
//      message preview with any empty-placeholder warnings, and clicks
//      "Open WhatsApp Web". The URL opens in a new tab; clicking the
//      button also logs to whatsapp_send_log.
//
// External entry points:
//   • CRM hub → WhatsApp Templates page (default state: LIST)
//   • Customer detail → "Send template" button → opens this page in
//     SENDER mode with the customer pre-selected (we pass it through
//     URL/state; for now we use a localStorage shuttle since the app
//     navigates by Page enum, not URL params)
//
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'
import {
  CATEGORY_LABELS, CATEGORY_ORDER, PLACEHOLDERS,
  mergeTemplate, buildWhatsAppUrl, extractUsedPlaceholders,
  TEMPLATE_BODY_WARN_LENGTH, TEMPLATE_BODY_MAX_LENGTH,
  type WhatsAppTemplate, type TemplateCategory, type MergeCustomer,
} from '../../lib/whatsappTemplates'

interface Props {
  onNav?: (p: Page) => void
}

// Sample customer used by the editor's live preview. Mirrors the placeholder
// catalog's "sample" values so the editor preview matches the documentation.
const SAMPLE_CUSTOMER: MergeCustomer = {
  id: 'sample',
  name: 'Mama Amina Hassan',
  whatsapp: '+255712345678',
  phone: '+255712345678',
  ambassador_code: 'MAL-AMINHAS37',
  life_stage: 'pregnancy',
  edd: (() => {
    // EDD that gives ~28 weeks pregnant when previewed
    const d = new Date()
    d.setDate(d.getDate() + 12 * 7)  // 12 weeks from now → 28 weeks pregnant
    return d.toISOString().slice(0, 10)
  })(),
  delivery_date: null,
  crown_points: 1250,
  stage_paused: false,
}


export default function WhatsAppTemplates({ onNav }: Props) {
  void onNav
  const { user } = useAuth()

  // ─── List state ──────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<TemplateCategory | 'all'>('all')

  // Resource URL map by slug. Loaded once and passed to mergeTemplate so
  // {{resource:slug}} placeholders resolve to public URLs in previews and
  // sent messages. Only is_public=true resources are eligible.
  const [resourceUrls, setResourceUrls] = useState<Record<string, string>>({})

  // ─── Editor modal state ──────────────────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTemplate, setEditorTemplate] = useState<WhatsAppTemplate | null>(null)
  const [editorSaving, setEditorSaving] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)

  // ─── Sender modal state ──────────────────────────────────────────────
  const [senderOpen, setSenderOpen] = useState(false)
  const [senderTemplateId, setSenderTemplateId] = useState<string | null>(null)
  const [senderCustomer, setSenderCustomer] = useState<MergeCustomer | null>(null)
  const [senderSending, setSenderSending] = useState(false)
  const [customerSearchQ, setCustomerSearchQ] = useState('')
  const [customerSearchResults, setCustomerSearchResults] = useState<MergeCustomer[]>([])
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false)

  // ─── Initial load ─────────────────────────────────────────────────────
  useEffect(() => { loadTemplates(); loadResources() }, [])

  const loadResources = async () => {
    const { data } = await supabase
      .from('whatsapp_resources')
      .select('slug, public_url, is_public, is_active')
      .eq('is_public', true)
      .eq('is_active', true)
    const map: Record<string, string> = {}
    for (const r of (data ?? []) as Array<{ slug: string; public_url: string }>) {
      map[r.slug] = r.public_url
    }
    setResourceUrls(map)
  }

  // Document URLs supplied by the source page (e.g. CustomerStatement
  // generates a statement PDF and stashes the signed URL here). Merged
  // into the template via the resourceUrls map under exact key names:
  // 'statement_url', 'invoice_url', 'receipt_url', etc.
  const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({})

  // Preferred template category to pre-filter the picker (e.g. when
  // arriving from CustomerStatement we want to show 'statement' and
  // 'payment_reminder' templates near the top).
  const [preferredCategory, setPreferredCategory] = useState<TemplateCategory | null>(null)

  // Check for a customer pre-selected from CashCustomerDetail. We use
  // sessionStorage as a one-shot shuttle because the app navigates by
  // Page enum (not URL params). Clear after read so it doesn't re-fire.
  useEffect(() => {
    const raw = sessionStorage.getItem('wa_template_target_customer')
    if (raw) {
      sessionStorage.removeItem('wa_template_target_customer')
      try {
        const c = JSON.parse(raw) as MergeCustomer
        setSenderCustomer(c)
        setSenderOpen(true)
      } catch { /* ignore malformed */ }
    }

    // Document URLs (statement, invoice, receipt PDFs generated upstream)
    const docRaw = sessionStorage.getItem('wa_template_document_urls')
    if (docRaw) {
      sessionStorage.removeItem('wa_template_document_urls')
      try {
        const urls = JSON.parse(docRaw) as Record<string, string>
        setDocumentUrls(urls)
      } catch { /* ignore */ }
    }

    // Preferred category for picker pre-filter
    const catRaw = sessionStorage.getItem('wa_template_preferred_category')
    if (catRaw) {
      sessionStorage.removeItem('wa_template_preferred_category')
      setPreferredCategory(catRaw as TemplateCategory)
    }
  }, [])

  const loadTemplates = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })
    if (error) {
      console.warn('Load templates failed:', error.message)
      setTemplates([])
    } else {
      setTemplates((data ?? []) as WhatsAppTemplate[])
    }
    setLoading(false)
  }

  // ─── Filtered list (memoized) ────────────────────────────────────────
  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return templates.filter(t => {
      if (!t.is_active && filterCategory !== 'all') return false
      if (filterCategory !== 'all' && t.category !== filterCategory) return false
      if (q && !t.name.toLowerCase().includes(q) && !t.body.toLowerCase().includes(q)) return false
      return true
    })
  }, [templates, search, filterCategory])

  // ─── Editor handlers ─────────────────────────────────────────────────
  const openEditor = (t: WhatsAppTemplate | null) => {
    if (t) {
      setEditorTemplate({ ...t })
    } else {
      // New template scaffold
      setEditorTemplate({
        id:               '',
        name:             '',
        category:         'general',
        body:             '',
        is_transactional: false,
        is_active:        true,
        use_count:        0,
        last_used_at:     null,
        created_at:       '',
        updated_at:       '',
      })
    }
    setEditorError(null)
    setEditorOpen(true)
  }

  const saveTemplate = async () => {
    if (!editorTemplate) return
    setEditorError(null)

    // Validation
    if (!editorTemplate.name.trim()) {
      setEditorError('Name is required')
      return
    }
    if (!editorTemplate.body.trim()) {
      setEditorError('Body is required')
      return
    }
    if (editorTemplate.body.length > TEMPLATE_BODY_MAX_LENGTH) {
      setEditorError(`Body too long (${editorTemplate.body.length} chars). Keep under ${TEMPLATE_BODY_MAX_LENGTH}.`)
      return
    }

    setEditorSaving(true)

    if (editorTemplate.id) {
      // Update
      const { error } = await supabase
        .from('whatsapp_templates')
        .update({
          name:             editorTemplate.name.trim(),
          category:         editorTemplate.category,
          body:             editorTemplate.body,
          is_transactional: editorTemplate.is_transactional,
          is_active:        editorTemplate.is_active,
          updated_at:       new Date().toISOString(),
        })
        .eq('id', editorTemplate.id)
      if (error) {
        setEditorError(error.message); setEditorSaving(false); return
      }
    } else {
      // Insert
      const { error } = await supabase
        .from('whatsapp_templates')
        .insert({
          name:             editorTemplate.name.trim(),
          category:         editorTemplate.category,
          body:             editorTemplate.body,
          is_transactional: editorTemplate.is_transactional,
          is_active:        editorTemplate.is_active,
          created_by:       user?.id ?? null,
        })
      if (error) {
        setEditorError(error.message); setEditorSaving(false); return
      }
    }

    setEditorSaving(false)
    setEditorOpen(false)
    setEditorTemplate(null)
    loadTemplates()
  }

  const deleteTemplate = async () => {
    if (!editorTemplate?.id) return
    if (!confirm(`Delete template "${editorTemplate.name}"? This cannot be undone.`)) return
    const { error } = await supabase
      .from('whatsapp_templates')
      .delete()
      .eq('id', editorTemplate.id)
    if (error) {
      setEditorError(error.message); return
    }
    setEditorOpen(false)
    setEditorTemplate(null)
    loadTemplates()
  }

  // ─── Sender handlers ─────────────────────────────────────────────────
  const openSender = (templateId: string | null) => {
    setSenderTemplateId(templateId)
    if (!senderCustomer) {
      setCustomerSearchQ('')
      setCustomerSearchResults([])
    }
    setSenderOpen(true)
  }

  const closeSender = () => {
    setSenderOpen(false)
    setSenderTemplateId(null)
    setSenderCustomer(null)
    setCustomerSearchQ('')
    setCustomerSearchResults([])
  }

  // Customer search inside the sender modal.
  // We use Promise.all over individual .ilike() queries instead of .or()
  // because .or() requires PostgREST-specific syntax that breaks if the
  // user types a comma, parenthesis, or other special character. The
  // overhead of 3-4 parallel queries is negligible at our row counts.
  useEffect(() => {
    if (!senderOpen) return
    const q = customerSearchQ.trim()
    if (q.length < 2) {
      setCustomerSearchResults([])
      return
    }
    let cancelled = false
    setCustomerSearchLoading(true)

    const run = async () => {
      // Sanitize: PostgREST treats certain chars as syntax in filter values.
      // For ilike, only % and , are real risks. We strip them.
      const safe = q.replace(/[,%]/g, ' ').trim()
      if (!safe) {
        setCustomerSearchResults([])
        setCustomerSearchLoading(false)
        return
      }
      const pattern = `%${safe}%`
      const cols = 'id, name, whatsapp, phone, ambassador_code, life_stage, edd, delivery_date, crown_points, stage_paused, is_active'

      // Fire all 4 lookups in parallel, then merge + dedupe client-side.
      // NOTE: we do NOT filter by is_active here — some older customers
      // may have null instead of true and we still want to find them.
      // We filter inactive (=false) explicitly with .neq() so nulls pass.
      const [byName, byWA, byPhone, byCode] = await Promise.all([
        supabase.from('customers').select(cols).ilike('name', pattern).limit(20),
        supabase.from('customers').select(cols).ilike('whatsapp', pattern).limit(20),
        supabase.from('customers').select(cols).ilike('phone', pattern).limit(20),
        supabase.from('customers').select(cols).ilike('ambassador_code', pattern).limit(20),
      ])

      // Surface any errors for debugging instead of silently returning []
      const errs = [byName.error, byWA.error, byPhone.error, byCode.error].filter(Boolean)
      if (errs.length > 0) {
        console.error('Customer search errors:', errs.map(e => e!.message))
      }

      // Debug: log how many rows each lane returned (helps diagnose silent misses)
      console.log('[wa-tpl search]', {
        query: safe,
        byName: byName.data?.length ?? 0,
        byWA: byWA.data?.length ?? 0,
        byPhone: byPhone.data?.length ?? 0,
        byCode: byCode.data?.length ?? 0,
      })

      const seen = new Set<string>()
      const merged: MergeCustomer[] = []
      for (const res of [byName.data, byWA.data, byPhone.data, byCode.data]) {
        for (const row of (res ?? []) as any[]) {
          // Skip explicitly inactive; allow active or null
          if (row.is_active === false) continue
          if (!seen.has(row.id)) {
            seen.add(row.id)
            merged.push(row as MergeCustomer)
          }
        }
      }

      if (!cancelled) {
        setCustomerSearchResults(merged.slice(0, 20))
        setCustomerSearchLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [customerSearchQ, senderOpen])

  // Compute the merge preview for the sender modal
  const senderTemplate = templates.find(t => t.id === senderTemplateId) || null

  // Combine resource URLs (from whatsapp_resources slugs) with document
  // URLs (from upstream PDF generation, e.g. statement_url) into one map.
  // The merge engine reads both kinds from the same record.
  const mergedUrlMap = useMemo(() => ({ ...resourceUrls, ...documentUrls }),
    [resourceUrls, documentUrls])

  const senderMerge = useMemo(() => {
    if (!senderTemplate || !senderCustomer) return null
    return mergeTemplate(senderTemplate.body, senderCustomer, mergedUrlMap)
  }, [senderTemplate, senderCustomer, mergedUrlMap])

  // Build the WhatsApp URL (or null if unsendable)
  const senderUrl = useMemo(() => {
    if (!senderMerge || !senderCustomer) return null
    const phone = senderCustomer.whatsapp || senderCustomer.phone
    return buildWhatsAppUrl(phone, senderMerge.body)
  }, [senderMerge, senderCustomer])

  // Sensitive-exit guard. A paused profile must not receive non-transactional
  // messages — same rule as everywhere else in the app.
  const senderBlocked = (() => {
    if (!senderCustomer || !senderTemplate) return null
    if (senderCustomer.stage_paused && !senderTemplate.is_transactional) {
      return 'This profile is paused (sensitive exit protocol). Only transactional templates can be sent.'
    }
    if (!senderCustomer.whatsapp && !senderCustomer.phone) {
      return 'No WhatsApp or phone number on file for this customer.'
    }
    if (!senderUrl) {
      return 'Phone number could not be normalized. Check the customer profile.'
    }
    return null
  })()

  const handleOpenWhatsApp = async () => {
    if (!senderUrl || !senderCustomer || !senderTemplate || !senderMerge) return
    setSenderSending(true)

    // Log intent-to-send. We open WhatsApp regardless of whether the log
    // succeeds, because the cashier shouldn't be blocked by an audit log
    // failure.
    try {
      await supabase.rpc('log_whatsapp_send', {
        p_template_id: senderTemplate.id,
        p_customer_id: senderCustomer.id,
        p_merged_body: senderMerge.body,
      })
    } catch (err) {
      console.warn('log_whatsapp_send failed:', err)
    }

    // Open in a new tab so the cashier doesn't lose their SOKORA context
    window.open(senderUrl, '_blank', 'noopener,noreferrer')

    setSenderSending(false)
    closeSender()
    // Refresh templates to show updated use_count
    loadTemplates()
  }

  // ════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 32, fontWeight: 800 }}>
            WhatsApp Templates
          </h1>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text3)' }}>
            Reusable messages with merge fields · {templates.length} total · {templates.filter(t => t.is_active).length} active
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => openSender(null)} style={primaryBtnSecondary}>
            Send to customer
          </button>
          <button onClick={() => openEditor(null)} style={primaryBtn}>
            + New template
          </button>
        </div>
      </div>

      {/* Filter + search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search templates by name or body…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: '1 1 280px',
            padding: '10px 14px', fontSize: 13,
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text)',
          }}
        />
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value as TemplateCategory | 'all')}
          style={{
            padding: '10px 14px', fontSize: 13,
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text)', minWidth: 180,
          }}
        >
          <option value="all">All categories</option>
          {CATEGORY_ORDER.map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
      )}
      {!loading && filteredTemplates.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--text3)',
          background: 'var(--card)', border: '1px dashed var(--border)', borderRadius: 12,
        }}>
          No templates match. {templates.length === 0 ? 'Click "+ New template" to create your first.' : 'Adjust filters or search.'}
        </div>
      )}
      {!loading && filteredTemplates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredTemplates.map(t => (
            <TemplateRow
              key={t.id}
              template={t}
              onEdit={() => openEditor(t)}
              onSend={() => openSender(t.id)}
            />
          ))}
        </div>
      )}

      {/* ───────────────────────── EDITOR MODAL ───────────────────────── */}
      {editorOpen && editorTemplate && (
        <Modal onClose={() => !editorSaving && setEditorOpen(false)}>
          <div style={{ padding: 24, width: 720, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
              {editorTemplate.id ? 'Edit template' : 'New template'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 20 }}>
              Use placeholders like <code>{`{{customer_first_name}}`}</code> to personalize messages. Missing data → empty (no broken tokens shown to customer).
            </div>

            {/* Name + Category */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={modalLabel}>Name</label>
                <input
                  style={modalInput}
                  value={editorTemplate.name}
                  onChange={e => setEditorTemplate({ ...editorTemplate, name: e.target.value })}
                  placeholder="e.g. Postpartum check-in week 2"
                  maxLength={120}
                />
              </div>
              <div>
                <label style={modalLabel}>Category</label>
                <select
                  style={modalInput}
                  value={editorTemplate.category}
                  onChange={e => setEditorTemplate({ ...editorTemplate, category: e.target.value as TemplateCategory })}
                >
                  {CATEGORY_ORDER.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Body */}
            <div style={{ marginBottom: 14 }}>
              <label style={modalLabel}>Body</label>
              <textarea
                style={{ ...modalInput, height: 200, fontFamily: 'inherit', resize: 'vertical' }}
                value={editorTemplate.body}
                onChange={e => setEditorTemplate({ ...editorTemplate, body: e.target.value })}
                placeholder="Hujambo {{customer_first_name}}! ..."
              />
              <div style={{
                fontSize: 10, marginTop: 4,
                color: editorTemplate.body.length > TEMPLATE_BODY_WARN_LENGTH
                  ? (editorTemplate.body.length > TEMPLATE_BODY_MAX_LENGTH ? '#ef4444' : '#f59e0b')
                  : 'var(--text3)',
              }}>
                {editorTemplate.body.length} / {TEMPLATE_BODY_MAX_LENGTH} characters
                {editorTemplate.body.length > TEMPLATE_BODY_WARN_LENGTH && editorTemplate.body.length <= TEMPLATE_BODY_MAX_LENGTH &&
                  ' · approaching limit'}
                {editorTemplate.body.length > TEMPLATE_BODY_MAX_LENGTH && ' · too long, will not save'}
              </div>
            </div>

            {/* Placeholders reference */}
            <div style={{ marginBottom: 14 }}>
              <label style={modalLabel}>Available placeholders (click to insert)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PLACEHOLDERS.map(p => (
                  <button
                    key={p.token}
                    onClick={() => setEditorTemplate({ ...editorTemplate, body: editorTemplate.body + p.token })}
                    title={p.description}
                    style={chipBtn}
                  >
                    {p.token}
                  </button>
                ))}
              </div>
            </div>

            {/* Flags */}
            <div style={{ marginBottom: 14, display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editorTemplate.is_transactional}
                  onChange={e => setEditorTemplate({ ...editorTemplate, is_transactional: e.target.checked })}
                />
                <span>
                  <span style={{ fontWeight: 700 }}>Transactional</span>
                  <span style={{ color: 'var(--text3)', marginLeft: 6 }}>
                    (bypasses sensitive-exit pause — use only for order updates, receipts, etc.)
                  </span>
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editorTemplate.is_active}
                  onChange={e => setEditorTemplate({ ...editorTemplate, is_active: e.target.checked })}
                />
                <span style={{ fontWeight: 700 }}>Active</span>
              </label>
            </div>

            {/* Live preview */}
            <div style={{ marginBottom: 14 }}>
              <label style={modalLabel}>Preview (with sample customer)</label>
              <div style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto',
                fontFamily: 'system-ui, sans-serif',
              }}>
                {mergeTemplate(editorTemplate.body, SAMPLE_CUSTOMER, mergedUrlMap).body || (
                  <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>Preview appears here as you type…</span>
                )}
              </div>
              {extractUsedPlaceholders(editorTemplate.body).length > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                  Uses: {extractUsedPlaceholders(editorTemplate.body).join(', ')}
                </div>
              )}
            </div>

            {editorError && (
              <div style={errorBox}>{editorError}</div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <div>
                {editorTemplate.id && (
                  <button onClick={deleteTemplate} disabled={editorSaving} style={dangerBtn}>
                    Delete
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditorOpen(false)} disabled={editorSaving} style={cancelBtn}>
                  Cancel
                </button>
                <button onClick={saveTemplate} disabled={editorSaving} style={primaryBtn}>
                  {editorSaving ? 'Saving…' : (editorTemplate.id ? 'Save changes' : 'Create template')}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ───────────────────────── SENDER MODAL ───────────────────────── */}
      {senderOpen && (
        <Modal onClose={() => !senderSending && closeSender()}>
          <div style={{ padding: 24, width: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>
              Send template via WhatsApp
            </div>

            {/* Step 1: Template */}
            <div style={{ marginBottom: 16 }}>
              <label style={modalLabel}>1. Template</label>
              {preferredCategory && (
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>
                  Suggested: {CATEGORY_LABELS[preferredCategory] || preferredCategory} templates appear first
                </div>
              )}
              <select
                style={modalInput}
                value={senderTemplateId ?? ''}
                onChange={e => setSenderTemplateId(e.target.value || null)}
              >
                <option value="">— pick a template —</option>
                {/* When a preferred category is set (e.g. arrived from
                    CustomerStatement page → 'statement'), surface those
                    templates and related ones first. */}
                {(() => {
                  // Build the category render order: preferred first, then
                  // related, then the rest (in CATEGORY_ORDER order).
                  const preferred: TemplateCategory[] = []
                  if (preferredCategory === 'statement') {
                    preferred.push('statement', 'payment_reminder', 'invoice_share')
                  } else if (preferredCategory === 'payment_reminder') {
                    preferred.push('payment_reminder', 'statement', 'invoice_share')
                  } else if (preferredCategory) {
                    preferred.push(preferredCategory)
                  }
                  const seen = new Set(preferred)
                  const ordered: TemplateCategory[] = [
                    ...preferred,
                    ...CATEGORY_ORDER.filter(c => !seen.has(c)),
                  ]
                  return ordered.map(cat => {
                    const inCat = templates.filter(t => t.is_active && t.category === cat)
                    if (inCat.length === 0) return null
                    return (
                      <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                        {inCat.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </optgroup>
                    )
                  })
                })()}
              </select>
            </div>

            {/* Step 2: Customer */}
            <div style={{ marginBottom: 16 }}>
              <label style={modalLabel}>2. Customer</label>
              {senderCustomer ? (
                <div style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{senderCustomer.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {senderCustomer.whatsapp || senderCustomer.phone || 'no phone'}
                      {senderCustomer.life_stage && ` · ${senderCustomer.life_stage}`}
                      {senderCustomer.stage_paused && (
                        <span style={{ color: '#f59e0b', fontWeight: 700, marginLeft: 6 }}>· PAUSED</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setSenderCustomer(null)} style={chipBtn}>Change</button>
                </div>
              ) : (
                <>
                  <input
                    style={modalInput}
                    placeholder="Search by name, phone, or ambassador code…"
                    value={customerSearchQ}
                    onChange={e => setCustomerSearchQ(e.target.value)}
                    autoFocus
                  />
                  {customerSearchLoading && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', padding: 8 }}>Searching…</div>
                  )}
                  {!customerSearchLoading && customerSearchQ.trim().length >= 2 && customerSearchResults.length === 0 && (
                    <div style={{
                      marginTop: 6, padding: 12, fontSize: 11, color: 'var(--text3)',
                      background: 'var(--surface2)', border: '1px dashed var(--border)',
                      borderRadius: 8, textAlign: 'center',
                    }}>
                      No customers matched "{customerSearchQ.trim()}". Try a shorter or different term.
                    </div>
                  )}
                  {!customerSearchLoading && customerSearchQ.trim().length > 0 && customerSearchQ.trim().length < 2 && (
                    <div style={{
                      marginTop: 6, padding: 8, fontSize: 10, color: 'var(--text3)',
                    }}>
                      Type at least 2 characters to search…
                    </div>
                  )}
                  {!customerSearchLoading && customerSearchResults.length > 0 && (
                    <div style={{
                      marginTop: 6, maxHeight: 220, overflowY: 'auto',
                      border: '1px solid var(--border)', borderRadius: 8,
                    }}>
                      {customerSearchResults.map(c => (
                        <div
                          key={c.id}
                          onClick={() => setSenderCustomer(c)}
                          style={{
                            padding: '10px 12px', borderBottom: '1px solid var(--border)',
                            cursor: 'pointer', fontSize: 12,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ fontWeight: 700 }}>{c.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                            {c.whatsapp || c.phone || 'no phone'}
                            {c.life_stage && ` · ${c.life_stage}`}
                            {c.stage_paused && <span style={{ color: '#f59e0b', marginLeft: 6 }}>PAUSED</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Step 3: Preview + send */}
            {senderTemplate && senderCustomer && senderMerge && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={modalLabel}>3. Preview</label>
                  <div style={{
                    background: '#e7f7ed', border: '1px solid #5EA8A2',
                    borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.6,
                    whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto',
                    color: '#222', fontFamily: 'system-ui, sans-serif',
                  }}>
                    {senderMerge.body}
                  </div>
                  {senderMerge.emptyPlaceholders.length > 0 && (
                    <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 6 }}>
                      ⚠ Some placeholders had no data and were left blank: {senderMerge.emptyPlaceholders.join(', ')}
                    </div>
                  )}
                </div>

                {senderBlocked && (
                  <div style={errorBox}>{senderBlocked}</div>
                )}
              </>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={closeSender} disabled={senderSending} style={cancelBtn}>
                Cancel
              </button>
              <button
                onClick={handleOpenWhatsApp}
                disabled={senderSending || !senderTemplate || !senderCustomer || !!senderBlocked}
                style={{
                  ...primaryBtn,
                  opacity: (senderSending || !senderTemplate || !senderCustomer || !!senderBlocked) ? 0.5 : 1,
                  cursor: (senderSending || !senderTemplate || !senderCustomer || !!senderBlocked) ? 'not-allowed' : 'pointer',
                }}
              >
                {senderSending ? 'Opening…' : 'Open WhatsApp Web'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// Helper subcomponents
// ════════════════════════════════════════════════════════════════════════════

function TemplateRow({ template, onEdit, onSend }: {
  template: WhatsAppTemplate
  onEdit: () => void
  onSend: () => void
}) {
  const placeholders = useMemo(() => extractUsedPlaceholders(template.body), [template.body])
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 16,
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center',
      opacity: template.is_active ? 1 : 0.5,
    }}>
      <div onClick={onEdit} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{template.name}</div>
          <span style={{
            fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 8px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {CATEGORY_LABELS[template.category]}
          </span>
          {template.is_transactional && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 8px',
              background: 'rgba(94,168,162,0.15)', color: '#5EA8A2',
              border: '1px solid #5EA8A2', borderRadius: 10,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              Transactional
            </span>
          )}
          {!template.is_active && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 8px',
              background: 'rgba(239,68,68,0.15)', color: '#ef4444',
              border: '1px solid #ef4444', borderRadius: 10,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              Inactive
            </span>
          )}
        </div>
        <div style={{
          fontSize: 11, color: 'var(--text3)', lineHeight: 1.5,
          maxHeight: 40, overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {template.body}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
          Used {template.use_count} time{template.use_count === 1 ? '' : 's'}
          {template.last_used_at && ` · last ${new Date(template.last_used_at).toLocaleDateString('en-GB')}`}
          {placeholders.length > 0 && ` · placeholders: ${placeholders.length}`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onSend} style={primaryBtnSecondary} disabled={!template.is_active}>
          Send
        </button>
      </div>
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12,
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Style constants ──────────────────────────────────────────────────────

const modalLabel: React.CSSProperties = {
  fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)',
  textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4,
}
const modalInput: React.CSSProperties = {
  width: '100%', background: 'var(--surface)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 6,
  padding: '8px 10px', fontSize: 13, fontFamily: 'var(--mono)',
}
const primaryBtn: React.CSSProperties = {
  padding: '8px 16px', fontSize: 12, fontWeight: 700,
  background: 'var(--accent)', border: 'none',
  borderRadius: 6, color: '#000', cursor: 'pointer',
}
const primaryBtnSecondary: React.CSSProperties = {
  padding: '8px 16px', fontSize: 12, fontWeight: 700,
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)', cursor: 'pointer',
}
const cancelBtn: React.CSSProperties = {
  padding: '8px 14px', fontSize: 12, fontWeight: 700,
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)', cursor: 'pointer',
}
const dangerBtn: React.CSSProperties = {
  padding: '8px 14px', fontSize: 12, fontWeight: 700,
  background: 'transparent', border: '1px solid #ef4444',
  borderRadius: 6, color: '#ef4444', cursor: 'pointer',
}
const chipBtn: React.CSSProperties = {
  padding: '4px 10px', fontSize: 10, fontFamily: 'var(--mono)',
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)', cursor: 'pointer',
}
const errorBox: React.CSSProperties = {
  padding: '10px 12px', marginBottom: 12,
  background: 'rgba(239,68,68,0.10)',
  border: '1px solid rgba(239,68,68,0.4)',
  borderRadius: 6, fontSize: 11, color: '#ef4444', lineHeight: 1.5,
}
