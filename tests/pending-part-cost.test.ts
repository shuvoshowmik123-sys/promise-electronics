import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The buying price nobody has time for at the counter.
 *
 * A customer waits for a bill, not a margin figure. Forcing the cost in there
 * produces a queue or a guessed number typed to clear the form — and a guessed
 * cost is worse than a blank one, because a blank one can be chased and a wrong
 * one cannot be detected. So the sale completes on the selling price and the
 * cost is collected at 19:00 from the one person who knows it.
 *
 * Before this the cost was shown in a toast and discarded entirely: it reached
 * no table, no bill, and no report.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const SCHEMA = read("shared/schema.ts");
const MIGRATE = read("server/services/main-schema-migrate.service.ts");
const BILLING = read("server/services/pos-billing.service.ts");
const POS_ROUTE = read("server/routes/pos.routes.ts");
const NUDGE = read("server/services/nudge-scheduler.service.ts");
const POS_TAB = read("client/src/pages/admin/bento/tabs/PosTab.tsx");
const TYPES = read("client/src/pages/admin/bento/tabs/pos/pos-types.ts");

describe("the IOU is a separate record, not a weakened ledger", () => {
    it("does not relax NOT NULL on the petty-cash ledger", () => {
        /**
         * local_purchases promises every row has a job, a cost and a receipt.
         * Dropping those constraints to store an incomplete row would quietly
         * weaken the audit trail for every existing row too.
         */
        const entry = MIGRATE.slice(MIGRATE.indexOf('id: "2026_08_08_pending_part_costs"'));
        const body = entry.slice(0, entry.indexOf("},\n];") + 1);
        expect(body).not.toMatch(/ALTER TABLE local_purchases/i);
        expect(body).not.toMatch(/DROP NOT NULL/i);
        expect(body).toContain("CREATE TABLE IF NOT EXISTS pending_part_costs");
    });

    it("is additive only", () => {
        const entry = MIGRATE.slice(MIGRATE.indexOf('id: "2026_08_08_pending_part_costs"'));
        const body = entry.slice(0, entry.indexOf("},\n];") + 1);
        for (const destructive of [/DROP\s+(TABLE|COLUMN)/i, /\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i]) {
            expect(body).not.toMatch(destructive);
        }
    });

    it("allows a counter sale with no job", () => {
        // A walk-in has no job ticket, which is exactly what local_purchases
        // cannot represent — its job_ticket_id is NOT NULL.
        expect(SCHEMA).toMatch(/jobTicketId: text\("job_ticket_id"\),/);
        const entry = MIGRATE.slice(MIGRATE.indexOf('id: "2026_08_08_pending_part_costs"'));
        expect(entry.slice(0, 2000)).toMatch(/job_ticket_id\s+TEXT,/);
    });

    it("cost is nullable — that absence IS the outstanding state", () => {
        expect(SCHEMA).toMatch(/costPrice: real\("cost_price"\),/);
        expect(SCHEMA).toMatch(/settledAt: timestamp\("settled_at"\),/);
    });

    it("bumps the required schema version", () => {
        expect(MIGRATE).toContain('REQUIRED_MAIN_SCHEMA_VERSION = "2026_08_08_pending_part_costs"');
    });
});

describe("what the counter typed survives the sale", () => {
    it("the cart line carries cost and warranty on a sourced part", () => {
        expect(TYPES).toContain("isSourced");
        expect(TYPES).toContain("sourcedCostPrice");
        expect(TYPES).toContain("sourcedWarrantyDays");
    });

    it("the till no longer throws the cost away into a toast", () => {
        const fn = POS_TAB.slice(POS_TAB.indexOf("const handleAddSourcedPart"));
        const body = fn.slice(0, fn.indexOf("\n    };"));
        expect(body).toContain("sourcedCostPrice");
        expect(body).toContain("sourcedWarrantyDays");
        expect(body).toContain("isSourced: true");
    });

    it("an IOU is written in the same transaction as the sale", () => {
        // A bill must never exist without its outstanding cost recorded; that
        // gap is how a margin goes missing unnoticed.
        expect(BILLING).toContain("tx.insert(schema.pendingPartCosts)");
        expect(BILLING).toContain("sourcedNeedingCost");
    });

    it("a part sold WITH a cost creates no IOU", () => {
        expect(BILLING).toMatch(/item\.sourcedCostPrice == null \|\| Number\(item\.sourcedCostPrice\) <= 0/);
    });

    it("the warranty rides along, so it is not lost with the cost", () => {
        const block = BILLING.slice(BILLING.indexOf("sourcedNeedingCost.map"));
        expect(block.slice(0, 800)).toContain("warrantyDays");
    });
});

