import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Page } from '../lib/types'

interface Props {
  onNav: (p: Page) => void
}

const Icon = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }: { name: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }) => {
  const props = { width: size, height: size, fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', style }
  
  const paths: Record<string, React.ReactNode> = {
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash2: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    alertCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    userCheck: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></>,
    userX: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></>,
    key: <><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></>,
    chevronDown: <polyline points="6 9 12 15 18 9"/>,
    chevronRight: <polyline points="9 18 15 12 9 6"/>,
  }
  
  return <svg {...props}>{paths[name] || <circle cx="12" cy="12" r="10"/>}</svg>
}

interface User {
  id: string
  email: string
  full_name: string
  initials: string
  phone?: string
  is_active: boolean
  is_approver: boolean
  is_away: boolean
  permissions: string[]
  created_at: string
  // NULL = user can operate from any location.
  // Set = user is locked to this single stock_locations.id.
  allowed_location_id?: string | null
}

interface StockLocationOption {
  id: string
  code: string
  name: string
  branch_code: string
  is_active: boolean
}

// Permission structure grouped by module
const PERMISSION_GROUPS: { module: string; label: string; icon: string; color: string; permissions: { key: string; label: string }[] }[] = [
  {
    module: 'dashboard',
    label: 'Dashboard',
    icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    color: '#10b981',
    permissions: [
      { key: 'dashboard.view', label: 'View Dashboard' },
    ]
  },
  {
    module: 'vouchers',
    label: 'Vouchers',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    color: '#3b82f6',
    permissions: [
      { key: 'accounting.view', label: 'View Vouchers' },
      { key: 'accounting.create', label: 'Create Vouchers' },
      { key: 'accounting.edit', label: 'Edit Vouchers' },
      { key: 'accounting.delete', label: 'Delete/Void Vouchers' },
      { key: 'accounting.post', label: 'Post Vouchers' },
      { key: 'accounting.approve', label: 'Approve Vouchers' },
    ]
  },
  {
    module: 'sales',
    label: 'Sales',
    icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    color: '#f59e0b',
    permissions: [
      { key: 'sales.view', label: 'View Sales' },
      { key: 'sales.create', label: 'Create Sales' },
      { key: 'sales.edit', label: 'Edit Sales' },
      { key: 'sales.delete', label: 'Delete Sales' },
      { key: 'sales.approve', label: 'Approve Discounts/Refunds' },
      { key: 'sales.export', label: 'Export Sales Data' },
    ]
  },
  {
    module: 'inventory',
    label: 'Inventory',
    icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    color: '#8b5cf6',
    permissions: [
      { key: 'inventory.view', label: 'View Inventory' },
      { key: 'inventory.create', label: 'Add Products' },
      { key: 'inventory.edit', label: 'Edit Products' },
      { key: 'inventory.delete', label: 'Delete Products' },
      { key: 'inventory.adjust', label: 'Stock Adjustments' },
      { key: 'inventory.transfer', label: 'Stock Transfers' },
      { key: 'inventory.approve', label: 'Approve Adjustments' },
      { key: 'inventory.export', label: 'Export Inventory' },
    ]
  },
  {
    module: 'customers',
    label: 'Customers',
    icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
    color: '#ec4899',
    permissions: [
      { key: 'customers.view', label: 'View Customers' },
      { key: 'customers.create', label: 'Add Customers' },
      { key: 'customers.edit', label: 'Edit Customers' },
      { key: 'customers.delete', label: 'Delete Customers' },
      { key: 'customers.credit', label: 'Manage Credit Limits' },
      { key: 'customers.export', label: 'Export Customers' },
    ]
  },
  {
    module: 'crm',
    label: 'CRM',
    icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    color: '#06b6d4',
    permissions: [
      { key: 'crm.view', label: 'View CRM' },
      { key: 'crm.create', label: 'Create Records' },
      { key: 'crm.edit', label: 'Edit Records' },
      { key: 'crm.delete', label: 'Delete Records' },
      { key: 'crm.inbox', label: 'WhatsApp Inbox' },
      { key: 'crm.konnect', label: 'Konnect Module' },
      { key: 'crm.automations', label: 'Automations' },
      { key: 'crm.export', label: 'Export CRM Data' },
    ]
  },
  {
    module: 'reports',
    label: 'Reports',
    icon: 'M18 20V10M12 20V4M6 20v-6',
    color: '#f97316',
    permissions: [
      { key: 'reports.view', label: 'View Reports' },
      { key: 'reports.export', label: 'Export Reports' },
    ]
  },
  {
    module: 'accounting',
    label: 'Accounting',
    icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z',
    color: '#14b8a6',
    permissions: [
      { key: 'accounting.coa', label: 'Chart of Accounts' },
      { key: 'accounting.export', label: 'Export Accounting Data' },
    ]
  },
  {
    module: 'hrm',
    label: 'HRM',
    icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2',
    color: '#6366f1',
    permissions: [
      { key: 'hrm.view_own', label: 'Self-Service (own profile, payslip, leave)' },
      { key: 'hrm.view', label: 'View HRM (read-only all staff)' },
      { key: 'hrm.view_team', label: 'View Team' },
      { key: 'hrm.view_all', label: 'View All Staff' },
      { key: 'hrm.manage', label: 'Manage HRM (read & write all)' },
      { key: 'hrm.payroll', label: 'Payroll (run & post payroll)' },
      { key: 'hrm.recruit', label: 'Recruitment' },
    ]
  },
  {
    module: 'settings',
    label: 'Settings',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    color: '#64748b',
    permissions: [
      { key: 'settings.view', label: 'View Settings' },
      { key: 'settings.edit', label: 'Edit Settings' },
      { key: 'settings.users', label: 'Manage Users' },
      { key: 'settings.roles', label: 'Manage Roles' },
      { key: 'settings.approvals', label: 'Approval Workflows' },
    ]
  },
]

// Get all permission keys
const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key))

