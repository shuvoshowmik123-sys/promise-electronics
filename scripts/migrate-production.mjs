#!/usr/bin/env node
/**
 * Migrate the production database without the credential touching disk.
 *
 * The obvious way to do this is to paste the URL into the command line:
 *
 *   $env:DATABASE_URL="postgres://..."; npm run db:migrate:main
 *
 * That works and it leaks. PowerShell writes every command you type into
 * PSReadLine's history file — a plain text file that survives reboots — so the
 * production password ends up saved on the machine, and in the terminal's
 * scrollback, where a screen share or a screenshot will find it. Putting it in
 * .env instead is worse: it is one `git add -A` away from being published.
 *
 * So the URL is never typed as part of a command here. It is asked for, with
 * the input hidden, and handed to the migration as an environment variable of a
 * child process that exits a few seconds later. Nothing is written, nothing is
 * echoed, and the only thing printed back is the host — enough to see you are
 * pointed at the right database, useless to anybody reading over your shoulder.
 *
 * Usage:  npm run db:migrate:prod
 */
import { spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Two ways in, because the interactive one cannot be tested.
 *
 * A terminal keeps stdin open between questions; a pipe does not — it reaches
 * end-of-file after the first line, so the confirmation never resolves and the
 * script hangs having done nothing. Rather than ship a path nobody had run, the
 * non-TTY case reads its answers up front. That is what makes it possible to
 * exercise the whole thing, connection and all, before handing it over.
 *
 * You will always get the TTY path. Piping is for proving it works.
 */
const interactive = process.stdin.isTTY === true;

let piped = [];
if (!interactive) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  piped = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
}

const rl = interactive
  ? readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  : null;

let muted = false;
if (rl) {
  const write = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (chunk) => {
    // While muted, the prompt is printed and everything typed after it is not.
    if (!muted) write(chunk);
  };
}

let pipedIndex = 0;
function ask(question, hidden = false) {
  if (!rl) {
    process.stdout.write(question + (hidden ? "\n" : "\n"));
    return Promise.resolve(String(piped[pipedIndex++] ?? "").trim());
  }
  return new Promise((resolve) => {
    rl.output.write(question);
    muted = hidden;
    rl.question("", (answer) => {
      muted = false;
      if (hidden) process.stdout.write("\n");
      resolve(String(answer).trim());
    });
  });
}

/**
 * Aiven presents a self-signed certificate chain, so `sslmode=require` fails
 * with "self-signed certificate in certificate chain" and the migration dies
 * before it starts. This is corrected here rather than asked of you, because
 * getting it wrong once already took the live site down for four minutes: the
 * fix belongs in the tool, not in a step somebody has to remember.
 */
function forceNoVerifySsl(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.set("sslmode", "no-verify");
  return url.toString();
}

const raw = await ask("Paste the production DATABASE_URL, then press Enter (input is hidden): ", true);

if (!raw) {
  console.error("\nNothing pasted. Stopping — no database was contacted.");
  process.exit(1);
}

let url;
let host;
let database;
try {
  const parsed = new URL(raw);
  const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (protocol !== "postgres" && protocol !== "postgresql") {
    throw new Error(`expected a postgres:// URL, got ${protocol}://`);
  }
  host = parsed.hostname;
  database = parsed.pathname.replace(/^\//, "") || "(default)";
  url = forceNoVerifySsl(raw);
} catch (error) {
  // Deliberately does not echo what was pasted — a malformed URL is still a
  // password, and printing it back to "help" would defeat the whole point.
  console.error(`\nThat does not look like a database URL: ${error.message}`);
  console.error("Nothing was contacted. Check the URL and run this again.");
  process.exit(1);
}

console.log("");
console.log("  Target host : " + host);
console.log("  Database    : " + database);
console.log("  SSL         : no-verify (set automatically for Aiven)");
console.log("");
console.log("  This applies any pending schema migrations to that database.");
console.log("  It does not change, delete or move any of your data.");
console.log("");

const confirm = await ask("  Type MIGRATE to continue, or press Enter to cancel: ");
rl?.close();
if (confirm !== "MIGRATE") {
  console.log("\nCancelled. Nothing was changed.");
  process.exit(0);
}

console.log("");

/**
 * The two release flags are set here rather than asked of you.
 *
 * They exist so that a migration can never happen by accident — from a server
 * boot, or from somebody running a command in the wrong window. Running this
 * script IS the deliberate act those flags are guarding, and you have already
 * typed MIGRATE at a screen naming the host.
 */
// One command string rather than an args array: with `shell: true` Node warns
// that array arguments are concatenated unescaped, and there is nothing here to
// escape — the path is a constant and the URL travels in the environment.
const child = spawn("npx tsx server/db-migrate-main.ts", {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    DATABASE_URL: url,
    NODE_ENV: "production",
    MAIN_MIGRATION_RELEASE_MODE: "true",
    ALLOW_PROD_DB_MIGRATE_MAIN: "true",
  },
});

child.on("exit", (code) => {
  if (code === 0) {
    console.log("");
    console.log("  Done. The database is migrated and it is safe to deploy.");
  } else {
    console.log("");
    console.log("  The migration did NOT complete. Do not deploy — the site will");
    console.log("  return 503 until the database is at the version the code needs.");
  }
  process.exit(code ?? 1);
});
