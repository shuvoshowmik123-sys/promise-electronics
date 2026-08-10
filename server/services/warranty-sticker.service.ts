/**
 * Issuing and checking warranty stickers.
 *
 * The shop's question at the counter is short — "is this ours, and is it still
 * covered?" — and it has to be answerable in seconds with a phone camera while
 * a customer stands there. Everything here serves that.
 */
import { randomBytes, randomUUID } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "../db.js";
import * as schema from "../../shared/schema.js";
import { getSafeJobDisplayRef } from "../../shared/job-display-utils.js";
import {
    CODE_LENGTH,
    STICKER_PLACEMENTS,
    codeFromBytes,
    jobCarriesWarranty,
    normaliseCode,
    warrantyStanding,
    type ScanResult,
    type StickerPlacement,
} from "../../shared/warranty-sticker.js";

export class StickerError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
        super(message);
        this.name = "StickerError";
    }
}

/**
 * Stickers for a job, making them if they do not exist yet.
 *
 * Get-or-create rather than a hook on job completion. A hook can be missed —
 * jobs are finished from the counter, from the phone and from the corporate
 * flow — and a repair that quietly ended up without a sticker is a free claim
 * for anybody who notices. Asking for the stickers is the only way to print
 * them, so asking is the moment they are guaranteed to exist.
 */
export async function ensureStickersForJob(
    jobTicketId: string,
    actor: { id: string; name: string },
): Promise<schema.WarrantySticker[]> {
    const [job] = await db.select().from(schema.jobTickets)
        .where(eq(schema.jobTickets.id, jobTicketId));
    if (!job) throw new StickerError(404, "JOB_NOT_FOUND", "Job ticket not found");

    // Nothing to prove, nothing to print.
    if (!jobCarriesWarranty(job)) {
        throw new StickerError(400, "NO_WARRANTY", "This job carries no warranty, so it needs no sticker");
    }

    const existing = await db.select().from(schema.warrantyStickers)
        .where(and(
            eq(schema.warrantyStickers.jobTicketId, jobTicketId),
            isNull(schema.warrantyStickers.voidedAt),
        ));

    const have = new Set(existing.map((s) => s.placement));
    const missing = STICKER_PLACEMENTS.filter((p) => !have.has(p));
    if (missing.length === 0) return existing;

    const made: schema.WarrantySticker[] = [];
    for (const placement of missing) {
        made.push(await issueOne(jobTicketId, placement, actor, job.storeId ?? null));
    }
    return [...existing, ...made];
}

/**
 * One sticker, with a code nothing else in the shop shares.
 *
 * The unique index on `code` is the real guarantee; the retry loop exists only
 * so an astronomically unlikely collision surfaces as one more attempt instead
 * of a failed print at the counter.
 */
async function issueOne(
    jobTicketId: string,
    placement: StickerPlacement,
    actor: { id: string; name: string },
    storeId: string | null,
): Promise<schema.WarrantySticker> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = codeFromBytes(randomBytes(CODE_LENGTH));
        try {
            const [row] = await db.insert(schema.warrantyStickers).values({
                id: randomUUID(),
                code,
                jobTicketId,
                placement,
                issuedBy: actor.id,
                issuedByName: actor.name,
                storeId,
            }).returning();
            return row;
        } catch (error: any) {
            // 23505 = unique violation. Anything else is a real failure.
            if (error?.code !== "23505") throw error;
        }
    }
    throw new StickerError(500, "CODE_COLLISION", "Could not allocate a unique sticker code");
}

