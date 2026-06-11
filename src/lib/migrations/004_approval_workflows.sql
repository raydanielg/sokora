-- ════════════════════════════════════════════════════════════════════════════
-- 004_approval_workflows.sql
-- Approval workflow infrastructure for MalkiaOS vouchers & sensitive actions.
--
-- What this creates:
--   1. approval_types          — catalog of approval-requiring actions
--   2. approval_settings       — rules per type (threshold, approver pool, etc.)
--   3. approval_requests       — one row per submission awaiting decision
--   4. approval_actions        — audit log of every decision/escalation/comment
--   5. approval_type_approvers — many-to-many override: which specific users
--                                can approve each type (optional; if empty the
--                                default rule is "any user with is_approver=true")
--
-- Patterns used:
--   • Snapshot-and-execute — the submitter's full voucher payload is stored
--     as JSONB in approval_requests.payload. When the approver clicks Approve,
--     an RPC posts the voucher from that snapshot so no race with edits.
--   • Vouchers gain a new status: 'pending_approval'. They are NOT written to
--     the journal/ledger until approved. If rejected, the voucher row is
--     deleted (or marked 'rejected' if voucher_retain_on_reject=true).
--   • Self-approval is blocked at the app layer AND via CHECK constraint.
--   • Every decision writes to approval_actions so we have a full audit trail.
--
-- Idempotent: safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. approval_types ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT UNIQUE NOT NULL,          -- machine code e.g. 'internal_use_own'
  name         TEXT NOT NULL,                 -- human label
  category     TEXT NOT NULL,                 -- 'voucher' | 'inventory' | 'finance' | 'hrm' | 'other'
  description  TEXT,
  icon         TEXT,                          -- lucide icon name
  color        TEXT,                          -- hex color for UI
  is_system    BOOLEAN NOT NULL DEFAULT TRUE, -- system types can't be deleted
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_types_category ON approval_types(category);

-- ─── 2. approval_settings ──────────────────────────────────────────────────
-- One row per approval_type. Controls WHEN a request is actually required.
CREATE TABLE IF NOT EXISTS approval_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_type_id      UUID NOT NULL UNIQUE REFERENCES approval_types(id) ON DELETE CASCADE,

  -- Threshold logic
  threshold_type        TEXT NOT NULL DEFAULT 'any'
                         CHECK (threshold_type IN ('any', 'amount', 'percentage', 'quantity', 'days', 'never')),
  threshold_value       NUMERIC,              -- the number to compare against
  threshold_operator    TEXT NOT NULL DEFAULT 'gt'
                         CHECK (threshold_operator IN ('gt', 'gte', 'lt', 'lte', 'eq')),

  -- Execution behaviour
  block_posting         BOOLEAN NOT NULL DEFAULT TRUE,   -- true = block until approved; false = post-then-review
  retain_on_reject      BOOLEAN NOT NULL DEFAULT FALSE,  -- keep the rejected voucher row as history
  escalation_hours      INTEGER NOT NULL DEFAULT 24,     -- hours before escalation flag kicks in
  expiry_hours          INTEGER NOT NULL DEFAULT 72,     -- hours after which request auto-expires

  -- Approver selection
  approver_rule         TEXT NOT NULL DEFAULT 'any_approver'
                         CHECK (approver_rule IN ('any_approver', 'specific_users', 'super_admin_only')),

  -- Bypass: super admins can optionally skip (recorded in audit)
  super_admin_bypass    BOOLEAN NOT NULL DEFAULT TRUE,

  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_settings_type ON approval_settings(approval_type_id);

