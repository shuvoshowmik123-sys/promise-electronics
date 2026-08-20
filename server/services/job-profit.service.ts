/**
 * What a repair earned, as opposed to what it was billed.
 *
 * The profit report started by reading POS cart lines, which is only half the
 * shop: a repair is not billed as cart items at all. It is billed as
 * `linkedJobs` — one amount per job ticket, stored in its own column — so every
 * repair was invisible to the first version of the report. That is most of the
 * business.
 *
 * The costs were already being recorded, in two different places, and nothing
 * had ever used either of them:
 *
 *   local_purchases   a part bought from a vendor for one job, with what was paid
 *   wastage_logs      a part taken off the shelf for a job ("Job consumption: id"),
 *                     costed at the item's average
 *
 * **Labour is not counted as a cost here.** A technician's time is paid through
 * salary, not per job, so subtracting it would double-count it against the wage
 * bill. What this returns is therefore margin before wages, and the screen has
 * to say so rather than letting it read as take-home profit.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";

export interface JobCost {
    /** Total paid for parts on this job, or null when a part's cost is unknown. */
    cost: number | null;
    partsCount: number;
}

interface LinkedJobLine {
    jobId?: string | null;
    billedAmount?: number | null;
}

/** Rows come back untyped from db.execute; this narrows once, here. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
    return (result as { rows?: Array<Record<string, unknown>> })?.rows ?? [];
}

export function parseLinkedJobs(raw: string | null): LinkedJobLine[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * What the parts on a set of jobs cost.
 *
 * A job with no parts at all costs nothing and that is a real answer, not a
 * missing one — plenty of repairs are cleaning or a reflow with nothing
 * replaced. Unknown is reserved for the case that actually is unknown: a part
 * was taken off the shelf and that item has no recorded cost. Conflating the two
 * would either hide a genuine gap or make every labour-only repair look
 * unmeasurable.
 */
export async function getJobCosts(jobIds: string[]): Promise<Map<string, JobCost>> {
    const costs = new Map<string, JobCost>();
    if (jobIds.length === 0) return costs;

    for (const id of jobIds) costs.set(id, { cost: 0, partsCount: 0 });

    /**
     * Parts bought from a vendor for the job. Returned purchases are excluded —
     * the money came back, so it was never a cost.
     */
    /**
     * An explicit parameterised IN list, not `= ANY($1)`.
     *
     * The array form looked cleaner and did not work: the driver received the
     * ids as a single value, and Postgres answered "op ANY/ALL (array) requires
     * array on right side" for every period that had any sales at all. QA found
     * it — the unit tests could not, because they replace db.execute entirely
     * and so never send a query anywhere.
     *
     * sql.join emits one placeholder per id, so the values are still bound
     * rather than interpolated.
     */
    const idList = sql.join(jobIds.map((id) => sql`${id}`), sql`, `);

    const purchases = await db.execute(sql`
        SELECT job_ticket_id, SUM(cost_price * quantity) AS total, COUNT(*) AS lines
        FROM local_purchases
        WHERE job_ticket_id IN (${idList})
          AND status <> 'Returned'
        GROUP BY job_ticket_id
    `);

    for (const row of rowsOf(purchases)) {
        const jobId = String(row.job_ticket_id);
        const entry = costs.get(jobId);
        if (!entry) continue;
        entry.cost = (entry.cost ?? 0) + Number(row.total ?? 0);
        entry.partsCount += Number(row.lines ?? 0);
    }

    /**
     * Parts taken off the shelf. These are recorded as wastage rows whose reason
     * reads "Job consumption: <jobId>", which is how the consume endpoint writes
     * them — matching on that string is fragile, and it is the only link that
     * exists. A dedicated column would be better; this is deliberately not the
     * commit that changes how consumption is stored.
     */
    const consumed = await db.execute(sql`
        SELECT w.reason, w.quantity, i.avg_cost_price
        FROM wastage_logs w
        LEFT JOIN inventory_items i ON i.id = w.inventory_item_id
        WHERE w.reason LIKE 'Job consumption: %'
    `);

    for (const row of rowsOf(consumed)) {
        const jobId = String(row.reason ?? "").replace("Job consumption: ", "").trim();
        const entry = costs.get(jobId);
        if (!entry) continue;

        entry.partsCount += 1;

        if (row.avg_cost_price == null) {
            // A part was used and nobody knows what it cost. The whole job's
            // margin is unknowable from here; saying zero would report the
            // repair as pure profit.
            entry.cost = null;
            continue;
        }
        if (entry.cost !== null) {
            entry.cost += Number(row.avg_cost_price) * Number(row.quantity ?? 1);
        }
    }

    return costs;
}

