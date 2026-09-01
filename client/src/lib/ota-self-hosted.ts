/**
 * Updating the staff app without anyone downloading anything.
 *
 * An app handed out as a file has no Play Store behind it, so nothing pushes
 * fixes to it. Every change so far has meant telling people to go to a page,
 * download ten megabytes and install over the top — which they will do once,
 * perhaps twice, and then stop. That is how a shop ends up with five staff on
 * four different builds and a bug nobody can reproduce.
 *
 * Most of what breaks does not need a new APK. The app is the admin panel
 * running in a WebView, and the WebView's contents are ordinary web files
 * sitting inside the APK. The check-in bug was one field in a TypeScript file.
 * The push reply is a TypeScript file. Neither needs Android rebuilt — they
 * need those files replaced, which is exactly what this does.
 *
 * How it works: the newest web build is published as a zip beside the APK on
 * the release. The app asks this server which zip is newest, downloads it if it
 * is behind, and stages it for **next launch** rather than swapping it out
 * underneath whoever is mid-repair.
 *
 * The safety net matters more than the feature. A bundle that fails to start
 * would be unrecoverable — the app would be broken on every phone with no way
 * to push a fix, because the thing that pushes fixes is the part that broke.
 * capacitor-updater guards this: a new bundle must call notifyAppReady() soon
 * after launch or it is rolled back to the last one that did. initOTAUpdates()
 * makes that call. So the worst case is a phone that quietly goes back to the
 * build it had.
 *
 * What still needs a real APK: permissions, plugins, the notification channel,
 * Gradle, anything native. Those are rare. Everything else can arrive by
 * itself.
 *
 * Everything here reports rather than just acts, because "is it updating?" was
 * a fair question with no way to answer it from inside the app. The About
 * screen is built on what this returns.
 */

import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { getApiUrl } from "./config";

const LAST_CHECKED_KEY = "staff-app-last-update-check";

export type UpdateOutcome =
    /** Nothing newer is published. */
    | { kind: "up-to-date" }
    /** A newer web build was fetched and will be live next launch. */
    | { kind: "staged"; version: string }
    /** A newer build exists but only a new APK can deliver it. */
    | { kind: "needs-apk"; version: string }
    /** The check could not run — offline, or the server said nothing. */
    | { kind: "unavailable"; reason: string }
    /** Not the app. A browser is always on the newest build already. */
    | { kind: "not-native" };

export type UpdateStatus = {
    /** The Android build installed, as the app reports itself. */
    nativeVersion: string;
    /** The web build actually running, which may be newer than the APK. */
    bundleVersion: string;
    /** Whether the running bundle came over the air or was compiled in. */
    isBuiltin: boolean;
    /** The newest APK published, if the server could be reached. */
    latestApk: string | null;
    /** The newest web bundle published. */
    latestBundle: string | null;
    /** A bundle already downloaded and waiting for the next launch. */
    pending: string | null;
    lastCheckedAt: number | null;
};

/**
 * Compare dotted versions numerically.
 *
 * "1.0.10" is newer than "1.0.9", which string comparison gets backwards — and
 * being wrong here either re-downloads a bundle forever or never ships the fix.
 */
export function isNewer(candidate: string, current: string): boolean {
    const a = candidate.split(".").map((n) => parseInt(n, 10) || 0);
    const b = current.split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        if (x !== y) return x > y;
    }
    return false;
}

function rememberCheck(): void {
    try { localStorage.setItem(LAST_CHECKED_KEY, String(Date.now())); } catch { /* private mode */ }
}

function lastChecked(): number | null {
    try {
        const v = localStorage.getItem(LAST_CHECKED_KEY);
        return v ? Number(v) || null : null;
    } catch { return null; }
}

/**
 * What the server is offering, both halves.
 *
 * Through getApiUrl, never a bare path. Inside the app the page's origin is
 * https://localhost — Capacitor's own local server — and a relative URL is
 * answered by it, not by us. That server returns index.html for anything it
 * does not recognise, so the update check received a web page, tried to read it
 * as JSON, and reported: Unexpected token '<', "<!DOCTYPE"... is not valid JSON.
 *
 * Which means the update check never once succeeded in the app. It failed
 * silently on every launch — the one place it was designed to be silent — and
 * only became visible when the About screen started showing what it returned.
 *
 * main.tsx does rewrite bare paths, but only when VITE_API_URL is set, and it
 * is set nowhere. Depending on an env var that does not exist is how this hid.
 */
async function fetchPublished(): Promise<{ apk: string | null; bundle: { version: string; url: string } | null }> {
    const [apkRes, bundleRes] = await Promise.allSettled([
        fetch(getApiUrl("/admin/api/app/latest"), { headers: { Accept: "application/json" } }),
        fetch(getApiUrl("/admin/api/app/bundle"), { headers: { Accept: "application/json" } }),
    ]);

    let apk: string | null = null;
    if (apkRes.status === "fulfilled" && apkRes.value.ok) {
        apk = ((await apkRes.value.json()) as { version?: string }).version ?? null;
    }

    let bundle: { version: string; url: string } | null = null;
    // 204 means the release carries no zip — a real answer, not a failure.
    if (bundleRes.status === "fulfilled" && bundleRes.value.ok && bundleRes.value.status !== 204) {
        const d = (await bundleRes.value.json()) as { version?: string; url?: string };
        if (d.version && d.url) bundle = { version: d.version, url: d.url };
    }

    return { apk, bundle };
}

