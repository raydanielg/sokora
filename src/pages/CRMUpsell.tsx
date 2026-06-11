import { useState, useEffect } from 'react'
// supabase import ready for real data
// import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void // used for navigation actions
}

// Lucide Icon component
const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  
  const paths: Record<string, React.ReactNode> = {
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    trendingDown: <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    sparkles: <><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></>,
    dollarSign: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    shoppingCart: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash2: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
    play: <><polygon points="5 3 19 12 5 21 5 3"/></>,
    pause: <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    arrowDown: <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    moreVertical: <><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></>,
    messageCircle: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    barChart: <><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    baby: <><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/></>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface UpsellRule {
  id: string
  name: string
  description: string
  trigger: string
  triggerType: 'purchase' | 'profile' | 'message' | 'behavior'
  suggestedProduct: string
  suggestedProductPrice: number
  triggered: number
  suggested: number
  converted: number
  revenue: number
  isActive: boolean
  priority: number
  createdAt: string
}

interface UpsellActivity {
  id: string
  customer: string
  tier: 'mama' | 'gold' | 'crown'
  rule: string
  product: string
  outcome: 'suggested' | 'converted' | 'declined'
  value?: number
  timestamp: string
}

export default function CRMUpsell({ onNav }: Props) {
  void onNav // available for future navigation
  const [rules, setRules] = useState<UpsellRule[]>([])
  const [activities, setActivities] = useState<UpsellActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRule, setSelectedRule] = useState<UpsellRule | null>(null)
  const [filterType, setFilterType] = useState<string>('all')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    // Demo data
    setRules([
      {
        id: '1',
        name: 'C-Section → Belly Binder',
        description: 'Suggest belly binder to customers who mention C-section delivery',
        trigger: 'Delivery type = C-Section',
        triggerType: 'profile',
        suggestedProduct: 'PeaceTouch Belly Binder',
        suggestedProductPrice: 85000,
        triggered: 184,
        suggested: 156,
        converted: 70,
        revenue: 5950000,
        isActive: true,
        priority: 1,
        createdAt: 'Jan 2025'
      },
      {
        id: '2',
        name: 'Week 36+ → Delivery Kit',
        description: 'Suggest delivery kit to customers at week 36 or later',
        trigger: 'Pregnancy week >= 36',
        triggerType: 'profile',
        suggestedProduct: 'Complete Delivery Kit',
        suggestedProductPrice: 250000,
        triggered: 156,
        suggested: 134,
        converted: 48,
        revenue: 12000000,
        isActive: true,
        priority: 2,
        createdAt: 'Feb 2025'
      },
      {
        id: '3',
        name: 'Breastfeeding Question → Pump',
        description: 'Suggest breast pump when customer asks about breastfeeding',
        trigger: 'Message contains: breastfeeding, kunyonyesha, pump, maziwa',
        triggerType: 'message',
        suggestedProduct: 'Electric Breast Pump',
        suggestedProductPrice: 185000,
        triggered: 98,
        suggested: 87,
        converted: 21,
        revenue: 3885000,
        isActive: true,
        priority: 3,
        createdAt: 'Feb 2025'
      },
      {
        id: '4',
        name: 'Postpartum Pain → Scar Sheet',
        description: 'Suggest scar sheets for C-section recovery',
        trigger: 'Customer postpartum + C-section',
        triggerType: 'profile',
        suggestedProduct: 'Scar Sheet za SOKORA (Pack)',
        suggestedProductPrice: 45000,
        triggered: 67,
        suggested: 54,
        converted: 18,
        revenue: 810000,
        isActive: true,
        priority: 4,
        createdAt: 'Mar 2025'
      },
      {
        id: '5',
        name: 'First Purchase → Pillow Bundle',
        description: 'Offer pillow bundle discount to new customers',
        trigger: 'First order + order value > 100,000',
        triggerType: 'purchase',
        suggestedProduct: 'U-Shape Pillow + Cover',
        suggestedProductPrice: 165000,
        triggered: 234,
        suggested: 189,
        converted: 42,
        revenue: 6930000,
        isActive: true,
        priority: 5,
        createdAt: 'Jan 2025'
      },
      {
        id: '6',
        name: 'Cart Abandonment → Discount',
        description: 'Offer 10% discount on abandoned cart items',
        trigger: 'Cart abandoned > 2 hours',
        triggerType: 'behavior',
        suggestedProduct: 'Cart Items (10% off)',
        suggestedProductPrice: 0,
        triggered: 312,
        suggested: 287,
        converted: 89,
        revenue: 8920000,
        isActive: false,
        priority: 6,
        createdAt: 'Dec 2024'
      },
    ])

    setActivities([
      { id: '1', customer: 'Amina Hassan', tier: 'crown', rule: 'Week 36+ → Delivery Kit', product: 'Complete Delivery Kit', outcome: 'converted', value: 250000, timestamp: '2 hours ago' },
      { id: '2', customer: 'Grace Mwanza', tier: 'crown', rule: 'C-Section → Belly Binder', product: 'PeaceTouch Belly Binder', outcome: 'suggested', timestamp: '3 hours ago' },
      { id: '3', customer: 'Zainab Ally', tier: 'gold', rule: 'Breastfeeding Question → Pump', product: 'Electric Breast Pump', outcome: 'converted', value: 185000, timestamp: '5 hours ago' },
      { id: '4', customer: 'Fatuma Iddi', tier: 'mama', rule: 'First Purchase → Pillow Bundle', product: 'U-Shape Pillow + Cover', outcome: 'declined', timestamp: 'Yesterday' },
      { id: '5', customer: 'Neema Omari', tier: 'mama', rule: 'C-Section → Belly Binder', product: 'PeaceTouch Belly Binder', outcome: 'converted', value: 85000, timestamp: 'Yesterday' },
      { id: '6', customer: 'Halima Juma', tier: 'mama', rule: 'Week 36+ → Delivery Kit', product: 'Complete Delivery Kit', outcome: 'suggested', timestamp: '2 days ago' },
    ])

    setLoading(false)
  }

  const toggleRule = (id: string) => {
    setRules(rules.map(r => 
      r.id === id ? { ...r, isActive: !r.isActive } : r
    ))
  }

  const getTriggerIcon = (type: string) => {
    switch (type) {
      case 'purchase': return 'shoppingCart'
      case 'profile': return 'user'
      case 'message': return 'messageCircle'
      case 'behavior': return 'activity'
      default: return 'zap'
    }
  }

  const getTriggerColor = (type: string) => {
    switch (type) {
      case 'purchase': return '#10b981'
      case 'profile': return '#3b82f6'
      case 'message': return '#a855f7'
      case 'behavior': return '#f59e0b'
      default: return '#6b7280'
    }
  }

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'converted': return '#10b981'
      case 'suggested': return '#3b82f6'
      case 'declined': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const filteredRules = filterType === 'all' ? rules : rules.filter(r => r.triggerType === filterType)

  const totalRevenue = rules.reduce((sum, r) => sum + r.revenue, 0)
  const totalTriggered = rules.reduce((sum, r) => sum + r.triggered, 0)
  const totalConverted = rules.reduce((sum, r) => sum + r.converted, 0)
  const avgConversionRate = totalTriggered > 0 ? ((totalConverted / totalTriggered) * 100).toFixed(1) : '0'

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

    // Funnel
    funnelSection: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 } as React.CSSProperties,
    funnelTitle: { fontWeight: 700, fontSize: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    funnelSteps: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } as React.CSSProperties,
    funnelStep: { flex: 1, textAlign: 'center' as const, position: 'relative' as const } as React.CSSProperties,
    funnelValue: (color: string) => ({ fontSize: 32, fontWeight: 800, color, fontFamily: 'var(--mono)', marginBottom: 4 }) as React.CSSProperties,
    funnelLabel: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    funnelArrow: { color: 'var(--text3)', padding: '0 10px' } as React.CSSProperties,
    funnelRate: { fontSize: 10, color: 'var(--accent)', marginTop: 6, fontWeight: 600 } as React.CSSProperties,

    // Filters
    filters: { display: 'flex', gap: 8, marginBottom: 16 } as React.CSSProperties,
    filterPill: (isActive: boolean, color?: string) => ({ padding: '8px 14px', borderRadius: 8, fontSize: 11, fontWeight: isActive ? 700 : 400, background: isActive ? (color || 'var(--accent)') : 'var(--surface2)', color: isActive ? '#000' : 'var(--text3)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }) as React.CSSProperties,

    // Main layout
    mainGrid: { display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 } as React.CSSProperties,

    // Rules list
    rulesList: { display: 'flex', flexDirection: 'column' as const, gap: 10 } as React.CSSProperties,
    ruleCard: (isActive: boolean, isSelected: boolean) => ({ 
      background: 'var(--card)', 
      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)', 
      borderRadius: 12, 
      padding: 16,
      opacity: isActive ? 1 : 0.6,
      cursor: 'pointer',
      transition: 'all .15s'
    }) as React.CSSProperties,
    ruleHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 } as React.CSSProperties,
    ruleInfo: { display: 'flex', gap: 12 } as React.CSSProperties,
    ruleIcon: (color: string) => ({ width: 40, height: 40, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as React.CSSProperties,
    ruleMeta: {} as React.CSSProperties,
    ruleName: { fontWeight: 700, fontSize: 14, marginBottom: 4 } as React.CSSProperties,
    ruleTrigger: { fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
    ruleActions: { display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
    priorityBadge: { fontSize: 10, background: 'var(--surface3)', color: 'var(--text2)', padding: '3px 8px', borderRadius: 4, fontWeight: 600 } as React.CSSProperties,
    toggleSwitch: (isOn: boolean) => ({ width: 44, height: 24, borderRadius: 12, background: isOn ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', position: 'relative' as const, transition: 'all .2s' }) as React.CSSProperties,
    toggleThumb: (isOn: boolean) => ({ position: 'absolute' as const, top: 3, width: 18, height: 18, borderRadius: '50%', background: isOn ? '#000' : 'var(--text3)', transition: 'all .2s', ...(isOn ? { right: 3 } : { left: 3 }) }) as React.CSSProperties,
    ruleProduct: { display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'var(--surface2)', borderRadius: 8, marginBottom: 12 } as React.CSSProperties,
    productIcon: { width: 36, height: 36, borderRadius: 8, background: 'rgba(133, 194, 190, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    productName: { flex: 1, fontWeight: 600, fontSize: 12 } as React.CSSProperties,
    productPrice: { fontWeight: 700, fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--mono)' } as React.CSSProperties,
    ruleStats: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 } as React.CSSProperties,
    miniStat: { textAlign: 'center' as const } as React.CSSProperties,
    miniStatValue: (color: string) => ({ fontSize: 16, fontWeight: 800, color, fontFamily: 'var(--mono)' }) as React.CSSProperties,
    miniStatLabel: { fontSize: 9, color: 'var(--text3)' } as React.CSSProperties,

    // Activity feed
    activityCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    activityHeader: { padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    activityList: { maxHeight: 480, overflowY: 'auto' as const } as React.CSSProperties,
    activityItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    activityIcon: (color: string) => ({ width: 32, height: 32, borderRadius: '50%', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as React.CSSProperties,
    activityContent: { flex: 1, minWidth: 0 } as React.CSSProperties,
    activityText: { fontSize: 11, marginBottom: 2 } as React.CSSProperties,
    activityMeta: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    activityOutcome: (color: string) => ({ fontSize: 10, background: `${color}20`, color, padding: '3px 8px', borderRadius: 10, fontWeight: 600 }) as React.CSSProperties,
    activityValue: { fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)', marginTop: 4 } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
        <Icon name="trendingUp" size={40} />
        <div style={{ marginLeft: 16, fontSize: 14 }}>Loading Upsell Engine...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.title}>
            <Icon name="trendingUp" size={28} color="#3b82f6" />
            Smart Upsell Engine
          </h1>
          <p style={s.subtitle}>AI-powered product suggestions · Rule-based triggers · Conversion tracking</p>
        </div>
        <div style={s.headerRight}>
          <button style={s.btnGhost}>
            <Icon name="barChart" size={16} /> Analytics
          </button>
          <button style={s.btnPrimary}>
            <Icon name="plus" size={16} /> New Rule
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statValue('#3b82f6')}>{rules.filter(r => r.isActive).length}</div>
          <div style={s.statLabel}>Active Rules</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('var(--text)')}>{totalTriggered.toLocaleString()}</div>
          <div style={s.statLabel}>Total Triggered</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#10b981')}>{avgConversionRate}%</div>
          <div style={s.statLabel}>Conversion Rate</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('var(--accent)')}>{tzs(totalRevenue)}</div>
          <div style={s.statLabel}>Total Revenue</div>
        </div>
      </div>

      {/* Funnel */}
      <div style={s.funnelSection}>
        <div style={s.funnelTitle}>
          <Icon name="target" size={18} color="var(--accent)" />
          Conversion Funnel (30 days)
        </div>
        <div style={s.funnelSteps}>
          <div style={s.funnelStep}>
            <div style={s.funnelValue('#3b82f6')}>{totalTriggered.toLocaleString()}</div>
            <div style={s.funnelLabel}>Triggered</div>
          </div>
          <div style={s.funnelArrow}>
            <Icon name="arrowRight" size={24} />
          </div>
          <div style={s.funnelStep}>
            <div style={s.funnelValue('#a855f7')}>{rules.reduce((sum, r) => sum + r.suggested, 0).toLocaleString()}</div>
            <div style={s.funnelLabel}>Suggested</div>
            <div style={s.funnelRate}>85% of triggered</div>
          </div>
          <div style={s.funnelArrow}>
            <Icon name="arrowRight" size={24} />
          </div>
          <div style={s.funnelStep}>
            <div style={s.funnelValue('#10b981')}>{totalConverted.toLocaleString()}</div>
            <div style={s.funnelLabel}>Converted</div>
            <div style={s.funnelRate}>{avgConversionRate}% of triggered</div>
          </div>
          <div style={s.funnelArrow}>
            <Icon name="arrowRight" size={24} />
          </div>
          <div style={s.funnelStep}>
            <div style={s.funnelValue('var(--accent)')}>{tzs(totalRevenue)}</div>
            <div style={s.funnelLabel}>Revenue</div>
            <div style={s.funnelRate}>{tzs(Math.round(totalRevenue / totalConverted))} avg</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        {[
          { key: 'all', label: 'All Rules', icon: 'zap' },
          { key: 'purchase', label: 'Purchase', icon: 'shoppingCart', color: '#10b981' },
          { key: 'profile', label: 'Profile', icon: 'user', color: '#3b82f6' },
          { key: 'message', label: 'Message', icon: 'messageCircle', color: '#a855f7' },
          { key: 'behavior', label: 'Behavior', icon: 'activity', color: '#f59e0b' },
        ].map(filter => (
          <button 
            key={filter.key}
            style={s.filterPill(filterType === filter.key, filter.color)}
            onClick={() => setFilterType(filter.key)}
          >
            <Icon name={filter.icon} size={12} />
            {filter.label}
          </button>
        ))}
      </div>

      {/* Main Grid */}
      <div style={s.mainGrid}>
        {/* Rules List */}
        <div style={s.rulesList}>
          {filteredRules.map(rule => {
            const convRate = rule.triggered > 0 ? ((rule.converted / rule.triggered) * 100).toFixed(1) : '0'
            const isSelected = selectedRule?.id === rule.id
            
            return (
              <div 
                key={rule.id}
                style={s.ruleCard(rule.isActive, isSelected)}
                onClick={() => setSelectedRule(rule)}
              >
                <div style={s.ruleHeader}>
                  <div style={s.ruleInfo}>
                    <div style={s.ruleIcon(getTriggerColor(rule.triggerType))}>
                      <Icon name={getTriggerIcon(rule.triggerType)} size={20} color={getTriggerColor(rule.triggerType)} />
                    </div>
                    <div style={s.ruleMeta}>
                      <div style={s.ruleName}>{rule.name}</div>
                      <div style={s.ruleTrigger}>
                        <Icon name="zap" size={10} />
                        {rule.trigger}
                      </div>
                    </div>
                  </div>
                  <div style={s.ruleActions}>
                    <span style={s.priorityBadge}>#{rule.priority}</span>
                    <div 
                      style={s.toggleSwitch(rule.isActive)}
                      onClick={(e) => { e.stopPropagation(); toggleRule(rule.id) }}
                    >
                      <div style={s.toggleThumb(rule.isActive)} />
                    </div>
                  </div>
                </div>

                <div style={s.ruleProduct}>
                  <div style={s.productIcon}>
                    <Icon name="package" size={18} color="var(--accent)" />
                  </div>
                  <div style={s.productName}>{rule.suggestedProduct}</div>
                  {rule.suggestedProductPrice > 0 && (
                    <div style={s.productPrice}>{tzs(rule.suggestedProductPrice)}</div>
                  )}
                </div>

                <div style={s.ruleStats}>
                  <div style={s.miniStat}>
                    <div style={s.miniStatValue('var(--text)')}>{rule.triggered}</div>
                    <div style={s.miniStatLabel}>Triggered</div>
                  </div>
                  <div style={s.miniStat}>
                    <div style={s.miniStatValue('#a855f7')}>{rule.suggested}</div>
                    <div style={s.miniStatLabel}>Suggested</div>
                  </div>
                  <div style={s.miniStat}>
                    <div style={s.miniStatValue('#10b981')}>{convRate}%</div>
                    <div style={s.miniStatLabel}>Converted</div>
                  </div>
                  <div style={s.miniStat}>
                    <div style={s.miniStatValue('var(--accent)')}>{tzs(rule.revenue)}</div>
                    <div style={s.miniStatLabel}>Revenue</div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add new rule card */}
          <div style={{ ...s.ruleCard(true, false), border: '2px dashed var(--border)', textAlign: 'center' as const, padding: 32, cursor: 'pointer' }}>
            <Icon name="plus" size={32} color="var(--text3)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>Create New Rule</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Define triggers, conditions, and product suggestions</div>
          </div>
        </div>

        {/* Activity Feed */}
        <div style={s.activityCard}>
          <div style={s.activityHeader}>
            <Icon name="activity" size={16} color="var(--accent)" />
            Recent Activity
          </div>
          <div style={s.activityList}>
            {activities.map(activity => (
              <div key={activity.id} style={s.activityItem}>
                <div style={s.activityIcon(getOutcomeColor(activity.outcome))}>
                  <Icon 
                    name={activity.outcome === 'converted' ? 'checkCircle' : activity.outcome === 'suggested' ? 'eye' : 'xCircle'} 
                    size={16} 
                    color={getOutcomeColor(activity.outcome)} 
                  />
                </div>
                <div style={s.activityContent}>
                  <div style={s.activityText}>
                    <strong>{activity.customer}</strong>
                  </div>
                  <div style={s.activityMeta}>{activity.product} · {activity.timestamp}</div>
                  {activity.value && (
                    <div style={s.activityValue}>{tzs(activity.value)}</div>
                  )}
                </div>
                <span style={s.activityOutcome(getOutcomeColor(activity.outcome))}>
                  {activity.outcome}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
