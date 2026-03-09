import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export type TabTier = 'write' | 'read-only' | 'locked';

const TAB_TIERS: Record<string, TabTier> = {
    // Tier 1: Write
    pos: 'write',
    jobs: 'write',
    inventory: 'write',

    // Tier 2: Read-Only 
    dashboard: 'read-only',
    customers: 'read-only',
    pickup: 'read-only',
    overview: 'read-only',
};

interface OfflineContextType {
    isOnline: boolean;
    pendingSyncCount: number;
    lastSyncTime: Date | null;
    offlineSince: Date | null;
    getTabTier: (tabId: string) => TabTier;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
    const { isOnline } = useNetworkStatus();

    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [offlineSince, setOfflineSince] = useState<Date | null>(null);

    useEffect(() => {
        if (!isOnline && !offlineSince) {
            setOfflineSince(new Date());
        } else if (isOnline) {
            setOfflineSince(null);
        }
    }, [isOnline, offlineSince]);

    const getTabTier = (tabId: string): TabTier => {
        return TAB_TIERS[tabId] || 'locked';
    };

    return (
        <OfflineContext.Provider
            value={{
                isOnline,
                pendingSyncCount,
                lastSyncTime,
                offlineSince,
                getTabTier
            }}
        >
            {children}
        </OfflineContext.Provider>
    );
}

export function useOffline() {
    const context = useContext(OfflineContext);
    if (!context) {
        throw new Error('useOffline must be used within an OfflineProvider');
    }
    return context;
}
