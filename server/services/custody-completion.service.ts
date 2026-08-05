import { sql } from "drizzle-orm";

import { db } from "../db.js";
import { pickupRepo, serviceRequestRepo } from "../repositories/index.js";
import type { ServiceRequest } from "../../shared/schema.js";
import type { CustodyAction, CustodyAuthority } from "./custody-handover.service.js";

/**
 * The single place custody is completed, whatever proved it.
 *
 * Four callers used to converge custody their own way — OTP receive, OTP
 * delivery, no-code receive, no-code delivery — and each converged a different
 * subset. Delivery moved the job but not the task; receive moved the request
 * and the legacy row but left the pickup task active; no-code still tried to
 * drive the service request to `completed`, which converted jobs reject
 * outright, so no-code delivery could never succeed at all.
 *
 * Custody "completing" means the same set of facts every time:
 *
 *   receive   service request at picked_up, pickup task completed,
 *             pickup_schedules at PickedUp with pickedUpAt
 *   delivery  job Delivered, delivery task completed,
 *             pickup_schedules at Delivered — and the service request's own
 *             stage deliberately untouched, because after conversion the job
 *             owns the lifecycle (JOB-LIFECYCLE-TRUST-01A)
 *
 * Every step is written to be safe to repeat, so an interrupted completion can
 * be retried and converge rather than double-apply.
 */

export interface CustodyCompletionInput {
    request: ServiceRequest;
    action: CustodyAction;
    authority: CustodyAuthority;
    /** Display name recorded on timeline and audit entries. */
    actorName: string;
    actorUserId: string;
    actorRole: string;
    /** True for the audited lower-assurance path. */
    lowerAssurance?: boolean;
    /** Reason and proof, no-code path only. */
    reason?: string;
    proofPhotoUrl?: string;
}

export interface CustodyCompletionOutcome {
    serviceRequest: ServiceRequest;
    /** What actually converged, for truthful audit wording. */
    jobDelivered: boolean;
    taskCompleted: boolean;
    pickupScheduleStatus: string | null;
    stageMovedTo: string | null;
}

/** Statuses meaning the logistics task has nothing left to do. */
const TASK_DONE = new Set(["completed", "cancelled"]);

async function currentTaskStatus(taskId: string): Promise<string | null> {
    const rows = await db.execute(sql`SELECT status FROM logistics_tasks WHERE id = ${taskId} LIMIT 1`);
    const row = ((rows as any).rows ?? rows)[0] as { status?: string } | undefined;
    return row?.status ?? null;
}

