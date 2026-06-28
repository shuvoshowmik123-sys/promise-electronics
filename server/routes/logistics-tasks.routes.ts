import { Router, Request, Response } from "express";
import { requireAdminAuth, requirePermission } from "./middleware/auth.js";
import { userRepo } from "../repositories/index.js";
import { repairJourneyService } from "../services/customer-repair-journey.service.js";
import {
    createTask,
    createTaskFromServiceRequest,
    createTaskFromJobTicket,
    listTasks,
    getTask,
    updateTask,
    updateTaskStatus,
    assignDriver,
    rescheduleTask,
    cancelTask,
    batchAssign,
    batchReorder,
    type CreateTaskInput,
} from "../services/logistics-task.service.js";

const router = Router();

async function syncLogisticsEventToJourney(
    serviceRequestId: string | null,
    taskType: string,
    eventType: string,
    title: string,
    message: string
) {
    if (!serviceRequestId) return;
    const journeyId = await repairJourneyService.findJourneyByServiceRequest(serviceRequestId);
    if (!journeyId) return;
    await repairJourneyService.addJourneyEvent({
        journeyId,
        eventType,
        title,
        message,
        actorType: "system",
        isCustomerVisible: true,
    });
}

const LOGISTICS_EVENT_MESSAGES: Record<string, (taskType: string) => { title: string; message: string }> = {
    en_route: (taskType) => ({
        title: taskType === "delivery" ? "Delivery On The Way" : "Pickup On The Way",
        message: taskType === "delivery"
            ? "Our team is on the way to deliver your device."
            : "Our team is on the way to pick up your device.",
    }),
    failed: (taskType) => ({
        title: taskType === "delivery" ? "Delivery Attempt Failed" : "Pickup Attempt Failed",
        message: taskType === "delivery"
            ? "We could not complete the delivery attempt. Our team will contact you to reschedule."
            : "We could not complete the pickup attempt. Our team will contact you to reschedule.",
    }),
    cancelled: (_taskType) => ({
        title: "Schedule Cancelled",
        message: "Your pickup/delivery schedule was cancelled. Please contact us if you need help.",
    }),
};

function hasPickupPermission(permissions: unknown): boolean {
    if (!permissions) return false;
    if (typeof permissions === "object") return Boolean((permissions as any).pickup);
    if (typeof permissions === "string") {
        try { return Boolean(JSON.parse(permissions).pickup); } catch { return false; }
    }
    return false;
}

router.get(
    "/api/admin/logistics-tasks/drivers",
    requireAdminAuth,
    requirePermission("pickup"),
    async (_req: Request, res: Response) => {
        try {
            const result = await userRepo.getAllUsers(1, 1000);
            const drivers = result.items
                .filter((u: any) => u.role === "Driver" || hasPickupPermission(u.permissions))
                .map((u: any) => ({ id: u.id, name: u.name, role: u.role }));
            res.json(drivers);
        } catch (error: any) {
            console.error("[Logistics] Drivers list error:", error?.message);
            res.status(500).json({ error: "Failed to fetch drivers" });
        }
    }
);

router.get(
    "/api/admin/logistics-tasks",
    requireAdminAuth,
    requirePermission("pickup"),
    async (req: Request, res: Response) => {
        try {
            const tasks = await listTasks({
                status: req.query.status as string | undefined,
                taskType: req.query.taskType as string | undefined,
                assignedDriverId: req.query.assignedDriverId as string | undefined,
                serviceRequestId: req.query.serviceRequestId as string | undefined,
                jobTicketId: req.query.jobTicketId as string | undefined,
                zone: req.query.zone as string | undefined,
                limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
            });
            res.json(tasks);
        } catch (error: any) {
            console.error("[Logistics] List error:", error?.message);
            res.status(500).json({ error: "Failed to fetch logistics tasks" });
        }
    }
);

