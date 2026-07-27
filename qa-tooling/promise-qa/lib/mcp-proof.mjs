/**
 * Nonce-bound MCP evidence validation.
 *
 * Nonce binding prevents accidental cross-run reuse of challenge/proof pairs.
 * This is not cryptographic proof and can be fabricated by a local process.
 * Operational trust comes from: live Grok MCP inventory + retained run evidence.
 * Env flags alone never create PASS.
 */
import { randomBytes, createHash } from "crypto";
import { writeFileSync, readFileSync, existsSync } from "fs";
import path from "path";
import { safeResolveEvidence } from "./paths.mjs";
import { decodePng } from "./pixel-compare.mjs";

const REQUIRED_EVIDENCE_FIELDS = [
  "beforeScreenshot",
  "actionScreenshot",
  "afterScreenshot",
  "consoleEvidencePath",
  "networkEvidencePath",
  "accessibilityEvidencePath",
];

export function createChallenge(runId, server) {
  const nonce = randomBytes(16).toString("hex");
  const createdAt = new Date().toISOString();
  return {
    runId,
    server, // playwright | playwright-mobile
    nonce,
    createdAt,
    expectedAction: server === "playwright-mobile" ? "tap" : "accessibility-click",
  };
}

export function writeChallenge(runDir, challenge) {
  const p = path.join(runDir, "report", `mcp-challenge-${challenge.server}.json`);
  writeFileSync(p, JSON.stringify(challenge, null, 2));
  return p;
}

/**
 * Build an evidence template that a live Grok MCP session must fill.
 */
export function buildProofTemplate(challenge, extras = {}) {
  return {
    runId: challenge.runId,
    nonce: challenge.nonce,
    server: challenge.server,
    mcpServerIdentity: extras.mcpServerIdentity || challenge.server,
    browser: extras.browser || null,
    viewport: extras.viewport || null,
    touch: extras.touch ?? null,
    coarsePointer: extras.coarsePointer ?? null,
    maxTouchPoints: extras.maxTouchPoints ?? null,
    beforeScreenshot: extras.beforeScreenshot || null,
    actionScreenshot: extras.actionScreenshot || null,
    afterScreenshot: extras.afterScreenshot || null,
    // legacy alias — not sufficient alone
    screenshotPath: extras.screenshotPath || extras.afterScreenshot || null,
    consoleEvidencePath: extras.consoleEvidencePath || extras.evidence?.console || null,
    networkEvidencePath: extras.networkEvidencePath || extras.evidence?.network || null,
    accessibilityEvidencePath:
      extras.accessibilityEvidencePath || extras.evidence?.a11y || extras.evidence?.accessibility || null,
    action: extras.action || null,
    expected: extras.expected || null,
    actual: extras.actual || null,
    actionSucceeded: extras.actionSucceeded ?? false,
    consoleCheckpoint: extras.consoleCheckpoint ?? false,
    networkCheckpoint: extras.networkCheckpoint ?? false,
    visionObservation: extras.visionObservation || null,
    timestamp: new Date().toISOString(),
    proofVerdict: "NOT VERIFIED",
  };
}

function requireRelativeEvidencePath(runDir, rel, label, reasons) {
  if (rel == null || String(rel).trim() === "") {
    reasons.push(`missing-${label}`);
    return null;
  }
  const s = String(rel);
  if (path.isAbsolute(s)) {
    reasons.push(`${label}-absolute-path-rejected`);
    return null;
  }
  if (s.includes("\0") || s.includes("..")) {
    // still run safeResolve for consistent reasons
  }
  const res = safeResolveEvidence(runDir, s);
  if (!res.ok) {
    reasons.push(`${label}-path-invalid:${res.reason}`);
    return null;
  }
  if (!existsSync(res.path)) {
    reasons.push(`${label}-file-missing`);
    return null;
  }
  return res.path;
}

