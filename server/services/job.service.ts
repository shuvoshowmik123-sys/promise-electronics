/**
 * Job Service
 * 
 * Handles complex business logic involving Job Tickets, including
 * stock synchronization, payment recording, and workflow transitions.
 */

import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { jobRepo, serviceRequestRepo, inventoryRepo } from '../repositories/index.js';
import { allocateJobIdInTx } from '../repositories/job.repository.js';
import { nanoid } from 'nanoid';
import { claimStockDeduction, releaseStockDeductions } from './job-stock-deduction.service.js';
import type { JobTicket, ServiceRequest } from '../../shared/schema.js';
import { repairJourneyService } from './customer-repair-journey.service.js';
import { normalizePhone } from '../utils/phone.js';
import { getPickupQuote } from './pickup-quote.service.js';
import { toPickupTier } from '../../shared/pickup-pricing.js';

/**
 * The repair bill at which this request's collection fare comes off in full.
 *
 * Read outside any transaction, deliberately — see the caller. Returns null
 * when there is genuinely no discount on offer for the address, and ALSO when
 * the lookup fails, because a job must never be blocked by a pricing question.
 * The difference is that a failure is now logged as a failure, loudly, instead
 * of being indistinguishable from "no discount configured".
 */
async function resolvePickupDiscountThreshold(serviceRequestId: string): Promise<number | null> {
    try {
        const res = await db.execute(
            sql`SELECT pickup_cost, pickup_latitude, pickup_longitude, pickup_tier
                FROM service_requests WHERE id = ${serviceRequestId}`,
        );
        const row = ((res as any).rows ?? res)?.[0];
        if (!row) return null;

        const cost = Number(row.pickup_cost);
        const lat = Number(row.pickup_latitude);
        const lng = Number(row.pickup_longitude);
        // A drop-off has no journey to discount, and an address with no
        // coordinates cannot be placed in a ring.
        if (!Number.isFinite(cost) || cost <= 0) return null;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const quote = await getPickupQuote({
            tier: toPickupTier(row.pickup_tier),
            point: { lat, lng },
        });
        if (!quote.configured) {
            console.warn(
                `[JobService] pickup discount threshold unavailable for ${serviceRequestId}: no fare is configured. ` +
                `The collection will be charged in full.`,
            );
            return null;
        }
        return quote.discountOver;
    } catch (error) {
        console.error(
            `[JobService] FAILED to resolve the pickup discount threshold for ${serviceRequestId}. ` +
            `The job will be created and the collection charged in full, so no customer is overcharged — ` +
            `but every discount is silently off until this is fixed.`,
            error,
        );
        return null;
    }
}

class ConversionError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = "ConversionError";
        this.status = status;
        this.code = code;
    }
}

/** JOB-LIFECYCLE-TRUST-01A — converted SR cannot own post-custody lifecycle via transitionStage. */
export class JobOwnsLifecycleError extends Error {
    status = 409;
    code = "JOB_OWNS_LIFECYCLE";
    constructor(message: string) {
        super(message);
        this.name = "JobOwnsLifecycleError";
    }
}

/**
 * Stages that publish post-custody repair/ready/delivery conclusions on the SR timeline.
 * Intake/custody stages (pickup_scheduled, picked_up, device_received, …) stay allowed when
 * still valid for the workflow; after convert only Job may advance lifecycle.
 */
export const POST_CUSTODY_LIFECYCLE_STAGES = new Set([
    "in_repair",
    "ready",
    "out_for_delivery",
    "completed",
    "closed",
]);

export function isPostCustodyLifecycleStage(stage: string): boolean {
    return POST_CUSTODY_LIFECYCLE_STAGES.has(String(stage || "").trim());
}

function isPickupRequest(request: ServiceRequest): boolean {
    return request.servicePreference === "pickup"
        || request.servicePreference === "home_pickup"
        || request.serviceMode === "pickup";
}

