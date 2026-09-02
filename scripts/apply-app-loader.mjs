#!/usr/bin/env node
/**
 * Give the staff app's boot screen the right words.
 *
 * The server rewrites this per request in applyPortalMeta, deciding from the
 * URL which portal is loading. The app never asks the server for its HTML —
 * Capacitor serves the copy compiled into the APK from disk — so that rewrite
 * cannot reach it, and the app booted showing "Preparing your customer portal"
 * and a Google Sign-In pitch to a technician opening the staff app.
 *
 * Here it is unconditional rather than URL-driven, because this file only ever
 * belongs to the staff app: main.tsx rewrites the entry path to /admin before
 * React mounts, so there is no other portal it could be about.
 *
 * Applied to the artefact, never to dist/public itself. That directory is also
 * what the web deploy serves, and hardcoding admin copy into it would put
 * "Admin Control" on the customer site — the same fault in the other
 * direction.
 *
 *   node scripts/apply-app-loader.mjs <path/to/index.html>
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

/**
 * Kept in step with server/lib/portalMeta.ts by hand.
 *
 * Sharing one module would mean importing TypeScript from a plain build script
 * or compiling one for it, and the pair is four short strings. What protects
 * them is the check below: if index.html changes and an anchor stops matching,
 * this exits non-zero rather than shipping a half-rewritten screen.
 */
const REPLACEMENTS = [
    ["Your TV repair journey, in one place.", "Admin Control"],
    [
        "Use the Promise Electronics Customer Portal to book a repair, track repair status, receive service updates, and view your repair history.",
        "Jobs, POS, inventory, finance and staff tools for Promise Electronics.",
    ],
    ["Secure customer sign-in", "Authorized staff only"],
    [
        "Google Sign-In is available to securely access your customer account. We use Google account information only as explained in our Privacy Policy.",
        "Sign in with your admin credentials to continue.",
    ],
    ["Preparing your customer portal", "Preparing the admin panel"],
];

const target = process.argv[2];
if (!target) {
    console.error("Usage: node scripts/apply-app-loader.mjs <path/to/index.html>");
    process.exit(1);
}
if (!existsSync(target)) {
    console.error(`Not found: ${target}`);
    process.exit(1);
}

let html = readFileSync(target, "utf-8");
const missing = [];

for (const [from, to] of REPLACEMENTS) {
    if (!html.includes(from)) {
        // Already applied is not a failure — this script runs after every sync.
        if (!html.includes(to)) missing.push(from.slice(0, 48));
        continue;
    }
    html = html.replace(from, to);
}

if (missing.length) {
    console.error("  ! loader copy not applied — these anchors are gone from index.html:");
    for (const m of missing) console.error(`      "${m}…"`);
    console.error("    Update REPLACEMENTS in this script to match client/index.html.");
    process.exit(1);
}

writeFileSync(target, html, "utf-8");
console.log(`  staff-app boot screen applied to ${target}`);