function pngDimensionsMatch(filePath, expectedW, expectedH, label, reasons) {
  try {
    const img = decodePng(readFileSync(filePath));
    if (img.width !== expectedW || img.height !== expectedH) {
      reasons.push(
        `${label}-png-dims-mismatch:got-${img.width}x${img.height}-expected-${expectedW}x${expectedH}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    reasons.push(`${label}-not-valid-png:${e.message || e}`);
    return false;
  }
}

/**
 * Validate MCP evidence against challenge + runDir.
 * @returns {{ ok: boolean, verdict: 'PASS'|'NOT VERIFIED'|'FAIL', reasons: string[] }}
 */
export function validateMcpProof(challenge, proof, runDir) {
  const reasons = [];
  if (!challenge || !proof) {
    return { ok: false, verdict: "NOT VERIFIED", reasons: ["missing-challenge-or-proof"] };
  }
  if (proof.runId !== challenge.runId) reasons.push("runId-mismatch");
  if (proof.nonce !== challenge.nonce) reasons.push("nonce-mismatch");
  if (proof.server !== challenge.server) reasons.push("server-mismatch");

  const identity = proof.mcpServerIdentity || proof.serverIdentity;
  if (!identity) reasons.push("missing-mcpServerIdentity");
  else if (identity !== challenge.server) reasons.push("mcpServerIdentity-mismatch");

  // Required text/action fields
  if (!proof.action) reasons.push("missing-action");
  if (!proof.expected) reasons.push("missing-expected");
  if (!proof.actual) reasons.push("missing-actual");
  if (!proof.actionSucceeded) reasons.push("action-not-succeeded");
  if (!proof.consoleCheckpoint) reasons.push("missing-console-checkpoint");
  if (!proof.networkCheckpoint) reasons.push("missing-network-checkpoint");
  if (!proof.visionObservation || String(proof.visionObservation).trim().length < 12) {
    reasons.push("missing-vision-observation");
  }

  // Viewport exactness
  if (!proof.viewport || typeof proof.viewport.width !== "number" || typeof proof.viewport.height !== "number") {
    reasons.push("missing-viewport");
  } else if (proof.server === "playwright") {
    if (proof.viewport.width !== 1440 || proof.viewport.height !== 900) {
      reasons.push("desktop-viewport-not-exact-1440x900");
    }
    if (proof.coarsePointer !== false) {
      reasons.push("desktop-coarsePointer-must-be-false");
    }
    // maxTouchPoints may be > 0 on Windows touchscreens; coarse must stay false
  } else if (proof.server === "playwright-mobile") {
    if (proof.viewport.width !== 390 || proof.viewport.height !== 844) {
      reasons.push("mobile-viewport-not-exact-390x844");
    }
    if (proof.touch !== true) reasons.push("mobile-touch-must-be-true");
    if (!(Number(proof.maxTouchPoints) > 0)) reasons.push("mobile-maxTouchPoints-must-be-gt-0");
    if (proof.coarsePointer !== true) reasons.push("mobile-coarsePointer-must-be-true");
  }

  // Evidence paths — all required, relative, contained, exist
  const beforeAbs = requireRelativeEvidencePath(runDir, proof.beforeScreenshot, "beforeScreenshot", reasons);
  const actionAbs = requireRelativeEvidencePath(runDir, proof.actionScreenshot, "actionScreenshot", reasons);
  const afterAbs = requireRelativeEvidencePath(runDir, proof.afterScreenshot, "afterScreenshot", reasons);
  requireRelativeEvidencePath(runDir, proof.consoleEvidencePath, "consoleEvidencePath", reasons);
  requireRelativeEvidencePath(runDir, proof.networkEvidencePath, "networkEvidencePath", reasons);
  requireRelativeEvidencePath(runDir, proof.accessibilityEvidencePath, "accessibilityEvidencePath", reasons);

  // PNG validity + dimensions match claimed viewport
  if (proof.viewport?.width && proof.viewport?.height) {
    const w = proof.viewport.width;
    const h = proof.viewport.height;
    if (beforeAbs) pngDimensionsMatch(beforeAbs, w, h, "beforeScreenshot", reasons);
    if (actionAbs) pngDimensionsMatch(actionAbs, w, h, "actionScreenshot", reasons);
    if (afterAbs) pngDimensionsMatch(afterAbs, w, h, "afterScreenshot", reasons);
  }

  if (reasons.length) {
    return {
      ok: false,
      verdict: reasons.some((r) => r.includes("mismatch")) ? "FAIL" : "NOT VERIFIED",
      reasons,
    };
  }
  return { ok: true, verdict: "PASS", reasons: [] };
}

export function proofDigest(proof) {
  return createHash("sha256").update(JSON.stringify(proof)).digest("hex").slice(0, 16);
}

/**
 * Load challenge + evidence pair from run dir.
 */
export function loadAndValidateProofs(runDir, challenges) {
  const out = { desktop: "NOT VERIFIED", mobile: "NOT VERIFIED", details: {} };
  for (const ch of challenges || []) {
    const key = ch.server === "playwright-mobile" ? "mobile" : "desktop";
    const proofPath = path.join(runDir, "report", `mcp-proof-${ch.server}.json`);
    if (!existsSync(proofPath)) {
      out.details[key] = { verdict: "NOT VERIFIED", reasons: ["proof-file-missing"] };
      continue;
    }
    let proof;
    try {
      proof = JSON.parse(readFileSync(proofPath, "utf8"));
    } catch {
      out.details[key] = { verdict: "FAIL", reasons: ["proof-parse-error"] };
      out[key] = "FAIL";
      continue;
    }
    const v = validateMcpProof(ch, proof, runDir);
    out[key] = v.verdict;
    out.details[key] = v;
  }
  return out;
}

export { REQUIRED_EVIDENCE_FIELDS };
