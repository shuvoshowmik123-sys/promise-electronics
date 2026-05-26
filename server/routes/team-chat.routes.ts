/**
 * Team Chat Routes (Phase 3)
 * Internal staff messaging — channels + messages.
 *
 * GET  /api/team/channels             — list all channels
 * POST /api/team/channels             — create channel (admin/manager)
 * GET  /api/team/channels/:id/messages — paginated messages (newest last)
 * POST /api/team/channels/:id/messages — post a message
 * DELETE /api/team/messages/:id       — delete own message (admin can delete any)
 *
 * Auth: requireAdminAuth middleware (any logged-in staff)
 */
import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { teamChannels, teamMessages } from "../../shared/schema.js";
import { eq, desc, sql } from "drizzle-orm";
import { requireAdminAuth } from "./middleware/auth.js";
import { randomUUID } from "crypto";

const router = Router();

// ── List channels ──────────────────────────────────────────────────────────
router.get("/api/team/channels", requireAdminAuth, async (req: Request, res: Response) => {
    const channels = await db
        .select()
        .from(teamChannels)
        .orderBy(teamChannels.name);
    res.json(channels);
});

// ── Create channel ─────────────────────────────────────────────────────────
router.post("/api/team/channels", requireAdminAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!["Admin", "Manager", "SuperAdmin"].includes(user?.role)) {
        return res.status(403).json({ message: "Only Admin/Manager can create channels" });
    }

    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Channel name required" });

    const channel = await db
        .insert(teamChannels)
        .values({ id: randomUUID(), name: name.trim(), description: description?.trim() || null, createdBy: user.id })
        .returning()
        .then(r => r[0]);

    res.status(201).json(channel);
});

// ── Get messages in a channel ──────────────────────────────────────────────
router.get("/api/team/channels/:id/messages", requireAdminAuth, async (req: Request, res: Response) => {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const before = req.query.before as string | undefined;

    let query = db
        .select()
        .from(teamMessages)
        .where(eq(teamMessages.channelId, id))
        .orderBy(desc(teamMessages.createdAt))
        .limit(limit);

    if (before) {
        // Cursor pagination by createdAt
        const rows = await db.execute(
            sql`SELECT * FROM team_messages WHERE channel_id = ${id} AND created_at < ${before} ORDER BY created_at DESC LIMIT ${limit}`
        );
        return res.json((rows.rows as any[]).reverse());
    }

    const messages = await query;
    res.json(messages.reverse()); // chronological order
});

// ── Post a message ─────────────────────────────────────────────────────────
router.post("/api/team/channels/:id/messages", requireAdminAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { id } = req.params;
    const { content, attachmentUrl } = req.body;

    if (!content?.trim()) return res.status(400).json({ message: "Message content required" });

    // Verify channel exists
    const channel = await db
        .select({ id: teamChannels.id })
        .from(teamChannels)
        .where(eq(teamChannels.id, id))
        .then(r => r[0]);
    if (!channel) return res.status(404).json({ message: "Channel not found" });

    const message = await db
        .insert(teamMessages)
        .values({
            id: randomUUID(),
            channelId: id,
            senderId: user.id,
            senderName: user.name,
            senderRole: user.role,
            content: content.trim(),
            attachmentUrl: attachmentUrl || null,
        })
        .returning()
        .then(r => r[0]);

    res.status(201).json(message);
});

// ── Delete a message ───────────────────────────────────────────────────────
router.delete("/api/team/messages/:id", requireAdminAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { id } = req.params;

    const msg = await db
        .select({ id: teamMessages.id, senderId: teamMessages.senderId })
        .from(teamMessages)
        .where(eq(teamMessages.id, id))
        .then(r => r[0]);

    if (!msg) return res.status(404).json({ message: "Message not found" });

    const isOwner = msg.senderId === user.id;
    const isAdmin = ["Admin", "SuperAdmin"].includes(user?.role);

    if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: "Cannot delete another user's message" });
    }

    await db.delete(teamMessages).where(eq(teamMessages.id, id));
    res.json({ success: true });
});

export default router;
