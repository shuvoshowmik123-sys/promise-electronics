/**
 * Finance Repository
 * 
 * Handles all database operations for financial records:
 * - Petty Cash
 * - Due Records
 * - Challans
 */

import { db, nanoid, eq, desc, asc, and, gte, lte, or, like, count, sql, schema, type Challan, type InsertChallan, type PettyCashRecord, type InsertPettyCashRecord, type DueRecord, type InsertDueRecord, type PaginationResult } from './base.js';

// ============================================
// Petty Cash Operations
// ============================================

export async function getAllPettyCashRecords(filters?: {
    page?: number;
    limit?: number;
    search?: string;
    from?: string;
    to?: string;
    type?: string;
    category?: string;
}): Promise<PaginationResult<PettyCashRecord>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters?.search) {
        conditions.push(or(
            like(schema.pettyCashRecords.description, `%${filters.search}%`),
            like(schema.pettyCashRecords.category, `%${filters.search}%`)
        ));
    }

    // One tap on a chip is the whole interface, so this has to be a real
    // query rather than the page filtering whatever happened to be fetched —
    // otherwise "Parts" would show only the parts inside the current 25 rows.
    if (filters?.category && filters.category !== 'all') {
        conditions.push(eq(schema.pettyCashRecords.category, filters.category));
    }

    /**
     * Dates run on when the money left, falling back to when it was typed.
     *
     * A spend made at 11am and written up at 6pm belongs to 11am, and one
     * entered after midnight belongs to the day before. Older rows have no
     * occurred_at, hence the fallback.
     */
    const spentAt = sql`COALESCE(${schema.pettyCashRecords.occurredAt}, ${schema.pettyCashRecords.createdAt})`;

    if (filters?.from) {
        const fromDate = new Date(filters.from);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(sql`${spentAt} >= ${fromDate}`);
    }

    if (filters?.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(sql`${spentAt} <= ${toDate}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
        .select({ total: count() })
        .from(schema.pettyCashRecords)
        .where(whereClause);

    const items = await db
        .select()
        .from(schema.pettyCashRecords)
        .where(whereClause)
        .orderBy(desc(spentAt))
        .limit(limit)
        .offset(offset);

    return {
        items,
        pagination: {
            total: Number(total),
            page,
            limit,
            pages: Math.ceil(Number(total) / limit),
        },
    };
}

export async function getPettyCashSummary(filters?: {
    from?: string;
    to?: string;
}): Promise<{ totalIncome: number; totalExpense: number; count: number }> {
    const conditions = [];

    if (filters?.from) {
        const fromDate = new Date(filters.from);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(gte(schema.pettyCashRecords.createdAt, fromDate));
    }

    if (filters?.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(schema.pettyCashRecords.createdAt, toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const records = await db
        .select()
        .from(schema.pettyCashRecords)
        .where(whereClause);

    let totalIncome = 0;
    let totalExpense = 0;

    for (const record of records) {
        if (record.type === 'Income') totalIncome += record.amount;
        if (record.type === 'Expense') totalExpense += record.amount;
    }

    return {
        totalIncome,
        totalExpense,
        count: records.length
    };
}

export async function createPettyCashRecord(record: InsertPettyCashRecord): Promise<PettyCashRecord> {
    const [newRecord] = await db.insert(schema.pettyCashRecords)
        .values({ ...record, id: nanoid() })
        .returning();
    return newRecord;
}

/**
 * The number on each filter chip, and the total behind it.
 *
 * Computed in one pass over the same rows the sheet shows, so a chip can never
 * disagree with the list it opens. Returned for every category including the
 * empty ones — a chip that vanishes when it reaches zero makes the row of
 * chips jump about as you filter.
 */
export async function getExpenseCategoryTotals(filters: { from?: string; to?: string }): Promise<{
    all: { total: number; count: number };
    byCategory: Record<string, { total: number; count: number }>;
}> {
    const rows = await db.execute(sql`
        SELECT COALESCE(category, 'other') AS category,
               SUM(amount)::float8         AS total,
               COUNT(*)::int               AS count
        FROM petty_cash_records
        WHERE type = 'Expense'
          AND reversed_at IS NULL
          AND reversal_of IS NULL
          ${filters.from ? sql`AND COALESCE(occurred_at, created_at) >= ${new Date(filters.from)}` : sql``}
          ${filters.to ? sql`AND COALESCE(occurred_at, created_at) <= ${new Date(filters.to)}` : sql``}
        GROUP BY 1
    `);

    const byCategory: Record<string, { total: number; count: number }> = {};
    let total = 0;
    let count = 0;
    for (const row of ((rows as any).rows ?? rows) as any[]) {
        byCategory[row.category] = { total: Number(row.total), count: Number(row.count) };
        total += Number(row.total);
        count += Number(row.count);
    }
    return { all: { total, count }, byCategory };
}

/**
 * What parts were bought in a month, by the piece.
 *
 * "February: LVDS x10, Panel x4" is the question, and it cannot be answered
 * from a description that happens to read "10 LVDS cables". Only rows in the
 * parts category carry a part name, so only they appear here.
 */
export async function getPartsSummary(filters: { from?: string; to?: string }): Promise<Array<{
    month: string;
    total: number;
    parts: Array<{ partName: string; quantity: number; total: number; buys: number }>;
}>> {
    const rows = await db.execute(sql`
        SELECT to_char(COALESCE(occurred_at, created_at), 'YYYY-MM') AS month,
               part_name                                             AS "partName",
               SUM(COALESCE(quantity, 1))::int                       AS quantity,
               SUM(amount)::float8                                   AS total,
               COUNT(*)::int                                         AS buys
        FROM petty_cash_records
        WHERE type = 'Expense'
          AND reversed_at IS NULL
          AND reversal_of IS NULL
          AND part_name IS NOT NULL
          AND part_name <> ''
          ${filters.from ? sql`AND COALESCE(occurred_at, created_at) >= ${new Date(filters.from)}` : sql``}
          ${filters.to ? sql`AND COALESCE(occurred_at, created_at) <= ${new Date(filters.to)}` : sql``}
        GROUP BY 1, 2
        ORDER BY 1 DESC, 4 DESC
    `);

    type PartRow = { partName: string; quantity: number; total: number; buys: number };
    type MonthRow = { month: string; total: number; parts: PartRow[] };
    const months = new Map<string, MonthRow>();
    for (const row of ((rows as any).rows ?? rows) as any[]) {
        const bucket: MonthRow = months.get(row.month) ?? { month: row.month, total: 0, parts: [] };
        bucket.parts.push({
            partName: row.partName,
            quantity: Number(row.quantity),
            total: Number(row.total),
            buys: Number(row.buys),
        });
        bucket.total += Number(row.total);
        months.set(row.month, bucket);
    }
    return Array.from(months.values());
}

/**
 * Month, then day, then nothing else.
 *
 * A flat list of small spends is unreadable by design — that is the complaint
 * this answers. Individual entries are only fetched when a day is opened, and
 * reversed rows and the rows that reversed them are both excluded: counting
 * either would misstate the total, counting both would cancel twice.
 */
export async function getExpenseRollup(filters: { from?: string; to?: string }): Promise<{
    months: Array<{
        month: string;
        total: number;
        count: number;
        days: Array<{ day: string; total: number; count: number }>;
    }>;
    total: number;
}> {
    const rows = await db.execute(sql`
        SELECT to_char(COALESCE(occurred_at, created_at), 'YYYY-MM')    AS month,
               to_char(COALESCE(occurred_at, created_at), 'YYYY-MM-DD') AS day,
               SUM(amount)::float8                                      AS total,
               COUNT(*)::int                                            AS count
        FROM petty_cash_records
        WHERE type = 'Expense'
          AND reversed_at IS NULL
          AND reversal_of IS NULL
          ${filters.from ? sql`AND COALESCE(occurred_at, created_at) >= ${new Date(filters.from)}` : sql``}
          ${filters.to ? sql`AND COALESCE(occurred_at, created_at) <= ${new Date(filters.to)}` : sql``}
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2 DESC
    `);

    type DayBucket = { day: string; total: number; count: number };
    type MonthBucket = { month: string; total: number; count: number; days: DayBucket[] };
    const months = new Map<string, MonthBucket>();
    let total = 0;
    for (const row of ((rows as any).rows ?? rows) as any[]) {
        const bucket: MonthBucket = months.get(row.month) ?? { month: row.month, total: 0, count: 0, days: [] };
        bucket.days.push({ day: row.day, total: Number(row.total), count: Number(row.count) });
        bucket.total += Number(row.total);
        bucket.count += Number(row.count);
        months.set(row.month, bucket);
        total += Number(row.total);
    }
    return { months: Array.from(months.values()), total };
}

/**
 * What each person spent, split by what it was for.
 *
 * Rows with no person attached are grouped under a single unattributed bucket
 * rather than dropped — every expense recorded before this feature existed has
 * no owner, and hiding them would make the totals disagree with the ledger.
 */
export async function getExpenseByPerson(filters: { from?: string; to?: string }): Promise<Array<{
    spentBy: string | null;
    spentByName: string;
    total: number;
    count: number;
    byCategory: Record<string, number>;
    byPurpose: Record<string, number>;
}>> {
    const rows = await db.execute(sql`
        SELECT spent_by                          AS "spentBy",
               COALESCE(spent_by_name, 'Unattributed') AS "spentByName",
               COALESCE(category, 'other')       AS category,
               COALESCE(purpose, 'office')       AS purpose,
               SUM(amount)::float8               AS total,
               COUNT(*)::int                     AS count
        FROM petty_cash_records
        WHERE type = 'Expense'
          AND reversed_at IS NULL
          AND reversal_of IS NULL
          ${filters.from ? sql`AND COALESCE(occurred_at, created_at) >= ${new Date(filters.from)}` : sql``}
          ${filters.to ? sql`AND COALESCE(occurred_at, created_at) <= ${new Date(filters.to)}` : sql``}
        GROUP BY 1, 2, 3, 4
    `);

    const people = new Map<string, any>();
    for (const row of ((rows as any).rows ?? rows) as any[]) {
        const key = row.spentBy ?? '__unattributed__';
        const person = people.get(key) ?? {
            spentBy: row.spentBy ?? null,
            spentByName: row.spentByName,
            total: 0,
            count: 0,
            byCategory: {} as Record<string, number>,
            byPurpose: {} as Record<string, number>,
        };
        const amount = Number(row.total);
        person.total += amount;
        person.count += Number(row.count);
        person.byCategory[row.category] = (person.byCategory[row.category] ?? 0) + amount;
        person.byPurpose[row.purpose] = (person.byPurpose[row.purpose] ?? 0) + amount;
        people.set(key, person);
    }
    return Array.from(people.values()).sort((a, b) => b.total - a.total);
}

export async function getPettyCashRecord(id: string): Promise<PettyCashRecord | undefined> {
    const [record] = await db.select().from(schema.pettyCashRecords)
        .where(eq(schema.pettyCashRecords.id, id));
    return record;
}

/**
 * Undo an expense without erasing it.
 *
 * The row that was entered stays exactly as it was and is stamped reversed; a
 * second row is written that cancels it. Two rows rather than none because a
 * spend that was recorded and then withdrawn is a thing that happened, and a
 * ledger that can make entries disappear cannot answer the question it exists
 * to answer.
 *
 * Returns null when the entry is already reversed, so a double-tap or a
 * retried request cannot subtract the same money twice.
 */
export async function reversePettyCashRecord(
    id: string,
    actor: { id: string; name: string; reason?: string | null },
): Promise<{ original: PettyCashRecord; reversal: PettyCashRecord } | null> {
    return db.transaction(async (tx) => {
        const [original] = await tx.select().from(schema.pettyCashRecords)
            .where(eq(schema.pettyCashRecords.id, id))
            .for("update");

        if (!original) return null;
        // Already reversed, or itself a reversal — either way there is nothing
        // left to undo, and saying so beats writing a second cancelling row.
        if (original.reversedAt || original.reversalOf) return null;

        const now = new Date();

        const [stamped] = await tx.update(schema.pettyCashRecords)
            .set({
                reversedAt: now,
                reversedBy: actor.id,
                reversedByName: actor.name,
                reversalReason: actor.reason?.trim() || null,
            })
            .where(eq(schema.pettyCashRecords.id, id))
            .returning();

        const [reversal] = await tx.insert(schema.pettyCashRecords)
            .values({
                id: nanoid(),
                description: `Reversal — ${original.description}`,
                category: original.category,
                amount: original.amount,
                type: original.type,
                purpose: original.purpose,
                spentBy: original.spentBy,
                spentByName: original.spentByName,
                enteredBy: actor.id,
                enteredByName: actor.name,
                reversalOf: original.id,
                reversalReason: actor.reason?.trim() || null,
                /**
                 * Dated today, not backdated to the original.
                 *
                 * If the original belongs to a shift that was already counted
                 * and signed off, backdating would silently rewrite a closed
                 * day's totals — the one thing a reconciled period must never
                 * do. Today is also where the money physically came back.
                 */
                occurredAt: now,
                drawerSessionId: original.drawerSessionId,
            })
            .returning();

        return { original: stamped, reversal };
    });
}

// ============================================
// Due Records Operations
// ============================================

export async function getAllDueRecords(filters?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    from?: string;
    to?: string;
}): Promise<PaginationResult<DueRecord>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters?.search) {
        conditions.push(or(
            like(schema.dueRecords.customer, `%${filters.search}%`),
            like(schema.dueRecords.invoice, `%${filters.search}%`)
        ));
    }

    if (filters?.status && filters.status !== 'All') {
        conditions.push(eq(schema.dueRecords.status, filters.status));
    }

    if (filters?.from) {
        const fromDate = new Date(filters.from);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(gte(schema.dueRecords.createdAt, fromDate));
    }

    if (filters?.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(schema.dueRecords.createdAt, toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
        .select({ total: count() })
        .from(schema.dueRecords)
        .where(whereClause);

    const items = await db
        .select()
        .from(schema.dueRecords)
        .where(whereClause)
        .orderBy(desc(schema.dueRecords.createdAt))
        .limit(limit)
        .offset(offset);

    return {
        items,
        pagination: {
            total: Number(total),
            page,
            limit,
            pages: Math.ceil(Number(total) / limit),
        },
    };
}

export async function getDueSummary(filters?: {
    from?: string;
    to?: string;
}): Promise<{ totalDueAmount: number; overdueCount: number; pendingCount: number }> {
    const conditions = [];

    if (filters?.from) {
        const fromDate = new Date(filters.from);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(gte(schema.dueRecords.createdAt, fromDate));
    }

    if (filters?.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(schema.dueRecords.createdAt, toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const records = await db
        .select()
        .from(schema.dueRecords)
        .where(whereClause);

    let totalDueAmount = 0;
    let overdueCount = 0;
    let pendingCount = 0;

    for (const record of records) {
        // calculate remaining due (amount - paidAmount)
        const paidAmount = record.paidAmount || 0;
        const remaining = record.amount - paidAmount;
        totalDueAmount += remaining;

        if (record.status === 'Overdue') overdueCount++;
        else if (record.status === 'Pending' || record.status === 'Partial') pendingCount++;
    }

    return {
        totalDueAmount,
        overdueCount,
        pendingCount
    };
}

export async function getDueRecord(id: string): Promise<DueRecord | undefined> {
    const [record] = await db.select().from(schema.dueRecords).where(eq(schema.dueRecords.id, id));
    return record;
}

export async function createDueRecord(record: InsertDueRecord): Promise<DueRecord> {
    const [newRecord] = await db.insert(schema.dueRecords)
        .values({ ...record, id: nanoid() })
        .returning();
    return newRecord;
}

export async function updateDueRecord(id: string, updates: Partial<InsertDueRecord>): Promise<DueRecord | undefined> {
    const [updated] = await db
        .update(schema.dueRecords)
        .set(updates)
        .where(eq(schema.dueRecords.id, id))
        .returning();

    /**
     * Settle the job the due came from, not just the due.
     *
     * A catch-up entry writes two records for one repair: the job, and the due
     * carrying what is owed on it. Nothing wrote back, so taking a payment in
     * Finance left the job still saying unpaid and still holding its original
     * outstanding figure, permanently. The Jobs screen and the dues screen
     * would disagree about the same repair and neither would look wrong.
     *
     * The due carries the job id in `invoice`, which is the link that makes the
     * repair one thing again. Only catch-up jobs are touched — a POS sale's job
     * is settled by the till, and reaching in from here as well would fight it.
     */
    if (updated) {
        const outstanding = Math.max(0,
            Number(updated.amount ?? 0) - Number(updated.paidAmount ?? 0));
        const paymentStatus = outstanding <= 0.009
            ? "paid"
            : Number(updated.paidAmount ?? 0) > 0 ? "partial" : "unpaid";

        // Best effort: the payment is already recorded, and a failed mirror
        // must not undo money that was genuinely taken.
        await db.execute(sql`
            UPDATE job_tickets
            SET payment_status = ${paymentStatus},
                catchup_amount_due = ${outstanding > 0.009 ? outstanding : null}
            WHERE id = ${updated.invoice} AND entered_as_catchup = true
        `).catch((error) => {
            console.error("[finance] could not settle the catch-up job for due", id, error);
        });
    }
    return updated;
}

export async function deleteDueRecord(id: string): Promise<boolean> {
    const result = await db.delete(schema.dueRecords).where(eq(schema.dueRecords.id, id));
    return (result.rowCount ?? 0) > 0;
}

// ============================================
// Challan Operations
// ============================================

export async function getAllChallans(): Promise<Challan[]> {
    return db.select().from(schema.challans).orderBy(desc(schema.challans.createdAt));
}

/** Scope operational challans for view-own users (creator or assigned driver). */
export async function getChallansVisibleToUser(userId: string): Promise<Challan[]> {
    return db
        .select()
        .from(schema.challans)
        .where(
            or(
                eq(schema.challans.createdByUserId, userId),
                eq(schema.challans.assignedDriverId, userId),
            ),
        )
        .orderBy(desc(schema.challans.createdAt));
}

export async function getChallan(id: string): Promise<Challan | undefined> {
    const [challan] = await db.select().from(schema.challans).where(eq(schema.challans.id, id));
    return challan;
}

export async function createChallan(challan: InsertChallan): Promise<Challan> {
    const [newChallan] = await db.insert(schema.challans)
        .values({ ...challan, id: challan.id || nanoid() })
        .returning();
    return newChallan;
}

export async function updateChallan(id: string, updates: Partial<InsertChallan>): Promise<Challan | undefined> {
    const [updated] = await db
        .update(schema.challans)
        .set(updates)
        .where(eq(schema.challans.id, id))
        .returning();
    return updated;
}

export async function deleteChallan(id: string): Promise<boolean> {
    const result = await db.delete(schema.challans).where(eq(schema.challans.id, id));
    return (result.rowCount ?? 0) > 0;
}
