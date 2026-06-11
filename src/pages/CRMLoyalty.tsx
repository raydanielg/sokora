import { useState, useEffect } from 'react'
// supabase import ready for real data
// import { supabase } from '../lib/supabase'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void // used for navigation actions
}

// Lucide Icon component
const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  
  const paths: Record<string, React.ReactNode> = {
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    medal: <><path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    gift: <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    starFilled: <><polygon fill="currentColor" stroke="none" points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    trendingDown: <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></>,
    truck: <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    percent: <><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></>,
    shoppingCart: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    minus: <><line x1="5" y1="12" x2="19" y2="12"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    arrowUpRight: <><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    refresh: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface TierData {
  name: string
  color: string
  icon: string
  minPoints: number
  discount: number
  freeDelivery: boolean
  members: number
  pointsIssued: number
  pointsRedeemed: number
}

interface LoyaltyMember {
  id: string
  name: string
  phone: string
  tier: 'mama' | 'gold' | 'crown'
  points: number
  lifetimePoints: number
  joinedAt: string
  lastActivity: string
}

interface Reward {
  id: string
  name: string
  points: number
  category: 'discount' | 'product' | 'delivery' | 'experience'
  redeemed: number
  available: boolean
}

interface PointsActivity {
  id: string
  customer: string
  action: string
  points: number
  timestamp: string
}

export default function CRMLoyalty({ onNav }: Props) {
  void onNav // available for future navigation
  const [tiers, setTiers] = useState<TierData[]>([])
  const [members, setMembers] = useState<LoyaltyMember[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [activities, setActivities] = useState<PointsActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTier, setSelectedTier] = useState<string>('all')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    setTiers([
      { name: 'Mama', color: '#10b981', icon: 'heart', minPoints: 0, discount: 0, freeDelivery: false, members: 842, pointsIssued: 1200000, pointsRedeemed: 280000 },
      { name: 'Gold', color: '#fbbf24', icon: 'award', minPoints: 5000, discount: 5, freeDelivery: false, members: 158, pointsIssued: 1800000, pointsRedeemed: 520000 },
      { name: 'Crown', color: '#f472b6', icon: 'crown', minPoints: 15000, discount: 10, freeDelivery: true, members: 247, pointsIssued: 3200000, pointsRedeemed: 980000 },
    ])

    setMembers([
      { id: '1', name: 'Amina Hassan', phone: '+255 712 345 678', tier: 'crown', points: 24800, lifetimePoints: 48500, joinedAt: 'Oct 2024', lastActivity: '2 hours ago' },
      { id: '2', name: 'Grace Mwanza', phone: '+255 754 987 654', tier: 'crown', points: 18200, lifetimePoints: 32100, joinedAt: 'Nov 2024', lastActivity: 'Yesterday' },
      { id: '3', name: 'Zainab Ally', phone: '+255 698 111 222', tier: 'gold', points: 8400, lifetimePoints: 14200, joinedAt: 'Dec 2024', lastActivity: '3 days ago' },
      { id: '4', name: 'Fatuma Iddi', phone: '+255 621 445 889', tier: 'gold', points: 6100, lifetimePoints: 9800, joinedAt: 'Jan 2025', lastActivity: '1 week ago' },
      { id: '5', name: 'Neema Omari', phone: '+255 765 432 100', tier: 'mama', points: 2300, lifetimePoints: 2300, joinedAt: 'Feb 2025', lastActivity: '2 days ago' },
      { id: '6', name: 'Halima Juma', phone: '+255 788 222 333', tier: 'mama', points: 800, lifetimePoints: 800, joinedAt: 'Mar 2025', lastActivity: 'Today' },
    ])

    setRewards([
      { id: '1', name: 'Free Delivery', points: 1000, category: 'delivery', redeemed: 234, available: true },
      { id: '2', name: '5% Discount', points: 500, category: 'discount', redeemed: 567, available: true },
      { id: '3', name: '10% Discount', points: 1500, category: 'discount', redeemed: 189, available: true },
      { id: '4', name: 'Nipple Cream (Free)', points: 2000, category: 'product', redeemed: 78, available: true },
      { id: '5', name: 'Free Consultation', points: 3000, category: 'experience', redeemed: 45, available: true },
      { id: '6', name: 'Nursing Pads (12pk)', points: 1500, category: 'product', redeemed: 112, available: true },
    ])

    setActivities([
      { id: '1', customer: 'Amina Hassan', action: 'Purchase (Belly Binder)', points: 850, timestamp: 'Today 14:23' },
      { id: '2', customer: 'Amina Hassan', action: 'Referral converted', points: 500, timestamp: 'Today 11:45' },
      { id: '3', customer: 'Grace Mwanza', action: 'Testimonial approved', points: 200, timestamp: 'Yesterday' },
      { id: '4', customer: 'Amina Hassan', action: 'Redeemed Free Delivery', points: -1000, timestamp: 'Yesterday' },
      { id: '5', customer: 'Zainab Ally', action: 'Purchase (Breast Pump)', points: 1850, timestamp: '2 days ago' },
      { id: '6', customer: 'Halima Juma', action: 'First Purchase Bonus', points: 500, timestamp: '3 days ago' },
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

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'crown': return 'crown'
      case 'gold': return 'award'
      default: return 'heart'
    }
  }

  const getRewardIcon = (category: string) => {
    switch (category) {
      case 'delivery': return 'truck'
      case 'discount': return 'percent'
      case 'product': return 'gift'
      case 'experience': return 'star'
      default: return 'gift'
    }
  }

  const totalMembers = tiers.reduce((sum, t) => sum + t.members, 0)
  const totalPointsIssued = tiers.reduce((sum, t) => sum + t.pointsIssued, 0)
  const totalPointsRedeemed = tiers.reduce((sum, t) => sum + t.pointsRedeemed, 0)

  const filteredMembers = selectedTier === 'all' 
    ? members 
    : members.filter(m => m.tier === selectedTier)

  const s = {
    page: { padding: 24, maxWidth: 1600, margin: '0 auto' } as React.CSSProperties,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 } as React.CSSProperties,
    headerLeft: {} as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 } as React.CSSProperties,
    subtitle: { fontSize: 13, color: 'var(--text3)' } as React.CSSProperties,
    headerRight: { display: 'flex', gap: 10 } as React.CSSProperties,
    btnPrimary: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
    btnGhost: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, cursor: 'pointer' } as React.CSSProperties,

    // Tier cards
    tierGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 } as React.CSSProperties,
    tierCard: (color: string, isSelected: boolean) => ({ 
      background: 'var(--card)', 
      border: isSelected ? `2px solid ${color}` : '1px solid var(--border)', 
      borderRadius: 14, 
      padding: 20, 
      cursor: 'pointer',
      transition: 'all .15s'
    }) as React.CSSProperties,
    tierHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 } as React.CSSProperties,
    tierIcon: (color: string) => ({ width: 48, height: 48, borderRadius: 12, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }) as React.CSSProperties,
    tierBadge: (color: string) => ({ fontSize: 10, background: `${color}20`, color, padding: '4px 12px', borderRadius: 10, fontWeight: 700 }) as React.CSSProperties,
    tierName: { fontWeight: 800, fontSize: 18, marginBottom: 4 } as React.CSSProperties,
    tierRequirement: { fontSize: 11, color: 'var(--text3)', marginBottom: 12 } as React.CSSProperties,
    tierBenefits: { display: 'flex', flexDirection: 'column' as const, gap: 6, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    benefitItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text2)' } as React.CSSProperties,
    tierStats: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 } as React.CSSProperties,
    tierStat: { textAlign: 'center' as const } as React.CSSProperties,
    tierStatValue: (color: string) => ({ fontSize: 16, fontWeight: 800, color, fontFamily: 'var(--mono)' }) as React.CSSProperties,
    tierStatLabel: { fontSize: 9, color: 'var(--text3)' } as React.CSSProperties,

    // Main layout
    mainGrid: { display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 } as React.CSSProperties,

    // Members list
    membersCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    membersHeader: { padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
    membersTitle: { fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    filterPills: { display: 'flex', gap: 4 } as React.CSSProperties,
    filterPill: (isActive: boolean, color?: string) => ({ padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: isActive ? 700 : 400, background: isActive ? (color || 'var(--accent)') : 'var(--surface2)', color: isActive ? '#000' : 'var(--text3)', border: 'none', cursor: 'pointer' }) as React.CSSProperties,
    membersList: { maxHeight: 350, overflowY: 'auto' as const } as React.CSSProperties,
    memberItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    memberAvatar: (color: string) => ({ width: 40, height: 40, borderRadius: '50%', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as React.CSSProperties,
    memberInfo: { flex: 1, minWidth: 0 } as React.CSSProperties,
    memberName: { fontWeight: 700, fontSize: 13, marginBottom: 2 } as React.CSSProperties,
    memberPhone: { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' } as React.CSSProperties,
    memberPoints: { textAlign: 'right' as const } as React.CSSProperties,
    memberPointsValue: { fontSize: 16, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' } as React.CSSProperties,
    memberPointsLabel: { fontSize: 9, color: 'var(--text3)' } as React.CSSProperties,
    memberBadge: (color: string) => ({ fontSize: 9, background: `${color}20`, color, padding: '2px 8px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }) as React.CSSProperties,

    // Right panel
    rightPanel: { display: 'flex', flexDirection: 'column' as const, gap: 12 } as React.CSSProperties,

    // Rewards catalog
    rewardsCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    rewardsHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    rewardsList: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: 12 } as React.CSSProperties,
    rewardItem: { padding: 12, background: 'var(--surface2)', borderRadius: 8, textAlign: 'center' as const, cursor: 'pointer', transition: 'all .15s' } as React.CSSProperties,
    rewardIcon: (color: string) => ({ width: 36, height: 36, borderRadius: 8, background: `${color}20`, margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }) as React.CSSProperties,
    rewardName: { fontSize: 11, fontWeight: 600, marginBottom: 4 } as React.CSSProperties,
    rewardPoints: { fontSize: 13, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' } as React.CSSProperties,
    rewardRedeemed: { fontSize: 9, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,

    // Activity feed
    activityCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    activityHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    activityList: { maxHeight: 220, overflowY: 'auto' as const } as React.CSSProperties,
    activityItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    activityContent: { flex: 1, minWidth: 0 } as React.CSSProperties,
    activityText: { fontSize: 11, marginBottom: 2 } as React.CSSProperties,
    activityTime: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    activityPoints: (positive: boolean) => ({ fontSize: 13, fontWeight: 700, color: positive ? '#25d366' : '#ef4444', fontFamily: 'var(--mono)' }) as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
        <Icon name="crown" size={40} />
        <div style={{ marginLeft: 16, fontSize: 14 }}>Loading Loyalty...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.title}>
            <Icon name="crown" size={28} color="#f59e0b" />
            Crown Rewards
          </h1>
          <p style={s.subtitle}>{totalMembers.toLocaleString()} members · {(totalPointsIssued / 1000000).toFixed(1)}M pts issued · 3 tiers</p>
        </div>
        <div style={s.headerRight}>
          <button style={s.btnGhost}>
            <Icon name="settings" size={16} /> Settings
          </button>
          <button style={s.btnPrimary}>
            <Icon name="plus" size={16} /> Add Reward
          </button>
        </div>
      </div>

      {/* Tier Cards */}
      <div style={s.tierGrid}>
        {tiers.map(tier => {
          const isSelected = selectedTier === tier.name.toLowerCase()
          return (
            <div 
              key={tier.name}
              style={s.tierCard(tier.color, isSelected)}
              onClick={() => setSelectedTier(isSelected ? 'all' : tier.name.toLowerCase())}
            >
              <div style={s.tierHeader}>
                <div style={s.tierIcon(tier.color)}>
                  <Icon name={tier.icon} size={24} color={tier.color} />
                </div>
                <span style={s.tierBadge(tier.color)}>{tier.members} members</span>
              </div>

              <div style={s.tierName}>{tier.name}</div>
              <div style={s.tierRequirement}>
                {tier.minPoints === 0 ? 'Starting tier' : `${tier.minPoints.toLocaleString()}+ points`}
              </div>

              <div style={s.tierBenefits}>
                {tier.discount > 0 && (
                  <div style={s.benefitItem}>
                    <Icon name="checkCircle" size={14} color="#25d366" />
                    {tier.discount}% discount on all orders
                  </div>
                )}
                {tier.freeDelivery && (
                  <div style={s.benefitItem}>
                    <Icon name="checkCircle" size={14} color="#25d366" />
                    Free delivery on all orders
                  </div>
                )}
                <div style={s.benefitItem}>
                  <Icon name="checkCircle" size={14} color="#25d366" />
                  Priority WhatsApp support
                </div>
                {tier.name === 'Crown' && (
                  <div style={s.benefitItem}>
                    <Icon name="checkCircle" size={14} color="#25d366" />
                    Exclusive VIP group access
                  </div>
                )}
              </div>

              <div style={s.tierStats}>
                <div style={s.tierStat}>
                  <div style={s.tierStatValue(tier.color)}>{tier.members}</div>
                  <div style={s.tierStatLabel}>Members</div>
                </div>
                <div style={s.tierStat}>
                  <div style={s.tierStatValue('#25d366')}>{(tier.pointsIssued / 1000).toFixed(0)}k</div>
                  <div style={s.tierStatLabel}>Issued</div>
                </div>
                <div style={s.tierStat}>
                  <div style={s.tierStatValue('#3b82f6')}>{(tier.pointsRedeemed / 1000).toFixed(0)}k</div>
                  <div style={s.tierStatLabel}>Redeemed</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Main Grid */}
      <div style={s.mainGrid}>
        {/* Members List */}
        <div style={s.membersCard}>
          <div style={s.membersHeader}>
            <div style={s.membersTitle}>
              <Icon name="users" size={18} color="var(--accent)" />
              Members
            </div>
            <div style={s.filterPills}>
              <button 
                style={s.filterPill(selectedTier === 'all')}
                onClick={() => setSelectedTier('all')}
              >
                All
              </button>
              {tiers.map(tier => (
                <button 
                  key={tier.name}
                  style={s.filterPill(selectedTier === tier.name.toLowerCase(), tier.color)}
                  onClick={() => setSelectedTier(tier.name.toLowerCase())}
                >
                  <Icon name={tier.icon} size={10} style={{ marginRight: 4 }} />
                  {tier.name}
                </button>
              ))}
            </div>
          </div>

          <div style={s.membersList}>
            {filteredMembers.map(member => (
              <div key={member.id} style={s.memberItem}>
                <div style={s.memberAvatar(getTierColor(member.tier))}>
                  <Icon name="user" size={20} color={getTierColor(member.tier)} />
                </div>
                <div style={s.memberInfo}>
                  <div style={s.memberName}>{member.name}</div>
                  <div style={s.memberPhone}>{member.phone}</div>
                  <span style={s.memberBadge(getTierColor(member.tier))}>
                    <Icon name={getTierIcon(member.tier)} size={8} />
                    {member.tier.charAt(0).toUpperCase() + member.tier.slice(1)}
                  </span>
                </div>
                <div style={s.memberPoints}>
                  <div style={s.memberPointsValue}>{member.points.toLocaleString()}</div>
                  <div style={s.memberPointsLabel}>points</div>
                  <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>
                    <Icon name="clock" size={9} style={{ marginRight: 4 }} />
                    {member.lastActivity}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div style={s.rightPanel}>
          {/* Rewards Catalog */}
          <div style={s.rewardsCard}>
            <div style={s.rewardsHeader}>
              <Icon name="gift" size={16} color="#f59e0b" />
              Rewards Catalog
            </div>
            <div style={s.rewardsList}>
              {rewards.map(reward => (
                <div 
                  key={reward.id} 
                  style={s.rewardItem}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--surface2)'}
                >
                  <div style={s.rewardIcon('var(--accent)')}>
                    <Icon name={getRewardIcon(reward.category)} size={18} color="var(--accent)" />
                  </div>
                  <div style={s.rewardName}>{reward.name}</div>
                  <div style={s.rewardPoints}>{reward.points.toLocaleString()} pts</div>
                  <div style={s.rewardRedeemed}>{reward.redeemed} redeemed</div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Feed */}
          <div style={s.activityCard}>
            <div style={s.activityHeader}>
              <Icon name="trendingUp" size={16} color="var(--accent)" />
              Points Activity
            </div>
            <div style={s.activityList}>
              {activities.map(activity => (
                <div key={activity.id} style={s.activityItem}>
                  <div style={s.activityContent}>
                    <div style={s.activityText}>
                      <strong>{activity.customer}</strong>
                    </div>
                    <div style={s.activityTime}>{activity.action} · {activity.timestamp}</div>
                  </div>
                  <div style={s.activityPoints(activity.points > 0)}>
                    {activity.points > 0 ? '+' : ''}{activity.points.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Points summary */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="trendingUp" size={16} color="var(--accent)" />
              Points Summary
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
              <span style={{ color: 'var(--text3)' }}>Total Issued</span>
              <span style={{ fontWeight: 700, color: '#25d366', fontFamily: 'var(--mono)' }}>{(totalPointsIssued / 1000000).toFixed(2)}M</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
              <span style={{ color: 'var(--text3)' }}>Total Redeemed</span>
              <span style={{ fontWeight: 700, color: '#ef4444', fontFamily: 'var(--mono)' }}>{(totalPointsRedeemed / 1000000).toFixed(2)}M</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--text3)' }}>Outstanding</span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{((totalPointsIssued - totalPointsRedeemed) / 1000000).toFixed(2)}M</span>
            </div>
            <div style={{ marginTop: 12, padding: 10, background: 'var(--surface2)', borderRadius: 8, fontSize: 10, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="refresh" size={12} />
              Points earn rate: TZS 1,000 = 10 pts
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
