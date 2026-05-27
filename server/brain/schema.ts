import { pgTable, text, timestamp, uuid, integer, real, jsonb, boolean } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

export const conversations = pgTable('conversations', {
    id: uuid('id').primaryKey().defaultRandom(),

    customerMessage: text('customer_message').notNull(),
    ourReply: text('our_reply').notNull(),

    senderPsid: text('sender_psid'),
    senderName: text('sender_name'),
    channel: text('channel').default('messenger'),

    category: text('category'),
    sentiment: text('sentiment'),
    intent: text('intent'),
    language: text('language'),

    isGoodExample: boolean('is_good_example').default(true),
    wasEdited: boolean('was_edited').default(false),
    editedReply: text('edited_reply'),
    repliedBy: text('replied_by').default('human'), // 'human', 'ai', 'ai_edited'

    embedding: vector('embedding', { dimensions: 768 }),

    createdAt: timestamp('created_at').defaultNow(),
});

export const sessions = pgTable('sessions', {
    id: uuid('id').primaryKey().defaultRandom(),

    senderPsid: text('sender_psid').notNull().unique(),
    senderName: text('sender_name'),

    history: jsonb('history').default([]),

    messageCount: integer('message_count').default(0),
    lastMessageAt: timestamp('last_message_at').defaultNow(),
    firstMessageAt: timestamp('first_message_at').defaultNow(),

    detectedLanguage: text('detected_language'),
    customerPhone: text('customer_phone'),
    customerIssues: jsonb('customer_issues').default([]),

    // Phase 6: commission tracking — which staff handled this Messenger conversation
    claimedByUserId: text('claimed_by_user_id'),
    claimedByName: text('claimed_by_name'),
    claimedAt: timestamp('claimed_at'),
    needsClaim: boolean('needs_claim').default(false), // set true when human replies
});

export const knowledge = pgTable('knowledge', {
    id: uuid('id').primaryKey().defaultRandom(),

    topic: text('topic').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),

    embedding: vector('embedding', { dimensions: 768 }),

    source: text('source'),
    isActive: boolean('is_active').default(true),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const brainConfig = pgTable('brain_config', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const shadowDrafts = pgTable('shadow_drafts', {
    id: uuid('id').primaryKey().defaultRandom(),

    senderPsid: text('sender_psid').notNull(),
    customerMessage: text('customer_message').notNull(),
    aiDraft: text('ai_draft').notNull(),

    // 'pending', 'approved', 'rejected', 'expired'
    status: text('status').default('pending').notNull(),

    adminEditedReply: text('admin_edited_reply'),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

// -------------------------------------------------------------
// Knowledge Graph — atomic facts (admin-curated shop knowledge)
// -------------------------------------------------------------
export const kgFacts = pgTable('kg_facts', {
    id: uuid('id').primaryKey().defaultRandom(),

    subject: text('subject').notNull(),        // "Samsung Q70 2018"
    predicate: text('predicate').notNull(),    // "STATUS" | "VERDICT" | "PRICE" | "ISSUE"
    value: text('value').notNull(),            // "BLACKLISTED" | "8000-12000 BDT"

    tags: text('tags').array().notNull().default([]),
    confidence: real('confidence').default(1.0),
    source: text('source').default('admin'),   // 'admin' | 'csv' | 'inferred'
    createdBy: text('created_by'),

    createdAt: timestamp('created_at').defaultNow(),
    expiresAt: timestamp('expires_at'),
});

// -------------------------------------------------------------
// Brain Messages — per-session conversation history (full, isolated)
// -------------------------------------------------------------
export const brainMessages = pgTable('brain_messages', {
    id: uuid('id').primaryKey().defaultRandom(),

    sessionId: text('session_id').notNull(),
    role: text('role').notNull(),              // 'user' | 'ai'
    content: text('content').notNull(),
    hasImage: boolean('has_image').default(false),
    imageUrl: text('image_url'),

    createdAt: timestamp('created_at').defaultNow(),
});
