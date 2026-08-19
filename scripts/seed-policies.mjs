#!/usr/bin/env node
/**
 * Publish any policy page that is missing from a database.
 *
 * This started as a one-off for the return policy, which existed everywhere
 * except the database customers actually read. Then QA found /warranty-policy
 * answering 404 on the live site for the same reason — a page, a route and a
 * link, with no row behind them.
 *
 * Two of the four policies had the same fault, so the tool is now general. A
 * one-off script for a recurring mistake is just the mistake with extra steps.
 *
 * ONLY MISSING POLICIES ARE WRITTEN. An existing row is left exactly as it is,
 * because the shop may have edited it in the admin panel and this file may be
 * older than that edit. Overwriting live legal text from a repository copy is
 * how a shop ends up publishing terms nobody agreed to. Use --force to replace,
 * and expect to be asked to confirm each one.
 *
 * Usage:  npm run seed:policies
 *         npm run seed:policies -- --force
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEGAL = path.join(ROOT, "docs", "legal");

/**
 * File to slug. The slugs are fixed by validPolicySlugs in settings.routes.ts
 * and by the URLs the React pages fetch — they are not free to invent here.
 */
const POLICIES = [
    { file: "privacy-policy.md", slug: "privacy", title: "Privacy Policy" },
    { file: "terms-and-conditions.md", slug: "terms", title: "Terms and Conditions" },
    { file: "warranty-policy.md", slug: "warranty", title: "Warranty Policy" },
    { file: "return-policy.md", slug: "returns", title: "Return Policy" },
];

const FORCE = process.argv.includes("--force");
const CTRL_C = String.fromCharCode(3);
const BACKSPACE = String.fromCharCode(127);

const interactive = process.stdin.isTTY === true;
let piped = [];
if (!interactive) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    piped = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
}
let pipedIndex = 0;
const nextPiped = () => String(piped[pipedIndex++] ?? "").trim();

/** Raw mode, not a muted readline — readline redraws and wipes the prompt. */
function askHidden(question) {
    if (!interactive) { process.stdout.write(question + "\n"); return Promise.resolve(nextPiped()); }
    return new Promise((resolve, reject) => {
        const stdin = process.stdin;
        if (typeof stdin.setRawMode !== "function") {
            reject(new Error("this terminal cannot hide what you type"));
            return;
        }
        process.stdout.write(question);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf8");
        let value = "";
        const finish = (done) => {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener("data", onData);
            process.stdout.write("\n");
            done();
        };
        const onData = (chunk) => {
            for (const char of String(chunk)) {
                if (char === "\r" || char === "\n") { finish(() => resolve(value.trim())); return; }
                if (char === CTRL_C) { finish(() => { console.log("Cancelled."); process.exit(130); }); return; }
                if (char === BACKSPACE || char === "\b") { value = value.slice(0, -1); continue; }
                if (char < " ") continue;
                value += char;
            }
        };
        stdin.on("data", onData);
    });
}

function ask(question) {
    if (!interactive) { process.stdout.write(question + "\n"); return Promise.resolve(nextPiped()); }
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (a) => { rl.close(); resolve(String(a).trim()); });
    });
}

// ── read what we have to offer ───────────────────────────────────────────
const available = [];
for (const p of POLICIES) {
    const full = path.join(LEGAL, p.file);
    let content;
    try { content = fs.readFileSync(full, "utf8").trim(); } catch { continue; }
    // A near-empty policy on a live shop is worse than none: a promise nobody
    // can hold the shop to, and a customer cannot rely on.
    if (content.length < 200) {
        console.warn(`  Skipping ${p.slug}: ${p.file} is only ${content.length} characters.`);
        continue;
    }
    available.push({ ...p, content });
}

if (available.length === 0) {
    console.error(`\nNo readable policy files in ${LEGAL}.`);
    process.exit(1);
}

console.log("");
console.log("  Policies available to publish:");
for (const p of available) {
    console.log(`    ${p.slug.padEnd(10)} ${String(p.content.length).padStart(6)} chars   ${p.file}`);
}
console.log("");
console.log(FORCE
    ? "  --force: existing policies WILL be replaced, one confirmation each."
    : "  Only MISSING policies will be written. Existing ones are left alone.");
console.log("");

let raw;
try {
    raw = await askHidden("Paste the DATABASE_URL (nothing will appear): ");
} catch (error) {
    console.error(`\nCannot read the URL safely: ${error.message}`);
    process.exit(1);
}
if (!raw) { console.error("\nNothing pasted. No database was contacted."); process.exit(1); }

let host, database, url;
try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
    if (protocol !== "postgres" && protocol !== "postgresql") {
        throw new Error(`expected a postgres:// URL, got ${protocol}://`);
    }
    host = parsed.hostname;
    database = parsed.pathname.replace(/^\//, "") || "(default)";
    parsed.searchParams.set("sslmode", "no-verify");  // Aiven self-signs
    url = parsed.toString();
} catch (error) {
    // Never echoed: a malformed URL is still a password.
    console.error(`\nThat does not look like a database URL: ${error.message}`);
    process.exit(1);
}

console.log("");
console.log("  Target host : " + host);
console.log("  Database    : " + database);
console.log("");

const confirm = await ask("  Type PUBLISH to continue, or press Enter to cancel: ");
if (confirm !== "PUBLISH") { console.log("\nCancelled. Nothing was changed."); process.exit(0); }

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const results = [];
try {
    for (const p of available) {
        const existing = await pool.query("SELECT slug FROM policies WHERE slug = $1", [p.slug]);
        const present = existing.rows.length > 0;

        if (present && !FORCE) {
            results.push({ slug: p.slug, action: "left alone (already published)" });
            continue;
        }
        if (present && FORCE) {
            const ok = await ask(`  Replace the live "${p.slug}" policy? Type YES: `);
            if (ok !== "YES") { results.push({ slug: p.slug, action: "skipped by you" }); continue; }
        }

        await pool.query(
            `INSERT INTO policies (id, slug, title, content, is_published, is_published_app, last_updated)
             VALUES ($1, $2, $3, $4, true, true, now())
             ON CONFLICT (slug) DO UPDATE
               SET title = EXCLUDED.title, content = EXCLUDED.content, last_updated = now()`,
            [`policy-${p.slug}`, p.slug, p.title, p.content],
        );
        results.push({ slug: p.slug, action: present ? "REPLACED" : "created" });
    }

    /**
     * Read every slug back. The failure this tool exists for was a write that
     * succeeded against the wrong database while the right one stayed empty —
     * "no error" was mistaken for "the page works".
     */
    console.log("");
    for (const p of POLICIES) {
        const r = await pool.query(
            "SELECT is_published, length(content) AS len FROM policies WHERE slug = $1", [p.slug]);
        const done = results.find((x) => x.slug === p.slug);
        const state = r.rows.length === 0
            ? "MISSING — the page will show an error"
            : `${r.rows[0].len} chars, published ${r.rows[0].is_published}`;
        console.log(`    ${p.slug.padEnd(10)} ${state}${done ? `   [${done.action}]` : ""}`);
    }
    console.log("");
    console.log("  Now OPEN each page and read it. A row existing is not the same as");
    console.log("  a page working — that mistake is why this script exists.");
} catch (error) {
    console.error("\n  Failed: " + error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
