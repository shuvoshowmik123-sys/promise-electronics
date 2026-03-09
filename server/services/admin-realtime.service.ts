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
