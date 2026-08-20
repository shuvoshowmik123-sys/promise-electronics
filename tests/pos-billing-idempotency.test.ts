/**
 * The guard that stops one sale being charged twice.
 *
 * A till is retried constantly and not always on purpose: a cashier taps Pay
 * again because the screen looked stuck, the network drops after the server
 * committed but before the reply arrived, a phone rotates mid-request. Every one
 * of those arrives as a second identical call, and the answer has to be "here is
 * the sale you already made" rather than a second charge.
 *
 * The mechanism is a fingerprint. Each sale is hashed down to the things that
 * decide what the customer pays, and a repeat carrying the same clientRequestId
 * is only accepted as a replay when its fingerprint matches. Same money, same
 * sale. Different money under a reused id is refused as IDEMPOTENCY_CONFLICT,
 * because the alternative — returning the earlier receipt for a request that
 * asked for something else — silently drops a real sale.
 *
 * These are pure functions, so this exercises the real ones with no database and
 * no mocking. That matters: the file they live in is 910 statements at 0.7%
 * coverage, and the guard was previously proven only by somebody clicking a
 * till by hand.
 */
import { describe, expect, it } from "vitest";
import {
    assertIdempotentReplay,
    buildPosSaleFingerprint,
    derivePosRefundLifecycle,
    PosBillingError,
} from "../server/services/pos-billing.service.js";

/** A plain retail sale; each test changes only the field under examination. */
function sale(over: Record<string, unknown> = {}) {
    return {
        paymentMethod: "Cash",
        paymentStatus: "Paid",
        subtotal: 3000,
        tax: 0,
        discount: 0,
        total: 3000,
        customer: "Rahim",
        customerPhone: "01711223344",
        serviceAreaId: null,
        cartItems: [{ id: "i-1", name: "LED Backlight", quantity: 1, price: 3000, itemType: "part" }],
        linkedJobs: [],
        ...over,
    };
}

describe("the same sale sent twice", () => {
    it("produces the same fingerprint", () => {
        expect(buildPosSaleFingerprint(sale())).toBe(buildPosSaleFingerprint(sale()));
    });

    it("does not care what order the cart was built in", () => {
        /**
         * Two cashiers scanning the same two items in opposite orders are making
         * the same sale. Were order significant, a genuine retry after a reorder
         * would look like a different request and be charged again.
         */
        const a = sale({
            cartItems: [
                { id: "i-1", name: "Backlight", quantity: 1, price: 2000, itemType: "part" },
                { id: "i-2", name: "Power Board", quantity: 1, price: 1000, itemType: "part" },
            ],
        });
        const b = sale({
            cartItems: [
                { id: "i-2", name: "Power Board", quantity: 1, price: 1000, itemType: "part" },
                { id: "i-1", name: "Backlight", quantity: 1, price: 2000, itemType: "part" },
            ],
        });

        expect(buildPosSaleFingerprint(a)).toBe(buildPosSaleFingerprint(b));
    });

    it("does not care how the phone number was typed", () => {
        // "01711-223344" and "01711 223344" are one customer, and a retry that
        // reformats the number is still the same sale.
        expect(buildPosSaleFingerprint(sale({ customerPhone: "01711-223344" })))
            .toBe(buildPosSaleFingerprint(sale({ customerPhone: "01711 223344" })));
    });

    it("does not care about the customer name's capitalisation or spacing", () => {
        expect(buildPosSaleFingerprint(sale({ customer: "  RAHIM " })))
            .toBe(buildPosSaleFingerprint(sale({ customer: "rahim" })));
    });

    it("treats a Due sale as Due whatever status is claimed alongside it", () => {
        /**
         * Money not yet collected must never fingerprint as money collected. If
         * "Due + Paid" and "Due + Due" hashed differently, the same unpaid sale
         * could be recorded twice by a client that labelled the retry
         * differently.
         */
        expect(buildPosSaleFingerprint(sale({ paymentMethod: "Due", paymentStatus: "Paid" })))
            .toBe(buildPosSaleFingerprint(sale({ paymentMethod: "Due", paymentStatus: "Due" })));
    });
});

