-- ════════════════════════════════════════════════════════════════════════════
-- 005_location_locking.sql
-- Per-user location binding + inter-location stock transfer requests.
--
-- What this creates:
--   1. users.allowed_location_id — single-location lock (NULL = all locations)
--   2. stock_transfer_requests   — request rows that wait for a user at the
--                                  source location (or a super admin) to
--                                  approve before stock actually moves
--   3. RPC approve_transfer_request — atomic execution: validates stock,
--                                  posts the journal, updates product_locations,
--                                  marks the request executed, all-or-nothing
--   4. RPC reject_transfer_request
--   5. RPC cancel_transfer_request — only the original requester can cancel
--
-- Behaviour summary:
--   • A user with allowed_location_id = NULL can post any voucher from any
--     location. (Super admins, managers, multi-site staff.)
--   • A user with allowed_location_id set CAN:
--       - post sales/purchases/adjustments from that location only
--       - initiate a stock_transfer FROM that location TO any other location
--       - request a stock_transfer FROM another location TO their location
--       - view inventory summaries from any location (read-only)
--   • A user with allowed_location_id set CANNOT:
--       - post any voucher tied to a different location
--       - initiate a stock_transfer FROM a different source location
--
-- Idempotent: safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. users.allowed_location_id ──────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS allowed_location_id UUID REFERENCES stock_locations(id) ON DELETE SET NULL;

COMMENT ON COLUMN users.allowed_location_id IS
  'NULL = user can operate from any location. Set = user is locked to this single location for vouchers and inventory changes.';

CREATE INDEX IF NOT EXISTS idx_users_allowed_location ON users(allowed_location_id);

-- ─── 2. stock_transfer_requests ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_transfer_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                 TEXT NOT NULL UNIQUE,
  requested_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_location_id    UUID NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  to_location_id      UUID NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  status              TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','rejected','executed','cancelled')),
  reason              TEXT,
  notes               TEXT,
  -- Lines snapshot: [{productId, productName, qty, cost}, ...]
  -- Stored as JSONB so we can validate/replay at approval time without joins.
  lines               JSONB NOT NULL,
  total_value         NUMERIC NOT NULL DEFAULT 0,
  approved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  rejected_reason     TEXT,
  -- The actual stock_transfer voucher row created when a request is approved.
  voucher_id          UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  journal_id          UUID REFERENCES journals(id) ON DELETE SET NULL,
  execution_error     TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Block self-routing — same loc both sides makes no sense
  CONSTRAINT diff_locations CHECK (from_location_id <> to_location_id)
);

