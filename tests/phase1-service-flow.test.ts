import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Phase 1 service request to job flow", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("blocks job creation before physical custody is confirmed", async () => {
        const insert = vi.fn();
        const update = vi.fn();
        const getServiceRequest = vi.fn(async () => ({
            id: "srv-1",
            customerName: "Rahim",
            phone: "01710000000",
            address: "Dhaka",
            brand: "Samsung",
            modelNumber: "UA43",
            primaryIssue: "No display",
            screenSize: "43 inch",
            status: "Approved",
            stage: "authorized",
            servicePreference: "home_pickup",
            serviceMode: "pickup",
            trackingStatus: "Booked",
            convertedJobId: null,
        }));

        vi.doMock("../server/db.js", () => ({
            db: { insert, update },
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            inventoryRepo: {},
            jobRepo: {
                getNextJobNumber: vi.fn(async () => "JOB-1"),
            },
            serviceRequestRepo: {
                getServiceRequest,
            },
        }));

        const { jobService } = await import("../server/services/job.service.js");

        await expect(jobService.verifyAndConvertServiceRequest("srv-1", "Manager"))
            .rejects
            .toThrow("Device custody must be confirmed before creating a job ticket");

        expect(insert).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it("projects linked service request status from job status", async () => {
        const updateServiceRequest = vi.fn(async (_id: string, updates: any) => ({
            id: "srv-1",
            customerId: "customer-1",
            status: updates.status,
            trackingStatus: updates.trackingStatus,
        }));
        const createServiceRequestEvent = vi.fn(async (event: any) => event);

        vi.doMock("../server/db.js", () => ({
            db: {},
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            inventoryRepo: {},
            jobRepo: {
                getJobTicket: vi.fn(async () => ({
                    id: "JOB-1",
                    status: "Ready",
                    technician: "Tech A",
                })),
            },
            serviceRequestRepo: {
                getServiceRequestByConvertedJobId: vi.fn(async () => ({
                    id: "srv-1",
                    customerId: "customer-1",
                    status: "Work Order",
                    trackingStatus: "Repairing",
                    servicePreference: "home_pickup",
                    serviceMode: "pickup",
                })),
                updateServiceRequest,
                createServiceRequestEvent,
            },
        }));

        const { jobService } = await import("../server/services/job.service.js");
        const result = await jobService.syncLinkedServiceRequestFromJob("JOB-1", "Test Projection");

        expect(result.changed).toBe(true);
        expect(updateServiceRequest).toHaveBeenCalledWith("srv-1", {
            trackingStatus: "Ready for Return",
        });
        expect(createServiceRequestEvent).toHaveBeenCalledWith(expect.objectContaining({
            serviceRequestId: "srv-1",
            status: "Ready for Return",
            actor: "Test Projection",
        }));
    });
});
