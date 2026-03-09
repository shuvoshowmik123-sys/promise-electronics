/**
 * Customer Service
 * 
 * Handles business logic involving customers, specifically linking
 * anonymous service requests and jobs to registered users.
 */

import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import { eq, isNull } from 'drizzle-orm';

export class CustomerService {
    /**
     * Links any existing anonymous service requests matching the given phone number
     * to the newly registered or updated customer account.
     */
    async linkServiceRequestsByPhone(phone: string, customerId: string): Promise<number> {
        console.time('linkServiceRequestsByPhone');

        // Normalize phone to last 10 digits for flexible matching
        const normalizeToDigits = (p: string): string => {
            let digits = p.replace(/\D/g, '');
            if (digits.startsWith('880')) {
                digits = digits.slice(3);
            }
            if (digits.startsWith('0')) {
                digits = digits.slice(1);
            }
            return digits.slice(-10); // Last 10 digits
        };

        const normalizedPhone = normalizeToDigits(phone);

        // Get all unlinked requests
        const unlinkedRequests = await db
            .select()
            .from(schema.serviceRequests)
            .where(isNull(schema.serviceRequests.customerId));

        // Filter in JS for accurate normalized match
        const requestsToLink = unlinkedRequests.filter(req => {
            const reqPhone = normalizeToDigits(req.phone || "");
            return reqPhone === normalizedPhone;
        });

        if (requestsToLink.length === 0) {
            console.timeEnd('linkServiceRequestsByPhone');
            return 0;
        }

        let linkedCount = 0;
        for (const req of requestsToLink) {
            await db
                .update(schema.serviceRequests)
                .set({ customerId })
                .where(eq(schema.serviceRequests.id, req.id));
            linkedCount++;
        }

        console.timeEnd('linkServiceRequestsByPhone');
        return linkedCount;
    }

    /**
     * Explicitly links a single service request to a customer ID.
     */
    async linkServiceRequestToCustomer(requestId: string, customerId: string): Promise<boolean> {
        const [updated] = await db
            .update(schema.serviceRequests)
            .set({ customerId })
            .where(eq(schema.serviceRequests.id, requestId))
            .returning();

        return !!updated;
    }
}

export const customerService = new CustomerService();
