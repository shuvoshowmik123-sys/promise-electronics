import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: advance-status -> Completed must stamp completedAt AND warrantyExpiryDate.
 * Before the fix, advance-status wrote { status } only (bypassing completeJobTicket),
 * so normal repairs finished with NULL warranty/completedAt -> every warranty read expired.
 */
function allowAdminRequest() {
    return (req: any, _res: any, next: () => void) => {
        req.session = req.session || {};
        req.session.adminUserId = "admin-1";
        // advance-status requires req.user.id/.role (checked after the auth middleware layer).
        req.user = req.user || { id: "admin-1", name: "Admin", role: "Super Admin" };
        next();
    };
}

function createAuthMock() {
    return {
        requireAdminAuth: allowAdminRequest(),
        requirePermission: () => allowAdminRequest(),
        requireAnyPermission: () => allowAdminRequest(),
        requireGranularPermission: () => allowAdminRequest(),
        requireSuperAdmin: allowAdminRequest(),
    };
}

function createApp(router: express.Router) {
    const app = express();
    app.use(express.json());
    app.use(router);
    return app;
}

describe("job warranty stamp on completion", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("stamps completedAt + warrantyExpiryDate when advancing Ready -> Completed", async () => {
        let capturedPatch: any = null;

        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/repositories/index.js", () => ({
            jobRepo: {
                getJobTicket: vi.fn(async () => ({
                    id: "JOB-1",
                    status: "Ready",
                    warrantyDays: 30,
                    warrantyExpiryDate: null,
                    customerPhone: "01710000000",
                    charges: [],
                })),
                updateJobTicket: vi.fn(async (_id: string, patch: any) => {
                    capturedPatch = patch;
                    return { id: "JOB-1", ...patch };
                }),
            },
            serviceRequestRepo: {},
            userRepo: {},
            attendanceRepo: {},
            systemRepo: {},
            settingsRepo: { getAllSettings: vi.fn(async () => []) },
            notificationRepo: { createNotification: vi.fn() },
        }));
        // db.select().from().where() -> [] (no dirty outside purchases blocking completion)
        // db.transaction: transitionJobStatus runs the whole status change in one tx —
        // (1) locks the job_tickets row, (2) updates it, then projectSurfacesInTx does
        // (3) a service_requests lookup and (4) a customer_repair_journeys lookup, both
        // empty here (no linked SR/journey), so no further writes happen.
        let txExecuteCallCount = 0;
        vi.doMock("../server/db.js", () => ({
            db: {
                select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
                transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => {
                    const tx = {
                        execute: vi.fn(async () => {
                            txExecuteCallCount += 1;
                            if (txExecuteCallCount === 1) {
                                return { rows: [{ id: "JOB-1", status: "Ready" }] };
                            }
                            return { rows: [] };
                        }),
                        update: vi.fn(() => ({
                            set: vi.fn((patch: any) => ({
                                where: vi.fn(() => ({
                                    returning: vi.fn(async () => {
                                        capturedPatch = patch;
                                        return [{
                                            id: "JOB-1",
                                            status: "Ready",
                                            warrantyDays: 30,
                                            warrantyExpiryDate: null,
                                            customerPhone: "01710000000",
                                            charges: [],
                                            ...patch,
                                        }];
                                    }),
                                })),
                            })),
                        })),
                    };
                    return callback(tx);
                }),
            },
        }));
        vi.doMock("../server/utils/auditLogger.js", () => ({ auditLogger: { log: vi.fn() } }));
        vi.doMock("../server/services/admin-realtime.service.js", () => ({
            publishJobTicketEvent: vi.fn(),
            publishAdminNotificationEvent: vi.fn(),
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            notifyAdminUpdate: vi.fn(),
            notifyCustomerUpdate: vi.fn(),
        }));
        vi.doMock("../server/services/job.service.js", () => ({
            jobService: { syncLinkedServiceRequestFromJob: vi.fn(async () => ({ changed: false })) },
        }));
        vi.doMock("../server/brain/kg.service.js", () => ({ logModelCase: vi.fn(async () => {}) }));
        vi.doMock("../server/services/canonical-customer.service.js", () => ({
            logModelCase: vi.fn(),
            recordJobClosed: vi.fn(async () => {}),
            bindCustomerToJob: vi.fn(async () => {}),
        }));
        vi.doMock("../server/storage.js", () => ({ storage: {} }));
        vi.doMock("../server/pushService.js", () => ({ pushService: {} }));

        const { default: router } = await import("../server/routes/jobs.routes.js");
        const app = createApp(router);

        const res = await request(app).post("/api/job-tickets/JOB-1/advance-status");

        expect(res.status).toBe(200);
        expect(capturedPatch).not.toBeNull();
        expect(capturedPatch.status).toBe("Completed");
        expect(capturedPatch.completedAt).toBeInstanceOf(Date);
        expect(capturedPatch.warrantyExpiryDate).toBeInstanceOf(Date);

        // expiry ~= now + 30 days (allow 1 day slack)
        const expectedMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const actualMs = new Date(capturedPatch.warrantyExpiryDate).getTime();
        expect(Math.abs(actualMs - expectedMs)).toBeLessThan(24 * 60 * 60 * 1000);
    });
});
