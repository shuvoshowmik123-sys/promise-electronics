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
import { requireAdminAuth, requireGranularPermission } from "./middleware/auth.js";
import { auditLogger } from "../utils/auditLogger.js";
import { logRouteError } from "../utils/route-error.js";
import { getAttendanceDateDhaka } from "../services/attendance-day.service.js";

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

    /**
     * Who the customer is, which the first version never asked.
     *
     * The shop already distinguishes these — corporate_clients carries
     * client_class (b2b_normal | b2b_corporate) and client_type (corporate |
     * limited_company) — and a limited company is different again because
     * several people handle its account. A business entered as loose text is
     * just a name: it never reaches corporate billing, and the bills it belongs
     * on will not know it exists.
     */
    customerType: z.enum(["individual", "b2b_normal", "b2b_corporate", "limited_company"])
        .optional().default("individual"),
    /** Required for any business type — the real client, not a typed name. */
    corporateClientId: z.string().max(64).optional(),

    /**
     * Set only after the person has been shown the duplicate warning and said
     * it really is a second job. Never sent on a first attempt.
     */
    allowDuplicate: z.boolean().optional(),
});

/**
 * POST /api/admin/catch-up-job
 *
 * Creates one finished job in a single write.
 */
router.post(
    "/api/admin/catch-up-job",
    requireAdminAuth,
    requireGranularPermission("catchup.enter"),
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
             *
             * Compared as Dhaka calendar days, not as instants. "2026-08-23"
             * parses to UTC midnight, and Dhaka runs six hours ahead of UTC, so
             * comparing it against Date.now() put today's own date in the future
             * every night between midnight and 6am — precisely the hours a
             * manager sits down with the day's paper slips. QA-33 hit this: the
             * form sent today's date, took a silent 400, and the run recorded it
             * as a successful save.
             */
            const todayDhaka = getAttendanceDateDhaka();
            const jobDay = /^\d{4}-\d{2}-\d{2}/.test(input.jobDate)
                ? input.jobDate.slice(0, 10)
                : getAttendanceDateDhaka(jobDate);
            if (jobDay > todayDhaka) {
                return res.status(400).json({ error: "This is for work already done — the date cannot be in the future." });
            }
            if (input.amountPaid > input.amountCharged) {
                return res.status(400).json({ error: "Paid cannot be more than charged." });
            }

            /**
             * A business job with no client attached would be invisible to
             * corporate billing forever, and nothing later would reveal that it
             * was meant to belong to somebody.
             */
            const isBusiness = input.customerType !== "individual";
            if (isBusiness && !input.corporateClientId) {
                return res.status(400).json({
                    error: "Choose the company from the list — a typed name will not reach corporate billing.",
                });
            }

            /**
             * The same bill twice is the mistake this screen invites.
             *
             * Somebody working through a pile of paper loses their place, or
             * presses Record twice being careful. QA did exactly that and it
             * went straight through — the customer then owed 16,000 twice, and
             * nothing on any screen said which of the two was real.
             *
             * Refused rather than merged, because only the person holding the
             * paper knows whether it is a mistake or genuinely two identical
             * repairs on two identical sets. They can say so with
             * `allowDuplicate`.
             */
            if (!input.allowDuplicate) {
                const clash = await db.execute(sql`
                    SELECT id FROM job_tickets
                    WHERE entered_as_catchup = true
                      AND customer_phone = ${input.customerPhone}
                      AND device = ${input.device}
                      AND estimated_cost = ${input.amountCharged}
                      AND created_at = ${jobDate}
                    LIMIT 1
                `);
                const existing = (clash as unknown as { rows: Array<{ id: string }> }).rows?.[0];
                if (existing) {
                    return res.status(409).json({
                        error: "This looks like a bill you have already entered.",
                        code: "POSSIBLE_DUPLICATE",
                        existingJobId: existing.id,
                        hint: "Same customer, same set, same amount, same date. Save again to confirm it is a second job.",
                    });
                }
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
                    corporate_client_id, job_type,
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
                    ${input.corporateClientId ?? null}, ${isBusiness ? "corporate" : "standard"},
                    true, ${actor?.id ?? null}, now(),
                    ${input.note ?? null}, ${due > 0 ? due : null}
                )
            `);

            /**
             * Money owed has to reach the dues list, not just this screen.
             *
             * QA put it plainly: the 16,000 showed on the catch-up tab and
             * nowhere else — not Finance, not dues. Knowing who owes you is the
             * entire reason for typing old paper in, so a figure visible only on
             * the screen that created it is half a feature.
             *
             * `source` marks where it came from, so a catch-up due can always be
             * told from one raised by the till.
             *
             * `amount` is what was BILLED and `paid_amount` what has been paid,
             * so the dues screen's `amount - paidAmount` lands on what is still
             * owed. Writing the outstanding figure into `amount` as well
             * subtracted the payment twice: a 26,000 job with 10,000 paid read
             * as 6,000 outstanding instead of 16,000, and a half-paid 28,000
             * read as settled. This is the convention the till already uses.
             */
            if (due > 0) {
                await db.execute(sql`
                    INSERT INTO due_records (
                        id, customer, customer_phone, amount, paid_amount,
                        status, invoice, device_name, source, old_reference,
                        note, created_by, created_at, due_date
                    ) VALUES (
                        ${nanoid(16)}, ${input.customerName}, ${input.customerPhone},
                        ${input.amountCharged}, ${input.amountPaid},
                        'Pending', ${jobId}, ${input.device}, 'catch_up', ${jobId},
                        ${input.note ?? "Entered from a paper bill"}, ${actorName},
                        ${jobDate}, ${jobDate}
                    )
                `);
            }

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
    requireGranularPermission("catchup.enter"),
    async (req: Request, res: Response) => {
        try {
            const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
            const result = await db.execute(sql`
                SELECT id, customer, customer_phone, device, issue,
                       estimated_cost, payment_status, catchup_amount_due,
                       created_at, catchup_entered_at, created_by_name, warranty_notes,
                       corporate_client_id
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

/**
 * Customers this shop already knows, for the picker.
 *
 * Typing a name and phone again for every set was the slowest part of
 * entering a paper pile — one customer usually has several televisions on it.
 * Searches everything already recorded rather than a separate customer table,
 * because a name typed on a catch-up entry an hour ago is exactly the one that
 * needs offering back.
 */
router.get(
    "/api/admin/catch-up-job/customers",
    requireAdminAuth,
    requireGranularPermission("catchup.enter"),
    async (req: Request, res: Response) => {
        try {
            const q = String(req.query.q ?? "").trim();
            if (q.length < 2) return res.json({ customers: [] });
            const like = `%${q}%`;

            const result = await db.execute(sql`
                SELECT DISTINCT ON (customer_phone)
                       customer, customer_phone, customer_address, corporate_client_id
                FROM job_tickets
                WHERE customer IS NOT NULL AND customer_phone IS NOT NULL
                  AND (customer ILIKE ${like} OR customer_phone ILIKE ${like})
                ORDER BY customer_phone, created_at DESC
                LIMIT 8
            `);

            const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
            res.json({
                customers: rows.map((r) => ({
                    name: r.customer as string,
                    phone: r.customer_phone as string,
                    address: (r.customer_address as string) ?? null,
                    corporateClientId: (r.corporate_client_id as string) ?? null,
                })),
            });
        } catch (error) {
            logRouteError("GET /api/admin/catch-up-job/customers", req, error);
            res.status(500).json({ error: "Could not search customers." });
        }
    },
);

/**
 * The corporate clients a business job can belong to.
 *
 * A company entered as loose text is just a name: it never reaches corporate
 * billing, and the bills it should appear on will not know it exists. For a
 * business customer the real client has to be chosen, not typed.
 */
router.get(
    "/api/admin/catch-up-job/corporate-clients",
    requireAdminAuth,
    requireGranularPermission("catchup.enter"),
    async (req: Request, res: Response) => {
        try {
            const result = await db.execute(sql`
                SELECT id, company_name, short_code, client_class, client_type
                FROM corporate_clients
                ORDER BY company_name ASC
                LIMIT 200
            `);
            const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
            res.json({
                clients: rows.map((r) => ({
                    id: r.id as string,
                    companyName: r.company_name as string,
                    shortCode: (r.short_code as string) ?? null,
                    clientClass: r.client_class as string,
                    clientType: r.client_type as string,
                })),
            });
        } catch (error) {
            logRouteError("GET /api/admin/catch-up-job/corporate-clients", req, error);
            res.status(500).json({ error: "Could not load corporate clients." });
        }
    },
);
