import { Router, Request, Response } from "express";
import { requireAdminAuth, requirePermission, requireSuperAdmin } from "./middleware/auth.js";
import { auditLogger } from "../utils/auditLogger.js";
import {
    createStaffInvite,
    listStaffInvites,
    getStaffInviteByToken,
    getStaffInviteById,
    acceptStaffInvite,
    revokeStaffInvite,
    regenerateStaffInvite,
    getDefaultInviteExpiryMinutes,
} from "../services/staff-invite.service.js";

const router = Router();

router.get("/api/admin/staff-invites", requireAdminAuth, requirePermission("users"), async (_req: Request, res: Response) => {
    try {
        const invites = await listStaffInvites(100);
        res.json(invites);
    } catch (error: any) {
        console.error("[StaffInvite] List error:", error?.message);
        res.status(500).json({ error: "Failed to fetch invites" });
    }
});

router.post("/api/admin/staff-invites", requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { role, permissions, phone, email, note, expiresInMinutes } = req.body;
        if (!role) return res.status(400).json({ error: "role is required" });

        const result = await createStaffInvite({
            role,
            permissions: permissions || "{}",
            phone: phone || null,
            email: email || null,
            note: note || null,
            createdBy: req.session.adminUserId!,
            expiresInMinutes,
        });

        await auditLogger.log({
            userId: req.session.adminUserId!,
            action: "CREATE_STAFF_INVITE",
            entity: "StaffInvitation",
            entityId: result.invite.id,
            details: `Created ${role} setup link${phone ? ` for ${phone}` : ""}`,
            req,
        }).catch(() => {});

        res.status(201).json(result);
    } catch (error: any) {
        console.error("[StaffInvite] Create error:", error?.message);
        res.status(400).json({ error: error?.message || "Failed to create invite" });
    }
});

router.post("/api/admin/staff-invites/:id/revoke", requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const revoked = await revokeStaffInvite(req.params.id);
        if (!revoked) return res.status(404).json({ error: "Invite not found or already used/revoked" });

        await auditLogger.log({
            userId: req.session.adminUserId!,
            action: "REVOKE_STAFF_INVITE",
            entity: "StaffInvitation",
            entityId: req.params.id,
            details: "Staff setup link revoked",
            req,
        }).catch(() => {});

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: "Failed to revoke invite" });
    }
});

router.post("/api/admin/staff-invites/:id/regenerate", requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const result = await regenerateStaffInvite(req.params.id, req.session.adminUserId!, req.body?.expiresInMinutes);
        if (!result) return res.status(404).json({ error: "Original invite not found or already accepted" });

        await auditLogger.log({
            userId: req.session.adminUserId!,
            action: "REGENERATE_STAFF_INVITE",
            entity: "StaffInvitation",
            entityId: result.invite.id,
            details: `Regenerated from ${req.params.id}`,
            req,
        }).catch(() => {});

        res.status(201).json(result);
    } catch (error: any) {
        console.error("[StaffInvite] Regenerate error:", error?.message);
        res.status(400).json({ error: error?.message || "Failed to regenerate invite" });
    }
});

// Public setup routes (no admin auth required)
router.get("/api/admin/staff-invites/setup/:token", async (req: Request, res: Response) => {
    try {
        const invite = await getStaffInviteByToken(req.params.token);
        if (!invite) return res.status(404).json({ error: "Setup link not found or invalid.", status: "invalid" });

        const expired = new Date(invite.expiresAt) < new Date();
        if (invite.status !== "pending") {
            const message = invite.status === "failed"
                ? "This setup link was already attempted. Please ask your admin to generate a new one."
                : `This setup link has been ${invite.status}.`;
            return res.json({ role: invite.role, status: invite.status, expired: true, message });
        }
        if (expired) {
            return res.json({ role: invite.role, status: "expired", expired: true, message: "This setup link has expired. Please ask your admin to generate a new one." });
        }

        res.json({
            role: invite.role,
            phone: invite.phone,
            email: invite.email,
            note: invite.note,
            status: "pending",
            expired: false,
            expiresAt: invite.expiresAt,
            expiresInMinutes: Math.max(1, Math.round((new Date(invite.expiresAt).getTime() - new Date(invite.createdAt).getTime()) / 60000)) || getDefaultInviteExpiryMinutes(),
        });
    } catch (error: any) {
        res.status(500).json({ error: "Failed to load setup link" });
    }
});

router.post("/api/admin/staff-invites/setup/:token", async (req: Request, res: Response) => {
    try {
        const { name, username, password, phone, email } = req.body;
        if (!name || !username || !password) {
            return res.status(400).json({ error: "Name, username, and password are required." });
        }
        if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
        if (username.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters." });

        const result = await acceptStaffInvite(req.params.token, { name, username, password, phone, email });

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        await auditLogger.log({
            userId: result.userId!,
            action: "ACCEPT_STAFF_INVITE",
            entity: "StaffInvitation",
            entityId: result.userId!,
            details: `Staff setup completed. Username: ${username}`,
        }).catch(() => {});

        res.json({ success: true, message: "Account created successfully. You can now log in." });
    } catch (error: any) {
        console.error("[StaffInvite] Accept error:", error?.message);
        res.status(500).json({ error: "Failed to complete setup" });
    }
});

export default router;
