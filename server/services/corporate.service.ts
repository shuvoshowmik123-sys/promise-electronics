/**
 * Corporate Service
 * 
 * Encapsulates the business logic for the B2B Corporate Domain,
 * including incoming/outgoing Challans, Job Ticket generation for
 * corporate clients, and SLA computations.
 */

import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import { eq, like, desc, and, gte, lte, count, inArray } from 'drizzle-orm';
import { corporateRepo } from '../repositories/index.js';
import { nanoid } from 'nanoid';

// Helper to normalize phone numbers (from original storage.ts)
const normalizePhone = (phone: string): string => {
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('880')) digits = digits.slice(3);
    if (digits.startsWith('0')) digits = digits.slice(1);
    return digits.slice(-10);
};

export class CorporateService {
    /**
     * Processes an incoming Challan from a Corporate Client.
     * Generates Job Tickets automatically for every item in the Challan.
     */
    async createChallanIn(data: {
        corporateClientId: string;
        items: {
            corporateJobNumber: string;
            deviceModel: string;
            serialNumber: string;
            initialStatus: "OK" | "NG";
            reportedDefect: string;
        }[];
        receivedBy: string;
        receivedAt?: Date;
    }): Promise<{ challanId: string; jobIds: string[] }> {
        const challanId = nanoid();
        const jobIds: string[] = [];
        const now = new Date();

        const client = await corporateRepo.getCorporateClient(data.corporateClientId);
        if (!client) throw new Error("Client not found");

        const [countRes] = await db.select({ count: count() }).from(schema.corporateChallans);
        const seq = (Number(countRes?.count) || 0) + 1;
        const challanNumber = `${client.shortCode}-C-IN-${seq.toString().padStart(4, '0')}`;

        console.log(`Creating Challan IN: ${challanNumber} with ${data.items.length} items`);

        return await db.transaction(async (tx) => {
            await tx.insert(schema.corporateChallans).values({
                id: challanId,
                challanNumber,
                corporateClientId: data.corporateClientId,
                type: 'incoming',
                items: data.items,
                totalItems: data.items.length,
                receivedDate: data.receivedAt || now,
                status: 'received',
            });

            const jobTicketsToInsert: any[] = [];
            const year = new Date().getFullYear();
            const prefix = `JOB-${year}-`;

            const [lastJob] = await tx
                .select({ id: schema.jobTickets.id })
                .from(schema.jobTickets)
                .where(like(schema.jobTickets.id, `${prefix}%`))
                .orderBy(desc(schema.jobTickets.id))
                .limit(1);

            let maxNumber = 0;
            if (lastJob?.id) {
                const parts = lastJob.id.split('-');
                const seqNum = parseInt(parts[parts.length - 1], 10);
                if (!isNaN(seqNum)) {
                    maxNumber = seqNum;
                }
            }

            for (let i = 0; i < data.items.length; i++) {
                const item = data.items[i];
                const jobId = `${prefix}${String(maxNumber + i + 1).padStart(4, '0')}`;
                jobIds.push(jobId);

                const slaHours = client.defaultSlaHours ?? 72;
                const slaDeadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000);

                jobTicketsToInsert.push({
                    id: jobId,
                    customer: client.companyName,
                    customerPhone: client.contactPhone || "Corporate",
                    customerPhoneNormalized: client.contactPhone ? normalizePhone(client.contactPhone) : null,
                    device: item.deviceModel,
                    tvSerialNumber: item.serialNumber,
                    issue: item.reportedDefect,
                    status: "Pending",
                    priority: "Medium",
                    technician: "Unassigned",
                    createdAt: now,
                    slaDeadline,

                    corporateClientId: data.corporateClientId,
                    corporateChallanId: challanId,
                    corporateJobNumber: item.corporateJobNumber,
                    initialStatus: item.initialStatus,
                    reportedDefect: item.reportedDefect,
                    billingStatus: 'pending'
                });
            }

            if (jobTicketsToInsert.length > 0) {
                await tx.insert(schema.jobTickets).values(jobTicketsToInsert);
            }

            return { challanId, jobIds };
        });
    }

    /**
     * Processes an outgoing Challan (Delivery).
     * Marks associated Job Tickets as Delivered.
     */
    async createChallanOut(data: {
        corporateClientId: string;
        challanInId?: string;
        jobIds: string[];
        receiverName?: string;
        receiverPhone?: string;
        receiverSignature: string;
    }): Promise<string> {
        const challanOutId = nanoid();

        // Generate Challan Number: CH-OUT-YYYYMMDD-###
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));

        const todaysChallans = await db.select({ count: count() })
            .from(schema.corporateChallans)
            .where(and(
                eq(schema.corporateChallans.type, 'outgoing'),
                gte(schema.corporateChallans.createdAt, startOfDay),
                lte(schema.corporateChallans.createdAt, endOfDay)
            ));

        const seq = (todaysChallans[0]?.count || 0) + 1;
        const challanOutNumber = `CH-OUT-${dateStr}-${seq.toString().padStart(3, '0')}`;

        await db.transaction(async (tx) => {
            await tx.insert(schema.corporateChallans).values({
                id: challanOutId,
                challanNumber: challanOutNumber,
                corporateClientId: data.corporateClientId,
                type: 'outgoing',
                items: data.jobIds, // Store Job IDs directly for reference
                totalItems: data.jobIds.length,
                status: 'delivered',
                returnedDate: new Date(),
                receiverName: data.receiverName,
                receiverPhone: data.receiverPhone,
                receiverSignature: data.receiverSignature
            });

            if (data.jobIds.length > 0) {
                await tx.update(schema.jobTickets)
                    .set({
                        billingStatus: 'delivered',
                        status: 'Delivered', // Explicitly mark as Delivered
                        // Intentionally not overwriting corporateChallanId with OUT if it had an IN.
                        // Items structure contains the association.
                    })
                    .where(inArray(schema.jobTickets.id, data.jobIds));
            }
        });

        return challanOutId;
    }
}

export const corporateService = new CorporateService();
