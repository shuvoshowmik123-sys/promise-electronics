/**
 * Where the staff Android app is downloaded from.
 *
 * The obvious approach is a fixed link to an asset with a fixed name, and it
 * broke on the first release: the file was uploaded as PromiseStaff-V1.0.0.apk
 * and the link asking for PromiseStaff.apk returned 404. Requiring whoever
 * publishes a release to remember an exact filename is a trap, and a versioned
 * filename is the more useful habit anyway — someone can see which build they
 * are holding.
 *
 * So the asset is looked up instead of assumed: ask GitHub for the latest
 * release and take whatever .apk is attached. Resolved on click rather than on
 * render, so the page costs nothing until somebody actually wants the app, and
 * the unauthenticated rate limit is never a concern for a shop this size.
 */

const REPO = "shuvoshowmik123-sys/promise-electronics";
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Where to send someone when the lookup fails — the page lists every file. */
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

type Asset = { name?: string; browser_download_url?: string };

/**
 * The newest .apk on the latest release, or null.
 *
 * Never throws. A download button that explodes because GitHub was slow is
 * worse than one that quietly falls back to the releases page, where the file
 * is one more tap away.
 */
export async function resolveStaffApkUrl(): Promise<string | null> {
    try {
        const res = await fetch(LATEST_API, {
            headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { assets?: Asset[] };
        const apk = (data.assets ?? []).find((a) =>
            typeof a.name === "string" && a.name.toLowerCase().endsWith(".apk"),
        );
        return apk?.browser_download_url ?? null;
    } catch {
        return null;
    }
}

/**
 * Send the browser to the APK, falling back to the releases page.
 *
 * Returns what it did, so a caller can say "opening the releases page" rather
 * than appearing to do nothing.
 */
export async function openStaffApkDownload(): Promise<"apk" | "releases"> {
    const url = await resolveStaffApkUrl();
    const target = url ?? RELEASES_PAGE;

    /**
     * Hand the file to the browser rather than navigating this window to it.
     *
     * The admin panel is installed as a PWA, and a standalone PWA window has no
     * download UI of its own — no address bar, no downloads tray, nothing to
     * take delivery. Setting location.href there starts the transfer and then
     * has nowhere to put it: the phone shows the bytes arriving, reaches the
     * full size, and sits on "finishing" forever. It looks exactly like a stalled
     * download and is really a window that cannot finish one.
     *
     * Opening in a new context gives it to the real browser, which does have a
     * downloads tray and will offer to install the APK when it lands.
     *
     * The `download` attribute is deliberately not set: it is ignored
     * cross-origin, and GitHub already sends Content-Disposition with the
     * filename, so the browser names the file correctly on its own.
     */
    const a = document.createElement("a");
    a.href = target;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Popup blockers can refuse a click that came out of an await. Falling back
    // to navigating this window is worse than nothing only inside a PWA, and
    // there the new context is what was blocked — so tell the caller instead of
    // silently doing the thing that hangs.
    return url ? "apk" : "releases";
}
