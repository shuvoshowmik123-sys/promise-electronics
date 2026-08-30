/**
 * Serves the staff Android app from this domain.
 *
 * The download used to send the phone to GitHub, which redirects to a signed
 * URL on release-assets.githubusercontent.com that is roughly eight hundred
 * characters long and carries an expiring token. Every byte arrived and the
 * download then sat on "finishing" and never completed — on a phone with the
 * PWA uninstalled, so the earlier explanation did not cover it.
 *
 * What is left when the file, the archive and the origin server have all been
 * checked and are correct is the path between them. A cross-origin redirect to
 * a huge signed URL is exactly the shape that Android download managers handle
 * badly, and the vendor ROMs common here are stricter still.
 *
 * So the redirect is removed. This route streams the APK from one short,
 * same-origin address with a plain filename, a known length, and no token:
 *
 *     https://promiseelectronics.com/app/download
 *
 * GitHub stays the source of truth — nothing is committed to this repository
 * and publishing a release is still all it takes to ship a new build.
 */

import { Router, type Request, type Response } from "express";

const router = Router();

const REPO = "shuvoshowmik123-sys/promise-electronics";
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

type CachedAsset = { url: string; name: string; size: number; tag: string; at: number };
let cached: CachedAsset | null = null;

/**
 * Ten minutes.
 *
 * Long enough that a shop handing the app to six people costs one API call,
 * short enough that a release published now is offered within the hour rather
 * than after a restart.
 */
const CACHE_MS = 10 * 60 * 1000;

async function resolveLatestApk(): Promise<CachedAsset | null> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached;
    try {
        const res = await fetch(LATEST_API, {
            headers: { Accept: "application/vnd.github+json", "User-Agent": "promise-staff-app" },
        });
        if (!res.ok) return cached; // stale beats nothing
        const data = (await res.json()) as {
            tag_name?: string;
            assets?: Array<{ name?: string; size?: number; browser_download_url?: string }>;
        };
        const apk = (data.assets ?? []).find(
            (a) => typeof a.name === "string" && a.name.toLowerCase().endsWith(".apk"),
        );
        if (!apk?.browser_download_url) return cached;
        cached = {
            url: apk.browser_download_url,
            name: apk.name ?? "PromiseStaff.apk",
            size: apk.size ?? 0,
            tag: data.tag_name ?? "",
            at: Date.now(),
        };
        return cached;
    } catch {
        return cached;
    }
}

/** What is currently on offer, for the screen that shows the button. */
router.get("/api/app/latest", async (_req: Request, res: Response) => {
    const asset = await resolveLatestApk();
    if (!asset) return res.status(503).json({ error: "Could not reach the release just now." });
    res.json({
        version: asset.tag,
        filename: asset.name,
        sizeBytes: asset.size,
        downloadUrl: "/app/download",
    });
});

/**
 * The file itself.
 *
 * Streamed rather than redirected, which is the whole point: the phone sees one
 * short URL on a domain it already trusts, a Content-Length it can rely on, and
 * a filename it does not have to parse out of a query string.
 */
router.get("/app/download", async (_req: Request, res: Response) => {
    const asset = await resolveLatestApk();
    if (!asset) {
        return res.status(503).send("The app is not available for download just now.");
    }

    try {
        const upstream = await fetch(asset.url, {
            headers: { "User-Agent": "promise-staff-app", Accept: "application/octet-stream" },
            redirect: "follow",
        });
        if (!upstream.ok || !upstream.body) {
            return res.status(502).send("Could not fetch the app from the release.");
        }

        res.setHeader("Content-Type", "application/vnd.android.package-archive");
        res.setHeader("Content-Disposition", `attachment; filename="${asset.name}"`);
        // A known length is what lets the phone show real progress and know when
        // it is finished. Without it the download manager has to guess.
        const len = upstream.headers.get("content-length");
        if (len) res.setHeader("Content-Length", len);
        // An APK is immutable once published, but a new release must not be
        // shadowed by a cached copy of the old one.
        res.setHeader("Cache-Control", "public, max-age=300");
        res.setHeader("X-Content-Type-Options", "nosniff");

        const reader = upstream.body.getReader();
        // Streamed in chunks rather than buffered: a ten megabyte APK held whole
        // in memory for every staff member installing at once is avoidable.
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.write(Buffer.from(value))) {
                await new Promise((resolve) => res.once("drain", resolve));
            }
        }
        res.end();
    } catch (error) {
        console.error("[AppDownload] failed:", (error as Error).message);
        if (!res.headersSent) res.status(502).send("Download failed. Please try again.");
        else res.end();
    }
});

export default router;
