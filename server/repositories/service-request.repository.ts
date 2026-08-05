/**
 * Service Request Repository
 * 
 * Handles all database operations for service requests (customer repair requests).
 * Includes timeline events, quotes, and stage transitions.
 */

import { db, nanoid, eq, desc, asc, like, and, or, lt, sql, count, inArray, schema, type ServiceRequest, type InsertServiceRequest, type ServiceRequestEvent, type InsertServiceRequestEvent } from './base.js';
import { executeLegacyQuery, isMissingColumnError, mapLegacyServiceRequestRow } from './legacy-schema.js';

const SERVICE_REQUESTS_LEGACY_COLUMNS = [
    'tracking_status',
    'request_intent',
    'service_mode',
    'stage',
    'is_quote',
    'service_id',
    'quote_status',
    'quote_amount',
    'quote_notes',
    'quoted_at',
    'quote_expires_at',
    'accepted_at',
    'pickup_tier',
    'pickup_cost',
    'total_amount',
    'scheduled_pickup_date',
    'expected_pickup_date',
    'expected_return_date',
    'expected_ready_date',
    'intake_location',
    'physical_condition',
    'customer_signature_url',
    'proof_of_purchase',
    'warranty_status',
    'agreed_to_pickup',
    'pickup_agreed_at',
    'admin_interacted',
    'admin_interacted_at',
    'admin_interacted_by',
    'store_id',
    'corporate_client_id',
    'corporate_challan_id',
];

function isMissingServiceRequestColumn(error: unknown): boolean {
    return isMissingColumnError(error, SERVICE_REQUESTS_LEGACY_COLUMNS);
}

async function loadAllServiceRequests(): Promise<ServiceRequest[]> {
    try {
        return await db.select().from(schema.serviceRequests).orderBy(desc(schema.serviceRequests.createdAt));
    } catch (error) {
        if (!isMissingServiceRequestColumn(error)) {
            throw error;
        }

        console.warn('[LegacySchema][service_requests] Falling back to raw SELECT * for legacy production schema.', error);
        return executeLegacyQuery(
            sql`SELECT * FROM service_requests ORDER BY created_at DESC`,
            mapLegacyServiceRequestRow,
        );
    }
}

// ============================================
// Service Request Queries
// ============================================

export async function getAllServiceRequests(): Promise<ServiceRequest[]> {
    return loadAllServiceRequests();
}

/** SERVICE-INTAKE-RELIABILITY-01E — SQL-bounded list/search for active admin/mobile queues. */
const SR_LIST_MAX_LIMIT = 100;
const SR_SORT_ALLOWLIST = {
    createdAt: schema.serviceRequests.createdAt,
    ticketNumber: schema.serviceRequests.ticketNumber,
} as const;

export type ServiceRequestListQuery = {
    page?: number;
    limit?: number;
    status?: string;
    servicePreference?: string;
    stage?: string;
    quoteStatus?: string;
    search?: string;
    sort?: keyof typeof SR_SORT_ALLOWLIST;
    order?: "asc" | "desc";
};

export type ServiceRequestListResult = {
    items: ServiceRequest[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

export async function listServiceRequestsPaginated(
    query: ServiceRequestListQuery = {},
): Promise<ServiceRequestListResult> {
    const page = Number.isFinite(query.page) && (query.page as number) > 0 ? Math.floor(query.page as number) : 1;
    const rawLimit = Number.isFinite(query.limit) && (query.limit as number) > 0 ? Math.floor(query.limit as number) : 50;
    const limit = Math.min(SR_LIST_MAX_LIMIT, Math.max(1, rawLimit));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.status?.trim()) {
        conditions.push(eq(schema.serviceRequests.status, query.status.trim()));
    }
    if (query.servicePreference?.trim()) {
        conditions.push(eq(schema.serviceRequests.servicePreference, query.servicePreference.trim()));
    }
    if (query.stage?.trim()) {
        conditions.push(eq(schema.serviceRequests.stage, query.stage.trim()));
    }
    if (query.quoteStatus?.trim()) {
        conditions.push(eq(schema.serviceRequests.quoteStatus, query.quoteStatus.trim()));
    }
    const search = query.search?.trim();
    if (search && search.length > 0) {
        // position() is literal (not LIKE) — only strip backslash noise; keep _ and spaces.
        const needle = search.replace(/[\\]/g, "").toLowerCase().slice(0, 80);
        if (needle.length > 0) {
            conditions.push(
                or(
                    sql`position(${needle} in lower(coalesce(${schema.serviceRequests.ticketNumber}, ''))) > 0`,
                    sql`position(${needle} in lower(coalesce(${schema.serviceRequests.customerName}, ''))) > 0`,
                    sql`position(${needle} in lower(coalesce(${schema.serviceRequests.phone}, ''))) > 0`,
                    sql`position(${needle} in lower(coalesce(${schema.serviceRequests.brand}, ''))) > 0`,
                    sql`position(${needle} in lower(coalesce(${schema.serviceRequests.id}, ''))) > 0`,
                )!,
            );
        }
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortKey = query.sort && SR_SORT_ALLOWLIST[query.sort] ? query.sort : "createdAt";
    const sortCol = SR_SORT_ALLOWLIST[sortKey];
    const orderDesc = (query.order ?? "desc") !== "asc";
    // Stable ordering: primary sort + id tie-breaker
    const orderBy = orderDesc
        ? [desc(sortCol), desc(schema.serviceRequests.id)]
        : [asc(sortCol), asc(schema.serviceRequests.id)];

    try {
        const [items, countRows] = await Promise.all([
            db
                .select()
                .from(schema.serviceRequests)
                .where(where)
                .orderBy(...orderBy)
                .limit(limit)
                .offset(offset),
            db.select({ total: count() }).from(schema.serviceRequests).where(where),
        ]);
        const total = Number(countRows[0]?.total ?? 0);
        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit) || 1),
        };
    } catch (error) {
        // HOTFIX-1: never load-all on list path. Missing columns → safe availability error.
        if (isMissingServiceRequestColumn(error)) {
            const err = new Error(
                "Service request list is temporarily unavailable due to schema drift. Run MAIN migrations.",
            ) as Error & { code?: string; statusCode?: number };
            err.code = "SERVICE_REQUEST_LIST_UNAVAILABLE";
            err.statusCode = 503;
            throw err;
        }
        throw error;
    }
}

