/**
 * Tells the staff app when a newer build has been published.
 *
 * An app handed out as a file has no Play Store behind it, so nothing tells
 * anyone an update exists. Without this, a fix ships and the phones keep
 * running last month's build until somebody thinks to go and look — which is
 * how a shop ends up with five staff on four different versions and a bug
 * report nobody can reproduce.
 *
 * The check is cheap and quiet: one request to this server, which already knows
 * the newest release and caches it. Nothing downloads until someone taps.
 */

import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

const SKIPPED_KEY = "staff-app-update-skipped";

export type UpdateInfo = {
    /** The version now installed, as Android reports it. */
    current: string;
    /** The newest published version. */
    latest: string;
    downloadUrl: string;
};

/**
 * Compare two dotted versions numerically.
 *
 * "1.0.10" is newer than "1.0.9", which string comparison gets backwards — and
 * a wrong answer here either nags about an update that does not exist or hides
 * one that does. Missing parts count as zero, so "1.1" beats "1.0.9".
 */
function isNewer(latest: string, current: string): boolean {
    const a = latest.split(".").map((n) => parseInt(n, 10) || 0);
    const b = current.split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        if (x !== y) return x > y;
    }
    return false;
}

export function useAppUpdate() {
    const [update, setUpdate] = useState<UpdateInfo | null>(null);

    useEffect(() => {
        // Only the installed app can be out of date. A browser always has the
        // newest build the moment the page loads.
        if (!Capacitor.isNativePlatform()) return;

        let cancelled = false;

        (async () => {
            try {
                const info = await CapacitorApp.getInfo();
                const res = await fetch("/api/app/latest", { headers: { Accept: "application/json" } });
                if (!res.ok) return;
                const data = (await res.json()) as { version?: string; downloadUrl?: string };
                if (cancelled || !data.version || !data.downloadUrl) return;
                if (!isNewer(data.version, info.version)) return;

                /**
                 * A version skipped once stays skipped until a newer one
                 * appears. Somebody who chose Later meant this version, not
                 * every version from now on, so the key holds which one.
                 */
                if (localStorage.getItem(SKIPPED_KEY) === data.version) return;

                setUpdate({ current: info.version, latest: data.version, downloadUrl: data.downloadUrl });
            } catch {
                // An update check is never worth interrupting anyone over.
            }
        })();

        return () => { cancelled = true; };
    }, []);

    const skip = useCallback(() => {
        if (update) {
            try { localStorage.setItem(SKIPPED_KEY, update.latest); } catch { /* private mode */ }
        }
        setUpdate(null);
    }, [update]);

    const download = useCallback(() => {
        if (!update) return;
        /**
         * Handed to the browser rather than navigating this window.
         *
         * The app's own WebView has no downloads tray, so pointing it at a file
         * starts a transfer with nowhere to land — the bytes arrive, the counter
         * reaches the end, and it sits on "finishing" for ever. The browser has
         * somewhere to put it and offers to install it when it lands.
         */
        const a = document.createElement("a");
        a.href = update.downloadUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }, [update]);

    return { update, skip, download };
}