export function getProjectedTrackingStatus(request: ServiceRequest, job: JobTicket): string {
    const isPickup = isPickupRequest(request);

    if (job.status === "Cancelled") return "Cancelled";
    if (job.status === "Not OK") return "Unrepairable";
    if (job.status === "Pending") {
        return job.technician && job.technician !== "Unassigned" ? "Technician Assigned" : "Device Received";
    }
    if (job.status === "Diagnosing") return "Technician Assigned";
    if (job.status === "Pending Parts" || job.status === "Waiting on Parts") return "Awaiting Parts";
    if (job.status === "In Progress" || job.status === "On Workbench") return "Repairing";
    if (job.status === "Testing") return "Final Testing";
    if (job.status === "Ready") return isPickup ? "Ready for Return" : "Ready for Collection";
    if (job.status === "Completed" || job.status === "Delivered") return isPickup ? "Delivered" : "Collected";
    if (job.status === "NG Review Pending" || job.status === "Awaiting Customer Decision") return "Repairing";
    if (job.status === "Abandoned" || job.status === "Forfeited" || job.status === "Closed") return "Cancelled";

    return request.trackingStatus || "Device Received";
}

function getProjectedTrackingStatusFromFields(
    servicePreference: string | null,
    serviceMode: string | null,
    job: JobTicket,
): string {
    const isPickup =
        servicePreference === "pickup" ||
        servicePreference === "home_pickup" ||
        serviceMode === "pickup";

    if (job.status === "Pending") {
        return job.technician && job.technician !== "Unassigned" ? "Technician Assigned" : "Device Received";
    }
    if (job.status === "Completed" || job.status === "Delivered") return isPickup ? "Delivered" : "Collected";
    return "Device Received";
}

export function getProjectedRequestStatus(job: JobTicket): string {
    if (job.status === "Cancelled" || job.status === "Abandoned" || job.status === "Forfeited" || job.status === "Closed") {
        return "Cancelled";
    }
    if (job.status === "Not OK") return "Unrepairable";
    if (job.status === "Completed" || job.status === "Delivered") return "Resolved";
    return "Work Order";
}

export class JobService {
    /**
     * Synchronizes parts used in a job with inventory stock and serial numbers.
     * Handles reverting old parts and deducting new parts.
     */
    /**
     * Three defects were fixed here together, because they share one cause.
     *
     * DOUBLE COUNTING. This deducted stock knowing nothing about the till,
     * which deducts for cart items. The same part recorded in both places took
     * two units out of the count for one unit off the shelf. Both paths now
     * claim through job_stock_deductions first, and only the winner moves
     * stock — deduct once per part per job, whoever records it first.
     *
     * LOST UPDATES. `Number(item.stock) - qty` reads and then writes. Two
     * people saving the same job at once both read 5 and both write 4, so one
     * deduction vanishes. Now a single SQL expression, evaluated by the
     * database.
     *
     * PARTIAL WRITES. None of this was in a transaction. A five-part job
     * failing on part three left stock half-updated with no rollback, and the
     * ledger would have made that worse by recording claims for movements that
     * never happened.
     *
     * Reverting the old list releases its claims, so re-adding a part the
     * technician removed is allowed again rather than silently refused for the
     * life of the job.
     */
    async syncJobParts(jobId: string, oldPartsJson: string | null, newPartsJson: string | null): Promise<void> {
        const oldParts: any[] = JSON.parse(oldPartsJson || '[]');
        const newParts: any[] = JSON.parse(newPartsJson || '[]');

        await db.transaction(async (tx) => {
            // 1. Revert old stock & serials
            for (const part of oldParts) {
                if (part.isSerialized && part.serialNumbers) {
                    for (const serial of part.serialNumbers) {
                        if (!serial) continue;
                        await tx.update(schema.inventorySerials)
                            .set({ status: 'in_stock', jobTicketId: null, consumedAt: null })
                            .where(and(eq(schema.inventorySerials.inventoryItemId, part.inventoryItemId), eq(schema.inventorySerials.serialNumber, serial)));
                    }
                }
                if (part.quantity > 0) {
                    await tx.update(schema.inventoryItems)
                        .set({ stock: sql`COALESCE(${schema.inventoryItems.stock}, 0) + ${Number(part.quantity)}` })
                        .where(eq(schema.inventoryItems.id, part.inventoryItemId));
                }
            }

            // The old list's stock is back on the shelf, so its claims are void.
            if (oldParts.length > 0) {
                await releaseStockDeductions(jobId, tx as any);
            }

            // 2. Apply new stock & serials
            for (const part of newParts) {
                if (part.isSerialized && part.serialNumbers) {
                    for (const serial of part.serialNumbers) {
                        if (!serial) continue;
                        await tx.update(schema.inventorySerials)
                            .set({ status: 'consumed', jobTicketId: jobId, consumedAt: new Date() })
                            .where(and(eq(schema.inventorySerials.inventoryItemId, part.inventoryItemId), eq(schema.inventorySerials.serialNumber, serial)));
                    }
                }
                if (part.quantity > 0) {
                    const claim = await claimStockDeduction(
                        jobId, part.inventoryItemId, Number(part.quantity), "job", tx as any,
                    );
                    // Not granted means the till already took these units for
                    // this job. The part is still recorded; the shelf is not
                    // touched twice.
                    if (!claim.granted) continue;
                    await tx.update(schema.inventoryItems)
                        .set({ stock: sql`GREATEST(0, COALESCE(${schema.inventoryItems.stock}, 0) - ${claim.quantity})` })
                        .where(eq(schema.inventoryItems.id, part.inventoryItemId));
                }
            }
        });
    }

