/**
 * Fail-closed disposable baseline adoption proof harness.
 *
 * MUST run under project TSX (npm run schema:adoption:proof).
 * Loads TypeScript server services via ESM .js import paths resolved by tsx —
 * plain Node cannot resolve those sibling .ts modules.
 *
 * Local only. Database name MUST start with qa_schema_update_.
 * Requires MAIN_SCHEMA_TRUST_BASELINE_ADOPTION=true.
 * Restores Git-versioned baseline, bootstrap-migrates via canonical release CLI,
 * repeats the migration to confirm it is idempotent (no-op), drops only the
 * validated disposable database (even on failure).
 *
 * Never rewrites historic ledger rows/ids/bodies/checksums.
 * Never targets ordinary dev DB, Aiven, Neon, or production.
 * Browser Playwright is out of band for this shell harness.
 */
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  activateDisposableBaselineAdoption,
  assertRestoredLedgerMatchesExpected,
  assertAdoptionVerificationRedacted,
  DISPOSABLE_ADOPTION_DB_PREFIX,
} from "../server/services/baseline-adoption.service.js";
import {
  verifyMainSchemaLedger,
  MAIN_SCHEMA_MIGRATIONS,
  REQUIRED_MAIN_SCHEMA_VERSION,
} from "../server/services/main-schema-migrate.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASELINE_DIR = path.join(
  ROOT,
  "db-baselines/main-schema/v2026_07_20_corporate_declaration",
);
const PG_BIN = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";
const PGHOST = process.env.BASELINE_PGHOST || "127.0.0.1";
const PGUSER = process.env.BASELINE_PGUSER || "postgres";
const PGPASSWORD = process.env.BASELINE_PGPASSWORD || process.env.PGPASSWORD;
const PGPORT = process.env.BASELINE_PGPORT || "5432";
const TSX_CLI = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");
const DB_PREFIX = "qa_schema_update_";

const schemaPath = path.join(BASELINE_DIR, "schema.sql");
const ledgerPath = path.join(BASELINE_DIR, "promise-schema-migrations.sql");
const manifestPath = path.join(BASELINE_DIR, "manifest.json");

const evidenceDir =
  process.env.ADOPTION_EVIDENCE_DIR ||
  path.join(
    ROOT,
    "mobile-qa/disposable-baseline-adoption-proof",
    new Date().toISOString().slice(0, 10).replace(/-/g, "")
  );
mkdirSync(evidenceDir, { recursive: true });

const log: Array<Record<string, unknown>> = [];
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const dbName = `${DB_PREFIX}${stamp}_${randomBytes(2).toString("hex")}`;
const dbUrl = `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD || "")}@${PGHOST}:${PGPORT}/${dbName}`;

let created = false;
let dropped = false;

function sha256File(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function redact(s: unknown): string {
  let value = String(s)
    .replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***:***@")
    .replace(/password[=:]\s*\S+/gi, "password=***");
  if (PGPASSWORD) {
    value = value.replace(
      new RegExp(PGPASSWORD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      "***"
    );
  }
  return value;
}

function runPsql(db: string, argsExtra: string[]): string {
  const r = spawnSync(
    path.join(PG_BIN, "psql.exe"),
    ["-U", PGUSER, "-h", PGHOST, "-p", String(PGPORT), "-d", db, ...argsExtra],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD },
      maxBuffer: 20 * 1024 * 1024,
    }
  );
  const out = redact((r.stdout || "") + (r.stderr || ""));
  if (r.status !== 0) {
    throw new Error(`psql ${db} failed (${r.status}): ${out.slice(0, 2000)}`);
  }
  return out;
}

function dropDisposableIfNeeded(): void {
  if (!created || dropped) return;
  if (!dbName.startsWith(DB_PREFIX)) {
    throw new Error("Refusing drop: database name failed prefix re-check");
  }
  runPsql("postgres", [
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
  ]);
  dropped = true;
  log.push({ step: "drop-db", ok: true, prefix: DB_PREFIX });
}

function assertLocalHost(): void {
  const host = String(PGHOST).toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("Harness refuses non-local PGHOST");
  }
}

function assertTsxRuntime(): void {
  // Fail closed if someone bypasses the package script / launcher without tsx.
  // tsx sets this when loading TypeScript modules; plain Node never will for our services.
  if (process.env.ADOPTION_PROOF_UNDER_TSX !== "1") {
    // Still allow direct `tsx scripts/disposable-baseline-adoption-proof.ts` without launcher flag
    // by detecting tsx CLI presence on argv.
    const argvJoined = process.argv.join(" ");
    const looksLikeTsx =
      argvJoined.includes(`${path.sep}tsx${path.sep}`) ||
      argvJoined.includes("tsx/dist/cli") ||
      argvJoined.includes("node_modules\\tsx") ||
      argvJoined.includes("node_modules/tsx");
    if (!looksLikeTsx) {
      throw new Error(
        "Harness requires project TSX runtime. Use: npm run schema:adoption:proof (do not run with plain node)."
      );
    }
  }
  if (!existsSync(TSX_CLI)) {
    throw new Error("tsx CLI missing under node_modules/tsx — run npm install");
  }
}

