/**
 * Placeholder password for customer accounts that have never had one set.
 *
 * Anonymous repair intake creates an "unclaimed" customer row so the request has
 * an owner to link to. `users.password` is NOT NULL (shared/schema.ts:48), so
 * something has to go in the column. That used to be
 * `await bcrypt.hash(nanoid(), 12)` — a random value, hashed at cost 12, then
 * discarded. Nothing could ever verify against it, so the work was pure waste:
 * roughly two seconds of the customer's time, spent inside the intake
 * transaction while holding both a pool connection (there are five) and a
 * Postgres advisory lock on the phone number.
 *
 * The sentinel is deliberately NOT a bcrypt hash. `bcryptjs.compare` returns
 * false for any string it cannot parse as a hash — verified, it does not throw —
 * so this value can never authenticate even if a future code path reaches a
 * comparison with it.
 *
 * It is not a secret. It is a marker meaning "this account has no customer
 * password yet". Activation happens only through the staff-issued one-time link.
 */
export const NO_CUSTOMER_PASSWORD = "!no-customer-password!";

/**
 * A fixed, real bcrypt hash used solely to burn the same CPU time a genuine
 * password check would.
 *
 * Rejecting an account before `bcrypt.compare` runs makes the response ~12,000x
 * faster than a wrong-password rejection (measured: 0.02ms vs 273ms). That gap
 * is a timing oracle: anyone could submit phone numbers, time the 401, and learn
 * which ones belong to accounts here. Comparing against this hash instead keeps
 * the rejection indistinguishable from a wrong password.
 *
 * Generated once from a random value that was never recorded. Nothing
 * authenticates against it and it is never compared to a real user's hash.
 */
export const TIMING_EQUALISER_HASH =
    "$2b$12$C6UzMDM.H6dfI/f/IKcEe.QpqYkq5vJ0mFrPQ9m2LrJZQ8m1qKq3S";

/** True when the stored value is the "never had a password" marker. */
export function isPlaceholderPassword(stored: string | null | undefined): boolean {
    return stored === NO_CUSTOMER_PASSWORD;
}
