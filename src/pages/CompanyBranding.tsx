import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { FG } from '../components/FormHelpers'
import { SettingsPage, SettingsSection } from '../components/SettingsPrimitives'
import { useCompanySettings, invalidateCompanySettings, type CompanySettings, DEFAULT_COMPANY_SETTINGS } from '../lib/useCompanySettings'
import type { Page } from '../lib/types'

// ════════════════════════════════════════════════════════════════════════
// CompanyBranding — single-source-of-truth editor for everything that
// appears on customer-facing documents.
//
// Three sections:
//   1) Logo — upload → Supabase Storage → URL stored in DB.
//      Sliders for height and position. Live preview at top.
//   2) Company info — name, TIN, address, phone, email, website, tagline.
//   3) Payment details — bank (NMB by default) + M-Pesa till/business
//      number + per-doc footer notes (statement vs invoice).
//
// All values get saved back to the singleton row in `company_settings`.
// CustomerStatement and any future template reads from this row via
// useCompanySettings(), so a change here ripples to every doc on the
// next render.
// ════════════════════════════════════════════════════════════════════════

interface Props { onNav: (p: Page) => void }

export default function CompanyBranding({ onNav }: Props) {
  const { settings: loaded, loading } = useCompanySettings()
  const [form, setForm] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const fileRef = useRef<HTMLInputElement>(null)

  // Sync local form with the loaded settings once. We don't keep refetching
  // because the user is editing locally; only on save (or cancel via reload)
  // does the canonical value matter.
  useEffect(() => {
    if (!loading) setForm(loaded)
  }, [loading, loaded])

  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const showToast = (m: string, t: 'success' | 'error' = 'success') => {
    setToast(m); setToastType(t)
  }

  // ── Upload logo ───────────────────────────────────────────────────────
  // Pushes the chosen file to the `company-assets` Storage bucket under a
  // deterministic path so re-uploads overwrite the same key (no orphans).
  // After upload, we read the public URL and stash it in form.logo_url
  // (still requires Save Changes to persist — same as text edits).
  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Pick an image file (PNG, JPG, SVG)', 'error'); return
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo must be under 2 MB', 'error'); return
    }
    setUploading(true)
    try {
      // Path uses the original extension so the browser/PDF renderer can
      // sniff the type. Filename is fixed ("logo") so subsequent uploads
      // overwrite cleanly — no orphan files piling up in the bucket.
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `logo.${ext}`
      const { error: upErr } = await supabase.storage
        .from('company-assets')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw new Error(upErr.message)

      // Get the public URL. Bucket is set to public in the migration, so
      // this URL is directly embeddable in <img src="..."> for prints and
      // PDFs without needing signed URLs.
      const { data } = supabase.storage.from('company-assets').getPublicUrl(path)
      // Append a cache-buster timestamp so the browser re-fetches after
      // replacement (otherwise old logo lingers due to Storage caching).
      const url = `${data.publicUrl}?v=${Date.now()}`
      set('logo_url', url)
      showToast('Logo uploaded — remember to Save Changes')
    } catch (e: any) {
      showToast(`Upload failed: ${e.message || 'unknown error'}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  // ── Save all settings ─────────────────────────────────────────────────
  const save = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('company_settings')
        .update({
          company_name: form.company_name,
          tagline: form.tagline,
          tin: form.tin,
          address: form.address,
          phone: form.phone,
          email: form.email,
          website: form.website,
          logo_url: form.logo_url,
          logo_height_px: form.logo_height_px,
          logo_position: form.logo_position,
          bank_name: form.bank_name,
          bank_account_name: form.bank_account_name,
          bank_account_number: form.bank_account_number,
          bank_branch: form.bank_branch,
          mpesa_till_number: form.mpesa_till_number,
          mpesa_business_number: form.mpesa_business_number,
          statement_footer_note: form.statement_footer_note,
          invoice_footer_note: form.invoice_footer_note,
        })
        .eq('id', 'company')
      if (error) throw new Error(error.message)
      invalidateCompanySettings()   // next read picks up fresh values
      showToast('Saved — open a customer statement to see your changes')
    } catch (e: any) {
      showToast(`Save failed: ${e.message || 'unknown error'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const removeLogo = () => set('logo_url', null)

  return (
    <SettingsPage
      title="Company Branding"
      subtitle="Logo, company info, and payment details shown on customer-facing documents"
      onBack={() => onNav('templates-hub')}
      actions={
        <button className="btn btn-primary" onClick={save} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      }
    >
      {/* ── Live preview ──────────────────────────────────────────────── */}
      <SettingsSection
        title="Preview"
        description="How your statement header will look with current settings"
      >
        <div style={{
          background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
          padding: 20, color: '#0f1419',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: form.logo_position === 'right' ? 'space-between' :
                            form.logo_position === 'center' ? 'flex-start' : 'space-between',
            gap: 16,
            flexDirection: form.logo_position === 'center' ? 'column' : 'row',
          }}>
            {form.logo_position === 'center' ? (
              <>
                {form.logo_url && (
                  <img src={form.logo_url} alt="logo"
                    style={{ height: form.logo_height_px, alignSelf: 'center' }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <div style={{ textAlign: 'center', width: '100%' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{form.company_name}</div>
                  {form.tagline && <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 2 }}>{form.tagline}</div>}
                  <div style={{ fontSize: 11, color: '#666', marginTop: 6, lineHeight: 1.5 }}>
                    {form.address}<br/>
                    {form.phone} · {form.email}<br/>
                    {form.tin && <>TIN: {form.tin}</>}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, order: form.logo_position === 'right' ? 1 : 0 }}>
                  {form.logo_position === 'left' && form.logo_url && (
                    <img src={form.logo_url} alt="logo"
                      style={{ height: form.logo_height_px }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  )}
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{form.company_name}</div>
                    {form.tagline && <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 2 }}>{form.tagline}</div>}
                    <div style={{ fontSize: 11, color: '#666', marginTop: 4, lineHeight: 1.5 }}>
                      {form.address}<br/>
                      {form.phone} · {form.email}<br/>
                      {form.tin && <>TIN: {form.tin}</>}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', order: form.logo_position === 'right' ? 0 : 1 }}>
                  {form.logo_position === 'right' && form.logo_url && (
                    <img src={form.logo_url} alt="logo"
                      style={{ height: form.logo_height_px, marginBottom: 6 }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  )}
                  <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 1 }}>Statement</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#85c2be' }}>WHL-10-0006</div>
                  <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>Period: 2026-02-25 → 2026-05-26</div>
                </div>
              </>
            )}
          </div>
        </div>
      </SettingsSection>

      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <SettingsSection
        title="Logo"
        description="Upload your company logo. PNG with transparency works best. Max 2 MB."
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <FG label="Logo File">
              <div style={{
                border: '2px dashed var(--border)', borderRadius: 8, padding: 20,
                textAlign: 'center', background: 'var(--surface2)',
              }}>
                {form.logo_url ? (
                  <>
                    <img src={form.logo_url} alt="logo preview"
                      style={{ maxHeight: 80, maxWidth: '100%', marginBottom: 12 }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                        {uploading ? 'Uploading…' : 'Replace'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={removeLogo} style={{ color: 'var(--red)' }}>
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
                      No logo uploaded yet
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      {uploading ? 'Uploading…' : 'Upload Logo'}
                    </button>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f) }}
                />
              </div>
            </FG>
          </div>
          <div>
            <FG label={`Height: ${form.logo_height_px}px`}>
              <input
                type="range" min="24" max="120" step="2"
                value={form.logo_height_px}
                onChange={e => set('logo_height_px', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 4 }}>
                <span>24px (small)</span>
                <span>120px (large)</span>
              </div>
            </FG>
            <FG label="Position">
              <div style={{ display: 'flex', gap: 6 }}>
                {(['left', 'center', 'right'] as const).map(pos => (
                  <button key={pos}
                    onClick={() => set('logo_position', pos)}
                    style={{
                      flex: 1, padding: '8px 12px', fontSize: 12,
                      background: form.logo_position === pos ? 'var(--accent-dim)' : 'var(--surface2)',
                      border: `1px solid ${form.logo_position === pos ? 'var(--accent)' : 'var(--border)'}`,
                      color: form.logo_position === pos ? 'var(--accent)' : 'var(--text2)',
                      borderRadius: 6, cursor: 'pointer', textTransform: 'capitalize',
                    }}>
                    {pos}
                  </button>
                ))}
              </div>
            </FG>
          </div>
        </div>
      </SettingsSection>

      {/* ── Company info ──────────────────────────────────────────────── */}
      <SettingsSection
        title="Company Information"
        description="Identity values that appear on every document header"
      >
        <div className="form-row">
          <FG label="Company Name" req>
            <input className="form-input" value={form.company_name || ''}
              onChange={e => set('company_name', e.target.value)} />
          </FG>
          <FG label="Tagline">
            <input className="form-input" value={form.tagline || ''}
              placeholder="e.g. Your Partner in Motherhood"
              onChange={e => set('tagline', e.target.value)} />
          </FG>
        </div>
        <div className="form-row">
          <FG label="TIN (Tax Identification)">
            <input className="form-input" value={form.tin || ''}
              onChange={e => set('tin', e.target.value)} />
          </FG>
          <FG label="Phone">
            <input className="form-input" value={form.phone || ''}
              onChange={e => set('phone', e.target.value)} />
          </FG>
        </div>
        <FG label="Address">
          <input className="form-input" value={form.address || ''}
            onChange={e => set('address', e.target.value)} />
        </FG>
        <div className="form-row">
          <FG label="Email">
            <input className="form-input" value={form.email || ''}
              onChange={e => set('email', e.target.value)} />
          </FG>
          <FG label="Website">
            <input className="form-input" value={form.website || ''}
              onChange={e => set('website', e.target.value)} />
          </FG>
        </div>
      </SettingsSection>

      {/* ── Bank + M-Pesa ─────────────────────────────────────────────── */}
      <SettingsSection
        title="Payment Details"
        description="Shown in the 'How to Pay' block on statements and invoices. Leave M-Pesa blank if you don't accept it."
      >
        <div className="form-row">
          <FG label="Bank Name">
            <input className="form-input" value={form.bank_name || ''}
              onChange={e => set('bank_name', e.target.value)} />
          </FG>
          <FG label="Branch">
            <input className="form-input" value={form.bank_branch || ''}
              onChange={e => set('bank_branch', e.target.value)} />
          </FG>
        </div>
        <div className="form-row">
          <FG label="Account Name">
            <input className="form-input" value={form.bank_account_name || ''}
              onChange={e => set('bank_account_name', e.target.value)} />
          </FG>
          <FG label="Account Number">
            <input className="form-input" value={form.bank_account_number || ''}
              onChange={e => set('bank_account_number', e.target.value)} />
          </FG>
        </div>
        <div className="form-row">
          <FG label="M-Pesa Till Number (Lipa kwa M-Pesa)">
            <input className="form-input" value={form.mpesa_till_number || ''}
              placeholder="e.g. 123456" onChange={e => set('mpesa_till_number', e.target.value)} />
          </FG>
          <FG label="M-Pesa Business / Paybill">
            <input className="form-input" value={form.mpesa_business_number || ''}
              placeholder="e.g. 400200" onChange={e => set('mpesa_business_number', e.target.value)} />
          </FG>
        </div>
      </SettingsSection>

      {/* ── Footer notes ──────────────────────────────────────────────── */}
      <SettingsSection
        title="Document Footers"
        description="Short messages shown at the bottom of each document. Different for statements (collections-tone) and invoices (thank-you tone)."
      >
        <FG label="Statement Footer Note">
          <textarea className="form-input" rows={2}
            value={form.statement_footer_note || ''}
            placeholder="e.g. Please reference the invoice number when paying."
            style={{ resize: 'none' }}
            onChange={e => set('statement_footer_note', e.target.value)}
          />
        </FG>
        <FG label="Invoice Footer Note">
          <textarea className="form-input" rows={2}
            value={form.invoice_footer_note || ''}
            placeholder="e.g. Thank you for your business."
            style={{ resize: 'none' }}
            onChange={e => set('invoice_footer_note', e.target.value)}
          />
        </FG>
      </SettingsSection>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </SettingsPage>
  )
}
