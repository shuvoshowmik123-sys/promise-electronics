import { randomUUID, createHash } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db.js";
import { custodyHandoverCodes, notifications, type ServiceRequest } from "../../shared/schema.js";

/**
 * Authority and issuance for the online custody handover code.
 *
 * The code never travels by SMS. It appears only inside the authenticated
 * customer's My Repairs page; the customer reads it to the staff member in
 * front of them, who types it into the admin panel. The staff side must
 * therefore never see the plaintext — otherwise custody can be confirmed with
 * no customer present, which removes the control entirely.
 */

export type CustodyAction = "receive" | "delivery";
export type CustodyMode = "driver_pickup" | "counter_service";

export class CustodyAuthorityError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = "CustodyAuthorityError";
    }
}

export interface CustodyAuthority {
    mode: CustodyMode;
    /** Null for counter_service — a walk-in has no journey and no task. */
    logisticsTaskId: string | null;
    /** The accountable person. Never null. */
    custodianUserId: string;
}

/** Task statuses at which a driver is genuinely out doing the job. */
const EXECUTABLE_TASK_STATUSES = ["pending", "assigned", "en_route"] as const;

export function isPickupRequest(request: Pick<ServiceRequest, "serviceMode" | "servicePreference">): boolean {
    return request.serviceMode === "pickup"
        || request.servicePreference === "pickup"
        || request.servicePreference === "home_pickup";
}

/**
 * Decide who — if anyone — may take custody of this device right now.
 *
 * Two first-class modes, because the shop genuinely has two custody points:
 *
 *   driver_pickup   The device changes hands at the customer's door. Exactly
 *                   one active logistics task must exist and the actor must BE
 *                   its assigned driver. A Manager or Super Admin cannot act
 *                   for someone else — they reassign the task first, so the
 *                   record still names one accountable person.
 *
 *   counter_service The device changes hands across the counter. There is no
 *                   journey and no task, so authority is an explicit
 *                   permission and the acting staff member is the custodian.
 *
 * Throws rather than returning a null authority so no caller can forget to
 * check. 404 for a wrong driver: ticket numbers are sequential (SRV-DATE-NNNN),
 * so a 403 would confirm the record exists to anyone guessing.
 */
export async function resolveCustodyAuthority(params: {
    request: ServiceRequest;
    action: CustodyAction;
    actorUserId: string;
    /** Result of the caller's own permission check for counter custody. */
    actorHasCounterCustody: boolean;
    /**
     * Accept a task that is already `completed`.
     *
     * ONLY for resuming an interrupted completion. Custody completes the task,
     * so a crash after that point leaves no executable task and every retry
     * answered NO_UNIQUE_ACTIVE_TASK — which made the previous "resume" path
     * unreachable in practice. Issuing a NEW code must never take this branch:
     * a completed task means the device has already changed hands.
     */
    allowCompletedTask?: boolean;
}): Promise<CustodyAuthority> {
    const { request, action, actorUserId, actorHasCounterCustody } = params;

    if (!actorUserId) {
        throw new CustodyAuthorityError(401, "NOT_AUTHENTICATED", "Sign in again to continue.");
    }

    if (!isPickupRequest(request)) {
        if (!actorHasCounterCustody) {
            throw new CustodyAuthorityError(
                403,
                "COUNTER_CUSTODY_FORBIDDEN",
                "You do not have permission to confirm counter custody.",
            );
        }
        return { mode: "counter_service", logisticsTaskId: null, custodianUserId: actorUserId };
    }

    // Home pickup/delivery: the task decides, not the role.
    const taskType = action === "delivery" ? "delivery" : "pickup";
    const acceptedStatuses = params.allowCompletedTask
        ? [...EXECUTABLE_TASK_STATUSES, "completed"]
        : [...EXECUTABLE_TASK_STATUSES];
    const rows = await db.execute(sql`
        SELECT id, assigned_driver_id
        FROM logistics_tasks
        WHERE service_request_id = ${request.id}
          AND task_type = ${taskType}
          AND status IN (${sql.join(acceptedStatuses.map((s) => sql`${s}`), sql`, `)})
    `);
    const tasks = ((rows as any).rows ?? rows) as { id: string; assigned_driver_id: string | null }[];

    // Deliberately not "newest wins". Two active tasks for one leg is a data
    // problem a human must resolve, not something to paper over by guessing.
    if (tasks.length !== 1) {
        throw new CustodyAuthorityError(
            409,
            "NO_UNIQUE_ACTIVE_TASK",
            tasks.length === 0
                ? `No active ${taskType} task for this request. Transfer it to Pickup & Delivery first.`
                : `More than one active ${taskType} task exists for this request. Resolve that before confirming custody.`,
        );
    }

    const task = tasks[0];
    if (!task.assigned_driver_id || task.assigned_driver_id !== actorUserId) {
        throw new CustodyAuthorityError(
            404,
            "NOT_ASSIGNED",
            "Service request not found.",
        );
    }

    return { mode: "driver_pickup", logisticsTaskId: task.id, custodianUserId: actorUserId };
}

