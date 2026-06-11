import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { tzs } from '../lib/utils'
import type { Page } from '../lib/types'
import { useAuth } from '../lib/useAuth'
import { approveRequest, rejectRequest } from '../lib/useApproval'
import { executeApprovedRequest } from '../lib/approvalExecutor'
import Toast from '../components/Toast'

interface Props {
  onNav: (p: Page) => void
}

// Lucide Icon component
const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  
  const paths: Record<string, React.ReactNode> = {
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    xCircle: <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    alertTriangle: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    percent: <><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></>,
    package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    creditCard: <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    rotateCcw: <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></>,
    dollarSign: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    trash2: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    chevronRight: <polyline points="9 18 15 12 9 6"/>,
    arrowUpRight: <><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>,
    messageSquare: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface ApprovalRequest {
  id: string
  type: string
  type_name: string
  reference_number: string
  request_summary: string
  original_value?: number
  requested_value?: number
  requested_by: string
  requested_by_name: string
  requested_at: string
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled'
  assigned_to: string
  assigned_to_name: string
  escalated: boolean
  resolution_comment?: string
  resolved_at?: string
}

interface ApprovalSetting {
  id: string
  type_code: string
  type_name: string
  threshold_type: string
  threshold_value: number | null
  approver_role: string
  escalation_hours: number
  is_active: boolean
}

const TYPE_ICONS: Record<string, string> = {
  discount: 'percent',
  refund: 'rotateCcw',
  stock_adjustment: 'package',
  large_purchase: 'dollarSign',
  overdue_invoice: 'fileText',
  void_transaction: 'trash2',
  price_change: 'dollarSign',
  credit_limit: 'creditCard',
}

const TYPE_COLORS: Record<string, string> = {
  discount: '#f59e0b',
  refund: '#ef4444',
  stock_adjustment: '#3b82f6',
  large_purchase: '#10b981',
  overdue_invoice: '#f97316',
  void_transaction: '#dc2626',
  price_change: '#8b5cf6',
  credit_limit: '#06b6d4',
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: '#f59e0b', bg: '#f59e0b20', label: 'Pending' },
  approved: { color: '#10b981', bg: '#10b98120', label: 'Approved' },
  rejected: { color: '#ef4444', bg: '#ef444420', label: 'Rejected' },
  expired: { color: '#6b7280', bg: '#6b728020', label: 'Expired' },
  cancelled: { color: '#9ca3af', bg: '#9ca3af20', label: 'Cancelled' },
}