describe("the nudge reaches the one person who knows the number", () => {
    it("is grouped by whoever billed it, with no manager digest", () => {
        // A manager cannot answer "what did you pay for this", so a digest
        // there would be pure noise.
        expect(NUDGE).toContain("sweepPendingPartCosts");
        expect(NUDGE).toMatch(/GROUP BY billed_by/);
        expect(NUDGE).toContain('"pending_part_cost"');
    });

    it("fires at 19:00, before the shop closes at 20:00", () => {
        // At 20:00 people are already leaving, and tomorrow never carries the
        // same memory of what a part cost.
        expect(NUDGE).toMatch(/SHIFT_CLOSE_MIN = 19 \* 60/);
        expect(NUDGE).toMatch(/if \(minutes < SHIFT_CLOSE_MIN\) return/);
    });

    it("only counts what is still outstanding today", () => {
        const fn = NUDGE.slice(NUDGE.indexOf("async function sweepPendingPartCosts"));
        expect(fn.slice(0, 1200)).toContain("settled_at IS NULL");
    });

    it("deep-links to where the answer is entered", () => {
        // Every nudge in this file lands on the exact thing it is about.
        const fn = NUDGE.slice(NUDGE.indexOf("async function sweepPendingPartCosts"));
        expect(fn.slice(0, 2000)).toMatch(/link: "\/admin\/finance\?target=pending-costs"/);
    });

    it("stays silent when nothing is owed", () => {
        // The GROUP BY returns no rows, so no dispatch is claimed and no push
        // is sent — there is no "all clear" notification.
        const fn = NUDGE.slice(NUDGE.indexOf("async function sweepPendingPartCosts"));
        expect(fn.slice(0, 2000)).toMatch(/if \(!row\.billedBy \|\| count < 1\) continue/);
    });
});

describe("settling", () => {
    it("defaults to the caller's own outstanding list", () => {
        const block = POS_ROUTE.slice(POS_ROUTE.indexOf("/api/pos/pending-part-costs"));
        expect(block).toMatch(/AND billed_by = \$\{String\(actorUserId\)\}/);
    });

    it("seeing everyone's list is a supervisory view", () => {
        const block = POS_ROUTE.slice(POS_ROUTE.indexOf("/api/pos/pending-part-costs"));
        expect(block).toMatch(/\["Super Admin", "Manager"\]\.includes/);
        expect(block).toMatch(/const scopeAll = wantsAll && canSeeAll/);
    });

    it("refuses a second settlement instead of overwriting", () => {
        // A reconciled margin must not move quietly, and a repeated tap on a
        // slow connection should be harmless.
        const block = POS_ROUTE.slice(POS_ROUTE.indexOf("PATCH", POS_ROUTE.indexOf("/api/pos/pending-part-costs")));
        expect(POS_ROUTE).toMatch(/WHERE id = \$\{req\.params\.id\} AND settled_at IS NULL/);
        expect(POS_ROUTE).toContain("ALREADY_SETTLED");
    });

    it("rejects a nonsense cost", () => {
        expect(POS_ROUTE).toMatch(/!Number\.isFinite\(cost\) \|\| cost < 0/);
    });
});

describe("the nudge lands on a screen that asks the question", () => {
    const FINANCE = read("client/src/pages/admin/bento/tabs/FinancesTab.tsx");
    const PANEL = read("client/src/pages/admin/bento/tabs/FinancesTabPendingCosts.tsx");
    const SHELL = read("client/src/pages/admin/design-concept.tsx");

    it("the deep link the nudge sends is honoured by the shell", () => {
        /**
         * The parts-declaration nudge once pointed at a jobs list that asked
         * nothing, which is how a reminder becomes noise. This one opens the
         * view where the number is typed.
         */
        expect(SHELL).toMatch(/selectedFinanceRecordId === 'pending-costs' \? 'pending-costs' : 'sales'/);
        const NUDGE_SRC = read("server/services/nudge-scheduler.service.ts");
        expect(NUDGE_SRC).toContain("/admin/finance?target=pending-costs");
    });

    it("Finance exposes the view on both surfaces", () => {
        expect(FINANCE).toContain('"pending-costs"');
        expect(FINANCE).toContain("PendingCostsView");
        // Mobile segment tab and desktop pill row both carry it.
        expect(FINANCE).toMatch(/\{ value: "pending-costs", label: "Buying Price" \}/);
        expect(FINANCE).toMatch(/\["expenses", "refunds", "pending-costs"\] as const/);
    });

    it("shows the selling price as the memory cue", () => {
        // Someone recalling what they paid hours ago is helped most by the
        // price it went out at — usually the number they quoted around.
        expect(PANEL).toContain("Sold at");
        expect(PANEL).toContain("row.sellingPrice");
    });

    it("computes the margin as the number is typed", () => {
        expect(PANEL).toMatch(/Profit \$\{money\(margin\)\}/);
        expect(PANEL).toMatch(/Loss \$\{money\(Math\.abs\(margin\)\)\}/);
    });

    it("is personal by default, with an explicit manager toggle", () => {
        expect(PANEL).toMatch(/\["Super Admin", "Manager"\]\.includes/);
        expect(PANEL).toMatch(/showAll \? "\?all=true" : ""/);
    });

    it("treats nothing-owed as the normal state, not an error", () => {
        expect(PANEL).toContain("Nothing outstanding");
    });

    it("a repeated tap cannot double-settle", () => {
        expect(PANEL).toMatch(/Already settled/);
    });
});
