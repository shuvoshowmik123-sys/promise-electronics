/**
 * How long a quote stands, and who is allowed to disagree about it.
 *
 * Panels and boards come from a market whose prices move week to week. A price
 * quoted today and honoured a month later is a promise made against a cost the
 * shop no longer knows — and discovering that at the counter, after a customer
 * has travelled in, is the worst possible moment.
 *
 * Three separate numbers were in play before this. The server stamped an expiry
 * seven days out. The customer's screen computed its own, thirty days from the
 * quote date, ignoring the server entirely. And the wording promised thirty.
 *
 * So between day seven and day thirty a customer saw a live quote with an
 * Accept button that the server would refuse: they pressed it and were told the
 * quote had expired, on a page still promising thirty days.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    QUOTE_VALID_DAYS,
    isQuoteExpired,
    quoteDaysLeft,
    quoteExpiryFrom,
    quoteValidityLabel,
} from "../shared/quote-policy.js";

const ROOT = process.cwd();
const SERVICE = readFileSync(join(ROOT, "server/services/retail-quote.service.ts"), "utf8");
const TRACK = readFileSync(join(ROOT, "client/src/pages/track-order-detail.tsx"), "utf8");
const ADMIN = readFileSync(join(ROOT, "client/src/pages/admin/bento/tabs/ServiceRequestsTab.tsx"), "utf8");

describe("one number, everywhere", () => {
    it("is fifteen days", () => {
        expect(QUOTE_VALID_DAYS).toBe(15);
    });

    it("is what the server stamps, not what the caller asked for", () => {
        // quoteValidDays arrived from whichever screen sent the quote and
        // defaulted to seven, so the same shop promised different lengths on
        // different paths and the customer honoured whichever they were shown.
        expect(SERVICE).toContain("const days = QUOTE_VALID_DAYS");
        expect(SERVICE).not.toMatch(/quoteValidDays[^;]*\?\s*Math\.min/);
    });

    it("is what the customer's screen says and reads", () => {
        expect(TRACK).toContain("QUOTE_VALID_DAYS");
        // The screen must not compute its own expiry beside the server's.
        expect(TRACK).not.toContain("diffDays >= 30");
        expect(TRACK).not.toContain("Valid for 30 days");
        expect(TRACK).toContain("quoteExpiresAt");
    });
});

describe("the arithmetic", () => {
    const sent = new Date("2026-08-01T10:00:00Z");

    it("expires fifteen days after it was sent", () => {
        const expiry = quoteExpiryFrom(sent);
        expect(quoteDaysLeft(expiry, sent)).toBe(QUOTE_VALID_DAYS);
        expect(isQuoteExpired(expiry, new Date("2026-08-16T09:00:00Z"))).toBe(false);
        expect(isQuoteExpired(expiry, new Date("2026-08-16T11:00:00Z"))).toBe(true);
    });

    it("never counts a day the customer does not have", () => {
        // Floored, so "1 day left" means at least a full day remains. Telling
        // somebody they have a day when they have twenty minutes is how a
        // customer arrives to find the price gone.
        const expiry = new Date("2026-08-02T09:00:00Z");
        expect(quoteDaysLeft(expiry, new Date("2026-08-01T10:00:00Z"))).toBe(0);
        expect(quoteDaysLeft(expiry, new Date("2026-08-03T00:00:00Z"))).toBe(0);
    });

    it("says nothing rather than guessing when there is no expiry", () => {
        expect(quoteDaysLeft(null)).toBeNull();
        expect(isQuoteExpired(null)).toBe(false);
        expect(isQuoteExpired("not a date")).toBe(false);
    });

    it("changes its wording as the deadline closes", () => {
        const now = new Date("2026-08-01T10:00:00Z");
        expect(quoteValidityLabel(quoteExpiryFrom(now), now)).toBe("Expires in 15 days");
        expect(quoteValidityLabel(new Date("2026-08-02T11:00:00Z"), now)).toBe("Expires tomorrow");
        expect(quoteValidityLabel(new Date("2026-08-01T20:00:00Z"), now)).toBe("Expires today");
        expect(quoteValidityLabel(new Date("2026-07-30T10:00:00Z"), now)).toBe("This quote has expired");
    });
});

describe("a sent quote is waited for", () => {
    it("blocks the work until the customer answers", () => {
        /**
         * "Quoted" — sent, unanswered — used to pass the gate, while the
         * tooltip beside it promised "Sent quotes must be accepted or
         * declined". The screen made a promise the code did not keep, and the
         * case it let through is the one that becomes an argument at billing.
         */
        expect(ADMIN).toContain('!["Accepted", "Converted"].includes(sr?.quoteStatus');
        expect(ADMIN).not.toContain('["Quoted", "Accepted", "Converted"]');
    });

    it("gates only the requests that asked for a quote", () => {
        // Quoting is give-and-take: either side may start it, and a customer
        // who simply wants their television fixed is never held up waiting for
        // a price nobody asked for.
        expect(ADMIN).toContain("Boolean(sr?.isQuote) &&");
    });
});

describe("an expired quote tells the customer what to do next", () => {
    it("offers a re-quote rather than a dead end", () => {
        expect(TRACK).toContain("Ask us for a re-quote");
        expect(TRACK).toContain("price it again at today's rates");
    });

    it("explains why, in the shop's own terms", () => {
        // "Prices may have changed" is a shrug. Saying the market moves is a
        // reason, and a customer who understands the reason argues less.
        expect(TRACK).toContain("move week to week");
    });
});
