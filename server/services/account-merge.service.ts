/**
 * Folding a duplicate customer account into the real one.
 *
 * Two sign-in doors identify a customer by different things. Phone and
 * password key on the phone number, which is unique and is what every other
 * part of this system uses — repairs, jobs, POS, intake. Google keys on the
 * Google id, falls back to a matching email, and failing both simply makes a
 * new account. Registration does not require an email, so most phone customers
 * have none, and the fallback misses: the same person taps "Continue with
 * Google" and lands in a second, empty account.
 *
 * They then get asked for their phone number, type their real one, and the
 * unique constraint refuses it — so they are stranded in a duplicate they can
 * neither fill in nor leave.
 *
 * This moves everything the duplicate owns onto the real account, hands over
 * the Google keys, and retires the duplicate.
 *
 * Three rules hold it together:
 *
 *   It refuses ambiguity. If both rows carry a phone number they are two
 *   identities, not one person twice, and no automatic rule can tell a
 *   duplicate from a family member. Those are for a human.
 *
 *   It discovers what to move rather than listing it. Every column named
 *   customer_id or user_id in the database is rewritten, so a table added next
 *   year is carried without anybody remembering to edit this file. Safe because
 *   the source is always a customer-only row: it cannot own an attendance
 *   record or a salary line.
 *
 *   It writes down every row it moved, by id, before committing. A merge is the
 *   one operation here that no later edit can undo, so the record is what makes
 *   it reversible — and it is written inside the same transaction, because a
 *   merge whose record failed to save is exactly the merge nobody can unpick.
 */
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";

import { db } from "../db.js";
import { NO_CUSTOMER_PASSWORD } from "./customer-password.js";

/**
 * Tables whose customer_id / user_id must NOT be rewritten.
 *
 * audit_logs and the merge record itself are history: they say what a given
 * account did at the time, and moving them would rewrite the past. Reset links
 * are credentials — they are killed rather than carried. otp_codes are keyed by
 * phone, not by user.
 */
const NEVER_REWRITE = new Set([
    "users",
    "audit_logs",
    "sessions",
    "session",
    "otp_codes",
    "customer_reset_links",
]);

const OWNER_COLUMNS = ["customer_id", "user_id"];

export type MergeMove = { table: string; column: string; ids: string[]; count: number };

export type MergePlan = {
    sourceId: string;
    targetId: string;
    /** What the duplicate owns, by table. */
    moves: MergeMove[];
    /** Identity keys the duplicate holds that the real account is missing. */
    identity: Record<string, string | null>;
    totalRows: number;
};

export type MergeRefusal = { ok: false; reason: string };
export type MergeOk = { ok: true; plan: MergePlan; mergeId: string };

async function loadCustomer(tx: any, id: string) {
    const res = await tx.execute(sql`
        SELECT id, name, role, phone, phone_normalized, email, password,
               google_sub, firebase_uid, profile_image_url, address,
               customer_account_state, status
        FROM users WHERE id = ${id} LIMIT 1
    `);
    return ((res as any).rows ?? res)[0];
}

/**
 * Which tables carry a customer's rows, asked of the database itself.
 *
 * information_schema rather than the Drizzle model: several tables in this
 * system are created by the migration runner and never declared in
 * shared/schema.ts, and those hold customer rows too.
 */
async function ownerColumns(tx: any): Promise<Array<{ table: string; column: string; hasId: boolean }>> {
    const res = await tx.execute(sql`
        SELECT c.table_name, c.column_name,
               EXISTS (
                   SELECT 1 FROM information_schema.columns k
                   WHERE k.table_schema = 'public' AND k.table_name = c.table_name
                     AND k.column_name = 'id'
               ) AS has_id
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_name IN ('customer_id', 'user_id')
        ORDER BY c.table_name, c.column_name
    `);
    const rows = ((res as any).rows ?? res) as Array<{ table_name: string; column_name: string; has_id: boolean }>;
    return rows
        .filter((r) => !NEVER_REWRITE.has(r.table_name))
        .map((r) => ({ table: r.table_name, column: r.column_name, hasId: r.has_id === true }));
}

