import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Telling the customer their television could not be repaired.
 *
 * The portal was blind to this entirely. A TV could be declared
 * not-repairable, a decision recorded on the customer's behalf, and none of it
 * ever appeared in their account — so every explanation happened by phone.
 * Slow for the shop, and anxious for the customer, who knows something is
 * wrong and has to ring to find out what.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const SERVICE = read("server/services/customer-repair-journey.service.ts");
const ROUTES = read("server/routes/customer-repair-journey.routes.ts");
const CARD = read("client/src/components/customer/NgExplanationCard.tsx");
const LANG = read("client/src/contexts/CustomerLanguageContext.tsx");
const DETAIL = read("client/src/pages/my-repair-detail.tsx");

const ngFn = SERVICE.slice(
    SERVICE.indexOf("async getNgExplanation"),
    SERVICE.indexOf("async getJourneyDetail"),
);

describe("only the owner can read a diagnosis", () => {
    it("verifies ownership by phone, like warranty claims do", () => {
        // A job id in a URL must never be enough to read someone else's
        // diagnosis.
        expect(ngFn).toContain("normalizePhone");
        expect(ngFn).toMatch(/custPhone !== jobPhone/);
        expect(ngFn).toContain("does not belong to your account");
    });

    it("refuses a job with no phone rather than falling open", () => {
        expect(ngFn).toMatch(/if \(!job\.customer_phone\)/);
    });

    it("requires an authenticated customer at the route", () => {
        const route = ROUTES.slice(ROUTES.indexOf("/api/customer/jobs/:jobId/ng"));
        expect(route.slice(0, 900)).toContain("requireCustomerAuth");
        expect(route.slice(0, 900)).toContain("NOT_AUTHENTICATED");
    });
});

describe("what the customer is shown", () => {
    it("waits for a manager to verify the report", () => {
        /**
         * Telling someone their television is dead before the shop is sure is
         * worse than telling them nothing.
         */
        expect(ngFn).toContain("report_status <> 'pending_review'");
    });

    it("does not leak the internal engineering record", () => {
        /**
         * technical_notes, the parts snapshot and the evidence photographs are
         * an internal record. Repeated to a customer they read as jargon or
         * excuse-making, and invite an argument about diagnosis instead of a
         * decision about what to do next.
         */
        expect(ngFn).not.toContain("technical_notes");
        expect(ngFn).not.toContain("parts_snapshot");
        expect(ngFn).not.toContain("evidence_attachments");
        expect(ngFn).not.toContain("reported_by");
        expect(ngFn).not.toContain("review_notes");
    });

    it("returns the three things a person actually wants", () => {
        // What was found, what was decided, what happens next.
        expect(ngFn).toContain("diagnosis");
        expect(ngFn).toContain("decisionType");
        expect(ngFn).toContain("awaitingDecision");
    });
});

describe("the card stays quiet unless there is something to say", () => {
    it("renders nothing on an ordinary repair", () => {
        // A permanent "no problems found" box would train people to ignore the
        // one that matters.
        expect(CARD).toMatch(/if \(!ng\) return null/);
    });

    it("names who will call, rather than asking the customer to chase", () => {
        expect(LANG).toMatch(/"ng\.awaiting":.*call you/);
        expect(CARD).toContain("ng.callUs");
    });

    it("states the check is free, because that is the first worry", () => {
        expect(LANG).toMatch(/"ng\.awaiting":[^}]*Nothing is charged/);
    });

    it("uses no alarm language", () => {
        // Someone reading this has just learned their television may be beyond
        // repair. Facts, then who is calling them.
        const entries = [...LANG.matchAll(/"ng\.[a-zA-Z.]+":\s*\{\s*en:\s*"([^"]*)"/g)].map((m) => m[1]);
        expect(entries.length).toBeGreaterThanOrEqual(8);
        for (const line of entries) {
            expect(line, line).not.toContain("!");
            expect(line, line).not.toMatch(/\b(sorry|unfortunately|regret|dead|destroyed|failed)\b/i);
        }
    });

    it("every decision type has a customer-facing label", () => {
        for (const kind of ["replacement", "repair_alternative", "quote_required", "decline"]) {
            expect(LANG, kind).toContain(`"ng.decision.${kind}"`);
            expect(CARD, kind).toContain(`ng.decision.${kind}`);
        }
    });

    it("is translated, not hardcoded English", () => {
        const banglaLines = [...LANG.matchAll(/"ng\.[a-zA-Z.]+":\s*\{[^}]*bn:\s*"([^"]*)"/g)].map((m) => m[1]);
        expect(banglaLines.length).toBeGreaterThanOrEqual(8);
        for (const line of banglaLines) {
            expect(line, line).toMatch(/[ঀ-৿]/);
        }
    });

    it("appears in BOTH render trees, not just one", () => {
        /**
         * The page renders a mobile tree and a desktop tree separately —
         * HandoverCodeCard is mounted twice for exactly that reason. Adding
         * this to one branch only would hide it from half the customers, which
         * is how it was first written.
         */
        const cardMounts = DETAIL.match(/<NgExplanationCard/g) ?? [];
        const handoverMounts = DETAIL.match(/<HandoverCodeCard/g) ?? [];
        expect(cardMounts.length).toBe(handoverMounts.length);
        expect(cardMounts.length).toBeGreaterThanOrEqual(2);
    });
});
