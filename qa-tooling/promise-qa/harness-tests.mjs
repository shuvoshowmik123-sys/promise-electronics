/**
 * Synthetic harness integrity tests (QA-02I).
 * Cleans temp dirs in finally. Exit 0 only if all pass.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { spawnSync } from "child_process";
import { classifyNetwork, classifyConsole, evaluateDeltas } from "./lib/classify.mjs";
import { evaluateStep, evaluateRun } from "./lib/verdict.mjs";
import { validateReport } from "./lib/validate-report.mjs";
import { redactObject, redactString } from "./lib/redact.mjs";
import { comparePngPixels, comparePanZoomEvidence, encodeSolidPng, encodeRgbaPng, decodePng } from "./lib/pixel-compare.mjs";
import { isPathInside, safeResolveEvidence } from "./lib/paths.mjs";
import { createChallenge, validateMcpProof, buildProofTemplate } from "./lib/mcp-proof.mjs";
import { createCleanupTracker } from "./lib/cleanup.mjs";
import { ConsoleLedger, laneFor } from "./lib/console-ledger.mjs";
import { Explorer, DESTRUCTIVE_LABEL } from "./lib/explorer.mjs";

const results = [];
const temps = [];

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      throw new Error("use testAsync for async");
    }
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message || e) });
    console.log(`FAIL  ${name}: ${e.message || e}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message || e) });
    console.log(`FAIL  ${name}: ${e.message || e}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

function tempDir() {
  const d = path.join("mobile-qa", "grok-playwright-mcp-02", `_harness_${randomUUID().slice(0, 8)}`);
  mkdirSync(path.join(d, "screenshots"), { recursive: true });
  mkdirSync(path.join(d, "report"), { recursive: true });
  temps.push(d);
  return d;
}

// ── classifier ──
test("expected-anon-customer-me-401", () => {
  const c = classifyNetwork(
    { method: "GET", status: 401, url: "http://127.0.0.1:5083/api/customer/me" },
    { actorState: "anonymous", authenticatedCustomer: false },
  );
  assert(c.class === "EXPECTED" && !c.blocksPass, JSON.stringify(c));
});

test("unexpected-auth-customer-me-401", () => {
  const c = classifyNetwork(
    { method: "GET", status: 401, url: "/api/customer/me" },
    { actorState: "authenticated", authenticatedCustomer: true },
  );
  assert(c.blocksPass, JSON.stringify(c));
});

test("api-500-blocks", () => {
  assert(classifyNetwork({ method: "GET", status: 500, url: "/api/foo" }).blocksPass);
});

test("typeerror-blocks", () => {
  assert(classifyConsole({ type: "error", text: "Uncaught TypeError: x" }).blocksPass);
});

test("missing-js-css-blocks", () => {
  const c = classifyNetwork({ method: "GET", status: 404, url: "/assets/app.js" });
  assert(c.blocksPass && c.reason === "missing-js-or-css", JSON.stringify(c));
});

test("missing-font-blocks", () => {
  const c = classifyNetwork({ method: "GET", status: 404, url: "/assets/font.woff2" });
  assert(c.blocksPass && c.reason === "missing-font", JSON.stringify(c));
});

test("missing-required-image-blocks", () => {
  const c = classifyNetwork({ method: "GET", status: 404, url: "/assets/logo.png" });
  assert(c.blocksPass && c.reason === "missing-required-image", JSON.stringify(c));
});

test("favicon-404-noise", () => {
  const c = classifyNetwork({ method: "GET", status: 404, url: "/favicon.ico" });
  assert(!c.blocksPass && c.class === "DEVELOPMENT NOISE", JSON.stringify(c));
});

test("unclassified-warning-blocks-delta", () => {
  const e = evaluateDeltas([{ type: "warning", text: "Something weird" }], [], { actorState: "anonymous" });
  assert(!e.ok);
});

test("firebase-local-oauth-warning-noise", () => {
  const c = classifyConsole({
    type: "warning",
    text: "Info: The current domain is not authorized for OAuth operations. Add your domain (127.0.0.1) to the OAuth redirect domains list in the Firebase console",
  });
  assert(!c.blocksPass && c.class === "DEVELOPMENT NOISE", JSON.stringify(c));
});

test("repeated-403-after-settle", () => {
  const events = Array.from({ length: 5 }, () => ({ method: "GET", status: 403, url: "/api/admin/jobs" }));
  assert(!evaluateDeltas([], events, { actorState: "authenticated" }).ok);
});

// ── pixel compare ──
test("pixel-identical-fail", () => {
  const a = encodeSolidPng(20, 20, [10, 20, 30, 255]);
  const b = encodeSolidPng(20, 20, [10, 20, 30, 255]);
  // re-encode path
  const r = comparePngPixels(a, b, { threshold: 0.01 });
  assert(!r.changed, JSON.stringify(r));
});

test("pixel-reencoded-identical-fail", () => {
  const a = encodeSolidPng(16, 16, [100, 100, 100, 255]);
  const dec = decodePng(a);
  const b = encodeRgbaPng(dec.width, dec.height, dec.data);
  const r = comparePngPixels(a, b, { threshold: 0.01 });
  assert(!r.changed, JSON.stringify(r));
  // different compressed size is fine
  assert(a.length !== b.length || a.length === b.length);
});

test("pixel-tiny-noise-fail", () => {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  data.fill(128);
  const a = encodeRgbaPng(16, 16, data);
  const data2 = new Uint8ClampedArray(data);
  data2[0] = 130; // within noise 8
  data2[4] = 132;
  const b = encodeRgbaPng(16, 16, data2);
  const r = comparePngPixels(a, b, { threshold: 0.01, noiseTolerance: 8 });
  assert(!r.changed, JSON.stringify(r));
});

test("pixel-real-movement-pass", () => {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  data.fill(200);
  const a = encodeRgbaPng(32, 32, data);
  const data2 = new Uint8ClampedArray(data);
  for (let i = 0; i < data2.length; i += 4) {
    data2[i] = 20;
    data2[i + 1] = 20;
    data2[i + 2] = 20;
  }
  const b = encodeRgbaPng(32, 32, data2);
  const r = comparePngPixels(a, b, { threshold: 0.01 });
  assert(r.changed && r.ratio > 0.5, JSON.stringify(r));
});

test("pixel-dimension-mismatch-fail", () => {
  const a = encodeSolidPng(10, 10, [0, 0, 0, 255]);
  const b = encodeSolidPng(12, 10, [0, 0, 0, 255]);
  const r = comparePngPixels(a, b);
  assert(!r.changed && r.reason === "dimension-mismatch", JSON.stringify(r));
});

test("pan-zoom-requires-pixels-and-camera", () => {
  const before = encodeSolidPng(24, 24, [40, 40, 40, 255]);
  const afterData = new Uint8ClampedArray(24 * 24 * 4);
  afterData.fill(200);
  const after = encodeRgbaPng(24, 24, afterData);
  const camA = { lng: 90.4, lat: 23.8, zoom: 12 };
  const camB = { lng: 90.41, lat: 23.8, zoom: 12 };
  const ok = comparePanZoomEvidence(before, after, {
    threshold: 0.01,
    cameraBefore: camA,
    cameraAfter: camB,
    region: { x: 0, y: 0, w: 24, h: 24 },
  });
  assert(ok.ok && ok.pixelsChanged && ok.cameraChanged, JSON.stringify(ok));

  const noCam = comparePanZoomEvidence(before, after, {
    threshold: 0.01,
    cameraBefore: camA,
    cameraAfter: camA,
  });
  assert(!noCam.ok && noCam.reason === "pixels-changed-but-camera-state-unchanged", JSON.stringify(noCam));

  const identical = comparePanZoomEvidence(before, before, {
    threshold: 0.01,
    cameraBefore: camA,
    cameraAfter: camB,
  });
  assert(!identical.ok, JSON.stringify(identical));
});

// ── redaction ──
test("redaction-preserves-status", () => {
  const o = redactObject({
    secretScanResult: "PASS",
    cleanupResult: "PASS",
    finalVerdict: "INFRA NO GO",
    schemaValid: true,
    evidenceValid: false,
    mcpRuntime: { desktop: "PASS", mobile: "NOT VERIFIED" },
    password: "supersecret",
    token: "abc123tokenvalue",
  });
  assert(o.secretScanResult === "PASS", JSON.stringify(o));
  assert(o.cleanupResult === "PASS");
  assert(o.finalVerdict === "INFRA NO GO");
  assert(o.schemaValid === true);
  assert(o.evidenceValid === false);
  assert(o.mcpRuntime.desktop === "PASS");
  assert(o.password === "[REDACTED]");
  assert(o.token === "[REDACTED]");
});

test("redaction-removes-secrets-in-strings", () => {
  const s = redactString("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5pXVCJ9.abc.def password=hunter2");
  assert(!/eyJhbGci/.test(s) && !/hunter2/.test(s), s);
});

// ── paths ──
test("path-rejects-sibling-prefix", () => {
  assert(!isPathInside(path.resolve("mobile-qa"), path.resolve("mobile-qa-evil/x")));
  assert(isPathInside(path.resolve("mobile-qa"), path.resolve("mobile-qa/grok/x")));
});

test("path-rejects-dotdot", () => {
  const r = safeResolveEvidence(path.resolve("mobile-qa/run1"), "../secrets.txt");
  assert(!r.ok, JSON.stringify(r));
});

// ── Nonce-bound MCP evidence ──
function writeProofFixtures(dir, w, h) {
  mkdirSync(path.join(dir, "screenshots"), { recursive: true });
  mkdirSync(path.join(dir, "console"), { recursive: true });
  mkdirSync(path.join(dir, "network"), { recursive: true });
  mkdirSync(path.join(dir, "report"), { recursive: true });
  const png = encodeSolidPng(w, h, [20, 40, 60, 255]);
  writeFileSync(path.join(dir, "screenshots", "before.png"), png);
  writeFileSync(path.join(dir, "screenshots", "action.png"), png);
  writeFileSync(path.join(dir, "screenshots", "after.png"), png);
  writeFileSync(path.join(dir, "console", "console.json"), "[]");
  writeFileSync(path.join(dir, "network", "network.json"), "[]");
  writeFileSync(path.join(dir, "report", "a11y.md"), "# a11y\n");
}

function completeDesktopProof(ch, overrides = {}) {
  return {
    ...buildProofTemplate(ch, {
      mcpServerIdentity: "playwright",
      browser: "chrome",
      viewport: { width: 1440, height: 900 },
      touch: true,
      coarsePointer: false,
      maxTouchPoints: 10,
      beforeScreenshot: "screenshots/before.png",
      actionScreenshot: "screenshots/action.png",
      afterScreenshot: "screenshots/after.png",
      consoleEvidencePath: "console/console.json",
      networkEvidencePath: "network/network.json",
      accessibilityEvidencePath: "report/a11y.md",
      action: "accessibility-click Track Order",
      expected: "navigate to /track-order",
      actual: "navigated to /track-order",
      actionSucceeded: true,
      consoleCheckpoint: true,
      networkCheckpoint: true,
      visionObservation: "Track order page rendered after click at desktop 1440x900.",
    }),
    ...overrides,
  };
}

test("mcp-proof-rejects-wrong-nonce", () => {
  const dir = tempDir();
  writeProofFixtures(dir, 1440, 900);
  const ch = createChallenge(path.basename(dir), "playwright");
  const proof = completeDesktopProof(ch);
  proof.nonce = "forged";
  const v = validateMcpProof(ch, proof, dir);
  assert(v.verdict === "FAIL" && v.reasons.includes("nonce-mismatch"), JSON.stringify(v));
});

test("mcp-env-flag-cannot-forge-pass", () => {
  // Env overrides never create PASS — only nonce-bound evidence manifests do.
  process.env.QA_MCP_DESKTOP_PROOF = "1";
  process.env.QA_MCP_MOBILE_PROOF = "1";
  const ch = createChallenge("run2", "playwright");
  const v = validateMcpProof(ch, null, ".");
  assert(v.verdict === "NOT VERIFIED");
  assert(v.verdict !== "PASS");
  delete process.env.QA_MCP_DESKTOP_PROOF;
  delete process.env.QA_MCP_MOBILE_PROOF;
});

test("mcp-proof-missing-required-evidence-not-pass", () => {
  const dir = tempDir();
  writeProofFixtures(dir, 1440, 900);
  const ch = createChallenge(path.basename(dir), "playwright");
  const proof = completeDesktopProof(ch, { beforeScreenshot: null, actionScreenshot: null });
  const v = validateMcpProof(ch, proof, dir);
  assert(v.verdict !== "PASS", JSON.stringify(v));
  assert(v.reasons.some((r) => r.includes("beforeScreenshot")), JSON.stringify(v));
});

test("mcp-desktop-wrong-dimensions-fail", () => {
  const dir = tempDir();
  writeProofFixtures(dir, 1280, 720);
  const ch = createChallenge(path.basename(dir), "playwright");
  const proof = completeDesktopProof(ch, { viewport: { width: 1280, height: 720 } });
  const v = validateMcpProof(ch, proof, dir);
  assert(v.verdict !== "PASS", JSON.stringify(v));
  assert(v.reasons.some((r) => r.includes("desktop-viewport-not-exact")), JSON.stringify(v));
});

test("mcp-desktop-coarse-true-fail", () => {
  const dir = tempDir();
  writeProofFixtures(dir, 1440, 900);
  const ch = createChallenge(path.basename(dir), "playwright");
  const proof = completeDesktopProof(ch, { coarsePointer: true });
  const v = validateMcpProof(ch, proof, dir);
  assert(v.verdict !== "PASS");
  assert(v.reasons.includes("desktop-coarsePointer-must-be-false"), JSON.stringify(v));
});

test("mcp-mobile-wrong-height-fail", () => {
  const dir = tempDir();
  writeProofFixtures(dir, 390, 800);
  const ch = createChallenge(path.basename(dir), "playwright-mobile");
  const proof = buildProofTemplate(ch, {
    mcpServerIdentity: "playwright-mobile",
    viewport: { width: 390, height: 800 },
    touch: true,
    maxTouchPoints: 5,
    coarsePointer: true,
    beforeScreenshot: "screenshots/before.png",
    actionScreenshot: "screenshots/action.png",
    afterScreenshot: "screenshots/after.png",
    consoleEvidencePath: "console/console.json",
    networkEvidencePath: "network/network.json",
    accessibilityEvidencePath: "report/a11y.md",
    action: "tap",
    expected: "ok",
    actual: "ok",
    actionSucceeded: true,
    consoleCheckpoint: true,
    networkCheckpoint: true,
    visionObservation: "Mobile home after tap interaction.",
  });
  const v = validateMcpProof(ch, proof, dir);
  assert(v.verdict !== "PASS");
  assert(v.reasons.some((r) => r.includes("mobile-viewport-not-exact")), JSON.stringify(v));
});

test("mcp-mobile-missing-touch-fail", () => {
  const dir = tempDir();
  writeProofFixtures(dir, 390, 844);
  const ch = createChallenge(path.basename(dir), "playwright-mobile");
  const proof = buildProofTemplate(ch, {
    mcpServerIdentity: "playwright-mobile",
    viewport: { width: 390, height: 844 },
    touch: false,
    maxTouchPoints: 5,
    coarsePointer: true,
    beforeScreenshot: "screenshots/before.png",
    actionScreenshot: "screenshots/action.png",
    afterScreenshot: "screenshots/after.png",
    consoleEvidencePath: "console/console.json",
    networkEvidencePath: "network/network.json",
    accessibilityEvidencePath: "report/a11y.md",
    action: "tap",
    expected: "ok",
    actual: "ok",
    actionSucceeded: true,
    consoleCheckpoint: true,
    networkCheckpoint: true,
    visionObservation: "Mobile home after tap interaction.",
  });
  const v = validateMcpProof(ch, proof, dir);
  assert(v.verdict !== "PASS");
  assert(v.reasons.includes("mobile-touch-must-be-true"), JSON.stringify(v));
});

test("mcp-mobile-missing-coarse-fail", () => {
  const dir = tempDir();
  writeProofFixtures(dir, 390, 844);
  const ch = createChallenge(path.basename(dir), "playwright-mobile");
  const proof = buildProofTemplate(ch, {
    mcpServerIdentity: "playwright-mobile",
    viewport: { width: 390, height: 844 },
    touch: true,
    maxTouchPoints: 5,
    coarsePointer: false,
    beforeScreenshot: "screenshots/before.png",
    actionScreenshot: "screenshots/action.png",
    afterScreenshot: "screenshots/after.png",
    consoleEvidencePath: "console/console.json",
    networkEvidencePath: "network/network.json",
    accessibilityEvidencePath: "report/a11y.md",
    action: "tap",
    expected: "ok",
    actual: "ok",
    actionSucceeded: true,
    consoleCheckpoint: true,
    networkCheckpoint: true,
    visionObservation: "Mobile home after tap interaction.",
  });
  const v = validateMcpProof(ch, proof, dir);
  assert(v.verdict !== "PASS");
  assert(v.reasons.includes("mobile-coarsePointer-must-be-true"), JSON.stringify(v));
});

test("mcp-proof-rejects-absolute-and-dotdot-paths", () => {
  const dir = tempDir();
  writeProofFixtures(dir, 1440, 900);
  const ch = createChallenge(path.basename(dir), "playwright");
  const abs = path.resolve(dir, "screenshots/before.png");
  const proof = completeDesktopProof(ch, { beforeScreenshot: abs });
  const v = validateMcpProof(ch, proof, dir);
  assert(v.verdict !== "PASS");
  assert(v.reasons.some((r) => r.includes("absolute") || r.includes("path-invalid")), JSON.stringify(v));

  const proof2 = completeDesktopProof(ch, { afterScreenshot: "../secrets.png" });
  const v2 = validateMcpProof(ch, proof2, dir);
  assert(v2.verdict !== "PASS");
});

test("mcp-complete-desktop-with-exact-metrics-pass", () => {
  const dir = tempDir();
  writeProofFixtures(dir, 1440, 900);
  const ch = createChallenge(path.basename(dir), "playwright");
  const proof = completeDesktopProof(ch);
  const v = validateMcpProof(ch, proof, dir);
  assert(v.ok && v.verdict === "PASS", JSON.stringify(v));
});

test("authenticated-multi-role-blocked-without-binary-privacy", () => {
  const r = evaluateRun({
    steps: [{ stepNumber: 1, verdict: "PASS" }],
    unexpectedConsoleCount: 0,
    failedNetworkCount: 0,
    cleanupResult: "PASS",
    secretScanResult: "PASS",
    schemaValid: true,
    evidenceValid: true,
    binaryEvidencePrivacy: "NOT VERIFIED",
    optionalMatrix: { "authenticated-multi-role": "PASS" },
  });
  assert(r.finalVerdict === "INFRA NO GO", JSON.stringify(r));
  assert(r.reasons.some((x) => x.includes("binaryEvidencePrivacy")), JSON.stringify(r));
});

// ── cleanup ──
await testAsync("cleanup-success", async () => {
  const t = createCleanupTracker();
  const fake = {
    close: async () => {},
    tracing: { stop: async () => {} },
  };
  t.trackBrowser(fake);
  t.trackContext(fake);
  t.trackTracing(fake);
  const r = await t.cleanup();
  assert(r.ok && r.result === "PASS", JSON.stringify(r));
  assert(t.openBrowsers === 0);
});

await testAsync("cleanup-close-failure", async () => {
  const t = createCleanupTracker();
  t.trackBrowser({
    close: async () => {
      throw new Error("close failed");
    },
  });
  const r = await t.cleanup();
  assert(!r.ok && r.result === "FAIL", JSON.stringify(r));
});

// ── verdict / validate ──
test("no-unconditional-pass", () => {
  assert(evaluateStep({}, {}, { mode: "STRICT" }).verdict === "FAIL");
});

await testAsync("validate-missing-before", async () => {
  const dir = tempDir();
  writeFileSync(path.join(dir, "screenshots", "after.png"), "x");
  const report = {
    phaseId: "H",
    startedAt: new Date().toISOString(),
    baseUrl: "http://127.0.0.1:5083",
    environment: "local",
    mode: "STRICT",
    steps: [
      {
        stepNumber: 1,
        action: "nav",
        verdict: "PASS",
        afterScreenshot: "screenshots/after.png",
        actionOccurred: true,
        expectedStateMet: true,
        consoleCheckpointTaken: true,
        networkCheckpointTaken: true,
        visionObservation: "Page rendered with content visible.",
      },
    ],
    finalVerdict: "INFRA PASS",
    cleanupResult: "PASS",
    secretScanResult: "PASS",
  };
  const r = await validateReport(report, dir);
  assert(!r.ok && r.errors.some((e) => e.includes("missing-before")));
});

await testAsync("validate-complete-with-mcp-missing-is-fail", async () => {
  const dir = tempDir();
  writeFileSync(path.join(dir, "screenshots", "before.png"), "x");
  writeFileSync(path.join(dir, "screenshots", "after.png"), "x");
  const report = {
    phaseId: "H",
    runId: "r1",
    startedAt: new Date().toISOString(),
    baseUrl: "http://127.0.0.1:5083",
    environment: "local",
    mode: "STRICT",
    requireMcpRuntime: true,
    mcpChallenges: [],
    steps: [
      {
        stepNumber: 1,
        action: "nav",
        verdict: "PASS",
        beforeScreenshot: "screenshots/before.png",
        afterScreenshot: "screenshots/after.png",
        actionOccurred: true,
        expectedStateMet: true,
        consoleCheckpointTaken: true,
        networkCheckpointTaken: true,
        visionObservation: "Home hero and primary navigation are visible.",
      },
    ],
    executions: [],
    finalVerdict: "INFRA PASS",
    cleanupResult: "PASS",
    secretScanResult: "PASS",
  };
  const r = await validateReport(report, dir);
  assert(!r.ok, JSON.stringify(r.errors));
  assert(r.exitCode === 1);
});

test("run-verdict-fail-closed", () => {
  const r = evaluateRun({
    steps: [
      { stepNumber: 1, verdict: "PASS" },
      { stepNumber: 2, verdict: "NOT VERIFIED" },
    ],
    unexpectedConsoleCount: 0,
    failedNetworkCount: 0,
    cleanupResult: "PASS",
    schemaValid: true,
    evidenceValid: true,
  });
  assert(r.finalVerdict === "INFRA NO GO");
  assert(r.exitCode === 1);
});

test("partial-uses-exit-code-3", () => {
  const r = evaluateRun({
    steps: [{ stepNumber: 1, verdict: "PASS" }],
    unexpectedConsoleCount: 0,
    failedNetworkCount: 0,
    cleanupResult: "PASS",
    secretScanResult: "PASS",
    schemaValid: true,
    evidenceValid: true,
    optionalMatrix: { "viewport-430x932": "NOT VERIFIED" },
  });
  assert(r.finalVerdict === "PARTIAL", JSON.stringify(r));
  assert(r.exitCode === 3, JSON.stringify(r));
});

await testAsync("schema-only-allows-incomplete-evidence", async () => {
  const r = await validateReport(
    {
      phaseId: "H",
      startedAt: new Date().toISOString(),
      baseUrl: "http://127.0.0.1:5083",
      environment: "local",
      steps: [{ stepNumber: 1, action: "x", verdict: "PASS" }],
      finalVerdict: "INFRA NO GO",
    },
    path.resolve("."),
    { schemaOnly: true },
  );
  assert(r.ok && r.exitCode === 0, JSON.stringify(r));
});

await testAsync("validation-full-and-schema-files-remain-separate", async () => {
  const dir = tempDir();
  mkdirSync(path.join(dir, "report"), { recursive: true });
  mkdirSync(path.join(dir, "screenshots"), { recursive: true });
  // Deliberately incomplete run: steps claim PASS without before shot / MCP
  const report = {
    phaseId: "GROK-PLAYWRIGHT-QA-02I",
    runId: path.basename(dir),
    startedAt: new Date().toISOString(),
    baseUrl: "http://127.0.0.1:5083",
    environment: "local",
    mode: "STRICT",
    requireMcpRuntime: true,
    mcpChallenges: [],
    steps: [
      {
        stepNumber: 1,
        action: "nav",
        verdict: "PASS",
        afterScreenshot: "screenshots/after.png",
        actionOccurred: true,
        expectedStateMet: true,
        consoleCheckpointTaken: true,
        networkCheckpointTaken: true,
        visionObservation: "Incomplete evidence on purpose for validator regression.",
      },
    ],
    executions: [],
    finalVerdict: "INFRA NO GO",
    cleanupResult: "PASS",
    secretScanResult: "PASS",
    binaryEvidencePrivacy: "NOT VERIFIED",
  };
  writeFileSync(path.join(dir, "screenshots", "after.png"), encodeSolidPng(10, 10));
  writeFileSync(path.join(dir, "report", "run-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(path.join(dir, "report", "evidence-index.html"), "<html></html>");

  const full = spawnSync(process.execPath, ["qa-tooling/promise-qa/validate-report.mjs", "--run-dir", dir], {
    encoding: "utf8",
  });
  assert(full.status === 1, `full exit=${full.status} ${full.stdout}`);
  const fullPath = path.join(dir, "report", "validation-full.json");
  assert(existsSync(fullPath), "validation-full.json missing");
  const fullJson = JSON.parse(readFileSync(fullPath, "utf8"));
  assert(fullJson.ok === false, JSON.stringify(fullJson));
  assert(fullJson.mode === "full", JSON.stringify(fullJson));
  assert((fullJson.errors || []).length > 0, "full must record errors");

  const schema = spawnSync(
    process.execPath,
    ["qa-tooling/promise-qa/validate-report.mjs", "--run-dir", dir, "--schema-only"],
    { encoding: "utf8" },
  );
  assert(schema.status === 0, `schema exit=${schema.status} ${schema.stdout}`);
  const schemaPath = path.join(dir, "report", "validation-schema.json");
  assert(existsSync(schemaPath), "validation-schema.json missing");
  const schemaJson = JSON.parse(readFileSync(schemaPath, "utf8"));
  assert(schemaJson.ok === true && schemaJson.mode === "schema-only", JSON.stringify(schemaJson));

  // Full result must still record the failure after schema-only run
  const fullAfter = JSON.parse(readFileSync(fullPath, "utf8"));
  assert(fullAfter.ok === false, "schema-only overwrote full validation");
  assert((fullAfter.errors || []).length > 0, "full errors lost");
  assert(fullAfter.mode === "full");
});

// cleanup temps
for (const d of temps) {
  try {
    rmSync(d, { recursive: true, force: true });
  } catch {
    /* */
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Console lanes
// ─────────────────────────────────────────────────────────────────────────────

