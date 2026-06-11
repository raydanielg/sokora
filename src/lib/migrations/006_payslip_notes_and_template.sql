-- ════════════════════════════════════════════════════════════════════════════
-- 006_payslip_notes_and_template.sql
-- Adds:
--   1. hrm_payroll_lines.notes — per-employee, per-period note rendered on the
--      payslip PDF. HR can use this for things like "End-of-quarter bonus
--      adjustment" or "Includes back-pay from Feb leave".
--
-- The payslip TEMPLATE config (logo, colors, toggles) is stored as a JSON
-- value under key 'payslip_template' in the existing `system_settings` table —
-- no new table needed for that. See lib/payslipTemplate.ts for the shape.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE hrm_payroll_lines
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN hrm_payroll_lines.notes IS
  'Optional per-employee note for this period. Rendered on the payslip PDF when present.';
