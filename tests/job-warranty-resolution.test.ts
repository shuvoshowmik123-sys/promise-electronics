import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Warranty periods are resolved once, at completion, and snapshotted.
 *
 * Before this, `parts_warranty_expiry_date` had no writer anywhere in the
 * server. The column existed, the claim route read it, and nothing ever set it
 * — so every parts claim fell through to the labour expiry and the separation
 * we shipped was inert.
 *
 * The labour expiry meanwhile was computed inline in TWO places, pos-billing
 * and jobs.routes, with the same six lines duplicated. Two copies of a rule
 * that decides what a customer is owed is one copy too many.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const SERVICE = read("server/services/job-warranty.service.ts");
const POS = read("server/services/pos-billing.service.ts");
const JOBS = read("server/routes/jobs.routes.ts");

describe("the parts clock finally has a writer", () => {
    it("both completion paths set partsWarrantyExpiryDate", () => {
        for (const [name, src] of [["pos-billing", POS], ["jobs.routes", JOBS]] as const) {
            expect(src, name).toContain("partsWarrantyExpiryDate");
            expect(src, name).toContain("resolveJobWarranty");
        }
    });

    it("neither path still computes the expiry inline", () => {
        // The duplicated `expiry.setDate(expiry.getDate() + warrantyDays)` is
        // what the resolver replaced. If it reappears the two paths can drift.
        for (const [name, src] of [["pos-billing", POS], ["jobs.routes", JOBS]] as const) {
            expect(src, name).not.toMatch(/expiry\.setDate\(expiry\.getDate\(\)\s*\+\s*warrantyDays\)/);
        }
    });
});

describe("a sold warranty cannot be changed afterwards", () => {
    it("the period is snapshotted onto the job, not looked up at claim time", () => {
        /**
         * If a claim resolved against inventory_items, editing a part's warranty
         * from 180 to 90 days would silently shorten warranties on televisions
         * repaired last year. Customers were sold 180 days; the record must hold
         * what was sold.
         */
        expect(SERVICE).toContain("SNAPSHOTTED");
        expect(SERVICE).toContain("addDays(completedAt");
    });

    it("an existing expiry is never overwritten", () => {
        // Re-completing a job, or paying one already completed, must not extend
        // a warranty the customer has been running down.
        expect(SERVICE).toContain("if (job.partsWarrantyExpiryDate)");
        for (const [name, src] of [["pos-billing", POS], ["jobs.routes", JOBS]] as const) {
            expect(src, name).toMatch(/!\(job as any\)\.partsWarrantyExpiryDate/);
        }
    });

    it("both clocks measure from ONE instant", () => {
        // Two `new Date()` calls milliseconds apart can land either side of
        // midnight and produce periods that disagree by a day.
        expect(SERVICE).toContain("completedAt: Date = new Date()");
        expect(POS).toContain("const jobCompletedAt = new Date()");
        expect(POS).toContain("resolveJobWarranty(job as any, jobCompletedAt)");
    });
});

describe("where a parts warranty comes from", () => {
    it("reads BOTH stocked and sourced parts", () => {
        // Catalogue parts via productLines -> inventory_items; sourced parts via
        // local_purchases, which have no catalogue entry at all.
        expect(SERVICE).toContain("FROM inventory_items");
        expect(SERVICE).toContain("FROM local_purchases");
        expect(SERVICE).toContain("inventoryItemId");
    });

    it("counts only parts actually consumed on THIS job", () => {
        const fn = SERVICE.slice(SERVICE.indexOf("FROM local_purchases"));
        expect(fn).toContain("job_ticket_id");
        // A returned part carries no warranty for the customer.
        expect(fn).toContain("status = 'Consumed'");
    });

    it("takes the LONGEST period, not the shortest or an average", () => {
        /**
         * A job with a 180-day panel and a 30-day capacitor is under parts
         * warranty for 180 days. Refusing at day 60 because a capacitor was also
         * fitted would be wrong; which specific part is covered is settled at
         * claim time.
         */
        expect(SERVICE).toContain("MAX(warranty_days)");
        expect(SERVICE).toContain("Math.max");
        expect(SERVICE).not.toMatch(/\bMIN\s*\(warranty_days\)/i);
        expect(SERVICE).not.toMatch(/\bAVG\s*\(/i);
    });

    it("returns null when no fitted part carries a warranty", () => {
        // NULL means "no distinct parts warranty" and claim validity falls back
        // to labour — which is how every pre-existing job must keep behaving.
        expect(SERVICE).toContain("longest != null && longest > 0 ? longest : null");
    });

    it("a failed lookup never fails the completion", () => {
        // The job is finished and paid for; a warranty query that errored must
        // not roll that back. Labour warranty still applies.
        // Two guarded regions: the catalogue lookup (which also contains the
        // JSON.parse of productLines, so a malformed line list is caught there
        // too) and the sourced-parts lookup.
        const catches = SERVICE.match(/catch\s*\(/g) ?? [];
        expect(catches.length).toBeGreaterThanOrEqual(2);
        expect(SERVICE).not.toMatch(/throw new/);
    });
});
