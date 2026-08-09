/**
 * Live repair updates for a signed-in customer.
 *
 * The server has had /api/customer/events since before this hook existed, with
 * heartbeats and cleanup, and nothing on the client ever connected to it. So a
 * customer watching their repair page saw whatever was true when they opened
 * it, and nothing after — the tracker looked broken precisely when something
 * was happening.
 *
 * This does not render anything or hold its own copy of the repair. It marks
 * the react-query caches stale so the page refetches through the same code
 * path a reload uses. An event is a hint that something changed, never the
 * data itself: trusting a socket payload as state is how two tabs end up
 * disagreeing about the same repair.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

type CustomerEvent = {
    type?: string;
    jobId?: string;
    status?: string;
    previousStatus?: string;
};

export function useCustomerSSE(onEvent?: (event: CustomerEvent) => void) {
    const { isAuthenticated } = useCustomerAuth();
    const queryClient = useQueryClient();
    const sourceRef = useRef<EventSource | null>(null);
    /** Kept in a ref so a caller passing an inline function cannot reconnect us on every render. */
    const handlerRef = useRef(onEvent);
    handlerRef.current = onEvent;

    useEffect(() => {
        // The endpoint requires a customer session; connecting without one just
        // earns a 401 and a reconnect loop.
        if (!isAuthenticated) return;

        let cancelled = false;
        let retry: ReturnType<typeof setTimeout> | null = null;
        let attempt = 0;

        const connect = () => {
            if (cancelled) return;
            let es: EventSource;
            try {
                es = new EventSource("/api/customer/events", { withCredentials: true });
            } catch {
                return; // no EventSource support; the page still works by refetching normally
            }
            sourceRef.current = es;

            es.onopen = () => { attempt = 0; };

            es.onmessage = (message) => {
                let data: CustomerEvent;
                try {
                    data = JSON.parse(message.data);
                } catch {
                    return; // heartbeats and anything unparseable are not events
                }
                if (data.type === "connected") return;

                /**
                 * Refetch rather than patch. The journey detail is assembled
                 * server-side from several tables, and reconstructing it from a
                 * status string would drift from what a reload shows.
                 */
                queryClient.invalidateQueries({ queryKey: ["customerRepairJourney"] });
                queryClient.invalidateQueries({ queryKey: ["customerRepairJourneys"] });
                queryClient.invalidateQueries({ queryKey: ["customer-notifications"] });
                handlerRef.current?.(data);
            };

            es.onerror = () => {
                es.close();
                sourceRef.current = null;
                if (cancelled) return;
                // Back off rather than hammer: a sleeping free-tier backend
                // would otherwise get a reconnect every second from every tab.
                attempt += 1;
                const wait = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
                retry = setTimeout(connect, wait);
            };
        };

        connect();

        return () => {
            cancelled = true;
            if (retry) clearTimeout(retry);
            sourceRef.current?.close();
            sourceRef.current = null;
        };
    }, [isAuthenticated, queryClient]);
}
