import React, { useEffect } from "react";
import { useOffline } from "@/contexts/OfflineContext";
import { syncEngine } from "@/lib/syncEngine";
import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OfflineBanner() {
    const { isOnline, pendingSyncCount, lastSyncTime, offlineSince } = useOffline();

    // Auto-trigger sync on reconnection if pending items exist
    useEffect(() => {
        if (isOnline && pendingSyncCount > 0) {
            syncEngine.syncAll();
        }
    }, [isOnline, pendingSyncCount]);

    if (isOnline && pendingSyncCount === 0) return null; // Fully synced online state

    return (
        <div className={`w-full text-sm font-medium px-4 py-2 flex items-center justify-between border-b transition-colors shadow-sm 
        ${isOnline
                ? 'bg-blue-500/10 text-blue-700 border-blue-500/20'
                : 'bg-red-500/10 text-red-700 border-red-500/20'}`}>

            <div className="flex items-center gap-3">
                {!isOnline ? (
                    <>
                        <WifiOff className="w-4 h-4 text-red-500 animate-pulse" />
                        <span>
                            <strong>OFFLINE MODE</strong> · {pendingSyncCount} pending syncs
                            {offlineSince && ` · Offline since ${offlineSince.toLocaleTimeString()}`}
                        </span>
                        <span className="text-red-500/70 text-xs hidden sm:inline ml-2">
                            (Changes will sync automatically when internet returns)
                        </span>
                    </>
                ) : (
                    <>
                        <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                        <span>
                            <strong>BACK ONLINE</strong> · Syncing {pendingSyncCount} items...
                        </span>
                    </>
                )}
            </div>

            {isOnline && pendingSyncCount > 0 && (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-blue-500/30 hover:bg-blue-500/20 text-blue-700"
                    onClick={() => syncEngine.syncAll()}
                >
                    Force Sync Now
                </Button>
            )}
        </div>
    );
}
