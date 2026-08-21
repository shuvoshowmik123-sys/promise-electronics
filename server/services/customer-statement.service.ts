/**
 * A dated statement for one customer — what settles an argument on the phone.
 *
 * The manager is standing there with a customer who says "we do not owe that,
 * not on that date". Today the only answer available is the Finance dues list,
 * which shows every customer in the shop and no dates worth quoting. So the
 * manager loses the argument to somebody who simply sounds more certain.
 *
 * This returns the thing he can read out: every charge and every payment, in
 * order, with the balance after each one. Not a total — a total is what he
 * already has and it is exactly what is being disputed. Dates and amounts, in
 * the order they happened, are what end the conversation.
 *
 * Built from due_records and manual_payments rather than from jobs, because
 * due_records is the authority for what is owed — customer-lifecycle.service
 * already treats it that way — and building the same figure twice from two
 * different sources is how two screens end up disagreeing in front of a
 * customer.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";

export interface StatementLine {
    date: string;
    /** What the line is for, in words a customer would recognise. */
    description: string;
    /** Money the customer was billed. */
    charged: number;
    /** Money the customer handed over. */
    paid: number;
    /** What was outstanding after this line. */
    balance: number;
    reference: string | null;
    /** Typed in from paper rather than recorded as it happened. */
    fromPaper?: boolean;
}

