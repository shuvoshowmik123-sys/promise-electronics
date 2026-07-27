/**
 * Secure path containment — no startsWith traps.
 */
import path from "path";
import { realpathSync, existsSync, lstatSync } from "fs";

/**
 * True if child is inside parent (or equal), after resolve.
 * Rejects sibling names that share a prefix (e.g. mobile-qa-evil).
 */
export function isPathInside(parentDir, childPath) {
  const parent = path.resolve(parentDir);
  const child = path.resolve(childPath);
  const rel = path.relative(parent, child);
  if (rel === "") return true;
  if (rel.startsWith("..")) return false;
  if (path.isAbsolute(rel)) return false; // Windows different drive
  return true;
}

/**
 * Resolve evidence path; must stay under runDir.
 * Rejects ../ escape and absolute paths outside runDir.
 */
export function safeResolveEvidence(runDir, relOrAbs) {
  if (!relOrAbs || typeof relOrAbs !== "string") {
    return { ok: false, reason: "empty-path" };
  }
  if (relOrAbs.includes("\0")) {
    return { ok: false, reason: "null-byte" };
  }
  const run = path.resolve(runDir);
  const candidate = path.isAbsolute(relOrAbs)
    ? path.resolve(relOrAbs)
    : path.resolve(run, relOrAbs);

  if (!isPathInside(run, candidate)) {
    return { ok: false, reason: "path-escape", path: candidate };
  }

  // Detect symlink escape when target exists
  try {
    if (existsSync(candidate)) {
      const st = lstatSync(candidate);
      if (st.isSymbolicLink()) {
        const real = realpathSync(candidate);
        if (!isPathInside(run, real)) {
          return { ok: false, reason: "symlink-escape", path: real };
        }
        return { ok: true, path: real };
      }
    }
  } catch {
    /* ignore */
  }

  return { ok: true, path: candidate };
}

export function assertUnderMobileQa(outPath) {
  const mq = path.resolve("mobile-qa");
  const resolved = path.resolve(outPath);
  if (!isPathInside(mq, resolved) && process.env.QA_ALLOW_OUTSIDE !== "1") {
    throw new Error(`Output must resolve under mobile-qa/ (got ${resolved})`);
  }
  return resolved;
}
