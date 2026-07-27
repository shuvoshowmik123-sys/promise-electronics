/**
 * Fail-closed infrastructure pilots (QA-02I).
 * Env flags do NOT create PASS — only nonce-bound MCP evidence manifests do
 * (not cryptographic; live Grok MCP inventory + retained evidence is the trust boundary).
 */
import { chromium, devices } from "playwright";
import { writeFileSync, existsSync, readFileSync, readdirSync, statSync, mkdirSync } from "fs";
import path from "path";
import { parseArgs, resolveRunRoot, relToRun } from "./lib/run-layout.mjs";
import { evaluateDeltas } from "./lib/classify.mjs";
import { evaluateStep, evaluateRun } from "./lib/verdict.mjs";
import { validateReport } from "./lib/validate-report.mjs";
import { redactObject, redactConsoleEntry, redactNetworkEntry } from "./lib/redact.mjs";
import { comparePanZoomEvidence } from "./lib/pixel-compare.mjs";
import { createChallenge, writeChallenge, loadAndValidateProofs } from "./lib/mcp-proof.mjs";
import { createCleanupTracker } from "./lib/cleanup.mjs";

const args = parseArgs();
const MODE = args.mode === "FAST" ? "FAST" : "STRICT";
const BASE = args.baseUrl;
const dirs = resolveRunRoot(args);
const RUN = dirs.root;
const WATCHDOG_MS = Number(process.env.QA_WATCHDOG_MS || 10 * 60 * 1000);
const startedAt = new Date().toISOString();
const cleanup = createCleanupTracker();

const challenges = [
  createChallenge(args.runId, "playwright"),
  createChallenge(args.runId, "playwright-mobile"),
];
for (const ch of challenges) writeChallenge(RUN, ch);

const report = {
  phaseId: args.phaseId,
  runId: args.runId,
  startedAt,
  completedAt: null,
  baseUrl: BASE,
  environment: "local",
  mode: MODE,
  steps: [],
  executions: [],
  findings: [],
  unexpectedConsoleCount: 0,
  failedNetworkCount: 0,
  unclassifiedCount: 0,
  schemaValid: false,
  evidenceValid: false,
  cleanupResult: "PENDING",
  secretScanResult: "PENDING",
  /** Screenshots/traces not redacted for auth/PII until a binary privacy pipeline exists. */
  binaryEvidencePrivacy: "NOT VERIFIED",
  requireMcpRuntime: true,
  mcpChallenges: challenges.map((c) => ({ runId: c.runId, server: c.server, nonce: c.nonce, createdAt: c.createdAt })),
  mcpRuntime: { desktop: "NOT VERIFIED", mobile: "NOT VERIFIED" },
  optionalMatrix: {
    "viewport-430x932": "NOT VERIFIED",
    "viewport-844x390-touch": "NOT VERIFIED",
    // Cannot promote to PASS while binaryEvidencePrivacy !== PASS
    "authenticated-multi-role": "NOT VERIFIED",
  },
  browserContextIsolation: "NOT VERIFIED",
  finalVerdict: "INFRA NO GO",
  verdictReasons: [],
};

let watchdogFired = false;
const watchdog = setTimeout(async () => {
  watchdogFired = true;
  report.findings.push({ id: "watchdog", result: "FAIL" });
  const c = await cleanup.cleanup();
  report.cleanupResult = c.result;
  report.completedAt = new Date().toISOString();
  try {
    writeFileSync(path.join(dirs.report, "run-report.json"), JSON.stringify(redactObject(report), null, 2));
    writeFileSync(path.join(dirs.report, "watchdog-blocker.json"), JSON.stringify({ reason: "watchdog-timeout" }, null, 2));
  } catch {
    /* */
  }
  process.exit(2);
}, WATCHDOG_MS);

function writeReport() {
  report.completedAt = new Date().toISOString();
  const p = path.join(dirs.report, "run-report.json");
  writeFileSync(p, JSON.stringify(redactObject(report), null, 2));
  return p;
}

