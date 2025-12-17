import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "./AdminAuthContext";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notification-sound";

interface AdminSSEContextType {
    sseSupported: boolean;
    lastEvent: any | null;
}

const AdminSSEContext = createContext<AdminSSEContextType | undefined>(undefined);

export function AdminSSEProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAdminAuth();
    const queryClient = useQueryClient();
    const [sseSupported, setSseSupported] = useState(false);
    const [lastEvent, setLastEvent] = useState<any | null>(null);

    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sseConnectedRef = useRef(false);

    useEffect(() => {
        let mounted = true;
        let connectionTimeout: NodeJS.Timeout | null = null;

        const connectSSE = () => {
            if (!isAuthenticated || !mounted) return;

            // Close existing connection if any
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }

            try {
                const eventSource = new EventSource("/api/admin/events", { withCredentials: true });
                eventSourceRef.current = eventSource;
                sseConnectedRef.current = false;

                // Set connection timeout - if not connected in 5 seconds, fall back to polling
                connectionTimeout = setTimeout(() => {
                    if (!sseConnectedRef.current && mounted) {
                        console.log("SSE connection timeout");
                        eventSource.close();
                        setSseSupported(false);
                    }
                }, 5000);

                eventSource.onopen = () => {
                    if (mounted) {
                        if (connectionTimeout) clearTimeout(connectionTimeout);
                        sseConnectedRef.current = true;
                        setSseSupported(true);
                        console.log("SSE Connected");
                    }
                };

                eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);

                        if (data.type === "connected") return;

                        setLastEvent(data);

                        // Global Query Invalidation Logic
                        if (data.type.startsWith("job_ticket_")) {
                            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
                            queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
                            queryClient.invalidateQueries({ queryKey: ["jobOverview"] });

                            if (data.type === "job_ticket_created") {
                                playNotificationSound();
                                toast.success(`New job ticket: ${data.data.id}`);
                            }
                        }
                        else if (data.type.startsWith("service_request_")) {
                            queryClient.invalidateQueries({ queryKey: ["service-requests"] });
                            queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });

                            if (data.type === "service_request_created") {
                                playNotificationSound();
                                toast.success(`New service request: #${data.data.ticketNumber}`);
                            }
                        }
                        else if (data.type === "customer_created") {
                            queryClient.invalidateQueries({ queryKey: ["adminUsers"] }); // Assuming customers list uses this or similar
                            queryClient.invalidateQueries({ queryKey: ["customers"] });
                            toast.info(`New customer registered: ${data.data.name}`);
                        }

                    } catch (e) {
                        console.error("SSE message parse error:", e);
                    }
                };

                eventSource.onerror = () => {
                    if (connectionTimeout) clearTimeout(connectionTimeout);
                    eventSource.close();
                    sseConnectedRef.current = false;

                    if (mounted) {
                        console.log("SSE error, attempting reconnect in 5s...");
                        setSseSupported(false);
                        // Retry connection after 5 seconds
                        reconnectTimeoutRef.current = setTimeout(connectSSE, 5000);
                    }
                };
            } catch (e) {
                console.error("Failed to create EventSource:", e);
                setSseSupported(false);
            }
        };

        if (isAuthenticated) {
            connectSSE();
        } else {
            setSseSupported(false);
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        }

        return () => {
            mounted = false;
            if (connectionTimeout) clearTimeout(connectionTimeout);
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
