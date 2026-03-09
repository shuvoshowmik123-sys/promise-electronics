import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "./AdminAuthContext";
import { toast } from "sonner";
import { playNotificationSound, type NotificationTone } from "@/lib/notification-sound";
import { settingsApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { invalidateActiveRealtimeQueries, isAdminRealtimeEvent } from "@/lib/admin-realtime";
import type { AdminRealtimeQueryTag } from "@shared/types/admin-realtime";

interface AdminSSEContextType {
    sseSupported: boolean;
    lastEvent: any | null;
}

const AdminSSEContext = createContext<AdminSSEContextType | undefined>(undefined);

export function AdminSSEProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated, status, refreshUser, logout } = useAdminAuth();
    const queryClient = useQueryClient();
    const [sseSupported, setSseSupported] = useState(false);
    const [lastEvent, setLastEvent] = useState<any | null>(null);

    const { data: settings = [] } = useQuery({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        enabled: isAuthenticated, // Defer fetching until authenticated
    });

    const notificationTone = (settings.find(s => s.key === "notification_tone")?.value as NotificationTone) || "default";

    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptRef = useRef(0);
    const processedEventIdsRef = useRef<string[]>([]);
    const processedEventIdSetRef = useRef(new Set<string>());

    const pendingSummaryInvalidationsRef = useRef<Set<string>>(new Set());
    const summaryDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const scheduleSummaryFlush = (delay = 800) => {
        if (summaryDebounceTimeoutRef.current) {
            clearTimeout(summaryDebounceTimeoutRef.current);
        }
        summaryDebounceTimeoutRef.current = setTimeout(() => {
            if (pendingSummaryInvalidationsRef.current.size > 0 && !document.hidden) {
                const tagsToInvalidate = Array.from(pendingSummaryInvalidationsRef.current) as AdminRealtimeQueryTag[];
                invalidateActiveRealtimeQueries(queryClient, tagsToInvalidate);
                pendingSummaryInvalidationsRef.current.clear();
            }
            summaryDebounceTimeoutRef.current = null;
        }, delay);
    };

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                if (summaryDebounceTimeoutRef.current) {
                    clearTimeout(summaryDebounceTimeoutRef.current);
                    summaryDebounceTimeoutRef.current = null;
                }
            } else {
                if (pendingSummaryInvalidationsRef.current.size > 0) {
                    scheduleSummaryFlush(100);
                }
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [queryClient]);


    useEffect(() => {
        let mounted = true;

        const rememberEventId = (eventId: string) => {
            if (processedEventIdSetRef.current.has(eventId)) {
                return false;
            }

            processedEventIdSetRef.current.add(eventId);
            processedEventIdsRef.current.push(eventId);

            if (processedEventIdsRef.current.length > 100) {
                const expired = processedEventIdsRef.current.shift();
                if (expired) {
                    processedEventIdSetRef.current.delete(expired);
                }
            }

            return true;
        };

        const getReconnectDelay = () => {
            const delays = [2000, 5000, 10000, 20000, 30000];
            return delays[Math.min(reconnectAttemptRef.current, delays.length - 1)];
        };

        const scheduleReconnect = () => {
            if (!mounted || reconnectTimeoutRef.current) return;

            const delay = getReconnectDelay();
            reconnectTimeoutRef.current = setTimeout(() => {
                reconnectTimeoutRef.current = null;
                reconnectAttemptRef.current += 1;
                connectSSE();
            }, delay);
        };

        const connectSSE = () => {
            if (!isAuthenticated || !mounted) return;

            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }

            try {
                const eventSource = new EventSource("/api/admin/events", { withCredentials: true });
                eventSourceRef.current = eventSource;

                eventSource.onopen = () => {
                    if (mounted) {
                        reconnectAttemptRef.current = 0;
                        setSseSupported(true);
                        console.log("SSE Connected");
                    }
                };

                eventSource.onmessage = async (event) => {
                    try {
                        const data = JSON.parse(event.data);

                        if (data.type === "connected") return;

                        setLastEvent(data);

                        if (data.type === "force_refresh_user") {
                            await refreshUser();
                            toast.info("Your permissions have been updated.");
                        }
                        else if (data.type === "force_logout") {
                            await logout();
                            toast.error(data.reason || "Your session has been terminated.");
                        }
                        else if (data.type === "smart_sync_needed") {
                            const jobId = data.jobId;
                            const jobDisplayId = data.jobDisplayId;
                            const newStatus = data.newStatus;

                            const getCsrfToken = () => {
                                if (typeof document === 'undefined') return undefined;
                                const match = document.cookie.match(new RegExp('(^| )XSRF-TOKEN=([^;]+)'));
                                return match ? match[2] : undefined;
                            };

                            toast.info(`Smart Sync Suggested`, {
                                description: `Job #${jobDisplayId} advanced to ${newStatus}. Sync with public Service Request?`,
                                duration: 15000,
                                cancel: { label: "Ignore", onClick: () => { } },
                                action: {
                                    label: "Sync Status",
                                    onClick: () => {
                                        const csrfToken = getCsrfToken();
                                        fetch(`/api/admin/service-requests/sync-job/${jobId}`, {
                                            method: "POST",
                                            credentials: "include",
                                            headers: {
                                                "Content-Type": "application/json",
                                                ...(csrfToken ? { "X-XSRF-TOKEN": csrfToken } : {})
                                            }
                                        })
                                            .then(res => {
                                                if (res.ok) toast.success(`Successfully synced Job #${jobDisplayId} to public Service Request!`);
                                                else toast.error("Found no linked service request to sync. Either this is a Walk-In job or the sync failed.");
                                            });
                                    }
                                }
                            });
                        }
                        else if (isAdminRealtimeEvent(data)) {
                            if (!rememberEventId(data.id)) {
                                return;
                            }

                            if (data.priority === "summary") {
                                data.invalidate.forEach((tag: string) => pendingSummaryInvalidationsRef.current.add(tag));
                                if (!document.hidden) {
                                    scheduleSummaryFlush(800);
                                }
                            } else {
                                invalidateActiveRealtimeQueries(queryClient, data.invalidate);
                            }

                            if (data.toast) {
                                if (data.toast.sound) {
                                    playNotificationSound(notificationTone);
                                }

                                const description = data.toast.message || undefined;
                                if (data.toast.level === "warning") {
                                    toast.warning(data.toast.title, description ? { description } : undefined);
                                } else if (data.toast.level === "success") {
                                    toast.success(data.toast.title, description ? { description } : undefined);
                                } else {
                                    toast.info(data.toast.title, description ? { description } : undefined);
                                }
                            }
                        }

                    } catch (e) {
                        console.error("SSE message parse error:", e);
                    }
                };

                eventSource.onerror = () => {
                    eventSource.close();
                    eventSourceRef.current = null;

                    if (mounted) {
                        setSseSupported(false);
                        console.log("SSE error, attempting reconnect...");
                        scheduleReconnect();
                    }
                };
            } catch (e) {
                console.error("Failed to create EventSource:", e);
                setSseSupported(false);
                scheduleReconnect();
            }
        };

        let initialConnectTimeout: NodeJS.Timeout | null = null;

        if (isAuthenticated) {
            // Defer connection to yield to the main thread after first paint
            initialConnectTimeout = setTimeout(() => {
                connectSSE();
            }, 0);
        } else {
            setSseSupported(false);
            reconnectAttemptRef.current = 0;
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        }

        return () => {
            mounted = false;
            if (initialConnectTimeout) clearTimeout(initialConnectTimeout);
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
    }, [isAuthenticated, queryClient]);

    return (
        <AdminSSEContext.Provider value={{ sseSupported, lastEvent }}>
            {children}
        </AdminSSEContext.Provider>
    );
}

export function useAdminSSE() {
    const context = useContext(AdminSSEContext);
    if (!context) {
        throw new Error("useAdminSSE must be used within an AdminSSEProvider");
    }
    return context;
}
