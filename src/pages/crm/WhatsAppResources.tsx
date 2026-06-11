// ════════════════════════════════════════════════════════════════════════════
// WhatsAppResources.tsx
//
// Registry page for files that can be referenced from WhatsApp templates
// via {{resource:slug}} placeholders. Lives at crm-whatsapp-resources.
//
// Uploads go to the Supabase Storage bucket "crm-resources" (created in
// migration 022). Metadata is mirrored into whatsapp_resources for fast
// slug lookups + filtering on the public/internal flag.
//
// Flow:
//   1. Staff clicks "Upload" → picks a file (max 10MB, types limited).
//   2. We slugify the name, upload to crm-resources/<slug>.<ext>, then
//      read back the public URL and INSERT a row.
//   3. The list shows thumbnails for images and a stylized PDF tile for
//      PDFs (we use a PDF.js-free approach: iframe of the public URL
//      with a contained height; browsers render the first page natively).
//   4. Each row has a Copy URL button and a Copy placeholder
//      button ({{resource:slug}}) for pasting into a template body.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import type { Page } from '../../lib/types'
import { slugify, type WhatsAppResource } from '../../lib/whatsappTemplates'

interface Props {
  onNav?: (p: Page) => void
}

const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB
const ACCEPTED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav',
  'video/mp4', 'video/quicktime', 'video/webm',
]

