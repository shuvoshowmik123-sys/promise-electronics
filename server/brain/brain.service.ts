import { brainDb } from './brain.db.js';
import { conversations, sessions, brainConfig, shadowDrafts } from './schema.js';
import { eq, desc, count, sql as drizzleSql } from 'drizzle-orm';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { neon } from '@neondatabase/serverless';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Initialize Gemini for embeddings
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const embeddingModel = genai.getGenerativeModel({ model: "text-embedding-004" });

export const brainService = {
    // -------------------------------------------------------------
    // Session Management (replaces in-memory Map)
    // -------------------------------------------------------------
    async getSession(senderPsid: string) {
        // Drizzle 0.39 + neon-http: relational queries break — use direct select
        const rows = await brainDb.select()
            .from(sessions)
            .where(eq(sessions.senderPsid, senderPsid))
            .limit(1);
        let session = rows[0];

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
        // Drizzle 0.39 + neon-http: relational queries break — use direct select
        const rows = await brainDb.select()
            .from(brainConfig)
            .where(eq(brainConfig.key, 'brain_mode'))
            .limit(1);
        const modeSetting = rows[0];

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
        // Drizzle 0.39 + neon-http: relational queries break — use direct select
        const rows = await brainDb.select()
            .from(shadowDrafts)
            .where(eq(shadowDrafts.id, id))
            .limit(1);
        return rows[0];
    },

    async getShadowDrafts(page: number, limit: number) {
        const offset = (page - 1) * limit;

        const results = await brainDb.select()
            .from(shadowDrafts)
            .where(eq(shadowDrafts.status, 'pending'))
            .orderBy(desc(shadowDrafts.createdAt))
            .limit(limit)
            .offset(offset);

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
    },

    // -------------------------------------------------------------
    // Phase 6: Commission Tracking — Staff Claim on Messenger Sessions
    // -------------------------------------------------------------

    /** Run once on startup to create Knowledge Graph tables if missing.
     *  Uses raw neon client because Drizzle neon-http has DDL issues. */
    async migrateKGTables() {
        const url = process.env.BRAIN_DATABASE_URL;
        if (!url) {
            console.warn('[Brain] BRAIN_DATABASE_URL not set — skipping KG migration');
            return;
        }
        try {
            const sql = neon(url);
            await sql`CREATE TABLE IF NOT EXISTS kg_facts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                subject TEXT NOT NULL,
                predicate TEXT NOT NULL,
                value TEXT NOT NULL,
                tags TEXT[] NOT NULL DEFAULT '{}',
                confidence REAL DEFAULT 1.0,
                source TEXT DEFAULT 'admin',
                created_by TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP
            )`;
            await sql`CREATE INDEX IF NOT EXISTS kg_facts_tags_gin ON kg_facts USING GIN (tags)`;
            await sql`CREATE INDEX IF NOT EXISTS kg_facts_subject_idx ON kg_facts (subject)`;

            await sql`CREATE TABLE IF NOT EXISTS brain_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                has_image BOOLEAN DEFAULT FALSE,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )`;
            await sql`CREATE INDEX IF NOT EXISTS brain_messages_session_idx ON brain_messages (session_id, created_at DESC)`;

            await sql`CREATE TABLE IF NOT EXISTS brain_media (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
                data_b64 TEXT NOT NULL,
                expires_at BIGINT NOT NULL
            )`;
            await sql`CREATE INDEX IF NOT EXISTS brain_media_session_idx ON brain_media (session_id)`;
            await sql`CREATE INDEX IF NOT EXISTS brain_media_expires_idx ON brain_media (expires_at)`;

            console.log('[Brain] KG tables ensured (kg_facts, brain_messages, brain_media)');
        } catch (e: any) {
            console.warn('[Brain] KG migration failed:', e.message?.slice(0, 120));
        }
    },

    /** Run once on startup to add Phase 6 columns if missing.
     *  Uses raw neon client because Drizzle neon-http has DDL issues. */
    async migratePhase6Columns() {
        const url = process.env.BRAIN_DATABASE_URL;
        if (!url) {
            console.warn('[Brain] BRAIN_DATABASE_URL not set — skipping Phase 6 migration');
            return;
        }
        try {
            const sql = neon(url);
            await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS claimed_by_user_id TEXT`;
            await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS claimed_by_name TEXT`;
            await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP`;
            await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS needs_claim BOOLEAN DEFAULT FALSE`;
            console.log('[Brain] Phase 6 columns ensured');
        } catch (e: any) {
            console.warn('[Brain] Phase 6 migration skipped:', e.message?.slice(0, 120));
        }
    },

    /** Mark session as needing staff claim (called on human echo) */
    async markNeedsClaim(senderPsid: string) {
        try {
            await brainDb.update(sessions)
                .set({ needsClaim: true })
                .where(eq(sessions.senderPsid, senderPsid));
        } catch {}
    },

    /** Staff claims a Messenger session — they handled this conversation */
    async claimSession(senderPsid: string, userId: string, userName: string) {
        const result = await brainDb.update(sessions)
            .set({
                claimedByUserId: userId,
                claimedByName: userName,
                claimedAt: new Date(),
                needsClaim: false,
            })
            .where(eq(sessions.senderPsid, senderPsid))
            .returning();
        return result[0] ?? null;
    },

    /** Look up a session by customer phone — used by job creation to suggest ChatHandler */
    async getSessionByPhone(phone: string) {
        // Normalize: strip non-digits, match last 10 digits
        const normalized = phone.replace(/\D/g, '').slice(-10);
        try {
            // Drizzle 0.39 + neon-http: relational queries break — use direct select
            const all = await brainDb.select()
                .from(sessions)
                .orderBy(desc(sessions.lastMessageAt))
                .limit(100);
            return all.find(s => s.customerPhone?.replace(/\D/g, '').slice(-10) === normalized) ?? null;
        } catch {
            return null;
        }
    },

    /** Sessions that have human replies but no claim yet */
    async getUnclaimedSessions() {
        // Drizzle 0.39 + neon-http: relational queries break — use direct select
        return brainDb.select()
            .from(sessions)
            .where(eq(sessions.needsClaim, true))
            .orderBy(desc(sessions.lastMessageAt))
            .limit(20);
    },

    // -------------------------------------------------------------
    // Media Storage (images from WhatsApp / Messenger)
    // TTL: 24h. Stored in brain_media table + /tmp fast cache.
    // -------------------------------------------------------------

    /** Push a structured message (e.g. image ref) directly into session history */
    async appendToHistory(senderPsid: string, message: Record<string, unknown>) {
        const session = await this.getSession(senderPsid);
        const history = [...(session.history as any[] || []), message];
        await brainDb.update(sessions)
            .set({ history, messageCount: (session.messageCount || 0) + 1, lastMessageAt: new Date() })
            .where(eq(sessions.senderPsid, senderPsid));
    },

    /** Store image buffer in brain_media (24h TTL) and /tmp cache */
    async storeMedia(imageId: string, sessionId: string, mimeType: string, buffer: Buffer): Promise<void> {
        const url = process.env.BRAIN_DATABASE_URL;
        if (!url) return;
        const expiresAt = Date.now() + 86_400_000; // 24h
        const data_b64 = buffer.toString('base64');
        try {
            const sql = neon(url);
            await sql`
                INSERT INTO brain_media (id, session_id, mime_type, data_b64, expires_at)
                VALUES (${imageId}, ${sessionId}, ${mimeType}, ${data_b64}, ${expiresAt})
                ON CONFLICT (id) DO NOTHING
            `;
        } catch (e: any) {
            console.error('[Brain] storeMedia DB error:', e.message?.slice(0, 80));
        }
        // /tmp fast cache — best effort
        try {
            await writeFile(join(tmpdir(), `brain-img-${imageId}`), buffer);
        } catch {}
    },

    /** Retrieve image buffer: /tmp → DB → null */
    async getMedia(imageId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
        // 1. /tmp fast path
        try {
            const buf = await readFile(join(tmpdir(), `brain-img-${imageId}`));
            return { buffer: buf, mimeType: 'image/jpeg' };
        } catch {}

        // 2. DB fallback
        const url = process.env.BRAIN_DATABASE_URL;
        if (!url) return null;
        try {
            const sql = neon(url);
            const rows = await sql`
                SELECT data_b64, mime_type, expires_at FROM brain_media WHERE id = ${imageId} LIMIT 1
            `;
            if (!rows[0]) return null;
            if (Number(rows[0].expires_at) < Date.now()) return null; // expired
            const buffer = Buffer.from(rows[0].data_b64 as string, 'base64');
            // Repopulate /tmp for next hit
            try { await writeFile(join(tmpdir(), `brain-img-${imageId}`), buffer); } catch {}
            return { buffer, mimeType: rows[0].mime_type as string };
        } catch (e: any) {
            console.error('[Brain] getMedia DB error:', e.message?.slice(0, 80));
            return null;
        }
    },

    /** Delete expired rows from brain_media */
    async cleanupExpiredMedia(): Promise<number> {
        const url = process.env.BRAIN_DATABASE_URL;
        if (!url) return 0;
        try {
            const sql = neon(url);
            const result = await sql`DELETE FROM brain_media WHERE expires_at < ${Date.now()}`;
            return (result as any).count ?? 0;
        } catch {
            return 0;
        }
    },
};
