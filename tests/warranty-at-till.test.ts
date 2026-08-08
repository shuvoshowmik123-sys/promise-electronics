import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    DEFAULT_PARTS_MONTH_OPTIONS,
    DEFAULT_SERVICE_MONTH_OPTIONS,
    MAX_WARRANTY_MONTHS,
    formatWarrantyMonths,
    parseMonthOptions,
} from "../shared/warranty-options.js";

/**
 * The warranty is chosen where it is promised — at the counter, with the
 * customer present.
 *
 * A sourced part's cost can be deferred to the end of the shift, because a
 * receipt still exists to reconstruct it from. A warranty cannot: it is a
 * promise made out loud, and if nobody records it there is nothing to recover
 * when the customer claims in month four. Until now the till offered no way to
 * set one, so every job took the resolver's 30-day default whatever was said.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const BILLING = read("server/services/pos-billing.service.ts");
const POS_ROUTE = read("server/routes/pos.routes.ts");
const POS_TAB = read("client/src/pages/admin/bento/tabs/PosTab.tsx");
const TYPES = read("client/src/pages/admin/bento/tabs/pos/pos-types.ts");

describe("the option lists", () => {
    it("parts run to six months, service is capped at three", () => {
        // Service covers workmanship on the fault repaired, not the television.
        expect(DEFAULT_PARTS_MONTH_OPTIONS).toEqual([1, 2, 3, 4, 5, 6]);
        expect(DEFAULT_SERVICE_MONTH_OPTIONS).toEqual([1, 2, 3]);
    });

    it("a malformed setting falls back rather than emptying the list", () => {
        // An empty dropdown would leave the counter unable to promise anything.
        for (const bad of [null, undefined, "", "not json", "{}", "[]", '["x"]', "[0]", "[-3]"]) {
            expect(parseMonthOptions(bad as any, DEFAULT_PARTS_MONTH_OPTIONS))
                .toEqual(DEFAULT_PARTS_MONTH_OPTIONS);
        }
    });

    it("accepts a valid custom list, sorted and de-duplicated", () => {
        expect(parseMonthOptions("[6,1,3,3]", DEFAULT_PARTS_MONTH_OPTIONS)).toEqual([1, 3, 6]);
    });

    it("refuses periods beyond the ceiling", () => {
        expect(parseMonthOptions(`[${MAX_WARRANTY_MONTHS + 1}]`, DEFAULT_SERVICE_MONTH_OPTIONS))
            .toEqual(DEFAULT_SERVICE_MONTH_OPTIONS);
    });

    it("reads naturally, including the no-warranty case", () => {
        expect(formatWarrantyMonths(1)).toBe("1 month");
        expect(formatWarrantyMonths(6)).toBe("6 months");
        for (const none of [0, null, undefined, -1]) {
            expect(formatWarrantyMonths(none as any)).toBe("No warranty");
        }
    });
});

describe("what the till sends survives the journey to the job", () => {
    it("the route no longer strips warranty during normalisation", () => {
        /**
         * normalizedLinks mapped only jobId and billedAmount, so the choice was
         * discarded one line before the billing service could act on it.
         */
        const block = POS_ROUTE.slice(POS_ROUTE.indexOf("const normalizedLinks"));
        expect(block).toContain("serviceWarrantyMonths");
        expect(block).toContain("partsWarrantyMonths");
    });

    it("the checkout payload carries both periods", () => {
        expect(POS_TAB).toMatch(/serviceWarrantyMonths: j\.serviceWarrantyMonths \?\? null/);
        expect(POS_TAB).toMatch(/partsWarrantyMonths: j\.partsWarrantyMonths \?\? null/);
    });

    it("the cart line can hold them", () => {
        expect(TYPES).toContain("serviceWarrantyMonths");
        expect(TYPES).toContain("partsWarrantyMonths");
    });

    it("allocations carry the choice through to completion", () => {
        const alloc = BILLING.slice(BILLING.indexOf("allocations.push({"));
        expect(alloc.slice(0, 400)).toContain("serviceWarrantyMonths");
        expect(alloc.slice(0, 400)).toContain("partsWarrantyMonths");
    });
});