async function ensureServer() {
  const r = await fetch(BASE + "/").catch(() => null);
  if (!r) throw new Error("Server not reachable at " + BASE);
}

function attachMonitors(page, bag) {
  page.on("console", (m) => bag.console.push({ type: m.type(), text: m.text().slice(0, 400), at: Date.now() }));
  page.on("pageerror", (e) => bag.console.push({ type: "pageerror", text: e.message.slice(0, 400), at: Date.now() }));
  page.on("response", (r) =>
    bag.network.push({ method: r.request().method(), status: r.status(), url: r.url(), at: Date.now() }),
  );
}

async function shot(page, name) {
  const abs = path.join(dirs.screenshots, name);
  await page.screenshot({ path: abs, fullPage: false });
  return relToRun(RUN, abs);
}

function checkpoint(bag) {
  return { c: bag.console.length, n: bag.network.length };
}

function deltaSince(bag, cp) {
  return {
    consoleDelta: bag.console.slice(cp.c).map((e) => redactConsoleEntry(e)),
    networkDelta: bag.network.slice(cp.n).map((e) => redactNetworkEntry(e)),
  };
}

function finalizeStep(raw, requirements = {}) {
  const evalD = evaluateDeltas(raw.consoleDelta || [], raw.networkDelta || [], {
    actorState: raw.actorState || "anonymous",
    authenticatedCustomer: false,
  });
  raw.blockingConsoleOrNetwork = evalD.blocking.length > 0;
  raw.unclassifiedPresent = evalD.unclassified.length > 0;
  raw.consoleDelta = evalD.classifiedConsole;
  raw.networkDelta = evalD.classifiedNetwork;
  report.unclassifiedCount += evalD.unclassified.length;
  report.failedNetworkCount += evalD.blocking.filter((b) => b.status).length;
  report.unexpectedConsoleCount += evalD.blocking.filter((b) => b.text || b.type).length;

  const missing = [];
  for (const k of ["beforeScreenshot", "afterScreenshot", "highlightedScreenshot"]) {
    if (raw[k] && !existsSync(path.join(RUN, raw[k]))) missing.push(raw[k]);
  }
  raw.missingEvidenceFiles = missing;

  const v = evaluateStep(raw, requirements, { mode: MODE });
  raw.verdict = v.verdict;
  raw.verdictReasons = v.reasons;
  report.steps.push(raw);
  return raw;
}

