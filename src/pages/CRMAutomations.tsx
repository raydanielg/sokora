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
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    zapOff: <><polyline points="12.41 6.75 13 2 10.57 4.92"/><polyline points="18.57 12.91 21 10 15.66 10"/><polyline points="8 8 3 14 12 14 11 22 16 16"/><line x1="1" y1="1" x2="23" y2="23"/></>,
    play: <><polygon points="5 3 19 12 5 21 5 3"/></>,
    pause: <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash2: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    alertTriangle: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    messageCircle: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    shoppingCart: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    baby: <><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    moreVertical: <><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface Automation {
  id: string
  name: string
  description: string
  trigger: string
  triggerType: 'event' | 'schedule' | 'condition'
  delay?: string
  messageTemplate: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  isActive: boolean
  category: 'purchase' | 'pregnancy' | 'engagement' | 'loyalty' | 'feedback'
  icon: string
  iconColor: string
  lastTriggered?: string
}

interface DeliveryLog {
  id: string
  automation: string
  customer: string
  status: 'delivered' | 'failed' | 'pending'
  timestamp: string
}

export default function CRMAutomations({ onNav }: Props) {
  void onNav // available for future navigation
  const [automations, setAutomations] = useState<Automation[]>([])
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    // Demo data
    setAutomations([
      {
        id: '1',
        name: 'Post-Purchase: Usage Instructions',
        description: 'Send product usage guide after order confirmation',
        trigger: 'Order confirmed',
        triggerType: 'event',
        delay: 'Wait 1 hour',
        messageTemplate: 'Habari [Jina]! Asante kwa kununua [Bidhaa] kutoka SOKORA 💚 Hapa kuna jinsi ya kutumia vizuri: [Link]. Una swali lolote? Tupigie WhatsApp!',
        sent: 342,
        delivered: 322,
        opened: 219,
        clicked: 87,
        isActive: true,
        category: 'purchase',
        icon: 'shoppingCart',
        iconColor: '#25d366',
        lastTriggered: '2 hours ago'
      },
      {
        id: '2',
        name: 'Week 30 Pregnancy Tips',
        description: 'Automated pregnancy milestone message',
        trigger: 'Profile week = 30',
        triggerType: 'condition',
        messageTemplate: '[Jina], unafika wiki ya 30 — hongera! 🎉 Wiki hii mtoto wako anakua haraka. Hapa kuna mambo muhimu ya kujiandaa: [Tips Link]. Tuna delivery kit tayari kwako!',
        sent: 89,
        delivered: 86,
        opened: 72,
        clicked: 34,
        isActive: true,
        category: 'pregnancy',
        icon: 'baby',
        iconColor: '#3b82f6',
        lastTriggered: 'Yesterday'
      },
      {
        id: '3',
        name: '30-Day Inactive Re-engagement',
        description: 'Win-back campaign for dormant customers',
        trigger: 'No activity for 30 days',
        triggerType: 'schedule',
        delay: 'Cron: Daily 10 AM',
        messageTemplate: 'Habari [Jina]! Tumekukosa 💚 Una swali au unahitaji msaada wowote? Tunatoa discount ya 10% wiki hii kwa kurudi — code: KARIBU10',
        sent: 23,
        delivered: 20,
        opened: 8,
        clicked: 3,
        isActive: true,
        category: 'engagement',
        icon: 'clock',
        iconColor: '#ef4444',
        lastTriggered: 'Today 10:00 AM'
      },
      {
        id: '4',
        name: 'Positive Feedback → Request Testimonial',
        description: 'Follow up on positive feedback for testimonials',
        trigger: 'Feedback marked "positive"',
        triggerType: 'event',
        delay: 'Wait 24 hours',
        messageTemplate: '[Jina], tunafuraha umefurahia bidhaa yetu! 🌟 Je, unaweza kushiriki maoni yako kwa maneno mafupi? Itatusaidia kufikia mama wengine. Utapata pointi 200 za Crown!',
        sent: 67,
        delivered: 65,
        opened: 48,
        clicked: 29,
        isActive: true,
        category: 'feedback',
        icon: 'star',
        iconColor: '#f59e0b',
        lastTriggered: '3 hours ago'
      },
      {
        id: '5',
        name: 'Crown Tier Upgrade Celebration',
        description: 'Congratulate customers reaching Crown tier',
        trigger: 'Customer reaches Crown tier (15,000 pts)',
        triggerType: 'event',
        messageTemplate: '🎉 Hongera [Jina]! Umefika Crown tier! Sasa una heshima ya pekee katika familia ya SOKORA. Funguo za VIP group zimekuwa zako: [Link]',
        sent: 12,
        delivered: 12,
        opened: 11,
        clicked: 9,
        isActive: true,
        category: 'loyalty',
        icon: 'crown',
        iconColor: '#a855f7',
        lastTriggered: '1 week ago'
      },
      {
        id: '6',
        name: 'Abandoned Cart Recovery',
        description: 'Remind customers about items left in cart',
        trigger: 'Cart abandoned for 2 hours',
        triggerType: 'event',
        delay: 'Wait 2 hours',
        messageTemplate: '[Jina], umesahau kitu! 🛒 Una [Bidhaa] kwenye cart yako. Unaihitaji? Tuma NDIO kupata link ya kumaliza order yako.',
        sent: 156,
        delivered: 148,
        opened: 89,
        clicked: 42,
        isActive: false,
        category: 'purchase',
        icon: 'shoppingCart',
        iconColor: '#6b7280',
        lastTriggered: 'Paused'
      },
      {
        id: '7',
        name: 'Birthday Wishes + Discount',
        description: 'Send birthday greetings with special discount',
        trigger: 'Customer birthday',
        triggerType: 'schedule',
        delay: 'Cron: Daily 8 AM',
        messageTemplate: 'Hongera siku yako ya kuzaliwa [Jina]! 🎂 SOKORA inakutakia siku njema! Tumekupa zawadi: 15% discount kwa wiki hii. Code: BIRTHDAY[JINA]',
        sent: 34,
        delivered: 33,
        opened: 28,
        clicked: 12,
        isActive: true,
        category: 'engagement',
        icon: 'heart',
        iconColor: '#ec4899',
        lastTriggered: 'Today 8:00 AM'
      },
      {
        id: '8',
        name: 'Delivery Kit Week 36 Push',
        description: 'Upsell delivery kit to Week 36+ pregnant customers',
        trigger: 'Profile week >= 36 AND no delivery kit purchase',
        triggerType: 'condition',
        messageTemplate: '[Jina], uko karibu na siku kubwa! 👶 Delivery Kit yetu ina vitu vyote unavyohitaji hospitali. TZS 250,000 tu. Je, ungependa kuona? Tuma NDIO.',
        sent: 78,
        delivered: 75,
        opened: 58,
        clicked: 31,
        isActive: true,
        category: 'pregnancy',
        icon: 'package',
        iconColor: '#06b6d4',
        lastTriggered: '4 hours ago'
      },
    ])

    setDeliveryLogs([
      { id: '1', automation: 'Post-Purchase Instructions', customer: 'Amina Hassan', status: 'delivered', timestamp: '2 min ago' },
      { id: '2', automation: 'Week 30 Tips', customer: 'Grace Mwanza', status: 'delivered', timestamp: '14 min ago' },
      { id: '3', automation: 'Feedback Request', customer: 'Zainab Ally', status: 'delivered', timestamp: '28 min ago' },
      { id: '4', automation: 'Crown Upgrade', customer: 'Fatuma Iddi', status: 'delivered', timestamp: '1h ago' },
      { id: '5', automation: 'Re-engagement', customer: 'Mwajuma Said', status: 'failed', timestamp: '1h ago' },
      { id: '6', automation: 'Post-Purchase Instructions', customer: 'Neema Omari', status: 'delivered', timestamp: '2h ago' },
      { id: '7', automation: 'Delivery Kit Push', customer: 'Halima Juma', status: 'pending', timestamp: '3h ago' },
    ])

    setLoading(false)
  }

  const toggleAutomation = (id: string) => {
    setAutomations(automations.map(a => 
      a.id === id ? { ...a, isActive: !a.isActive } : a
    ))
  }

  const filteredAutomations = automations.filter(a => {
    if (filterCategory !== 'all' && a.category !== filterCategory) return false
    if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const totalSent = automations.reduce((sum, a) => sum + a.sent, 0)
  const totalDelivered = automations.reduce((sum, a) => sum + a.delivered, 0)
  const avgDeliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : '0'
  const avgOpenRate = totalDelivered > 0 ? ((automations.reduce((sum, a) => sum + a.opened, 0) / totalDelivered) * 100).toFixed(1) : '0'

  const s = {
    page: { padding: 24, maxWidth: 1600, margin: '0 auto' } as React.CSSProperties,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 } as React.CSSProperties,
    headerLeft: {} as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 } as React.CSSProperties,
    subtitle: { fontSize: 13, color: 'var(--text3)' } as React.CSSProperties,
    headerRight: { display: 'flex', gap: 10 } as React.CSSProperties,
    btnPrimary: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
    btnGhost: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, cursor: 'pointer' } as React.CSSProperties,

    // Stats grid
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 } as React.CSSProperties,
    statCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, textAlign: 'center' as const } as React.CSSProperties,
    statValue: (color: string) => ({ fontSize: 26, fontWeight: 800, color, fontFamily: 'var(--mono)' }) as React.CSSProperties,
    statLabel: { fontSize: 11, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,

    // Filters
    filters: { display: 'flex', gap: 12, marginBottom: 20 } as React.CSSProperties,
    searchWrap: { position: 'relative' as const, flex: 1, maxWidth: 300 } as React.CSSProperties,
    searchInput: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px 10px 36px', fontSize: 12, color: 'var(--text)' } as React.CSSProperties,
    searchIcon: { position: 'absolute' as const, left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' } as React.CSSProperties,
    filterPills: { display: 'flex', gap: 6 } as React.CSSProperties,
    filterPill: (isActive: boolean) => ({ padding: '8px 14px', borderRadius: 20, fontSize: 11, fontWeight: isActive ? 700 : 400, background: isActive ? 'var(--accent)' : 'var(--surface2)', color: isActive ? '#000' : 'var(--text3)', border: '1px solid var(--border)', cursor: 'pointer' }) as React.CSSProperties,

    // Main layout
    mainGrid: { display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 } as React.CSSProperties,

    // Automation cards
    automationList: { display: 'flex', flexDirection: 'column' as const, gap: 12 } as React.CSSProperties,
    automationCard: (isActive: boolean) => ({ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, opacity: isActive ? 1 : 0.6 }) as React.CSSProperties,
    automationHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 } as React.CSSProperties,
    automationInfo: { display: 'flex', gap: 12 } as React.CSSProperties,
    automationIcon: (color: string) => ({ width: 40, height: 40, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as React.CSSProperties,
    automationMeta: {} as React.CSSProperties,
    automationName: { fontWeight: 700, fontSize: 14, marginBottom: 4 } as React.CSSProperties,
    automationTrigger: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    automationActions: { display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
    sentBadge: (color: string) => ({ fontSize: 10, background: `${color}20`, color, padding: '4px 10px', borderRadius: 10, fontWeight: 600 }) as React.CSSProperties,
    toggleSwitch: (isOn: boolean) => ({ width: 44, height: 24, borderRadius: 12, background: isOn ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', position: 'relative' as const, transition: 'all .2s' }) as React.CSSProperties,
    toggleThumb: (isOn: boolean) => ({ position: 'absolute' as const, top: 3, width: 18, height: 18, borderRadius: '50%', background: isOn ? '#000' : 'var(--text3)', transition: 'all .2s', ...(isOn ? { right: 3 } : { left: 3 }) }) as React.CSSProperties,
    
    // Message preview
    messagePreview: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 14 } as React.CSSProperties,
    messageLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
    messageText: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 } as React.CSSProperties,

    // Stats row
    automationStats: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 } as React.CSSProperties,
    miniStat: { textAlign: 'center' as const } as React.CSSProperties,
    miniStatValue: (color: string) => ({ fontSize: 16, fontWeight: 800, color, fontFamily: 'var(--mono)' }) as React.CSSProperties,
    miniStatLabel: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,

    // Delivery log
    logCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 } as React.CSSProperties,
    logTitle: { fontWeight: 700, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    logList: { display: 'flex', flexDirection: 'column' as const, gap: 8, maxHeight: 500, overflowY: 'auto' as const } as React.CSSProperties,
    logItem: { display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: 'var(--surface2)', borderRadius: 8 } as React.CSSProperties,
    logStatus: (status: string) => ({ width: 8, height: 8, borderRadius: '50%', background: status === 'delivered' ? '#25d366' : status === 'failed' ? '#ef4444' : '#f59e0b', flexShrink: 0 }) as React.CSSProperties,
    logContent: { flex: 1, minWidth: 0 } as React.CSSProperties,
    logAutomation: { fontSize: 11, fontWeight: 600, marginBottom: 2 } as React.CSSProperties,
    logCustomer: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    logTime: { fontSize: 10, color: 'var(--text3)', textAlign: 'right' as const } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
        <Icon name="zap" size={40} />
        <div style={{ marginLeft: 16, fontSize: 14 }}>Loading Automations...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.title}>
            <Icon name="zap" size={28} color="#10b981" />
            Automation Engine
          </h1>
          <p style={s.subtitle}>Event-based WhatsApp triggers · Sequences · Cron jobs</p>
        </div>
        <div style={s.headerRight}>
          <button style={s.btnGhost}>
            <Icon name="pause" size={16} /> Pause All
          </button>
          <button style={s.btnPrimary}>
            <Icon name="plus" size={16} /> New Automation
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statValue('var(--accent)')}>{automations.filter(a => a.isActive).length}</div>
          <div style={s.statLabel}>Active Automations</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#25d366')}>{totalSent.toLocaleString()}</div>
          <div style={s.statLabel}>Messages Sent (30d)</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#3b82f6')}>{avgDeliveryRate}%</div>
          <div style={s.statLabel}>Delivery Rate</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#f59e0b')}>{avgOpenRate}%</div>
          <div style={s.statLabel}>Open Rate</div>
        </div>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <div style={s.searchWrap}>
          <Icon name="search" size={14} style={s.searchIcon} />
          <input 
            style={s.searchInput}
            placeholder="Search automations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={s.filterPills}>
          {['all', 'purchase', 'pregnancy', 'engagement', 'loyalty', 'feedback'].map(cat => (
            <button 
              key={cat}
              style={s.filterPill(filterCategory === cat)}
              onClick={() => setFilterCategory(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div style={s.mainGrid}>
        {/* Automation List */}
        <div style={s.automationList}>
          {filteredAutomations.map(auto => {
            const deliveryRate = auto.sent > 0 ? ((auto.delivered / auto.sent) * 100).toFixed(1) : '0'
            const openRate = auto.delivered > 0 ? ((auto.opened / auto.delivered) * 100).toFixed(1) : '0'
            const clickRate = auto.opened > 0 ? ((auto.clicked / auto.opened) * 100).toFixed(1) : '0'
            
            return (
              <div key={auto.id} style={s.automationCard(auto.isActive)}>
                <div style={s.automationHeader}>
                  <div style={s.automationInfo}>
                    <div style={s.automationIcon(auto.iconColor)}>
                      <Icon name={auto.icon} size={20} color={auto.iconColor} />
                    </div>
                    <div style={s.automationMeta}>
                      <div style={s.automationName}>{auto.name}</div>
                      <div style={s.automationTrigger}>
                        <Icon name="zap" size={10} style={{ marginRight: 4 }} />
                        Triggers: {auto.trigger} {auto.delay && `→ ${auto.delay}`}
                      </div>
                    </div>
                  </div>
                  <div style={s.automationActions}>
                    <span style={s.sentBadge(auto.isActive ? '#25d366' : '#6b7280')}>
                      {auto.sent} sent
                    </span>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                      <Icon name="edit" size={16} color="var(--text3)" />
                    </button>
                    <div 
                      style={s.toggleSwitch(auto.isActive)}
                      onClick={() => toggleAutomation(auto.id)}
                    >
                      <div style={s.toggleThumb(auto.isActive)} />
                    </div>
                  </div>
                </div>

                {/* Message Preview */}
                <div style={s.messagePreview}>
                  <div style={s.messageLabel}>
                    <Icon name="messageCircle" size={12} color="var(--text3)" />
                    MESSAGE PREVIEW
                  </div>
                  <div style={s.messageText}>{auto.messageTemplate}</div>
                </div>

                {/* Stats */}
                <div style={s.automationStats}>
                  <div style={s.miniStat}>
                    <div style={s.miniStatValue('var(--text)')}>{auto.sent}</div>
                    <div style={s.miniStatLabel}>Sent</div>
                  </div>
                  <div style={s.miniStat}>
                    <div style={s.miniStatValue('#25d366')}>{deliveryRate}%</div>
                    <div style={s.miniStatLabel}>Delivered</div>
                  </div>
                  <div style={s.miniStat}>
                    <div style={s.miniStatValue('#3b82f6')}>{openRate}%</div>
                    <div style={s.miniStatLabel}>Opened</div>
                  </div>
                  <div style={s.miniStat}>
                    <div style={s.miniStatValue('#a855f7')}>{clickRate}%</div>
                    <div style={s.miniStatLabel}>Clicked</div>
                  </div>
                </div>

                {auto.lastTriggered && (
                  <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="clock" size={10} />
                    Last triggered: {auto.lastTriggered}
                  </div>
                )}
              </div>
            )
          })}

          {/* Add new automation card */}
          <div style={{ ...s.automationCard(true), border: '2px dashed var(--border)', textAlign: 'center' as const, cursor: 'pointer', padding: 32 }}>
            <Icon name="plus" size={32} color="var(--text3)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>Build New Automation</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Create event triggers, conditions, and message sequences</div>
          </div>
        </div>

        {/* Delivery Log */}
        <div style={s.logCard}>
          <div style={s.logTitle}>
            <Icon name="activity" size={16} color="var(--accent)" />
            Delivery Log (Last 24h)
          </div>
          <div style={s.logList}>
            {deliveryLogs.map(log => (
              <div key={log.id} style={s.logItem}>
                <div style={s.logStatus(log.status)} />
                <div style={s.logContent}>
                  <div style={s.logAutomation}>{log.automation}</div>
                  <div style={s.logCustomer}>{log.customer}</div>
                </div>
                <div style={s.logTime}>
                  <div style={{ marginBottom: 2 }}>
                    {log.status === 'delivered' && <Icon name="checkCircle" size={12} color="#25d366" />}
                    {log.status === 'failed' && <Icon name="xCircle" size={12} color="#ef4444" />}
                    {log.status === 'pending' && <Icon name="clock" size={12} color="#f59e0b" />}
                  </div>
                  {log.timestamp}
                </div>
              </div>
            ))}
          </div>

          {/* Rate limits */}
          <div style={{ marginTop: 16, padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="alertTriangle" size={12} />
              WHATSAPP RATE LIMITS
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
              <span>Hourly (50 max)</span>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>38/50</span>
            </div>
            <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2, marginBottom: 8 }}>
              <div style={{ width: '76%', height: '100%', background: '#f59e0b', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span>Daily (500 max)</span>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>287/500</span>
            </div>
            <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2 }}>
              <div style={{ width: '57%', height: '100%', background: '#25d366', borderRadius: 2 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
