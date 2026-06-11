import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void // used for navigation actions
}

// Lucide Icon component
const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  
  const paths: Record<string, React.ReactNode> = {
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    arrowUpRight: <><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>,
    package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash2: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    dollarSign: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    bellRing: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M22 8c0-2.3-.8-4.3-2-6"/></>,
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    play: <><polygon points="5 3 19 12 5 21 5 3"/></>,
    pause: <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
    moreVertical: <><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    truck: <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    shoppingBag: <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface Campaign {
  id: string
  name: string
  product: string
  image?: string
  target: number
  orders: number
  depositPercent: number
  minDeposit: number
  totalDeposits: number
  closeDate: string
  eta: string
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  customers: PreOrderCustomer[]
}

interface PreOrderCustomer {
  id: string
  name: string
  phone: string
  tier: 'mama' | 'gold' | 'crown'
  deposit: number
  paidAt: string
  reminderSent: boolean
}

export default function CRMPreorders({ onNav }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  void onNav // available for future navigation

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load pre-order campaigns from database
      const { data: preorderData, error } = await supabase
        .from('pre_order_campaigns')
        .select(`
          id, name, product_id, target, orders_received, 
          deposit_percent, min_deposit, total_deposits,
          close_date, eta_date, status, created_at,
          products (name),
          pre_order_customers (
            id, customer_id, phone, tier, deposit_amount, 
            paid_at, reminder_sent,
            customers (name)
          )
        `)
        .order('status', { ascending: false })
        .order('close_date', { ascending: true })

      if (error) throw error

      // Transform database records to Campaign format
      const campaigns: Campaign[] = (preorderData || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        product: row.products?.name || 'Product',
        target: row.target || 0,
        orders: row.orders_received || 0,
        depositPercent: row.deposit_percent || 30,
        minDeposit: row.min_deposit || 0,
        totalDeposits: row.total_deposits || 0,
        closeDate: row.close_date ? new Date(row.close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD',
        eta: row.eta_date ? new Date(row.eta_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD',
        status: row.status || 'active',
        customers: (row.pre_order_customers || []).map((cust: any) => ({
          id: cust.id,
          name: cust.customers?.name || cust.customer_id,
          phone: cust.phone || '',
          tier: cust.tier || 'mama',
          deposit: cust.deposit_amount || 0,
          paidAt: cust.paid_at ? new Date(cust.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Pending',
          reminderSent: cust.reminder_sent || false,
        }))
      }))

      setCampaigns(campaigns)
      if (campaigns.length > 0) {
        setSelectedCampaign(campaigns[0])
      }
    } catch (err) {
      console.error('Failed to load pre-order campaigns:', err)
      // If no data in database, show empty state (not demo data)
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'crown': return '#f472b6'
      case 'gold': return '#fbbf24'
      default: return '#10b981'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#10b981'
      case 'paused': return '#f59e0b'
      case 'completed': return '#3b82f6'
      case 'cancelled': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return 'activity'
      case 'paused': return 'pause'
      case 'completed': return 'checkCircle'
      case 'cancelled': return 'xCircle'
      default: return 'clock'
    }
  }

  const totalDeposits = campaigns.reduce((sum, c) => sum + c.totalDeposits, 0)
  const totalOrders = campaigns.reduce((sum, c) => sum + c.orders, 0)
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length

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
    mainGrid: { display: 'grid', gridTemplateColumns: '1fr 400px', gap: 16 } as React.CSSProperties,

    // Campaign cards
    campaignGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 } as React.CSSProperties,
    campaignCard: (isSelected: boolean, status: string) => ({ 
      background: 'var(--card)', 
      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)', 
      borderRadius: 12, 
      padding: 16, 
      cursor: 'pointer',
      opacity: status === 'cancelled' ? 0.5 : 1,
      transition: 'all .15s'
    }) as React.CSSProperties,
    campaignHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 } as React.CSSProperties,
    campaignName: { fontWeight: 700, fontSize: 14, marginBottom: 4 } as React.CSSProperties,
    campaignProduct: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    statusBadge: (color: string) => ({ fontSize: 9, background: `${color}20`, color, padding: '4px 10px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }) as React.CSSProperties,
    progressWrap: { marginBottom: 12 } as React.CSSProperties,
    progressLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 } as React.CSSProperties,
    progressBar: { height: 8, background: 'var(--surface3)', borderRadius: 4, overflow: 'hidden' } as React.CSSProperties,
    progressFill: (percent: number, color: string) => ({ height: '100%', width: `${Math.min(percent, 100)}%`, background: color, borderRadius: 4, transition: 'width .3s' }) as React.CSSProperties,
    campaignMeta: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 11 } as React.CSSProperties,
    metaItem: { display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text3)' } as React.CSSProperties,

    // Customer list
    customerPanel: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    panelHeader: { padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
    panelTitle: { fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    customerList: { maxHeight: 400, overflowY: 'auto' as const } as React.CSSProperties,
    customerItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    customerAvatar: (color: string) => ({ width: 36, height: 36, borderRadius: '50%', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as React.CSSProperties,
    customerInfo: { flex: 1, minWidth: 0 } as React.CSSProperties,
    customerName: { fontWeight: 600, fontSize: 12, marginBottom: 2 } as React.CSSProperties,
    customerPhone: { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' } as React.CSSProperties,
    customerDeposit: { textAlign: 'right' as const } as React.CSSProperties,
    depositAmount: { fontWeight: 700, fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--mono)' } as React.CSSProperties,
    depositDate: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    tierBadge: (color: string) => ({ fontSize: 9, background: `${color}20`, color, padding: '2px 8px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }) as React.CSSProperties,

    // Actions
    actionBar: { padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 } as React.CSSProperties,
    actionBtn: { flex: 1, padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties,
    actionBtnPrimary: { flex: 1, padding: '10px', background: '#25d366', border: 'none', borderRadius: 8, fontSize: 11, color: '#000', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
        <Icon name="package" size={40} />
        <div style={{ marginLeft: 16, fontSize: 14 }}>Loading Pre-Orders...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.title}>
            <Icon name="package" size={28} color="#3b82f6" />
            Pre-Order Campaigns
          </h1>
          <p style={s.subtitle}>Manage deposits, waitlists, and restock campaigns</p>
        </div>
        <div style={s.headerRight}>
          <button style={s.btnGhost}>
            <Icon name="download" size={16} /> Export
          </button>
          <button style={s.btnPrimary}>
            <Icon name="plus" size={16} /> New Campaign
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statValue('#3b82f6')}>{activeCampaigns}</div>
          <div style={s.statLabel}>Active Campaigns</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('var(--accent)')}>{totalOrders}</div>
          <div style={s.statLabel}>Total Pre-Orders</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#25d366')}>{tzs(totalDeposits)}</div>
          <div style={s.statLabel}>Deposits Collected</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue('#f59e0b')}>30%</div>
          <div style={s.statLabel}>Default Deposit Rate</div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={s.mainGrid}>
        {/* Campaign Grid */}
        <div style={s.campaignGrid}>
          {campaigns.map(campaign => {
            const progress = (campaign.orders / campaign.target) * 100
            const isSelected = selectedCampaign?.id === campaign.id
            
            return (
              <div 
                key={campaign.id}
                style={s.campaignCard(isSelected, campaign.status)}
                onClick={() => setSelectedCampaign(campaign)}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--text3)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <div style={s.campaignHeader}>
                  <div>
                    <div style={s.campaignName}>{campaign.name}</div>
                    <div style={s.campaignProduct}>{campaign.product}</div>
                  </div>
                  <span style={s.statusBadge(getStatusColor(campaign.status))}>
                    <Icon name={getStatusIcon(campaign.status)} size={10} />
                    {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                  </span>
                </div>

                <div style={s.progressWrap}>
                  <div style={s.progressLabel}>
                    <span>Orders / Target</span>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{campaign.orders} / {campaign.target}</span>
                  </div>
                  <div style={s.progressBar}>
                    <div style={s.progressFill(progress, progress >= 100 ? '#10b981' : '#3b82f6')} />
                  </div>
                </div>

                <div style={s.campaignMeta}>
                  <div style={s.metaItem}>
                    <Icon name="dollarSign" size={12} />
                    {tzs(campaign.totalDeposits)}
                  </div>
                  <div style={s.metaItem}>
                    <Icon name="calendar" size={12} />
                    Closes {campaign.closeDate}
                  </div>
                  <div style={s.metaItem}>
                    <Icon name="truck" size={12} />
                    ETA {campaign.eta}
                  </div>
                  <div style={s.metaItem}>
                    <Icon name="target" size={12} />
                    {campaign.depositPercent}% deposit
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add new campaign card */}
          <div 
            style={{ ...s.campaignCard(false, 'active'), border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}
          >
            <Icon name="plus" size={32} color="var(--text3)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>Create Campaign</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Set product, target, and deposit</div>
          </div>
        </div>

        {/* Customer Panel */}
        {selectedCampaign && (
          <div style={s.customerPanel}>
            <div style={s.panelHeader}>
              <div style={s.panelTitle}>
                <Icon name="users" size={18} color="var(--accent)" />
                Pre-Order Customers ({selectedCampaign.customers.length})
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Icon name="moreVertical" size={18} color="var(--text3)" />
              </button>
            </div>

            {selectedCampaign.customers.length > 0 ? (
              <div style={s.customerList}>
                {selectedCampaign.customers.map(customer => (
                  <div key={customer.id} style={s.customerItem}>
                    <div style={s.customerAvatar(getTierColor(customer.tier))}>
                      <Icon name="user" size={18} color={getTierColor(customer.tier)} />
                    </div>
                    <div style={s.customerInfo}>
                      <div style={s.customerName}>{customer.name}</div>
                      <div style={s.customerPhone}>{customer.phone}</div>
                      <span style={s.tierBadge(getTierColor(customer.tier))}>
                        <Icon name={customer.tier === 'crown' ? 'crown' : customer.tier === 'gold' ? 'award' : 'heart'} size={8} />
                        {customer.tier.charAt(0).toUpperCase() + customer.tier.slice(1)}
                      </span>
                    </div>
                    <div style={s.customerDeposit}>
                      <div style={s.depositAmount}>{tzs(customer.deposit)}</div>
                      <div style={s.depositDate}>Paid {customer.paidAt}</div>
                      {customer.reminderSent && (
                        <span style={{ fontSize: 9, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
                          <Icon name="bellRing" size={10} /> Reminded
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                <Icon name="users" size={32} style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 12 }}>No customers yet</div>
              </div>
            )}

            {/* Summary */}
            <div style={{ padding: 16, background: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Total Deposits</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{tzs(selectedCampaign.totalDeposits)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Remaining Balance</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)' }}>
                  {tzs(selectedCampaign.orders * (selectedCampaign.minDeposit / (selectedCampaign.depositPercent / 100)) - selectedCampaign.totalDeposits)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Close Date</span>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{selectedCampaign.closeDate}</span>
              </div>
            </div>

            <div style={s.actionBar}>
              <button style={s.actionBtn}>
                <Icon name="edit" size={14} /> Edit
              </button>
              <button style={s.actionBtnPrimary}>
                <Icon name="bellRing" size={14} /> Send Reminders
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
