/**
 * CUSTOMER-PORTAL-SCROLL-RESTORATION-01A
 *
 * Replaces PublicLayout's old ScrollToTop, which called window.scrollTo(0, 0)
 * on every pathname change including browser Back — so the previous page
 * always reappeared at the top instead of where the customer left it.
 *
 * Behavior:
 *  - A new route (Link click, setLocation, any non-history-navigation change)
 *    starts at the top — unchanged from before.
 *  - Browser Back/Forward restores the scroll position that page had when the
 *    customer left it.
 *  - Hash-only changes and query-only changes never reach this hook: wouter's
 *    useLocation() returns pathname only (verified against
 *    node_modules/wouter/src/use-browser-location.js), so clicking a same-page
 *    anchor does not fire this effect and the browser's native hash-scroll
 *    behavior is untouched.
 *
 * Mechanism (no new dependency):
 *  - Each history entry is tagged with a random key via history.state, set
 *    once per push and read back on pop. Keying by entry rather than by
 *    pathname is necessary because the same route can sit at different scroll
 *    depths at different points in history (e.g. two visits to /shop).
 *  - Scroll position is saved to sessionStorage under that key on a
 *    requestAnimationFrame-throttled scroll listener.
 *  - Restore vs. reset is decided by whether the current history entry already
 *    carries a __scrollKey, not by racing a raw `popstate` listener against
 *    React's render cycle. An earlier version tried the popstate-listener
 *    approach and it lost the race: wouter registers its own popstate listener
 *    higher in the tree (in CustomerRouter's useLocation() call), and DOM
 *    listeners fire in registration order, so wouter's listener — and the
 *    React re-render + effect it triggers — completed before this hook's own
 *    listener ran, making the "was this a pop?" flag read stale. Confirmed by
 *    instrumented console tracing during manual QA.
 *
 *    wouter's pushState/Link navigation always calls history.pushState with
 *    state: null unless the caller explicitly supplies custom state (grepped:
 *    no call site in this app passes one). A restored (popped) entry, by
 *    contrast, carries whatever state this hook previously wrote to it via
 *    replaceState. So "does history.state already have a __scrollKey" is a
 *    reliable, timing-independent way to tell "restored entry" from "fresh
 *    push" — no listener race involved.
 *  - history.scrollRestoration is set to "manual" once so the browser's own
 *    (sometimes-conflicting) auto-restore never races with this hook.
 *
 * No smooth-scroll animation is used for the reset-to-top or the restore, so
 * there is nothing to gate behind prefers-reduced-motion.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  generateScrollEntryKey,
  parseScrollPosition,
  scrollStorageKey,
} from "@/lib/scroll-restoration";

interface ScrollRestorationHistoryState {
  __scrollKey?: string;
  [key: string]: unknown;
}

function readEntryKey(): string | null {
  const state = window.history.state as ScrollRestorationHistoryState | null;
  return state?.__scrollKey ?? null;
}

/** Ensures the current history entry has a key, assigning one if missing. Uses replaceState, which does not push a new entry and does not change the URL. */
function ensureEntryKey(): string {
  const existing = readEntryKey();
  if (existing) return existing;
  const key = generateScrollEntryKey();
  const prevState = (window.history.state as ScrollRestorationHistoryState | null) ?? {};
  window.history.replaceState({ ...prevState, __scrollKey: key }, "");
  return key;
}

/** Always assigns a fresh key, used when a NEW entry has just been pushed (forward navigation), so it never inherits the previous entry's saved scroll position. */
function assignFreshEntryKey(): void {
  const key = generateScrollEntryKey();
  const prevState = (window.history.state as ScrollRestorationHistoryState | null) ?? {};
  window.history.replaceState({ ...prevState, __scrollKey: key }, "");
}

const RESTORE_MAX_ATTEMPTS = 10;
const RESTORE_RETRY_DELAY_MS = 120;

/**
 * True while a restore's retry loop is in flight. The continuous scroll-persist
 * listener checks this and skips saving while true.
 *
 * Without this, every intermediate window.scrollTo() call inside the retry loop
 * fires a native `scroll` event, which the persist listener (a completely
 * independent effect) picks up and writes to sessionStorage — overwriting the
 * correct saved value (e.g. 1500) with a clamped, not-yet-converged one (e.g.
 * 290) under the SAME key. If the customer navigated away again in that
 * ~1s window, the next restore would use the corrupted intermediate value
 * instead of the real one. One module-level flag is safe here: only one
 * PublicLayout — and therefore only one instance of this hook — is ever
 * mounted at a time.
 */
let isRestoreInFlight = false;

