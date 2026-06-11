// ════════════════════════════════════════════════════════════════════════════
// HRMPayslips.tsx
//
// Generates and downloads payslip PDFs. Two big changes from the previous
// version:
//
// 1. jsPDF is now bundled via npm (`import { jsPDF } from 'jspdf'`) instead of
//    being lazy-loaded from cdnjs. The CDN loader was the source of the
//    "Failed to load jsPDF" toast users were seeing — Vercel's CSP and ad
//    blockers occasionally blocked the script tag. Bundling removes that
//    failure mode entirely.
//
// 2. The PDF is redesigned to follow the SOKORA voice — deep teal
//    accent, soft layout, "Reimagining Motherhood" footer. All visual choices
//    are pulled from the payslip_template config in system_settings, so the
//    super admin can tune logo, colors, toggles, and footer text without
//    touching code (see HRMPayslipTemplate page).
//
// New features:
//   • Logo at the top of the header (URL configurable, with size + position)
//   • Year-to-date totals column (gross, PAYE, NSSF, net) — pulled by
//     querying earlier payroll runs in the same fiscal year (April → March)
//   • Per-employee notes — editable on each card, saved to hrm_payroll_lines.notes,
//     printed on the payslip when the toggle is on
//   • Optional signature block, employer-cost section, advance-recovery detail
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { jsPDF } from 'jspdf'
import { supabase, getActiveCompany } from '../../lib/supabase'
import Toast from '../../components/Toast'
import {
  loadPayslipTemplate,
  hexToRgb,
  logoToDataUrl,
  type PayslipTemplate,
} from '../../lib/payslipTemplate'
import type { HRMProps } from './hrmTypes'
import { DEPT_COLORS } from './hrmTypes'

interface PayslipData {
  id: string
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
  notes: string | null
  employee: {
    id: string
    full_name: string
    initials: string
    emp_code: string
    job_title: string
    department: string
    contract_type: string
    bank_name: string | null
    bank_account: string | null
    nssf_number: string | null
    tin_number: string | null
  }
}

// Year-to-date totals — summed from earlier payroll runs in the same FY.
interface YTD { gross: number; paye: number; nssf: number; net: number }

// ─── Fiscal year helpers ─────────────────────────────────────────────────
// Tanzania convention: FY runs April 1 → March 31. So if the period is
// "2026-08", the FY started "2026-04". If period is "2026-02", the FY
// started "2025-04". Used to bound the YTD query.
function fyStartFromPeriod(period: string): string {
  const [yStr, mStr] = period.split('-')
  const y = parseInt(yStr); const m = parseInt(mStr)
  const fyStartYear = m >= 4 ? y : y - 1
  return `${fyStartYear}-04`
}