// Fallback-to-0 on error prevents bell count failure from breaking the admin shell.
export async function getUnreadServiceRequestCount(): Promise<number> {
    try {
        const result = await db.execute(
            sql`SELECT COUNT(*)::int AS n FROM service_requests WHERE admin_interacted IS DISTINCT FROM true`
        );
        return (result.rows[0] as any)?.n ?? 0;
    } catch {
        return 0;
    }
}

export async function getServiceRequest(id: string): Promise<ServiceRequest | undefined> {
    try {
        const [row] = await db
            .select()
            .from(schema.serviceRequests)
            .where(eq(schema.serviceRequests.id, id))
            .limit(1);
        return row;
    } catch (error) {
        if (!isMissingServiceRequestColumn(error)) {
            throw error;
        }
        console.warn('[LegacySchema][service_requests] Falling back to raw SELECT by id.', error);
        const rows = await executeLegacyQuery(
            sql`SELECT * FROM service_requests WHERE id = ${id} LIMIT 1`,
            mapLegacyServiceRequestRow,
        );
        return rows[0];
    }
}

/** HOTFIX-2: bounded multi-id load for page-scoped intake enrichment. */
export async function getServiceRequestsByIds(ids: string[]): Promise<ServiceRequest[]> {
    const wanted = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).slice(0, 100);
    if (wanted.length === 0) return [];
    try {
        return await db
            .select()
            .from(schema.serviceRequests)
            .where(inArray(schema.serviceRequests.id, wanted));
    } catch (error) {
        if (!isMissingServiceRequestColumn(error)) throw error;
        // HOTFIX-2-QA-CLOSE: no raw error object in logs (message-only via safe path if needed).
        console.warn('[LegacySchema][service_requests] Falling back to raw SELECT for getServiceRequestsByIds.');
        const idList = sql.join(wanted.map((id) => sql`${id}`), sql`, `);
        return executeLegacyQuery(
            sql`SELECT * FROM service_requests WHERE id IN (${idList})`,
            mapLegacyServiceRequestRow,
        );
    }
}

export async function getServiceRequestByTicketNumber(ticketNumber: string): Promise<ServiceRequest | undefined> {
    const requests = await loadAllServiceRequests();
    return requests.find((request) => request.ticketNumber === ticketNumber);
}

export type PublicServiceRequestProjection = {
    ticketNumber: string | null;
    brand: string | null;
    screenSize: string | null;
    primaryIssue: string | null;
    trackingStatus: string | null;
    stage: string | null;
    status: string | null;
    createdAt: Date | null;
    serviceMode: string | null;
};

export async function getPublicServiceRequestByTicketNumber(ticketNumber: string): Promise<PublicServiceRequestProjection | undefined> {
    const rows = await db.execute(sql`
        SELECT ticket_number, brand, screen_size, primary_issue, tracking_status,
               stage, status, created_at, service_mode
        FROM service_requests
        WHERE ticket_number = ${ticketNumber}
        LIMIT 1
    `);
    const result = (rows as any).rows ?? rows;
    if (!result || result.length === 0) return undefined;
    const r = result[0];
    return {
        ticketNumber: r.ticket_number ?? null,
        brand: r.brand ?? null,
        screenSize: r.screen_size ?? null,
        primaryIssue: r.primary_issue ?? null,
        trackingStatus: r.tracking_status ?? null,
        stage: r.stage ?? null,
        status: r.status ?? null,
        createdAt: r.created_at ?? null,
        serviceMode: r.service_mode ?? null,
    };
}