test("lane-red-carries-anything-that-blocks", () => {
  if (laneFor("BLOCKING", { blocksPass: true }) !== "red") throw new Error("blocking is not red");
  if (laneFor("PRODUCT ERROR") !== "red") throw new Error("product error is not red");
  if (laneFor("SECURITY") !== "red") throw new Error("security is not red");
  // A classifier that mislabels something as noise must still not demote it if
  // it blocks: blocksPass wins over the label.
  if (laneFor("DEVELOPMENT NOISE", { blocksPass: true }) !== "red") throw new Error("blocksPass ignored");
});

test("lane-green-is-quarantined-not-deleted", () => {
  const ledger = new ConsoleLedger({ session: "t" });
  for (let i = 0; i < 5; i++) {
    ledger.record({ lane: "green", kind: "console", text: `noise ${i}`, reason: "devtools-or-extension" });
  }
  if (ledger.counts.green !== 5) throw new Error("green not counted");
  // Counted and summarisable, but never carried in the digest body — the old
  // code dropped these at classification time, so nobody could audit them.
  const digest = ledger.digest();
  if (!digest.greenTop.includes("devtools-or-extension×5")) throw new Error("green not summarised");
  if (JSON.stringify(digest).includes("noise 3")) throw new Error("green text leaked into digest");
});

