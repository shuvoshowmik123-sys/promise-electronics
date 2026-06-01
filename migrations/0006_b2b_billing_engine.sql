-- Migration 0006: B2B billing engine (Phase G)
-- billing_profiles, quote_logs, corporate_bills, bill_line_items, bill_edit_log
-- + source column on job_tickets (Phase F)
-- 2026-05-28
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. source column on job_tickets (Phase F, applied inline earlier) ─────────
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL;

-- ── 2. billing_profiles ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_profiles (
  id                        TEXT      PRIMARY KEY,
  corporate_client_id       TEXT      NOT NULL REFERENCES corporate_clients(id) ON DELETE CASCADE,
  tier                      TEXT      NOT NULL DEFAULT 'normal',
  scatter_billing_enabled   BOOLEAN   DEFAULT false,
  scatter_billing_mode      TEXT      DEFAULT 'reactive',
  requires_serial_match     BOOLEAN   DEFAULT false,
  requires_model_match      BOOLEAN   DEFAULT false,
  supplies_spare_parts_to_us BOOLEAN  DEFAULT false,
  spare_part_handling       TEXT      DEFAULT 'use_if_needed',
  acceptance_criteria       TEXT      DEFAULT 'per_unit_decision',
  invoice_criteria_json     JSONB     DEFAULT '{}',
  sla_days                  INTEGER   NOT NULL DEFAULT 7,
  sla_breach_action         TEXT      DEFAULT 'notify_and_extend',
  invoice_template_id       TEXT,
  quote_channel             TEXT      DEFAULT 'phone_verbal',
  default_amount_range_min  INTEGER,
  default_amount_range_max  INTEGER,
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_profiles_client ON billing_profiles(corporate_client_id);

-- Seed default billing profiles for all existing corporate clients
INSERT INTO billing_profiles (id, corporate_client_id, tier, sla_days)
SELECT
  'bp_' || substring(id, 1, 8),
  id,
  COALESCE(client_class, 'b2b_normal'),
  7
FROM corporate_clients
ON CONFLICT (corporate_client_id) DO NOTHING;

-- ── 3. quote_logs (phone-call verbal quotes) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_logs (
  id                   TEXT      PRIMARY KEY,
  corporate_client_id  TEXT      REFERENCES corporate_clients(id),
  job_id               TEXT,
  caller_name          TEXT,
  caller_phone         TEXT,
  approved_by_name     TEXT,
  verbal_amount        REAL,
  currency             TEXT      DEFAULT 'BDT',
  notes                TEXT,
  logged_by            TEXT      NOT NULL,
  called_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quote_logs_client ON quote_logs(corporate_client_id);
CREATE INDEX IF NOT EXISTS idx_quote_logs_job    ON quote_logs(job_id);

-- ── 4. corporate_bills — extend EXISTING table with scatter-billing columns ────
-- Table already exists in DB. Only ADD new columns (never drop/replace).
ALTER TABLE corporate_bills
  ADD COLUMN IF NOT EXISTS bill_status           TEXT    DEFAULT 'active',  -- 'active'|'superseded'|'draft'
  ADD COLUMN IF NOT EXISTS issued_at             TIMESTAMP,
  ADD COLUMN IF NOT EXISTS superseded_by_bill_ids JSONB  DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS superseded_at         TIMESTAMP,
  ADD COLUMN IF NOT EXISTS superseded_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS superseded_reason     TEXT,
  ADD COLUMN IF NOT EXISTS created_by            TEXT,
  ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_corporate_bills_client     ON corporate_bills(corporate_client_id);
CREATE INDEX IF NOT EXISTS idx_corporate_bills_bill_status ON corporate_bills(bill_status);

-- ── 5. bill_line_items (one per TV on a bill) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS bill_line_items (
  id                   TEXT      PRIMARY KEY,
  bill_id              TEXT      NOT NULL REFERENCES corporate_bills(id) ON DELETE CASCADE,
  job_ticket_id        TEXT,
  device_serial        TEXT,
  device_model         TEXT,
  charge_description   TEXT,
  amount               REAL      NOT NULL DEFAULT 0,
  moved_from_bill_id   TEXT,
  moved_at             TIMESTAMP,
  moved_by_user_id     TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_bill ON bill_line_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_job  ON bill_line_items(job_ticket_id);

-- ── 6. bill_edit_log (immutable audit trail) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS bill_edit_log (
  id            TEXT      PRIMARY KEY,
  bill_id       TEXT      NOT NULL,
  action        TEXT      NOT NULL,
  before_json   JSONB,
  after_json    JSONB,
  performed_by  TEXT      NOT NULL,
  performed_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  reason        TEXT
);
CREATE INDEX IF NOT EXISTS idx_bill_edit_log_bill ON bill_edit_log(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_edit_log_time ON bill_edit_log(performed_at);
