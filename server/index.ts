import dns from "node:dns";
// Prefer IPv4 when resolving the DB host. Neon's hostname returns AAAA (IPv6)
// records that are unreachable from some networks (ENETUNREACH), causing Node to
// waste the connect timeout on a dead IPv6 route before falling back to IPv4 —
// which repeatedly killed local + would stall Render connects. IPv4-first skips it.
dns.setDefaultResultOrder("ipv4first");

import { createApp, getHttpServer, log } from "./app.js";
// Trigger restart v3 - inlined module auth
import { serveStatic } from "./static.js";
import { seedSuperAdmin } from "./seed.js";
import { Request, Response, NextFunction } from "express";
import { aiErrorHandler } from "./middleware/ai-error-handler.js";
import { sanitizeErrorForResponse, logErrorSafe } from "./utils/safe-error.js";
import { startDrawerDayCloseScheduler, stopDrawerDayCloseScheduler } from "./services/drawer-day-close.service.js";
import { startAbandonmentScheduler, stopAbandonmentScheduler } from "./services/abandonment.service.js";
import { startReminderScheduler, stopReminderScheduler } from "./services/reminder.service.js";
import { startBackupScheduler, stopBackupScheduler } from "./services/backup-scheduler.service.js";
import { seedDefaultCommissionRules } from "./services/commission.service.js";
import { initNightlyJobs, stopNightlyJobs } from "./services/nightly-jobs.service.js";
import {
  startSystemIncidentSchedulers,
  stopSystemIncidentSchedulers,
} from "./services/system-incidents.service.js";
import { brainService } from "./brain/brain.service.js";
import { verifyMainSchemaLedger, recordMainSchemaVerified, REQUIRED_MAIN_SCHEMA_VERSION } from "./services/main-schema-migrate.service.js";
import { markMainSchemaComplete, markMainSchemaFailed, markOptionalJobsComplete, recordOptionalJob, startReadinessChecks, stopReadinessChecks, isMainSchemaVerifiedComplete } from "./services/db-readiness.js";
import { logRedactedLedgerReconciliationAudit } from "./services/ledger-reconciliation-audit.service.js";

// ── Crash guards ────────────────────────────────────────────────────────────
// Keep the server alive through transient failures (esp. Neon DB connection
// timeouts — see server/db.ts). A single uncaught DB-connect rejection used to
// kill the whole process; for a 24/7 shop backend that means total outage on a
// momentary network blip. Log and keep serving; the failed request just 500s.
process.on("unhandledRejection", (reason: any) => {
  const msg = reason?.message || reason?.code || String(reason);
  console.error("[unhandledRejection] (kept alive):", msg);
});

process.on("uncaughtException", (err: any) => {
  // Socket/network 'error' events with no listener surface here. Log, stay up.
  console.error("[uncaughtException] (kept alive):", err?.message || err, err?.stack?.split("\n")[1]?.trim());
});