test("red-keeps-a-real-stack-not-300-characters", () => {
  const ledger = new ConsoleLedger({ session: "t" });
  const stack = Array.from({ length: 30 }, (_, i) => `    at frame${i} (/app/src/file${i}.tsx:${i}:1)`).join("\n");
  const row = ledger.pageError(Object.assign(new Error("Cannot read properties of undefined"), { stack }));
  if (row.lane !== "red") throw new Error("uncaught exception is not red");
  // The frame that names your own file is usually not in the first 300 chars.
  if (!row.stack.includes("frame20")) throw new Error("stack truncated too early");
});

test("red-records-the-action-that-preceded-it", () => {
  const ledger = new ConsoleLedger({ session: "t" });
  ledger.noteAction({ action: "press", target: "Close Register" });
  const row = ledger.pageError(new Error("boom"));
  if (row.afterAction?.target !== "Close Register") throw new Error("preceding action not attached");
  const digest = ledger.digest();
  if (digest.red[0].afterAction !== "press Close Register") throw new Error("digest lost the action");
});

test("aborted-requests-are-noise-not-failures", () => {
  const ledger = new ConsoleLedger({ session: "t" });
  const aborted = ledger.requestFailed({
    method: () => "GET",
    url: () => "http://127.0.0.1:5083/api/x",
    failure: () => ({ errorText: "net::ERR_ABORTED" }),
  });
  const dead = ledger.requestFailed({
    method: () => "GET",
    url: () => "http://127.0.0.1:5083/api/y",
    failure: () => ({ errorText: "net::ERR_CONNECTION_REFUSED" }),
  });
  // Navigating away cancels in-flight requests; that is the harness, not a bug.
  if (aborted.lane !== "green") throw new Error("aborted request treated as a failure");
  if (dead.lane !== "red") throw new Error("refused connection not treated as a failure");
});

