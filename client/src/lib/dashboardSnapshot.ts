const SNAPSHOT_KEY = "adminDashboardSnapshot";
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export function saveDashboardSnapshot(data: any) {
    try {
        if (!data) return;

        // Deep clone to safely delete financial fields
        const safeData = structuredClone(data);

        // Exclude all financial data before saving to localStorage
        // This prevents flashes of unauthorized data if permissions change
        delete safeData.totalRevenue;
        delete safeData.posRevenueThisMonth;
        delete safeData.corporateRevenueThisMonth;
        delete safeData.totalWastageLoss;
        delete safeData.revenueData;

        const payload = {
            data: safeData,
            fetchedAt: Date.now(),
            version: 1
        };

        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn("Failed to save dashboard snapshot:", e);
    }
}

export function getDashboardSnapshot(): any | undefined {
    try {
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        if (!raw) return undefined;

        const payload = JSON.parse(raw);
        if (payload.version !== 1) {
            localStorage.removeItem(SNAPSHOT_KEY);
            return undefined;
        }

        // Check TTL
        if (Date.now() - payload.fetchedAt > MAX_AGE_MS) {
            localStorage.removeItem(SNAPSHOT_KEY);
            return undefined;
        }

        return payload.data;
    } catch (e) {
        console.warn("Failed to read dashboard snapshot:", e);
        return undefined;
    }
}
