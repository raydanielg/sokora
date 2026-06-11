-- ============================================================
-- Logical dump: Malkiasystems's Project (public schema, 131 tables)
-- Project ref: ebokhvibnypiomzqimfg
-- Generated via Supabase MCP (logical reconstruction)
-- ============================================================
SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET search_path = public;
SET session_replication_role = replica;  -- defer FK checks during data load


-- ===== SEQUENCES =====
CREATE SEQUENCE IF NOT EXISTS public.contact_number_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10001 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.customer_ledger_entries_entry_number_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.debtor_number_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.item_ledger_entries_entry_number_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.item_ledger_entry_number_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.value_entries_entry_number_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.vendor_ledger_entries_entry_number_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;

-- ===== TABLES =====
CREATE TABLE public.account_balance_backup_028 (
  id uuid,
  code text,
  name text,
  old_balance numeric,
  backed_up_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.accounting_periods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fiscal_year_id uuid NOT NULL,
  name text NOT NULL,
  period_number integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  locked_by text,
  locked_at timestamp with time zone,
  closed_by text,
  closed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.accounts (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  code character varying(10) NOT NULL,
  name character varying(255) NOT NULL,
  type character varying(20) NOT NULL,
  account_type character varying(20) DEFAULT 'posting'::character varying,
  category character varying(100),
  subcategory character varying(100),
  balance numeric(15,2) DEFAULT 0,
  balance_usd numeric(15,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  allow_direct_posting boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.approval_actions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid NOT NULL,
  action text NOT NULL,
  performed_by uuid,
  comment text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.approval_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  approval_type_id uuid NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid,
  reference_number text NOT NULL,
  request_summary text NOT NULL,
  original_value numeric,
  requested_value numeric,
  payload jsonb,
  requested_by uuid NOT NULL,
  assigned_to uuid,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  escalated boolean DEFAULT false NOT NULL,
  escalated_at timestamp with time zone,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  resolution_comment text,
  executed_at timestamp with time zone,
  execution_error text,
  executed_voucher_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.approval_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  approval_type_id uuid NOT NULL,
  threshold_type text DEFAULT 'any'::text NOT NULL,
  threshold_value numeric,
  threshold_operator text DEFAULT 'gt'::text NOT NULL,
  block_posting boolean DEFAULT true NOT NULL,
  retain_on_reject boolean DEFAULT false NOT NULL,
  escalation_hours integer DEFAULT 24 NOT NULL,
  expiry_hours integer DEFAULT 72 NOT NULL,
  approver_rule text DEFAULT 'any_approver'::text NOT NULL,
  super_admin_bypass boolean DEFAULT true NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.approval_type_approvers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  approval_type_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.approval_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  icon text,
  color text,
  is_system boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  action character varying(50) NOT NULL,
  module character varying(50),
  record_type character varying(50),
  record_id uuid,
  record_ref character varying(50),
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.b2b_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  account_type text DEFAULT 'pharmacy'::text NOT NULL,
  stage text DEFAULT 'identified'::text NOT NULL,
  region text,
  temperature text,
  source text,
  owner_user_id uuid,
  owner_name text,
  contact_person text,
  whatsapp text,
  email text,
  phone text,
  address text,
  tin_number text,
  expected_monthly_value numeric DEFAULT 0 NOT NULL,
  payment_terms text,
  next_action text,
  next_action_date date,
  last_contacted_at timestamp with time zone,
  last_order_date date,
  lost_reason text,
  lost_at timestamp with time zone,
  won_at timestamp with time zone,
  customer_id uuid,
  notes text,
  is_archived boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.b2b_activities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  account_id uuid NOT NULL,
  type text DEFAULT 'note'::text NOT NULL,
  note text,
  performed_by uuid,
  performed_by_name text,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.b2b_contacts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  account_id uuid NOT NULL,
  name text NOT NULL,
  role text,
  phone text,
  whatsapp text,
  email text,
  is_primary boolean DEFAULT false NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.branches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code character varying(2) NOT NULL,
  name character varying(100) NOT NULL,
  city character varying(100),
  address text,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.bundle_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bundle_id uuid NOT NULL,
  product_id uuid NOT NULL,
  qty integer DEFAULT 1 NOT NULL
);

CREATE TABLE public.bundle_sales (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bundle_id uuid NOT NULL,
  voucher_id uuid,
  voucher_ref text,
  customer_id uuid,
  customer_name text,
  bundle_price numeric DEFAULT 0 NOT NULL,
  individual_total numeric DEFAULT 0 NOT NULL,
  savings numeric DEFAULT 0 NOT NULL,
  sold_by text,
  posting_date date,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.bundles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  bundle_price numeric DEFAULT 0 NOT NULL,
  individual_total numeric DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true,
  image_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  wholesale_price numeric DEFAULT 0
);

CREATE TABLE public.business_posting_groups (
  code character varying(20) NOT NULL,
  description character varying(255),
  default_payment_terms character varying(50),
  ar_account_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#85c2be'::text,
  icon text DEFAULT 'package'::text,
  parent_id uuid,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.company_settings (
  id text DEFAULT 'company'::text NOT NULL,
  company_name text DEFAULT 'Malkia Wellness Group Ltd'::text NOT NULL,
  tagline text,
  tin text,
  address text,
  phone text,
  email text,
  website text,
  logo_url text,
  logo_height_px integer DEFAULT 48 NOT NULL,
  logo_position text DEFAULT 'left'::text NOT NULL,
  bank_name text DEFAULT 'NMB Bank'::text,
  bank_account_name text DEFAULT 'Malkia Wellness Group Ltd'::text,
  bank_account_number text DEFAULT '22510074972'::text,
  bank_branch text DEFAULT 'Dar es Salaam Branch'::text,
  mpesa_till_number text,
  mpesa_business_number text,
  statement_footer_note text DEFAULT 'Please reference the invoice number when paying. For queries, contact us.'::text,
  invoice_footer_note text DEFAULT 'Thank you for your business.'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);

CREATE TABLE public.conversation_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid,
  direction text NOT NULL,
  message_type text DEFAULT 'text'::text,
  content text,
  media_url text,
  template_name text,
  status text DEFAULT 'sent'::text,
  sent_by uuid,
  external_id text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid,
  customer_name text,
  customer_whatsapp text,
  channel text DEFAULT 'whatsapp'::text,
  status text DEFAULT 'open'::text,
  last_message text,
  last_message_at timestamp with time zone DEFAULT now(),
  unread_count integer DEFAULT 0,
  is_urgent boolean DEFAULT false,
  assigned_to uuid,
  tags text[],
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.crm_automation_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  automation_id uuid,
  customer_id uuid,
  status text DEFAULT 'success'::text,
  error_message text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.crm_automations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL,
  trigger_config jsonb,
  action_type text NOT NULL,
  action_config jsonb,
  is_active boolean DEFAULT true,
  run_count integer DEFAULT 0,
  last_run_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.crm_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  value jsonb,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  category text NOT NULL
);

CREATE TABLE public.crm_upsell_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  trigger_product_id uuid,
  trigger_category text,
  suggest_product_id uuid,
  suggest_category text,
  discount_percent numeric(5,2) DEFAULT 0,
  message_template text,
  is_active boolean DEFAULT true,
  conversion_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.crown_manual_award_catalog (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reason_code text NOT NULL,
  label text NOT NULL,
  description text,
  default_points integer DEFAULT 0 NOT NULL,
  requires_approval boolean DEFAULT false NOT NULL,
  approval_threshold integer,
  is_active boolean DEFAULT true NOT NULL,
  icon text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.crown_points_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid,
  points integer NOT NULL,
  type text NOT NULL,
  source text,
  reference_id uuid,
  description text,
  balance_after integer,
  created_at timestamp with time zone DEFAULT now(),
  reason_code text,
  reason_note text,
  source_voucher_id uuid,
  awarded_by_user_id uuid,
  requires_approval boolean DEFAULT false NOT NULL,
  approval_status text,
  approval_request_id uuid
);

CREATE TABLE public.crown_redemptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  points_used integer NOT NULL,
  reward_type text NOT NULL,
  reward_value numeric(15,2),
  reward_description text,
  voucher_ref text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.crown_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  points integer NOT NULL,
  type text NOT NULL,
  source text NOT NULL,
  reference_id text,
  reference_type text,
  description text,
  expires_at date,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_document_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  doc_type text NOT NULL,
  doc_ref text,
  storage_path text NOT NULL,
  signed_url text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  generated_at timestamp with time zone DEFAULT now() NOT NULL,
  generated_by uuid
);

CREATE TABLE public.customer_ledger_entries (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  entry_number integer DEFAULT nextval('customer_ledger_entries_entry_number_seq'::regclass) NOT NULL,
  customer_id uuid,
  posting_date date NOT NULL,
  document_type character varying(30),
  document_ref character varying(50),
  description text,
  amount numeric(15,2) NOT NULL,
  remaining_amount numeric(15,2) DEFAULT 0,
  is_open boolean DEFAULT true,
  due_date date,
  closed_at date,
  journal_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.customer_segments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  filter_rules jsonb NOT NULL,
  is_system boolean DEFAULT false,
  customer_count integer DEFAULT 0,
  last_refreshed timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_stage_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  from_stage text,
  to_stage text NOT NULL,
  transitioned_at timestamp with time zone DEFAULT now() NOT NULL,
  transitioned_by uuid,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_waitlist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  interest text NOT NULL,
  product_id uuid,
  priority integer DEFAULT 3 NOT NULL,
  status text DEFAULT 'waiting'::text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  notified_at timestamp with time zone,
  resolved_at timestamp with time zone,
  created_by uuid,
  resolved_by uuid,
  is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.customers (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  code character varying(20),
  name character varying(255) NOT NULL,
  whatsapp character varying(20),
  email character varying(255),
  address text,
  customer_type character varying(20) DEFAULT 'B2C'::character varying,
  business_posting_group character varying(20),
  payment_terms character varying(50) DEFAULT 'COD'::character varying,
  credit_limit numeric(15,2) DEFAULT 0,
  balance numeric(15,2) DEFAULT 0,
  crown_points integer DEFAULT 0,
  pregnancy_stage character varying(100),
  last_purchase_date date,
  last_purchase_amount numeric(15,2),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  customer_number character varying(20),
  segment character varying(20) DEFAULT 'retail'::character varying,
  credit_period integer DEFAULT 0,
  account_id uuid,
  notes text,
  company character varying(200),
  contact_person character varying(200),
  crown_tier text DEFAULT 'mama'::text,
  referral_code text,
  referred_by uuid,
  lifetime_value numeric(15,2) DEFAULT 0,
  total_orders integer DEFAULT 0,
  birthday date,
  preferred_contact_time text,
  tags text[],
  source text DEFAULT 'walk_in'::text,
  assigned_to text,
  price_tier text DEFAULT 'retail'::text,
  edd date,
  edd_source text,
  edd_captured_at timestamp with time zone,
  manual_tags text[] DEFAULT '{}'::text[],
  internal_notes text,
  first_purchase_at timestamp with time zone,
  preferences jsonb DEFAULT '{}'::jsonb,
  ttc_duration text,
  delivery_date date,
  context_status text DEFAULT 'pending'::text,
  context_captured_at timestamp with time zone,
  context_captured_by uuid,
  life_stage text,
  life_substage text,
  relationship_stage text,
  previous_life_stage text,
  current_stage_entered_at timestamp with time zone,
  graduation_count integer DEFAULT 0 NOT NULL,
  pregnancy_count integer DEFAULT 0 NOT NULL,
  is_returning_customer boolean DEFAULT false NOT NULL,
  owner_user_id uuid,
  stage_paused boolean DEFAULT false NOT NULL,
  stage_paused_reason text,
  stage_paused_at timestamp with time zone,
  stage_paused_by uuid,
  ambassador_code text,
  snoozed_until date,
  snoozed_by uuid,
  ambassador_code_max_uses integer,
  ambassador_code_uses_count integer DEFAULT 0 NOT NULL,
  tin_number text,
  is_hidden boolean DEFAULT false NOT NULL,
  phone text
);

CREATE TABLE public.dimension_values (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  dimension_code character varying(20),
  value_code character varying(30) NOT NULL,
  description character varying(255),
  is_active boolean DEFAULT true
);

CREATE TABLE public.dimensions (
  code character varying(20) NOT NULL,
  description character varying(255),
  is_active boolean DEFAULT true
);

CREATE TABLE public.exchange_rates (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
  rate_date date NOT NULL,
  rate_to_tzs numeric(12,4) NOT NULL,
  source character varying(100),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.expense_budgets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  account_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  budget_amount numeric NOT NULL,
  notes text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid,
  customer_name text,
  voucher_id uuid,
  product_id uuid,
  rating integer,
  comment text,
  category text,
  sentiment text,
  status text DEFAULT 'new'::text,
  type text DEFAULT 'review'::text,
  is_public boolean DEFAULT false,
  is_resolved boolean DEFAULT false,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  response text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.feedback_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  voucher_id uuid NOT NULL,
  voucher_line_id uuid,
  product_id uuid,
  product_name text,
  due_date date NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  sent_at timestamp with time zone,
  answered_at timestamp with time zone,
  rating integer,
  feedback_text text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fiscal_years (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  is_current boolean DEFAULT false NOT NULL,
  created_by text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.general_posting_setup (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  business_group character varying(20),
  product_group character varying(20),
  sales_account_id uuid,
  cogs_account_id uuid,
  purchase_account_id uuid,
  sales_discount_account_id uuid
);

CREATE TABLE public.go_live_dates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  go_live_date date NOT NULL,
  opening_balance_status character varying(20) DEFAULT 'draft'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.homepage_banners (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  subtitle text,
  icon text,
  cta_text text DEFAULT 'Tazama'::text,
  link_url text NOT NULL,
  link_target text DEFAULT '_self'::text,
  background_style text DEFAULT 'teal'::text,
  text_color text DEFAULT 'light'::text,
  "position" text DEFAULT 'top'::text NOT NULL,
  sort_order integer DEFAULT 0,
  show_on_home boolean DEFAULT true,
  show_on_problems boolean DEFAULT false,
  show_on_stages boolean DEFAULT false,
  show_on_all_products boolean DEFAULT false,
  show_on_bundles boolean DEFAULT false,
  is_active boolean DEFAULT true,
  is_dismissable boolean DEFAULT false,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_applicants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_opening_id uuid,
  full_name text NOT NULL,
  phone text,
  stage text DEFAULT 'applied'::text,
  application_date date DEFAULT CURRENT_DATE,
  interview_date date,
  interview_notes text,
  score integer,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_appraisals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid,
  period text NOT NULL,
  kpis jsonb DEFAULT '[]'::jsonb,
  overall_score integer,
  manager_notes text,
  status text DEFAULT 'draft'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_assets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_name text NOT NULL,
  asset_tag text NOT NULL,
  employee_id uuid,
  assigned_to_name text,
  issued_date date,
  condition text DEFAULT 'good'::text,
  value numeric(12,2) DEFAULT 0,
  status text DEFAULT 'pool'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_attendance (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid,
  date date NOT NULL,
  clock_in text,
  clock_out text,
  hours numeric(4,1),
  entry_type text DEFAULT 'office'::text,
  status text DEFAULT 'present'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_employees (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  emp_code text NOT NULL,
  full_name text NOT NULL,
  initials text DEFAULT ''::text NOT NULL,
  job_title text DEFAULT ''::text,
  department text DEFAULT 'Operations'::text,
  contract_type text DEFAULT 'full_time'::text,
  start_date date DEFAULT CURRENT_DATE NOT NULL,
  end_date date,
  gross_salary numeric(12,2) DEFAULT 0,
  whatsapp text,
  bank_name text,
  bank_account text,
  nssf_number text,
  nssf_enabled boolean DEFAULT false,
  tin_number text,
  date_of_birth date,
  emergency_contact text,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  paye_enabled boolean DEFAULT true,
  sdl_enabled boolean DEFAULT true
);

CREATE TABLE public.hrm_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  event_type text DEFAULT 'other'::text,
  event_date date NOT NULL,
  end_date date,
  location text,
  organizer text,
  budget numeric(12,2) DEFAULT 0,
  actual_spend numeric(12,2) DEFAULT 0,
  attendees text[] DEFAULT '{}'::text[],
  status text DEFAULT 'planned'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_job_openings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  department text DEFAULT ''::text,
  contract_type text DEFAULT 'Full-time'::text,
  salary_range text,
  deadline date,
  description text,
  status text DEFAULT 'open'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_kpi_assignment_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  assignment_id uuid NOT NULL,
  kra text NOT NULL,
  kra_weight numeric DEFAULT 0 NOT NULL,
  kpi text NOT NULL,
  direction text DEFAULT 'H'::text NOT NULL,
  value_type text DEFAULT 'percent'::text NOT NULL,
  target numeric,
  self_actual numeric,
  actual numeric,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.hrm_kpi_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid,
  template_name text,
  employee_id uuid NOT NULL,
  period text NOT NULL,
  prp_pool numeric DEFAULT 500000 NOT NULL,
  payout_cap numeric DEFAULT 1.00 NOT NULL,
  sales_gate numeric DEFAULT 0 NOT NULL,
  sales_kra text,
  status text DEFAULT 'draft'::text NOT NULL,
  overall_score numeric,
  rating text,
  gross_prp numeric,
  final_prp numeric,
  gate_pass boolean,
  employee_notes text,
  manager_notes text,
  self_submitted_at timestamp with time zone,
  approved_by text,
  approved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  gates jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE public.hrm_kpi_gates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid NOT NULL,
  kra_name text NOT NULL,
  threshold numeric DEFAULT 0 NOT NULL,
  scope text DEFAULT 'whole_prp'::text NOT NULL,
  label text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.hrm_kpi_kpis (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kra_id uuid NOT NULL,
  name text NOT NULL,
  direction text DEFAULT 'H'::text NOT NULL,
  value_type text DEFAULT 'percent'::text NOT NULL,
  default_target numeric,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.hrm_kpi_kras (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid NOT NULL,
  name text NOT NULL,
  weight numeric DEFAULT 0 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.hrm_kpi_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  role_label text,
  prp_pool numeric DEFAULT 500000 NOT NULL,
  payout_cap numeric DEFAULT 1.00 NOT NULL,
  sales_gate numeric DEFAULT 0 NOT NULL,
  sales_kra text,
  is_active boolean DEFAULT true NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.hrm_leave_balances (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid,
  fiscal_year text DEFAULT '2025'::text,
  annual_entitlement integer DEFAULT 21,
  annual_taken integer DEFAULT 0,
  annual_pending integer DEFAULT 0,
  sick_entitlement integer DEFAULT 10,
  sick_taken integer DEFAULT 0
);

CREATE TABLE public.hrm_leave_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid,
  leave_type text DEFAULT 'annual'::text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days integer DEFAULT 1 NOT NULL,
  reason text,
  status text DEFAULT 'pending'::text,
  approved_by text,
  approved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_letters (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid,
  letter_type text NOT NULL,
  issued_date date NOT NULL,
  issued_by text DEFAULT ''::text,
  status text DEFAULT 'pending'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_payroll_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payroll_run_id uuid,
  employee_id uuid,
  gross numeric(12,2) DEFAULT 0,
  allowances numeric(12,2) DEFAULT 0,
  deductions numeric(12,2) DEFAULT 0,
  advance_deduction numeric(12,2) DEFAULT 0,
  paye numeric(12,2) DEFAULT 0,
  nssf_ee numeric(12,2) DEFAULT 0,
  nssf_er numeric(12,2) DEFAULT 0,
  sdl numeric(12,2) DEFAULT 0,
  net_pay numeric(12,2) DEFAULT 0,
  payslip_sent boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_payroll_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  period text NOT NULL,
  status text DEFAULT 'draft'::text,
  journal_ref text,
  posted_by text,
  posted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_salary_advances (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid,
  amount numeric(12,2) NOT NULL,
  remaining numeric(12,2) NOT NULL,
  monthly_deduction numeric(12,2) NOT NULL,
  issued_date date DEFAULT CURRENT_DATE NOT NULL,
  status text DEFAULT 'active'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.hrm_salary_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid,
  effective_date date NOT NULL,
  old_gross numeric(12,2) DEFAULT 0,
  new_gross numeric(12,2) NOT NULL,
  reason text,
  approved_by text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.import_order_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  line_number integer DEFAULT 1 NOT NULL,
  product_id uuid,
  description text NOT NULL,
  qty integer DEFAULT 1 NOT NULL,
  unit_cost_usd numeric DEFAULT 0 NOT NULL,
  unit_cost_tzs numeric DEFAULT 0 NOT NULL,
  subtotal_usd numeric DEFAULT 0 NOT NULL,
  subtotal_tzs numeric DEFAULT 0 NOT NULL,
  qty_received integer DEFAULT 0 NOT NULL,
  landed_unit_cost_tzs numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.import_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ref text NOT NULL,
  supplier_id uuid,
  status text DEFAULT 'draft'::text NOT NULL,
  order_date date DEFAULT CURRENT_DATE NOT NULL,
  expected_ready_date date,
  currency text DEFAULT 'USD'::text NOT NULL,
  fx_rate numeric DEFAULT 2500 NOT NULL,
  total_usd numeric DEFAULT 0 NOT NULL,
  total_tzs numeric DEFAULT 0 NOT NULL,
  total_freight_tzs numeric DEFAULT 0 NOT NULL,
  total_landed_tzs numeric DEFAULT 0 NOT NULL,
  notes text,
  created_by text DEFAULT 'Joe Gembe'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.import_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  payment_type text DEFAULT 'supplier_deposit'::text NOT NULL,
  payment_date date DEFAULT CURRENT_DATE NOT NULL,
  amount_tzs numeric DEFAULT 0 NOT NULL,
  bank_account_id uuid,
  agent_name text,
  reference text,
  notes text,
  journal_id uuid,
  voucher_ref text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.import_shipment_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shipment_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  qty_shipped integer DEFAULT 0 NOT NULL,
  qty_received integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.import_shipments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  shipment_number integer DEFAULT 1 NOT NULL,
  method text DEFAULT 'sea'::text NOT NULL,
  agent_name text,
  tracking_ref text,
  ship_date date,
  expected_arrival date,
  actual_arrival date,
  freight_cost_tzs numeric DEFAULT 0 NOT NULL,
  freight_paid boolean DEFAULT false NOT NULL,
  freight_payment_id uuid,
  status text DEFAULT 'pending'::text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.item_ledger_entries (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  entry_number integer DEFAULT nextval('item_ledger_entry_number_seq'::regclass),
  product_id uuid,
  entry_type character varying(30) NOT NULL,
  document_type character varying(30),
  document_ref character varying(50),
  posting_date date NOT NULL,
  qty numeric(15,3) NOT NULL,
  cost_amount numeric(15,2) DEFAULT 0 NOT NULL,
  remaining_qty numeric(15,3) DEFAULT 0,
  open boolean DEFAULT true,
  dimension_bu character varying(20),
  dimension_pl character varying(20),
  dimension_ch character varying(20),
  dimension_camp character varying(20),
  created_at timestamp with time zone DEFAULT now(),
  location_id uuid,
  location_code character varying(4)
);

CREATE TABLE public.journal_lines (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  journal_id uuid,
  line_number integer NOT NULL,
  account_id uuid,
  description text,
  debit numeric(15,2) DEFAULT 0,
  credit numeric(15,2) DEFAULT 0,
  currency character varying(3) DEFAULT 'TZS'::character varying,
  amount_usd numeric(15,4) DEFAULT 0,
  exchange_rate numeric(12,4) DEFAULT 1,
  dimension_bu character varying(20),
  dimension_pl character varying(20),
  dimension_ch character varying(20),
  dimension_camp character varying(20),
  customer_id uuid,
  supplier_id uuid,
  product_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.journals (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  ref text NOT NULL,
  posting_date date NOT NULL,
  description text NOT NULL,
  journal_type character varying(50) NOT NULL,
  source_type character varying(50),
  source_ref character varying(50),
  branch character varying(100) DEFAULT 'DSM HQ'::character varying,
  period_id uuid,
  posted_by character varying(255),
  status character varying(20) DEFAULT 'posted'::character varying,
  voided_at timestamp with time zone,
  voided_by character varying(255),
  void_reason text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.konnect_subscriptions (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  customer_id uuid,
  plan character varying(50) NOT NULL,
  amount numeric(15,2) NOT NULL,
  start_date date NOT NULL,
  end_date date,
  status character varying(20) DEFAULT 'active'::character varying,
  whatsapp character varying(20),
  auto_renew boolean DEFAULT true,
  last_billed date,
  next_billing date,
  twilio_number character varying(20),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text,
  whatsapp text,
  email text,
  source text,
  pregnancy_stage text,
  due_date date,
  interests text[],
  status text DEFAULT 'new'::text,
  score integer DEFAULT 0,
  assigned_to uuid,
  converted_customer_id uuid,
  notes text,
  last_contact_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.malkia_os_users (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  email character varying(255) NOT NULL,
  full_name character varying(255) NOT NULL,
  system_role character varying(50) DEFAULT 'staff'::character varying,
  role_label character varying(100),
  branch character varying(100) DEFAULT 'DSM HQ'::character varying,
  phone character varying(20),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.mama_stories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  mama_name text NOT NULL,
  location text,
  stage text,
  rating integer DEFAULT 5 NOT NULL,
  quote text NOT NULL,
  photo_url text,
  is_featured boolean DEFAULT false NOT NULL,
  is_visible boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.message_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid,
  direction text DEFAULT 'out'::text NOT NULL,
  channel text DEFAULT 'whatsapp'::text NOT NULL,
  template_name text,
  message_body text,
  status text DEFAULT 'sent'::text NOT NULL,
  external_id text,
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.message_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid,
  segment_id text,
  recipient_count integer DEFAULT 1,
  template_name text NOT NULL,
  template_params jsonb,
  message_body text,
  scheduled_for timestamp with time zone NOT NULL,
  priority text DEFAULT 'normal'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  sent_at timestamp with time zone,
  error_message text,
  created_by text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.migration_payments_2026 (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  month text NOT NULL,
  year integer DEFAULT 2026 NOT NULL,
  expense_account text NOT NULL,
  amount numeric(15,2) DEFAULT 0 NOT NULL,
  imported boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.migration_sales_2026 (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  month text NOT NULL,
  year integer DEFAULT 2026 NOT NULL,
  sales numeric(15,2) DEFAULT 0 NOT NULL,
  imported boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notification_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  notification_type character varying(50) NOT NULL,
  in_app boolean DEFAULT true,
  email boolean DEFAULT false,
  whatsapp boolean DEFAULT false
);

CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  type character varying(50) NOT NULL,
  title character varying(200) NOT NULL,
  message text,
  reference_type character varying(50),
  reference_id uuid,
  is_read boolean DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.partner_applications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_name text NOT NULL,
  owner_name text NOT NULL,
  whatsapp_number text NOT NULL,
  location_lat numeric,
  location_lng numeric,
  location_address text,
  monthly_sales_range text,
  referral_code text,
  status text DEFAULT 'pending'::text NOT NULL,
  notes text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.partner_shops (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  application_id uuid,
  slug text NOT NULL,
  shop_name text NOT NULL,
  owner_name text,
  whatsapp_number text,
  phone_number text,
  location_lat numeric,
  location_lng numeric,
  location_address text,
  area text,
  city text DEFAULT 'Dar es Salaam'::text,
  region text DEFAULT 'Dar es Salaam'::text,
  operating_hours jsonb DEFAULT '{}'::jsonb,
  certification_number text,
  certified_since date DEFAULT CURRENT_DATE,
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  photo_primary_url text,
  photo_2_url text,
  photo_3_url text,
  photo_4_url text,
  shop_type shop_type_enum DEFAULT 'other'::shop_type_enum NOT NULL,
  location_landmarks text,
  business_type text DEFAULT 'physical'::text NOT NULL,
  parent_shop_id uuid,
  online_channels jsonb DEFAULT '[]'::jsonb NOT NULL,
  delivers_to text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE public.period_lock_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  period_id uuid NOT NULL,
  action text NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  performed_by text NOT NULL,
  performed_at timestamp with time zone DEFAULT now() NOT NULL,
  reason text
);

CREATE TABLE public.permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  module character varying(50) NOT NULL,
  action character varying(50) NOT NULL,
  description text
);

CREATE TABLE public.posting_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  allow_posting_to_closed boolean DEFAULT false,
  allow_backdating_days integer DEFAULT 30,
  require_narration boolean DEFAULT false,
  enable_eod_lock boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.preorder_deposits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  preorder_id uuid NOT NULL,
  amount numeric(15,2) NOT NULL,
  payment_method text DEFAULT 'cash'::text NOT NULL,
  payment_ref text,
  voucher_ref text,
  received_by text,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  notes text
);

CREATE TABLE public.preorder_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  preorder_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  qty integer DEFAULT 1 NOT NULL,
  unit_price numeric(15,2) DEFAULT 0 NOT NULL,
  line_total numeric(15,2) GENERATED ALWAYS AS (((qty)::numeric * unit_price)) STORED
);

CREATE TABLE public.preorders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid,
  customer_name text,
  customer_whatsapp text,
  product_id uuid,
  product_name text,
  quantity integer DEFAULT 1,
  status text DEFAULT 'pending'::text,
  expected_date date,
  deposit_amount numeric(12,2) DEFAULT 0,
  deposit_paid boolean DEFAULT false,
  voucher_id uuid,
  notes text,
  notified_at timestamp with time zone,
  converted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.price_lists (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name character varying(100) NOT NULL,
  description text,
  list_type character varying(20) DEFAULT 'retail'::character varying,
  currency character varying(5) DEFAULT 'TZS'::character varying,
  is_active boolean DEFAULT true,
  show_cost boolean DEFAULT false,
  show_margin boolean DEFAULT false,
  discount_pct numeric(5,2) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.problem_products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  problem_id uuid NOT NULL,
  product_id uuid NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.product_faqs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  is_visible boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.product_images (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  image_url text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  alt_text text,
  is_primary boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.product_locations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid,
  location_id uuid,
  location_code character varying(4),
  qty_on_hand numeric(10,2) DEFAULT 0,
  last_updated timestamp with time zone DEFAULT now()
);

CREATE TABLE public.product_posting_groups (
  code character varying(20) NOT NULL,
  description character varying(255),
  inventory_account_id uuid,
  cogs_account_id uuid,
  purchase_account_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.product_sizes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  label text NOT NULL,
  measurement text,
  is_available boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.product_variant_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.product_variant_options (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  label text NOT NULL,
  value text NOT NULL,
  price_override numeric(12,2),
  price_modifier numeric(5,3),
  qty_multiplier integer DEFAULT 1,
  color_hex text,
  is_available boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.products (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  sku character varying(50) NOT NULL,
  name character varying(255) NOT NULL,
  description text,
  category character varying(100),
  product_posting_group character varying(20),
  unit character varying(50) DEFAULT 'Piece'::character varying,
  cost_price numeric(15,2) DEFAULT 0,
  cost_price_usd numeric(15,4) DEFAULT 0,
  selling_price numeric(15,2) DEFAULT 0,
  qty_on_hand numeric(15,3) DEFAULT 0,
  reorder_point numeric(15,3) DEFAULT 10,
  supplier_id uuid,
  costing_method character varying(20) DEFAULT 'average'::character varying,
  vat_code character varying(20),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  barcode character varying(50),
  image_url text,
  preferred_supplier_id uuid,
  lead_time_days integer DEFAULT 30,
  min_margin_pct numeric(5,2) DEFAULT 0,
  allow_sell_below_cost boolean DEFAULT false,
  wholesale_price numeric DEFAULT 0,
  moq integer DEFAULT 1,
  video_url text,
  short_description text,
  pregnancy_stage text,
  instagram_url text,
  sold_base integer DEFAULT 0 NOT NULL,
  sold_daily_increment integer DEFAULT 0 NOT NULL,
  sold_base_date date DEFAULT CURRENT_DATE NOT NULL,
  urgency_active boolean DEFAULT false NOT NULL,
  urgency_text text DEFAULT 'Few pieces remaining'::text NOT NULL,
  expert_endorsed boolean DEFAULT false NOT NULL,
  expert_endorsement_text text,
  recovery_window text,
  howto_video_url text,
  show_retail boolean DEFAULT true NOT NULL,
  show_wholesale boolean DEFAULT true NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  feedback_window_days integer,
  is_hero boolean DEFAULT false NOT NULL,
  hero_subtitle text
);

CREATE TABLE public.recurring_expenses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  amount numeric(14,2) NOT NULL,
  account_id uuid,
  supplier_id uuid,
  frequency text DEFAULT 'monthly'::text NOT NULL,
  day_of_month integer,
  day_of_week integer,
  next_due_date date,
  last_paid_date date,
  last_paid_ref text,
  is_active boolean DEFAULT true NOT NULL,
  notes text,
  created_by text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.referrals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  referrer_id uuid,
  referrer_name text,
  referee_id uuid,
  referee_name text,
  referee_whatsapp text,
  referral_code text,
  status text DEFAULT 'pending'::text,
  reward_type text DEFAULT 'points'::text,
  reward_amount numeric(12,2) DEFAULT 0,
  reward_paid boolean DEFAULT false,
  first_purchase_id uuid,
  first_purchase_amount numeric(12,2),
  converted_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.reorder_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid,
  product_name character varying(200),
  sku character varying(50),
  qty_on_hand numeric,
  reorder_point numeric,
  alerted_at timestamp with time zone DEFAULT now(),
  acknowledged boolean DEFAULT false,
  acknowledged_by character varying(100),
  acknowledged_at timestamp with time zone
);

CREATE TABLE public.role_permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  role_id uuid,
  permission_id uuid
);

CREATE TABLE public.roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name character varying(50) NOT NULL,
  description text,
  is_system boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.sales_archive (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  month text NOT NULL,
  year integer NOT NULL,
  sales numeric(15,2) DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sales_targets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  period_type text NOT NULL,
  metric text NOT NULL,
  target_value numeric NOT NULL,
  product_id uuid,
  category text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT true,
  notes text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.shop_problems (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  emoji text DEFAULT '🤰'::text NOT NULL,
  label_en text NOT NULL,
  label_sw text NOT NULL,
  description text,
  color text DEFAULT '#E8A0BF'::text,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.shop_services (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  logo_url text,
  link_url text,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.shop_settings (
  key text NOT NULL,
  value jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.shop_stock_status (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  product_id uuid NOT NULL,
  in_stock boolean DEFAULT false,
  has_booklet boolean DEFAULT false,
  last_confirmed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.stage_product_recommendations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  life_stage text NOT NULL,
  life_substage text,
  product_id uuid NOT NULL,
  priority integer DEFAULT 1 NOT NULL,
  notes text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.stock_locations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code character varying(4) NOT NULL,
  branch_id uuid,
  branch_code character varying(2),
  name character varying(100) NOT NULL,
  location_type character varying(20) DEFAULT 'storage'::character varying,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  allow_cash_sale boolean DEFAULT true,
  allow_sales_invoice boolean DEFAULT true,
  allow_grn boolean DEFAULT true,
  allow_stock_transfer boolean DEFAULT true,
  allow_adjustment boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.stock_transfer_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ref text NOT NULL,
  requested_by uuid NOT NULL,
  from_location_id uuid NOT NULL,
  to_location_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  reason text,
  notes text,
  lines jsonb NOT NULL,
  total_value numeric DEFAULT 0 NOT NULL,
  approved_by uuid,
  approved_at timestamp with time zone,
  rejected_reason text,
  voucher_id uuid,
  journal_id uuid,
  execution_error text,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.suppliers (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  code character varying(20) NOT NULL,
  name character varying(255) NOT NULL,
  contact_person character varying(255),
  phone character varying(20),
  email character varying(255),
  address text,
  country character varying(100),
  currency character varying(3) DEFAULT 'USD'::character varying,
  payment_terms character varying(50) DEFAULT 'NET30'::character varying,
  ap_account_id uuid,
  balance_tzs numeric(15,2) DEFAULT 0,
  balance_usd numeric(15,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  lead_time_days integer DEFAULT 30
);

CREATE TABLE public.system_settings (
  key character varying NOT NULL,
  value text,
  updated_at timestamp with time zone DEFAULT now(),
  fiscal_year_start_month integer DEFAULT 1,
  go_live_date date,
  opening_balance_status text DEFAULT 'draft'::text,
  allow_posting_to_locked boolean DEFAULT false,
  max_backdate_days integer DEFAULT 30,
  require_narration boolean DEFAULT false,
  eod_lock_enabled boolean DEFAULT false
);

CREATE TABLE public.user_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  token_hash character varying(64),
  ip_address inet,
  user_agent text,
  device_type character varying(20),
  is_active boolean DEFAULT true,
  last_activity timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.users (
  id uuid NOT NULL,
  email character varying(255) NOT NULL,
  full_name character varying(100) NOT NULL,
  initials character varying(5),
  phone character varying(20),
  role_id uuid,
  reports_to uuid,
  is_active boolean DEFAULT true,
  is_approver boolean DEFAULT false,
  backup_approver_id uuid,
  is_away boolean DEFAULT false,
  away_until date,
  avatar_url text,
  last_login timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  permissions text[] DEFAULT '{}'::text[],
  is_super_admin boolean DEFAULT false NOT NULL,
  allowed_location_id uuid
);

CREATE TABLE public.value_entries (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  entry_number integer DEFAULT nextval('value_entries_entry_number_seq'::regclass) NOT NULL,
  item_ledger_entry_id uuid,
  product_id uuid,
  posting_date date NOT NULL,
  entry_type character varying(30),
  item_ledger_entry_type character varying(30),
  valued_qty numeric(15,3) DEFAULT 0,
  cost_amount_actual numeric(15,2) DEFAULT 0,
  cost_amount_expected numeric(15,2) DEFAULT 0,
  cost_per_unit numeric(15,4) DEFAULT 0,
  document_ref character varying(50),
  is_adjusted boolean DEFAULT false,
  invoiced_qty numeric(15,3) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.vat_setup (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  code character varying(20) NOT NULL,
  description character varying(255),
  vat_rate numeric(5,2) DEFAULT 18.00,
  vat_payable_account_id uuid,
  vat_receivable_account_id uuid,
  is_default boolean DEFAULT false
);

CREATE TABLE public.vendor_ledger_entries (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  entry_number integer DEFAULT nextval('vendor_ledger_entries_entry_number_seq'::regclass) NOT NULL,
  supplier_id uuid,
  posting_date date NOT NULL,
  document_type character varying(30),
  document_ref character varying(50),
  description text,
  amount_tzs numeric(15,2) NOT NULL,
  amount_usd numeric(15,4) DEFAULT 0,
  exchange_rate numeric(12,4) DEFAULT 1,
  remaining_amount numeric(15,2) DEFAULT 0,
  is_open boolean DEFAULT true,
  due_date date,
  closed_at date,
  journal_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  import_order_ref text
);

CREATE TABLE public.voucher_lines (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  voucher_id uuid,
  line_number integer NOT NULL,
  product_id uuid,
  description text,
  qty numeric(15,3) DEFAULT 1,
  unit_cost numeric(15,2) DEFAULT 0,
  unit_price numeric(15,2) DEFAULT 0,
  discount_pct numeric(5,2) DEFAULT 0,
  subtotal numeric(15,2) DEFAULT 0,
  vat_code character varying(20),
  vat_amount numeric(15,2) DEFAULT 0,
  total numeric(15,2) DEFAULT 0,
  dimension_pl character varying(20),
  created_at timestamp with time zone DEFAULT now(),
  is_referral_giveaway boolean DEFAULT false NOT NULL
);

CREATE TABLE public.vouchers (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  ref text NOT NULL,
  type character varying(50) NOT NULL,
  posting_date date NOT NULL,
  description text,
  subtotal numeric(15,2) DEFAULT 0,
  vat_amount numeric(15,2) DEFAULT 0,
  total_amount numeric(15,2) DEFAULT 0,
  currency character varying(3) DEFAULT 'TZS'::character varying,
  amount_usd numeric(15,4) DEFAULT 0,
  exchange_rate numeric(12,4) DEFAULT 1,
  status character varying(20) DEFAULT 'posted'::character varying,
  branch character varying(100) DEFAULT 'DSM HQ'::character varying,
  customer_id uuid,
  supplier_id uuid,
  journal_id uuid,
  payment_method character varying(30),
  due_date date,
  notes text,
  posted_by character varying(255),
  dimension_bu character varying(20),
  dimension_ch character varying(20),
  dimension_camp character varying(20),
  created_at timestamp with time zone DEFAULT now(),
  payment_terms character varying(20),
  payment_split jsonb,
  po_reference text,
  delivery_address text,
  approval_request_id uuid,
  expense_category text,
  tags text[],
  posted_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  referral_id uuid
);

CREATE TABLE public.wati_conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  wati_id character varying(255),
  phone_number character varying(20) NOT NULL,
  customer_id uuid,
  customer_name character varying(255),
  last_message_at timestamp with time zone,
  unread_count integer DEFAULT 0,
  status character varying(20) DEFAULT 'open'::character varying,
  assigned_to uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.wati_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid NOT NULL,
  message_type character varying(20) DEFAULT 'text'::character varying,
  content text,
  sender character varying(20) NOT NULL,
  wati_message_id character varying(255),
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.wati_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  api_key character varying(500) NOT NULL,
  account_id character varying(100) NOT NULL,
  phone_number character varying(20) NOT NULL,
  is_active boolean DEFAULT true,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.whatsapp_resources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint DEFAULT 0 NOT NULL,
  is_public boolean DEFAULT true NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid
);

CREATE TABLE public.whatsapp_send_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid,
  customer_id uuid NOT NULL,
  sent_by uuid,
  sent_at timestamp with time zone DEFAULT now() NOT NULL,
  merged_body text NOT NULL
);

CREATE TABLE public.whatsapp_sends (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid,
  customer_name character varying(200),
  phone character varying(30),
  message_type character varying(20),
  voucher_ref character varying(50),
  provider character varying(20),
  status character varying(10),
  message_id character varying(200),
  error text,
  sent_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.whatsapp_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  body text NOT NULL,
  is_transactional boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  use_count integer DEFAULT 0 NOT NULL,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid
);

-- ===== END OF SCHEMA DUMP =====
SET session_replication_role = DEFAULT;
