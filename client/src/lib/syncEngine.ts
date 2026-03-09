import { shadowLedger } from "./shadowLedger";
import { apiRequest, queryClient } from "./queryClient";

interface SyncResult {
    synced: number;
    conflicts: number;
    failed: number;
}

class SyncEngine {
    private isSyncing = false;

    async syncAll(): Promise<SyncResult> {
        if (this.isSyncing) return { synced: 0, conflicts: 0, failed: 0 };
        this.isSyncing = true;

        const results: SyncResult = { synced: 0, conflicts: 0, failed: 0 };
        try {
            const entries = await shadowLedger.dequeueAll();
            if (entries.length === 0) return results;

            console.log(`[SyncEngine] Batch processing ${entries.length} pending mutations...`);

            for (const entry of entries) {
                await shadowLedger.markStatus(entry.id, "syncing");
            }

            // Send to centralized batch endpoint
            try {
                const res = await apiRequest("POST", "/api/offline/sync", { entries });
                const data = await res.json();

                for (const result of data.results) {
                    if (result.status === "synced") {
                        await shadowLedger.markStatus(result.id, "synced");
                        results.synced++;
                    } else if (result.status === "conflict") {
                        await shadowLedger.markConflict(result.id, result.reason || "Server reported conflict");
                        results.conflicts++;
                    } else {
                        await shadowLedger.markStatus(result.id, "failed");
                        results.failed++;
                    }
                }
            } catch (err) {
                console.error("[SyncEngine] Batch sync request completely failed", err);
                for (const entry of entries) {
                    // Revert back to pending for next network attempt natively
                    await shadowLedger.markStatus(entry.id, "pending");
                }
            }

            await shadowLedger.clearSynced();

            // Invalidate all queries to refresh UI securely
            queryClient.invalidateQueries({ queryKey: ["/api"] });

        } finally {
            this.isSyncing = false;
        }
        return results;
    }
}

export const syncEngine = new SyncEngine();
