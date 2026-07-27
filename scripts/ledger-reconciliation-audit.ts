/**
 * Server-only MAIN ledger reconciliation audit (read-only).
 *
 * Compares:
 *   1) canonical MAIN registry (MAIN_SCHEMA_MIGRATIONS)
 *   2) trusted Git baseline ledger (db-baselines/.../manifest.json)
 *   3) live promise_schema_migrations (when DATABASE_URL is set)
 *
 * Emits only redacted classification, counts, versions, and a deterministic evidence fingerprint.
 * Never edits historic ledger rows, checksums, migration IDs, or bodies.
 * Never auto-adopts a compatibility override.
 *
 * Usage:
 *   npx tsx scripts/ledger-reconciliation-audit.ts
 *   npm run schema:audit:ledger
 */
import dotenv from "dotenv";
import path from "path";
import {
  assertAuditRedacted,
  runLedgerReconciliationAudit,
} from "../server/services/ledger-reconciliation-audit.service.js";

const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

async function main() {
  console.log("[LedgerAudit] Starting read-only reconciliation audit (no DDL, no ledger writes).");
  const audit = await runLedgerReconciliationAudit();
  assertAuditRedacted(audit);

  // Single JSON object — already redacted; no secrets.
  console.log(JSON.stringify(audit, null, 2));

  if (audit.blocked) {
    console.error(
      `[LedgerAudit] BLOCKED classification=${audit.classification}. ` +
        "Mismatch remains fail-closed. No historical ledger mutation. Adoption not performed."
    );
    process.exit(2);
  }

  console.log("[LedgerAudit] Healthy relative to registry verification.");
  process.exit(0);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[LedgerAudit] FATAL (no DDL attempted): ${msg.slice(0, 200)}`);
  process.exit(1);
});
