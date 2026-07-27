/**
 * Corporate Service
 * 
 * Encapsulates the business logic for the B2B Corporate Domain,
 * including incoming/outgoing Challans, Job Ticket generation for
 * corporate clients, and SLA computations.
 */

import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import { eq, and, gte, lte, count, inArray, sql } from 'drizzle-orm';
import { corporateRepo } from '../repositories/index.js';
import { allocateJobIdsInTx } from '../repositories/job.repository.js';
import { nanoid } from 'nanoid';
import { mapLegacyTextToDeclaration } from './corporate-declaration.js';

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

            const year = new Date().getFullYear();
            const allocatedIds = await allocateJobIdsInTx(tx, data.items.length, year);
            const jobTicketsToInsert: any[] = [];
            const jobIds: string[] = [];

            for (let i = 0; i < data.items.length; i++) {
                const item = data.items[i];
                const jobId = allocatedIds[i];
                jobIds.push(jobId);

                const slaHours = client.defaultSlaHours ?? 72;
                const slaDeadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000);
                const serviceWarrantyDays = (client as any).serviceWarrantyEnabled === false ? 0 : Number((client as any).defaultServiceWarrantyDays || 30);

                const declaration =
                    mapLegacyTextToDeclaration(item.status || null) ||
                    (item.initialStatus === "OK"
                        ? "declared_ok"
                        : item.initialStatus === "NG"
                          ? "declared_ng"
                          : "received");

                jobTicketsToInsert.push({
                    id: jobId,
                    customer: client.companyName,
                    customerPhone: client.contactPhone || "Corporate",
                    customerPhoneNormalized: client.contactPhone ? normalizePhone(client.contactPhone) : null,
                    device: item.deviceModel,
                    tvSerialNumber: item.serialNumber,
                    issue: item.reportedDefect,
                    // Lifecycle always Pending at intake — never Ready from import "ready"/"done"
                    status: "Pending",
                    corporateDeclaration: declaration,
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
     * CORPORATE-JOB-STATUS-01B — atomic physical handover.
     * Repairable jobs require lifecycle Ready; parts_only is the only exception.
     * Job Delivered + linked SR/journey projection + outgoing challan are one transaction.
     */
    async createChallanOut(data: {
        corporateClientId: string;
        challanInId?: string;
        jobIds: string[];
        receiverName?: string;
        receiverPhone?: string;
        receiverSignature: string;
    }): Promise<string> {
        const {
            CorporateHandoverError,
            normalizeHandoverJobIds,
            assertJobEligibleForHandover,
        } = await import("./corporate-handover.js");
        const { projectJobSurfacesInTransaction } = await import(
            "./job-status-transition.service.js"
        );

        const jobIds = normalizeHandoverJobIds(data.jobIds);
        const challanOutId = nanoid();
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        return await db.transaction(async (tx) => {
            const todaysChallans = await tx
                .select({ count: count() })
                .from(schema.corporateChallans)
                .where(
                    and(
                        eq(schema.corporateChallans.type, "outgoing"),
                        gte(schema.corporateChallans.createdAt, startOfDay),
                        lte(schema.corporateChallans.createdAt, endOfDay),
                    ),
                );
            const seq = (todaysChallans[0]?.count || 0) + 1;
            const challanOutNumber = `CH-OUT-${dateStr}-${seq.toString().padStart(3, "0")}`;

            // Lock all targets in stable id order before any write.
            const sortedIds = [...jobIds].sort();
            const lockedJobs: Array<{
                id: string;
                status: string;
                corporateClientId: string | null;
                ticketType: string | null;
                warrantyDays: number | null;
            }> = [];
            for (const id of sortedIds) {
                const lock = await tx.execute(sql`
                    SELECT id, status,
                           corporate_client_id AS "corporateClientId",
                           ticket_type AS "ticketType",
                           warranty_days AS "warrantyDays"
                    FROM job_tickets WHERE id = ${id} FOR UPDATE
                `);
                const row = ((lock as any).rows ?? lock)[0] as
                    | {
                          id: string;
                          status: string;
                          corporateClientId: string | null;
                          ticketType: string | null;
                          warrantyDays: number | null;
                      }
                    | undefined;
                if (!row) {
                    throw new CorporateHandoverError(
                        400,
                        "HANDOVER_JOB_NOT_FOUND",
                        "One or more jobs were not found.",
                    );
                }
                lockedJobs.push(row);
            }

            for (const job of lockedJobs) {
                assertJobEligibleForHandover(job, data.corporateClientId);
            }

            await tx.insert(schema.corporateChallans).values({
                id: challanOutId,
                challanNumber: challanOutNumber,
                corporateClientId: data.corporateClientId,
                type: "outgoing",
                items: jobIds,
                totalItems: jobIds.length,
                status: "delivered",
                returnedDate: now,
                receiverName: data.receiverName,
                receiverPhone: data.receiverPhone,
                receiverSignature: data.receiverSignature,
            });

            const { ensureFeedbackOpportunityForDelivered } = await import(
                "./service-feedback.service.js"
            );

            for (const job of lockedJobs) {
                await tx
                    .update(schema.jobTickets)
                    .set({
                        billingStatus: "delivered",
                        status: "Delivered",
                        completedAt: now,
                        warrantyExpiryDate: sql`CASE WHEN warranty_days > 0 THEN NOW() + (warranty_days || ' days')::interval ELSE NULL END`,
                        // Do not overwrite incoming corporateChallanId association.
                    })
                    .where(eq(schema.jobTickets.id, job.id));

                // Projection uses the single JOB_TO_JOURNEY map; only status is required for Delivered mapping.
                await projectJobSurfacesInTransaction(
                    tx,
                    { id: job.id, status: "Delivered" } as schema.JobTicket,
                    "Corporate Challan Deliver",
                );

                // CUSTOMER-FEEDBACK-01A: one opportunity per job; immutable handover_event_id; source = challan out.
                await ensureFeedbackOpportunityForDelivered({
                    job: {
                        id: job.id,
                        status: "Delivered",
                        corporateClientId: job.corporateClientId,
                        completedAt: now,
                    } as schema.JobTicket,
                    handoverKind: "corporate_challan_out",
                    handoverSourceId: challanOutId,
                    handoverAt: now,
                    tx,
                });
            }

            return challanOutId;
        });
    }
}

export const corporateService = new CorporateService();
