import { neon } from "@neondatabase/serverless";

export async function migrateOperationalFields() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not configured");

  const sql = neon(url);

  // Part 1: Legacy due support — add source, customerPhone, deviceName, oldReference
  await sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`;
  await sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS customer_phone TEXT`;
  await sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS device_name TEXT`;
  await sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS old_reference TEXT`;
  await sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS note TEXT`;
  await sql`ALTER TABLE due_records ADD COLUMN IF NOT EXISTS created_by TEXT`;

  // Part 2: Job ticket inspection support
  await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspection_result TEXT DEFAULT 'pending'`;
  await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspection_note TEXT`;
  await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspected_by TEXT`;
  await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMP`;

  console.log("[Migration] Operational fields migration complete");
}
