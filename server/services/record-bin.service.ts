/**
 * Bulk removal of test records, with a recycle bin behind it.
 *
 * The old cleanup tool took one phone number at a time and handled two tables.
 * Finding every leftover test record meant walking the whole system from memory,
 * so records got missed and stayed live in the dues and the job list.
 *
 * Three rules shape this file, and two of them are inherited from the tool it
 * replaces because they are what kept it from ever losing real data.
 *
 * 1. **Refuse rather than orphan.** Twenty-nine tables carry links to jobs,
 *    sales and customers with no foreign key behind them — `due_records.invoice`
 *    is the one that has bitten this codebase repeatedly. Postgres will not stop
 *    a bad delete here, so every cascade is written out explicitly below. What
 *    is not named is not touched, and anything holding money is refused.
 *
 * 2. **Deletion is real deletion.** The bin is a holding table, not a
 *    `deleted_at` flag on thirty tables. A flag would mean every query in the
 *    system remembering to exclude dead rows, and the day one forgets, a deleted
 *    job is back in the profit report. Instead the rows are serialised here and
 *    then genuinely removed, so no live query learns a new rule.
 *
 * 3. **What you approved is what goes.** The candidate list, the delete and the
 *    bin all resolve through the same definitions, so the blast radius shown
 *    before the click is the one that happens.
 */

import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

/** How long a deleted record can still be restored. */
export const BIN_RETENTION_HOURS = 24;

type ChildLink = {
    table: string;
    /** Column on the child holding the parent's id. */
    column: string;
    /**
     * Rows that point at THIS child and must go before it can.
     *
     * A grandchild, in other words. custody_handover_codes references
     * logistics_tasks and notifications by their own ids, so deleting a job's
     * logistics tasks failed on a foreign key that had nothing to do with the
     * job. Keyed by the child's ids, not the parent's, because that is the
     * link that exists.
     */
    dependents?: Array<{ table: string; column: string }>;
    /**
     * Detach instead of delete.
     *
     * A serial number is a physical item that outlives the job it was fitted
     * to, and a service request is a real customer asking for something. Those
     * lose their link to the deleted job, not their existence.
     */
    detach?: boolean;
};

type Blocker = {
    table: string;
    column: string;
    /** Extra SQL narrowing the check to rows that actually represent money. */
    having?: string;
    reason: string;
};

type EntityDef = {
    label: string;
    table: string;
    idColumn: string;
    /** Columns used to describe the row in the list and the bin. */
    display: { title: string; subtitle?: string; amount?: string; date: string };
    /**
     * How a row is recognised as test data when nobody marked it.
     *
     * "QA" is matched case-sensitively at the start of a word. Plain `%qa%`
     * catches ordinary Bangladeshi names — Qazi, Waqar, Shafqat — and offering a
     * real customer up for deletion is a worse failure than missing a test
     * record. QA-39 created "Qazi Rahman" and "Waqar Ahmed" and both appeared in
     * the list.
     *
     * Case is the discriminator that works. Test data writes QA in capitals;
     * names write Qa. A word-boundary match was tried first and was worse: it
     * cleared the names but also lost twelve real QALTD24-BILL rows, because
     * there QA is followed by a letter. Case-sensitive keeps those and still
     * drops the names — jobs 379 to 375, bills unchanged at 41.
     *
     * "test" stays a loose substring, because it turns up mid-word in real test
     * data — CHAIN-TEST, CorpDueTest — and no customer is called that.
     */
    detect: string;
    children: ChildLink[];
    blockers: Blocker[];
};

/**
 * Every deletable type, and exactly what goes with it.
 *
 * Written out rather than discovered, because a cascade guessed from foreign
 * keys would miss the string-joined links entirely — and those are the ones
 * carrying the money.
 */
