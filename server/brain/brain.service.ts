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

    // -------------------------------------------------------------
    // Few-Shot Learning: similar past conversations for prompt injection
    // -------------------------------------------------------------

    /** Embed text using Gemini text-embedding-004 */
    async embedText(text: string): Promise<number[] | null> {
        try {
            const result = await embeddingModel.embedContent(text.slice(0, 2000));
            return result.embedding.values;
        } catch {
            return null;
        }
    },

    /** Find top-N most similar past conversations by cosine distance (pgvector) */
    async getSimilarExamples(message: string, limit = 3, hydeOverride?: string): Promise<Array<{ customerMessage: string; ourReply: string }>> {
        const url = process.env.BRAIN_DATABASE_URL;
        if (!url) return [];
        try {
            // Dose 1: embed HyDE (hypothetical reply) instead of raw question — better semantic match
            const textToEmbed = (hydeOverride || message).slice(0, 2000);
            const embedding = await this.embedText(textToEmbed);
            if (!embedding) return [];
            const vecStr = `[${embedding.join(',')}]`;
            const sql = neon(url);
            const rows = await sql`
                SELECT customer_message, our_reply
                FROM conversations
                WHERE is_good_example = true AND embedding IS NOT NULL
                ORDER BY embedding <=> ${vecStr}::vector
                LIMIT ${limit}
            `;
            return rows.map((r: any) => ({ customerMessage: r.customer_message, ourReply: r.our_reply }));
        } catch (e: any) {
            console.warn('[Brain] getSimilarExamples failed:', e.message?.slice(0, 80));
            return [];
        }
    },

    /** Bulk-insert conversation pairs with embeddings. Returns count inserted. */
    async bulkImportConversations(pairs: Array<{
        customerMessage: string;
        ourReply: string;
        source?: string;
    }>): Promise<number> {
        let inserted = 0;
        for (const pair of pairs) {
            try {
                const textToEmbed = `Customer: ${pair.customerMessage}\nReply: ${pair.ourReply}`;
                let embedding: number[] | null = null;
                try { embedding = await this.embedText(textToEmbed); } catch {}

                await brainDb.insert(conversations).values({
                    customerMessage: pair.customerMessage,
                    ourReply: pair.ourReply,
                    senderPsid: `import_${pair.source || 'manual'}`,
                    repliedBy: 'human',
                    isGoodExample: true,
                    embedding,
                });
                inserted++;
            } catch {}
        }
        console.log(`[Brain] Imported ${inserted}/${pairs.length} conversation pairs`);
        return inserted;
    },

    /** Seed DB with real conversations if table is empty (runs once on startup) */
    async seedConversationsIfEmpty(): Promise<void> {
        try {
            const [row] = await brainDb.select({ count: count() }).from(conversations);
            if (Number(row?.count) > 0) return; // already seeded

            const SEED_PAIRS = [
                // ── Business info ──────────────────────────────────────────────
                { customerMessage: "মোবাইল নাম্বার সহ ফুল ঠিকানাটা লিখে দেন ভাই।", ourReply: "আমাদের সার্ভিস অফিস: লিফট-০৮, হোসেন টাওয়ার, ১১৬ নয়া পল্টন, বক্স কালভার্ট রোড, ঢাকা-১০০০। ফোন: ০১৮৮৬৬৬২৮১১" },
                { customerMessage: "আপনাদের কার্যক্রম বন্ধ থাকে কবে সাপ্তাহিক?", ourReply: "স্যার শুক্রবার আমাদের বন্ধ থাকে। শনিবার থেকে বৃহস্পতিবার খোলা থাকি।" },
                { customerMessage: "শনিবার সকাল ১০টায় আসলে দোকান খোলা পাওয়া যাবে?", ourReply: "স্যার ১১টায় আসলে ভালো হয়। সকাল ১০টা থেকে রাত ৮টা পর্যন্ত খোলা।" },
                { customerMessage: "When you open the shop?", ourReply: "স্যার সকাল দশটা থেকে রাত আটটা পর্যন্ত খোলা থাকে। শুক্রবার বন্ধ।" },
                { customerMessage: "আপনারা কি শুক্রবার সার্ভিস সেন্টার খোলা রাখেন?", ourReply: "স্যার, শুক্রবার আমাদের বন্ধ থাকে।" },
                { customerMessage: "কার্ডে কি পেমেন্ট করা যাবে?", ourReply: "স্যার আমাদের কার্ডে পেমেন্ট নাই। তবে আমাদের অফিসের সামনেই ডাচ বাংলা ব্যাংকের ATM বুথ আছে, ওখান থেকে তুলে দিতে পারবেন।" },
                // ── Pricing ────────────────────────────────────────────────────
                { customerMessage: "৪৩ ইঞ্চি ডিসপ্লে রিপ্লেস করলে কত খরচ?", ourReply: "স্যার ৪৩\" ডিসপ্লে পরিবর্তন করলে সার্ভিস বিল সহ ১৬,০০০ টাকা খরচ পড়বে। সাথে ৬ মাসের ওয়ারেন্টি পাবেন।" },
                { customerMessage: "ডিসপ্লে রিপ্লেস ১৫ হাজার টাকা আর ১ বছরের ওয়ারেন্টি হলে আজকে এসেই নিয়ে যান।", ourReply: "স্যার, ষোল হাজার টাকা ৬ মাসের ওয়ারেন্টি — ওয়ারেন্টি কেউ দেয় না, আমরা দিয়ে থাকি। দাম আর কমানো সম্ভব না।" },
                { customerMessage: "55 inch display change koto taka lagbe?", ourReply: "স্যার ৫৫\" ডিসপ্লে পরিবর্তনে সার্ভিস চার্জ সহ ২২,০০০ থেকে ২৭,০০০ টাকা পড়তে পারে। মডেল নম্বরটা দিলে নির্দিষ্ট দাম বলতে পারবো।" },
                { customerMessage: "65 inch panel change koto lagbe?", ourReply: "স্যার ৬৫\" টিভির নতুন প্যানেল লাগালে সার্ভিস বিল সহ ৪৮,০০০ টাকা খরচ পড়বে।" },
                { customerMessage: "charge koto porbe?", ourReply: "স্যার/ম্যাম, টিভি নিয়ে আসার পর বুঝা যাবে কত লাগতে পারে। আনুমানিক রিপেয়ার হলে ২,০০০–৩,৫০০ টাকা। রিপেয়ার না হলে কোনো টাকা দিতে হবে না।" },
                { customerMessage: "Aro komano jabe price?", ourReply: "স্যার, আর কমানো যাবে না। আমাদের কোম্পানি থেকে ফিক্সড করা।" },
                { customerMessage: "How long will it take tentatively?", ourReply: "আনুমানিক ২ থেকে ৩ ঘন্টা লাগতে পারে। তবে জটিল সমস্যা হলে ১–২ দিনও লাগতে পারে।" },
                // ── Repair policies ────────────────────────────────────────────
                { customerMessage: "Need to know if ur service man came and after checking product, if we think that ur rate is High and don't want to take ur service, then any charges we need to pay?", ourReply: "স্যার, আমরা আগে ভিডিও বা ছবি দেখে আনুমানিক চার্জ জানাই। অফিসে নিয়ে আসার পর যদি রিপেয়ার না হয়, কোনো চার্জ নেই।" },
                { customerMessage: "Home service koren?", ourReply: "স্যার, প্যানেল ও ডিসপ্লের কাজ হোম সার্ভিসে ঝুঁকিপূর্ণ — প্যানেল খুব sensitive। তাই এই ধরনের কাজ আমাদের অফিসে করাই নিরাপদ।" },
                { customerMessage: "Kono warranty thakbe display change korle?", ourReply: "স্যার ৬ মাসের ওয়ারেন্টি পাবেন ডিসপ্লে পরিবর্তনে।" },
                { customerMessage: "Kon brand er display? Original display?", ourReply: "স্যার আপনার টিভিতে যে ডিসপ্লে আছে সেই ব্র্যান্ডেরটাই দেওয়া হবে। জি, অরিজিনাল ডিসপ্লে।" },
                // ── Diagnosis flow ─────────────────────────────────────────────
                { customerMessage: "আমার স্যারের একটা টিভির HDMI PORT নষ্ট হয়ে গেছে, ঠিক করতে কত খরচ হবে?", ourReply: "স্যার আপনার টিভির মডেল নম্বরটা দিলে বলতে পারবো। HDMI port সমস্যা সাধারণত মেইনবোর্ড রিপেয়ারের বিষয়।" },
                { customerMessage: "Sony 55x85j suddenly black Hoya gese. Sound asha off, then tv off", ourReply: "স্যার এটা ডিসপ্লে বা ব্যাকলাইটের সমস্যা হতে পারে। আমাদের অফিসে নিয়ে আসলে ভেতরে দেখে সঠিক কারণ বলতে পারবো।" },
                { customerMessage: "এটা ঠিক হবে কি না?", ourReply: "স্যার আপনার টিভি রিপেয়ারের সম্ভাবনা আছে। আমাদের অফিসে নিয়ে আসুন, ইনশাল্লাহ চেষ্টা করবো।" },
                { customerMessage: "panel change korte hobe", ourReply: "স্যার আমাদের স্টকে দেখতে হবে আছে কিনা। টিভির মডেল নম্বর দিন, জানাচ্ছি।" },
                { customerMessage: "Display line problem ache", ourReply: "স্যার ডিসপ্লে লাইন শর্ট হলে রিপেয়ারের সম্ভাবনা থাকে — আমাদের মেশিন দিয়ে করা হয়। আগে কোনো লোকাল টেকনিশিয়ান হাত দিলে পরে মেশিনে হয় না। অফিসে নিয়ে আসুন।" },
                { customerMessage: "আমার টিভিতে যে সমস্যা তার একটা ভিডিও করে পাঠাই?", ourReply: "জি স্যার, ভিডিও পাঠান এবং টিভির মডেল নম্বরটাও দিন। তাহলে আনুমানিক খরচ বলতে পারবো।" },
                { customerMessage: "Samsung UA43AU7700RSFS display venge gese", ourReply: "স্যার এই মডেলের ডিসপ্লে পরিবর্তনে ১৬,০০০ টাকা খরচ পড়বে সার্ভিস চার্জ সহ।" },
                { customerMessage: "আগে রিপেয়ার করা হয়েছে, এখন আবার সমস্যা", ourReply: "স্যার আগে যদি লোকাল টেকনিশিয়ান হাত দিয়ে থাকেন তাহলে মেশিনে রিপেয়ারের সম্ভাবনা কমে যায়। তবে অফিসে নিয়ে আসুন, দেখে বলতে পারবো।" },
            ];

            await this.bulkImportConversations(SEED_PAIRS.map(p => ({ ...p, source: 'facebook_page_export_2024' })));
            console.log('[Brain] Conversation seed complete');
        } catch (e: any) {
            console.warn('[Brain] seedConversationsIfEmpty failed:', e.message?.slice(0, 80));
        }
    },

    /** Import second batch of real Facebook conversations if not yet done (count < 75). */
    async seedPhase2ConversationsIfNeeded(): Promise<void> {
        try {
            const [row] = await brainDb.select({ count: count() }).from(conversations);
            if (Number(row?.count) >= 75) return;

            const PHASE2_PAIRS = [
                // ── Rokeya Forid ─────────────────────────────────────────────
                { customerMessage: "আমার টেলিভিশনের ছবিগুলো দিলাম আমার টিভিটা কি ঠিক করা যাবে", ourReply: "ম্যাম,আাপনার টিভি রিপেয়ার সম্ভবানা আছে,আমাদের সার্ভিস অফিসে নিয়ে আসেন।" },
                { customerMessage: "এত বড় টিভি নিয়ে যাওয়া কি খাবে আপনাদের কোন এসি ঠিক করতে পারবে", ourReply: "স্যার আপনার ঠিকানা কোথায়\nSir amader home delivery hoba na..\nAmader nijosso gari ace pickup & delivary hoba apner tv nia asbe & dia asbe.." },
                { customerMessage: "আমার নম্বর দিতে চাচ্ছি না তাহলে কি করবো", ourReply: "ম্যাম, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো।" },
                { customerMessage: "স্লামালাইকুম ভাইয়া আপনি যে ছবিটা দেখাচ্ছেন এইরকমই আমার টিভির অবস্থা ঠিক করা যাবে কিনা বলেন দোকান কোথায়", ourReply: "আপনার সাথে মনে হয় আগেও আমাদের কথা হয়েছিল।\nআমাদের সার্ভিস অফিস,\nলিফট ০৮,হোসেন টাওয়ার, বক্স কালভার্ট রোড,১১৬ নয়া পল্টন\nঢাকা-১০০০\nফোন নাম্বার :০১৮৮৬৬৬২৮১১\nস্যার/ম্যাম, আগে কি টিভি রিপেয়ার করা হয়েছিল বা কোথাও দেখাইছিলেন রিপেয়ার জন্য।" },
                { customerMessage: "হ্যাঁ একটা হয়েছিল কয়েকদিন দেখার পরে আবারো ঝামেলা হচ্ছে", ourReply: "ম্যাম, তাহলে এটা ফিফটি ফিফটি চান্স আছে রিপিয়ারের, রিপেয়ার হতে পারে আবার নাও হতে পারে" },
                { customerMessage: "ভাইয়া আপনাদের লোক পাঠিয়ে দেন ভিক্ষুক আগে ঠিক হয় কিনা", ourReply: "স্যার/ম্যাম,আমরা টিভি যেসব সমস্যা রিপেয়ার করে থাকি,সেই সমস্যা গুলো হোম সার্ভিস বা বাসায় গিয়ে রিপেয়ার করা সম্ভব না।সমস্যা গুলো ডিজিটাল মেসিন এর মাধ্যমে রিপেয়ার করানো হয়।" },
                { customerMessage: "না ভাইয়া সেটা বলছি না একজন যদি দেখে যেতো আর ঠিক করাতে কত লাগবে সেটা যদি জানতাম তাহলে আপনাদের ওখানে দিয়ে আসতাম", ourReply: "স্যার/ম্যাম,টিভি রিপেয়ার দেওয়া পর বুঝা যাবে কত টাকা লাগতে পারে। আর যদি রিপেয়ার না হয় সেক্ষেত্রে আমাদের কোন টাকা দিতে হবে না।" },
                { customerMessage: "ঠিক আছে ভাইয়া কি করবো সেটা বলেন", ourReply: "ম্যাম আমাদের অফিসে নিয়ে আসতে হবে রিপেয়ারের জন্য\nআর যদি আপনি নিয়ে আসতে না পারেন আমাদের ট্রান্সপোর্ট গাড়ি আছে নিয়ে আসবে এবং দিয়ে আসবে সেজন্য একটা ট্রান্সপোর্ট বিল আপনাকে দিতে হবে" },
                { customerMessage: "আপনারা নিয়ে গেলে কত ভাড়া নিবেন", ourReply: "ম্যাম,নিয়ে যাওয়া আসা মিলে ট্রান্সপোর্ট বিল নিয়ে আসবে এবং দিয়ে আসবে" },
                // ── Emon Rahman ──────────────────────────────────────────────
                { customerMessage: "Picture asa na\nসাউন্ড এর কোন সমস্যা নাই\nটিভি অন করার সনি লেখা আসে আবার চলে যায়", ourReply: "স্যার,টিভি অন্য জায়গায় একবার দেখাইছেন তো ৫০/৫০ রিপেয়ার হযওয়ার সম্ভবনা আচে।\nম্যাম,আাপনার টিভি রিপেয়ার সম্ভবানা আছে,রিপেয়ার জন্য আমাদের সার্ভিস অফিসে নিয়ে আসতে হবে।" },
                { customerMessage: "বাসায় এসে করা যাবে না", ourReply: "স্যার/ম্যাম,আমরা টিভি যেসব সমস্যা রিপেয়ার করে থাকি,সেই সমস্যা গুলো হোম সার্ভিস বা বাসায় গিয়ে রিপেয়ার করা সম্ভব না।সমস্যা গুলো ডিজিটাল মেসিন এর মাধ্যমে রিপেয়ার করানো হয়।" },
                { customerMessage: "টিভি আপনার বাসায় এসে নিয়ে যাবেন খরচ কি রকম পড়বে গ্যারান্টি আছে", ourReply: "স্যার আপনার লোকেশন কোথায়" },
                { customerMessage: "নিকুঞ্জ টু\nরিপেয়ার করতে কত টাকা লাগবে", ourReply: "স্যার আমাদের গাড়ি গিয়ে আপনার টিভিটা রিসিভ করে নিয়ে আসবে এবং দিয়ে আসবে। আর যদি রিপিয়ার না হয় এক্ষেত্রে কোন আমাদের টাকা পেমেন্ট দিতে হবে না শুধু ট্রান্সপোর্ট বিল দিলেই হবে।" },
                { customerMessage: "Noted", ourReply: "জি স্যার জানাইয়েন যদি আবার রিপেয়ার করেন। ফোন নাম্বার দেওয়া আছে একটা কল দিবেন।" },
                // ── SH Chowdhury Sumon ────────────────────────────────────────
                { customerMessage: "Is anyone available to chat?", ourReply: "Assalamualaikum sir apnake amra ki help korte pari ?" },
                { customerMessage: "Phone number please", ourReply: "আমাদের সার্ভিস অফিস,\nলিফট ০৮,হোসেন টাওয়ার, বক্স কালভার্ট রোড,১১৬ নয়া পল্টন\nঢাকা-১০০০\nফোন নাম্বার :০১৮৮৬৬৬২৮১১" },
                // ── Md Bulbul Ahmed ───────────────────────────────────────────
                { customerMessage: "Amr tv sob kichu thik ache just blk dag ai recent dekha jcche\nkoto inch tv sir model number er pic den", ourReply: "ADDRESS: 116, HOSSAIN TOWER (8th FLOOR), NAYA PALTAN BOX CULVERT ROAD, DHAKA-1000\nkoto inch tv sir\nmodel number er pic den ekta" },
                { customerMessage: "Customer sent video showing thin black lines (chikon kalo dag) on TV screen, basai ashe repair koren", ourReply: "Sir er ageo kotha hoise amra bolci.....home service possible hobe nah amader shop e niye ashte hobe" },
                // ── Chandana Jahan ────────────────────────────────────────────
                { customerMessage: "hi\nApnara bashay eshe tv service koren?", ourReply: "Apni caile niye ashte paren amader shop e" },
                { customerMessage: "Ei dhoroner problem e khoroch ki rokom porte parte?\nApnara ki bashay eshe tv niye Jan?", ourReply: "Mam,apner tv kto incci & kon brand er, model number dite parben tahola bistarito bolte subudha hto" },
                { customerMessage: "LG tv 43 inch\nSmart tv kintu android nai", ourReply: "স্যার/ম্যাম, আগে কি টিভি রিপেয়ার করা হয়েছিল বা কোথাও দেখাইছিলেন রিপেয়ার জন্য।" },
                { customerMessage: "Naa", ourReply: "স্যার/ম্যাম,যদি আপনার টিভি রিপেয়ার হয় তাহলে চার্জ হবে, আর যদি রিপেয়ার না হয় সেক্ষেত্রে আমাদের কোন টাকা দিতে হবে না।" },
                { customerMessage: "Thik achhe bhai\nFriday te shop khola thake?", ourReply: "ম্যাম,বন্ধ থাকে তাছাড়া সব দিন খোলা থাকে।" },
                { customerMessage: "Achha\nTahole Saturday dike ashbo", ourReply: "ঠিক আচে ম্যাম, আসার আগে একটা কল করে করবেন।\nআপনার লোকেশন কোথায়?" },
                { customerMessage: "Kemon time lagte pare?\nBadda", ourReply: "ম্যাম,একটু সময় লাগে আসা করি আপনি আসলে সাথে থেকে নিয়ে যেতে পারবেন।\nআমাদের সার্ভিস অফিস, লিফট ০৮,হোসেন টাওয়ার,বক্স কালভার্ট রোড,১১৬ নয়া পল্টন ঢাকা-১০০০ ফোন নাম্বার :০১৮৮৬৬৬২৮১১" },
                // ── Radia Textile ─────────────────────────────────────────────
                { customerMessage: "আমার সনি টেলিভিশন ৪৩ ইঞ্চি মাঝখানে একটা দাগ পড়েছে চিকন ঠিক করা যাবে", ourReply: "ji mam apner tv repair somvob...repair hoyar somvabona besi" },
                { customerMessage: "আপনি কি করতে পারবেন?\nকি রকম খরচ আসতে পারে?", ourReply: "স্যার/ম্যাম,টিভি রিপেয়ার করতে পারবো। আর যদি রিপেয়ার না হয় সেক্ষেত্রে আমাদের কোন টাকা দিতে হবে না।" },
                { customerMessage: "বাসায় এসে কি ঠিক করে দিবেন?", ourReply: "স্যার/ম্যাম,আমরা টিভি যেসব সমস্যা রিপেয়ার করে থাকি,সেই সমস্যা গুলো হোম সার্ভিস বা বাসায় গিয়ে রিপেয়ার করা সম্ভব না।সমস্যা গুলো ডিজিটাল মেসিন এর মাধ্যমে রিপেয়ার করানো হয়।\nমেসিনগুলো অনেক বড়ো কোথাও নিয়ে যাওয়া মতো না।তাই টিভি আমাদের অফিস নিয়ে আসতে হবে" },
                { customerMessage: "ভাইজান আপনাদের অফিসটা কোথায়\nআপনাদের সাথে কথা বললে ভালই লাগলো", ourReply: "আমাদের সার্ভিস অফিস, লিফট ০৮,হোসেন টাওয়ার, বক্স কালভার্ট রোড,১১৬ নয়া পল্টন ঢাকা-১০০০ ফোন নাম্বার :০১৮৮৬৬৬২৮১১" },
                { customerMessage: "কিভাবে বহন করে নিয়ে যাওয়া যায় টিভি\nবড় অনেক", ourReply: "ম্যাম আপনার ঠিকানা কোথায়?" },
                { customerMessage: "বক্স নাই\nআমার বাসা খিলগাঁও আনসার হেডকোয়ার্টারের পাশে", ourReply: "ম্যাম,আপনি চাইলে আমাদের নিজস্ব গাড়ি আছে নিয়ে আসবে এবং দিয়ে আসবে সেজন্যে একটা ট্রান্সপোর্ট বিল দিতে হবে।" },
                { customerMessage: "ভালো তাহলে ট্রান্সপোর্ট বিল দিব", ourReply: "জি ম্যাম তাহলে কালকে গাড়ি পাঠাই দিবো।" },
                { customerMessage: "কালকে না আমি আপনাকে নাম্বার রাখলাম আমি মেসেজ দিব আপনাকে", ourReply: "জি ম্যাম সেটাই ভালো হবে।চাইলে আপনারা আমদের অফিস নিজে এসে কাজ করে নিতে পারবেন।" },
                // ── Facebook user (display damage) ───────────────────────────
                { customerMessage: "Price kemon pore ? Display venge gese", ourReply: "Sir, display damage hole office e niye asun amra check kore bolbo ki kora jabe." },
                { customerMessage: "20k ar modde kisu kora possible?", ourReply: "Sir, tv muloto display dam besi hy, exact bolte hole tv ta dekha lagbe." },
                { customerMessage: "Repair ar Kono option ni?", ourReply: "Sir,apner tv display venggy liquid sera dice ata repair hoy na..." },
                // ── Sayeef Alamin ─────────────────────────────────────────────
                { customerMessage: "LG smart 43\" green line issu", ourReply: "Sir tahola repair kora felen" },
                { customerMessage: "cost kmn? green line problem", ourReply: "স্যার/ম্যাম,টিভি রিপেয়ার দেওয়া পর বুঝা যাবে কত টাকা লাগতে পারে। আর যদি রিপেয়ার না হয় সেক্ষেত্রে আমাদের কোন টাকা দিতে হবে না।" },
                // ── Nahid Eqbal ────────────────────────────────────────────────
                { customerMessage: "Customer sent photo/video of TV — screen completely black, no display, asking about repair", ourReply: "Sir.tv model number ti dia sahajjo korben" },
                { customerMessage: "মডেল নম্বর দিয়েছি।\nদেখেন কি রকম খরচ হইতে পারে", ourReply: "স্যার, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো।" },
                { customerMessage: "আগামীকাল কল দিয়েন\n01722158812", ourReply: "ওকে স্যার,,,,," },
                { customerMessage: "কত লাগবে? TV panel change", ourReply: "Sir new panel change e warranty ache. Office e niye asun, check kore exact charge bolbo." },
                { customerMessage: "01722158812.\nCall diyen. Kotha ache", ourReply: "আমাদের সার্ভিস অফিস,\nলিফট ০৮,হোসেন টাওয়ার, বক্স কালভার্ট রোড,১১৬ নয়া পল্টন\nঢাকা-১০০০\nফোন নাম্বার :০১৮৮৬৬৬২৮১১" },
                // ── Enayet Kabir ───────────────────────────────────────────────
                { customerMessage: "আমার টেলিভিশনটা এরকম হইছে কি সমস্যা মনে হয় ঠিক করতে পারবেন কিনা পারলে কত টাকা লাগবে", ourReply: "স্যার/ম্যাম, টিভি মডেল নাম্বার দিয়ে সহায়তা করবেন। তাহলে আমারা বিস্তারিত বলতে পারবো।\nস্যার, টিভির মডেল সহ সমস্যার একটি ভিডিও দিয়ে সহায়তা করবেন।" },
                { customerMessage: "Customer sent video of TV with distorted/wavy pattern on screen along with Xiaomi Mi TV model box", ourReply: "স্যার, যোগাযোগ করার জন্য আপনার ফোন নাম্বার দিন আমরা কল করবো।" },
            ];

            await this.bulkImportConversations(PHASE2_PAIRS.map(p => ({ ...p, source: 'facebook_page_export_batch2' })));
            console.log('[Brain] Phase 2 conversation seed complete');
        } catch (e: any) {
            console.warn('[Brain] seedPhase2ConversationsIfNeeded failed:', e.message?.slice(0, 80));
        }
    },
};
