import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  MAIN_SCHEMA_MIGRATIONS,
  computeMigrationChecksum,
} from "../server/services/main-schema-migrate.service.js";

const reconciliationId = "2026_07_19_reminders_prerequisite_reconciliation";
const schedulerId = "2026_07_19_scheduler_delivery_claim_ddl";

describe("reminders prerequisite reconciliation", () => {
  it("is registered before the dependent scheduler migration", () => {
    const ids = MAIN_SCHEMA_MIGRATIONS.map((migration) => migration.id);
    expect(ids.indexOf(reconciliationId)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(reconciliationId)).toBeLessThan(ids.indexOf(schedulerId));
  });

  it("creates the canonical prerequisite idempotently without rewriting history", () => {
    const migration = MAIN_SCHEMA_MIGRATIONS.find(({ id }) => id === reconciliationId);
    expect(migration).toBeDefined();
    const body = migration!.up.toString();
    expect(body).toContain("CREATE TABLE IF NOT EXISTS reminders");
    expect(body).toContain("REFERENCES job_tickets(id) ON DELETE SET NULL");
    expect(body).toContain("CREATE INDEX IF NOT EXISTS idx_reminders_user_id");
    expect(body).toContain("CREATE INDEX IF NOT EXISTS idx_reminders_remind_at");
    expect(body).toContain("CREATE INDEX IF NOT EXISTS idx_reminders_is_sent");
    expect(computeMigrationChecksum(migration!)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("proof confines baseline adoption to local qa_schema_update_reminders_reconcile child migration", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "scripts/reminders-prerequisite-reconciliation-proof.mjs"),
      "utf8",
    );
    expect(source).toContain('const SAFE_PREFIX = "qa_schema_update_reminders_reconcile_"');
    expect(source).toContain('const TRUST_BASELINE_ADOPTION_ENV = "MAIN_SCHEMA_TRUST_BASELINE_ADOPTION"');
    expect(source).toMatch(/function assertSafeProofDatabaseUrl/);
    expect(source).toMatch(/assertSafeProofDatabaseUrl\(url\);[\s\S]*spawnSync/);
    expect(source).toMatch(/\[TRUST_BASELINE_ADOPTION_ENV\]: "true"/);
    expect(source).not.toMatch(/process\.env\.MAIN_SCHEMA_TRUST_BASELINE_ADOPTION\s*=/);
  });

  it("proof asserts historic ledger retention and one reconciliation ledger row", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "scripts/reminders-prerequisite-reconciliation-proof.mjs"),
      "utf8",
    );
    expect(source).toMatch(/function assertTrustedHistoricBaselineRows/);
    expect(source).toMatch(/function assertHistoricLedgerRowsRetained/);
    expect(source).toMatch(/function assertReconciliationLedgerRowOnce/);
    expect(source).toMatch(/historic ledger checksum rewritten after migration/);
    expect(source).toMatch(/reconciliation ledger row count=\$\{count\}/);
    expect(source).toMatch(/_historic_ledger_retained_after_first/);
    expect(source).toMatch(/_historic_ledger_retained_after_repeat/);
    expect(source).toMatch(/_reconciliation_ledger_row_once_after_first/);
    expect(source).toMatch(/_reconciliation_ledger_row_once_after_repeat/);
  });
});
