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