export async function getServiceRequestsByCustomerId(customerId: string): Promise<ServiceRequest[]> {
    const requests = await loadAllServiceRequests();
    return requests.filter((request) => request.customerId === customerId);
}

export async function getServiceRequestsByStatus(status: string): Promise<ServiceRequest[]> {
    const requests = await loadAllServiceRequests();
    return requests.filter((request) => request.status === status);
}

export async function getQuoteRequests(): Promise<ServiceRequest[]> {
    const requests = await loadAllServiceRequests();
    return requests.filter((request) => request.isQuote === true);
}

export async function getExpiredServiceRequests(): Promise<ServiceRequest[]> {
    const now = new Date();
    const requests = await loadAllServiceRequests();
    return requests.filter((request) => request.expiresAt !== null && request.expiresAt < now);
}

export async function getPendingServiceRequestsCount(): Promise<number> {
    const requests = await loadAllServiceRequests();
    return requests.filter((request) => request.status === 'Pending').length;
}

export async function getUnreadServiceRequestsCount(): Promise<number> {
    const requests = await loadAllServiceRequests();
    return requests.filter((request) => !request.adminInteracted).length;
}

// ============================================
// Service Request Mutations
// ============================================

export async function createServiceRequest(
    request: InsertServiceRequest & { customerId?: string | null; expiresAt?: Date | null }
): Promise<ServiceRequest> {
    const now = new Date();
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, "");

    // Find the maximum sequence number for today's tickets
    const [lastRequest] = await db
        .select({ ticketNumber: schema.serviceRequests.ticketNumber })
        .from(schema.serviceRequests)
        .where(like(schema.serviceRequests.ticketNumber, `SRV-${datePrefix}-%`))
        .orderBy(desc(schema.serviceRequests.ticketNumber))
        .limit(1);

    let maxSequence = 0;
    if (lastRequest?.ticketNumber) {
        const parts = lastRequest.ticketNumber.split('-');
        const seq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(seq)) {
            maxSequence = seq;
        }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Try up to 5 times with incrementing sequence in case of collision
    for (let attempt = 0; attempt < 5; attempt++) {
        const sequence = (maxSequence + 1 + attempt).toString().padStart(4, "0");
        const ticketNumber = `SRV-${datePrefix}-${sequence}`;

        try {
            const [newRequest] = await db
                .insert(schema.serviceRequests)
                .values({ ...request, ticketNumber, expiresAt, id: nanoid() })
                .returning();

            // Auto-create initial timeline event
            await db.insert(schema.serviceRequestEvents).values({
                id: nanoid(),
                serviceRequestId: newRequest.id,
                status: "Request Received",
                message: "Your repair request has been received and is being reviewed.",
                actor: "System",
            });

            return newRequest;
        } catch (error: any) {
            if (error.message?.includes('duplicate key') && attempt < 4) {
                console.log(`Ticket number ${ticketNumber} collision, retrying...`);
                continue;
            }
            throw error;
        }
    }

    throw new Error("Failed to generate unique ticket number after multiple attempts");
}

export async function updateServiceRequest(
    id: string,
    updates: Partial<InsertServiceRequest> & {
        trackingStatus?: string;
        expiresAt?: Date | null;
        stage?: string;
        quoteStatus?: string;
        quoteAmount?: number | null;
        quoteNotes?: string | null;
        quoteExpiresAt?: Date | null;
    }
): Promise<ServiceRequest | undefined> {
    const [updated] = await db
        .update(schema.serviceRequests)
        .set(updates as any)
        .where(eq(schema.serviceRequests.id, id))
        .returning();
    return updated;
}

export async function markServiceRequestAsInteracted(
    id: string,
    adminName?: string | null
): Promise<ServiceRequest | undefined> {
    const [updated] = await db
        .update(schema.serviceRequests)
        .set({
            adminInteracted: true,
            adminInteractedAt: new Date(),
            adminInteractedBy: adminName || null,
        })
        .where(eq(schema.serviceRequests.id, id))
        .returning();
    return updated;
}

export async function deleteServiceRequest(id: string): Promise<boolean> {
    // First delete related events
    await db.delete(schema.serviceRequestEvents)
        .where(eq(schema.serviceRequestEvents.serviceRequestId, id));

    const result = await db.delete(schema.serviceRequests).where(eq(schema.serviceRequests.id, id));
    return (result.rowCount ?? 0) > 0;
}

