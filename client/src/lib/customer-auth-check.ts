/**
 * Decide whether a failed /api/customer/me (or restore) should clear the session.
 * Only confirmed auth failures log the customer out — not timeouts/5xx/network.
 */

const AUTH_FAILURE_CODES = new Set([
  "NOT_AUTHENTICATED",
  "INVALID_SESSION",
  "SESSION_REVOKED",
  "SESSION_REAUTH_REQUIRED",
]);

export type AuthCheckDisposition = "logout" | "keep";

export function dispositionForAuthCheckError(error: unknown): AuthCheckDisposition {
  if (error == null || typeof error !== "object") {
    // Raw network / unknown throw — keep session, do not wipe cache.
    return "keep";
  }

  const e = error as { statusCode?: number; code?: string; name?: string };

  if (e.statusCode === 401) {
    return "logout";
  }

  if (typeof e.code === "string" && AUTH_FAILURE_CODES.has(e.code)) {
    return "logout";
  }

  // 5xx, 408 REQUEST_TIMEOUT, 503 AUTH_CHECK_UNAVAILABLE, non-ApiError network errors
  return "keep";
}
