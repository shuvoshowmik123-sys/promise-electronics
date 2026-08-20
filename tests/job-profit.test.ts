/**
 * What a repair earned.
 *
 * A repair is billed as `linkedJobs` — one amount per job ticket in its own
 * column — not as cart items, so the first profit report counted none of it.
 * That left most of the shop out of its own profit figure.
 *
 * The distinction these tests exist to protect: **a repair with no parts costs
 * nothing, and that is an answer.** Plenty of jobs are a clean or a reflow with
 * nothing replaced. Unknown is reserved for a part that was genuinely used and
 * has no recorded cost. Collapsing the two would either make every labour-only
 * repair unmeasurable, or report a job that used an uncosted part as pure
 * profit.
 *
 * Labour is deliberately not a cost here — technicians are paid by salary, not
 * per job, so charging their time against each repair would double-count it
 * against the wage bill.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("../server/db.js", () => ({ db: { execute: (q: unknown) => execute(q) } }));

/** getJobCosts queries local_purchases, then the consumed-stock wastage rows. */
function givenCosts(
    purchases: Array<{ job_ticket_id: string; total: number; lines: number }>,
    consumed: Array<{ reason: string; quantity: number; avg_cost_price: number | null }>,
) {
    execute.mockReset();
    execute
        .mockResolvedValueOnce({ rows: purchases })
        .mockResolvedValueOnce({ rows: consumed });
}

function billedJob(jobId: string, amount: number, over: Record<string, unknown> = {}) {
    return {
        linkedJobs: JSON.stringify([{ jobId, billedAmount: amount }]),
        total: amount,
        refundedAmount: 0,
        ...over,
    };
}

