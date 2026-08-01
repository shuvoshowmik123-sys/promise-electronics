/**
 * SYSTEM-UNIFICATION-00C-A-HOTFIX-2
 * Shared customer session establishment + freshness checks.
 * No customer PII / tokens in logs.
 */

import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";

export type CustomerAuthMethod = "phone" | "google" | "firebase";

/**
 * Thrown when a customer authenticates successfully but their account has not
 * been activated by staff yet. Callers must translate this into a generic
 * response — never into anything that confirms the account exists.
 */
export class CustomerAccountNotActivatedError extends Error {
  readonly code = "ACCOUNT_SETUP_REQUIRED";
  constructor() {
    super("This account has not been set up yet.");
    this.name = "CustomerAccountNotActivatedError";
  }
}

/**
 * The single gate every customer login must pass through, whatever the method
 * (phone, Firebase, Passport Google, native Google).
 *
 * Two invariants, both of which have to hold before a session exists:
 *   1. An `unclaimed` account cannot be logged into. Activation happens only via
 *      a staff-issued one-time link, so any other route into the account would
 *      be a side door around the phone verification that link enforces.
 *   2. Logging in kills every live reset link for that user. A customer who got
 *      in on their own does not need one, and leaving it usable would keep an
 *      unnecessary credential-reset capability alive.
 *
 * Deliberately fail-closed: if the invalidation write fails, the whole login
 * fails. Swallowing it would produce exactly the state invariant 2 prevents.
 *
 * Call this BEFORE mutating identity fields (linking a Firebase UID, attaching a
 * googleSub) and BEFORE establishing the session.
 */
export async function enforceCustomerLoginPolicy(opts: {
  userId: string;
  accountState?: string | null;
  authMethod: CustomerAuthMethod;
}): Promise<void> {
  if (opts.accountState === "unclaimed") {
    console.warn(`[CustomerAuth] Login blocked for unclaimed account via ${opts.authMethod}`);
    throw new CustomerAccountNotActivatedError();
  }

  await db.execute(sql`
    UPDATE customer_reset_links
    SET invalidated_at = NOW(), invalidated_reason = 'login'
    WHERE user_id = ${opts.userId}
      AND consumed_at IS NULL
      AND invalidated_at IS NULL
  `);
}

export type CustomerSessionEstablishOptions = {
  customerId: string;
  authMethod: CustomerAuthMethod;
  /** Issue XSRF-TOKEN cookie for state-changing customer APIs (default true). */
  issueCsrfCookie?: boolean;
};

/** Single typed parser for users.password_changed_at → epoch ms, or 0 if unset. */
export function parsePasswordChangedAtMs(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Already ms if large; seconds if small
    return raw > 1e12 ? Math.floor(raw) : Math.floor(raw * 1000);
  }
  const d = raw instanceof Date ? raw : new Date(String(raw));
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function loadPasswordChangedAtStampMs(userId: string): Promise<number> {
  const result: any = await db.execute(
    sql`SELECT password_changed_at FROM users WHERE id = ${userId}`,
  );
  const row = result?.rows?.[0] ?? (Array.isArray(result) ? result[0] : null);
  return parsePasswordChangedAtMs(row?.password_changed_at ?? row?.passwordChangedAt);
}

/**
 * Clear customer identity but keep the session so subsequent requests cannot
 * silently downgrade to anonymous full/public projection (HOTFIX-2).
 */
function markCustomerSessionRevoked(req: Request, code: "SESSION_REVOKED" | "SESSION_REAUTH_REQUIRED"): void {
  req.session.customerId = undefined;
  req.session.authMethod = undefined;
  req.session.authenticatedAt = undefined;
  req.session.passwordChangedAtStamp = undefined;
  (req.session as any).customerSessionRevoked = code;
  // Drop CSRF so revoked session cannot mutate either
  delete req.session.csrfToken;
}

/**
 * After session.regenerate (caller responsibility), set identity + freshness + CSRF.
 * Does NOT preserve prior CSRF tokens.
 */
export async function establishCustomerSession(
  req: Request,
  res: Response,
  opts: CustomerSessionEstablishOptions,
): Promise<{ csrfToken: string | null }> {
  const issueCsrf = opts.issueCsrfCookie !== false;
  const stamp = await loadPasswordChangedAtStampMs(opts.customerId);

  req.session.customerId = opts.customerId;
  req.session.authMethod = opts.authMethod;
  req.session.authenticatedAt = Date.now();
  req.session.passwordChangedAtStamp = stamp;
  delete (req.session as any).customerSessionRevoked;

  if (!issueCsrf) {
    delete req.session.csrfToken;
    return { csrfToken: null };
  }

  const csrfToken = randomBytes(32).toString("hex");
  req.session.csrfToken = csrfToken;
  res.cookie("XSRF-TOKEN", csrfToken, {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return { csrfToken };
}

export type CustomerFreshnessOk = { ok: true; customerId: string };
export type CustomerFreshnessFail = { ok: false };

/**
 * Freshness only (no CSRF). For optional-auth GET routes and shared mutation guards.
 * - No customer session → ok:false without sending response (caller handles anonymous).
 * - Missing passwordChangedAtStamp → 401 SESSION_REAUTH_REQUIRED
 * - Stamp mismatch → 401 SESSION_REVOKED
 */
export async function assertCustomerSessionFresh(
  req: Request,
  res: Response,
  options?: { allowMissingSession?: boolean },
): Promise<CustomerFreshnessOk | CustomerFreshnessFail> {
  const priorRevoked = (req.session as any)?.customerSessionRevoked as string | undefined;
  if (priorRevoked === "SESSION_REVOKED" || priorRevoked === "SESSION_REAUTH_REQUIRED") {
    res.status(401).json({
      error:
        priorRevoked === "SESSION_REVOKED"
          ? "Your password was changed. Please sign in again."
          : "Please sign in again to continue.",
      code: priorRevoked,
    });
    return { ok: false };
  }

  let customerId: string | undefined;
  if ((req as any).isAuthenticated?.() && (req as any).user?.customerId) {
    customerId = (req as any).user.customerId;
    req.session.customerId = customerId;
  } else if (req.session?.customerId) {
    customerId = req.session.customerId;
  }

  if (!customerId) {
    if (options?.allowMissingSession) {
      return { ok: false };
    }
    res.status(401).json({ error: "Please login to continue", code: "NOT_AUTHENTICATED" });
    return { ok: false };
  }

  try {
    const liveStamp = await loadPasswordChangedAtStampMs(customerId);
    const sessionStamp = req.session?.passwordChangedAtStamp;

    if (typeof sessionStamp !== "number") {
      markCustomerSessionRevoked(req, "SESSION_REAUTH_REQUIRED");
      res.status(401).json({
        error: "Please sign in again to continue.",
        code: "SESSION_REAUTH_REQUIRED",
      });
      return { ok: false };
    }

    if (liveStamp !== sessionStamp) {
      markCustomerSessionRevoked(req, "SESSION_REVOKED");
      res.status(401).json({
        error: "Your password was changed. Please sign in again.",
        code: "SESSION_REVOKED",
      });
      return { ok: false };
    }

    return { ok: true, customerId };
  } catch (err) {
    console.error("[CustomerSession] Freshness check failed:", (err as Error).message);
    res.status(503).json({
      error: "Please try again shortly",
      code: "AUTH_CHECK_UNAVAILABLE",
    });
    return { ok: false };
  }
}
