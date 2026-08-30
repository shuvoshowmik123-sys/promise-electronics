import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import "./index.css";
import "./lib/i18n";
import { installStaleBuildRecovery } from "./lib/app-update-recovery";

// The recovery cooldown is time-based and must NOT be cleared on `load`: that
// is the very event the recovery reload fires, so clearing there let a
// permanently broken chunk reload the page forever.
installStaleBuildRecovery();

/**
 * The staff app opens on the admin panel, not the shop's front page.
 *
 * Both are in the same bundle, and a native launch starts at "/" — which is
 * the public homepage a customer sees. Nobody installs the staff app to read
 * the marketing site, and the first build shipped exactly that.
 *
 * Rewritten before React mounts so the router's first render is already the
 * admin route: sending it afterwards would draw the homepage, then replace it,
 * which is visible and looks like a fault. From "/admin" the existing guard
 * decides — login when signed out, the role's own landing page when signed in.
 *
 * Only the entry path is touched. Every route inside the app still works, so a
 * push notification that deep-links to a job opens that job.
 */
if (Capacitor.isNativePlatform() && (window.location.pathname === "/" || window.location.pathname === "")) {
    window.history.replaceState(null, "", "/admin");
}

// ── API URL interceptor for frontend/backend separation ───────────────────────
// When VITE_API_URL is set (Render backend, Vercel frontend), all relative
// /api/* requests are rewritten to the absolute backend URL.
// In same-origin deploys (VITE_API_URL not set), this is a no-op.
const API_PREFIX = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
if (API_PREFIX) {
    // 1. Patch fetch — rewrite URL + force cross-origin credentials (cookies)
    const _fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        let rewritten = false;
        if (typeof input === 'string' && input.startsWith('/')) {
            input = `${API_PREFIX}${input}`;
            rewritten = true;
        } else if (input instanceof Request && input.url.startsWith('/')) {
            input = new Request(`${API_PREFIX}${input.url}`, input);
            rewritten = true;
        }
        // Cross-origin requests must send the session cookie explicitly
        if (rewritten) {
            init = { ...init, credentials: 'include' as RequestCredentials };
        }
        return _fetch(input, init);
    };

    // 2. Patch EventSource — SSE bypasses fetch, so rewrite its URL too
    const NativeEventSource = window.EventSource;
    if (NativeEventSource) {
        const PatchedEventSource = function (url: string | URL, init?: EventSourceInit) {
            let u = typeof url === 'string' ? url : url.toString();
            if (u.startsWith('/')) u = `${API_PREFIX}${u}`;
            return new NativeEventSource(u, init);
        } as unknown as { prototype: EventSource };
        PatchedEventSource.prototype = NativeEventSource.prototype;
        // Copy static constants (CONNECTING/OPEN/CLOSED) without triggering readonly errors
        Object.assign(PatchedEventSource, {
            CONNECTING: NativeEventSource.CONNECTING,
            OPEN: NativeEventSource.OPEN,
            CLOSED: NativeEventSource.CLOSED,
        });
        window.EventSource = PatchedEventSource as unknown as typeof EventSource;
    }
}

createRoot(document.getElementById("root")!).render(<App />);

requestAnimationFrame(() => {
    window.dispatchEvent(new Event("promise-app-mounted"));
});