export default function HRMPayslips({ onNav, hrmMode = 'company', linkedEmployeeId }: HRMProps) {
  const isSelfMode = hrmMode === 'self'
  const [lines, setLines] = useState<PayslipData[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [generating, setGenerating] = useState<string | null>(null)
  // YTD by employee id, computed once per period change.
  const [ytdByEmp, setYtdByEmp] = useState<Record<string, YTD>>({})
  // Notes draft state — a tiny edit buffer keyed by line.id.
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)
  // Cached template + logo data URL — loaded once per page mount, refreshed
  // whenever the user opens the template settings page and comes back.
  const [template, setTemplate] = useState<PayslipTemplate | null>(null)
  const [logoData, setLogoData] = useState<{ dataUrl: string; width: number; height: number } | null>(null)

  useEffect(() => { load() }, [period])
  useEffect(() => { reloadTemplate() }, [])

  const reloadTemplate = useCallback(async () => {
    const t = await loadPayslipTemplate()
    setTemplate(t)
    if (t.logoUrl) {
      const ld = await logoToDataUrl(t.logoUrl)
      setLogoData(ld)
    } else {
      setLogoData(null)
    }
  }, [])

  const load = async () => {
    setLoading(true)
    const { data: runs } = await supabase
      .from('hrm_payroll_runs').select('id').eq('period', period)
      .order('created_at', { ascending: false }).limit(1)

    if (!runs || runs.length === 0) { setLines([]); setYtdByEmp({}); setLoading(false); return }

    let query = supabase.from('hrm_payroll_lines')
      .select('id, gross, allowances, deductions, advance_deduction, paye, nssf_ee, nssf_er, sdl, net_pay, payslip_sent, notes, employee:hrm_employees(id, full_name, initials, emp_code, job_title, department, contract_type, bank_name, bank_account, nssf_number, tin_number)')
      .eq('payroll_run_id', runs[0].id)
    if (isSelfMode && linkedEmployeeId) {
      query = query.eq('employee_id', linkedEmployeeId)
    }
    const { data } = await query
    const slips = (data || []) as unknown as PayslipData[]
    setLines(slips)

    // Initialise the notes draft buffer from the loaded values
    const draft: Record<string, string> = {}
    slips.forEach(s => { draft[s.id] = s.notes || '' })
    setNotesDraft(draft)

    // Compute YTD per employee — only if we have any slips on screen
    if (slips.length > 0) {
      const fyStart = fyStartFromPeriod(period)
      const empIds = slips.map(s => s.employee.id)
      // Bound the query: all payroll lines for this employee where the run
      // period is between fyStart and current period (inclusive).
      const { data: ytdRows } = await supabase
        .from('hrm_payroll_lines')
        .select('employee_id, gross, paye, nssf_ee, net_pay, hrm_payroll_runs!inner(period)')
        .in('employee_id', empIds)
        .gte('hrm_payroll_runs.period', fyStart)
        .lte('hrm_payroll_runs.period', period)

      const acc: Record<string, YTD> = {}
      ;(ytdRows || []).forEach((r: any) => {
        const id = r.employee_id
        if (!acc[id]) acc[id] = { gross: 0, paye: 0, nssf: 0, net: 0 }
        acc[id].gross += r.gross || 0
        acc[id].paye += r.paye || 0
        acc[id].nssf += r.nssf_ee || 0
        acc[id].net += r.net_pay || 0
      })
      setYtdByEmp(acc)
    }
    setLoading(false)
  }

  const fmt = (n: number) => (n || 0).toLocaleString()
  const company = getActiveCompany()

  // ─── Notes editing ────────────────────────────────────────────────
  const saveNote = async (lineId: string) => {
    setSavingNote(lineId)
    const newValue = (notesDraft[lineId] || '').trim() || null
    const { error } = await supabase
      .from('hrm_payroll_lines').update({ notes: newValue }).eq('id', lineId)
    setSavingNote(null)
    if (error) {
      setToast('Failed to save note: ' + error.message); setToastType('error'); return
    }
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, notes: newValue } : l))
    setToast('Note saved'); setToastType('success')
  }

  // ─── PDF GENERATION ───────────────────────────────────────────────
  const generatePayslipPDF = useCallback(async (slip: PayslipData) => {
    if (!template) throw new Error('Template not loaded')

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const emp = slip.employee
    const w = 210
    const periodLabel = new Date(period + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const accent = hexToRgb(template.accentColor)
    const secondary = hexToRgb(template.secondaryColor)
    const dark: [number, number, number] = [30, 30, 30]
    const gray: [number, number, number] = [120, 120, 120]
    const lightBg: [number, number, number] = [248, 250, 252]
    const veryLight: [number, number, number] = [236, 245, 244]
    // Soft tint of accent for the YTD strip — built by lightening accent
    // toward white. Same hue, gentler weight.
    const accentSoft: [number, number, number] = [
      Math.round(accent[0] + (255 - accent[0]) * 0.85),
      Math.round(accent[1] + (255 - accent[1]) * 0.85),
      Math.round(accent[2] + (255 - accent[2]) * 0.85),
    ]

    // ── HEADER ───────────────────────────────────────────────────────
    // A soft 32mm header with the logo on the left/center/right per template,
    // company name + tagline beside it, and a subtle bottom rule. Background
    // is a tinted version of the accent — feels human, not corporate.
    const headerH = 36
    doc.setFillColor(...accentSoft)
    doc.rect(0, 0, w, headerH, 'F')
    // Hairline rule at bottom of header in deep accent
    doc.setDrawColor(...accent); doc.setLineWidth(0.4)
    doc.line(0, headerH, w, headerH)

    // Logo — render it if we have one, else fall back to a small text mark
    let textStartX = 15
    if (logoData) {
      const logoW = template.logoWidthMm
      const logoH = (logoData.height / logoData.width) * logoW
      // Center vertically inside header with logoPaddingMm honoured at top/bottom
      const logoY = Math.max(template.logoPaddingMm, (headerH - logoH) / 2)
      let logoX: number
      if (template.logoPosition === 'center') {
        logoX = (w - logoW) / 2
      } else if (template.logoPosition === 'right') {
        logoX = w - logoW - 15
      } else {
        logoX = 15
      }
      try {
        doc.addImage(logoData.dataUrl, 'PNG', logoX, logoY, logoW, logoH)
      } catch {
        // bad data URL — silently fall back to text-only
      }
      // If logo is on the LEFT, push the text right of it
      if (template.logoPosition === 'left') textStartX = 15 + logoW + 6
    }

    // Company name + tagline
    // We position text differently depending on logo placement so nothing
    // overlaps. With a center logo we put text below it; with left we put
    // text to the right; with right we put text on the left.
    if (template.logoPosition === 'center' && logoData) {
      // Suppress big company name when a logo is centered — the logo IS
      // the brand mark. Just print the tagline below.
      doc.setTextColor(...accent)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      const tagline = template.headerTagline || company.name
      doc.text(tagline, w / 2, headerH - 4, { align: 'center' })
    } else {
      doc.setTextColor(...accent)
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(company.name, textStartX, 16)
      if (template.headerTagline) {
        doc.setFontSize(8.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...secondary)
        doc.text(template.headerTagline, textStartX, 22)
      }
    }

    // Right-side meta (PAYSLIP / period / ref). Skip when right-side logo
    // is in the way.
    if (template.logoPosition !== 'right') {
      doc.setTextColor(...gray)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text('PAYSLIP', w - 15, 13, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...dark)
      doc.setFontSize(11)
      doc.text(periodLabel.toUpperCase(), w - 15, 19, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...gray)
      doc.setFontSize(7.5)
      doc.text(`Ref: PAY-${period.replace('-', '')}`, w - 15, 24, { align: 'right' })
      doc.text(`Issued: ${new Date().toLocaleDateString('en-GB')}`, w - 15, 28, { align: 'right' })
    }

    // ── EMPLOYEE CARD ────────────────────────────────────────────────
    let y = headerH + 10
    doc.setFillColor(...lightBg)
    doc.roundedRect(15, y, w - 30, 30, 3, 3, 'F')
    // Department dot — uses the same colour palette as the on-screen card
    // for visual continuity.
    const deptColor = hexToRgb(DEPT_COLORS[emp.department] || template.accentColor)
    doc.setFillColor(...deptColor)
    doc.circle(22, y + 8, 2, 'F')

    doc.setTextColor(...dark)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(emp.full_name, 27, y + 9)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...gray)
    doc.text(`${emp.emp_code}  ·  ${emp.job_title}  ·  ${emp.department}`, 27, y + 15)
    const bankInfo = [emp.bank_name, emp.bank_account].filter(Boolean).join(' · ') || 'Cash'
    doc.text(`Bank: ${bankInfo}`, 27, y + 21)
    const taxInfo = [
      emp.tin_number ? `TIN ${emp.tin_number}` : null,
      emp.nssf_number ? `NSSF ${emp.nssf_number}` : null,
    ].filter(Boolean).join('  ·  ')
    if (taxInfo) doc.text(taxInfo, 27, y + 26.5)

    y += 38

    // ── EARNINGS / DEDUCTIONS — TWO-COLUMN LAYOUT ───────────────────
    // Two side-by-side blocks, then a unified totals strip below. This
    // is more scannable than the old single-column stack and reads
    // naturally on a 1-page A4.
    const colW = (w - 30 - 6) / 2  // total width minus margins minus 6mm gap
    const leftX = 15
    const rightX = leftX + colW + 6
    const blockY = y

    // Left: EARNINGS
    doc.setTextColor(...accent); doc.setFontSize(9.5); doc.setFont('helvetica', 'bold')
    doc.text('EARNINGS', leftX, blockY)
    doc.setDrawColor(...accent); doc.setLineWidth(0.6)
    doc.line(leftX, blockY + 1.8, leftX + colW, blockY + 1.8)

    let ly = blockY + 8
    const earningsRows: [string, number][] = [['Basic Salary', slip.gross]]
    if (slip.allowances > 0) earningsRows.push(['Allowances', slip.allowances])

    doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark); doc.setFontSize(9.5)
    for (const [label, val] of earningsRows) {
      doc.text(label, leftX, ly)
      doc.setFont('helvetica', 'bold')
      doc.text(val.toLocaleString(), leftX + colW, ly, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      ly += 6.5
    }
    const totalEarnings = slip.gross + slip.allowances
    doc.setDrawColor(...gray); doc.setLineWidth(0.2)
    doc.line(leftX, ly - 2, leftX + colW, ly - 2)
    ly += 1
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent); doc.setFontSize(10)
    doc.text('Total Earnings', leftX, ly + 3)
    doc.text(totalEarnings.toLocaleString(), leftX + colW, ly + 3, { align: 'right' })
    const earningsBlockEnd = ly + 4

    // Right: DEDUCTIONS
    doc.setTextColor(220, 38, 38); doc.setFontSize(9.5); doc.setFont('helvetica', 'bold')
    doc.text('DEDUCTIONS', rightX, blockY)
    doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.6)
    doc.line(rightX, blockY + 1.8, rightX + colW, blockY + 1.8)

    let ry = blockY + 8
    const dedRows: [string, number][] = []
    if (slip.paye > 0) dedRows.push(['PAYE (Income Tax)', slip.paye])
    if (slip.nssf_ee > 0) dedRows.push(['NSSF (Employee 10%)', slip.nssf_ee])
    if (slip.deductions > 0) dedRows.push(['Other Deductions', slip.deductions])
    if (template.showAdvanceDetail && slip.advance_deduction > 0) dedRows.push(['Salary Advance Recovery', slip.advance_deduction])

    doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark); doc.setFontSize(9.5)
    if (dedRows.length === 0) {
      doc.setTextColor(...gray); doc.setFont('helvetica', 'italic')
      doc.text('No deductions this period', rightX, ry)
      ry += 6.5
    } else {
      for (const [label, val] of dedRows) {
        doc.text(label, rightX, ry)
        doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38)
        doc.text(val.toLocaleString(), rightX + colW, ry, { align: 'right' })
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark)
        ry += 6.5
      }
    }
    const totalDed = slip.paye + slip.nssf_ee + slip.deductions + slip.advance_deduction
    doc.setDrawColor(...gray); doc.setLineWidth(0.2)
    doc.line(rightX, ry - 2, rightX + colW, ry - 2)
    ry += 1
    doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38); doc.setFontSize(10)
    doc.text('Total Deductions', rightX, ry + 3)
    doc.text(totalDed.toLocaleString(), rightX + colW, ry + 3, { align: 'right' })
    const dedBlockEnd = ry + 4

    y = Math.max(earningsBlockEnd, dedBlockEnd) + 8

    // ── NET PAY HERO ─────────────────────────────────────────────────
    // Big rounded bar in the accent colour. The number that matters most.
    doc.setFillColor(...accent)
    doc.roundedRect(15, y, w - 30, 22, 4, 4, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('NET PAY', 22, y + 9)
    doc.setFontSize(20); doc.setFont('helvetica', 'bold')
    doc.text(`TZS ${slip.net_pay.toLocaleString()}`, w - 22, y + 14, { align: 'right' })
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
    doc.text(`for ${periodLabel}`, 22, y + 16)

    y += 28

    // ── YEAR-TO-DATE STRIP ──────────────────────────────────────────
    // Soft-tinted strip showing FY-to-date totals. Conditional via template.
    if (template.showYTD) {
      const ytd = ytdByEmp[emp.id] || { gross: slip.gross, paye: slip.paye, nssf: slip.nssf_ee, net: slip.net_pay }
      doc.setFillColor(...accentSoft)
      doc.roundedRect(15, y, w - 30, 18, 3, 3, 'F')
      doc.setTextColor(...accent); doc.setFontSize(8); doc.setFont('helvetica', 'bold')
      doc.text('YEAR-TO-DATE', 22, y + 6)
      const fyStart = fyStartFromPeriod(period).replace('-', '/')
      doc.setTextColor(...gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
      doc.text(`Since ${fyStart}`, 22, y + 11)
      // Four columns: Gross / PAYE / NSSF / Net — equally distributed
      const ytdCols: [string, number][] = [
        ['Gross', ytd.gross],
        ['PAYE', ytd.paye],
        ['NSSF', ytd.nssf],
        ['Net', ytd.net],
      ]
      const colStartX = 65
      const colSpan = (w - 15 - colStartX) / 4
      for (let i = 0; i < ytdCols.length; i++) {
        const cx = colStartX + colSpan * i + colSpan / 2
        const [label, val] = ytdCols[i]
        doc.setTextColor(...gray); doc.setFontSize(7); doc.setFont('helvetica', 'normal')
        doc.text(label, cx, y + 6, { align: 'center' })
        doc.setTextColor(...accent); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
        doc.text(val.toLocaleString(), cx, y + 13, { align: 'center' })
      }
      y += 24
    }

    // ── EMPLOYER COSTS (info) ───────────────────────────────────────
    if (template.showEmployerCosts) {
      const erParts: string[] = []
      if (slip.nssf_er > 0) erParts.push(`NSSF Employer ${slip.nssf_er.toLocaleString()}`)
      if (slip.sdl > 0) erParts.push(`SDL ${slip.sdl.toLocaleString()}`)
      if (erParts.length > 0) {
        doc.setFillColor(...veryLight)
        doc.roundedRect(15, y, w - 30, 9, 2, 2, 'F')
        doc.setTextColor(...secondary); doc.setFontSize(7); doc.setFont('helvetica', 'bold')
        doc.text('EMPLOYER CONTRIBUTIONS', 20, y + 4)
        doc.setTextColor(...gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
        doc.text(erParts.join('  ·  '), 20, y + 7.5)
        doc.setTextColor(...gray); doc.setFontSize(6)
        doc.text('(paid by employer, not deducted from your salary)', w - 20, y + 7.5, { align: 'right' })
        y += 14
      }
    }

    // ── EMPLOYEE NOTES ──────────────────────────────────────────────
    // Free-form per-period note set by HR. Wrapped to 80 chars/line.
    if (template.showEmployeeNotes && slip.notes && slip.notes.trim()) {
      const noteLines = doc.splitTextToSize(slip.notes.trim(), w - 40)
      const noteH = noteLines.length * 4.5 + 10
      doc.setFillColor(...veryLight)
      doc.roundedRect(15, y, w - 30, noteH, 2, 2, 'F')
      doc.setTextColor(...secondary); doc.setFontSize(7); doc.setFont('helvetica', 'bold')
      doc.text('NOTE FROM HR', 20, y + 4.5)
      doc.setTextColor(...dark); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
      doc.text(noteLines, 20, y + 9.5)
      y += noteH + 4
    }

    // ── SIGNATURE BLOCK ─────────────────────────────────────────────
    if (template.showSignatureBlock) {
      const sigY = Math.max(y, 245)
      doc.setDrawColor(...gray); doc.setLineWidth(0.2)
      doc.line(20, sigY + 10, 80, sigY + 10)
      doc.line(w - 80, sigY + 10, w - 20, sigY + 10)
      doc.setTextColor(...gray); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
      doc.text('Prepared by', 20, sigY + 14)
      doc.text('Received by employee', w - 80, sigY + 14)
      y = sigY + 18
    }

    // ── FOOTER ──────────────────────────────────────────────────────
    const footerY = 280
    doc.setDrawColor(...accent); doc.setLineWidth(0.3)
    doc.line(15, footerY, w - 15, footerY)
    if (template.footerTagline) {
      doc.setTextColor(...accent); doc.setFontSize(8); doc.setFont('helvetica', 'italic')
      doc.text(template.footerTagline, w / 2, footerY + 5, { align: 'center' })
    }
    if (template.footerSmallPrint) {
      doc.setTextColor(...gray); doc.setFontSize(6.5); doc.setFont('helvetica', 'normal')
      const smallLines = doc.splitTextToSize(template.footerSmallPrint, w - 30)
      doc.text(smallLines, w / 2, footerY + 9, { align: 'center' })
    }
    doc.setTextColor(...gray); doc.setFontSize(6)
    doc.text(`${company.name} · Generated by SOKORA · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, w / 2, footerY + 14, { align: 'center' })

    return doc
  }, [period, company, template, logoData, ytdByEmp])

  const downloadOne = async (slip: PayslipData) => {
    setGenerating(slip.id)
    try {
      const doc = await generatePayslipPDF(slip)
      doc.save(`Payslip_${slip.employee.emp_code}_${period}.pdf`)
      setToast(`Payslip downloaded for ${slip.employee.full_name}`); setToastType('success')
    } catch (err: any) {
      setToast(err.message || 'PDF generation failed'); setToastType('error')
    }
    setGenerating(null)
  }

  const downloadAll = async () => {
    setGenerating('all')
    try {
      for (const slip of lines) {
        const doc = await generatePayslipPDF(slip)
        doc.save(`Payslip_${slip.employee.emp_code}_${period}.pdf`)
      }
      setToast(`${lines.length} payslips downloaded`); setToastType('success')
    } catch (err: any) {
      setToast(err.message || 'Bulk download failed'); setToastType('error')
    }
    setGenerating(null)
  }

  // Totals
  const totals = lines.reduce((acc, l) => ({
    gross: acc.gross + l.gross, paye: acc.paye + l.paye,
    nssf: acc.nssf + l.nssf_ee, net: acc.net + l.net_pay,
  }), { gross: 0, paye: 0, nssf: 0, net: 0 })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{isSelfMode ? 'My Payslips' : 'Payslips'}</div>
          <div className="page-sub">{isSelfMode ? 'Your monthly payslip PDFs' : 'Auto-generated from payroll run · PDF download per employee or bulk'}</div>
        </div>
        <div className="page-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>
            <span>Month</span>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer', outline: 'none' }} />
          </div>
          {!isSelfMode && (
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('hrm-payslip-template')} title="Configure logo, colors, footer, toggles">
              Template
            </button>
          )}
          {lines.length > 0 && !isSelfMode && (
            <button className="btn btn-primary btn-sm" onClick={downloadAll} disabled={generating === 'all'}>
              {generating === 'all' ? 'Generating...' : `Download All (${lines.length})`}
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      {lines.length > 0 && !isSelfMode && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #6366f1' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#6366f1' }}>{fmt(totals.gross)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Gross</div></div>
          <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #ef4444' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#ef4444' }}>{fmt(totals.paye)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total PAYE</div></div>
          <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid #f59e0b' }}><div style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>{fmt(totals.nssf)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total NSSF</div></div>
          <div className="card" style={{ padding: 14, textAlign: 'center', borderLeft: '3px solid var(--accent)' }}><div style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)' }}>{fmt(totals.net)}</div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Net Pay</div></div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading payslips...</div>
      ) : lines.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>---</div>
          <div style={{ fontSize: 14 }}>No payslip found for {period}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{isSelfMode ? 'Payroll has not been processed for this period yet' : 'Process payroll first in the Payroll page'}</div>
          {!isSelfMode && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => onNav('hrm-payroll')}>Go to Payroll</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {lines.map((l) => {
            const emp = l.employee
            const color = DEPT_COLORS[emp?.department] || '#6366f1'
            const draft = notesDraft[l.id] ?? ''
            const dirty = (l.notes || '') !== draft.trim()
            return (
              <div key={l.id} className="card" style={{ borderTop: `3px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{emp?.full_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{emp?.emp_code} · {emp?.job_title} · {period}</div>
                  </div>
                  <span style={{ fontSize: 10, background: l.payslip_sent ? '#22c55e22' : '#f59e0b22', color: l.payslip_sent ? '#22c55e' : '#f59e0b', padding: '2px 8px', borderRadius: 4 }}>{l.payslip_sent ? 'Sent' : 'Pending'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>Gross</span><span style={{ fontFamily: 'var(--mono)' }}>{fmt(l.gross)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>PAYE</span><span style={{ fontFamily: 'var(--mono)', color: '#ef4444' }}>({fmt(l.paye)})</span></div>
                  {l.nssf_ee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>NSSF</span><span style={{ fontFamily: 'var(--mono)', color: '#ef4444' }}>({fmt(l.nssf_ee)})</span></div>}
                  {l.advance_deduction > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text3)' }}>Advance</span><span style={{ fontFamily: 'var(--mono)', color: '#ef4444' }}>({fmt(l.advance_deduction)})</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid var(--border)', paddingTop: 5 }}><span>Net Pay</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(l.net_pay)}</span></div>
                </div>

                {/* Per-employee note editor — admin only */}
                {!isSelfMode && (
                  <div style={{ marginBottom: 10 }}>
                    <textarea
                      placeholder="Note for this period (optional, shown on PDF)"
                      value={draft}
                      onChange={e => setNotesDraft(prev => ({ ...prev, [l.id]: e.target.value }))}
                      style={{
                        width: '100%', resize: 'vertical', minHeight: 36,
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        color: 'var(--text)', fontSize: 11, padding: 6, borderRadius: 4,
                        fontFamily: 'inherit',
                      }}
                    />
                    {dirty && (
                      <button
                        onClick={() => saveNote(l.id)}
                        disabled={savingNote === l.id}
                        style={{
                          marginTop: 4, padding: '3px 10px', fontSize: 10, fontWeight: 700,
                          borderRadius: 4, border: 'none', background: 'var(--accent)',
                          color: '#fff', cursor: 'pointer',
                        }}
                      >
                        {savingNote === l.id ? 'Saving…' : 'Save note'}
                      </button>
                    )}
                  </div>
                )}

                <button onClick={() => downloadOne(l)} disabled={generating === l.id || !template} style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {generating === l.id ? 'Generating...' : (template ? 'Download PDF' : 'Loading…')}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
