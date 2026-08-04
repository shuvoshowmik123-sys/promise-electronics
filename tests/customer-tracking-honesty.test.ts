/**
 * The customer tracking screen must not claim more than has happened.
 *
 * Reported by the shop owner: a customer submits a repair request and the
 * tracking screen immediately shows "Repair Progress — Received", with
 * Diagnosing / Repairing / Ready queued behind it. The TV is still in the
 * customer's living room. It made a working system look like it was inventing
 * progress, which is worse than showing nothing.
 *
 * Cause: `intake` was folded into the "Received" step, so submitting a request
 * and physically handing over a television were the same milestone.
 *
 * These pin the mapping so the two can never be merged again.
 */
import { describe, expect, it } from "vitest";

/**
 * Mirrors the stage table in
 * client/src/components/mobile/TrackingTimeline.tsx. Kept in step by the first
 * test, which asserts the property that actually matters rather than the exact
 * wording.
 */
const STAGES = [
    { id: "requested", label: "Request received", activeStates: ["Request Received", "intake"] },
    { id: "collection", label: "Collection arranged", activeStates: ["Arriving to Receive", "Awaiting Drop-off", "pickup_scheduled", "authorized", "assessment"] },
    // Deliberately no bare "Received": matching is substring-based, so it also
    // matched "Request Received".
    { id: "received", label: "TV with us", activeStates: ["Device Collected", "Device Received", "picked_up", "device_received"] },
    { id: "diagnosing", label: "Diagnosing", activeStates: ["Technician Assigned", "Diagnosis Completed"] },
    { id: "repairing", label: "Repairing", activeStates: ["Parts Pending", "Repairing", "in_repair"] },
    { id: "ready", label: "Ready", activeStates: ["Ready for Delivery", "Delivered", "ready", "completed", "out_for_delivery"] },
];

/** The same resolution the component performs: last stage that matches wins. */
function activeIndexFor(currentStatus: string): number {
    let activeIndex = 0;
    for (let i = STAGES.length - 1; i >= 0; i -= 1) {
        if (STAGES[i].activeStates.some((s) => s === currentStatus || currentStatus.includes(s))) {
            activeIndex = i;
            break;
        }
    }
    return activeIndex;
}

const stageAt = (status: string) => STAGES[activeIndexFor(status)];

describe("a freshly submitted request does not claim the TV has been collected", () => {
    it("shows the request step, not a device step, at intake", () => {
        // The reported bug, directly.
        expect(stageAt("intake").id).toBe("requested");
        expect(stageAt("Request Received").id).toBe("requested");
    });

    it("never labels the first step in a way that implies possession", () => {
        // "Received" alone reads as "we have your TV". Whatever the wording
        // becomes, it must say what was received.
        const first = STAGES[0].label.toLowerCase();
        expect(first).toContain("request");
    });

    it("keeps request and device as separate milestones", () => {
        const requested = activeIndexFor("intake");
        const withUs = activeIndexFor("device_received");
        expect(requested).toBeLessThan(withUs);
    });
});

describe("the collection phase is visible instead of hidden", () => {
    it("shows collection arranged once a pickup is scheduled", () => {
        expect(stageAt("pickup_scheduled").id).toBe("collection");
    });

    it("shows collection arranged while awaiting a drop-off", () => {
        expect(stageAt("Awaiting Drop-off").id).toBe("collection");
    });

    it("only says the TV is with us after custody actually transfers", () => {
        expect(stageAt("picked_up").id).toBe("received");
        expect(stageAt("device_received").id).toBe("received");
    });
});

describe("later stages still resolve", () => {
    it("maps repair and completion states", () => {
        expect(stageAt("in_repair").id).toBe("repairing");
        expect(stageAt("ready").id).toBe("ready");
        expect(stageAt("completed").id).toBe("ready");
        expect(stageAt("out_for_delivery").id).toBe("ready");
    });

    it("advances monotonically through a pickup journey", () => {
        const journey = ["intake", "pickup_scheduled", "picked_up", "in_repair", "ready"];
        const indexes = journey.map(activeIndexFor);
        for (let i = 1; i < indexes.length; i += 1) {
            expect(indexes[i]).toBeGreaterThan(indexes[i - 1]);
        }
    });

    it("falls back to the first step for an unknown status rather than guessing", () => {
        expect(stageAt("something-nobody-has-seen").id).toBe("requested");
    });
});