export type VerifyOutcome = {
    result: ScanResult;
    scannedCode: string;
    sticker?: {
        placement: StickerPlacement;
        issuedAt: Date;
        voidedAt: Date | null;
        voidedReason: string | null;
    };
    job?: {
        id: string;
        displayRef: string;
        device: string | null;
        modelNumber: string | null;
        screenSize: string | null;
        /**
         * The television's own serial, as written down when it came in.
         *
         * The strongest check the counter has: read the number off the back of
         * the set in front of you and see whether it matches. A sticker proves
         * the job is ours; this proves it is the same television.
         */
        tvSerialNumber: string | null;
        completedAt: Date | null;
        serviceValid: boolean;
        partsValid: boolean;
        serviceUntil: Date | null;
        partsUntil: Date | null;
    };
    /**
     * Other live stickers on the same job.
     *
     * The counter needs this to spot a moved sticker: scan the one on the back,
     * open the set, scan the hidden one, and check both name the same job.
     */
    siblings?: Array<{ placement: StickerPlacement; code: string }>;
};

/**
 * Check a code, and record the check either way.
 *
 * A failed scan is written down deliberately. A forged sticker only becomes
 * visible if the misses are kept, and "somebody tried a code we have never
 * issued, on this date" is the earliest warning the shop can get.
 */
export async function verifySticker(
    rawCode: string,
    actor: { id: string; name: string },
): Promise<VerifyOutcome> {
    const scannedCode = normaliseCode(rawCode);

    const [sticker] = scannedCode
        ? await db.select().from(schema.warrantyStickers).where(eq(schema.warrantyStickers.code, scannedCode))
        : [];

    if (!sticker) {
        await recordScan({ scannedCode, stickerId: null, jobTicketId: null, result: "unknown", actor });
        return { result: "unknown", scannedCode };
    }

    const [job] = await db.select().from(schema.jobTickets)
        .where(eq(schema.jobTickets.id, sticker.jobTicketId));

    const result: ScanResult = sticker.voidedAt ? "voided" : "genuine";
    await recordScan({
        scannedCode,
        stickerId: sticker.id,
        jobTicketId: sticker.jobTicketId,
        result,
        actor,
    });

    const siblings = await db.select().from(schema.warrantyStickers)
        .where(and(
            eq(schema.warrantyStickers.jobTicketId, sticker.jobTicketId),
            isNull(schema.warrantyStickers.voidedAt),
        ));

    const standing = job ? warrantyStanding(job) : null;

    return {
        result,
        scannedCode,
        sticker: {
            placement: sticker.placement as StickerPlacement,
            issuedAt: sticker.issuedAt,
            voidedAt: sticker.voidedAt,
            voidedReason: sticker.voidedReason,
        },
        job: job
            ? {
                id: job.id,
                displayRef: getSafeJobDisplayRef(job as any),
                device: job.device ?? null,
                modelNumber: job.modelNumber ?? null,
                screenSize: job.screenSize ?? null,
                tvSerialNumber: job.tvSerialNumber ?? job.serialNumber ?? null,
                completedAt: job.completedAt ?? null,
                serviceValid: standing?.service ?? false,
                partsValid: standing?.parts ?? false,
                serviceUntil: standing?.serviceUntil ?? null,
                partsUntil: standing?.partsUntil ?? null,
            }
            : undefined,
        siblings: siblings.map((s) => ({ placement: s.placement as StickerPlacement, code: s.code })),
    };
}

async function recordScan(opts: {
    scannedCode: string;
    stickerId: string | null;
    jobTicketId: string | null;
    result: ScanResult;
    actor: { id: string; name: string };
}): Promise<void> {
    try {
        await db.insert(schema.warrantyStickerScans).values({
            id: randomUUID(),
            scannedCode: opts.scannedCode,
            stickerId: opts.stickerId,
            jobTicketId: opts.jobTicketId,
            result: opts.result,
            scannedBy: opts.actor.id,
            scannedByName: opts.actor.name,
        });
    } catch (error) {
        // Never fail a verification because the log failed. The counter needs
        // its answer more than the audit trail needs this one row.
        console.error("[WarrantySticker] Failed to record scan:", error);
    }
}

/** Recent scans, newest first — mostly read to see whether fakes are appearing. */
export async function recentScans(limit = 50): Promise<schema.WarrantyStickerScan[]> {
    return db.select().from(schema.warrantyStickerScans)
        .orderBy(desc(schema.warrantyStickerScans.scannedAt))
        .limit(Math.min(200, Math.max(1, limit)));
}
