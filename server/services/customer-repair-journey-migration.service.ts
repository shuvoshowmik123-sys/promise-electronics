import { neon } from "@neondatabase/serverless";

export async function migrateCustomerRepairJourneyTables() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not configured");

  const sql = neon(url);

  await sql`CREATE TABLE IF NOT EXISTS customer_repair_journeys (
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
  )`;

  await sql`CREATE TABLE IF NOT EXISTS customer_repair_journey_events (
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
  )`;

  await sql`CREATE TABLE IF NOT EXISTS customer_repair_schedules (
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
  )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_crj_customer_id ON customer_repair_journeys (customer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_crj_service_request_id ON customer_repair_journeys (service_request_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_crj_quote_request_id ON customer_repair_journeys (quote_request_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_crj_job_ticket_id ON customer_repair_journeys (job_ticket_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_crj_current_stage ON customer_repair_journeys (current_stage)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_crj_created_at ON customer_repair_journeys (created_at DESC)`;

  await sql`CREATE INDEX IF NOT EXISTS idx_crje_journey_id ON customer_repair_journey_events (journey_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_crje_created_at ON customer_repair_journey_events (created_at DESC)`;

  await sql`CREATE INDEX IF NOT EXISTS idx_crs_journey_id ON customer_repair_schedules (journey_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_crs_status ON customer_repair_schedules (status)`;

  await sql`ALTER TABLE customer_repair_schedules ADD COLUMN IF NOT EXISTS assigned_driver_id TEXT`;
  await sql`ALTER TABLE customer_repair_schedules ADD COLUMN IF NOT EXISTS zone TEXT`;
  await sql`ALTER TABLE customer_repair_schedules ADD COLUMN IF NOT EXISTS route_order INTEGER`;
  await sql`ALTER TABLE customer_repair_schedules ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMP`;
  await sql`ALTER TABLE customer_repair_schedules ADD COLUMN IF NOT EXISTS pickup_schedule_id TEXT`;

  await sql`ALTER TABLE customer_repair_journeys ADD COLUMN IF NOT EXISTS warranty_claim_id TEXT`;
}
