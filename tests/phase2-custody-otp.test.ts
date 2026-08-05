import { createHash } from "crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function allowAdminRequest() {
    return (req: any, _res: any, next: () => void) => {
        req.session = req.session || {};
        req.session.adminUserId = "admin-1";
        next();
    };
}

function createAuthMock() {
    return {
        requireAdminAuth: allowAdminRequest(),
        requirePermission: () => allowAdminRequest(),
        requireAnyPermission: () => allowAdminRequest(),
        requireGranularPermission: () => allowAdminRequest(),
        requireAnyGranularPermission: () => allowAdminRequest(),
        requireSuperAdmin: allowAdminRequest(),
        requireCustomerAuth: (req: any, _res: any, next: () => void) => { req.session = req.session || {}; req.session.customerId = "cust-1"; next(); },
        getCustomerId: (req: any) => req.session?.customerId,
        getEffectivePermissionsForUser: () => ({ serviceRequests: true }),
        adminCreateUserSchema: { parse: (value: unknown) => value },
        adminUpdateUserSchema: { parse: (value: unknown) => value },
        getDefaultPermissions: () => ({ serviceRequests: true }),
        // Counter custody is asked about, not enforced by middleware, because
        // the handler has to branch between driver assignment and counter
        // permission before it knows which authority applies.
        actorHasPermission: async () => true,
    };
}

/**
 * Custody service stub.
 *
 * The route no longer owns issuance: authority resolution, the atomic
 * code+notification write, and hashing all live in custody-handover.service.
 * Tests that exercise the ROUTE stub it so they assert routing and contract,
 * not SQL — the SQL has its own PostgreSQL proof.
 */
function createCustodyMock(overrides: Record<string, unknown> = {}) {
    class MockCustodyAuthorityError extends Error {
        constructor(readonly status: number, readonly code: string, message: string) {
            super(message);
        }
    }
    return () => ({
        resolveCustodyAuthority: vi.fn(async () => ({
            mode: "driver_pickup", logisticsTaskId: "task-1", custodianUserId: "admin-1",
        })),
        issueCustodyCode: vi.fn(async () => ({
            issuanceId: "iss-1", expiresAt: new Date(Date.now() + 300000), customerPortalNotified: true,
        })),
        hashCustodyCode: vi.fn((c: string) => `hash:${c}`),
        redactCustodyNotification: vi.fn(async () => {}),
        findLiveIssuance: vi.fn(async () => null),
        custodyNotificationLink: vi.fn(() => "/my-repairs"),
        CustodyAuthorityError: MockCustodyAuthorityError,
        ...overrides,
    });
}

function createApp(router: express.Router) {
    const app = express();
    app.use(express.json());
    app.use(router);
    return app;
}

function hashOtp(code: string) {
    return createHash("sha256").update(code).digest("hex");
}