async function main(): Promise<void> {
  assertTsxRuntime();
  assertLocalHost();

  if (process.env.MAIN_SCHEMA_TRUST_BASELINE_ADOPTION !== "true") {
    throw new Error(
      "Refusing: set MAIN_SCHEMA_TRUST_BASELINE_ADOPTION=true for disposable baseline adoption proof only"
    );
  }
  if (!PGPASSWORD) {
    throw new Error("BASELINE_PGPASSWORD or PGPASSWORD is required");
  }
  if (!existsSync(schemaPath) || !existsSync(ledgerPath) || !existsSync(manifestPath)) {
    throw new Error("Baseline files missing in " + BASELINE_DIR);
  }
  if (!dbName.startsWith(DB_PREFIX)) {
    throw new Error("Internal error: disposable name missing required prefix");
  }

  process.env.DATABASE_URL = dbUrl;
  process.env.NODE_ENV =
    process.env.NODE_ENV === "production"
      ? "development"
      : process.env.NODE_ENV || "development";

  const frozenPath = path.join(BASELINE_DIR, "frozen-source-identity.json");
  if (!existsSync(frozenPath)) {
    throw new Error(
      "frozen-source-identity.json missing. Run: npm run schema:adoption:emit-frozen-identity then commit the reviewed file."
    );
  }

  if (DISPOSABLE_ADOPTION_DB_PREFIX !== DB_PREFIX) {
    throw new Error("Prefix constant mismatch");
  }

  // Two-identity activation: B (frozen source) verified; A (baseline ledger) becomes expected.
  // Child migrate/verify processes re-activate via MAIN_SCHEMA_TRUST_BASELINE_ADOPTION=true.
  const activated = await activateDisposableBaselineAdoption({
    cwd: ROOT,
    env: process.env,
    databaseUrl: dbUrl,
  });
  const preAdoption = activated.verification;
  assertAdoptionVerificationRedacted(preAdoption);
  log.push({
    step: "adoption-activate",
    ok: preAdoption.ok,
    sessionActive: activated.sessionActive,
    decision: preAdoption.adoptionDecision,
    fingerprint: preAdoption.evidenceFingerprint,
    reasons: preAdoption.reasons,
  });
  if (!preAdoption.ok || !activated.sessionActive || !activated.expectedById) {
    throw new Error(
      `Adoption activation rejected: ${preAdoption.reasons.join(" | ") || preAdoption.adoptionDecision}. If frozen B is empty, run npm run schema:adoption:emit-frozen-identity and commit.`
    );
  }
  const accepted = { accepted: true as const, expectedById: activated.expectedById };

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    files: { "schema.sql": { sha256: string }; "promise-schema-migrations.sql": { sha256: string } };
  };
  const schemaHash = sha256File(schemaPath);
  const ledgerHash = sha256File(ledgerPath);
  if (schemaHash !== manifest.files["schema.sql"].sha256) {
    throw new Error("schema.sql hash mismatch vs manifest");
  }
  if (ledgerHash !== manifest.files["promise-schema-migrations.sql"].sha256) {
    throw new Error("ledger sql hash mismatch vs manifest");
  }
  log.push({ step: "manifest-hash-verify", ok: true });

  runPsql("postgres", [
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
  ]);
  runPsql("postgres", ["-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbName};`]);
  created = true;
  log.push({ step: "create-db", ok: true, prefix: DB_PREFIX });

  runPsql(dbName, ["-v", "ON_ERROR_STOP=1", "-f", schemaPath]);
  log.push({ step: "restore-schema", ok: true });
  runPsql(dbName, ["-v", "ON_ERROR_STOP=1", "-f", ledgerPath]);
  log.push({ step: "restore-ledger", ok: true });

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  const ledgerRows = await client.query(
    `SELECT id, checksum FROM promise_schema_migrations ORDER BY id`
  );
  const liveMap: Record<string, string> = {};
  for (const row of ledgerRows.rows as Array<{ id: string; checksum: string }>) {
    liveMap[row.id] = row.checksum;
  }
  const match = assertRestoredLedgerMatchesExpected(liveMap, accepted.expectedById);
  if (!match.ok) {
    await client.end();
    throw new Error(
      `Restored ledger does not match accepted expected historic checksums missing=${match.missingCount} disagree=${match.disagreeCount}`
    );
  }
  log.push({
    step: "restored-ledger-matches-expected",
    ok: true,
    historicCount: Object.keys(accepted.expectedById).length,
    mutation: "none",
  });
  await client.end();

  const migrate = spawnSync(process.execPath, [TSX_CLI, "server/db-migrate-main.ts"], {
    encoding: "utf8",
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      MAIN_MIGRATION_RELEASE_MODE: "true",
      MAIN_SCHEMA_TRUST_BASELINE_ADOPTION: "true",
      NODE_ENV: "development",
      PGPASSWORD,
    },
    maxBuffer: 20 * 1024 * 1024,
  });
  const migrateOut = redact((migrate.stdout || "") + (migrate.stderr || ""));
  if (migrate.status !== 0) {
    throw new Error(`bootstrap migrate failed: ${migrateOut.slice(0, 2000)}`);
  }
  log.push({ step: "bootstrap-migrate", ok: true, snippet: migrateOut.slice(-400) });

  const verification = await verifyMainSchemaLedger();
  if (
    !verification.ok ||
    verification.mismatched.length > 0 ||
    verification.extra.length > 0 ||
    verification.missing.length > 0 ||
    verification.currentVersion !== REQUIRED_MAIN_SCHEMA_VERSION ||
    verification.appliedIds.length !== MAIN_SCHEMA_MIGRATIONS.length
  ) {
    throw new Error(
      `post-bootstrap verify failed: applied=${verification.appliedIds.length} missing=${verification.missing.length} mismatched=${verification.mismatched.length} extra=${verification.extra.length} current=${verification.currentVersion}`
    );
  }
  log.push({
    step: "post-bootstrap-verify",
    ok: true,
    applied: verification.appliedIds.length,
    currentVersion: verification.currentVersion,
  });

  const client2 = new pg.Client({ connectionString: dbUrl });
  await client2.connect();
  const afterRows = await client2.query(
    `SELECT id, checksum FROM promise_schema_migrations WHERE id = ANY($1::text[])`,
    [Object.keys(accepted.expectedById)]
  );
  const afterMap: Record<string, string> = {};
  for (const row of afterRows.rows as Array<{ id: string; checksum: string }>) {
    afterMap[row.id] = row.checksum;
  }
  const historicStillMatch = assertRestoredLedgerMatchesExpected(afterMap, accepted.expectedById);
  if (!historicStillMatch.ok) {
    await client2.end();
    throw new Error("Historic ledger rows were mutated during bootstrap — forbidden");
  }
  log.push({ step: "historic-ledger-unmutated", ok: true });
  await client2.end();

  const migrate2 = spawnSync(process.execPath, [TSX_CLI, "server/db-migrate-main.ts"], {
    encoding: "utf8",
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      MAIN_MIGRATION_RELEASE_MODE: "true",
      MAIN_SCHEMA_TRUST_BASELINE_ADOPTION: "true",
      NODE_ENV: "development",
      PGPASSWORD,
    },
    maxBuffer: 20 * 1024 * 1024,
  });
  const migrate2Out = redact((migrate2.stdout || "") + (migrate2.stderr || ""));
  if (migrate2.status !== 0) {
    throw new Error(`idempotent migrate failed: ${migrate2Out.slice(0, 1500)}`);
  }
  log.push({ step: "bootstrap-migrate-repeat-noop", ok: true });

  dropDisposableIfNeeded();

  const summary = {
    status: "PASS",
    databasePrefix: DB_PREFIX,
    dropped,
    adoptionDecision: preAdoption.adoptionDecision,
    evidenceFingerprint: preAdoption.evidenceFingerprint,
    historicalLedgerMutation: "none",
    registryHead: REQUIRED_MAIN_SCHEMA_VERSION,
    playwright: "NOT_RUN_BY_SHELL_HARNESS",
    browserPlaywrightNote:
      "Desktop/mobile Playwright must use Playwright MCP/browser tooling, not this shell harness.",
    log,
  };
  writeFileSync(
    path.join(evidenceDir, "adoption-proof-results.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        databasePrefix: DB_PREFIX,
        dropped,
        adoptionDecision: preAdoption.adoptionDecision,
        fingerprint: preAdoption.evidenceFingerprint,
        playwright: "NOT_RUN_BY_SHELL_HARNESS",
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((e: unknown) => {
  const err = redact(e instanceof Error ? e.message : String(e));
  try {
    dropDisposableIfNeeded();
  } catch (dropErr: unknown) {
    log.push({
      step: "drop-db-on-error",
      ok: false,
      error: redact(dropErr instanceof Error ? dropErr.message : String(dropErr)),
    });
  }
  const summary = {
    status: "FAIL",
    databasePrefix: DB_PREFIX,
    dropped,
    error: err,
    playwright: "NOT_RUN_BY_SHELL_HARNESS",
    log,
  };
  try {
    writeFileSync(
      path.join(evidenceDir, "adoption-proof-results.json"),
      JSON.stringify(summary, null, 2)
    );
  } catch {
    /* ignore */
  }
  console.error(err);
  process.exit(1);
});