CREATE INDEX IF NOT EXISTS idx_str_status ON stock_transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_str_from_loc ON stock_transfer_requests(from_location_id);
CREATE INDEX IF NOT EXISTS idx_str_to_loc ON stock_transfer_requests(to_location_id);
CREATE INDEX IF NOT EXISTS idx_str_requested_by ON stock_transfer_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_str_requested_at ON stock_transfer_requests(requested_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION str_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_str_touch ON stock_transfer_requests;
CREATE TRIGGER trg_str_touch
  BEFORE UPDATE ON stock_transfer_requests
  FOR EACH ROW EXECUTE FUNCTION str_touch_updated_at();

-- ─── 3. RPC: approve_transfer_request ──────────────────────────────────────
-- Atomically:
--   • Validates the request is still pending
--   • Validates the approver is at the source location OR is a super admin
--     (super admin = has 40+ permissions; we use the same heuristic as useAuth)
--   • Validates stock is still available at source for every line
--   • Inserts the journal + journal_lines (stock value transfer between loc accounts is
--     intentionally NOT created here — total stock value is unchanged, mirroring
--     the existing StockTransfer.tsx behaviour which writes a memo journal only)
--   • Inserts the voucher row
--   • Inserts item_ledger_entries (transfer_out + transfer_in per line)
--   • Updates product_locations for both sides
--   • Marks the request executed and links voucher_id + journal_id
--   • Returns { success, voucher_id, ref, error }
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION approve_transfer_request(
  p_request_id UUID,
  p_approver_id UUID,
  p_comment TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_request           stock_transfer_requests%ROWTYPE;
  v_approver          users%ROWTYPE;
  v_from_loc          stock_locations%ROWTYPE;
  v_to_loc            stock_locations%ROWTYPE;
  v_line              JSONB;
  v_product_id        UUID;
  v_qty               NUMERIC;
  v_cost              NUMERIC;
  v_available         NUMERIC;
  v_journal_id        UUID;
  v_voucher_id        UUID;
  v_voucher_ref       TEXT;
  v_total_value       NUMERIC := 0;
  v_is_super_admin    BOOLEAN;
  v_can_approve       BOOLEAN;
  v_today             DATE := CURRENT_DATE;
BEGIN
  -- Lock the request row to prevent double-approval
  SELECT * INTO v_request
    FROM stock_transfer_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF v_request.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is ' || v_request.status || ', cannot approve');
  END IF;

  -- Block self-approval
  IF v_request.requested_by = p_approver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot approve your own request');
  END IF;

  -- Load approver
  SELECT * INTO v_approver FROM users WHERE id = p_approver_id;
  IF v_approver.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approver not found');
  END IF;
  IF NOT v_approver.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approver account is not active');
  END IF;

  -- Authorization rule:
  --   approver must be at the source location, OR a super admin
  --   (super admin = 40+ permissions, same heuristic as the frontend useAuth.isSuperAdmin)
  v_is_super_admin := COALESCE(jsonb_array_length(to_jsonb(v_approver.permissions)), 0) >= 40;

  v_can_approve :=
    v_is_super_admin
    OR v_approver.allowed_location_id IS NULL  -- unrestricted users count as approvers everywhere
    OR v_approver.allowed_location_id = v_request.from_location_id;

  IF NOT v_can_approve THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only a user assigned to the source location or a super admin can approve this request'
    );
  END IF;

  -- Load locations
  SELECT * INTO v_from_loc FROM stock_locations WHERE id = v_request.from_location_id;
  SELECT * INTO v_to_loc   FROM stock_locations WHERE id = v_request.to_location_id;

  -- Validate stock availability at source for every line
  FOR v_line IN SELECT jsonb_array_elements(v_request.lines)
  LOOP
    v_product_id := (v_line->>'productId')::UUID;
    v_qty        := (v_line->>'qty')::NUMERIC;
    v_cost       := COALESCE((v_line->>'cost')::NUMERIC, 0);
    v_total_value := v_total_value + (v_qty * v_cost);

    SELECT COALESCE(qty_on_hand, 0) INTO v_available
      FROM product_locations
      WHERE product_id = v_product_id
        AND location_id = v_from_loc.id;

    IF v_available IS NULL OR v_available < v_qty THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Insufficient stock at ' || v_from_loc.code || ' for one or more lines (request will be left pending)'
      );
    END IF;
  END LOOP;

  -- Generate a stock_transfer voucher ref (STP series). We just append the
  -- request ref so the trail is obvious in registers.
  v_voucher_ref := 'STP-' || v_request.ref;

  -- Insert journal (memo only — total value unchanged across locations)
  INSERT INTO journals (ref, posting_date, description, journal_type, source_type, source_ref, posted_by, status)
  VALUES (
    'JV-' || v_voucher_ref,
    v_today,
    'Stock Transfer (request) — ' || v_from_loc.code || ' — ' || v_from_loc.name ||
      ' → ' || v_to_loc.code || ' — ' || v_to_loc.name || ' — ' || v_voucher_ref,
    'stock_transfer',
    'stock_transfer',
    v_voucher_ref,
    v_approver.full_name,
    'posted'
  )
  RETURNING id INTO v_journal_id;

  -- Insert voucher
  INSERT INTO vouchers (ref, type, posting_date, description, total_amount, status, journal_id, notes, posted_by)
  VALUES (
    v_voucher_ref,
    'stock_transfer',
    v_today,
    'Stock Transfer — ' || v_from_loc.code || ' — ' || v_from_loc.name ||
      ' → ' || v_to_loc.code || ' — ' || v_to_loc.name,
    v_total_value,
    'posted',
    v_journal_id,
    v_from_loc.code || ' — ' || v_from_loc.name || ' → ' || v_to_loc.code || ' — ' || v_to_loc.name ||
      ' · request ' || v_request.ref ||
      CASE WHEN v_request.notes IS NOT NULL AND length(v_request.notes) > 0 THEN ' · ' || v_request.notes ELSE '' END,
    v_approver.full_name
  )
  RETURNING id INTO v_voucher_id;

  -- Per-line: ledger entries + product_locations updates
  FOR v_line IN SELECT jsonb_array_elements(v_request.lines)
  LOOP
    v_product_id := (v_line->>'productId')::UUID;
    v_qty        := (v_line->>'qty')::NUMERIC;
    v_cost       := COALESCE((v_line->>'cost')::NUMERIC, 0);

    -- transfer_out at source
    INSERT INTO item_ledger_entries (product_id, entry_type, document_type, document_ref, posting_date, qty, cost_amount, location_id)
    VALUES (v_product_id, 'transfer_out', 'stock_transfer', v_voucher_ref, v_today, -v_qty, v_cost * v_qty, v_from_loc.id);

    -- transfer_in at destination
    INSERT INTO item_ledger_entries (product_id, entry_type, document_type, document_ref, posting_date, qty, cost_amount, location_id)
    VALUES (v_product_id, 'transfer_in',  'stock_transfer', v_voucher_ref, v_today,  v_qty, v_cost * v_qty, v_to_loc.id);

    -- decrement source
    UPDATE product_locations
       SET qty_on_hand = qty_on_hand - v_qty,
           last_updated = NOW()
     WHERE product_id = v_product_id AND location_id = v_from_loc.id;

    -- upsert destination
    INSERT INTO product_locations (product_id, location_id, location_code, qty_on_hand, last_updated)
    VALUES (v_product_id, v_to_loc.id, v_to_loc.code, v_qty, NOW())
    ON CONFLICT (product_id, location_id) DO UPDATE
      SET qty_on_hand = product_locations.qty_on_hand + EXCLUDED.qty_on_hand,
          last_updated = NOW();
  END LOOP;

  -- Mark request executed
  UPDATE stock_transfer_requests
     SET status = 'executed',
         approved_by = p_approver_id,
         approved_at = NOW(),
         voucher_id = v_voucher_id,
         journal_id = v_journal_id,
         total_value = v_total_value
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'voucher_id', v_voucher_id,
    'voucher_ref', v_voucher_ref,
    'request_id', p_request_id
  );