async function runDesktop() {
  const bag = { console: [], network: [] };
  const browser = cleanup.trackBrowser(await chromium.launch({ channel: "chrome", headless: false }));
  const context = cleanup.trackContext(
    await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "Asia/Dhaka" }),
  );
  cleanup.trackTracing(context);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await context.newPage();
  attachMonitors(page, bag);

  const exec = {
    id: "desktop-public",
    server: "playwright-library",
    profile: "desktop",
    browser: "chrome",
    viewport: { width: 1440, height: 900 },
    touch: false,
    coarsePointer: false,
    userAgentCategory: "desktop",
    actorRole: "public-anonymous",
    environment: "local",
    startedAt: new Date().toISOString(),
    verdict: "NOT VERIFIED",
  };

  try {
    let cp = checkpoint(bag);
    const s1 = {
      stepNumber: report.steps.length + 1,
      action: "navigate",
      target: `${BASE}/home`,
      expected: "Public home loads",
      actorState: "anonymous",
      visualCheck: true,
      executionId: exec.id,
      recoveryAttempted: false,
      recoveryAttempts: 0,
      consoleCheckpointTaken: true,
      networkCheckpointTaken: true,
    };
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    s1.beforeScreenshot = await shot(page, "D-01-before-home.png");
    s1.afterScreenshot = await shot(page, "D-02-after-home.png");
    Object.assign(s1, deltaSince(bag, cp));
    s1.actionOccurred = page.url().includes("5083");
    s1.expectedStateMet = s1.actionOccurred && (await page.title()).length > 0;
    s1.actual = `url=${page.url()}`;
    s1.visionObservation = "Desktop public home: customer hero and primary navigation visible.";
    finalizeStep(s1);

    cp = checkpoint(bag);
    const s2 = {
      stepNumber: report.steps.length + 1,
      action: "click",
      target: "Track Order link",
      expected: "URL contains track",
      actorState: "anonymous",
      visualCheck: true,
      requireHighlight: true,
      executionId: exec.id,
      recoveryAttempted: false,
      recoveryAttempts: 0,
      consoleCheckpointTaken: true,
      networkCheckpointTaken: true,
    };
    s2.beforeScreenshot = await shot(page, "D-03-before-click.png");
    const link = page.getByRole("link", { name: /track/i }).first();
    if (await link.isVisible().catch(() => false)) {
      await link.screenshot({ path: path.join(dirs.screenshots, "D-04-highlight.png") });
      s2.highlightedScreenshot = relToRun(RUN, path.join(dirs.screenshots, "D-04-highlight.png"));
      await link.click({ timeout: 8000 });
      s2.actionOccurred = true;
    } else {
      s2.recoveryAttempted = true;
      s2.recoveryAttempts = 1;
      await page.goto(`${BASE}/track-order`, { waitUntil: "domcontentloaded" });
      s2.actionOccurred = true;
      s2.notes = "one recovery: direct /track-order";
    }
    await page.waitForTimeout(800);
    s2.afterScreenshot = await shot(page, "D-05-after-click.png");
    Object.assign(s2, deltaSince(bag, cp));
    s2.expectedStateMet = /track/i.test(page.url());
    s2.actual = `url=${page.url()}`;
    s2.visionObservation = "Track/order page or route after navigation.";
    finalizeStep(s2);

    const traceAbs = path.join(dirs.traces, "desktop-public.zip");
    await context.tracing.stop({ path: traceAbs });
    cleanup.trackTracing(null);
    exec.tracePath = relToRun(RUN, traceAbs);
    exec.metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      maxTouchPoints: navigator.maxTouchPoints,
      coarse: window.matchMedia("(pointer: coarse)").matches,
    }));
    exec.verdict = s1.verdict === "PASS" && s2.verdict === "PASS" ? "PASS" : "FAIL";
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  report.executions.push(exec);
}