describe("a different sale", () => {
    /** Every one of these changes what the customer pays or who paid it. */
    const mustDiffer: Array<[string, Record<string, unknown>]> = [
        ["a different total", { total: 3500 }],
        ["a discount applied", { discount: 500, total: 2500 }],
        ["tax added", { tax: 150, total: 3150 }],
        ["a different subtotal", { subtotal: 2900 }],
        ["a different payment method", { paymentMethod: "Card" }],
        ["Due instead of Paid", { paymentMethod: "Due", paymentStatus: "Due" }],
        ["a different customer", { customer: "Karim" }],
        ["a different phone", { customerPhone: "01999888777" }],
        ["a different service area", { serviceAreaId: "area-9" }],
        ["a different quantity", {
            cartItems: [{ id: "i-1", name: "LED Backlight", quantity: 2, price: 3000, itemType: "part" }],
        }],
        ["a different price", {
            cartItems: [{ id: "i-1", name: "LED Backlight", quantity: 1, price: 3200, itemType: "part" }],
        }],
        ["a different item", {
            cartItems: [{ id: "i-2", name: "Power Board", quantity: 1, price: 3000, itemType: "part" }],
        }],
        ["a linked job", { linkedJobs: [{ jobId: "job-1", billedAmount: 3000 }] }],
    ];

    for (const [what, change] of mustDiffer) {
        it(`fingerprints differently for ${what}`, () => {
            expect(buildPosSaleFingerprint(sale(change)))
                .not.toBe(buildPosSaleFingerprint(sale()));
        });
    }

    it("distinguishes the same job billed for a different amount", () => {
        // Billing job-1 for ৳3,000 and for ৳1,500 are different financial acts;
        // collapsing them would let a re-bill at a new price return the old one.
        const first = sale({ linkedJobs: [{ jobId: "job-1", billedAmount: 3000 }] });
        const second = sale({ linkedJobs: [{ jobId: "job-1", billedAmount: 1500 }] });

        expect(buildPosSaleFingerprint(first)).not.toBe(buildPosSaleFingerprint(second));
    });
});

describe("replaying a clientRequestId", () => {
    /** A stored transaction as the table holds it — items are JSON strings. */
    function priorRow(over: Record<string, unknown> = {}) {
        return {
            id: "txn-1",
            clientRequestId: "req-1",
            paymentMethod: "Cash",
            paymentStatus: "Paid",
            subtotal: 3000,
            tax: 0,
            discount: 0,
            total: 3000,
            customer: "Rahim",
            customerPhone: "01711223344",
            serviceAreaId: null,
            items: JSON.stringify(sale().cartItems),
            linkedJobs: JSON.stringify([]),
            ...over,
        } as never;
    }

    it("returns the original sale when the money matches", () => {
        const fingerprint = buildPosSaleFingerprint(sale());
        const stored = priorRow({ idempotencyFingerprint: fingerprint });

        expect(assertIdempotentReplay(stored, fingerprint, "req-1")).toBe(stored);
    });

    it("refuses when the same id carries different money", () => {
        /**
         * The dangerous case. Returning the earlier receipt here would report
         * success for a sale that was never recorded, and the second sale would
         * simply vanish — no error, no row, no money.
         */
        const stored = priorRow({ idempotencyFingerprint: buildPosSaleFingerprint(sale()) });
        const different = buildPosSaleFingerprint(sale({ total: 5000 }));

        expect(() => assertIdempotentReplay(stored, different, "req-1"))
            .toThrowError(PosBillingError);
    });

    it("refuses with 409 and a code the client can act on", () => {
        const stored = priorRow({ idempotencyFingerprint: buildPosSaleFingerprint(sale()) });
        const different = buildPosSaleFingerprint(sale({ total: 5000 }));

        try {
            assertIdempotentReplay(stored, different, "req-1");
            expect.unreachable("should have thrown");
        } catch (error) {
            expect((error as PosBillingError).status).toBe(409);
            expect((error as PosBillingError).code).toBe("IDEMPOTENCY_CONFLICT");
        }
    });

    it("still protects rows written before fingerprints existed", () => {
        /**
         * Older sales have no stored fingerprint, so one is rebuilt from the
         * financial columns. Skipping the check for those would leave every
         * historical row replayable with any amount at all.
         */
        const stored = priorRow(); // no idempotencyFingerprint
        const matching = buildPosSaleFingerprint(sale());

        expect(assertIdempotentReplay(stored, matching, "req-1")).toBe(stored);
        expect(() => assertIdempotentReplay(stored, buildPosSaleFingerprint(sale({ total: 9000 })), "req-1"))
            .toThrowError(PosBillingError);
    });

    it("does not fall open when the stored cart is unreadable", () => {
        // Corrupt JSON must not become "no items, so anything matches".
        const stored = priorRow({ items: "{not json" });

        expect(() => assertIdempotentReplay(stored, buildPosSaleFingerprint(sale()), "req-1"))
            .toThrowError(PosBillingError);
    });
});

