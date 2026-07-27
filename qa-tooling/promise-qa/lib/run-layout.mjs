/**
 * Unique artifact directories for Promise QA runs.
 */
import { mkdirSync, existsSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { assertUnderMobileQa } from "./paths.mjs";

const MOBILE_QA_ROOT = "mobile-qa";

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    phaseId: "GROK-PLAYWRIGHT-QA-02I",
    runId: null,
    out: null,
    baseUrl: process.env.BASE_URL || process.env.QA_BASE || "http://127.0.0.1:5083",
    mode: "STRICT",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--phase-id") out.phaseId = argv[++i];
    else if (a === "--run-id") out.runId = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--base-url") out.baseUrl = argv[++i];
    else if (a === "--mode") out.mode = String(argv[++i] || "STRICT").toUpperCase();
  }
  if (!out.runId) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    out.runId = `${ts}_${randomUUID().slice(0, 8)}`;
  }
  return out;
}

/**
 * Ensure output stays under mobile-qa/ unless explicitly flagged.
 */
export function resolveRunRoot({ phaseId, runId, out }) {
  let root;
  if (out) {
    root = path.resolve(out);
    if (process.env.QA_ALLOW_OUTSIDE !== "1") {
      assertUnderMobileQa(root);
    }
  } else {
    // Always isolate under mcp-02 unique run-id (no shared QA-01 defaults).
    const folder = "grok-playwright-mcp-02";
    root = path.resolve(MOBILE_QA_ROOT, folder, runId);
  }
  if (existsSync(root)) {
    root = path.join(root, `rerun_${randomUUID().slice(0, 6)}`);
  }
  const dirs = {
    root,
    report: path.join(root, "report"),
    desktop: path.join(root, "desktop"),
    mobile: path.join(root, "mobile"),
    screenshots: path.join(root, "screenshots"),
    traces: path.join(root, "traces"),
    console: path.join(root, "console"),
    network: path.join(root, "network"),
  };
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
  writeFileSync(
    path.join(dirs.report, "run-meta.json"),
    JSON.stringify({ phaseId, runId, root, createdAt: new Date().toISOString() }, null, 2),
  );
  return dirs;
}

export function relToRun(runRoot, absPath) {
  return path.relative(runRoot, absPath).replace(/\\/g, "/");
}