export default function UserManagement({ onNav }: Props) {
  void onNav
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'permissions'>('details')
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    initials: '',
    phone: '',
    is_approver: false,
    permissions: [] as string[],
    // NULL/empty string = unrestricted (all locations).
    // Set = locked to this stock_locations.id.
    allowed_location_id: '' as string,
  })

  // Stock locations for the location-lock dropdown.
  // Loaded once on mount; rarely changes.
  const [locations, setLocations] = useState<StockLocationOption[]>([])

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)

    const [{ data: usersData, error }, { data: locsData }] = await Promise.all([
      supabase.from('users').select('*').order('full_name'),
      // Active locations only — we don't want a deactivated location showing
      // up as a lock target. The dropdown also includes "All locations" for
      // unrestricted users.
      supabase.from('stock_locations').select('id, code, name, branch_code, is_active').eq('is_active', true).order('code'),
    ])

    if (error) {
      console.error('Error loading users:', error)
      alert('Failed to load users: ' + error.message)
      setLoading(false)
      return
    }

    if (usersData) {
      const usersWithPerms = usersData.map((u: any) => ({
        ...u,
        permissions: u.permissions || []
      }))
      setUsers(usersWithPerms)
    }

    if (locsData) setLocations(locsData)

    setLoading(false)
  }

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          u.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = filterStatus === 'all' || 
                          (filterStatus === 'active' && u.is_active) ||
                          (filterStatus === 'inactive' && !u.is_active)
    return matchesSearch && matchesStatus
  })

  const openNewUser = () => {
    setEditingUser(null)
    setFormData({ email: '', full_name: '', initials: '', phone: '', is_approver: false, permissions: ['dashboard.view', 'hrm.view_own'], allowed_location_id: '' })
    setActiveTab('details')
    setExpandedGroups([])
    setShowModal(true)
  }

  const openEditUser = (user: User) => {
    setEditingUser(user)
    setFormData({
      email: user.email,
      full_name: user.full_name,
      initials: user.initials,
      phone: user.phone || '',
      is_approver: user.is_approver,
      permissions: user.permissions,
      allowed_location_id: user.allowed_location_id ?? '',
    })
    setActiveTab('details')
    setExpandedGroups([])
    setShowModal(true)
  }

  const generateInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 3)
  }

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      full_name: name,
      initials: prev.initials || generateInitials(name)
    }))
  }

  const togglePermission = (perm: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm]
    }))
  }

  const toggleGroup = (module: string) => {
    setExpandedGroups(prev => 
      prev.includes(module) ? prev.filter(m => m !== module) : [...prev, module]
    )
  }

  const toggleAllInGroup = (group: typeof PERMISSION_GROUPS[0]) => {
    const groupPerms = group.permissions.map(p => p.key)
    const allSelected = groupPerms.every(p => formData.permissions.includes(p))
    
    setFormData(prev => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter(p => !groupPerms.includes(p))
        : [...new Set([...prev.permissions, ...groupPerms])]
    }))
  }

  const selectAllPermissions = () => {
    setFormData(prev => ({ ...prev, permissions: ALL_PERMISSIONS }))
  }

  const clearAllPermissions = () => {
    setFormData(prev => ({ ...prev, permissions: [] }))
  }

  const getGroupStatus = (group: typeof PERMISSION_GROUPS[0]) => {
    const groupPerms = group.permissions.map(p => p.key)
    const selectedCount = groupPerms.filter(p => formData.permissions.includes(p)).length
    if (selectedCount === 0) return 'none'
    if (selectedCount === groupPerms.length) return 'all'
    return 'partial'
  }

  const saveUser = async () => {
    if (!formData.email || !formData.full_name) {
      alert('Please fill in all required fields')
      return
    }

    // Empty string from the "All locations" option means NULL in the DB.
    // The DB column is a UUID FK to stock_locations(id) and accepts NULL.
    const allowedLocationId = formData.allowed_location_id ? formData.allowed_location_id : null

    if (editingUser) {
      // Update existing user with permissions in the same call
      const { error } = await supabase
        .from('users')
        .update({
          email: formData.email,
          full_name: formData.full_name,
          initials: formData.initials,
          phone: formData.phone || null,
          is_approver: formData.is_approver,
          permissions: formData.permissions,
          allowed_location_id: allowedLocationId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingUser.id)

      if (error) {
        console.error('Error updating user:', error)
        alert('Failed to update user: ' + error.message)
        return
      }
    } else {
      // Create new user with permissions
      const { error } = await supabase
        .from('users')
        .insert({
          id: crypto.randomUUID(),
          email: formData.email,
          full_name: formData.full_name,
          initials: formData.initials,
          phone: formData.phone || null,
          is_approver: formData.is_approver,
          is_active: true,
          permissions: formData.permissions,
          allowed_location_id: allowedLocationId,
        })

      if (error) {
        console.error('Error creating user:', error)
        alert('Failed to create user')
        return
      }
    }

    setShowModal(false)
    loadData()
  }

  const toggleUserStatus = async (user: User) => {
    await supabase
      .from('users')
      .update({ is_active: !user.is_active, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    loadData()
  }

  const deleteUser = async (userId: string) => {
    await supabase.from('users').delete().eq('id', userId)
    setShowDeleteConfirm(null)
    loadData()
  }

  const s = {
    page: { padding: 24, maxWidth: 1400, margin: '0 auto' } as React.CSSProperties,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 } as React.CSSProperties,
    title: { fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, color: 'var(--text)' } as React.CSSProperties,
    subtitle: { fontSize: 13, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,
    btn: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500 } as React.CSSProperties,
    btnPrimary: { background: 'var(--accent)', color: '#000' } as React.CSSProperties,
    toolbar: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' } as React.CSSProperties,
    searchWrap: { position: 'relative', flex: 1, minWidth: 200 } as React.CSSProperties,
    searchIcon: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' } as React.CSSProperties,
    searchInput: { width: '100%', padding: '10px 12px 10px 40px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 } as React.CSSProperties,
    select: { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, minWidth: 140 } as React.CSSProperties,
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse' as const } as React.CSSProperties,
    th: { textAlign: 'left' as const, padding: '14px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    td: { padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 } as React.CSSProperties,
    userCell: { display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
    avatar: (color: string) => ({ width: 36, height: 36, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff' }) as React.CSSProperties,
    userName: { fontWeight: 500, color: 'var(--text)' } as React.CSSProperties,
    userEmail: { fontSize: 11, color: 'var(--text3)' } as React.CSSProperties,
    statusDot: (active: boolean) => ({ width: 8, height: 8, borderRadius: '50%', background: active ? '#10b981' : '#ef4444' }) as React.CSSProperties,
    actionBtn: { padding: 8, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text3)' } as React.CSSProperties,
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 } as React.CSSProperties,
    modalContent: { background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' } as React.CSSProperties,
    modalTitle: { fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, marginBottom: 20 } as React.CSSProperties,
    formGroup: { marginBottom: 16 } as React.CSSProperties,
    label: { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 } as React.CSSProperties,
    input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 } as React.CSSProperties,
    checkbox: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' } as React.CSSProperties,
    modalActions: { display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' } as React.CSSProperties,
    btnGhost: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' } as React.CSSProperties,
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 } as React.CSSProperties,
    statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 } as React.CSSProperties,
    statValue: { fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, color: 'var(--text)' } as React.CSSProperties,
    statLabel: { fontSize: 12, color: 'var(--text3)', marginTop: 4 } as React.CSSProperties,
    tabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
    tab: (active: boolean) => ({ padding: '10px 16px', border: 'none', background: active ? 'var(--accent)' : 'transparent', color: active ? '#000' : 'var(--text2)', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 13, fontWeight: 500 }) as React.CSSProperties,
    permGroup: { border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' } as React.CSSProperties,
    permGroupHeader: (color: string) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: `${color}10`, cursor: 'pointer' }) as React.CSSProperties,
    permGroupTitle: { display: 'flex', alignItems: 'center', gap: 10, fontWeight: 500, fontSize: 13 } as React.CSSProperties,
    permGroupBadge: (status: string) => ({ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: status === 'all' ? '#10b98120' : status === 'partial' ? '#f59e0b20' : 'var(--surface2)', color: status === 'all' ? '#10b981' : status === 'partial' ? '#f59e0b' : 'var(--text3)' }) as React.CSSProperties,
    permList: { padding: '8px 12px', background: 'var(--surface2)' } as React.CSSProperties,
    permItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' } as React.CSSProperties,
    permCheckbox: (checked: boolean) => ({ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, background: checked ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }) as React.CSSProperties,
    permBadge: { padding: '2px 8px', borderRadius: 4, fontSize: 11, background: 'var(--accent)', color: '#000', fontWeight: 500 } as React.CSSProperties,
  }

  const activeCount = users.filter(u => u.is_active).length
  const approverCount = users.filter(u => u.is_approver).length
  const awayCount = users.filter(u => u.is_away).length

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>User Management</div>
          <div style={s.subtitle}>Manage team members and their permissions</div>
        </div>
        <button style={{ ...s.btn, ...s.btnPrimary }} onClick={openNewUser}>
          <Icon name="userPlus" size={16} />
          Add User
        </button>
      </div>

      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statValue}>{users.length}</div>
          <div style={s.statLabel}>Total Users</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statValue, color: '#10b981' }}>{activeCount}</div>
          <div style={s.statLabel}>Active</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statValue, color: '#a855f7' }}>{approverCount}</div>
          <div style={s.statLabel}>Approvers</div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statValue, color: '#f59e0b' }}>{awayCount}</div>
          <div style={s.statLabel}>Away</div>
        </div>
      </div>

      <div style={s.toolbar}>
        <div style={s.searchWrap}>
          <Icon name="search" size={16} style={s.searchIcon as any} />
          <input 
            style={s.searchInput}
            placeholder="Search users..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select style={s.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div style={s.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No users found</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>User</th>
                <th style={s.th}>Permissions</th>
                <th style={s.th}>Location</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Approver</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr 
                  key={user.id} 
                  style={{ 
                    background: !user.is_active ? 'var(--surface2)' : undefined,
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                  onClick={() => openEditUser(user)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = !user.is_active ? 'var(--surface2)' : '')}
                >
                  <td style={s.td}>
                    <div style={s.userCell}>
                      <div style={s.avatar('#3b82f6')}>{user.initials}</div>
                      <div>
                        <div style={s.userName}>{user.full_name}</div>
                        <div style={s.userEmail}>{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={s.td}>
                    <span style={s.permBadge}>{user.permissions.length} permissions</span>
                  </td>
                  <td style={s.td}>
                    {user.allowed_location_id ? (
                      (() => {
                        const loc = locations.find(l => l.id === user.allowed_location_id)
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 4, fontSize: 11, fontFamily: 'var(--mono)', background: '#f59e0b15', color: '#f59e0b', fontWeight: 600 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            {loc ? loc.code : 'Locked'}
                          </span>
                        )
                      })()
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>All locations</span>
                    )}
                  </td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={s.statusDot(user.is_active)} />
                      <span style={{ fontSize: 12, color: user.is_active ? '#10b981' : '#ef4444' }}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </td>
                  <td style={s.td}>
                    {user.is_approver ? (
                      <Icon name="checkCircle" size={18} color="#10b981" />
                    ) : (
                      <span style={{ color: 'var(--text3)' }}>-</span>
                    )}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      <button style={s.actionBtn} onClick={() => openEditUser(user)} title="Edit">
                        <Icon name="edit" size={16} />
                      </button>
                      <button style={s.actionBtn} onClick={() => toggleUserStatus(user)} title={user.is_active ? 'Deactivate' : 'Activate'}>
                        <Icon name={user.is_active ? 'userX' : 'userCheck'} size={16} />
                      </button>
                      <button style={{ ...s.actionBtn, color: '#ef4444' }} onClick={() => setShowDeleteConfirm(user.id)} title="Delete">
                        <Icon name="trash2" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={s.modal} onClick={() => setShowModal(false)}>
          <div style={s.modalContent} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>
              {editingUser ? 'Edit User' : 'Add New User'}
            </div>

            <div style={s.tabs}>
              <button style={s.tab(activeTab === 'details')} onClick={() => setActiveTab('details')}>
                Details
              </button>
              <button style={s.tab(activeTab === 'permissions')} onClick={() => setActiveTab('permissions')}>
                Permissions ({formData.permissions.length})
              </button>
            </div>

            {activeTab === 'details' ? (
              <>
                <div style={s.formGroup}>
                  <label style={s.label}>Full Name *</label>
                  <input 
                    style={s.input}
                    value={formData.full_name}
                    onChange={e => handleNameChange(e.target.value)}
                    placeholder="e.g., Jane Patrick Mwatonoka"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
                  <div style={s.formGroup}>
                    <label style={s.label}>Email *</label>
                    <input 
                      style={s.input}
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="e.g., jane@sokora.app"
                    />
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Initials</label>
                    <input 
                      style={s.input}
                      value={formData.initials}
                      onChange={e => setFormData(prev => ({ ...prev, initials: e.target.value.toUpperCase() }))}
                      placeholder="JPM"
                      maxLength={3}
                    />
                  </div>
                </div>

                <div style={s.formGroup}>
                  <label style={s.label}>Phone</label>
                  <input 
                    style={s.input}
                    value={formData.phone}
                    onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+255 7XX XXX XXX"
                  />
                </div>

                <div style={s.formGroup}>
                  <label style={s.checkbox}>
                    <input 
                      type="checkbox"
                      checked={formData.is_approver}
                      onChange={e => setFormData(prev => ({ ...prev, is_approver: e.target.checked }))}
                    />
                    <span>Can approve requests (discounts, refunds, etc.)</span>
                  </label>
                </div>

                {/* ─── Location lock ────────────────────────────────────────
                    NULL/empty = unrestricted: user can post vouchers and
                    make inventory changes from any location, AND can
                    approve transfer requests from any source location.
                    Set = locked: user can only post vouchers tied to this
                    location. Stock transfers can only originate FROM this
                    location (they can transfer OUT to anywhere, but cannot
                    pull stock IN — for that they must request a transfer).
                    They can still VIEW inventory at every location.
                    ──────────────────────────────────────────────────────── */}
                <div style={s.formGroup}>
                  <label style={s.label}>Location lock</label>
                  <select
                    style={s.input}
                    value={formData.allowed_location_id}
                    onChange={e => setFormData(prev => ({ ...prev, allowed_location_id: e.target.value }))}
                  >
                    <option value="">All locations (unrestricted)</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} — {loc.name}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
                    {formData.allowed_location_id
                      ? 'This user can ONLY post vouchers and adjust stock at the selected location. They can transfer stock OUT to any other location, request transfers IN, and view inventory anywhere — but cannot pull stock from a different location directly.'
                      : 'This user can operate from any location. Use this for managers, super admins, and multi-site staff.'}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button 
                    style={{ ...s.btn, ...s.btnGhost, flex: 1 }} 
                    onClick={selectAllPermissions}
                  >
                    Select All
                  </button>
                  <button 
                    style={{ ...s.btn, ...s.btnGhost, flex: 1 }} 
                    onClick={clearAllPermissions}
                  >
                    Clear All
                  </button>
                </div>

                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {PERMISSION_GROUPS.map(group => {
                    const isExpanded = expandedGroups.includes(group.module)
                    const status = getGroupStatus(group)
                    
                    return (
                      <div key={group.module} style={s.permGroup}>
                        <div style={s.permGroupHeader(group.color)} onClick={() => toggleGroup(group.module)}>
                          <div style={s.permGroupTitle}>
                            <svg width="18" height="18" fill="none" stroke={group.color} strokeWidth="1.8" viewBox="0 0 24 24">
                              <path d={group.icon} />
                            </svg>
                            <span>{group.label}</span>
                            <span style={s.permGroupBadge(status)}>
                              {status === 'all' ? 'All' : status === 'partial' ? 'Some' : 'None'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button 
                              style={{ ...s.btn, padding: '4px 8px', fontSize: 11 }}
                              onClick={e => { e.stopPropagation(); toggleAllInGroup(group) }}
                            >
                              {status === 'all' ? 'Remove All' : 'Add All'}
                            </button>
                            <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={16} color="var(--text3)" />
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div style={s.permList}>
                            {group.permissions.map(perm => {
                              const isChecked = formData.permissions.includes(perm.key)
                              return (
                                <div 
                                  key={perm.key} 
                                  style={s.permItem}
                                  onClick={() => togglePermission(perm.key)}
                                >
                                  <div style={s.permCheckbox(isChecked)}>
                                    {isChecked && <Icon name="check" size={12} color="#000" />}
                                  </div>
                                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{perm.label}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <div style={s.modalActions}>
              <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveUser}>
                <Icon name="check" size={16} />
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={s.modal} onClick={() => setShowDeleteConfirm(null)}>
          <div style={s.modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center' }}>
              <Icon name="alertCircle" size={48} color="#ef4444" style={{ marginBottom: 16 }} />
              <div style={s.modalTitle}>Delete User?</div>
              <p style={{ color: 'var(--text2)', marginBottom: 24 }}>
                This action cannot be undone. The user will lose all access to SOKORA.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowDeleteConfirm(null)}>
                  Cancel
                </button>
                <button 
                  style={{ ...s.btn, background: '#ef4444', color: '#fff' }} 
                  onClick={() => deleteUser(showDeleteConfirm)}
                >
                  Delete User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
