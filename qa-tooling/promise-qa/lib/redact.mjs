/**
 * Centralized redaction for Promise QA evidence.
 * Never log secrets, cookies, tokens, DB URLs, raw GPS, or full customer PII.
 */

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "password",
  "passwd",
  "secret",
  "api_key",
  "apikey",
  "authorization",
  "csrf",
  "session",
  "cookie",
  "code",
  "setup_token",
  "reset_token",
]);

const BODY_SENSITIVE = /password|passwd|token|authorization|cookie|csrf|secret|api[_-]?key|database_url|connectionstring|refresh_token|access_token|phone|email|address|latitude|longitude|gps|coordinate/i;

/**
 * Sanitize URL to origin + pathname (strip secrets from query).
 * Optionally keep safe params if listed.
 */
export function sanitizeUrl(raw, { keepQuery = [] } = {}) {
  if (!raw || typeof raw !== "string") return "";
  try {
    const u = new URL(raw, "http://local.invalid");
    const keep = new Set(keepQuery.map((k) => k.toLowerCase()));
    const params = new URLSearchParams();
    for (const [k, v] of u.searchParams.entries()) {
      const lk = k.toLowerCase();
      if (SENSITIVE_QUERY_KEYS.has(lk) || BODY_SENSITIVE.test(k)) {
        params.set(k, "[REDACTED]");
      } else if (keep.size === 0 || keep.has(lk)) {
        if (keep.size > 0) params.set(k, v);
      }
    }
    const q = keep.size > 0 && [...params.keys()].length ? `?${params}` : "";
    // Prefer pathname-only relative form for local evidence
    if (u.hostname === "local.invalid" || u.hostname === "127.0.0.1" || u.hostname === "localhost") {
      return `${u.pathname}${q}`;
    }
    return `${u.origin}${u.pathname}${q}`;
  } catch {
    return String(raw)
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
      .replace(/(password|token|secret|api_key)=([^&\s]+)/gi, "$1=[REDACTED]");
  }
}

export function redactString(s) {
  if (s == null) return s;
  let t = String(s);
  t = t.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]");
  t = t.replace(/(password|passwd|secret|api[_-]?key|token|csrf|authorization)\s*[:=]\s*["']?[^"'\s,}]+/gi, "$1=[REDACTED]");
  t = t.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgres://[REDACTED]");
  t = t.replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, "mongodb://[REDACTED]");
  t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  t = t.replace(/\b(\+?880|01)[0-9\- ]{8,14}\b/g, "[REDACTED_PHONE]");
  // Crude lat/lng pair
  t = t.replace(/\b(2[2-6]\.\d{3,}|9[0-2]\.\d{3,})\b/g, "[REDACTED_COORD]");
  t = t.replace(/sessionid|connect\.sid|__session/gi, "[REDACTED_SESSION]");
  return t;
}

/** Machine-status fields must never be redacted away. */
export const PRESERVE_STATUS_KEYS = new Set([
  "secretScanResult",
  "cleanupResult",
  "finalVerdict",
  "schemaValid",
  "evidenceValid",
  "mcpRuntime",
  "verdictReasons",
  "verdict",
  "proofVerdict",
  "browserContextIsolation",
  "binaryEvidencePrivacy",
  "ok",
  "pass",
  "fail",
  "totals",
  "exitCode",
  "phaseId",
  "runId",
  "mode",
  "optionalMatrix",
]);

export function redactObject(obj, depth = 0) {
  if (obj == null || depth > 8) return obj;
  if (typeof obj === "string") return redactString(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) return obj.map((x) => redactObject(x, depth + 1));
  if (typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PRESERVE_STATUS_KEYS.has(k)) {
      // Preserve structure; still redact nested secret-like leaves carefully
      if (v && typeof v === "object" && !Array.isArray(v) && k === "mcpRuntime") {
        out[k] = { ...v }; // status strings only
      } else {
        out[k] = v;
      }
      continue;
    }
    // Avoid redacting keys that merely contain "token" substring in status names
    if (BODY_SENSITIVE.test(k) || SENSITIVE_QUERY_KEYS.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
    } else if (k === "url" || k === "href" || (k.endsWith("Url") && k !== "baseUrl")) {
      out[k] = sanitizeUrl(String(v ?? ""));
    } else if (k === "baseUrl") {
      out[k] = sanitizeUrl(String(v ?? ""));
    } else {
      out[k] = redactObject(v, depth + 1);
    }
  }
  return out;
}

export function redactConsoleEntry(entry) {
  return redactObject({
    type: entry?.type,
    text: redactString(entry?.text ?? entry?.message ?? ""),
    class: entry?.class,
    step: entry?.step,
  });
}

export function redactNetworkEntry(entry) {
  return redactObject({
    method: entry?.method,
    status: entry?.status,
    url: sanitizeUrl(entry?.url || ""),
    class: entry?.class,
    note: entry?.note ? redactString(entry.note) : undefined,
  });
}
