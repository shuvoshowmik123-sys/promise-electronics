import { db } from "../db.js";
import { sql } from "drizzle-orm";

export async function migratePasswordChangedAt() {
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP`);
}
