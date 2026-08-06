import { sql } from "drizzle-orm";
import { db } from "../db.js";

/**
 * Warranty periods, resolved once at job completion.
 *
 * The labour warranty was calculated inline in two places — pos-billing when a
 * job is paid, and jobs.routes when its status is set to Completed — with the
 * same six lines duplicated. This is that logic in one place, plus the parts
 * clock which had nowhere to come from.
 *
 * WHY THE PARTS WARRANTY IS SNAPSHOTTED, NOT LOOKED UP
 *
 * The period is copied onto the job at the moment of completion and never read
 * from the catalogue again. If a claim resolved against inventory_items, then
 * editing a part's warranty from 180 days to 90 next year would silently
 * shorten warranties on televisions repaired last year — customers were sold
 * 180 days and the record must hold what was sold. Same reasoning as an
 * invoice: you do not recalculate an old one when prices change.
 *
 * WHERE A PARTS WARRANTY COMES FROM
 *
 * Two sources, because the shop buys two ways:
 *
 *   productLines -> inventory_items.warranty_days   stocked parts
 *   local_purchases.warranty_days                   sourced parts, bought ad
 *                                                   hoc, period negotiated per
 *                                                   purchase
 *
 * The job takes the LONGEST of them. A job with a 180-day panel and a 30-day
 * capacitor is "under parts warranty" for 180 days — the customer holds cover
 * on the panel for that long, and refusing at day 60 because a capacitor also
 * happened to be fitted would be wrong. Which specific part is covered is
 * settled at claim time; this field answers the cheaper question, "is anything
 * still covered?", without parsing JSON on every read.
 *
 * Returns null when no fitted part carries a warranty. NULL means "no distinct
 * parts warranty" and claim validity falls back to the labour expiry, so every
 * job written before these columns existed behaves exactly as it did.
 */

export interface ResolvedWarranty {
    /** Labour. Existing behaviour, unchanged. */
    warrantyExpiryDate: Date | null;
    /** Longest fitted-part warranty, or null when no part carries one. */
    partsWarrantyExpiryDate: Date | null;
    /** The winning parts period in days, for display and audit. */
    partsWarrantyDays: number | null;
}

function addDays(from: Date, days: number): Date {
    const d = new Date(from);
    d.setDate(d.getDate() + days);
    return d;
}

/**
 * Longest warranty among the parts fitted to a job, in days.
 *
 * Reads both sources in one round trip each. Failures are swallowed and treated
 * as "no parts warranty": a completion must never fail because a warranty
 * lookup did, and the labour warranty still applies.
 */
export async function resolvePartsWarrantyDays(
    jobId: string,
    productLinesJson: string | null | undefined,
): Promise<number | null> {
    let longest: number | null = null;

    // ── Stocked parts, via the catalogue ──────────────────────────────────
    try {
        const lines: unknown = productLinesJson ? JSON.parse(productLinesJson) : [];
        const ids = Array.isArray(lines)
            ? lines
                  .map((l) => (l && typeof l === "object" ? (l as any).inventoryItemId : null))
                  .filter((v): v is string => typeof v === "string" && v.length > 0)
            : [];

        if (ids.length > 0) {
            const rows = await db.execute(sql`
                SELECT MAX(warranty_days) AS "maxDays"
                FROM inventory_items
                WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
                  AND warranty_days IS NOT NULL
            `);
            const max = ((rows as any).rows ?? rows)[0]?.maxDays;
            if (max != null) longest = Math.max(longest ?? 0, Number(max));
        }
    } catch (err) {
        console.error("[JobWarranty] Catalogue parts lookup failed:", (err as Error).message);
    }

    // ── Sourced parts, via what was actually bought for this job ──────────
    try {
        const rows = await db.execute(sql`
            SELECT MAX(warranty_days) AS "maxDays"
            FROM local_purchases
            WHERE job_ticket_id = ${jobId}
              AND status = 'Consumed'
              AND warranty_days IS NOT NULL
        `);
        const max = ((rows as any).rows ?? rows)[0]?.maxDays;
        if (max != null) longest = Math.max(longest ?? 0, Number(max));
    } catch (err) {
        console.error("[JobWarranty] Sourced parts lookup failed:", (err as Error).message);
    }

    return longest != null && longest > 0 ? longest : null;
}

/**
 * Both warranty clocks for a job being completed.
 *
 * `completedAt` is passed rather than read from the clock so both expiries are
 * measured from the same instant — two `new Date()` calls a few milliseconds
 * apart would otherwise produce periods that disagree by a day at a midnight
 * boundary.
 *
 * An existing expiry is never overwritten: re-completing a job, or paying an
 * already-completed one, must not extend a warranty the customer has been
 * running down.
 */
export async function resolveJobWarranty(
    job: {
        id: string;
        warrantyDays?: number | null;
        warrantyExpiryDate?: Date | string | null;
        partsWarrantyExpiryDate?: Date | string | null;
        productLines?: string | null;
    },
    completedAt: Date = new Date(),
): Promise<ResolvedWarranty> {
    const labourDays = Number(job.warrantyDays ?? 30);

    const warrantyExpiryDate = job.warrantyExpiryDate
        ? new Date(job.warrantyExpiryDate)
        : labourDays > 0
          ? addDays(completedAt, labourDays)
          : null;

    if (job.partsWarrantyExpiryDate) {
        return {
            warrantyExpiryDate,
            partsWarrantyExpiryDate: new Date(job.partsWarrantyExpiryDate),
            partsWarrantyDays: null,
        };
    }

    const partsDays = await resolvePartsWarrantyDays(job.id, job.productLines);

    return {
        warrantyExpiryDate,
        partsWarrantyExpiryDate: partsDays != null ? addDays(completedAt, partsDays) : null,
        partsWarrantyDays: partsDays,
    };
}
