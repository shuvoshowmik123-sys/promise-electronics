/**
 * Margin arithmetic, and the one rule it exists to protect.
 *
 * An unknown cost is never zero. Stock on the shelf before cost tracking has no
 * purchase price recorded; counting that as free makes every historical item
 * look like pure profit and overstates margin on every report that touches it.
 * The owner will read these numbers to decide what to buy and what to charge, so
 * a number that looks finished and is wrong is worse than one that admits what
 * it does not know.
 *
 * Most of what follows checks that the unknown stays visible rather than
 * dissolving into a total.
 */
import { describe, expect, it } from "vitest";
import {
    computeLineMargin,
    nextWeightedAverage,
    sumMargins,
} from "../shared/inventory-costing.js";

describe("what stock cost after a delivery", () => {
    it("takes the price of the first costed delivery", () => {
        expect(nextWeightedAverage({ quantity: 0, avgCostPrice: null }, { quantity: 10, unitCost: 450 }))
            .toBe(450);
    });

    it("weights by quantity, not by number of deliveries", () => {
        /**
         * Ten at 450 then one at 900 is 491, not 675. A plain mean would let a
         * single emergency purchase distort the cost of a whole shelf, and every
         * margin drawn from it afterwards.
         */
        expect(nextWeightedAverage({ quantity: 10, avgCostPrice: 450 }, { quantity: 1, unitCost: 900 }))
            .toBe(490.91);
    });

    it("blends two equal deliveries to the midpoint", () => {
        expect(nextWeightedAverage({ quantity: 10, avgCostPrice: 450 }, { quantity: 10, unitCost: 500 }))
            .toBe(475);
    });

    it("does not blend against an unrecorded cost", () => {
        /**
         * The critical case. Stock on hand with no known cost has no average to
         * average with; treating the unknown as zero would halve the recorded
         * cost of the first real delivery and inflate margin from then on.
         */
        expect(nextWeightedAverage({ quantity: 50, avgCostPrice: null }, { quantity: 10, unitCost: 500 }))
            .toBe(500);
    });

    it("leaves the average alone when a delivery has no quantity", () => {
        expect(nextWeightedAverage({ quantity: 10, avgCostPrice: 450 }, { quantity: 0, unitCost: 900 }))
            .toBe(450);
    });

    it("ignores a negative cost rather than lowering the average", () => {
        // A typed minus sign must not quietly make stock cheaper.
        expect(nextWeightedAverage({ quantity: 10, avgCostPrice: 450 }, { quantity: 5, unitCost: -100 }))
            .toBe(450);
    });

    it("accepts a genuinely free delivery", () => {
        // A warranty replacement from a supplier really did cost nothing, and
        // that is different from never having been recorded.
        expect(nextWeightedAverage({ quantity: 10, avgCostPrice: 450 }, { quantity: 10, unitCost: 0 }))
            .toBe(225);
    });
});

