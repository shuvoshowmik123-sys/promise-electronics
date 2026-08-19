/**
 * A page of its own for every service, without a page being written for any.
 *
 * The site had one set of Open Graph tags, hardcoded in index.html, for forty
 * URLs. So every link shared anywhere — Facebook, WhatsApp, Messenger — showed
 * the same card: "Promise Electronics Customer Portal". Tagging a specific
 * repair under a video was impossible, because there was nothing specific to
 * tag. The whole catalogue read as one shop with one door.
 *
 * Fixing it does NOT need server-side rendering. Facebook's crawler never runs
 * JavaScript and Google runs it slowly and reluctantly, but neither needs the
 * page painted — they need the head to be true. So the head is rewritten here,
 * per URL, from the database, and React boots exactly as before. The visitor
 * sees no difference. The crawler sees everything.
 *
 * Slugs are derived from the name rather than stored, so this needs no
 * migration and no second field for somebody to keep in sync. The cost is that
 * renaming a service changes its URL; the alternative was a column that drifts
 * from the name the moment anybody edits one.
 */
import { getPublicServices, getPublicProducts } from "./publicCatalogCache.js";
import { siteOrigin } from "./siteOrigin.js";

export type PublicPageMeta = {
    title: string;
    description: string;
    canonical: string;
    image: string | null;
    /** Structured data — what turns a blue link into a rich result. */
    jsonLd: Record<string, unknown> | null;
};

/** "32 Inch TV Panel Repair" -> "32-inch-tv-panel-repair" */
export function slugify(name: string): string {
    return String(name)
        .toLowerCase()
        // ASCII only: unicode property escapes need a newer compile target,
        // and a Bangla slug is punycoded into noise by the time it reaches a
        // share card anyway. The Latin part of the name becomes the slug.
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) ||
        // A name with no Latin characters would slug to nothing and collide
        // with every other such name. Ugly but unique beats broken.
        encodeURIComponent(String(name).trim().toLowerCase()).slice(0, 80);
}

