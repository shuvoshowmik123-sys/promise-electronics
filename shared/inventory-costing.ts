/**
 * What stock cost, and therefore what a sale actually earned.
 *
 * Kept as pure functions in shared/ so the till, the reports and the client all
 * compute margin the same way. A second implementation anywhere would eventually
 * disagree with this one, and two different profit figures on two screens is
 * worse than none.
 *
 * The rule the whole file exists to protect: **an unknown cost is never zero.**
 * Stock that predates cost tracking has no purchase price recorded, and treating
 * that as free would make every historical item look like pure profit and
 * overstate margin on every report. Unknown is its own answer, and it is carried
 * all the way to the screen rather than being smoothed into a number.
 */

/** Money is stored as a float; round at the boundary rather than accumulating. */
function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface StockOnHand {
    /** Units currently held. */
    quantity: number;
    /** Weighted average paid per unit, or null when nothing was ever recorded. */
    avgCostPrice: number | null;
}

export interface StockReceipt {
    /** Units arriving. Negative or zero is not a receipt. */
    quantity: number;
    /** Paid per unit for this delivery. */
    unitCost: number;
}

/**
 * The new average after a delivery arrives.
 *
 * Weighted by quantity, not a plain mean: ten units at 450 followed by one at
 * 900 is an average of 491, not 675. A plain mean would let a single expensive
 * emergency purchase distort the cost of a shelf full of cheap stock, and every
 * margin drawn from it afterwards.
 */
export function nextWeightedAverage(
    onHand: StockOnHand,
    receipt: StockReceipt,
): number | null {
    if (!Number.isFinite(receipt.unitCost) || receipt.unitCost < 0) return onHand.avgCostPrice;
    if (!Number.isFinite(receipt.quantity) || receipt.quantity <= 0) return onHand.avgCostPrice;

    const heldQty = Math.max(0, Number(onHand.quantity) || 0);

    /**
     * Nothing on hand, or nothing costed yet, means there is no prior average to
     * blend with — this delivery simply sets it. Blending against an unknown by
     * treating it as zero is the mistake this file exists to prevent: it would
     * halve the recorded cost of the first costed delivery.
     */
    if (heldQty === 0 || onHand.avgCostPrice == null) {
        return round2(receipt.unitCost);
    }

    const totalValue = heldQty * onHand.avgCostPrice + receipt.quantity * receipt.unitCost;
    const totalQty = heldQty + receipt.quantity;
    return round2(totalValue / totalQty);
}

export type MarginResult =
    | { known: true; cost: number; revenue: number; profit: number; marginPercent: number }
    | { known: false; reason: "cost_not_recorded"; revenue: number };

/**
 * What one line of a sale earned.
 *
 * Returns `known: false` rather than a number when the cost was never recorded,
 * so a caller cannot accidentally add an unknown into a total. Every consumer
 * has to look at the flag, which is the point — a plain `0` would add silently
 * and read as a full-margin sale.
 */
export function computeLineMargin(input: {
    unitPrice: number;
    quantity: number;
    avgCostPrice: number | null;
    /** Discount already applied to this line, in money, not percent. */
    discount?: number;
}): MarginResult {
    const quantity = Math.max(0, Number(input.quantity) || 0);
    const revenue = round2(
        Math.max(0, quantity * (Number(input.unitPrice) || 0) - (Number(input.discount) || 0)),
    );

    if (input.avgCostPrice == null || !Number.isFinite(input.avgCostPrice)) {
        return { known: false, reason: "cost_not_recorded", revenue };
    }

    const cost = round2(quantity * input.avgCostPrice);
    const profit = round2(revenue - cost);

    /**
     * Margin is a share of revenue, so it is undefined when nothing was
     * charged — a giveaway or a fully discounted line. Reported as 0 rather
     * than a division by zero, with the loss still visible in `profit`.
     */
    const marginPercent = revenue > 0 ? round2((profit / revenue) * 100) : 0;

    return { known: true, cost, revenue, profit, marginPercent };
}

export interface MarginTotals {
    revenue: number;
    /** Revenue from lines whose cost is known — the only revenue profit describes. */
    costedRevenue: number;
    cost: number;
    profit: number;
    marginPercent: number;
    /** Lines left out because no cost was ever recorded. */
    unknownCostLines: number;
    unknownCostRevenue: number;
}

/**
 * Adds up a sale, a day, or a month.
 *
 * Lines with no recorded cost are counted separately and excluded from profit
 * rather than dropped, so a report can say "profit on ৳40,000 of ৳52,000 sold;
 * ৳12,000 has no cost recorded". A total that quietly omitted them would look
 * complete and be wrong, which is the failure mode worth designing against:
 * nobody questions a number that looks finished.
 */
export function sumMargins(results: MarginResult[]): MarginTotals {
    let revenue = 0;
    let costedRevenue = 0;
    let cost = 0;
    let unknownCostLines = 0;
    let unknownCostRevenue = 0;

    for (const r of results) {
        revenue += r.revenue;
        if (r.known) {
            costedRevenue += r.revenue;
            cost += r.cost;
        } else {
            unknownCostLines += 1;
            unknownCostRevenue += r.revenue;
        }
    }

    const profit = round2(costedRevenue - cost);
    return {
        revenue: round2(revenue),
        costedRevenue: round2(costedRevenue),
        cost: round2(cost),
        profit,
        marginPercent: costedRevenue > 0 ? round2((profit / costedRevenue) * 100) : 0,
        unknownCostLines,
        unknownCostRevenue: round2(unknownCostRevenue),
    };
}