describe("what one line earned", () => {
    it("reports profit and margin when the cost is known", () => {
        const r = computeLineMargin({ unitPrice: 900, quantity: 1, avgCostPrice: 475 });

        expect(r.known).toBe(true);
        if (!r.known) return;
        expect(r.revenue).toBe(900);
        expect(r.cost).toBe(475);
        expect(r.profit).toBe(425);
        expect(r.marginPercent).toBe(47.22);
    });

    it("multiplies cost by quantity", () => {
        const r = computeLineMargin({ unitPrice: 900, quantity: 3, avgCostPrice: 475 });

        expect(r.known && r.cost).toBe(1425);
        expect(r.known && r.profit).toBe(1275);
    });

    it("takes the discount off revenue, not off cost", () => {
        // A discount is money not collected. It does not make the part cheaper.
        const r = computeLineMargin({ unitPrice: 900, quantity: 1, avgCostPrice: 475, discount: 100 });

        expect(r.known && r.revenue).toBe(800);
        expect(r.known && r.cost).toBe(475);
        expect(r.known && r.profit).toBe(325);
    });

    it("says the cost is unknown instead of guessing", () => {
        const r = computeLineMargin({ unitPrice: 900, quantity: 1, avgCostPrice: null });

        expect(r.known).toBe(false);
        expect(!r.known && r.reason).toBe("cost_not_recorded");
        // Revenue is still real and still reported; only profit is unknowable.
        expect(r.revenue).toBe(900);
    });

    it("does not hand back a zero that could be added to a total", () => {
        /**
         * The whole point of the discriminated result. A plain `profit: 0` would
         * add silently into a report and read as a break-even sale rather than
         * an unanswered question.
         */
        const r = computeLineMargin({ unitPrice: 900, quantity: 1, avgCostPrice: null });

        expect(r).not.toHaveProperty("profit");
        expect(r).not.toHaveProperty("cost");
    });

    it("shows a loss when something sold below cost", () => {
        const r = computeLineMargin({ unitPrice: 300, quantity: 1, avgCostPrice: 475 });

        expect(r.known && r.profit).toBe(-175);
        expect(r.known && r.marginPercent).toBe(-58.33);
    });

    it("reports a giveaway as a loss, not a division by zero", () => {
        const r = computeLineMargin({ unitPrice: 0, quantity: 1, avgCostPrice: 475 });

        expect(r.known && r.profit).toBe(-475);
        expect(r.known && r.marginPercent).toBe(0);
    });

    it("never reports negative revenue from an oversized discount", () => {
        const r = computeLineMargin({ unitPrice: 900, quantity: 1, avgCostPrice: 475, discount: 2000 });

        expect(r.revenue).toBe(0);
    });
});

describe("adding a sale up", () => {
    it("totals profit across costed lines", () => {
        const t = sumMargins([
            computeLineMargin({ unitPrice: 900, quantity: 1, avgCostPrice: 475 }),
            computeLineMargin({ unitPrice: 1200, quantity: 2, avgCostPrice: 700 }),
        ]);

        expect(t.revenue).toBe(3300);
        expect(t.cost).toBe(1875);
        expect(t.profit).toBe(1425);
    });

    it("keeps uncosted revenue out of profit but visible in its own right", () => {
        /**
         * The report this is for reads: "profit on ৳3,300 of ৳5,300 sold;
         * ৳2,000 has no cost recorded". A total that quietly dropped the
         * uncosted line would look complete and be wrong, and nobody questions a
         * number that looks finished.
         */
        const t = sumMargins([
            computeLineMargin({ unitPrice: 900, quantity: 1, avgCostPrice: 475 }),
            computeLineMargin({ unitPrice: 1200, quantity: 2, avgCostPrice: 700 }),
            computeLineMargin({ unitPrice: 2000, quantity: 1, avgCostPrice: null }),
        ]);

        expect(t.revenue).toBe(5300);
        expect(t.costedRevenue).toBe(3300);
        expect(t.profit).toBe(1425);
        expect(t.unknownCostLines).toBe(1);
        expect(t.unknownCostRevenue).toBe(2000);
    });

    it("measures margin against costed revenue, not all revenue", () => {
        /**
         * Dividing by total revenue would drag the percentage down in proportion
         * to how much stock is uncosted, so margin would appear to fall as data
         * quality improved. The percentage has to describe the sales it can
         * actually account for.
         */
        const t = sumMargins([
            computeLineMargin({ unitPrice: 1000, quantity: 1, avgCostPrice: 500 }),
            computeLineMargin({ unitPrice: 9000, quantity: 1, avgCostPrice: null }),
        ]);

        expect(t.marginPercent).toBe(50);
    });

    it("reports no margin when nothing has a cost yet", () => {
        const t = sumMargins([
            computeLineMargin({ unitPrice: 900, quantity: 1, avgCostPrice: null }),
            computeLineMargin({ unitPrice: 300, quantity: 1, avgCostPrice: null }),
        ]);

        expect(t.revenue).toBe(1200);
        expect(t.profit).toBe(0);
        expect(t.marginPercent).toBe(0);
        expect(t.unknownCostLines).toBe(2);
        // The distinguishing fact: zero profit here means "cannot say", and the
        // unknown counters are what tell a reader that.
        expect(t.unknownCostRevenue).toBe(1200);
    });

    it("adds up an empty sale without dividing by zero", () => {
        const t = sumMargins([]);

        expect(t.revenue).toBe(0);
        expect(t.marginPercent).toBe(0);
    });
});
