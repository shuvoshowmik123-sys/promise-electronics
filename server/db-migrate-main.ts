import dotenv from "dotenv";
import path from "path";
import { runMainSchemaMigrations } from "./services/main-schema-migrate.service.js";

const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set. This command requires DATABASE_URL from the environment.");
  process.exit(1);
}

if (process.env.MAIN_MIGRATION_RELEASE_MODE !== "true") {
  console.error("ERROR: db:migrate:main requires MAIN_MIGRATION_RELEASE_MODE=true to be set explicitly in the release/pre-deploy environment.");
  console.error("This guard prevents accidental migration execution from normal server startup or local shells.");
  console.error("Render release command example: MAIN_MIGRATION_RELEASE_MODE=true npm run db:migrate:main");
  process.exit(1);
}

function classifyDatabaseTarget(rawUrl: string): { isLocal: boolean } | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname;
    if (!host) return null;
    const protocol = (url.protocol || "").replace(/:$/, "").toLowerCase();
    if (protocol !== "postgres" && protocol !== "postgresql") return null;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    return { isLocal };
  } catch {
    return null;
  }
}

const target = classifyDatabaseTarget(process.env.DATABASE_URL);
if (!target) {
  console.error("[db:migrate:main] ERROR — invalid database configuration");
  process.exit(1);
}

const isLocal = target.isLocal;
if (process.env.NODE_ENV === "production" && !isLocal && process.env.ALLOW_PROD_DB_MIGRATE_MAIN !== "true") {
  console.error("ERROR: db:migrate:main against production/Aiven requires ALLOW_PROD_DB_MIGRATE_MAIN=true in addition to MAIN_MIGRATION_RELEASE_MODE=true.");
  console.error("Set both flags only in the Render release/pre-deploy environment, never in the runtime server environment.");
  process.exit(1);
}

(async () => {
  console.log("[db:migrate:main] Starting MAIN schema migration (release mode)...");
  console.log(`[db:migrate:main] Target class: ${isLocal ? "local" : "remote"}`);
  const result = await runMainSchemaMigrations();
  if (result.status === "complete") {
    console.log(`[db:migrate:main] SUCCESS — ${result.appliedIds.length} migrations applied. Version: ${result.currentVersion}. Duration: ${result.durationMs}ms.`);
    process.exit(0);
  } else if (result.status === "lock_timeout") {
    console.error(`[db:migrate:main] LOCK TIMEOUT — another process owns the migration lock. Duration: ${result.durationMs}ms.`);
    process.exit(2);
  } else if (result.status === "skipped") {
    console.log(`[db:migrate:main] SKIPPED — ${result.appliedIds.length} migrations already applied.`);
    process.exit(0);
  } else {
    console.error("[db:migrate:main] FAILED — migration did not complete");
    process.exit(1);
  }
})().catch(() => {
  console.error("[db:migrate:main] FATAL — unexpected command failure");
  process.exit(1);
});
