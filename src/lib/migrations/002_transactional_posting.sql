-- ============================================================
-- MIGRATION: Atomic voucher posting (transaction-safe)
--
-- Problem: Frontend makes 3-5 separate Supabase calls to post
--          a voucher (journal → lines → balance updates → voucher).
--          If any call fails mid-way, data is left inconsistent:
--          orphaned journals, balances that don't match entries, etc.
--
-- Solution: A single RPC that wraps the entire posting in one
--           PostgreSQL transaction. If anything fails, everything
--           rolls back automatically.
-- ============================================================

-- Generic journal posting function
-- Inserts journal + journal_lines + updates account balances atomically
CREATE OR REPLACE FUNCTION post_journal_transaction(
  p_ref TEXT,
  p_posting_date DATE,
  p_description TEXT,
  p_journal_type TEXT,
  p_source_type TEXT,
  p_source_ref TEXT,
  p_posted_by TEXT,
  p_branch TEXT DEFAULT NULL,
  p_lines JSONB DEFAULT '[]'::JSONB
  -- p_lines format: [{"account_id":"uuid","description":"text","debit":0,"credit":0}]
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_journal_id UUID;
  v_line JSONB;
  v_line_num INT := 0;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
BEGIN
  -- Validate: lines must balance
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_total_debit := v_total_debit + COALESCE((v_line->>'debit')::NUMERIC, 0);
    v_total_credit := v_total_credit + COALESCE((v_line->>'credit')::NUMERIC, 0);
  END LOOP;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Journal not balanced: debits (%) != credits (%)', v_total_debit, v_total_credit;
  END IF;

  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Journal must have at least 2 lines';
  END IF;

  -- 1. Create journal header
  INSERT INTO journals (ref, posting_date, description, journal_type, source_type, source_ref, posted_by, status, branch)
  VALUES (p_ref, p_posting_date, p_description, p_journal_type, p_source_type, p_source_ref, p_posted_by, 'posted', p_branch)
  RETURNING id INTO v_journal_id;

  -- 2. Insert journal lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_num := v_line_num + 1;
    INSERT INTO journal_lines (journal_id, line_number, account_id, description, debit, credit)
    VALUES (
      v_journal_id,
      v_line_num,
      (v_line->>'account_id')::UUID,
      COALESCE(v_line->>'description', ''),
      COALESCE((v_line->>'debit')::NUMERIC, 0),
      COALESCE((v_line->>'credit')::NUMERIC, 0)
    );

    -- 3. Update account balance for each line
    PERFORM update_account_balance(
      (v_line->>'account_id')::UUID,
      COALESCE((v_line->>'debit')::NUMERIC, 0),
      COALESCE((v_line->>'credit')::NUMERIC, 0)
    );
  END LOOP;

  RETURN v_journal_id;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION post_journal_transaction(TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ============================================================
-- USAGE EXAMPLE (from frontend):
-- 
-- const { data: journalId, error } = await supabase.rpc('post_journal_transaction', {
--   p_ref: 'JV-PAY-10-0042',
--   p_posting_date: '2026-04-07',
--   p_description: 'Cash Payment — Supplier XYZ',
--   p_journal_type: 'cash_payment',
--   p_source_type: 'cash_payment',
--   p_source_ref: 'PAY-10-0042',
--   p_posted_by: 'Jane Doe',
--   p_lines: JSON.stringify([
--     { account_id: 'expense-uuid', description: 'Office supplies', debit: 50000, credit: 0 },
--     { account_id: 'cash-uuid', description: 'Cash paid', debit: 0, credit: 50000 },
--   ])
-- })
--
-- If ANY step fails, the entire transaction rolls back.
-- No orphaned journals. No balance mismatches.
-- ============================================================