describe("a period chosen at the counter is the one recorded", () => {
    it("overrides the resolver's inferred default", () => {
        // The resolver infers parts cover from what was fitted and defaults
        // labour to 30 days. Neither knows what was said to the customer.
        expect(BILLING).toContain("const chosenServiceDays = monthsToDays(a.serviceWarrantyMonths)");
        expect(BILLING).toContain("const chosenPartsDays = monthsToDays(a.partsWarrantyMonths)");
        expect(BILLING).toMatch(/if \(chosenServiceDays\)/);
        expect(BILLING).toMatch(/if \(chosenPartsDays\)/);
    });

    it("still never extends a warranty once money has been taken", () => {
        /**
         * This used to assert a bare !expiry guard, which was the bug: it also
         * blocked the counter's choice against a default stamped seconds
         * earlier at completion. The real rule is about whether the job has
         * been billed, not whether a date happens to be present.
         */
        expect(BILLING).toContain("const firstBilling = Number(job.paidAmount || 0) <= 0");
        expect(BILLING).toMatch(/mayOverride = \(existing: unknown\) => !existing \|\| firstBilling/);
    });

    it("falls back to the resolver when the till chose nothing", () => {
        // A till that does not offer the choice must behave exactly as before,
        // and the fallback must still only fill a genuinely empty clock.
        expect(BILLING).toMatch(/else if \(!\(job as any\)\.warrantyExpiryDate && warrantyDays > 0/);
        expect(BILLING).toMatch(/else if \(!\(job as any\)\.partsWarrantyExpiryDate && resolvedWarranty\.partsWarrantyExpiryDate\)/);
    });

    it("a malformed payload cannot mint years of cover", () => {
        expect(BILLING).toContain("Math.min(12, Math.round(n)) * DAYS_PER_MONTH");
    });

    it("zero and negative months mean no warranty, not a zero-day clock", () => {
        expect(BILLING).toMatch(/if \(!Number\.isFinite\(n\) \|\| n <= 0\) return null/);
    });
});

describe("the till UI", () => {
    it("offers both periods per linked job", () => {
        expect(POS_TAB).toMatch(/Parts warranty/);
        expect(POS_TAB).toMatch(/Service warranty/);
        expect(POS_TAB).toContain("handleWarrantyChange");
    });

    it("keeps 'No warranty' selectable", () => {
        // Some repairs carry none; defaulting to a period would record a
        // promise nobody made.
        expect(POS_TAB).toMatch(/value="none"[^>]*>No warranty/);
    });

    it("reads its options from settings, not hardcoded numbers", () => {
        expect(POS_TAB).toContain("WARRANTY_SETTING_KEYS.partsMonths");
        expect(POS_TAB).toContain("WARRANTY_SETTING_KEYS.serviceMonths");
        expect(POS_TAB).toContain("parseMonthOptions");
    });
});

describe("the counter choice survives the completion default (regression)", () => {
    /**
     * Found by QA, not by this suite, and the omission is instructive.
     *
     * Marking a job Completed already stamps a 30-day labour default via
     * resolveJobWarranty. The original guard here was "never overwrite an
     * existing expiry", so by the time the cashier chose three months the
     * expiry existed and the whole block was skipped — the customer was told
     * three months and issued thirty days.
     *
     * The earlier tests asserted the override code EXISTED. They could not see
     * that a guard upstream had already fired, which is the limit of asserting
     * on file contents rather than behaviour.
     */
    const JOBS_ROUTES = read("server/routes/jobs.routes.ts");

    it("completing a job really does stamp a default first", () => {
        // The precondition that made the bug possible. If this ever stops being
        // true the override below becomes unnecessary rather than wrong.
        expect(JOBS_ROUTES).toMatch(/extraPatch\.warrantyExpiryDate = resolved\.warrantyExpiryDate/);
    });

    it("an unbilled job still accepts the counter's choice", () => {
        expect(BILLING).toContain("const firstBilling = Number(job.paidAmount || 0) <= 0");
        expect(BILLING).toMatch(/mayOverride = \(existing: unknown\) => !existing \|\| firstBilling/);
        expect(BILLING).toMatch(/if \(mayOverride\(\(job as any\)\.warrantyExpiryDate\)\)/);
        expect(BILLING).toMatch(/if \(mayOverride\(\(job as any\)\.partsWarrantyExpiryDate\)\)/);
    });

    it("no longer gates the override on the expiry being absent", () => {
        // The exact shape of the bug: a bare !expiry check around the choice.
        expect(BILLING).not.toMatch(/if \(!\(job as any\)\.warrantyExpiryDate\) \{\s*\n\s*if \(chosenServiceDays\)/);
    });

    it("a part-paid job can never have its warranty extended", () => {
        // Once money is taken the period is fixed; re-paying must not move it.
        expect(BILLING).toMatch(/firstBilling/);
        const block = BILLING.slice(BILLING.indexOf("const firstBilling"));
        expect(block.slice(0, 1200)).toContain("paidAmount");
    });

    it("the resolver fallback still only fills a genuinely empty clock", () => {
        // Overriding is for an explicit choice. The inferred default must not
        // start overwriting real expiries as a side effect of this fix.
        expect(BILLING).toMatch(/else if \(!\(job as any\)\.warrantyExpiryDate && warrantyDays > 0/);
        expect(BILLING).toMatch(/else if \(!\(job as any\)\.partsWarrantyExpiryDate && resolvedWarranty\.partsWarrantyExpiryDate\)/);
    });
});

describe("the settings the till reads can actually be saved", () => {
    /**
     * The Settings panel shipped without its keys on the server allowlist, so
     * every save returned 400 and the screen silently did nothing. A UI cannot
     * reveal this — the request looks correct right up to the response.
     */
    const SETTINGS_ROUTE = read("server/routes/settings.routes.ts");

    it("every key the client writes is accepted by the server", () => {
        const OPS = read("client/src/pages/admin/bento/tabs/settings/OperationsSettingsPanel.tsx");
        const written = [
            ...[...OPS.matchAll(/WARRANTY_SETTING_KEYS\.(\w+)/g)].map((m) => m[1]),
        ];
        expect(written.length).toBeGreaterThan(0);

        for (const key of [
            "warranty.partsMonthOptions",
            "warranty.serviceMonthOptions",
            "shop.restDays",
            "shop.holidays",
        ]) {
            expect(SETTINGS_ROUTE, `${key} must be allowlisted`).toContain(`'${key}'`);
        }
    });

    it("the allowlist is what rejects everything else", () => {
        expect(SETTINGS_ROUTE).toMatch(/if \(!ALLOWED_SETTING_KEYS\.includes\(validated\.key\)\)/);
    });
});
