/**
 * Corporate Service
 * 
 * Encapsulates the business logic for the B2B Corporate Domain,
 * including incoming/outgoing Challans, Job Ticket generation for
 * corporate clients, and SLA computations.
 */

import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import { eq, like, desc, and, gte, lte, count, inArray, sql } from 'drizzle-orm';
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
        workType?: "full_tv" | "panel" | "panel_batch" | "board" | "parts" | "parts_sale" | "crr";
        items: {
            corporateJobNumber: string;
            deviceModel: string;
            serialNumber: string;
            initialStatus: "OK" | "NG";
            status?: "Received" | "Pending" | "Declared OK" | "Declared NG";
            reportedDefect: string;
            workType?: "full_tv" | "panel" | "panel_batch" | "board" | "parts" | "parts_sale" | "crr";
            ticketType?: "full_device" | "panel_only" | "motherboard_only" | "parts_only";
            jobType?: "standard" | "warranty_claim";
            parentJobId?: string;
            crrReviewStatus?: "new_job" | "crr" | "ignore" | "super_admin_review";
            crrReason?: string;
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

        console.log(`[CorporateService] Creating Challan IN: ${challanNumber} with ${data.items.length} items`);

        return await db.transaction(async (tx) => {
            const clearanceDays = Number((client as any).defaultBatchClearanceDays || 7);
            const targetClearDate = new Date(now.getTime() + clearanceDays * 24 * 60 * 60 * 1000);
            const batchId = nanoid();

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

            await tx.insert(schema.jobBatches).values({
                id: batchId,
                batchNumber: `BATCH-${challanNumber}`,
                clientClass: (client as any).clientClass ?? 'b2b_normal',
                corporateClientId: data.corporateClientId,
                intakeDate: data.receivedAt || now,
                receiver: data.receivedBy,
                totalItems: data.items.length,
                targetClearDate,
                corporateChallanId: challanId,
                createdBy: data.receivedBy,
                notes: data.workType ? `Receive Work: ${data.workType}` : undefined,
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
                const serviceWarrantyDays = (client as any).serviceWarrantyEnabled === false ? 0 : Number((client as any).defaultServiceWarrantyDays || 30);

                jobTicketsToInsert.push({
                    id: jobId,
                    customer: client.companyName,
                    customerPhone: client.contactPhone || "Corporate",
                    customerPhoneNormalized: client.contactPhone ? normalizePhone(client.contactPhone) : null,
                    device: item.deviceModel,
                    tvSerialNumber: item.serialNumber,
                    issue: item.reportedDefect,
                    status: item.status || "Received",
                    priority: "Medium",
                    technician: "Unassigned",
                    createdAt: now,
                    slaDeadline,

                    corporateClientId: data.corporateClientId,
                    corporateChallanId: challanId,
                    corporateJobNumber: item.corporateJobNumber,
                    initialStatus: item.initialStatus,
                    reportedDefect: item.reportedDefect,
                    billingStatus: 'pending',
                    ticketType: item.ticketType || 'full_device',
                    jobType: item.jobType || 'standard',
                    parentJobId: item.parentJobId,
                    warrantyDays: item.jobType === 'warranty_claim' ? 0 : serviceWarrantyDays,
                    paymentStatus: item.jobType === 'warranty_claim' ? 'paid' : 'unpaid',
                    notes: [
                        item.workType === 'crr' || item.jobType === 'warranty_claim' ? 'CRR / Re-service intake' : undefined,
                        item.parentJobId ? `Linked original job: ${item.parentJobId}` : undefined,
                        item.crrReviewStatus === 'super_admin_review' ? 'Super Admin review requested for CRR / Re-service' : undefined,
                        item.crrReason ? `CRR reason: ${item.crrReason}` : undefined,
                    ].filter(Boolean).join('\n') || undefined,
                    // Phase A/F: propagate client tier + source
                    clientClass: (client as any).clientClass ?? 'b2b_normal',
                    batchId,
                    batchTargetClearDate: targetClearDate,
                    extensionStatus: 'none',
                    source: 'challan_in',
                });
            }

            if (jobTicketsToInsert.length > 0) {
                await tx.insert(schema.jobTickets).values(jobTicketsToInsert);
            }

            const reviewItems = data.items
                .map((item, index) => ({ item, jobId: jobIds[index] }))
                .filter(({ item }) => item.jobType === 'warranty_claim' || item.crrReviewStatus === 'super_admin_review');

            if (reviewItems.length > 0) {
                const superAdmins = await tx
                    .select({ id: schema.users.id })
                    .from(schema.users)
                    .where(eq(schema.users.role, 'Super Admin'));

                if (superAdmins.length > 0) {
                    const notifications = superAdmins.flatMap((admin) => reviewItems.map(({ item, jobId }) => ({
                        id: nanoid(),
                        userId: admin.id,
                        title: 'CRR / Re-service Review',
                        message: `${client.companyName} submitted ${item.corporateJobNumber || jobId} as CRR / Re-service.`,
                        type: item.crrReviewStatus === 'super_admin_review' ? 'warning' : 'info',
                        link: `/admin?tab=b2b&job=${jobId}`,
                        corporateClientId: data.corporateClientId,
                        jobId,
                        contextType: 'crr_review',
                    })));

                    await tx.insert(schema.notifications).values(notifications);
                }
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
                        completedAt: new Date(),
                        warrantyExpiryDate: sql`CASE WHEN warranty_days > 0 THEN NOW() + (warranty_days || ' days')::interval ELSE NULL END`,
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
