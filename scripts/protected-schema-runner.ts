/**
 * Separately invocable protected schema-update runner.
 *
 * Consumes durable Super Admin update requests created by the control-plane API.
 * Uses server-only configuration. Does not accept browser credentials.
 * Calls ONLY the canonical MAIN executor: runMainSchemaMigrations from
 * server/services/main-schema-migrate.service.ts (promise_schema_migrations).
 *
 * Development-safe by default:
 *   SCHEMA_PROTECTED_RUNNER_ENABLED=true npx tsx scripts/protected-schema-runner.ts
 *
 * Production/Aiven remains disabled unless ALLOW_PROD_DB_MIGRATE_MAIN=true (explicit).
 *
 * BOOTSTRAP: schema_update_runs must already exist (trusted MAIN release apply).
 * This process does not create the control-plane table.
 */
import dotenv from "dotenv";
import path from "path";
import { randomUUID } from "crypto";
import {
  claimNextPendingRun,
  evaluateProtectedRunnerGate,
  isControlPlaneTableReady,
  markRunFailed,
  processClaimedSchemaUpdateRun,
} from "../server/services/schema-update-run.service.js";

const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

async function main() {
  if (process.env.SCHEMA_PROTECTED_RUNNER_ENABLED !== "true") {
    console.error(
      "[ProtectedRunner] Disabled. Set SCHEMA_PROTECTED_RUNNER_ENABLED=true (development-safe runner only)."
    );
    process.exit(2);
  }

  if (!process.env.DATABASE_URL) {
    console.error("[ProtectedRunner] ERROR — DATABASE_URL is not set");
    process.exit(1);
  }

  const gate = evaluateProtectedRunnerGate();
  if (!gate.allowed) {
    console.error(`[ProtectedRunner] Refusing to run: ${gate.reason}`);
    process.exit(2);
  }

  if (gate.mode !== "development" && process.env.ALLOW_PROD_DB_MIGRATE_MAIN !== "true") {
    console.error(
      "[ProtectedRunner] Non-development databases require explicit ALLOW_PROD_DB_MIGRATE_MAIN=true."
    );
    process.exit(2);
  }

  const ready = await isControlPlaneTableReady();
  if (!ready) {
    console.error(
      "[ProtectedRunner] Control plane not bootstrapped. Apply MAIN migration 2026_07_22_schema_update_control_plane via trusted release command first."
    );
    process.exit(2);
  }

  console.log(`[ProtectedRunner] Starting (mode=${gate.mode})`);

  const runnerId = `runner-${randomUUID().slice(0, 8)}`;
  const claimed = await claimNextPendingRun(runnerId);
  if (!claimed) {
    console.log("[ProtectedRunner] No pending request to process (or another run is active).");
    process.exit(0);
  }

  console.log(`[ProtectedRunner] Claimed run ${claimed.id}`);

  try {
    const outcome = await processClaimedSchemaUpdateRun(claimed);

    if (!outcome.ddlInvoked) {
      console.error(
        `[ProtectedRunner] BLOCKED run=${claimed.id}: integrity fail-closed, no DDL invoked`
      );
      process.exit(3);
    }

    const status = outcome.run?.status ?? outcome.result?.status ?? "unknown";
    console.log(
      `[ProtectedRunner] Finished run=${claimed.id} status=${status} ddlInvoked=${outcome.ddlInvoked} applied=${outcome.result?.appliedIds.length ?? 0}`
    );

    if (outcome.run?.status === "blocked") {
      process.exit(3);
    }
    if (outcome.result?.status === "failed" || outcome.run?.status === "failed") {
      process.exit(1);
    }
    if (outcome.result?.status === "lock_timeout" || outcome.run?.status === "timed_out") {
      process.exit(2);
    }
    process.exit(0);
  } catch (err) {
    await markRunFailed(
      claimed.id,
      "unknown",
      "Protected runner ended unexpectedly. Re-verify ledger before retry."
    ).catch(() => undefined);
    console.error(
      "[ProtectedRunner] Unexpected failure:",
      (err as Error).message?.slice(0, 200)
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[ProtectedRunner] Startup failure:", (err as Error).message?.slice(0, 200));
  process.exit(1);
});
