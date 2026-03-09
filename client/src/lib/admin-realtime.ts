import type { QueryClient } from "@tanstack/react-query";
import type { AdminRealtimeEvent, AdminRealtimeQueryTag } from "@shared/types/admin-realtime";

export function isAdminRealtimeEvent(value: unknown): value is AdminRealtimeEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as AdminRealtimeEvent;
  return candidate.channel === "admin"
    && typeof candidate.id === "string"
    && typeof candidate.topic === "string"
    && typeof candidate.action === "string"
    && Array.isArray(candidate.invalidate);
}

export function invalidateActiveRealtimeQueries(
  queryClient: QueryClient,
  tags: AdminRealtimeQueryTag[],
): void {
  const activeTags = new Set(tags);
  const queries = queryClient.getQueryCache().findAll();

  for (const query of queries) {
    const rootKey = Array.isArray(query.queryKey) ? query.queryKey[0] : query.queryKey;
    if (typeof rootKey !== "string" || !activeTags.has(rootKey as AdminRealtimeQueryTag)) {
      continue;
    }

    const observerCount =
      typeof (query as any).getObserversCount === "function"
        ? (query as any).getObserversCount()
        : Array.isArray((query as any).observers)
          ? (query as any).observers.length
          : 0;

    if (observerCount > 0) {
      queryClient.invalidateQueries({
        queryKey: query.queryKey,
        exact: true,
        refetchType: "active",
      });
    }
  }
}
