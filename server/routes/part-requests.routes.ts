/**
 * What customers asked for and could not get.
 *
 * The shop's hardest question is what to import before spending money on it,
 * and the honest answer has always been a guess. Seventeen people asking for
 * the same 43-inch Samsung panel is not a guess.
 *
 * Two sides here: a public endpoint that records one request, and an admin
 * endpoint that returns the demand grouped and counted. Nothing sends anything
 * to a customer — staff read a group and ring people. A shop that promises an
 * automatic alert and fails to send it has done worse than never offering.
 */
import { Router, type Request, type Response } from "express";
import { db } from "../db.js";
import { partRequests } from "../../shared/schema.js";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireAdminAuth, requireGranularPermission } from "./middleware/auth.js";

/**
 * Hiding the tab hides a link, not the data.
 *
 * Whoever can read this endpoint can read the shop's buying strategy and a
 * list of customers waiting to spend money. That has to be refused at the
 * server, per person, rather than merely left off somebody's menu.
 */
const canViewDemand = requireGranularPermission("partsDemand.view");
const canManageDemand = requireGranularPermission("partsDemand.manage");
import { normalizePhone } from "../utils/phone.js";
import { logRouteError } from "../utils/route-error.js";
import { partRequestLimiter } from "./middleware/rate-limit.js";

const router = Router();

/** Trim, cap, and treat blank as absent so empty strings never reach the board. */
function text(value: unknown, max: number): string | null {
    const s = String(value ?? "").trim();
    return s ? s.slice(0, max) : null;
}

router.post("/api/public/part-requests", partRequestLimiter, async (req: Request, res: Response) => {
    try {
        const body = (req.body ?? {}) as Record<string, unknown>;

        const brand = text(body.brand, 80);
        const screenSize = text(body.screenSize, 40);
        const partName = text(body.partName, 120);
        const phone = text(body.phone, 40);

        /**
         * These four are the request. Without the first three there is nothing
         * to count; without the phone there is nobody to ring, and a request
         * the shop cannot act on is a statistic rather than a customer.
         */
        const missing = [
            !brand && "brand",
            !screenSize && "screen size",
            !partName && "part",
            !phone && "phone number",
        ].filter(Boolean);
        if (missing.length > 0) {
            return res.status(400).json({
                error: `Please choose a ${missing.join(", ")}.`,
                code: "MISSING_FIELDS",
                fields: missing,
            });
        }

        const normalized = normalizePhone(phone!);

        /**
         * One person asking for the same part twice in a week is one demand
         * signal, not two. Counted twice it would quietly inflate exactly the
         * number the shop is about to spend money on.
         *
         * The window is a week rather than forever: asking again next month is
         * a real second signal — they still want it and still cannot get it.
         */
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        // A number that will not normalise cannot be matched against, so the
        // request is recorded rather than dropped. Counting it twice is a
        // smaller harm than losing a customer who wants something.
        const [duplicate] = normalized ? await db
            .select({ id: partRequests.id })
            .from(partRequests)
            .where(and(
                eq(partRequests.phoneNormalized, normalized),
                eq(partRequests.brand, brand!),
                eq(partRequests.screenSize, screenSize!),
                eq(partRequests.partName, partName!),
                gte(partRequests.createdAt, weekAgo),
            ))
            .limit(1) : [undefined];

        if (duplicate) {
            // Told the same thing as a first-time request. Somebody who asks
            // twice should not be made to feel they did something wrong.
            return res.status(200).json({ ok: true, duplicate: true });
        }

        await db.insert(partRequests).values({
            id: nanoid(16),
            brand: brand!,
            screenSize: screenSize!,
            partName: partName!,
            modelNumber: text(body.modelNumber, 120),
            panelModel: text(body.panelModel, 120),
            photoUrl: text(body.photoUrl, 500),
            note: text(body.note, 500),
            customerName: text(body.customerName, 120),
            phone: phone!,
            phoneNormalized: normalized,
            whatsapp: text(body.whatsapp, 40),
        });

        res.status(201).json({ ok: true, duplicate: false });
    } catch (error) {
        logRouteError("part-request-create", req, error);
        res.status(500).json({ error: "Could not save your request. Please try again." });
    }
});

