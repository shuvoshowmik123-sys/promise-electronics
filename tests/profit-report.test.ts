/**
 * Profit over a period, and the ways it could quietly mislead.
 *
 * The owner will read these numbers to decide what to stock and what to charge.
 * The failure that matters is not a crash — it is a confident figure built on a
 * third of the data, or a refunded sale still counted as earnings. Both look
 * completely normal on screen.
 *
 * Driven against the real service with the database faked at the query boundary,
 * so the aggregation, the refund handling and the coverage arithmetic are the
 * real ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("../server/db.js", () => ({ db: { execute: (q: unknown) => execute(q) } }));

/**
 * A sale as pos_transactions stores it — items are a JSON string.
 *
 * `subtotal` is set on every fixture because the real column is NOT NULL and
 * the report treats it as the truth about what was charged. The first version
 * of these fixtures omitted it, which is precisely why they could not catch the
 * revenue being rebuilt from line items instead: with no subtotal to disagree
 * with, the lines were never contradicted.
 */
function txn(over: Record<string, unknown> = {}) {
    const items = JSON.stringify([{ id: "item-a", name: "Backlight", quantity: 1, price: 900 }]);
    const base = {
        id: "t-1",
        items,
        linked_jobs: null as string | null,
        subtotal: 900,
        tax: 0,
        discount: 0,
        refunded_amount: 0,
        total: 900,
        created_at: "2026-08-20T10:00:00Z",
    };
    const merged = { ...base, ...over };
    /**
     * Keep subtotal consistent with total unless a test sets it deliberately,
     * so a fixture cannot quietly describe a sale that never existed.
     */
    if (!("subtotal" in over) && "total" in over) merged.subtotal = Number(over.total);
    return merged;
}

/**
 * loadPeriod issues two queries in order: transactions, then inventory costs.
 * Both endpoints call it, so each test declares one period's worth of data.
 */
function givenPeriod(
    transactions: Array<Record<string, unknown>>,
    items: Array<{ id: string; name: string; avg_cost_price: number | null }>,
) {
    execute.mockReset();
    execute
        .mockResolvedValueOnce({ rows: transactions })
        .mockResolvedValueOnce({ rows: items })
        // Both endpoints may be called in one test.
        .mockResolvedValueOnce({ rows: transactions })
        .mockResolvedValueOnce({ rows: items });
}

const FROM = new Date("2026-08-01T00:00:00Z");
const TO = new Date("2026-09-01T00:00:00Z");

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

async function summary() {
    const { getProfitSummary } = await import("../server/services/profit-report.service.js");
    return getProfitSummary(FROM, TO);
}
async function items(limit?: number) {
    const { getItemProfit } = await import("../server/services/profit-report.service.js");
    return getItemProfit(FROM, TO, limit);
}

describe("profit for a period", () => {
    it("subtracts what the stock cost", async () => {
        givenPeriod([txn()], [{ id: "item-a", name: "Backlight", avg_cost_price: 475 }]);

        const s = await summary();

        expect(s.revenue).toBe(900);
        expect(s.cost).toBe(475);
        expect(s.profit).toBe(425);
    });

    it("adds up several sales", async () => {
        givenPeriod(
            [
                txn(),
                txn({
                    id: "t-2",
                    items: JSON.stringify([{ id: "item-b", name: "Power Board", quantity: 2, price: 1200 }]),
                    total: 2400,
                }),
            ],
            [
                { id: "item-a", name: "Backlight", avg_cost_price: 475 },
                { id: "item-b", name: "Power Board", avg_cost_price: 700 },
            ],
        );

        const s = await summary();

        expect(s.revenue).toBe(3300);
        expect(s.profit).toBe(1425);
        expect(s.transactions).toBe(2);
    });
});