export function hashCustodyCode(code: string): string {
    return createHash("sha256").update(code, "utf8").digest("hex");
}

export function generateCustodyCode(): string {
    // 6 digits, uniform, no leading-zero bias.
    return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

/** The link a notification carries, and the reader matches on exactly. */
export function custodyNotificationLink(ticketOrId: string, issuanceId: string): string {
    return `/my-repairs?order=${encodeURIComponent(ticketOrId)}&type=service&issuance=${encodeURIComponent(issuanceId)}`;
}

export interface IssueResult {
    issuanceId: string;
    expiresAt: Date;
    customerPortalNotified: boolean;
}

/**
 * Create the code and the notification that carries it, atomically.
 *
 * Both rows are the two halves of one fact — "a code exists and the customer
 * can read it". Either alone is a defect: an issuance with no notification is
 * invisible, and a notification with no issuance is a code that can never
 * verify. Previously they were separate writes, and delivery was attempted
 * BEFORE the code was persisted, so a customer could be told a code was ready
 * that did not exist.
 *
 * Nothing is sent from inside here. Push is advisory and belongs strictly after
 * commit — see the route.
 */
export async function issueCustodyCode(params: {
    request: ServiceRequest;
    customerId: string;
    action: CustodyAction;
    authority: CustodyAuthority;
    ttlMs?: number;
    label: string;
}): Promise<IssueResult> {
    const { request, customerId, action, authority, label } = params;
    const ttlMs = params.ttlMs ?? 5 * 60 * 1000;

    const issuanceId = randomUUID();
    const code = generateCustodyCode();
    const expiresAt = new Date(Date.now() + ttlMs);
    const notificationId = randomUUID();
    const ticketRef = request.ticketNumber || request.id;

    await db.transaction(async (tx) => {
        /**
         * Serialize issuance per service request.
         *
         * The supersede below can only invalidate rows that already exist. Two
         * concurrent sends therefore each superseded what they could see —
         * nothing, or an older code — and then each inserted its own, because
         * neither transaction can see the other's uncommitted insert. The result
         * was TWO live codes for one handover: the customer reads back one, the
         * driver is holding the other, and the loser's plaintext stays readable
         * because supersede-time redaction never ran for it.
         *
         * Locking the request row makes supersede-then-insert atomic against
         * another issuer for the same request. Plain FOR UPDATE rather than
         * NOWAIT because the correct behaviour for a second issuer is to WAIT
         * and then properly supersede the first, not to fail — and unlike the
         * completion path, this transaction makes no outbound calls and touches
         * only local rows, so holding it briefly cannot starve the pool.
         */
        await tx.execute(sql`SELECT id FROM service_requests WHERE id = ${request.id} FOR UPDATE`);

        /**
         * Supersede earlier live codes for the same custody identity.
         *
         * Without this, two codes verify at once and the customer may be
         * looking at the older one. Identity is request + customer + mode +
         * action, plus the task for driver_pickup. `IS NOT DISTINCT FROM`
         * rather than `=` because logistics_task_id is NULL for counter
         * service, and NULL = NULL is never true.
         */
        const superseded = await tx.execute(sql`
            UPDATE custody_handover_codes
            SET invalidated_at = NOW(), invalidated_reason = 'superseded'
            WHERE service_request_id = ${request.id}
              AND customer_id = ${customerId}
              AND custody_mode = ${authority.mode}
              AND action = ${action}
              AND logistics_task_id IS NOT DISTINCT FROM ${authority.logisticsTaskId}
              AND verified_at IS NULL
              AND invalidated_at IS NULL
              AND expires_at > NOW()
            RETURNING notification_id
        `);

        /**
         * Redact the codes we just superseded, in the same transaction.
         *
         * Invalidating the issuance stops it verifying, but the six digits were
         * still sitting readable in the customer's notification list — so the
         * table this design exists to protect would have accumulated every
         * superseded code anyway.
         */
        const supersededIds = (((superseded as any).rows ?? superseded) as { notification_id: string | null }[])
            .map((r) => r.notification_id)
            .filter((id): id is string => Boolean(id));
        if (supersededIds.length > 0) {
            await tx.execute(sql`
                UPDATE notifications
                SET message = 'Handover code replaced by a newer one. The old code is no longer valid.'
                WHERE id IN (${sql.join(supersededIds.map((id) => sql`${id}`), sql`, `)})
            `);
        }

        /**
         * Notification FIRST, then the custody row that references it.
         *
         * custody_handover_codes.notification_id is a NOT NULL foreign key and
         * PostgreSQL checks it immediately, so inserting the custody row first
         * fails every time. The issuance ID is generated up front, so the
         * notification link can be built before either row exists — order is
         * free to follow the constraint.
         *
         * This was inverted and shipped green: the test harness built the table
         * from the Drizzle model, which emits no REFERENCES, so the foreign key
         * simply did not exist in tests. Production would have failed on the
         * very first handover.
         *
         * Both rows are still one transaction. A failure after this point rolls
         * the notification back with it, so a readable code can never outlive
         * the issuance that authorises it.
         */
        await tx.insert(notifications).values({
            id: notificationId,
            userId: customerId,
            title: `Handover code — ${ticketRef}`,
            message: `Your Promise Electronics ${label} code is ${code}. Valid for 5 minutes. Tell this code to the staff member only when they are with you.`,
            type: "handover_code",
            link: custodyNotificationLink(ticketRef, issuanceId),
            contextType: "customer",
        } as any);

        await tx.insert(custodyHandoverCodes).values({
            id: issuanceId,
            serviceRequestId: request.id,
            logisticsTaskId: authority.logisticsTaskId,
            customerId,
            custodianUserId: authority.custodianUserId,
            custodyMode: authority.mode,
            action,
            notificationId,
            codeHash: hashCustodyCode(code),
            attempts: 0,
            maxAttempts: 3,
            expiresAt,
        });
    });

    return { issuanceId, expiresAt, customerPortalNotified: true };
}

/**
 * Remove the plaintext from a settled issuance's notification.
 *
 * The row is kept — it is an audit record that a code was issued and when — but
 * the six digits are replaced, so the notifications table does not accumulate
 * every custody code the shop has ever produced.
 */
export async function redactCustodyNotification(issuanceId: string, outcome: string): Promise<void> {
    await db.execute(sql`
        UPDATE notifications
        SET message = ${`Handover code ${outcome}. The code is no longer valid.`}
        WHERE id = (
            SELECT notification_id FROM custody_handover_codes WHERE id = ${issuanceId}
        )
    `);
}

/** The live issuance for a repair + action, or null. */
export async function findLiveIssuance(serviceRequestId: string, customerId: string) {
    const rows = await db
        .select()
        .from(custodyHandoverCodes)
        .where(and(
            eq(custodyHandoverCodes.serviceRequestId, serviceRequestId),
            eq(custodyHandoverCodes.customerId, customerId),
            isNull(custodyHandoverCodes.verifiedAt),
            isNull(custodyHandoverCodes.invalidatedAt),
            sql`${custodyHandoverCodes.expiresAt} > NOW()`,
        ))
        .orderBy(sql`${custodyHandoverCodes.createdAt} DESC`)
        .limit(1);
    return rows[0] ?? null;
}
