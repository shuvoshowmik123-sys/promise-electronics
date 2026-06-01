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
        requireSuperAdmin: allowAdminRequest(),
        getEffectivePermissionsForUser: () => ({ serviceRequests: true }),
        adminCreateUserSchema: { parse: (value: unknown) => value },
        adminUpdateUserSchema: { parse: (value: unknown) => value },
        getDefaultPermissions: () => ({ serviceRequests: true }),
    };
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
            notificationRepo: {},
        }));
        vi.doMock("../server/services/sms.service.js", () => ({
            smsService: {
                normalizePhoneNumber: vi.fn((phone: string) => `88${phone}`),
                isValidBangladeshPhone: vi.fn(() => true),
                generateOtpCode: vi.fn(() => "123456"),
                sendSms,
            },
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
        expect(insertedValues[0]).toEqual(expect.objectContaining({
            phone: "8801710000000",
            purpose: "custody_receive:srv-1",
            codeHash: hashOtp("123456"),
        }));
        expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({
            to: "8801710000000",
            message: expect.stringContaining("123456"),
        }));
        expect(createServiceRequestEvent).toHaveBeenCalledWith(expect.objectContaining({
            serviceRequestId: "srv-1",
        }));
    });

    it("rejects wrong custody OTP and increments attempts", async () => {
        const updateSet = vi.fn(() => ({ where: vi.fn(async () => ({})) }));

        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/db.js", () => ({
            db: {
                select: vi.fn(() => ({
                    from: vi.fn(() => ({
                        where: vi.fn(() => ({
                            orderBy: vi.fn(() => ({
                                limit: vi.fn(async () => ([{
                                    id: "otp-1",
                                    phone: "8801710000000",
                                    purpose: "custody_receive:srv-1",
                                    codeHash: hashOtp("123456"),
                                    attempts: 1,
                                    maxAttempts: 3,
                                    verifiedAt: null,
                                }])),
                            })),
                        })),
                    })),
                })),
                update: vi.fn(() => ({ set: updateSet })),
            },
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            jobRepo: {},
            serviceRequestRepo: {
                getServiceRequest: vi.fn(async () => ({
                    id: "srv-1",
                    phone: "01710000000",
                    servicePreference: "service_center",
                    serviceMode: "service_center",
                })),
            },
            userRepo: {},
            systemRepo: {},
            settingsRepo: {},
            notificationRepo: {},
        }));
        vi.doMock("../server/services/sms.service.js", () => ({
            smsService: {
                normalizePhoneNumber: vi.fn((phone: string) => `88${phone}`),
            },
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
            .post("/api/admin/service-requests/srv-1/custody-otp/confirm")
            .send({ action: "receive", code: "000000" });

        expect(res.status).toBe(400);
        expect(res.body.remainingAttempts).toBe(1);
        expect(updateSet).toHaveBeenCalledWith({ attempts: 2 });
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
        vi.doMock("../server/db.js", () => ({
            db: {
                select: vi.fn(() => ({
                    from: vi.fn(() => ({
                        where: vi.fn(() => ({
                            orderBy: vi.fn(() => ({
                                limit: vi.fn(async () => ([{
                                    id: "otp-1",
                                    phone: "8801710000000",
                                    purpose: "custody_receive:srv-1",
                                    codeHash: hashOtp("123456"),
                                    attempts: 0,
                                    maxAttempts: 3,
                                    verifiedAt: null,
                                }])),
                            })),
                        })),
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
                getServiceRequest: vi.fn(async () => ({
                    id: "srv-1",
                    ticketNumber: "SR-1",
                    phone: "01710000000",
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
        expect(transitionStage).toHaveBeenCalledWith("srv-1", "device_received", "Manager");
        expect(notifyCustomerUpdate).toHaveBeenCalledWith("customer-1", expect.objectContaining({
            stage: "device_received",
        }));
        expect(publishServiceRequestEvent).toHaveBeenCalledWith(expect.objectContaining({
            action: "status_changed",
            entityId: "srv-1",
        }));
    });
});
