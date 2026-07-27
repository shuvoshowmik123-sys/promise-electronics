/**
 * Fail-closed verdict engine for Promise QA steps and runs.
 */

/**
 * @typedef {object} StepRequirements
 * @property {boolean} [requireAction]
 * @property {boolean} [requireExpectedState]
 * @property {boolean} [requireBeforeShot]
 * @property {boolean} [requireAfterShot]
 * @property {boolean} [requireVision]
 * @property {boolean} [requireConsoleCheckpoint]
 * @property {boolean} [requireNetworkCheckpoint]
 * @property {boolean} [requireHighlight]
 * @property {boolean} [allowPartial]
 */

/**
 * Evaluate a single step. Never returns PASS if requirements incomplete.
 * @returns {{ verdict: string, reasons: string[] }}
 */
export function evaluateStep(step, requirements = {}, options = {}) {
  const mode = options.mode || "STRICT";
  const reasons = [];
  const req = {
    requireAction: true,
    requireExpectedState: true,
    requireBeforeShot: mode === "STRICT",
    requireAfterShot: true,
    requireVision: mode === "STRICT" && Boolean(step.visualCheck !== false),
    requireConsoleCheckpoint: true,
    requireNetworkCheckpoint: true,
    requireHighlight: Boolean(step.requireHighlight),
    ...requirements,
  };

  if (step.forcedVerdict === "FAIL") {
    return { verdict: "FAIL", reasons: [step.forcedReason || "forced-fail"] };
  }

  if (req.requireAction && !step.actionOccurred) {
    reasons.push("action-not-confirmed");
  }
  if (req.requireExpectedState && !step.expectedStateMet) {
    reasons.push("expected-state-not-met");
  }
  if (req.requireBeforeShot && !step.beforeScreenshot) {
    reasons.push("missing-before-screenshot");
  }
  if (req.requireAfterShot && !step.afterScreenshot) {
    reasons.push("missing-after-screenshot");
  }
  if (req.requireVision && !(step.visionObservation && String(step.visionObservation).trim().length >= 12)) {
    reasons.push("missing-vision-observation");
  }
  if (req.requireHighlight && !step.highlightedScreenshot) {
    reasons.push("missing-highlight-screenshot");
  }
  if (req.requireConsoleCheckpoint && !step.consoleCheckpointTaken) {
    reasons.push("missing-console-checkpoint");
  }
  if (req.requireNetworkCheckpoint && !step.networkCheckpointTaken) {
    reasons.push("missing-network-checkpoint");
  }
  if (step.recoveryAttempts > 1) {
    reasons.push("recovery-limit-exceeded");
  }
  if (step.blockingConsoleOrNetwork) {
    reasons.push("blocking-console-or-network");
  }
  if (step.unclassifiedPresent) {
    reasons.push("unclassified-present");
  }
  if (step.missingEvidenceFiles?.length) {
    reasons.push(`missing-files:${step.missingEvidenceFiles.join(",")}`);
  }
  if (step.visionNoChange === true && step.visualCheck !== false) {
    reasons.push("vision-no-state-change");
  }

  if (reasons.length === 0 && step.actionOccurred && step.expectedStateMet) {
    return { verdict: "PASS", reasons: [] };
  }

  if (reasons.some((r) => r.startsWith("missing-") || r === "action-not-confirmed" || r === "expected-state-not-met" || r === "blocking-console-or-network" || r === "vision-no-state-change" || r === "unclassified-present" || r === "recovery-limit-exceeded")) {
    // Incomplete evidence that was required → FAIL (not soft NOT VERIFIED for declared required fields)
    if (
      reasons.includes("action-not-confirmed") ||
      reasons.includes("expected-state-not-met") ||
      reasons.includes("blocking-console-or-network") ||
      reasons.includes("unclassified-present") ||
      reasons.includes("vision-no-state-change") ||
      reasons.includes("recovery-limit-exceeded") ||
      reasons.some((r) => r.startsWith("missing-files"))
    ) {
      return { verdict: "FAIL", reasons };
    }
    return { verdict: "FAIL", reasons };
  }

  return { verdict: "NOT VERIFIED", reasons: reasons.length ? reasons : ["incomplete"] };
}

/**
 * Final run verdict — fail-closed.
 * @returns {{ finalVerdict: 'INFRA PASS'|'INFRA NO GO'|'PARTIAL', reasons: string[], exitCode: number }}
 */
export function evaluateRun(report) {
  const reasons = [];
  const steps = report.steps || [];
  const executions = report.executions || [];

  if (!steps.length) {
    return { finalVerdict: "INFRA NO GO", reasons: ["no-steps"], exitCode: 1 };
  }

  for (const s of steps) {
    if (s.verdict !== "PASS") {
      reasons.push(`step-${s.stepNumber}-${s.verdict}`);
    }
  }

  if ((report.unexpectedConsoleCount || 0) > 0) reasons.push("unexpected-console");
  if ((report.failedNetworkCount || 0) > 0) reasons.push("failed-network");
  if (report.unclassifiedCount > 0) reasons.push("unclassified");
  if (report.schemaValid === false) reasons.push("schema-invalid");
  if (report.evidenceValid === false) reasons.push("evidence-invalid");
  if (report.cleanupResult !== "PASS" && report.cleanupResult !== true && report.cleanupResult !== "ok") {
    if (report.cleanupResult && report.cleanupResult !== "PASS") reasons.push("cleanup-failed");
  }
  if (report.secretScanResult && report.secretScanResult !== "PASS") reasons.push("secret-scan-failed");

  // Authenticated multi-role cannot PASS without binary screenshot/trace privacy
  if (report.optionalMatrix?.["authenticated-multi-role"] === "PASS") {
    if (report.binaryEvidencePrivacy !== "PASS") {
      reasons.push("authenticated-multi-role-requires-binaryEvidencePrivacy-PASS");
    }
  }
  if (report.binaryEvidencePrivacy === "FAIL") {
    reasons.push("binary-evidence-privacy-fail");
  }

  // Nonce-bound MCP evidence
  const mcpDesktop = report.mcpRuntime?.desktop;
  const mcpMobile = report.mcpRuntime?.mobile;
  if (report.requireMcpRuntime) {
    if (mcpDesktop !== "PASS") reasons.push("mcp-desktop-not-verified");
    if (mcpMobile !== "PASS") reasons.push("mcp-mobile-not-verified");
  }

  // Optional matrix
  const optionalFail = [];
  if (report.optionalMatrix) {
    for (const [k, v] of Object.entries(report.optionalMatrix)) {
      if (v === "NOT VERIFIED") optionalFail.push(k);
      if (v === "FAIL") reasons.push(`optional-${k}-fail`);
    }
  }

  if (reasons.length === 0 && optionalFail.length > 0) {
    return {
      finalVerdict: "PARTIAL",
      reasons: optionalFail.map((k) => `optional-nv:${k}`),
      exitCode: 3,
    };
  }

  if (reasons.length === 0) {
    return { finalVerdict: "INFRA PASS", reasons: [], exitCode: 0 };
  }

  return { finalVerdict: "INFRA NO GO", reasons, exitCode: 1 };
}
