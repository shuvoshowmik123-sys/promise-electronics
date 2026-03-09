
import { Router } from "express";
import { db } from "../db";
import { corporateMessageThreads, corporateMessages, corporateClients, users, InsertCorporateMessage } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAdminAuth } from "./middleware/auth.js";
import { nanoid } from "nanoid";
import { notifyCorporateClient } from "./middleware/sse-broker.js";

const router = Router();

// Middleware to check permissions
const checkMessagePermission = (req: any, res: any, next: any) => {
    // Only Super Admin and Manager should access this for now
    if (req.user && ["Super Admin", "Manager"].includes(req.user.role)) {
        return next();
    }
    return res.status(403).json({ error: "Unauthorized access to corporate messages" });
};

// GET /api/admin/corporate-messages/threads
// Get all threads with client details and unread count
router.get("/threads", requireAdminAuth, checkMessagePermission, async (req, res) => {
    try {
        const threads = await db
            .select({
                id: corporateMessageThreads.id,
                subject: corporateMessageThreads.subject,
                status: corporateMessageThreads.status,
                lastMessageAt: corporateMessageThreads.lastMessageAt,
                createdAt: corporateMessageThreads.createdAt,
                corporateClientId: corporateMessageThreads.corporateClientId,
                clientName: corporateClients.companyName,
                // Get last message snippet
                lastMessageSnippet: sql<string>`
                    (SELECT substring(${corporateMessages.content} from 1 for 50) FROM ${corporateMessages}
                     WHERE ${corporateMessages.threadId} = ${corporateMessageThreads.id}
                     ORDER BY ${corporateMessages.createdAt} DESC LIMIT 1)`,
                // Calculate unread count (messages from 'corporate' that are not read)
                unreadCount: sql<number>`
                    (SELECT count(*) FROM ${corporateMessages} 
                     WHERE ${corporateMessages.threadId} = ${corporateMessageThreads.id} 
                     AND ${corporateMessages.senderType} = 'corporate' 
                     AND ${corporateMessages.isRead} = false)::int`
            })
            .from(corporateMessageThreads)
            .leftJoin(corporateClients, eq(corporateMessageThreads.corporateClientId, corporateClients.id))
            .orderBy(desc(corporateMessageThreads.lastMessageAt));



        res.json(threads);
    } catch (error) {
        console.error("Error fetching admin threads:", error);
        res.status(500).json({ error: "Failed to fetch threads", details: String(error) });
    }
});

// GET /api/admin/corporate-messages/threads/:threadId
// Get thread details and messages
router.get("/threads/:threadId", requireAdminAuth, checkMessagePermission, async (req, res) => {
    try {
        const { threadId } = req.params;

        // Fetch thread details
        const thread = await db
            .select({
                id: corporateMessageThreads.id,
                subject: corporateMessageThreads.subject,
                status: corporateMessageThreads.status,
                lastMessageAt: corporateMessageThreads.lastMessageAt,
                createdAt: corporateMessageThreads.createdAt,
                corporateClientId: corporateMessageThreads.corporateClientId,
                clientName: corporateClients.companyName,
            })
            .from(corporateMessageThreads)
            .leftJoin(corporateClients, eq(corporateMessageThreads.corporateClientId, corporateClients.id))
            .where(eq(corporateMessageThreads.id, threadId))
            .limit(1);

        if (!thread.length) {
            return res.status(404).json({ error: "Thread not found" });
        }

        // Fetch messages
        const messages = await db
            .select({
                id: corporateMessages.id,
                content: corporateMessages.content,
                senderId: corporateMessages.senderId,
                senderType: corporateMessages.senderType,
                messageType: corporateMessages.messageType,
                attachments: corporateMessages.attachments,
                createdAt: corporateMessages.createdAt,
                isRead: corporateMessages.isRead,
                senderName: users.name, // Will be null for corporate users joined with 'users' table optionally? 
                // Actually corporate users are in 'users' table too usually, 
                // or if not we might need another join or handle it on frontend.
                // For now let's try to get name if possible.
            })
            .from(corporateMessages)
            .leftJoin(users, eq(corporateMessages.senderId, users.id))
            .where(eq(corporateMessages.threadId, threadId))
            .orderBy(corporateMessages.createdAt);

        // Mark unread corporate messages as read (since admin viewed it)
        await db
            .update(corporateMessages)
            .set({ isRead: true })
            .where(
                and(
                    eq(corporateMessages.threadId, threadId),
                    eq(corporateMessages.senderType, 'corporate'),
                    eq(corporateMessages.isRead, false)
                )
            );

        res.json({ ...thread[0], messages });
    } catch (error) {
        console.error("Error fetching admin thread details:", error);
        res.status(500).json({ error: "Failed to fetch thread details" });
    }
});

// POST /api/admin/corporate-messages/threads/:threadId/reply
// Admin replies to a thread
router.post("/threads/:threadId/reply", requireAdminAuth, checkMessagePermission, async (req, res) => {
    try {
        const { threadId } = req.params;
        const { content, messageType = "text", attachments } = req.body;

        if (!req.user?.id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const senderId = req.user.id;

        const newMessage = await db.transaction(async (tx) => {
            // Create message
            const [message] = await tx
                .insert(corporateMessages)
                .values({
                    id: nanoid(),
                    threadId,
                    senderId,
                    senderType: 'admin',
                    content,
                    messageType,
                    attachments,

                    isRead: false,
                })
                .returning();

            // Update thread timestamp and status if needed (re-open if closed?)
            // Let's keep status as is unless explicitly changed, but update timestamp
            await tx
                .update(corporateMessageThreads)
                .set({ lastMessageAt: new Date() })
                .where(eq(corporateMessageThreads.id, threadId));

            // Get client ID to notify 
            const [thread] = await tx
                .select({ corporateClientId: corporateMessageThreads.corporateClientId })
                .from(corporateMessageThreads)
                .where(eq(corporateMessageThreads.id, threadId));

            if (thread?.corporateClientId) {
                notifyCorporateClient(thread.corporateClientId, {
                    message: message
                }, 'chat_message');
            }

            return message;
        });

        res.json(newMessage);
    } catch (error) {
        console.error("Error sending admin reply:", error);
        res.status(500).json({ error: "Failed to send reply" });
    }
});

// PATCH /api/admin/corporate-messages/threads/:threadId/mark-read
// Manually mark thread as read
router.patch("/threads/:threadId/mark-read", requireAdminAuth, checkMessagePermission, async (req, res) => {
    try {
        const { threadId } = req.params;

        await db
            .update(corporateMessages)
            .set({ isRead: true })
            .where(
                and(
                    eq(corporateMessages.threadId, threadId),
                    eq(corporateMessages.senderType, 'corporate'),
                    eq(corporateMessages.isRead, false)
                )
            );

        res.json({ success: true });
    } catch (error) {
        console.error("Error marking thread as read:", error);
        res.status(500).json({ error: "Failed to mark as read" });
    }
});

// PATCH /api/admin/corporate-messages/threads/:threadId/status
// Update thread status
router.patch("/threads/:threadId/status", requireAdminAuth, checkMessagePermission, async (req, res) => {
    try {
        const { threadId } = req.params;
        const { status } = req.body;

        if (!['open', 'closed', 'archived'].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        const [updatedThread] = await db
            .update(corporateMessageThreads)
            .set({ status })
            .where(eq(corporateMessageThreads.id, threadId))
            .returning();

        res.json(updatedThread);
    } catch (error) {
        console.error("Error updating thread status:", error);
        res.status(500).json({ error: "Failed to update status" });
    }
});

export default router;
