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
        getEffectivePermissionsForUser: () => ({ finance: true, process_payment: true }),
        adminCreateUserSchema: { parse: (value: unknown) => value },
        adminUpdateUserSchema: { parse: (value: unknown) => value },
        getDefaultPermissions: () => ({ finance: true, process_payment: true }),
    };
}

function createApp(router: express.Router) {
    const app = express();
    app.use(express.json());
    app.use(router);
    return app;
}

describe("Phase 3 manual payment verification", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("requires transaction ID for bKash and Nagad send-money payments", async () => {
        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/repositories/index.js", () => ({
            financeRepo: {},
            posRepo: {},
            userRepo: {},
        }));
        vi.doMock("../server/db.js", () => ({
            db: {
                insert: vi.fn(),
            },
        }));
        vi.doMock("../server/services/finance.service.js", () => ({
            financeService: {},
        }));
        vi.doMock("../server/services/job.service.js", () => ({
            jobService: {},
        }));

        const { default: router } = await import("../server/routes/finance.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/manual-payments")
            .send({
                jobTicketId: "job-1",
                method: "bkash_send_money",
                amount: 500,
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain("Transaction ID");
    });

    it("creates pending manual payments linked to a job ticket", async () => {
        const insertedValues: any[] = [];

        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/repositories/index.js", () => ({
            financeRepo: {},
            posRepo: {},
            userRepo: {},
        }));
        vi.doMock("../server/db.js", () => ({
            db: {
                insert: vi.fn(() => ({
                    values: vi.fn((values: any) => {
                        insertedValues.push(values);
                        return {
                            returning: vi.fn(async () => [values]),
                        };
                    }),
                })),
            },
        }));
        vi.doMock("../server/services/finance.service.js", () => ({
            financeService: {},
        }));
        vi.doMock("../server/services/job.service.js", () => ({
            jobService: {},
        }));

        const { default: router } = await import("../server/routes/finance.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/manual-payments")
            .send({
                jobTicketId: "job-1",
                method: "nagad_send_money",
                amount: 750,
                transactionId: "TXN-123",
                senderNumber: "01710000000",
            });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe("pending");
        expect(insertedValues[0]).toMatchObject({
            jobTicketId: "job-1",
            method: "nagad_send_money",
            amount: 750,
            transactionId: "TXN-123",
            status: "pending",
        });
    });

    it("verifies and applies job-linked manual payments to the invoice", async () => {
        const recordJobPayment = vi.fn(async () => ({ id: "job-1", paidAmount: 750 }));
        const updates: any[] = [];
        const payment = {
            id: "pay-1",
            jobTicketId: "job-1",
            dueRecordId: null,
            transactionId: "TXN-123",
            amount: 750,
            method: "bkash_send_money",
            status: "pending",
            verifiedAt: null,
            appliedAt: null,
        };

        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/repositories/index.js", () => ({
            financeRepo: {},
            posRepo: {},
            userRepo: {
                getUser: vi.fn(async () => ({ id: "admin-1", name: "Manager" })),
            },
        }));
        vi.doMock("../server/db.js", () => ({
            db: {
                select: vi.fn(() => ({
                    from: vi.fn(() => ({
                        where: vi.fn(() => ({
                            limit: vi.fn(async () => [payment]),
                        })),
                    })),
                })),
                update: vi.fn(() => ({
                    set: vi.fn((values: any) => {
                        updates.push(values);
                        return {
                            where: vi.fn(() => ({
                                returning: vi.fn(async () => [{ ...payment, ...values }]),
                            })),
                        };
                    }),
                })),
            },
        }));
        vi.doMock("../server/services/finance.service.js", () => ({
            financeService: {
                recordDuePayment: vi.fn(),
            },
        }));
        vi.doMock("../server/services/job.service.js", () => ({
            jobService: {
                recordJobPayment,
            },
        }));

        const { default: router } = await import("../server/routes/finance.routes.js");
        const app = createApp(router);

        const res = await request(app).post("/api/manual-payments/pay-1/verify").send();

        expect(res.status).toBe(200);
        expect(recordJobPayment).toHaveBeenCalledWith("job-1", {
            paymentId: "TXN-123",
            amount: 750,
            method: "bkash_send_money",
        });
        expect(updates[0]).toMatchObject({
            status: "applied_to_invoice",
            verifiedBy: "Manager",
        });
        expect(res.body.payment.status).toBe("applied_to_invoice");
    });

    it("notifies the customer when a submitted payment is verified", async () => {
        const recordJobPayment = vi.fn(async () => ({ id: "job-1", paidAmount: 1000 }));
        const createNotification = vi.fn(async (value: any) => ({ id: "notif-1", ...value }));
        const notifyCustomerUpdate = vi.fn();
        const payment = {
            id: "pay-1",
            source: "customer_submission",
            serviceRequestId: "srv-1",
            jobTicketId: "job-1",
            dueRecordId: null,
            customerPhone: "01710000000",
            transactionId: "TXN-123",
            amount: 1000,
            method: "bkash_send_money",
            status: "pending",
            verifiedAt: null,
            appliedAt: null,
        };

        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/repositories/index.js", () => ({
            financeRepo: {},
            posRepo: {},
            serviceRequestRepo: {
                getServiceRequest: vi.fn(async () => ({
                    id: "srv-1",
                    ticketNumber: "SR-1",
                    customerId: "cust-1",
                })),
            },
            notificationRepo: {
                createNotification,
            },
            userRepo: {
                getUser: vi.fn(async (id: string) => id === "admin-1"
                    ? { id: "admin-1", name: "Manager" }
                    : { id: "cust-1", name: "Customer One", phone: "01710000000" }),
                getUserByPhoneNormalized: vi.fn(),
            },
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            notifyCustomerUpdate,
        }));
        vi.doMock("../server/db.js", () => ({
            db: {
                select: vi.fn(() => ({
                    from: vi.fn(() => ({
                        where: vi.fn(() => ({
                            limit: vi.fn(async () => [payment]),
                        })),
                    })),
                })),
                update: vi.fn(() => ({
                    set: vi.fn((values: any) => ({
                        where: vi.fn(() => ({
                            returning: vi.fn(async () => [{ ...payment, ...values }]),
                        })),
                    })),
                })),
            },
        }));
        vi.doMock("../server/services/finance.service.js", () => ({
            financeService: {
                recordDuePayment: vi.fn(),
            },
        }));
        vi.doMock("../server/services/job.service.js", () => ({
            jobService: {
                recordJobPayment,
            },
        }));

        const { default: router } = await import("../server/routes/finance.routes.js");
        const app = createApp(router);

        const res = await request(app).post("/api/manual-payments/pay-1/verify").send();

        expect(res.status).toBe(200);
        expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
            userId: "cust-1",
            title: "Payment Verified",
            type: "success",
            contextType: "customer_payment",
        }));
        expect(notifyCustomerUpdate).toHaveBeenCalledWith("cust-1", expect.objectContaining({
            type: "payment_verified",
            paymentId: "pay-1",
            serviceRequestId: "srv-1",
            ticketNumber: "SR-1",
            amount: 1000,
        }));
    });

    it("notifies the customer with a reason when a submitted payment is rejected", async () => {
        const createNotification = vi.fn(async (value: any) => ({ id: "notif-1", ...value }));
        const notifyCustomerUpdate = vi.fn();
        const payment = {
            id: "pay-1",
            source: "customer_submission",
            serviceRequestId: "srv-1",
            jobTicketId: "job-1",
            dueRecordId: null,
            customerPhone: "01710000000",
            transactionId: "TXN-123",
            amount: 1000,
            method: "bkash_send_money",
            status: "pending",
        };

        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/repositories/index.js", () => ({
            financeRepo: {},
            posRepo: {},
            serviceRequestRepo: {
                getServiceRequest: vi.fn(async () => ({
                    id: "srv-1",
                    ticketNumber: "SR-1",
                    customerId: "cust-1",
                })),
            },
            notificationRepo: {
                createNotification,
            },
            userRepo: {
                getUser: vi.fn(async (id: string) => id === "admin-1"
                    ? { id: "admin-1", name: "Manager" }
                    : { id: "cust-1", name: "Customer One", phone: "01710000000" }),
                getUserByPhoneNormalized: vi.fn(),
            },
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            notifyCustomerUpdate,
        }));
        vi.doMock("../server/db.js", () => ({
            db: {
                select: vi.fn(() => ({
                    from: vi.fn(() => ({
                        where: vi.fn(() => ({
                            limit: vi.fn(async () => [payment]),
                        })),
                    })),
                })),
                update: vi.fn(() => ({
                    set: vi.fn((values: any) => ({
                        where: vi.fn(() => ({
                            returning: vi.fn(async () => [{ ...payment, ...values }]),
                        })),
                    })),
                })),
            },
        }));
        vi.doMock("../server/services/finance.service.js", () => ({
            financeService: {
                recordDuePayment: vi.fn(),
            },
        }));
        vi.doMock("../server/services/job.service.js", () => ({
            jobService: {
                recordJobPayment: vi.fn(),
            },
        }));

        const { default: router } = await import("../server/routes/finance.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/manual-payments/pay-1/reject")
            .send({ reason: "Transaction ID not found" });

        expect(res.status).toBe(200);
        expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
            userId: "cust-1",
            title: "Payment Rejected",
            type: "warning",
            contextType: "customer_payment",
            message: expect.stringContaining("Transaction ID not found"),
        }));
        expect(notifyCustomerUpdate).toHaveBeenCalledWith("cust-1", expect.objectContaining({
            type: "payment_rejected",
            paymentId: "pay-1",
            serviceRequestId: "srv-1",
            ticketNumber: "SR-1",
            reason: "Transaction ID not found",
        }));
    });

    it("creates customer-submitted payment verification requests", async () => {
        const insertedValues: any[] = [];

        vi.doMock("../server/routes/middleware/auth.js", () => ({
            requireCustomerAuth: (req: any, _res: any, next: () => void) => {
                req.session = req.session || {};
                req.session.customerId = "cust-1";
                next();
            },
            getCustomerId: (req: any) => req.session?.customerId,
            customerLoginSchema: { parse: (value: unknown) => value },
            customerRegisterSchema: { parse: (value: unknown) => value },
            requireAdminAuth: allowAdminRequest(),
            requirePermission: () => allowAdminRequest(),
        }));
        vi.doMock("../server/storage.js", () => ({
            storage: {
                getServiceRequest: vi.fn(async () => ({
                    id: "srv-1",
                    ticketNumber: "SR-1",
                    customerId: "cust-1",
                    convertedJobId: "job-1",
                    customerName: "Customer One",
                    phone: "01710000000",
                })),
                getServiceRequestEvents: vi.fn(async () => []),
                getCustomer: vi.fn(async () => ({ id: "cust-1", phone: "01710000000" })),
            },
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            userRepo: {
                getUser: vi.fn(async () => ({ id: "cust-1", phone: "01710000000" })),
                getUserByPhoneNormalized: vi.fn(),
                createUser: vi.fn(),
                updateUserLastLogin: vi.fn(),
            },
            customerRepo: {},
            orderRepo: {},
            corporateRepo: {},
            notificationRepo: {},
        }));
        vi.doMock("../server/db.js", () => ({
            db: {
                select: vi.fn(() => ({
                    from: vi.fn(() => ({
                        where: vi.fn(() => ({
                            limit: vi.fn(async () => []),
                            orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })),
                        })),
                        orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })),
                    })),
                })),
                insert: vi.fn(() => ({
                    values: vi.fn((values: any) => {
                        insertedValues.push(values);
                        return {
                            returning: vi.fn(async () => [values]),
                        };
                    }),
                })),
            },
        }));
        vi.doMock("../server/services/firebase.js", () => ({
            firebaseAdmin: { auth: () => ({ verifyIdToken: vi.fn() }) },
        }));
        vi.doMock("../server/services/customer.service.js", () => ({
            customerService: {
                linkServiceRequestsByPhone: vi.fn(),
                linkServiceRequestToCustomer: vi.fn(),
            },
        }));
        vi.doMock("../server/routes/middleware/rate-limit.js", () => ({
            authLimiter: (_req: any, _res: any, next: () => void) => next(),
            registrationLimiter: (_req: any, _res: any, next: () => void) => next(),
            serviceRequestLimiter: (_req: any, _res: any, next: () => void) => next(),
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            addCustomerSSEClient: vi.fn(),
            removeCustomerSSEClient: vi.fn(),
            notifyAdminUpdate: vi.fn(),
            notifyCustomerUpdate: vi.fn(),
        }));

        const { default: router } = await import("../server/routes/customer.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/customer/service-requests/srv-1/payment-submissions")
            .send({
                method: "bkash_send_money",
                senderNumber: "01810000000",
                transactionId: "BK12345",
                amount: 1000,
            });

        expect(res.status).toBe(201);
        expect(insertedValues[0]).toMatchObject({
            serviceRequestId: "srv-1",
            jobTicketId: "job-1",
            customerName: "Customer One",
            customerPhone: "01710000000",
            source: "customer_submission",
            status: "pending",
            method: "bkash_send_money",
            senderNumber: "01810000000",
            transactionId: "BK12345",
            amount: 1000,
        });
    });
});
