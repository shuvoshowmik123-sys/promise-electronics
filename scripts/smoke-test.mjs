#!/usr/bin/env node
/**
 * Is the system actually up?
 *
 *   npm run test:smoke                      → production
 *   npm run test:smoke -- http://localhost:5193
 *
 * Read-only. Every check is a GET, nothing is created, nothing is signed in as,
 * and no credential is needed — which is what makes it safe to run against
 * production on a whim, and a test nobody is nervous about running is a test
 * that actually gets run.
 *
 * It answers one question: has anything that used to work stopped working. Not
 * whether the arithmetic is right — that is a different kind of test, against a
 * database, with fixtures. This is the thirty-second version you run after a
 * deploy, and it exists because several faults this month would have been
 * caught by it in seconds and instead were found by staff:
 *
 *   - /admin/api/app/* answered by the SPA instead of the server, so the app
 *     download returned a web page and the update check read HTML as JSON
 *   - a release published with no APK, leaving the download 503
 *   - the API awake but the database behind, so every write failed
 *
 * Each check states what it expects and why, because a smoke test whose
 * failures nobody can interpret is just a red light.
 */

const target = (process.argv[2] || "https://promiseelectronics.com").replace(/\/$/, "");
const TIMEOUT_MS = 20_000;

/**
 * @typedef {{ name: string, path: string, expect: number|number[], json?: string[], why: string, allowMissing?: boolean }} Check
 */

/** @type {Check[]} */
const CHECKS = [
    {
        name: "Server is awake",
        path: "/health",
        expect: 200,
        why: "Nothing below this matters if the process is not running.",
    },
    {
        name: "Database is reachable",
        path: "/api/ready",
        expect: 200,
        json: ["ready"],
        why: "The API can answer while the database is behind or asleep — every write then fails while the site looks fine.",
    },
    {
        name: "Module list loads",
        path: "/api/modules",
        expect: 200,
        why: "The admin shell gates every tab on this. If it fails, the panel loads and shows nothing.",
    },
    {
        name: "Session endpoint refuses anonymous callers",
        path: "/api/admin/me",
        expect: 401,
        why: "A 200 here would mean the admin session check passes without a session — the single worst thing this could find.",
    },
    {
        name: "CSRF token is issued",
        path: "/api/admin/csrf-token",
        expect: 200,
        json: ["csrfToken"],
        why: "Every write in the panel and the app needs this first. When it broke, saving anything failed with 'Session validation failed'.",
    },
    {
        name: "Staff app: newest version",
        path: "/admin/api/app/latest",
        expect: 200,
        json: ["version", "downloadUrl"],
        why: "Answered by the SPA rather than the server once, so the download page offered a web page instead of a file.",
    },
    {
        name: "Staff app: the APK itself",
        path: "/admin/api/app/download",
        expect: 200,
        why: "A release published without an APK leaves this 503 and new staff cannot install anything.",
        headOnly: true,
    },
    {
        name: "Staff app: web bundle",
        path: "/admin/api/app/bundle",
        expect: [200, 204],
        why: "204 is fine — that release simply carries no bundle. Anything else means the app cannot update itself.",
    },
    {
        name: "Legacy app path still served",
        path: "/api/app/latest",
        expect: 200,
        why: "Apps already installed ask for this address. Retiring it strands exactly the phones that cannot update.",
    },
    {
        name: "Public site renders",
        path: "/",
        expect: 200,
        why: "Customers see this. It is served by the frontend host, so it fails independently of everything above.",
    },
    {
        name: "Sitemap",
        path: "/sitemap.xml",
        expect: 200,
        why: "Forwarded by a named rule rather than the /api prefix, so it breaks on its own when routing changes.",
    },
];

const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", YELLOW = "\x1b[33m", OFF = "\x1b[0m";

async function run(check) {
    const url = `${target}${check.path}`;
    const expected = Array.isArray(check.expect) ? check.expect : [check.expect];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            method: check.headOnly ? "HEAD" : "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: { Accept: "application/json, text/html", "User-Agent": "promise-smoke-test" },
        });

        if (!expected.includes(res.status)) {
            return { ok: false, detail: `expected ${expected.join(" or ")}, got ${res.status}` };
        }

        /**
         * A 200 is not enough on a JSON route.
         *
         * The failure that started this was a 200 carrying index.html: the
         * status said fine, the body was a web page, and the app tried to read
         * it as JSON. So the named fields are checked, not just the code.
         */
        if (check.json && res.status === 200) {
            const text = await res.text();
            if (text.trimStart().startsWith("<")) {
                return { ok: false, detail: "returned HTML, not JSON — this route is being answered by the frontend" };
            }
            let body;
            try {
                body = JSON.parse(text);
            } catch {
                return { ok: false, detail: "body is not valid JSON" };
            }
            const missing = check.json.filter((k) => body[k] === undefined || body[k] === null);
            if (missing.length) return { ok: false, detail: `missing field(s): ${missing.join(", ")}` };
        }

        return { ok: true, detail: `${res.status}` };
    } catch (err) {
        const aborted = err?.name === "AbortError";
        return { ok: false, detail: aborted ? `no answer in ${TIMEOUT_MS / 1000}s` : (err?.message || "request failed") };
    } finally {
        clearTimeout(timer);
    }
}

const started = Date.now();
console.log(`\n  Smoke test — ${target}\n`);

let failed = 0;
for (const check of CHECKS) {
    const t = Date.now();
    const result = await run(check);
    const ms = Date.now() - t;

    if (result.ok) {
        console.log(`  ${GREEN}pass${OFF}  ${check.name} ${DIM}(${result.detail}, ${ms}ms)${OFF}`);
    } else {
        failed++;
        console.log(`  ${RED}FAIL${OFF}  ${check.name} ${DIM}(${ms}ms)${OFF}`);
        console.log(`        ${RED}${result.detail}${OFF}`);
        console.log(`        ${DIM}${check.why}${OFF}`);
        console.log(`        ${DIM}${target}${check.path}${OFF}`);
    }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log();
if (failed === 0) {
    console.log(`  ${GREEN}All ${CHECKS.length} checks passed${OFF} in ${seconds}s\n`);
} else {
    console.log(`  ${RED}${failed} of ${CHECKS.length} failed${OFF} in ${seconds}s`);
    console.log(`  ${YELLOW}Each failure prints what it expected and why it matters.${OFF}\n`);
}

// Non-zero on failure so this can gate a deploy without anyone reading it.
process.exit(failed === 0 ? 0 : 1);
