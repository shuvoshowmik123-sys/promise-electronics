/**
 * Customer Service
 * 
 * Handles business logic involving customers, specifically linking
 * anonymous service requests and jobs to registered users.
 */

import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import { sql, SQL, eq, or, isNull } from 'drizzle-orm';
import { noConflictingJourneyOwner } from './journey-ownership.js';

function normalizeToDigits(p: string): string {
    let digits = p.replace(/\D/g, '');
    if (digits.startsWith('880')) {
        digits = digits.slice(3);
    }
    if (digits.startsWith('0')) {
        digits = digits.slice(1);
    }
    return digits.slice(-10); // Last 10 digits
}

// Empty id lists become IN (NULL) — valid SQL that matches nothing.
function idList(ids: string[]): SQL {
    return sql.join((ids.length ? ids : [null]).map(id => sql`${id}`), sql`, `);
}

export class CustomerService {
    /**
     * Links any existing anonymous service requests matching the given phone
     * number to the customer, and adopts their ownerless journeys.
     *
     * HOTFIX-2: linking and adoption run inside ONE transaction as two
     * statements, so a failure rolls everything back. Both statements use
     * conditional predicates — a request is only assigned when it is unowned
     * or already owned by this customer, and journey adoption re-checks
     * service_requests.customer_id in SQL instead of trusting caller-supplied
     * ids. Requests owned by another customer are never touched.
     */
    async linkServiceRequestsByPhone(phone: string, customerId: string): Promise<number> {
        const normalizedPhone = normalizeToDigits(phone);

        const projection = {
            id: schema.serviceRequests.id,
            phone: schema.serviceRequests.phone,
            customerId: schema.serviceRequests.customerId,
        };

        // HOTFIX-3: two bounded reads instead of one full-table scan per login.
        //
        // The indexed read (idx_service_requests_phone_normalized) covers every
        // row written since canonical retail intake started populating
        // phone_normalized. It cannot be the only read: the column is NULL or
        // blank on legacy rows, and matching those is the entire point of this
        // linker — an indexed-only lookup would silently link fewer requests
        // than before, reintroducing exactly the invisibility this phase exists
        // to fix.
        //
        // So the legacy set is read separately and still normalised in JS.
        //
        // EVIDENCE-CORRECTION-1: an earlier version of this comment claimed the
        // startup backfill drains that set. It does not. The startup task
        // (backfillCustomerPhoneNormalized, service-request-intake-migration.service.ts)
        // updates users.phone_normalized only — no UPDATE against
        // service_requests.phone_normalized exists anywhere in server/. Legacy
        // service-request rows therefore remain legacy until a separately
        // authorised backfill, and this fallback query is the only thing
        // keeping them matchable. Do not remove it on the assumption that the
        // set empties itself.
        const [indexedRows, legacyRows] = await Promise.all([
            db.select(projection)
                .from(schema.serviceRequests)
                .where(eq(schema.serviceRequests.phoneNormalized, normalizedPhone)),
            db.select(projection)
                .from(schema.serviceRequests)
                .where(or(
                    isNull(schema.serviceRequests.phoneNormalized),
                    eq(sql`btrim(${schema.serviceRequests.phoneNormalized})`, ''),
                )),
        ]);

        // A row can only appear in one set (indexed requires a non-blank value,
        // legacy requires a blank one), but dedupe by id so an overlapping
        // definition later cannot produce duplicate ids in the UPDATE lists.
        const byId = new Map<string, typeof indexedRows[number]>();
        for (const r of indexedRows) byId.set(r.id, r);
        for (const r of legacyRows) {
            if (normalizeToDigits(r.phone || "") === normalizedPhone) byId.set(r.id, r);
        }

        const matching = Array.from(byId.values());
        if (matching.length === 0) {
            return 0;
        }

        const linkable = matching.filter(r => !r.customerId).map(r => r.id);
        const alreadyOwned = matching.filter(r => r.customerId === customerId).map(r => r.id);
        if (linkable.length === 0 && alreadyOwned.length === 0) {
            return 0;
        }

        const linked = await db.transaction(async (tx) => {
            const linkResult = await tx.execute(sql`
                UPDATE service_requests
                SET customer_id = ${customerId}
                WHERE id IN (${idList(linkable)})
                  AND (customer_id IS NULL OR customer_id = ${customerId})
            `);

            // Adoption runs even when nothing new was linked — requests already
            // owned by this customer still prove ownership. The FROM ... WHERE
            // re-checks service_requests.customer_id, so a stale or malicious
            // request id cannot transfer a journey.
            //
            // HOTFIX-3: and the journey's OTHER reference must not prove a
            // different owner. Without this, a journey holding both a service
            // request and a quote request could be adopted from whichever side
            // matched, regardless of who owns the other.
            await tx.execute(sql`
                UPDATE customer_repair_journeys j
                SET customer_id = ${customerId}, updated_at = NOW()
                FROM service_requests sr
                WHERE j.customer_id IS NULL
                  AND (j.service_request_id = sr.id OR j.quote_request_id = sr.id)
                  AND sr.id IN (${idList([...linkable, ...alreadyOwned])})
                  AND sr.customer_id = ${customerId}
                  AND ${noConflictingJourneyOwner(customerId)}
            `);

            return linkResult.rowCount ?? 0;
        });

        return linked;
    }

    /**
     * Explicitly links a single service request to a customer id (callers
     * verify the phone match first). Same ownership rules as the phone linker:
     * the conditional predicate never overwrites a different non-null owner,
     * and journey adoption re-checks the owner in SQL. A request already owned
     * by this customer is not a failure (row matches the predicate). When the
     * link matches nothing, no adoption runs.
     */
    async linkServiceRequestToCustomer(requestId: string, customerId: string): Promise<boolean> {
        const linked = await db.transaction(async (tx) => {
            const linkResult = await tx.execute(sql`
                UPDATE service_requests
                SET customer_id = ${customerId}
                WHERE id = ${requestId}
                  AND (customer_id IS NULL OR customer_id = ${customerId})
            `);

            if ((linkResult.rowCount ?? 0) === 0) {
                return false;
            }

            // HOTFIX-3: same conflict rule as the phone linker — a journey whose
            // other reference proves a different owner is adopted by neither.
            await tx.execute(sql`
                UPDATE customer_repair_journeys j
                SET customer_id = ${customerId}, updated_at = NOW()
                FROM service_requests sr
                WHERE j.customer_id IS NULL
                  AND (j.service_request_id = sr.id OR j.quote_request_id = sr.id)
                  AND sr.id = ${requestId}
                  AND sr.customer_id = ${customerId}
                  AND ${noConflictingJourneyOwner(customerId)}
            `);

            return true;
        });

        return linked;
    }
}

export const customerService = new CustomerService();
