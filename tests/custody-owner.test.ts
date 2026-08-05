import { describe, expect, it } from "vitest";
import {
    pickupTransferPending,
    resolveCustodyOwner,
    serviceDeskMayCollectCustodyCode,
} from "../client/src/lib/custody-owner";

/**
 * The regression this locks down: a pickup request must never offer a customer
 * custody code on the service-request screen.
 *
 * getNextValidStages returns stageFlow.slice(index + 1) — EVERY remaining
 * stage, not the next one — so the old check findNextStage("picked_up")
 * matched from "intake" onwards. The custody branch was evaluated before the
 * transfer branch, so it won at every stage, and "Transfer to Pickup &
 * Delivery" became unreachable on mobile, where only one primary action shows.
 */

const PICKUP_STAGES_BEFORE_CUSTODY = ["intake", "assessment", "authorized", "pickup_scheduled"];

describe("resolveCustodyOwner", () => {
    it.each(PICKUP_STAGES_BEFORE_CUSTODY)(
        "gives a pickup request at %s to the pickup desk, never the service desk",
        (stage) => {
            const input = { serviceMode: "pickup", stage, convertedJobId: null };
            expect(resolveCustodyOwner(input)).toBe("pickup_desk");
            // The exact bug: the service desk must not be offered the code.
            expect(serviceDeskMayCollectCustodyCode(input)).toBe(false);
        },
    );

    it.each(["intake", "assessment", "authorized", "awaiting_dropoff"])(
        "keeps a drop-off request at %s with the service desk",
        (stage) => {
            const input = { serviceMode: "service_center", stage, convertedJobId: null };
            expect(resolveCustodyOwner(input)).toBe("service_desk");
            // The customer is standing at the counter, so this one is correct.
            expect(serviceDeskMayCollectCustodyCode(input)).toBe(true);
        },
    );

    it("treats a missing serviceMode as drop-off", () => {
        expect(resolveCustodyOwner({ serviceMode: null, stage: "intake" })).toBe("service_desk");
    });

    it.each(["picked_up", "device_received", "in_repair", "ready", "completed", "closed"])(
        "owes nothing once the device is with the shop (%s)",
        (stage) => {
            expect(resolveCustodyOwner({ serviceMode: "pickup", stage })).toBe("none");
            expect(serviceDeskMayCollectCustodyCode({ serviceMode: "service_center", stage })).toBe(false);
        },
    );

    it("owes nothing once a job ticket exists", () => {
        expect(
            resolveCustodyOwner({ serviceMode: "pickup", stage: "intake", convertedJobId: "job-1" }),
        ).toBe("none");
    });
});

describe("pickupTransferPending", () => {
    it.each(["intake", "assessment", "authorized"])(
        "still needs transferring at %s",
        (stage) => {
            expect(pickupTransferPending({ serviceMode: "pickup", stage })).toBe(true);
        },
    );

    it("is already transferred at pickup_scheduled", () => {
        expect(pickupTransferPending({ serviceMode: "pickup", stage: "pickup_scheduled" })).toBe(false);
    });

    it("never applies to a drop-off request", () => {
        expect(pickupTransferPending({ serviceMode: "service_center", stage: "intake" })).toBe(false);
    });
});
