import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/config";

export function useRemindersSSE() {
    const queryClient = useQueryClient();

    useEffect(() => {
        let eventSource: EventSource | null = null;

        const connect = () => {
            if (document.hidden || eventSource) return;
            eventSource = new EventSource(getApiUrl("/api/reminders/events"), { withCredentials: true });
            eventSource.addEventListener("reminder.changed", () => {
                queryClient.invalidateQueries({ queryKey: ["reminders"] });
            });
        };

        const disconnect = () => {
            eventSource?.close();
            eventSource = null;
        };

        const handleVisibility = () => {
            if (document.hidden) {
                disconnect();
            } else {
                connect();
                queryClient.invalidateQueries({ queryKey: ["reminders"] });
            }
        };

        connect();
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibility);
            disconnect();
        };
    }, [queryClient]);
}
