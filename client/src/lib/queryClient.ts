import { QueryClient, QueryFunction, QueryCache } from "@tanstack/react-query";
import { handleCorporateError } from "./corporateApiErrorHandler";
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

function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (csrfToken) headers["X-XSRF-TOKEN"] = csrfToken;

  const res = await fetch(url, {
    method,
    headers,
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
      // Stale-while-revalidate: with the persisted cache restored on load, this
      // paints tabs instantly from cache AND refetches fresh data on mount in the
      // background (React Query keeps showing cached data while refetching). This
      // is what makes the admin panel feel snappy without serving stale numbers.
      refetchOnMount: "always",
      retry: false,
      // Enable garbage collection time for persistence
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
    mutations: {
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error: any, query) => {
      // Global error handler for corporate queries
      if ((query as any).meta?.scope === 'corporate') {
        handleCorporateError(error, "Data Sync");
      }

      // Global 401 Unauthorized handler for admin requests
      // Auth redirects are handled by AdminRouter — do NOT use
      // window.location.href here as it causes full-page reload loops.
    }
  })
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

// Wrap async storage for sync persister.
//
// On WEB, localStorage is already synchronous — so we read/write it directly.
// The persister restores the cache *synchronously* on first paint, and the
// previous shim returned null on that first call (only priming an async _cache
// afterwards), which silently disabled cache restore on web: every reload
// refetched everything. Reading localStorage directly fixes instant-paint.
//
// On NATIVE (Capacitor Preferences is async), we keep the warm-cache approach:
// serve from _cache if present, otherwise prime it asynchronously.
const syncStorage = {
  getItem: (key: string) => {
    if (!Capacitor.isNativePlatform()) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    const cached = (syncStorage as any)._cache?.[key];
    if (cached !== undefined) return cached;
    storage.getItem(key).then((value) => {
      (syncStorage as any)._cache = (syncStorage as any)._cache || {};
      (syncStorage as any)._cache[key] = value;
    });
    return null;
  },
  setItem: (key: string, value: string) => {
    if (!Capacitor.isNativePlatform()) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* quota / private mode — ignore */
      }
      return;
    }
    (syncStorage as any)._cache = (syncStorage as any)._cache || {};
    (syncStorage as any)._cache[key] = value;
    storage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (!Capacitor.isNativePlatform()) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return;
    }
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
    buster: "promise-rq-success-only-v1",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    dehydrateOptions: {
      // Only persist queries that should be available offline
      shouldDehydrateQuery: (query) => {
        if (query.state.status !== "success" || query.state.data === undefined) {
          return false;
        }

        const key = query.queryKey[0];
        // Persist user profile, service requests, orders, warranties, notifications
        const persistedQueries = [
          '/customer/me',
          '/customer/service-requests',
          '/customer/orders',
          '/customer/warranties',
          '/notifications',
          '/customer/addresses',
          // Admin offline-critical / instant-paint queries.
          // NOTE: these must match the ACTUAL queryKey[0] used by the tabs
          // (verified against the codebase) — not the REST URL. A mismatch here
          // is why the admin panel previously persisted almost nothing.
          '/api/modules',
          'dashboardStats',   // Dashboard KPIs
          'jobOverview',      // Dashboard job overview
          'jobTickets',       // Jobs tab
          'serviceRequests',  // Service Requests tab
          'service-requests',
          'customers',        // Customers tab
          'admin-customers',
          'inventory',        // Stock / Inventory tab
          'sales-summary-global',
          'petty-cash-summary-global',
          'due-summary-global',
          'refunds',
          'manual-payments',
          'activeDrawer',
          'inquiries',        // Inquiries tab
          'adminPickups',     // Pickup & Delivery tab
          'quotations',
          'challans',
          'corporate-clients',
          'admin-users',
          'admin-orders',
          'settings',
        ];
        return typeof key === 'string' && persistedQueries.some(q => key.includes(q));
      },
    },
  });

}