export default function WhatsAppResources({ onNav }: Props) {
  void onNav
  const { user } = useAuth()

  const [resources, setResources] = useState<WhatsAppResource[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'image' | 'pdf' | 'audio' | 'video'>('all')
  const [search, setSearch] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { loadResources() }, [])

  const loadResources = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('whatsapp_resources')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('loadResources failed:', error.message)
      setResources([])
    } else {
      setResources((data ?? []) as WhatsAppResource[])
    }
    setLoading(false)
  }

  const filtered = resources.filter(r => {
    const q = search.trim().toLowerCase()
    if (q && !r.name.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) return false
    if (filter === 'image') return r.mime_type.startsWith('image/')
    if (filter === 'pdf')   return r.mime_type === 'application/pdf'
    if (filter === 'audio') return r.mime_type.startsWith('audio/')
    if (filter === 'video') return r.mime_type.startsWith('video/')
    return true
  })

  const flashToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    flashToast(`${label} copied`)
  }

  const deleteResource = async (r: WhatsAppResource) => {
    if (!confirm(`Delete "${r.name}"? This removes the file and unlinks any templates that reference it.`)) return
    // Best-effort: remove from storage first, then mark inactive in DB.
    // If storage delete fails (file already gone), we still want the DB row out.
    await supabase.storage.from('crm-resources').remove([r.storage_path])
    const { error } = await supabase
      .from('whatsapp_resources')
      .update({ is_active: false })
      .eq('id', r.id)
    if (error) {
      flashToast('Delete failed: ' + error.message)
    } else {
      flashToast('Deleted')
      loadResources()
    }
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800 }}>
            Resources Registry
          </h1>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text3)' }}>
            Files that can be referenced from templates as <code>{`{{resource:slug}}`}</code> · {resources.length} active
          </div>
        </div>
        <button onClick={() => setUploadOpen(true)} style={primaryBtn}>
          + Upload resource
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search by name or slug…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: '1 1 280px',
            padding: '10px 14px', fontSize: 13,
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text)',
          }}
        />
        {(['all', 'image', 'pdf', 'audio', 'video'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              padding: '8px 14px', fontSize: 11, fontWeight: 700,
              background: filter === t ? 'var(--accent)' : 'var(--surface2)',
              color: filter === t ? '#000' : 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}
          >{t}</button>
        ))}
      </div>

      {/* Grid */}
      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--text3)',
          background: 'var(--card)', border: '1px dashed var(--border)', borderRadius: 12,
        }}>
          No resources match. {resources.length === 0 ? 'Click "+ Upload resource" to add your first.' : 'Adjust filters.'}
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16,
        }}>
          {filtered.map(r => (
            <ResourceCard
              key={r.id}
              resource={r}
              onCopyUrl={() => copyToClipboard(r.public_url, 'Public URL')}
              onCopyPlaceholder={() => copyToClipboard(`{{resource:${r.slug}}}`, 'Placeholder')}
              onDelete={() => deleteResource(r)}
            />
          ))}
        </div>
      )}

      {/* Upload modal */}
      {uploadOpen && (
        <UploadModal
          userId={user?.id ?? null}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { setUploadOpen(false); loadResources() }}
          onError={msg => flashToast(msg)}
          existingSlugs={resources.map(r => r.slug)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          background: 'var(--card)', border: '1px solid var(--accent)',
          borderRadius: 8, padding: '10px 16px', fontSize: 12,
          color: 'var(--text)', fontWeight: 700,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>{toast}</div>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════

function ResourceCard({ resource, onCopyUrl, onCopyPlaceholder, onDelete }: {
  resource: WhatsAppResource
  onCopyUrl: () => void
  onCopyPlaceholder: () => void
  onDelete: () => void
}) {
  const isImage = resource.mime_type.startsWith('image/')
  const isPdf = resource.mime_type === 'application/pdf'
  const isAudio = resource.mime_type.startsWith('audio/')
  const isVideo = resource.mime_type.startsWith('video/')

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* Thumbnail / preview area */}
      <div style={{
        height: 160, background: 'var(--surface2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', position: 'relative',
      }}>
        {isImage && (
          <img
            src={resource.public_url}
            alt={resource.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        {isPdf && (
          // PDF preview via iframe — browsers render the first page natively.
          // Pointer-events:none prevents scroll-jacking inside the card.
          <iframe
            src={resource.public_url + '#toolbar=0&navpanes=0&view=FitH'}
            title={resource.name}
            style={{
              width: '100%', height: '100%', border: 'none',
              pointerEvents: 'none', background: '#fff',
            }}
          />
        )}
        {isAudio && (
          <div style={{ fontSize: 48 }}>🎵</div>
        )}
        {isVideo && (
          <video
            src={resource.public_url}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            muted
          />
        )}
        {/* Type chip */}
        <span style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: 9, fontFamily: 'var(--mono)', padding: '2px 8px',
          background: 'rgba(0,0,0,0.7)', color: '#fff',
          borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          {isImage ? 'IMG' : isPdf ? 'PDF' : isAudio ? 'AUDIO' : isVideo ? 'VIDEO' : 'FILE'}
        </span>
      </div>

      {/* Meta */}
      <div style={{ padding: 14, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{resource.name}</div>
        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          {`{{resource:${resource.slug}}}`}
        </div>
        {resource.description && (
          <div style={{
            fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.4,
            maxHeight: 30, overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{resource.description}</div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
          {(resource.size_bytes / 1024).toFixed(0)} KB · {new Date(resource.created_at).toLocaleDateString('en-GB')}
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 1,
        borderTop: '1px solid var(--border)',
      }}>
        <button onClick={onCopyPlaceholder} style={cardActionBtn} title="Copy {{resource:slug}}">
          Copy tag
        </button>
        <button onClick={onCopyUrl} style={cardActionBtn} title="Copy public URL">
          Copy URL
        </button>
        <button onClick={onDelete} style={{ ...cardActionBtn, color: '#ef4444' }} title="Delete">
          ✕
        </button>
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════

function UploadModal({ userId, onClose, onUploaded, onError, existingSlugs }: {
  userId: string | null
  onClose: () => void
  onUploaded: () => void
  onError: (msg: string) => void
  existingSlugs: string[]
}) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    if (f.size > MAX_FILE_SIZE) {
      setError(`File too large (${(f.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.`)
      return
    }
    if (!ACCEPTED_MIME.includes(f.type)) {
      setError(`File type ${f.type || 'unknown'} not allowed. Allowed: images, PDF, audio, video.`)
      return
    }
    setFile(f)
    // Auto-fill name + slug from filename if blank
    if (!name) {
      const base = f.name.replace(/\.[^.]+$/, '')  // strip extension
      setName(base)
      setSlug(slugify(base))
    }
  }

  const handleSubmit = async () => {
    setError(null)
    if (!file) { setError('Pick a file first'); return }
    if (!name.trim()) { setError('Name is required'); return }
    if (!slug.trim()) { setError('Slug is required'); return }
    if (!/^[a-z0-9_-]+$/.test(slug)) { setError('Slug must be lowercase letters, digits, underscores, or dashes only'); return }
    if (existingSlugs.includes(slug)) { setError(`Slug "${slug}" is already in use`); return }

    setUploading(true)

    // 1. Upload to Storage. We name the object {slug}.{ext} for predictability.
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const path = `${slug}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('crm-resources')
      .upload(path, file, { upsert: false, contentType: file.type })
    if (upErr) {
      setError('Upload failed: ' + upErr.message)
      setUploading(false)
      return
    }

    // 2. Get public URL
    const { data: pub } = supabase.storage.from('crm-resources').getPublicUrl(path)
    const publicUrl = pub.publicUrl

    // 3. Insert metadata row
    const { error: insErr } = await supabase
      .from('whatsapp_resources')
      .insert({
        slug,
        name: name.trim(),
        description: description.trim() || null,
        storage_path: path,
        public_url: publicUrl,
        mime_type: file.type,
        size_bytes: file.size,
        is_public: isPublic,
        created_by: userId,
      })
    if (insErr) {
      // Best-effort cleanup of the uploaded blob
      await supabase.storage.from('crm-resources').remove([path])
      setError('Save failed: ' + insErr.message)
      setUploading(false)
      return
    }

    setUploading(false)
    onUploaded()
    onError('Resource uploaded')
  }

  return (
    <div
      onClick={() => !uploading && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, width: 520, maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Upload resource</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 20 }}>
          Max 10MB. Images, PDFs, audio, or video. The public URL will be embeddable in WhatsApp templates as <code>{`{{resource:slug}}`}</code>.
        </div>

        {/* File */}
        <div style={{ marginBottom: 14 }}>
          <label style={modalLabel}>File</label>
          <input
            type="file"
            accept={ACCEPTED_MIME.join(',')}
            onChange={handleFileChange}
            style={{ ...modalInput, padding: '8px' }}
          />
          {file && (
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
              {file.name} · {(file.size / 1024).toFixed(0)} KB · {file.type}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={modalLabel}>Name</label>
            <input
              style={modalInput}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Onboarding guide"
            />
          </div>
          <div>
            <label style={modalLabel}>Slug</label>
            <input
              style={modalInput}
              value={slug}
              onChange={e => setSlug(slugify(e.target.value))}
              placeholder="onboarding_guide"
            />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={modalLabel}>Description (optional)</label>
          <textarea
            style={{ ...modalInput, height: 60, fontFamily: 'inherit', resize: 'vertical' }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What's in this file?"
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 18, cursor: 'pointer' }}>
          <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
          <span>
            <span style={{ fontWeight: 700 }}>Safe for customers</span>
            <span style={{ color: 'var(--text3)', marginLeft: 6 }}>
              (uncheck for internal-only files; they won't resolve in customer template merges)
            </span>
          </span>
        </label>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={uploading} style={cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={uploading || !file} style={primaryBtn}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Styles ───────────────────────────────────────────────────────────────

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
const cancelBtn: React.CSSProperties = {
  padding: '8px 14px', fontSize: 12, fontWeight: 700,
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)', cursor: 'pointer',
}
const cardActionBtn: React.CSSProperties = {
  background: 'var(--surface2)', border: 'none', borderRight: '1px solid var(--border)',
  padding: '10px 8px', fontSize: 11, fontWeight: 700,
  color: 'var(--text)', cursor: 'pointer',
}
const errorBox: React.CSSProperties = {
  padding: '10px 12px', marginBottom: 12,
  background: 'rgba(239,68,68,0.10)',
  border: '1px solid rgba(239,68,68,0.4)',
  borderRadius: 6, fontSize: 11, color: '#ef4444', lineHeight: 1.5,
}
