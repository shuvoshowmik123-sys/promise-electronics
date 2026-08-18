/**
 * What a crawler is told about a page.
 *
 * The site shipped one set of Open Graph tags in index.html for every URL, so
 * a link to a specific repair shared on Facebook showed the same card as the
 * home page. Facebook's crawler never runs JavaScript, so no amount of React
 * could have fixed it — whatever is in the head when the HTML leaves the
 * server is the entire story that crawler will ever get.
 *
 * These are the pure parts: the slug a name turns into, and the head rewrite.
 * The database lookups belong to an end-to-end run.
 */
import { describe, expect, it } from "vitest";
import { slugify, applyPublicPageMeta, type PublicPageMeta } from "../server/lib/publicPageMeta.js";

const HEAD = `<!doctype html><html><head>
<title>Promise Electronics Customer Portal</title>
<meta name="description" content="Old description" />
<meta property="og:url" content="https://promiseelectronics.com/" />
<meta property="og:title" content="Promise Electronics Customer Portal" />
<meta property="og:description" content="Old description" />
<meta property="og:image" content="https://www.promiseelectronics.com/opengraph.jpg" />
</head><body><div id="root"></div></body></html>`;

const meta = (over: Partial<PublicPageMeta> = {}): PublicPageMeta => ({
    title: "32 Inch TV Panel Repair Price in Dhaka | Promise Electronics",
    description: "32 Inch TV Panel Repair in Dhaka from Tk 3000 to Tk 8000.",
    canonical: "https://www.promiseelectronics.com/service/32-inch-tv-panel-repair",
    image: null,
    jsonLd: { "@context": "https://schema.org", "@type": "Service", name: "32 Inch TV Panel Repair" },
    ...over,
});

describe("the slug a service name becomes", () => {
    it("turns a service name into a readable URL", () => {
        expect(slugify("32 Inch TV Panel Repair")).toBe("32-inch-tv-panel-repair");
    });

    it("collapses punctuation rather than leaving it in the URL", () => {
        expect(slugify("LED Backlight — Repair / Replace (Any Size)"))
            .toBe("led-backlight-repair-replace-any-size");
    });

    it("never starts or ends with a dash", () => {
        expect(slugify("  ...Power Board Repair!!  ")).toBe("power-board-repair");
    });

    it("gives a name with no Latin characters something unique", () => {
        /**
         * A Bangla-only name strips to nothing under an ASCII slug, and every
         * such service would then share the empty slug and resolve to whichever
         * row happened to be first. Ugly but unique beats silently wrong.
         */
        const a = slugify("প্যানেল মেরামত");
        const b = slugify("পাওয়ার বোর্ড");
        expect(a).not.toBe("");
        expect(a).not.toBe(b);
    });
});

describe("the head handed to a crawler", () => {
    it("replaces the title rather than adding a second one", () => {
        const html = applyPublicPageMeta(HEAD, meta());
        expect(html).toContain("<title>32 Inch TV Panel Repair Price in Dhaka | Promise Electronics</title>");
        expect(html).not.toContain("<title>Promise Electronics Customer Portal</title>");
        // Two titles do not override — they compete, and the crawler chooses.
        expect(html.match(/<title>/g)).toHaveLength(1);
    });

    it("points og:url at this page, not the home page", () => {
        const html = applyPublicPageMeta(HEAD, meta());
        expect(html).toContain('content="https://www.promiseelectronics.com/service/32-inch-tv-panel-repair"');
        expect(html).not.toContain('content="https://promiseelectronics.com/"');
        expect(html.match(/og:url/g)).toHaveLength(1);
    });

    it("replaces og:title and og:description, leaving one of each", () => {
        const html = applyPublicPageMeta(HEAD, meta());
        expect(html.match(/og:title/g)).toHaveLength(1);
        expect(html.match(/og:description/g)).toHaveLength(1);
        expect(html).not.toContain("Old description");
    });

    it("keeps the default share image when the page has none", () => {
        // Better a generic shop photo than a card with no picture at all.
        const html = applyPublicPageMeta(HEAD, meta({ image: null }));
        expect(html).toContain("opengraph.jpg");
    });

    it("uses the page's own image when it has one", () => {
        const html = applyPublicPageMeta(HEAD, meta({ image: "https://cdn.example.com/panel.jpg" }));
        expect(html).toContain('content="https://cdn.example.com/panel.jpg"');
        expect(html).not.toContain("opengraph.jpg");
    });

    it("adds a canonical link so two URLs never compete for the same page", () => {
        const html = applyPublicPageMeta(HEAD, meta());
        expect(html).toContain('<link rel="canonical" href="https://www.promiseelectronics.com/service/32-inch-tv-panel-repair" />');
    });

    it("embeds structured data inside the head", () => {
        const html = applyPublicPageMeta(HEAD, meta());
        expect(html).toContain('<script type="application/ld+json">');
        expect(html.indexOf("ld+json")).toBeLessThan(html.indexOf("</head>"));
    });

    it("escapes a quote in a service name instead of breaking the tag", () => {
        /**
         * Names are typed by staff. A 55" in a name would close the content
         * attribute early and put the rest of the title into the markup.
         */
        const html = applyPublicPageMeta(HEAD, meta({ title: 'Repair for 55" TVs' }));
        expect(html).toContain("&quot;");
        expect(html).not.toContain('content="Repair for 55" TVs"');
    });

    it("cannot be made to close the JSON-LD script early", () => {
        // A name containing </script> would end the tag and leak markup.
        const html = applyPublicPageMeta(HEAD, meta({
            jsonLd: { name: "Repair </script><img src=x onerror=alert(1)>" },
        }));
        expect(html).not.toContain("</script><img");
        expect(html).toContain("\\u003c");
    });
});