/** Escapes a value going into an HTML attribute. Names are staff input. */
function attr(value: string): string {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// One origin for anything a crawler reads. FRONTEND_URL may hold several,
// because CORS treats it as a list — see siteOrigin.ts.

/**
 * Titled the way somebody searches, not the way a catalogue is filed.
 *
 * "32 Inch TV Panel Repair" is what the shop calls it. "32 inch tv panel repair
 * price in dhaka" is what a person types at eleven at night with a dead
 * television. The title has to be the second one or it never meets them.
 */
function serviceTitle(name: string): string {
    return `${name} Price in Dhaka | Promise Electronics`;
}

function serviceDescription(s: {
    name: string;
    description: string | null;
    minPrice: number;
    maxPrice: number;
    estimatedDays: string | null;
}): string {
    const price = s.minPrice === s.maxPrice
        ? `Tk ${Math.round(s.minPrice)}`
        : `Tk ${Math.round(s.minPrice)} to Tk ${Math.round(s.maxPrice)}`;
    const days = s.estimatedDays ? ` Usually ready in ${s.estimatedDays}.` : "";
    const own = s.description
        ? `${s.description.trim().replace(/\s+/g, " ").slice(0, 110)} `
        : "";
    return `${own}${s.name} in Dhaka from ${price}.${days} Free inspection. Pickup and drop available. Book online with Promise Electronics.`.slice(0, 300);
}

async function serviceMeta(slug: string): Promise<PublicPageMeta | null> {
    const rows = await getPublicServices();
    const match = rows.find((r: { name: string }) => slugify(r.name) === slug);
    if (!match) return null;

    const url = `${siteOrigin()}/service/${slug}`;
    return {
        title: serviceTitle(match.name),
        description: serviceDescription(match as any),
        canonical: url,
        image: null,
        /**
         * A price range Google can show beside the result. A searcher comparing
         * three shops picks the one that showed a number.
         */
        jsonLd: {
            "@context": "https://schema.org",
            "@type": "Service",
            name: match.name,
            description: match.description || undefined,
            serviceType: match.category,
            areaServed: { "@type": "City", name: "Dhaka" },
            provider: {
                "@type": "LocalBusiness",
                name: "Promise Electronics",
                address: { "@type": "PostalAddress", addressLocality: "Dhaka", addressCountry: "BD" },
            },
            offers: {
                "@type": "AggregateOffer",
                priceCurrency: "BDT",
                lowPrice: Math.round(match.minPrice),
                highPrice: Math.round(match.maxPrice),
                availability: "https://schema.org/InStock",
                url,
            },
        },
    };
}

async function productMeta(slug: string): Promise<PublicPageMeta | null> {
    const rows = await getPublicProducts();
    const match = rows.find((r: { name: string }) => slugify(r.name) === slug);
    if (!match) return null;

    const url = `${siteOrigin()}/product/${slug}`;
    let image: string | null = null;
    try {
        const parsed = match.images ? JSON.parse(String(match.images)) : null;
        if (Array.isArray(parsed) && parsed[0]) image = String(parsed[0]);
    } catch {
        // An unparseable image list is not a reason to lose the whole page.
    }

    return {
        title: `${match.name} Price in Dhaka | Promise Electronics`,
        description: `${match.name} available in Dhaka at Tk ${Math.round(match.price)}. Genuine part, warranty included, fitted by Promise Electronics.`.slice(0, 300),
        canonical: url,
        image,
        jsonLd: {
            "@context": "https://schema.org",
            "@type": "Product",
            name: match.name,
            description: match.description || undefined,
            category: match.category,
            image: image || undefined,
            offers: {
                "@type": "Offer",
                priceCurrency: "BDT",
                price: Math.round(match.price),
                availability: (match.stock ?? 0) > 0
                    ? "https://schema.org/InStock"
                    : "https://schema.org/OutOfStock",
                url,
            },
        },
    };
}

/** Meta for one public URL, or null when it is not a catalogue page. */
export async function buildPublicPageMeta(url: string): Promise<PublicPageMeta | null> {
    const path = url.split("?")[0].replace(/\/+$/, "");
    const service = path.match(/^\/service\/([^/]+)$/);
    if (service) return serviceMeta(decodeURIComponent(service[1]));
    const product = path.match(/^\/product\/([^/]+)$/);
    if (product) return productMeta(decodeURIComponent(product[1]));
    return null;
}

/**
 * Rewrite the head so the crawler is told the truth about THIS page.
 *
 * Replacement rather than appending: a second og:title does not override the
 * first, it competes with it, and which one wins becomes the crawler's choice
 * rather than ours.
 */
export function applyPublicPageMeta(html: string, meta: PublicPageMeta): string {
    const t = attr(meta.title);
    const d = attr(meta.description);
    const u = attr(meta.canonical);

    let out = html
        .replace(/<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`)
        .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${d}$2`)
        .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, `$1${t}$2`)
        .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, `$1${d}$2`)
        .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/i, `$1${u}$2`);

    if (meta.image) {
        out = out.replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/i, `$1${attr(meta.image)}$2`);
    }

    /**
     * Replace the existing canonical, do not add a second one.
     *
     * index.html already carries a canonical pointing at the home page. This
     * appended another, so every service page shipped TWO — one saying it is
     * the home page and one saying it is itself. Two canonicals is not twice
     * the signal; it is none. Google either picks one at random or discards
     * both, and the page competes with the home page for its own ranking.
     *
     * The same mistake this file warns about for og:title, made two lines
     * further down.
     */
    const CANONICAL = /<link[^>]*rel=["']canonical["'][^>]*>/i;
    const canonicalTag = `<link rel="canonical" href="${u}" />`;
    const extra: string[] = [];
    if (CANONICAL.test(out)) {
        out = out.replace(CANONICAL, canonicalTag);
    } else {
        extra.push(canonicalTag);
    }
    if (meta.jsonLd) {
        // A literal </script> inside the JSON would close this tag early.
        const json = JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c");
        extra.push(`<script type="application/ld+json">${json}</script>`);
    }
    return out.replace(/<\/head>/i, `${extra.join("")}</head>`);
}