// ============================================
// Service Request Events (Timeline)
// ============================================

export async function getServiceRequestEvents(serviceRequestId: string): Promise<ServiceRequestEvent[]> {
    return db.select().from(schema.serviceRequestEvents)
        .where(eq(schema.serviceRequestEvents.serviceRequestId, serviceRequestId))
        .orderBy(schema.serviceRequestEvents.occurredAt);
}

/**
 * Minimal shape of a drizzle transaction handle, so callers can enrol this
 * write in a transaction they already own.
 */
type EventExecutor = Pick<typeof db, "insert">;

/**
 * @param executor Optional transaction handle. Pass the `tx` from
 *   db.transaction to make this event commit or roll back WITH the caller's
 *   other writes.
 *
 *   Custody confirmation needs that: it writes the timeline event and the
 *   issuance's completed_at marker as one fact. Using the global pool here
 *   meant the event took its own connection and committed independently — so a
 *   rollback of the surrounding transaction left the event behind, and a retry
 *   produced a second one for a single physical handover. It also consumed a
 *   second pool connection while the caller's transaction held one, which is
 *   how a pool of five can be exhausted by concurrent confirmations.
 */
export async function createServiceRequestEvent(
    event: InsertServiceRequestEvent,
    executor: EventExecutor = db,
): Promise<ServiceRequestEvent> {
    const [newEvent] = await executor.insert(schema.serviceRequestEvents)
        .values({ ...event, id: nanoid() })
        .returning();
    return newEvent;
}

// ============================================
// Customer Linking
// ============================================

export async function linkServiceRequestToCustomer(requestId: string, customerId: string): Promise<ServiceRequest | undefined> {
    // Canonical implementation lives in customer.service (includes journey adoption).
    const { customerService } = await import('../services/customer.service.js');
    const ok = await customerService.linkServiceRequestToCustomer(requestId, customerId);
    if (!ok) return undefined;
    // HOTFIX-3: was `{ id, customerId } as ServiceRequest` — two fields cast to a
    // full row, so any caller reading .phone or .status got undefined with no
    // type error. Nothing calls this today (both live call sites use
    // customerService directly), which is precisely why it had to be fixed
    // before someone trusted it. Re-read the row so the declared type is true.
    return getServiceRequest(requestId);
}

export async function linkServiceRequestsByPhone(phone: string, customerId: string): Promise<number> {
    // Canonical implementation lives in customer.service (includes journey adoption).
    const { customerService } = await import('../services/customer.service.js');
    return customerService.linkServiceRequestsByPhone(phone, customerId);
}

// ============================================
// Quote Operations — delegate to retail-quote.service (00C-A)
// Prefer importing the service directly from routes.
// ============================================

export async function updateQuote(
    id: string,
    quoteAmount: number,
    quoteNotes?: string
): Promise<ServiceRequest | undefined> {
    const { sendOrPriceQuote } = await import('../services/retail-quote.service.js');
    const result = await sendOrPriceQuote(
        id,
        { quoteAmount, quoteNotes },
        { kind: 'admin', id: 'system', name: 'System' },
    );
    return result.serviceRequest;
}

export async function acceptQuote(
    id: string,
    pickupTier?: string | null,
    pickupAddress?: string,
    servicePreference?: string,
    scheduledPickupDate?: Date | null
): Promise<ServiceRequest | undefined> {
    const { acceptRetailQuote } = await import('../services/retail-quote.service.js');
    const result = await acceptRetailQuote(
        id,
        { kind: 'admin', id: 'system', name: 'System' },
        {
            confirmationNote: 'Legacy acceptQuote repository bridge (system). Prefer route-level acceptRetailQuote with customer or admin confirmation.',
            pickupTier,
            address: pickupAddress,
            servicePreference,
            scheduledVisitDate: scheduledPickupDate,
        },
    );
    return result.serviceRequest;
}

export async function declineQuote(id: string): Promise<ServiceRequest | undefined> {
    const { declineRetailQuote } = await import('../services/retail-quote.service.js');
    const result = await declineRetailQuote(id, { kind: 'admin', id: 'system', name: 'System' });
    return result.serviceRequest;
}

export async function getServiceRequestByConvertedJobId(jobId: string): Promise<ServiceRequest | undefined> {
    const requests = await loadAllServiceRequests();
    return requests.find((request) => request.convertedJobId === jobId);
}

export async function getNextValidStages(id: string): Promise<string[]> {
    const request = await getServiceRequest(id);
    if (!request) return [];

    const stageFlow = schema.getStageFlow(request.requestIntent, request.serviceMode);
    const currentStageIndex = stageFlow.indexOf(request.stage || "intake");

    if (currentStageIndex === -1 || currentStageIndex >= stageFlow.length - 1) return [];

    return stageFlow.slice(currentStageIndex + 1);
}