    /**
     * @deprecated 00C-B — direct job paidAmount writes are forbidden.
     * Use settleJobPaymentViaPos / createPosSaleAtomic only.
     */
    async recordJobPayment(
        id: string,
        payment: { paymentId: string; amount: number; method: string },
    ): Promise<schema.JobTicket> {
        const err = new Error(
            "Direct job payment writes are disabled. Use POS settlement (POST /api/pos-transactions or record-payment adapter).",
        );
        (err as any).status = 410;
        (err as any).code = "USE_POS_SETTLEMENT";
        throw err;
    }

    async syncLinkedServiceRequestFromJob(jobId: string, actorName: string = "System Projection"): Promise<{
        serviceRequest: ServiceRequest | null;
        trackingStatus?: string;
        status?: string;
        changed: boolean;
    }> {
        const job = await jobRepo.getJobTicket(jobId);
        if (!job) {
            throw new Error("Job ticket not found");
        }

        const request = await serviceRequestRepo.getServiceRequestByConvertedJobId(jobId);
        if (!request) {
            return { serviceRequest: null, changed: false };
        }

        const trackingStatus = getProjectedTrackingStatus(request, job);
        const status = getProjectedRequestStatus(job);
        const updates: any = {};

        if (request.trackingStatus !== trackingStatus) updates.trackingStatus = trackingStatus;
        if (request.status !== status && request.status !== "Closed") updates.status = status;

        if (Object.keys(updates).length === 0) {
            return { serviceRequest: request, trackingStatus, status, changed: false };
        }

        const updated = await serviceRequestRepo.updateServiceRequest(request.id, updates);
        if (!updated) {
            throw new Error("Failed to update linked service request");
        }

        await serviceRequestRepo.createServiceRequestEvent({
            serviceRequestId: request.id,
            status: trackingStatus,
            message: `Customer status projected from Job ${job.id}: ${trackingStatus}.`,
            actor: actorName,
        });

        return { serviceRequest: updated, trackingStatus, status, changed: true };
    }

