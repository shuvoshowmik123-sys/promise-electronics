/**
 * The tracker has to move while the customer is watching it.
 *
 * /api/customer/events existed with heartbeats and cleanup long before anything
 * connected to it, and nothing on the server ever published a job status onto
 * it. Both halves were absent at once, which is why the gap was invisible: the
 * endpoint looked implemented and the page looked finished.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const TRANSITION = read("server/services/job-status-transition.service.ts");
const HOOK = read("client/src/hooks/useCustomerSSE.ts");
const DETAIL = read("client/src/pages/my-repair-detail.tsx");
const LIST = read("client/src/pages/my-repairs.tsx");

describe("the server tells the customer their repair moved", () => {
  it("announces from every path that can change a status", () => {
    /**
     * Three call sites: the ordinary transition, projectOnly, and the
     * external-write catch-up. A hook on only one of them would leave POS
     * completions or NG decisions silent.
     */
    const calls = TRANSITION.match(/announceToCustomer\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4); // declaration + 3 sites
  });

  it("never announces from inside the transaction", () => {
    /**
     * Announcing before commit would tell a customer about a status a rollback
     * then undid, and a tracker that goes forwards and back is worse than one
     * that is a second late.
     */
    const tx = TRANSITION.slice(TRANSITION.indexOf("db.transaction"), TRANSITION.indexOf("const readyNotifyEligible"));
    expect(tx).not.toContain("announceToCustomer");
  });

  it("does not compare statuses to decide whether to speak", () => {
    // Two of the three sites arrive with previousStatus already equal to the
    // new status, so that comparison silenced exactly the paths that need it.
    const fn = TRANSITION.slice(TRANSITION.indexOf("function announceToCustomer"));
    expect(fn.slice(0, 900)).not.toMatch(/previousStatus === job\.status\) return/);
  });

  it("a failed announcement cannot fail the transition", () => {
    const fn = TRANSITION.slice(TRANSITION.indexOf("function announceToCustomer"));
    expect(fn.slice(0, 1400)).toMatch(/try \{/);
    expect(fn.slice(0, 1400)).toMatch(/catch \(error: any\)/);
  });
});

describe("the page listens, and trusts the server over the socket", () => {
  it("connects to the customer stream", () => {
    expect(HOOK).toContain("/api/customer/events");
    expect(HOOK).toContain("withCredentials: true");
  });

  it("refetches rather than patching state from the payload", () => {
    /**
     * The journey detail is assembled server-side from several tables. Rebuilt
     * from a status string it would drift from what a reload shows, and two
     * tabs would disagree about one repair.
     */
    expect(HOOK).toMatch(/invalidateQueries\(\{ queryKey: \["customerRepairJourney"\] \}\)/);
    expect(HOOK).toMatch(/invalidateQueries\(\{ queryKey: \["customerRepairJourneys"\] \}\)/);
    expect(HOOK).not.toMatch(/setQueryData/);
  });

  it("only connects for a signed-in customer", () => {
    // The endpoint requires a session; without one this is a 401 reconnect loop.
    expect(HOOK).toMatch(/if \(!isAuthenticated\) return/);
  });

  it("backs off instead of hammering a sleeping backend", () => {
    expect(HOOK).toMatch(/Math\.min\(30_000/);
    expect(HOOK).toMatch(/onerror/);
  });

  it("closes the connection when the page goes away", () => {
    expect(HOOK).toMatch(/sourceRef\.current\?\.close\(\)/);
  });

  it("is used by both the repair detail and the repair list", () => {
    for (const [name, src] of [["detail", DETAIL], ["list", LIST]] as const) {
      expect(src, name).toContain("useCustomerSSE()");
    }
  });
});
