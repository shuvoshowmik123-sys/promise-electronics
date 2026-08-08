import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * One part off the shelf, one unit off the count.
 *
 * Two paths reduced stock independently — the technician recording parts on
 * the job, and the cashier billing a cart — and neither knew the other
 * existed. The same LVDS recorded in both places removed two boards for one
 * board fitted. The only defence was a rule people had to remember, and rules
 * like that break on the first busy Thursday.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const LEDGER = read("server/services/job-stock-deduction.service.ts");
const JOB = read("server/services/job.service.ts");
const POS = read("server/services/pos-billing.service.ts");
const SCHEMA = read("shared/schema.ts");
const MIGRATE = read("server/services/main-schema-migrate.service.ts");

describe("the claim is decided by the database, not by application logic", () => {
    it("is a single atomic statement", () => {
        /**
         * A SELECT-then-INSERT lets two concurrent saves both read "not yet
         * deducted" and both deduct — the same bug relocated.
         */
        expect(LEDGER).toContain("INSERT INTO job_stock_deductions");
        expect(LEDGER).toContain("ON CONFLICT (job_ticket_id, inventory_item_id) DO NOTHING");
        expect(LEDGER).toMatch(/if \(\(inserted as any\)\.rowCount > 0\)/);
    });

    it("uniqueness is enforced by an index, not by a check", () => {
        expect(SCHEMA).toContain("uq_job_stock_deduction_once");
        expect(MIGRATE).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_job_stock_deduction_once");
    });

    it("a top-up moves only the increase", () => {
        // Fitting a second capacitor after billing one should remove one more,
        // not two.
        expect(LEDGER).toMatch(/if \(qty <= already\) return \{ granted: false, quantity: 0 \}/);
        expect(LEDGER).toMatch(/return \{ granted: true, quantity: qty - already \}/);
    });

    it("two concurrent top-ups cannot both win", () => {
        // The UPDATE is guarded on the stored quantity, so the loser matches
        // nothing rather than double-deducting.
        expect(LEDGER).toMatch(/AND quantity = \$\{already\}/);
        expect(LEDGER).toMatch(/if \(\(bumped as any\)\.rowCount === 0\) return \{ granted: false, quantity: 0 \}/);
    });

    it("rejects nonsense input rather than claiming it", () => {
        expect(LEDGER).toMatch(/!Number\.isFinite\(qty\) \|\| qty <= 0/);
    });
});

describe("the job path", () => {
    it("claims before it moves stock", () => {
        expect(JOB).toContain("claimStockDeduction");
        expect(JOB).toMatch(/if \(!claim\.granted\) continue/);
    });

    it("no longer reads then writes", () => {
        /**
         * Number(item.stock) - qty loses a decrement when two people save the
         * same job at once: both read 5, both write 4.
         */
        expect(JOB).not.toMatch(/stock: Number\(item\.stock\) - Number\(part\.quantity\)/);
        expect(JOB).toMatch(/GREATEST\(0, COALESCE\(/);
    });

    it("runs inside a transaction", () => {
        // A five-part job failing on part three used to leave stock
        // half-updated, and the ledger would make that worse by recording
        // claims for movements that never happened.
        const fn = JOB.slice(JOB.indexOf("async syncJobParts"));
        expect(fn.slice(0, 3000)).toContain("await db.transaction(async (tx) =>");
        expect(fn.slice(0, 3000)).not.toMatch(/await db\.update\(/);
    });

    it("releases claims when the old part list is reverted", () => {
        // Otherwise re-adding a part the technician removed is silently
        // refused for the life of the job.
        expect(JOB).toContain("releaseStockDeductions");
    });
});

describe("the till", () => {
    it("claims before deducting on a job-linked sale", () => {
        expect(POS).toContain("claimStockDeduction");
        expect(POS).toMatch(/const stockJobId = allocations\[0\]\?\.job\?\.id \?\? null/);
    });

    it("skips a part the job already took off the shelf", () => {
        const block = POS.slice(POS.indexOf("const stockJobId"));
        expect(block.slice(0, 1200)).toMatch(/if \(!claim\.granted\) continue/);
    });

    it("still deducts a part the technician never recorded", () => {
        /**
         * That case is a cashier catching something missed, not a duplicate —
         * nothing has counted it, so it must come off the shelf.
         */
        const block = POS.slice(POS.indexOf("const stockJobId"));
        expect(block.slice(0, 1200)).toMatch(/unitsToDeduct = claim\.quantity/);
    });

    it("a counter sale with no job deducts exactly as before", () => {
        // Nothing to reconcile against; the claim is skipped entirely.
        const block = POS.slice(POS.indexOf("const stockJobId"));
        expect(block.slice(0, 1200)).toMatch(/if \(stockJobId\) \{/);
    });

    it("never claims for a sourced part", () => {
        // Those never came off a shelf this system tracks.
        const block = POS.slice(POS.indexOf("const stockJobId"));
        expect(block.slice(0, 1200)).toMatch(/if \(item\?\.isSourced\) continue/);
    });

    it("no longer deducts every cart line unconditionally", () => {
        expect(POS).not.toMatch(/for \(const item of input\.cartItems\) \{\s*\n\s*if \(item\?\.id && item\?\.quantity\) \{\s*\n\s*await tx\s*\n?\s*\.update\(schema\.inventoryItems\)/);
    });
});

describe("migration safety", () => {
    it("is additive only", () => {
        const entry = MIGRATE.slice(MIGRATE.indexOf('id: "2026_08_09_job_stock_deductions"'));
        const body = entry.slice(0, entry.indexOf("},\n];") + 1);
        for (const destructive of [/DROP\s+(TABLE|COLUMN)/i, /\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i]) {
            expect(body).not.toMatch(destructive);
        }
        expect(body).toContain("CREATE TABLE IF NOT EXISTS job_stock_deductions");
    });

    it("records the description's warning about historical drift", () => {
        // This stops the bleeding; it cannot repair counts already wrong.
        const entry = MIGRATE.slice(MIGRATE.indexOf('id: "2026_08_09_job_stock_deductions"'));
        expect(entry.slice(0, 3000)).toMatch(/physical stock count/i);
    });
});
