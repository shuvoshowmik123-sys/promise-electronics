import { createHash } from "node:crypto";
import pg from "pg";
import {
  isAdoptionExpectedChecksumSessionActive,
  resolveExpectedLedgerChecksum,
} from "./adoption-expected-checksum-session.js";

const { Pool } = pg;

/**
 * When MAIN_SCHEMA_TRUST_BASELINE_ADOPTION=true, activate disposable adoption session
 * (gate + manifest + frozen B, then expected ledger A) via dynamic import to avoid
 * circular static imports with baseline-adoption.service.
 * Fail-closed when the flag is set but adoption cannot activate.
 */
async function ensureDisposableAdoptionSessionIfRequested(): Promise<{
  ok: boolean;
  error: string | null;
}> {
  if (process.env.MAIN_SCHEMA_TRUST_BASELINE_ADOPTION !== "true") {
    return { ok: true, error: null };
  }
  if (isAdoptionExpectedChecksumSessionActive()) {
    return { ok: true, error: null };
  }
  try {
    const adoption = await import("./baseline-adoption.service.js");
    const result = await adoption.activateDisposableBaselineAdoption({
      env: process.env,
      databaseUrl: process.env.DATABASE_URL,
    });
    if (!result.sessionActive) {
      const reason =
        result.verification.reasons.join(" | ") ||
        result.verification.adoptionDecision ||
        "adoption not accepted";
      return {
        ok: false,
        error: `MAIN_SCHEMA_TRUST_BASELINE_ADOPTION is set but disposable adoption failed: ${reason}`,
      };
    }
    return { ok: true, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `MAIN_SCHEMA_TRUST_BASELINE_ADOPTION is set but adoption activation threw: ${msg.slice(0, 200)}`,
    };
  }
}

export type MigrationStatus = "pending" | "running" | "complete" | "failed" | "lock_timeout";

export interface MainSchemaMigration {
  id: string;
  description: string;
  up: (client: pg.Client) => Promise<void>;
}

export interface MainSchemaResult {
  status: "complete" | "failed" | "lock_timeout" | "skipped";
  appliedIds: string[];
  failedId: string | null;
  error: string | null;
  durationMs: number;
  requiredVersion: string;
  currentVersion: string | null;
}

const ADVISORY_LOCK_KEY = "promise_main_schema_migrate";
const LOCK_WAIT_BUDGET_MS = parseInt(process.env.MAIN_MIGRATION_LOCK_WAIT_MS || "60000", 10);
const LOCK_POLL_INTERVAL_MS = parseInt(process.env.MAIN_MIGRATION_LOCK_POLL_MS || "1000", 10);

export const REQUIRED_MAIN_SCHEMA_VERSION = "2026_07_25_work_locations_table";

