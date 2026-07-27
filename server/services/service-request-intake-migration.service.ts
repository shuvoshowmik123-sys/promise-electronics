import { createHmac } from "crypto";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { normalizePhone } from "../utils/phone.js";

const BD_MOBILE_RE = /^1\d{9}$/;

/**
 * SERVICE-INTAKE-RELIABILITY-01C / 01C-HOTFIX-1 / 01C-HOTFIX-2
 * Idempotent service_requests column additions + indexes.
 * Scrubs legacy raw fingerprints; backfills users.phone_normalized (counts only, no PII logs).
 */
export async function migrateServiceRequestIntakeIdempotency(): Promise<void> {
  for (const [col, def] of [
    ["phone_normalized", "TEXT"],
    ["intake_source", "TEXT"],
    ["client_request_id", "TEXT"],
    ["idempotency_fingerprint", "TEXT"],
    ["source", "TEXT"],
  ] as [string, string][]) {
    await db.execute(sql.raw(
      `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS ${col} ${def}`,
    ));
  }

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_service_requests_phone_normalized
    ON service_requests (phone_normalized)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_service_requests_client_request_id
    ON service_requests (client_request_id)
    WHERE client_request_id IS NOT NULL
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_service_requests_fingerprint_window
    ON service_requests (idempotency_fingerprint, created_at DESC)
    WHERE idempotency_fingerprint IS NOT NULL
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_service_requests_client_request_id
    ON service_requests (client_request_id, intake_source)
    WHERE client_request_id IS NOT NULL
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_service_requests_idempotency_fingerprint
    ON service_requests (idempotency_fingerprint, phone_normalized)
    WHERE idempotency_fingerprint IS NOT NULL
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_service_requests_idempotency_created
    ON service_requests (idempotency_fingerprint, phone_normalized, created_at DESC)
    WHERE idempotency_fingerprint IS NOT NULL
  `);

  await scrubRawIdempotencyFingerprints();
  await backfillCustomerPhoneNormalized();

  console.log("[Migration] service_requests intake idempotency migration complete");
}

/**
 * Convert legacy raw pipe-separated fingerprints to HMAC-SHA-256 digests.
 * Never logs fingerprint values or PII material.
 */
async function scrubRawIdempotencyFingerprints(): Promise<void> {
  const secret = process.env.INTAKE_FINGERPRINT_SECRET;
  if (!secret || secret.trim().length < 16) {
    console.warn(
      "[Migration] INTAKE_FINGERPRINT_SECRET missing — skipping fingerprint scrub (rows left for next startup)",
    );
    return;
  }

  const res = await db.execute(sql`
    SELECT id, idempotency_fingerprint
    FROM service_requests
    WHERE idempotency_fingerprint IS NOT NULL
      AND position('|' in idempotency_fingerprint) > 0
  `);
  const rows = ((res as any).rows ?? res) as Array<{ id: string; idempotency_fingerprint: string }>;
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("[Migration] fingerprint scrub: 0 raw rows");
    return;
  }

  let updated = 0;
  for (const row of rows) {
    const digest = createHmac("sha256", secret)
      .update(row.idempotency_fingerprint, "utf8")
      .digest("hex");
    await db.execute(sql`
      UPDATE service_requests
      SET idempotency_fingerprint = ${digest}
      WHERE id = ${row.id}
        AND position('|' in idempotency_fingerprint) > 0
    `);
    updated += 1;
  }
  console.log(`[Migration] fingerprint scrub: ${updated} rows recomputed`);
}

/**
 * HOTFIX-2: backfill users.phone_normalized for Customer rows with null/blank normalized phone.
 * Counts only — never logs phone values or customer identities.
 * Does not merge/delete duplicate legacy accounts.
 */
export async function backfillCustomerPhoneNormalized(): Promise<{
  scanned: number;
  backfilled: number;
  invalid: number;
  duplicateNormalizedGroups: number;
}> {
  const res = await db.execute(sql`
    SELECT id, phone
    FROM users
    WHERE role = 'Customer'
      AND (phone_normalized IS NULL OR btrim(phone_normalized) = '')
  `);
  const rows = ((res as any).rows ?? res) as Array<{ id: string; phone: string | null }>;
  let scanned = 0;
  let backfilled = 0;
  let invalid = 0;

  if (Array.isArray(rows)) {
    for (const row of rows) {
      scanned += 1;
      const norm = normalizePhone(row.phone);
      if (!norm || !BD_MOBILE_RE.test(norm)) {
        invalid += 1;
        continue;
      }
      await db.execute(sql`
        UPDATE users
        SET phone_normalized = ${norm}
        WHERE id = ${row.id}
          AND (phone_normalized IS NULL OR btrim(phone_normalized) = '')
      `);
      backfilled += 1;
    }
  }

  const dupRes = await db.execute(sql`
    SELECT count(*)::int AS c FROM (
      SELECT phone_normalized
      FROM users
      WHERE role = 'Customer'
        AND phone_normalized IS NOT NULL
        AND btrim(phone_normalized) <> ''
      GROUP BY phone_normalized
      HAVING count(*) > 1
    ) d
  `);
  const duplicateNormalizedGroups = Number(((dupRes as any).rows ?? dupRes)[0]?.c || 0);

  console.log(
    `[Migration] customer phone_normalized backfill: scanned=${scanned} backfilled=${backfilled} invalid=${invalid} duplicateNormalizedGroups=${duplicateNormalizedGroups}`,
  );

  return { scanned, backfilled, invalid, duplicateNormalizedGroups };
}
