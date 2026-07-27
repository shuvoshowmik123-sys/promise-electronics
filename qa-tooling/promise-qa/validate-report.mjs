#!/usr/bin/env node
/**
 * Full fail-closed validation by default.
 * --schema-only : shape only (writes validation-schema.json only)
 * Default: writes validation-full.json (and validation.json alias of full)
 * Never overwrites full validation result with schema-only output.
 * Exit: 0 PASS, 1 NO GO / invalid, 3 PARTIAL, 2 usage
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { validateReport } from "./lib/validate-report.mjs";
import { redactObject } from "./lib/redact.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const schemaOnly = process.argv.includes("--schema-only");
const runDir = arg("--run-dir", null);
const reportArg = arg("--report", null);
let reportPath;
let dir;
if (reportArg) {
  reportPath = path.resolve(reportArg);
  dir = runDir ? path.resolve(runDir) : path.dirname(reportPath);
  if (path.basename(dir) === "report") dir = path.dirname(dir);
} else if (runDir) {
  dir = path.resolve(runDir);
  reportPath = path.join(dir, "report", "run-report.json");
  if (!existsSync(reportPath)) reportPath = path.join(dir, "run-report.json");
} else {
  console.error("Usage: node validate-report.mjs --run-dir <dir> | --report <file> [--schema-only]");
  process.exit(2);
}

if (!existsSync(reportPath)) {
  console.error("Report not found:", reportPath);
  process.exit(1);
}

const reportRaw = readFileSync(reportPath, "utf8").replace(/^\uFEFF/, "");
const report = JSON.parse(reportRaw);
const result = await validateReport(report, dir, {
  mode: report.mode || "STRICT",
  schemaOnly,
});

const outDir = existsSync(path.join(dir, "report")) ? path.join(dir, "report") : dir;
mkdirSync(outDir, { recursive: true });

const payload = redactObject({
  ...result,
  mode: schemaOnly ? "schema-only" : "full",
  incomplete: Boolean(schemaOnly),
  validatedAt: new Date().toISOString(),
  note: schemaOnly
    ? "SCHEMA-ONLY: incomplete validation. Do not treat as evidence gate."
    : "FULL fail-closed validation including evidence and MCP checks.",
});

if (schemaOnly) {
  writeFileSync(path.join(outDir, "validation-schema.json"), JSON.stringify(payload, null, 2));
} else {
  writeFileSync(path.join(outDir, "validation-full.json"), JSON.stringify(payload, null, 2));
  // Alias for older consumers — always full, never schema-only
  writeFileSync(path.join(outDir, "validation.json"), JSON.stringify(payload, null, 2));
}

console.log(
  JSON.stringify(
    {
      ok: result.ok,
      exitCode: result.exitCode,
      mode: schemaOnly ? "schema-only" : "full",
      finalVerdict: result.runEval?.finalVerdict,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 40),
      wrote: schemaOnly ? "validation-schema.json" : "validation-full.json",
    },
    null,
    2,
  ),
);
process.exit(result.exitCode ?? (result.ok ? 0 : 1));