router.post(
    "/api/admin/logistics-tasks",
    requireAdminAuth,
    requirePermission("pickup"),
    async (req: Request, res: Response) => {
        try {
            const { fromServiceRequest, fromJobTicket, ...body } = req.body;

            let task;
            if (fromServiceRequest) {
                task = await createTaskFromServiceRequest(
                    fromServiceRequest,
                    body.taskType || "pickup",
                    body
                );
            } else if (fromJobTicket) {
                task = await createTaskFromJobTicket(
                    fromJobTicket,
                    body.taskType || "delivery",
                    body
                );
            } else {
                if (!body.taskType || !body.sourceType || !body.customerName) {
                    return res.status(400).json({
                        error: "taskType, sourceType, and customerName are required for manual task creation",
                    });
                }
                task = await createTask(body as CreateTaskInput);
            }

            res.status(201).json(task);
        } catch (error: any) {
            console.error("[Logistics] Create error:", error?.message);
            res.status(error?.message?.includes("not found") ? 404 : 500).json({
                error: error?.message || "Failed to create logistics task",
            });
        }
    }
);

router.patch(
    "/api/admin/logistics-tasks/:id",
    requireAdminAuth,
    requirePermission("pickup"),
    async (req: Request, res: Response) => {
        try {
            const task = await updateTask(req.params.id, req.body);
            if (!task) {
                return res.status(404).json({ error: "Logistics task not found" });
            }
            res.json(task);
        } catch (error: any) {
            console.error("[Logistics] Update error:", error?.message);
            res.status(500).json({ error: error?.message || "Failed to update logistics task" });
        }
    }
);

router.post(
    "/api/admin/logistics-tasks/:id/status",
    requireAdminAuth,
    requirePermission("pickup"),
    async (req: Request, res: Response) => {
        try {
            const { status, failureReason, notes, proofPhotoUrl, signatureUrl } = req.body;
            if (!status) {
                return res.status(400).json({ error: "status is required" });
            }
            const task = await updateTaskStatus(req.params.id, status, {
                failureReason,
                notes,
                proofPhotoUrl,
                signatureUrl,
            });
            if (!task) {
                return res.status(404).json({ error: "Logistics task not found" });
            }

            if (status === "completed" && task.serviceRequestId && (task.taskType === "pickup" || task.taskType === "delivery")) {
                const journeyStatus = task.taskType === "delivery" ? "Delivered" : "PickedUp";
                repairJourneyService.syncPickupStatusToJourney(task.serviceRequestId, journeyStatus)
                    .catch((err) => console.error("[Logistics] Journey sync failed:", (err as Error).message));
            }

            const eventGen = LOGISTICS_EVENT_MESSAGES[status];
            if (eventGen && task.serviceRequestId) {
                const ev = eventGen(task.taskType);
                syncLogisticsEventToJourney(task.serviceRequestId, task.taskType, `logistics_${status}`, ev.title, ev.message)
                    .catch((err) => console.error("[Logistics] Journey event failed:", (err as Error).message));
            }

            res.json(task);
        } catch (error: any) {
            console.error("[Logistics] Status update error:", error?.message);
            const is400 = error?.message?.includes("Invalid status");
            res.status(is400 ? 400 : 500).json({ error: error?.message || "Failed to update status" });
        }
    }
);

router.post(
    "/api/admin/logistics-tasks/:id/assign",
    requireAdminAuth,
    requirePermission("pickup"),
    async (req: Request, res: Response) => {
        try {
            const { driverId, driverName, zone, routeOrder } = req.body;
            if (!driverId || !driverName) {
                return res.status(400).json({ error: "driverId and driverName are required" });
            }
            const task = await assignDriver(
                req.params.id,
                driverId,
                driverName,
                zone,
                routeOrder ? parseInt(routeOrder, 10) : undefined
            );
            if (!task) {
                return res.status(404).json({ error: "Logistics task not found" });
            }
            res.json(task);
        } catch (error: any) {
            console.error("[Logistics] Assign error:", error?.message);
            res.status(500).json({ error: error?.message || "Failed to assign driver" });
        }
    }
);

