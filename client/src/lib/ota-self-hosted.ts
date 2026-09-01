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
 * underneath whoever is mid-repair. Next time the app opens, it opens on the
 * fixed build.
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
 */

import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";

type BundleManifest = {
    version: string;
    url: string;
};

/**
 * Compare dotted versions numerically.
 *
 * "1.0.10" is newer than "1.0.9", which string comparison gets backwards — and
 * being wrong here either re-downloads a bundle forever or never ships the fix.
 */
function isNewer(candidate: string, current: string): boolean {
    const a = candidate.split(".").map((n) => parseInt(n, 10) || 0);
    const b = current.split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        if (x !== y) return x > y;
    }
    return false;
}

/**
 * Fetch, stage, and get out of the way.
 *
 * Everything here is best effort and silent. An update check is never worth an
 * error message to someone holding a phone in a repair shop: if it fails, they
 * keep the build they have and it tries again next launch.
 */
export async function checkForWebBundleUpdate(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
        const res = await fetch("/admin/api/app/bundle", {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) return;

        const manifest = (await res.json()) as Partial<BundleManifest>;
        if (!manifest.version || !manifest.url) return;

        /**
         * What is running now.
         *
         * A fresh install reports the built-in bundle, whose version is
         * whatever was compiled in — usually "builtin". That never parses as a
         * number, so it compares as 0.0.0 and the first real bundle always
         * wins, which is the behaviour wanted.
         */
        const current = await CapacitorUpdater.current();
        const runningVersion = current?.bundle?.version ?? "0.0.0";

        if (!isNewer(manifest.version, runningVersion)) return;

        const bundle = await CapacitorUpdater.download({
            url: manifest.url,
            version: manifest.version,
        });

        /**
         * next(), not set().
         *
         * set() swaps the running bundle immediately and reloads the WebView.
         * Doing that to someone halfway through booking a repair throws away
         * what they had typed, for a fix they did not ask for and cannot see.
         * next() stages it for the next launch or the next time the app is
         * backgrounded — by which point the interruption costs nothing.
         */
        await CapacitorUpdater.next({ id: bundle.id });
        console.log("[OTA] staged web bundle", manifest.version, "for next launch");
    } catch (err) {
        console.warn("[OTA] bundle check skipped:", (err as Error)?.message || err);
    }
}