async function runMobile() {
  const bag = { console: [], network: [] };
  const browser = cleanup.trackBrowser(await chromium.launch({ channel: "chrome", headless: false }));
  const context = cleanup.trackContext(
    await browser.newContext({
      ...devices["iPhone 15"],
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      locale: "en-US",
      timezoneId: "Asia/Dhaka",
    }),
  );
  cleanup.trackTracing(context);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await context.newPage();
  attachMonitors(page, bag);
  const exec = {
    id: "mobile-public-library",
    server: "playwright-library",
    profile: "mobile-touch",
    browser: "chrome",
    viewport: { width: 390, height: 844 },
    touch: true,
    coarsePointer: true,
    userAgentCategory: "mobile",
    actorRole: "public-anonymous",
    startedAt: new Date().toISOString(),
    verdict: "NOT VERIFIED",
  };
  try {
    const cp = checkpoint(bag);
    const s = {
      stepNumber: report.steps.length + 1,
      action: "mobile-home",
      target: "390×844",
      expected: "touch metrics + no overflow",
      actorState: "anonymous",
      visualCheck: true,
      executionId: exec.id,
      recoveryAttempted: false,
      recoveryAttempts: 0,
      consoleCheckpointTaken: true,
      networkCheckpointTaken: true,
    };
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    s.beforeScreenshot = await shot(page, "M-01-before.png");
    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      maxTouchPoints: navigator.maxTouchPoints,
      coarse: window.matchMedia("(pointer: coarse)").matches,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    s.afterScreenshot = await shot(page, "M-02-after.png");
    Object.assign(s, deltaSince(bag, cp));
    s.actionOccurred = true;
    s.expectedStateMet =
      metrics.maxTouchPoints > 0 && metrics.innerWidth === 390 && metrics.coarse === true && metrics.scrollWidth <= metrics.innerWidth + 2;
    s.actual = JSON.stringify(metrics);
    s.visionObservation = "Mobile public home at 390×844 with touch metrics.";
    finalizeStep(s);
    exec.metrics = metrics;
    const traceAbs = path.join(dirs.traces, "mobile-public.zip");
    await context.tracing.stop({ path: traceAbs });
    exec.tracePath = relToRun(RUN, traceAbs);
    exec.verdict = s.verdict;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  report.executions.push(exec);
}

async function runVision() {
  const bag = { console: [], network: [] };
  const browser = cleanup.trackBrowser(await chromium.launch({ channel: "chrome", headless: false }));
  const context = cleanup.trackContext(
    await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "Asia/Dhaka" }),
  );
  cleanup.trackTracing(context);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await context.newPage();
  attachMonitors(page, bag);
  const exec = {
    id: "vision-map",
    server: "playwright-library",
    profile: "desktop",
    viewport: { width: 1440, height: 900 },
    touch: false,
    coarsePointer: false,
    actorRole: "public-anonymous",
    startedAt: new Date().toISOString(),
    verdict: "NOT VERIFIED",
  };
  try {
    const cp = checkpoint(bag);
    const s = {
      stepNumber: report.steps.length + 1,
      action: "vision-map-pan",
      target: "map/canvas",
      expected: "Decoded pixel change in map region after pan",
      actorState: "anonymous",
      visualCheck: true,
      executionId: exec.id,
      recoveryAttempted: false,
      recoveryAttempts: 0,
      consoleCheckpointTaken: true,
      networkCheckpointTaken: true,
    };
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      document.querySelector(".maplibregl-map, canvas.maplibregl-canvas, canvas")?.scrollIntoView({
        block: "center",
      });
    });
    // Wait for map canvas + either marker or maplibre map class (tiles may still load)
    await page
      .waitForSelector(".maplibregl-canvas, canvas.maplibregl-canvas", { timeout: 15000 })
      .catch(() => null);
    await page.waitForTimeout(1200);
    await page
      .waitForFunction(
        () => {
          const canvas = document.querySelector(".maplibregl-canvas, canvas");
          if (!canvas || canvas.width < 10) return false;
          return Boolean(document.querySelector(".maplibregl-marker, .maplibregl-map"));
        },
        { timeout: 10000 },
      )
      .catch(() => null);
    await page.waitForTimeout(400);

    s.beforeScreenshot = await shot(page, "V-01-before.png");
    const box = await page.locator(".maplibregl-canvas, canvas").first().boundingBox().catch(() => null);

    /**
     * Camera/action state without product code changes:
     * MapLibre API (window/React fiber/DOM), marker rect, then canvas sample.
     */
    async function captureActionState() {
      return page
        .evaluate(() => {
          const tryMap = (v) =>
            v && typeof v.getCenter === "function" && typeof v.getZoom === "function" ? v : null;

          function mapFromReactFiber(root) {
            if (!root) return null;
            const fiberKey = Object.keys(root).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
            if (!fiberKey) return null;
            const seen = new Set();
            const q = [root[fiberKey]];
            let hops = 0;
            while (q.length && hops++ < 4000) {
              const f = q.shift();
              if (!f || seen.has(f)) continue;
              seen.add(f);
              let st = f.memoizedState;
              let sh = 0;
              while (st && sh++ < 80) {
                const m = st.memoizedState;
                const hit = tryMap(m) || tryMap(m?.current);
                if (hit) return hit;
                st = st.next;
              }
              if (f.child) q.push(f.child);
              if (f.sibling) q.push(f.sibling);
              if (f.alternate) q.push(f.alternate);
            }
            return null;
          }

          let map =
            tryMap(window.__map) ||
            tryMap(window.maplibreMap) ||
            mapFromReactFiber(document.querySelector(".maplibregl-map")) ||
            mapFromReactFiber(document.querySelector("[class*='map']"));

          if (!map) {
            for (const el of document.querySelectorAll(".maplibregl-map, canvas, .maplibregl-canvas-container")) {
              for (const key of Object.getOwnPropertyNames(el)) {
                try {
                  map = tryMap(el[key]) || tryMap(el[key]?.current);
                  if (map) break;
                } catch {
                  /* */
                }
              }
              if (map) break;
            }
          }

          if (map) {
            const c = map.getCenter();
            return {
              kind: "maplibre",
              lng: Number(c.lng.toFixed(6)),
              lat: Number(c.lat.toFixed(6)),
              zoom: Number((map.getZoom?.() ?? 0).toFixed(4)),
              bearing: Number((map.getBearing?.() ?? 0).toFixed(2)),
              pitch: Number((map.getPitch?.() ?? 0).toFixed(2)),
            };
          }

          const markers = [...document.querySelectorAll(".maplibregl-marker")].map((m) => {
            const r = m.getBoundingClientRect();
            return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
          });
          const canvas = document.querySelector(".maplibregl-canvas, canvas");
          // Independent action-state sample: mid-row pixel checksum via 2d read if possible
          let rowSig = null;
          if (canvas) {
            try {
              const gl = canvas.getContext("webgl") || canvas.getContext("webgl2");
              if (gl) {
                const w = Math.min(32, canvas.width);
                const h = 1;
                const buf = new Uint8Array(w * h * 4);
                gl.readPixels(0, Math.floor(canvas.height / 2), w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) sum = (sum + buf[i] * (i + 1)) >>> 0;
                rowSig = { sum, w, canvasW: canvas.width, canvasH: canvas.height };
              }
            } catch {
              /* */
            }
          }
          return {
            kind: "visual-action-state",
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            markers,
            marker: markers[0] || null,
            rowSig,
            canvas: canvas ? { w: canvas.width, h: canvas.height } : null,
            mapClassPresent: Boolean(document.querySelector(".maplibregl-map")),
          };
        })
        .catch(() => ({ kind: "unavailable" }));
    }

    const cameraBefore = await captureActionState();

    if (box) {
      // Drag on map center — larger pan so markers/camera definitely move
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 120, cy + 40, { steps: 16 });
      await page.mouse.up();
      s.actionOccurred = true;
      s.notes = `region=${JSON.stringify(box)}; drag=(-120,40)`;
    } else {
      s.recoveryAttempted = true;
      s.recoveryAttempts = 1;
      await page.mouse.wheel(0, 400);
      s.actionOccurred = true;
      s.notes = "no canvas — wheel once";
    }
    await page.waitForTimeout(1000);
    s.afterScreenshot = await shot(page, "V-02-after.png");
    const cameraAfter = await captureActionState();
    Object.assign(s, deltaSince(bag, cp));

    const cmp = comparePanZoomEvidence(
      path.join(RUN, s.beforeScreenshot),
      path.join(RUN, s.afterScreenshot),
      {
        threshold: 0.008,
        noiseTolerance: 10,
        region: box
          ? { x: Math.max(0, box.x), y: Math.max(0, box.y), w: box.width, h: box.height }
          : undefined,
        cameraBefore,
        cameraAfter,
      },
    );
    s.pixelCompare = cmp;
    s.cameraBefore = cameraBefore;
    s.cameraAfter = cameraAfter;
    s.visionNoChange = !cmp.ok;
    s.expectedStateMet = s.actionOccurred && cmp.ok;
    s.actual = JSON.stringify({
      cmp: {
        ok: cmp.ok,
        ratio: cmp.ratio,
        pixelsChanged: cmp.pixelsChanged,
        cameraChanged: cmp.cameraChanged,
        reason: cmp.reason,
        region: cmp.region,
      },
      cameraBefore,
      cameraAfter,
    });
    s.visionObservation = cmp.ok
      ? "Pan/zoom proven: decoded pixels changed in map region AND camera/action state changed."
      : `Pan/zoom not proven (${cmp.reason}).`;
    finalizeStep(s);

    const traceAbs = path.join(dirs.traces, "vision-map.zip");
    await context.tracing.stop({ path: traceAbs });
    exec.tracePath = relToRun(RUN, traceAbs);
    exec.verdict = s.verdict;
    exec.pixelCompare = cmp;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  report.executions.push(exec);
}