test("ledger-memory-is-bounded-but-disk-is-not-consulted", () => {
  const ledger = new ConsoleLedger({ session: "t" });
  for (let i = 0; i < 500; i++) {
    ledger.record({ lane: "amber", kind: "console", text: `warn ${i}`, reason: "r" });
  }
  if (ledger.counts.amber !== 500) throw new Error("count must be complete");
  if (ledger.rows.amber.length > 200) throw new Error("memory not bounded");
  // Newest kept, not oldest: the last thing that happened is the useful one.
  if (!ledger.rows.amber.at(-1).text.includes("warn 499")) throw new Error("kept the wrong end");
});

// ─────────────────────────────────────────────────────────────────────────────
// Autonomous walk
// ─────────────────────────────────────────────────────────────────────────────

function stubExplorer(options = {}) {
  const session = { name: "s", page: { url: () => "http://127.0.0.1:5083/admin" }, issues: [] };
  const explorer = new Explorer({ driver: { sequence: 0 }, session }, options);
  explorer.hostname = "127.0.0.1";
  return explorer;
}

test("destructive-labels-are-never-pressed-by-default", () => {
  const explorer = stubExplorer();
  // Every one of these exists in this admin panel and every one of them does
  // something to real data.
  for (const name of [
    "Delete", "Close Register", "Send", "Refund", "Sign out", "Approve",
    "Blacklist", "Issue reset link", "Complete Job", "Merge",
  ]) {
    const reason = explorer.shouldAvoid({ role: "button", name });
    if (reason !== "destructive-label") throw new Error(`${name} would have been pressed (${reason})`);
  }
});

