import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createSqlMock() {
    const sqlMock = ((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })) as any;
    sqlMock.join = (values: unknown[]) => values;
    return sqlMock;
}

describe("repository compatibility fallbacks", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("falls back to raw SQL for job tickets when a new column is missing", async () => {
        const missingColumnError = new Error('column "assigned_technician_id" does not exist');
        const execute = vi.fn(async () => ({
            rows: [
                {
                    id: "JOB-2026-0001",
                    customer: "Legacy Customer",
                    device: "Legacy TV",
                    status: "Pending",
                    created_at: "2026-03-12T00:00:00.000Z",
                },
            ],
        }));

        vi.doMock("../server/repositories/base.js", () => ({
            db: {
                select: vi.fn(() => ({
                    from: vi.fn(() => ({
                        orderBy: vi.fn(() => {
                            throw missingColumnError;
                        }),
                    })),
                })),
                execute,
            },
            nanoid: vi.fn(),
            eq: vi.fn(),
            desc: vi.fn((value) => value),
            like: vi.fn(),
            or: vi.fn(),
            sql: createSqlMock(),
            schema: {
                jobTickets: {
                    createdAt: "created_at",
                },
            },
        }));

        const { getAllJobTickets } = await import("../server/repositories/job.repository.js");
        const jobs = await getAllJobTickets();

        expect(execute).toHaveBeenCalledOnce();
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({
            id: "JOB-2026-0001",
            customer: "Legacy Customer",
            status: "Pending",
            paymentStatus: "unpaid",
            billingStatus: "pending",
        });
    });

    it("falls back to raw SQL for service requests when a new column is missing", async () => {
        const missingColumnError = new Error('column "tracking_status" does not exist');
        const execute = vi.fn(async () => ({
            rows: [
                {
                    id: "srv-1",
                    brand: "Sony",
                    primary_issue: "No display",
                    customer_name: "Legacy Customer",
                    phone: "01710000000",
                    status: "Pending",
                    created_at: "2026-03-12T00:00:00.000Z",
                },
            ],
        }));

        vi.doMock("../server/repositories/base.js", () => ({
            db: {
                select: vi.fn(() => ({
                    from: vi.fn(() => ({
                        orderBy: vi.fn(() => {
                            throw missingColumnError;
                        }),
                    })),
                })),
                execute,
            },
            nanoid: vi.fn(),
            eq: vi.fn(),
            desc: vi.fn((value) => value),
            like: vi.fn(),
            isNull: vi.fn(),
            and: vi.fn(),
            lt: vi.fn(),
            sql: createSqlMock(),
            schema: {
                serviceRequests: {
                    createdAt: "created_at",
                },
            },
        }));

        const { getAllServiceRequests } = await import("../server/repositories/service-request.repository.js");
        const requests = await getAllServiceRequests();

        expect(execute).toHaveBeenCalledOnce();
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            id: "srv-1",
            brand: "Sony",
            primaryIssue: "No display",
            customerName: "Legacy Customer",
            trackingStatus: "Request Received",
            adminInteracted: false,
        });
    });
});