/**
 * Bumped on every navigation (restore or fresh push). restoreScrollWhenReady's
 * retry loop uses window.setTimeout, which is not tied to the component or to
 * any particular page — if the customer navigates again before a retry loop
 * converges, the stale loop keeps calling window.scrollTo on whatever page is
 * now on screen. Each retry checks its own captured generation against the
 * current one and silently stops if it no longer matches. Confirmed this was
 * a real, not theoretical, bug during manual QA: navigating Home -> Shop ->
 * Home -> Shop -> Home in quick succession left the final Home restore
 * clobbered by an earlier still-running loop, landing at scrollY 31 instead of
 * the saved 1500.
 */
let restoreGeneration = 0;

/**
 * Restores scroll to targetY, retrying for up to ~1.2s if the page is not yet
 * tall enough to reach it.
 *
 * A single (or double-rAF) attempt is not enough on content-heavy pages: measured
 * on the customer Home page (30 list renders, 6 queries), document.scrollHeight
 * was 1464px immediately after the route remounted and did not reach its real
 * height of 3396px until roughly 450ms later, once async data/images settled.
 * Restoring once at the first paint clamps to whatever height exists at that
 * instant — the browser does not retroactively scroll further when content
 * appends below the fold afterward, so the customer landed partway up the page
 * instead of where they left it. Confirmed by sampling scrollHeight/scrollY at
 * 150ms intervals after a real Back navigation during manual QA.
 *
 * Retries stop as soon as the page is tall enough to reach the target (with a
 * 1px tolerance for sub-pixel layout), or after the attempt budget is spent —
 * whichever comes first. A page that never grows tall enough (its saved
 * position came from content no longer present) simply lands at its own max
 * scroll, which is the correct fallback.
 */
function restoreScrollWhenReady(targetY: number): void {
  const myGeneration = ++restoreGeneration;
  if (targetY <= 0) {
    window.scrollTo(0, 0);
    return;
  }
  isRestoreInFlight = true;
  let attempt = 0;
  const tryRestore = () => {
    // A newer navigation (another restore, or a fresh push) has started since
    // this loop began — stop immediately rather than fight over scrollTo with
    // whatever runs now. Do not touch isRestoreInFlight: it belongs to the
    // newer call, which will clear it itself.
    if (myGeneration !== restoreGeneration) return;
    window.scrollTo(0, targetY);
    attempt += 1;
    const maxScrollable = document.documentElement.scrollHeight - window.innerHeight;
    const reached = window.scrollY >= Math.min(targetY, maxScrollable) - 1;
    if (reached || attempt >= RESTORE_MAX_ATTEMPTS) {
      isRestoreInFlight = false;
      return;
    }
    window.setTimeout(tryRestore, RESTORE_RETRY_DELAY_MS);
  };
  // Double rAF: wait for this render to commit, then for the browser's first
  // layout pass, before the retry loop takes over for any remaining async growth.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(tryRestore);
  });
}

/** Invalidates any in-flight restore loop from a previous navigation. Called on a fresh push, which has no retry loop of its own but must still stop a stale one from an earlier pop. */
function invalidatePendingRestore(): void {
  restoreGeneration += 1;
  isRestoreInFlight = false;
}

export function useScrollRestoration(): void {
  const [pathname] = useLocation();
  const isFirstRun = useRef(true);

  // Runs once: opt out of the browser's own scroll restoration so it cannot
  // race with ours, and tag the entry the app booted on.
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    ensureEntryKey();
  }, []);

  // Continuously persist scroll position against whichever entry is current,
  // so it is up to date whenever the customer eventually navigates away.
  useEffect(() => {
    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        if (isRestoreInFlight) return;
        const key = readEntryKey();
        if (!key) return;
        try {
          window.sessionStorage.setItem(scrollStorageKey(key), String(window.scrollY));
        } catch {
          // sessionStorage may throw in locked-down environments (private
          // browsing quota, disabled storage) — restoration degrades to "no
          // saved position", not a crash.
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  // The actual restore-or-reset, keyed on pathname change.
  useEffect(() => {
    if (isFirstRun.current) {
      // Initial mount is not a navigation — do not touch scroll position
      // (respects direct links / deep links landing wherever the browser put them).
      isFirstRun.current = false;
      return;
    }

    const existingKey = readEntryKey();
    if (existingKey) {
      // A key is already present on this entry only because a previous visit
      // (ensureEntryKey/assignFreshEntryKey) put it there — i.e. this is a
      // restored entry from Back/Forward, not a fresh push.
      let savedPosition = 0;
      try {
        savedPosition = parseScrollPosition(window.sessionStorage.getItem(scrollStorageKey(existingKey)));
      } catch {
        savedPosition = 0;
      }
      restoreScrollWhenReady(savedPosition);
    } else {
      // wouter's pushState always sets state: null (no call site in this app
      // supplies custom state), so a missing key means a genuinely new entry.
      invalidatePendingRestore();
      assignFreshEntryKey();
      window.scrollTo(0, 0);
    }
  }, [pathname]);
}
