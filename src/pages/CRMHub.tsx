import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void
}

// Lucide Icon component - comprehensive icon set
const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  
  const paths: Record<string, React.ReactNode> = {
    // Navigation & UI
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    arrowUpRight: <><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>,
    chevronRight: <polyline points="9 18 15 12 9 6"/>,
    chevronDown: <polyline points="6 9 12 15 18 9"/>,
    externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    
    // Communication
    messageCircle: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    messageSquare: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    
    // People
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>,
    userCheck: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></>,
    
    // Business & Commerce
    shoppingCart: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    creditCard: <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    dollarSign: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    receipt: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17V7"/></>,
    
    // Status & Feedback
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    starFilled: <><polygon fill="currentColor" stroke="none" points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    thumbsUp: <><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></>,
    thumbsDown: <><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></>,
    
    // Charts & Analytics
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    trendingDown: <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></>,
    barChart: <><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></>,
    barChart2: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    pieChart: <><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    
    // Loyalty & Rewards
    crown: <><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    gift: <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
    trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></>,
    medal: <><path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></>,
    
    // Referrals & Sharing
    share2: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    link2: <><path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    
    // Automation & Actions
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    zapOff: <><polyline points="12.41 6.75 13 2 10.57 4.92"/><polyline points="18.57 12.91 21 10 15.66 10"/><polyline points="8 8 3 14 12 14 11 22 16 16"/><line x1="1" y1="1" x2="23" y2="23"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    refresh: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
    play: <><polygon points="5 3 19 12 5 21 5 3"/></>,
    pause: <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
    
    // Status indicators
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    alertTriangle: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    info: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    
    // Files & Documents  
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></>,
    
    // Misc
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    minus: <><line x1="5" y1="12" x2="19" y2="12"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    moreVertical: <><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></>,
    moreHorizontal: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    globe: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    wifi: <><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>,
    brain: <><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54"/></>,
    sparkles: <><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    bellRing: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M22 8c0-2.3-.8-4.3-2-6"/></>,
    mapPin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

// Stats interface
interface CRMStats {
  totalCustomers: number
  unreadMessages: number
  openTickets: number
  upsellRate: number
  totalReferrals: number
  crownMembers: number
  activeAutomations: number
  csatScore: number
  preOrders: number
  mamaCount: number
  goldCount: number
  crownCount: number
  inactiveCount: number
  referralRevenue: number
  pointsIssued: number
  pointsRedeemed: number
}

interface Conversation {
  id: string
  customer_name: string
  last_message: string
  timestamp: string
  unread_count: number
  is_urgent: boolean
  tier: string
  avatar_color: string
}

interface TopCustomer {
  id: string
  name: string
  ltv: number
  orders: number
  tier: string
  referrals: number
}

interface FeedbackItem {
  id: string
  customer_name: string
  type: 'review' | 'complaint' | 'suggestion' | 'testimonial'
  rating?: number
  message: string
  status: string
  timestamp: string
}

interface UpsellRule {
  id: string
  name: string
  trigger: string
  triggered: number
  converted: number
  revenue: number
}

interface AutomationItem {
  id: string
  name: string
  trigger: string
  sent: number
  deliveryRate: number
  isActive: boolean
}

interface PointsActivity {
  id: string
  customer_name: string
  action: string
  points: number
  timestamp: string
}

export default function CRMHub({ onNav }: Props) {
  const [stats, setStats] = useState<CRMStats>({
    totalCustomers: 0, unreadMessages: 0, openTickets: 0, upsellRate: 0,
    totalReferrals: 0, crownMembers: 0, activeAutomations: 0, csatScore: 0,
    preOrders: 0, mamaCount: 0, goldCount: 0, crownCount: 0, inactiveCount: 0,
    referralRevenue: 0, pointsIssued: 0, pointsRedeemed: 0
  })
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [recentFeedback, setRecentFeedback] = useState<FeedbackItem[]>([])
  const [upsellRules, setUpsellRules] = useState<UpsellRule[]>([])
  const [automations, setAutomations] = useState<AutomationItem[]>([])
  const [pointsActivity, setPointsActivity] = useState<PointsActivity[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [quickReply, setQuickReply] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    // Try to load from Supabase
    const { data: customers } = await supabase.from('customers').select('*').eq('is_active', true)
    const { data: convos } = await supabase.from('conversations').select('*').order('last_message_at', { ascending: false }).limit(5)
    const { data: feedback } = await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(4)

    // Load counts from CRM tables
    const { count: unreadCount } = await supabase.from('conversations').select('*', { count: 'exact', head: true }).gt('unread_count', 0)
    const { count: ticketCount } = await supabase.from('feedback').select('*', { count: 'exact', head: true }).in('status', ['new', 'in_progress'])
    const { count: referralCount } = await supabase.from('referrals').select('*', { count: 'exact', head: true })
    const { count: autoCount } = await supabase.from('crm_automations').select('*', { count: 'exact', head: true }).eq('is_active', true)
    const { count: preorderCount } = await supabase.from('preorders').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    const { data: pointsData } = await supabase.from('crown_points_log').select('points, type')
    
    const pointsIssued = pointsData?.filter(p => p.type === 'earn').reduce((sum, p) => sum + p.points, 0) || 0
    const pointsRedeemed = pointsData?.filter(p => p.type === 'redeem').reduce((sum, p) => sum + Math.abs(p.points), 0) || 0

    // Calculate customer LTV from vouchers
    const { data: customerSales } = await supabase
      .from('vouchers')
      .select('customer_id, total_amount')
      .in('type', ['cash_sale', 'sales_invoice'])
      .eq('status', 'posted')
      .not('customer_id', 'is', null)

    // Aggregate sales by customer
    const customerStats: Record<string, { ltv: number; orders: number }> = {}
    customerSales?.forEach(v => {
      if (!v.customer_id) return
      if (!customerStats[v.customer_id]) customerStats[v.customer_id] = { ltv: 0, orders: 0 }
      customerStats[v.customer_id].ltv += v.total_amount || 0
      customerStats[v.customer_id].orders += 1
    })

    if (customers && customers.length > 0) {
      const mama = customers.filter(c => !c.crown_tier || c.crown_tier === 'mama').length
      const gold = customers.filter(c => c.crown_tier === 'gold').length
      const crown = customers.filter(c => c.crown_tier === 'crown').length
      
      // Enrich customers with calculated stats
      const enrichedCustomers = customers.map(c => ({
        ...c,
        lifetime_value: customerStats[c.id]?.ltv || c.lifetime_value || 0,
        total_orders: customerStats[c.id]?.orders || c.total_orders || 0
      }))
      
      setStats({
        totalCustomers: customers.length,
        unreadMessages: unreadCount || 0,
        openTickets: ticketCount || 0,
        upsellRate: 0,
        totalReferrals: referralCount || 0,
        crownMembers: crown + gold,
        activeAutomations: autoCount || 0,
        csatScore: 0,
        preOrders: preorderCount || 0,
        mamaCount: mama,
        goldCount: gold,
        crownCount: crown,
        inactiveCount: 0,
        referralRevenue: 0,
        pointsIssued: pointsIssued,
        pointsRedeemed: pointsRedeemed
      })

      setTopCustomers(enrichedCustomers
        .sort((a, b) => (b.lifetime_value || 0) - (a.lifetime_value || 0))
        .slice(0, 5)
        .map(c => ({
          id: c.id,
          name: c.name,
          ltv: c.lifetime_value || 0,
          orders: c.total_orders || 0,
          tier: c.crown_tier || 'mama',
          referrals: 0
        })))
    } else {
      // No customers yet - show zeros
      setStats({
        totalCustomers: 0,
        unreadMessages: 0,
        openTickets: 0,
        upsellRate: 0,
        totalReferrals: 0,
        crownMembers: 0,
        activeAutomations: 0,
        csatScore: 0,
        preOrders: 0,
        mamaCount: 0,
        goldCount: 0,
        crownCount: 0,
        inactiveCount: 0,
        referralRevenue: 0,
        pointsIssued: 0,
        pointsRedeemed: 0
      })
      setTopCustomers([])
    }

    // Conversations
    if (convos && convos.length > 0) {
      setConversations(convos.map(c => ({
        id: c.id,
        customer_name: c.customer_name || 'Customer',
        last_message: c.last_message || '',
        timestamp: c.last_message_at,
        unread_count: c.unread_count || 0,
        is_urgent: c.is_urgent || false,
        tier: 'mama',
        avatar_color: '#10b981'
      })))
    } else {
      setConversations([])
    }

    // Feedback
    if (feedback && feedback.length > 0) {
      setRecentFeedback(feedback.map(f => ({
        id: f.id,
        customer_name: f.customer_name || 'Customer',
        type: f.type || 'review',
        rating: f.rating,
        message: f.comment || '',
        status: f.status || 'new',
        timestamp: f.created_at
      })))
    } else {
      setRecentFeedback([])
    }

    // Load from DB or empty
    const { data: upsellData } = await supabase.from('crm_upsell_rules').select('*').eq('is_active', true).limit(5)
    if (upsellData && upsellData.length > 0) {
      setUpsellRules(upsellData.map(r => ({
        id: r.id, name: r.name, trigger: r.trigger_category || '', triggered: 0, converted: r.conversion_count || 0, revenue: 0
      })))
    } else {
      setUpsellRules([])
    }

    // Automations
    const { data: autoData } = await supabase.from('crm_automations').select('*').eq('is_active', true).limit(5)
    if (autoData && autoData.length > 0) {
      setAutomations(autoData.map(a => ({
        id: a.id, name: a.name, trigger: a.trigger_type, sent: a.run_count || 0, deliveryRate: 0, isActive: a.is_active
      })))
    } else {
      setAutomations([])
    }

    // Points activity
    const { data: pointsActivityData } = await supabase.from('crown_points_log').select('id, points, type, source, description, created_at, customer_id, customers(name)').order('created_at', { ascending: false }).limit(5)
    if (pointsActivityData && pointsActivityData.length > 0) {
      setPointsActivity(pointsActivityData.map((p: any) => ({
        id: p.id, customer_name: p.customers?.name || 'Customer', action: p.description || p.source, points: p.points, timestamp: p.created_at
      })))
    } else {
      setPointsActivity([])
    }

    // Load pre-order campaigns
    try {
      const { data: campaignsData } = await supabase
        .from('pre_order_campaigns')
        .select(`
          id, name, target, orders_received,
          deposit_percent, total_deposits,
          close_date, status,
          products (name)
        `)
        .eq('status', 'active')
        .order('close_date', { ascending: true })
        .limit(2)

      if (campaignsData && campaignsData.length > 0) {
        setCampaigns(campaignsData.map((c: any) => ({
          id: c.id,
          name: c.name,
          orders: c.orders_received || 0,
          target: c.target || 0,
          deposits: c.total_deposits || 0,
          closes: c.close_date ? new Date(c.close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD',
          status: c.status || 'active'
        })))
      } else {
        setCampaigns([])
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err)
      setCampaigns([])
    }

    setLoading(false)
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'crown': return '#f472b6'
      case 'gold': return '#fbbf24'
      default: return '#10b981'
    }
  }

  const getTierName = (tier: string) => {
    switch (tier) {
      case 'crown': return 'Crown'
      case 'gold': return 'Gold'
      default: return 'Mama'
    }
  }

  const s = {
    page: { padding: 24, maxWidth: 1800, margin: '0 auto', background: 'var(--bg)' } as React.CSSProperties,
    
    // Header
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 } as React.CSSProperties,
    headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: 4 } as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
    subtitle: { fontSize: 13, color: 'var(--text3)' } as React.CSSProperties,
    headerRight: { display: 'flex', gap: 10, alignItems: 'center' } as React.CSSProperties,
    statusBadge: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(37, 211, 102, 0.1)', border: '1px solid rgba(37, 211, 102, 0.3)', borderRadius: 8, padding: '8px 14px' } as React.CSSProperties,
    statusDot: { width: 8, height: 8, background: '#25d366', borderRadius: '50%', animation: 'pulse 2s infinite' } as React.CSSProperties,
    statusText: { fontSize: 12, color: '#25d366', fontWeight: 700 } as React.CSSProperties,
    btnPrimary: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
    
    // KPI Grid
    kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 8, marginBottom: 16 } as React.CSSProperties,
    kpiCard: (highlight?: boolean) => ({ background: highlight ? 'rgba(59, 130, 246, 0.05)' : 'var(--card)', border: `1px solid ${highlight ? 'rgba(59, 130, 246, 0.3)' : 'var(--border)'}`, borderRadius: 10, padding: '12px 10px', textAlign: 'center' as const, cursor: 'pointer', transition: 'all .15s' }) as React.CSSProperties,
    kpiValue: (color: string) => ({ fontSize: 22, fontWeight: 900, color, fontFamily: 'var(--mono)' }) as React.CSSProperties,
    kpiLabel: (highlight?: boolean) => ({ fontSize: 9, color: highlight ? '#3b82f6' : 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 2, fontWeight: highlight ? 700 : 400 }) as React.CSSProperties,
    
    // Main Grid
    mainGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 } as React.CSSProperties,
    
    // Segment Card
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    cardHeader: (accentColor: string) => ({ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${accentColor}08` }) as React.CSSProperties,
    cardHeaderLeft: { display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
    cardIcon: (bg: string) => ({ width: 36, height: 36, borderRadius: 8, background: `${bg}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }) as React.CSSProperties,
    cardTitle: { fontWeight: 700, fontSize: 13 } as React.CSSProperties,
    cardSubtitle: (color: string) => ({ fontSize: 10, color }) as React.CSSProperties,
    cardBtn: (bg: string) => ({ background: bg, color: '#000', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }) as React.CSSProperties,
    cardBody: { padding: 12 } as React.CSSProperties,
    
    // Conversation item
    convoItem: (isUrgent: boolean) => ({ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: isUrgent ? 'rgba(239, 68, 68, 0.05)' : 'transparent', border: isUrgent ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid transparent', marginBottom: 4, transition: 'all .15s' }) as React.CSSProperties,
    convoAvatar: (color: string) => ({ width: 36, height: 36, borderRadius: '50%', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as React.CSSProperties,
    convoContent: { flex: 1, minWidth: 0 } as React.CSSProperties,
    convoHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 } as React.CSSProperties,
    convoName: { fontWeight: 700, fontSize: 12 } as React.CSSProperties,
    convoTime: { fontSize: 10, color: 'var(--text3)' } as React.CSSProperties,
    convoMessage: { fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties,
    convoBadges: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4 } as React.CSSProperties,
    urgentBadge: { fontSize: 9, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '2px 6px', borderRadius: 4, fontWeight: 700 } as React.CSSProperties,
    unreadBadge: { width: 18, height: 18, background: '#25d366', borderRadius: '50%', color: '#000', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    tierBadge: (color: string) => ({ fontSize: 9, background: `${color}20`, color, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }) as React.CSSProperties,
    
    // Quick reply
    quickReplyWrap: { padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 } as React.CSSProperties,
    quickReplyInput: { flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--text)' } as React.CSSProperties,
    quickReplyBtn: { background: '#25d366', color: '#000', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
    
    // Customer profiles
    tierGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 } as React.CSSProperties,
    tierCard: (color: string) => ({ textAlign: 'center' as const, padding: 10, background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 8 }) as React.CSSProperties,
    tierValue: (color: string) => ({ fontSize: 18, fontWeight: 800, color }) as React.CSSProperties,
    tierLabel: (color: string) => ({ fontSize: 10, color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }) as React.CSSProperties,
    
    // Top customers
    customerItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6 } as React.CSSProperties,
    medalIcon: (rank: number) => ({ width: 24, height: 24, borderRadius: '50%', background: rank === 1 ? '#fbbf24' : rank === 2 ? '#9ca3af' : rank === 3 ? '#cd7f32' : 'var(--surface3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: rank <= 3 ? '#fff' : 'var(--text3)' }) as React.CSSProperties,
    
    // Feedback
    feedbackItem: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6 } as React.CSSProperties,
    feedbackIcon: (color: string) => ({ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }) as React.CSSProperties,
    feedbackContent: { flex: 1, minWidth: 0 } as React.CSSProperties,
    feedbackHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } as React.CSSProperties,
    feedbackName: { fontWeight: 600, fontSize: 12 } as React.CSSProperties,
    feedbackType: (color: string) => ({ fontSize: 9, background: `${color}20`, color, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }) as React.CSSProperties,
    feedbackMessage: { fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 } as React.CSSProperties,
    
    // Upsell
    upsellItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, marginBottom: 6, fontSize: 11 } as React.CSSProperties,
    upsellRate: (rate: number) => ({ background: rate >= 30 ? 'rgba(37, 211, 102, 0.15)' : rate >= 20 ? 'rgba(251, 191, 36, 0.15)' : 'rgba(107, 114, 128, 0.15)', color: rate >= 30 ? '#25d366' : rate >= 20 ? '#fbbf24' : '#6b7280', padding: '3px 10px', borderRadius: 4, fontWeight: 700, fontSize: 11 }) as React.CSSProperties,
    
    // Referral leaderboard
    leaderItem: (rank: number) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: rank === 1 ? 'rgba(251, 191, 36, 0.08)' : 'var(--surface2)', border: rank === 1 ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid transparent', borderRadius: 8, marginBottom: 6, cursor: 'pointer' }) as React.CSSProperties,
    leaderRank: (rank: number) => ({ fontSize: 18, fontWeight: 800, color: rank === 1 ? '#fbbf24' : rank === 2 ? '#9ca3af' : '#cd7f32' }) as React.CSSProperties,
    
    // Automation
    automationItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6 } as React.CSSProperties,
    automationInfo: { display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
    automationIcon: (color: string) => ({ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }) as React.CSSProperties,
    automationStats: { display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
    automationStat: { fontSize: 10, background: 'rgba(37, 211, 102, 0.15)', color: '#25d366', padding: '3px 8px', borderRadius: 4 } as React.CSSProperties,
    toggleSwitch: (isOn: boolean) => ({ width: 36, height: 20, borderRadius: 10, background: isOn ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', position: 'relative' as const, transition: 'all .2s' }) as React.CSSProperties,
    toggleThumb: (isOn: boolean) => ({ position: 'absolute' as const, top: 2, width: 16, height: 16, borderRadius: '50%', background: isOn ? '#000' : 'var(--text3)', transition: 'all .2s', ...(isOn ? { right: 2 } : { left: 2 }) }) as React.CSSProperties,
    
    // Points activity
    pointsItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, marginBottom: 4, fontSize: 11 } as React.CSSProperties,
    pointsValue: (positive: boolean) => ({ fontFamily: 'var(--mono)', fontWeight: 700, color: positive ? '#25d366' : '#ef4444' }) as React.CSSProperties,
    
    // Footer actions
    footerActions: { display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--border)' } as React.CSSProperties,
    footerBtn: { flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties,
  }

  if (loading) {
    return (
      <div style={s.page}>
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>
          <Icon name="globe" size={40} />
          <div style={{ marginTop: 16, fontSize: 14 }}>Loading CRM Hub...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      {/* Pulse animation */}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.title}>
            <Icon name="globe" size={28} color="var(--accent)" />
            SOKORA CRM
          </h1>
          <p style={s.subtitle}>Customer relationship command centre — All segments live below — Click any tile to expand</p>
        </div>
        <div style={s.headerRight}>
          <div style={s.statusBadge}>
            <div style={s.statusDot} />
            <span style={s.statusText}>WhatsApp Connected</span>
          </div>
          <button style={s.btnPrimary} onClick={() => onNav('crm-command-center')}>
            <Icon name="zap" size={16} />
            Command Center
          </button>
          <button style={s.btnPrimary} onClick={() => onNav('crm-whatsapp-templates')}>
            <Icon name="messageCircle" size={16} />
            WA Templates
          </button>
          <button style={s.btnPrimary} onClick={() => onNav('crm-whatsapp-resources')}>
            <Icon name="file" size={16} />
            Resources
          </button>
          <button style={s.btnPrimary} onClick={() => onNav('crm-waitlist')}>
            <Icon name="clock" size={16} />
            Waitlist
          </button>
          <button style={s.btnPrimary} onClick={() => onNav('crm-inbox')}>
            <Icon name="messageCircle" size={16} />
            Open Inbox
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={s.kpiGrid}>
        {[
          { value: stats.totalCustomers.toLocaleString(), label: 'Customers', color: 'var(--accent)', page: 'crm-customers' as Page, icon: 'users' },
          { value: stats.unreadMessages, label: 'Unread Msgs', color: '#25d366', page: 'crm-inbox' as Page, icon: 'messageCircle' },
          { value: stats.openTickets, label: 'Open Tickets', color: '#ef4444', page: 'crm-feedback' as Page, icon: 'alertCircle' },
          { value: `${stats.upsellRate}%`, label: 'Upsell Rate', color: '#3b82f6', page: 'crm-upsell' as Page, icon: 'trendingUp' },
          { value: stats.totalReferrals, label: 'Referrals', color: '#a855f7', page: 'crm-referrals' as Page, icon: 'share2' },
          { value: stats.crownMembers, label: 'Crown Members', color: '#f59e0b', page: 'crm-loyalty' as Page, icon: 'crown' },
          { value: stats.activeAutomations, label: 'Automations', color: '#10b981', page: 'crm-automations' as Page, icon: 'zap' },
          { value: `${stats.csatScore}`, label: 'CSAT', color: 'var(--accent)', page: 'crm-feedback' as Page, icon: 'star', suffix: <Icon name="starFilled" size={12} color="var(--accent)" /> },
          { value: stats.preOrders, label: 'Pre-Orders', color: '#3b82f6', page: 'crm-preorders' as Page, icon: 'package', highlight: true },
        ].map((kpi) => (
          <div 
            key={kpi.label}
            style={s.kpiCard(kpi.highlight)} 
            onClick={() => onNav(kpi.page)}
            onMouseEnter={e => { e.currentTarget.style.borderColor = kpi.color; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = kpi.highlight ? 'rgba(59, 130, 246, 0.3)' : 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div style={s.kpiValue(kpi.color)}>{kpi.value}{kpi.suffix}</div>
            <div style={s.kpiLabel(kpi.highlight)}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Row 1: Inbox + Customer Profiles */}
      <div style={s.mainGrid}>
        {/* Live Inbox */}
        <div style={s.card}>
          <div style={s.cardHeader('#25d366')}>
            <div style={s.cardHeaderLeft}>
              <div style={s.cardIcon('#25d366')}>
                <Icon name="inbox" size={20} color="#25d366" />
              </div>
              <div>
                <div style={s.cardTitle}>Live Inbox</div>
                <div style={s.cardSubtitle('#25d366')}>{stats.unreadMessages} unread · {conversations.length} conversations active</div>
              </div>
            </div>
            <button style={s.cardBtn('#25d366')} onClick={() => onNav('crm-inbox')}>
              Open Full <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <div style={s.cardBody}>
            {conversations.map((convo) => (
              <div 
                key={convo.id} 
                style={s.convoItem(convo.is_urgent)}
                onClick={() => onNav('crm-inbox')}
                onMouseEnter={e => e.currentTarget.style.background = convo.is_urgent ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = convo.is_urgent ? 'rgba(239, 68, 68, 0.05)' : 'transparent'}
              >
                <div style={s.convoAvatar(convo.avatar_color)}>
                  <Icon name="user" size={18} color={convo.avatar_color} />
                </div>
                <div style={s.convoContent}>
                  <div style={s.convoHeader}>
                    <span style={s.convoName}>{convo.customer_name}</span>
                    <span style={s.convoTime}>{convo.timestamp}</span>
                  </div>
                  <div style={s.convoMessage}>{convo.last_message}</div>
                </div>
                <div style={s.convoBadges}>
                  {convo.is_urgent && <span style={s.urgentBadge}>URGENT</span>}
                  {convo.unread_count > 0 && <span style={s.unreadBadge}>{convo.unread_count}</span>}
                  {!convo.is_urgent && convo.unread_count === 0 && (
                    <span style={s.tierBadge(getTierColor(convo.tier))}>{getTierName(convo.tier)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={s.quickReplyWrap}>
            <input 
              style={s.quickReplyInput} 
              placeholder="Quick reply to selected conversation..."
              value={quickReply}
              onChange={e => setQuickReply(e.target.value)}
            />
            <button style={s.quickReplyBtn}>
              <Icon name="send" size={14} /> Send
            </button>
          </div>
        </div>

        {/* Customer Profiles */}
        <div style={s.card}>
          <div style={s.cardHeader('var(--accent)')}>
            <div style={s.cardHeaderLeft}>
              <div style={s.cardIcon('var(--accent)')}>
                <Icon name="users" size={20} color="var(--accent)" />
              </div>
              <div>
                <div style={s.cardTitle}>Customer Profiles</div>
                <div style={s.cardSubtitle('var(--accent)')}>{stats.totalCustomers.toLocaleString()} total · {stats.crownCount + stats.goldCount} loyalty members</div>
              </div>
            </div>
            <button style={s.cardBtn('var(--accent)')} onClick={() => onNav('customers')}>
              View All <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <div style={s.cardBody}>
            {/* Tier breakdown */}
            <div style={s.tierGrid}>
              {[
                { value: stats.mamaCount, label: 'Mama', color: '#10b981', icon: 'heart' },
                { value: stats.goldCount, label: 'Gold', color: '#fbbf24', icon: 'award' },
                { value: stats.crownCount, label: 'Crown', color: '#f472b6', icon: 'crown' },
                { value: stats.inactiveCount, label: 'Inactive', color: '#6b7280', icon: 'userCheck' },
              ].map((tier) => (
                <div key={tier.label} style={s.tierCard(tier.color)}>
                  <div style={s.tierValue(tier.color)}>{tier.value}</div>
                  <div style={s.tierLabel(tier.color)}>
                    <Icon name={tier.icon} size={12} color={tier.color} />
                    {tier.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Top customers */}
            <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 8, marginTop: 12 }}>
              <Icon name="trophy" size={12} color="var(--text3)" style={{ marginRight: 6 }} />
              Top Customers by LTV
            </div>
            {topCustomers.slice(0, 4).map((customer, i) => (
              <div key={customer.id} style={s.customerItem}>
                <div style={s.medalIcon(i + 1)}>
                  {i < 3 ? <Icon name="award" size={14} color="#fff" /> : i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{customer.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{customer.orders} orders · {customer.referrals} referrals</div>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{tzs(customer.ltv)}</div>
                  <span style={s.tierBadge(getTierColor(customer.tier))}>{getTierName(customer.tier)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Feedback + Upsell */}
      <div style={s.mainGrid}>
        {/* Feedback */}
        <div style={s.card}>
          <div style={s.cardHeader('#f59e0b')}>
            <div style={s.cardHeaderLeft}>
              <div style={s.cardIcon('#f59e0b')}>
                <Icon name="messageSquare" size={20} color="#f59e0b" />
              </div>
              <div>
                <div style={s.cardTitle}>Feedback Management</div>
                <div style={s.cardSubtitle('#f59e0b')}>{stats.openTickets} open · 142 resolved this month</div>
              </div>
            </div>
            <button style={s.cardBtn('#f59e0b')} onClick={() => onNav('crm-feedback')}>
              View All <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <div style={s.cardBody}>
            {recentFeedback.map((fb) => {
              const typeColors: Record<string, string> = { review: '#fbbf24', testimonial: '#10b981', complaint: '#ef4444', suggestion: '#3b82f6' }
              const typeIcons: Record<string, string> = { review: 'star', testimonial: 'thumbsUp', complaint: 'alertCircle', suggestion: 'info' }
              return (
                <div key={fb.id} style={s.feedbackItem}>
                  <div style={s.feedbackIcon(typeColors[fb.type])}>
                    <Icon name={typeIcons[fb.type]} size={16} color={typeColors[fb.type]} />
                  </div>
                  <div style={s.feedbackContent}>
                    <div style={s.feedbackHeader}>
                      <span style={s.feedbackName}>{fb.customer_name}</span>
                      <span style={s.feedbackType(typeColors[fb.type])}>{fb.type}</span>
                    </div>
                    <div style={s.feedbackMessage}>{fb.message}</div>
                    {fb.rating && (
                      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                        {[1,2,3,4,5].map(n => (
                          <Icon key={n} name={n <= fb.rating! ? 'starFilled' : 'star'} size={12} color="#fbbf24" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={s.footerActions}>
            <button style={s.footerBtn} onClick={() => onNav('crm-feedback')}>
              <Icon name="plus" size={14} /> New Ticket
            </button>
            <button style={s.footerBtn}>
              <Icon name="download" size={14} /> Export Testimonials
            </button>
          </div>
        </div>

        {/* Upsell Engine */}
        <div style={s.card}>
          <div style={s.cardHeader('#3b82f6')}>
            <div style={s.cardHeaderLeft}>
              <div style={s.cardIcon('#3b82f6')}>
                <Icon name="trendingUp" size={20} color="#3b82f6" />
              </div>
              <div>
                <div style={s.cardTitle}>Smart Upsell Engine</div>
                <div style={s.cardSubtitle('#3b82f6')}>AI-powered product suggestions · {tzs(upsellRules.reduce((a, r) => a + r.revenue, 0))} revenue</div>
              </div>
            </div>
            <button style={s.cardBtn('#3b82f6')} onClick={() => onNav('crm-upsell')}>
              View All <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <div style={s.cardBody}>
            <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 8 }}>
              <Icon name="sparkles" size={12} color="var(--text3)" style={{ marginRight: 6 }} />
              Top Converting Rules
            </div>
            {upsellRules.map((rule) => {
              const rate = Math.round((rule.converted / rule.triggered) * 100)
              return (
                <div key={rule.id} style={s.upsellItem}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{rule.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{rule.trigger}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ textAlign: 'right' as const }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{rule.triggered} triggered</div>
                      <div style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 700 }}>{tzs(rule.revenue)}</div>
                    </div>
                    <span style={s.upsellRate(rate)}>{rate}%</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderTop: '1px solid var(--border)', textAlign: 'center' as const }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Upsell Revenue (30d)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{tzs(10170000)}</div>
          </div>
        </div>
      </div>

      {/* Row 3: Referrals + Crown Loyalty */}
      <div style={s.mainGrid}>
        {/* Referrals */}
        <div style={s.card}>
          <div style={s.cardHeader('#a855f7')}>
            <div style={s.cardHeaderLeft}>
              <div style={s.cardIcon('#a855f7')}>
                <Icon name="share2" size={20} color="#a855f7" />
              </div>
              <div>
                <div style={s.cardTitle}>Referral System</div>
                <div style={s.cardSubtitle('#a855f7')}>{stats.totalReferrals} total · {tzs(stats.referralRevenue)} revenue</div>
              </div>
            </div>
            <button style={s.cardBtn('#a855f7')} onClick={() => onNav('crm-referrals')}>
              View All <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <div style={s.cardBody}>
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              <div style={{ textAlign: 'center' as const, padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#a855f7' }}>412</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Total</div>
              </div>
              <div style={{ textAlign: 'center' as const, padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#25d366' }}>287</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Converted</div>
              </div>
              <div style={{ textAlign: 'center' as const, padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#3b82f6' }}>2.87M</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>TZS Revenue</div>
              </div>
            </div>

            {/* Leaderboard */}
            <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 8 }}>
              <Icon name="trophy" size={12} color="var(--text3)" style={{ marginRight: 6 }} />
              Top Referrers
            </div>
            {topCustomers.filter(c => c.referrals > 0).slice(0, 3).length > 0 ? topCustomers.filter(c => c.referrals > 0).slice(0, 3).map((leader, i) => (
              <div key={leader.id} style={s.leaderItem(i + 1)} onClick={() => onNav('crm-referrals')}>
                <div style={s.leaderRank(i + 1)}>
                  <Icon name="medal" size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{leader.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>MAL-{leader.name.split(' ')[0].toUpperCase().slice(0,6)}</div>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: i === 0 ? '#fbbf24' : i === 1 ? '#9ca3af' : '#cd7f32' }}>{leader.referrals} refs</div>
                  <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{tzs(leader.referrals * 5000)}</div>
                </div>
              </div>
            )) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>No referrals yet</div>
            )}
          </div>
          <div style={s.footerActions}>
            <select style={{ flex: 1, ...s.footerBtn, appearance: 'none' as const }}>
              <option value="">Select customer...</option>
              {topCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button style={{ ...s.footerBtn, background: '#25d366', color: '#000', border: 'none', fontWeight: 700 }}>
              <Icon name="send" size={14} /> Send Link
            </button>
          </div>
        </div>

        {/* Crown Loyalty */}
        <div style={s.card}>
          <div style={s.cardHeader('#f59e0b')}>
            <div style={s.cardHeaderLeft}>
              <div style={s.cardIcon('#f59e0b')}>
                <Icon name="crown" size={20} color="#f59e0b" />
              </div>
              <div>
                <div style={s.cardTitle}>Crown Rewards</div>
                <div style={s.cardSubtitle('#f59e0b')}>{(stats.pointsIssued / 1000000).toFixed(1)}M pts issued · {(stats.pointsRedeemed / 1000000).toFixed(1)}M redeemed · 3 tiers</div>
              </div>
            </div>
            <button style={s.cardBtn('#f59e0b')} onClick={() => onNav('crm-loyalty')}>
              View All <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <div style={s.cardBody}>
            {/* Tier pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, textAlign: 'center' as const, padding: 10, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#10b981' }}>842</div>
                <div style={{ fontSize: 10, color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Icon name="heart" size={10} /> Mama
                </div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' as const, padding: 10, background: 'rgba(156, 163, 175, 0.1)', border: '1px solid rgba(156, 163, 175, 0.3)', borderRadius: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#9ca3af' }}>158</div>
                <div style={{ fontSize: 10, color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Icon name="award" size={10} /> Gold
                </div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' as const, padding: 10, background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#f59e0b' }}>247</div>
                <div style={{ fontSize: 10, color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Icon name="crown" size={10} /> Crown
                </div>
              </div>
            </div>

            {/* Points activity */}
            <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 8 }}>
              Recent Points Activity
            </div>
            {pointsActivity.map((activity) => (
              <div key={activity.id} style={s.pointsItem}>
                <div>
                  <span style={{ fontWeight: 600 }}>{activity.customer_name}</span>
                  <span style={{ color: 'var(--text3)' }}> — {activity.action}</span>
                </div>
                <span style={s.pointsValue(activity.points > 0)}>
                  {activity.points > 0 ? '+' : ''}{activity.points.toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>
          <div style={s.footerActions}>
            <button style={s.footerBtn}>
              <Icon name="settings" size={14} /> Adjust Points
            </button>
            <button style={s.footerBtn} onClick={() => onNav('crm-loyalty')}>
              <Icon name="gift" size={14} /> Rewards Catalog
            </button>
          </div>
        </div>
      </div>

      {/* Row 4: Automations + Pre-Orders */}
      <div style={s.mainGrid}>
        {/* Automations */}
        <div style={s.card}>
          <div style={s.cardHeader('#10b981')}>
            <div style={s.cardHeaderLeft}>
              <div style={s.cardIcon('#10b981')}>
                <Icon name="zap" size={20} color="#10b981" />
              </div>
              <div>
                <div style={s.cardTitle}>Automation Engine</div>
                <div style={s.cardSubtitle('#10b981')}>{stats.activeAutomations} active · 2,841 msgs sent (30d) · 94.2% delivery</div>
              </div>
            </div>
            <button style={s.cardBtn('#10b981')} onClick={() => onNav('crm-automations')}>
              View All <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <div style={s.cardBody}>
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--accent)' }}>18</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Active</div>
              </div>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#25d366' }}>2,841</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Sent</div>
              </div>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#3b82f6' }}>94.2%</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Delivery</div>
              </div>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#f59e0b' }}>68%</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Open Rate</div>
              </div>
            </div>

            {automations.map((auto) => (
              <div key={auto.id} style={s.automationItem}>
                <div style={s.automationInfo}>
                  <div style={s.automationIcon('#10b981')}>
                    <Icon name="zap" size={16} color="#10b981" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{auto.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{auto.trigger}</div>
                  </div>
                </div>
                <div style={s.automationStats}>
                  <span style={s.automationStat}>{auto.sent} sent</span>
                  <div style={s.toggleSwitch(auto.isActive)}>
                    <div style={s.toggleThumb(auto.isActive)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={s.footerActions}>
            <button style={{ ...s.footerBtn, flex: 2 }}>
              <Icon name="plus" size={14} /> Build New Automation
            </button>
            <button style={s.footerBtn}>
              <Icon name="pause" size={14} /> Pause All
            </button>
          </div>
        </div>

        {/* Pre-Orders */}
        <div style={s.card}>
          <div style={s.cardHeader('#3b82f6')}>
            <div style={s.cardHeaderLeft}>
              <div style={s.cardIcon('#3b82f6')}>
                <Icon name="package" size={20} color="#3b82f6" />
              </div>
              <div>
                <div style={s.cardTitle}>Pre-Order Campaigns</div>
                <div style={s.cardSubtitle('#3b82f6')}>{stats.preOrders} active campaigns · {tzs(6500000)} deposits collected</div>
              </div>
            </div>
            <button style={s.cardBtn('#3b82f6')} onClick={() => onNav('crm-preorders')}>
              View All <Icon name="arrowRight" size={14} />
            </button>
          </div>
          <div style={s.cardBody}>
            {/* Campaign cards - load from database */}
            {campaigns && campaigns.slice(0, 2).map((campaign) => (
              <div key={campaign.id} style={{ padding: 12, background: 'var(--surface2)', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{campaign.name}</div>
                  <span style={{ fontSize: 9, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    <Icon name="activity" size={10} style={{ marginRight: 4 }} /> Active
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text3)' }}>Orders / Target</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{campaign.orders} / {campaign.target}</span>
                </div>
                <div style={{ height: 6, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', width: `${(campaign.orders / campaign.target) * 100}%`, background: campaign.orders >= campaign.target ? '#10b981' : '#3b82f6', borderRadius: 3 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)' }}>
                  <span><Icon name="dollarSign" size={10} style={{ marginRight: 4 }} />{tzs(campaign.deposits)}</span>
                  <span><Icon name="calendar" size={10} style={{ marginRight: 4 }} />Closes {campaign.closes}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={s.footerActions}>
            <button style={s.footerBtn} onClick={() => onNav('crm-preorders')}>
              <Icon name="plus" size={14} /> New Campaign
            </button>
            <button style={{ ...s.footerBtn, background: '#25d366', color: '#000', border: 'none', fontWeight: 700 }}>
              <Icon name="bellRing" size={14} /> Send Reminders
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
