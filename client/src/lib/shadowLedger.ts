import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface ShadowLedgerEntry {
    id: string;
    type: string;
    endpoint: string;
    method: "POST" | "PUT" | "PATCH" | "DELETE";
    payload: any;
    createdAt: string;
    syncStatus: "pending" | "syncing" | "synced" | "conflict" | "failed";
    retryCount: number;
    deviceId: string;
}

interface OfflineDB extends DBSchema {
    transactions: {
        key: string;
        value: ShadowLedgerEntry;
        indexes: {
            'syncStatus': string;
            'createdAt': string;
        };
    };
}

class ShadowLedger {
    private dbPromise: Promise<IDBPDatabase<OfflineDB>>;

    constructor() {
        this.dbPromise = openDB<OfflineDB>('promise-offline-db', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('transactions')) {
                    const store = db.createObjectStore('transactions', { keyPath: 'id' });
                    store.createIndex('syncStatus', 'syncStatus');
                    store.createIndex('createdAt', 'createdAt');
                }
            },
        });
    }

    // Getter for internal direct DB access if needed (like reading conflicts)
    get _dbPromise() {
        return this.dbPromise;
    }

    async enqueue(entry: ShadowLedgerEntry): Promise<void> {
        const db = await this.dbPromise;
        await db.put('transactions', entry);
    }

    async getPending(): Promise<ShadowLedgerEntry[]> {
        const db = await this.dbPromise;
        const all = await db.getAllFromIndex('transactions', 'syncStatus', 'pending');
        // Sort oldest first
        return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    async dequeueAll(): Promise<ShadowLedgerEntry[]> {
        return this.getPending();
    }

    async markStatus(id: string, status: ShadowLedgerEntry['syncStatus']): Promise<void> {
        const db = await this.dbPromise;
        const entry = await db.get('transactions', id);
        if (!entry) return;

        entry.syncStatus = status;
        await db.put('transactions', entry);
    }

    async markConflict(id: string, reason: string): Promise<void> {
        const db = await this.dbPromise;
        const entry = await db.get('transactions', id);
        if (!entry) return;

        entry.syncStatus = "conflict";
        (entry as any).payload = {
            ...entry.payload,
            _conflictReason: reason
        };
        await db.put('transactions', entry);
    }

    async clearSynced(): Promise<void> {
        const db = await this.dbPromise;
        const synced = await db.getAllFromIndex('transactions', 'syncStatus', 'synced');

        const tx = db.transaction('transactions', 'readwrite');
        for (const entry of synced) {
            // Option to keep for 24h, but for MVP let's just delete
            tx.store.delete(entry.id);
        }
        await tx.done;
    }
}

export const shadowLedger = new ShadowLedger();