-- ─── 3. approval_type_approvers (optional specific-users override) ─────────
CREATE TABLE IF NOT EXISTS approval_type_approvers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_type_id  UUID NOT NULL REFERENCES approval_types(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(approval_type_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_type_approvers_type ON approval_type_approvers(approval_type_id);
CREATE INDEX IF NOT EXISTS idx_approval_type_approvers_user ON approval_type_approvers(user_id);

-- ─── 4. approval_requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_type_id      UUID NOT NULL REFERENCES approval_types(id),

  -- What is being approved
  reference_type        TEXT NOT NULL,        -- 'voucher' | 'journal' | 'write_off' | 'hrm_leave' | ...
  reference_id          UUID,                 -- FK into vouchers/journals/etc (nullable if reference is external)
  reference_number      TEXT NOT NULL,        -- human-readable ref (INV-0089, IU-0012, etc.)

  -- Request description
  request_summary       TEXT NOT NULL,
  original_value        NUMERIC,              -- e.g. pre-discount price, or days overdue
  requested_value       NUMERIC,              -- e.g. post-discount price, or refund amount

  -- The full payload to execute if approved (voucher JSON)
  payload               JSONB,

  -- People
  requested_by          UUID NOT NULL REFERENCES users(id),
  assigned_to           UUID REFERENCES users(id),        -- primary approver (for dashboards)

  -- Timing
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,

  -- Status
  status                TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled', 'executed', 'execution_failed')),
  escalated             BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_at          TIMESTAMPTZ,

  -- Resolution
  resolved_by           UUID REFERENCES users(id),
  resolved_at           TIMESTAMPTZ,
  resolution_comment    TEXT,

  -- Execution outcome (after approve)
  executed_at           TIMESTAMPTZ,
  execution_error       TEXT,
  executed_voucher_id   UUID,                 -- the voucher that was ultimately posted

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- No self-approval (CHECK enforced at DB level for defense in depth)
  CONSTRAINT no_self_approval CHECK (resolved_by IS NULL OR resolved_by != requested_by)
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requester ON approval_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_approval_requests_assigned ON approval_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_approval_requests_type ON approval_requests(approval_type_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_ref ON approval_requests(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_expires ON approval_requests(expires_at) WHERE status = 'pending';

-- ─── 5. approval_actions (full audit log) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_actions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  action           TEXT NOT NULL
                    CHECK (action IN ('submitted', 'approved', 'rejected', 'commented', 'escalated', 'expired', 'cancelled', 'executed', 'execution_failed', 'super_admin_bypass')),
  performed_by     UUID REFERENCES users(id),  -- null for system actions (expired)
  comment          TEXT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_actions_request ON approval_actions(request_id);
CREATE INDEX IF NOT EXISTS idx_approval_actions_performer ON approval_actions(performed_by);

-- ─── 6. Add 'pending_approval' to vouchers.status ──────────────────────────
-- The vouchers table uses a CHECK constraint for status. We need to widen it.
DO $$
BEGIN
  -- Drop old check if it exists (name varies by env)
  EXECUTE (
    SELECT 'ALTER TABLE vouchers DROP CONSTRAINT ' || quote_ident(conname)
    FROM pg_constraint
    WHERE conrelid = 'vouchers'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
    LIMIT 1
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE vouchers
  ADD CONSTRAINT vouchers_status_check
  CHECK (status IN ('draft', 'pending_approval', 'posted', 'rejected', 'cancelled', 'voided'));

-- Add pending approval tracking columns on vouchers (for quick joins)
ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS approval_request_id UUID REFERENCES approval_requests(id);

CREATE INDEX IF NOT EXISTS idx_vouchers_pending_approval
  ON vouchers(status) WHERE status = 'pending_approval';

-- ─── 7. Seed approval_types ────────────────────────────────────────────────
-- All the voucher/action types that can require approval in Malkia.
INSERT INTO approval_types (code, name, category, description, icon, color) VALUES
  -- Internal use (the one Joe specifically mentioned)
  ('internal_use',         'Internal Use Voucher',        'voucher',   'Products taken off-shelf for samples, own-use, damage, training',                 'package',       '#00e5a0'),
  ('internal_use_own',     'Internal Use — Own Use',      'voucher',   'Staff/founder personal use — highest scrutiny',                                   'user',          '#d4874a'),
  ('internal_use_damage',  'Internal Use — Damage',       'voucher',   'Write-off of damaged/expired stock',                                              'alertTriangle', '#ef4444'),

  -- Sales
  ('sales_discount',       'Sales Discount',              'voucher',   'Discount on a sale exceeding threshold',                                          'percent',       '#f59e0b'),
  ('sales_return',         'Sales Return',                'voucher',   'Goods returned by customer (refund/credit)',                                      'rotateCcw',     '#ef4444'),
  ('credit_note',          'Credit Note / Refund',        'voucher',   'Customer refund or credit issued',                                                'rotateCcw',     '#ef4444'),
  ('price_override',       'Price Override',              'voucher',   'Cashier selling below list price',                                                'dollarSign',    '#8b5cf6'),

  -- Inventory
  ('stock_adjustment',     'Stock Adjustment',            'inventory', 'Inventory count correction, write-off, or revaluation',                          'package',       '#3b82f6'),
  ('stock_transfer',       'Stock Transfer',              'inventory', 'Moving stock between locations (large qty)',                                     'package',       '#06b6d4'),
  ('opening_stock',        'Opening Stock Entry',         'inventory', 'Initial inventory load (one-time, high scrutiny)',                               'package',       '#8b5cf6'),

  -- Finance / Cash
  ('petty_cash',           'Petty Cash Payment',          'finance',   'Small cash disbursements',                                                        'dollarSign',    '#10b981'),
  ('bank_transfer',        'Bank Transfer',               'finance',   'Inter-bank or inter-account transfer',                                           'creditCard',    '#3b82f6'),
  ('cash_payment',         'Cash Payment',                'finance',   'Supplier cash payment',                                                           'dollarSign',    '#10b981'),
  ('journal_entry',        'Manual Journal Entry',        'finance',   'Manual GL posting (bypass of normal flow)',                                       'fileText',      '#dc2626'),
  ('large_purchase',       'Large Purchase Order',        'finance',   'Purchase order above threshold',                                                  'dollarSign',    '#10b981'),

  -- Receivables / Payables
  ('overdue_invoice',      'Overdue Account Invoice',     'finance',   'Selling on credit to customer with overdue balance',                              'fileText',      '#f97316'),
  ('credit_limit_override','Credit Limit Override',       'finance',   'Sale exceeds customer credit limit',                                              'creditCard',    '#06b6d4'),

  -- System / Destructive
  ('void_transaction',     'Void Transaction',            'other',     'Void a posted voucher (destructive)',                                             'trash2',        '#dc2626'),
  ('backdated_posting',    'Backdated Posting',           'finance',   'Voucher posted with date > N days in past',                                       'clock',         '#f59e0b'),

  -- HRM
  ('hrm_leave',            'HRM Leave Request',           'hrm',       'Employee leave request',                                                          'user',          '#8b5cf6'),
  ('hrm_payroll_run',      'Payroll Run',                 'hrm',       'Monthly payroll execution',                                                       'dollarSign',    '#10b981')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      icon = EXCLUDED.icon,
      color = EXCLUDED.color;

-- ─── 8. Seed approval_settings with sensible defaults ──────────────────────
-- Malkia's defaults: tight on destructive/cash-leaving actions, loose on
-- routine ops. Joe can tune these from the Settings page.
INSERT INTO approval_settings (approval_type_id, threshold_type, threshold_value, threshold_operator, block_posting, escalation_hours, expiry_hours, approver_rule, is_active)
SELECT t.id, s.threshold_type, s.threshold_value, s.threshold_operator, s.block_posting, s.escalation_hours, s.expiry_hours, s.approver_rule, s.is_active
FROM (VALUES
  -- code,                    threshold_type,  threshold_value, operator, block, esc_hrs, exp_hrs, rule,               active
  ('internal_use',             'any',           NULL,            'gt',     TRUE,  24,      72,      'any_approver',     FALSE),  -- parent; only specific subtypes active
  ('internal_use_own',         'any',           NULL,            'gt',     TRUE,  12,      48,      'any_approver',     TRUE),   -- always approve own-use
  ('internal_use_damage',      'amount',        100000,          'gt',     TRUE,  24,      72,      'any_approver',     TRUE),   -- damage > 100k

  ('sales_discount',           'percentage',    10,              'gt',     TRUE,  12,      24,      'any_approver',     TRUE),   -- discount > 10%
  ('sales_return',             'any',           NULL,            'gt',     TRUE,  24,      72,      'any_approver',     TRUE),
  ('credit_note',              'any',           NULL,            'gt',     TRUE,  24,      72,      'any_approver',     TRUE),
  ('price_override',           'percentage',    15,              'gt',     TRUE,  12,      24,      'any_approver',     TRUE),

  ('stock_adjustment',         'any',           NULL,            'gt',     TRUE,  24,      72,      'any_approver',     TRUE),
  ('stock_transfer',           'amount',        500000,          'gt',     FALSE, 24,      72,      'any_approver',     TRUE),   -- post-review
  ('opening_stock',            'any',           NULL,            'gt',     TRUE,  48,      168,     'super_admin_only', TRUE),

  ('petty_cash',               'amount',        50000,           'gt',     TRUE,  12,      48,      'any_approver',     TRUE),   -- petty cash > 50k
  ('bank_transfer',            'amount',        1000000,         'gt',     TRUE,  24,      48,      'super_admin_only', TRUE),   -- bank xfer > 1M
  ('cash_payment',             'amount',        500000,          'gt',     TRUE,  24,      48,      'any_approver',     TRUE),
  ('journal_entry',            'any',           NULL,            'gt',     TRUE,  12,      48,      'super_admin_only', TRUE),
  ('large_purchase',           'amount',        1000000,         'gt',     TRUE,  48,      120,     'super_admin_only', TRUE),

  ('overdue_invoice',          'days',          30,              'gt',     TRUE,  24,      72,      'any_approver',     TRUE),
  ('credit_limit_override',    'any',           NULL,            'gt',     TRUE,  24,      48,      'any_approver',     TRUE),

  ('void_transaction',         'any',           NULL,            'gt',     TRUE,  6,       24,      'super_admin_only', TRUE),
  ('backdated_posting',        'days',          7,               'gt',     TRUE,  12,      48,      'super_admin_only', TRUE),

  ('hrm_leave',                'any',           NULL,            'gt',     TRUE,  48,      168,     'any_approver',     TRUE),
  ('hrm_payroll_run',          'any',           NULL,            'gt',     TRUE,  24,      48,      'super_admin_only', TRUE)
) AS s(code, threshold_type, threshold_value, threshold_operator, block_posting, escalation_hours, expiry_hours, approver_rule, is_active)
JOIN approval_types t ON t.code = s.code
ON CONFLICT (approval_type_id) DO NOTHING;

-- ─── 9. updated_at trigger ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_approval_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_approval_settings_updated ON approval_settings;
CREATE TRIGGER trg_approval_settings_updated
  BEFORE UPDATE ON approval_settings
  FOR EACH ROW EXECUTE FUNCTION update_approval_updated_at();

DROP TRIGGER IF EXISTS trg_approval_requests_updated ON approval_requests;
CREATE TRIGGER trg_approval_requests_updated
  BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION update_approval_updated_at();

-- ─── 10. Helper: mark_expired_approvals() ──────────────────────────────────
-- Call from a cron/scheduled job (or pg_cron). Marks pending requests whose
-- expires_at has passed as 'expired' and writes to audit log.
CREATE OR REPLACE FUNCTION mark_expired_approvals()
RETURNS INTEGER AS $$
DECLARE
  cnt INTEGER;
BEGIN
  WITH updated AS (
    UPDATE approval_requests
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' AND expires_at < NOW()
    RETURNING id
  )
  INSERT INTO approval_actions (request_id, action, comment)
  SELECT id, 'expired', 'Auto-expired by scheduler'
  FROM updated;

  GET DIAGNOSTICS cnt = ROW_COUNT;

  -- Also mark the underlying voucher as rejected if retain_on_reject=false,
  -- otherwise leave it in pending_approval for operator cleanup.
  UPDATE vouchers v
  SET status = 'cancelled', updated_at = NOW()
  WHERE v.status = 'pending_approval'
    AND v.approval_request_id IN (
      SELECT id FROM approval_requests WHERE status = 'expired' AND updated_at > NOW() - INTERVAL '5 minutes'
    );

  RETURN cnt;
END;
$$ LANGUAGE plpgsql;

-- ─── 11. Helper: escalate_overdue_approvals() ──────────────────────────────
CREATE OR REPLACE FUNCTION escalate_overdue_approvals()
RETURNS INTEGER AS $$
DECLARE
  cnt INTEGER;
BEGIN
  WITH updated AS (
    UPDATE approval_requests r
    SET escalated = TRUE, escalated_at = NOW(), updated_at = NOW()
    FROM approval_settings s
    WHERE r.approval_type_id = s.approval_type_id
      AND r.status = 'pending'
      AND r.escalated = FALSE
      AND r.requested_at < NOW() - (s.escalation_hours || ' hours')::INTERVAL
    RETURNING r.id
  )
  INSERT INTO approval_actions (request_id, action, comment)
  SELECT id, 'escalated', 'Auto-escalated due to SLA breach'
  FROM updated;

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END;
$$ LANGUAGE plpgsql;

-- ─── 12. RPC: approve_request(request_id, approver_id, comment) ────────────
-- Atomically: checks approver eligibility → updates request → writes audit.
-- Returns (success boolean, error text, payload jsonb).
-- The calling code is responsible for using the returned payload to execute
-- the actual voucher post. This keeps the DB decoupled from voucher logic.
CREATE OR REPLACE FUNCTION approve_request(
  p_request_id UUID,
  p_approver_id UUID,
  p_comment TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, error TEXT, payload JSONB, reference_type TEXT, reference_id UUID) AS $$
DECLARE
  v_request approval_requests%ROWTYPE;
  v_approver users%ROWTYPE;
  v_setting approval_settings%ROWTYPE;
  v_specific_count INTEGER;
BEGIN
  -- Load request
  SELECT * INTO v_request FROM approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Request not found'::TEXT, NULL::JSONB, NULL::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF v_request.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, ('Request already ' || v_request.status)::TEXT, NULL::JSONB, NULL::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- No self-approval (defense in depth; also CHECK constraint)
  IF v_request.requested_by = p_approver_id THEN
    RETURN QUERY SELECT FALSE, 'Cannot approve your own request'::TEXT, NULL::JSONB, NULL::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Load approver + setting
  SELECT * INTO v_approver FROM users WHERE id = p_approver_id;
  IF NOT FOUND OR NOT v_approver.is_active THEN
    RETURN QUERY SELECT FALSE, 'Approver account invalid'::TEXT, NULL::JSONB, NULL::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT * INTO v_setting FROM approval_settings WHERE approval_type_id = v_request.approval_type_id;

  -- Check approver eligibility
  IF v_setting.approver_rule = 'super_admin_only' THEN
    -- Super admin check: assumes users.is_super_admin exists, fallback to is_approver
    IF NOT COALESCE(
      (SELECT is_super_admin FROM users WHERE id = p_approver_id LIMIT 1),
      v_approver.is_approver
    ) THEN
      RETURN QUERY SELECT FALSE, 'Only super admins can approve this type'::TEXT, NULL::JSONB, NULL::TEXT, NULL::UUID;
      RETURN;
    END IF;
  ELSIF v_setting.approver_rule = 'specific_users' THEN
    SELECT COUNT(*) INTO v_specific_count
    FROM approval_type_approvers
    WHERE approval_type_id = v_request.approval_type_id AND user_id = p_approver_id;
    IF v_specific_count = 0 THEN
      RETURN QUERY SELECT FALSE, 'You are not listed as an approver for this type'::TEXT, NULL::JSONB, NULL::TEXT, NULL::UUID;
      RETURN;
    END IF;
  ELSE
    -- any_approver: must have is_approver flag
    IF NOT v_approver.is_approver THEN
      RETURN QUERY SELECT FALSE, 'You do not have approver privileges'::TEXT, NULL::JSONB, NULL::TEXT, NULL::UUID;
      RETURN;
    END IF;
  END IF;

  -- All checks passed. Approve.
  UPDATE approval_requests
  SET status = 'approved',
      resolved_by = p_approver_id,
      resolved_at = NOW(),
      resolution_comment = p_comment,
      updated_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO approval_actions (request_id, action, performed_by, comment)
  VALUES (p_request_id, 'approved', p_approver_id, p_comment);

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_request.payload, v_request.reference_type, v_request.reference_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 13. RPC: reject_request(request_id, approver_id, comment) ─────────────
CREATE OR REPLACE FUNCTION reject_request(
  p_request_id UUID,
  p_approver_id UUID,
  p_comment TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT, reference_id UUID, reference_type TEXT) AS $$
DECLARE
  v_request approval_requests%ROWTYPE;
  v_setting approval_settings%ROWTYPE;
BEGIN
  IF p_comment IS NULL OR length(trim(p_comment)) = 0 THEN
    RETURN QUERY SELECT FALSE, 'Rejection comment is required'::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_request FROM approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Request not found'::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  IF v_request.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, ('Request already ' || v_request.status)::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  IF v_request.requested_by = p_approver_id THEN
    RETURN QUERY SELECT FALSE, 'Cannot reject your own request'::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_setting FROM approval_settings WHERE approval_type_id = v_request.approval_type_id;

  UPDATE approval_requests
  SET status = 'rejected',
      resolved_by = p_approver_id,
      resolved_at = NOW(),
      resolution_comment = p_comment,
      updated_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO approval_actions (request_id, action, performed_by, comment)
  VALUES (p_request_id, 'rejected', p_approver_id, p_comment);

  -- Clean up the blocked voucher based on retain_on_reject setting
  IF v_request.reference_type = 'voucher' AND v_request.reference_id IS NOT NULL THEN
    IF COALESCE(v_setting.retain_on_reject, FALSE) THEN
      UPDATE vouchers SET status = 'rejected', updated_at = NOW()
      WHERE id = v_request.reference_id AND status = 'pending_approval';
    ELSE
      DELETE FROM vouchers WHERE id = v_request.reference_id AND status = 'pending_approval';
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_request.reference_id, v_request.reference_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 14. RPC: mark_request_executed(request_id, voucher_id, error) ─────────
-- Called by the app AFTER it executes the approved voucher (or fails).
CREATE OR REPLACE FUNCTION mark_request_executed(
  p_request_id UUID,
  p_voucher_id UUID DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF p_error IS NOT NULL THEN
    UPDATE approval_requests
    SET status = 'execution_failed',
        executed_at = NOW(),
        execution_error = p_error,
        updated_at = NOW()
    WHERE id = p_request_id;

    INSERT INTO approval_actions (request_id, action, comment)
    VALUES (p_request_id, 'execution_failed', p_error);
  ELSE
    UPDATE approval_requests
    SET status = 'executed',
        executed_at = NOW(),
        executed_voucher_id = p_voucher_id,
        updated_at = NOW()
    WHERE id = p_request_id;

    INSERT INTO approval_actions (request_id, action, metadata)
    VALUES (p_request_id, 'executed', jsonb_build_object('voucher_id', p_voucher_id));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 15. RLS policies ──────────────────────────────────────────────────────
ALTER TABLE approval_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_actions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_type_approvers ENABLE ROW LEVEL SECURITY;

-- approval_types: everyone can read, only super admins can modify
DROP POLICY IF EXISTS approval_types_read ON approval_types;
CREATE POLICY approval_types_read ON approval_types FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS approval_types_write ON approval_types;
CREATE POLICY approval_types_write ON approval_types FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.email = auth.jwt()->>'email' AND COALESCE(u.is_super_admin, u.is_approver, FALSE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.email = auth.jwt()->>'email' AND COALESCE(u.is_super_admin, u.is_approver, FALSE)));

-- approval_settings: everyone reads, super admin modifies
DROP POLICY IF EXISTS approval_settings_read ON approval_settings;
CREATE POLICY approval_settings_read ON approval_settings FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS approval_settings_write ON approval_settings;
CREATE POLICY approval_settings_write ON approval_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.email = auth.jwt()->>'email' AND COALESCE(u.is_super_admin, u.is_approver, FALSE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.email = auth.jwt()->>'email' AND COALESCE(u.is_super_admin, u.is_approver, FALSE)));

-- approval_requests: requesters see their own + approvers see everything
DROP POLICY IF EXISTS approval_requests_read ON approval_requests;
CREATE POLICY approval_requests_read ON approval_requests FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.email = auth.jwt()->>'email'
      AND (u.id = approval_requests.requested_by
           OR u.id = approval_requests.assigned_to
           OR u.is_approver
           OR COALESCE(u.is_super_admin, FALSE))
  )
);

DROP POLICY IF EXISTS approval_requests_insert ON approval_requests;
CREATE POLICY approval_requests_insert ON approval_requests FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users u WHERE u.email = auth.jwt()->>'email' AND u.id = approval_requests.requested_by)
);

