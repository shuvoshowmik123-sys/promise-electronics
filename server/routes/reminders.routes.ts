/**
 * Reminders Routes (Phase 3)
 *
 * GET  /api/reminders            — list reminders for current user (+ all if Admin/Manager)
 * POST /api/reminders            — create reminder
 * PATCH /api/reminders/:id/dismiss — dismiss (user or admin)
 * DELETE /api/reminders/:id      — delete (admin or creator)
 */
import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { reminders } from "../../shared/schema.js";
import { eq, and, or, desc } from "drizzle-orm";
import { requireAdminAuth } from "./middleware/auth.js";
import { randomUUID } from "crypto";
import { emitReminderChanged, offReminderChanged, onReminderChanged, ReminderChangedEvent } from "../services/reminder.service.js";

const router = Router();

router.get("/api/reminders/events", requireAdminAuth, (req: Request, res: Response) => {
    const user = (req as any).user;
    const userId = user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    const listener = (event: ReminderChangedEvent) => {
        if (event.userId !== userId) return;
        res.write(`event: reminder.changed\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    onReminderChanged(listener);

    const heartbeat = setInterval(() => {
        res.write(": ping\n\n");
    }, 25000);

    req.on("close", () => {
        clearInterval(heartbeat);
        offReminderChanged(listener);
    });
});

// ── List ───────────────────────────────────────────────────────────────────
router.get("/api/reminders", requireAdminAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const isPrivileged = ["Admin", "Manager", "SuperAdmin"].includes(user?.role);

    // Privileged users can query any user_id, others only see their own
    const targetUserId = (isPrivileged && req.query.userId)
        ? (req.query.userId as string)
        : user.id;

    const rows = await db
        .select()
        .from(reminders)
        .where(eq(reminders.userId, targetUserId))
        .orderBy(desc(reminders.remindAt));

    res.json(rows);
});

// ── Create ─────────────────────────────────────────────────────────────────
router.post("/api/reminders", requireAdminAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { title, body, remindAt, repeat, jobId, userId } = req.body;

    if (!title?.trim()) return res.status(400).json({ message: "Title required" });
    if (!remindAt) return res.status(400).json({ message: "remindAt required" });

    const targetUserId = userId || user.id;

    // Only Admin/Manager can set reminders for other users
    if (targetUserId !== user.id && !["Admin", "Manager", "SuperAdmin"].includes(user?.role)) {
        return res.status(403).json({ message: "Cannot set reminders for other users" });
    }

    const reminder = await db
        .insert(reminders)
        .values({
            id: randomUUID(),
            userId: targetUserId,
            createdBy: user.id,
            title: title.trim(),
            body: body?.trim() || null,
            remindAt: new Date(remindAt),
            repeat: repeat || null,
            jobId: jobId || null,
        })
        .returning()
        .then(r => r[0]);

    emitReminderChanged({ type: "created", userId: reminder.userId, reminderId: reminder.id });
    res.status(201).json(reminder);
});

// ── Dismiss ────────────────────────────────────────────────────────────────
router.patch("/api/reminders/:id/dismiss", requireAdminAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { id } = req.params;

    const reminder = await db
        .select()
        .from(reminders)
        .where(eq(reminders.id, id))
        .then(r => r[0]);

    if (!reminder) return res.status(404).json({ message: "Not found" });

    const canDismiss =
        reminder.userId === user.id ||
        ["Admin", "Manager", "SuperAdmin"].includes(user?.role);

    if (!canDismiss) return res.status(403).json({ message: "Forbidden" });

    const updated = await db
        .update(reminders)
        .set({ isDismissed: true, dismissedAt: new Date() })
        .where(eq(reminders.id, id))
        .returning()
        .then(r => r[0]);

    emitReminderChanged({ type: "dismissed", userId: updated.userId, reminderId: updated.id });
    res.json(updated);
});

// ── Delete ─────────────────────────────────────────────────────────────────
router.delete("/api/reminders/:id", requireAdminAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { id } = req.params;

    const reminder = await db
        .select({ createdBy: reminders.createdBy, userId: reminders.userId })
        .from(reminders)
        .where(eq(reminders.id, id))
        .then(r => r[0]);

    if (!reminder) return res.status(404).json({ message: "Not found" });

    const canDelete =
        reminder.createdBy === user.id ||
        ["Admin", "SuperAdmin"].includes(user?.role);

    if (!canDelete) return res.status(403).json({ message: "Forbidden" });

    await db.delete(reminders).where(eq(reminders.id, id));
    emitReminderChanged({ type: "deleted", userId: reminder.userId, reminderId: id });
    res.json({ success: true });
});

export default router;
