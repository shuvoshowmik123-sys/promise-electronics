/**
 * Teach the brain what a finished repair proved.
 *
 * A service request records the brand, screen size and model the customer
 * typed. On its own that is just typing. Once the job it converted into has
 * been *completed*, a technician has physically had the set on the bench, and
 * the pairing is worth believing — so completion, not intake, is the trigger.
 *
 * This reads MAIN and writes the brain, which are two different databases and
 * therefore cannot share a transaction. A crash between them is ordinary, not
 * exceptional, so correctness comes from the harvest log claiming each job id
 * before it is counted rather than from atomicity.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { isDbReady } from "./db-readiness.js";
import { logBackgroundFailure } from "../utils/safe-error.js";
import { ensureEncyclopediaTables, recordSighting } from "../brain/tv-encyclopedia.service.js";

/** Enough to keep up nightly without holding either pool open for long. */
const BATCH = 500;

export type HarvestResult = { examined: number; learned: number };

type MainRunner = { execute: (q: any) => Promise<any> };

export async function harvestTvModels(
    mainRunner: MainRunner = db as any,
    brainRunner?: { execute: (q: any) => Promise<any> },
): Promise<HarvestResult> {
    await ensureEncyclopediaTables(brainRunner as any);

    /**
     * Only completed jobs, and only rows where all three facts are present.
     * A blank model teaches nothing, and a blank brand cannot be keyed on.
     */
    const res = await mainRunner.execute(sql`
        SELECT j.id AS job_id,
               sr.brand        AS brand,
               sr.model_number AS model_number,
               sr.screen_size  AS screen_size
        FROM job_tickets j
        JOIN service_requests sr ON sr.converted_job_id = j.id
        WHERE j.status = 'Completed'
          AND sr.model_number IS NOT NULL AND btrim(sr.model_number) <> ''
          AND sr.brand IS NOT NULL        AND btrim(sr.brand) <> ''
        ORDER BY j.id
        LIMIT ${BATCH}
    `);
    const rows: any[] = (res as any).rows ?? res ?? [];

    let learned = 0;
    for (const r of rows) {
        const isNew = await recordSighting(
            {
                jobId: String(r.job_id),
                brand: r.brand,
                model: r.model_number,
                size: r.screen_size,
            },
            brainRunner as any,
        );
        if (isNew) learned += 1;
    }
    return { examined: rows.length, learned };
}

/**
 * Scheduler entry point. Quiet by design: this is housekeeping, and a failure
 * to learn a model is never worth waking anybody over.
 */
export async function sweepTvModelHarvest(): Promise<void> {
    if (!isDbReady()) return;
    if (!process.env.BRAIN_DATABASE_URL) return; // brain not configured on this instance
    try {
        const { examined, learned } = await harvestTvModels();
        if (learned > 0) {
            console.log(`[TVModels] Learned ${learned} new model sighting(s) from ${examined} completed job(s)`);
        }
    } catch {
        logBackgroundFailure("TVModels", "MODEL_HARVEST_FAILED");
    }
}
