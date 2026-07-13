import { db } from "../db.js";
import { sql } from "drizzle-orm";

export async function migrateOperationalFields() {
  await db.execute(sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`);
  await db.execute(sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS customer_phone TEXT`);
  await db.execute(sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS device_name TEXT`);
  await db.execute(sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS old_reference TEXT`);
  await db.execute(sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS note TEXT`);
  await db.execute(sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS created_by TEXT`);

  await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspection_result TEXT DEFAULT 'pending'`);
  await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspection_note TEXT`);
  await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspected_by TEXT`);
  await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMP`);

  // Creator tracking — technicians can list jobs they created (read-only until assigned to them)
  await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS created_by_user_id TEXT`);
  await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS created_by_name TEXT`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_tickets_created_by_user_id ON job_tickets (created_by_user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_tickets_assigned_technician_id ON job_tickets (assigned_technician_id)`);

  // Backfill creator from latest CREATE_JOB audit (job IDs can be reused after delete/recreate)
  try {
    await db.execute(sql`
      UPDATE job_tickets jt
      SET
        created_by_user_id = src.user_id,
        created_by_name = COALESCE(u.name, jt.created_by_name)
      FROM (
        SELECT DISTINCT ON (entity_id)
          entity_id,
          user_id
        FROM audit_logs
        WHERE entity = 'JobTicket'
          AND action = 'CREATE_JOB'
          AND user_id IS NOT NULL
          AND entity_id IS NOT NULL
        ORDER BY entity_id, created_at DESC
      ) src
      LEFT JOIN users u ON u.id = src.user_id
      WHERE jt.id = src.entity_id
        AND (
          jt.created_by_user_id IS NULL
          OR jt.created_by_user_id IS DISTINCT FROM src.user_id
        )
    `);
  } catch (error) {
    console.warn("[Migration] created_by backfill skipped:", (error as Error).message);
  }

  console.log("[Migration] Operational fields migration complete");
}
