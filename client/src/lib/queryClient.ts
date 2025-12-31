import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { API_BASE_URL } from "./config";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const path = queryKey.join("/");
      const url = path.startsWith("http") ? path : `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
      const res = await fetch(url, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
      // Enable garbage collection time for persistence
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Offline Persistence Configuration
 * 
 * Uses Capacitor Preferences on native, localStorage on web.
 * Caches critical data for offline access.
 */

// Storage adapter that works on both web and native
const STORAGE_KEY = 'REACT_QUERY_OFFLINE_CACHE';

const createCapacitorStorage = () => ({
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { value } = await Preferences.get({ key });
        return value;
      }
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('[Persistence] getItem failed:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({ key, value });
      } else {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.warn('[Persistence] setItem failed:', error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Preferences.remove({ key });
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('[Persistence] removeItem failed:', error);
    }
  },
});

// Create persister with our storage adapter
const storage = createCapacitorStorage();

// Wrap async storage for sync persister
const syncStorage = {
  getItem: (key: string) => {
    // For initial sync load, we use a promise that resolves synchronously via cache
    const cached = (syncStorage as any)._cache?.[key];
    if (cached !== undefined) return cached;

    // Async load for initial hydration
    storage.getItem(key).then((value) => {
      (syncStorage as any)._cache = (syncStorage as any)._cache || {};
      (syncStorage as any)._cache[key] = value;
    });

    return null;
  },
  setItem: (key: string, value: string) => {
    (syncStorage as any)._cache = (syncStorage as any)._cache || {};
    (syncStorage as any)._cache[key] = value;
    storage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if ((syncStorage as any)._cache) {
      delete (syncStorage as any)._cache[key];
    }
    storage.removeItem(key);
  },
};

const persister = createSyncStoragePersister({
  storage: syncStorage,
  key: STORAGE_KEY,
  throttleTime: 1000, // Save at most once per second
});

// Initialize persistence
export function initQueryPersistence() {
  persistQueryClient({
    queryClient,
    persister,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    dehydrateOptions: {
      // Only persist queries that should be available offline
      shouldDehydrateQuery: (query) => {
        const key = query.queryKey[0];
        // Persist user profile, service requests, orders, warranties, notifications
        const persistedQueries = [
          '/customer/me',
          '/customer/service-requests',
          '/customer/orders',
          '/customer/warranties',
          '/notifications',
          '/customer/addresses',
        ];
        return typeof key === 'string' && persistedQueries.some(q => key.includes(q));
      },
    },
  });

  console.log('[Persistence] Query persistence initialized');
}
