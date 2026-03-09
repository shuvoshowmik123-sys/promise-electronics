/**
 * Standard React Query presets for admin queries to unify stale handling and cache rules.
 */
export const AdminQueryProfiles = {
    /**
     * For the hottest operational data (e.g. active Jobs, Service Requests).
     * Refetches quickly if stale; depends on SSE for triggers.
     */
    operational: {
        staleTime: 5_000, // 5 seconds
        refetchOnMount: "always" as const,
        refetchOnReconnect: true
    },

    /**
     * For aggregate or summary widgets. Slows down automatic fetching slightly.
     */
    summary: {
        staleTime: 10_000, // 10 seconds
        refetchOnMount: "always" as const,
        refetchOnReconnect: true
    },

    /**
     * For metrics, historical ranges, and heavy reports that change slowly.
     */
    historical: {
        staleTime: 300_000,  // 5 minutes
        refetchOnMount: false as const
    },

    /**
     * For never-changing data configurations (until an explicit mutation happens).
     */
    static: {
        staleTime: Infinity
    },
} as const;