export const MAIN_SCHEMA_MIGRATIONS: MainSchemaMigration[] = [
  {
    id: "0000_promise_schema_migrations_ledger",
    description: "Create the promise_schema_migrations ledger table",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS promise_schema_migrations (
        id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        applied_by TEXT,
        duration_ms INTEGER
      )`);
    },
  },
  {
    id: "0001_test_injected_failure",
    description: "TEST ONLY — creates harmless marker table, fails when env var set (rollback proof)",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS promise_test_rollback_marker (id TEXT PRIMARY KEY, note TEXT)`);
      if (process.env.MAIN_MIGRATION_TEST_INJECT_FAILURE === "true") {
        throw new Error("TEST_INJECTED_FAILURE_P5");
      }
    },
  },
  {
    id: "2026_07_17_b2b_rule_profile",
    description: "B2B rule profile columns, job extension requests, corporate password reset",
    up: async (client) => {
      await client.query(`ALTER TABLE corporate_clients ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'corporate'`);
      await client.query(`ALTER TABLE corporate_clients ADD COLUMN IF NOT EXISTS rule_profile JSONB DEFAULT '{}'::jsonb`);
      await client.query(`ALTER TABLE corporate_clients ADD COLUMN IF NOT EXISTS default_batch_clearance_days INTEGER NOT NULL DEFAULT 7`);
      await client.query(`ALTER TABLE corporate_clients ADD COLUMN IF NOT EXISTS service_warranty_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
      await client.query(`ALTER TABLE corporate_clients ADD COLUMN IF NOT EXISTS default_service_warranty_days INTEGER NOT NULL DEFAULT 30`);
      await client.query(`ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS target_clear_date TIMESTAMP`);
      await client.query(`ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP`);
      await client.query(`ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS batch_status TEXT NOT NULL DEFAULT 'open'`);
      await client.query(`ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS extension_count INTEGER NOT NULL DEFAULT 0`);
      await client.query(`ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS corporate_challan_id TEXT`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS batch_target_clear_date TIMESTAMP`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS extension_status TEXT DEFAULT 'none'`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS extension_requested_until TIMESTAMP`);
      await client.query(`CREATE TABLE IF NOT EXISTS job_extension_requests (
        id TEXT PRIMARY KEY,
        corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id) ON DELETE CASCADE,
        batch_id TEXT REFERENCES job_batches(id) ON DELETE SET NULL,
        job_id TEXT NOT NULL REFERENCES job_tickets(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        requested_until TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_by TEXT,
        response_note TEXT,
        responded_by TEXT,
        responded_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_extension_requests_client ON job_extension_requests (corporate_client_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_extension_requests_batch ON job_extension_requests (batch_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_extension_requests_job ON job_extension_requests (job_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_extension_requests_status ON job_extension_requests (status)`);
      await client.query(`CREATE TABLE IF NOT EXISTS corporate_password_reset_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id) ON DELETE CASCADE,
        code_hash TEXT,
        status TEXT NOT NULL DEFAULT 'requested',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        requested_ip TEXT,
        issued_by_admin_id TEXT,
        expires_at TIMESTAMP,
        used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_password_reset_user ON corporate_password_reset_requests (user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_password_reset_client ON corporate_password_reset_requests (corporate_client_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_password_reset_status ON corporate_password_reset_requests (status)`);
    },
  },
  {
    id: "2026_07_17_manual_payment_tables",
    description: "Manual payments table + indexes",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS manual_payments (
        id TEXT PRIMARY KEY,
        job_ticket_id TEXT,
        service_request_id TEXT,
        due_record_id TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        method TEXT NOT NULL,
        amount REAL NOT NULL,
        sender_number TEXT,
        transaction_id TEXT,
        proof_url TEXT,
        source TEXT NOT NULL DEFAULT 'admin_manual',
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        verified_by TEXT,
        verified_at TIMESTAMP,
        rejected_by TEXT,
        rejected_at TIMESTAMP,
        rejection_reason TEXT,
        applied_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await client.query(`ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin_manual'`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_manual_payments_status ON manual_payments (status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_manual_payments_source ON manual_payments (source)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_manual_payments_job_ticket ON manual_payments (job_ticket_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_manual_payments_service_request ON manual_payments (service_request_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_manual_payments_transaction ON manual_payments (transaction_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_manual_payments_created_at ON manual_payments (created_at DESC)`);
    },
  },
  {
    id: "2026_07_17_customer_repair_journey",
    description: "Customer repair journey tables + indexes",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS customer_repair_journeys (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        service_request_id TEXT,
        quote_request_id TEXT,
        job_ticket_id TEXT,
        current_stage TEXT NOT NULL DEFAULT 'draft',
        current_status TEXT NOT NULL DEFAULT 'active',
        customer_friendly_status TEXT NOT NULL DEFAULT 'We received your request. Our team will review it soon.',
        next_action TEXT,
        next_action_label TEXT,
        next_update_eta TIMESTAMP,
        service_mode TEXT NOT NULL DEFAULT 'quote_only',
        pickup_required BOOLEAN NOT NULL DEFAULT FALSE,
        dropoff_required BOOLEAN NOT NULL DEFAULT FALSE,
        customer_note TEXT,
        admin_note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS customer_repair_journey_events (
        id TEXT PRIMARY KEY,
        journey_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        actor_type TEXT NOT NULL DEFAULT 'system',
        actor_id TEXT,
        metadata JSONB DEFAULT '{}',
        is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS customer_repair_schedules (
        id TEXT PRIMARY KEY,
        journey_id TEXT NOT NULL,
        schedule_type TEXT NOT NULL,
        requested_date DATE,
        requested_time_window TEXT,
        confirmed_date DATE,
        confirmed_time_window TEXT,
        status TEXT NOT NULL DEFAULT 'requested',
        customer_note TEXT,
        admin_note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_crj_customer_id ON customer_repair_journeys (customer_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_crj_service_request_id ON customer_repair_journeys (service_request_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_crj_quote_request_id ON customer_repair_journeys (quote_request_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_crj_job_ticket_id ON customer_repair_journeys (job_ticket_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_crj_current_stage ON customer_repair_journeys (current_stage)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_crj_created_at ON customer_repair_journeys (created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_crje_journey_id ON customer_repair_journey_events (journey_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_crje_created_at ON customer_repair_journey_events (created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_crs_journey_id ON customer_repair_schedules (journey_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_crs_status ON customer_repair_schedules (status)`);
      await client.query(`ALTER TABLE customer_repair_schedules ADD COLUMN IF NOT EXISTS assigned_driver_id TEXT`);
      await client.query(`ALTER TABLE customer_repair_schedules ADD COLUMN IF NOT EXISTS zone TEXT`);
      await client.query(`ALTER TABLE customer_repair_schedules ADD COLUMN IF NOT EXISTS route_order INTEGER`);
      await client.query(`ALTER TABLE customer_repair_schedules ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMP`);
      await client.query(`ALTER TABLE customer_repair_schedules ADD COLUMN IF NOT EXISTS pickup_schedule_id TEXT`);
      await client.query(`ALTER TABLE customer_repair_journeys ADD COLUMN IF NOT EXISTS warranty_claim_id TEXT`);
    },
  },
  {
    id: "2026_07_17_staff_reset_codes",
    description: "Staff reset codes table + indexes",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS staff_reset_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_reset_codes_user_id ON staff_reset_codes (user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_reset_codes_expires ON staff_reset_codes (expires_at)`);
    },
  },
  {
    id: "2026_07_17_password_changed_at",
    description: "users.password_changed_at column",
    up: async (client) => {
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP`);
    },
  },
  {
    id: "2026_07_17_operational_fields_ddl",
    description: "Operational fields DDL only (no creator backfill)",
    up: async (client) => {
      await client.query(`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`);
      await client.query(`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS customer_phone TEXT`);
      await client.query(`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS device_name TEXT`);
      await client.query(`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS old_reference TEXT`);
      await client.query(`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS note TEXT`);
      await client.query(`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS created_by TEXT`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspection_result TEXT DEFAULT 'pending'`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspection_note TEXT`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspected_by TEXT`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMP`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS created_by_user_id TEXT`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS created_by_name TEXT`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_tickets_created_by_user_id ON job_tickets (created_by_user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_tickets_assigned_technician_id ON job_tickets (assigned_technician_id)`);
    },
  },
  {
    id: "2026_07_17_call_attempts",
    description: "service_request_call_attempts table + indexes",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS service_request_call_attempts (
        id TEXT PRIMARY KEY,
        service_request_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        staff_name TEXT NOT NULL,
        call_type TEXT NOT NULL DEFAULT 'follow_up',
        scheduled_at TIMESTAMP,
        called_at TIMESTAMP,
        outcome TEXT,
        next_action TEXT,
        callback_at TIMESTAMP,
        customer_mood TEXT,
        notes TEXT,
        customer_visible_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_call_attempts_sr ON service_request_call_attempts (service_request_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_call_attempts_callback ON service_request_call_attempts (callback_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_call_attempts_outcome ON service_request_call_attempts (outcome)`);
    },
  },
  {
    id: "2026_07_17_staff_invitations",
    description: "staff_invitations table + indexes",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS staff_invitations (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        permissions TEXT NOT NULL DEFAULT '{}',
        phone TEXT,
        email TEXT,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMP NOT NULL,
        created_by TEXT NOT NULL,
        redeemed_by TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        redeemed_at TIMESTAMP,
        revoked_at TIMESTAMP,
        regenerated_from_id TEXT
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_inv_token ON staff_invitations (token_hash)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_inv_status ON staff_invitations (status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_inv_expires ON staff_invitations (expires_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_inv_phone ON staff_invitations (phone)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_inv_email ON staff_invitations (email)`);
    },
  },
  {
    id: "2026_07_17_corporate_setup_tokens",
    description: "corporate_setup_tokens table + indexes",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS corporate_setup_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'setup',
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corp_setup_tokens_user ON corporate_setup_tokens (user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corp_setup_tokens_hash ON corporate_setup_tokens (token_hash)`);
    },
  },
  {
    id: "2026_07_17_logistics_tasks_ddl",
    description: "logistics_tasks table DDL only (no backfill)",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS logistics_tasks (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL DEFAULT 'pickup',
        source_type TEXT NOT NULL DEFAULT 'service_request',
        service_request_id TEXT,
        job_ticket_id TEXT,
        customer_id TEXT,
        customer_name TEXT NOT NULL DEFAULT '',
        customer_phone TEXT,
        customer_phone_normalized TEXT,
        pickup_address TEXT,
        delivery_address TEXT,
        scheduled_date TIMESTAMP,
        time_window TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        assigned_driver_id TEXT,
        assigned_driver_name TEXT,
        zone TEXT,
        route_order INTEGER,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        proof_photo_url TEXT,
        signature_url TEXT,
        notes TEXT,
        failure_reason TEXT,
        reschedule_reason TEXT,
        completed_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_sr ON logistics_tasks (service_request_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_job ON logistics_tasks (job_ticket_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_status ON logistics_tasks (status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_driver ON logistics_tasks (assigned_driver_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_type ON logistics_tasks (task_type)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_date ON logistics_tasks (scheduled_date)`);
      await client.query(`ALTER TABLE logistics_tasks ADD COLUMN IF NOT EXISTS legacy_pickup_schedule_id TEXT`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_legacy_pu ON logistics_tasks (legacy_pickup_schedule_id)`);
    },
  },
  {
    id: "2026_07_17_service_area_ddl",
    description: "Service area tables DDL only (no data backfill; parent for POS integrity)",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS service_areas (
        id TEXT PRIMARY KEY,
        city TEXT NOT NULL DEFAULT 'Dhaka',
        area_name TEXT NOT NULL,
        subarea_name TEXT,
        block_or_sector TEXT,
        normalized_key TEXT NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_service_areas_is_active ON service_areas (is_active)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_service_areas_city_area ON service_areas (city, area_name)`);
      await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS service_area_id TEXT`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_service_area_id ON service_requests (service_area_id)`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS service_area_id TEXT`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_tickets_service_area_id ON job_tickets (service_area_id)`);
      await client.query(`ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS service_area_id TEXT`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pos_transactions_service_area_id ON pos_transactions (service_area_id)`);
      await client.query(`ALTER TABLE warranty_claims ADD COLUMN IF NOT EXISTS service_area_id TEXT`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_warranty_claims_service_area_id ON warranty_claims (service_area_id)`);
      await client.query(`CREATE TABLE IF NOT EXISTS pos_transaction_area_allocations (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        job_ticket_id TEXT,
        service_area_id TEXT NOT NULL,
        billed_amount REAL NOT NULL CHECK (billed_amount >= 0),
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_area_alloc_transaction_job ON pos_transaction_area_allocations (transaction_id, job_ticket_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pos_area_alloc_transaction_id ON pos_transaction_area_allocations (transaction_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pos_area_alloc_job_ticket_id ON pos_transaction_area_allocations (job_ticket_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pos_area_alloc_service_area_id ON pos_transaction_area_allocations (service_area_id)`);
      await client.query(`ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS centroid_latitude DOUBLE PRECISION`);
      await client.query(`ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS centroid_longitude DOUBLE PRECISION`);
      await client.query(`ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS boundary_geo_json JSONB`);
      await client.query(`ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS geometry_updated_at TIMESTAMP`);
      await client.query(`ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_service_areas_is_public ON service_areas (is_public)`);
    },
  },
  {
    id: "2026_07_17_job_ng_reports",
    description: "job_ng_reports table + indexes (parent for NG customer decisions)",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS job_ng_reports (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES job_tickets(id) ON DELETE RESTRICT,
        submission_id TEXT NOT NULL,
        failed_repair_type TEXT NOT NULL,
        diagnosis TEXT NOT NULL,
        technical_notes TEXT NOT NULL,
        evidence_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
        parts_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        source_job_status TEXT NOT NULL,
        report_status TEXT NOT NULL DEFAULT 'pending_review',
        reported_by_user_id TEXT NOT NULL,
        reported_by_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        reported_at TIMESTAMP NOT NULL DEFAULT NOW(),
        reviewed_by_user_id TEXT,
        reviewed_by_snapshot JSONB,
        reviewed_at TIMESTAMP,
        review_notes TEXT,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_job_ng_reports_submission_id ON job_ng_reports (submission_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_ng_reports_job_id ON job_ng_reports (job_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_ng_reports_status ON job_ng_reports (report_status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_ng_reports_reported_at ON job_ng_reports (reported_at DESC)`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_job_ng_reports_one_active_per_job ON job_ng_reports (job_id) WHERE report_status IN ('pending_review', 'verified')`);
      await client.query(`ALTER TABLE job_ng_reports ADD COLUMN IF NOT EXISTS source_problem_found TEXT`);
      await client.query(`ALTER TABLE job_ng_reports ADD COLUMN IF NOT EXISTS payload_fingerprint TEXT`);
    },
  },
  {
    id: "2026_07_17_job_ng_customer_decisions",
    description: "job_ng_customer_decisions table + FK + CHECKs (depends on job_ng_reports)",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS job_ng_customer_decisions (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES job_tickets(id) ON DELETE RESTRICT,
        submission_id TEXT NOT NULL,
        decision_type TEXT NOT NULL,
        contact_channel TEXT NOT NULL,
        decision_notes TEXT NOT NULL,
        payload_fingerprint TEXT,
        ng_report_id TEXT NOT NULL,
        ng_report_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        recorded_by_user_id TEXT NOT NULL,
        recorded_by_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_job_ng_customer_decisions_submission_id ON job_ng_customer_decisions (submission_id)`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_job_ng_customer_decisions_one_per_job ON job_ng_customer_decisions (job_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_ng_customer_decisions_job_id ON job_ng_customer_decisions (job_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_ng_customer_decisions_type ON job_ng_customer_decisions (decision_type)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_ng_customer_decisions_recorded_at ON job_ng_customer_decisions (recorded_at DESC)`);

      const fkExists = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_ng_customer_decisions_ng_report_id' AND conrelid = 'job_ng_customer_decisions'::regclass LIMIT 1`);
      if (fkExists.rows.length === 0) {
        await client.query(`ALTER TABLE job_ng_customer_decisions ADD CONSTRAINT fk_job_ng_customer_decisions_ng_report_id FOREIGN KEY (ng_report_id) REFERENCES job_ng_reports(id) ON DELETE RESTRICT`);
      }
      const decisionCheck = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = 'ck_job_ng_customer_decisions_decision_type' AND conrelid = 'job_ng_customer_decisions'::regclass LIMIT 1`);
      if (decisionCheck.rows.length === 0) {
        await client.query(`ALTER TABLE job_ng_customer_decisions ADD CONSTRAINT ck_job_ng_customer_decisions_decision_type CHECK (decision_type IN ('decline', 'repair_alternative', 'replacement', 'quote_required'))`);
      }
      const channelCheck = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = 'ck_job_ng_customer_decisions_contact_channel' AND conrelid = 'job_ng_customer_decisions'::regclass LIMIT 1`);
      if (channelCheck.rows.length === 0) {
        await client.query(`ALTER TABLE job_ng_customer_decisions ADD CONSTRAINT ck_job_ng_customer_decisions_contact_channel CHECK (contact_channel IN ('phone', 'in_person', 'message'))`);
      }
    },
  },
  {
    id: "2026_07_17_service_request_intake_ddl",
    description: "service_requests intake columns + indexes only (no scrub/backfill)",
    up: async (client) => {
      const cols: [string, string][] = [
        ["phone_normalized", "TEXT"],
        ["intake_source", "TEXT"],
        ["client_request_id", "TEXT"],
        ["idempotency_fingerprint", "TEXT"],
        ["source", "TEXT"],
      ];
      for (const [col, def] of cols) {
        await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS ${col} ${def}`);
      }
      await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_phone_normalized ON service_requests (phone_normalized)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_client_request_id ON service_requests (client_request_id) WHERE client_request_id IS NOT NULL`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_fingerprint_window ON service_requests (idempotency_fingerprint, created_at DESC) WHERE idempotency_fingerprint IS NOT NULL`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_service_requests_client_request_id ON service_requests (client_request_id, intake_source) WHERE client_request_id IS NOT NULL`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_idempotency_fingerprint ON service_requests (idempotency_fingerprint, phone_normalized) WHERE idempotency_fingerprint IS NOT NULL`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_idempotency_created ON service_requests (idempotency_fingerprint, phone_normalized, created_at DESC) WHERE idempotency_fingerprint IS NOT NULL`);
    },
  },
  {
    id: "2026_07_17_retail_quote_admin_acceptance",
    description: "retail_quote_admin_acceptances table + FK + index (fail-closed proof)",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS retail_quote_admin_acceptances (
        id TEXT PRIMARY KEY,
        service_request_id TEXT NOT NULL,
        admin_user_id TEXT NOT NULL,
        admin_name TEXT,
        confirmation_note TEXT NOT NULL,
        accepted_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
      const fkExists = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = 'fk_rqaa_service_request' LIMIT 1`);
      if (fkExists.rows.length === 0) {
        await client.query(`ALTER TABLE retail_quote_admin_acceptances ADD CONSTRAINT fk_rqaa_service_request FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE`);
      }
      await client.query(`CREATE INDEX IF NOT EXISTS idx_rqaa_service_request_id ON retail_quote_admin_acceptances (service_request_id)`);
      const proof = await client.query(`SELECT
        (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'retail_quote_admin_acceptances') AS table_ok,
        (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_rqaa_service_request_id') AS index_ok,
        (SELECT COUNT(*)::int FROM pg_constraint WHERE conname = 'fk_rqaa_service_request') AS fk_ok`);
      const row = proof.rows[0];
      if (!row || Number(row.table_ok) < 1 || Number(row.index_ok) < 1 || Number(row.fk_ok) < 1) {
        throw new Error(`[RetailQuoteAdminAcceptance] migration incomplete table=${row?.table_ok} index=${row?.index_ok} fk=${row?.fk_ok}`);
      }
    },
  },
  {
    id: "2026_07_17_challan_ownership",
    description: "challans ownership columns + indexes",
    up: async (client) => {
      await client.query(`ALTER TABLE challans ADD COLUMN IF NOT EXISTS created_by_user_id TEXT`);
      await client.query(`ALTER TABLE challans ADD COLUMN IF NOT EXISTS assigned_driver_id TEXT`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_challans_created_by_user_id ON challans (created_by_user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_challans_assigned_driver_id ON challans (assigned_driver_id)`);
    },
  },
  {
    id: "2026_07_17_attendance_location_ddl",
    description: "attendance_records location columns only (no reconcile)",
    up: async (client) => {
      await client.query(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_reference_lat DOUBLE PRECISION`);
      await client.query(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_reference_lng DOUBLE PRECISION`);
      await client.query(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_reference_radius_meters REAL`);
      await client.query(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_reference_lat DOUBLE PRECISION`);
      await client.query(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_reference_lng DOUBLE PRECISION`);
      await client.query(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_reference_radius_meters REAL`);
    },
  },
  {
    id: "2026_07_17_job_model_serial_outcome",
    description: "job_tickets model_number, serial_number, repair_outcome, closure_reason + indexes",
    up: async (client) => {
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS model_number TEXT`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS serial_number TEXT`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS repair_outcome TEXT`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS closure_reason TEXT`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_tickets_model ON job_tickets (model_number)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_tickets_serial ON job_tickets (serial_number)`);
    },
  },
  {
    id: "2026_07_17_job_warranty_columns",
    description: "job_tickets tv_serial_number, warranty_days, warranty_expiry_date + index",
    up: async (client) => {
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS tv_serial_number TEXT`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS warranty_days INTEGER DEFAULT 30`);
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS warranty_expiry_date TIMESTAMP`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_tickets_tv_serial_number ON job_tickets (tv_serial_number)`);
    },
  },
  {
    id: "2026_07_17_firebase_uid",
    description: "users.firebase_uid unique column + index",
    up: async (client) => {
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users (firebase_uid)`);
    },
  },
  {
    id: "2026_07_17_payment_blacklist",
    description: "payment_blacklist table + phone index",
    up: async (client) => {
      await client.query(`CREATE TABLE IF NOT EXISTS payment_blacklist (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        reason TEXT,
        added_by TEXT,
        added_by_name TEXT,
        service_request_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_payment_blacklist_phone ON payment_blacklist (phone)`);
    },
  },
  {
    id: "2026_07_17_backup_metadata_r2_ddl",
    description: "backup_metadata storage columns only (no data UPDATE backfill)",
    up: async (client) => {
      await client.query(`ALTER TABLE backup_metadata ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'google_drive'`);
      await client.query(`ALTER TABLE backup_metadata ADD COLUMN IF NOT EXISTS storage_object_key text`);
      await client.query(`ALTER TABLE backup_metadata ALTER COLUMN google_drive_file_id DROP NOT NULL`);
    },
  },
  {
    id: "2026_07_17_hot_path_indexes",
    description: "Hot-path indexes for tech scoping, notifications, audit, service requests",
    up: async (client) => {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_job_tickets_assigned_tech ON job_tickets (assigned_technician_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, read)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_severity_created ON audit_logs (severity, created_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_admin_interacted ON service_requests (admin_interacted)`);
    },
  },
  {
    id: "2026_07_17_pos_integrity",
    description: "POS integrity columns + refund allocations + constraints (depends on service areas)",
    up: async (client) => {
      await client.query(`ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS refunded_amount REAL NOT NULL DEFAULT 0`);
      await client.query(`ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'none'`);
      await client.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_transaction_area_allocations' AND column_name = 'service_area_id' AND is_nullable = 'NO') THEN ALTER TABLE pos_transaction_area_allocations ALTER COLUMN service_area_id DROP NOT NULL; END IF; END $$`);
      await client.query(`ALTER TABLE pos_transaction_area_allocations ADD COLUMN IF NOT EXISTS settlement_kind TEXT NOT NULL DEFAULT 'paid'`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pos_area_alloc_job_settlement ON pos_transaction_area_allocations (job_ticket_id, settlement_kind)`);
      await client.query(`ALTER TABLE refunds ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'invoice'`);
      await client.query(`ALTER TABLE refunds ADD COLUMN IF NOT EXISTS target_job_ticket_id TEXT`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_refunds_target_job ON refunds (target_job_ticket_id)`);
      await client.query(`CREATE TABLE IF NOT EXISTS refund_allocations (
        id TEXT PRIMARY KEY,
        refund_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        job_ticket_id TEXT,
        refund_amount REAL NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_refund_alloc_refund ON refund_allocations (refund_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_refund_alloc_txn ON refund_allocations (transaction_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_refund_alloc_job ON refund_allocations (job_ticket_id)`);
    },
  },
  {
    id: "2026_07_17_pos_idempotency",
    description: "POS idempotency columns + unique partial index",
    up: async (client) => {
      await client.query(`ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS client_request_id TEXT`);
      await client.query(`ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS created_by_user_id TEXT`);
      await client.query(`ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS idempotency_fingerprint TEXT`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_pos_txn_client_request_actor ON pos_transactions (created_by_user_id, client_request_id) WHERE client_request_id IS NOT NULL AND created_by_user_id IS NOT NULL`);
    },
  },
  {
    id: "2026_07_19_reminders_prerequisite_reconciliation",
    description: "Ledgered reconciliation for the canonical reminders prerequisite",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS reminders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_by TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT,
          remind_at TIMESTAMP NOT NULL,
          repeat TEXT,
          job_id TEXT REFERENCES job_tickets(id) ON DELETE SET NULL,
          is_sent BOOLEAN NOT NULL DEFAULT FALSE,
          sent_at TIMESTAMP,
          is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
          dismissed_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          claim_owner TEXT,
          claim_token TEXT,
          claim_until TIMESTAMP,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          delivery_status TEXT NOT NULL DEFAULT 'pending',
          last_attempt_at TIMESTAMP,
          next_attempt_at TIMESTAMP,
          last_failure_code TEXT
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders (user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders (remind_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_reminders_is_sent ON reminders (is_sent)`);
    },
  },
  {
    id: "2026_07_19_scheduler_delivery_claim_ddl",
    description: "Reminder delivery claim fields + abandonment SMS outbox (01C-B2-B1)",
    up: async (client) => {
      await client.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS claim_owner TEXT`);
      await client.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS claim_token TEXT`);
      await client.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS claim_until TIMESTAMP`);
      await client.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0`);
      await client.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending'`);
      await client.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP`);
      await client.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP`);
      await client.query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS last_failure_code TEXT`);
      await client.query(`
        UPDATE reminders
        SET delivery_status = 'delivered',
            attempt_count = GREATEST(COALESCE(attempt_count, 0), 1)
        WHERE is_sent = true
          AND (delivery_status IS NULL OR delivery_status = 'pending')
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_reminders_delivery_due ON reminders (remind_at, delivery_status, next_attempt_at) WHERE is_dismissed = false AND is_sent = false`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS scheduler_delivery_outbox (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          delivery_status TEXT NOT NULL DEFAULT 'pending',
          claim_owner TEXT,
          claim_token TEXT,
          claim_until TIMESTAMP,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_attempt_at TIMESTAMP,
          next_attempt_at TIMESTAMP,
          last_failure_code TEXT,
          sent_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_scheduler_outbox_idempotency ON scheduler_delivery_outbox (idempotency_key)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_scheduler_outbox_due ON scheduler_delivery_outbox (delivery_status, next_attempt_at, claim_until)`);
    },
  },
  {
    id: "2026_07_19_scheduled_backup_runs_ddl",
    description: "scheduled_backup_runs day claim table (01C-B2-B2A)",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS scheduled_backup_runs (
          id TEXT PRIMARY KEY,
          run_day DATE NOT NULL,
          idempotency_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          claim_owner TEXT,
          claim_token TEXT,
          claim_until TIMESTAMP,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_attempt_at TIMESTAMP,
          next_attempt_at TIMESTAMP,
          last_failure_code TEXT,
          backup_metadata_id TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_scheduled_backup_runs_day ON scheduled_backup_runs (run_day)`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_scheduled_backup_runs_idempotency ON scheduled_backup_runs (idempotency_key)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_scheduled_backup_runs_due ON scheduled_backup_runs (status, next_attempt_at, claim_until)`);
    },
  },
  {
    id: "2026_07_19_drawer_day_close_runs_ddl",
    description: "drawer_day_close_runs day claim table (01C-B2-B2B)",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS drawer_day_close_runs (
          id TEXT PRIMARY KEY,
          run_day DATE NOT NULL,
          idempotency_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          claim_owner TEXT,
          claim_token TEXT,
          claim_until TIMESTAMP,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_attempt_at TIMESTAMP,
          next_attempt_at TIMESTAMP,
          last_failure_code TEXT,
          drawer_session_id TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_drawer_day_close_runs_day ON drawer_day_close_runs (run_day)`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_drawer_day_close_runs_idempotency ON drawer_day_close_runs (idempotency_key)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_drawer_day_close_runs_due ON drawer_day_close_runs (status, next_attempt_at, claim_until)`);
    },
  },
  {
    id: "2026_07_20_corporate_declaration",
    description: "job_tickets.corporate_declaration + declaration-only backfill (no status rewrite)",
    up: async (client) => {
      await client.query(`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS corporate_declaration TEXT`);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_job_tickets_corporate_declaration ON job_tickets (corporate_declaration)`,
      );
      // Backfill declaration only: corporate rows, null field, recognized legacy text (case/whitespace normalize for derive only).
      // Never rewrite historical status (D2/D3). Never map Ready/Testing into declaration.
      const backfill = await client.query(`
        UPDATE job_tickets
        SET corporate_declaration = CASE lower(btrim(status))
          WHEN 'received' THEN 'received'
          WHEN 'checking' THEN 'checking'
          WHEN 'declared ok' THEN 'declared_ok'
          WHEN 'declared_ok' THEN 'declared_ok'
          WHEN 'declared ng' THEN 'declared_ng'
          WHEN 'declared not ok' THEN 'declared_ng'
          WHEN 'declared_ng' THEN 'declared_ng'
          WHEN 'pending' THEN 'pending_hold'
          ELSE NULL
        END
        WHERE corporate_client_id IS NOT NULL
          AND btrim(corporate_client_id) <> ''
          AND corporate_declaration IS NULL
          AND lower(btrim(COALESCE(status, ''))) IN (
            'received', 'checking', 'declared ok', 'declared_ok',
            'declared ng', 'declared not ok', 'declared_ng', 'pending'
          )
      `);
      console.log(
        `[MainSchema] corporate_declaration backfill applied_rows=${(backfill as any).rowCount ?? 0}`,
      );
    },
  },
  {
    id: "2026_07_20_system_incidents",
    description: "system_incidents Super Admin safe incident register (01B)",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_incidents (
          id TEXT PRIMARY KEY,
          signature TEXT NOT NULL UNIQUE,
          component TEXT NOT NULL,
          code TEXT NOT NULL,
          category TEXT NOT NULL,
          severity TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          count INTEGER NOT NULL DEFAULT 1,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          acknowledged_at TIMESTAMPTZ,
          acknowledged_by TEXT,
          resolved_at TIMESTAMPTZ,
          resolved_by TEXT,
          safe_title_key TEXT NOT NULL,
          safe_next_step_key TEXT NOT NULL,
          summary_day TEXT
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_system_incidents_status_last_seen ON system_incidents (status, last_seen_at DESC)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_system_incidents_component_last_seen ON system_incidents (component, last_seen_at DESC)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_system_incidents_resolved_at ON system_incidents (resolved_at)`,
      );
    },
  },
  {
    id: "2026_07_20_job_final_test_runs",
    description: "Append-only job final-test evidence runs (quality gate 01B)",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS job_final_test_runs (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL,
          outcome TEXT NOT NULL,
          check_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
          reinspection_reason TEXT,
          recorded_by TEXT NOT NULL,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          superseded_at TIMESTAMPTZ,
          superseded_by_run_id TEXT,
          supersede_reason TEXT
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_job_final_test_runs_job_recorded
         ON job_final_test_runs (job_id, recorded_at DESC)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_job_final_test_runs_job_current
         ON job_final_test_runs (job_id)
         WHERE superseded_at IS NULL`,
      );
    },
  },
  {
    id: "2026_07_21_service_feedback",
    description: "Canonical post-Delivered service feedback, versions, recovery, public state (CUSTOMER-FEEDBACK-01A)",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS service_feedback_opportunities (
          id TEXT PRIMARY KEY,
          job_ticket_id TEXT NOT NULL,
          customer_id TEXT,
          service_request_id TEXT,
          corporate_client_id TEXT,
          handover_event_id TEXT NOT NULL,
          handover_kind TEXT NOT NULL,
          handover_source_id TEXT,
          handover_at TIMESTAMPTZ NOT NULL,
          window_ends_at TIMESTAMPTZ NOT NULL,
          status TEXT NOT NULL DEFAULT 'eligible',
          current_version_id TEXT,
          public_consent BOOLEAN NOT NULL DEFAULT FALSE,
          public_consent_at TIMESTAMPTZ,
          consent_withdrawn_at TIMESTAMPTZ,
          publication_status TEXT NOT NULL DEFAULT 'hidden',
          featured BOOLEAN NOT NULL DEFAULT FALSE,
          featured_at TIMESTAMPTZ,
          public_display_name TEXT,
          public_excerpt TEXT,
          display_expires_at TIMESTAMPTZ,
          retention_status TEXT NOT NULL DEFAULT 'none',
          last_retention_review_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_service_feedback_opp_job
        ON service_feedback_opportunities (job_ticket_id)
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_service_feedback_opp_handover_event
        ON service_feedback_opportunities (handover_event_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_service_feedback_opp_customer
        ON service_feedback_opportunities (customer_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_service_feedback_opp_window
        ON service_feedback_opportunities (window_ends_at)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_service_feedback_opp_publication
        ON service_feedback_opportunities (publication_status, featured)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_service_feedback_opp_retention
        ON service_feedback_opportunities (retention_status, display_expires_at)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS service_feedback_versions (
          id TEXT PRIMARY KEY,
          opportunity_id TEXT NOT NULL,
          version_no INTEGER NOT NULL,
          rating INTEGER NOT NULL,
          comment TEXT,
          public_consent BOOLEAN NOT NULL DEFAULT FALSE,
          submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          superseded_at TIMESTAMPTZ,
          CONSTRAINT chk_service_feedback_rating CHECK (rating >= 1 AND rating <= 5)
        )
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_service_feedback_version_no
        ON service_feedback_versions (opportunity_id, version_no)
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_service_feedback_version_current
        ON service_feedback_versions (opportunity_id)
        WHERE superseded_at IS NULL
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_service_feedback_versions_opp
        ON service_feedback_versions (opportunity_id, submitted_at DESC)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS service_feedback_recovery_cases (
          id TEXT PRIMARY KEY,
          opportunity_id TEXT NOT NULL,
          feedback_version_id TEXT NOT NULL,
          rating_snapshot INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          assigned_to_user_id TEXT,
          assignment_scope TEXT,
          logistics_task_id TEXT,
          staff_notes TEXT,
          resolved_by TEXT,
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_service_feedback_recovery_version
        ON service_feedback_recovery_cases (feedback_version_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_service_feedback_recovery_status
        ON service_feedback_recovery_cases (status, created_at DESC)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_service_feedback_recovery_assignee
        ON service_feedback_recovery_cases (assigned_to_user_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_service_feedback_recovery_opp
        ON service_feedback_recovery_cases (opportunity_id)
      `);
    },
  },
  {
    id: "2026_07_21_external_intake_parties",
    description:
      "Dedicated external Technician/shop party store + typed job/batch refs (JOB-INTAKE-UNIFICATION-01A-A)",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS external_intake_parties (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL DEFAULT 'external_technician',
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          phone_normalized TEXT NOT NULL,
          short_address TEXT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT chk_external_intake_parties_kind CHECK (kind = 'external_technician')
        )
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_external_intake_parties_phone_norm
        ON external_intake_parties (phone_normalized)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_external_intake_parties_name
        ON external_intake_parties (name)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_external_intake_parties_active
        ON external_intake_parties (is_active)
        WHERE is_active = TRUE
      `);

      await client.query(
        `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS intake_party_kind TEXT`,
      );
      await client.query(
        `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS external_party_id TEXT`,
      );
      await client.query(
        `ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS intake_party_kind TEXT`,
      );
      await client.query(
        `ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS external_party_id TEXT`,
      );

      await client.query(`
        DO $$ BEGIN
          ALTER TABLE job_tickets
            ADD CONSTRAINT fk_job_tickets_external_party
            FOREIGN KEY (external_party_id)
            REFERENCES external_intake_parties(id)
            ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE job_batches
            ADD CONSTRAINT fk_job_batches_external_party
            FOREIGN KEY (external_party_id)
            REFERENCES external_intake_parties(id)
            ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);

      await client.query(`
        DO $$ BEGIN
          ALTER TABLE job_tickets
            ADD CONSTRAINT chk_job_tickets_external_party_kind
            CHECK (
              external_party_id IS NULL
              OR intake_party_kind = 'external_technician'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE job_batches
            ADD CONSTRAINT chk_job_batches_external_party_kind
            CHECK (
              external_party_id IS NULL
              OR intake_party_kind = 'external_technician'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_job_tickets_external_party
        ON job_tickets (external_party_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_job_batches_external_party
        ON job_batches (external_party_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_job_tickets_intake_party_kind
        ON job_tickets (intake_party_kind)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_job_batches_intake_party_kind
        ON job_batches (intake_party_kind)
      `);
    },
  },
  {
    id: "2026_07_21_external_party_ref_pair",
    description:
      "Pair integrity: intake_party_kind and external_party_id both null or both set for external_technician (JOB-INTAKE-UNIFICATION-01A-A-HOTFIX-1)",
    up: async (client) => {
      // Drop one-way checks that allowed kind without id.
      await client.query(`
        ALTER TABLE job_tickets
          DROP CONSTRAINT IF EXISTS chk_job_tickets_external_party_kind
      `);
      await client.query(`
        ALTER TABLE job_batches
          DROP CONSTRAINT IF EXISTS chk_job_batches_external_party_kind
      `);

      // Paired invariant (R2/R4): both null, or external_technician + non-null party id.
      // Use boolean equality so mixed null/non-null never yields SQL UNKNOWN (CHECK would pass).
      // FK remains authority for id validity; party table kind check remains authority for referenced row.
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE job_tickets
            ADD CONSTRAINT chk_job_tickets_external_party_pair
            CHECK (
              (intake_party_kind IS NULL) = (external_party_id IS NULL)
              AND (
                intake_party_kind IS NULL
                OR intake_party_kind = 'external_technician'
              )
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE job_batches
            ADD CONSTRAINT chk_job_batches_external_party_pair
            CHECK (
              (intake_party_kind IS NULL) = (external_party_id IS NULL)
              AND (
                intake_party_kind IS NULL
                OR intake_party_kind = 'external_technician'
              )
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
    },
  },
  {
    id: "2026_07_21_canonical_customers",
    description:
      "Create canonical customers authority + indexes (JOB-INTAKE-UNIFICATION-01C-HOTFIX-1)",
    up: async (client) => {
      // Authority: shared/schema.ts customers + historical migrations/0005_client_class_system.sql.
      // Self-reference on referrer_id; idempotent for greenfield and already-present tables.
      await client.query(`
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          primary_phone TEXT UNIQUE,
          alt_phones JSONB NOT NULL DEFAULT '[]'::jsonb,
          name TEXT,
          address TEXT,
          area TEXT,
          gmail TEXT,
          client_class TEXT NOT NULL DEFAULT 'online',
          referrer_id TEXT REFERENCES customers(id),
          is_shop_name BOOLEAN DEFAULT false,
          total_jobs INTEGER NOT NULL DEFAULT 0,
          total_spend REAL NOT NULL DEFAULT 0,
          first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
          last_job_at TIMESTAMP,
          notes TEXT,
          store_id TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_customers_primary_phone
        ON customers (primary_phone)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_customers_client_class
        ON customers (client_class)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_customers_last_job_at
        ON customers (last_job_at)
      `);
    },
  },
  {
    id: "2026_07_21_external_qr_credentials",
    description:
      "Opaque external technician QR credentials (hash-only) for printed job/batch slips (TECHNICIAN-QR-TRACKING-01)",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS external_qr_credentials (
          id TEXT PRIMARY KEY,
          credential_hash TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_external_qr_credentials_hash
        ON external_qr_credentials (credential_hash)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_external_qr_credentials_entity
        ON external_qr_credentials (entity_type, entity_id)
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE external_qr_credentials
            ADD CONSTRAINT chk_external_qr_entity_type
            CHECK (entity_type IN ('job', 'batch'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
    },
  },
  {
    id: "2026_07_21_active_work_timer",
    description:
      "Continuous active-work timer + one-alert-per-interval fields (TECHNICIAN-FLOW-01B)",
    up: async (client) => {
      await client.query(`
        ALTER TABLE job_tickets
          ADD COLUMN IF NOT EXISTS active_work_started_at TIMESTAMPTZ DEFAULT NOW()
      `);
      // Existing installs may have added the column without a default
      await client.query(`
        ALTER TABLE job_tickets
          ALTER COLUMN active_work_started_at SET DEFAULT NOW()
      `);
      await client.query(`
        ALTER TABLE job_tickets
          ADD COLUMN IF NOT EXISTS active_work_alert_sent_at TIMESTAMPTZ
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_job_tickets_active_work_started
        ON job_tickets (active_work_started_at)
        WHERE active_work_started_at IS NOT NULL
      `);
      // Backfill workable open jobs so age is measurable without re-open
      await client.query(`
        UPDATE job_tickets
        SET active_work_started_at = COALESCE(created_at, NOW())
        WHERE active_work_started_at IS NULL
          AND status NOT IN (
            'Pending Parts', 'Waiting on Parts',
            'Awaiting Quote Approval', 'Awaiting Customer Decision', 'NG Review Pending',
            'Completed', 'Delivered', 'Cancelled', 'Abandoned', 'Forfeited', 'Closed', 'Not OK'
          )
      `);
      // Blocked/terminal may still receive DEFAULT NOW() on new inserts — age stays excluded until resume
    },
  },
  {
    id: "2026_07_21_attendance_corrections",
    description:
      "Attendance correction requests + effective time overlay + one-user-per-day (WORKFORCE-UX-01 foundation)",
    up: async (client) => {
      await client.query(`
        ALTER TABLE attendance_records
          ADD COLUMN IF NOT EXISTS effective_check_in_time TIMESTAMPTZ
      `);
      await client.query(`
        ALTER TABLE attendance_records
          ADD COLUMN IF NOT EXISTS effective_check_out_time TIMESTAMPTZ
      `);

      // Preflight: refuse unique index if duplicate user/date rows exist (never silent pick)
      const dupes = await client.query<{ user_id: string; date: string; cnt: string }>(`
        SELECT user_id, date, COUNT(*)::text AS cnt
        FROM attendance_records
        GROUP BY user_id, date
        HAVING COUNT(*) > 1
        LIMIT 20
      `);
      if (dupes.rows.length > 0) {
        const sample = dupes.rows
          .map((r) => `${r.user_id}@${r.date}×${r.cnt}`)
          .join("; ");
        throw new Error(
          `ATTENDANCE_USER_DATE_DUPLICATES: Cannot create uidx_attendance_user_date — resolve duplicates first. Sample: ${sample}`,
        );
      }

      // Race-safe one record per user per calendar day (Asia/Dhaka date string)
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_attendance_user_date
        ON attendance_records (user_id, date)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS attendance_correction_requests (
          id TEXT PRIMARY KEY,
          attendance_record_id TEXT NOT NULL,
          requester_user_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          original_check_in_time TIMESTAMPTZ NOT NULL,
          original_check_out_time TIMESTAMPTZ,
          proposed_check_in_time TIMESTAMPTZ NOT NULL,
          proposed_check_out_time TIMESTAMPTZ,
          request_reason TEXT NOT NULL,
          reviewer_user_id TEXT,
          reviewed_at TIMESTAMPTZ,
          review_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_attendance_correction_record
        ON attendance_correction_requests (attendance_record_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_attendance_correction_requester
        ON attendance_correction_requests (requester_user_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_attendance_correction_status
        ON attendance_correction_requests (status)
      `);
      // At most one pending request per attendance record
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_attendance_correction_one_pending
        ON attendance_correction_requests (attendance_record_id)
        WHERE status = 'pending'
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE attendance_correction_requests
            ADD CONSTRAINT chk_attendance_correction_status
            CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
    },
  },
  {
    id: "2026_07_22_schema_update_control_plane",
    description:
      "BOOTSTRAP CONSTRAINT: durable schema_update_runs control-plane table + DB-enforced one-active-run. Cannot be applied by the Settings feature that depends on it; initial apply via trusted MAIN_MIGRATION_RELEASE_MODE=true db:migrate:main only. Does not alter promise_schema_migrations ledger semantics.",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_update_runs (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          requested_by TEXT NOT NULL,
          requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          confirmed_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ,
          finished_at TIMESTAMPTZ,
          request_source TEXT NOT NULL DEFAULT 'super_admin_settings',
          release_version TEXT,
          target_pending_count INTEGER,
          applied_count INTEGER,
          error_category TEXT,
          error_message TEXT,
          result_summary JSONB,
          audit_ref TEXT
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_schema_update_runs_status_requested
        ON schema_update_runs (status, requested_at DESC)
      `);
      // At most one pending/running request at a time (DB-enforced, not check-then-insert)
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_schema_update_runs_one_active
        ON schema_update_runs ((true))
        WHERE status IN ('pending', 'running')
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE schema_update_runs
            ADD CONSTRAINT chk_schema_update_runs_status
            CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'blocked', 'timed_out', 'cancelled'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
    },
  },
  {
    id: "2026_07_23_corporate_account_receipts",
    description:
      "Canonical corporate account receipts + legacy bill↔Due exact-match classification (FINANCE-AFTERCARE-01.2). Receipts settle the company account, not an invoice. Isolated from POS/generic Due/refund/warranty/jobs.",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS corporate_account_receipts (
          id TEXT PRIMARY KEY,
          corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id) ON DELETE CASCADE,
          amount REAL NOT NULL,
          method TEXT NOT NULL,
          reference TEXT,
          received_by TEXT,
          received_by_name TEXT,
          idempotency_key TEXT,
          note TEXT,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE corporate_account_receipts
            ADD CONSTRAINT ck_corporate_account_receipts_amount_positive
            CHECK (amount > 0 AND amount IS NOT NULL);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_account_receipts_client ON corporate_account_receipts (corporate_client_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_account_receipts_received_at ON corporate_account_receipts (received_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_account_receipts_created_at ON corporate_account_receipts (created_at)`);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_corporate_account_receipts_idempotency
        ON corporate_account_receipts (corporate_client_id, idempotency_key)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS corporate_bill_due_links (
          id TEXT PRIMARY KEY,
          bill_id TEXT NOT NULL REFERENCES corporate_bills(id) ON DELETE CASCADE,
          due_record_id TEXT,
          classification TEXT NOT NULL DEFAULT 'review_needed',
          reason TEXT,
          classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_corporate_bill_due_links_bill ON corporate_bill_due_links (bill_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_bill_due_links_bill ON corporate_bill_due_links (bill_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_bill_due_links_due ON corporate_bill_due_links (due_record_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_bill_due_links_class ON corporate_bill_due_links (classification)`);

      // Legacy classification: EXACT-MATCH-ONLY backfill. Never guess, never rewrite history.
      // Scoped to Normal Corporate clients (client_type = 'corporate') only — Corporate Ltd.
      // (limited_company) legacy bills are left untouched for Ticket 03 itemized allocation.
      // Match: corporate_bills.bill_number = due_records.invoice AND corporate_bills.grand_total = due_records.amount.
      // Ambiguous (multiple due rows for one bill_number, or no match) → review_needed.
      // Only insert links for bills that do not already have a link row (idempotent re-run).
      await client.query(`
        INSERT INTO corporate_bill_due_links (id, bill_id, due_record_id, classification, reason)
        SELECT
          CONCAT('cbdl_', cb.id) AS id,
          cb.id AS bill_id,
          dr.id AS due_record_id,
          'exact_match' AS classification,
          'bill_number = due_records.invoice AND grand_total = due_records.amount (unique, normal corporate)' AS reason
        FROM corporate_bills cb
        JOIN corporate_clients cc ON cc.id = cb.corporate_client_id AND (cc.client_type = 'corporate' OR cc.client_type IS NULL)
        JOIN due_records dr
          ON dr.invoice = cb.bill_number
         AND dr.amount = cb.grand_total
        WHERE NOT EXISTS (SELECT 1 FROM corporate_bill_due_links l WHERE l.bill_id = cb.id)
        AND (
          SELECT COUNT(*)::int FROM due_records d2
          WHERE d2.invoice = cb.bill_number AND d2.amount = cb.grand_total
        ) = 1
      `);

      // Bills with a due_records.invoice match that was ambiguous (count > 1) → review_needed.
      // Scoped to Normal Corporate only — Corporate Ltd. bills stay unclassified for Ticket 03.
      await client.query(`
        INSERT INTO corporate_bill_due_links (id, bill_id, due_record_id, classification, reason)
        SELECT
          CONCAT('cbdl_amb_', cb.id) AS id,
          cb.id AS bill_id,
          NULL AS due_record_id,
          'review_needed' AS classification,
          'multiple due_records matched bill_number + amount — manual review required' AS reason
        FROM corporate_bills cb
        JOIN corporate_clients cc ON cc.id = cb.corporate_client_id AND (cc.client_type = 'corporate' OR cc.client_type IS NULL)
        WHERE NOT EXISTS (SELECT 1 FROM corporate_bill_due_links l WHERE l.bill_id = cb.id)
        AND (
          SELECT COUNT(*)::int FROM due_records d2
          WHERE d2.invoice = cb.bill_number AND d2.amount = cb.grand_total
        ) > 1
      `);

      // Bills with no due_records match at all → unmatched (review_needed), so finance can see the gap.
      // Scoped to Normal Corporate only — Corporate Ltd. bills stay unclassified for Ticket 03.
      await client.query(`
        INSERT INTO corporate_bill_due_links (id, bill_id, due_record_id, classification, reason)
        SELECT
          CONCAT('cbdl_unm_', cb.id) AS id,
          cb.id AS bill_id,
          NULL AS due_record_id,
          'unmatched' AS classification,
          'no due_records row matched bill_number + amount — legacy gap, not rewritten' AS reason
        FROM corporate_bills cb
        JOIN corporate_clients cc ON cc.id = cb.corporate_client_id AND (cc.client_type = 'corporate' OR cc.client_type IS NULL)
        WHERE NOT EXISTS (SELECT 1 FROM corporate_bill_due_links l WHERE l.bill_id = cb.id)
        AND NOT EXISTS (
          SELECT 1 FROM due_records d2
          WHERE d2.invoice = cb.bill_number AND d2.amount = cb.grand_total
        )
      `);
    },
  },
  {
    id: "2026_07_23_corporate_ltd_itemized_billing",
    description:
      "Corporate Ltd. itemized billing: bill/line snapshot columns, normalized bill_line_items fields, itemized receipts + allocations (FINANCE-AFTERCARE-01.3). Append-only; never rewrites historical bills/checksums. Isolated from POS, generic Due, normal Corporate account receipts, refunds, warranty, and jobs. Self-sufficient: creates bill_line_items and Phase G corporate_bills columns if missing (added outside prior migration framework).",
    up: async (client) => {
      // ── Self-sufficiency: ensure bill_line_items exists (created outside prior migration framework).
      await client.query(`
        CREATE TABLE IF NOT EXISTS bill_line_items (
          id TEXT PRIMARY KEY,
          bill_id TEXT NOT NULL REFERENCES corporate_bills(id) ON DELETE CASCADE,
          job_ticket_id TEXT,
          device_serial TEXT,
          device_model TEXT,
          charge_description TEXT,
          amount REAL NOT NULL DEFAULT 0,
          moved_from_bill_id TEXT,
          moved_at TIMESTAMPTZ,
          moved_by_user_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_bill_line_items_bill ON bill_line_items (bill_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_bill_line_items_job ON bill_line_items (job_ticket_id)`);

      // ── Self-sufficiency: Phase G scatter-billing columns on corporate_bills (created outside prior migration framework).
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS bill_status TEXT DEFAULT 'active'`);
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS superseded_by_bill_ids JSONB DEFAULT '[]'::jsonb`);
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS superseded_by_user_id TEXT`);
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS superseded_reason TEXT`);
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS created_by TEXT`);
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_bills_bill_status ON corporate_bills (bill_status)`);

      // ── Ticket 03: corporate_bills itemized snapshot columns (additive only).
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS itemized_mode BOOLEAN DEFAULT false`);
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS layout_snapshot JSONB`);
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS recipient_snapshot JSONB`);
      await client.query(`ALTER TABLE corporate_bills ADD COLUMN IF NOT EXISTS client_type_snapshot TEXT`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_bills_itemized_mode ON corporate_bills (itemized_mode)`);

      // ── Ticket 03: bill_line_items normalized Corporate Ltd. issued line fields (additive only).
      await client.query(`ALTER TABLE bill_line_items ADD COLUMN IF NOT EXISTS client_job_number TEXT`);
      await client.query(`ALTER TABLE bill_line_items ADD COLUMN IF NOT EXISTS promise_job_number TEXT`);
      await client.query(`ALTER TABLE bill_line_items ADD COLUMN IF NOT EXISTS tv_serial TEXT`);
      await client.query(`ALTER TABLE bill_line_items ADD COLUMN IF NOT EXISTS brand_model TEXT`);
      await client.query(`ALTER TABLE bill_line_items ADD COLUMN IF NOT EXISTS tv_size TEXT`);
      await client.query(`ALTER TABLE bill_line_items ADD COLUMN IF NOT EXISTS service_description TEXT`);

      // ── Ticket 03: Corporate Ltd. itemized receipts — bill-scoped, client-scoped, isolated.
      await client.query(`
        CREATE TABLE IF NOT EXISTS corporate_ltd_receipts (
          id TEXT PRIMARY KEY,
          corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id) ON DELETE CASCADE,
          bill_id TEXT NOT NULL REFERENCES corporate_bills(id) ON DELETE CASCADE,
          amount REAL NOT NULL,
          method TEXT NOT NULL,
          reference TEXT,
          received_by TEXT,
          received_by_name TEXT,
          idempotency_key TEXT,
          note TEXT,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE corporate_ltd_receipts
            ADD CONSTRAINT ck_corporate_ltd_receipts_amount_positive
            CHECK (amount > 0 AND amount IS NOT NULL);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_ltd_receipts_client ON corporate_ltd_receipts (corporate_client_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_ltd_receipts_bill ON corporate_ltd_receipts (bill_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_ltd_receipts_received_at ON corporate_ltd_receipts (received_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_ltd_receipts_created_at ON corporate_ltd_receipts (created_at)`);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_corporate_ltd_receipts_idempotency
        ON corporate_ltd_receipts (bill_id, idempotency_key)
      `);

      // ── Ticket 03: Corporate Ltd. receipt allocations — bill-level or line-level, same client.
      await client.query(`
        CREATE TABLE IF NOT EXISTS corporate_ltd_receipt_allocations (
          id TEXT PRIMARY KEY,
          receipt_id TEXT NOT NULL REFERENCES corporate_ltd_receipts(id) ON DELETE CASCADE,
          corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id) ON DELETE CASCADE,
          bill_id TEXT NOT NULL REFERENCES corporate_bills(id) ON DELETE CASCADE,
          bill_line_item_id TEXT REFERENCES bill_line_items(id) ON DELETE CASCADE,
          amount REAL NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE corporate_ltd_receipt_allocations
            ADD CONSTRAINT ck_corporate_ltd_alloc_amount_positive
            CHECK (amount > 0 AND amount IS NOT NULL);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_ltd_alloc_receipt ON corporate_ltd_receipt_allocations (receipt_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_ltd_alloc_bill ON corporate_ltd_receipt_allocations (bill_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_ltd_alloc_line ON corporate_ltd_receipt_allocations (bill_line_item_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_ltd_alloc_client ON corporate_ltd_receipt_allocations (corporate_client_id)`);
    },
  },
  // ── Ticket 04: Aftercare Disputes ────────────────────────────────────────
  {
    id: "2026_07_24_aftercare_disputes",
    description: "Dispute cases linked to exactly one POS transaction, refund, or warranty claim. DB-enforced exactly-one target via CHECK. Append-only review notes.",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS disputes (
          id TEXT PRIMARY KEY,
          pos_transaction_id TEXT REFERENCES pos_transactions(id) ON DELETE RESTRICT,
          refund_id TEXT REFERENCES refunds(id) ON DELETE RESTRICT,
          warranty_claim_id TEXT REFERENCES warranty_claims(id) ON DELETE RESTRICT,
          dispute_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          customer TEXT,
          customer_phone TEXT,
          description TEXT NOT NULL,
          resolution_notes TEXT,
          opened_by TEXT NOT NULL,
          opened_by_name TEXT NOT NULL,
          opened_by_role TEXT NOT NULL,
          opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved_by TEXT,
          resolved_by_name TEXT,
          resolved_by_role TEXT,
          resolved_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE disputes
            ADD CONSTRAINT chk_disputes_exactly_one_target
            CHECK ((pos_transaction_id IS NOT NULL)::int + (refund_id IS NOT NULL)::int + (warranty_claim_id IS NOT NULL)::int = 1);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_disputes_pos_transaction ON disputes (pos_transaction_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_disputes_refund ON disputes (refund_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_disputes_warranty_claim ON disputes (warranty_claim_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_disputes_phone ON disputes (customer_phone)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_disputes_created_at ON disputes (created_at)`);

      // Append-only dispute review notes / event log
      await client.query(`
        CREATE TABLE IF NOT EXISTS dispute_notes (
          id TEXT PRIMARY KEY,
          dispute_id TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
          note_type TEXT NOT NULL DEFAULT 'note',
          content TEXT NOT NULL,
          author_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          author_role TEXT NOT NULL,
          previous_status TEXT,
          new_status TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_dispute_notes_dispute ON dispute_notes (dispute_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_dispute_notes_created_at ON dispute_notes (created_at)`);
    },
  },
  // ── Commission Engine tables (DEFECT-LOCAL-QA-01A-1) ───────────────────
  {
    id: "2026_07_25_commission_engine_tables",
    description:
      "Create commission_rules, commission_assignments, and commission_payouts to match shared/schema Commission Engine declarations. job_id FKs only; user_id remains unbound text.",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS commission_rules (
          id TEXT PRIMARY KEY,
          role TEXT NOT NULL,
          pool TEXT NOT NULL,
          percentage REAL NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          description TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS commission_assignments (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL REFERENCES job_tickets(id),
          user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          pool TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_commission_assignments_job_id ON commission_assignments (job_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_commission_assignments_user_id ON commission_assignments (user_id)`,
      );

      await client.query(`
        CREATE TABLE IF NOT EXISTS commission_payouts (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL REFERENCES job_tickets(id),
          user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          pool TEXT NOT NULL,
          amount REAL NOT NULL DEFAULT 0,
          percentage REAL NOT NULL DEFAULT 0,
          job_total REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending',
          paid_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_commission_payouts_job_id ON commission_payouts (job_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_commission_payouts_user_id ON commission_payouts (user_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_commission_payouts_status ON commission_payouts (status)`,
      );
    },
  },
  // ── Attendance GPS columns (DEFECT-ATTENDANCE-MAIN-GPS-COLUMNS-1) ───────
  {
    id: "2026_07_25_attendance_records_gps_columns",
    description:
      "Add attendance_records GPS/geofence/device columns and work_location_id to match shared/schema.ts for greenfield MAIN check-in. Idempotent ADD COLUMN IF NOT EXISTS only; no FK, defaults, backfill, or changes to reference/effective columns.",
    up: async (client) => {
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS work_location_id TEXT`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_lat DOUBLE PRECISION`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_lng DOUBLE PRECISION`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_lat DOUBLE PRECISION`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_lng DOUBLE PRECISION`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_accuracy REAL`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_accuracy REAL`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_distance_meters REAL`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_distance_meters REAL`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_geofence_status TEXT`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_geofence_status TEXT`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_reason TEXT`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_reason TEXT`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS device_platform TEXT`,
      );
      await client.query(
        `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS device_id TEXT`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_attendance_work_location ON attendance_records (work_location_id)`,
      );
    },
  },
  // ── Work locations table (DEFECT-WORK-LOCATIONS-MAIN-MISSING-1) ─────────
  {
    id: "2026_07_25_work_locations_table",
    description:
      "Create work_locations to match shared/schema.ts for greenfield MAIN attendance location resolution. Idempotent CREATE TABLE/INDEX IF NOT EXISTS only; no seed, FK, or invented coordinates.",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS work_locations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          store_id TEXT,
          latitude DOUBLE PRECISION NOT NULL,
          longitude DOUBLE PRECISION NOT NULL,
          radius_meters INTEGER NOT NULL DEFAULT 150,
          status TEXT NOT NULL DEFAULT 'Active',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_work_locations_status ON work_locations (status)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_work_locations_store ON work_locations (store_id)`,
      );
    },
  },
];

/**
 * Toolchain-independent migration identity.
 *
 * Deliberately hashes only `id` and `description` — both string literals, which
 * survive bundling and minification byte-identically.
 *
 * `up.toString()` MUST NOT be included: the release CLI runs unminified via tsx
 * (`db:migrate:main`) while the server runs the esbuild `minify: true` bundle
 * (`dist/index.cjs`). Hashing function source made those two disagree on every
 * migration, so a correctly-migrated production database still failed startup
 * verification with "Mismatched: 48" and served 503 fail-closed.
 *
 * Trade-off: edits to an existing migration body are no longer detected by
 * checksum. Migrations are append-only by policy — change behaviour by adding a
 * new migration, never by editing an applied one.
 */
export function computeMigrationChecksum(migration: MainSchemaMigration): string {
  const body = `${migration.id}\n${migration.description}`;
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);
}

function computeChecksum(migration: MainSchemaMigration): string {
  return computeMigrationChecksum(migration);
}

/** Server-only registry identity map. Callers must never send raw checksums to browsers. */
export function getCanonicalRegistryIdentity(): {
  ids: string[];
  headVersion: string | null;
  requiredVersion: string;
  checksumById: Record<string, string>;
} {
  const checksumById: Record<string, string> = {};
  const ids: string[] = [];
  for (const migration of MAIN_SCHEMA_MIGRATIONS) {
    ids.push(migration.id);
    checksumById[migration.id] = computeMigrationChecksum(migration);
  }
  return {
    ids,
    headVersion: ids.length > 0 ? ids[ids.length - 1]! : null,
    requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
    checksumById,
  };
}

function getInstanceLabel(): string {
  return process.env.HOSTNAME || process.env.RENDER_INSTANCE_ID || "local";
}

let migrationState: {
  status: MigrationStatus;
  appliedIds: string[];
  failedId: string | null;
  error: string | null;
  requiredVersion: string;
  currentVersion: string | null;
  lockAcquired: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number;
} = {
  status: "pending",
  appliedIds: [],
  failedId: null,
  error: null,
  requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
  currentVersion: null,
  lockAcquired: false,
  startedAt: null,
  completedAt: null,
  durationMs: 0,
};

export function getMainSchemaState() {
  return { ...migrationState };
}

export function isMainSchemaComplete(): boolean {
  return migrationState.status === "complete";
}

export function isMainSchemaFailed(): boolean {
  return migrationState.status === "failed";
}

export interface LedgerVerification {
  ok: boolean;
  missing: string[];
  mismatched: Array<{ id: string; ledger: string; code: string }>;
  extra: string[];
  appliedIds: string[];
  currentVersion: string | null;
  error: string | null;
}

/**
 * Pure ledger comparison against registry. Used by verifyMainSchemaLedger and unit tests.
 * When disposable adoption session is active, adopted historic ids use baseline ledger
 * checksums (identity A) as expected values instead of current code checksums.
 * New/pending migrations still use current code checksums. Never mutates ledger.
 */
export function evaluateLedgerAgainstRegistry(
  ledgerMap: Map<string, string> | Record<string, string>
): LedgerVerification {
  const map =
    ledgerMap instanceof Map
      ? ledgerMap
      : new Map(Object.entries(ledgerMap));

  const appliedIds: string[] = [];
  const missing: string[] = [];
  const mismatched: Array<{ id: string; ledger: string; code: string }> = [];

  for (const migration of MAIN_SCHEMA_MIGRATIONS) {
    const codeChecksum = computeChecksum(migration);
    const expectedChecksum = resolveExpectedLedgerChecksum(migration.id, codeChecksum);
    const existing = map.get(migration.id);
    if (existing === undefined) {
      missing.push(migration.id);
      continue;
    }
    if (existing !== expectedChecksum) {
      // `code` field remains the code checksum for diagnostics; comparison used expectedChecksum.
      mismatched.push({ id: migration.id, ledger: existing, code: codeChecksum });
      continue;
    }
    appliedIds.push(migration.id);
  }

  const expectedIds = new Set(MAIN_SCHEMA_MIGRATIONS.map((m) => m.id));
  const extra = Array.from(map.keys()).filter((id) => !expectedIds.has(id));
  const ok = missing.length === 0 && mismatched.length === 0 && extra.length === 0;
  const currentVersion = appliedIds.length > 0 ? appliedIds[appliedIds.length - 1]! : null;
  let error: string | null = null;
  if (!ok) {
    if (missing.length > 0) error = `Missing migrations: ${missing.join(", ")}`;
    else if (mismatched.length > 0) error = `Checksum mismatch: ${mismatched.map((m) => m.id).join(", ")}`;
    else if (extra.length > 0) error = `Unexpected ledger entries: ${extra.length}`;
  }
  return { ok, missing, mismatched, extra, appliedIds, currentVersion, error };
}

export async function verifyMainSchemaLedger(): Promise<LedgerVerification> {
  const adoptionGate = await ensureDisposableAdoptionSessionIfRequested();
  if (!adoptionGate.ok) {
    return {
      ok: false,
      missing: [],
      mismatched: [],
      extra: [],
      appliedIds: [],
      currentVersion: null,
      error: adoptionGate.error,
    };
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return { ok: false, missing: [], mismatched: [], extra: [], appliedIds: [], currentVersion: null, error: "DATABASE_URL is not set" };
  }
  const client = new pg.Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 10000,
    ssl: dbUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await client.connect();
    const tableExists = await client.query(`SELECT to_regclass('public.promise_schema_migrations') AS reg`);
    if (!tableExists.rows[0].reg) {
      return { ok: false, missing: MAIN_SCHEMA_MIGRATIONS.map((m) => m.id), mismatched: [], extra: [], appliedIds: [], currentVersion: null, error: "Ledger table does not exist" };
    }
    const ledgerRows = await client.query(`SELECT id, checksum FROM public.promise_schema_migrations`);
    const ledgerMap = new Map<string, string>();
    for (const row of ledgerRows.rows) {
      ledgerMap.set(row.id, row.checksum);
    }
    return evaluateLedgerAgainstRegistry(ledgerMap);
  } catch (e: any) {
    const error = e?.message || String(e);
    return { ok: false, missing: [], mismatched: [], extra: [], appliedIds: [], currentVersion: null, error };
  } finally {
    try { await client.end(); } catch {}
  }
}

function setMigrationStateComplete(appliedIds: string[]): void {
  migrationState.status = "complete";
  migrationState.appliedIds = appliedIds;
  migrationState.currentVersion = appliedIds[appliedIds.length - 1] || null;
  migrationState.completedAt = new Date();
  migrationState.error = null;
  migrationState.failedId = null;
}

/** Sync in-memory migration state after read-only ledger verification (production boot / SKIP). */
export function recordMainSchemaVerified(currentVersion: string | null, appliedIds: string[] = []): void {
  migrationState.status = "complete";
  migrationState.currentVersion = currentVersion;
  if (appliedIds.length > 0) {
    migrationState.appliedIds = appliedIds;
  } else if (currentVersion) {
    migrationState.appliedIds = [currentVersion];
  }
  migrationState.completedAt = new Date();
  migrationState.error = null;
  migrationState.failedId = null;
}

/**
 * Sync in-memory migration state when production/SKIP verify fails or release-mode is refused.
 * HOTFIX-2-QA-CLOSE: getReadinessState() reads isMainSchemaFailed() — must match markMainSchemaFailed().
 * Error string is for internal/logs only; public/admin readiness must not echo raw SQL or connection details.
 */
export function recordMainSchemaFailed(error: string, failedId: string | null = null): void {
  migrationState.status = "failed";
  migrationState.failedId = failedId;
  migrationState.error = error;
  migrationState.completedAt = new Date();
}

function setMigrationStateFailed(failedId: string | null, error: string, durationMs: number, currentVersion: string | null = null): MainSchemaResult {
  migrationState.status = "failed";
  migrationState.failedId = failedId;
  migrationState.error = error;
  migrationState.durationMs = durationMs;
  if (currentVersion !== null) migrationState.currentVersion = currentVersion;
  return {
    status: "failed",
    appliedIds: migrationState.appliedIds,
    failedId,
    error,
    durationMs,
    requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
    currentVersion,
  };
}

export async function runMainSchemaMigrations(): Promise<MainSchemaResult> {
  migrationState.startedAt = new Date();
  const start = Date.now();

  const adoptionGate = await ensureDisposableAdoptionSessionIfRequested();
  if (!adoptionGate.ok) {
    const error = adoptionGate.error || "Disposable baseline adoption failed";
    migrationState.status = "failed";
    migrationState.error = error;
    migrationState.durationMs = Date.now() - start;
    return {
      status: "failed",
      appliedIds: [],
      failedId: null,
      error,
      durationMs: migrationState.durationMs,
      requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
      currentVersion: null,
    };
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    const error = "DATABASE_URL is not set";
    migrationState.status = "failed";
    migrationState.error = error;
    migrationState.durationMs = Date.now() - start;
    return { status: "failed", appliedIds: [], failedId: null, error, durationMs: migrationState.durationMs, requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION, currentVersion: null };
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 10000,
    ssl: dbUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });
  let lockAcquired = false;

  try {
    await client.connect();
    // Session-only search_path fix: the inherited search_path for this connection
    // is not guaranteed (e.g. immediately after a drop-and-recreate restore cycle
    // against some managed Postgres providers). Every subsequent unqualified
    // reference on this client — the ledger table CREATE/SELECT/INSERT below and
    // every reviewed migration.up(client) body — depends on `public` being
    // resolvable. This is a per-connection SET only — not a persistent
    // configuration change, and not any form of ALTER on the database or role.
    await client.query("SET search_path TO public");
    await client.query("SELECT 1");

    const lockKeyResult = await client.query(`SELECT hashtext($1)::int AS key`, [ADVISORY_LOCK_KEY]);
    const lockKey = lockKeyResult.rows[0].key;

    const lockDeadline = Date.now() + LOCK_WAIT_BUDGET_MS;
    while (Date.now() < lockDeadline) {
      const tryResult = await client.query(`SELECT pg_try_advisory_lock($1) AS acquired`, [lockKey]);
      if (tryResult.rows[0].acquired) {
        lockAcquired = true;
        migrationState.lockAcquired = true;
        break;
      }
      await new Promise((r) => setTimeout(r, LOCK_POLL_INTERVAL_MS));
    }

    if (!lockAcquired) {
      migrationState.status = "lock_timeout";
      migrationState.durationMs = Date.now() - start;
      console.warn(`[MainSchema] Advisory lock wait timed out after ${LOCK_WAIT_BUDGET_MS}ms — re-verifying ledger once before staying unready`);
      const verification = await verifyMainSchemaLedger();
      if (verification.ok) {
        setMigrationStateComplete(verification.appliedIds);
        migrationState.durationMs = Date.now() - start;
        console.log(`[MainSchema] Ledger verified complete after lock timeout — becoming ready. Version: ${verification.currentVersion}`);
        return {
          status: "complete",
          appliedIds: verification.appliedIds,
          failedId: null,
          error: null,
          durationMs: migrationState.durationMs,
          requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
          currentVersion: verification.currentVersion,
        };
      }
      console.warn(`[MainSchema] Ledger not complete after lock timeout — staying not-ready (not failed): ${verification.error}`);
      return {
        status: "lock_timeout",
        appliedIds: [],
        failedId: null,
        error: `Lock wait timed out after ${LOCK_WAIT_BUDGET_MS}ms; ledger re-verify: ${verification.error || "incomplete"}`,
        durationMs: migrationState.durationMs,
        requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
        currentVersion: null,
      };
    }

    console.log("[MainSchema] Advisory lock acquired — running required schema migrations");

    await client.query(`CREATE TABLE IF NOT EXISTS promise_schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_by TEXT,
      duration_ms INTEGER
    )`);

    const ledgerRows = await client.query(`SELECT id, checksum FROM promise_schema_migrations`);
    const ledgerMap = new Map<string, string>();
    for (const row of ledgerRows.rows) {
      ledgerMap.set(row.id, row.checksum);
    }

    const appliedIds: string[] = [];

    for (const migration of MAIN_SCHEMA_MIGRATIONS) {
      const codeChecksum = computeChecksum(migration);
      // Adopted historic ids: compare ledger to baseline expected (A) when session active.
      // New inserts always store current code checksum (never rewrite historic rows).
      const expectedChecksum = resolveExpectedLedgerChecksum(migration.id, codeChecksum);
      const existingChecksum = ledgerMap.get(migration.id);

      if (existingChecksum !== undefined) {
        if (existingChecksum !== expectedChecksum) {
          const error = `Checksum mismatch for migration ${migration.id}: ledger has ${existingChecksum}, expected has ${expectedChecksum}. Failing closed — do not silently re-apply.`;
          console.error(`[MainSchema] ${error}`);
          return setMigrationStateFailed(migration.id, error, Date.now() - start, appliedIds[appliedIds.length - 1] || null);
        }
        appliedIds.push(migration.id);
        continue;
      }

      console.log(`[MainSchema] Applying migration: ${migration.id}`);
      migrationState.status = "running";
      const migrationStart = Date.now();
      try {
        await client.query("BEGIN");
        await migration.up(client);
        const migrationDuration = Date.now() - migrationStart;
        await client.query(
          `INSERT INTO promise_schema_migrations (id, checksum, applied_by, duration_ms) VALUES ($1, $2, $3, $4)`,
          [migration.id, codeChecksum, getInstanceLabel(), migrationDuration],
        );
        await client.query("COMMIT");
        appliedIds.push(migration.id);
        ledgerMap.set(migration.id, codeChecksum);
        console.log(`[MainSchema] Applied ${migration.id} (${migrationDuration}ms)`);
      } catch (e: any) {
        const error = e?.message || String(e);
        try { await client.query("ROLLBACK"); } catch {}
        console.error(`[MainSchema] Migration ${migration.id} FAILED (rolled back): ${error.slice(0, 200)}`);
        return setMigrationStateFailed(migration.id, `Migration ${migration.id} failed: ${error}`, Date.now() - start, appliedIds[appliedIds.length - 1] || null);
      }
    }

    setMigrationStateComplete(appliedIds);
    migrationState.durationMs = Date.now() - start;
    console.log(`[MainSchema] All ${appliedIds.length} required migrations complete (${migrationState.durationMs}ms)`);

    // Test-only: hold the already-acquired advisory lock after successful ledger writes
    // so concurrent verifier proofs can observe lock-timeout re-verify. Never active outside NODE_ENV=test.
    await holdAdvisoryLockAfterCompleteForTestOnly();

    return {
      status: "complete",
      appliedIds,
      failedId: null,
      error: null,
      durationMs: migrationState.durationMs,
      requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
      currentVersion: migrationState.currentVersion,
    };
  } catch (e: any) {
    const error = e?.message || String(e);
    migrationState.status = "failed";
    migrationState.error = error;
    migrationState.durationMs = Date.now() - start;
    console.error(`[MainSchema] FATAL: ${error.slice(0, 200)}`);
    return {
      status: "failed",
      appliedIds: [],
      failedId: null,
      error,
      durationMs: migrationState.durationMs,
      requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
      currentVersion: null,
    };
  } finally {
    if (lockAcquired) {
      try {
        const lockKeyResult = await client.query(`SELECT hashtext($1)::int AS key`, [ADVISORY_LOCK_KEY]);
        const lockKey = lockKeyResult.rows[0].key;
        await client.query(`SELECT pg_advisory_unlock($1)`, [lockKey]);
        migrationState.lockAcquired = false;
        console.log("[MainSchema] Advisory lock released");
      } catch {
        console.warn("[MainSchema] Failed to release advisory lock");
      }
    }
    try {
      await client.end();
    } catch {}
  }
}

export function resetMainSchemaStateForTest(): void {
  migrationState = {
    status: "pending",
    appliedIds: [],
    failedId: null,
    error: null,
    requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
    currentVersion: null,
    lockAcquired: false,
    startedAt: null,
    completedAt: null,
    durationMs: 0,
  };
}

const TEST_HOLD_LOCK_MAX_MS = 30_000;

/**
 * QA-CLOSE-P4 only. Holds the migration session's advisory lock AFTER real migrations
 * and ledger commits, BEFORE unlock in finally. Requires NODE_ENV=test and
 * MAIN_MIGRATION_TEST_HOLD_LOCK_AFTER_COMPLETE=true. Duration capped at 30s.
 */
async function holdAdvisoryLockAfterCompleteForTestOnly(): Promise<void> {
  if (process.env.NODE_ENV !== "test") return;
  if (process.env.MAIN_MIGRATION_TEST_HOLD_LOCK_AFTER_COMPLETE !== "true") return;
  const raw = parseInt(process.env.MAIN_MIGRATION_TEST_HOLD_LOCK_MS || "0", 10);
  if (!Number.isFinite(raw) || raw <= 0) return;
  const ms = Math.min(raw, TEST_HOLD_LOCK_MAX_MS);
  console.log(
    `[MainSchema] TEST-ONLY: holding advisory lock after successful ledger write for ${ms}ms (max ${TEST_HOLD_LOCK_MAX_MS}ms)`,
  );
  await new Promise((r) => setTimeout(r, ms));
  console.log("[MainSchema] TEST-ONLY: post-completion lock hold finished — releasing shortly");
}
