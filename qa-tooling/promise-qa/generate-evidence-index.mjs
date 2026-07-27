/**
 * Light HTML evidence index. Links resolve relative to the HTML file location.
 *
 * Usage:
 *   node qa-tooling/promise-qa/generate-evidence-index.mjs --run-dir <run-root>
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { redactObject } from "./lib/redact.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const runDir = path.resolve(arg("--run-dir", "mobile-qa/grok-playwright-mcp-02/latest"));
let reportPath = path.join(runDir, "report", "run-report.json");
if (!existsSync(reportPath)) reportPath = path.join(runDir, "run-report.json");
if (!existsSync(reportPath)) {
  console.error("Missing run-report.json under", runDir);
  process.exit(1);
}

const report = redactObject(JSON.parse(readFileSync(reportPath, "utf8")));
const steps = report.steps || [];
const htmlDir = path.join(runDir, "report");

function resolveLink(rel) {
  if (!rel) return null;
  const candidates = [
    path.join(runDir, rel),
    path.join(htmlDir, rel),
    path.resolve(rel),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return path.relative(htmlDir, c).replace(/\\/g, "/");
    }
  }
  return null;
}

function badge(v) {
  const c =
    v === "PASS" || v === "INFRA PASS"
      ? "#059669"
      : v === "FAIL" || v === "INFRA NO GO"
        ? "#dc2626"
        : "#64748b";
  return `<span style="background:${c};color:#fff;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${esc(v)}</span>`;
}

function imgCell(rel) {
  const href = resolveLink(rel);
  if (!href) return `<span style="color:#94a3b8">missing</span>`;
  return `<a href="${esc(href)}" target="_blank" rel="noopener"><img src="${esc(href)}" alt="" style="max-width:140px;max-height:90px;border:1px solid #e2e8f0;border-radius:6px;object-fit:cover"/></a>`;
}

const brokenLinks = [];
for (const s of steps) {
  for (const k of ["beforeScreenshot", "highlightedScreenshot", "afterScreenshot"]) {
    if (s[k] && !resolveLink(s[k])) brokenLinks.push(s[k]);
  }
}
for (const ex of report.executions || []) {
  if (ex.tracePath && !resolveLink(ex.tracePath)) brokenLinks.push(ex.tracePath);
}

const execCards = (report.executions || [])
  .map(
    (ex) => `<div class="card">
      <b>${esc(ex.id || ex.profile)}</b>
      <div>${esc(ex.viewport?.width)}×${esc(ex.viewport?.height)} touch=${esc(String(!!ex.touch))} coarse=${esc(String(!!ex.coarsePointer))}</div>
      <div>role=${esc(ex.actorRole)} server=${esc(ex.server)}</div>
      <div>${badge(ex.verdict || "NOT VERIFIED")}</div>
      ${ex.tracePath && resolveLink(ex.tracePath) ? `<a href="${esc(resolveLink(ex.tracePath))}">trace</a>` : "trace missing"}
    </div>`,
  )
  .join("");

const rows = steps
  .map((s) => {
    const consoleLines = (s.consoleDelta || [])
      .slice(0, 6)
      .map(
        (c) =>
          `<div style="font-size:10px"><b>${esc(c.class || "")}</b> ${esc(c.text || JSON.stringify(c))}</div>`,
      )
      .join("");
    const netLines = (s.networkDelta || [])
      .slice(0, 6)
      .map(
        (n) =>
          `<div style="font-size:10px"><b>${esc(n.class || "")}</b> ${esc(n.method)} ${esc(n.status)} ${esc(n.url)}</div>`,
      )
      .join("");
    return `<tr>
      <td>${s.stepNumber}</td>
      <td><strong>${esc(s.action)}</strong><div style="font-size:11px;color:#64748b">${esc(s.target || "")}</div>
        <div style="font-size:10px;color:#0f766e">${esc((s.visionObservation || "").slice(0, 160))}</div>
        ${s.recoveryAttempted ? "<div style='font-size:10px;color:#d97706'>recovery attempted</div>" : ""}
      </td>
      <td>${imgCell(s.beforeScreenshot)}</td>
      <td>${imgCell(s.highlightedScreenshot)}</td>
      <td>${imgCell(s.afterScreenshot)}</td>
      <td style="font-size:12px">${esc(s.expected || "")}</td>
      <td style="font-size:12px">${esc(s.actual || "")}</td>
      <td>${consoleLines || "—"}</td>
      <td>${netLines || "—"}</td>
      <td>${badge(s.verdict)}${(s.verdictReasons || []).length ? `<div style="font-size:10px">${esc((s.verdictReasons || []).join(", "))}</div>` : ""}</td>
    </tr>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Promise QA — ${esc(report.phaseId)} / ${esc(report.runId || "")}</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,sans-serif;margin:24px;color:#0f172a;background:#f8fafc}
    h1{font-size:20px;margin:0 0 8px}
    .meta,.execs{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:16px}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:13px}
    .card b{display:block;font-size:10px;text-transform:uppercase;color:#64748b;letter-spacing:.04em;margin-bottom:4px}
    table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0}
    th,td{border-bottom:1px solid #e2e8f0;padding:8px;vertical-align:top;text-align:left}
    th{background:#f1f5f9;font-size:11px;text-transform:uppercase;color:#475569}
    .warn{background:#fef3c7;border:1px solid #f59e0b;padding:8px 12px;border-radius:8px;margin-bottom:12px;font-size:13px}
    footer{margin-top:16px;font-size:12px;color:#64748b}
    a{color:#0f766e}
  </style>
</head>
<body>
  <h1>Promise Electronics QA Evidence</h1>
  <p style="color:#64748b;margin-top:0">Fail-closed harness · Grok-only vision · Playwright evidence</p>
  ${brokenLinks.length ? `<div class="warn">Broken evidence links: ${esc(brokenLinks.join(", "))}</div>` : ""}
  <div class="meta">
    <div class="card"><b>Phase</b>${esc(report.phaseId)}</div>
    <div class="card"><b>Run ID</b>${esc(report.runId || "")}</div>
    <div class="card"><b>Mode</b>${esc(report.mode || "STRICT")}</div>
    <div class="card"><b>Base URL</b>${esc(report.baseUrl)}</div>
    <div class="card"><b>Final verdict</b>${badge(report.finalVerdict)}</div>
    <div class="card"><b>Cleanup</b>${esc(report.cleanupResult)}</div>
    <div class="card"><b>Secret scan</b>${esc(report.secretScanResult)} <span style="color:#64748b">(text artifacts)</span></div>
    <div class="card"><b>Binary evidence privacy</b>${esc(report.binaryEvidencePrivacy || "NOT VERIFIED")}</div>
    <div class="card"><b>MCP desktop</b>${esc(report.mcpRuntime?.desktop)}</div>
    <div class="card"><b>MCP mobile</b>${esc(report.mcpRuntime?.mobile)}</div>
    <div class="card"><b>Context isolation</b>${esc(report.browserContextIsolation)}</div>
    <div class="card"><b>Blocking reasons</b>${esc((report.verdictReasons || []).join("; ") || "none")}</div>
  </div>
  <h2 style="font-size:14px">Validation artifacts</h2>
  <div class="execs">
    <div class="card">
      <b>Full validation (authoritative)</b>
      ${existsSync(path.join(htmlDir, "validation-full.json"))
        ? `<a href="validation-full.json">validation-full.json</a>`
        : existsSync(path.join(htmlDir, "validation.json"))
          ? `<a href="validation.json">validation.json</a> <span style="color:#64748b">(legacy alias)</span>`
          : `<span style="color:#94a3b8">missing</span>`}
    </div>
    <div class="card">
      <b>Schema-only (incomplete)</b>
      ${existsSync(path.join(htmlDir, "validation-schema.json"))
        ? `<a href="validation-schema.json">validation-schema.json</a>
           <div style="margin-top:6px;color:#b45309;font-size:12px">Schema-only is incomplete — not an evidence gate.</div>`
        : `<span style="color:#94a3b8">not run</span>`}
    </div>
  </div>
  <h2 style="font-size:14px">Executions</h2>
  <div class="execs">${execCards || "<div class='card'>none</div>"}</div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Action / vision</th><th>Before</th><th>Highlight</th><th>After</th>
        <th>Expected</th><th>Actual</th><th>Console</th><th>Network</th><th>Verdict</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>
    Generated ${esc(new Date().toISOString())}. Open traces with <code>npx playwright show-trace &lt;path&gt;</code>.
    No secrets intentionally stored. Traces may still contain on-screen app data.
  </footer>
</body>
</html>`;

const outFile = path.join(htmlDir, "evidence-index.html");
writeFileSync(outFile, html, "utf8");
writeFileSync(
  path.join(htmlDir, "html-link-check.json"),
  JSON.stringify({ brokenLinks, ok: brokenLinks.length === 0 }, null, 2),
);
console.log("Wrote", outFile, "brokenLinks=", brokenLinks.length);
process.exit(brokenLinks.length ? 1 : 0);
