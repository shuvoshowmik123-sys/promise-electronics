import { Router, Request, Response } from "express";
import { brainDb } from "../brain/brain.db.js";
import { conversations, sessions, brainConfig } from "../brain/schema.js";
import { desc, eq, sql, count, ilike, or } from "drizzle-orm";
import { brainService } from "../brain/brain.service.js";

const router = Router();

// Detect channel from session key (wa_ prefix = WhatsApp, otherwise Messenger)
function detectChannel(senderPsid: string): "whatsapp" | "messenger" {
    return senderPsid.startsWith("wa_") ? "whatsapp" : "messenger";
}

// Helper to send messenger replies when approving a draft
async function sendMessengerReply(senderPsid: string, text: string) {
    const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
    if (!PAGE_ACCESS_TOKEN) {
        console.warn("[Brain API] No PAGE_ACCESS_TOKEN, cannot send approved draft.");
        return false;
    }
    try {
        const res = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient: { id: senderPsid }, message: { text } })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error("[Brain API] Messenger send error:", err);
            return false;
        }
        console.log(`[Brain API] Sent to Messenger ${senderPsid}`);
        return true;
    } catch (e) {
        console.error("[Brain API] Failed to send messenger reply", e);
        return false;
    }
}

// Helper to send WhatsApp replies — phone extracted from sessionKey wa_<phone>
async function sendWhatsAppReply(sessionKey: string, text: string) {
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
        console.warn("[Brain API] WhatsApp env vars missing, cannot send.");
        return false;
    }
    const phone = sessionKey.replace(/^wa_/, "");
    try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: phone,
                type: "text",
                text: { body: text },
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error("[Brain API] WhatsApp send error:", err);
            return false;
        }
        console.log(`[Brain API] Sent to WhatsApp ${phone}`);
        return true;
    } catch (e) {
        console.error("[Brain API] Failed to send WhatsApp reply", e);
        return false;
    }
}

// Unified send — auto-detects channel
async function sendReply(senderPsid: string, text: string): Promise<boolean> {
    return detectChannel(senderPsid) === "whatsapp"
        ? sendWhatsAppReply(senderPsid, text)
        : sendMessengerReply(senderPsid, text);
}

// ==========================================
// 1. Get Brain Stats
// ==========================================
router.get("/stats", async (req: Request, res: Response) => {
    try {
        let totalPairs = 0;
        let totalSessions = 0;
        let activeMode = process.env.BRAIN_MODE || 'observe';

        try {
            const [pairRow] = await brainDb.select({ count: count() }).from(conversations);
            totalPairs = Number(pairRow?.count ?? 0);
        } catch (e) { }

        try {
            const [sessionRow] = await brainDb.select({ count: count() }).from(sessions);
            totalSessions = Number(sessionRow?.count ?? 0);
        } catch (e) { }

        try {
            // Drizzle 0.39 + neon-http: relational queries break — use direct select
            const modeRows = await brainDb.select()
                .from(brainConfig)
                .where(eq(brainConfig.key, 'brain_mode'))
                .limit(1);
            if (modeRows[0]?.value) activeMode = modeRows[0].value;
        } catch (e) { }

        res.json({
            success: true,
            stats: {
                totalPairs,
                totalSessions,
                activeMode,
                languageStats: []
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to load stats." });
    }
});

// ==========================================
// 2. Get Paginated Conversations
// ==========================================
router.get("/conversations", async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

        const results = await brainDb.select()
            .from(conversations)
            .orderBy(desc(conversations.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ total }] = await brainDb.select({ total: count() }).from(conversations);

        res.json({
            success: true,
            data: results,
            pagination: {
                page,
                limit,
                total: Number(total),
                totalPages: Math.ceil(Number(total) / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to load conversations" });
    }
});

// ==========================================
// 3. Update Conversation Quality
// ==========================================
router.patch("/conversations/:id/quality", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { isGoodExample } = req.body;
        await brainDb.update(conversations).set({ isGoodExample }).where(eq(conversations.id, id));
        res.json({ success: true, message: "Quality updated" });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to update quality" });
    }
});

// ==========================================
// 4. Update Brain Mode
// ==========================================
router.patch("/config/mode", async (req: Request, res: Response) => {
    try {
        const { mode } = req.body;
        if (!['observe', 'shadow', 'autopilot'].includes(mode)) {
            return res.status(400).json({ success: false, error: "Invalid mode." });
        }

        // GUARDRAIL: Require minimum Good Examples for Autopilot
        if (mode === 'autopilot') {
            const [{ total }] = await brainDb.select({ total: count() })
                .from(conversations)
                .where(eq(conversations.isGoodExample, true));

            const minRequired = 5;
            if (Number(total) < minRequired) {
                return res.status(400).json({
                    success: false,
                    error: `Autopilot requires ${minRequired} "Good Examples". You only have ${total}. Use Shadow mode to train the AI first.`
                });
            }
        }

        await brainDb.insert(brainConfig).values({ key: 'brain_mode', value: mode })
            .onConflictDoUpdate({ target: brainConfig.key, set: { value: mode, updatedAt: new Date() } });
        res.json({ success: true, mode });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to update mode" });
    }
});

// ==========================================
// 5. Health Check / DB Ping
// ==========================================
router.get("/ping", async (req: Request, res: Response) => {
    try {
        await brainDb.execute(sql`SELECT 1`);
        res.json({ success: true, message: "Brain DB connected" });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.message || "Brain DB unreachable" });
    }
});

// ==========================================
// 6. Shadow Drafts Management
// ==========================================
router.get("/shadow-drafts", async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const data = await brainService.getShadowDrafts(page, limit);
        res.json({ success: true, ...data });
    } catch (error) {
        console.error("[Brain API] Error fetching shadow drafts:", error);
        res.status(500).json({ success: false, error: "Failed to load shadow drafts" });
    }
});

