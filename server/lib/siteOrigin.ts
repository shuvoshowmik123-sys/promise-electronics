/**
 * The one address the shop is known by, for anything a crawler will read.
 *
 * FRONTEND_URL does two unrelated jobs. CORS reads it as a COMMA-SEPARATED
 * LIST of origins allowed to call the API, so a deployment that serves from
 * both a custom domain and a platform URL legitimately sets both. The share
 * cards, canonical links, sitemap and product feed need exactly ONE origin,
 * because "which address is this page really at" has a single right answer.
 *
 * Reading the raw variable in both places was a bug waiting for the day
 * somebody added the second origin: og:url would have become
 * "https://a.com,https://b.com/service/panel-repair" — a URL that is not a URL,
 * on every page, silently.
 *
 * The FIRST entry wins. That makes the ordering meaningful and documented: put
 * the address customers should see in search results at the front.
 */
export function siteOrigin(): string {
    const raw = process.env.FRONTEND_URL ?? "";
    const first = raw.split(",")[0].trim();
    const origin = first || "https://www.promiseelectronics.com";
    return origin.replace(/\/+$/, "");
}
