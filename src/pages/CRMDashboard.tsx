import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void
}

interface DashboardStats {
  totalCustomers: number
  newCustomersThisMonth: number
  leadsThisMonth: number
  leadsConverted: number
  preordersPending: number
  preordersDeposits: number
  avgNPS: number
  feedbackCount: number
  crownMembers: number
  crownMamaPlus: number
  crownMamaCrown: number
  referralsThisMonth: number
  totalCrownPoints: number
}

interface RecentActivity {
  id: string
  type: 'customer' | 'lead' | 'preorder' | 'feedback' | 'referral' | 'crown'
  title: string
  subtitle: string
  time: string
  icon: string
  color: string
}

export default function CRMDashboard({ onNav }: Props) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activity, setActivity] = useState<RecentActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    setLoading(true)

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    // Parallel queries
    const [
      customersRes,
      newCustomersRes,
      leadsRes,
      preordersRes,
      feedbackRes,
      crownRes,
      referralsRes,
      recentCustomersRes,
      recentLeadsRes,
      recentFeedbackRes
    ] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('customers').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
      supabase.from('leads').select('id, stage', { count: 'exact' }).gte('created_at', monthStart),
      supabase.from('preorders').select('id, deposit_paid, status').in('status', ['pending_deposit', 'deposit_paid', 'ordered', 'arrived']),
      supabase.from('feedback').select('id, nps_score, rating').gte('created_at', monthStart),
      supabase.from('customers').select('crown_tier, crown_points').eq('is_active', true),
      supabase.from('referrals').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
      supabase.from('customers').select('id, name, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('leads').select('id, name, stage, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('feedback').select('id, customer_name, type, rating, created_at').order('created_at', { ascending: false }).limit(5)
    ])

    // Process stats
    const leadsData = leadsRes.data || []
    const preordersData = preordersRes.data || []
    const feedbackData = feedbackRes.data || []
    const crownData = crownRes.data || []

    const npsScores = feedbackData.filter(f => f.nps_score !== null).map(f => f.nps_score)
    const avgNPS = npsScores.length > 0 ? Math.round(npsScores.reduce((a, b) => a + b, 0) / npsScores.length) : 0

    const dashStats: DashboardStats = {
      totalCustomers: customersRes.count || 0,
      newCustomersThisMonth: newCustomersRes.count || 0,
      leadsThisMonth: leadsData.length,
      leadsConverted: leadsData.filter(l => l.stage === 'converted').length,
      preordersPending: preordersData.length,
      preordersDeposits: preordersData.reduce((sum, p) => sum + (p.deposit_paid || 0), 0),
      avgNPS: avgNPS,
      feedbackCount: feedbackData.length,
      crownMembers: crownData.filter(c => (c.crown_points || 0) > 0).length,
      crownMamaPlus: crownData.filter(c => c.crown_tier === 'mama_plus').length,
      crownMamaCrown: crownData.filter(c => c.crown_tier === 'mama_crown').length,
      referralsThisMonth: referralsRes.count || 0,
      totalCrownPoints: crownData.reduce((sum, c) => sum + (c.crown_points || 0), 0)
    }

    setStats(dashStats)

    // Build recent activity
    const activities: RecentActivity[] = []

    // Recent customers
    ;(recentCustomersRes.data || []).forEach(c => {
      activities.push({
        id: `cust-${c.id}`,
        type: 'customer',
        title: c.name,
        subtitle: 'New customer',
        time: formatTime(c.created_at),
        icon: '👤',
        color: 'var(--accent)'
      })
    })

    // Recent leads
    ;(recentLeadsRes.data || []).forEach(l => {
      activities.push({
        id: `lead-${l.id}`,
        type: 'lead',
        title: l.name,
        subtitle: `Lead - ${l.stage.replace(/_/g, ' ')}`,
        time: formatTime(l.created_at),
        icon: '🎯',
        color: 'var(--yellow)'
      })
    })

    // Recent feedback
    ;(recentFeedbackRes.data || []).forEach(f => {
      activities.push({
        id: `fb-${f.id}`,
        type: 'feedback',
        title: f.customer_name || 'Anonymous',
        subtitle: `${f.type} - ${f.rating ? `${f.rating} stars` : 'submitted'}`,
        time: formatTime(f.created_at),
        icon: f.rating && f.rating >= 4 ? '⭐' : '💬',
        color: f.rating && f.rating >= 4 ? 'var(--yellow)' : 'var(--text3)'
      })
    })

    // Sort by time and take top 10
    activities.sort((a, b) => b.time.localeCompare(a.time))
    setActivity(activities.slice(0, 10))

    setLoading(false)
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const s = {
    page: { padding: 32, maxWidth: 1400, margin: '0 auto' } as React.CSSProperties,
    header: { marginBottom: 28 } as React.CSSProperties,
    title: { fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800, marginBottom: 4 } as React.CSSProperties,
    sub: { fontSize: 13, color: 'var(--text3)' } as React.CSSProperties,
    grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 } as React.CSSProperties,
    grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 } as React.CSSProperties,
    statCard: (color: string) => ({
      background: `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)`,
      border: `1px solid ${color}30`,
      borderRadius: 12,
      padding: '18px 20px',
    }) as React.CSSProperties,
    statLabel: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 } as React.CSSProperties,
    statValue: { fontFamily: 'DM Mono, monospace', fontSize: 28, fontWeight: 700, marginBottom: 4 } as React.CSSProperties,
    statChange: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    section: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 } as React.CSSProperties,
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 } as React.CSSProperties,
    cardTitle: { fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
    quickAction: { padding: '12px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all .15s' } as React.CSSProperties,
    activityItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={s.page}>
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>Loading CRM dashboard...</div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>CRM Dashboard</h1>
        <p style={s.sub}>Customer relationships, loyalty, and engagement at a glance</p>
      </div>

      {/* Top Stats Row */}
      <div style={s.grid4}>
        <div style={s.statCard('#85c2be')}>
          <div style={s.statLabel}>Total Customers</div>
          <div style={{ ...s.statValue, color: 'var(--accent)' }}>{stats.totalCustomers.toLocaleString()}</div>
          <div style={s.statChange}>+{stats.newCustomersThisMonth} this month</div>
        </div>

        <div style={s.statCard('#f59e0b')}>
          <div style={s.statLabel}>Leads This Month</div>
          <div style={{ ...s.statValue, color: '#f59e0b' }}>{stats.leadsThisMonth}</div>
          <div style={s.statChange}>{stats.leadsConverted} converted</div>
        </div>

        <div style={s.statCard('#8b5cf6')}>
          <div style={s.statLabel}>Pre-Orders Pending</div>
          <div style={{ ...s.statValue, color: '#8b5cf6' }}>{stats.preordersPending}</div>
          <div style={s.statChange}>{tzs(stats.preordersDeposits)} deposits</div>
        </div>

        <div style={s.statCard('#10b981')}>
          <div style={s.statLabel}>NPS Score</div>
          <div style={{ ...s.statValue, color: stats.avgNPS >= 50 ? '#10b981' : stats.avgNPS >= 30 ? '#f59e0b' : '#ef4444' }}>
            {stats.avgNPS || '—'}
          </div>
          <div style={s.statChange}>{stats.feedbackCount} responses</div>
        </div>
      </div>

      {/* Crown Loyalty Row */}
      <div style={s.grid3}>
        <div style={s.statCard('#fbbf24')}>
          <div style={s.statLabel}>Crown Members</div>
          <div style={{ ...s.statValue, color: '#fbbf24' }}>{stats.crownMembers}</div>
          <div style={s.statChange}>{stats.crownMamaPlus} Plus · {stats.crownMamaCrown} Crown</div>
        </div>

        <div style={s.statCard('#f472b6')}>
          <div style={s.statLabel}>Total Crown Points</div>
          <div style={{ ...s.statValue, color: '#f472b6' }}>{stats.totalCrownPoints.toLocaleString()}</div>
          <div style={s.statChange}>Across all members</div>
        </div>

        <div style={s.statCard('#06b6d4')}>
          <div style={s.statLabel}>Referrals This Month</div>
          <div style={{ ...s.statValue, color: '#06b6d4' }}>{stats.referralsThisMonth}</div>
          <div style={s.statChange}>New referral signups</div>
        </div>
      </div>

      {/* Main Content */}
      <div style={s.section}>
        {/* Recent Activity */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            <span>Recent Activity</span>
            <button 
              onClick={loadDashboard}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }}
            >
              Refresh
            </button>
          </div>

          {activity.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
              No recent activity
            </div>
          ) : (
            <div>
              {activity.map(item => (
                <div key={item.id} style={s.activityItem}>
                  <div style={{ fontSize: 20, width: 36, textAlign: 'center' }}>{item.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{item.subtitle}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{item.time}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <div style={s.card}>
            <div style={s.cardTitle}>Quick Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                style={s.quickAction}
                onClick={() => onNav('customers')}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <span style={{ fontSize: 20 }}>👤</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Add Customer</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Create new contact</div>
                </div>
              </div>

              <div
                style={s.quickAction}
                onClick={() => onNav('crm-leads' as Page)}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <span style={{ fontSize: 20 }}>🎯</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>New Lead</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Track potential customer</div>
                </div>
              </div>

              <div
                style={s.quickAction}
                onClick={() => onNav('crm-preorders' as Page)}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Create Pre-Order</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Reserve for customer</div>
                </div>
              </div>

              <div
                style={s.quickAction}
                onClick={() => onNav('crm-feedback' as Page)}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>View Feedback</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Reviews and complaints</div>
                </div>
              </div>

              <div
                style={s.quickAction}
                onClick={() => onNav('crm-settings' as Page)}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>CRM Settings</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Configure loyalty & automation</div>
                </div>
              </div>
            </div>
          </div>

          {/* Tier Breakdown */}
          <div style={{ ...s.card, marginTop: 16 }}>
            <div style={s.cardTitle}>Crown Tiers</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#a3a3a3' }} />
                  <span style={{ fontSize: 13 }}>Mama</span>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>
                  {stats.crownMembers - stats.crownMamaPlus - stats.crownMamaCrown}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#c0c0c0' }} />
                  <span style={{ fontSize: 13 }}>Mama Plus</span>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{stats.crownMamaPlus}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
                  <span style={{ fontSize: 13 }}>Mama Crown</span>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>{stats.crownMamaCrown}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
