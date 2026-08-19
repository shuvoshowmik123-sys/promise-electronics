/**
 * A password change must end every admin session that predates it.
 *
 * The staff reset feature shipped with the password being written correctly and
 * nothing enforcing it: `requireAdminAuth` loaded the user and checked CSRF, and
 * never looked at when the password last changed. So a completed reset left the
 * old session working — GET /api/admin/me still answered 200 — which defeats the
 * one case a reset exists for, somebody else knowing the old password.
 *
 * The mistake underneath it is worth naming. `passwordChangedAtStamp` is
 * declared in the shared SessionData interface with a comment describing exactly
 * this behaviour, so it read as implemented. It was only ever wired on the
 * CUSTOMER side, in customer-session.service.ts. A comment on a type is not an
 * implementation, and this test exists because that was mistaken for one.
 *
 * Asserted against the source rather than by mocking Express, because the
 * failure being guarded is somebody removing the check — a source edit — and a
 * mocked middleware test would pass happily against a middleware that no longer
 * runs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIDDLEWARE = readFileSync(
    join(__dirname, "../server/routes/middleware/auth.ts"),
    "utf8",
);
const LOGIN = readFileSync(
    join(__dirname, "../server/routes/auth.routes.ts"),
    "utf8",
);

/** Just the body of requireAdminAuth, so neighbouring code cannot satisfy this. */
function adminAuthBody(): string {
    const start = MIDDLEWARE.indexOf("export async function requireAdminAuth");
    expect(start, "requireAdminAuth not found").toBeGreaterThan(-1);
    const next = MIDDLEWARE.indexOf("export async function requireSuperAdmin", start);
    return MIDDLEWARE.slice(start, next > start ? next : undefined);
}

describe("an admin session carries a password stamp", () => {
    it("is recorded at login", () => {
        expect(
            LOGIN,
            "admin login must record passwordChangedAtStamp, or every session " +
            "looks stale and nobody can stay signed in",
        ).toContain("req.session.passwordChangedAtStamp");
    });

    it("treats a null column as zero rather than absent", () => {
        /**
         * "Never changed" is a real state. Left undefined it would be
         * indistinguishable from "this session predates the check", and every
         * account that had never changed its password would be logged out on
         * every request.
         */
        const near = LOGIN.slice(
            LOGIN.indexOf("req.session.passwordChangedAtStamp"),
            LOGIN.indexOf("req.session.passwordChangedAtStamp") + 220,
        );
        expect(near).toContain(": 0");
    });
});

describe("requireAdminAuth enforces it", () => {
    it("reads the live password_changed_at from the loaded user", () => {
        expect(adminAuthBody()).toContain("passwordChangedAt");
    });

    it("compares the session stamp against the live value", () => {
        const body = adminAuthBody();
        expect(body).toContain("passwordChangedAtStamp");
        expect(body).toMatch(/sessionStamp\s*!==\s*liveStamp/);
    });

    it("revokes the session when they disagree", () => {
        const body = adminAuthBody();
        expect(body).toContain("SESSION_REVOKED");
        // Clearing the id matters: leaving it set means the next request walks
        // straight back into the same check and answers 401 forever without
        // the session ever being torn down.
        expect(body).toMatch(/adminUserId\s*=\s*undefined/);
    });

    it("refuses a session that has no stamp at all", () => {
        /**
         * Sessions created before this check exists have no stamp. Trusting
         * them would honour sessions whose password history is unknown, which
         * is the exact hole being closed. They are asked to sign in again —
         * one logout for everybody, on the deploy that adds this.
         */
        expect(adminAuthBody()).toContain("SESSION_REAUTH_REQUIRED");
    });

    it("checks before attaching the user to the request", () => {
        // A revoked session must not reach a handler with req.user populated,
        // however briefly.
        const body = adminAuthBody();
        expect(body.indexOf("SESSION_REVOKED"))
            .toBeLessThan(body.indexOf("(req as any).user = user"));
    });
});
