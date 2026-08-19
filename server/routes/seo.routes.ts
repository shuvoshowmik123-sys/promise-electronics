/**
 * The list of pages Google is allowed to know about.
 *
 * Without a sitemap a crawler finds only what it can reach by following links
 * from the home page — and on a JavaScript site it often cannot follow them at
 * all. Every service in the catalogue was therefore invisible to search, which
 * is why the shop ranked for its own name and nothing else.
 *
 * Generated from the database on request rather than written to a file, so
 * adding a service in the admin panel publishes its page. Nobody maintains a
 * list, so the list cannot fall behind.
 */
import { Router, type Request, type Response } from "express";
import { db } from "../db.js";
import { serviceCatalog, inventoryItems } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { slugify } from "../lib/publicPageMeta.js";
import { getPublicServices, getPublicProducts } from "../lib/publicCatalogCache.js";
import { siteOrigin } from "../lib/siteOrigin.js";
import { logRouteError } from "../utils/route-error.js";
import { requireAdminAuth } from "./middleware/auth.js";

const router = Router();

// One origin for anything a crawler reads. FRONTEND_URL may hold several,
// because CORS treats it as a list — see siteOrigin.ts.
const origin = siteOrigin;

function xmlEscape(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Entry = { loc: string; changefreq: string; priority: string };

/** Pages that exist whether or not the catalogue has anything in it. */
const STATIC_PAGES: Entry[] = [
    { loc: "/", changefreq: "weekly", priority: "1.0" },
    { loc: "/services", changefreq: "weekly", priority: "0.9" },
    { loc: "/shop", changefreq: "weekly", priority: "0.8" },
    { loc: "/repair-request", changefreq: "monthly", priority: "0.8" },
    { loc: "/request-part", changefreq: "monthly", priority: "0.7" },
    { loc: "/track-order", changefreq: "monthly", priority: "0.5" },
    { loc: "/about", changefreq: "monthly", priority: "0.4" },
    { loc: "/contact", changefreq: "monthly", priority: "0.5" },
    { loc: "/warranty-policy", changefreq: "yearly", priority: "0.3" },
    // Google requires a reachable return policy before it will list products.
    { loc: "/return-policy", changefreq: "yearly", priority: "0.3" },
    { loc: "/terms", changefreq: "yearly", priority: "0.2" },
    { loc: "/privacy", changefreq: "yearly", priority: "0.2" },
];

router.get("/sitemap.xml", async (req: Request, res: Response) => {
    try {
        const base = origin();
        const entries: Entry[] = [...STATIC_PAGES];

        const services = await getPublicServices();
        for (const s of services) {
            entries.push({ loc: `/service/${slugify(s.name)}`, changefreq: "weekly", priority: "0.9" });
        }

        const products = await getPublicProducts();
        for (const p of products) {
            entries.push({ loc: `/product/${slugify(p.name)}`, changefreq: "weekly", priority: "0.7" });
        }

        const body = entries
            .map((e) =>
                `  <url><loc>${xmlEscape(base + e.loc)}</loc>` +
                `<changefreq>${e.changefreq}</changefreq>` +
                `<priority>${e.priority}</priority></url>`,
            )
            .join("\n");

        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        // An hour: long enough to spare the database, short enough that a
        // service added this morning is discoverable this afternoon.
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
    } catch (error) {
        logRouteError("sitemap.xml", req, error);
        // A sitemap that errors is worse than a small one: a 500 teaches the
        // crawler to stop asking. The static pages are always true.
        const base = origin();
        const body = STATIC_PAGES
            .map((e) => `  <url><loc>${xmlEscape(base + e.loc)}</loc></url>`)
            .join("\n");
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
    }
});

/**
 * A product feed Google reads by itself.
 *
 * The Business Profile has a Products section, and filling it in by hand is a
 * job that is done once and then rots — a price changes in the admin panel and
 * the listing quietly lies until somebody remembers. Merchant Center solves it
 * the other way round: Google is given one URL, fetches it daily, and the
 * listing follows whatever the shop actually sells.
 *
 * RSS 2.0 with the g: namespace, which is Merchant Center's oldest and least
 * fussy format. id, title, description, link, image_link, availability, price
 * and condition are required; an item missing any of them is rejected on
 * ingest rather than shown wrong, so incomplete rows are skipped here instead.
 *
 * Products only. A repair service is not a product in Merchant Center's sense
 * and would be refused; services belong in the Business Profile's own Services
 * section, which has no feed and is filled in by hand.
 */
router.get("/product-feed.xml", async (req: Request, res: Response) => {
    try {
        const base = origin();
        const items = await getPublicProducts();

        const entries: string[] = [];
        let skipped = 0;

        for (const item of items) {
            let image: string | null = null;
            try {
                const parsed = item.images ? JSON.parse(String(item.images)) : null;
                if (Array.isArray(parsed) && parsed[0]) image = String(parsed[0]);
            } catch { /* a bad image list should not poison the whole feed */ }

            /**
             * Skipped rather than guessed at. Merchant Center rejects an item
             * with a missing required field anyway, and a placeholder image or
             * an invented price would be worse than an absent listing.
             */
            const price = Number(item.price);
            if (!item.name || !image || !Number.isFinite(price) || price <= 0) {
                skipped++;
                continue;
            }

            const description = (item.description || item.name)
                .replace(/\s+/g, " ")
                .slice(0, 5000);

            entries.push([
                "    <item>",
                `      <g:id>${xmlEscape(item.id)}</g:id>`,
                `      <title>${xmlEscape(item.name.slice(0, 150))}</title>`,
                `      <description>${xmlEscape(description)}</description>`,
                `      <link>${xmlEscape(`${base}/product/${slugify(item.name)}`)}</link>`,
                `      <g:image_link>${xmlEscape(image)}</g:image_link>`,
                "      <g:condition>new</g:condition>",
                `      <g:availability>${(item.stock ?? 0) > 0 ? "in stock" : "out of stock"}</g:availability>`,
                `      <g:price>${Math.round(price)} BDT</g:price>`,
                `      <g:brand>${xmlEscape("Promise Electronics")}</g:brand>`,
                `      <g:mpn>${xmlEscape(item.id)}</g:mpn>`,
                item.category ? `      <g:product_type>${xmlEscape(item.category)}</g:product_type>` : "",
                "    </item>",
            ].filter(Boolean).join(String.fromCharCode(10)));
        }

        if (skipped > 0) {
            // Said out loud, because a silently short feed is the failure mode
            // that gets noticed months later as "Google only shows six things".
            console.warn(`[product-feed] ${skipped} product(s) skipped: missing name, image or price.`);
        }

        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(
            `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Promise Electronics</title>
    <link>${xmlEscape(base)}</link>
    <description>TV parts and spares, Dhaka</description>
${entries.join(String.fromCharCode(10))}
  </channel>
</rss>`,
        );
    } catch (error) {
        logRouteError("product-feed", req, error);
        res.status(500).send("<?xml version=\"1.0\"?><rss version=\"2.0\"><channel></channel></rss>");
    }
});

/**
 * robots.txt is NOT served here.
 *
 * client/public/robots.txt is a hand-tuned file with per-crawler rules and
 * specific allowances for the policy endpoints Google must read. Vercel
 * serves static files before it applies rewrites, so a route here would never
 * run on the live domain — it would only answer on the Render origin, giving
 * two robots.txt files that disagree and one of them unreachable.
 *
 * One file, in client/public, where the rules can be read and reviewed.
 */

/**
 * Every public link the shop can share, in one list it can copy from.
 *
 * The pages and their share cards existed before this did, which made them
 * useless: a service page is only worth having if somebody can paste it under
 * a video. Services are loaded by CSV import and have no per-row editor, so
 * there was no screen anywhere that could show a link beside a service name.
 *
 * Read-only and admin-only. It exposes nothing the public pages do not already
 * show, but the full catalogue in one response is a convenience for the shop
 * rather than for a scraper.
 */
router.get("/api/admin/public-links", requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const base = origin();

        const services = await db
            .select({ name: serviceCatalog.name, category: serviceCatalog.category })
            .from(serviceCatalog)
            .where(eq(serviceCatalog.isActive, true));

        const products = await db
            .select({ name: inventoryItems.name, category: inventoryItems.category })
            .from(inventoryItems)
            .where(eq(inventoryItems.showOnWebsite, true));

        res.json({
            links: [
                ...services.map((s) => ({
                    type: "service" as const,
                    name: s.name,
                    category: s.category,
                    url: `${base}/service/${slugify(s.name)}`,
                })),
                ...products.map((p) => ({
                    type: "product" as const,
                    name: p.name,
                    category: p.category,
                    url: `${base}/product/${slugify(p.name)}`,
                })),
            ],
        });
    } catch (error) {
        logRouteError("public-links", req, error);
        res.status(500).json({ error: "Could not build the link list" });
    }
});

export default router;
