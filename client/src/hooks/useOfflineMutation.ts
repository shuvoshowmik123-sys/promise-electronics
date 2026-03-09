import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { shadowLedger, ShadowLedgerEntry } from "@/lib/shadowLedger";
import { useOffline } from "@/contexts/OfflineContext";

interface OfflineMutationOptions {
    type: ShadowLedgerEntry["type"];
    endpoint: string;
    method?: "POST" | "PUT" | "PATCH" | "DELETE";
    onSuccess?: () => void;
    queryKeyToInvalidate?: string[];
    optimisticUpdate?: (queryClient: any) => void;
    mutationFn?: (payload: any) => Promise<any>;
}

export function useOfflineMutation(options: OfflineMutationOptions) {
    const { isOnline } = useOffline();
    const queryClient = useQueryClient();
    const { method = "POST" } = options;

    return useMutation({
        mutationFn: async (payload: any) => {
            if (!isOnline) {
                // Enqueue perfectly matched to shadow ledger.
                const entry: ShadowLedgerEntry = {
                    id: crypto.randomUUID(),
                    type: options.type,
                    endpoint: options.endpoint,
                    method,
                    payload,
                    createdAt: new Date().toISOString(),
                    syncStatus: "pending",
                    retryCount: 0,
                    deviceId: "admin-web", // Should grab from actual context if possible
                };
                await shadowLedger.enqueue(entry);
                console.log(`[OfflineMutation] Enqueued offline action: ${options.type}`);
                return { offline: true, _queuedId: entry.id, ...payload };
            }

            // Online: Execute provided direct mutation or fallback via apiRequest
            if (options.mutationFn) {
                return options.mutationFn(payload);
            }

            const res = await apiRequest(method, options.endpoint, payload);
            return res.json();
        },
        onMutate: () => {
            if (options.optimisticUpdate) {
                options.optimisticUpdate(queryClient);
            }
        },
        onSuccess: () => {
            if (options.queryKeyToInvalidate) {
                queryClient.invalidateQueries({ queryKey: options.queryKeyToInvalidate });
            }
            if (options.onSuccess) {
                options.onSuccess();
            }
        },
    });
}
