/**
 * ITEM 4 — Manual orphan journey reconciliation (CLI harness).
 *
 * Thin wrapper over the canonical reconcileOrphanJourneys service — the SQL
 * lives only in server/services/orphan-journey-reconcile.service.ts.
 *
 * Usage (local / reviewed env only):
 *   node scripts/reconcile-orphan-journeys.mjs            # dry-run (default)
 *   node scripts/reconcile-orphan-journeys.mjs --apply    # write
 *
 * Does NOT run at server startup. Refuses remote targets unless
 * ALLOW_REMOTE_ORPHAN_RECONCILE=1 (enforced by the service).
 */

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

if (!process.env.DATABASE_URL) {
  try {
    const envContent = readFileSync(path.join(ROOT, ".env"), "utf8");
    const match = envContent.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m);
    if (match) process.env.DATABASE_URL = match[1];
  } catch {
    // no .env
  }
}

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set. Local testing only — refuse to guess a host.");
  process.exit(1);
}

const { reconcileOrphanJourneys } = await import("../server/services/orphan-journey-reconcile.service.js");

const APPLY = process.argv.includes("--apply");

try {
  const report = await reconcileOrphanJourneys({ dryRun: !APPLY });
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", ...report }, null, 2));
} catch (err) {
  console.error("FATAL:", (err as Error).message?.slice(0, 300) || err);
  process.exit(1);
}
