/**
 * Fetching a new version of the app so nobody has to go and find it.
 *
 * Staff were being asked to do a shop's job: open a browser, find a page, start
 * a download, then locate the file in a downloads tray and tap it. Most people
 * stopped at the first step, which is why phones sat on 1.0.2 for weeks after
 * 1.0.4 existed. The version was never the obstacle — the errand was.
 *
 * So the download starts on its own the moment the app notices the server is
 * offering a build it does not have. All that is left is one tap on Install.
 *
 * **That tap cannot be removed, and it is worth being straight about why.**
 * Android will not let an ordinary app install another app unattended. Only
 * the Play Store, or a phone enrolled as a managed device, can do that. So the
 * aim is not "no taps" — it is one tap, in front of you, with nothing to find.
 *
 * The comparison is the installed version against the published one, nothing
 * else. No staged rollouts, no per-device rules: if they differ, this phone is
 * behind and the file is fetched.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { getApiUrl } from "./config";

export type ApkUpdaterPlugin = {
    downloadUpdate(options: { url: string }): Promise<{ started: boolean }>;
    getDownloadedUpdate(): Promise<{ ready: boolean; size: number }>;
    installUpdate(): Promise<void>;
    canInstall(): Promise<{ allowed: boolean }>;
    openInstallSettings(): Promise<void>;
    addListener(
        event: "downloadComplete",
        handler: (info: { success: boolean; reason?: number }) => void,
    ): Promise<{ remove: () => Promise<void> }>;
};

export const ApkUpdater = registerPlugin<ApkUpdaterPlugin>("AppUpdater");

export type ApkState =
    | { kind: "idle" }
    | { kind: "current" }
    /** A newer build exists and is being fetched. */
    | { kind: "downloading"; version: string }
    /** Downloaded and waiting for the one tap. */
    | { kind: "ready"; version: string }
    /** Downloaded, but Android has not been told this app may install apps. */
    | { kind: "blocked"; version: string }
    | { kind: "failed"; reason: string };

/** Numeric comparison — "1.0.10" is newer than "1.0.9", which string order gets backwards. */
function isNewer(candidate: string, current: string): boolean {
    const a = candidate.split(".").map((n) => parseInt(n, 10) || 0);
    const b = current.split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
    }
    return false;
}

/**
 * Look, and fetch if there is something to fetch.
 *
 * Reports through the callback rather than returning once, because the download
 * outlives this function — Android owns it from the moment it is queued, and it
 * finishes whether or not anyone is still looking at the screen.
 */
export async function checkAndDownloadApk(onState: (state: ApkState) => void): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
        onState({ kind: "idle" });
        return;
    }

    try {
        const info = await CapacitorApp.getInfo();

        /**
         * Already downloaded, from a previous launch.
         *
         * Checked before asking the server: the file survives the app closing,
         * and re-fetching ten megabytes somebody already has is the kind of
         * waste that gets an app uninstalled in a shop paying for mobile data.
         */
        const existing = await ApkUpdater.getDownloadedUpdate();

        const res = await fetch(getApiUrl("/admin/api/app/latest"), {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) { onState({ kind: "idle" }); return; }

        const data = (await res.json()) as { version?: string; downloadUrl?: string };
        if (!data.version || !data.downloadUrl) { onState({ kind: "idle" }); return; }

        if (!isNewer(data.version, info.version)) {
            onState({ kind: "current" });
            return;
        }

        if (existing.ready) {
            const permitted = await ApkUpdater.canInstall();
            onState({ kind: permitted.allowed ? "ready" : "blocked", version: data.version });
            return;
        }

        onState({ kind: "downloading", version: data.version });

        const listener = await ApkUpdater.addListener("downloadComplete", async (result) => {
            if (result.success) {
                const permitted = await ApkUpdater.canInstall();
                onState({ kind: permitted.allowed ? "ready" : "blocked", version: data.version! });
            } else {
                onState({
                    kind: "failed",
                    reason: "The download did not finish. It will try again next time the app opens.",
                });
            }
            listener.remove().catch(() => {});
        });

        await ApkUpdater.downloadUpdate({ url: data.downloadUrl });
    } catch (err) {
        onState({ kind: "failed", reason: (err as Error)?.message || "Could not check for an update." });
    }
}