-- Updates only via RPC (which uses SECURITY DEFINER); block direct updates
DROP POLICY IF EXISTS approval_requests_update ON approval_requests;
CREATE POLICY approval_requests_update ON approval_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users u WHERE u.email = auth.jwt()->>'email' AND (u.is_approver OR COALESCE(u.is_super_admin, FALSE)))
);

-- approval_actions: read by anyone who can see the parent request
DROP POLICY IF EXISTS approval_actions_read ON approval_actions;
CREATE POLICY approval_actions_read ON approval_actions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM approval_requests r
    JOIN users u ON u.email = auth.jwt()->>'email'
    WHERE r.id = approval_actions.request_id
      AND (u.id = r.requested_by OR u.id = r.assigned_to OR u.is_approver OR COALESCE(u.is_super_admin, FALSE))
  )
);

DROP POLICY IF EXISTS approval_actions_insert ON approval_actions;
CREATE POLICY approval_actions_insert ON approval_actions FOR INSERT WITH CHECK (TRUE);

-- approval_type_approvers: everyone reads, super admin writes
DROP POLICY IF EXISTS approval_type_approvers_read ON approval_type_approvers;
CREATE POLICY approval_type_approvers_read ON approval_type_approvers FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS approval_type_approvers_write ON approval_type_approvers;
CREATE POLICY approval_type_approvers_write ON approval_type_approvers FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.email = auth.jwt()->>'email' AND COALESCE(u.is_super_admin, FALSE)))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.email = auth.jwt()->>'email' AND COALESCE(u.is_super_admin, FALSE)));

-- ─── 16. Grants ────────────────────────────────────────────────────────────
GRANT SELECT ON approval_types, approval_settings, approval_requests, approval_actions, approval_type_approvers TO authenticated;
GRANT INSERT ON approval_requests, approval_actions TO authenticated;
GRANT UPDATE ON approval_settings, approval_type_approvers TO authenticated;
GRANT EXECUTE ON FUNCTION approve_request, reject_request, mark_request_executed, mark_expired_approvals, escalate_overdue_approvals TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- END 004_approval_workflows.sql
-- ════════════════════════════════════════════════════════════════════════════
