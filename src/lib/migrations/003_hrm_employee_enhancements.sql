-- ============================================================================
-- HRM Employee Enhancements Migration
-- Adds: NIDA number, profile picture, email (for self-service linking),
--        structured emergency contacts (JSONB)
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add new columns to hrm_employees
ALTER TABLE hrm_employees
  ADD COLUMN IF NOT EXISTS nida_number TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profile_picture_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS emergency_contacts JSONB DEFAULT NULL;

-- Comment on columns
COMMENT ON COLUMN hrm_employees.nida_number IS 'Tanzania National ID (NIDA) number';
COMMENT ON COLUMN hrm_employees.profile_picture_url IS 'URL to employee profile picture (Supabase storage)';
COMMENT ON COLUMN hrm_employees.email IS 'Employee email — used to link to system user account for self-service HRM';
COMMENT ON COLUMN hrm_employees.emergency_contacts IS 'Structured emergency contacts array: [{name, relationship, phone, alt_phone, address, email, notes}]';

-- Create index on email for fast lookup during login linking
CREATE INDEX IF NOT EXISTS idx_hrm_employees_email ON hrm_employees(email) WHERE email IS NOT NULL;

-- ============================================================================
-- Migrate existing emergency_contact (plain text) to structured format
-- Only for rows that have the old field set but not the new one
-- ============================================================================
UPDATE hrm_employees
SET emergency_contacts = jsonb_build_array(
  jsonb_build_object(
    'name', COALESCE(split_part(emergency_contact, ' - ', 1), emergency_contact),
    'phone', COALESCE(NULLIF(split_part(emergency_contact, ' - ', 2), ''), ''),
    'relationship', '',
    'address', '',
    'alt_phone', '',
    'email', '',
    'notes', ''
  )
)
WHERE emergency_contact IS NOT NULL
  AND emergency_contact != ''
  AND (emergency_contacts IS NULL);

-- ============================================================================
-- Update HRM permissions in existing users who have hrm.view
-- Give them hrm.view_own as well for backward compatibility
-- ============================================================================
UPDATE users
SET permissions = array_append(permissions, 'hrm.view_own')
WHERE 'hrm.view' = ANY(permissions)
  AND NOT ('hrm.view_own' = ANY(permissions));

-- ============================================================================
-- RLS Policies for self-service access (optional, depends on your setup)
-- If you use RLS, uncomment and adapt these policies:
-- ============================================================================
-- CREATE POLICY "employees_self_read" ON hrm_employees
--   FOR SELECT USING (
--     email = auth.jwt()->>'email'
--     OR EXISTS (
--       SELECT 1 FROM users u
--       WHERE u.email = auth.jwt()->>'email'
--       AND ('hrm.view' = ANY(u.permissions) OR 'hrm.manage' = ANY(u.permissions) OR array_length(u.permissions, 1) >= 40)
--     )
--   );

SELECT 'Migration 003_hrm_employee_enhancements completed successfully' AS result;
