/**
 * 00C-A-HOTFIX / HOTFIX-2: admin-only retail quote acceptance confirmation notes.
 * Idempotent. Fail-closed: FK/index failures throw (startup must not claim ready).
 * Customer routes must never SELECT this table.
 */
import { db } from "../db.js";
import { sql } from "drizzle-orm";

function assertSafeSchemaName(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid schema name for retail quote admin acceptances: ${name.slice(0, 40)}`);
  }
  return name;
}

export type RetailQuoteAdminAcceptanceMigrateOpts = {
  /** Isolated schema for QA proof only. Production uses public. */
  schemaName?: string;
};

export async function migrateRetailQuoteAdminAcceptanceTables(
  opts: RetailQuoteAdminAcceptanceMigrateOpts = {},
): Promise<void> {
  const schemaName = assertSafeSchemaName(opts.schemaName?.trim() || "public");
  const table = `${schemaName}.retail_quote_admin_acceptances`;
  const idxName = schemaName === "public" ? "idx_rqaa_service_request_id" : `idx_rqaa_sr_${schemaName}`;
  const fkName = schemaName === "public" ? "fk_rqaa_service_request" : `fk_rqaa_sr_${schemaName}`;

  if (schemaName !== "public") {
    await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`));
  }

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id TEXT PRIMARY KEY,
      service_request_id TEXT NOT NULL,
      admin_user_id TEXT NOT NULL,
      admin_name TEXT,
      confirmation_note TEXT NOT NULL,
      accepted_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  // FK to public.service_requests (canonical retail SR table)
  await db.execute(sql.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = '${fkName}'
      ) THEN
        ALTER TABLE ${table}
          ADD CONSTRAINT ${fkName}
          FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `));

  await db.execute(sql.raw(`
    CREATE INDEX IF NOT EXISTS ${idxName}
    ON ${table} (service_request_id)
  `));

  // Post-condition proof — fail closed if any piece missing
  const proof = await db.execute(sql.raw(`
    SELECT
      (SELECT COUNT(*)::int FROM information_schema.tables
        WHERE table_schema = '${schemaName}' AND table_name = 'retail_quote_admin_acceptances') AS table_ok,
      (SELECT COUNT(*)::int FROM pg_indexes
        WHERE schemaname = '${schemaName}' AND indexname = '${idxName}') AS index_ok,
      (SELECT COUNT(*)::int FROM pg_constraint
        WHERE conname = '${fkName}') AS fk_ok
  `));
  const row = (proof as any).rows?.[0] ?? (Array.isArray(proof) ? proof[0] : null);
  if (!row || Number(row.table_ok) < 1 || Number(row.index_ok) < 1 || Number(row.fk_ok) < 1) {
    throw new Error(
      `[RetailQuoteAdminAcceptance] migration incomplete schema=${schemaName} table=${row?.table_ok} index=${row?.index_ok} fk=${row?.fk_ok}`,
    );
  }

  console.log(`[RetailQuoteAdminAcceptance] migration complete schema=${schemaName}`);
}