describe("what a refund leaves collected", () => {
    it("counts nothing refunded as fully paid", () => {
        const r = derivePosRefundLifecycle({ total: 3000, refundedAmount: 0, paymentStatus: "Paid" });

        expect(r.lifecycle).toBe("paid");
        expect(r.netCollectedTotal).toBe(3000);
        expect(r.outstandingDue).toBe(0);
    });

    it("reports a part refund as partial, and the remainder as collected", () => {
        const r = derivePosRefundLifecycle({ total: 3000, refundedAmount: 1000, paymentStatus: "Paid" });

        expect(r.lifecycle).toBe("partially_refunded");
        expect(r.netCollectedTotal).toBe(2000);
    });

    it("reports a whole refund as fully refunded, with nothing collected", () => {
        const r = derivePosRefundLifecycle({ total: 3000, refundedAmount: 3000, paymentStatus: "Paid" });

        expect(r.lifecycle).toBe("fully_refunded");
        expect(r.netCollectedTotal).toBe(0);
    });

    it("treats a refund a fraction of a taka short as complete", () => {
        /**
         * Money is stored as a float, so a full refund can land at 2999.999.
         * Without the tolerance that reads as "partially refunded" and the sale
         * would sit forever looking as though a paisa were still owed.
         */
        const r = derivePosRefundLifecycle({ total: 3000, refundedAmount: 2999.9995, paymentStatus: "Paid" });

        expect(r.lifecycle).toBe("fully_refunded");
    });

    it("never reports more collected than was charged", () => {
        // An over-refund is a data error; it must not become negative revenue.
        const r = derivePosRefundLifecycle({ total: 3000, refundedAmount: 4000, paymentStatus: "Paid" });

        expect(r.netCollectedTotal).toBe(0);
    });

    it("shows an unpaid sale as still owing its full amount", () => {
        const r = derivePosRefundLifecycle({ total: 3000, refundedAmount: 0, paymentStatus: "Due" });

        expect(r.lifecycle).toBe("due");
        expect(r.outstandingDue).toBe(3000);
    });

    it("reduces what is owed on an unpaid sale by anything refunded", () => {
        const r = derivePosRefundLifecycle({ total: 3000, refundedAmount: 1000, paymentStatus: "Due" });

        expect(r.outstandingDue).toBe(2000);
    });

    it("lets an explicit refund status override the arithmetic", () => {
        // A refund recorded outside the amount column — a bank reversal, say —
        // still has to show as refunded.
        const r = derivePosRefundLifecycle({ total: 3000, refundedAmount: 0, refundStatus: "full" });

        expect(r.lifecycle).toBe("fully_refunded");
    });
});
