/**
 * FRONTEND_URL does two unrelated jobs, and one of them is a list.
 *
 * CORS reads it as a COMMA-SEPARATED set of origins allowed to call the API, so
 * a deployment served from both a custom domain and a platform URL legitimately
 * sets both. Share cards, canonical links, the sitemap and the product feed
 * need exactly ONE, because "which address is this page really at" has a single
 * right answer.
 *
 * Reading the raw variable in both places was a bug waiting for the day
 * somebody added the second origin: og:url would silently have become
 * "https://a.com,https://b.com/service/panel-repair" on every page — a URL that
 * is not a URL, in the one place a crawler is the only reader.
 */
import { describe, expect, it, afterEach } from "vitest";
import { siteOrigin } from "../server/lib/siteOrigin.js";

const original = process.env.FRONTEND_URL;
afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
});

describe("the one origin a crawler is told about", () => {
    it("takes the first entry when several origins are allowed", () => {
        process.env.FRONTEND_URL = "https://www.promiseelectronics.com,https://promise-electronics.vercel.app";
        expect(siteOrigin()).toBe("https://www.promiseelectronics.com");
    });

    it("tolerates spaces around the commas", () => {
        process.env.FRONTEND_URL = " https://www.promiseelectronics.com , https://other.example ";
        expect(siteOrigin()).toBe("https://www.promiseelectronics.com");
    });

    it("uses a single value unchanged", () => {
        process.env.FRONTEND_URL = "https://www.promiseelectronics.com";
        expect(siteOrigin()).toBe("https://www.promiseelectronics.com");
    });

    it("strips a trailing slash, so URLs never double up", () => {
        process.env.FRONTEND_URL = "https://www.promiseelectronics.com/";
        expect(siteOrigin() + "/service/x").toBe("https://www.promiseelectronics.com/service/x");
    });

    it("falls back to the real domain when unset", () => {
        delete process.env.FRONTEND_URL;
        expect(siteOrigin()).toBe("https://www.promiseelectronics.com");
    });

    it("falls back when the value is empty or only commas", () => {
        process.env.FRONTEND_URL = " , ";
        expect(siteOrigin()).toBe("https://www.promiseelectronics.com");
    });
});
