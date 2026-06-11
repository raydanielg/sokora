# Payslip Fix + Redesign

This patch does three things:

1. **Fixes the "Failed to load jsPDF" error** by bundling jsPDF as an npm dependency. The previous CDN-fetch approach was being blocked by ad blockers and Vercel CSP. Bundling removes that failure mode entirely.
2. **Redesigns the payslip PDF** with the Malkia Maternity voice — deep teal/violet palette, "Reimagining Motherhood" tagline, soft and human layout, two-column earnings/deductions, year-to-date strip, optional employer-cost / advance / signature / per-employee notes sections.
3. **Adds a Payslip Template settings page** where the super admin can configure: logo URL + size + position + padding, accent + secondary colors, header tagline, footer text, and section toggles. Live preview included.

---

## Apply order

1. **Run the migration** in Supabase SQL Editor:
   ```
   src/lib/migrations/006_payslip_notes_and_template.sql
   ```
   Adds one column: `hrm_payroll_lines.notes`. Idempotent.

2. **Run `npm install`** in your project — `package.json` now lists `jspdf` as a dependency. Vercel re-deploys will pick this up automatically next push.

3. **Drop the rest of the files into your repo**:
   - `src/lib/payslipTemplate.ts` (new — config shape, defaults, loader, logo helpers)
   - `src/pages/hrm/HRMPayslips.tsx` (rewritten)
   - `src/pages/hrm/HRMPayslipTemplate.tsx` (new — settings page)
   - `src/lib/types.ts`, `src/lib/useAuth.ts`, `src/App.tsx`, `src/components/Sidebar.tsx` (route + permission wiring)

4. **First time only — open `HRM → Payroll → Payslips → Template` and configure:**
   - Logo URL (paste your Malkia Maternity logo)
   - Adjust size + position if needed
   - Toggle on what you want shown
   - Click Save

5. **Generate a test PDF** to verify everything looks right.

---

## What was fixed

### "Failed to load jsPDF"

**Root cause:** the previous code injected a `<script>` tag pointing at `https://cdnjs.cloudflare.com/...`. That URL is fine on its own, but in production:
- Vercel's default Content Security Policy can block third-party scripts
- Ad blockers and privacy extensions block cdnjs as a tracking heuristic
- A momentary network hiccup means the whole page state breaks

**Fix:** `import { jsPDF } from 'jspdf'` is now at the top of `HRMPayslips.tsx`. The library is bundled into the page chunk by Vite. There is no runtime fetch, so there is nothing to fail.

The HRMPayslips JS chunk grew from ~10 KB to ~123 KB gzipped because of this. Acceptable tradeoff — HR users only hit this page once per month.

---

## New payslip layout

```
┌──────────────────────────────────────────────────────────────┐
│  [LOGO]  Malkia Wellness Group                  PAYSLIP      │
│         Reimagining Motherhood                  APRIL 2026   │
│                                                 Ref: 202604  │
├──────────────────────────────────────────────────────────────┤
│  ● Lilian Mallya                                             │
│    MWG-0003 · Sales Rep · Sales                              │
│    Bank: NMB · 1234567890                                    │
│    TIN 12345 · NSSF 67890                                    │
├──────────────────────────────────────┬───────────────────────┤
│  EARNINGS                             │  DEDUCTIONS           │
│  Basic Salary           500,000       │  PAYE         30,000  │
│  Allowances              50,000       │  NSSF         50,000  │
│  ──────────────────────────────       │  ─────────────────    │
│  Total Earnings         550,000       │  Total       80,000   │
├──────────────────────────────────────┴───────────────────────┤
│  ░░░  NET PAY                            TZS 470,000  ░░░    │
│       for April 2026                                         │
├──────────────────────────────────────────────────────────────┤
│  YEAR-TO-DATE since 2026/04                                  │
│   Gross 1.65M    PAYE 90K    NSSF 150K    Net 1.4M           │
├──────────────────────────────────────────────────────────────┤
│  EMPLOYER CONTRIBUTIONS                                      │
│  NSSF Employer 50,000  ·  SDL 22,500                         │
├──────────────────────────────────────────────────────────────┤
│  NOTE FROM HR                                                │
│  Includes back-pay from February leave adjustment.           │
├──────────────────────────────────────────────────────────────┤
│  ─────────                       ─────────                   │
│  Prepared by                     Received by employee        │
├──────────────────────────────────────────────────────────────┤
│              Reimagining Motherhood                          │
│   This is a computer-generated payslip and does not...       │
└──────────────────────────────────────────────────────────────┘
```

Every section between the net-pay bar and the footer is **toggleable** via the template settings.

---

## YTD math

The year-to-date strip queries `hrm_payroll_lines` for the same employee, joined to `hrm_payroll_runs` filtered by period. Tanzania's fiscal year is April → March, so:

- Period 2026-08 → FY started 2026-04 → YTD covers May, June, July, August
- Period 2026-02 → FY started 2025-04 → YTD covers all months from April 2025 to February 2026

Computed once per page load, cached in `ytdByEmp`.

---

## Per-employee notes

A new `notes` column on `hrm_payroll_lines` (nullable text). On the Payslips page, each card now has a small textarea — type a note, click Save, and it persists. The note shows up on the PDF in a soft "NOTE FROM HR" box.

Use cases: "Q1 bonus included", "Back-pay from Feb leave", "Final payment — exit settlement", etc.

The note is per-period, so editing March's note doesn't affect April's. Lines without notes simply skip the notes box on the PDF.

---

## Template settings page

`HRM → Payslips → Template` (button in the page header). Self-mode users don't see this button.

**Logo controls:**
- URL (any public PNG/JPG with CORS allowed — e.g., your Vercel `/public` folder, or Supabase Storage with public-read)
- Width in mm (height auto-scales)
- Position: left / center / right
- Padding around the logo

**Brand colors:**
- Accent (default Malkia Maternity teal `#0F766E`)
- Secondary (default Malkia Maternity violet `#7C3AED`)
- Six suggested swatches for quick-pick

**Text:**
- Header tagline (under company name)
- Footer tagline (italic centered)
- Footer fine print (small text below tagline)

**Toggles:**
- Year-to-date strip
- Employer contributions box
- Advance recovery line
- Per-employee notes
- Signature block (off by default)

**Live preview** on the right side updates as you type, mirroring the actual PDF layout.

---

## What's next (not in this patch)

- WhatsApp delivery of the PDF to employees (requires WhatsApp file send API — separate ticket)
- Email delivery
- QR code linking back to a digital payslip view (skipped per your call)
- Bank/payment confirmation block once payroll is auto-paid (skipped per your call)
- Tax computation breakdown (skipped per your call)

Reach me when you want any of those.