/**
 * What a merge would do, without doing it.
 *
 * Read-only, so it can back a report the shop reads before anything is
 * committed, and so the same rules decide both the preview and the act.
 */
export async function planMerge(sourceId: string, targetId: string): Promise<MergePlan | MergeRefusal> {
    return db.transaction(async (tx: any) => planMergeIn(tx, sourceId, targetId));
}

async function planMergeIn(tx: any, sourceId: string, targetId: string): Promise<MergePlan | MergeRefusal> {
    if (sourceId === targetId) return { ok: false, reason: "same_account" };

    const source = await loadCustomer(tx, sourceId);
    const target = await loadCustomer(tx, targetId);

    if (!source || !target) return { ok: false, reason: "not_found" };
    if (source.role !== "Customer" || target.role !== "Customer") return { ok: false, reason: "not_a_customer" };
    if (source.customer_account_state === "merged") return { ok: false, reason: "already_merged" };

    /**
     * The guardrail. Two rows that each carry a phone number are two
     * identities: the shop knows customers by phone, and nothing here can tell
     * "the same person twice" from "two people who share an email address".
     */
    if (source.phone) return { ok: false, reason: "source_has_phone" };
    if (!target.phone) return { ok: false, reason: "target_has_no_phone" };

    const moves: MergeMove[] = [];
    for (const { table, column, hasId } of await ownerColumns(tx)) {
        const res = await tx.execute(
            hasId
                ? sql`SELECT id::text AS id FROM ${sql.raw(`"${table}"`)} WHERE ${sql.raw(`"${column}"`)} = ${sourceId}`
                : sql`SELECT count(*)::text AS id FROM ${sql.raw(`"${table}"`)} WHERE ${sql.raw(`"${column}"`)} = ${sourceId}`,
        );
        const rows = ((res as any).rows ?? res) as Array<{ id: string }>;
        if (hasId) {
            if (rows.length > 0) moves.push({ table, column, ids: rows.map((r) => r.id), count: rows.length });
        } else {
            const n = Number(rows[0]?.id ?? 0);
            if (n > 0) moves.push({ table, column, ids: [], count: n });
        }
    }

    // Only what the real account is missing. A Google display name must not
    // overwrite the name the shop wrote on the repair docket.
    const identity: Record<string, string | null> = {};
    for (const [col, value] of [
        ["google_sub", source.google_sub],
        ["firebase_uid", source.firebase_uid],
        ["email", source.email],
        ["profile_image_url", source.profile_image_url],
        ["address", source.address],
    ] as const) {
        if (value && !target[col]) identity[col] = value;
    }

    return {
        sourceId,
        targetId,
        moves,
        identity,
        totalRows: moves.reduce((sum, m) => sum + m.count, 0),
    };
}

/**
 * Do it, in one transaction, with the record written before the commit.
 */
