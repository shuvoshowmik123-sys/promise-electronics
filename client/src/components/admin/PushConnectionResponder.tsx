/**
 * Answers a connection test, so the console can prove this phone is reachable.
 *
 * The other half of the test bench. The server sends a notification carrying a
 * ping id; this sends it straight back. Without the reply the console can only
 * report that Firebase accepted the message, which says nothing about whether
 * this device ever saw it — FCM accepts messages for phones that have been
 * switched off for a month.
 *
 * Two listeners, because a notification reaches the app two different ways and
 * only one of them is automatic:
 *
 *   pushNotificationReceived       — the app was awake. It answers by itself,
 *                                    and nobody has to do anything.
 *   pushNotificationActionPerformed — the notification was tapped. This is the
 *                                    only signal available when the app was
 *                                    closed, because Android draws that
 *                                    notification on its own and no JavaScript
 *                                    of ours runs until someone taps it.
 *
 * That second case is the one worth caring about. An alert arriving with the
 * app shut is what this whole app was built for, and a tap is a person
 * confirming with their own eyes that it appeared — stronger evidence than any
 * automatic reply, not weaker.
 *
 * Temporary. It goes when the test bench goes.
 */
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { fetchApi } from "@/lib/api/httpClient";

/** The message shape the test bench sends. Anything else is left alone. */
function pingIdFrom(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    if (d.type !== "connection_test") return null;
    return typeof d.pingId === "string" ? d.pingId : null;
}

export function PushConnectionResponder() {
    const { status } = useAdminAuth();

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        // The reply is authenticated as the person being tested — that is what
        // makes it evidence about their device rather than about some device.
        if (status !== "authenticated") return;

        let disposed = false;
        const handles: Array<{ remove: () => Promise<void> }> = [];

        const answer = async (pingId: string, phase: "replied" | "opened") => {
            try {
                await fetchApi("/admin/push-test/ack", {
                    method: "POST",
                    body: JSON.stringify({ pingId, phase }),
                });
            } catch {
                // A test reply is never worth surfacing to whoever is holding
                // the phone. The console showing no answer is the result.
            }
        };

        (async () => {
            const received = await PushNotifications.addListener(
                "pushNotificationReceived",
                (notification) => {
                    const id = pingIdFrom(notification.data);
                    if (id) answer(id, "replied");
                },
            );
            const tapped = await PushNotifications.addListener(
                "pushNotificationActionPerformed",
                (action) => {
                    const id = pingIdFrom(action.notification?.data);
                    if (id) answer(id, "opened");
                },
            );
            if (disposed) {
                received.remove();
                tapped.remove();
                return;
            }
            handles.push(received, tapped);
        })();

        return () => {
            disposed = true;
            handles.forEach((h) => { h.remove().catch(() => {}); });
        };
    }, [status]);

    return null;
}