export default function ApprovalWorkflows({ onNav }: Props) {
  void onNav
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'pending' | 'history' | 'settings'>('pending')
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [settings, setSettings] = useState<ApprovalSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null)
  const [comment, setComment] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [busy, setBusy] = useState(false)

  useEffect(() => { loadData() }, [activeTab])

  const loadData = async () => {
    setLoading(true)

    if (activeTab === 'settings') {
      // Load approval settings
      const { data } = await supabase
        .from('approval_settings')
        .select(`
          *,
          approval_types:approval_type_id (code, name)
        `)
        .order('approval_type_id')

      if (data) {
        setSettings(data.map((s: any) => ({
          id: s.id,
          type_code: s.approval_types?.code,
          type_name: s.approval_types?.name,
          threshold_type: s.threshold_type,
          threshold_value: s.threshold_value,
          approver_role: s.approver_role_id,
          escalation_hours: s.escalation_hours,
          is_active: s.is_active,
        })))
      } else {
        // Demo settings
        setSettings([
          { id: '1', type_code: 'discount', type_name: 'Discount Approval', threshold_type: 'percentage', threshold_value: 10, approver_role: 'cx_manager', escalation_hours: 24, is_active: true },
          { id: '2', type_code: 'refund', type_name: 'Refund Approval', threshold_type: 'any', threshold_value: null, approver_role: 'cx_manager', escalation_hours: 24, is_active: true },
          { id: '3', type_code: 'stock_adjustment', type_name: 'Stock Adjustment', threshold_type: 'any', threshold_value: null, approver_role: 'cx_manager', escalation_hours: 24, is_active: true },
          { id: '4', type_code: 'large_purchase', type_name: 'Large Purchase', threshold_type: 'amount', threshold_value: 1000000, approver_role: 'super_admin', escalation_hours: 48, is_active: true },
          { id: '5', type_code: 'overdue_invoice', type_name: 'Overdue Account Invoice', threshold_type: 'days', threshold_value: 30, approver_role: 'cx_manager', escalation_hours: 24, is_active: true },
          { id: '6', type_code: 'void_transaction', type_name: 'Void Transaction', threshold_type: 'any', threshold_value: null, approver_role: 'super_admin', escalation_hours: 12, is_active: true },
        ])
      }
    } else {
      // Load approval requests
      const statusFilter = activeTab === 'pending' ? ['pending'] : ['approved', 'rejected', 'expired', 'cancelled']
      
      const { data } = await supabase
        .from('approval_requests')
        .select(`
          *,
          requester:requested_by (full_name),
          approver:assigned_to (full_name),
          approval_types:approval_type_id (code, name)
        `)
        .in('status', statusFilter)
        .order('requested_at', { ascending: false })

      if (data) {
        setRequests(data.map((r: any) => ({
          ...r,
          type: r.approval_types?.code,
          type_name: r.approval_types?.name,
          requested_by_name: r.requester?.full_name,
          assigned_to_name: r.approver?.full_name,
        })))
      } else {
        // Demo requests
        setRequests(activeTab === 'pending' ? [
          { id: '1', type: 'discount', type_name: 'Discount Approval', reference_number: 'INV-2024-0089', request_summary: '15% discount on Delivery Kit Bundle', original_value: 299000, requested_value: 254150, requested_by: '4', requested_by_name: 'Rahim Athuman', requested_at: '2024-03-29T08:30:00Z', status: 'pending', assigned_to: '2', assigned_to_name: 'Jane Patrick Mwatonoka', escalated: false },
          { id: '2', type: 'stock_adjustment', type_name: 'Stock Adjustment', reference_number: 'ADJ-2024-0012', request_summary: 'Write off 3x damaged Breast Pumps', original_value: 3, requested_value: 0, requested_by: '3', requested_by_name: 'Barbra Kabendera', requested_at: '2024-03-29T07:15:00Z', status: 'pending', assigned_to: '2', assigned_to_name: 'Jane Patrick Mwatonoka', escalated: false },
          { id: '3', type: 'overdue_invoice', type_name: 'Overdue Account Invoice', reference_number: 'INV-2024-0092', request_summary: 'Invoice customer 45 days overdue (TZS 450,000)', original_value: 45, requested_value: 450000, requested_by: '4', requested_by_name: 'Rahim Athuman', requested_at: '2024-03-28T14:00:00Z', status: 'pending', assigned_to: '2', assigned_to_name: 'Jane Patrick Mwatonoka', escalated: true },
        ] : [
          { id: '4', type: 'discount', type_name: 'Discount Approval', reference_number: 'INV-2024-0085', request_summary: '12% discount for Crown member', original_value: 185000, requested_value: 162800, requested_by: '4', requested_by_name: 'Rahim Athuman', requested_at: '2024-03-27T10:00:00Z', status: 'approved', assigned_to: '2', assigned_to_name: 'Jane Patrick Mwatonoka', escalated: false, resolved_at: '2024-03-27T10:30:00Z', resolution_comment: 'Approved - loyal customer' },
          { id: '5', type: 'refund', type_name: 'Refund Approval', reference_number: 'RFD-2024-0008', request_summary: 'Full refund for defective U-Pillow', original_value: 75000, requested_value: 75000, requested_by: '3', requested_by_name: 'Barbra Kabendera', requested_at: '2024-03-26T09:00:00Z', status: 'approved', assigned_to: '2', assigned_to_name: 'Jane Patrick Mwatonoka', escalated: false, resolved_at: '2024-03-26T11:00:00Z' },
          { id: '6', type: 'large_purchase', type_name: 'Large Purchase', reference_number: 'PO-2024-0034', request_summary: 'Bulk order 50x Breast Pumps from supplier', original_value: 0, requested_value: 4625000, requested_by: '3', requested_by_name: 'Barbra Kabendera', requested_at: '2024-03-25T08:00:00Z', status: 'rejected', assigned_to: '1', assigned_to_name: 'Joe Gembe', escalated: false, resolved_at: '2024-03-25T16:00:00Z', resolution_comment: 'Budget exceeded for this month. Resubmit in April.' },
        ])
      }
    }

    setLoading(false)
  }

  const handleApprove = async () => {
    if (!selectedRequest) return
    if (!user) {
      setToast('You must be signed in to approve')
      setToastType('error')
      return
    }
    setBusy(true)

    // Step 1: Call the approve_request RPC. This validates the approver,
    // flips status to 'approved', logs an action, and returns the payload
    // we need to actually execute the voucher post.
    const approveRes = await approveRequest(selectedRequest.id, user.id, comment || undefined)
    if (!approveRes.success) {
      setToast('Approve failed: ' + (approveRes.error || 'unknown'))
      setToastType('error')
      setBusy(false)
      return
    }

    // Step 2: Run the executor. It dispatches by approval_type code,
    // posts the journal, decrements stock, writes item ledger entries,
    // flips voucher to 'posted', and marks the request as 'executed'.
    const execRes = await executeApprovedRequest(
      selectedRequest.id,
      user.id,
      user.full_name || user.email || 'Approver'
    )
    if (!execRes.success) {
      setToast('Approved but execution failed: ' + (execRes.error || 'unknown'))
      setToastType('error')
      setBusy(false)
      // Don't clear modal — let the user see the error
      return
    }

    setToast('Approved · ' + (selectedRequest.reference_number || 'request') + ' executed')
    setToastType('success')
    setSelectedRequest(null)
    setComment('')
    setBusy(false)
    loadData()
  }

  const handleReject = async () => {
    if (!selectedRequest) return
    if (!user) {
      setToast('You must be signed in to reject')
      setToastType('error')
      return
    }
    if (!comment || !comment.trim()) {
      setToast('Please provide a reason for rejection')
      setToastType('error')
      return
    }
    setBusy(true)

    const res = await rejectRequest(selectedRequest.id, user.id, comment)
    if (!res.success) {
      setToast('Reject failed: ' + (res.error || 'unknown'))
      setToastType('error')
      setBusy(false)
      return
    }

    setToast('Rejected · ' + (selectedRequest.reference_number || 'request'))
    setToastType('success')
    setSelectedRequest(null)
    setComment('')
    setBusy(false)
    loadData()
  }

  const filteredRequests = requests.filter(r => 
    filterType === 'all' || r.type === filterType
  )

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const escalatedCount = requests.filter(r => r.escalated).length

  // Styles
  const s = {
    page: { padding: 24, maxWidth: 1200, margin: '0 auto' } as React.CSSProperties,
    header: { marginBottom: 24 } as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, color: 'var(--text)' } as React.CSSProperties,
    subtitle: { fontSize: 13, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,
    tabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 4 } as React.CSSProperties,
    tab: (active: boolean) => ({ padding: '10px 16px', border: 'none', background: active ? 'var(--accent)' : 'transparent', color: active ? '#000' : 'var(--text2)', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }) as React.CSSProperties,
    badge: (color: string) => ({ background: color, color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }) as React.CSSProperties,
    statsRow: { display: 'flex', gap: 16, marginBottom: 20 } as React.CSSProperties,
    statCard: (color: string) => ({ flex: 1, background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }) as React.CSSProperties,
    statIcon: (color: string) => ({ width: 40, height: 40, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }) as React.CSSProperties,
    statValue: { fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700 } as React.CSSProperties,
    statLabel: { fontSize: 12, color: 'var(--text3)' } as React.CSSProperties,
    toolbar: { display: 'flex', gap: 12, marginBottom: 16 } as React.CSSProperties,
    select: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 } as React.CSSProperties,
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    requestItem: (urgent: boolean) => ({ padding: 16, borderBottom: '1px solid var(--border)', cursor: 'pointer', background: urgent ? '#f59e0b08' : undefined, transition: 'background .15s' }) as React.CSSProperties,
    requestHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 } as React.CSSProperties,
    requestType: (color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: `${color}15`, color, fontSize: 11, fontWeight: 500 }) as React.CSSProperties,
    requestRef: { fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)' } as React.CSSProperties,
    requestSummary: { fontSize: 14, color: 'var(--text)', marginBottom: 8 } as React.CSSProperties,
    requestMeta: { display: 'flex', gap: 16, fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    statusPill: (status: string) => {
      const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
      return { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, background: config.bg, color: config.color, fontSize: 10, fontWeight: 500 } as React.CSSProperties
    },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 } as React.CSSProperties,
    modalContent: { background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500 } as React.CSSProperties,
    modalTitle: { fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, marginBottom: 16 } as React.CSSProperties,
    detailRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 } as React.CSSProperties,
    detailLabel: { color: 'var(--text3)' } as React.CSSProperties,
    detailValue: { color: 'var(--text)', fontWeight: 500 } as React.CSSProperties,
    textarea: { width: '100%', padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, minHeight: 80, resize: 'vertical' as const } as React.CSSProperties,
    btn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, flex: 1 } as React.CSSProperties,
    btnApprove: { background: '#10b981', color: '#fff' } as React.CSSProperties,
    btnReject: { background: '#ef4444', color: '#fff' } as React.CSSProperties,
    btnGhost: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' } as React.CSSProperties,
    settingCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 } as React.CSSProperties,
    settingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } as React.CSSProperties,
    settingTitle: { fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
    settingToggle: (active: boolean) => ({ width: 44, height: 24, borderRadius: 12, background: active ? '#10b981' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'background .2s' }) as React.CSSProperties,
    settingToggleKnob: (active: boolean) => ({ position: 'absolute', top: 2, left: active ? 22 : 2, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }) as React.CSSProperties,
    settingDetails: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, fontSize: 12 } as React.CSSProperties,
    settingDetail: { } as React.CSSProperties,
    settingDetailLabel: { color: 'var(--text3)', marginBottom: 4 } as React.CSSProperties,
    settingDetailValue: { color: 'var(--text)', fontWeight: 500 } as React.CSSProperties,
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.title}>Approval Workflows</div>
        <div style={s.subtitle}>Review and approve pending requests</div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        <button style={s.tab(activeTab === 'pending')} onClick={() => setActiveTab('pending')}>
          <Icon name="clock" size={16} />
          Pending
          {pendingCount > 0 && <span style={s.badge('#f59e0b')}>{pendingCount}</span>}
        </button>
        <button style={s.tab(activeTab === 'history')} onClick={() => setActiveTab('history')}>
          <Icon name="checkCircle" size={16} />
          History
        </button>
        <button style={s.tab(activeTab === 'settings')} onClick={() => setActiveTab('settings')}>
          <Icon name="settings" size={16} />
          Settings
        </button>
      </div>

      {/* Stats (for pending tab) */}
      {activeTab === 'pending' && (
        <div style={s.statsRow}>
          <div style={s.statCard('#f59e0b')}>
            <div style={s.statIcon('#f59e0b')}>
              <Icon name="clock" size={20} color="#f59e0b" />
            </div>
            <div>
              <div style={s.statValue}>{pendingCount}</div>
              <div style={s.statLabel}>Pending Approval</div>
            </div>
          </div>
          <div style={s.statCard('#ef4444')}>
            <div style={s.statIcon('#ef4444')}>
              <Icon name="alertTriangle" size={20} color="#ef4444" />
            </div>
            <div>
              <div style={s.statValue}>{escalatedCount}</div>
              <div style={s.statLabel}>Escalated</div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading...</div>
      ) : activeTab === 'settings' ? (
        // Settings View
        <div>
          {settings.map(setting => (
            <div key={setting.id} style={s.settingCard}>
              <div style={s.settingHeader}>
                <div style={s.settingTitle}>
                  <Icon name={TYPE_ICONS[setting.type_code] || 'zap'} size={18} color={TYPE_COLORS[setting.type_code] || '#6b7280'} />
                  {setting.type_name}
                </div>
                <div 
                  style={s.settingToggle(setting.is_active) as any}
                  onClick={() => {
                    setSettings(settings.map(s => 
                      s.id === setting.id ? { ...s, is_active: !s.is_active } : s
                    ))
                  }}
                >
                  <div style={s.settingToggleKnob(setting.is_active) as any} />
                </div>
              </div>
              <div style={s.settingDetails}>
                <div style={s.settingDetail}>
                  <div style={s.settingDetailLabel}>Threshold</div>
                  <div style={s.settingDetailValue}>
                    {setting.threshold_value === null ? 'Any' : (
                      setting.threshold_type === 'percentage' ? `${setting.threshold_value}%` :
                      setting.threshold_type === 'amount' ? tzs(setting.threshold_value) :
                      setting.threshold_type === 'days' ? `${setting.threshold_value} days` :
                      setting.threshold_value
                    )}
                  </div>
                </div>
                <div style={s.settingDetail}>
                  <div style={s.settingDetailLabel}>Approver</div>
                  <div style={s.settingDetailValue}>
                    {setting.approver_role === 'super_admin' ? 'Super Admin (Joe)' : 'CX Manager (Jane)'}
                  </div>
                </div>
                <div style={s.settingDetail}>
                  <div style={s.settingDetailLabel}>Escalation</div>
                  <div style={s.settingDetailValue}>{setting.escalation_hours}h</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Pending / History View
        <>
          <div style={s.toolbar}>
            <select style={s.select} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              <option value="discount">Discounts</option>
              <option value="refund">Refunds</option>
              <option value="stock_adjustment">Stock Adjustments</option>
              <option value="large_purchase">Large Purchases</option>
              <option value="overdue_invoice">Overdue Invoices</option>
              <option value="void_transaction">Void Transactions</option>
            </select>
          </div>

          <div style={s.card}>
            {filteredRequests.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                {activeTab === 'pending' ? 'No pending approvals' : 'No approval history'}
              </div>
            ) : (
              filteredRequests.map(request => (
                <div 
                  key={request.id} 
                  style={s.requestItem(request.escalated)}
                  onClick={() => activeTab === 'pending' && setSelectedRequest(request)}
                >
                  <div style={s.requestHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={s.requestType(TYPE_COLORS[request.type] || '#6b7280')}>
                        <Icon name={TYPE_ICONS[request.type] || 'zap'} size={12} />
                        {request.type_name}
                      </span>
                      {request.escalated && (
                        <span style={{ ...s.badge('#ef4444'), fontSize: 9 }}>ESCALATED</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={s.requestRef}>{request.reference_number}</span>
                      <span style={s.statusPill(request.status)}>
                        {STATUS_CONFIG[request.status]?.label}
                      </span>
                    </div>
                  </div>
                  <div style={s.requestSummary}>{request.request_summary}</div>
                  <div style={s.requestMeta}>
                    <span>By: {request.requested_by_name}</span>
                    <span>Assigned: {request.assigned_to_name}</span>
                    <span>{new Date(request.requested_at).toLocaleString()}</span>
                  </div>
                  {request.resolution_comment && (
                    <div style={{ marginTop: 8, padding: 8, background: 'var(--surface2)', borderRadius: 6, fontSize: 12, color: 'var(--text2)' }}>
                      <strong>Comment:</strong> {request.resolution_comment}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Approval Modal */}
      {selectedRequest && (
        <div style={s.modal} onClick={() => setSelectedRequest(null)}>
          <div style={s.modalContent} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Review Approval Request</div>

            <div style={{ marginBottom: 16 }}>
              <span style={s.requestType(TYPE_COLORS[selectedRequest.type] || '#6b7280')}>
                <Icon name={TYPE_ICONS[selectedRequest.type] || 'zap'} size={14} />
                {selectedRequest.type_name}
              </span>
            </div>

            <div style={s.detailRow}>
              <span style={s.detailLabel}>Reference</span>
              <span style={{ ...s.detailValue, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{selectedRequest.reference_number}</span>
            </div>
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Summary</span>
              <span style={s.detailValue}>{selectedRequest.request_summary}</span>
            </div>
            {selectedRequest.original_value !== undefined && selectedRequest.requested_value !== undefined && (
              <div style={s.detailRow}>
                <span style={s.detailLabel}>Value Change</span>
                <span style={s.detailValue}>
                  {tzs(selectedRequest.original_value)} → {tzs(selectedRequest.requested_value)}
                </span>
              </div>
            )}
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Requested By</span>
              <span style={s.detailValue}>{selectedRequest.requested_by_name}</span>
            </div>
            <div style={{ ...s.detailRow, borderBottom: 'none' }}>
              <span style={s.detailLabel}>Requested At</span>
              <span style={s.detailValue}>{new Date(selectedRequest.requested_at).toLocaleString()}</span>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6, display: 'block' }}>
                Comment (required for rejection)
              </label>
              <textarea
                style={s.textarea}
                placeholder="Add a comment..."
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button style={{ ...s.btn, ...s.btnGhost, opacity: busy ? 0.5 : 1 }} onClick={() => setSelectedRequest(null)} disabled={busy}>
                Cancel
              </button>
              <button style={{ ...s.btn, ...s.btnReject, opacity: busy ? 0.5 : 1 }} onClick={handleReject} disabled={busy}>
                <Icon name="x" size={16} />
                {busy ? 'Working…' : 'Reject'}
              </button>
              <button style={{ ...s.btn, ...s.btnApprove, opacity: busy ? 0.5 : 1 }} onClick={handleApprove} disabled={busy}>
                <Icon name="check" size={16} />
                {busy ? 'Working…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} type={toastType} onClose={() => setToast('')} />
    </div>
  )
}
