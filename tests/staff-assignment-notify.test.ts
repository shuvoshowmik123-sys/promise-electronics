import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Staff are told when work is assigned to them.
 *
 * Assigning a driver to a pickup, or a technician to a job, used to write the
 * assignment and notify nobody — no push, no bell row. Staff found new work
 * only by opening the app and looking, and the reported symptom was a silent
 * phone after a transfer to Pickup & Delivery.
 *
 * Asserted against source rather than by booting the server, because the
 * behaviour under test is *which call sites notify* and *what the payload
 * carries*. Both are structural, and a runtime test would need FCM credentials
 * and a registered device to prove the same thing.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const LOGISTICS = read("server/services/logistics-task.service.ts");
const NOTIFY = read("server/services/staff-assignment-notify.service.ts");
const PUSH = read("server/pushService.ts");
const FCM = read("server/services/fcm.service.ts");
const SR_ROUTES = read("server/routes/service-requests.routes.ts");
const JOBS_ROUTES = read("server/routes/jobs.routes.ts");

describe("driver assignment notifies the assigned driver", () => {
    it("assignDriver notifies", () => {
        const fn = LOGISTICS.slice(
            LOGISTICS.indexOf("export async function assignDriver"),
            LOGISTICS.indexOf("export async function autoAssignSoleDriver"),
        );
        expect(fn).toContain("notifyAssignedDriver");
    });

    it("a task CREATED with a driver already on it also notifies", () => {
        // This path never passes through assignDriver, so it would otherwise be
        // the one assignment nobody hears about.
        const fn = LOGISTICS.slice(
            LOGISTICS.indexOf("export async function createTask"),
            LOGISTICS.indexOf("export async function createTaskFromServiceRequest"),
        );
        expect(fn).toContain("notifyAssignedDriver");
    });

    it("does not double-notify when the sole-driver path assigns", () => {
        // autoAssignSoleDriver routes through assignDriver, which already
        // notifies. createTask must only notify on the branch where a driver was
        // supplied up front.
        const fn = LOGISTICS.slice(
            LOGISTICS.indexOf("export async function autoAssignSoleDriver"),
            LOGISTICS.indexOf("export async function getPickupTaskIdForSchedule"),
        );
        expect(fn).not.toContain("notifyAssignedDriver");
    });

    it("stays silent for finished work", () => {
        const guard = LOGISTICS.slice(LOGISTICS.indexOf("async function notifyAssignedDriver"));
        expect(guard).toContain('task.status === "completed"');
        expect(guard).toContain('task.status === "cancelled"');
    });

    it("skips when nobody is assigned", () => {
        const guard = LOGISTICS.slice(LOGISTICS.indexOf("async function notifyAssignedDriver"));
        expect(guard).toContain("if (!task?.assignedDriverId) return;");
    });

    it("carries no customer phone or address into a lock-screen preview", () => {
        const fn = LOGISTICS.slice(
            LOGISTICS.indexOf("async function notifyAssignedDriver"),
            LOGISTICS.indexOf("function publishPickupChange"),
        );
        expect(fn).not.toContain("customerPhone");
        expect(fn).not.toContain("pickupAddress");
        expect(fn).not.toContain("deliveryAddress");
        expect(fn).not.toContain("customerName");
    });
});

describe("notification targeting", () => {
    it("sends to one user, never a broadcast", () => {
        expect(NOTIFY).toContain("pushService.sendToUser");
        // sendPushToAllAdmins would reach every staff device.
        expect(NOTIFY).not.toContain("sendPushToAllAdmins");
        expect(NOTIFY).not.toContain("getAllDeviceTokens");
    });

    it("writes a bell row owned by that user", () => {
        expect(NOTIFY).toContain("createNotification");
        expect(NOTIFY).toContain("userId: input.userId");
    });

    it("never throws — an unreachable phone must not undo an assignment", () => {
        const catches = NOTIFY.match(/catch\s*\(/g) ?? [];
        expect(catches.length).toBeGreaterThanOrEqual(2);
    });
});

describe("browser push actually wakes the device", () => {
    it("sendToDevice sets webpush urgency and a bounded TTL", () => {
        // Without this the message goes at FCM's default urgency, which browser
        // push services may batch and hold — arriving late and silently.
        expect(PUSH).toContain("webpush:");
        expect(PUSH).toContain("Urgency: 'high'");
        expect(PUSH).toContain("TTL: String(4 * 60 * 60)");
    });

    it("keeps native Android sound configured", () => {
        expect(PUSH).toContain("sound: 'default'");
        expect(PUSH).toContain("priority: 'high'");
    });

    it("every webpush badge is the monochrome silhouette, not the colour favicon", () => {
        // Android fills every opaque pixel of the badge with the system tint, so
        // a full-colour icon renders as a solid white dot.
        for (const [name, src] of [["pushService", PUSH], ["fcm.service", FCM]] as const) {
            expect(src, name).not.toMatch(/badge:\s*['"]\/favicon\.png['"]/);
            expect(src, name).toMatch(/badge:\s*['"]\/notification-badge\.png['"]/);
        }
    });
});

describe("technician assignment notifies the assigned technician", () => {
    it("notifies on a real assignee change", () => {
        expect(JOBS_ROUTES).toContain("Job assigned to you");
        expect(JOBS_ROUTES).toContain("notifyStaffAssignment");
    });

    it("only fires when the assignee actually changed", () => {
        // Re-saving a job without touching the technician must not re-notify,
        // and reassigning away from someone must not buzz the whole workshop.
        const block = JOBS_ROUTES.slice(JOBS_ROUTES.indexOf("Tell the technician the job is theirs"));
        expect(block).toContain("updateData.assignedTechnicianId !== existingJob.assignedTechnicianId");
    });

    it("carries no customer phone or address", () => {
        const block = JOBS_ROUTES.slice(
            JOBS_ROUTES.indexOf("Tell the technician the job is theirs"),
            JOBS_ROUTES.indexOf("Tell the technician the job is theirs") + 1400,
        );
        expect(block).not.toContain("customerPhone");
        expect(block).not.toContain("customerAddress");
    });
});

describe("staff-wide pushes reach only the people they concern", () => {
    it("new service requests go to dispatch, not to every driver and technician", () => {
        // STAFF_PORTAL_ROLES includes Driver/Technician/Cashier, so an
        // unfiltered broadcast buzzed all of them for every intake.
        const call = SR_ROUTES.slice(
            SR_ROUTES.indexOf("type: 'service_request_created'"),
            SR_ROUTES.indexOf("type: 'service_request_created'") + 1600,
        );
        expect(call).toContain("requiredPermissions");
        expect(call).toContain("serviceRequests.view");
    });

    it("the token query can filter by permission", () => {
        expect(PUSH).toContain("requiredPermissions?: string[]");
        expect(PUSH).toContain("resolveGranularPermission");
        expect(PUSH).toContain("getEffectivePermissionsForUser");
    });

    it("an unfiltered call still reaches everyone — filtering is opt-in, not silent", () => {
        // Existing callers (e.g. backup failure) must keep working unchanged.
        expect(PUSH).toContain("if (!requiredPermissions || requiredPermissions.length === 0)");
    });

    it("fcm threads the filter through instead of dropping it", () => {
        // Signature is multi-line, so match the parameter rather than the line.
        expect(FCM).toMatch(/sendPushToAllAdmins\([\s\S]{0,120}requiredPermissions\?: string\[\]/);
        expect(FCM).toContain("payload.requiredPermissions");
        expect(FCM).toContain("getAllDeviceTokens(requiredPermissions)");
    });
});