export interface CustomerStatement {
    kind: "retail" | "corporate";
    name: string;
    phone: string | null;
    address: string | null;
    totalCharged: number;
    totalPaid: number;
    balance: number;
    lines: StatementLine[];
    /** The sentence the manager can read down the phone, already assembled. */
    spokenSummary: string;
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
    return (result as { rows?: Array<Record<string, unknown>> })?.rows ?? [];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const DAY = { day: "numeric", month: "long", year: "numeric" } as const;
const spokenDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", DAY);

/**
 * A retail customer's statement, keyed by the phone number.
 *
 * The phone rather than a customer id, deliberately: due records carry the
 * number they were raised against, the same person can sit under two customer
 * rows after a merge that never happened, and the phone is what the shop dials.
 */
export async function getRetailStatement(phone: string): Promise<CustomerStatement | null> {
    const dues = await db.execute(sql`
        SELECT id, customer, customer_phone, device_name, invoice, note,
               amount, COALESCE(paid_amount, 0) AS paid_amount,
               created_at, paid_at, source
        FROM due_records
        WHERE customer_phone = ${phone}
        ORDER BY created_at ASC
    `);
    /**
     * Jobs that were paid in full leave no due record at all, so a customer's
     * settled work simply did not appear — a manager could show what is still
     * owed but not "you paid that one in full on 10 May", which is half of what
     * a customer disputes. Read separately and merged in.
     */
    const paidJobs = await db.execute(sql`
        SELECT id, device, issue, estimated_cost, created_at, entered_as_catchup
        FROM job_tickets
        WHERE customer_phone = ${phone}
          AND payment_status = 'paid'
          AND COALESCE(estimated_cost, 0) > 0
          AND id NOT IN (SELECT invoice FROM due_records WHERE invoice IS NOT NULL)
        ORDER BY created_at ASC
    `);

    const dueRows = rowsOf(dues);
    const paidRows = rowsOf(paidJobs);
    if (!dueRows.length && !paidRows.length) return null;

    const payments = await db.execute(sql`
        SELECT amount, method, created_at, verified_at, due_record_id
        FROM manual_payments
        WHERE customer_phone = ${phone} AND status <> 'rejected'
        ORDER BY created_at ASC
    `);
    const paymentRows = rowsOf(payments);

    /** Payments already logged individually, so they are not counted twice. */
    const loggedByDue = new Map<string, number>();
    for (const p of paymentRows) {
        const key = String(p.due_record_id ?? "");
        loggedByDue.set(key, (loggedByDue.get(key) ?? 0) + Number(p.amount ?? 0));
    }

    type Draft = Omit<StatementLine, "balance">;
    const drafts: Draft[] = [];

    for (const d of dueRows) {
        const id = String(d.id);
        const amount = Number(d.amount ?? 0);
        const recordedPaid = Number(d.paid_amount ?? 0);
        const fromPaper = String(d.source ?? "") === "catch_up";

        drafts.push({
            date: new Date(d.created_at as string).toISOString(),
            description: (d.device_name as string) || (d.note as string) || "Repair",
            charged: round2(amount),
            paid: 0,
            reference: (d.invoice as string) ?? null,
            fromPaper,
        });

        /**
         * paid_amount is a running figure with no date of its own beyond
         * paid_at, so anything it holds beyond the individually logged payments
         * becomes one line. Losing it would understate what the customer has
         * already handed over — the worst possible error to make out loud.
         */
        const alreadyLogged = loggedByDue.get(id) ?? 0;
        const unlogged = round2(recordedPaid - alreadyLogged);
        if (unlogged > 0.009) {
            drafts.push({
                date: new Date((d.paid_at as string) || (d.created_at as string)).toISOString(),
                description: "Payment received",
                charged: 0,
                paid: unlogged,
                reference: (d.invoice as string) ?? null,
            });
        }
    }

    for (const j of paidRows) {
        const amount = round2(Number(j.estimated_cost ?? 0));
        const when = new Date(j.created_at as string).toISOString();
        drafts.push({
            date: when,
            description: (j.device as string) || (j.issue as string) || "Repair",
            charged: amount, paid: 0,
            reference: j.id as string,
            fromPaper: !!j.entered_as_catchup,
        });
        drafts.push({
            date: when,
            description: "Paid in full",
            charged: 0, paid: amount,
            reference: j.id as string,
        });
    }

    for (const p of paymentRows) {
        drafts.push({
            date: new Date((p.verified_at as string) || (p.created_at as string)).toISOString(),
            description: `Payment received${p.method ? ` (${p.method})` : ""}`,
            charged: 0,
            paid: round2(Number(p.amount ?? 0)),
            reference: (p.due_record_id as string) ?? null,
        });
    }

    drafts.sort((a, b) => a.date.localeCompare(b.date));

    let balance = 0;
    let totalCharged = 0;
    let totalPaid = 0;
    const lines: StatementLine[] = drafts.map((d) => {
        balance = round2(balance + d.charged - d.paid);
        totalCharged = round2(totalCharged + d.charged);
        totalPaid = round2(totalPaid + d.paid);
        return { ...d, balance };
    });

    /**
     * The address is not on a due record — it is on the jobs behind it. Left
     * null the customer looked addressless on screen, which is the one detail a
     * manager needs when the next step is sending a driver.
     */
    const addr = await db.execute(sql`
        SELECT customer_address FROM job_tickets
        WHERE customer_phone = ${phone} AND customer_address IS NOT NULL
          AND customer_address <> ''
        ORDER BY created_at DESC LIMIT 1
    `);

    /**
     * A customer with nothing owing has no due rows, so the name has to come
     * from their jobs instead. Falling back to the literal word "Customer" put
     * a heading on the statement that was not anybody's name — the one thing on
     * screen a manager would read out first.
     */
    const nameRow = await db.execute(sql`
        SELECT customer FROM job_tickets
        WHERE customer_phone = ${phone} AND customer IS NOT NULL AND customer <> ''
        ORDER BY created_at DESC LIMIT 1
    `);
    const name = String(
        dueRows[0]?.customer ?? rowsOf(nameRow)[0]?.customer ?? "Customer",
    );
    return {
        kind: "retail",
        name,
        phone,
        address: (rowsOf(addr)[0]?.customer_address as string) ?? null,
        totalCharged,
        totalPaid,
        balance,
        lines,
        spokenSummary: buildSpokenSummary(name, lines, balance),
    };
}

/** A company's statement, built from its issued bills. */
export async function getCorporateStatement(clientId: string): Promise<CustomerStatement | null> {
    const client = await db.execute(sql`
        SELECT company_name, address FROM corporate_clients WHERE id = ${clientId} LIMIT 1
    `);
    const c = rowsOf(client)[0];
    if (!c) return null;


    const bills = await db.execute(sql`
        SELECT id, bill_number, grand_total, COALESCE(paid_amount, 0) AS paid_amount,
               created_at, payment_status
        FROM corporate_bills
        WHERE corporate_client_id = ${clientId}
          AND COALESCE(bill_status, 'active') = 'active'
        ORDER BY created_at ASC
    `);

    /**
     * A company's debt does not only arrive as a bill.
     *
     * Work typed in through the catch-up door writes a due record instead, so a
     * statement built from bills alone showed a company owing nothing while the
     * tile beside it said otherwise — the two numbers a manager would have had
     * to choose between mid-conversation.
     */
    const catchupDues = await db.execute(sql`
        SELECT d.invoice, d.device_name, d.note, d.amount,
               COALESCE(d.paid_amount, 0) AS paid_amount, d.created_at
        FROM due_records d
        JOIN job_tickets j ON j.id = d.invoice
        WHERE j.corporate_client_id = ${clientId}
        ORDER BY d.created_at ASC
    `);

    type Draft = Omit<StatementLine, "balance">;
    const drafts: Draft[] = [];

    for (const d of rowsOf(catchupDues)) {
        drafts.push({
            date: new Date(d.created_at as string).toISOString(),
            description: (d.device_name as string) || (d.note as string) || "Repair",
            charged: round2(Number(d.amount ?? 0)),
            paid: 0,
            reference: (d.invoice as string) ?? null,
            fromPaper: true,
        });
        const paid = Number(d.paid_amount ?? 0);
        if (paid > 0.009) {
            drafts.push({
                date: new Date(d.created_at as string).toISOString(),
                description: "Payment received",
                charged: 0,
                paid: round2(paid),
                reference: (d.invoice as string) ?? null,
            });
        }
    }

    for (const b of rowsOf(bills)) {
        drafts.push({
            date: new Date(b.created_at as string).toISOString(),
            description: `Bill ${(b.bill_number as string) || String(b.id).slice(0, 8)}`,
            charged: round2(Number(b.grand_total ?? 0)),
            paid: 0,
            reference: (b.bill_number as string) ?? null,
        });
        const paid = Number(b.paid_amount ?? 0);
        if (paid > 0.009) {
            drafts.push({
                date: new Date(b.created_at as string).toISOString(),
                description: "Payment received",
                charged: 0,
                paid: round2(paid),
                reference: (b.bill_number as string) ?? null,
            });
        }
    }

    drafts.sort((a, b) => a.date.localeCompare(b.date));

    let balance = 0, totalCharged = 0, totalPaid = 0;
    const lines: StatementLine[] = drafts.map((d) => {
        balance = round2(balance + d.charged - d.paid);
        totalCharged = round2(totalCharged + d.charged);
        totalPaid = round2(totalPaid + d.paid);
        return { ...d, balance };
    });

    const name = String(c.company_name ?? "Company");
    return {
        kind: "corporate",
        name,
        phone: null,
        address: (c.address as string) ?? null,
        totalCharged,
        totalPaid,
        balance,
        lines,
        spokenSummary: buildSpokenSummary(name, lines, balance),
    };
}

/**
 * The sentence, assembled server-side so every screen says the same words.
 *
 * A manager mid-conversation should not be reading a table and composing a
 * reply at the same time. This is written to be spoken: the last charge, the
 * last payment, and what remains — which is exactly the sequence a customer
 * disputes, in the order they dispute it.
 */
function buildSpokenSummary(name: string, lines: StatementLine[], balance: number): string {
    if (!lines.length) return `${name} has no billing history.`;
    if (balance <= 0.009) {
        const last = lines[lines.length - 1];
        return `${name} owes nothing. Last activity ${spokenDate(last.date)}.`;
    }

    const lastCharge = [...lines].reverse().find((l) => l.charged > 0);
    const lastPayment = [...lines].reverse().find((l) => l.paid > 0);

    const parts = [`${name} owes ${balance.toLocaleString()}.`];
    if (lastCharge) {
        parts.push(`Last billed ${lastCharge.charged.toLocaleString()} on ${spokenDate(lastCharge.date)} for ${lastCharge.description}.`);
    }
    parts.push(lastPayment
        ? `Last payment ${lastPayment.paid.toLocaleString()} on ${spokenDate(lastPayment.date)}.`
        : `No payment has been received.`);

    return parts.join(" ");
}
