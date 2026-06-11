-- ============================================================================
-- SOKORA SAAS Multi-tenancy Migration
-- Migration: 009_saas_multitenancy.sql
-- Description: Adds organization/tenant layer for full SAAS architecture
-- ============================================================================

-- ─── 1. SUBSCRIPTION PLANS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id            TEXT PRIMARY KEY,                  -- 'starter' | 'growth' | 'enterprise'
  name          TEXT NOT NULL,
  price_monthly DECIMAL(10,2),
  price_yearly  DECIMAL(10,2),
  max_users     INT,                               -- NULL = unlimited
  max_locations INT DEFAULT 1,
  features      JSONB NOT NULL DEFAULT '[]',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO subscription_plans (id, name, price_monthly, price_yearly, max_users, max_locations, features, sort_order)
VALUES
  ('starter',    'Starter',    49,   490,   5,    1,
   '["ERP Core","Inventory","Basic Reports","Email Support"]', 1),
  ('growth',     'Growth',     129,  1290,  25,   5,
   '["Full ERP","CRM","HR Management","Advanced Reports","Approval Workflows","WhatsApp Integration","Priority Support"]', 2),
  ('enterprise', 'Enterprise', NULL, NULL,  NULL, NULL,
   '["All Modules","Multi-company","Custom Integrations","SLA Guarantee","Dedicated Success Manager"]', 3)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. ORGANIZATIONS (tenants) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,           -- url-safe identifier
  plan_id         TEXT NOT NULL DEFAULT 'starter'
                    REFERENCES subscription_plans(id),
  plan_status     TEXT NOT NULL DEFAULT 'trial'
                    CHECK (plan_status IN ('trial','active','past_due','cancelled','expired')),
  trial_ends_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  billing_email   TEXT,
  country         TEXT NOT NULL DEFAULT 'Tanzania',
  business_type   TEXT,                           -- retail, wholesale, services, etc.
  logo_url        TEXT,
  primary_color   TEXT DEFAULT '#6366f1',
  timezone        TEXT DEFAULT 'Africa/Dar_es_Salaam',
  currency        TEXT DEFAULT 'TZS',
  settings        JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug      ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_plan_id   ON organizations(plan_id);
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(is_active);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 3. ORGANIZATION MEMBERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner','admin','manager','member','readonly')),
  department      TEXT,
  invited_by      UUID REFERENCES auth.users(id),
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org_id  ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);

-- ─── 4. SUBSCRIPTIONS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id              TEXT NOT NULL REFERENCES subscription_plans(id),
  status               TEXT NOT NULL DEFAULT 'trial'
                         CHECK (status IN ('trial','active','past_due','cancelled','expired')),
  billing_cycle        TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  amount               DECIMAL(10,2),
  currency             TEXT DEFAULT 'USD',
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  cancel_reason        TEXT,
  payment_method       TEXT,
  external_ref         TEXT,                      -- Stripe/payment gateway ref
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org_id ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status  ON subscriptions(status);

-- ─── 5. ORGANIZATION INVITATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member',
  token           TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by      UUID REFERENCES auth.users(id),
  accepted_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token  ON organization_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email  ON organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_org_id ON organization_invitations(organization_id);

-- ─── 6. AUDIT LOG ENHANCEMENTS ───────────────────────────────────────────────
-- Add organization_id to existing audit_log if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'audit_log' AND column_name = 'organization_id'
    ) THEN
      ALTER TABLE audit_log ADD COLUMN organization_id UUID REFERENCES organizations(id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_org_id ON audit_log(organization_id);
    END IF;
  END IF;
END $$;

-- ─── 7. ADD organization_id TO USERS TABLE ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE users ADD COLUMN organization_id UUID REFERENCES organizations(id);
    CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
  END IF;
END $$;

-- ─── 8. USAGE METRICS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  active_users    INT DEFAULT 0,
  api_calls       BIGINT DEFAULT 0,
  storage_bytes   BIGINT DEFAULT 0,
  vouchers_count  INT DEFAULT 0,
  recorded_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, period_start)
);

