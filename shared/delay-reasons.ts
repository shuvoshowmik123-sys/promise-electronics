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
    { id: "waiting_parts", label: "Waiting for parts", customerSafe: "We are waiting for a part to arrive." },
    { id: "waiting_customer", label: "Waiting for customer approval", customerSafe: "We are waiting for your approval to continue." },
    { id: "second_opinion", label: "Needs a second opinion", customerSafe: "Our senior technician is reviewing it." },
    { id: "on_order", label: "Panel/board on order", customerSafe: "The part has been ordered for your set." },
    { id: "busy_other", label: "Busy with other jobs", customerSafe: "Your set is in the queue and will be looked at shortly." },
    { id: "nearly_done", label: "Nearly done", customerSafe: "Your repair is almost finished." },
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
