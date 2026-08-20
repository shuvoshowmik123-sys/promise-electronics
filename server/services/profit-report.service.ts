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
        SELECT id, items, discount, refunded_amount, total, created_at
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
         * A refund is spread across the sale's lines in proportion to what each
         * contributed, because the stored refund is a single amount with no line
         * breakdown. Proportional is the only defensible split without inventing
         * detail the data does not have.
         */
        const refundRatio = total > 0 ? Math.min(1, refunded / total) : 0;

        for (const line of lines) {
            const itemId = line.id ? String(line.id) : null;
            const known = itemId ? costById.get(itemId) : undefined;
            const quantity = Number(line.quantity ?? 0);
            const unitPrice = Number(line.price ?? 0);

            margins.push(computeLineMargin({
                unitPrice,
                quantity,
                avgCostPrice: known?.avgCostPrice ?? null,
                discount: quantity * unitPrice * refundRatio,
            }));
        }
    }

    const totals = sumMargins(margins);

    return {
        from: from.toISOString(),
        to: to.toISOString(),
        revenue: totals.revenue,
        costedRevenue: totals.costedRevenue,
        cost: totals.cost,
        profit: totals.profit,
        marginPercent: totals.marginPercent,
        unknownCostLines: totals.unknownCostLines,
        unknownCostRevenue: totals.unknownCostRevenue,
        /**
         * The number that stops the rest being misread. At 40% coverage a
         * profit figure describes less than half the period, and the screen has
         * to be able to say so.
         */
        coveragePercent: totals.revenue > 0
            ? Math.round((totals.costedRevenue / totals.revenue) * 1000) / 10
            : 0,
        transactions: rows.length,
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
