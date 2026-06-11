import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'
import { useAuth } from '../lib/useAuth'
import { submitForApproval } from '../lib/useApproval'

interface Props {
  onNav: (p: Page) => void // used for navigation actions
}

// Lucide Icon component
const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  
  const paths: Record<string, React.ReactNode> = {
    share2: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    link2: <><path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>,
    dollarSign: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></>,
    medal: <><path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    gift: <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    messageCircle: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface Referrer {
  id: string
  name: string
  phone: string
  tier: 'mama' | 'gold' | 'crown'
  code: string
  referrals: number
  conversions: number
  revenue: number
  earned: number
  pointsEarned: number
  joinedAt: string
  // At-till usage tracking from migration 015. usesCount = how many times the
  // code has been used so far; usesCap = how many uses it's allowed before
  // it stops working. Surfaced on the leaderboard so Brenda can flag
  // ambassadors approaching their cap.
  usesCount: number
  usesCap: number
}

interface ReferralActivity {
  id: string
  referrer: string
  referee: string
  status: 'pending' | 'converted' | 'expired'
  orderValue?: number
  timestamp: string
}

export default function CRMReferrals({ onNav }: Props) {
  void onNav // available for future navigation
  const { user } = useAuth()
  const [referrers, setReferrers] = useState<Referrer[]>([])
  const [activities, setActivities] = useState<ReferralActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReferrer, setSelectedReferrer] = useState<Referrer | null>(null)
  const [copied, setCopied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Live ambassador settings, loaded from get_ambassador_settings RPC.
  // This is the FULL config the edit modal binds to. The smaller "How rewards
  // work" panel reads from this directly too.
  type AmbassadorSettings = {
    benefit_shape: 'discount_pct' | 'discount_tzs' | 'free_item' | null
    benefit_percent: number | null
    benefit_tzs: number | null
    free_product_id: string | null
    free_product_name: string | null  // hydrated client-side
    default_max_uses: number | null
    referrer_reward_points: number | null
  }
  const [ambSettings, setAmbSettings] = useState<AmbassadorSettings | null>(null)

  // Edit modal state (form mirrors AmbassadorSettings, plus a busy flag)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<AmbassadorSettings | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editProducts, setEditProducts] = useState<{ id: string; name: string }[]>([])

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    // Lazy lifecycle progression. These RPCs are idempotent:
    //   1. Mark pending referrals as converted if the referee has now bought.
    //   2. Credit any converted referrals where the return window has passed.
    // We do this on every page load so the data stays fresh without cron.
    // If either fails (e.g. RPC missing), we continue with the data we have.
    try { await supabase.rpc('complete_referral_conversions') } catch { /* noop */ }
    try { await supabase.rpc('credit_due_referrals') } catch { /* noop */ }

    // Load live ambassador settings via get_ambassador_settings RPC. The RPC
    // is SECURITY DEFINER so it bypasses the crm_settings RLS that blocks
    // direct selects from authenticated users.
    const { data: settingsData } = await supabase.rpc('get_ambassador_settings')
    let settings: AmbassadorSettings | null = null
    if (settingsData) {
      const raw = settingsData as any
      settings = {
        benefit_shape:          raw.benefit_shape ?? null,
        benefit_percent:        raw.benefit_percent !== null && raw.benefit_percent !== undefined ? Number(raw.benefit_percent) : null,
        benefit_tzs:            raw.benefit_tzs !== null && raw.benefit_tzs !== undefined ? Number(raw.benefit_tzs) : null,
        free_product_id:        raw.free_product_id ?? null,
        free_product_name:      null,  // hydrated below
        default_max_uses:       raw.default_max_uses !== null && raw.default_max_uses !== undefined ? Number(raw.default_max_uses) : null,
        referrer_reward_points: raw.referrer_reward_points !== null && raw.referrer_reward_points !== undefined ? Number(raw.referrer_reward_points) : null,
      }
      // Hydrate the configured free product's name for display
      if (settings.free_product_id) {
        const { data: prod } = await supabase
          .from('products')
          .select('name')
          .eq('id', settings.free_product_id)
          .maybeSingle()
        settings.free_product_name = (prod as any)?.name ?? null
      }
    }
    setAmbSettings(settings)

    // Load referrers (one row per ambassador with rolled-up stats)
    const { data: leaderboardRows } = await supabase
      .from('ambassador_leaderboard')
      .select('*')
      .limit(100)

    // Load recent activity (most recent referrals, any status)
    const { data: activityRows } = await supabase
      .from('referrals')
      .select(`
        id, referrer_id, referrer_name, referee_id, referee_name,
        status, reward_paid, first_purchase_amount, created_at, converted_at
      `)
      .order('created_at', { ascending: false })
      .limit(30)

    // Map leaderboard rows to the Referrer shape the JSX expects.
    // Tier derivation: simple conversion-count thresholds for now.
    // (Session 5 will unify tier naming across the CRM.)
    const referrerRows: Referrer[] = (leaderboardRows ?? []).map((row: any) => ({
      id:           row.customer_id,
      name:         row.name ?? 'Unknown',
      phone:        row.whatsapp ?? '',
      tier:         deriveTier(row.conversions ?? 0),
      code:         row.ambassador_code ?? '',
      referrals:    Number(row.total_referrals ?? 0),
      conversions:  Number(row.conversions ?? 0),
      revenue:      Number(row.revenue_generated ?? 0),
      earned:       Number(row.points_earned ?? 0),
      pointsEarned: Number(row.points_earned ?? 0),
      joinedAt:     row.first_referral_at
        ? new Date(row.first_referral_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
        : '',
      usesCount:    Number(row.uses_count ?? 0),
      usesCap:      Number(row.uses_cap ?? 0),
    }))

    // Map activity rows. Status normalisation: a referral with reward_paid=true
    // is shown as 'converted' (treat credited as a finalised conversion) so we
    // don't add a fourth status the UI doesn't render.
    const activityList: ReferralActivity[] = (activityRows ?? []).map((r: any) => ({
      id:         r.id,
      referrer:   r.referrer_name ?? 'Unknown',
      referee:    r.referee_name ?? 'Unknown',
      status:     normaliseStatus(r.status, r.reward_paid),
      orderValue: r.first_purchase_amount ? Number(r.first_purchase_amount) : undefined,
      timestamp:  relativeTime(r.created_at),
    }))

    setReferrers(referrerRows)
    setActivities(activityList)
    setSelectedReferrer(referrerRows[0] ?? null)
    setLoading(false)
  }

  // Derive a tier band from conversion count. Tunable; Session 5 unifies this.
  function deriveTier(conversions: number): 'mama' | 'gold' | 'crown' {
    if (conversions >= 5) return 'crown'
    if (conversions >= 2) return 'gold'
    return 'mama'
  }

  function normaliseStatus(
    raw: string | null,
    rewardPaid: boolean | null,
  ): 'pending' | 'converted' | 'expired' {
    if (raw === 'expired') return 'expired'
    if (raw === 'converted' || rewardPaid === true) return 'converted'
    return 'pending'
  }

  function relativeTime(iso: string | null): string {
    if (!iso) return ''
    const ms = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(ms / 60_000)
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
    const days = Math.floor(hrs / 24)
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`
    return new Date(iso).toLocaleDateString()
  }

  // Single-tier display until finance defines real tier thresholds. All
  // ambassadors show with the same teal "Ambassador" badge. We keep the
  // tier field on the type so the rest of the JSX doesn't need rewriting.
  const getTierColor = (_tier: string) => 'var(--accent)'
  const getTierIcon = (_tier: string) => 'share2'
  const getTierLabel = (_tier: string) => 'Ambassador'

  const copyCode = (code: string) => {
    // Share message in Swanglish, matching SOKORA voice. The code is what
    // the till operator types in when posting a new referee's cash sale.
    const message = `Hujambo dada! 💕\n\nTumia code yangu ${code} ukinunua bidhaa za SOKORA. Tutapata zawadi sote!\n\nTafuta Your Organization kwenye WhatsApp au Instagram.`
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Open the edit modal — seeds form with current live settings and loads
  // the product list for the free-item picker.
  const openEditModal = async () => {
    if (!ambSettings) return
    setEditForm({ ...ambSettings })
    setEditError(null)
    setEditOpen(true)

    // Load products lazily on first open. Cache survives across modal re-opens
    // within the same page lifetime.
    if (editProducts.length === 0) {
      const { data } = await supabase
        .from('products')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
        .limit(500)
      setEditProducts((data ?? []) as { id: string; name: string }[])
    }
  }

  // Compute the change set (only fields that differ from live) and submit
  // it for approval. The approval executor will apply the change once an
  // approver approves it. The live config stays unchanged until approval.
  const saveEditChanges = async () => {
    if (!editForm || !ambSettings || !user) return
    setEditSaving(true); setEditError(null)

    // Diff: only include fields whose values changed
    const changes: Record<string, unknown> = {}
    if (editForm.benefit_shape !== ambSettings.benefit_shape) {
      changes.benefit_shape = editForm.benefit_shape
    }
    if (editForm.benefit_percent !== ambSettings.benefit_percent) {
      changes.benefit_percent = editForm.benefit_percent
    }
    if (editForm.benefit_tzs !== ambSettings.benefit_tzs) {
      changes.benefit_tzs = editForm.benefit_tzs
    }
    if (editForm.free_product_id !== ambSettings.free_product_id) {
      changes.free_product_id = editForm.free_product_id
    }
    if (editForm.default_max_uses !== ambSettings.default_max_uses) {
      changes.default_max_uses = editForm.default_max_uses
    }
    if (editForm.referrer_reward_points !== ambSettings.referrer_reward_points) {
      changes.referrer_reward_points = editForm.referrer_reward_points
    }

    if (Object.keys(changes).length === 0) {
      setEditError('No changes to submit')
      setEditSaving(false)
      return
    }

    // Build a human-readable summary so the approver can decide at a glance
    const summaryParts: string[] = []
    if ('benefit_shape' in changes) summaryParts.push(`Benefit shape → ${changes.benefit_shape}`)
    if ('benefit_percent' in changes) summaryParts.push(`Discount % → ${changes.benefit_percent}`)
    if ('benefit_tzs' in changes) summaryParts.push(`Flat discount TZS → ${changes.benefit_tzs}`)
    if ('free_product_id' in changes) summaryParts.push(`Free product changed`)
    if ('default_max_uses' in changes) summaryParts.push(`Default cap → ${changes.default_max_uses}`)
    if ('referrer_reward_points' in changes) summaryParts.push(`Referrer reward → ${changes.referrer_reward_points} pts`)

    const result = await submitForApproval({
      typeCode:        'ambassador_settings_change',
      referenceType:   'other',
      referenceId:     crypto.randomUUID(),  // synthetic — no voucher to attach to
      referenceNumber: `AMB-CFG-${new Date().toISOString().slice(0, 10)}`,
      summary:         summaryParts.join(' · '),
      payload:         changes,
      requestedBy:     user.id,
    })

    setEditSaving(false)

    if (!result.success) {
      setEditError(result.error || 'Submission failed')
      return
    }

    // Success — the request is now in the approvals queue. Close the modal
    // and show a one-shot toast via the simple alert pattern used elsewhere.
    setEditOpen(false)
    const who = result.assignedToName ? ` (${result.assignedToName})` : ''
    alert(`Change submitted for approval${who}. The new settings will go live once approved.`)
  }

  const totalReferrals = referrers.reduce((sum, r) => sum + r.referrals, 0)
  const totalConversions = referrers.reduce((sum, r) => sum + r.conversions, 0)
  const totalRevenue = referrers.reduce((sum, r) => sum + r.revenue, 0)
  const conversionRate = totalReferrals > 0 ? ((totalConversions / totalReferrals) * 100).toFixed(1) : '0'

  const filteredReferrers = referrers.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const s = {
    page: { padding: 24, maxWidth: 1600, margin: '0 auto' } as React.CSSProperties,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 } as React.CSSProperties,
    headerLeft: {} as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 } as React.CSSProperties,
    subtitle: { fontSize: 13, color: 'var(--text3)' } as React.CSSProperties,
    headerRight: { display: 'flex', gap: 10 } as React.CSSProperties,
    btnPrimary: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
    btnGhost: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, cursor: 'pointer' } as React.CSSProperties,

    // Stats
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 } as React.CSSProperties,
    statCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, textAlign: 'center' as const } as React.CSSProperties,
    statValue: (color: string) => ({ fontSize: 26, fontWeight: 800, color, fontFamily: 'var(--mono)' }) as React.CSSProperties,
    statLabel: { fontSize: 11, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,

    // Main layout
    mainGrid: { display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16 } as React.CSSProperties,

    // Leaderboard
    leaderboard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    leaderHeader: { padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
    leaderTitle: { fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    searchWrap: { position: 'relative' as const, width: 200 } as React.CSSProperties,
    searchInput: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px 8px 32px', fontSize: 11, color: 'var(--text)' } as React.CSSProperties,
    searchIcon: { position: 'absolute' as const, left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' } as React.CSSProperties,
    leaderList: { maxHeight: 500, overflowY: 'auto' as const } as React.CSSProperties,
    leaderItem: (isSelected: boolean, rank: number) => ({ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 12, 
      padding: '14px 16px', 
      borderBottom: '1px solid var(--border)', 
      cursor: 'pointer',
      background: isSelected ? 'rgba(133, 194, 190, 0.1)' : rank <= 3 ? `rgba(251, 191, 36, ${0.1 - rank * 0.02})` : 'transparent',
      borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent'
    }) as React.CSSProperties,
    rankBadge: (rank: number) => ({ 
      width: 28, 
      height: 28, 
      borderRadius: '50%', 
      background: rank === 1 ? '#fbbf24' : rank === 2 ? '#9ca3af' : rank === 3 ? '#cd7f32' : 'var(--surface3)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      fontSize: 12, 
      fontWeight: 700, 
      color: rank <= 3 ? '#fff' : 'var(--text3)',
      flexShrink: 0
    }) as React.CSSProperties,
    referrerInfo: { flex: 1, minWidth: 0 } as React.CSSProperties,
    referrerName: { fontWeight: 700, fontSize: 13, marginBottom: 2 } as React.CSSProperties,
    referrerCode: { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' } as React.CSSProperties,
    referrerStats: { textAlign: 'right' as const } as React.CSSProperties,
    referrerRefs: { fontSize: 14, fontWeight: 800, color: 'var(--accent)' } as React.CSSProperties,
    referrerConv: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    tierBadge: (color: string) => ({ fontSize: 9, background: `${color}20`, color, padding: '2px 8px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }) as React.CSSProperties,

    // Right panel
    rightPanel: { display: 'flex', flexDirection: 'column' as const, gap: 12 } as React.CSSProperties,

    // Referrer detail card
    detailCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    detailHeader: { padding: 16, textAlign: 'center' as const, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    detailAvatar: (color: string) => ({ width: 56, height: 56, borderRadius: '50%', background: `${color}20`, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }) as React.CSSProperties,
    detailName: { fontWeight: 800, fontSize: 16, marginBottom: 4 } as React.CSSProperties,
    detailPhone: { fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 } as React.CSSProperties,
    codeBox: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginTop: 12 } as React.CSSProperties,
    codeText: { flex: 1, fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700 } as React.CSSProperties,
    copyBtn: (copied: boolean) => ({ background: copied ? '#25d366' : 'var(--accent)', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#000', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }) as React.CSSProperties,
    detailStats: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: 12 } as React.CSSProperties,
    detailStat: { textAlign: 'center' as const, padding: 10, background: 'var(--surface2)', borderRadius: 8 } as React.CSSProperties,
    detailStatValue: (color: string) => ({ fontSize: 18, fontWeight: 800, color, fontFamily: 'var(--mono)' }) as React.CSSProperties,
    detailStatLabel: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    detailActions: { padding: 12, display: 'flex', gap: 8 } as React.CSSProperties,
    actionBtn: { flex: 1, padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties,
    actionBtnPrimary: { flex: 1, padding: '10px', background: '#25d366', border: 'none', borderRadius: 8, fontSize: 11, color: '#000', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties,

    // Activity feed
    activityCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    activityHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    activityList: { maxHeight: 220, overflowY: 'auto' as const } as React.CSSProperties,
    activityItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    activityIcon: (status: string) => ({ 
      width: 28, 
      height: 28, 
      borderRadius: '50%', 
      background: status === 'converted' ? 'rgba(37, 211, 102, 0.15)' : status === 'pending' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(107, 114, 128, 0.15)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      flexShrink: 0
    }) as React.CSSProperties,
    activityContent: { flex: 1, minWidth: 0 } as React.CSSProperties,
    activityText: { fontSize: 11, marginBottom: 2 } as React.CSSProperties,
    activityTime: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    activityValue: { fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
        <Icon name="share2" size={40} />
        <div style={{ marginLeft: 16, fontSize: 14 }}>Loading Referrals...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.title}>
            <Icon name="share2" size={28} color="#a855f7" />
            Referral System
          </h1>
          <p style={s.subtitle}>Track referrals, manage codes, and reward advocates</p>
        </div>
        <div style={s.headerRight}>
          <button style={s.btnGhost}>
            <Icon name="download" size={16} /> Export
          </button>
          <button style={s.btnPrimary}>
            <Icon name="plus" size={16} /> Create Code
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statValue('#a855f7')}>{totalReferrals}</div>
          <div style={s.statLabel}>Total Referrals</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#25d366')}>{totalConversions}</div>
          <div style={s.statLabel}>Conversions</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('var(--accent)')}>{tzs(totalRevenue)}</div>
          <div style={s.statLabel}>Revenue Generated</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#3b82f6')}>{conversionRate}%</div>
          <div style={s.statLabel}>Conversion Rate</div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={s.mainGrid}>
        {/* Leaderboard */}
        <div style={s.leaderboard}>
          <div style={s.leaderHeader}>
            <div style={s.leaderTitle}>
              <Icon name="trophy" size={18} color="#fbbf24" />
              Referrer Leaderboard
            </div>
            <div style={s.searchWrap}>
              <Icon name="search" size={12} style={s.searchIcon} />
              <input 
                style={s.searchInput}
                placeholder="Search referrers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div style={s.leaderList}>
            {filteredReferrers.map((referrer, index) => {
              const rank = index + 1
              const isSelected = selectedReferrer?.id === referrer.id
              
              return (
                <div 
                  key={referrer.id}
                  style={s.leaderItem(isSelected, rank)}
                  onClick={() => setSelectedReferrer(referrer)}
                >
                  <div style={s.rankBadge(rank)}>
                    {rank <= 3 ? <Icon name="medal" size={14} color="#fff" /> : rank}
                  </div>
                  <div style={s.referrerInfo}>
                    <div style={s.referrerName}>{referrer.name}</div>
                    <div style={s.referrerCode}>{referrer.code}</div>
                    <span style={s.tierBadge(getTierColor(referrer.tier))}>
                      <Icon name={getTierIcon(referrer.tier)} size={8} />
                      {getTierLabel(referrer.tier)}
                    </span>
                  </div>
                  <div style={s.referrerStats}>
                    <div style={s.referrerRefs}>{referrer.referrals} refs</div>
                    <div style={s.referrerConv}>{referrer.conversions} converted</div>
                    {referrer.usesCap > 0 && (
                      <div style={{
                        fontSize: 10, fontFamily: 'var(--mono)', marginTop: 2,
                        color: referrer.usesCount >= referrer.usesCap
                          ? '#ef4444'
                          : referrer.usesCount >= referrer.usesCap * 0.8
                            ? '#f59e0b'
                            : 'var(--text3)',
                      }}>
                        {referrer.usesCount} / {referrer.usesCap} uses
                      </div>
                    )}
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#25d366', fontFamily: 'var(--mono)', marginTop: 4 }}>
                      {tzs(referrer.earned)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div style={s.rightPanel}>
          {/* Referrer Detail */}
          {selectedReferrer && (
            <div style={s.detailCard}>
              <div style={s.detailHeader}>
                <div style={s.detailAvatar(getTierColor(selectedReferrer.tier))}>
                  <Icon name="user" size={28} color={getTierColor(selectedReferrer.tier)} />
                </div>
                <div style={s.detailName}>{selectedReferrer.name}</div>
                <div style={s.detailPhone}>{selectedReferrer.phone}</div>
                <span style={s.tierBadge(getTierColor(selectedReferrer.tier))}>
                  <Icon name={getTierIcon(selectedReferrer.tier)} size={10} />
                  {getTierLabel(selectedReferrer.tier)}
                </span>

                <div style={s.codeBox}>
                  <Icon name="share2" size={16} color="var(--text3)" />
                  <span style={s.codeText}>{selectedReferrer.code || 'No code'}</span>
                  <button
                    style={s.copyBtn(copied)}
                    onClick={() => copyCode(selectedReferrer.code)}
                    title="Copy a Swanglish share message with this code"
                  >
                    <Icon name={copied ? 'checkCircle' : 'copy'} size={12} />
                    {copied ? 'Copied' : 'Copy share message'}
                  </button>
                </div>
              </div>

              <div style={s.detailStats}>
                <div style={s.detailStat}>
                  <div style={s.detailStatValue('#a855f7')}>{selectedReferrer.referrals}</div>
                  <div style={s.detailStatLabel}>Referrals</div>
                </div>
                <div style={s.detailStat}>
                  <div style={s.detailStatValue('#25d366')}>{selectedReferrer.conversions}</div>
                  <div style={s.detailStatLabel}>Converted</div>
                </div>
                <div style={s.detailStat}>
                  <div style={s.detailStatValue('var(--accent)')}>{tzs(selectedReferrer.revenue)}</div>
                  <div style={s.detailStatLabel}>Revenue</div>
                </div>
                <div style={s.detailStat}>
                  <div style={s.detailStatValue('#f59e0b')}>{selectedReferrer.pointsEarned.toLocaleString()}</div>
                  <div style={s.detailStatLabel}>Points Earned</div>
                </div>
              </div>

              <div style={s.detailActions}>
                <button style={s.actionBtn}>
                  <Icon name="gift" size={14} /> Bonus Points
                </button>
                <button style={s.actionBtnPrimary}>
                  <Icon name="send" size={14} /> Send Link
                </button>
              </div>
            </div>
          )}

          {/* Activity Feed */}
          <div style={s.activityCard}>
            <div style={s.activityHeader}>
              <Icon name="trendingUp" size={16} color="var(--accent)" />
              Recent Activity
            </div>
            <div style={s.activityList}>
              {activities.map(activity => (
                <div key={activity.id} style={s.activityItem}>
                  <div style={s.activityIcon(activity.status)}>
                    <Icon 
                      name={activity.status === 'converted' ? 'checkCircle' : activity.status === 'pending' ? 'clock' : 'xCircle'} 
                      size={14} 
                      color={activity.status === 'converted' ? '#25d366' : activity.status === 'pending' ? '#f59e0b' : '#6b7280'} 
                    />
                  </div>
                  <div style={s.activityContent}>
                    <div style={s.activityText}>
                      <strong>{activity.referrer}</strong> referred <strong>{activity.referee}</strong>
                    </div>
                    <div style={s.activityTime}>{activity.timestamp}</div>
                  </div>
                  {activity.orderValue && (
                    <div style={s.activityValue}>{tzs(activity.orderValue)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Rewards info — driven by live config in crm_settings + catalog */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="gift" size={16} color="#f59e0b" />
                Ambassador rewards
              </div>
              <button
                onClick={openEditModal}
                disabled={!ambSettings}
                style={{
                  padding: '4px 10px', fontSize: 10, fontWeight: 700,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text)',
                  cursor: ambSettings ? 'pointer' : 'not-allowed',
                  opacity: ambSettings ? 1 : 0.5,
                  letterSpacing: 0.5, textTransform: 'uppercase',
                }}
                title="Edit ambassador program settings (requires approval)"
              >
                Edit
              </button>
            </div>
            {ambSettings && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
                  <span style={{ color: 'var(--text3)' }}>New mama gets</span>
                  <span style={{ fontWeight: 700 }}>
                    {ambSettings.benefit_shape === 'discount_pct' &&
                      `${ambSettings.benefit_percent ?? 0}% off`}
                    {ambSettings.benefit_shape === 'discount_tzs' &&
                      `${tzs(ambSettings.benefit_tzs ?? 0)} off`}
                    {ambSettings.benefit_shape === 'free_item' &&
                      (ambSettings.free_product_name || 'Free item (not configured)')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
                  <span style={{ color: 'var(--text3)' }}>Referrer earns</span>
                  <span style={{ fontWeight: 700 }}>{ambSettings.referrer_reward_points ?? 0} Crown points</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
                  <span style={{ color: 'var(--text3)' }}>Default cap per code</span>
                  <span style={{ fontWeight: 700 }}>{ambSettings.default_max_uses ?? 0} uses</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
                  Credited immediately at till. Edits require approval.
                </div>
              </>
            )}
            {!ambSettings && (
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Loading…</div>
            )}
          </div>

          {/* ─── Edit Modal ─── */}
          {editOpen && editForm && (
            <div
              onClick={() => !editSaving && setEditOpen(false)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000,
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 24, width: 480, maxHeight: '85vh',
                  overflowY: 'auto',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
                  Edit ambassador rewards
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>
                  Changes are queued for approval. The live config stays the same until an approver reviews and approves it.
                </div>

                {/* Benefit shape */}
                <div style={{ marginBottom: 14 }}>
                  <label style={modalLabel}>Benefit shape</label>
                  <select
                    style={modalInput}
                    value={editForm.benefit_shape ?? 'discount_pct'}
                    onChange={e => setEditForm({ ...editForm, benefit_shape: e.target.value as AmbassadorSettings['benefit_shape'] })}
                  >
                    <option value="discount_pct">Percentage discount</option>
                    <option value="discount_tzs">Flat TZS discount</option>
                    <option value="free_item">Free item</option>
                  </select>
                </div>

                {/* Conditional magnitude */}
                {editForm.benefit_shape === 'discount_pct' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={modalLabel}>Discount percent (0–100)</label>
                    <input
                      type="number" min={0} max={100} step="0.5"
                      style={modalInput}
                      value={editForm.benefit_percent ?? 0}
                      onChange={e => setEditForm({ ...editForm, benefit_percent: Number(e.target.value) })}
                    />
                  </div>
                )}
                {editForm.benefit_shape === 'discount_tzs' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={modalLabel}>Flat discount (TZS)</label>
                    <input
                      type="number" min={0} step={500}
                      style={modalInput}
                      value={editForm.benefit_tzs ?? 0}
                      onChange={e => setEditForm({ ...editForm, benefit_tzs: Number(e.target.value) })}
                    />
                  </div>
                )}
                {editForm.benefit_shape === 'free_item' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={modalLabel}>Free product</label>
                    <select
                      style={modalInput}
                      value={editForm.free_product_id ?? ''}
                      onChange={e => setEditForm({ ...editForm, free_product_id: e.target.value || null })}
                    >
                      <option value="">— select a product —</option>
                      {editProducts.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Default cap */}
                <div style={{ marginBottom: 14 }}>
                  <label style={modalLabel}>Default cap per code (uses)</label>
                  <input
                    type="number" min={1} step={1}
                    style={modalInput}
                    value={editForm.default_max_uses ?? 50}
                    onChange={e => setEditForm({ ...editForm, default_max_uses: Number(e.target.value) })}
                  />
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                    Inherited by every ambassador unless they have a per-code override.
                  </div>
                </div>

                {/* Referrer reward */}
                <div style={{ marginBottom: 18 }}>
                  <label style={modalLabel}>Referrer reward (Crown points per credited referral)</label>
                  <input
                    type="number" min={0} step={10}
                    style={modalInput}
                    value={editForm.referrer_reward_points ?? 0}
                    onChange={e => setEditForm({ ...editForm, referrer_reward_points: Number(e.target.value) })}
                  />
                </div>

                {editError && (
                  <div style={{
                    padding: '8px 12px', marginBottom: 12,
                    background: 'rgba(239,68,68,.10)',
                    border: '1px solid rgba(239,68,68,.4)',
                    borderRadius: 6, fontSize: 11, color: '#ef4444',
                  }}>
                    {editError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setEditOpen(false)}
                    disabled={editSaving}
                    style={{
                      padding: '8px 14px', fontSize: 12, fontWeight: 700,
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 6, color: 'var(--text)', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEditChanges}
                    disabled={editSaving}
                    style={{
                      padding: '8px 14px', fontSize: 12, fontWeight: 700,
                      background: 'var(--accent)', border: 'none',
                      borderRadius: 6, color: '#000', cursor: 'pointer',
                      opacity: editSaving ? 0.6 : 1,
                    }}
                  >
                    {editSaving ? 'Submitting…' : 'Submit for approval'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Modal-local input styles
const modalLabel: React.CSSProperties = {
  fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)',
  textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4,
}
const modalInput: React.CSSProperties = {
  width: '100%', background: 'var(--surface)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 6,
  padding: '8px 10px', fontSize: 13, fontFamily: 'var(--mono)',
}
