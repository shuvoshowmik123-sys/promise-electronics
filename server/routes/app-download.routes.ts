/**
 * Serves the staff Android app from this domain.
 *
 * Two things this exists to avoid, both of which broke a real download.
 *
 * **The redirect.** github.com/.../releases/download sends the phone on to
 * release-assets.githubusercontent.com with a signed URL around eight hundred
 * characters long carrying an expiring token, cross-origin from the page that
 * started it. Every byte arrived and the transfer then sat on "finishing" and
 * never completed. That is the shape Android download managers handle worst,
 * and the vendor ROMs common on the phones this ships to are stricter again.
 *
 * **The API.** The first version of this route asked GitHub which asset was
 * newest on every cold cache. That works from a laptop and fails on Render,
 * where the unauthenticated limit of sixty calls an hour is shared across every
 * customer on the same outbound address — so the lookup returned nothing and
 * the route answered 503 while the identical code worked locally.
 *
 * So the request path now contains neither. The URL is resolved from a fixed
 * name that GitHub redirects for free, the answer is cached for six hours, and
 * a stale answer is always preferred to no answer.
 *
 * Mounted under a prefix the Vercel frontend forwards to this server. A route
 * outside one is answered by the SPA, which is why /app/download returned the
 * app's own "page not found" rather than a file.
 *
 * Two prefixes answer, and both must stay. /admin/api/app/... is the address to
 * hand out: it says on its face that this is the staff build and not something
 * a customer should be installing. /api/app/... is what the apps already in
 * people's hands ask for, and an app cannot be updated to a new update URL
 * without first being updated — so removing it would strand exactly the phones
 * this route exists to reach.
 */

import { Router, type Request, type Response } from "express";

const router = Router();

const REPO = "shuvoshowmik123-sys/promise-electronics";

/**
 * The address handed out, spelled in full.
 *
 * A relative path is wrong in the one place it matters most. Inside the staff
 * app the page's origin is https://localhost, so "/admin/api/app/download"
 * opened in the phone's browser resolves against localhost and fetches nothing
 * — the update button would appear to do nothing at all. An absolute URL on the
 * public domain is correct from the app, from a browser, and in a message sent
 * to someone who is not holding either.
 */
const PUBLIC_ORIGIN = (process.env.PUBLIC_APP_ORIGIN || "https://promiseelectronics.com").replace(/\/$/, "");

/** Where people are sent. Both prefixes serve it; this is the one advertised. */
export const APP_DOWNLOAD_PATH = "/admin/api/app/download";
export const APP_DOWNLOAD_URL = `${PUBLIC_ORIGIN}${APP_DOWNLOAD_PATH}`;

/**
 * The asset name to publish releases under.
 *
 * GitHub resolves /releases/latest/download/<name> to the newest release
 * carrying that exact name, with no API call and no rate limit. Keeping the
 * name fixed is what makes this route free and reliable; the version belongs in
 * the tag, which is where people look for it anyway.
 */
const STABLE_ASSET = "PromiseStaff.apk";
const STABLE_URL = `https://github.com/${REPO}/releases/latest/download/${STABLE_ASSET}`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

type Resolved = { url: string; name: string; tag: string; at: number; size?: number | null };
let cached: Resolved | null = null;

/**
 * Fifteen minutes.
 *
 * Six hours was the first guess and it was wrong in the way that matters: a
 * release published now was still not being offered, and the only remedy was
 * restarting the server. Someone who has just published a build expects to be
 * able to install it, and being told to wait is indistinguishable from the
 * feature being broken — which is exactly how it was reported.
 *
 * The lookup is two plain HTML requests against endpoints with no rate limit,
 * so four an hour costs nothing worth saving.
 */
const CACHE_MS = 15 * 60 * 1000;

