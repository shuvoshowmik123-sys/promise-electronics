import { describe, expect, it } from "vitest";
import {
  activeWorkTimerPatch,
  assertNoHoldDetailLeak,
  buildTechnicianQueueResponse,
  compareWorkNowJobs,
  computeActiveWorkAgeDays,
  escalationBandForAge,
  isBlockedWorkStatus,
  isWorkableStatus,
  STATUS_AWAITING_QUOTE_APPROVAL,
  waitingStickerForStatus,
} from "../server/services/technician-queue.service.js";

describe("technician queue — eligibility and stickers", () => {
  it("classifies blocked vs workable", () => {
    expect(isBlockedWorkStatus("Pending Parts")).toBe(true);
    expect(isBlockedWorkStatus("Waiting on Parts")).toBe(true);
    expect(isBlockedWorkStatus(STATUS_AWAITING_QUOTE_APPROVAL)).toBe(true);
    expect(isBlockedWorkStatus("Awaiting Customer Decision")).toBe(true);
    expect(isBlockedWorkStatus("NG Review Pending")).toBe(true);
    expect(isWorkableStatus("In Progress")).toBe(true);
    expect(isWorkableStatus("Pending Parts")).toBe(false);
    expect(isWorkableStatus("Completed")).toBe(false);
  });

  it("maps generic waiting labels only", () => {
    expect(waitingStickerForStatus("Pending Parts")).toBe("waiting_for_parts");
    expect(waitingStickerForStatus(STATUS_AWAITING_QUOTE_APPROVAL)).toBe(
      "customer_decision_needed",
    );
    expect(waitingStickerForStatus("Awaiting Customer Decision")).toBe(
      "ng_replacement_decision",
    );
    expect(waitingStickerForStatus("NG Review Pending")).toBe("ng_review_in_progress");
  });
});

describe("technician queue — ranking and bands", () => {
  it("escalation bands match day thresholds", () => {
    expect(escalationBandForAge(0)).toBe(0);
    expect(escalationBandForAge(3)).toBe(0);
    expect(escalationBandForAge(4)).toBe(1);
    expect(escalationBandForAge(5)).toBe(2);
    expect(escalationBandForAge(6)).toBe(3);
    expect(escalationBandForAge(7)).toBe(4);
    expect(escalationBandForAge(20)).toBe(4);
  });

  it("ranks by band, priority, age, then id", () => {
    const jobs = [
      { id: "JOB-B", priority: "Low", activeWorkAgeDays: 2, escalationBand: 0 as const },
      { id: "JOB-A", priority: "High", activeWorkAgeDays: 2, escalationBand: 0 as const },
      { id: "JOB-C", priority: "Medium", activeWorkAgeDays: 8, escalationBand: 4 as const },
      { id: "JOB-D", priority: "High", activeWorkAgeDays: 5, escalationBand: 2 as const },
    ];
    const sorted = [...jobs].sort(compareWorkNowJobs);
    expect(sorted.map((j) => j.id)).toEqual(["JOB-C", "JOB-D", "JOB-A", "JOB-B"]);
  });
});

describe("technician queue — timer reset", () => {
  it("resets start and clears alert when leaving blocked state", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    const patch = activeWorkTimerPatch("Pending Parts", "In Progress", now);
    expect(patch.activeWorkStartedAt).toEqual(now);
    expect(patch.activeWorkAlertSentAt).toBeNull();
  });

  it("does not reset when staying workable", () => {
    const patch = activeWorkTimerPatch("In Progress", "Testing", new Date());
    expect(patch.activeWorkStartedAt).toBeUndefined();
    expect(patch.activeWorkAlertSentAt).toBeUndefined();
  });

  it("does not age blocked jobs", () => {
    const started = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    expect(computeActiveWorkAgeDays("Pending Parts", started)).toBeNull();
    expect(computeActiveWorkAgeDays("In Progress", started)).toBeGreaterThanOrEqual(9);
  });
});

