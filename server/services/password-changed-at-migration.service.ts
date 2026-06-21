import { neon } from "@neondatabase/serverless";

export async function migratePasswordChangedAt() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not configured");

  const sql = neon(url);
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP`;
}
