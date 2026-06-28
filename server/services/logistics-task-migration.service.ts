import { db } from "../db.js";
import { sql } from "drizzle-orm";

export async function migrateLogisticsTasks() {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS logistics_tasks (
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

    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_sr ON logistics_tasks (service_request_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_job ON logistics_tasks (job_ticket_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_status ON logistics_tasks (status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_driver ON logistics_tasks (assigned_driver_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_type ON logistics_tasks (task_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_date ON logistics_tasks (scheduled_date)`);

    await db.execute(sql`ALTER TABLE logistics_tasks ADD COLUMN IF NOT EXISTS legacy_pickup_schedule_id TEXT`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_logistics_tasks_legacy_pu ON logistics_tasks (legacy_pickup_schedule_id)`);
}