describe("stock with no recorded cost", () => {
    it("is left out of profit but still counted as revenue", async () => {
        givenPeriod(
            [
                txn(),
                txn({
                    id: "t-2",
                    items: JSON.stringify([{ id: "item-b", name: "Unknown Part", quantity: 1, price: 2000 }]),
                    total: 2000,
                }),
            ],
            [
                { id: "item-a", name: "Backlight", avg_cost_price: 475 },
                { id: "item-b", name: "Unknown Part", avg_cost_price: null },
            ],
        );

        const s = await summary();

        expect(s.revenue).toBe(2900);
        expect(s.profit).toBe(425);
        expect(s.unknownCostRevenue).toBe(2000);
        expect(s.unknownCostLines).toBe(1);
    });

    it("reports how much of the period the profit actually describes", async () => {
        /**
         * The figure that stops the rest being misread. Without it a profit of
         * 425 alongside revenue of 2,900 reads as a terrible month rather than
         * as a number covering under a third of what was sold.
         */
        givenPeriod(
            [
                txn(),
                txn({
                    id: "t-2",
                    items: JSON.stringify([{ id: "item-b", name: "Unknown", quantity: 1, price: 2000 }]),
                    total: 2000,
                }),
            ],
            [
                { id: "item-a", name: "Backlight", avg_cost_price: 475 },
                { id: "item-b", name: "Unknown", avg_cost_price: null },
            ],
        );

        const s = await summary();

        expect(s.coveragePercent).toBe(31);
    });

    it("reports zero coverage when nothing has a cost yet", async () => {
        givenPeriod([txn()], [{ id: "item-a", name: "Backlight", avg_cost_price: null }]);

        const s = await summary();

        expect(s.coveragePercent).toBe(0);
        expect(s.profit).toBe(0);
        // Zero profit here means "cannot say", and this is what distinguishes it.
        expect(s.unknownCostRevenue).toBe(900);
    });

    it("counts an item sold but missing from inventory as unknown, not free", async () => {
        // Deleted items and ad-hoc lines still appear in old carts.
        givenPeriod([txn()], []);

        const s = await summary();

        expect(s.unknownCostLines).toBe(1);
        expect(s.profit).toBe(0);
    });
});

describe("refunds", () => {
    it("remove refunded money from earnings", async () => {
        /**
         * A refunded sale earned nothing. Counting it would overstate the
         * period, and the part is not back on the shelf either — so revenue
         * goes and the cost stays, which is what actually happened.
         */
        givenPeriod(
            [txn({ refunded_amount: 900 })],
            [{ id: "item-a", name: "Backlight", avg_cost_price: 475 }],
        );

        const s = await summary();

        expect(s.revenue).toBe(0);
        expect(s.profit).toBe(-475);
    });

    it("remove only the part refunded", async () => {
        givenPeriod(
            [txn({ refunded_amount: 300 })],
            [{ id: "item-a", name: "Backlight", avg_cost_price: 475 }],
        );

        const s = await summary();

        expect(s.revenue).toBe(600);
        expect(s.profit).toBe(125);
    });

    it("never turn a refund into negative revenue", async () => {
        // An over-refund is a data error and must not invent income in reverse.
        givenPeriod(
            [txn({ refunded_amount: 5000 })],
            [{ id: "item-a", name: "Backlight", avg_cost_price: 475 }],
        );

        expect((await summary()).revenue).toBe(0);
    });
});

describe("bad data in old rows", () => {
    it("does not fail the whole report on one corrupt cart", async () => {
        // A month's reporting must not be lost to one unreadable row.
        givenPeriod(
            [txn({ items: "{not json" }), txn({ id: "t-2" })],
            [{ id: "item-a", name: "Backlight", avg_cost_price: 475 }],
        );

        const s = await summary();

        expect(s.profit).toBe(425);
        expect(s.transactions).toBe(2);
    });

    it("handles a period with no sales without dividing by zero", async () => {
        givenPeriod([], []);

        const s = await summary();

        expect(s.revenue).toBe(0);
        expect(s.marginPercent).toBe(0);
        expect(s.coveragePercent).toBe(0);
    });
});

