import { brainDb } from './brain.db.js';
import { conversations, sessions, brainConfig, shadowDrafts } from './schema.js';
import { eq, desc, count } from 'drizzle-orm';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini for embeddings
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const embeddingModel = genai.getGenerativeModel({ model: "text-embedding-004" });

export const brainService = {
    // -------------------------------------------------------------
    // Session Management (replaces in-memory Map)
    // -------------------------------------------------------------
    async getSession(senderPsid: string) {
        let session = await brainDb.query.sessions.findFirst({
            where: eq(sessions.senderPsid, senderPsid)
        });

        if (!session) {
            const newSession = await brainDb.insert(sessions).values({
                senderPsid,
                history: [],
                messageCount: 0
            }).returning();
            session = newSession[0];
        }

        return session;
    },

    async updateSession(senderPsid: string, newMessage: any, newReply: any) {
        const session = await this.getSession(senderPsid);
        const history = [...(session.history as any[] || [])];

        if (newMessage) history.push({ role: "user", content: newMessage });
        if (newReply) history.push({ role: "model", content: newReply });

        await brainDb.update(sessions)
            .set({
                history,
                messageCount: (session.messageCount || 0) + (newMessage ? 1 : 0),
                lastMessageAt: new Date()
            })
            .where(eq(sessions.senderPsid, senderPsid));
    },

    // -------------------------------------------------------------
    // Conversation Logging
    // -------------------------------------------------------------
    async logConversation(senderPsid: string, customerMessage: string, ourReply: string, repliedBy: 'human' | 'ai' = 'human') {
        try {
            // Generate embedding for the customer message + reply combined for better semantic search later
            const textToEmbed = `Customer: ${customerMessage}\nOur Reply: ${ourReply}`;
            let embeddingValues: number[] | null = null;

            try {
                const result = await embeddingModel.embedContent(textToEmbed);
                embeddingValues = result.embedding.values;
            } catch (e) {
                console.error("[Brain] Failed to generate embedding. Storing without vector.", e);
            }

            await brainDb.insert(conversations).values({
                customerMessage,
                ourReply,
                senderPsid,
                repliedBy,
                embedding: embeddingValues
            });
            console.log(`[Brain] Logged conversation pair for ${senderPsid}`);
        } catch (error) {
            console.error("[Brain] Error logging conversation:", error);
        }
    },

    // -------------------------------------------------------------
    // Mode Management
    // -------------------------------------------------------------
    async getBrainMode(): Promise<'observe' | 'shadow' | 'autopilot'> {
        const modeSetting = await brainDb.query.brainConfig.findFirst({
            where: eq(brainConfig.key, 'brain_mode')
        });

        return (modeSetting?.value as 'observe' | 'shadow' | 'autopilot') ||
            process.env.BRAIN_MODE as 'observe' | 'shadow' | 'autopilot' ||
            'observe';
    },

    // -------------------------------------------------------------
    // Shadow Draft Management
    // -------------------------------------------------------------
    async saveShadowDraft(senderPsid: string, customerMessage: string, aiDraft: string) {
        try {
            const result = await brainDb.insert(shadowDrafts).values({
                senderPsid,
                customerMessage,
                aiDraft,
                status: 'pending'
            }).returning();
            console.log(`[Brain] Saved shadow draft for ${senderPsid}`);
            return result[0];
        } catch (error) {
            console.error("[Brain] Error saving shadow draft:", error);
            return null;
        }
    },

    async getShadowDraft(id: string) {
        return brainDb.query.shadowDrafts.findFirst({
            where: eq(shadowDrafts.id, id)
        });
    },

    async getShadowDrafts(page: number, limit: number) {
        const offset = (page - 1) * limit;

        const results = await brainDb.query.shadowDrafts.findMany({
            where: eq(shadowDrafts.status, 'pending'),
            orderBy: [desc(shadowDrafts.createdAt)],
            limit,
            offset
        });

        const [{ total }] = await brainDb.select({ total: count() })
            .from(shadowDrafts)
            .where(eq(shadowDrafts.status, 'pending'));

        return {
            data: results,
            total: Number(total),
            page,
            totalPages: Math.ceil(Number(total) / limit)
        };
    },

    async updateShadowDraftStatus(id: string, status: 'approved' | 'rejected', adminEditedReply?: string) {
        try {
            const result = await brainDb.update(shadowDrafts)
                .set({
                    status,
                    adminEditedReply,
                    reviewedAt: new Date()
                })
                .where(eq(shadowDrafts.id, id))
                .returning();
            return result[0];
        } catch (error) {
            console.error("[Brain] Error updating shadow draft status:", error);
            return null;
        }
    }
};