EXCEPTION WHEN OTHERS THEN
  -- Save the error string and re-raise so the transaction rolls back cleanly
  UPDATE stock_transfer_requests
     SET execution_error = SQLERRM
   WHERE id = p_request_id;
  RAISE;
END;
$$ LANGUAGE plpgsql;

-- ─── 4. RPC: reject_transfer_request ──────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_transfer_request(
  p_request_id UUID,
  p_approver_id UUID,
  p_reason TEXT
) RETURNS JSONB AS $$
DECLARE
  v_request stock_transfer_requests%ROWTYPE;
  v_approver users%ROWTYPE;
  v_is_super_admin BOOLEAN;
  v_can_reject BOOLEAN;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
  END IF;

  SELECT * INTO v_request
    FROM stock_transfer_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF v_request.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is ' || v_request.status || ', cannot reject');
  END IF;

  SELECT * INTO v_approver FROM users WHERE id = p_approver_id;
  IF v_approver.id IS NULL OR NOT v_approver.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approver account is not valid');
  END IF;

  v_is_super_admin := COALESCE(jsonb_array_length(to_jsonb(v_approver.permissions)), 0) >= 40;
  v_can_reject :=
    v_is_super_admin
    OR v_approver.allowed_location_id IS NULL
    OR v_approver.allowed_location_id = v_request.from_location_id;

  IF NOT v_can_reject THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorised to reject this request');
  END IF;

  UPDATE stock_transfer_requests
     SET status = 'rejected',
         approved_by = p_approver_id,
         approved_at = NOW(),
         rejected_reason = p_reason
   WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
END;
$$ LANGUAGE plpgsql;

-- ─── 5. RPC: cancel_transfer_request ──────────────────────────────────────
-- Only the requester can cancel, and only while pending.
CREATE OR REPLACE FUNCTION cancel_transfer_request(
  p_request_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_request stock_transfer_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
    FROM stock_transfer_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF v_request.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_request.requested_by <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the requester can cancel');
  END IF;
  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel a ' || v_request.status || ' request');
  END IF;

  UPDATE stock_transfer_requests
     SET status = 'cancelled'
   WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
END;
$$ LANGUAGE plpgsql;

-- ─── 6. Convenience view: pending counts for a user ───────────────────────
-- Used by the sidebar badge.
CREATE OR REPLACE VIEW pending_transfer_requests_for_approver AS
SELECT
  u.id AS approver_id,
  COUNT(r.id) AS pending_count
FROM users u
LEFT JOIN stock_transfer_requests r
       ON r.status = 'pending'
      AND r.requested_by <> u.id
      AND (
        -- super admin (40+ permissions) sees all pending
        COALESCE(jsonb_array_length(to_jsonb(u.permissions)), 0) >= 40
        -- unrestricted users (NULL allowed_location) see all
        OR u.allowed_location_id IS NULL
        -- locked users see requests where they are at the source
        OR u.allowed_location_id = r.from_location_id
      )
WHERE u.is_active
GROUP BY u.id;

-- ════════════════════════════════════════════════════════════════════════════
-- Notes for Joe:
--   • After running this migration, set users.allowed_location_id for the
--     cashier and store attendant accounts via UserManagement, or directly:
--       UPDATE users SET allowed_location_id =
--         (SELECT id FROM stock_locations WHERE code = '1001')
--       WHERE email = 'lilian@malkiawellness.co.tz';
--   • Super admins (40+ permissions) and users with NULL allowed_location_id
--     can post from any location and approve any request.
--   • The frontend reads users.allowed_location_id via useAuth.User.
-- ════════════════════════════════════════════════════════════════════════════