router.post(
    "/api/admin/logistics-tasks/:id/reschedule",
    requireAdminAuth,
    requirePermission("pickup"),
    async (req: Request, res: Response) => {
        try {
            const { scheduledDate, timeWindow, reason } = req.body;
            if (!scheduledDate) {
                return res.status(400).json({ error: "scheduledDate is required" });
            }
            const task = await rescheduleTask(req.params.id, scheduledDate, timeWindow, reason);
            if (!task) {
                return res.status(404).json({ error: "Logistics task not found" });
            }

            if (task.serviceRequestId) {
                const label = task.taskType === "delivery" ? "delivery" : "pickup";
                syncLogisticsEventToJourney(task.serviceRequestId, task.taskType, "logistics_rescheduled",
                    "Schedule Updated",
                    `Your ${label} has been rescheduled${timeWindow ? ` to ${timeWindow}` : ""}.`
                ).catch((err) => console.error("[Logistics] Reschedule journey event failed:", (err as Error).message));
            }

            res.json(task);
        } catch (error: any) {
            console.error("[Logistics] Reschedule error:", error?.message);
            res.status(500).json({ error: error?.message || "Failed to reschedule task" });
        }
    }
);

router.post(
    "/api/admin/logistics-tasks/:id/cancel",
    requireAdminAuth,
    requirePermission("pickup"),
    async (req: Request, res: Response) => {
        try {
            const { reason } = req.body;
            const task = await cancelTask(req.params.id, reason);
            if (!task) {
                return res.status(404).json({
                    error: "Logistics task not found or already completed/cancelled",
                });
            }

            if (task.serviceRequestId) {
                const ev = LOGISTICS_EVENT_MESSAGES["cancelled"](task.taskType);
                syncLogisticsEventToJourney(task.serviceRequestId, task.taskType, "logistics_cancelled", ev.title, ev.message)
                    .catch((err) => console.error("[Logistics] Cancel journey event failed:", (err as Error).message));
            }

            res.json(task);
        } catch (error: any) {
            console.error("[Logistics] Cancel error:", error?.message);
            res.status(500).json({ error: error?.message || "Failed to cancel task" });
        }
    }
);

router.post(
    "/api/admin/logistics-tasks/batch-assign",
    requireAdminAuth,
    requirePermission("pickup"),
    async (req: Request, res: Response) => {
        try {
            const { taskIds, driverId, driverName, zone } = req.body;
            if (!Array.isArray(taskIds) || taskIds.length === 0) {
                return res.status(400).json({ error: "taskIds must be a non-empty array" });
            }
            if (!driverId || !driverName) {
                return res.status(400).json({ error: "driverId and driverName are required" });
            }
            const result = await batchAssign(taskIds, driverId, driverName, zone);
            res.json(result);
        } catch (error: any) {
            console.error("[Logistics] Batch assign error:", error?.message);
            res.status(500).json({ error: error?.message || "Failed to batch assign" });
        }
    }
);

router.post(
    "/api/admin/logistics-tasks/batch-reorder",
    requireAdminAuth,
    requirePermission("pickup"),
    async (req: Request, res: Response) => {
        try {
            const { tasks } = req.body;
            if (!Array.isArray(tasks) || tasks.length === 0) {
                return res.status(400).json({ error: "tasks must be a non-empty array" });
            }
            for (const item of tasks) {
                if (!item.id || typeof item.routeOrder !== "number" || item.routeOrder < 1 || !Number.isInteger(item.routeOrder)) {
                    return res.status(400).json({ error: `Each task must have an id and a positive integer routeOrder. Invalid: ${JSON.stringify(item)}` });
                }
            }
            const result = await batchReorder(tasks);
            res.json(result);
        } catch (error: any) {
            console.error("[Logistics] Batch reorder error:", error?.message);
            res.status(500).json({ error: error?.message || "Failed to batch reorder" });
        }
    }
);

export default router;
