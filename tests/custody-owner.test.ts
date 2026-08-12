import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * The rule has to hold on EVERY door, not just the one somebody remembered.
 *
 * resolveCustodyOwner was written on 2026-08-05 precisely because a pickup
 * request was offering "Receive Pickup OTP" at a desk. The guard was then
 * applied to the wizard button and to nothing else, so the stage dropdown on
 * every row of the Service Requests list went on offering it — and the server
 * went on refusing it, which reads at the counter like a broken system rather
 * than a handover that belongs to somebody else.
 *
 * These are source assertions, which cannot prove the screen behaves. They can
 * prove nobody has quietly removed the guard from a path that had it.
 */
describe("the custody rule reaches every door in Service Requests", () => {
    const TAB = readFileSync(join(process.cwd(), "client/src/pages/admin/bento/tabs/ServiceRequestsTab.tsx"), "utf8");

    it("gates the stage selector, not only the wizard button", () => {
        const fn = TAB.slice(TAB.indexOf("const handleStageSelect"));
        const body = fn.slice(0, fn.indexOf("stageTransitionMutation.mutate({ id, stage });"));
        expect(body).toContain("serviceDeskMayCollectCustodyCode");
        // And it must refuse rather than fire the request anyway.
        expect(body).toContain("This handover belongs to the driver");
    });

    it("does not even offer a custody stage this desk cannot complete", () => {
        // A control that always fails is worse than a control that is absent.
        const list = TAB.slice(TAB.indexOf("validNextStages"));
        expect(list).toContain("getCustodyActionForStage(stage)");
        expect(list).toContain("serviceDeskMayCollectCustodyCode");
    });

    it("points the staff member at the surface that owns it", () => {
        // Refusing without saying where the work lives is how a correct rule
        // still wastes somebody's afternoon.
        expect(TAB).toContain("Open Pickup & Delivery");
    });
});
