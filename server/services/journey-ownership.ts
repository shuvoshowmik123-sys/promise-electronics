/**
 * Shared journey-ownership rule.
 *
 * A repair journey can carry two independent references — `service_request_id`
 * and `quote_request_id` — and the schema does not stop them pointing at
 * requests owned by different customers. Adopting such a journey from whichever
 * side happened to match would hand one customer another customer's repair
 * history.
 *
 * `orphan-journey-reconcile.service.ts` already refuses that case: it resolves
 * both owners, groups them, and skips any journey with more than one distinct
 * owner (`skippedConflictingOwners`). The login-time linker did not, so the two
 * paths disagreed about the same row. This module holds the rule once.
 *
 * Reconcile keeps its own set-based CTE rather than importing this predicate:
 * it must classify and COUNT every ownerless journey, while the linker only
 * needs to filter for one known customer. Same rule, two shapes — expressed
 * here so a future change has one obvious place to land.
 *
 * HOTFIX-3 note: no current code path writes both references onto one journey
 * (`createJourneyFromQuote` sets only the quote id, `createJourneyFromServiceRequest`
 * only the service-request id, and nothing back-fills the other). This guard is
 * therefore preventative, not a fix for an active leak.
 */

import { sql, type SQL } from "drizzle-orm";

/**
 * Guard for an adoption UPDATE that has aliased `customer_repair_journeys` as `j`.
 *
 * True when no request linked to the journey proves an owner *other than*
 * `customerId`. Combined with the caller's existing positive check ("some
 * linked request is owned by this customer"), the distinct proven-owner set is
 * exactly `{customerId}` — the same condition reconcile expresses as
 * `COUNT(DISTINCT owner_id) = 1`.
 *
 * Requests with a NULL owner prove nothing and never block adoption.
 */
export function noConflictingJourneyOwner(customerId: string): SQL {
    return sql`NOT EXISTS (
        SELECT 1
        FROM service_requests other
        WHERE (other.id = j.service_request_id OR other.id = j.quote_request_id)
          AND other.customer_id IS NOT NULL
          AND other.customer_id <> ${customerId}
    )`;
}