/**
 * Everything the About screen needs, without changing anything.
 *
 * Read-only on purpose. Someone opening a screen to see which version they are
 * on should not have that act of looking start a four-megabyte download.
 */
export async function getUpdateStatus(): Promise<UpdateStatus> {
    const empty: UpdateStatus = {
        nativeVersion: "—",
        bundleVersion: "—",
        isBuiltin: true,
        latestApk: null,
        latestBundle: null,
        pending: null,
        lastCheckedAt: lastChecked(),
    };

    if (!Capacitor.isNativePlatform()) {
        const published = await fetchPublished().catch(() => ({ apk: null, bundle: null }));
        return { ...empty, latestApk: published.apk, latestBundle: published.bundle?.version ?? null };
    }

    try {
        const [info, current, published] = await Promise.all([
            CapacitorApp.getInfo(),
            CapacitorUpdater.current(),
            fetchPublished().catch(() => ({ apk: null, bundle: null })),
        ]);

        /**
         * A bundle waiting for the next launch, if there is one.
         *
         * next() is not readable back directly, so the staged bundle is found
         * among the downloaded ones: anything newer than what is running has
         * been fetched and is waiting its turn.
         */
        let pending: string | null = null;
        try {
            const list = await CapacitorUpdater.list();
            const running = current?.bundle?.version ?? "0.0.0";
            const waiting = (list?.bundles ?? [])
                .filter((b) => b.status === "pending" || b.status === "success")
                .map((b) => b.version)
                .filter((v) => v && isNewer(v, running));
            pending = waiting.length ? waiting.sort((a, b) => (isNewer(a, b) ? -1 : 1))[0] : null;
        } catch { /* listing is a convenience, not a requirement */ }

        const bundleVersion = current?.bundle?.version ?? "builtin";

        return {
            nativeVersion: info.version,
            bundleVersion,
            isBuiltin: bundleVersion === "builtin" || bundleVersion === info.version,
            latestApk: published.apk,
            latestBundle: published.bundle?.version ?? null,
            pending,
            lastCheckedAt: lastChecked(),
        };
    } catch {
        return empty;
    }
}

/**
 * Fetch, stage, and get out of the way.
 *
 * Called on launch — where it is silent, because an update check is never worth
 * an error message to someone holding a phone in a repair shop — and from the
 * About screen, where the returned outcome is shown.
 */
export async function checkForWebBundleUpdate(): Promise<UpdateOutcome> {
    if (!Capacitor.isNativePlatform()) return { kind: "not-native" };

    try {
        const { apk, bundle } = await fetchPublished();
        rememberCheck();

        const current = await CapacitorUpdater.current();
        const bundleVersion = current?.bundle?.version ?? "0.0.0";
        /**
         * The native version is the honest floor.
         *
         * A fresh install reports the built-in bundle as "builtin", which parses
         * as 0.0.0. Measured against that alone, an app installed minutes ago
         * would download the very bundle already compiled into it — four
         * megabytes to arrive exactly where it started, on every new install.
         * The APK and the zip ship from the same tag, so a 1.0.3 APK already
         * holds the 1.0.3 web build.
         */
        const nativeVersion = current?.native ?? "0.0.0";
        const floor = isNewer(bundleVersion, nativeVersion) ? bundleVersion : nativeVersion;

        if (bundle && isNewer(bundle.version, floor)) {
            const downloaded = await CapacitorUpdater.download({
                url: bundle.url,
                version: bundle.version,
            });
            /**
             * next(), not set().
             *
             * set() swaps the running bundle immediately and reloads the
             * WebView. Doing that to someone halfway through booking a repair
             * throws away what they had typed, for a fix they did not ask for
             * and cannot see. next() stages it for the next launch.
             */
            await CapacitorUpdater.next({ id: downloaded.id });
            return { kind: "staged", version: bundle.version };
        }

        // No web bundle, but a newer APK — worth saying, because it is the one
        // case that cannot fix itself and needs a person.
        if (apk && isNewer(apk, nativeVersion)) {
            return { kind: "needs-apk", version: apk };
        }

        if (!bundle && !apk) {
            return { kind: "unavailable", reason: "Could not reach the update server." };
        }

        return { kind: "up-to-date" };
    } catch (err) {
        return { kind: "unavailable", reason: (err as Error)?.message || "The check could not run." };
    }
}

/**
 * Switch to a staged bundle now instead of waiting for the next launch.
 *
 * Reloads the app, so it is offered as a deliberate button and never done on
 * anyone's behalf.
 */
export async function applyStagedUpdateNow(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const list = await CapacitorUpdater.list();
    const current = await CapacitorUpdater.current();
    const running = current?.bundle?.version ?? "0.0.0";
    const target = (list?.bundles ?? [])
        .filter((b) => b.version && isNewer(b.version, running))
        .sort((a, b) => (isNewer(a.version, b.version) ? -1 : 1))[0];
    if (!target) return;
    await CapacitorUpdater.set({ id: target.id });
}
