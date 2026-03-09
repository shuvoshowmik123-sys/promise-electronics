
import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";

const router = Router();

// Create an approval request
const createApprovalRequestSchema = z.object({
    type: z.enum(['company_claim_change', 'status_override', 'refund_request']),
    requestedBy: z.string(),
    requestedByName: z.string().optional(),
    jobId: z.string().optional(),
    jobNumber: z.string().optional(),
    oldValue: z.string().optional(),
    newValue: z.string().optional(),
});

router.post("/request", async (req, res) => {
    try {
        const data = createApprovalRequestSchema.parse(req.body);
        const approval = await storage.createApprovalRequest(data);
        res.status(201).json(approval);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid input", errors: error.errors });
        } else {
            res.status(500).json({ message: (error as Error).message });
        }
    }
});

// Get pending approvals (for Super Admin notification bell)
router.get("/pending", async (req, res) => {
    try {
        const approvals = await storage.getPendingApprovals();
        res.json(approvals);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch pending approvals" });
    }
});

// Get my rejected requests (for User notification)
router.get("/my-requests", async (req, res) => {
    try {
        const userId = req.query.userId as string;
        if (!userId) {
            return res.status(400).json({ message: "userId is required" });
        }
        const requests = await storage.getUserApprovalRequests(userId);
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch requests" });
    }
});

// Approve a request
router.post("/:id/approve", async (req, res) => {
    try {
        const { reviewedBy } = req.body;
        if (!reviewedBy) {
            return res.status(400).json({ message: "reviewedBy is required" });
        }

        const approval = await storage.approveRequest(req.params.id, reviewedBy);
        if (!approval) {
            return res.status(404).json({ message: "Approval request not found" });
        }

        res.json({ success: true, approval });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
});

// Reject a request
router.post("/:id/reject", async (req, res) => {
    try {
        const { reviewedBy, reason } = req.body;
        if (!reviewedBy) {
            return res.status(400).json({ message: "reviewedBy is required" });
        }

        const approval = await storage.rejectRequest(req.params.id, reviewedBy, reason);
        if (!approval) {
            return res.status(404).json({ message: "Approval request not found" });
        }

        res.json({ success: true, approval });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
});

// Get count of pending approvals (for badge)
router.get("/pending/count", async (req, res) => {
    try {
        const count = await storage.getPendingApprovalCount();
        res.json({ count });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch count" });
    }
});

export default router;