    /**
     * Universal Stage Transition Logic
     * JOB-LIFECYCLE-TRUST-01A: after conversion, Job owns post-custody lifecycle —
     * reject SR stages that would publish repair/ready/delivery conclusions.
     */
    async transitionStage(id: string, newStage: string, actorName: string = "System"): Promise<{
        serviceRequest: ServiceRequest;
        jobTicket?: JobTicket;
    }> {
        const request = await serviceRequestRepo.getServiceRequest(id);
        if (!request) {
            throw new Error("Service request not found");
        }

        const convertedJobId =
            request.convertedJobId != null && String(request.convertedJobId).trim()
                ? String(request.convertedJobId).trim()
                : null;
        if (convertedJobId && isPostCustodyLifecycleStage(newStage)) {
            throw new JobOwnsLifecycleError(
                "This service request is linked to a job. Use the job lifecycle path for repair progress, ready, delivery, or close.",
            );
        }

        // Get the valid stage flow for this request's specific workflow
        const stageFlow = schema.getStageFlow(request.requestIntent, request.serviceMode);
        const currentStage = request.stage || "intake";
        const currentStageIndex = stageFlow.indexOf(currentStage);
        const newStageIndex = stageFlow.indexOf(newStage);

        // Validate the new stage exists in this workflow
        if (newStageIndex === -1) {
            throw new Error(`Invalid stage "${newStage}" for this workflow`);
        }

        // Must move forward within the workflow's stage flow
        if (newStageIndex <= currentStageIndex && newStage !== currentStage) {
            throw new Error(`Cannot move backwards from "${currentStage}" to "${newStage}"`);
        }

        // Map stages to appropriate tracking status for timeline
        const stageToTrackingStatus: Record<string, string> = {
            intake: "Booked",
            assessment: "Booked",
            awaiting_customer: "Booked",
            authorized: "Booked",
            pickup_scheduled: "Booked",
            picked_up: "Device Collected",
            awaiting_dropoff: "Awaiting Drop-off",
            device_received: "Device Received",
            in_repair: "Repairing",
            ready: "Ready for Return",
            out_for_delivery: "Collection En Route",
            completed: "Delivered",
            closed: "Delivered"
        };

        const stageMessages: Record<string, string> = {
            intake: "Request received and is being processed.",
            assessment: "Your device is being assessed by our team.",
            awaiting_customer: "Quote sent - awaiting your response.",
            authorized: "Repair authorized and scheduled.",
            pickup_scheduled: "Pickup has been scheduled.",
            picked_up: "Device has been picked up.",
            awaiting_dropoff: "Awaiting your device drop-off at our service center.",
            device_received: "Device received at service center.",
            in_repair: "Repair is in progress.",
            ready: "Your device is ready.",
            out_for_delivery: "Device is out for delivery.",
            completed: "Service completed successfully.",
            closed: "Case closed."
        };

        /**
         * The stage change and the timeline entry that explains it are one fact.
         *
         * These were two independent statements. If the event insert failed
         * after the stage update committed, the request had silently moved with
         * no record of who moved it or why — and callers that undo their own
         * work on failure (custody confirmation releases the handover code)
         * would then let the same code be used again against a request whose
         * custody had already advanced.
         *
         * One transaction means a caller's error handling can trust that a
         * thrown transition changed nothing.
         */
        const trackingStatus = stageToTrackingStatus[newStage] || "Request Received";
        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(schema.serviceRequests)
                .set({ stage: newStage as any })
                .where(eq(schema.serviceRequests.id, id))
                .returning();

            await tx.insert(schema.serviceRequestEvents).values({
                id: nanoid(),
                serviceRequestId: id,
                status: trackingStatus as any,
                message: stageMessages[newStage] || `Status updated to ${newStage}`,
                actor: actorName,
            });

            return row;
        });

        /**
         * Announce the stage change so open boards refresh themselves.
         *
         * transitionStage is the single write path for a request's stage — it is
         * how a transfer to Pickup & Delivery, a receipt, and every other
         * progression happens — and it published nothing at all. The Service
         * Requests tab holds a `serviceRequests` query and the server was
         * already emitting that tag from other routes, so the tab was listening
         * to a channel this particular writer never spoke on. Transferring a
         * request left the list showing the old stage until someone refreshed.
         *
         * Published AFTER the transaction commits: an event sent from inside it
         * would tell clients to refetch a row that is not visible yet, and they
         * would read the pre-transition value.
         *
         * Permission-scoped, so it reaches the people who work service requests
         * rather than every connected admin.
         */
        try {
            const { publishServiceRequestEvent } = await import("./admin-realtime.service.js");
            publishServiceRequestEvent({
                action: "updated",
                entityId: id,
                invalidate: ["serviceRequests", "serviceRequestDetails", "dashboardStats"],
                permissions: [
                    "serviceRequests",
                    "serviceRequests.view",
                    "serviceRequests.transitionStage",
                    "serviceRequests.convertToJob",
                ],
            });
        } catch (err) {
            // Realtime is advisory; the stage change is already committed.
            console.error("[JobService] Stage realtime publish failed:", (err as Error).message);
        }

        return { serviceRequest: updated };
    }

    /**
     * Verifies and converts a Service Request into a Job Ticket.
     * Atomic, concurrency-safe: full flow runs inside one db.transaction with
     * SELECT ... FOR UPDATE on the service request row + advisory lock for job number.
     *
     * Returns:
     *   - Fresh conversion: { serviceRequest, jobTicket, idempotent: false }
     *   - Retry/concurrent loser: { serviceRequest, jobTicket, idempotent: true }
     */
    async verifyAndConvertServiceRequest(
        id: string,
        actorName: string,
        verificationNotes?: string,
        priority: string = "Medium"
    ): Promise<{ serviceRequest: ServiceRequest; jobTicket: JobTicket; idempotent: boolean }> {
        const { isRetailQuoteRow } = await import("./retail-quote.service.js");

        /**
         * The discount threshold is resolved BEFORE the transaction opens.
         *
         * It used to be resolved inside it, and that silently destroyed the
         * feature. `getPickupQuote` runs three of its own queries; asking for
         * those while a transaction already holds a connection stalls under a
         * small pool, the call fails, and the catch below wrote `null` — so
         * every job was created with no threshold and no discount ever fired.
         * QA read the ৳0 discount as "threshold not reached" and passed it.
         *
         * The lesson is not only about pool size: a fallback that hides a total
         * failure is worse than no fallback. This one now shouts.
         */
        const pickupDiscountOver = await resolvePickupDiscountThreshold(id);

        const result = await db.transaction(async (tx) => {
            // 1. Lock the service request row
            const lockRes = await tx.execute(
                sql`SELECT * FROM service_requests WHERE id = ${id} FOR UPDATE`,
            );
            const lockRows = (lockRes as any).rows ?? lockRes;
            const raw = Array.isArray(lockRows) && lockRows.length > 0 ? lockRows[0] : null;
            if (!raw) {
                throw new ConversionError(404, "NOT_FOUND", "Service request not found");
            }

            // 2. Re-read conversion-critical fields from locked row
            const convertedJobId: string | null = raw.converted_job_id ?? raw.convertedJobId ?? null;
            const stage: string = raw.stage ?? "intake";
            const requestIntent: string | null = raw.request_intent ?? raw.requestIntent ?? null;
            const serviceMode: string | null = raw.service_mode ?? raw.serviceMode ?? null;
            const servicePreference: string | null = raw.service_preference ?? raw.servicePreference ?? null;
            const isQuote: boolean = raw.is_quote ?? raw.isQuote ?? false;
            const quoteStatus: string | null = raw.quote_status ?? raw.quoteStatus ?? null;
            const quoteAmount: number | null = raw.quote_amount ?? raw.quoteAmount ?? null;

            // 3. Retail-quote guard
            const isQuoteRow =
                isQuote === true ||
                String(requestIntent || "").toLowerCase() === "quote" ||
                (quoteStatus && String(quoteStatus).trim() !== "") ||
                (quoteAmount != null && Number(quoteAmount) > 0);
            if (isQuoteRow) {
                throw new ConversionError(
                    409,
                    "USE_RETAIL_QUOTE_CONVERT",
                    "Retail repair quotes must be converted via POST /api/quotes/:id/convert after acceptance. Custody verify-and-convert is for non-quote service requests only.",
                );
            }

            // 4. Idempotent retry — already converted
            if (convertedJobId) {
                const [existingJob] = await tx
                    .select()
                    .from(schema.jobTickets)
                    .where(eq(schema.jobTickets.id, convertedJobId))
                    .limit(1);
                if (!existingJob) {
                    throw new ConversionError(
                        409,
                        "LINKED_JOB_MISSING",
                        "Service request is marked converted but the linked job is missing.",
                    );
                }
                // Re-read the full SR row for the response
                const srRow = await tx
                    .select()
                    .from(schema.serviceRequests)
                    .where(eq(schema.serviceRequests.id, id))
                    .limit(1);
                return {
                    serviceRequest: srRow[0],
                    jobTicket: existingJob,
                    idempotent: true,
                };
            }

            // 5. Enforce custody stage after row lock
            if (!schema.JOB_CREATION_STAGES.includes(stage as any)) {
                const allowed = schema.JOB_CREATION_STAGES.join('" or "');
                throw new ConversionError(
                    400,
                    "INVALID_STAGE",
                    `Cannot create job at stage "${stage}". Device custody must be confirmed first (stage must be "${allowed}").`,
                );
            }

            // 6. Generate job number safely inside transaction with advisory lock
            const now = new Date();
            const year = now.getFullYear();
            const jobId = await allocateJobIdInTx(tx, year);

            // 7. Insert job ticket
            const customerName: string = raw.customer_name ?? raw.customerName ?? "";
            const phone: string = raw.phone ?? "";
            const address: string | null = raw.address ?? null;
            const brand: string = raw.brand ?? "";
            const modelNumber: string | null = raw.model_number ?? raw.modelNumber ?? null;
            const primaryIssue: string = raw.primary_issue ?? raw.primaryIssue ?? "";
            const screenSize: string | null = raw.screen_size ?? raw.screenSize ?? null;
            const description: string | null = raw.description ?? null;
            const corporateClientId: string | null = raw.corporate_client_id ?? raw.corporateClientId ?? null;
            const corporateChallanId: string | null = raw.corporate_challan_id ?? raw.corporateChallanId ?? null;
            const serviceAreaId: string | null = raw.service_area_id ?? raw.serviceAreaId ?? null;

            /**
             * The collection fare travels with the job.
             *
             * It was quoted to the customer, recomputed on the server and stored
             * on the request at intake — and then it stopped there. The job knew
             * nothing about it, so the till had nothing to charge and the fare
             * reached the counter as zero.
             *
             * Carried as a charge rather than a new column: `charges` already
             * holds `{id, description, amount, type}` and is already summed into
             * the job total, already read by corporate billing and the NG report.
             * Local part purchases append to it exactly this way. So a fare added
             * here needs no migration and shows up wherever charges already show.
             *
             * Only for a collection. A drop-off has no journey to bill, and the
             * intake service leaves `pickup_cost` null for one.
             */
            const pickupCost = Number(raw.pickup_cost ?? raw.pickupCost ?? 0);

            /**
             * The discount threshold is frozen onto the job, not looked up later.
             *
             * The counter needs to know the bill at which this collection's fare
             * comes off, and that figure lives in the ring settings — which the
             * shop can edit at any time. Reading it at billing would mean a
             * customer quoted one promise in the portal is judged against a
             * different one when they arrive, and the change would be invisible
             * to everybody involved. What was true when the job was taken in is
             * what the customer was told, so that is what is kept.
             *
             * Failure here is not fatal. Without a threshold the fare is simply
             * charged in full, which is the state everything was in before
             * discounts existed — the customer is never overcharged by it.
             */
            const pickupCharges =
                Number.isFinite(pickupCost) && pickupCost > 0
                    ? [{
                        id: nanoid(8),
                        description: "Pickup & drop",
                        amount: pickupCost,
                        type: "pickup",
                        // Null means no discount was on offer for this address.
                        discountOver: pickupDiscountOver,
                    }]
                    : [];

            const [jobTicket] = await tx
                .insert(schema.jobTickets)
                .values({
                    id: jobId,
                    charges: pickupCharges.length > 0 ? pickupCharges : undefined,
                    customer: customerName,
                    customerPhone: phone,
                    customerPhoneNormalized: normalizePhone(phone),
                    customerAddress: address || undefined,
                    device: `${brand} TV`,
                    // DEVICE-IDENTITY-01A: model never writes into tvSerialNumber (unit serial is corporate-only)
                    modelNumber: modelNumber || undefined,
                    issue: primaryIssue,
                    status: "Pending",
                    priority: priority,
                    technician: "Unassigned",
                    screenSize: screenSize || undefined,
                    notes: verificationNotes || description || undefined,
                    warrantyDays: 30,
                    gracePeriodDays: 7,
                    estimatedCost: quoteAmount ? quoteAmount : undefined,
                    parentJobId: id,
                    corporateClientId: corporateClientId || undefined,
                    corporateChallanId: corporateChallanId || undefined,
                    serviceAreaId: corporateClientId ? undefined : serviceAreaId || undefined,
                } as any)
                .returning();

            // Test-only fail point (C): after job insert, before SR update
            if (process.env.NODE_ENV === "test" && process.env.ENABLE_CONVERSION_FAIL_POINT === "true") {
                throw new Error("TEST_FAIL_POINT: forced failure after job insertion");
            }

            // 8. Update service request + insert timeline event in same transaction
            const trackingStatus = getProjectedTrackingStatusFromFields(servicePreference, serviceMode, jobTicket);

            const [updated] = await tx
                .update(schema.serviceRequests)
                .set({
                    convertedJobId: jobId,
                    status: "Work Order",
                    stage: stage as any,
                    trackingStatus,
                })
                .where(eq(schema.serviceRequests.id, id))
                .returning();

            await tx.insert(schema.serviceRequestEvents).values({
                id: nanoid(),
                serviceRequestId: id,
                status: "Work Order" as any,
                message: `Work order ${jobId} created by ${actorName}. ${verificationNotes ? `Notes: ${verificationNotes}` : ""}`,
                actor: actorName,
            });

            return {
                serviceRequest: updated,
                jobTicket,
                idempotent: false,
            };
        });

        return result;
    }
}

export const jobService = new JobService();
