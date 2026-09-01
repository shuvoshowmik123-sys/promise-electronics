/**
 * What a customer owes, defined once.
 *
 * This file exists because the same amount has been described in four places —
 * a job, a due, a bill and a receipt — and every serious accounting fault in
 * this system has been one of them being updated while the others were left
 * behind. A corporate balance once read 288,485, then 298,485, then 308,485 for
 * money that had not changed.
 *
 * The defence is not more careful writing. It is having one subtraction that
 * everything reads and nothing stores:
 *
 *     balance = amount − paid − discount
 *
 * A partial delivery invoice is simply another row. Ten panels billed today and
 * five next month are two rows, and the total is their sum. Nothing needs
 * reconciling, because nothing was copied — which is what makes selective
 * dispatch safe to bill in pieces.
 */

export type DueLike = {
    amount: number | string | null | undefined;
    paidAmount?: number | string | null;
    discountAmount?: number | string | null;
    status?: string | null;
};

/** Money to two decimals. Floating point addition drifts; currency must not. */
export function money(value: number): number {
    return Math.round(value * 100) / 100;
}

function num(value: number | string | null | undefined): number {
    if (value === null || value === undefined || value === "") return 0;
    const n = typeof value === "number" ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n : 0;
}

/**
 * What is still owed on one row.
 *
 * Never negative. An overpayment is a credit and belongs in its own record —
 * letting it show as a negative balance here would quietly cancel out a real
 * debt on another row and hide it from whoever is chasing the money.
 */
export function outstandingOf(due: DueLike): number {
    const owed = num(due.amount) - num(due.paidAmount) - num(due.discountAmount);
    return money(Math.max(0, owed));
}

/** Settled means nothing is left, whether by payment, by discount, or by both. */
export function isSettled(due: DueLike): boolean {
    return outstandingOf(due) <= 0.009;
}

export type AccountTotals = {
    invoiced: number;
    paid: number;
    discounted: number;
    outstanding: number;
    /** How many rows still have something owing — what a counter actually asks. */
    openCount: number;
};

/**
 * A whole account, across every invoice.
 *
 * The answer to "what is left" when a customer has taken three deliveries and
 * paid twice. Summed from the rows every time it is asked, so a new partial
 * invoice or a payment against an old one is reflected without anything being
 * recalculated or kept in step by hand.
 */
export function accountTotals(dues: DueLike[]): AccountTotals {
    let invoiced = 0;
    let paid = 0;
    let discounted = 0;
    let outstanding = 0;
    let openCount = 0;

    for (const due of dues) {
        invoiced += num(due.amount);
        paid += num(due.paidAmount);
        discounted += num(due.discountAmount);
        const left = outstandingOf(due);
        outstanding += left;
        if (left > 0.009) openCount++;
    }

    return {
        invoiced: money(invoiced),
        paid: money(paid),
        discounted: money(discounted),
        outstanding: money(outstanding),
        openCount,
    };
}

export type Allocation = {
    dueId: string;
    invoice: string;
    /** Taken from the payment. */
    applied: number;
    /** Forgiven, to close the row. */
    discounted: number;
    /** What that row still owes afterwards. */
    remaining: number;
    settled: boolean;
};

export type AllocationPlan = {
    allocations: Allocation[];
    /** Paid but not needed — refuse rather than silently create a credit. */
    unapplied: number;
    totalDiscounted: number;
    outstandingAfter: number;
};

/**
 * Decide what a payment settles, before any of it is written.
 *
 * Oldest first, because that is what both sides assume when neither says
 * otherwise, and because asking someone to allocate 15,000 across three
 * invoices with a customer waiting is how the wrong invoice gets marked paid.
 *
 * The plan is returned rather than applied so the screen can show what the
 * money will do and the person can see it before confirming. The same function
 * then runs on the server, which is what makes the preview trustworthy: it is
 * not an estimate of what will happen, it is the thing that happens.
 *
 * `discount` closes the remainder after the payment is spread — the 500 left
 * on a 52,000 balance when 51,500 was handed over. It is applied to the oldest
 * rows still open for the same reason the payment is.
 */
export function planAllocation(
    dues: Array<DueLike & { id: string; invoice: string }>,
    payment: number,
    discount = 0,
): AllocationPlan {
    let remainingPayment = money(Math.max(0, payment));
    let remainingDiscount = money(Math.max(0, discount));
    const allocations: Allocation[] = [];
    let totalDiscounted = 0;
    let outstandingAfter = 0;

    for (const due of dues) {
        const owed = outstandingOf(due);
        if (owed <= 0.009) continue;

        const applied = money(Math.min(owed, remainingPayment));
        remainingPayment = money(remainingPayment - applied);

        const afterPayment = money(owed - applied);
        const forgiven = money(Math.min(afterPayment, remainingDiscount));
        remainingDiscount = money(remainingDiscount - forgiven);
        totalDiscounted += forgiven;

        const remaining = money(afterPayment - forgiven);
        outstandingAfter += remaining;

        if (applied > 0 || forgiven > 0) {
            allocations.push({
                dueId: due.id,
                invoice: due.invoice,
                applied,
                discounted: forgiven,
                remaining,
                settled: remaining <= 0.009,
            });
        }
    }

    return {
        allocations,
        unapplied: remainingPayment,
        totalDiscounted: money(totalDiscounted),
        outstandingAfter: money(outstandingAfter),
    };
}
