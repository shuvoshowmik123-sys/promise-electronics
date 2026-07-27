/**
 * Fail-closed evidence + schema validator.
 */
import { existsSync } from "fs";
import path from "path";
import { evaluateRun } from "./verdict.mjs";
import { safeResolveEvidence } from "./paths.mjs";
import { loadAndValidateProofs } from "./mcp-proof.mjs";

async function loadZod() {
  try {
    const z = await import("zod");
    return z.z || z.default || z;
  } catch {
    return null;
  }
}

function pureValidateShape(report) {
  const errors = [];
  if (!report || typeof report !== "object") return ["report-not-object"];
  for (const k of ["phaseId", "startedAt", "baseUrl", "environment", "steps", "finalVerdict"]) {
    if (report[k] == null) errors.push(`missing-${k}`);
  }
  if (!Array.isArray(report.steps)) errors.push("steps-not-array");
  if (report.executions != null && !Array.isArray(report.executions)) errors.push("executions-not-array");
  return errors;
}

export function resolveEvidencePath(runDir, rel) {
  const r = safeResolveEvidence(runDir, rel);
  return r.ok ? r.path : null;
}

/**
 * @param {object} report
 * @param {string} runDir
 * @param {{ mode?: string, schemaOnly?: boolean }} options
 */
export async function validateReport(report, runDir, options = {}) {
  const errors = [];
  const warnings = [];
  const mode = options.mode || report.mode || "STRICT";
  const schemaOnly = Boolean(options.schemaOnly);

  errors.push(...pureValidateShape(report));

  const z = await loadZod();
  if (z) {
    const StepSchema = z.object({
      stepNumber: z.number(),
      action: z.string(),
      verdict: z.enum(["PASS", "FAIL", "NOT VERIFIED", "PARTIAL PASS"]),
      beforeScreenshot: z.string().nullable().optional(),
      afterScreenshot: z.string().nullable().optional(),
      highlightedScreenshot: z.string().nullable().optional(),
      visionObservation: z.string().optional(),
      actionOccurred: z.boolean().optional(),
      expectedStateMet: z.boolean().optional(),
      consoleCheckpointTaken: z.boolean().optional(),
      networkCheckpointTaken: z.boolean().optional(),
      visualCheck: z.boolean().optional(),
    });
    const ReportSchema = z.object({
      phaseId: z.string(),
      startedAt: z.string(),
      baseUrl: z.string(),
      environment: z.string(),
      steps: z.array(StepSchema).min(1),
      executions: z.array(z.any()).optional(),
      finalVerdict: z.string(),
      secretScanResult: z.string().optional(),
      cleanupResult: z.string().optional(),
      binaryEvidencePrivacy: z.enum(["NOT VERIFIED", "PASS", "FAIL"]).optional(),
      mcpRuntime: z
        .object({
          desktop: z.string().optional(),
          mobile: z.string().optional(),
          details: z.any().optional(),
        })
        .passthrough()
        .optional(),
      schemaValid: z.boolean().optional(),
      evidenceValid: z.boolean().optional(),
    });
    const parsed = ReportSchema.safeParse(report);
    if (!parsed.success) {
      for (const i of parsed.error.issues.slice(0, 40)) {
        errors.push(`zod:${i.path.join(".")}:${i.message}`);
      }
    }
  }

  if (schemaOnly) {
    return {
      ok: errors.length === 0,
      errors,
      warnings,
      schemaValid: errors.length === 0,
      evidenceValid: true,
      runEval: null,
      exitCode: errors.length === 0 ? 0 : 1,
    };
  }

  for (const step of report.steps || []) {
    const nonVisual = step.visualCheck === false;
    const needBefore = !nonVisual && mode === "STRICT";
    const needAfter = !nonVisual;
    if (needBefore) {
      if (!step.beforeScreenshot) errors.push(`step-${step.stepNumber}-missing-before`);
      else {
        const r = safeResolveEvidence(runDir, step.beforeScreenshot);
        if (!r.ok) errors.push(`step-${step.stepNumber}-before-escape`);
        else if (!existsSync(r.path)) errors.push(`step-${step.stepNumber}-before-file-missing`);
      }
    }
    if (needAfter) {
      if (!step.afterScreenshot) errors.push(`step-${step.stepNumber}-missing-after`);
      else {
        const r = safeResolveEvidence(runDir, step.afterScreenshot);
        if (!r.ok) errors.push(`step-${step.stepNumber}-after-escape`);
        else if (!existsSync(r.path)) errors.push(`step-${step.stepNumber}-after-file-missing`);
      }
    }
    if (step.requireHighlight) {
      if (!step.highlightedScreenshot) errors.push(`step-${step.stepNumber}-missing-highlight`);
      else {
        const r = safeResolveEvidence(runDir, step.highlightedScreenshot);
        if (!r.ok || !existsSync(r.path)) errors.push(`step-${step.stepNumber}-highlight-invalid`);
      }
    }
    if (!nonVisual && mode === "STRICT" && !(step.visionObservation && String(step.visionObservation).trim().length >= 12)) {
      errors.push(`step-${step.stepNumber}-missing-vision`);
    }
    if (!step.consoleCheckpointTaken) errors.push(`step-${step.stepNumber}-missing-console-checkpoint`);
    if (!step.networkCheckpointTaken) errors.push(`step-${step.stepNumber}-missing-network-checkpoint`);
    if (step.verdict === "PASS") {
      if (!step.actionOccurred) errors.push(`step-${step.stepNumber}-pass-without-action`);
      if (!step.expectedStateMet) errors.push(`step-${step.stepNumber}-pass-without-expected`);
    }
  }

  // Nonce-bound MCP evidence (not cryptographic; live MCP inventory is the trust boundary)
  if (report.requireMcpRuntime) {
    const challenges = report.mcpChallenges || [];
    if (!challenges.length) {
      errors.push("mcp-challenges-missing");
    } else {
      const proofs = loadAndValidateProofs(runDir, challenges);
      if (proofs.desktop !== "PASS") errors.push("mcp-desktop-proof-invalid");
      if (proofs.mobile !== "PASS") errors.push("mcp-mobile-proof-invalid");
      // Align report fields with validated proofs
      report.mcpRuntime = {
        desktop: proofs.desktop,
        mobile: proofs.mobile,
        details: proofs.details,
      };
    }
  }

  if (report.secretScanResult && report.secretScanResult !== "PASS") {
    errors.push("secret-scan-failed");
  }
  if (report.cleanupResult && report.cleanupResult !== "PASS") {
    errors.push("cleanup-failed");
  }

  // Required HTML evidence index under report/
  const htmlIndex = path.join(runDir, "report", "evidence-index.html");
  const htmlIndexAlt = path.join(runDir, "evidence-index.html");
  if (!existsSync(htmlIndex) && !existsSync(htmlIndexAlt)) {
    errors.push("html-evidence-index-missing");
  }

  const schemaValid = !errors.some((e) => e.startsWith("zod") || e.startsWith("missing-") || e === "report-not-object");
  const evidenceValid = !errors.some(
    (e) =>
      e.includes("file") ||
      e.includes("missing-before") ||
      e.includes("missing-after") ||
      e.includes("missing-vision") ||
      e.includes("checkpoint") ||
      e.includes("escape") ||
      e.includes("mcp-"),
  );

  const runEval = evaluateRun({
    ...report,
    schemaValid,
    evidenceValid,
    mcpRuntime: report.mcpRuntime,
  });

  // Contradictory verdict
  if (report.finalVerdict === "INFRA PASS" && runEval.finalVerdict !== "INFRA PASS") {
    errors.push("verdict-contradiction");
  }
  if (report.finalVerdict === "INFRA PASS" && errors.length > 0) {
    errors.push("pass-with-errors");
  }

  // Full gate: validation fails if run is NO GO
  if (runEval.finalVerdict === "INFRA NO GO") {
    errors.push("run-eval-infra-no-go");
  }

  let exitCode = 0;
  if (errors.length > 0 || runEval.finalVerdict === "INFRA NO GO") exitCode = 1;
  else if (runEval.finalVerdict === "PARTIAL") exitCode = 3;

  return {
    ok: errors.length === 0 && runEval.finalVerdict === "INFRA PASS",
    errors,
    warnings,
    schemaValid,
    evidenceValid,
    runEval,
    exitCode,
  };
}
