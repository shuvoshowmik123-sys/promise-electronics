import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, type Messaging } from "firebase/messaging";
import { isFirebaseConfigured } from "./firebase";
import { pushRegisterUrlForPortal, type PushPortal } from "./push-register-url";

export { pushRegisterUrlForPortal, type PushPortal } from "./push-register-url";

/**
 * Browser push notifications — the path that works while the app is CLOSED.
 *
 * The app already had two notification mechanisms and neither covered this:
 *   - SSE, which only lives as long as an open tab
 *   - @capacitor/push-notifications, which only works inside a native wrapper
 *
 * So a customer or admin who closed the tab received nothing. This module adds
 * the web path: subscribe the browser with FCM, hand the token to the server,
 * and let `client/public/sw.js` display whatever arrives.
 *
 * Cost at idle is zero. The browser's push service holds the connection, not
 * our server; we make one outbound request per event we actually send.
 *
 * Follows the same fail-safe contract as ./firebase.ts: this is an OPTIONAL
 * feature and must never break the app. Every failure path returns a result
 * object — nothing here throws.
 */

const VAPID_KEY: string | undefined = import.meta.env.VITE_FIREBASE_VAPID_KEY;

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export type PushSubscribeResult =
    | { ok: true; token: string }
    | { ok: false; reason: "unsupported" | "unconfigured" | "denied" | "dismissed" | "error"; detail?: string };

function readCsrfCookie(): string | undefined {
    if (typeof document === "undefined") return undefined;
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : undefined;
}

/** Admin (and other CSRF-gated) POSTs need X-XSRF-TOKEN; customer route does not enforce CSRF. */
async function postDeviceToken(registerUrl: string, token: string): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let csrf = readCsrfCookie();
    if (!csrf && registerUrl.includes("/admin/")) {
        try {
            await fetch("/api/admin/csrf-token", {
                credentials: "include",
                headers: { Accept: "application/json" },
            });
            csrf = readCsrfCookie();
        } catch {
            /* optional — register may still fail CSRF if missing */
        }
    }
    if (csrf) headers["X-XSRF-TOKEN"] = csrf;

    return fetch(registerUrl, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ token, platform: "web" }),
    });
}

/** True only when web push could plausibly work here. Cheap, synchronous. */
export function isWebPushConfigured(): boolean {
    return Boolean(
        isFirebaseConfigured &&
        VAPID_KEY &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        "serviceWorker" in navigator,
    );
}

/** Current permission without prompting. Use this to decide whether to show a prompt. */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
}

let cachedMessaging: Messaging | null = null;
let messagingAttempted = false;

async function getMessagingInstance(): Promise<Messaging | null> {
    if (messagingAttempted) return cachedMessaging;
    messagingAttempted = true;

    try {
        // Safari below 16.4 and some in-app browsers report false here.
        if (!(await isSupported())) return null;
        const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
        cachedMessaging = getMessaging(app);
        return cachedMessaging;
    } catch (error) {
        console.warn("[WebPush] Messaging init failed — push disabled.", error);
        cachedMessaging = null;
        return null;
    }
}

/**
 * Register the service worker that displays notifications.
 *
 * Safe to call repeatedly — the browser returns the existing registration.
 * Note this was never being called before, so sw.js existed but never ran.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    try {
        return await navigator.serviceWorker.register("/sw.js");
    } catch (error) {
        console.warn("[WebPush] Service worker registration failed.", error);
        return null;
    }
}

/**
 * Ask for permission, obtain an FCM token, and register it with the server.
 *
 * MUST be called from a user gesture (a button click). Browsers ignore or
 * penalise permission prompts fired on page load, and once a user has blocked
 * notifications the prompt cannot be shown again programmatically — they have
 * to change it in browser settings. So only call this when the user has
 * asked for notifications.
 *
 * @param portal Explicit portal — selects the register URL. Defaults to
 *   customer so existing call sites stay correct.
 */
export async function subscribeToPush(portal: PushPortal = "customer"): Promise<PushSubscribeResult> {
    if (!isWebPushConfigured()) {
        return { ok: false, reason: "unconfigured", detail: "Missing VITE_FIREBASE_VAPID_KEY or Firebase config" };
    }

    const registerUrl = pushRegisterUrlForPortal(portal);
    // Fail before the browser prompt when this portal has no server register route.
    if (!registerUrl) {
        return {
            ok: false,
            reason: "unconfigured",
            detail: `No push register endpoint for portal "${portal}"`,
        };
    }

    const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

    if (permission === "denied") return { ok: false, reason: "denied" };
    if (permission !== "granted") return { ok: false, reason: "dismissed" };

    const registration = await registerServiceWorker();
    if (!registration) return { ok: false, reason: "unsupported", detail: "Service worker unavailable" };

    const messaging = await getMessagingInstance();
    if (!messaging) return { ok: false, reason: "unsupported", detail: "FCM not supported in this browser" };

    try {
        const token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration,
        });
        if (!token) return { ok: false, reason: "error", detail: "Empty token returned" };

        const response = await postDeviceToken(registerUrl, token);

        if (!response.ok) {
            return { ok: false, reason: "error", detail: `Register failed: ${response.status}` };
        }

        return { ok: true, token };
    } catch (error) {
        console.warn("[WebPush] Subscription failed.", error);
        return { ok: false, reason: "error", detail: (error as Error)?.message };
    }
}
