/**
 * Everybody who owes the shop money, retail and corporate, in one list.
 *
 * The debt lives in two systems that never met. A walk-in customer's unpaid
 * balance is a row in due_records; a company's is the unpaid remainder of its
 * corporate_bills. So "how much is owed to us" could only ever be answered for
 * half the shop at a time, and the halves were on different screens with
 * different words.
 *
 * That is the question the owner actually asks — how much revenue is still out
 * there, across everyone — and nobody could answer it. This is the answer, and
 * the totals are additive across both kinds so a manager can read one number
 * aloud.
 *
 * Grouped by person or company rather than by invoice. A customer with four
 * unpaid jobs is one debtor owing one amount, not four rows to add up by eye.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";

export type DebtorKind = "retail" | "corporate";

export interface Debtor {
    kind: DebtorKind;
    /** customers.id or corporate_clients.id where known; the phone otherwise. */
    id: string;
    name: string;
    phone: string | null;
    /** b2b_normal | b2b_corporate, and corporate | limited_company. Null for retail. */
    clientClass: string | null;
    clientType: string | null;
    owed: number;
    /** Unpaid invoices or due records behind that figure. */
    openCount: number;
    /** Newest unpaid item, so a list can be ordered by what moved recently. */
    lastActivity: string | null;
}

export interface Receivables {
    totalOwed: number;
    debtorCount: number;
    retailOwed: number;
    corporateOwed: number;
    debtors: Debtor[];
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
    return (result as { rows?: Array<Record<string, unknown>> })?.rows ?? [];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Every debtor, largest debt first.
 *
 * Retail and corporate are queried separately because they are genuinely
 * different shapes — one is grouped by phone number, the other by client id —
 * and forcing them into a single SQL union would hide that behind a wall of
 * COALESCE. They are merged in memory instead, where the difference stays
 * readable.
 */
export async function getReceivables(): Promise<Receivables> {
    /**
     * Grouped by phone rather than by customer id: a due record carries the
     * phone it was raised against, and the same person can appear under two
     * customer rows after a merge that never happened. The phone is what the
     * shop would dial to chase the money.
     */
    const retail = await db.execute(sql`
        SELECT
            COALESCE(NULLIF(customer_phone, ''), customer) AS grouping_key,
            MAX(customer)        AS name,
            MAX(customer_phone)  AS phone,
            SUM(amount - COALESCE(paid_amount, 0)) AS owed,
            COUNT(*)             AS open_count,
            MAX(created_at)      AS last_activity
        FROM due_records
        WHERE status <> 'Paid'
          AND (amount - COALESCE(paid_amount, 0)) > 0.009
        GROUP BY grouping_key
    `);

    /**
     * A company's debt is the unpaid remainder of its issued bills. Draft and
     * superseded bills are excluded — a superseded bill has been replaced, and
     * counting it would bill the client twice for work they only had once.
     */
    const corporate = await db.execute(sql`
        SELECT
            c.id                 AS id,
            c.company_name       AS name,
            c.client_class       AS client_class,
            c.client_type        AS client_type,
            SUM(b.grand_total - COALESCE(b.paid_amount, 0)) AS owed,
            COUNT(*)             AS open_count,
            MAX(b.created_at)    AS last_activity
        FROM corporate_bills b
        JOIN corporate_clients c ON c.id = b.corporate_client_id
        WHERE COALESCE(b.payment_status, 'unpaid') <> 'paid'
          AND COALESCE(b.bill_status, 'active') = 'active'
          AND (b.grand_total - COALESCE(b.paid_amount, 0)) > 0.009
        GROUP BY c.id, c.company_name, c.client_class, c.client_type
    `);

    const debtors: Debtor[] = [];

    for (const r of rowsOf(retail)) {
        debtors.push({
            kind: "retail",
            id: String(r.grouping_key ?? ""),
            name: String(r.name ?? "Unknown"),
            phone: (r.phone as string) || null,
            clientClass: null,
            clientType: null,
            owed: round2(Number(r.owed ?? 0)),
            openCount: Number(r.open_count ?? 0),
            lastActivity: r.last_activity ? new Date(r.last_activity as string).toISOString() : null,
        });
    }

    for (const r of rowsOf(corporate)) {
        debtors.push({
            kind: "corporate",
            id: String(r.id ?? ""),
            name: String(r.name ?? "Unknown company"),
            phone: null,
            clientClass: (r.client_class as string) ?? null,
            clientType: (r.client_type as string) ?? null,
            owed: round2(Number(r.owed ?? 0)),
            openCount: Number(r.open_count ?? 0),
            lastActivity: r.last_activity ? new Date(r.last_activity as string).toISOString() : null,
        });
    }

    debtors.sort((a, b) => b.owed - a.owed);

    const retailOwed = round2(debtors.filter((d) => d.kind === "retail").reduce((s, d) => s + d.owed, 0));
    const corporateOwed = round2(debtors.filter((d) => d.kind === "corporate").reduce((s, d) => s + d.owed, 0));

    return {
        totalOwed: round2(retailOwed + corporateOwed),
        debtorCount: debtors.length,
        retailOwed,
        corporateOwed,
        debtors,
    };
}