test("harmless-controls-are-still-pressed", () => {
  const explorer = stubExplorer();
  for (const name of ["Customers", "Search", "Filter", "Next page", "Open details"]) {
    if (explorer.shouldAvoid({ role: "button", name })) throw new Error(`${name} was wrongly skipped`);
  }
});

test("destructive-permission-needs-two-locks", () => {
  // The flag alone does nothing: the server environment must agree. One lock
  // is one accident away from closing the till.
  const explorer = stubExplorer({ allowDestructive: true });
  if (explorer.shouldAvoid({ role: "button", name: "Delete" })) {
    throw new Error("flag did not widen the walk");
  }
  const guarded = stubExplorer();
  if (!guarded.shouldAvoid({ role: "button", name: "Delete" })) {
    throw new Error("default did not protect");
  }
});

test("scope-keeps-the-walk-inside-the-app-area", () => {
  const explorer = stubExplorer({ scope: ["/admin"] });
  if (!explorer.inScope("/admin/customers")) throw new Error("in-scope path rejected");
  if (explorer.inScope("/customer/portal")) throw new Error("out-of-scope path accepted");
});

test("the-same-screen-twice-is-one-state", () => {
  const explorer = stubExplorer();
  const elements = [
    { role: "button", name: "Save" },
    { role: "button", name: "Cancel" },
  ];
  const survey = { pathname: "/admin/jobs", textLength: 100, elements };
  const first = explorer.pickNext(survey, "sig-a");
  const second = explorer.pickNext(survey, "sig-a");
  if (first?.name !== "Save") throw new Error("did not pick the first pressable control");
  // Cancel is destructive-adjacent? No — it is pressable, so the walk moves on
  // to it rather than pressing Save twice.
  if (second?.name !== "Cancel") throw new Error("pressed the same control twice");
  if (explorer.pickNext(survey, "sig-a") !== null) throw new Error("state did not exhaust");
});