export interface RepairTotals {
    revenue: number;
    cost: number;
    profit: number;
    marginPercent: number;
    jobs: number;
    /** Jobs whose parts cost could not be established. */
    unknownCostJobs: number;
    unknownCostRevenue: number;
}

/**
 * Adds up the repair side of a period.
 *
 * `refundRatio` is applied per transaction because a refunded repair earned
 * nothing, exactly as with a retail sale — and the parts are not back on the
 * shelf, so the cost stays.
 */
export async function summariseRepairs(
    transactions: Array<{
        linkedJobs: string | null;
        total: number;
        refundedAmount: number;
        discount?: number;
        /** The sale's recorded pre-tax figure — the truth about what it charged. */
        subtotal?: number;
        /** Retail lines on the same sale, so the repair's share can be worked out. */
        cartGross?: number;
    }>,
): Promise<RepairTotals> {
    const billed = new Map<string, number>();

    for (const txn of transactions) {
        /**
         * Discount and refund are both money the shop did not keep, and both
         * are stored once for the whole sale. A repair billed at 3,500 with a
         * 500 discount earned 3,000, and counting the full 3,500 overstated
         * repair revenue by every discount ever given.
         */
        const refunded = Number(txn.refundedAmount || 0);
        const discount = Number(txn.discount || 0);
        const subtotal = Number(txn.subtotal ?? txn.total ?? 0);
        const netRevenue = Math.max(0, subtotal - discount - refunded);

        const jobGross = parseLinkedJobs(txn.linkedJobs)
            .reduce((sum, j) => sum + Number(j.billedAmount ?? 0), 0);
        const gross = jobGross + Number(txn.cartGross ?? 0);

        /**
         * Scaled to what the sale recorded rather than what its lines add up
         * to. One real sale carried a repair as both a cart line and a linked
         * job, so the lines exceeded the subtotal and the repair was counted
         * twice. The sale knows what it charged.
         */
        const kept = gross > 0 ? netRevenue / gross : 0;

        for (const line of parseLinkedJobs(txn.linkedJobs)) {
            if (!line.jobId) continue;
            const jobId = String(line.jobId);
            billed.set(jobId, (billed.get(jobId) ?? 0) + Number(line.billedAmount ?? 0) * kept);
        }
    }

    const costs = await getJobCosts(Array.from(billed.keys()));

    let revenue = 0;
    let cost = 0;
    let costedRevenue = 0;
    let unknownCostJobs = 0;
    let unknownCostRevenue = 0;

    for (const [jobId, amount] of Array.from(billed.entries())) {
        revenue += amount;
        const jobCost = costs.get(jobId);

        if (!jobCost || jobCost.cost === null) {
            unknownCostJobs += 1;
            unknownCostRevenue += amount;
            continue;
        }
        costedRevenue += amount;
        cost += jobCost.cost;
    }

    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const profit = round2(costedRevenue - cost);

    return {
        revenue: round2(revenue),
        cost: round2(cost),
        profit,
        marginPercent: costedRevenue > 0 ? round2((profit / costedRevenue) * 100) : 0,
        jobs: billed.size,
        unknownCostJobs,
        unknownCostRevenue: round2(unknownCostRevenue),
    };
}
