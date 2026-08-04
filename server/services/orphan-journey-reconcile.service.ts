/**
 * ITEM 4 — Reconcile orphan repair journeys (canonical implementation).
 *
 * Adopts journeys whose linked service request ALREADY has a customer_id and
 * whose own customer_id is NULL. Never guesses an owner. Never touches a
 * journey whose service request is also unowned. Never overwrites a non-null
 * journey owner. When a journey references BOTH a service request and a quote
 * request, adopt only when both sides agree on the same owner; differing
 * owners are counted as skippedConflictingOwners and left untouched.
 *
 * Counts and the adoption write run inside ONE SQL statement, so a run is
 * atomic: either the whole statement applies or none of it does.
 * Report counts only — no customer PII. Idempotent — safe to run twice.
 * Manual only — not invoked at server startup. Refuses non-local targets
 * unless ALLOW_REMOTE_ORPHAN_RECONCILE=1.
 */

import { db } from "../db.js";
import { sql } from "drizzle-orm";
export { shouldAdoptOrphanJourney } from "./orphan-journey-reconcile.rules.js";

export type OrphanJourneyReconcileReport = {
  candidates: number;
  adopted: number;
  skippedUnownedRequest: number;
  skippedAlreadyOwned: number;
  skippedConflictingOwners: number;
};

function firstRow(result: unknown): Record<string, unknown> {
  const r = result as { rows?: Record<string, unknown>[] };
  if (Array.isArray(r.rows) && r.rows[0]) return r.rows[0];
  return {};
}

function asInt(value: unknown): number {
  return Number(value ?? 0);
}

export type ReconcileTargetClassification = "local" | "remote" | "invalid";

/**
 * Classifies a DATABASE_URL for orphan reconciliation by its PARSED hostname
 * only. "localhost" anywhere else (username, password, path, query) does NOT
 * make a target local. Malformed or empty URLs fail closed.
 */
export function classifyReconcileTarget(urlString: string | undefined | null): ReconcileTargetClassification {
  if (!urlString || urlString.trim() === "") return "invalid";
  let parsed: URL;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return "invalid";
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "") return "invalid";
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") {
    return "local";
  }
  return "remote";
}

function assertReconcileTargetSafe(): void {
  const url = process.env.DATABASE_URL;
  const kind = classifyReconcileTarget(url);
  if (kind === "invalid") {
    throw new Error(
      "Refusing orphan journey reconcile: DATABASE_URL is missing or malformed."
    );
  }
  if (kind === "remote" && process.env.ALLOW_REMOTE_ORPHAN_RECONCILE !== "1") {
    throw new Error(
      "Refusing orphan journey reconcile: DATABASE_URL host is not a local loopback target. Set ALLOW_REMOTE_ORPHAN_RECONCILE=1 only after explicit operator review."
    );
  }
}

/**
 * Resolves per-journey ownership from linked service_requests only.
 * - base: every ownerless journey with the owner proven by each linked request
 * - owned: one row per proven owner (both refs, even when they agree)
 * - conflicting: journeys whose linked requests prove DIFFERENT owners
 * - candidates: ownerless journeys with exactly one distinct proven owner
 */
const RESOLVE_CTE = sql`
  WITH base AS (
    SELECT j.id AS journey_id,
      (SELECT sr.customer_id FROM service_requests sr WHERE sr.id = j.service_request_id) AS owner_by_service,
      (SELECT sr.customer_id FROM service_requests sr WHERE sr.id = j.quote_request_id) AS owner_by_quote
    FROM customer_repair_journeys j
    WHERE j.customer_id IS NULL
  ),
  owned AS (
    SELECT journey_id, owner_by_service AS owner_id FROM base WHERE owner_by_service IS NOT NULL
    UNION ALL
    SELECT journey_id, owner_by_quote AS owner_id FROM base WHERE owner_by_quote IS NOT NULL
  ),
  conflicting AS (
    SELECT journey_id FROM owned GROUP BY journey_id HAVING COUNT(DISTINCT owner_id) > 1
  ),
  candidates AS (
    SELECT journey_id, MIN(owner_id) AS owner_id
    FROM owned
    WHERE journey_id NOT IN (SELECT journey_id FROM conflicting)
    GROUP BY journey_id
  )
`;

/**
 * Idempotent reconciliation. Copies the proven owner from linked
 * service_requests onto unowned journeys (service_request_id or
 * quote_request_id), skipping conflicts.
 *
 * dryRun default true: counts only, no writes.
 * Pass { dryRun: false } to apply.
 */
export async function reconcileOrphanJourneys(opts?: {
  dryRun?: boolean;
}): Promise<OrphanJourneyReconcileReport> {
  assertReconcileTargetSafe();

  const dryRun = opts?.dryRun !== false;

  // Single atomic statement: the applied CTE either writes (apply mode) or
  // matches nothing (dry-run), and the outer SELECT returns every count.
  const result = await db.execute(sql`
    ${RESOLVE_CTE},
    applied AS (
      UPDATE customer_repair_journeys j
      SET customer_id = c.owner_id, updated_at = NOW()
      FROM candidates c
      WHERE j.id = c.journey_id
        AND j.customer_id IS NULL
        ${dryRun ? sql`AND FALSE` : sql``}
      RETURNING j.id
    )
    SELECT
      (SELECT COUNT(*)::int FROM candidates) AS candidates,
      (SELECT COUNT(*)::int FROM applied) AS adopted,
      (SELECT COUNT(*)::int FROM conflicting) AS conflicts,
      (SELECT COUNT(*)::int FROM customer_repair_journeys j
        WHERE j.customer_id IS NULL
          AND (j.service_request_id IS NOT NULL OR j.quote_request_id IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM service_requests sr
            WHERE (sr.id = j.service_request_id OR sr.id = j.quote_request_id)
              AND sr.customer_id IS NOT NULL
          )) AS skipped_unowned,
      (SELECT COUNT(*)::int FROM customer_repair_journeys WHERE customer_id IS NOT NULL) AS already_owned
  `);

  const row = firstRow(result);
  return {
    candidates: asInt(row.candidates),
    adopted: asInt(row.adopted),
    skippedUnownedRequest: asInt(row.skipped_unowned),
    skippedAlreadyOwned: asInt(row.already_owned),
    skippedConflictingOwners: asInt(row.conflicts),
  };
}
