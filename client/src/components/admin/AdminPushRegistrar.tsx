/**
 * Asks for notification permission and tells the server where to send.
 *
 * Nothing did this before. initPushNotifications was written, exported, and
 * imported into App.tsx — and never called, so the app asked for nothing on
 * first run and held no token. The PushNotificationProvider that does exist
 * reads useCustomerAuth, which is the customer session; a staff member signing
 * in as admin has none, so its userId was always undefined and it registered
 * nobody.
 *
 * Deliberately after login rather than at startup. A token is only useful
 * attached to a person — that is how the server decides who gets told about a
 * job — and asking permission on the very first screen, before anyone has seen
 * what the app is, is how people learn to tap Deny.
 */
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { initPushNotifications } from "@/lib/native-features";
import { fetchApi } from "@/lib/api/httpClient";

export function AdminPushRegistrar() {
    const { user, status } = useAdminAuth();
    /** One attempt per signed-in user, not one per render. */
    const doneFor = useRef<string | null>(null);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        if (status !== "authenticated" || !user?.id) return;
        if (doneFor.current === user.id) return;
        doneFor.current = user.id;

        let cancelled = false;

        (async () => {
            try {
                // Prompts on Android 13+ now that POST_NOTIFICATIONS is declared;
                // resolves null if the person declines, which is their right.
                const token = await initPushNotifications();
                if (cancelled || !token) {
                    if (!token) console.warn("[Push] no token — notifications will not arrive");
                    return;
                }

                // Through fetchApi, not a bare fetch: this POST needs the CSRF
                // token and the session cookie, and that helper is what attaches
                // both. A bare fetch is refused before it reaches the handler.
                await fetchApi("/admin/push/register", {
                    method: "POST",
                    body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
                });
                console.log("[Push] device registered for", user.id);
            } catch (err) {
                console.warn("[Push] registration failed:", (err as Error)?.message || err);
                doneFor.current = null;
            }
        })();

        return () => { cancelled = true; };
    }, [status, user?.id]);

    return null;
}
