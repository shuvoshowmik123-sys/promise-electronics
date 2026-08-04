#!/usr/bin/env node
/**
 * Read-only window onto the Render service.
 *
 * The point of this script is that the credential stays in one untracked file
 * and never reaches a terminal, a log, a report, or a chat window. Whoever runs
 * it gets answers — deploy status, logs, build failures, which environment
 * variables exist — without ever handling the key.
 *
 * Everything here is READ-ONLY by design. There is deliberately no command to
 * set an environment variable, trigger a deploy, or change service settings: a
 * tool that can answer questions should not also be able to restart production
 * by accident.
 *
 * Setup
 * -----
 *   1. Create `.env.render.local` in the repo root (already covered by the
 *      `.env.*` rule in .gitignore — verify with `git check-ignore`):
 *
 *        RENDER_API_KEY=rnd_xxxxxxxxxxxxxxxxxxxx
 *        RENDER_SERVICE_ID=srv-xxxxxxxxxxxxxxxxxxxx
 *
 *   2. Run:  node scripts/render-status.mjs <command>
 *
 * Commands
 * --------
 *   status              service state, last deploy, live commit
 *   deploys [n]         recent deploys with status and commit
 *   logs [n]            recent runtime log lines
 *   build-logs [id]     build output for a deploy (defaults to the latest)
 *   errors [n]          recent log lines that look like failures
 *   env-names           environment variable NAMES only — never values
 *   env-check <NAME>    whether one variable is set, its length and first char
 *
 * `env-check` reports shape rather than content on purpose: enough to tell a
 * real key from an empty string or a pasted placeholder, without printing a
 * secret that would then live in the scrollback.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CRED_FILE = resolve(ROOT, ".env.render.local");

function loadCredentials() {
    let raw = "";
    try {
        raw = readFileSync(CRED_FILE, "utf8");
    } catch {
        fail(
            `Missing ${CRED_FILE}\n\n` +
            `Create it with:\n` +
            `  RENDER_API_KEY=rnd_...\n` +
            `  RENDER_SERVICE_ID=srv-...\n\n` +
            `It is untracked (.gitignore covers .env.*), so the key stays local.`,
        );
    }

    const values = {};
    for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m) values[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }

    const apiKey = values.RENDER_API_KEY || process.env.RENDER_API_KEY;
    const serviceId = values.RENDER_SERVICE_ID || process.env.RENDER_SERVICE_ID;
    if (!apiKey) fail("RENDER_API_KEY missing from .env.render.local");
    if (!serviceId) fail("RENDER_SERVICE_ID missing from .env.render.local");
    return { apiKey, serviceId };
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

/**
 * Belt and braces: if a Render key ever appears in something we are about to
 * print, redact it. The script should be incapable of leaking the credential
 * even if a future command echoes a request back.
 */
function redact(text) {
    return String(text).replace(/rnd_[A-Za-z0-9]{10,}/g, "rnd_***REDACTED***");
}

const say = (...args) => console.log(redact(args.join(" ")));

async function api(path, { apiKey }) {
    const res = await fetch(`https://api.render.com/v1${path}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        fail(`Render API ${res.status} on ${path}\n${redact(body.slice(0, 300))}`);
    }
    return res.json();
}

/** Render wraps list items as { deploy: {...} } / { envVar: {...} }. */
const unwrap = (row, key) => row?.[key] ?? row;

const commands = {
    async status(ctx) {
        const svc = await api(`/services/${ctx.serviceId}`, ctx);
        const deploys = await api(`/services/${ctx.serviceId}/deploys?limit=1`, ctx);
        const latest = unwrap(deploys[0], "deploy");
        say(`service    : ${svc.name} (${svc.type})`);
        say(`suspended  : ${svc.suspended}`);
        say(`branch     : ${svc.branch ?? "-"}`);
        say(`url        : ${svc.serviceDetails?.url ?? "-"}`);
        say(`last deploy: ${latest?.status} · commit ${(latest?.commit?.id ?? "").slice(0, 7)} · ${latest?.finishedAt ?? "in progress"}`);
    },

    async deploys(ctx, limit = "10") {
        const rows = await api(`/services/${ctx.serviceId}/deploys?limit=${Number(limit) || 10}`, ctx);
        for (const row of rows) {
            const d = unwrap(row, "deploy");
            say(
                (d.status ?? "").padEnd(12),
                (d.commit?.id ?? "").slice(0, 7).padEnd(9),
                (d.finishedAt ?? d.createdAt ?? "-").padEnd(26),
                (d.commit?.message ?? "").split("\n")[0].slice(0, 60),
            );
        }
    },

    async logs(ctx, limit = "50") {
        const rows = await api(
            `/logs?ownerId=${await ownerId(ctx)}&resource=${ctx.serviceId}&limit=${Number(limit) || 50}`,
            ctx,
        );
        for (const entry of rows.logs ?? []) say(`${entry.timestamp}  ${entry.message}`);
    },

    async errors(ctx, limit = "200") {
        const rows = await api(
            `/logs?ownerId=${await ownerId(ctx)}&resource=${ctx.serviceId}&limit=${Number(limit) || 200}`,
            ctx,
        );
        const suspicious = /error|fail|exception|unhandled|refused|timeout|5\d\d\s/i;
        const hits = (rows.logs ?? []).filter((l) => suspicious.test(l.message));
        if (!hits.length) return say("No error-shaped lines in the window scanned.");
        for (const entry of hits) say(`${entry.timestamp}  ${entry.message}`);
    },

    async "build-logs"(ctx, deployId) {
        let id = deployId;
        if (!id) {
            const rows = await api(`/services/${ctx.serviceId}/deploys?limit=1`, ctx);
            id = unwrap(rows[0], "deploy")?.id;
        }
        if (!id) fail("No deploy found.");
        const rows = await api(
            `/logs?ownerId=${await ownerId(ctx)}&resource=${id}&limit=300`,
            ctx,
        );
        for (const entry of rows.logs ?? []) say(entry.message);
    },

    async "env-names"(ctx) {
        const rows = await api(`/services/${ctx.serviceId}/env-vars?limit=100`, ctx);
        const names = rows.map((r) => unwrap(r, "envVar").key).filter(Boolean).sort();
        say(`${names.length} variables:`);
        for (const n of names) say(`  ${n}`);
    },

    async "env-check"(ctx, name) {
        if (!name) fail("Usage: env-check <VARIABLE_NAME>");
        const rows = await api(`/services/${ctx.serviceId}/env-vars?limit=100`, ctx);
        const hit = rows.map((r) => unwrap(r, "envVar")).find((v) => v.key === name);
        if (!hit) return say(`${name}: NOT SET`);
        const value = (hit.value ?? "").trim();
        // Shape, not content: enough to spot an empty value or a pasted
        // placeholder without putting the secret into the scrollback.
        say(`${name}: set · length ${value.length} · starts "${value.slice(0, 4)}…"`);
    },
};

async function ownerId(ctx) {
    if (ctx._ownerId) return ctx._ownerId;
    const svc = await api(`/services/${ctx.serviceId}`, ctx);
    ctx._ownerId = svc.ownerId;
    return ctx._ownerId;
}

const [command = "status", ...args] = process.argv.slice(2);
const handler = commands[command];
if (!handler) {
    fail(`Unknown command "${command}".\nAvailable: ${Object.keys(commands).join(", ")}`);
}

const { apiKey, serviceId } = loadCredentials();
handler({ apiKey, serviceId }, ...args).catch((error) => fail(redact(error?.message ?? error)));
