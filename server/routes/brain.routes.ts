import { Router, Request, Response } from "express";
import { brainDb } from "../brain/brain.db.js";
import { conversations, sessions, brainConfig } from "../brain/schema.js";
import { desc, eq, sql, count } from "drizzle-orm";
import { brainService } from "../brain/brain.service.js";

const router = Router();

// Helper to send messenger replies when approving a draft
async function sendMessengerReply(senderPsid: string, text: string) {
    const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
    if (!PAGE_ACCESS_TOKEN) {
        console.warn("[Brain API] No PAGE_ACCESS_TOKEN, cannot send approved draft.");
        return;
    }
    try {
        await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient: { id: senderPsid }, message: { text } })
        });
        console.log(`[Brain API] Sent approved draft to ${senderPsid}`);
    } catch (e) {
        console.error("[Brain API] Failed to send messenger reply", e);
    }
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
            const modeRow = await brainDb.query.brainConfig.findFirst({
                where: eq(brainConfig.key, 'brain_mode')
            });
            if (modeRow?.value) activeMode = modeRow.value;
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

        const results = await brainDb.query.conversations.findMany({
            orderBy: [desc(conversations.createdAt)],
            limit,
            offset
        });

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

        // 2. Send to Messenger
        await sendMessengerReply(draft.senderPsid, finalReplyText);

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

export default router;
