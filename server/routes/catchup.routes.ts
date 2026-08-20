/**
 * The side door: recording work that happened before the system existed.
 *
 * The normal way in is six steps — create the job, add the warranty, record the
 * labour, raise the bill, then the due. That order is deliberate and it is what
 * keeps real new work honest. It is also unusable for a repair that finished
 * three weeks ago, so those repairs simply never get entered, and the system
 * stays empty while the shop stays full of televisions it knows nothing about.
 *
 * This is one call that writes the whole thing at once. The price of that
 * shortcut is paid in two ways, both non-negotiable:
 *
 *   1. Super Admin only. It can set a past date and any price, which is exactly
 *      what somebody covering a theft would want.
 *   2. Every row is stamped permanently — who, when, and why — so a year from
 *      now "recorded as it happened" and "typed in later from a paper" are still
 *      told apart. Nothing here clears that stamp.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { requireAdminAuth, requireSuperAdmin } from "./middleware/auth.js";
import { auditLogger } from "../utils/auditLogger.js";
import { logRouteError } from "../utils/route-error.js";

const router = Router();

const catchupSchema = z.object({
    customerName: z.string().min(1).max(120),
    customerPhone: z.string().min(6).max(30),
    customerAddress: z.string().max(300).optional(),

    device: z.string().min(1).max(120),
    modelNumber: z.string().max(80).optional(),
    screenSize: z.string().max(20).optional(),

    /** What was actually done, in the shop's own words. Not a catalogue code. */
    workDone: z.string().min(1).max(2000),

    /**
     * Whatever was actually charged.
     *
     * Deliberately not checked against a price list. The same 55-inch panel
     * goes out at 26,000, 28,000 and 35,000 depending on what else the set
     * needed — a cable, an adjustment, things that never appear on a bill.
     * Forcing a catalogue price here would mean the honest number could not be
     * recorded, and a system that cannot hold the truth gets worked around.
     */
    amountCharged: z.number().min(0).max(10_000_000),
    amountPaid: z.number().min(0).max(10_000_000),

    /** When the work actually finished, not when it is being typed. */
    jobDate: z.string().min(8),

    warrantyMonths: z.number().int().min(0).max(120).optional(),
    technicianName: z.string().max(120).optional(),
    note: z.string().max(500).optional(),
});

/**
 * POST /api/admin/catch-up-job
 *
 * Creates one finished job in a single write.
 */
router.post(
    "/api/admin/catch-up-job",
    requireAdminAuth,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        try {
            const parsed = catchupSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    error: "Some details are missing or wrong.",
                    details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
                });
            }
            const input = parsed.data;

            const jobDate = new Date(input.jobDate);
            if (isNaN(jobDate.getTime())) {
                return res.status(400).json({ error: "That date could not be read." });
            }
            /**
             * A future date would be a live job pretending to be history, which
             * is the one thing this door must not create.
             */
            if (jobDate.getTime() > Date.now()) {
                return res.status(400).json({ error: "This is for work already done — the date cannot be in the future." });
            }
            if (input.amountPaid > input.amountCharged) {
                return res.status(400).json({ error: "Paid cannot be more than charged." });
            }

            const due = Math.round((input.amountCharged - input.amountPaid) * 100) / 100;
            const paymentStatus = due <= 0 ? "paid" : input.amountPaid > 0 ? "partial" : "unpaid";

            const actor = (req as { user?: { id: string; name?: string; username?: string } }).user;
            const actorName = actor?.name || actor?.username || "Super Admin";
            const jobId = `CU-${nanoid(10)}`;

            const warrantyNote = input.warrantyMonths
                ? `${input.warrantyMonths} month warranty from ${jobDate.toISOString().slice(0, 10)}`
                : null;

            await db.execute(sql`
                INSERT INTO job_tickets (
                    id, customer, customer_phone, customer_address,
                    device, model_number, screen_size,
                    issue, problem_found, technician,
                    status, created_at, completed_at,
                    estimated_cost, payment_status, billing_status,
                    warranty_notes, notes,
                    created_by_user_id, created_by_name,
                    entered_as_catchup, catchup_entered_by, catchup_entered_at,
                    catchup_note, catchup_amount_due
                ) VALUES (
                    ${jobId}, ${input.customerName}, ${input.customerPhone}, ${input.customerAddress ?? null},
                    ${input.device}, ${input.modelNumber ?? null}, ${input.screenSize ?? null},
                    ${input.workDone}, ${input.workDone}, ${input.technicianName ?? null},
                    'Delivered', ${jobDate}, ${jobDate},
                    ${input.amountCharged}, ${paymentStatus}, 'delivered',
                    ${warrantyNote}, ${input.note ?? null},
                    ${actor?.id ?? null}, ${actorName},
                    true, ${actor?.id ?? null}, now(),
                    ${input.note ?? null}, ${due > 0 ? due : null}
                )
            `);

            /**
             * Logged as critical. This endpoint can write any amount against any
             * past date, so every use of it belongs in the trail whether or not
             * anything went wrong.
             */
            await auditLogger.log({
                userId: actor?.id || "system",
                action: "CATCHUP_JOB_ENTERED",
                entity: "JobTicket",
                entityId: jobId,
                details:
                    `${actorName} entered a past job for ${input.customerName} (${input.customerPhone}): ` +
                    `${input.device}, charged ${input.amountCharged}, paid ${input.amountPaid}, ` +
                    `dated ${jobDate.toISOString().slice(0, 10)}`,
                severity: "critical",
                req,
            }).catch(() => {});

            res.status(201).json({
                jobId,
                paymentStatus,
                amountDue: due,
                jobDate: jobDate.toISOString(),
                warranty: warrantyNote,
                message: due > 0
                    ? `Recorded. ${input.customerName} still owes ${due}.`
                    : "Recorded and fully paid.",
            });
        } catch (error) {
            logRouteError("POST /api/admin/catch-up-job", req, error);
            res.status(500).json({ error: "Could not save this entry." });
        }
    },
);

/**
 * Everything entered through the side door, newest first.
 *
 * A shortcut nobody can review is not a shortcut, it is a hole. This is the
 * review.
 */
router.get(
    "/api/admin/catch-up-job",
    requireAdminAuth,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        try {
            const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
            const result = await db.execute(sql`
                SELECT id, customer, customer_phone, device, issue,
                       estimated_cost, payment_status, catchup_amount_due,
                       created_at, catchup_entered_at, created_by_name, warranty_notes
                FROM job_tickets
                WHERE entered_as_catchup = true
                ORDER BY catchup_entered_at DESC
                LIMIT ${limit}
            `);
            const rows = (result as unknown as { rows: unknown[] }).rows ?? [];
            res.json({ entries: rows, count: rows.length });
        } catch (error) {
            logRouteError("GET /api/admin/catch-up-job", req, error);
            res.status(500).json({ error: "Could not read the entries." });
        }
    },
);

export default router;
