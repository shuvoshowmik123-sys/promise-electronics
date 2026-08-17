/**
 * The pickup discount threshold must be resolved BEFORE the transaction opens.
 *
 * This is not a style preference. The threshold used to be resolved inside
 * `db.transaction`, and `getPickupQuote` runs three queries of its own — asking
 * for a connection while the transaction already holds one stalls under a small
 * pool. The call failed, the catch wrote `null`, and every job was created with
 * no threshold. The discount never fired for anybody.
 *
 * What made it expensive was the silence. The fallback was written to charge in
 * full rather than block a job, which is the right behaviour and also made a
 * total feature failure look identical to "this ring has no discount". An
 * end-to-end QA run read the ৳0 discount as "threshold not reached" and marked
 * the whole path PASS.
 *
 * So two things are asserted: the call happens outside the transaction, and the
 * failure path is loud.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "../server/services/job.service.ts"),
  "utf8",
);

/**
 * Scoped to the conversion function. The file opens several transactions, so a
 * whole-file search compares against whichever one happens to come first — the
 * first version of this test failed for exactly that reason, while the code was
 * correct.
 */
const CONVERT = "async verifyAndConvertServiceRequest(";
const conversion = source.slice(source.indexOf(CONVERT));

describe("the pickup discount threshold", () => {
  it("is resolved before db.transaction is entered", () => {
    expect(source.indexOf(CONVERT), "verifyAndConvertServiceRequest not found").toBeGreaterThan(-1);

    const resolveAt = conversion.indexOf("await resolvePickupDiscountThreshold(");
    const txAt = conversion.indexOf("await db.transaction(");

    expect(resolveAt, "resolvePickupDiscountThreshold call not found").toBeGreaterThan(-1);
    expect(txAt, "db.transaction call not found").toBeGreaterThan(-1);
    expect(
      resolveAt,
      "the threshold must be resolved before the transaction opens — resolving it inside " +
        "starves the pool and silently disables every discount",
    ).toBeLessThan(txAt);
  });

  it("does not call getPickupQuote from inside the transaction", () => {
    const insideTransaction = conversion.slice(conversion.indexOf("await db.transaction("));
    expect(
      insideTransaction,
      "getPickupQuote issues its own queries and must never run while a transaction holds a connection",
    ).not.toContain("getPickupQuote(");
  });

  it("logs loudly when the threshold cannot be resolved", () => {
    /**
     * Returning null on failure is correct — a pricing question must not block a
     * job, and charging in full never overcharges anybody. But it must be
     * distinguishable from "no discount configured", or the next failure hides
     * exactly as long as this one did.
     */
    expect(source).toMatch(/console\.error\([\s\S]{0,200}FAILED to resolve the pickup discount threshold/);
  });
});