/**
 * Find the newest .apk without touching the API.
 *
 * Two plain HTML requests, neither of which is rate limited. /releases/latest
 * answers with a redirect whose Location carries the newest tag, and
 * /releases/expanded_assets/<tag> is the fragment GitHub's own page fetches to
 * list the files — the asset links are in it as ordinary anchors.
 *
 * This is what lets the asset be called anything. Requiring a fixed filename
 * put the whole feature at the mercy of whoever typed the name while publishing,
 * and the first release was already called PromiseStaff-V1.0.0.apk, so the
 * fixed-name link 404'd and the download said the app was unavailable.
 */
async function resolveViaHtml(): Promise<Resolved | null> {
    try {
        const latest = await fetch(`https://github.com/${REPO}/releases/latest`, {
            redirect: "manual",
            headers: { "User-Agent": "promise-staff-app" },
        });
        const location = latest.headers.get("location") ?? "";
        const tag = location.split("/tag/")[1]?.trim();
        if (!tag) return null;

        const page = await fetch(`https://github.com/${REPO}/releases/expanded_assets/${tag}`, {
            headers: { "User-Agent": "promise-staff-app" },
        });
        if (!page.ok) return null;
        const html = await page.text();

        const match = html.match(
            new RegExp(`/${REPO}/releases/download/[^"']+\.apk`, "i"),
        );
        if (!match) return null;

        const url = `https://github.com${match[0]}`;
        return { url, name: decodeURIComponent(url.split("/").pop() || STABLE_ASSET), tag, at: Date.now() };
    } catch {
        return null;
    }
}

/**
 * The newest web bundle on the release, for the app to update itself with.
 *
 * The APK and this zip are published side by side. The APK is the shell —
 * permissions, plugins, the notification channel — and changes rarely. The zip
 * is the admin panel itself, and is almost always what actually needs fixing.
 * Separating them is what lets a bug fix reach a phone with nobody downloading
 * anything.
 *
 * Cached with the same rules as the APK, and resolved the same way: plain HTML
 * pages GitHub does not rate limit.
 */
type ResolvedBundle = { url: string; version: string; at: number };
let cachedBundle: ResolvedBundle | null = null;

async function resolveBundle(): Promise<ResolvedBundle | null> {
    if (cachedBundle && Date.now() - cachedBundle.at < CACHE_MS) return cachedBundle;

    try {
        const latest = await fetch(`https://github.com/${REPO}/releases/latest`, {
            redirect: "manual",
            headers: { "User-Agent": "promise-staff-app" },
        });
        const tag = (latest.headers.get("location") ?? "").split("/tag/")[1]?.trim();
        if (!tag) return cachedBundle;

        const page = await fetch(`https://github.com/${REPO}/releases/expanded_assets/${tag}`, {
            headers: { "User-Agent": "promise-staff-app" },
        });
        if (!page.ok) return cachedBundle;
        const html = await page.text();

        const match = html.match(
            new RegExp(`/${REPO}/releases/download/[^"']+\.zip`, "i"),
        );
        if (!match) return cachedBundle;

        cachedBundle = {
            url: `https://github.com${match[0]}`,
            // The tag is the version, as with the APK. The two move together.
            version: tag.replace(/^v/i, ""),
            at: Date.now(),
        };
        return cachedBundle;
    } catch {
        return cachedBundle;
    }
}

/**
 * Which web bundle the app should be running.
 *
 * Answers 204 rather than an error when a release carries no zip. There is
 * nothing wrong in that case — it is a release that only changed the shell —
 * and an app that treats "nothing to do" as a failure will log an error on
 * every launch for ever.
 */
router.get(["/api/app/bundle", "/admin/api/app/bundle"], async (_req: Request, res: Response) => {
    const bundle = await resolveBundle();
    if (!bundle) return res.status(204).end();
    res.json({ version: bundle.version, url: bundle.url });
});

/** The asset's size in bytes, or null if the release host will not say. */
async function contentLength(url: string): Promise<number | null> {
    try {
        const res = await fetch(url, { method: "HEAD", redirect: "follow" });
        const len = Number(res.headers.get("content-length"));
        return Number.isFinite(len) && len > 0 ? len : null;
    } catch {
        return null;
    }
}

