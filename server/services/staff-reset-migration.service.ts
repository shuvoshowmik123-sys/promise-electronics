import { neon } from "@neondatabase/serverless";

export async function migrateStaffResetCodes() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not configured");

  const sql = neon(url);

  await sql`CREATE TABLE IF NOT EXISTS staff_reset_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_staff_reset_codes_user_id ON staff_reset_codes (user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_staff_reset_codes_expires ON staff_reset_codes (expires_at)`;
}
