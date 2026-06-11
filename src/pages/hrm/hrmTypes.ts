/**
 * HRM Module — Shared Types & Payroll Engine
 * Tanzania PAYE 2024 bands, optional NSSF, SDL
 */

import type { Page } from '../../lib/types'

export interface HRMProps {
  onNav: (p: Page) => void
  hrmMode?: HRMViewMode
  linkedEmployeeId?: string | null
  canManage?: boolean
}

// ── Emergency Contact (structured) ────────────────────────
export interface EmergencyContact {
  name: string
  relationship: string
  phone: string
  alt_phone?: string
  address?: string
  email?: string
  notes?: string
}

// ── Employee ──────────────────────────────────────────────
export interface Employee {
  id: string
  emp_code: string
  full_name: string
  initials: string
  job_title: string
  department: string
  contract_type: 'full_time' | 'fixed_term' | 'part_time' | 'intern' | 'consultant'
  start_date: string
  end_date: string | null
  gross_salary: number
  whatsapp: string | null
  bank_name: string | null
  bank_account: string | null
  nssf_number: string | null
  nssf_enabled: boolean
  paye_enabled: boolean
  sdl_enabled: boolean
  tin_number: string | null
  nida_number: string | null
  profile_picture_url: string | null
  date_of_birth: string | null
  emergency_contact: string | null          // legacy plain text
  emergency_contacts: EmergencyContact[] | null  // structured
  email: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

// ── HRM View Mode ────────────────────────────────────────
export type HRMViewMode = 'self' | 'company'

// ── Payroll ───────────────────────────────────────────────
export interface PayrollRun {
  id: string
  period: string          // '2025-03'
  status: 'draft' | 'computed' | 'posted'
  journal_ref: string | null
  posted_by: string | null
  posted_at: string | null
  created_at: string
}

export interface PayrollLine {
  id: string
  payroll_run_id: string
  employee_id: string
  gross: number
  allowances: number
  deductions: number
  advance_deduction: number
  paye: number
  nssf_ee: number
  nssf_er: number
  sdl: number
  net_pay: number
  payslip_sent: boolean
  employee?: Employee
}

// ── Leave ─────────────────────────────────────────────────
export interface LeaveRequest {
  id: string
  employee_id: string
  leave_type: 'annual' | 'sick' | 'maternity' | 'paternity' | 'unpaid' | 'emergency'
  start_date: string
  end_date: string
  days: number
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  approved_by: string | null
  approved_at: string | null
  created_at: string
  employee?: Employee
}

export interface LeaveBalance {
  id: string
  employee_id: string
  fiscal_year: string
  annual_entitlement: number
  annual_taken: number
  annual_pending: number
  sick_entitlement: number
  sick_taken: number
  employee?: Employee
}

// ── Attendance ────────────────────────────────────────────
export interface AttendanceEntry {
  id: string
  employee_id: string
  date: string
  clock_in: string | null
  clock_out: string | null
  hours: number | null
  entry_type: 'office' | 'field' | 'remote' | 'consultation' | 'leave' | 'absent'
  status: 'present' | 'absent' | 'on_leave' | 'late'
  notes: string | null
  employee?: Employee
}

// ── Assets ────────────────────────────────────────────────
export interface HRMAsset {
  id: string
  asset_name: string
  asset_tag: string
  employee_id: string | null
  assigned_to_name: string | null
  issued_date: string | null
  condition: 'excellent' | 'good' | 'fair' | 'poor'
  value: number
  status: 'assigned' | 'pool' | 'returned' | 'disposed'
  notes: string | null
  employee?: Employee
}

// ── Letters ───────────────────────────────────────────────
export interface EmployeeLetter {
  id: string
  employee_id: string
  letter_type: string
  issued_date: string
  issued_by: string
  status: 'sent' | 'acknowledged' | 'pending'
  notes: string | null
  employee?: Employee
}

// ── Salary Advance ────────────────────────────────────────
export interface SalaryAdvance {
  id: string
  employee_id: string
  amount: number
  remaining: number
  monthly_deduction: number
  issued_date: string
  status: 'active' | 'cleared'
  notes: string | null
}

// ── Recruitment ───────────────────────────────────────────
export interface JobOpening {
  id: string
  title: string
  department: string
  contract_type: string
  salary_range: string | null
  deadline: string | null
  description: string | null
  status: 'open' | 'closed' | 'filled'
  created_at: string
}

export interface Applicant {
  id: string
  job_opening_id: string
  full_name: string
  phone: string | null
  stage: 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected'
  application_date: string
  interview_date: string | null
  interview_notes: string | null
  score: number | null
  notes: string | null
  job_opening?: JobOpening
}

// ── Performance ───────────────────────────────────────────
export interface Appraisal {
  id: string
  employee_id: string
  period: string
  kpis: { name: string; target: number; actual: number }[]
  overall_score: number | null
  manager_notes: string | null
  status: 'draft' | 'reviewed'
  created_at: string
  employee?: Employee
}

// ── Events ────────────────────────────────────────────────
export interface HRMEvent {
  id: string
  title: string
  event_type: 'team_building' | 'training' | 'retreat' | 'celebration' | 'birthday' | 'town_hall' | 'other'
  event_date: string
  end_date: string | null
  location: string | null
  organizer: string | null
  budget: number
  actual_spend: number
  attendees: string[]
  status: 'planned' | 'confirmed' | 'done' | 'cancelled'
  notes: string | null
}

// ── HR Settings ───────────────────────────────────────────
export interface HRSettings {
  departments: string[]
  nssf_ee_rate: number
  nssf_er_rate: number
  sdl_rate: number
  wcf_rate: number
  annual_leave_ft: number
  annual_leave_contract: number
  sick_leave_ft: number
  sick_leave_contract: number
  maternity_days: number
  paternity_days: number
  auto_birthday_wa: boolean
  birthday_mgr_notify: boolean
  birthday_team_notify: boolean
}

export const DEFAULT_HR_SETTINGS: HRSettings = {
  departments: ['Management', 'Operations', 'Clinical', 'Sales', 'Marketing'],
  nssf_ee_rate: 10,
  nssf_er_rate: 10,
  sdl_rate: 4.5,
  wcf_rate: 0.5,
  annual_leave_ft: 21,
  annual_leave_contract: 14,
  sick_leave_ft: 10,
  sick_leave_contract: 7,
  maternity_days: 84,
  paternity_days: 3,
  auto_birthday_wa: true,
  birthday_mgr_notify: true,
  birthday_team_notify: false,
}

// ── PAYE Calculation (TRA 2024 Monthly Bands) ─────────────
export function computePAYE(monthlyGross: number): { paye: number; band: string } {
  if (monthlyGross <= 270000) return { paye: 0, band: '0%' }

  let paye = 0

  // Band 1: 0 - 270,000 = 0%
  // Band 2: 270,001 - 520,000 = 8%
  if (monthlyGross > 270000) {
    const taxable2 = Math.min(monthlyGross, 520000) - 270000
    paye += taxable2 * 0.08
  }

  // Band 3: 520,001 - 760,000 = 20%
  if (monthlyGross > 520000) {
    const taxable3 = Math.min(monthlyGross, 760000) - 520000
    paye += taxable3 * 0.20
  }

  // Band 4: 760,001 - 1,000,000 = 25%
  if (monthlyGross > 760000) {
    const taxable4 = Math.min(monthlyGross, 1000000) - 760000
    paye += taxable4 * 0.25
  }

  // Band 5: Above 1,000,000 = 30%
  if (monthlyGross > 1000000) {
    const taxable5 = monthlyGross - 1000000
    paye += taxable5 * 0.30
  }

  const topBand = monthlyGross > 1000000 ? '30%' : monthlyGross > 760000 ? '25%' : monthlyGross > 520000 ? '20%' : '8%'
  return { paye: Math.round(paye), band: topBand }
}

// ── Compute full payroll line ─────────────────────────────
export function computePayrollLine(
  gross: number,
  nssfEnabled: boolean,
  nssfEeRate: number,
  nssfErRate: number,
  sdlRate: number,
  allowances: number = 0,
  deductions: number = 0,
  advanceDeduction: number = 0,
  payeEnabled: boolean = true,
  sdlEnabled: boolean = true,
): { paye: number; nssfEe: number; nssfEr: number; sdl: number; net: number; band: string } {
  // NSSF is a pre-tax deduction — PAYE is calculated on gross MINUS NSSF employee contribution
  const nssfEe = nssfEnabled ? Math.round(gross * nssfEeRate / 100) : 0
  const nssfEr = nssfEnabled ? Math.round(gross * nssfErRate / 100) : 0
  const taxableIncome = gross - nssfEe
  const { paye: rawPaye, band } = computePAYE(taxableIncome)
  const paye = payeEnabled ? rawPaye : 0
  const sdl = sdlEnabled ? Math.round(gross * sdlRate / 100) : 0
  const net = gross + allowances - paye - nssfEe - deductions - advanceDeduction
  return { paye, nssfEe, nssfEr, sdl, net, band: payeEnabled ? band : 'Exempt' }
}

// ── Helpers ───────────────────────────────────────────────
export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export const CONTRACT_LABELS: Record<string, string> = {
  full_time: 'Full-time',
  fixed_term: 'Fixed-term',
  part_time: 'Part-time',
  intern: 'Intern',
  consultant: 'Consultant',
}

export const CONTRACT_COLORS: Record<string, string> = {
  full_time: '#22c55e',
  fixed_term: '#f59e0b',
  part_time: '#3b82f6',
  intern: '#a78bfa',
  consultant: '#06b6d4',
}

export const DEPT_COLORS: Record<string, string> = {
  Management: '#6366f1',
  Operations: '#f7a6ad',
  Clinical: '#f59e0b',
  Sales: '#22c55e',
  Marketing: '#3b82f6',
}

export const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual Leave',
  sick: 'Sick Leave',
  maternity: 'Maternity Leave',
  paternity: 'Paternity Leave',
  unpaid: 'Unpaid Leave',
  emergency: 'Emergency Leave',
}

export const EVENT_COLORS: Record<string, string> = {
  team_building: '#6366f1',
  training: '#3b82f6',
  retreat: '#a78bfa',
  celebration: '#f7a6ad',
  birthday: '#f59e0b',
  town_hall: '#06b6d4',
  other: '#85c2be',
}

export const EVENT_LABELS: Record<string, string> = {
  team_building: 'Team Building',
  training: 'Training',
  retreat: 'Retreat',
  celebration: 'Celebration',
  birthday: 'Birthday',
  town_hall: 'Town Hall',
  other: 'Other',
}
