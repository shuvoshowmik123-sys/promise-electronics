import { notificationRepo } from "../repositories/index.js";
import * as pushService from "../pushService.js";

/**
 * Tell a staff member that work has been assigned to them.
 *
 * This did not exist. Assigning a driver to a pickup, or a technician to a job,
 * wrote the assignment and told nobody: no push, and no bell notification
 * either. Staff discovered new work only by opening the app and looking, which
 * defeats the point of assigning it to a named person.
 *
 * (A `notificationService.broadcastAdminNotification` existed in the tree but
 * was never wired to anything — it was referenced only by planning docs, which
 * recorded it as a known performance problem. It is not what should have been
 * running here: broadcasting every assignment to every admin is exactly the
 * leak this targeted version avoids.)
 *
 * Two channels, deliberately:
 *
 *   bell   a notification row owned by that user. Survives a closed app, and is
 *          filtered per-user by loadNotificationsByUser, so it cannot leak.
 *   push   sendToUser, which selects device tokens by userId. Never a broadcast.
 *
 * Best-effort by design. An assignment that succeeded must not be rolled back
 * because a phone was unreachable — the work is assigned either way, and the
 * bell row is still there when they next open the app.
 *
 * Content carries the ticket reference and where to go. Deliberately NOT the
 * customer's phone or address: a push preview renders on a lock screen, and the
 * assignee can read the full detail once inside the authenticated app.
 */

export interface StaffAssignmentNotification {
    /** The staff member being given the work. Never a role or a broadcast. */
    userId: string;
    title: string;
    message: string;
    /** Deep link into the relevant board. */
    link: string;
    /** Notification row type, for the bell's own filtering. */
    type?: string;
    /** Job ticket this concerns, when there is one. */
    jobId?: string | null;
}

export async function notifyStaffAssignment(
    input: StaffAssignmentNotification,
): Promise<{ bellCreated: boolean; devicesReached: number }> {
    let bellCreated = false;
    let devicesReached = 0;

    if (!input.userId) {
        return { bellCreated, devicesReached };
    }

    // Bell first: it is the durable half. If the push fails the staff member
    // still finds the work waiting; if the bell fails there is nothing to find.
    try {
        await notificationRepo.createNotification({
            userId: input.userId,
            title: input.title,
            message: input.message,
            type: input.type || "info",
            link: input.link,
            jobId: input.jobId ?? null,
            contextType: "staff",
        } as any);
        bellCreated = true;
    } catch (err) {
        console.error("[StaffAssign] Bell notification failed:", (err as Error).message);
    }

    try {
        devicesReached = await pushService.sendToUser(input.userId, {
            title: input.title,
            body: input.message,
            data: { type: input.type || "assignment", url: input.link },
        });
    } catch (err) {
        console.error("[StaffAssign] Push failed:", (err as Error).message);
    }

    return { bellCreated, devicesReached };
}