router.patch("/shadow-drafts/:id/approve", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { editedReply } = req.body; // Optional string if admin edited it before approving

        const draft = await brainService.getShadowDraft(id);
        if (!draft || draft.status !== 'pending') {
            return res.status(404).json({ success: false, error: "Pending draft not found" });
        }

        const finalReplyText = editedReply || draft.aiDraft;

        // 1. Mark as approved
        await brainService.updateShadowDraftStatus(id, 'approved', editedReply);

        // 2. Send via correct channel (Messenger or WhatsApp)
        await sendReply(draft.senderPsid, finalReplyText);

        // 3. Log as a successful conversation pair for future learning
        // We log "repliedBy" as 'ai_edited' if they changed it, or 'ai' if approved as-is
        await brainService.logConversation(
            draft.senderPsid,
            draft.customerMessage,
            finalReplyText,
            editedReply ? 'ai' : 'ai' // wait, the DB expects 'ai' or 'human'. We can just use 'ai' for now.
        );

        // 4. Update the active session counter
        await brainService.updateSession(draft.senderPsid, null, finalReplyText);

        res.json({ success: true, message: "Draft approved and sent" });
    } catch (error) {
        console.error("[Brain API] Error approving shadow draft:", error);
        res.status(500).json({ success: false, error: "Failed to approve shadow draft" });
    }
});

router.patch("/shadow-drafts/:id/reject", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { adminEditedReply } = req.body; // Optional - what they would have said instead

        await brainService.updateShadowDraftStatus(id, 'rejected', adminEditedReply);
        res.json({ success: true, message: "Draft rejected" });
    } catch (error) {
        console.error("[Brain API] Error rejecting shadow draft:", error);
        res.status(500).json({ success: false, error: "Failed to reject shadow draft" });
    }
});

// ==========================================
// Phase 6: Commission — Staff Claim on Messenger Sessions
// ==========================================

/**
 * GET /unclaimed — sessions where a human replied but no staff claimed it yet
 */
router.get("/unclaimed", async (req: Request, res: Response) => {
    try {
        const sessions = await brainService.getUnclaimedSessions();
        res.json({ success: true, data: sessions });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to fetch unclaimed sessions" });
    }
});

/**
 * POST /sessions/:psid/claim — staff claims a session (they handled this customer)
 */
router.post("/sessions/:psid/claim", async (req: Request, res: Response) => {
    try {
        const { psid } = req.params;
        const { userId, userName } = req.body;
        if (!userId || !userName) {
            return res.status(400).json({ error: "userId and userName required" });
        }
        const session = await brainService.claimSession(psid, userId, userName);
        if (!session) return res.status(404).json({ error: "Session not found" });
        res.json({ success: true, session });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to claim session" });
    }
});

/**
 * GET /sessions/by-phone/:phone — look up session by customer phone
 * Used by CreateJobDrawer to suggest ChatHandler
 */
