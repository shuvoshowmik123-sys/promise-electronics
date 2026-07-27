#!/usr/bin/env node
/**
 * Run-id-aware Playwright MCP launcher.
 * Allocates a unique output directory under mobile-qa/grok-playwright-mcp-02/
 * so concurrent/repeated sessions never share screenshots, traces, or profiles.
 *
 * Usage (via .mcp.json):
 *   node qa-tooling/playwright-mcp/launch-mcp.mjs desktop
 *   node qa-tooling/playwright-mcp/launch-mcp.mjs mobile
 *
 * Optional: QA_MCP_RUN_ID to pin the session folder name.
 * saveSession remains false (never persist auth).
 */
import { spawn } from "child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PROFILE = String(process.argv[2] || "").toLowerCase();

if (PROFILE !== "desktop" && PROFILE !== "mobile") {
  console.error("Usage: node launch-mcp.mjs <desktop|mobile>");
  process.exit(2);
}

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const runId =
  process.env.QA_MCP_RUN_ID ||
  `mcp-session_${ts}_${randomUUID().slice(0, 8)}`;

const sessionRoot = path.join(ROOT, "mobile-qa", "grok-playwright-mcp-02", runId);
const outputDir = path.join(sessionRoot, PROFILE === "mobile" ? "mcp-mobile" : "mcp-desktop");
const profileDir = path.join(sessionRoot, PROFILE === "mobile" ? "mcp-profile-mobile" : "mcp-profile-desktop");

mkdirSync(outputDir, { recursive: true });
mkdirSync(profileDir, { recursive: true });
mkdirSync(path.join(sessionRoot, "report"), { recursive: true });

writeFileSync(
  path.join(sessionRoot, "report", `mcp-session-${PROFILE}.json`),
  JSON.stringify(
    {
      profile: PROFILE,
      runId,
      outputDir: path.relative(ROOT, outputDir).replace(/\\/g, "/"),
      profileDir: path.relative(ROOT, profileDir).replace(/\\/g, "/"),
      saveSession: false,
      isolated: true,
      createdAt: new Date().toISOString(),
      note: "Unique MCP session isolation. Auth state must never be persisted.",
    },
    null,
    2,
  ),
);

const configRel =
  PROFILE === "mobile"
    ? "qa-tooling/playwright-mcp/mobile.config.json"
    : "qa-tooling/playwright-mcp/desktop.config.json";

const cli = path.join(ROOT, "node_modules", "@playwright", "mcp", "cli.js");
if (!existsSync(cli)) {
  console.error("Missing @playwright/mcp at", cli);
  process.exit(1);
}

const args = [
  cli,
  "--config",
  configRel,
  "--browser",
  "chrome",
  "--caps",
  "vision,devtools",
  "--image-responses",
  "allow",
  "--console-level",
  "warning",
  "--isolated",
  "--output-dir",
  path.relative(ROOT, outputDir).replace(/\\/g, "/"),
  "--output-mode",
  "file",
  "--test-id-attribute",
  "data-testid",
  "--timeout-action",
  "10000",
  "--timeout-navigation",
  "60000",
  // Do NOT pass --save-session (default false). Never persist auth/cookies/profiles.
];

if (PROFILE === "desktop") {
  args.push("--viewport-size", "1440x900");
} else {
  args.push("--device", "iPhone 15", "--viewport-size", "390x844");
}

// Pass through any extra args after profile name
const extra = process.argv.slice(3);
if (extra.length) args.push(...extra);

const child = spawn(process.execPath, args, {
  cwd: ROOT,
  stdio: "inherit",
  env: {
    ...process.env,
    QA_MCP_RUN_ID: runId,
    QA_MCP_OUTPUT_DIR: outputDir,
    // Never enable session restore
    PLAYWRIGHT_MCP_SAVE_SESSION: "0",
  },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
