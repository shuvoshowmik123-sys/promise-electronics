/**
 * What the shop actually earned over a period, as opposed to what it took.
 *
 * Revenue has always been available; profit has not, because nothing recorded
 * what stock cost. Now that `inventory_items.avg_cost_price` exists, a sale can
 * be priced against what its parts were bought for.
 *
 * The honesty rule from shared/inventory-costing.ts carries all the way through
 * here: a line whose cost was never recorded is **excluded from profit and
 * reported separately**, never valued at zero. A total that quietly swallowed
 * uncosted lines would look complete and be wrong, and nobody questions a number
 * that looks finished. So every figure this returns comes with how much of the
 * period it could actually account for.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import {
    computeLineMargin,
    sumMargins,
    type MarginResult,
} from "../../shared/inventory-costing.js";
import { parseLinkedJobs, summariseRepairs, type RepairTotals } from "./job-profit.service.js";

export interface ProfitSummary {
    from: string;
    to: string;
    revenue: number;
    /** Revenue from lines whose cost is known — the only revenue profit describes. */
    costedRevenue: number;
    cost: number;
    profit: number;
    marginPercent: number;
    unknownCostLines: number;
    unknownCostRevenue: number;
    /** How much of the period's revenue profit could be calculated for, 0–100. */
    coveragePercent: number;
    transactions: number;
    /**
     * The two halves of the shop, kept apart because they behave differently.
     *
     * Retail margin is the gap between a part's shelf price and what it cost.
     * Repair margin is what was billed minus the parts consumed, before wages —
     * a technician is paid by salary, not per job, so charging their time
     * against each repair would double-count it against the wage bill. One
     * blended percentage would hide both facts.
     */
    retail: { revenue: number; cost: number; profit: number; marginPercent: number };
    repairs: RepairTotals;
}

export interface ItemProfitRow {
    itemId: string;
    name: string;
    quantitySold: number;
    revenue: number;
    cost: number | null;
    profit: number | null;
    marginPercent: number | null;
}

/** One line of a stored cart. Everything is optional; old rows are untidy. */
interface CartLine {
    id?: string | null;
    name?: string | null;
    quantity?: number | null;
    price?: number | null;
}

function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseCart(raw: string | null): CartLine[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        // A corrupt cart is not a reason to fail a whole month's report; the
        // transaction still counts toward revenue via its own total.
        return [];
    }
}

/**
 * Loads the sales in a window, along with the cost of everything sold.
 *
 * Refunded money is removed from revenue before margin is taken. A refunded sale
 * earned nothing, and counting it would overstate profit for the period — the
 * cost of the part is not recovered by the refund, but the revenue certainly is
 * not kept.
 */
async function loadPeriod(from: Date, to: Date) {
    const txns = await db.execute(sql`
        SELECT id, items, linked_jobs, subtotal, tax, discount, refunded_amount, total, created_at
        FROM pos_transactions
        WHERE created_at >= ${from} AND created_at < ${to}
          AND payment_status <> 'Cancelled'
    `);
    const rows = (txns as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];

    const costs = await db.execute(sql`
        SELECT id, name, avg_cost_price FROM inventory_items
    `);
    const costRows = (costs as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];

    const costById = new Map<string, { name: string; avgCostPrice: number | null }>();
    for (const c of costRows) {
        costById.set(String(c.id), {
            name: String(c.name ?? ""),
            avgCostPrice: c.avg_cost_price == null ? null : Number(c.avg_cost_price),
        });
    }

    return { rows, costById };
}