export async function completeCustody(input: CustodyCompletionInput): Promise<CustodyCompletionOutcome> {
    const { request, action, authority, actorName, actorUserId, actorRole } = input;

    let jobDelivered = false;
    let taskCompleted = false;
    let stageMovedTo: string | null = null;

    const { updateTaskStatusWithLifecycle, updateTaskStatus } =
        await import("./logistics-task.service.js");

    if (action === "delivery") {
        /**
         * The canonical operation owns this: it refuses unless the job is
         * Ready, moves Job → Delivered (projecting the customer journey), then
         * completes the task. Already-delivered is a durable no-op, which is
         * what makes a resumed completion converge instead of repeating.
         */
        if (authority.logisticsTaskId) {
            const result = await updateTaskStatusWithLifecycle(
                authority.logisticsTaskId,
                "completed",
                input.proofPhotoUrl ? { proofPhotoUrl: input.proofPhotoUrl } : undefined,
                { id: actorUserId, name: actorName, role: actorRole },
            );
            jobDelivered = result.jobDelivered;
            taskCompleted = result.task?.status === "completed";
        } else {
            /**
             * Counter collection: a customer collecting in person.
             *
             * There is no logistics task and there never will be — nobody
             * drives anywhere — but the job still has to reach Delivered, with
             * the same customer-journey projection a driver delivery produces.
             * Skipping this branch (as the previous version did) meant counter
             * delivery returned success while the job sat at Ready forever.
             *
             * transitionJobStatus is used directly rather than fabricating a
             * task, and never by hand-writing the job status.
             */
            if (!request.convertedJobId) {
                throw new Error("Counter delivery requires a linked job ticket.");
            }
            const { jobRepo } = await import("../repositories/index.js");
            const job = await jobRepo.getJobTicket(request.convertedJobId);
            if (!job) throw new Error("Linked job not found for counter delivery.");

            if (job.status === "Delivered") {
                jobDelivered = true;
            } else {
                const { transitionJobStatus } = await import("./job-status-transition.service.js");
                await transitionJobStatus({
                    jobId: request.convertedJobId,
                    toStatus: "Delivered",
                    actor: { id: actorUserId, name: actorName, role: actorRole },
                    reason: "system",
                    extraPatch: { completedAt: new Date() },
                    suppressReadyNotify: true,
                });
                // Re-read rather than assume: completed_at must never be set on
                // the strength of a call we did not verify landed.
                const confirmed = await jobRepo.getJobTicket(request.convertedJobId);
                jobDelivered = confirmed?.status === "Delivered";
                if (!jobDelivered) throw new Error("Counter delivery did not reach Delivered.");
            }
        }

        const pickup = await pickupRepo.getPickupScheduleByServiceRequestId(request.id);
        if (pickup && pickup.status !== "Delivered") {
            await pickupRepo.updatePickupSchedule(pickup.id, {
                status: "Delivered",
                deliveredAt: new Date(),
            } as any);
        }

        return {
            serviceRequest: (await serviceRequestRepo.getServiceRequest(request.id)) ?? request,
            jobDelivered,
            taskCompleted,
            pickupScheduleStatus: pickup ? "Delivered" : null,
            // Never moved: the job is the post-conversion lifecycle authority.
            stageMovedTo: null,
        };
    }

    // ── receive ────────────────────────────────────────────────────────────
    const { jobService } = await import("./job.service.js");
    const targetStage = authority.mode === "driver_pickup" ? "picked_up" : "device_received";

    if (request.stage !== targetStage) {
        const result = await jobService.transitionStage(request.id, targetStage, actorName);
        stageMovedTo = result.serviceRequest.stage ?? targetStage;
    } else {
        stageMovedTo = targetStage;
    }

    /**
     * Complete the pickup task too.
     *
     * This was the gap: receipt advanced the request and the legacy row but
     * left the task sitting active, so the driver's board still showed a
     * collection they had already made. A pickup task has no job lifecycle to
     * respect — the job does not exist yet — so the plain status update is the
     * correct authority here, not the delivery-specific canonical path.
     */
    if (authority.logisticsTaskId) {
        const status = await currentTaskStatus(authority.logisticsTaskId);
        if (status && !TASK_DONE.has(status)) {
            await updateTaskStatus(
                authority.logisticsTaskId,
                "completed",
                input.proofPhotoUrl ? { proofPhotoUrl: input.proofPhotoUrl } : undefined,
            );
        }
        taskCompleted = true;
    }

    const pickup = await pickupRepo.getPickupScheduleByServiceRequestId(request.id);
    if (pickup && pickup.status !== "PickedUp") {
        await pickupRepo.updatePickupSchedule(pickup.id, {
            status: "PickedUp",
            pickedUpAt: new Date(),
        } as any);
    }

    return {
        serviceRequest: (await serviceRequestRepo.getServiceRequest(request.id)) ?? request,
        jobDelivered: false,
        taskCompleted,
        pickupScheduleStatus: pickup ? "PickedUp" : null,
        stageMovedTo,
    };
}

/**
 * Truthful audit wording.
 *
 * The old entry said "Stage moved to completed" for deliveries where the stage
 * never moved at all — the job owns it. An audit record that describes a write
 * that did not happen is worse than none: it is evidence pointing the wrong way.
 */
export function describeCustodyOutcome(
    action: CustodyAction,
    outcome: CustodyCompletionOutcome,
    lowerAssurance: boolean,
): string {
    const parts: string[] = [];
    if (action === "delivery") {
        parts.push(outcome.jobDelivered ? "Job marked Delivered" : "Job already Delivered");
        if (outcome.taskCompleted) parts.push("delivery task completed");
        if (outcome.pickupScheduleStatus) parts.push(`pickup schedule ${outcome.pickupScheduleStatus}`);
        parts.push("device released to customer");
    } else {
        parts.push("device received into custody");
        if (outcome.stageMovedTo) parts.push(`stage ${outcome.stageMovedTo}`);
        if (outcome.taskCompleted) parts.push("pickup task completed");
        if (outcome.pickupScheduleStatus) parts.push(`pickup schedule ${outcome.pickupScheduleStatus}`);
    }
    const assurance = lowerAssurance
        ? " (LOWER ASSURANCE — no customer code, reason and photo proof recorded)"
        : "";
    return parts.join(", ") + assurance;
}