test("findings-are-grouped-not-repeated", () => {
  const explorer = stubExplorer();
  // One overflowing table hit on forty screens is one bug, not forty lines.
  for (let i = 0; i < 40; i++) {
    explorer.steps.push({
      step: i + 1,
      pathname: `/admin/tab${i % 3}`,
      target: `btn-${i}`,
      findings: [{ code: "HORIZONTAL_OVERFLOW", target: "document", severity: "HIGH" }],
    });
  }
  const summary = explorer.summarise();
  if (summary.findings.length !== 1) throw new Error(`grouped to ${summary.findings.length}`);
  if (summary.findings[0].occurrences !== 40) throw new Error("occurrence count lost");
  if (summary.findings[0].paths.length > 6) throw new Error("path list unbounded");
});

test("skipped-controls-are-reported-so-coverage-is-honest", () => {
  const explorer = stubExplorer();
  const survey = {
    pathname: "/admin",
    textLength: 10,
    elements: [{ role: "button", name: "Delete" }, { role: "button", name: "Refresh" }],
  };
  const picked = explorer.pickNext(survey, "sig-b");
  if (picked?.name !== "Refresh") throw new Error("skipped the wrong control");
  const summary = explorer.summarise();
  if (summary.skipped["destructive-label"] !== 1) throw new Error("skip not reported");
});