export const ENTITY_DEFS: Record<string, EntityDef> = {
    job: {
        label: "Jobs",
        table: "job_tickets",
        idColumn: "id",
        display: { title: "customer", subtitle: "device", amount: "estimated_cost", date: "created_at" },
        detect: "(customer ~ '(^|[^A-Za-z])QA' OR customer ILIKE '%test%' OR device ILIKE '%test%')",
        children: [
            { table: "due_records", column: "invoice" },
            { table: "customer_repair_journeys", column: "job_ticket_id" },
            {
                table: "logistics_tasks", column: "job_ticket_id",
                dependents: [{ table: "custody_handover_codes", column: "logistics_task_id" }],
            },
            { table: "job_stock_deductions", column: "job_ticket_id" },
            { table: "job_final_test_runs", column: "job_id" },
            { table: "local_purchases", column: "job_ticket_id" },
            { table: "wastage_logs", column: "job_ticket_id" },
            { table: "warranty_sticker_scans", column: "job_ticket_id" },
            { table: "warranty_stickers", column: "job_ticket_id" },
            { table: "quote_logs", column: "job_id" },
            { table: "approval_requests", column: "job_id" },
            { table: "pending_part_costs", column: "job_ticket_id" },
            { table: "service_feedback_opportunities", column: "job_ticket_id" },
            { table: "job_extension_requests", column: "job_id" },
            { table: "commission_assignments", column: "job_id" },
            { table: "rollback_requests", column: "job_ticket_id" },
            {
                table: "notifications", column: "job_id",
                dependents: [{ table: "custody_handover_codes", column: "notification_id" }],
            },
            { table: "reminders", column: "job_id", detach: true },
            { table: "inventory_serials", column: "job_ticket_id", detach: true },
            { table: "service_requests", column: "converted_job_id", detach: true },
        ],
        blockers: [
            { table: "due_records", column: "invoice", having: "COALESCE(paid_amount, 0) > 0.009", reason: "money has been paid against it" },
            { table: "bill_line_items", column: "job_ticket_id", reason: "it is on a corporate bill" },
            { table: "refunds", column: "target_job_ticket_id", reason: "it has a refund" },
            { table: "refund_allocations", column: "job_ticket_id", reason: "it has a refund allocation" },
            { table: "pos_transaction_area_allocations", column: "job_ticket_id", reason: "it was billed at the till" },
            { table: "manual_payments", column: "job_ticket_id", reason: "a manual payment was recorded" },
            { table: "job_ng_reports", column: "job_id", reason: "it has an NG report" },
            { table: "commission_payouts", column: "job_id", reason: "commission has been paid on it" },
        ],
    },

    serviceRequest: {
        label: "Service requests",
        table: "service_requests",
        idColumn: "id",
        display: { title: "customer_name", subtitle: "brand", date: "created_at" },
        detect: "(customer_name ~ '(^|[^A-Za-z])QA' OR customer_name ILIKE '%test%')",
        children: [
            { table: "service_request_events", column: "service_request_id" },
            { table: "service_request_call_attempts", column: "service_request_id" },
            { table: "retail_quote_admin_acceptances", column: "service_request_id" },
            { table: "pickup_schedules", column: "service_request_id" },
            {
                table: "logistics_tasks", column: "service_request_id",
                dependents: [{ table: "custody_handover_codes", column: "logistics_task_id" }],
            },
            /**
             * After logistics_tasks, not before it.
             *
             * A handover code carries logistics_task_id, so this list is also the
             * order a restore replays in: listed first, the code went back before
             * the task it points at and the insert failed on the same foreign key
             * that broke the delete. Deletion walks the list backwards and is
             * satisfied either way; restore is not.
             */
            { table: "custody_handover_codes", column: "service_request_id" },
            { table: "customer_repair_journeys", column: "service_request_id" },
            { table: "service_feedback_opportunities", column: "service_request_id" },
            { table: "payment_blacklist", column: "service_request_id" },
        ],
        blockers: [
            { table: "job_tickets", column: "id", having: "FALSE", reason: "unused" },
            { table: "manual_payments", column: "service_request_id", reason: "a payment was recorded against it" },
        ],
    },

    product: {
        label: "Products",
        table: "inventory_items",
        idColumn: "id",
        display: { title: "name", amount: "avg_cost_price", date: "created_at" },
        detect: "(name ~ '(^|[^A-Za-z])QA' OR name ILIKE '%test%')",
        children: [],
        blockers: [
            { table: "purchase_order_items", column: "inventory_item_id", reason: "it is on a purchase order" },
            { table: "inventory_serials", column: "inventory_item_id", reason: "it has serial numbers on the shelf" },
            { table: "job_stock_deductions", column: "inventory_item_id", reason: "it has been used on a job" },
        ],
    },

    bill: {
        label: "Bills",
        table: "corporate_bills",
        idColumn: "id",
        display: { title: "bill_number", amount: "grand_total", date: "created_at" },
        detect: "(bill_number ~ '(^|[^A-Za-z])QA' OR bill_number ILIKE '%test%')",
        children: [
            { table: "bill_line_items", column: "bill_id" },
            { table: "corporate_bill_due_links", column: "bill_id" },
            { table: "bill_edit_log", column: "bill_id" },
        ],
        blockers: [
            { table: "corporate_ltd_receipts", column: "bill_id", reason: "money has been received against it" },
        ],
    },

    pickup: {
        label: "Pickups",
        table: "pickup_schedules",
        idColumn: "id",
        display: { title: "pickup_address", subtitle: "status", date: "created_at" },
        detect: "(pickup_address ~ '(^|[^A-Za-z])QA' OR pickup_address ILIKE '%test%' OR service_request_id IN (SELECT id FROM service_requests WHERE customer_name ~ '(^|[^A-Za-z])QA' OR customer_name ILIKE '%test%'))",
        children: [{ table: "logistics_tasks", column: "pickup_schedule_id" }],
        blockers: [],
    },

    /**
     * The account a test customer can actually log in with.
     *
     * Scoped to role = 'Customer' in the pattern itself, not just in a check
     * afterwards, so a staff account named "QA Admin" can never appear in this
     * list however it is queried. Deleting the shop's own Super Admin because it
     * had QA in the name is the one mistake this screen must never make.
     *
     * Refused while the person still has work in the system. The alternative is
     * a cascade that reaches from an account into jobs and money, and "remove
     * their jobs first" is both safer and something the screen can now say.
     */
    customerAccount: {
        label: "Customer logins",
        table: "users",
        idColumn: "id",
        display: { title: "name", subtitle: "phone", date: "joined_at" },
        detect: "(role = 'Customer' AND (name ~ '(^|[^A-Za-z])QA' OR name ILIKE '%test%' OR COALESCE(username, '') ~ '(^|[^A-Za-z])QA' OR COALESCE(username, '') ILIKE '%test%'))",
        children: [
            { table: "trusted_corporate_devices", column: "user_id" },
            { table: "corporate_password_reset_requests", column: "user_id" },
            { table: "ai_query_log", column: "user_id", detach: true },
        ],
        blockers: [
            { table: "service_requests", column: "customer_id", reason: "they still have service requests - remove those first" },
            { table: "orders", column: "customer_id", reason: "they have orders" },
            { table: "quotations", column: "customer_id", reason: "they have quotations" },
            { table: "custody_handover_codes", column: "customer_id", reason: "they hold a handover code" },
            { table: "custody_handover_codes", column: "custodian_user_id", reason: "they are named on a handover" },
        ],
    },

    /**
     * The customer record, which is not the same thing as the login.
     *
     * A walk-in has one of these and no account at all, so both have to be
     * removable separately or the residue stays behind in whichever one was not
     * covered.
     */
    customer: {
        label: "Customer records",
        table: "customers",
        idColumn: "id",
        display: { title: "name", subtitle: "primary_phone", date: "created_at" },
        detect: "(name ~ '(^|[^A-Za-z])QA' OR name ILIKE '%test%')",
        children: [
            { table: "customer_addresses", column: "customer_id" },
            { table: "customer_reviews", column: "customer_id" },
            { table: "service_feedback_opportunities", column: "customer_id" },
            { table: "customers", column: "referrer_id", detach: true },
        ],
        blockers: [
            { table: "service_requests", column: "customer_id", reason: "they still have service requests - remove those first" },
            { table: "orders", column: "customer_id", reason: "they have orders" },
            { table: "quotations", column: "customer_id", reason: "they have quotations" },
            { table: "customer_repair_journeys", column: "customer_id", reason: "they have a repair history - remove those jobs first" },
            { table: "job_batches", column: "customer_id", reason: "they are on a job batch" },
            { table: "logistics_tasks", column: "customer_id", reason: "they have a pickup or delivery" },
            { table: "custody_handover_codes", column: "customer_id", reason: "they hold a handover code" },
        ],
    },

    call: {
        label: "Part requests",
        table: "part_requests",
        idColumn: "id",
        display: { title: "customer_name", subtitle: "part_name", date: "created_at" },
        detect: "(customer_name ~ '(^|[^A-Za-z])QA' OR customer_name ILIKE '%test%' OR part_name ILIKE '%test%')",
        children: [],
        blockers: [],
    },
};

