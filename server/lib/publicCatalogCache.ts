/**
 * The catalogue, held in memory for a few minutes at a time.
 *
 * Three public surfaces read the same two tables on every single request: the
 * sitemap, the Merchant Center feed, and the head rewrite that runs on every
 * view of a service or product page. All three were querying the database each
 * time, and the page-meta one is the worst of them — it reads the WHOLE service
 * table to find one row by slug, on every page view.
 *
 * That is fine for one visitor and bad for the situation this work is meant to
 * cause. The pool holds five connections. A crawler working through a few
 * hundred product pages, or a competitor pulling the feed on a loop, would sit
 * on all five and the shop's own admin panel would slow to a crawl beside it —
 * a denial of service nobody had to intend.
 *
 * So it is read once and kept. The catalogue changes when somebody edits a
 * product, which is a few times a week; five minutes of staleness costs a
 * newly-added item a short wait before it appears in search, and buys immunity
 * from being scraped at any volume.
 *
 * In-process on purpose. A shared cache would be a second thing to run and
 * fail; with one server process this is enough, and with several the worst case
 * is each holding its own copy for five minutes.
 */
import { db } from "../db.js";
import { serviceCatalog, inventoryItems } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

const TTL_MS = 5 * 60 * 1000;

type Cached<T> = { value: T; expires: number };

let services: Cached<Array<typeof serviceCatalog.$inferSelect>> | null = null;
let products: Cached<Array<typeof inventoryItems.$inferSelect>> | null = null;

/**
 * One in-flight read, however many callers arrive at once.
 *
 * Without this, a burst that lands the moment the cache expires sends every
 * request to the database together — the exact stampede the cache exists to
 * prevent, just moved to a five-minute rhythm.
 */
let servicesInFlight: Promise<any> | null = null;
let productsInFlight: Promise<any> | null = null;

export async function getPublicServices() {
    const now = Date.now();
    if (services && services.expires > now) return services.value;
    if (servicesInFlight) return servicesInFlight;

    servicesInFlight = db
        .select()
        .from(serviceCatalog)
        .where(eq(serviceCatalog.isActive, true))
        .then((rows) => {
            services = { value: rows, expires: Date.now() + TTL_MS };
            return rows;
        })
        .finally(() => {
            servicesInFlight = null;
        });

    return servicesInFlight;
}

export async function getPublicProducts() {
    const now = Date.now();
    if (products && products.expires > now) return products.value;
    if (productsInFlight) return productsInFlight;

    productsInFlight = db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.showOnWebsite, true))
        .then((rows) => {
            products = { value: rows, expires: Date.now() + TTL_MS };
            return rows;
        })
        .finally(() => {
            productsInFlight = null;
        });

    return productsInFlight;
}

/**
 * Drop the cache after an edit, so a corrected price is not public for five
 * more minutes. Cheap to call and safe to call too often.
 */
export function invalidatePublicCatalog(): void {
    services = null;
    products = null;
}