async function head(url: string): Promise<boolean> {
    try {
        const res = await fetch(url, { method: "HEAD", redirect: "follow" });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Where the newest APK is, in order of how much can go wrong.
 *
 * An explicit override first, then the free fixed-name redirect, then the API
 * as a last resort for releases published under some other name. A previous
 * good answer outlives all three: an out-of-date link still installs, an error
 * page installs nothing.
 */
async function resolveApk(): Promise<Resolved | null> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached;

    const override = process.env.STAFF_APK_URL?.trim();
    if (override) {
        cached = { url: override, name: STABLE_ASSET, tag: "", at: Date.now() };
        return cached;
    }

    // Works whatever the asset is called, and costs no API quota.
    const viaHtml = await resolveViaHtml();
    if (viaHtml) {
        cached = viaHtml;
        return cached;
    }

    if (await head(STABLE_URL)) {
        cached = { url: STABLE_URL, name: STABLE_ASSET, tag: "", at: Date.now() };
        return cached;
    }

    try {
        const res = await fetch(LATEST_API, {
            headers: { Accept: "application/vnd.github+json", "User-Agent": "promise-staff-app" },
        });
        if (res.ok) {
            const data = (await res.json()) as {
                tag_name?: string;
                assets?: Array<{ name?: string; browser_download_url?: string }>;
            };
            const apk = (data.assets ?? []).find(
                (a) => typeof a.name === "string" && a.name.toLowerCase().endsWith(".apk"),
            );
            if (apk?.browser_download_url) {
                cached = { url: apk.browser_download_url, name: apk.name ?? STABLE_ASSET, tag: (data as { tag_name?: string }).tag_name ?? "", at: Date.now() };
                return cached;
            }
        }
    } catch {
        /* fall through to whatever was cached */
    }

    return cached;
}

/** What is on offer, for the screen showing the button. */
router.get(["/api/app/latest", "/admin/api/app/latest"], async (_req: Request, res: Response) => {
    const asset = await resolveApk();
    if (!asset) {
        return res.status(503).json({
            error: "The app is not available for download just now.",
            hint: `Publish a release with an asset named ${STABLE_ASSET}.`,
        });
    }
    /**
     * The tag is the version the app compares itself against.
     *
     * Taken from the release tag rather than read out of the APK: the tag is
     * what a person publishing a release types deliberately, and reading the
     * binary would mean downloading ten megabytes on the server to answer a
     * question the tag already answers. The leading "v" is dropped so it can be
     * compared with the versionName Android reports, which has none.
     */
    /**
     * The size is looked up once and kept with the cached answer.
     *
     * Worth one HEAD request: a download with no stated size is the one people
     * abandon, and this one is ten megabytes over a phone connection. It is also
     * how someone can tell a finished download from a stalled one, which is a
     * distinction this app has already cost us a week over.
     */
    if (asset.size === undefined) {
        asset.size = await contentLength(asset.url);
    }

    res.json({
        version: asset.tag.replace(/^v/i, ""),
        tag: asset.tag,
        filename: asset.name,
        /** Absolute — see PUBLIC_ORIGIN. A relative path breaks the app's own update button. */
        downloadUrl: APP_DOWNLOAD_URL,
        size: asset.size ?? null,
    });
});

/**
 * The file itself.
 *
 * Streamed rather than redirected, which is the point: the phone sees one short
 * same-origin URL on a domain it already trusts, a Content-Length it can rely
 * on to know when it is finished, and a filename it does not have to parse out
 * of a query string.
 */
router.get(["/api/app/download", "/admin/api/app/download"], async (_req: Request, res: Response) => {
    const asset = await resolveApk();
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
        // A known length is what lets the phone show real progress and, more to
        // the point, know that it has finished.
        const len = upstream.headers.get("content-length");
        if (len) res.setHeader("Content-Length", len);
        res.setHeader("Cache-Control", "public, max-age=300");
        res.setHeader("X-Content-Type-Options", "nosniff");

        // Chunked rather than buffered: several staff installing at once should
        // not hold ten megabytes in memory per request.
        const reader = upstream.body.getReader();
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
