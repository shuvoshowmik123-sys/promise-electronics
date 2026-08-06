import { randomUUID } from "crypto";
import type {
  AdminRealtimeAction,
  AdminRealtimeEvent,
  AdminRealtimePayload,
  AdminRealtimeQueryTag,
  AdminRealtimeToast,
  AdminRealtimeTopic,
} from "../../shared/types/admin-realtime.js";
import { broadcastAdminEvent } from "../routes/middleware/sse-broker.js";

type AdminRealtimeEventInput = Omit<AdminRealtimeEvent, "id" | "channel" | "occurredAt"> & {
  id?: string;
  occurredAt?: string;
};

type ScopedAdminRealtimeInput = {
  action: AdminRealtimeAction;
  entityId?: string;
  invalidate: AdminRealtimeQueryTag[];
  permissions?: string[];
  toast?: AdminRealtimeToast;
  payload?: AdminRealtimePayload;
};

export function publishAdminEvent(event: AdminRealtimeEventInput): void {
  const normalized: AdminRealtimeEvent = {
    ...event,
    id: event.id || randomUUID(),
    channel: "admin",
    occurredAt: event.occurredAt || new Date().toISOString(),
  };

  broadcastAdminEvent(normalized);
}

function publishScopedAdminEvent(topic: AdminRealtimeTopic, event: ScopedAdminRealtimeInput): void {
  publishAdminEvent({
    topic,
    ...event,
  });
}

export function publishJobTicketEvent(event: ScopedAdminRealtimeInput): void {
  publishScopedAdminEvent("job_ticket", event);
}

export function publishServiceRequestEvent(event: ScopedAdminRealtimeInput): void {
  publishScopedAdminEvent("service_request", event);
}

export function publishAdminNotificationEvent(event: ScopedAdminRealtimeInput): void {
  publishScopedAdminEvent("notification", event);
}

/**
 * Pickup / delivery board.
 *
 * Logistics-task mutations published nothing at all, so the receive and
 * delivery tabs only updated on a manual refresh — a driver marking a
 * collection done left dispatch looking at stale rows.
 *
 * Defaults to the pickup permission family so the event reaches dispatch and
 * drivers rather than every connected admin. Callers may still pass their own
 * `permissions` to narrow it further.
 */
export const PICKUP_REALTIME_PERMISSIONS = [
  "pickup.viewAll",
  "pickup.viewAssigned",
  "pickup.assignDriver",
  "pickup.confirmHandover",
  "pickup.reschedule",
  "pickup.cancel",
  "pickup.routePlan",
];

export function publishPickupEvent(event: ScopedAdminRealtimeInput): void {
  publishScopedAdminEvent("pickup", {
    permissions: PICKUP_REALTIME_PERMISSIONS,
    ...event,
  });
}