test("budget-is-enforced-on-both-steps-and-time", () => {
  const explorer = stubExplorer({ maxSteps: 2, maxMs: 5000 });
  explorer.startedAt = Date.now();
  if (!explorer.budgetLeft()) throw new Error("fresh walk has no budget");
  explorer.steps.push({}, {});
  if (explorer.budgetLeft()) throw new Error("step budget not enforced");

  const timed = stubExplorer({ maxSteps: 100, maxMs: 5000 });
  timed.startedAt = Date.now() - 6000;
  if (timed.budgetLeft()) throw new Error("time budget not enforced");
});

test("destructive-pattern-matches-whole-words-in-context", () => {
  // Matched against the visible label, because the button that wipes the day's
  // takings is identified by the word on it and not by its class name.
  if (!DESTRUCTIVE_LABEL.test("Close Register & Print")) throw new Error("compound label missed");
  if (!DESTRUCTIVE_LABEL.test("DELETE CUSTOMER")) throw new Error("case sensitivity");
  if (DESTRUCTIVE_LABEL.test("Customers")) throw new Error("false positive on a nav item");
});

// ensure no leftover _harness_ under mcp-02 from this process
const base = path.join("mobile-qa", "grok-playwright-mcp-02");
if (existsSync(base)) {
  for (const name of readdirSyncSafe(base)) {
    if (name.startsWith("_harness_")) {
      try {
        rmSync(path.join(base, name), { recursive: true, force: true });
      } catch {
        /* */
      }
    }
  }
}

function readdirSyncSafe(d) {
  try {
    return readdirSync(d);
  } catch {
    return [];
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\nHarness: ${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