async function runIsolation() {
  const { spawnSync } = await import("child_process");
  const isoOut = path.join(dirs.desktop, "isolation");
  mkdirSync(isoOut, { recursive: true });
  cleanup.trackTemp(isoOut);
  const r = spawnSync(process.execPath, ["qa-tooling/promise-qa/multi-role-context.mjs", "--probe"], {
    encoding: "utf8",
    timeout: 120000,
    env: { ...process.env, QA_OUT: isoOut },
  });
  const pass = r.status === 0;
  report.browserContextIsolation = pass ? "PASS" : "FAIL";
  const isoStep = {
    stepNumber: report.steps.length + 1,
    action: "isolation-probe",
    target: "two BrowserContexts",
    expected: "cookie isolation",
    actual: `status=${r.status}`,
    actionOccurred: true,
    expectedStateMet: pass,
    visualCheck: false,
    consoleCheckpointTaken: true,
    networkCheckpointTaken: true,
    visionObservation: "N/A non-visual",
    consoleDelta: [],
    networkDelta: [],
    recoveryAttempted: false,
    recoveryAttempts: 0,
  };
  const v = evaluateStep(
    isoStep,
    { requireBeforeShot: false, requireAfterShot: false, requireVision: false },
    { mode: MODE },
  );
  isoStep.verdict = v.verdict;
  isoStep.verdictReasons = v.reasons;
  report.steps.push(isoStep);
}

