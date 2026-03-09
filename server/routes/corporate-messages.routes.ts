import { Router } from "express";
import { storage } from "../storage.js";
import { requireCorporateAuth } from "./middleware/auth.js";
import { insertCorporateMessageThreadSchema, insertCorporateMessageSchema } from "../../shared/schema.js";
import { notifyCorporateClient, notifyAdminUpdate } from "./middleware/sse-broker.js";
import { z } from "zod";

const router = Router();

// Get all threads for the logged-in corporate client
router.get("/messages/threads", requireCorporateAuth, async (req, res) => {
    try {
        const user = req.user as any;
        const clientId = user?.corporateClientId;
        if (!clientId) return res.status(403).json({ message: "Invalid corporate account" });
        const threads = await storage.getCorporateMessageThreads(clientId);
        res.json(threads);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// Start a new thread
router.post("/messages/threads", requireCorporateAuth, async (req, res) => {
    try {
        const user = req.user as any;
        const clientId = user?.corporateClientId;
        if (!clientId) return res.status(403).json({ message: "Invalid corporate account" });
        const parsed = insertCorporateMessageThreadSchema.safeParse({
            ...req.body,
            corporateClientId: clientId,
        });

        if (!parsed.success) {
            return res.status(400).json({ message: "Invalid thread data", errors: parsed.error.errors });
        }

        const thread = await storage.createCorporateMessageThread(parsed.data);
        res.status(201).json(thread);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// Get messages for a thread (and mark as read for corporate)
router.get("/messages/threads/:threadId", requireCorporateAuth, async (req, res) => {
    try {
        const user = req.user as any;
        const clientId = user?.corporateClientId;
        if (!clientId) return res.status(403).json({ message: "Invalid corporate account" });
        const threadId = req.params.threadId;

        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const before = req.query.before ? new Date(req.query.before as string) : undefined;

        const thread = await storage.getCorporateMessageThread(threadId);
        if (!thread || thread.corporateClientId !== clientId) {
            return res.status(404).json({ message: "Thread not found" });
        }

        const messages = await storage.getCorporateMessages(threadId, limit, before);

        // Mark messages as read for corporate recipient (only if fetching latest)
        if (!before) {
            await storage.markCorporateMessagesAsRead(threadId, "corporate");
        }

        res.json(messages);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// Send a message in a thread
router.post("/messages/threads/:threadId", requireCorporateAuth, async (req, res) => {
    try {
        const user = req.user as any;
        const clientId = user?.corporateClientId;
        if (!clientId) return res.status(403).json({ message: "Invalid corporate account" });
        const threadId = req.params.threadId;
        const userId = user.id;

        const thread = await storage.getCorporateMessageThread(threadId);
        if (!thread || thread.corporateClientId !== clientId) {
            return res.status(404).json({ message: "Thread not found" });
        }

        const parsed = insertCorporateMessageSchema.safeParse({
            ...req.body,
            threadId,
            senderId: userId,
            senderType: "corporate",
        });

        if (!parsed.success) {
            return res.status(400).json({ message: "Invalid message data", errors: parsed.error.errors });
        }

        const message = await storage.createCorporateMessage(parsed.data);

        // Update thread status to 'open' if it was closed
        if (thread.status !== "open") {
            await storage.updateCorporateMessageThread(threadId, { status: "open" });
        }

        // Notify admins
        notifyAdminUpdate({
            type: 'corporate_message',
            data: {
                message,
                threadId,
                clientId,
                clientName: user.name, // Or fetch company name if needed
            }
        });

        // Notify the corporate client themselves (for other tabs/devices)
        // Notify the corporate client themselves (for other tabs/devices)
        notifyCorporateClient(clientId, {
            message: message
        }, 'chat_message');

        res.status(201).json(message);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// Get unread message count
router.get("/messages/unread-count", requireCorporateAuth, async (req, res) => {
    try {
        const user = req.user as any;
        const clientId = user?.corporateClientId;
        if (!clientId) return res.status(403).json({ message: "Invalid corporate account" });
        const count = await storage.getUnreadMessageCount(clientId, "corporate");
        res.json({ count });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

// Get or create default thread (for simplified UI)
router.get("/messages/default-thread", requireCorporateAuth, async (req, res) => {
    try {
        const user = req.user as any;
        const clientId = user?.corporateClientId;
        if (!clientId) return res.status(403).json({ message: "Invalid corporate account" });

        // Get existing threads
        const threads = await storage.getCorporateMessageThreads(clientId);

        if (threads.length > 0) {
            // Return the most recently active thread (storage.getCorporateMessageThreads sorts by desc lastMessageAt)
            return res.json(threads[0]);
        }

        // Create default thread if none exists
        const thread = await storage.createCorporateMessageThread({
            corporateClientId: clientId,
            subject: "Support Chat",
            status: "open",
        });

        res.json(thread);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