-- ─── 9. PLAN FEATURE FLAGS VIEW ──────────────────────────────────────────────
CREATE OR REPLACE VIEW v_organization_plan AS
SELECT
  o.id                  AS organization_id,
  o.name                AS org_name,
  o.slug,
  o.plan_status,
  o.trial_ends_at,
  o.is_active,
  sp.id                 AS plan_id,
  sp.name               AS plan_name,
  sp.max_users,
  sp.max_locations,
  sp.features           AS plan_features,
  CASE
    WHEN o.plan_status = 'trial' AND o.trial_ends_at > NOW() THEN true
    WHEN o.plan_status = 'active'                            THEN true
    ELSE false
  END                   AS is_paid_or_trial,
  CASE
    WHEN o.trial_ends_at > NOW() AND o.plan_status = 'trial'
    THEN EXTRACT(DAY FROM o.trial_ends_at - NOW())::INT
    ELSE NULL
  END                   AS trial_days_remaining
FROM organizations o
JOIN subscription_plans sp ON sp.id = o.plan_id;

-- ─── 10. RLS POLICIES ────────────────────────────────────────────────────────
-- Enable RLS on all new tables
ALTER TABLE organizations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_usage         ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans         ENABLE ROW LEVEL SECURITY;

-- Plans: everyone can read
DROP POLICY IF EXISTS "plans_public_read" ON subscription_plans;
CREATE POLICY "plans_public_read" ON subscription_plans
  FOR SELECT USING (is_active = true);

-- Organizations: members can read their own org
DROP POLICY IF EXISTS "orgs_member_read" ON organizations;
CREATE POLICY "orgs_member_read" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Organizations: owners/admins can update
DROP POLICY IF EXISTS "orgs_admin_update" ON organizations;
CREATE POLICY "orgs_admin_update" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner','admin')
        AND is_active = true
    )
  );

-- Members: can read others in the same org
DROP POLICY IF EXISTS "members_read_same_org" ON organization_members;
CREATE POLICY "members_read_same_org" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Members: admins can insert/update/delete
DROP POLICY IF EXISTS "members_admin_write" ON organization_members;
CREATE POLICY "members_admin_write" ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner','admin')
        AND is_active = true
    )
  );

-- Subscriptions: org members can read
DROP POLICY IF EXISTS "subs_member_read" ON subscriptions;
CREATE POLICY "subs_member_read" ON subscriptions
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Invitations: org admins can manage, invitee can read by token
DROP POLICY IF EXISTS "invitations_admin_manage" ON organization_invitations;
CREATE POLICY "invitations_admin_manage" ON organization_invitations
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner','admin')
        AND is_active = true
    )
  );

-- ─── 11. HELPER FUNCTIONS ────────────────────────────────────────────────────

-- Get current user's organization_id
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user is org admin
CREATE OR REPLACE FUNCTION is_org_admin(org_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND (org_id IS NULL OR organization_id = org_id)
      AND role IN ('owner','admin')
      AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check organization plan feature
CREATE OR REPLACE FUNCTION org_has_feature(org_id UUID, feature_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM v_organization_plan
    WHERE organization_id = org_id
      AND is_paid_or_trial = true
      AND plan_features @> to_jsonb(feature_name)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── 12. SEED: Create default SOKORA platform organization ───────────────────
-- This creates the default platform tenant; update values as needed
INSERT INTO organizations (
  id, name, slug, plan_id, plan_status, billing_email, country, business_type
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'SOKORA Platform',
  'sokora',
  'enterprise',
  'active',
  'admin@sokora.app',
  'Tanzania',
  'platform'
)
ON CONFLICT (id) DO NOTHING;

-- ─── END OF MIGRATION ────────────────────────────────────────────────────────