async function runStartupTask(name: string, task: () => Promise<any>, retries = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await task();
      return true;
    } catch (e: any) {
      const message = e?.message || String(e);
      if (attempt === retries) {
        console.error(`[Startup] ${name} FAILED after ${retries} attempts: ${message.slice(0, 200)}`);
        return false;
      }
      console.warn(`[Startup] ${name} retry ${attempt}/${retries}: ${message.slice(0, 100)}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  return false;
}

// MAIN schema readiness is the PRIMARY readiness gate.
// Normal server startup NEVER executes MAIN schema DDL in any environment (dev or production).
// Startup performs read-only ledger verification only. Incomplete/mismatched ledgers leave
// readiness degraded (503 on /ready, /api/ready, all dynamic API).
// DDL is applied only via:
//   - trusted release CLI: MAIN_MIGRATION_RELEASE_MODE=true npm run db:migrate:main
//   - protected schema runner (after Super Admin request + integrity gate)
async function runMainSchemaPhase(): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  const isReleaseMode = process.env.MAIN_MIGRATION_RELEASE_MODE === "true";

  if (isReleaseMode && !process.env.ALLOW_PROD_RELEASE_MODE_IN_SERVER) {
    console.error("[Startup] MAIN_MIGRATION_RELEASE_MODE=true is for db:migrate:main only. Normal server startup refuses migration execution.");
    markMainSchemaFailed("Release mode flag set during server startup — refusing to run migrations");
    return;
  }

  if (process.env.SKIP_STARTUP_MIGRATIONS === "true") {
    console.log("[Startup] SKIP_STARTUP_MIGRATIONS=true — skipping MAIN schema auto-apply path.");
    // Harness-only: never mark development/production ready without ledger verification.
    const allowSkipAsReady =
      process.env.ALLOW_SKIP_MIGRATIONS_AS_READY === "true" &&
      process.env.NODE_ENV === "test";
    if (allowSkipAsReady) {
      console.log("[Startup] ALLOW_SKIP_MIGRATIONS_AS_READY=true with NODE_ENV=test — marking ready for test harness only.");
      recordMainSchemaVerified("skip-test-harness", ["skip-test-harness"]);
      markMainSchemaComplete("skip-test-harness");
      return;
    }
    // Same verify-only path as normal boot so ops/proofs can detect no-DDL startup.
    console.log("[Startup] SKIP_STARTUP_MIGRATIONS — performing read-only MAIN schema ledger verification (no DDL).");
    await verifyMainSchemaReadOnly("SKIP_STARTUP_MIGRATIONS");
    return;
  }

  console.log("[Startup] Performing read-only MAIN schema ledger verification (no DDL in any environment).");
  await verifyMainSchemaReadOnly(isProduction ? "production" : "development");
}

async function verifyMainSchemaReadOnly(contextLabel: string): Promise<void> {
  const verification = await verifyMainSchemaLedger();
  if (verification.ok) {
    recordMainSchemaVerified(verification.currentVersion, verification.appliedIds);
    markMainSchemaComplete(verification.currentVersion);
    console.log(
      `[Startup] MAIN schema ledger verified complete (read-only, ${contextLabel}). Version: ${verification.currentVersion}. Required: ${REQUIRED_MAIN_SCHEMA_VERSION}.`
    );
    return;
  }

  console.error(
    `[Startup] MAIN schema ledger verification FAILED (${contextLabel}) — staying not-ready / degraded. Missing: ${verification.missing.length}, Mismatched: ${verification.mismatched.length}, Extra: ${verification.extra.length}. Apply via trusted release CLI or protected runner after integrity is healthy.`
  );
  markMainSchemaFailed(
    `Ledger verification failed (${contextLabel}): missing=${verification.missing.length} mismatched=${verification.mismatched.length} extra=${verification.extra.length}`
  );
  // Server-only redacted reconciliation audit — never mutates ledger; never prints secrets/SQL/checksums.
  await logRedactedLedgerReconciliationAudit(verification);
}

// Optional jobs: seeds, backfills, reconciliations, Brain work.
// These run ONLY after MAIN schema is verified complete.
// MAIN optional jobs (seeds/backfills/reconciliations/schedulers) MUST NOT run if schema failed/pending.
// Brain jobs remain separate and non-blocking.
async function runOptionalJobsPhase(): Promise<void> {
  const skipAsReadyTestHarness =
    process.env.SKIP_STARTUP_MIGRATIONS === "true" &&
    process.env.ALLOW_SKIP_MIGRATIONS_AS_READY === "true" &&
    process.env.NODE_ENV === "test";
  if (process.env.SKIP_STARTUP_MIGRATIONS === "true" && !skipAsReadyTestHarness) {
    console.log("[Startup] SKIP_STARTUP_MIGRATIONS=true without test-only ALLOW_SKIP_MIGRATIONS_AS_READY — skipping optional jobs until ledger is verified ready.");
    return;
  }

  if (!isMainSchemaVerifiedComplete()) {
    console.warn("[Startup] MAIN schema not verified complete — skipping MAIN optional jobs (seeds, backfills, schedulers). Brain work continues separately.");
    const brainResults = await Promise.all([
      runStartupTask("Brain Phase 6 migration", () => brainService.migratePhase6Columns(), 2),
      runStartupTask("Brain KG migration", () => brainService.migrateKGTables(), 2),
      runStartupTask("Brain seed conversations", () => brainService.seedConversationsIfEmpty(), 2),
      runStartupTask("Brain phase 2 seed", () => brainService.seedPhase2ConversationsIfNeeded(), 2),
    ]);
    recordOptionalJob("brain_phase6_migration", brainResults[0] ? "ok" : "failed");
    recordOptionalJob("brain_kg_migration", brainResults[1] ? "ok" : "failed");
    recordOptionalJob("brain_seed_conversations", brainResults[2] ? "ok" : "failed");
    recordOptionalJob("brain_phase2_seed", brainResults[3] ? "ok" : "failed");
    return;
  }

  // Super admin seed — optional MAIN job, runs only after schema verified complete
  const superAdminOk = await runStartupTask("super admin seed", seedSuperAdmin);
  recordOptionalJob("super_admin_seed", superAdminOk ? "ok" : "failed");

  // Commission rule seed
  let commissionOk = true;
  if (process.env.MAIN_MIGRATION_TEST_INJECT_OPTIONAL_FAILURE === "true") {
    console.log("[Startup] TEST: injecting optional job failure for P6 proof");
    commissionOk = false;
    recordOptionalJob("commission_rule_seed", "failed", "TEST_INJECTED_OPTIONAL_FAILURE");
  } else {
    commissionOk = await runStartupTask("commission rule seed", seedDefaultCommissionRules);
    recordOptionalJob("commission_rule_seed", commissionOk ? "ok" : "failed");
  }

  // Brain work — separate DB (BRAIN_DATABASE_URL), never affects MAIN readiness
  const brainResults = await Promise.all([
    runStartupTask("Brain Phase 6 migration", () => brainService.migratePhase6Columns(), 2),
    runStartupTask("Brain KG migration", () => brainService.migrateKGTables(), 2),
    runStartupTask("Brain seed conversations", () => brainService.seedConversationsIfEmpty(), 2),
    runStartupTask("Brain phase 2 seed", () => brainService.seedPhase2ConversationsIfNeeded(), 2),
  ]);
  recordOptionalJob("brain_phase6_migration", brainResults[0] ? "ok" : "failed");
  recordOptionalJob("brain_kg_migration", brainResults[1] ? "ok" : "failed");
  recordOptionalJob("brain_seed_conversations", brainResults[2] ? "ok" : "failed");
  recordOptionalJob("brain_phase2_seed", brainResults[3] ? "ok" : "failed");

  // Optional MAIN data jobs (backfills, reconciliations) — best-effort, do not gate readiness
  const optionalMainJobs = await Promise.all([
    runStartupTask("operational fields creator backfill", async () => {
      const { db } = await import("./db.js");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`
        UPDATE job_tickets jt
        SET
          created_by_user_id = src.user_id,
          created_by_name = COALESCE(u.name, jt.created_by_name)
        FROM (
          SELECT DISTINCT ON (entity_id)
            entity_id,
            user_id
          FROM audit_logs
          WHERE entity = 'JobTicket'
            AND action = 'CREATE_JOB'
            AND user_id IS NOT NULL
            AND entity_id IS NOT NULL
          ORDER BY entity_id, created_at DESC
        ) src
        LEFT JOIN users u ON u.id = src.user_id
        WHERE jt.id = src.entity_id
          AND (
            jt.created_by_user_id IS NULL
            OR jt.created_by_user_id IS DISTINCT FROM src.user_id
          )
      `);
    }, 1),
    runStartupTask("logistics pickup backfill", async () => {
      const { backfillPickupSchedulesToLogisticsTasks } = await import("./services/logistics-task.service.js");
      await backfillPickupSchedulesToLogisticsTasks();
    }, 1),
    runStartupTask("service request fingerprint scrub", async () => {
      const { db } = await import("./db.js");
      const { sql } = await import("drizzle-orm");
      const { createHmac } = await import("crypto");
      const secret = process.env.INTAKE_FINGERPRINT_SECRET;
      if (!secret || secret.trim().length < 16) return;
      const res = await db.execute(sql`
        SELECT id, idempotency_fingerprint
        FROM service_requests
        WHERE idempotency_fingerprint IS NOT NULL
          AND position('|' in idempotency_fingerprint) > 0
      `);
      const rows = ((res as any).rows ?? res) as Array<{ id: string; idempotency_fingerprint: string }>;
      if (!Array.isArray(rows) || rows.length === 0) return;
      for (const row of rows) {
        const digest = createHmac("sha256", secret).update(row.idempotency_fingerprint, "utf8").digest("hex");
        await db.execute(sql`
          UPDATE service_requests
          SET idempotency_fingerprint = ${digest}
          WHERE id = ${row.id}
            AND position('|' in idempotency_fingerprint) > 0
        `);
      }
    }, 1),
    runStartupTask("customer phone_normalized backfill", async () => {
      const { backfillCustomerPhoneNormalized } = await import("./services/service-request-intake-migration.service.js");
      await backfillCustomerPhoneNormalized();
    }, 1),
    runStartupTask("attendance location reconcile", async () => {
      const { reconcileCanonicalServiceCenterWorkLocation } = await import("./services/attendance-location.service.js");
      await reconcileCanonicalServiceCenterWorkLocation();
    }, 1),
    runStartupTask("backup_metadata data backfill", async () => {
      const { db } = await import("./db.js");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`UPDATE backup_metadata SET storage_object_key = google_drive_file_id WHERE storage_object_key IS NULL AND google_drive_file_id IS NOT NULL`);
    }, 1),
  ]);

  const jobNames = [
    "operational_fields_backfill",
    "logistics_pickup_backfill",
    "fingerprint_scrub",
    "phone_normalized_backfill",
    "attendance_reconcile",
    "backup_metadata_backfill",
  ];
  optionalMainJobs.forEach((ok, i) => {
    recordOptionalJob(jobNames[i], ok ? "ok" : "failed");
  });

  // Observability only — HOTFIX-2: never gates /ready or isDbReady().
  markOptionalJobsComplete();
  console.log("[Startup] Optional jobs complete.");
}

(async () => {
  const app = await createApp();
  const httpServer = getHttpServer();
  // RUN_BACKGROUND_JOBS=false lets ops disable schedulers on a specific dyno without changing NODE_ENV.
  const runBackgroundJobs = process.env.RUN_BACKGROUND_JOBS === "false"
    ? false
    : (process.env.NODE_ENV === "production" || process.env.RUN_BACKGROUND_JOBS === "true");
  if (!runBackgroundJobs) {
    console.log("[Startup] Background schedulers disabled. Set RUN_BACKGROUND_JOBS=true to enable.");
  }

  if (process.env.NODE_ENV === "production" && process.env.GROQ_API_KEY) {
    app.use(aiErrorHandler);
  }

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    logErrorSafe("ERROR HANDLER", req, err);
    if (!res.headersSent) {
      const payload = sanitizeErrorForResponse(err);
      res.status(payload.statusCode).json({
        error: payload.error,
        ...(payload.code ? { code: payload.code } : {}),
        requestId: (req as any).correlationId,
      });
    }
  });

  // Catch-all for unmet /api routes so they return JSON 404 instead of HTML
  app.use("/api", (req, res) => {
    res.status(404).json({ message: "API route not found" });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5083", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
      // Fire MAIN schema migration + readiness checks AFTER the server is accepting connections
      // so /health and /ready are always available (503 until MAIN schema is complete).
      startReadinessChecks();
      void runMainSchemaPhase().then(() => {
        // After MAIN schema phase (complete or failed), start optional jobs (best-effort, separate status).
        runOptionalJobsPhase().then(() => {
          startReadinessChecks(); // idempotent — starts watchdog if not running
          // Start schedulers ONLY if MAIN schema is verified complete.
          // A pending/failed schema must run no MAIN schedulers (day-close, abandonment, reminders, backups, nightly).
          // Each scheduler also guards with isDbReady() on every tick.
          if (runBackgroundJobs && isMainSchemaVerifiedComplete()) {
            startDrawerDayCloseScheduler();
            startAbandonmentScheduler();
            startReminderScheduler();
            startBackupScheduler();
            initNightlyJobs();
            startSystemIncidentSchedulers();
            console.log("[Startup] Background schedulers started after verified MAIN schema.");
          } else if (runBackgroundJobs && !isMainSchemaVerifiedComplete()) {
            console.warn("[Startup] MAIN schema not verified complete — background schedulers NOT started.");
          }
        });
      });
    },
  );

  // Graceful shutdown — always release the port on exit so EADDRINUSE
  // never occurs on the next startup (especially critical on Windows
  // where sockets can stay in TIME_WAIT/CLOSE_WAIT state).
  const shutdown = (signal: string) => {
    log(`Received ${signal}. Closing HTTP server gracefully...`);
    stopDrawerDayCloseScheduler();
    stopSystemIncidentSchedulers();
    stopAbandonmentScheduler();
    stopReminderScheduler();
    stopBackupScheduler();
    stopNightlyJobs();
    stopSystemIncidentSchedulers();
    stopReadinessChecks();
    httpServer.close((err) => {
      if (err) {
        console.error("[Shutdown] Error closing server:", err);
        process.exit(1);
      } else {
        log(`[Shutdown] Server closed. Port ${port} released. Goodbye.`);
        process.exit(0);
      }
    });

    // Force-kill after 10 seconds if connections won't drain
    setTimeout(() => {
      console.error("[Shutdown] Could not drain connections in time, forcing exit.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
