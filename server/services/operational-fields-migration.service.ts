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

  console.log("[Migration] Operational fields migration complete");
}
