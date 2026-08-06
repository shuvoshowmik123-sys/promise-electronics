import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Customers stay signed in.
 *
 * The reported problem was having to log in on almost every visit, with both
 * password and Google sign-in. This is a TV repair shop: someone books a repair
 * and checks back days later to see where their television is. Re-authenticating
 * between those visits protects nothing — the account holds repair history and
 * an address, and the one genuinely sensitive action, the handover code, is
 * separately gated behind its own OTP.
 *
 * Three settings caused it, and these tests pin all three so a later edit cannot
 * quietly shorten sessions again:
 *
 *   rolling      the cookie expiry was written once at login and never
 *                refreshed, so the clock ran down even for daily users
 *   maxAge       7 days, so any repair lasting longer than a week logged the
 *                customer out mid-repair
 *   sameSite     "none", which opts a first-party cookie into the third-party
 *                cookie restrictions browsers are tightening
 *
 * Asserted against source because the behaviour is configuration. Booting an
 * app and ageing a cookie by 90 days would test the clock, not the config.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const APP = read("server/app.ts");
const CUSTOMER_SESSION = read("server/services/customer-session.service.ts");
const CSRF = read("server/routes/middleware/csrf.ts");

describe("session cookie keeps customers signed in", () => {
    it("rolls the expiry forward on every request", () => {
        // Without this an active customer still ages out, which is the whole
        // complaint: the clock started at login and never moved.
        expect(APP).toMatch(/rolling:\s*true/);
    });

    it("lasts far longer than a repair", () => {
        const m = APP.match(/SESSION_MAX_AGE_DAYS\s*\|\|\s*(\d+)/);
        expect(m, "session lifetime must be configurable with a default").toBeTruthy();
        expect(Number(m![1])).toBeGreaterThanOrEqual(30);
    });

    it("no longer pins a 7-day lifetime anywhere", () => {
        // The old value appeared in three places and they drifted apart.
        for (const [name, src] of [
            ["app", APP],
            ["customer-session", CUSTOMER_SESSION],
            ["csrf", CSRF],
        ] as const) {
            expect(src, name).not.toMatch(/maxAge:\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
        }
    });

    it("is first-party: sameSite is not hardcoded to none", () => {
        // The browser only ever talks to promiseelectronics.com; the API is a
        // same-origin /api/* rewrite. "none" bought nothing and exposed the
        // cookie to third-party blocking.
        expect(APP).not.toMatch(/sameSite:\s*isProduction\s*\?\s*["']none["']/);
        expect(APP).toContain("SESSION_COOKIE_SAMESITE");
    });

    it("keeps secure:true whenever sameSite is none", () => {
        // Browsers reject SameSite=None without Secure, which would drop the
        // cookie entirely — a worse outage than the one being fixed.
        expect(APP).toMatch(/secure:\s*isProduction\s*\|\|\s*sessionSameSite\s*===\s*["']none["']/);
    });

    it("stays httpOnly", () => {
        // Session cookie must never be readable by scripts, however long-lived.
        const cookieBlock = APP.slice(APP.indexOf("const sessionConfig"), APP.indexOf("const usePgSession"));
        expect(cookieBlock).toMatch(/httpOnly:\s*true/);
    });
});

describe("CSRF cookie tracks the session", () => {
    it("uses the same configurable lifetime, in both places that set it", () => {
        // A CSRF cookie that expires before the session leaves the customer
        // apparently signed in while every mutation is rejected — which reads
        // as the site being broken rather than as a session ending.
        for (const [name, src] of [
            ["customer-session", CUSTOMER_SESSION],
            ["csrf middleware", CSRF],
        ] as const) {
            expect(src, name).toContain("SESSION_MAX_AGE_DAYS");
        }
    });

    it("remains readable by scripts, since the client must send it back", () => {
        expect(CSRF).toMatch(/httpOnly:\s*false/);
    });
});
