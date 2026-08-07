import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Parts and labour warranties run on separate clocks.
 *
 * warranty_claims has always recorded claim_type ('service' | 'parts' |
 * 'general'), and the claim route computed that type, stored it on the row —
 * and then ignored it. Validity was judged solely against job.warrantyExpiryDate,
 * so a parts claim and a service claim on the same job always produced the same
 * answer. A panel still inside a manufacturer's six-month cover was refused the
 * moment the 30-day labour warranty lapsed.
 *
 * That contradicts the published Terms & Conditions, which promise:
 *
 *   "Display or panel replacement . . . 6 months"
 *   "Panel repair . . . 60 days"
 *   "Where a part carries a manufacturer's or supplier's warranty, that warranty
 *    applies to the part and is stated separately from our warranty on the labour."
 *
 * A customer-facing contract that the database cannot express is a liability,
 * not a bug — which is why this was fixed before writing tests for the flows
 * that depend on it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const SCHEMA = read("shared/schema.ts");
const MIGRATE = read("server/services/main-schema-migrate.service.ts");
const WARRANTY = read("server/routes/warranty.routes.ts");
const TERMS = read("docs/legal/terms-and-conditions.md");

describe("schema carries a separate parts clock", () => {
    it("job_tickets has parts warranty columns", () => {
        expect(SCHEMA).toContain("partsWarrantyDays");
        expect(SCHEMA).toContain("parts_warranty_days");
        expect(SCHEMA).toContain("partsWarrantyExpiryDate");
        expect(SCHEMA).toContain("parts_warranty_expiry_date");
    });

    it("they are NULLABLE — existing jobs must not change behaviour", () => {
        /**
         * Every job written before this column existed has NULL here. If the
         * columns were NOT NULL with a default, those jobs would silently gain
         * a parts warranty nobody agreed to sell.
         */
        // Assert the two declaration LINES only. A fixed-width slice would run
        // into the next field and pick up its .default(), failing on unrelated
        // code — the kind of false positive that trains people to ignore tests.
        const lines = SCHEMA.split("\n").filter(
            (l) => /partsWarrantyDays:|partsWarrantyExpiryDate:/.test(l),
        );
        expect(lines.length).toBe(2);
        for (const line of lines) {
            expect(line, line.trim()).not.toMatch(/notNull\(\)/);
            expect(line, line.trim()).not.toMatch(/\.default\(/);
        }
    });
});

describe("the migration is safe to run on a live database", () => {
    it("is registered in the migration ledger", () => {
        /**
         * Asserts the migration EXISTS, not that it is the newest one.
         *
         * This originally pinned REQUIRED_MAIN_SCHEMA_VERSION to this id, which
         * made the test fail the moment any later migration was appended — a
         * false alarm about unrelated work, not a real regression. The ledger
         * is append-only, so presence in it is the property worth protecting;
         * being last is temporary by definition.
         */
        expect(MIGRATE).toContain('id: "2026_08_06_parts_warranty_separation"');
    });

    it("is purely additive — no data loss, re-runnable", () => {
        const m = MIGRATE.slice(MIGRATE.indexOf("2026_08_06_parts_warranty_separation"));
        const body = m.slice(0, m.indexOf("];"));
        expect(body).toContain("ADD COLUMN IF NOT EXISTS");
        // Nothing destructive may appear in a migration that runs against production.
        expect(body).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
        expect(body).not.toMatch(/\bTRUNCATE\b/i);
        expect(body).not.toMatch(/\bDELETE\s+FROM\b/i);
        // An ALTER that rewrites the table would lock it; nullable adds do not.
        expect(body).not.toMatch(/\bSET\s+NOT\s+NULL\b/i);
    });
});

describe("claim validity uses the clock that governs the claim", () => {
    it("a parts claim reads the parts expiry", () => {
        expect(WARRANTY).toContain("claimIsPartsOnly");
        expect(WARRANTY).toContain("job.partsWarrantyExpiryDate");
        expect(WARRANTY).toContain("governingExpiry");
    });

    it("resolvedType is no longer computed and discarded", () => {
        // The defect: the type was stored on the claim but never consulted when
        // deciding whether the claim was valid.
        const block = WARRANTY.slice(
            WARRANTY.indexOf("const resolvedType"),
            WARRANTY.indexOf("const claim = await warrantyRepo.createWarrantyClaim"),
        );
        expect(block).toContain("resolvedType === 'parts'");
    });

    it("falls back to the service expiry when no parts warranty exists", () => {
        /**
         * Load-bearing for every historical job. Also the correct direction to
         * fail for an ambiguous warranty: in the customer's favour.
         */
        const block = WARRANTY.slice(WARRANTY.indexOf("const governingExpiry"));
        expect(block).toMatch(/job\.partsWarrantyExpiryDate\s*\n?\s*\?\s*job\.partsWarrantyExpiryDate\s*\n?\s*:\s*job\.warrantyExpiryDate/);
    });

    it("the status endpoint reports both clocks", () => {
        // Reporting only labour told staff "expired" on a job with live parts
        // cover, and they would turn the customer away.
        expect(WARRANTY).toContain("partsExpiry");
        expect(WARRANTY).toMatch(/parts:\s*partsExpiry/);
    });

    it("keeps the original `warranty` shape for existing callers", () => {
        const block = WARRANTY.slice(WARRANTY.indexOf("res.json({\n                job,"));
        expect(block).toContain("valid: warrantyValid");
        expect(block).toContain("expiryDate: job.warrantyExpiryDate");
        expect(block).toContain("daysRemaining");
    });
});

describe("the contract we publish matches what we can honour", () => {
    it("Terms still promise parts and labour are separate", () => {
        // If this promise is ever removed the separation could be retired too —
        // but while it is published, the schema must be able to express it.
        expect(TERMS).toMatch(/manufacturer'?s? (or supplier'?s? )?warranty/i);
        expect(TERMS).toMatch(/separately from our warranty on the labour/i);
    });
});
