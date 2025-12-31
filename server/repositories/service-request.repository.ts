/**
 * Service Request Repository
 * 
 * Handles all database operations for service requests (customer repair requests).
 * Includes timeline events, quotes, and stage transitions.
 */

import { db, nanoid, eq, desc, like, isNull, schema, type ServiceRequest, type InsertServiceRequest, type ServiceRequestEvent, type InsertServiceRequestEvent } from './base.js';

// ============================================
// Service Request Queries
// ============================================

export async function getAllServiceRequests(): Promise<ServiceRequest[]> {
    return db.select().from(schema.serviceRequests).orderBy(desc(schema.serviceRequests.createdAt));
}

export async function getServiceRequest(id: string): Promise<ServiceRequest | undefined> {
    const [request] = await db.select().from(schema.serviceRequests).where(eq(schema.serviceRequests.id, id));
    return request;
}

export async function getServiceRequestByTicketNumber(ticketNumber: string): Promise<ServiceRequest | undefined> {
    const [request] = await db.select().from(schema.serviceRequests)
        .where(eq(schema.serviceRequests.ticketNumber, ticketNumber));
    return request;
}

export async function getServiceRequestsByCustomerId(customerId: string): Promise<ServiceRequest[]> {
    return db.select().from(schema.serviceRequests)
        .where(eq(schema.serviceRequests.customerId, customerId))
        .orderBy(desc(schema.serviceRequests.createdAt));
}

export async function getServiceRequestsByStatus(status: string): Promise<ServiceRequest[]> {
    return db.select().from(schema.serviceRequests)
        .where(eq(schema.serviceRequests.status, status))
        .orderBy(desc(schema.serviceRequests.createdAt));
}

export async function getQuoteRequests(): Promise<ServiceRequest[]> {
    return db.select().from(schema.serviceRequests)
        .where(eq(schema.serviceRequests.isQuote, true))
        .orderBy(desc(schema.serviceRequests.createdAt));
}

export async function getPendingServiceRequestsCount(): Promise<number> {
    const requests = await db.select().from(schema.serviceRequests)
        .where(eq(schema.serviceRequests.status, 'Pending'));
    return requests.length;
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
        quoteAmount?: number;
    }
): Promise<ServiceRequest | undefined> {
    const [updated] = await db
        .update(schema.serviceRequests)
        .set(updates as any)
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

export async function createServiceRequestEvent(event: InsertServiceRequestEvent): Promise<ServiceRequestEvent> {
    const [newEvent] = await db.insert(schema.serviceRequestEvents)
        .values({ ...event, id: nanoid() })
        .returning();
    return newEvent;
}

// ============================================
// Customer Linking
// ============================================

export async function linkServiceRequestToCustomer(requestId: string, customerId: string): Promise<ServiceRequest | undefined> {
    const [updated] = await db
        .update(schema.serviceRequests)
        .set({ customerId })
        .where(eq(schema.serviceRequests.id, requestId))
        .returning();
    return updated;
}

export async function linkServiceRequestsByPhone(phone: string, customerId: string): Promise<number> {
    const normalizeToDigits = (p: string): string => {
        let digits = p.replace(/\D/g, '');
        if (digits.startsWith('880')) digits = digits.slice(3);
        if (digits.startsWith('0')) digits = digits.slice(1);
        return digits.slice(-10);
    };

    const normalizedPhone = normalizeToDigits(phone);

    // Get all unlinked requests
    const unlinkedRequests = await db
        .select()
        .from(schema.serviceRequests)
        .where(isNull(schema.serviceRequests.customerId));

    // Filter in JS
    const requestsToLink = unlinkedRequests.filter(req => {
        const reqPhone = normalizeToDigits(req.phone);
        return reqPhone === normalizedPhone;
    });

    if (requestsToLink.length === 0) return 0;

    // Update them
    let linkedCount = 0;
    for (const req of requestsToLink) {
        await db
            .update(schema.serviceRequests)
            .set({ customerId })
            .where(eq(schema.serviceRequests.id, req.id));
        linkedCount++;
    }

    return linkedCount;
}

// ============================================
// Quote Operations
// ============================================

export async function updateQuote(
    id: string,
    quoteAmount: number,
    quoteNotes?: string
): Promise<ServiceRequest | undefined> {
    return updateServiceRequest(id, {
        quoteAmount,
        quoteNotes,
        quoteStatus: 'Quoted',
        quotedAt: new Date(),
    } as any);
}

export async function acceptQuote(id: string): Promise<ServiceRequest | undefined> {
    return updateServiceRequest(id, {
        quoteStatus: 'Accepted',
        acceptedAt: new Date(),
    } as any);
}

export async function declineQuote(id: string): Promise<ServiceRequest | undefined> {
    return updateServiceRequest(id, {
        quoteStatus: 'Declined',
    } as any);
}
