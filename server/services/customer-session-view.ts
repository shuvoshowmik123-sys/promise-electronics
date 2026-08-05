import type { User } from "../../shared/schema.js";

/**
 * The single shape every customer-session response returns.
 *
 * Four endpoints hand a customer session to the browser — register, phone
 * login, Google login, and GET /api/customer/me — and three of them returned
 * the whole user row minus `password` while the Google route hand-picked five
 * fields: id, name, email, role, profileImageUrl.
 *
 * `phone` was not among them. The client stores whatever it receives, and
 * decides `needsProfileCompletion = !!customer && !customer.phone`, so signing
 * in with Google produced a session that looked like an account with no phone
 * number and demanded the customer "complete" a profile that was already
 * complete in the database. A page refresh called /me, which returned the real
 * row, and the warning vanished — which made it look intermittent rather than
 * structural.
 *
 * Nothing caught it at compile time because the client cast the response with
 * `as CustomerSession`. A cast asserts a shape rather than checking it.
 *
 * Routing every response through one function is what stops this recurring:
 * the shape can now only change in one place, for all four endpoints at once.
 */

/**
 * Columns that must never reach the browser.
 *
 * `password` is the hash. The rest are credential-linkage identifiers: knowing
 * a user's Firebase UID or Google subject is not directly exploitable, but they
 * are authentication material and the customer portal has no use for them.
 */
const NEVER_SERIALIZE = ["password", "firebaseUid", "googleSub"] as const;

export type CustomerSessionView = Omit<User, (typeof NEVER_SERIALIZE)[number]>;

export function toCustomerSessionView(user: User): CustomerSessionView {
    const view = { ...user } as Record<string, unknown>;
    for (const key of NEVER_SERIALIZE) delete view[key];
    return view as CustomerSessionView;
}
