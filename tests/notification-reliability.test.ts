import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Three faults reported from the shop floor, all in the same area: taps that
 * went nowhere, the browser's own logo instead of ours, and staff being signed
 * out several times a day.
 *
 * None were visible in a log. Each one quietly erodes trust in the whole
 * notification system, and a notification system people distrust stops
 * producing the parts declarations and attendance records it exists to collect.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const PUSH = read("server/pushService.ts");
const FCM = read("server/services/fcm.service.ts");
const SW = read("client/public/sw.js");
const APP = read("server/app.ts");
const NUDGE = read("server/services/nudge-scheduler.service.ts");

describe("a notification lands on the thing it is about", () => {
    it("the service worker navigates to data.url", () => {
        expect(SW).toContain("event.notification.data?.url");
    });

    it("every push sender sets a url, because the fallback is the home page", () => {
        /**
         * The worker falls back to "/" when data.url is absent. Several senders
         * carried only `type` and a ticket number, so every tap opened the home
         * page — which reads to staff as "the notification is broken".
         */
        const senders = [
            "notifyOrderStatusChange",
            "notifyQuoteReady",
            "notifyQuoteAccepted",
            "notifyPromotional",
        ];
        for (const fn of senders) {
            const start = PUSH.indexOf(`export async function ${fn}`);
            expect(start, `${fn} not found`).toBeGreaterThan(-1);
            const body = PUSH.slice(start, PUSH.indexOf("\n}", start));
            expect(body, `${fn} must set data.url`).toMatch(/\burl:/);
        }
    });

    it("staff nudges carry their deep link through to data.url", () => {
        const NOTIFY = read("server/services/staff-assignment-notify.service.ts");
        expect(NOTIFY).toMatch(/data:\s*\{[^}]*url:\s*input\.link/s);
    });

    it("promotional pushes no longer rely on a key the worker never reads", () => {
        // `route` was set and never read; only `url` reaches the worker.
        const start = PUSH.indexOf("export async function notifyPromotional");
        const body = PUSH.slice(start, PUSH.indexOf("\n}", start));
        expect(body).toMatch(/url:\s*route \|\|/);
    });
});

describe("the notification shows our logo, not the browser's", () => {
    it("push payloads point at the small notification icon", () => {
        for (const [name, src] of [["pushService", PUSH], ["fcm", FCM]] as const) {
            expect(src, name).toContain("/notification-icon.png");
            expect(src, name).not.toMatch(/icon:\s*'\/logo\.png'/);
        }
        expect(SW).toContain("/notification-icon.png");
    });

    it("the icon is small enough for the browser to actually fetch", () => {
        /**
         * logo.png is 1024x1024 and ~331KB. Chrome fetches a notification icon
         * with a short timeout and silently substitutes its own logo when that
         * fails, which is why this looked intermittent rather than broken.
         */
        const bytes = statSync(join(process.cwd(), "client/public/notification-icon.png")).size;
        expect(bytes).toBeLessThan(60 * 1024);
        expect(bytes).toBeGreaterThan(1024);
    });

    it("the service worker cache is bumped so devices pick the icon up", () => {
        expect(SW).toMatch(/CACHE_NAME = 'promise-electronics-v[89]'/);
        expect(SW).toContain("'/notification-icon.png',");
    });
});

describe("sessions survive a restart", () => {
    it("persistence does not depend on NODE_ENV being set correctly", () => {
        /**
         * This required NODE_ENV === "production" before using Postgres. Unset
         * or misspelled on the host, the server falls back to MemoryStore and
         * every restart signs everyone out — several times a day on a plan that
         * sleeps when idle. A long cookie cannot help once the server has
         * forgotten the session.
         */
        expect(APP).not.toMatch(/const usePgSession = isProduction \|\|/);
        expect(APP).toMatch(/usePgSession = !isTestEnv && process\.env\.SESSION_STORE !== "memory"/);
    });

    it("tests keep an isolated in-memory store", () => {
        expect(APP).toContain('const isTestEnv = process.env.NODE_ENV === "test"');
    });

    it("warns loudly when sessions cannot be persisted", () => {
        // Silent memory sessions present as unexplained logouts, never an error.
        expect(APP).toMatch(/sessions are in memory and will be LOST on restart/);
    });
});

describe("nobody is chased on a day the shop is closed", () => {
    it("attendance and parts sweeps skip rest days and holidays", () => {
        expect(NUDGE).toContain("isNonWorkingDay");
        expect(NUDGE).toMatch(/const closed = await isNonWorkingDay\(runDay\)/);
    });

    it("stalled jobs are still swept on a closed day", () => {
        // A job stuck four days is not less stuck because today is Friday, and
        // that nudge is about work in the shop, not somebody's attendance.
        const sweepBlock = NUDGE.slice(NUDGE.indexOf("const sweeps = closed"));
        const closedBranch = sweepBlock.slice(0, sweepBlock.indexOf(": ("));
        expect(closedBranch).toContain("STALE_JOB_SWEEP_FAILED");
        expect(closedBranch).not.toContain("ATTENDANCE_SWEEP_FAILED");
        expect(closedBranch).not.toContain("PARTS_SWEEP_FAILED");
    });

    it("rest days and holidays come from settings, not from code", () => {
        expect(NUDGE).toContain("shop.restDays");
        expect(NUDGE).toContain("shop.holidays");
    });

    it("defaults to Friday closed for this shop", () => {
        expect(NUDGE).toMatch(/DEFAULT_REST_DAYS = \[5\]/);
    });

    it("a broken setting never silences a real working day", () => {
        // Skipping a workday by accident is unrecoverable; nudging on a rest
        // day by accident is merely annoying. The failure path must favour
        // nudging.
        const fn = NUDGE.slice(NUDGE.indexOf("export async function isNonWorkingDay"));
        const body = fn.slice(0, fn.indexOf("\n}"));
        expect(body).toMatch(/catch\s*\{[^}]*return false/s);
    });

    it("the weekday is read from the Dhaka day, not the server clock", () => {
        expect(NUDGE).toMatch(/new Date\(`\$\{runDay\}T12:00:00Z`\)\.getUTCDay\(\)/);
    });
});