/**
 * The demand board: every group, counted, most wanted first.
 *
 * Grouped in SQL rather than in the browser because the interesting number is
 * the count, and shipping every row to compute it would get slower exactly as
 * the feature starts working.
 */
router.get("/api/admin/part-requests/demand", requireAdminAuth, canViewDemand, async (req: Request, res: Response) => {
    try {
        const days = Math.min(Math.max(parseInt(String(req.query.days ?? "30"), 10) || 30, 1), 365);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const rows = await db
            .select({
                brand: partRequests.brand,
                screenSize: partRequests.screenSize,
                partName: partRequests.partName,
                requests: sql<number>`COUNT(*)::int`,
                /** Still waiting on a call — the shop's actual to-do count. */
                waiting: sql<number>`COUNT(*) FILTER (WHERE ${partRequests.status} = 'new')::int`,
                lastRequestedAt: sql<string>`MAX(${partRequests.createdAt})`,
                firstRequestedAt: sql<string>`MIN(${partRequests.createdAt})`,
            })
            .from(partRequests)
            .where(gte(partRequests.createdAt, since))
            .groupBy(partRequests.brand, partRequests.screenSize, partRequests.partName)
            .orderBy(sql`COUNT(*) DESC`);

        res.json({ days, groups: rows });
    } catch (error) {
        logRouteError("part-request-demand", req, error);
        res.status(500).json({ error: "Could not load the demand list" });
    }
});

/** Everybody inside one group, so staff can work down the list and call them. */
router.get("/api/admin/part-requests", requireAdminAuth, canViewDemand, async (req: Request, res: Response) => {
    try {
        const { brand, screenSize, partName } = req.query as Record<string, string | undefined>;
        const filters = [
            brand ? eq(partRequests.brand, brand) : undefined,
            screenSize ? eq(partRequests.screenSize, screenSize) : undefined,
            partName ? eq(partRequests.partName, partName) : undefined,
        ].filter(Boolean) as any[];

        const rows = await db
            .select()
            .from(partRequests)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(desc(partRequests.createdAt))
            .limit(500);

        res.json({ requests: rows });
    } catch (error) {
        logRouteError("part-request-list", req, error);
        res.status(500).json({ error: "Could not load the requests" });
    }
});

/** Mark where the shop has got to with one person. */
router.patch("/api/admin/part-requests/:id", requireAdminAuth, canManageDemand, async (req: Request, res: Response) => {
    try {
        const ALLOWED = ["new", "contacted", "sourcing", "fulfilled", "closed"];
        const status = String((req.body ?? {}).status ?? "");
        if (!ALLOWED.includes(status)) {
            return res.status(400).json({
                error: `Status must be one of: ${ALLOWED.join(", ")}.`,
                code: "INVALID_STATUS",
            });
        }

        const actor = (req as any).user;
        const [updated] = await db
            .update(partRequests)
            .set({
                status,
                staffNote: text((req.body ?? {}).staffNote, 500) ?? undefined,
                // Stamped only when somebody actually spoke to them, so "who
                // has been called" stays answerable months later.
                ...(status === "contacted"
                    ? { contactedAt: new Date(), contactedBy: actor?.name || actor?.id || "unknown" }
                    : {}),
                updatedAt: new Date(),
            })
            .where(eq(partRequests.id, req.params.id))
            .returning();

        if (!updated) return res.status(404).json({ error: "Request not found" });
        res.json(updated);
    } catch (error) {
        logRouteError("part-request-update", req, error);
        res.status(500).json({ error: "Could not update the request" });
    }
});

export default router;
