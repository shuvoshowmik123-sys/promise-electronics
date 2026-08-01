/**
 * CUSTOMER-PORTAL-SCROLL-RESTORATION-01A
 *
 * Pure, DOM-free helpers for scroll-position restoration. Kept separate from
 * the hook (client/src/hooks/useScrollRestoration.ts) so this piece can be
 * unit tested under the project's node-environment Vitest config, which has
 * no DOM (no jsdom/happy-dom) — everything that touches window/history/
 * sessionStorage lives in the hook and is verified by manual browser QA
 * instead.
 */

/** sessionStorage key prefix for saved scroll positions, namespaced to avoid collisions with other app state. */
export const SCROLL_KEY_STORAGE_PREFIX = "promise:scrollpos:";

/** Builds the sessionStorage key for a given history-entry key. */
export function scrollStorageKey(entryKey: string): string {
  return `${SCROLL_KEY_STORAGE_PREFIX}${entryKey}`;
}

/**
 * Generates a unique id to tag a history entry with, so scroll position can be
 * saved/restored per visited entry rather than per pathname (the same route
 * can appear at different scroll depths at different points in history).
 */
export function generateScrollEntryKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Parses a saved scroll position from sessionStorage. Returns 0 (top) for
 * anything missing, non-numeric, or negative, so a corrupted/tampered value
 * can never scroll the page somewhere unexpected.
 */
export function parseScrollPosition(raw: string | null): number {
  if (raw === null) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}
