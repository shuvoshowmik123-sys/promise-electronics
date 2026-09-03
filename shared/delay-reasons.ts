/**
 * Why a job is taking longer than expected.
 *
 * A fixed list, answered with one tap. The alternative — a free-text box at the
 * end of a shift — is answered with "still working" or not at all, because
 * somebody putting their tools down will not type a sentence to clear a
 * notification. Six choices can be read and answered while walking.
 *
 * The list is deliberately short and deliberately not editable in Settings.
 * These are the reasons a repair stalls in this shop, and the value of the
 * field comes entirely from the same reason meaning the same thing every time:
 * once anyone can add "misc" or "other issue", the counts stop being
 * comparable and the whole point of asking is gone. Part types are
 * settings-driven because a shop's vocabulary genuinely differs; the reasons a
 * television repair stalls do not.
 *
 * The counts are the real product. If "waiting for parts" is most of the
 * delays, that is a stock problem rather than a technician problem, and no
 * amount of chasing the bench will fix it — which is exactly what free text
 * could never have told anyone.
 */

export const JOB_DELAY_REASONS = [
    {
        id: "waiting_parts",
        label: "Waiting for parts",
        customerSafe:
            "We are waiting for a part to arrive for your set. We are sorry this is taking longer than usual, and we will begin as soon as it reaches us.",
    },
    {
        id: "waiting_customer",
        label: "Waiting for customer approval",
        customerSafe:
            "We are waiting to hear from you before we continue. Whenever you are ready, please give us a call and we will carry on.",
    },
    {
        id: "second_opinion",
        label: "Needs a second opinion",
        customerSafe:
            "Our senior technician is taking a closer look at your set so that we get it right the first time. Thank you for your patience.",
    },
    {
        id: "on_order",
        label: "Panel/board on order",
        customerSafe:
            "The part for your set has been ordered. Delivery times are outside our hands, and we are sorry for the wait — we will start the moment it arrives.",
    },
    {
        id: "busy_other",
        label: "Busy with other jobs",
        customerSafe:
            "We have a large batch of sets ahead of yours at the moment. Yours is in the queue and we will begin on it as soon as we finish those. We are sorry for the inconvenience.",
    },
    {
        id: "nearly_done",
        label: "Nearly done",
        customerSafe:
            "Your repair is almost finished. We will call you as soon as it is tested and ready.",
    },
] as const;

export type JobDelayReasonId = (typeof JOB_DELAY_REASONS)[number]["id"];

export function isJobDelayReason(value: unknown): value is JobDelayReasonId {
    return typeof value === "string" && JOB_DELAY_REASONS.some((r) => r.id === value);
}

/** What staff see. */
export function delayReasonLabel(id: string | null | undefined): string | null {
    if (!id) return null;
    return JOB_DELAY_REASONS.find((r) => r.id === id)?.label ?? null;
}

/**
 * What a customer may be told.
 *
 * Separate wording, because the internal reason is not always the one to read
 * out. "Busy with other jobs" is an honest answer to a manager and a poor one
 * to somebody who has been waiting a week, and "needs a second opinion" invites
 * a question about competence that the shop should answer in its own words.
 * Same fact, said the way the shop would say it.
 */
export function delayReasonForCustomer(id: string | null | undefined): string | null {
    if (!id) return null;
    return JOB_DELAY_REASONS.find((r) => r.id === id)?.customerSafe ?? null;
}

/**
 * What a waiting customer is told when nobody has given a reason yet.
 *
 * This is the case that produces angry phone calls: the set has been in the
 * shop for days, the tracking page has a status on it and nothing else, and
 * silence reads as neglect even when the shop is simply busy. A status is not
 * an explanation — "Pending" tells somebody their television has not been
 * touched, and tells them nothing about why or what happens next.
 *
 * Deliberately apologetic and deliberately not a promise. Every line says
 * expected, none of them says a date will be met, and none of them guarantees
 * an outcome: a shop that promises tomorrow and misses it has done more damage
 * than a shop that said it was busy. The apology is not a formality either —
 * somebody without their television is genuinely inconvenienced, and saying so
 * costs nothing and settles most of the call before it happens.
 */
export function customerStatusMessage(
    status: string | null | undefined,
    delayReason?: string | null,
): string {
    // A named reason always beats a generic one — it is the truth from the bench.
    const named = delayReasonForCustomer(delayReason);
    if (named) return named;

    switch (String(status || "")) {
        case "Pending":
            return "Your set has reached us safely and is booked in. We have a number of repairs ahead of it just now, and we will start on yours as soon as those are finished. We are sorry for the wait.";
        case "In Progress":
        case "Repairing":
            return "Our technician is working on your set now. We will update this page as soon as there is more to tell you.";
        case "Waiting for Parts":
            return "We are waiting for a part to arrive for your set. We are sorry this is taking longer than usual, and we will begin as soon as it reaches us.";
        case "Testing":
            return "The repair is done and your set is being tested to make sure it is working properly before it goes back to you.";
        case "Ready":
            return "Your set is repaired and ready for collection. Please come by whenever it suits you.";
        case "Completed":
            return "Your repair is complete. Thank you for trusting us with your set.";
        case "Delivered":
            return "Your set has been handed back. Thank you — please call us if anything at all is not right.";
        default:
            return "Your set is with us and we are looking after it. We will update this page as the repair moves along.";
    }
}

/**
 * How a date is said to a customer.
 *
 * Always "expected", never a promise. The shop can revise an estimate; it
 * cannot revise a guarantee without breaking its word, and a customer told
 * "tomorrow" who does not get it tomorrow remembers that far longer than one
 * who was told it was expected and took two days.
 */
export function expectedReadyMessage(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    const d = new Date(date as any);
    if (Number.isNaN(d.getTime())) return null;

    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);

    if (days < 0) return "We had expected to be finished by now, and we are sorry it has taken longer. We are still working on it.";
    if (days === 0) return "Expected to be ready today.";
    if (days === 1) return "Expected to be ready tomorrow.";
    return `Expected to be ready in about ${days} days.`;
}
