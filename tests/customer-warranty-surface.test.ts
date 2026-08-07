import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The customer-facing warranty surface, after the parts/labour split.
 *
 * The columns were migrated and the completion path populated them, but every
 * customer-facing read still went to the labour fields. The result was a page
 * showing two warranties that were always identical twins, a filter that hid
 * parts-only repairs completely, and a claim route that refused a live parts
 * claim the moment the labour clock lapsed — the exact case the separation was
 * built for, and one published in the Terms & Conditions.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const CUSTOMER_ROUTES = read("server/routes/customer.routes.ts");
const JOURNEY = read("server/services/customer-repair-journey.service.ts");
const PAGE = read("client/src/pages/my-warranties.tsx");

/** The /api/customer/warranties handler only. */
const warrantiesHandler = (() => {
    const start = CUSTOMER_ROUTES.indexOf("'/api/customer/warranties'");
    return CUSTOMER_ROUTES.slice(start, start + 3000);
})();

describe("the two clocks are read from their own columns", () => {
    it("parts warranty comes from the parts columns, not the labour ones", () => {
        expect(warrantiesHandler).toContain("partsWarrantyExpiryDate");
        expect(warrantiesHandler).toContain("partsWarrantyDays");
    });

    it("service and parts are no longer filled from one identical source", () => {
        /**
         * The defect was literally two object literals built from the same
         * job.warrantyDays / job.warrantyExpiryDate pair. Both clocks must now
         * be derived through the shared helper, each given its own expiry.
         */
        expect(warrantiesHandler).toMatch(/serviceWarranty:\s*clock\(\s*job\.warrantyExpiryDate/);
        expect(warrantiesHandler).toMatch(/partsWarranty:\s*clock\(\s*\n?\s*\(job as any\)\.partsWarrantyExpiryDate/);
    });

    it("a repair carrying ONLY a parts warranty is still listed", () => {
        // The old filter required warrantyDays > 0, so a panel replacement with
        // no labour warranty vanished from the customer's account entirely.
        expect(warrantiesHandler).toContain("anyService || anyParts");
        expect(warrantiesHandler).not.toMatch(
            /filter\(job => job\.status === 'Completed' && \(job\.warrantyDays \|\| 0\) > 0\)/,
        );
    });

    it("coverage is judged by expiry, never by a stored day count", () => {
        // partsWarrantyDays is deliberately null when an expiry is carried over
        // from an earlier completion; a days>0 test would hide a live warranty.
        expect(warrantiesHandler).toMatch(/isActive:\s*msLeft > 0/);
    });
});

describe("a parts claim is judged against the parts clock", () => {
    it("selects the governing expiry by claim type", () => {
        expect(JOURNEY).toContain("partsWarrantyExpiryDate");
        expect(JOURNEY).toMatch(/opts\.claimType === "parts" && partsExpiryRaw/);
    });

    it("falls back to the labour expiry when no distinct parts warranty exists", () => {
        // Every job completed before the separation must behave exactly as it
        // did, or this fix would start refusing claims it used to accept.
        expect(JOURNEY).toMatch(/\?\s*partsExpiryRaw\s*\n?\s*:\s*serviceExpiryRaw/);
    });

    it("no longer checks the labour expiry for every claim", () => {
        expect(JOURNEY).not.toMatch(
            /const expiryDate = \(job as any\)\.warrantyExpiryDate \? new Date\(\(job as any\)\.warrantyExpiryDate\) : null;/,
        );
    });

    it("says which warranty expired, not just that one did", () => {
        expect(JOURNEY).toContain("The parts warranty for this repair has expired");
        expect(JOURNEY).toContain("The service warranty for this repair has expired");
    });

    it("validates the claim type before using it to pick a clock", () => {
        const typeGuard = JOURNEY.indexOf('Claim type must be \'service\' or \'parts\'');
        const clockPick = JOURNEY.indexOf("const partsExpiryRaw");
        expect(typeGuard).toBeGreaterThan(-1);
        expect(clockPick).toBeGreaterThan(typeGuard);
    });
});

describe("the card shows both clocks, and explains an absent one", () => {
    it("renders parts and service together rather than behind a slider", () => {
        /**
         * A slider hides the one thing the separation exists to show — the two
         * clocks expire on different dates — and a customer who never discovers
         * the parts warranty never claims it.
         */
        const card = PAGE.slice(PAGE.indexOf("function MobileWarrantyCard"));
        expect(card).toMatch(/kind="parts"/);
        expect(card).toMatch(/kind="service"/);
        expect(PAGE).not.toMatch(/carousel|Carousel|swiper|Swiper/);
    });

    it("keys coverage off the expiry date, not days > 0", () => {
        const card = PAGE.slice(PAGE.indexOf("function MobileWarrantyCard"));
        expect(card).toContain("Boolean(warranty.partsWarranty.expiryDate)");
        expect(card).not.toMatch(/warranty\.partsWarranty\.days > 0/);
        expect(card).not.toMatch(/warranty\.serviceWarranty\.days > 0/);
    });

    it("explains a missing parts warranty instead of leaving a gap", () => {
        expect(PAGE).toContain("warranties.noPartsCover");
    });

    it("offers a claim per clock, since claimType is service or parts", () => {
        // One card-level button could not know which warranty it was claiming.
        expect(PAGE).toMatch(/onClaim\(kind\)/);
    });

    it("both new strings are translated, not hardcoded English", () => {
        const LANG = read("client/src/contexts/CustomerLanguageContext.tsx");
        for (const key of ["warranties.until", "warranties.noPartsCover"]) {
            expect(LANG, key).toContain(`"${key}"`);
        }
        // Bangla present, not an English placeholder.
        const line = LANG.split("\n").find((l) => l.includes('"warranties.noPartsCover"')) ?? "";
        expect(line).toMatch(/bn:\s*"[^"]*[ঀ-৿][^"]*"/);
    });
});