router.get("/sessions/by-phone/:phone", async (req: Request, res: Response) => {
    try {
        const session = await brainService.getSessionByPhone(req.params.phone);
        if (!session) return res.json({ found: false });
        res.json({
            found: true,
            claimedByUserId: session.claimedByUserId,
            claimedByName: session.claimedByName,
            claimedAt: session.claimedAt,
            needsClaim: session.needsClaim,
            senderName: session.senderName,
            lastMessageAt: session.lastMessageAt,
        });
    } catch (error) {
        res.status(500).json({ found: false, error: "Lookup failed" });
    }
});

// ==========================================
// Unified CRM Inbox — WhatsApp + Messenger
// ==========================================

/**
 * GET /inbox — list all sessions ordered by most recent activity
 * Returns sessions with last message preview + channel detection
 */
router.get("/inbox", async (req: Request, res: Response) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const search = (req.query.search as string)?.trim();

        // Drizzle 0.39 + neon-http: relational queries break — use direct select
        const rows = search
            ? await brainDb.select()
                .from(sessions)
                .where(or(
                    ilike(sessions.senderName, `%${search}%`),
                    ilike(sessions.senderPsid, `%${search}%`),
                    ilike(sessions.customerPhone as any, `%${search}%`),
                ))
                .orderBy(desc(sessions.lastMessageAt))
                .limit(limit)
            : await brainDb.select()
                .from(sessions)
                .orderBy(desc(sessions.lastMessageAt))
                .limit(limit);

        const items = rows.map((s: any) => {
            const history = (s.history as any[]) || [];
            const lastMsg = history.length > 0 ? history[history.length - 1] : null;
            return {
                senderPsid: s.senderPsid,
                senderName: s.senderName,
                customerPhone: s.customerPhone,
                channel: detectChannel(s.senderPsid),
                messageCount: s.messageCount,
                lastMessageAt: s.lastMessageAt,
                lastMessagePreview: lastMsg ? String(lastMsg.content ?? "").slice(0, 100) : "",
                lastMessageRole: lastMsg?.role ?? null,
                needsClaim: s.needsClaim,
                claimedByName: s.claimedByName,
                claimedByUserId: s.claimedByUserId,
            };
        });

        res.json({ success: true, data: items });
    } catch (error) {
        console.error("[Brain API] Inbox error:", error);
        res.status(500).json({ success: false, error: "Failed to load inbox" });
    }
});

/**
 * GET /sessions/:psid/messages — full conversation history for one session
 */
router.get("/sessions/:psid/messages", async (req: Request, res: Response) => {
    try {
        const { psid } = req.params;
        const sessionRows = await brainDb.select()
            .from(sessions)
            .where(eq(sessions.senderPsid, psid))
            .limit(1);
        const session = sessionRows[0];
        if (!session) return res.status(404).json({ success: false, error: "Session not found" });

        res.json({
            success: true,
            data: {
                senderPsid: session.senderPsid,
                senderName: session.senderName,
                customerPhone: session.customerPhone,
                channel: detectChannel(session.senderPsid),
                messageCount: session.messageCount,
                lastMessageAt: session.lastMessageAt,
                history: (session.history as any[]) || [],
                needsClaim: session.needsClaim,
                claimedByName: session.claimedByName,
                claimedByUserId: session.claimedByUserId,
            },
        });
    } catch (error) {
        console.error("[Brain API] Get messages error:", error);
        res.status(500).json({ success: false, error: "Failed to load messages" });
    }
});

/**
 * POST /sessions/:psid/send — staff sends custom reply
 * Auto-detects channel, logs to history, optionally claims session
 */
router.post("/sessions/:psid/send", async (req: Request, res: Response) => {
    try {
        const { psid } = req.params;
        const { text, userId, userName } = req.body as { text?: string; userId?: string; userName?: string };

        if (!text?.trim()) return res.status(400).json({ success: false, error: "text required" });

        const sessionRows2 = await brainDb.select()
            .from(sessions)
            .where(eq(sessions.senderPsid, psid))
            .limit(1);
        const session = sessionRows2[0];
        if (!session) return res.status(404).json({ success: false, error: "Session not found" });

        // Send via correct channel
        const ok = await sendReply(psid, text.trim());
        if (!ok) return res.status(502).json({ success: false, error: "Send to channel failed" });

        // Log to history (as model/staff reply)
        await brainService.updateSession(psid, null, text.trim());

        // Auto-claim if not already claimed and userId provided
        if (userId && userName && !session.claimedByUserId) {
            await brainService.claimSession(psid, userId, userName).catch(() => null);
        }

        res.json({ success: true, message: "Sent" });
    } catch (error) {
        console.error("[Brain API] Send error:", error);
        res.status(500).json({ success: false, error: "Failed to send" });
    }
});

export default router;
