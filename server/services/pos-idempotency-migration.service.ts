/**
 * SYSTEM-UNIFICATION-00C-B / HOTFIX-1 — POS client request idempotency columns (idempotent startup).
 * Does not run on Aiven/production from this agent; local/Neon QA only.
 */
import { db } from "../db.js";
import { sql } from "drizzle-orm";

export async function migratePosIdempotencyFields(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS client_request_id TEXT
  `);
  await db.execute(sql`
    ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS created_by_user_id TEXT
  `);
  await db.execute(sql`
    ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS idempotency_fingerprint TEXT
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_pos_txn_client_request_actor
    ON pos_transactions (created_by_user_id, client_request_id)
    WHERE client_request_id IS NOT NULL AND created_by_user_id IS NOT NULL
  `);
  console.log("[Migration] POS idempotency columns migration complete");
}