export async function mergeCustomerAccounts(input: {
    sourceId: string;
    targetId: string;
    actorId: string;
    reason: string;
}): Promise<MergeOk | MergeRefusal> {
    return db.transaction(async (tx: any) => {
        /**
         * Both rows are locked before anything is read. Without this, two
         * merges racing on the same duplicate would each plan against a row the
         * other is about to move, and the second would commit an empty merge
         * over the first.
         */
        await tx.execute(sql`
            SELECT id FROM users WHERE id IN (${input.sourceId}, ${input.targetId}) FOR UPDATE
        `);

        const plan = await planMergeIn(tx, input.sourceId, input.targetId);
        if ("ok" in plan) return plan;

        for (const move of plan.moves) {
            await tx.execute(sql`
                UPDATE ${sql.raw(`"${move.table}"`)}
                SET ${sql.raw(`"${move.column}"`)} = ${input.targetId}
                WHERE ${sql.raw(`"${move.column}"`)} = ${input.sourceId}
            `);
        }

        // Identity keys move before the source is cleared: google_sub and
        // firebase_uid are unique columns, so both rows cannot hold one.
        await tx.execute(sql`
            UPDATE users SET google_sub = NULL, firebase_uid = NULL WHERE id = ${input.sourceId}
        `);
        for (const [col, value] of Object.entries(plan.identity)) {
            await tx.execute(sql`
                UPDATE users SET ${sql.raw(`"${col}"`)} = ${value} WHERE id = ${input.targetId}
            `);
        }

        /**
         * The duplicate is retired, not deleted. Deleting it would break every
         * report that already counted it, and would take the merge record's own
         * subject away. It can never be signed into again: no keys, no usable
         * password, and a state no login path accepts.
         */
        await tx.execute(sql`
            UPDATE users
            SET customer_account_state = 'merged',
                status = 'Merged',
                password = ${NO_CUSTOMER_PASSWORD},
                username = NULL
            WHERE id = ${input.sourceId}
        `);

        // Any live reset link on either row dies with the merge — the account it
        // was minted against is not the account it would now open.
        await tx.execute(sql`
            UPDATE customer_reset_links
            SET invalidated_at = NOW(), invalidated_reason = 'account_merged'
            WHERE user_id IN (${input.sourceId}, ${input.targetId})
              AND consumed_at IS NULL AND invalidated_at IS NULL
        `);

        /**
         * Written inside the transaction, by hand rather than through
         * auditLogger, which swallows its own failures. A merge whose record
         * did not save is the merge nobody can unpick.
         */
        const mergeId = randomUUID();
        await tx.execute(sql`
            INSERT INTO audit_logs (id, user_id, action, entity, entity_id, details, changes, severity, created_at)
            VALUES (
                ${mergeId}, ${input.actorId}, 'ACTION', 'CustomerAccountMerge', ${input.targetId},
                ${`Merged duplicate ${input.sourceId} into ${input.targetId}: ${plan.totalRows} row(s). ${input.reason}`},
                ${JSON.stringify({ old: { sourceId: input.sourceId }, new: { targetId: input.targetId, moves: plan.moves, identity: plan.identity } })}::jsonb,
                'warning', NOW()
            )
        `);

        return { ok: true as const, plan, mergeId };
    });
}

/**
 * Duplicates that can be paired without a human deciding.
 *
 * Note what this can and cannot find. The bug creates duplicates precisely
 * BECAUSE nothing matched — a shared email would have made the login link the
 * two accounts instead of making a new one. So the only pairs here are the ones
 * where an email was added to the real account afterwards, or which predate the
 * email fallback.
 *
 * Everything else needs the customer present: they sign in with Google, enter
 * the code the shop reads them, and the merge happens with their consent. There
 * is no query that can safely guess the rest, and a query that guessed would
 * hand one customer another customer's repair history.
 */
export type DuplicateCandidate = {
    sourceId: string;
    targetId: string;
    email: string;
    sourceName: string;
    targetName: string;
    targetPhone: string;
};

export async function findAutoMergeableDuplicates(): Promise<DuplicateCandidate[]> {
    const res = await db.execute(sql`
        WITH orphans AS (
            SELECT id, name, lower(btrim(email)) AS email
            FROM users
            WHERE role = 'Customer'
              AND phone IS NULL
              AND customer_account_state <> 'merged'
              AND (google_sub IS NOT NULL OR firebase_uid IS NOT NULL)
              AND email IS NOT NULL AND btrim(email) <> ''
        ),
        anchored AS (
            SELECT id, name, phone, lower(btrim(email)) AS email
            FROM users
            WHERE role = 'Customer'
              AND phone IS NOT NULL
              AND customer_account_state <> 'merged'
              AND email IS NOT NULL AND btrim(email) <> ''
        )
        SELECT o.id AS source_id, a.id AS target_id, o.email,
               o.name AS source_name, a.name AS target_name, a.phone AS target_phone
        FROM orphans o
        JOIN anchored a ON a.email = o.email
        -- Exactly one real account for that address. Two would mean guessing,
        -- and guessing here moves somebody's repair history onto a stranger.
        WHERE (SELECT count(*) FROM anchored a2 WHERE a2.email = o.email) = 1
          AND (SELECT count(*) FROM orphans o2 WHERE o2.email = o.email) = 1
    `);
    const rows = ((res as any).rows ?? res) as any[];
    return rows.map((r) => ({
        sourceId: r.source_id,
        targetId: r.target_id,
        email: r.email,
        sourceName: r.source_name,
        targetName: r.target_name,
        targetPhone: r.target_phone,
    }));
}
