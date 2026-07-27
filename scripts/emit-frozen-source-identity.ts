/**
 * Operator tool: write Git-reviewed frozen source identity (B) for disposable adoption.
 *
 * NOT an acceptance path — never called by verifyBaselineAdoption / startup / migrator.
 * Run explicitly after reviewing source, then commit the resulting JSON.
 *
 *   npx tsx scripts/emit-frozen-source-identity.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  FROZEN_SOURCE_IDENTITY_RELATIVE,
  TRUSTED_BASELINE_DIR_RELATIVE,
} from "../server/services/baseline-adoption.service.js";
import { loadTrustedBaselineLedger } from "../server/services/ledger-reconciliation-audit.service.js";
import { getCanonicalRegistryIdentity } from "../server/services/main-schema-migrate.service.js";

async function main() {
  const cwd = process.cwd();
  const baseline = await loadTrustedBaselineLedger(cwd);
  const registry = getCanonicalRegistryIdentity();

  const migrations: Array<{ id: string; sourceChecksum: string }> = [];
  const missing: string[] = [];
  for (const entry of baseline.migrations) {
    const sourceChecksum = registry.checksumById[entry.id];
    if (!sourceChecksum) {
      missing.push(entry.id);
      continue;
    }
    migrations.push({ id: entry.id, sourceChecksum });
  }

  if (missing.length > 0) {
    console.error(
      `[emit-frozen-source-identity] FAIL — registry missing baseline ids: ${missing.join(", ")}`
    );
    process.exit(1);
  }

  const payload = {
    schemaVersion: 1,
    baselineVersion: baseline.baselineVersion,
    registryHead: baseline.registryHead,
    identityKind: "current_source_checksum_v1",
    algorithm: "sha256_16_of_id_description_upToString",
    note: "Identity B: frozen current source checksums for adopted historic ids. Do not equate to baseline ledger checksums (A). Regenerate only via this script after explicit review; never at acceptance time.",
    migrations,
  };

  const outPath = path.resolve(cwd, FROZEN_SOURCE_IDENTITY_RELATIVE);
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(
    `[emit-frozen-source-identity] Wrote ${migrations.length} identities to ${FROZEN_SOURCE_IDENTITY_RELATIVE} (baseline dir ${TRUSTED_BASELINE_DIR_RELATIVE})`
  );
}

main().catch((e) => {
  console.error("[emit-frozen-source-identity] FATAL", (e as Error).message?.slice(0, 200));
  process.exit(1);
});
