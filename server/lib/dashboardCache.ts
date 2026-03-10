import { getComprehensiveDashboard } from "../repositories/analytics.repository.js";

interface DashboardCacheEntry {
    data: any | null;
    computedAt: number;
    refreshing: boolean;
}

const CACHE_FRESH_MS = 30 * 1000;      // 30 seconds
const CACHE_STALE_MS = 5 * 60 * 1000;  // 5 minutes

let dashboardCache: DashboardCacheEntry = {
    data: null,
    computedAt: 0,
    refreshing: false,
};

export async function getCachedDashboard(): Promise<{
    data: any;
    cacheStatus: "hit" | "stale" | "miss";
}> {
    const now = Date.now();
    const age = now - dashboardCache.computedAt;

    // Cache is missing or too old (> 5 mins) -> Blocking refresh
    if (!dashboardCache.data || age > CACHE_STALE_MS) {
        dashboardCache.refreshing = true;
        try {
            const freshData = await getComprehensiveDashboard();
            dashboardCache.data = freshData;
            dashboardCache.computedAt = Date.now();
            return { data: freshData, cacheStatus: "miss" };
        } finally {
            dashboardCache.refreshing = false;
        }
    }

    // Cache is fresh (< 30s) -> Return immediately
    if (age < CACHE_FRESH_MS) {
        return { data: dashboardCache.data, cacheStatus: "hit" };
    }

    // Cache is stale (between 30s and 5m) -> Return immediately, background refresh
    if (!dashboardCache.refreshing) {
        dashboardCache.refreshing = true;
        // Don't wait for this
        getComprehensiveDashboard()
            .then((freshData) => {
                dashboardCache.data = freshData;
                dashboardCache.computedAt = Date.now();
            })
            .catch((err) => {
                console.error("Background dashboard refresh failed:", err);
            })
            .finally(() => {
                dashboardCache.refreshing = false;
            });
    }

    return { data: dashboardCache.data, cacheStatus: "stale" };
}
