/**
 * Job Service
 * 
 * Handles complex business logic involving Job Tickets, including
 * stock synchronization, payment recording, and workflow transitions.
 */

import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { jobRepo, serviceRequestRepo, inventoryRepo } from '../repositories/index.js';
import { nanoid } from 'nanoid';
import type { JobTicket, ServiceRequest } from '../../shared/schema.js';

export class JobService {
    /**
     * Synchronizes parts used in a job with inventory stock and serial numbers.
     * Handles reverting old parts and deducting new parts.
     */
    async syncJobParts(jobId: string, oldPartsJson: string | null, newPartsJson: string | null): Promise<void> {
        const oldParts: any[] = JSON.parse(oldPartsJson || '[]');
        const newParts: any[] = JSON.parse(newPartsJson || '[]');

        // 1. Revert old stock & serials
        for (const part of oldParts) {
            if (part.isSerialized && part.serialNumbers) {
                for (const serial of part.serialNumbers) {
                    if (!serial) continue;
                    await db.update(schema.inventorySerials)
                        .set({ status: 'in_stock', jobTicketId: null, consumedAt: null })
                        .where(and(eq(schema.inventorySerials.inventoryItemId, part.inventoryItemId), eq(schema.inventorySerials.serialNumber, serial)));
                }
            }
            if (part.quantity > 0) {
                const item = await inventoryRepo.getInventoryItem(part.inventoryItemId);
                if (item) {
                    // Add stock back
                    await db.update(schema.inventoryItems)
                        .set({ stock: Number(item.stock) + Number(part.quantity) })
                        .where(eq(schema.inventoryItems.id, item.id));
                }
            }
        }

        // 2. Apply new stock & serials
        for (const part of newParts) {
            if (part.isSerialized && part.serialNumbers) {
                for (const serial of part.serialNumbers) {
                    if (!serial) continue;
                    await db.update(schema.inventorySerials)
                        .set({ status: 'consumed', jobTicketId: jobId, consumedAt: new Date() })
                        .where(and(eq(schema.inventorySerials.inventoryItemId, part.inventoryItemId), eq(schema.inventorySerials.serialNumber, serial)));
                }
            }
            if (part.quantity > 0) {
                const item = await inventoryRepo.getInventoryItem(part.inventoryItemId);
                if (item) {
                    // Deduct stock
                    await db.update(schema.inventoryItems)
                        .set({ stock: Number(item.stock) - Number(part.quantity) })
                        .where(eq(schema.inventoryItems.id, item.id));
                }
            }
        }
    }

    /**
     * Records a payment against a job ticket, updating paid amounts and statuses.
     */
    async recordJobPayment(id: string, payment: { paymentId: string; amount: number; method: string; }): Promise<schema.JobTicket> {
        const job = await jobRepo.getJobTicket(id);
        if (!job) throw new Error("Job not found");

        const newPaidAmount = (job.paidAmount || 0) + payment.amount;
        const estimatedCost = job.estimatedCost || 0;
        const remainingAmount = Math.max(0, estimatedCost - newPaidAmount);

        let paymentStatus: "unpaid" | "paid" | "partial" = "partial";
        if (remainingAmount <= 0) paymentStatus = "paid";
        else if (newPaidAmount === 0 && estimatedCost > 0) paymentStatus = "unpaid";

        const updates: Partial<schema.InsertJobTicket> = {
            paidAmount: newPaidAmount,
            remainingAmount: remainingAmount,
            paymentStatus: paymentStatus,
            lastPaymentAt: new Date(),
        };

        // First payment sets the main paymentId and paidAt
        if (!job.paidAmount || job.paidAmount === 0) {
            updates.paymentId = payment.paymentId;
            updates.paidAt = new Date();
        }

        const [updatedJob] = await db
            .update(schema.jobTickets)
            .set(updates)
            .where(eq(schema.jobTickets.id, id))
            .returning();

        return updatedJob;
    }

    /**
     * Universal Stage Transition Logic
     */
    async transitionStage(id: string, newStage: string, actorName: string = "System"): Promise<{
        serviceRequest: ServiceRequest;
        jobTicket?: JobTicket;
    }> {
        const request = await serviceRequestRepo.getServiceRequest(id);
        if (!request) {
            throw new Error("Service request not found");
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

        // Update the stage
        const [updated] = await db
            .update(schema.serviceRequests)
            .set({ stage: newStage as any })
            .where(eq(schema.serviceRequests.id, id))
            .returning();

        // Add timeline event with appropriate tracking status
        const trackingStatus = stageToTrackingStatus[newStage] || "Request Received";
        await db.insert(schema.serviceRequestEvents).values({
            id: nanoid(),
            serviceRequestId: id,
            status: trackingStatus as any,
            message: stageMessages[newStage] || `Status updated to ${newStage}`,
            actor: actorName,
        });

        return { serviceRequest: updated };
    }

    /**
     * Verifies and converts a Service Request into a Job Ticket
     */
    async verifyAndConvertServiceRequest(
        id: string,
        actorName: string,
        verificationNotes?: string,
        priority: string = "Medium"
    ): Promise<{ serviceRequest: ServiceRequest; jobTicket: JobTicket }> {
        const request = await serviceRequestRepo.getServiceRequest(id);
        if (!request) {
            throw new Error("Service request not found");
        }

        if (request.convertedJobId) {
            throw new Error("Service request has already been converted to a job ticket");
        }

        const jobId = await jobRepo.getNextJobNumber();

        const [jobTicket] = await db.insert(schema.jobTickets).values({
            id: jobId,
            customer: request.customerName,
            customerPhone: request.phone,
            customerAddress: request.address || undefined,
            device: `${request.brand} TV`,
            tvSerialNumber: request.modelNumber || undefined,
            issue: request.primaryIssue,
            status: "Pending", // Starts as Pending until Technician picks it up
            priority: priority,
            technician: "Unassigned",
            screenSize: request.screenSize || undefined,
            notes: verificationNotes || request.description || undefined,
            warrantyDays: 30, // Default for new jobs
            gracePeriodDays: 7, // Default grace period
            estimatedCost: request.quoteAmount ? request.quoteAmount : undefined, // Carry over quote amount
            parentJobId: request.id, // Track origin
            corporateClientId: request.corporateClientId || undefined,
            corporateChallanId: request.corporateChallanId || undefined,
        } as any).returning();

        // Link and Update Service Request
        const [updated] = await db
            .update(schema.serviceRequests)
            .set({
                convertedJobId: jobId,
                status: "Work Order",
                stage: "authorized" as any, // Move to authorized stage
            })
            .where(eq(schema.serviceRequests.id, id))
            .returning();

        // Add Timeline Event
        await db.insert(schema.serviceRequestEvents).values({
            id: nanoid(),
            serviceRequestId: id,
            status: "Work Order" as any,
            message: `Work order ${jobId} created by ${actorName}. ${verificationNotes ? `Notes: ${verificationNotes}` : ''}`,
            actor: actorName,
        });

        return { serviceRequest: updated, jobTicket };
    }
}

export const jobService = new JobService();
