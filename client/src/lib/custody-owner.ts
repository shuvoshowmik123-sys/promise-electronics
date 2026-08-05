/**
 * Which surface owns the next custody step for a service request.
 *
 * This exists because the answer was previously decided by the ORDER of `if`
 * statements inside a 2000-line component, and the order was wrong.
 *
 * The admin API returns every remaining stage from `getNextValidStages`
 * (`stageFlow.slice(index + 1)`), not just the next one. A check shaped like
 * `findNextStage("picked_up")` therefore matched from "intake" onwards, so the
 * custody branch always won and the "Transfer to Pickup & Delivery" branch
 * below it could never be reached. On mobile — which shows exactly one primary
 * action — that meant a pickup request offered "Receive Pickup OTP" for its
 * entire life, and the transfer button was only reachable from a "More
 * Actions" sheet.
 *
 * The rule that matters is not about stage lists at all:
 *
 *   A pickup request's custody handoff happens at the customer's door, so it
 *   belongs to the driver in Pickup & Delivery. A drop-off request's handoff
 *   happens at the counter, so it belongs to the service desk.
 *
 * Offering the customer's code to a desk admin invites confirming a handover
 * that has not physically happened.
 */

export type CustodyOwner =
    /** Driver, in Pickup & Delivery — the device moves at the customer's door. */
    | "pickup_desk"
    /** Service request desk — the customer is at the counter. */
    | "service_desk"
    /** Custody already settled (or a job exists), so nothing is owed. */
    | "none";

export interface CustodyOwnerInput {
    /** "pickup" for collection from the customer; anything else is drop-off. */
    serviceMode: string | null | undefined;
    stage: string | null | undefined;
    /** Once a job ticket exists, intake custody is finished. */
    convertedJobId?: string | null;
}

/** Stages at which the device is already with the shop. */
const CUSTODY_SETTLED_STAGES = new Set([
    "picked_up",
    "device_received",
    "in_repair",
    "ready",
    "out_for_delivery",
    "completed",
    "closed",
]);

export function resolveCustodyOwner(input: CustodyOwnerInput): CustodyOwner {
    const stage = input.stage || "intake";

    // A job ticket means intake custody was already confirmed.
    if (input.convertedJobId) return "none";
    if (CUSTODY_SETTLED_STAGES.has(stage)) return "none";

    return input.serviceMode === "pickup" ? "pickup_desk" : "service_desk";
}

/**
 * True when the service-request screen may show a customer-code control.
 *
 * Deliberately narrow: only the drop-off counter qualifies.
 */
export function serviceDeskMayCollectCustodyCode(input: CustodyOwnerInput): boolean {
    return resolveCustodyOwner(input) === "service_desk";
}

/**
 * True when the request still needs handing to Pickup & Delivery, as opposed to
 * already being there.
 */
export function pickupTransferPending(input: CustodyOwnerInput): boolean {
    if (resolveCustodyOwner(input) !== "pickup_desk") return false;
    return (input.stage || "intake") !== "pickup_scheduled";
}