export async function getProfitSummary(from: Date, to: Date): Promise<ProfitSummary> {
    const { rows, costById } = await loadPeriod(from, to);

    const margins: MarginResult[] = [];
    for (const txn of rows) {
        const lines = parseCart(txn.items as string | null);
        const total = Number(txn.total ?? 0);
        const refunded = Number(txn.refunded_amount ?? 0);

        /**
         * Revenue comes from the sale's own recorded figures, not from adding
         * its lines up.
         *
         * Rebuilding it from lines was wrong twice over. It ignored the
         * discount, and it trusted the lines to reconcile — which they do not:
         * across 28 real sales the lines summed to 97,500 against a recorded
         * subtotal of 92,000, because one transaction carried a repair as both
         * a cart line and a linked job and so counted it twice. The sale knows
         * what it charged; the lines are only evidence of what it cost.
         *
         * So each line is scaled to fit what the sale actually earned. Tax is
         * excluded deliberately — VAT collected is not the shop's money, and
         * counting it as revenue would inflate every margin.
         */
        const subtotal = Number(txn.subtotal ?? 0);
        const discount = Number(txn.discount ?? 0);
        const netRevenue = Math.max(0, subtotal - discount - refunded);

        const lineGross = lines.reduce(
            (sum, l) => sum + Number(l.quantity ?? 0) * Number(l.price ?? 0), 0,
        );
        const jobGross = parseLinkedJobs(txn.linked_jobs as string | null)
            .reduce((sum, j) => sum + Number(j.billedAmount ?? 0), 0);
        const gross = lineGross + jobGross;

        // Retail's share of the sale, before scaling — a sale can be both.
        const scale = gross > 0 ? netRevenue / gross : 0;

        for (const line of lines) {
            const itemId = line.id ? String(line.id) : null;
            const known = itemId ? costById.get(itemId) : undefined;
            const quantity = Number(line.quantity ?? 0);
            const unitPrice = Number(line.price ?? 0);

            margins.push(computeLineMargin({
                unitPrice,
                quantity,
                avgCostPrice: known?.avgCostPrice ?? null,
                // Scaling by discount is how computeLineMargin expresses "less
                // than list was collected"; the amount here is whatever this
                // line did not earn once the sale's real figures are applied.
                discount: quantity * unitPrice * (1 - scale),
            }));
        }
    }

    const totals = sumMargins(margins);

    /**
     * Repairs are billed as linkedJobs, not as cart lines, so they are absent
     * from `margins` entirely — the first version of this report simply did not
     * count them, which left most of the shop out of its own profit figure.
     */
    const repairs = await summariseRepairs(rows.map((r) => ({
        linkedJobs: (r.linked_jobs as string | null) ?? null,
        total: Number(r.total ?? 0),
        refundedAmount: Number(r.refunded_amount ?? 0),
        discount: Number(r.discount ?? 0),
        subtotal: Number(r.subtotal ?? 0),
        cartGross: parseCart(r.items as string | null)
            .reduce((sum, l) => sum + Number(l.quantity ?? 0) * Number(l.price ?? 0), 0),
    })));

    const revenue = round2(totals.revenue + repairs.revenue);
    const costedRevenue = round2(
        totals.costedRevenue + (repairs.revenue - repairs.unknownCostRevenue),
    );
    const cost = round2(totals.cost + repairs.cost);
    const profit = round2(costedRevenue - cost);

    return {
        from: from.toISOString(),
        to: to.toISOString(),
        revenue,
        costedRevenue,
        cost,
        profit,
        marginPercent: costedRevenue > 0 ? round2((profit / costedRevenue) * 100) : 0,
        unknownCostLines: totals.unknownCostLines + repairs.unknownCostJobs,
        unknownCostRevenue: round2(totals.unknownCostRevenue + repairs.unknownCostRevenue),
        /**
         * The number that stops the rest being misread. At 40% coverage a
         * profit figure describes less than half the period, and the screen has
         * to be able to say so.
         */
        coveragePercent: revenue > 0
            ? Math.round((costedRevenue / revenue) * 1000) / 10
            : 0,
        transactions: rows.length,
        retail: {
            revenue: totals.revenue,
            cost: totals.cost,
            profit: totals.profit,
            marginPercent: totals.marginPercent,
        },
        repairs,
    };
}

/**
 * Which items earn the most, best first.
 *
 * Items whose cost is unknown are returned with null profit rather than being
 * dropped: "we sold a lot of this and cannot say what it earned" is exactly the
 * prompt to go and record a cost, and hiding those rows would hide the gap.
 */
export async function getItemProfit(from: Date, to: Date, limit = 20): Promise<ItemProfitRow[]> {
    const { rows, costById } = await loadPeriod(from, to);

    const perItem = new Map<string, { name: string; qty: number; revenue: number }>();

    for (const txn of rows) {
        const total = Number(txn.total ?? 0);
        const refunded = Number(txn.refunded_amount ?? 0);
        const keptRatio = total > 0 ? Math.max(0, 1 - Math.min(1, refunded / total)) : 1;

        for (const line of parseCart(txn.items as string | null)) {
            const itemId = line.id ? String(line.id) : null;
            if (!itemId) continue;
            const quantity = Number(line.quantity ?? 0);
            const revenue = quantity * Number(line.price ?? 0) * keptRatio;

            const existing = perItem.get(itemId) ?? {
                name: costById.get(itemId)?.name || String(line.name ?? "Unknown item"),
                qty: 0,
                revenue: 0,
            };
            existing.qty += quantity;
            existing.revenue += revenue;
            perItem.set(itemId, existing);
        }
    }

    const out: ItemProfitRow[] = [];
    for (const [itemId, agg] of Array.from(perItem.entries())) {
        const avgCostPrice = costById.get(itemId)?.avgCostPrice ?? null;
        const margin = computeLineMargin({
            unitPrice: agg.qty > 0 ? agg.revenue / agg.qty : 0,
            quantity: agg.qty,
            avgCostPrice,
        });

        out.push({
            itemId,
            name: agg.name,
            quantitySold: Math.round(agg.qty * 100) / 100,
            revenue: Math.round(agg.revenue * 100) / 100,
            cost: margin.known ? margin.cost : null,
            profit: margin.known ? margin.profit : null,
            marginPercent: margin.known ? margin.marginPercent : null,
        });
    }

    /**
     * Known profit first, largest down; unknown-cost items after, ordered by
     * revenue. They belong at the bottom as a to-do list rather than mixed in
     * where a null would sort unpredictably.
     */
    out.sort((a, b) => {
        if (a.profit == null && b.profit == null) return b.revenue - a.revenue;
        if (a.profit == null) return 1;
        if (b.profit == null) return -1;
        return b.profit - a.profit;
    });

    return out.slice(0, limit);
}
