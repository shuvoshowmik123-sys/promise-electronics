#!/usr/bin/env node
/**
 * Put the return policy into a database, without the credential touching disk.
 *
 * The policy page was written, the route registered, the sitemap updated — and
 * the row was inserted into the DEVELOPMENT database only. So the live page,
 * the one Google requires before it will list a single product, answered 404
 * and showed a customer "We could not load this page".
 *
 * That is the second time a chain has been built and not walked to the end. The
 * page existing is not the same as the page working, and neither is the same as
 * the page working WHERE THE CUSTOMER IS.
 *
 * The text comes from docs/legal/return-policy.md so it is version-controlled
 * and reviewable in a pull request, rather than living only inside a database
 * nobody reads. The shop can still edit it afterwards in the admin panel; this
 * script only puts a correct starting point in place.
 *
 * Usage:  npm run seed:return-policy
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_FILE = path.join(ROOT, "docs", "legal", "return-policy.md");

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

/**
 * Hidden input by raw mode rather than a muted readline.
 *
 * readline redraws the line when it takes over, which wipes the prompt printed
 * a moment earlier — the script then looks frozen while it waits for a paste
 * nobody knows it wants. That exact bug was reported on the migration tool.
 */
function askHidden(question) {
    if (!interactive) {
        process.stdout.write(question + "\n");
        return Promise.resolve(nextPiped());
    }
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
                if (char === CTRL_C) {
                    finish(() => { console.log("Cancelled. Nothing was contacted."); process.exit(130); });
                    return;
                }
                if (char === BACKSPACE || char === "\b") { value = value.slice(0, -1); continue; }
                if (char < " ") continue;
                value += char;
            }
        };
        stdin.on("data", onData);
    });
}

function ask(question) {
    if (!interactive) {
        process.stdout.write(question + "\n");
        return Promise.resolve(nextPiped());
    }
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => { rl.close(); resolve(String(answer).trim()); });
    });
}

// ── the policy text ──────────────────────────────────────────────────────
let content;
try {
    content = fs.readFileSync(POLICY_FILE, "utf8").trim();
} catch {
    console.error(`\nCannot read ${POLICY_FILE}.`);
    console.error("The policy text lives in the repository, not in this script.");
    process.exit(1);
}
if (content.length < 200) {
    // A near-empty policy published to a live shop is worse than none: it is a
    // promise nobody can hold the shop to and a customer cannot rely on.
    console.error("\nThe policy file looks too short to be a real policy. Refusing to publish it.");
    process.exit(1);
}

console.log("");
console.log("  Return policy to publish:");
console.log("  " + POLICY_FILE);
console.log(`  ${content.length} characters, ${content.split("\n").length} lines`);
console.log("");
console.log("  First lines:");
for (const line of content.split("\n").slice(0, 3)) console.log("    " + line);
console.log("");

let raw;
try {
    raw = await askHidden("Paste the DATABASE_URL to publish it to (nothing will appear): ");
} catch (error) {
    console.error(`\nCannot read the URL safely: ${error.message}`);
    process.exit(1);
}
if (!raw) {
    console.error("\nNothing pasted. Stopping — no database was contacted.");
    process.exit(1);
}

let host, database, url;
try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
    if (protocol !== "postgres" && protocol !== "postgresql") {
        throw new Error(`expected a postgres:// URL, got ${protocol}://`);
    }
    host = parsed.hostname;
    database = parsed.pathname.replace(/^\//, "") || "(default)";
    // Aiven presents a self-signed chain; sslmode=require fails outright.
    parsed.searchParams.set("sslmode", "no-verify");
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
console.log("  This writes ONE row: the policy with slug 'returns'.");
console.log("  It touches nothing else. An existing returns policy is replaced.");
console.log("");

const confirm = await ask("  Type PUBLISH to continue, or press Enter to cancel: ");
if (confirm !== "PUBLISH") {
    console.log("\nCancelled. Nothing was changed.");
    process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
    const before = await pool.query("SELECT slug FROM policies WHERE slug = $1", ["returns"]);
    await pool.query(
        `INSERT INTO policies (id, slug, title, content, is_published, is_published_app, last_updated)
         VALUES ($1, $2, $3, $4, true, true, now())
         ON CONFLICT (slug) DO UPDATE
           SET title = EXCLUDED.title, content = EXCLUDED.content, last_updated = now()`,
        ["policy-returns", "returns", "Return Policy", content],
    );

    /**
     * Read it back rather than trusting the insert.
     *
     * The whole reason this script exists is a write that succeeded against the
     * wrong database while the right one stayed empty. "No error" is not the
     * same as "the page now works".
     */
    const after = await pool.query(
        "SELECT title, is_published, length(content) AS len FROM policies WHERE slug = $1",
        ["returns"],
    );
    if (after.rows.length === 0) throw new Error("the row is not there after writing it");

    console.log("");
    console.log(`  ${before.rows.length > 0 ? "Replaced" : "Created"}: ${after.rows[0].title}`);
    console.log(`  Published: ${after.rows[0].is_published} · ${after.rows[0].len} characters`);
    console.log("");
    console.log("  Now open /return-policy on that site and read it. The row existing");
    console.log("  is not the same as the page working — that mistake is why this");
    console.log("  script exists.");
} catch (error) {
    console.error("\n  Failed: " + error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