function secretScan(root) {
  const hits = [];
  const textScanned = [];
  const binarySkipped = [];
  const patterns = [/password\s*[:=]\s*['"]?[^'"\s]{6,}/i, /Bearer\s+[A-Za-z0-9\-_]{20,}/, /postgres(ql)?:\/\/[^\s"']+/i];
  function walk(d) {
    let entries = [];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const p = path.join(d, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (/\.(png|jpg|jpeg|webp|zip|webm|mp4)$/i.test(name)) {
        binarySkipped.push(relToRun(RUN, p));
      } else if (/\.(json|html|txt|log|md|yml|yaml)$/i.test(name) && !name.includes("secret-scan")) {
        let text = "";
        try {
          text = readFileSync(p, "utf8");
        } catch {
          continue;
        }
        textScanned.push(relToRun(RUN, p));
        if (patterns.some((re) => re.test(text) && !/\[REDACTED/.test(text.match(re)?.[0] || ""))) {
          hits.push(relToRun(RUN, p));
        }
      }
    }
  }
  walk(root);
  writeFileSync(
    path.join(dirs.report, "secret-scan.json"),
    JSON.stringify(
      {
        hitCount: hits.length,
        files: hits,
        scanned: {
          textArtifacts: textScanned.length,
          binaryTracesScreenshotsSkipped: binarySkipped.length,
        },
        binaryEvidencePrivacy: report.binaryEvidencePrivacy || "NOT VERIFIED",
        note:
          "Text artifacts scanned only. Binary screenshots/traces are NOT scanned and may contain on-screen data. " +
          "binaryEvidencePrivacy stays NOT VERIFIED until authenticated screenshot/trace redaction exists.",
      },
      null,
      2,
    ),
  );
  return hits.length === 0 ? "PASS" : "FAIL";
}

async function main() {
  try {
    await ensureServer();
    await runDesktop();
    await runMobile();
    await runVision();
    await runIsolation();
  } catch (e) {
    report.findings.push({ id: "run-exception", result: "FAIL", error: String(e.message || e) });
    finalizeStep(
      {
        stepNumber: report.steps.length + 1,
        action: "run-exception",
        expected: "no throw",
        actual: String(e.message || e),
        actionOccurred: false,
        expectedStateMet: false,
        visualCheck: false,
        consoleCheckpointTaken: true,
        networkCheckpointTaken: true,
        consoleDelta: [],
        networkDelta: [],
        recoveryAttempted: false,
        recoveryAttempts: 0,
        forcedVerdict: "FAIL",
        forcedReason: "exception",
      },
      { requireBeforeShot: false, requireAfterShot: false, requireVision: false },
    );
  }

  const c = await cleanup.cleanup();
  report.cleanupResult = c.result;
  if (!c.ok) report.findings.push({ id: "cleanup", result: "FAIL", errors: c.errors });

  // Nonce-bound MCP evidence: load manifests only — never env flags
  const proofs = loadAndValidateProofs(RUN, challenges);
  report.mcpRuntime = {
    desktop: proofs.desktop,
    mobile: proofs.mobile,
    details: proofs.details,
  };

  report.secretScanResult = secretScan(RUN);
  // Binary screenshots/traces are not redacted for auth session content yet
  if (report.optionalMatrix?.["authenticated-multi-role"] === "PASS" && report.binaryEvidencePrivacy !== "PASS") {
    report.optionalMatrix["authenticated-multi-role"] = "NOT VERIFIED";
    report.findings.push({
      id: "authenticated-blocked-binary-privacy",
      result: "NOT VERIFIED",
      note: "Authenticated multi-role cannot PASS until binaryEvidencePrivacy is PASS",
    });
  }

  let validation = await validateReport(report, RUN, { mode: MODE });
  // First write without final verdict lock
  const runV = evaluateRun({
    ...report,
    schemaValid: validation.schemaValid,
    evidenceValid: validation.evidenceValid,
  });
  report.finalVerdict = runV.finalVerdict;
  report.verdictReasons = runV.reasons;
  report.schemaValid = validation.schemaValid;
  report.evidenceValid = validation.evidenceValid;
  report.totals = {
    pass: report.steps.filter((s) => s.verdict === "PASS").length,
    fail: report.steps.filter((s) => s.verdict === "FAIL").length,
    notVerified: report.steps.filter((s) => s.verdict === "NOT VERIFIED").length,
    steps: report.steps.length,
  };

  writeReport();

  // HTML index must exist before final fail-closed validation
  try {
    const { spawnSync } = await import("child_process");
    spawnSync(process.execPath, ["qa-tooling/promise-qa/generate-evidence-index.mjs", "--run-dir", RUN], {
      stdio: "inherit",
    });
  } catch (e) {
    report.findings.push({ id: "html-index", result: "FAIL", error: String(e.message || e) });
  }

  // Re-validate after finalVerdict + HTML written
  validation = await validateReport(report, RUN, { mode: MODE });
  report.schemaValid = validation.schemaValid;
  report.evidenceValid = validation.evidenceValid;
  if (!validation.ok && report.finalVerdict === "INFRA PASS") {
    report.finalVerdict = "INFRA NO GO";
    report.verdictReasons = [...(report.verdictReasons || []), ...validation.errors.slice(0, 15)];
  }
  if (validation.errors?.includes("html-evidence-index-missing") && report.finalVerdict === "INFRA PASS") {
    report.finalVerdict = "INFRA NO GO";
  }
  writeReport();
  writeFileSync(path.join(dirs.report, "validation.json"), JSON.stringify(redactObject(validation), null, 2));

  clearTimeout(watchdog);
  if (watchdogFired) process.exit(2);

  const exitCode =
    report.finalVerdict === "INFRA PASS" ? 0 : report.finalVerdict === "PARTIAL" ? 3 : 1;

  console.log(
    JSON.stringify(
      {
        finalVerdict: report.finalVerdict,
        reasons: report.verdictReasons,
        totals: report.totals,
        runDir: RUN,
        mcpRuntime: report.mcpRuntime,
        cleanupResult: report.cleanupResult,
        secretScanResult: report.secretScanResult,
        challenges: challenges.map((c) => ({ server: c.server, nonce: c.nonce })),
        exitCode,
      },
      null,
      2,
    ),
  );
  process.exit(exitCode);
}

main().catch(async (e) => {
  console.error(e);
  const c = await cleanup.cleanup();
  report.cleanupResult = c.result;
  writeReport();
  clearTimeout(watchdog);
  process.exit(1);
});