async function summarise(txns: Array<{ linkedJobs: string | null; total: number; refundedAmount: number }>) {
    const { summariseRepairs } = await import("../server/services/job-profit.service.js");
    return summariseRepairs(txns);
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

describe("a repair that used a bought-in part", () => {
    it("earns what was billed minus what the part cost", async () => {
        givenCosts([{ job_ticket_id: "job-1", total: 1200, lines: 1 }], []);

        const r = await summarise([billedJob("job-1", 3500)]);

        expect(r.revenue).toBe(3500);
        expect(r.cost).toBe(1200);
        expect(r.profit).toBe(2300);
    });

    it("ignores a part that was returned to the vendor", async () => {
        // The money came back, so it was never a cost. The SQL excludes
        // 'Returned' rows, so nothing reaches the total for that purchase.
        givenCosts([], []);

        const r = await summarise([billedJob("job-1", 3500)]);

        expect(r.cost).toBe(0);
        expect(r.profit).toBe(3500);
    });
});

describe("a repair that used stock off the shelf", () => {
    it("costs the part at the item's average", async () => {
        givenCosts([], [{ reason: "Job consumption: job-1", quantity: 2, avg_cost_price: 475 }]);

        const r = await summarise([billedJob("job-1", 3500)]);

        expect(r.cost).toBe(950);
        expect(r.profit).toBe(2550);
    });

    it("adds shelf stock and bought-in parts together", async () => {
        givenCosts(
            [{ job_ticket_id: "job-1", total: 1200, lines: 1 }],
            [{ reason: "Job consumption: job-1", quantity: 1, avg_cost_price: 475 }],
        );

        const r = await summarise([billedJob("job-1", 3500)]);

        expect(r.cost).toBe(1675);
        expect(r.profit).toBe(1825);
    });

    it("cannot report a margin when the part has no recorded cost", async () => {
        /**
         * A part was used and nobody knows what it cost, so the job's margin is
         * unknowable. Reporting zero would present the whole repair as pure
         * profit, which is the failure this whole design guards against.
         */
        givenCosts([], [{ reason: "Job consumption: job-1", quantity: 1, avg_cost_price: null }]);

        const r = await summarise([billedJob("job-1", 3500)]);

        expect(r.unknownCostJobs).toBe(1);
        expect(r.unknownCostRevenue).toBe(3500);
        expect(r.profit).toBe(0);
        // Revenue is still real and still counted.
        expect(r.revenue).toBe(3500);
    });
});

describe("a repair with no parts at all", () => {
    it("is fully costed at zero, not treated as unknown", async () => {
        /**
         * A clean, a reflow, a loose connector. These are real repairs with a
         * real margin, and calling them unmeasurable would drag coverage down
         * for jobs that are perfectly well understood.
         */
        givenCosts([], []);

        const r = await summarise([billedJob("job-1", 1500)]);

        expect(r.cost).toBe(0);
        expect(r.profit).toBe(1500);
        expect(r.unknownCostJobs).toBe(0);
        expect(r.marginPercent).toBe(100);
    });
});

describe("refunded repairs", () => {
    it("earn nothing, and the parts are still gone", async () => {
        // The customer's money went back. The part did not come back.
        givenCosts([{ job_ticket_id: "job-1", total: 1200, lines: 1 }], []);

        const r = await summarise([billedJob("job-1", 3500, { refundedAmount: 3500 })]);

        expect(r.revenue).toBe(0);
        expect(r.profit).toBe(-1200);
    });

    it("lose only the part refunded", async () => {
        givenCosts([{ job_ticket_id: "job-1", total: 1200, lines: 1 }], []);

        const r = await summarise([billedJob("job-1", 3500, { refundedAmount: 1000 })]);

        expect(r.revenue).toBe(2500);
        expect(r.profit).toBe(1300);
    });
});

describe("several repairs", () => {
    it("adds them up and counts the jobs", async () => {
        givenCosts(
            [
                { job_ticket_id: "job-1", total: 1200, lines: 1 },
                { job_ticket_id: "job-2", total: 300, lines: 1 },
            ],
            [],
        );

        const r = await summarise([billedJob("job-1", 3500), billedJob("job-2", 1500)]);

        expect(r.jobs).toBe(2);
        expect(r.revenue).toBe(5000);
        expect(r.cost).toBe(1500);
        expect(r.profit).toBe(3500);
    });

    it("combines a job billed across two transactions", async () => {
        // Part payment then the balance is one job, not two.
        givenCosts([{ job_ticket_id: "job-1", total: 1200, lines: 1 }], []);

        const r = await summarise([billedJob("job-1", 2000), billedJob("job-1", 1500)]);

        expect(r.jobs).toBe(1);
        expect(r.revenue).toBe(3500);
        expect(r.profit).toBe(2300);
    });

    it("keeps an unknown job out of profit without hiding the rest", async () => {
        givenCosts(
            [{ job_ticket_id: "job-1", total: 1200, lines: 1 }],
            [{ reason: "Job consumption: job-2", quantity: 1, avg_cost_price: null }],
        );

        const r = await summarise([billedJob("job-1", 3500), billedJob("job-2", 9000)]);

        expect(r.revenue).toBe(12500);
        expect(r.profit).toBe(2300);
        expect(r.unknownCostJobs).toBe(1);
        // Margin describes the job it can account for, not all 12,500.
        expect(r.marginPercent).toBe(65.71);
    });
});

describe("transactions with nothing to count", () => {
    it("returns zeroes for a period with no repairs", async () => {
        execute.mockReset();

        const r = await summarise([{ linkedJobs: null, total: 900, refundedAmount: 0 }]);

        expect(r.jobs).toBe(0);
        expect(r.revenue).toBe(0);
        expect(r.marginPercent).toBe(0);
        // No jobs means no cost lookup was worth paying for.
        expect(execute).not.toHaveBeenCalled();
    });

    it("survives a corrupt linkedJobs column", async () => {
        execute.mockReset();

        const r = await summarise([{ linkedJobs: "{not json", total: 900, refundedAmount: 0 }]);

        expect(r.jobs).toBe(0);
    });
});
