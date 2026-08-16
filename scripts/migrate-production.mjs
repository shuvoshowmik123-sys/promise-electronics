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

/** Ctrl-C and backspace, by code point rather than as literal control bytes. */
const CTRL_C = String.fromCharCode(3);
const BACKSPACE = String.fromCharCode(127);

/**
 * Two ways in, because the interactive one cannot be tested from a script.
 *
 * A terminal keeps stdin open between questions; a pipe does not — it reaches
 * end-of-file after the first line. Rather than ship a path nobody had run, the
 * non-TTY case reads its answers up front, so the whole thing — connection,
 * migration, exit code — can be exercised before it is handed over.
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

let pipedIndex = 0;
const nextPiped = () => String(piped[pipedIndex++] ?? "").trim();

/**
 * Hidden input, read one character at a time.
 *
 * The first version used readline with a muted output hook, which is the usual
 * recipe and is wrong here. On a real terminal readline REDRAWS the line when it
 * takes over, wiping the prompt written a moment earlier — so the script printed
 * the npm banner and then nothing at all, and sat waiting for a paste with
 * nothing on screen to say so. It looked exactly like a hang.
 *
 * Raw mode avoids the redraw entirely: we print the prompt once, the terminal
 * stops echoing, and keystrokes are collected without anything being drawn back.
 * A pasted URL arrives as a single chunk and is handled the same as typing.
 */
function askHidden(question) {
  if (!interactive) {
    process.stdout.write(question + "\n");
    return Promise.resolve(nextPiped());
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;

    // Without raw mode there is no way to stop the terminal echoing the paste.
    // Refusing is better than quietly printing the production password.
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
        if (char === "\r" || char === "\n") {
          finish(() => resolve(value.trim()));
          return;
        }
        if (char === CTRL_C) {
          // Leave the terminal usable rather than dying while still in raw mode.
          finish(() => {
            console.log("Cancelled. Nothing was contacted.");
            process.exit(130);
          });
          return;
        }
        if (char === BACKSPACE || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        // Ignore the escape sequences arrow keys and the like produce, so a
        // stray keypress cannot end up inside the URL.
        if (char < " ") continue;
        value += char;
      }
    };

    stdin.on("data", onData);
  });
}

/** A visible question, for answers that are not secret. */
function ask(question) {
  if (!interactive) {
    process.stdout.write(question + "\n");
    return Promise.resolve(nextPiped());
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
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

let raw;
try {
  raw = await askHidden("Paste the production DATABASE_URL, then press Enter (nothing will appear): ");
} catch (error) {
  console.error(`\nCannot read the URL safely: ${error.message}`);
  console.error("Run this from a normal terminal window rather than through another tool.");
  process.exit(1);
}

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
