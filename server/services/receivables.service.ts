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
    /**
     * How long the OLDEST unpaid item has been waiting, in days.
     *
     * The figure a debt list is really missing. 5,000 owed for three days and
     * 5,000 owed for three months are different problems and look identical
     * without this — the second is the one that needs a phone call today.
     */
    oldestUnpaidDays: number;
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

/** Whole days since a date, never negative. */
function daysSince(value: unknown): number {
    if (!value) return 0;
    const then = new Date(value as string).getTime();
    if (isNaN(then)) return 0;
    return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

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
    /**
     * Catch-up entries for a company still write a retail-shaped due row —
     * customer name and phone — because that is the ledger the money lives in.
     * Left alone they surface here as a Person, so a company appeared under a
     * human icon on the very screen built to tell the two apart.
     *
     * The due row carries the job id in `invoice`, so the job can say which
     * company it belonged to. Those are excluded from the retail grouping and
     * folded into the corporate side below.
     */
    const retail = await db.execute(sql`
        SELECT
            COALESCE(NULLIF(d.customer_phone, ''), d.customer) AS grouping_key,
            MAX(d.customer)        AS name,
            MAX(d.customer_phone)  AS phone,
            SUM(d.amount - COALESCE(d.paid_amount, 0)) AS owed,
            COUNT(*)               AS open_count,
            MAX(d.created_at)      AS last_activity,
            MIN(d.created_at)      AS oldest_unpaid
        FROM due_records d
        LEFT JOIN job_tickets j ON j.id = d.invoice
        WHERE d.status <> 'Paid'
          AND (d.amount - COALESCE(d.paid_amount, 0)) > 0.009
          AND j.corporate_client_id IS NULL
          /*
           * A due whose invoice is a corporate BILL number is that bill, not a
           * second debt. Counted here as well it appeared twice: once as a
           * company under its own name, and once as a "Person" carrying the
           * same money — QA found Audit Corp Enterprise listed both ways, and
           * its 7,500 was in the headline total twice over.
           *
           * The bill is the authority; this row is a shadow of it.
           */
          AND NOT EXISTS (
              SELECT 1 FROM corporate_bills cb WHERE cb.bill_number = d.invoice
          )
        GROUP BY grouping_key
    `);

    /** Company debt that arrived through the catch-up door rather than a bill. */
    const corporateDues = await db.execute(sql`
        SELECT
            c.id AS id, c.company_name AS name,
            c.client_class AS client_class, c.client_type AS client_type,
            SUM(d.amount - COALESCE(d.paid_amount, 0)) AS owed,
            COUNT(*) AS open_count,
            MAX(d.created_at) AS last_activity,
            MIN(d.created_at) AS oldest_unpaid
        FROM due_records d
        JOIN job_tickets j ON j.id = d.invoice
        JOIN corporate_clients c ON c.id = j.corporate_client_id
        WHERE d.status <> 'Paid'
          AND (d.amount - COALESCE(d.paid_amount, 0)) > 0.009
          /*
           * Once the job is on an active bill, the bill is the debt.
           *
           * A corporate catch-up entry raises a due against the job, and the
           * company's bills are summed separately below. Billing that same job
           * therefore counted the money twice: a 10,000 panel entered from
           * paper and then billed left the company owing 20,000, measured
           * end to end. Same shape as the retail shadow rows excluded above —
           * a job, a due and a bill all describing one debt.
           *
           * Tied to the bill still being active, matching the bills query's own
           * filter. If a bill is superseded or voided the due is counted again,
           * because then nothing else is counting it.
           */
          AND NOT EXISTS (
              SELECT 1 FROM corporate_bills cb
              WHERE cb.id = j.corporate_bill_id
                AND COALESCE(cb.bill_status, 'active') = 'active'
          )
        GROUP BY c.id, c.company_name, c.client_class, c.client_type
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
            MAX(b.created_at)    AS last_activity,
            MIN(b.created_at)    AS oldest_unpaid
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
            oldestUnpaidDays: daysSince(r.oldest_unpaid),
        });
    }

    /** A company can owe on both a bill and a catch-up row; that is one debtor. */
    const byCompany = new Map<string, Debtor>();
    for (const r of [...rowsOf(corporate), ...rowsOf(corporateDues)]) {
        const id = String(r.id ?? "");
        const existing = byCompany.get(id);
        if (existing) {
            existing.owed = round2(existing.owed + Number(r.owed ?? 0));
            existing.openCount += Number(r.open_count ?? 0);
            // The longest wait across both sources, not whichever arrived last.
            existing.oldestUnpaidDays = Math.max(
                existing.oldestUnpaidDays, daysSince(r.oldest_unpaid));
            continue;
        }
        byCompany.set(id, {
            kind: "corporate",
            id: String(r.id ?? ""),
            name: String(r.name ?? "Unknown company"),
            phone: null,
            clientClass: (r.client_class as string) ?? null,
            clientType: (r.client_type as string) ?? null,
            owed: round2(Number(r.owed ?? 0)),
            openCount: Number(r.open_count ?? 0),
            lastActivity: r.last_activity ? new Date(r.last_activity as string).toISOString() : null,
            oldestUnpaidDays: daysSince(r.oldest_unpaid),
        });
    }

    debtors.push(...Array.from(byCompany.values()));

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
