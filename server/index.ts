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
import { startDrawerDayCloseScheduler, stopDrawerDayCloseScheduler } from "./services/drawer-day-close.service.js";
import { startAbandonmentScheduler, stopAbandonmentScheduler } from "./services/abandonment.service.js";
import { startReminderScheduler, stopReminderScheduler } from "./services/reminder.service.js";
import { startBackupScheduler, stopBackupScheduler } from "./services/backup-scheduler.service.js";
import { seedDefaultCommissionRules } from "./services/commission.service.js";
import { initNightlyJobs } from "./services/nightly-jobs.service.js";
import { brainService } from "./brain/brain.service.js";
import { migrateB2BRuleProfileTables } from "./services/b2b-rule-profile.service.js";
import { migrateManualPaymentTables } from "./services/manual-payment-migration.service.js";
import { migrateCustomerRepairJourneyTables } from "./services/customer-repair-journey-migration.service.js";
import { migrateStaffResetCodes } from "./services/staff-reset-migration.service.js";
import { migratePasswordChangedAt } from "./services/password-changed-at-migration.service.js";
import { migrateOperationalFields } from "./services/operational-fields-migration.service.js";
import { migrateCallAttempts } from "./services/call-attempt.service.js";
import { migrateStaffInvitations } from "./services/staff-invite.service.js";
import { migrateLogisticsTasks } from "./services/logistics-task-migration.service.js";
import { backfillPickupSchedulesToLogisticsTasks } from "./services/logistics-task.service.js";
import { markMigrationsComplete, startReadinessChecks } from "./services/db-readiness.js";

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
        console.warn(`[Startup] ${name} skipped after ${retries} attempts: ${message.slice(0, 120)}`);
        return false;
      }
      console.warn(`[Startup] ${name} retry ${attempt}/${retries}: ${message.slice(0, 100)}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  return false;
}

// Seeds + idempotent schema migrations. Historically these ran BEFORE
// httpServer.listen(), so on a cold Render boot the server refused all
// connections (incl. /health) until ~10 serial round-trips to a cold Neon DB
// finished — adding many seconds to every cold start. They now run in the
// background AFTER the server is listening. Set SKIP_STARTUP_MIGRATIONS=true to
// disable entirely (e.g. once they are moved to a dedicated deploy/release step).
async function runStartupMigrations(): Promise<boolean> {
  if (process.env.SKIP_STARTUP_MIGRATIONS === "true") {
    console.log("[Startup] SKIP_STARTUP_MIGRATIONS=true — skipping background seeds/migrations.");
    return true;
  }

  // Super admin seed first — admin login depends on it. Idempotent.
  const superAdminReady = await runStartupTask("super admin seed", seedSuperAdmin);

  // The rest are independent + idempotent — run concurrently to cut total time.
  const results = await Promise.all([
    runStartupTask("commission rule seed", seedDefaultCommissionRules),
    runStartupTask("Brain Phase 6 migration", () => brainService.migratePhase6Columns(), 2),
    runStartupTask("Brain KG migration", () => brainService.migrateKGTables(), 2),
    runStartupTask("Brain seed conversations", () => brainService.seedConversationsIfEmpty(), 2),
    runStartupTask("Brain phase 2 seed", () => brainService.seedPhase2ConversationsIfNeeded(), 2),
    runStartupTask("B2B rule profile migration", migrateB2BRuleProfileTables, 2),
    runStartupTask("manual payment migration", migrateManualPaymentTables, 2),
    runStartupTask("customer repair journey migration", migrateCustomerRepairJourneyTables, 2),
    runStartupTask("staff reset codes migration", migrateStaffResetCodes, 2),
    runStartupTask("password_changed_at migration", migratePasswordChangedAt, 2),
    runStartupTask("operational fields migration", migrateOperationalFields, 2),
    runStartupTask("call attempts migration", migrateCallAttempts, 2),
    runStartupTask("staff invitations migration", migrateStaffInvitations, 2),
    runStartupTask("logistics tasks migration + backfill", async () => {
      await migrateLogisticsTasks();
      await backfillPickupSchedulesToLogisticsTasks();
    }, 2),
    runStartupTask("job model+serial+outcome migration", async () => {
      const { db } = await import("./db.js");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS model_number TEXT`);
      await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS serial_number TEXT`);
      await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS repair_outcome TEXT`);
      await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS closure_reason TEXT`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_tickets_model ON job_tickets (model_number)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_tickets_serial ON job_tickets (serial_number)`);
    }, 2),
    runStartupTask("firebase_uid migration", async () => {
      const { db } = await import("./db.js");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users (firebase_uid)`);
    }, 2),
    runStartupTask("payment_blacklist migration", async () => {
      const { db } = await import("./db.js");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`CREATE TABLE IF NOT EXISTS payment_blacklist (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        reason TEXT,
        added_by TEXT,
        added_by_name TEXT,
        service_request_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_payment_blacklist_phone ON payment_blacklist (phone)`);
    }, 2),
  ]);
  const complete = superAdminReady && results.every(Boolean);
  console.log(complete ? "[Startup] Background seeds/migrations complete." : "[Startup] Background seeds/migrations incomplete.");
  return complete;
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

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("[ERROR HANDLER]", err);

    if (!res.headersSent) {
      res.status(status).json({ message });
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
      // Fire seeds/migrations AFTER the server is accepting connections so they
      // never block cold-start /health checks or the first request.
      startReadinessChecks();
      void runStartupMigrations().then((complete) => {
        if (complete) markMigrationsComplete();
        startReadinessChecks(); // idempotent — starts watchdog if not running
        // Start schedulers only after migrations so they don't race DB setup.
        // Each scheduler also guards with isDbReady() on every tick.
        if (runBackgroundJobs) {
          startDrawerDayCloseScheduler();
          startAbandonmentScheduler();
          startReminderScheduler();
          startBackupScheduler();
          initNightlyJobs();
          console.log("[Startup] Background schedulers started after migrations.");
        }
      });
    },
  );

  // Graceful shutdown — always release the port on exit so EADDRINUSE
  // never occurs on the next startup (especially critical on Windows
  // where sockets can stay in TIME_WAIT/CLOSE_WAIT state).
  const shutdown = (signal: string) => {
    log(`Received ${signal}. Closing HTTP server gracefully...`);
    stopDrawerDayCloseScheduler();
    stopAbandonmentScheduler();
    stopReminderScheduler();
    stopBackupScheduler();
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
