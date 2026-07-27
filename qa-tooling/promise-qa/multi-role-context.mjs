/**
 * Promise QA companion: isolated Playwright contexts per role.
 * Not an AI agent. Use when Playwright MCP cannot host concurrent roles safely.
 *
 * Usage:
 *   node qa-tooling/promise-qa/multi-role-context.mjs --help
 *   QA_OUT=mobile-qa/grok-playwright-mcp-02/<run-id>/isolation node ... --probe
 *
 * QA_OUT is required and must resolve under mobile-qa/grok-playwright-mcp-02/<run-id>/.
 * No shared QA-01 default. Never persist storage-state or credentials.
 */
import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { isPathInside } from "./lib/paths.mjs";

const BASE = process.env.BASE_URL || process.env.QA_BASE || "http://127.0.0.1:5083";

function resolveOutDir() {
  const raw = process.env.QA_OUT;
  if (!raw || !String(raw).trim()) {
    throw new Error(
      "QA_OUT is required. Use a unique path under mobile-qa/grok-playwright-mcp-02/<run-id>/ (no QA-01 default).",
    );
  }
  const resolved = path.resolve(raw);
  const root02 = path.resolve("mobile-qa", "grok-playwright-mcp-02");
  if (!isPathInside(root02, resolved)) {
    throw new Error(
      `QA_OUT must be under mobile-qa/grok-playwright-mcp-02/<run-id>/ (got ${resolved})`,
    );
  }
  // Require at least one path segment under mcp-02 (the run-id)
  const rel = path.relative(root02, resolved);
  if (!rel || rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("QA_OUT must include a unique run-id directory under grok-playwright-mcp-02/");
  }
  const first = rel.split(/[/\\]/)[0];
  if (!first || first.startsWith("_unused") || first === "_mcp-desktop" || first === "_mcp-mobile") {
    throw new Error("QA_OUT must use a unique run-id, not a shared static MCP folder");
  }
  return resolved;
}

function help() {
  console.log(`Promise multi-role context helper

  --help          Show help
  --probe         Launch two isolated contexts (desktop + mobile touch) against BASE_URL, write metrics, close cleanly
  --base <url>    Override base URL (default ${BASE})

Requires env QA_OUT = mobile-qa/grok-playwright-mcp-02/<run-id>/...

Roles never share cookies. Each role gets its own browser context.
Authenticated multi-role remains NOT VERIFIED until binary screenshot/trace redaction exists.
Never write storage-state, cookies, or tokens to evidence.
`);
}

async function probe() {
  const OUT = resolveOutDir();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
  });

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "Asia/Dhaka",
  });
  const mobile = await browser.newContext({
    ...devices["iPhone 15"],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: "en-US",
    timezoneId: "Asia/Dhaka",
  });

  const dPage = await desktop.newPage();
  const mPage = await mobile.newPage();

  const results = {
    base: BASE,
    out: OUT,
    startedAt: new Date().toISOString(),
    contexts: [],
    authPersisted: false,
    binaryEvidencePrivacy: "NOT VERIFIED",
    note: "Public isolation probe only. Authenticated multi-role is NOT VERIFIED without binary redaction.",
  };

  await dPage.goto(BASE + "/home", { waitUntil: "domcontentloaded", timeout: 60000 });
  await dPage.screenshot({ path: path.join(OUT, "probe-desktop-home.png") });
  const dMetrics = await dPage.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    touch: navigator.maxTouchPoints,
    coarse: window.matchMedia("(pointer: coarse)").matches,
  }));
  results.contexts.push({ role: "desktop-public", isolated: true, metrics: dMetrics });

  await mPage.goto(BASE + "/home", { waitUntil: "domcontentloaded", timeout: 60000 });
  await mPage.screenshot({ path: path.join(OUT, "probe-mobile-home.png") });
  const mMetrics = await mPage.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    touch: navigator.maxTouchPoints,
    coarse: window.matchMedia("(pointer: coarse)").matches,
    isMobileUa: /iPhone|Mobile/i.test(navigator.userAgent),
  }));
  results.contexts.push({ role: "mobile-public", isolated: true, metrics: mMetrics });

  // Prove cookie isolation: set cookie on desktop, ensure mobile does not see it
  await desktop.addCookies([
    { name: "qa_role_probe", value: "desktop-only", url: BASE },
  ]);
  const dCookies = await desktop.cookies();
  const mCookies = await mobile.cookies();
  results.cookieIsolation = {
    desktopHasProbe: dCookies.some((c) => c.name === "qa_role_probe"),
    mobileHasProbe: mCookies.some((c) => c.name === "qa_role_probe"),
    pass: dCookies.some((c) => c.name === "qa_role_probe") && !mCookies.some((c) => c.name === "qa_role_probe"),
  };

  results.completedAt = new Date().toISOString();
  writeFileSync(path.join(OUT, "multi-role-probe.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));

  await desktop.close();
  await mobile.close();
  await browser.close();
  process.exit(results.cookieIsolation.pass ? 0 : 1);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.length === 0) {
  help();
  process.exit(0);
}
if (args.includes("--probe")) {
  try {
    await probe();
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
} else {
  help();
  process.exit(1);
}
