import type { AdminRealtimeQueryTag } from "@shared/types/admin-realtime";

/**
 * Translate legacy SSE payloads into query tags.
 *
 * Seventeen event types are published through notifyAdminUpdate as
 * `{ type, data, createdAt }`. They reach the browser, get parsed — and are
 * then dropped on the floor: AdminSSEContext's handler ends after the
 * isAdminRealtimeEvent branch with no fallback, and that guard requires
 * `channel: "admin"` plus an `invalidate` array, which these payloads never
 * have. The plumbing looked wired up and delivered nothing, which is why saving
 * an order or accepting a quote still needed a manual refresh.
 *
 * Fixing it here rather than at each publisher is deliberate:
 *
 *   - one file instead of edits across nine route files, so there is one place
 *     to read and one place to get wrong
 *   - zero server changes, so it ships without a backend deploy
 *   - the old publishers keep working untouched, so nothing regresses while
 *     routes are migrated to the structured format at whatever pace suits
 *
 * This is a bridge, not the destination. As each publisher moves to
 * publishAdminEvent with its own permission scope, delete its row here. An
 * empty map means the migration is finished.
 *
 * NOTE ON SCOPE: legacy events carry no permission filter, so the server sends
 * them to every connected admin (sse-broker returns true when `permissions` is
 * absent). This bridge does not widen that — it only makes the client act on
 * what it already receives. The refetch it triggers still goes through the
 * normal authorised endpoint, so a user cannot see data they could not already
 * request. Narrowing the audience is part of migrating each publisher, and is
 * the main reason to finish that migration.
 */

export interface LegacySseEvent {
    type: string;
    data?: unknown;
    createdAt?: string;
}

/**
 * Legacy type -> the queries it should refresh.
 *
 * Tags are deliberately narrow. `dashboardStats` is included only where a
 * counter genuinely moves, because it is mounted for most admins at once and a
 * broad tag turns one mutation into a refetch on every open screen.
 */
const LEGACY_EVENT_TAGS: Record<string, AdminRealtimeQueryTag[]> = {
    // ── Orders ──
    order_created: ["orders", "dashboardStats"],
    order_updated: ["orders"],
    order_accepted: ["orders"],
    order_declined: ["orders"],

    // ── Quotes ──
    quote_request_created: ["quotations", "inquiries", "dashboardStats"],
    quote_accepted: ["quotations", "serviceRequests"],
    quote_declined: ["quotations", "serviceRequests"],
    quote_converted: ["quotations", "jobTickets", "serviceRequests"],

    // ── Pickup / logistics ──
    pickup_created: ["logisticsTasks", "adminPickups", "serviceRequests"],
    pickup_updated: ["logisticsTasks", "adminPickups"],
    cod_collected: ["logisticsTasks", "adminPickups", "financeSummaries", "dueRecords"],

    // ── Customers ──
    customer_created: ["customers", "dashboardStats"],
    customer_payment_submitted: ["dueRecords", "financeSummaries", "customers"],
    account_recovery_request: ["inquiries", "customers"],

    // ── Corporate ──
    corporate_message: ["corporateThreads", "corporateThreadDetails"],
    corporate_notification: ["corporateThreads"],
};

/**
 * True for a legacy payload this bridge knows how to translate.
 *
 * Structured events are matched by isAdminRealtimeEvent before this runs, so a
 * payload reaching here with an `invalidate` array is already handled and must
 * not be translated twice.
 */
export function isLegacySseEvent(value: unknown): value is LegacySseEvent {
    if (value == null || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.type !== "string") return false;
    if (Array.isArray(candidate.invalidate)) return false;
    return candidate.type in LEGACY_EVENT_TAGS;
}

/** Tags for a legacy event, or an empty array when it is not one we translate. */
export function tagsForLegacyEvent(event: LegacySseEvent): AdminRealtimeQueryTag[] {
    return LEGACY_EVENT_TAGS[event.type] ?? [];
}

/** Exposed for tests and for tracking migration progress. */
export const LEGACY_EVENT_TYPES = Object.keys(LEGACY_EVENT_TAGS);
