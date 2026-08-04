/**
 * Decide whether an open request drawer should adopt a refreshed row.
 *
 * The drawer holds a snapshot of the row taken when it was clicked, so
 * refreshing the list behind it left the drawer showing stale data — a
 * successful transfer to Pickup & Delivery still displayed "Intake" and still
 * offered the transfer button, and a second click reported "Already in Pickup &
 * Delivery".
 *
 * The first attempt at syncing it crashed every drawer with React #185
 * (maximum update depth exceeded). Two causes, and this function exists so the
 * second one is testable:
 *
 *   1. The effect listed the drawer's own state as a dependency while setting
 *      it. Fixed at the call site by using a functional update and depending
 *      only on the list.
 *
 *   2. These fields arrive as `null` from the list endpoint and `undefined`
 *      from some card sources. Compared with `!==`, `null !== undefined` is
 *      true forever, so "has it changed?" answered yes on every render no
 *      matter what. That is the bug this module pins down.
 */

/** Only the fields the drawer's actions branch on. */
export type DrawerSyncFields = {
    stage?: string | null;
    status?: string | null;
    trackingStatus?: string | null;
    convertedJobId?: string | null;
};

/** True when null and undefined should be treated as the same absent value. */
function sameValue(a: unknown, b: unknown): boolean {
    if (a == null && b == null) return true;
    return a === b;
}

/**
 * True when the refreshed row differs in a way the drawer must react to.
 *
 * Returns false for a row that only differs by object identity, so the caller
 * can keep the current state and let React skip the re-render.
 */
export function shouldAdoptRefreshedRequest(
    current: DrawerSyncFields | null | undefined,
    fresh: DrawerSyncFields | null | undefined,
): boolean {
    if (!current || !fresh) return false;
    return !(
        sameValue(fresh.stage, current.stage) &&
        sameValue(fresh.status, current.status) &&
        sameValue(fresh.trackingStatus, current.trackingStatus) &&
        sameValue(fresh.convertedJobId, current.convertedJobId)
    );
}
