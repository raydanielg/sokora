import { useState, useEffect } from 'react'
// supabase import ready for real data
// import { supabase } from '../lib/supabase'
// import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void
}

// Lucide Icon component
const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  
  const paths: Record<string, React.ReactNode> = {
    messageSquare: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
    messageCircle: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    starFilled: <><polygon fill="currentColor" stroke="none" points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    thumbsUp: <><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></>,
    thumbsDown: <><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    alertTriangle: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash2: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    moreVertical: <><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    lightbulb: <><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface FeedbackItem {
  id: string
  customer_name: string
  customer_phone: string
  tier: 'mama' | 'gold' | 'crown'
  type: 'review' | 'complaint' | 'suggestion' | 'testimonial'
  rating?: number
  product?: string
  message: string
  status: 'new' | 'in_progress' | 'resolved' | 'approved' | 'rejected'
  priority: 'low' | 'medium' | 'high'
  assignedTo?: string
  createdAt: string
  updatedAt?: string
  response?: string
}

export default function CRMFeedback({ onNav }: Props) {
  void onNav // available for future navigation
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [responseText, setResponseText] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    // Demo data
    setFeedbackItems([
      { id: '1', customer_name: 'Amina Hassan', customer_phone: '+255 712 345 678', tier: 'crown', type: 'review', rating: 5, product: 'Breast Pump', message: 'Breast pump ni nzuri sana! Inafanya kazi vizuri na ni rahisi kusafisha. Napendekeza kwa mama wote wanaonyonyesha.', status: 'new', priority: 'low', createdAt: '2 hours ago' },
      { id: '2', customer_name: 'Grace Mwanza', customer_phone: '+255 754 987 654', tier: 'crown', type: 'testimonial', rating: 5, product: 'Belly Binder', message: 'Binder imenisaidia kupona haraka baada ya C-section. Sasa naweza kusimama na kutembea bila maumivu. Asante SOKORA!', status: 'approved', priority: 'low', createdAt: '1 day ago' },
      { id: '3', customer_name: 'Mwajuma Said', customer_phone: '+255 698 111 222', tier: 'mama', type: 'complaint', message: 'Delivery ilichelewa siku 2. Nilihitaji bidhaa haraka lakini ilifika baada ya tarehe niliyoahidiwa.', status: 'in_progress', priority: 'high', assignedTo: 'Barbra', createdAt: '2 days ago' },
      { id: '4', customer_name: 'Fatuma Iddi', customer_phone: '+255 621 445 889', tier: 'gold', type: 'suggestion', message: 'Mnaweza kuongeza M-Pesa kama njia ya kulipa? Itakuwa rahisi zaidi kuliko bank transfer.', status: 'new', priority: 'medium', createdAt: '3 days ago' },
      { id: '5', customer_name: 'Neema Omari', customer_phone: '+255 765 432 100', tier: 'mama', type: 'review', rating: 4, product: 'U-Shape Pillow', message: 'Pillow ni nzuri lakini ukubwa ni mdogo kidogo kwa mimi. Vinginevyo ni sawa.', status: 'resolved', priority: 'low', createdAt: '4 days ago', response: 'Asante kwa maoni yako. Tunafanyia kazi kuongeza saizi kubwa zaidi.' },
      { id: '6', customer_name: 'Halima Juma', customer_phone: '+255 788 222 333', tier: 'mama', type: 'complaint', message: 'Bidhaa niliyopokea haina manual ya Kiswahili. Ni ngumu kuelewa jinsi ya kutumia.', status: 'new', priority: 'medium', createdAt: '5 days ago' },
      { id: '7', customer_name: 'Zainab Ally', customer_phone: '+255 621 333 444', tier: 'gold', type: 'testimonial', rating: 5, product: 'Delivery Kit', message: 'Delivery Kit iliokoa maisha yangu hospitali! Nilikuwa na kila kitu nilichohitaji. Asante SOKORA kwa huduma nzuri.', status: 'approved', priority: 'low', createdAt: '1 week ago' },
    ])

    setLoading(false)
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'crown': return '#f472b6'
      case 'gold': return '#fbbf24'
      default: return '#10b981'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'review': return '#fbbf24'
      case 'complaint': return '#ef4444'
      case 'suggestion': return '#3b82f6'
      case 'testimonial': return '#10b981'
      default: return '#6b7280'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'review': return 'star'
      case 'complaint': return 'alertCircle'
      case 'suggestion': return 'lightbulb'
      case 'testimonial': return 'thumbsUp'
      default: return 'messageSquare'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return '#3b82f6'
      case 'in_progress': return '#f59e0b'
      case 'resolved': return '#10b981'
      case 'approved': return '#10b981'
      case 'rejected': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new': return 'inbox'
      case 'in_progress': return 'clock'
      case 'resolved': return 'checkCircle'
      case 'approved': return 'checkCircle'
      case 'rejected': return 'xCircle'
      default: return 'clock'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#ef4444'
      case 'medium': return '#f59e0b'
      default: return '#6b7280'
    }
  }

  const filteredItems = feedbackItems.filter(item => {
    if (filterType !== 'all' && item.type !== filterType) return false
    if (filterStatus !== 'all' && item.status !== filterStatus) return false
    if (searchQuery && !item.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) && !item.message.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const stats = {
    total: feedbackItems.length,
    new: feedbackItems.filter(f => f.status === 'new').length,
    inProgress: feedbackItems.filter(f => f.status === 'in_progress').length,
    resolved: feedbackItems.filter(f => ['resolved', 'approved'].includes(f.status)).length,
    avgRating: (feedbackItems.filter(f => f.rating).reduce((sum, f) => sum + (f.rating || 0), 0) / feedbackItems.filter(f => f.rating).length).toFixed(1),
    testimonials: feedbackItems.filter(f => f.type === 'testimonial' && f.status === 'approved').length,
  }

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
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 } as React.CSSProperties,
    statCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, textAlign: 'center' as const } as React.CSSProperties,
    statValue: (color: string) => ({ fontSize: 22, fontWeight: 800, color, fontFamily: 'var(--mono)' }) as React.CSSProperties,
    statLabel: { fontSize: 10, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,

    // Filters
    filters: { display: 'flex', gap: 12, marginBottom: 16 } as React.CSSProperties,
    searchWrap: { position: 'relative' as const, flex: 1, maxWidth: 280 } as React.CSSProperties,
    searchInput: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px 10px 36px', fontSize: 12, color: 'var(--text)' } as React.CSSProperties,
    searchIcon: { position: 'absolute' as const, left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' } as React.CSSProperties,
    filterGroup: { display: 'flex', gap: 4 } as React.CSSProperties,
    filterPill: (isActive: boolean, color?: string) => ({ padding: '8px 12px', borderRadius: 6, fontSize: 11, fontWeight: isActive ? 700 : 400, background: isActive ? (color || 'var(--accent)') : 'var(--surface2)', color: isActive ? '#000' : 'var(--text3)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }) as React.CSSProperties,

    // Main layout
    mainGrid: { display: 'grid', gridTemplateColumns: '1fr 400px', gap: 16 } as React.CSSProperties,

    // Feedback list
    feedbackList: { display: 'flex', flexDirection: 'column' as const, gap: 10 } as React.CSSProperties,
    feedbackCard: (isSelected: boolean, priority: string) => ({ 
      background: 'var(--card)', 
      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)', 
      borderRadius: 12, 
      padding: 16, 
      cursor: 'pointer',
      borderLeft: priority === 'high' ? '4px solid #ef4444' : priority === 'medium' ? '4px solid #f59e0b' : '4px solid transparent',
      transition: 'all .15s'
    }) as React.CSSProperties,
    feedbackHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 } as React.CSSProperties,
    feedbackCustomer: { display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
    feedbackAvatar: (color: string) => ({ width: 36, height: 36, borderRadius: '50%', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as React.CSSProperties,
    feedbackName: { fontWeight: 700, fontSize: 13, marginBottom: 2 } as React.CSSProperties,
    feedbackProduct: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    feedbackBadges: { display: 'flex', gap: 6 } as React.CSSProperties,
    badge: (color: string) => ({ fontSize: 9, background: `${color}20`, color, padding: '3px 8px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }) as React.CSSProperties,
    feedbackMessage: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 10 } as React.CSSProperties,
    feedbackFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
    feedbackMeta: { display: 'flex', gap: 12, fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    metaItem: { display: 'flex', alignItems: 'center', gap: 4 } as React.CSSProperties,
    starRating: { display: 'flex', gap: 2 } as React.CSSProperties,

    // Detail panel
    detailPanel: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    detailHeader: { padding: 16, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    detailTitle: { fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    detailCustomer: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 } as React.CSSProperties,
    detailAvatar: (color: string) => ({ width: 48, height: 48, borderRadius: '50%', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }) as React.CSSProperties,
    detailName: { fontWeight: 700, fontSize: 15 } as React.CSSProperties,
    detailPhone: { fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' } as React.CSSProperties,
    detailBody: { padding: 16 } as React.CSSProperties,
    detailMessage: { fontSize: 13, lineHeight: 1.6, marginBottom: 16, padding: 14, background: 'var(--surface2)', borderRadius: 8 } as React.CSSProperties,
    detailMeta: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 } as React.CSSProperties,
    metaCard: { padding: 10, background: 'var(--surface2)', borderRadius: 8 } as React.CSSProperties,
    metaLabel: { fontSize: 10, color: 'var(--text3)', marginBottom: 4 } as React.CSSProperties,
    metaValue: { fontSize: 12, fontWeight: 600 } as React.CSSProperties,
    responseSection: { marginTop: 16 } as React.CSSProperties,
    responseLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 } as React.CSSProperties,
    responseInput: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text)', resize: 'none' as const, minHeight: 80 } as React.CSSProperties,
    detailActions: { padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 } as React.CSSProperties,
    actionBtn: { flex: 1, padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties,
    actionBtnPrimary: { flex: 1, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 8, fontSize: 11, color: '#000', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties,
    actionBtnDanger: { flex: 1, padding: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, fontSize: 11, color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
        <Icon name="messageSquare" size={40} />
        <div style={{ marginLeft: 16, fontSize: 14 }}>Loading Feedback...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.title}>
            <Icon name="messageSquare" size={28} color="#f59e0b" />
            Feedback Management
          </h1>
          <p style={s.subtitle}>Reviews, complaints, suggestions, and testimonials</p>
        </div>
        <div style={s.headerRight}>
          <button style={s.btnGhost}>
            <Icon name="download" size={16} /> Export Testimonials
          </button>
          <button style={s.btnPrimary}>
            <Icon name="plus" size={16} /> New Ticket
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statValue('var(--text)')}>{stats.total}</div>
          <div style={s.statLabel}>Total Feedback</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#3b82f6')}>{stats.new}</div>
          <div style={s.statLabel}>New</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#f59e0b')}>{stats.inProgress}</div>
          <div style={s.statLabel}>In Progress</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#10b981')}>{stats.resolved}</div>
          <div style={s.statLabel}>Resolved</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('var(--accent)')}>{stats.avgRating}</div>
          <div style={s.statLabel}>Avg Rating</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#10b981')}>{stats.testimonials}</div>
          <div style={s.statLabel}>Testimonials</div>
        </div>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <div style={s.searchWrap}>
          <Icon name="search" size={14} style={s.searchIcon} />
          <input 
            style={s.searchInput}
            placeholder="Search feedback..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={s.filterGroup}>
          {['all', 'review', 'complaint', 'suggestion', 'testimonial'].map(type => (
            <button 
              key={type}
              style={s.filterPill(filterType === type, type !== 'all' ? getTypeColor(type) : undefined)}
              onClick={() => setFilterType(type)}
            >
              {type !== 'all' && <Icon name={getTypeIcon(type)} size={10} />}
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
        <div style={s.filterGroup}>
          {['all', 'new', 'in_progress', 'resolved'].map(status => (
            <button 
              key={status}
              style={s.filterPill(filterStatus === status)}
              onClick={() => setFilterStatus(status)}
            >
              {status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div style={s.mainGrid}>
        {/* Feedback List */}
        <div style={s.feedbackList}>
          {filteredItems.map(item => {
            const isSelected = selectedItem?.id === item.id
            return (
              <div 
                key={item.id}
                style={s.feedbackCard(isSelected, item.priority)}
                onClick={() => setSelectedItem(item)}
              >
                <div style={s.feedbackHeader}>
                  <div style={s.feedbackCustomer}>
                    <div style={s.feedbackAvatar(getTierColor(item.tier))}>
                      <Icon name="user" size={18} color={getTierColor(item.tier)} />
                    </div>
                    <div>
                      <div style={s.feedbackName}>{item.customer_name}</div>
                      <div style={s.feedbackProduct}>{item.product || 'General'}</div>
                    </div>
                  </div>
                  <div style={s.feedbackBadges}>
                    <span style={s.badge(getTypeColor(item.type))}>
                      <Icon name={getTypeIcon(item.type)} size={10} />
                      {item.type}
                    </span>
                    <span style={s.badge(getStatusColor(item.status))}>
                      <Icon name={getStatusIcon(item.status)} size={10} />
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div style={s.feedbackMessage}>{item.message}</div>

                <div style={s.feedbackFooter}>
                  <div style={s.feedbackMeta}>
                    {item.rating && (
                      <div style={s.starRating}>
                        {[1,2,3,4,5].map(n => (
                          <Icon key={n} name={n <= item.rating! ? 'starFilled' : 'star'} size={12} color="#fbbf24" />
                        ))}
                      </div>
                    )}
                    <span style={s.metaItem}>
                      <Icon name="clock" size={10} />
                      {item.createdAt}
                    </span>
                    {item.assignedTo && (
                      <span style={s.metaItem}>
                        <Icon name="user" size={10} />
                        {item.assignedTo}
                      </span>
                    )}
                  </div>
                  <span style={s.badge(getTierColor(item.tier))}>
                    <Icon name={item.tier === 'crown' ? 'crown' : item.tier === 'gold' ? 'award' : 'heart'} size={8} />
                    {item.tier}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Detail Panel */}
        {selectedItem ? (
          <div style={s.detailPanel}>
            <div style={s.detailHeader}>
              <div style={s.detailTitle}>
                <Icon name={getTypeIcon(selectedItem.type)} size={18} color={getTypeColor(selectedItem.type)} />
                {selectedItem.type.charAt(0).toUpperCase() + selectedItem.type.slice(1)} Details
              </div>
              <div style={s.detailCustomer}>
                <div style={s.detailAvatar(getTierColor(selectedItem.tier))}>
                  <Icon name="user" size={24} color={getTierColor(selectedItem.tier)} />
                </div>
                <div>
                  <div style={s.detailName}>{selectedItem.customer_name}</div>
                  <div style={s.detailPhone}>{selectedItem.customer_phone}</div>
                </div>
              </div>
            </div>

            <div style={s.detailBody}>
              <div style={s.detailMessage}>
                {selectedItem.message}
              </div>

              {selectedItem.rating && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Rating</div>
                  <div style={s.starRating}>
                    {[1,2,3,4,5].map(n => (
                      <Icon key={n} name={n <= selectedItem.rating! ? 'starFilled' : 'star'} size={20} color="#fbbf24" />
                    ))}
                  </div>
                </div>
              )}

              <div style={s.detailMeta}>
                <div style={s.metaCard}>
                  <div style={s.metaLabel}>Status</div>
                  <div style={{ ...s.metaValue, color: getStatusColor(selectedItem.status) }}>
                    {selectedItem.status.replace('_', ' ')}
                  </div>
                </div>
                <div style={s.metaCard}>
                  <div style={s.metaLabel}>Priority</div>
                  <div style={{ ...s.metaValue, color: getPriorityColor(selectedItem.priority) }}>
                    {selectedItem.priority}
                  </div>
                </div>
                <div style={s.metaCard}>
                  <div style={s.metaLabel}>Created</div>
                  <div style={s.metaValue}>{selectedItem.createdAt}</div>
                </div>
                <div style={s.metaCard}>
                  <div style={s.metaLabel}>Assigned To</div>
                  <div style={s.metaValue}>{selectedItem.assignedTo || 'Unassigned'}</div>
                </div>
              </div>

              {selectedItem.response && (
                <div style={{ marginBottom: 16, padding: 14, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="checkCircle" size={12} />
                    Response Sent
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text)' }}>{selectedItem.response}</div>
                </div>
              )}

              {!selectedItem.response && (
                <div style={s.responseSection}>
                  <div style={s.responseLabel}>Write Response</div>
                  <textarea 
                    style={s.responseInput}
                    placeholder="Type your response..."
                    value={responseText}
                    onChange={e => setResponseText(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div style={s.detailActions}>
              {selectedItem.type === 'testimonial' && selectedItem.status !== 'approved' && (
                <>
                  <button style={s.actionBtnDanger}>
                    <Icon name="xCircle" size={14} /> Reject
                  </button>
                  <button style={s.actionBtnPrimary}>
                    <Icon name="checkCircle" size={14} /> Approve
                  </button>
                </>
              )}
              {selectedItem.type !== 'testimonial' && (
                <>
                  <button style={s.actionBtn}>
                    <Icon name="user" size={14} /> Assign
                  </button>
                  <button style={s.actionBtnPrimary}>
                    <Icon name="send" size={14} /> Send Response
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{ ...s.detailPanel, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
            <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
              <Icon name="messageSquare" size={40} style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 13 }}>Select feedback to view details</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
