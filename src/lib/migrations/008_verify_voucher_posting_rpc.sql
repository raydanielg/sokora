-- ════════════════════════════════════════════════════════════════════════════
-- 008_verify_voucher_posting_rpc.sql
-- Server-side voucher integrity check.
--
-- Why this exists:
--   The voucher post() functions in the app do 4-6 sequential writes
--   (voucher row, journal header, journal lines, voucher lines, stock
--   deduction, item ledger entry) without a transaction wrapper. If any
--   of them fails silently — e.g. postLedgerEntry returns {success:false}
--   instead of throwing — the toast still says "posted" but the books are
--   inconsistent. This RPC checks all six landing zones for a given ref
--   and reports pass/fail per category, so the app can show a "Verify"
--   button that catches drift the moment it happens.
--
-- Returns JSONB shaped like:
--   {
--     "ref": "IU-10-0008",
--     "voucher_type": "internal_use",
--     "voucher_exists": true,
--     "voucher_status": "posted",
--     "expected_journal": true,
--     "journal_exists": true,
--     "journal_balanced": true,
--     "total_debit": 11000.00,
--     "total_credit": 11000.00,
--     "imbalance": 0.00,
--     "expected_voucher_lines": true,
--     "voucher_lines_count": 1,
--     "expected_item_ledger": true,
--     "item_ledger_count": 1,
--     "lines_match_ledger": true,
--     "overall_pass": true,
--     "issues": []
--   }
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION verify_voucher_posting(p_ref TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_voucher              RECORD;
  v_journal_id           UUID;
  v_total_debit          NUMERIC := 0;
  v_total_credit         NUMERIC := 0;
  v_voucher_lines_count  INTEGER := 0;
  v_item_ledger_count    INTEGER := 0;
  v_journal_exists       BOOLEAN := FALSE;
  v_expected_journal     BOOLEAN := TRUE;   -- most vouchers post a journal
  v_expected_vlines      BOOLEAN := FALSE;  -- only stock/sale-touching ones
  v_expected_ledger      BOOLEAN := FALSE;  -- only stock-touching ones
  v_journal_balanced     BOOLEAN := FALSE;
  v_lines_match_ledger   BOOLEAN := TRUE;
  v_issues               JSONB := '[]'::JSONB;
  v_overall_pass         BOOLEAN := TRUE;
BEGIN
  -- ─── 1. Find the voucher ────────────────────────────────────────────────
  SELECT id, type, status, total_amount, journal_id, posting_date, ref
    INTO v_voucher
    FROM vouchers
   WHERE ref = p_ref
   LIMIT 1;

  IF v_voucher.id IS NULL THEN
    RETURN jsonb_build_object(
      'ref', p_ref,
      'voucher_exists', FALSE,
      'overall_pass', FALSE,
      'issues', jsonb_build_array('Voucher with this ref does not exist')
    );
  END IF;

  v_journal_id := v_voucher.journal_id;

  -- ─── 2. Decide what this voucher type SHOULD have written ──────────────
  -- Three groups:
  --   A. Stock-touching: voucher + journal + voucher_lines + item_ledger
  --   B. Sales-touching (no stock): voucher + journal + voucher_lines
  --   C. Pure financial: voucher + journal only (no lines, no ledger)
  --   D. Document-only: voucher only, no journal (proforma, purchase_order)
  CASE v_voucher.type
    -- A. Stock-touching
    WHEN 'cash_sale', 'sales_invoice', 'sales_return',
         'grn', 'purchase', 'purchase_invoice', 'purchase_return',
         'opening_stock', 'stock_adjustment', 'stock_transfer',
         'internal_use', 'credit_note' THEN
      v_expected_vlines := TRUE;
      v_expected_ledger := TRUE;

    -- B. No-stock document with lines (just sales/credit/debit document)
    WHEN 'debit_note' THEN
      v_expected_vlines := TRUE;
      v_expected_ledger := FALSE;

    -- C. Pure financial — journal only
    WHEN 'cash_payment', 'cash_receipt', 'bank_transfer',
         'contra', 'petty_cash', 'journal_entry' THEN
      v_expected_vlines := FALSE;
      v_expected_ledger := FALSE;

    -- D. Document-only (no GL impact yet)
    WHEN 'proforma', 'purchase_order' THEN
      v_expected_journal := FALSE;
      v_expected_vlines := TRUE;
      v_expected_ledger := FALSE;

    -- Unknown type — be conservative, expect everything
    ELSE
      v_expected_vlines := TRUE;
      v_expected_ledger := TRUE;
  END CASE;

  -- ─── 3. Journal check ──────────────────────────────────────────────────
  IF v_expected_journal THEN
    -- Look up by source_ref OR via the voucher's journal_id link
    SELECT id INTO v_journal_id
      FROM journals
     WHERE source_ref = p_ref OR id = v_voucher.journal_id
     LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
      v_journal_exists := TRUE;

      SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
        INTO v_total_debit, v_total_credit
        FROM journal_lines
       WHERE journal_id = v_journal_id;

      v_journal_balanced := (v_total_debit = v_total_credit) AND v_total_debit > 0;

      IF NOT v_journal_balanced THEN
        v_issues := v_issues || jsonb_build_array(
          format('Journal not balanced: Dr=%s Cr=%s diff=%s',
                 v_total_debit, v_total_credit, v_total_debit - v_total_credit)
        );
        v_overall_pass := FALSE;
      END IF;

      -- Voucher.journal_id should point to this journal
      IF v_voucher.journal_id IS NULL THEN
        v_issues := v_issues || jsonb_build_array(
          'Voucher.journal_id is NULL but journal exists for this ref'
        );
        v_overall_pass := FALSE;
      ELSIF v_voucher.journal_id <> v_journal_id THEN
        v_issues := v_issues || jsonb_build_array(
          'Voucher.journal_id does not match the journal found by source_ref'
        );
        v_overall_pass := FALSE;
      END IF;
    ELSE
      v_issues := v_issues || jsonb_build_array(
        'Expected a journal entry for this voucher type but none found'
      );
      v_overall_pass := FALSE;
    END IF;
  END IF;

  -- ─── 4. Voucher lines check ────────────────────────────────────────────
  IF v_expected_vlines THEN
    SELECT COUNT(*) INTO v_voucher_lines_count
      FROM voucher_lines
     WHERE voucher_id = v_voucher.id;

    IF v_voucher_lines_count = 0 THEN
      v_issues := v_issues || jsonb_build_array(
        'Expected voucher_lines but none found'
      );
      v_overall_pass := FALSE;
    END IF;
  END IF;

  -- ─── 5. Item ledger check ──────────────────────────────────────────────
  IF v_expected_ledger THEN
    SELECT COUNT(*) INTO v_item_ledger_count
      FROM item_ledger_entries
     WHERE document_ref = p_ref;

    IF v_item_ledger_count = 0 THEN
      v_issues := v_issues || jsonb_build_array(
        'Expected item_ledger_entries but none found — stock movement was lost'
      );
      v_overall_pass := FALSE;
    ELSIF v_item_ledger_count <> v_voucher_lines_count THEN
      v_lines_match_ledger := FALSE;
      v_issues := v_issues || jsonb_build_array(
        format('voucher_lines (%s) does not match item_ledger_entries (%s) — partial stock failure',
               v_voucher_lines_count, v_item_ledger_count)
      );
      v_overall_pass := FALSE;
    END IF;
  END IF;

  -- ─── 6. Status sanity check ────────────────────────────────────────────
  IF v_voucher.status NOT IN ('posted', 'converted', 'shipped') THEN
    -- pending_approval, draft, voided, cancelled all fail "is this live"
    v_issues := v_issues || jsonb_build_array(
      format('Voucher status is %s (expected posted/converted/shipped for a live voucher)', v_voucher.status)
    );
    -- Don't mark overall_pass = false — a pending_approval voucher is
    -- correctly NOT supposed to have journal/ledger entries. Just flag it.
  END IF;

  -- ─── 7. Return the verdict ─────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ref',                    p_ref,
    'voucher_type',           v_voucher.type,
    'voucher_exists',         TRUE,
    'voucher_status',         v_voucher.status,
    'voucher_total',          v_voucher.total_amount,
    'posting_date',           v_voucher.posting_date,
    'expected_journal',       v_expected_journal,
    'journal_exists',         v_journal_exists,
    'journal_balanced',       v_journal_balanced,
    'total_debit',            v_total_debit,
    'total_credit',           v_total_credit,
    'imbalance',              v_total_debit - v_total_credit,
    'expected_voucher_lines', v_expected_vlines,
    'voucher_lines_count',    v_voucher_lines_count,
    'expected_item_ledger',   v_expected_ledger,
    'item_ledger_count',      v_item_ledger_count,
    'lines_match_ledger',     v_lines_match_ledger,
    'overall_pass',           v_overall_pass,
    'issues',                 v_issues
  );
END $$;

-- Allow the authenticated role to call it
GRANT EXECUTE ON FUNCTION verify_voucher_posting(TEXT) TO authenticated;

-- ─── Sanity check ──────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'verify_voucher_posting RPC installed';
END $$;