describe("which items earn the most", () => {
    it("ranks by profit, not by revenue", async () => {
        /**
         * The distinction the whole screen exists for: the thing you sell most
         * of is often not the thing that pays you.
         */
        givenPeriod(
            [
                txn({ items: JSON.stringify([{ id: "busy", name: "Cheap Cable", quantity: 10, price: 100 }]), total: 1000 }),
                txn({ id: "t-2", items: JSON.stringify([{ id: "quiet", name: "Main Board", quantity: 1, price: 900 }]), total: 900 }),
            ],
            [
                { id: "busy", name: "Cheap Cable", avg_cost_price: 90 },
                { id: "quiet", name: "Main Board", avg_cost_price: 200 },
            ],
        );

        const rows = await items();

        expect(rows[0].name).toBe("Main Board");
        expect(rows[0].profit).toBe(700);
        expect(rows[1].profit).toBe(100);
    });

    it("keeps uncosted items visible at the bottom instead of hiding them", async () => {
        /**
         * "We sold a lot of this and cannot say what it earned" is precisely the
         * prompt to go and record a cost. Dropping the row would hide the gap
         * that needs filling.
         */
        givenPeriod(
            [
                txn({ items: JSON.stringify([{ id: "known", name: "Known", quantity: 1, price: 900 }]), total: 900 }),
                txn({ id: "t-2", items: JSON.stringify([{ id: "mystery", name: "Mystery", quantity: 5, price: 1000 }]), total: 5000 }),
            ],
            [
                { id: "known", name: "Known", avg_cost_price: 475 },
                { id: "mystery", name: "Mystery", avg_cost_price: null },
            ],
        );

        const rows = await items();

        expect(rows).toHaveLength(2);
        expect(rows[0].name).toBe("Known");
        expect(rows[1].name).toBe("Mystery");
        expect(rows[1].profit).toBeNull();
        // Its revenue is still real and still shown.
        expect(rows[1].revenue).toBe(5000);
    });

    it("combines the same item across separate sales", async () => {
        givenPeriod(
            [
                txn({ items: JSON.stringify([{ id: "item-a", name: "Backlight", quantity: 1, price: 900 }]), total: 900 }),
                txn({ id: "t-2", items: JSON.stringify([{ id: "item-a", name: "Backlight", quantity: 2, price: 900 }]), total: 1800 }),
            ],
            [{ id: "item-a", name: "Backlight", avg_cost_price: 475 }],
        );

        const rows = await items();

        expect(rows).toHaveLength(1);
        expect(rows[0].quantitySold).toBe(3);
        expect(rows[0].revenue).toBe(2700);
        expect(rows[0].profit).toBe(1275);
    });
});

describe("revenue comes from the sale, not from adding its lines up", () => {
    it("subtracts a discount", async () => {
        /**
         * The discount column was read and never applied, so revenue was
         * overstated by every discount ever given — and profit inherited the
         * whole error, since revenue is what cost is subtracted from.
         */
        givenPeriod(
            [txn({ subtotal: 900, discount: 100, total: 800 })],
            [{ id: "item-a", name: "Backlight", avg_cost_price: 475 }],
        );

        const s = await summary();

        expect(s.revenue).toBe(800);
        expect(s.profit).toBe(325);
    });

    it("excludes tax, because collected VAT is not the shop's money", async () => {
        givenPeriod(
            [txn({ subtotal: 900, tax: 45, total: 945 })],
            [{ id: "item-a", name: "Backlight", avg_cost_price: 475 }],
        );

        expect((await summary()).revenue).toBe(900);
    });

    it("does not double-count a repair billed as both a line and a linked job", async () => {
        /**
         * A real sale in the live data did exactly this: its lines summed to
         * more than its own subtotal, and the repair was counted twice. Across
         * 28 sales it inflated the period by 5,500. The sale knows what it
         * charged; the lines are only evidence of what it cost.
         */
        givenPeriod(
            [txn({
                subtotal: 900,
                total: 900,
                items: JSON.stringify([{ id: "item-a", name: "Repair", quantity: 1, price: 900 }]),
                linked_jobs: JSON.stringify([{ jobId: "job-1", billedAmount: 900 }]),
            })],
            [{ id: "item-a", name: "Repair", avg_cost_price: null }],
        );

        const s = await summary();

        // 900 charged, not 1,800.
        expect(s.revenue).toBe(900);
    });

    it("splits a sale that is genuinely part retail and part repair", async () => {
        givenPeriod(
            [txn({
                subtotal: 3000,
                total: 3000,
                items: JSON.stringify([{ id: "item-a", name: "Backlight", quantity: 1, price: 1000 }]),
                linked_jobs: JSON.stringify([{ jobId: "job-1", billedAmount: 2000 }]),
            })],
            [{ id: "item-a", name: "Backlight", avg_cost_price: 475 }],
        );

        const s = await summary();

        expect(s.revenue).toBe(3000);
        expect(s.retail.revenue).toBe(1000);
        expect(s.repairs.revenue).toBe(2000);
    });
});
