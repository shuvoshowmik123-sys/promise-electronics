-- Migration 0005: Client class system + job ticket extensions
-- Phase A (client_class foundation) + Phase C.5 (universal job ticket)
-- 2026-05-28
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS / ON CONFLICT DO NOTHING

-- ── 1. corporate_clients: add tier discriminator ──────────────────────────────
ALTER TABLE corporate_clients
  ADD COLUMN IF NOT EXISTS client_class TEXT NOT NULL DEFAULT 'b2b_normal';

-- ── 2. job_tickets: add client class + bulk intake + incomplete-TV fields ─────
ALTER TABLE job_tickets
  ADD COLUMN IF NOT EXISTS client_class    TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS batch_id        TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS missing_parts   JSONB   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS parts_lineitems JSONB   NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_job_tickets_batch_id     ON job_tickets(batch_id);
CREATE INDEX IF NOT EXISTS idx_job_tickets_client_class ON job_tickets(client_class);

-- ── 3. client_class_policies table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_class_policies (
  id             TEXT      PRIMARY KEY,
  client_class   TEXT      NOT NULL UNIQUE,
  sla_days       INTEGER   NOT NULL DEFAULT 1,
  priority       TEXT      NOT NULL DEFAULT 'normal',
  payment_mode   TEXT      NOT NULL DEFAULT 'mixed',
  credit_allowed BOOLEAN   NOT NULL DEFAULT false,
  ai_tone        TEXT      NOT NULL DEFAULT 'warm',
  bill_layers    INTEGER   NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP
);

-- Seed default policies (idempotent)
INSERT INTO client_class_policies
  (id, client_class, sla_days, priority, payment_mode, credit_allowed, ai_tone, bill_layers)
VALUES
  ('ccp_online',        'online',        1, 'normal', 'mixed',     false, 'warm',   1),
  ('ccp_repeat',        'repeat',        1, 'high',   'mixed',     true,  'warm',   1),
  ('ccp_reference',     'reference',     1, 'high',   'mixed',     true,  'warm',   1),
  ('ccp_technician',    'technician',    5, 'low',    'cash_only', false, 'curt',   1),
  ('ccp_b2b_normal',    'b2b_normal',    7, 'normal', 'invoice',   true,  'formal', 1),
  ('ccp_b2b_corporate', 'b2b_corporate', 7, 'high',   'invoice',   true,  'formal', 4)
ON CONFLICT (client_class) DO NOTHING;

-- ── 4. job_batches table (bulk intake parent) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS job_batches (
  id                  TEXT      PRIMARY KEY,
  batch_number        TEXT      UNIQUE,
  client_class        TEXT      DEFAULT 'online',
  corporate_client_id TEXT      REFERENCES corporate_clients(id),
  customer_id         TEXT,
  intake_date         TIMESTAMP NOT NULL DEFAULT NOW(),
  receiver            TEXT,
  notes               TEXT,
  total_items         INTEGER   DEFAULT 0,
  created_by          TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_batches_corporate   ON job_batches(corporate_client_id);
CREATE INDEX IF NOT EXISTS idx_job_batches_created_at  ON job_batches(created_at);
CREATE INDEX IF NOT EXISTS idx_job_batches_client_class ON job_batches(client_class);

-- ── 5. staff_presence table (Phase B — inbox auto-assign) ─────────────────────
CREATE TABLE IF NOT EXISTS staff_presence (
  staff_id    TEXT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT      NOT NULL DEFAULT 'offline',  -- 'online' | 'away' | 'offline'
  channels    JSONB     NOT NULL DEFAULT '[]',        -- ['messenger', 'whatsapp']
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_presence_status ON staff_presence(status);

-- ── 6. customers canonical table (Phase C — credential binding) ───────────────
CREATE TABLE IF NOT EXISTS customers (
  id              TEXT      PRIMARY KEY,
  primary_phone   TEXT      UNIQUE,
  alt_phones      JSONB     NOT NULL DEFAULT '[]',
  name            TEXT,
  address         TEXT,
  area            TEXT,
  gmail           TEXT,
  client_class    TEXT      NOT NULL DEFAULT 'online',
  referrer_id     TEXT      REFERENCES customers(id),
  is_shop_name    BOOLEAN   DEFAULT false,
  total_jobs      INTEGER   NOT NULL DEFAULT 0,
  total_spend     REAL      NOT NULL DEFAULT 0,
  first_seen_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  last_job_at     TIMESTAMP,
  notes           TEXT,
  store_id        TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_primary_phone ON customers(primary_phone);
CREATE INDEX IF NOT EXISTS idx_customers_client_class  ON customers(client_class);
CREATE INDEX IF NOT EXISTS idx_customers_last_job_at   ON customers(last_job_at);