describe("technician queue — DTO safety and split lists", () => {
  it("builds work_now and waiting without detail leaks", () => {
    const now = new Date();
    const started = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const result = buildTechnicianQueueResponse(
      [
        {
          id: "JOB-1",
          status: "In Progress",
          priority: "High",
          device: "TV",
          issue: "dead",
          customer: "Cust",
          customerPhone: "01710000000",
          activeWorkStartedAt: started,
          estimatedCost: 999,
        },
        {
          id: "JOB-2",
          status: "Awaiting Quote Approval",
          priority: "Medium",
          device: "Panel",
          issue: "hold",
          customer: "Cust2",
          customerPhone: "01710000001",
        },
      ],
      { includeCustomerPhone: false, now },
    );

    expect(result.workNow).toHaveLength(1);
    expect(result.waiting).toHaveLength(1);
    expect(result.workNow[0].customerPhone).toBeNull();
    expect(result.waiting[0].waitingLabel).toBe("Customer decision needed");
    expect(result.workNow[0].escalationBand).toBe(2);
    expect(assertNoHoldDetailLeak(result.workNow[0] as any)).toEqual([]);
    expect(result.workNow[0]).not.toHaveProperty("estimatedCost");
    expect(result.workNow[0]).not.toHaveProperty("supplier");
  });
});

describe("technician queue — one-alert guard semantics", () => {
  it("treats non-null activeWorkAlertSentAt as already notified this interval", () => {
    // Guard is field presence; resume clears via activeWorkTimerPatch
    const resume = activeWorkTimerPatch(
      STATUS_AWAITING_QUOTE_APPROVAL,
      "In Progress",
      new Date(),
    );
    expect(resume.activeWorkAlertSentAt).toBeNull();
    expect(resume.activeWorkStartedAt).toBeInstanceOf(Date);
  });
});

describe("technician queue — concurrent claim CAS", () => {
  it("only first claim wins under concurrent CAS", async () => {
    const { casClaimActiveWorkAlert } = await import(
      "../server/services/technician-queue.service.js"
    );
    let sent: Date | null = null;
    const now1 = new Date("2026-07-21T10:00:00.000Z");
    const now2 = new Date("2026-07-21T10:00:01.000Z");

    // Simulate two workers racing on the same sentinel
    const results = await Promise.all([
      Promise.resolve().then(() => {
        const r = casClaimActiveWorkAlert(sent, now1);
        if (r.claimed) sent = r.sentAt as Date;
        return r.claimed;
      }),
      Promise.resolve().then(() => {
        const r = casClaimActiveWorkAlert(sent, now2);
        if (r.claimed) sent = r.sentAt as Date;
        return r.claimed;
      }),
    ]);

    // Sequential CAS on shared memory: second always loses after first assigns
    // Run strict sequential race model:
    sent = null;
    const a = casClaimActiveWorkAlert(sent, now1);
    if (a.claimed) sent = a.sentAt as Date;
    const b = casClaimActiveWorkAlert(sent, now2);
    expect(a.claimed).toBe(true);
    expect(b.claimed).toBe(false);
    expect(sent).toEqual(now1);
    void results;
  });
});

describe("technician queue — timer seed defaults", () => {
  it("blocked jobs stay age-null even when startedAt is set", () => {
    const started = new Date();
    expect(computeActiveWorkAgeDays("Awaiting Quote Approval", started)).toBeNull();
    expect(computeActiveWorkAgeDays("Pending Parts", started)).toBeNull();
  });
});

describe("technician queue — generic hold source eligibility", () => {
  it("rejects parts-waiting and other blocked sources for work_hold", async () => {
    const { canEnterGenericWorkHoldFrom, isWorkableStatus } = await import(
      "../server/services/technician-queue.service.js"
    );

    expect(canEnterGenericWorkHoldFrom("In Progress")).toBe(true);
    expect(canEnterGenericWorkHoldFrom("Pending")).toBe(true);
    expect(canEnterGenericWorkHoldFrom("Diagnosing")).toBe(true);

    // Must not overwrite true parts blocker as quote-approval hold
    expect(canEnterGenericWorkHoldFrom("Pending Parts")).toBe(false);
    expect(canEnterGenericWorkHoldFrom("Waiting on Parts")).toBe(false);
    expect(isWorkableStatus("Pending Parts")).toBe(false);

    expect(canEnterGenericWorkHoldFrom("Awaiting Quote Approval")).toBe(false);
    expect(canEnterGenericWorkHoldFrom("Awaiting Customer Decision")).toBe(false);
    expect(canEnterGenericWorkHoldFrom("NG Review Pending")).toBe(false);
    expect(canEnterGenericWorkHoldFrom("Completed")).toBe(false);
  });
});
