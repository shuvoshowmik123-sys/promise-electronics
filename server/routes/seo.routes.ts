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
import { logRouteError } from "../utils/route-error.js";

const router = Router();

function origin(): string {
    return (process.env.FRONTEND_URL || "https://www.promiseelectronics.com").replace(/\/$/, "");
}

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
    { loc: "/track-order", changefreq: "monthly", priority: "0.5" },
    { loc: "/about", changefreq: "monthly", priority: "0.4" },
    { loc: "/contact", changefreq: "monthly", priority: "0.5" },
    { loc: "/warranty-policy", changefreq: "yearly", priority: "0.3" },
    { loc: "/terms", changefreq: "yearly", priority: "0.2" },
    { loc: "/privacy", changefreq: "yearly", priority: "0.2" },
];

router.get("/sitemap.xml", async (req: Request, res: Response) => {
    try {
        const base = origin();
        const entries: Entry[] = [...STATIC_PAGES];

        const services = await db
            .select({ name: serviceCatalog.name })
            .from(serviceCatalog)
            .where(eq(serviceCatalog.isActive, true));
        for (const s of services) {
            entries.push({ loc: `/service/${slugify(s.name)}`, changefreq: "weekly", priority: "0.9" });
        }

        const products = await db
            .select({ name: inventoryItems.name })
            .from(inventoryItems)
            .where(eq(inventoryItems.showOnWebsite, true));
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

router.get("/robots.txt", (_req: Request, res: Response) => {
    /**
     * The admin panel and the customer's own pages are disallowed — not as
     * security (anyone can read robots.txt and it enforces nothing), but so a
     * crawler does not waste its budget on pages it can never render, and so a
     * customer's tracking link never turns up in somebody else's search.
     */
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(
        [
            "User-agent: *",
            "Allow: /",
            "Disallow: /admin",
            "Disallow: /tech",
            "Disallow: /corporate",
            "Disallow: /my-repairs",
            "Disallow: /track-order?",
            "Disallow: /api/",
            "",
            `Sitemap: ${origin()}/sitemap.xml`,
            "",
        ].join("\n"),
    );
});

export default router;