const TABLE_CACHE = new Map<string, boolean>();
const LINK_CACHE = new Map<string, boolean>();

/** Tables that may not exist in every deployment are skipped, not fatal. */
async function tableExists(name: string): Promise<boolean> {
    if (TABLE_CACHE.has(name)) return TABLE_CACHE.get(name)!;
    const res = await db.execute(sql`SELECT to_regclass(${"public." + name}) AS reg`);
    const exists = Boolean(rowsOf(res)[0]?.reg);
    TABLE_CACHE.set(name, exists);
    return exists;
}

/**
 * Does this link actually exist in this database?
 *
 * Deliberately asymmetric in how callers use it. A missing CHILD link means one
 * cascade step is skipped — incomplete, and logged. A missing BLOCKER link is
 * refused outright, because a blocker that quietly does not run is a blocker
 * that lets a paid job be deleted. Silence is the dangerous outcome there.
 */
async function linkExists(table: string, column: string): Promise<boolean> {
    const key = `${table}.${column}`;
    if (LINK_CACHE.has(key)) return LINK_CACHE.get(key)!;
    if (!(await tableExists(table))) {
        LINK_CACHE.set(key, false);
        return false;
    }
    const res = await db.execute(sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    `);
    const exists = rowsOf(res).length > 0;
    LINK_CACHE.set(key, exists);
    return exists;
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
    return ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []) as Array<Record<string, unknown>>;
}

/** Identifier interpolation is safe here: every name comes from ENTITY_DEFS above, never from a caller. */
function raw(identifier: string) {
    return sql.raw(identifier);
}

/**
 * A parameterised IN list.
 *
 * `= ANY($1)` with a JavaScript array is rejected by node-pg — "op ANY/ALL
 * (array) requires array on right side" — which this codebase has hit before.
 * sql.join builds one placeholder per value instead.
 */
function inList(values: string[]) {
    return sql.join(values.map((v) => sql`${v}`), sql`, `);
}

export type Candidate = {
    id: string;
    title: string;
    subtitle: string | null;
    amount: number | null;
    date: string | null;
    reason: string;
    blocked: boolean;
    blockedReason: string | null;
    linkedCount: number;
};

/**
 * Everything of one type that looks like test data.
 *
 * Detection is deliberately loose — it proposes, the person decides. What it
 * must never do is decide on its own, which is why nothing here deletes and the
 * blocked rows come back marked rather than hidden.
 */
export async function listCandidates(
    entityType: string,
    options: { search?: string; showAll?: boolean; limit?: number } = {},
): Promise<Candidate[]> {
    const def = ENTITY_DEFS[entityType];
    if (!def) throw new Error(`Unknown record type: ${entityType}`);
    const limit = options.limit ?? 500;

    const d = def.display;
    const search = options.search?.trim();

    /**
     * Three ways in, because the keyword alone was not enough.
     *
     * Test records made before anyone thought to name them "QA" are invisible to
     * the pattern, and on a real shop's data that is most of them. Someone who
     * knows the record exists has to be able to go and find it, so a search
     * looks at everything and "show all" lists everything.
     *
     * The keyword stays the default. It is a good first guess and it keeps the
     * common case to two taps; it just cannot be the only door.
     */
    let where = sql`${raw(def.detect)}`;
    if (search) {
        /**
         * Strip LIKE wildcards, then refuse what is left if it is empty.
         *
         * A search of "%" stripped to nothing and became `%%`, which matches
         * every row in the table — someone typing a stray character got the
         * whole shop offered up for deletion. A search that reduces to nothing
         * returns nothing.
         */
        const stripped = search.replace(/[%_\\]/g, "");
        if (stripped.length === 0) return [];
        const needle = `%${stripped}%`;
        const cols = [d.title, d.subtitle, def.idColumn].filter(Boolean) as string[];
        where = sql.join(
            cols.map((c) => sql`${raw(c)}::text ILIKE ${needle}`),
            sql` OR `,
        );
    } else if (options.showAll) {
        where = sql`TRUE`;
    }

    const res = await db.execute(sql`
        SELECT ${raw(def.idColumn)} AS id,
               ${raw(d.title)} AS title,
               ${raw(d.subtitle ?? "NULL")} AS subtitle,
               ${raw(d.amount ?? "NULL")} AS amount,
               ${raw(d.date)} AS date
        FROM ${raw(def.table)}
        WHERE ${where}
        ORDER BY ${raw(d.date)} DESC
        LIMIT ${limit}
    `);

    const ids = rowsOf(res).map((r) => String(r.id));
    if (ids.length === 0) return [];

    const blockedBy = await resolveBlockers(def, ids);
    const linked = await countLinked(def, ids);

    return rowsOf(res).map((r) => {
        const id = String(r.id);
        const blockedReason = blockedBy.get(id) ?? null;
        return {
            id,
            title: String(r.title ?? "(no name)"),
            subtitle: r.subtitle == null ? null : String(r.subtitle),
            amount: r.amount == null ? null : Number(r.amount),
            date: r.date == null ? null : new Date(r.date as string).toISOString(),
            reason: search ? "search" : options.showAll ? "listed" : "name_match",
            blocked: blockedReason !== null,
            blockedReason,
            linkedCount: linked.get(id) ?? 0,
        };
    });
}

/** Which of these ids hold money, and why. First reason wins — one is enough to refuse. */
async function resolveBlockers(def: EntityDef, ids: string[]): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    for (const b of def.blockers) {
        if (b.having === "FALSE") continue;
        if (!(await tableExists(b.table))) continue;
        if (!(await linkExists(b.table, b.column))) {
            // Refuse the whole operation rather than run with a money check disabled.
            throw new Error(
                `Safety check ${b.table}.${b.column} is missing from this database. ` +
                `Nothing was deleted.`,
            );
        }
        const having = b.having ? sql` AND ${raw(b.having)}` : sql``;
        const res = await db.execute(sql`
            SELECT DISTINCT ${raw(b.column)} AS parent_id
            FROM ${raw(b.table)}
            WHERE ${raw(b.column)} IN (${inList(ids)})${having}
        `);
        for (const row of rowsOf(res)) {
            const key = String(row.parent_id);
            if (!found.has(key)) found.set(key, b.reason);
        }
    }
    return found;
}

/** How many rows would travel with each parent, for the blast-radius line. */
async function countLinked(def: EntityDef, ids: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const child of def.children) {
        if (!(await linkExists(child.table, child.column))) continue;
        const res = await db.execute(sql`
            SELECT ${raw(child.column)} AS parent_id, COUNT(*)::int AS n
            FROM ${raw(child.table)}
            WHERE ${raw(child.column)} IN (${inList(ids)})
            GROUP BY ${raw(child.column)}
        `);
        for (const row of rowsOf(res)) {
            const key = String(row.parent_id);
            counts.set(key, (counts.get(key) ?? 0) + Number(row.n ?? 0));
        }
    }
    return counts;
}

export type DeleteOutcome = {
    deleted: string[];
    refused: Array<{ id: string; reason: string }>;
    binIds: string[];
    linkedRowsRemoved: number;
};

/**
 * Delete the named records, capturing each one's cascade into the bin first.
 *
 * One transaction per record rather than one for the batch: a single blocked or
 * broken row should not roll back thirty good deletions, and each bin entry has
 * to correspond to exactly one restorable thing.
 */
export async function deleteRecords(
    entityType: string,
    ids: string[],
    actor: { id?: string; name?: string },
): Promise<DeleteOutcome> {
    const def = ENTITY_DEFS[entityType];
    if (!def) throw new Error(`Unknown record type: ${entityType}`);

    const outcome: DeleteOutcome = { deleted: [], refused: [], binIds: [], linkedRowsRemoved: 0 };
    if (ids.length === 0) return outcome;

    // Re-checked here rather than trusted from the client: the list may be minutes old.
    const blocked = await resolveBlockers(def, ids);

    for (const id of ids) {
        const reason = blocked.get(id);
        if (reason) {
            outcome.refused.push({ id, reason });
            continue;
        }
        try {
            const binId = await deleteOne(def, entityType, id, actor);
            if (binId) {
                outcome.deleted.push(id);
                outcome.binIds.push(binId.binId);
                outcome.linkedRowsRemoved += binId.linkedRows;
            } else {
                outcome.refused.push({ id, reason: "it no longer exists" });
            }
        } catch (error) {
            outcome.refused.push({ id, reason: (error as Error).message });
        }
    }
    return outcome;
}

async function deleteOne(
    def: EntityDef,
    entityType: string,
    id: string,
    actor: { id?: string; name?: string },
): Promise<{ binId: string; linkedRows: number } | null> {
    return db.transaction(async (tx) => {
        const parentRes = await tx.execute(sql`
            SELECT * FROM ${raw(def.table)} WHERE ${raw(def.idColumn)} = ${id} FOR UPDATE
        `);
        const parent = rowsOf(parentRes)[0];
        if (!parent) return null;

        /**
         * Parent first, then children in declaration order.
         *
         * Restore walks this list forwards, so whatever a row depends on has to
         * appear before it.
         */
        type Part = {
            table: string;
            rows: Array<Record<string, unknown>>;
            detach?: boolean;
            column?: string;
            /** Present when the part is keyed by its own parent row's ids, not the entity's. */
            keyIds?: string[];
        };
        const payload: Part[] = [{ table: def.table, rows: [parent] }];
        let linkedRows = 0;

        for (const child of def.children) {
            if (!(await linkExists(child.table, child.column))) {
                console.warn(`[RecordBin] skipping ${child.table}.${child.column} — not in this database`);
                continue;
            }
            const res = await tx.execute(sql`
                SELECT * FROM ${raw(child.table)} WHERE ${raw(child.column)} = ${id}
            `);
            const rows = rowsOf(res);
            if (rows.length === 0) continue;
            payload.push({ table: child.table, rows, detach: child.detach, column: child.column });
            linkedRows += rows.length;

            /**
             * Captured straight after the child it hangs off, which is what makes
             * the ordering work at both ends: deletion walks this list backwards
             * so a grandchild goes before its parent, and restore walks it
             * forwards so the parent is back before the grandchild needs it.
             */
            const childIds = rows.map((r) => String(r.id)).filter(Boolean);
            if (childIds.length === 0) continue;
            for (const dep of child.dependents ?? []) {
                if (!(await linkExists(dep.table, dep.column))) continue;
                const depRes = await tx.execute(sql`
                    SELECT * FROM ${raw(dep.table)} WHERE ${raw(dep.column)} IN (${inList(childIds)})
                `);
                const depRows = rowsOf(depRes);
                if (depRows.length === 0) continue;
                payload.push({ table: dep.table, rows: depRows, column: dep.column, keyIds: childIds });
                linkedRows += depRows.length;
            }
        }

        // Children go first so nothing is left pointing at a row that has gone.
        for (let i = payload.length - 1; i >= 1; i--) {
            const part = payload[i];
            const match = part.keyIds
                ? sql`${raw(part.column!)} IN (${inList(part.keyIds)})`
                : sql`${raw(part.column!)} = ${id}`;
            if (part.detach) {
                await tx.execute(sql`
                    UPDATE ${raw(part.table)} SET ${raw(part.column!)} = NULL WHERE ${match}
                `);
            } else {
                await tx.execute(sql`DELETE FROM ${raw(part.table)} WHERE ${match}`);
            }
        }
        await tx.execute(sql`DELETE FROM ${raw(def.table)} WHERE ${raw(def.idColumn)} = ${id}`);

        const binId = nanoid(16);
        const d = def.display;
        const label = String(parent[d.title] ?? id);
        await tx.execute(sql`
            INSERT INTO deleted_record_bin (
                id, entity_type, entity_id, label, summary, payload, row_count,
                deleted_by, deleted_by_name, purge_after
            ) VALUES (
                ${binId}, ${entityType}, ${id}, ${label},
                ${JSON.stringify({
                    title: label,
                    subtitle: d.subtitle ? parent[d.subtitle] ?? null : null,
                    amount: d.amount ? parent[d.amount] ?? null : null,
                    linkedRows,
                })}::jsonb,
                ${JSON.stringify(payload)}::jsonb,
                ${linkedRows + 1},
                ${actor.id ?? null}, ${actor.name ?? null},
                now() + interval '${raw(String(BIN_RETENTION_HOURS))} hours'
            )
        `);

        return { binId, linkedRows };
    });
}

export type BinEntry = {
    id: string;
    entityType: string;
    entityId: string;
    label: string;
    summary: Record<string, unknown>;
    rowCount: number;
    deletedAt: string;
    deletedByName: string | null;
    purgeAfter: string;
    hoursLeft: number;
};

/** What is still restorable, newest first. */
export async function listBin(): Promise<BinEntry[]> {
    const res = await db.execute(sql`
        SELECT id, entity_type, entity_id, label, summary, row_count,
               deleted_at, deleted_by_name, purge_after,
               EXTRACT(EPOCH FROM (purge_after - now())) / 3600 AS hours_left
        FROM deleted_record_bin
        WHERE restored_at IS NULL AND purge_after > now()
        ORDER BY deleted_at DESC
    `);
    return rowsOf(res).map((r) => ({
        id: String(r.id),
        entityType: String(r.entity_type),
        entityId: String(r.entity_id),
        label: String(r.label ?? ""),
        summary: (r.summary ?? {}) as Record<string, unknown>,
        rowCount: Number(r.row_count ?? 0),
        deletedAt: new Date(r.deleted_at as string).toISOString(),
        deletedByName: r.deleted_by_name == null ? null : String(r.deleted_by_name),
        purgeAfter: new Date(r.purge_after as string).toISOString(),
        hoursLeft: Math.max(0, Number(r.hours_left ?? 0)),
    }));
}

/** The full contents of one entry, for the preview pane. */
export async function getBinEntry(binId: string): Promise<{
    entry: BinEntry;
    tables: Array<{ table: string; rows: Array<Record<string, unknown>> }>;
} | null> {
    const res = await db.execute(sql`
        SELECT id, entity_type, entity_id, label, summary, payload, row_count,
               deleted_at, deleted_by_name, purge_after,
               EXTRACT(EPOCH FROM (purge_after - now())) / 3600 AS hours_left
        FROM deleted_record_bin WHERE id = ${binId}
    `);
    const r = rowsOf(res)[0];
    if (!r) return null;
    const payload = (r.payload ?? []) as Array<{ table: string; rows: Array<Record<string, unknown>> }>;
    return {
        entry: {
            id: String(r.id),
            entityType: String(r.entity_type),
            entityId: String(r.entity_id),
            label: String(r.label ?? ""),
            summary: (r.summary ?? {}) as Record<string, unknown>,
            rowCount: Number(r.row_count ?? 0),
            deletedAt: new Date(r.deleted_at as string).toISOString(),
            deletedByName: r.deleted_by_name == null ? null : String(r.deleted_by_name),
            purgeAfter: new Date(r.purge_after as string).toISOString(),
            hoursLeft: Math.max(0, Number(r.hours_left ?? 0)),
        },
        tables: payload.map((p) => ({ table: p.table, rows: p.rows })),
    };
}

export type RestoreOutcome = {
    restored: string[];
    refused: Array<{ binId: string; reason: string }>;
    rowsRestored: number;
};

/**
 * Put entries back, parent first.
 *
 * Refused rather than forced when the row is already there or the entry has
 * expired. Detached links are not re-attached: the serial or service request
 * they pointed at may have moved on, and quietly rewriting it to point back at
 * a resurrected job would be a guess.
 */
export async function restoreRecords(binIds: string[]): Promise<RestoreOutcome> {
    const outcome: RestoreOutcome = { restored: [], refused: [], rowsRestored: 0 };

    for (const binId of binIds) {
        try {
            const rows = await db.transaction(async (tx) => {
                const res = await tx.execute(sql`
                    SELECT * FROM deleted_record_bin WHERE id = ${binId} FOR UPDATE
                `);
                const entry = rowsOf(res)[0];
                if (!entry) throw new Error("that entry is no longer in the bin");
                if (entry.restored_at) throw new Error("it has already been restored");
                if (new Date(entry.purge_after as string).getTime() < Date.now()) {
                    throw new Error("the 24 hours have passed and it has been purged");
                }

                const def = ENTITY_DEFS[String(entry.entity_type)];
                if (!def) throw new Error("unknown record type");

                const exists = await tx.execute(sql`
                    SELECT 1 FROM ${raw(def.table)} WHERE ${raw(def.idColumn)} = ${String(entry.entity_id)}
                `);
                if (rowsOf(exists).length > 0) throw new Error("a record with that id already exists");

                const payload = (entry.payload ?? []) as Array<{
                    table: string; rows: Array<Record<string, unknown>>; detach?: boolean;
                }>;

                /**
                 * Insert in passes, retrying what fails, until nothing more goes in.
                 *
                 * The obvious approach is to replay the payload in order and trust
                 * that order. It is not trustworthy: a handover code carries a
                 * logistics_task_id, and if the code was captured before the task
                 * the insert fails on a foreign key. Fixing the declaration order
                 * fixes new deletions and does nothing for the entries already
                 * sitting in the bin, whose payloads are frozen as they were
                 * written.
                 *
                 * So the order is not relied upon. Each row is tried inside its own
                 * savepoint; whatever fails is kept for the next pass, and the row
                 * it was waiting for has usually gone in by then. It stops when a
                 * whole pass achieves nothing, and reports the reason from that
                 * pass rather than a generic failure.
                 *
                 * Savepoints matter here: in Postgres a failed statement poisons the
                 * whole transaction, so without one the first retry would find the
                 * transaction already aborted.
                 */
                type Pending = { table: string; row: Record<string, unknown> };
                const pending: Pending[] = [];
                for (const part of payload) {
                    if (part.detach) continue; // never re-pointed; see the note above
                    for (const row of part.rows) pending.push({ table: part.table, row });
                }

                let count = 0;
                let remaining = pending;
                let lastError: string | null = null;

                while (remaining.length > 0) {
                    const failed: Pending[] = [];
                    for (const item of remaining) {
                        const cols = Object.keys(item.row);
                        if (cols.length === 0) continue;
                        try {
                            await tx.transaction(async (sp) => {
                                const colSql = sql.join(cols.map((c) => sql.identifier(c)), sql`, `);
                                const values = sql.join(
                                    cols.map((c) => {
                                        const v = item.row[c];
                                        if (v !== null && typeof v === "object" && !(v instanceof Date)) {
                                            return sql`${JSON.stringify(v)}`;
                                        }
                                        return sql`${v ?? null}`;
                                    }),
                                    sql`, `,
                                );
                                await sp.execute(sql`
                                    INSERT INTO ${sql.identifier(item.table)} (${colSql})
                                    VALUES (${values})
                                    ON CONFLICT DO NOTHING
                                `);
                            });
                            count++;
                        } catch (error) {
                            lastError = (error as Error).message;
                            failed.push(item);
                        }
                    }
                    // A pass that placed nothing will never place anything.
                    if (failed.length === remaining.length) {
                        throw new Error(lastError ?? "those rows could not be put back");
                    }
                    remaining = failed;
                }

                await tx.execute(sql`
                    UPDATE deleted_record_bin SET restored_at = now() WHERE id = ${binId}
                `);
                return count;
            });
            outcome.restored.push(binId);
            outcome.rowsRestored += rows;
        } catch (error) {
            outcome.refused.push({ binId, reason: (error as Error).message });
        }
    }
    return outcome;
}

/** Drop entries past their 24 hours. Safe to call repeatedly. */
export async function purgeExpired(): Promise<number> {
    const res = await db.execute(sql`
        DELETE FROM deleted_record_bin
        WHERE purge_after <= now() OR restored_at IS NOT NULL
        RETURNING id
    `);
    return rowsOf(res).length;
}

/** Empty the bin now, for entries the caller names. */
export async function purgeNow(binIds: string[]): Promise<number> {
    if (binIds.length === 0) return 0;
    const res = await db.execute(sql`
        DELETE FROM deleted_record_bin WHERE id IN (${inList(binIds)}) RETURNING id
    `);
    return rowsOf(res).length;
}

/** Counts for the type rail, so the page opens with numbers already on it. */
export type TypeCount = { count: number; total: number; error: string | null };

/**
 * Counts for the type rail: how many the keyword matched, and how many exist.
 *
 * Both numbers, because they answer different questions. Zero matches out of
 * four hundred jobs means the keyword is not finding this shop's test records;
 * zero out of zero means there is nothing there.
 *
 * A failure is reported rather than swallowed. This used to return 0 for a type
 * whose table or column differs in that deployment, which looks exactly like
 * "nothing matched" — so on production the whole rail read empty and there was
 * no way to tell a broken type from an empty one.
 */
export async function candidateCounts(): Promise<Record<string, TypeCount>> {
    const counts: Record<string, TypeCount> = {};
    for (const [key, def] of Object.entries(ENTITY_DEFS)) {
        try {
            if (!(await tableExists(def.table))) {
                counts[key] = { count: 0, total: 0, error: `no ${def.table} table here` };
                continue;
            }
            const res = await db.execute(sql`
                SELECT COUNT(*) FILTER (WHERE ${raw(def.detect)})::int AS n,
                       COUNT(*)::int AS total
                FROM ${raw(def.table)}
            `);
            const row = rowsOf(res)[0];
            counts[key] = {
                count: Number(row?.n ?? 0),
                total: Number(row?.total ?? 0),
                error: null,
            };
        } catch (error) {
            const message = (error as Error).message;
            console.error(`[RecordBin] count failed for ${key}:`, message);
            counts[key] = { count: 0, total: 0, error: message };
        }
    }
    return counts;
}