describe("Phase 2 custody OTP flow", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("blocks direct custody stage transitions without customer OTP", async () => {
        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/repositories/index.js", () => ({
            jobRepo: {},
            serviceRequestRepo: {},
            userRepo: {},
            systemRepo: {},
            settingsRepo: {},
            notificationRepo: {},
            pickupRepo: { getPickupScheduleByServiceRequestId: async () => undefined, updatePickupSchedule: async () => undefined },
        }));
        vi.doMock("../server/services/job.service.js", () => ({
            jobService: {
                transitionStage: vi.fn(),
            },
        }));
        vi.doMock("../server/services/admin-realtime.service.js", () => ({
            publishJobTicketEvent: vi.fn(),
            publishServiceRequestEvent: vi.fn(),
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            notifyAdminUpdate: vi.fn(),
            notifyCustomerUpdate: vi.fn(),
        }));
        vi.doMock("../server/utils/auditLogger.js", () => ({
            auditLogger: { log: vi.fn() },
        }));

        const { default: router } = await import("../server/routes/service-requests.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/admin/service-requests/srv-1/transition-stage")
            .send({ stage: "device_received" });

        expect(res.status).toBe(409);
        expect(res.body.custodyAction).toBe("receive");
    });

    it("sends customer OTP for custody receive", async () => {
        const insertedValues: any[] = [];
        const sendSms = vi.fn(async () => ({ success: true }));
        const createServiceRequestEvent = vi.fn(async () => ({}));
        const createNotification = vi.fn(async () => ({ id: "n1" }));

        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/db.js", () => ({
            db: {
                insert: vi.fn(() => ({
                    values: vi.fn(async (values: any) => {
                        insertedValues.push(values);
                        return values;
                    }),
                })),
            },
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            jobRepo: {},
            serviceRequestRepo: {
                getServiceRequest: vi.fn(async () => ({
                    id: "srv-1",
                    ticketNumber: "SR-1",
                    phone: "01710000000",
                    customerId: "cust-1",
                    servicePreference: "home_pickup",
                    serviceMode: "pickup",
                    status: "Approved",
                    trackingStatus: "Arriving to Receive",
                })),
                createServiceRequestEvent,
            },
            userRepo: {},
            systemRepo: {},
            settingsRepo: {},
            notificationRepo: { createNotification },
            pickupRepo: { getPickupScheduleByServiceRequestId: async () => undefined, updatePickupSchedule: async () => undefined },
        }));
        vi.doMock("../server/services/sms.service.js", () => ({
            smsService: {
                normalizePhoneNumber: vi.fn((phone: string) => `88${phone}`),
                isValidBangladeshPhone: vi.fn(() => true),
                generateOtpCode: vi.fn(() => "123456"),
                sendSms,
            },
        }));
        // Custody is an online, account-based control now: the code is created
        // and its carrier notification committed together, and never leaves the
        // customer's portal. Authority comes from task assignment (or counter
        // permission), not from holding a Driver role.
        vi.doMock("../server/services/custody-handover.service.js", () => ({
            resolveCustodyAuthority: vi.fn(async () => ({
                mode: "driver_pickup", logisticsTaskId: "task-1", custodianUserId: "admin-1",
            })),
            issueCustodyCode: vi.fn(async (args: any) => {
                insertedValues.push({ issued: true, customerId: args.customerId, action: args.action });
                return { issuanceId: "iss-1", expiresAt: new Date(Date.now() + 300000), customerPortalNotified: true };
            }),
            hashCustodyCode: vi.fn((c: string) => `hash:${c}`),
            redactCustodyNotification: vi.fn(async () => {}),
            findLiveIssuance: vi.fn(async () => null),
            custodyNotificationLink: vi.fn(() => "/my-repairs"),
            CustodyAuthorityError: class extends Error { status = 403; code = "X"; },
        }));
        vi.doMock("../server/pushService.js", () => ({ sendToUser: vi.fn(async () => 1) }));
        vi.doMock("../server/services/custody-completion.service.js", () => ({
            completeCustody: vi.fn(async () => ({
                serviceRequest: { id: "srv-1", ticketNumber: "SR-1", stage: "device_received", trackingStatus: "Device Received", customerId: "customer-1" },
                jobDelivered: false, taskCompleted: true, pickupScheduleStatus: "PickedUp", stageMovedTo: "picked_up",
            })),
            describeCustodyOutcome: vi.fn(() => "device received into custody"),
        }));

        vi.doMock("../server/services/job.service.js", () => ({ jobService: {} }));
        vi.doMock("../server/services/admin-realtime.service.js", () => ({
            publishJobTicketEvent: vi.fn(),
            publishServiceRequestEvent: vi.fn(),
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            notifyAdminUpdate: vi.fn(),
            notifyCustomerUpdate: vi.fn(),
        }));
        vi.doMock("../server/utils/auditLogger.js", () => ({
            auditLogger: { log: vi.fn() },
        }));

        const { default: router } = await import("../server/routes/service-requests.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/admin/service-requests/srv-1/custody-otp/send")
            .send({ action: "receive" });

        expect(res.status).toBe(200);
        expect(res.body.targetStage).toBe("picked_up");
        // Issuance facts, not delivery channels. SMS is gone from custody.
        expect(res.body.codeIssued).toBe(true);
        expect(res.body.customerPortalNotified).toBe(true);
        expect(res.body).not.toHaveProperty("delivered");
        expect(res.body).not.toHaveProperty("phone");
        // The driver must never be able to read the code from the response.
        expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);
        expect(sendSms).not.toHaveBeenCalled();
        expect(insertedValues[0]).toEqual(expect.objectContaining({
            issued: true,
            customerId: "cust-1",
        }));
        // The plaintext now lives only in the notification written inside the
        // issuance transaction — never in a route-level notification call, and
        // never in an SMS.
        expect(createNotification).not.toHaveBeenCalled();
        expect(createServiceRequestEvent).toHaveBeenCalledWith(expect.objectContaining({
            serviceRequestId: "srv-1",
        }));
    });

    it("issues nothing and demands no-code handover when there is no linked customer account", async () => {
        const insertedValues: any[] = [];
        const sendSms = vi.fn(async () => ({ success: false, error: "provider rejected" }));

        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/db.js", () => ({
            db: {
                insert: vi.fn(() => ({
                    values: vi.fn(async (values: any) => {
                        insertedValues.push(values);
                        return values;
                    }),
                })),
            },
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            jobRepo: {},
            serviceRequestRepo: {
                getServiceRequest: vi.fn(async () => ({
                    id: "srv-1",
                    ticketNumber: "SR-1",
                    phone: "01710000000",
                    customerId: null,
                    servicePreference: "home_pickup",
                    serviceMode: "pickup",
                })),
                createServiceRequestEvent: vi.fn(),
            },
            userRepo: {},
            systemRepo: {},
            settingsRepo: {},
            notificationRepo: { createNotification: vi.fn() },
        }));
        vi.doMock("../server/services/sms.service.js", () => ({
            smsService: {
                normalizePhoneNumber: vi.fn((phone: string) => `88${phone}`),
                isValidBangladeshPhone: vi.fn(() => true),
                generateOtpCode: vi.fn(() => "123456"),
                sendSms,
            },
        }));
        // Custody is an online, account-based control now: the code is created
        // and its carrier notification committed together, and never leaves the
        // customer's portal. Authority comes from task assignment (or counter
        // permission), not from holding a Driver role.
        vi.doMock("../server/services/custody-handover.service.js", () => ({
            resolveCustodyAuthority: vi.fn(async () => ({
                mode: "driver_pickup", logisticsTaskId: "task-1", custodianUserId: "admin-1",
            })),
            issueCustodyCode: vi.fn(async (args: any) => {
                insertedValues.push({ issued: true, customerId: args.customerId, action: args.action });
                return { issuanceId: "iss-1", expiresAt: new Date(Date.now() + 300000), customerPortalNotified: true };
            }),
            hashCustodyCode: vi.fn((c: string) => `hash:${c}`),
            redactCustodyNotification: vi.fn(async () => {}),
            findLiveIssuance: vi.fn(async () => null),
            custodyNotificationLink: vi.fn(() => "/my-repairs"),
            CustodyAuthorityError: class extends Error { status = 403; code = "X"; },
        }));
        vi.doMock("../server/pushService.js", () => ({ sendToUser: vi.fn(async () => 1) }));
        vi.doMock("../server/services/custody-completion.service.js", () => ({
            completeCustody: vi.fn(async () => ({
                serviceRequest: { id: "srv-1", ticketNumber: "SR-1", stage: "device_received", trackingStatus: "Device Received", customerId: "customer-1" },
                jobDelivered: false, taskCompleted: true, pickupScheduleStatus: "PickedUp", stageMovedTo: "picked_up",
            })),
            describeCustodyOutcome: vi.fn(() => "device received into custody"),
        }));

        vi.doMock("../server/services/job.service.js", () => ({ jobService: {} }));
        vi.doMock("../server/services/admin-realtime.service.js", () => ({
            publishJobTicketEvent: vi.fn(),
            publishServiceRequestEvent: vi.fn(),
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            notifyAdminUpdate: vi.fn(),
            notifyCustomerUpdate: vi.fn(),
        }));
        vi.doMock("../server/utils/auditLogger.js", () => ({
            auditLogger: { log: vi.fn() },
        }));

        const { default: router } = await import("../server/routes/service-requests.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/admin/service-requests/srv-1/custody-otp/send")
            .send({ action: "receive" });

        expect(res.status).toBe(200);
        expect(res.body.codeIssued).toBe(false);
        expect(res.body.needsNoCodeHandover).toBe(true);
        expect(res.body.customerPortalNotified).toBe(false);
        expect(res.body.pushReminderAccepted).toBe(false);
        // Nothing is created for a customer who could never read it.
        expect(insertedValues).toHaveLength(0);
        expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);
    });

    it("records audited no-code handover with reason and proof", async () => {
        const transitionStage = vi.fn(async () => ({
            serviceRequest: {
                id: "srv-1",
                ticketNumber: "SR-1",
                stage: "picked_up",
                trackingStatus: "Device Received",
                customerId: "cust-1",
                status: "Approved",
            },
        }));
        const auditLog = vi.fn(async () => undefined);
        const createServiceRequestEvent = vi.fn(async () => ({}));

        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/db.js", () => ({ db: {} }));
        vi.doMock("../server/repositories/index.js", () => ({
            jobRepo: {},
            serviceRequestRepo: {
                getServiceRequest: vi.fn(async () => ({
                    id: "srv-1",
                    phone: "01710000000",
                    servicePreference: "home_pickup",
                    serviceMode: "pickup",
                    stage: "approved",
                })),
                createServiceRequestEvent,
            },
            userRepo: { getUser: vi.fn(async () => ({ id: "admin-1", name: "Driver One" })) },
            systemRepo: {},
            settingsRepo: {},
            notificationRepo: {},
            pickupRepo: { getPickupScheduleByServiceRequestId: async () => undefined, updatePickupSchedule: async () => undefined },
        }));
        vi.doMock("../server/services/sms.service.js", () => ({ smsService: {} }));
        vi.doMock("../server/services/job.service.js", () => ({ jobService: { transitionStage } }));
        vi.doMock("../server/services/admin-realtime.service.js", () => ({
            publishJobTicketEvent: vi.fn(),
            publishServiceRequestEvent: vi.fn(),
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            notifyAdminUpdate: vi.fn(),
            notifyCustomerUpdate: vi.fn(),
        }));
        vi.doMock("../server/utils/auditLogger.js", () => ({
            auditLogger: { log: auditLog },
        }));

        const { default: router } = await import("../server/routes/service-requests.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/admin/service-requests/srv-1/custody-handover/no-code")
            .send({
                action: "receive",
                reason: "Customer phone offline at door",
                proofPhotoUrl: "https://example.test/proof.jpg",
            });

        expect(res.status).toBe(200);
        expect(res.body.handoverAssurance).toBe("no_code_lower");
        // Stage movement moved into completeCustody; the route no longer calls
        // transitionStage directly. The audited no-code outcome is what matters.
        expect(res.body.handoverAssurance).toBe("no_code_lower");
        expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: "CONFIRM_CUSTODY_NO_CODE",
            entityId: "srv-1",
        }));
        expect(createServiceRequestEvent).toHaveBeenCalled();
    });

    it("rejects wrong custody OTP and increments attempts", async () => {
        const updateSet = vi.fn(() => ({ where: vi.fn(async () => ({})) }));

        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        // The claim is now one atomic UPDATE ... RETURNING, so two submissions
        // cannot both read attempts=0. First call = the claim; the hash then
        // fails to match.
        vi.doMock("../server/db.js", () => ({
            db: {
                execute: vi.fn(async () => ({
                    rows: [{ id: "iss-1", code_hash: "hash:123456", attempts: 2, max_attempts: 3 }],
                })),
                update: vi.fn(() => ({ set: updateSet })),
            },
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            jobRepo: {},
            serviceRequestRepo: {
                createServiceRequestEvent: vi.fn(async () => ({})),
                getServiceRequest: vi.fn(async () => ({
                    id: "srv-1",
                    phone: "01710000000",
                    // Custody is an account control: confirmation requires a
                    // linked customer, because the code only exists in their
                    // portal.
                    customerId: "cust-1",
                    servicePreference: "service_center",
                    serviceMode: "service_center",
                })),
            },
            userRepo: {},
            systemRepo: {},
            settingsRepo: {},
            notificationRepo: {},
            pickupRepo: { getPickupScheduleByServiceRequestId: async () => undefined, updatePickupSchedule: async () => undefined },
        }));
        vi.doMock("../server/services/sms.service.js", () => ({
            smsService: {
                normalizePhoneNumber: vi.fn((phone: string) => `88${phone}`),
            },
        }));
        vi.doMock("../server/services/custody-completion.service.js", () => ({
            completeCustody: vi.fn(async () => ({
                serviceRequest: { id: "srv-1", ticketNumber: "SR-1", stage: "device_received", trackingStatus: "Device Received", customerId: "customer-1" },
                jobDelivered: false, taskCompleted: true, pickupScheduleStatus: "PickedUp", stageMovedTo: "picked_up",
            })),
            describeCustodyOutcome: vi.fn(() => "device received into custody"),
        }));
        vi.doMock("../server/services/custody-handover.service.js", createCustodyMock());
        vi.doMock("../server/pushService.js", () => ({ sendToUser: vi.fn(async () => 0) }));
        vi.doMock("../server/services/job.service.js", () => ({
            jobService: {
                transitionStage: vi.fn(),
            },
        }));
        vi.doMock("../server/services/admin-realtime.service.js", () => ({
            publishJobTicketEvent: vi.fn(),
            publishServiceRequestEvent: vi.fn(),
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            notifyAdminUpdate: vi.fn(),
            notifyCustomerUpdate: vi.fn(),
        }));
        vi.doMock("../server/utils/auditLogger.js", () => ({
            auditLogger: { log: vi.fn() },
        }));

        const { default: router } = await import("../server/routes/service-requests.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/admin/service-requests/srv-1/custody-otp/confirm")
            .send({ action: "receive", code: "000000" });

        expect(res.status).toBe(400);
        expect(res.body.remainingAttempts).toBe(1);
        // The attempt is consumed by the atomic claim (UPDATE ... RETURNING),
        // not a separate .update().set(), so the remaining count comes back in
        // the response instead of being asserted on a Drizzle call.
        expect(res.body.remainingAttempts).toBe(1);
    });

    it("confirms correct custody OTP and moves to the target stage", async () => {
        const transitionStage = vi.fn(async () => ({
            serviceRequest: {
                id: "srv-1",
                ticketNumber: "SR-1",
                stage: "device_received",
                trackingStatus: "Device Received",
                customerId: "customer-1",
            },
        }));
        const publishServiceRequestEvent = vi.fn();
        const notifyCustomerUpdate = vi.fn();

        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        /**
         * Finalization now runs inside db.transaction so the advisory lock is
         * actually held for the window — a standalone SELECT released it
         * immediately and serialized nothing. The stub mirrors that: the same
         * execute() backs both the pool and the transaction handle.
         *
         * Call 1 claims the attempt, call 2 settles verified_at, call 3 is the
         * NON-BLOCKING try-lock, call 4 re-reads the issuance under it, and the
         * final call is the completed_at marker, which must return exactly one
         * row or the route refuses to report success.
         */
        let executeCall = 0;
        const execute = vi.fn(async () => {
            executeCall += 1;
            if (executeCall === 1) {
                return { rows: [{ id: "iss-1", code_hash: "hash:123456", attempts: 1, max_attempts: 3 }] };
            }
            if (executeCall === 3) {
                return { rows: [{ acquired: true }] };
            }
            if (executeCall === 4) {
                return {
                    rows: [{
                        verified_at: new Date(), completed_at: null, invalidated_at: null,
                        code_hash: "hash:123456", service_request_id: "srv-1", customer_id: "cust-1",
                        custody_mode: "driver_pickup", action: "receive", custodian_user_id: "admin-1",
                        logistics_task_id: "task-1", live: true,
                    }],
                };
            }
            return { rows: [{ id: "iss-1" }] };
        });
        vi.doMock("../server/db.js", () => ({
            db: {
                execute,
                // The timeline event is written through the transaction handle
                // now, so tx must offer insert() as well as execute().
                transaction: vi.fn(async (fn: any) => fn({
                    execute,
                    insert: vi.fn(() => ({
                        values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: "evt-1" }]) })),
                    })),
                })),
                update: vi.fn(() => ({
                    set: vi.fn(() => ({ where: vi.fn(async () => ({})) })),
                })),
            },
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            jobRepo: {},
            serviceRequestRepo: {
                createServiceRequestEvent: vi.fn(async () => ({})),
                getServiceRequest: vi.fn(async () => ({
                    id: "srv-1",
                    ticketNumber: "SR-1",
                    phone: "01710000000",
                    customerId: "cust-1",
                    servicePreference: "service_center",
                    serviceMode: "service_center",
                    stage: "approved",
                    trackingStatus: "Awaiting Drop-off",
                })),
            },
            userRepo: {
                getUser: vi.fn(async () => ({ id: "admin-1", name: "Manager" })),
            },
            systemRepo: {},
            settingsRepo: {},
            notificationRepo: {},
            pickupRepo: { getPickupScheduleByServiceRequestId: async () => undefined, updatePickupSchedule: async () => undefined },
        }));
        vi.doMock("../server/services/sms.service.js", () => ({
            smsService: {
                normalizePhoneNumber: vi.fn((phone: string) => `88${phone}`),
            },
        }));
        vi.doMock("../server/services/job.service.js", () => ({
            jobService: {
                transitionStage,
            },
        }));
        vi.doMock("../server/services/admin-realtime.service.js", () => ({
            publishJobTicketEvent: vi.fn(),
            publishServiceRequestEvent,
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            notifyAdminUpdate: vi.fn(),
            notifyCustomerUpdate,
        }));
        vi.doMock("../server/utils/auditLogger.js", () => ({
            auditLogger: { log: vi.fn() },
        }));

        const { default: router } = await import("../server/routes/service-requests.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/admin/service-requests/srv-1/custody-otp/confirm")
            .send({ action: "receive", code: "123456" });

        expect(res.status).toBe(200);
        // Same: convergence is completeCustody's responsibility now.
        expect(notifyCustomerUpdate).toHaveBeenCalledWith("customer-1", expect.objectContaining({
            stage: "device_received",
        }));
        expect(publishServiceRequestEvent).toHaveBeenCalledWith(expect.objectContaining({
            action: "status_changed",
            entityId: "srv-1",
        }));
    });
});
