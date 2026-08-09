/**
 * What we know about television models, learned from work we actually did.
 *
 * There is no complete public catalogue of TV model numbers, and inventing one
 * would be worse than having none: a fabricated row makes the simulator tell a
 * customer their genuine model is wrong, which is the one failure this whole
 * feature exists to avoid. So nothing is seeded from the internet. Every row
 * here was put there by a repair that a technician completed.
 *
 * The table is keyed on (model_norm, brand_norm) rather than on the model
 * alone. A model claimed by a second brand therefore does not overwrite the
 * first — it becomes another row, and "is this model claimed by two brands?"
 * is answered by counting rows instead of by any special flag.
 *
 * Lives in the brain database (Neon), not MAIN. It is reference data derived
 * from the transactional record, it is rebuildable from scratch, and keeping
 * it out of MAIN means none of this can bump the MAIN schema version.
 */
import { sql } from "drizzle-orm";
import { brainDb } from "./brain.db.js";

/**
 * A model is believable once two separate jobs have said the same thing.
 *
 * One sighting is one person typing at intake, and a single typo would
 * otherwise teach the brain something false and then let it contradict real
 * customers. Two independent jobs makes that nearly impossible, at a cost of
 * one repair's delay per model.
 */
export const VERIFY_AT_SIGHTINGS = 2;

export type ModelVerdict =
    | { known: false }
    | { known: true; ambiguous: true }
    | { known: true; ambiguous: false; brand: string; sizeInches: number | null; confidence: "suggest" | "verified" };

/** UA55AU7700, ua55-au7700 and "UA55 AU7700" are the same television. */
export function normalizeModel(raw: unknown): string | null {
    const s = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    // Below four characters it is not a model number, it is noise.
    return s.length >= 4 && s.length <= 40 ? s : null;
}

export function normalizeBrand(raw: unknown): string | null {
    const s = String(raw ?? "").trim().replace(/\s+/g, " ");
    return s.length >= 2 && s.length <= 40 ? s : null;
}

/** Screen size as a plain number, from "55", `55`, "55 inch" or `55"`. */
export function normalizeSize(raw: unknown): number | null {
    const n = parseInt(String(raw ?? "").replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) && n >= 14 && n <= 120 ? n : null;
}

type Runner = { execute: (q: any) => Promise<any> };

export async function ensureEncyclopediaTables(runner: Runner = brainDb as any): Promise<void> {
    await runner.execute(sql`
        CREATE TABLE IF NOT EXISTS tv_model_brand (
            model_norm    TEXT NOT NULL,
            brand_norm    TEXT NOT NULL,
            brand         TEXT NOT NULL,
            size_inches   INTEGER,
            sightings     INTEGER NOT NULL DEFAULT 0,
            first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (model_norm, brand_norm)
        )
    `);
    await runner.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_tv_model_brand_model ON tv_model_brand (model_norm)
    `);
    /**
     * One row per job already counted.
     *
     * The harvester reads MAIN and writes the brain, so the two cannot share a
     * transaction and a crash between them is normal rather than exceptional.
     * Claiming the job id first, and only counting when the insert actually
     * took, makes a re-run a no-op instead of inflating every counter — the
     * same claim trick job_stock_deductions and reminder_dispatches use.
     */
    await runner.execute(sql`
        CREATE TABLE IF NOT EXISTS tv_model_harvest_log (
            job_id       TEXT PRIMARY KEY,
            harvested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

/**
 * Record one sighting, if this job has not already been counted.
 *
 * Returns whether the sighting was new, so a caller can report how much it
 * actually learned rather than how many rows it looked at.
 */
export async function recordSighting(
    opts: { jobId: string; brand: unknown; model: unknown; size?: unknown },
    runner: Runner = brainDb as any,
): Promise<boolean> {
    const model = normalizeModel(opts.model);
    const brand = normalizeBrand(opts.brand);
    if (!opts.jobId || !model || !brand) return false;

    const claim = await runner.execute(sql`
        INSERT INTO tv_model_harvest_log (job_id) VALUES (${opts.jobId})
        ON CONFLICT (job_id) DO NOTHING
        RETURNING job_id
    `);
    if (((claim as any).rowCount ?? 0) === 0) return false;

    const size = normalizeSize(opts.size);
    await runner.execute(sql`
        INSERT INTO tv_model_brand (model_norm, brand_norm, brand, size_inches, sightings)
        VALUES (${model}, ${brand.toUpperCase()}, ${brand}, ${size}, 1)
        ON CONFLICT (model_norm, brand_norm) DO UPDATE
        SET sightings    = tv_model_brand.sightings + 1,
            last_seen_at = NOW(),
            -- Never overwrite a known size with nothing; a later ticket that
            -- omitted the size must not erase what an earlier one recorded.
            size_inches  = COALESCE(EXCLUDED.size_inches, tv_model_brand.size_inches)
    `);
    return true;
}

/**
 * What the brain believes about a model number.
 *
 * Silence is a valid answer and the default one. If two brands both have real
 * counts against the same model the verdict is `ambiguous`, because cross-brand
 * model collisions do happen and "I am not sure" beats a confident accusation.
 */
export async function lookupModel(
    modelRaw: unknown,
    runner: Runner = brainDb as any,
): Promise<ModelVerdict> {
    const model = normalizeModel(modelRaw);
    if (!model) return { known: false };

    const res = await runner.execute(sql`
        SELECT brand, size_inches, sightings
        FROM tv_model_brand
        WHERE model_norm = ${model}
        ORDER BY sightings DESC
    `);
    const rows: any[] = (res as any).rows ?? res ?? [];
    if (rows.length === 0) return { known: false };

    const verified = rows.filter((r) => Number(r.sightings) >= VERIFY_AT_SIGHTINGS);
    if (verified.length > 1) return { known: true, ambiguous: true };

    const top = verified[0] ?? rows[0];
    return {
        known: true,
        ambiguous: false,
        brand: String(top.brand),
        sizeInches: top.size_inches == null ? null : Number(top.size_inches),
        confidence: Number(top.sightings) >= VERIFY_AT_SIGHTINGS ? "verified" : "suggest",
    };
}
