-- Support proforma invoice voucher type
-- Run in Supabase SQL Editor

-- The vouchers table uses a 'type' text column so no migration needed
-- Just verify the table accepts any type string

-- Add index on type + ref for faster ref counting
CREATE INDEX IF NOT EXISTS idx_vouchers_type_ref ON vouchers(type, ref);

-- Verify existing vouchers have correct type values
SELECT type, COUNT(*) as count 
FROM vouchers 
GROUP BY type 
ORDER BY count DESC;
