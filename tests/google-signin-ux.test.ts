import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    classifyGoogleSignInError,
    GOOGLE_SIGNIN_MESSAGE_KEYS,
} from "../client/src/lib/google-signin-error";

/**
 * Google sign-in on the standalone login page.
 *
 * Two defects motivated this. The buttons were `onClick={loginWithGoogle}` —
 * the bare context function — so a success never navigated (the page has no
 * redirect on auth state) and a failure was a silent unhandled rejection. Then
 * the first repair surfaced `error.message`, which is Firebase/API text written
 * for developers.
 *
 * The classifier is unit-tested directly. The page wiring is asserted against
 * source, because the alternative — mounting a page that pulls in four
 * contexts, wouter and the toast system — would test the harness more than the
 * behaviour.
 */

const LOGIN_SOURCE = readFileSync(
    join(process.cwd(), "client/src/pages/login.tsx"),
    "utf8",
);

const LANGUAGE_SOURCE = readFileSync(
    join(process.cwd(), "client/src/contexts/CustomerLanguageContext.tsx"),
    "utf8",
);

describe("login translations are complete", () => {
    /**
     * A missing key does not throw — `t()` falls through — so an untranslated
     * string fails silently in Bangla and looks fine in English. These assert
     * both languages are actually present for every key the login page uses.
     */
    it.each([
        "login.successTitle",
        "login.successDesc",
        "login.googleFailed",
        "login.googleSigningIn",
        "login.googleCancelled",
        "login.googlePopupBlocked",
        "login.googleNetwork",
        "login.googleSetupRequired",
    ])("%s has both en and bn", (key) => {
        const line = LANGUAGE_SOURCE.split("\n").find((l) => l.includes(`"${key}"`));
        expect(line, `missing translation entry for ${key}`).toBeTruthy();
        expect(line).toMatch(/\ben:\s*"[^"]+"/);
        // Bangla must be present AND actually differ from the English text.
        const bn = line!.match(/\bbn:\s*"([^"]+)"/)?.[1];
        expect(bn, `missing bn for ${key}`).toBeTruthy();
        const en = line!.match(/\ben:\s*"([^"]+)"/)?.[1];
        expect(bn).not.toBe(en);
    });

    it("every approved Google message key resolves to a real translation", () => {
        // Ties the classifier's closed set to the translation table: a new
        // outcome added to one and not the other would otherwise ship as a
        // blank toast.
        for (const key of Object.values(GOOGLE_SIGNIN_MESSAGE_KEYS)) {
            expect(LANGUAGE_SOURCE, `no translation for ${key}`).toContain(`"${key}"`);
        }
    });
});

describe("classifyGoogleSignInError", () => {
    it.each([
        ["auth/popup-closed-by-user", GOOGLE_SIGNIN_MESSAGE_KEYS.cancelled],
        ["auth/cancelled-popup-request", GOOGLE_SIGNIN_MESSAGE_KEYS.cancelled],
        ["auth/popup-blocked", GOOGLE_SIGNIN_MESSAGE_KEYS.popupBlocked],
        ["auth/network-request-failed", GOOGLE_SIGNIN_MESSAGE_KEYS.network],
        ["ACCOUNT_SETUP_REQUIRED", GOOGLE_SIGNIN_MESSAGE_KEYS.accountSetupRequired],
    ])("maps %s to its approved message", (code, expected) => {
        expect(classifyGoogleSignInError({ code })).toBe(expected);
    });

    it("treats a browser fetch failure as a connection problem", () => {
        expect(classifyGoogleSignInError(new TypeError("Failed to fetch")))
            .toBe(GOOGLE_SIGNIN_MESSAGE_KEYS.network);
    });

    it("falls back to the generic message for anything unrecognised", () => {
        expect(classifyGoogleSignInError(new Error("kaboom"))).toBe(GOOGLE_SIGNIN_MESSAGE_KEYS.generic);
        expect(classifyGoogleSignInError(null)).toBe(GOOGLE_SIGNIN_MESSAGE_KEYS.generic);
        expect(classifyGoogleSignInError(undefined)).toBe(GOOGLE_SIGNIN_MESSAGE_KEYS.generic);
        expect(classifyGoogleSignInError("a bare string")).toBe(GOOGLE_SIGNIN_MESSAGE_KEYS.generic);
        expect(classifyGoogleSignInError({ nope: true })).toBe(GOOGLE_SIGNIN_MESSAGE_KEYS.generic);
    });

    it("NEVER returns provider text, however it is dressed up", () => {
        // The whole point: raw provider detail must not reach a customer's
        // screen, even when it is the only thing the error carries.
        const leaky = {
            code: "auth/internal-error",
            message:
                'Firebase: HTTP Cloud Function returned an error: {"error":{"status":"INVALID_ARGUMENT","token":"ya29.SECRET"}} (auth/internal-error).',
        };
        const shown = classifyGoogleSignInError(leaky);

        expect(shown).toBe(GOOGLE_SIGNIN_MESSAGE_KEYS.generic);
        expect(shown).not.toContain("Firebase");
        expect(shown).not.toContain("ya29");
        expect(shown).not.toContain("INVALID_ARGUMENT");
        expect(Object.values(GOOGLE_SIGNIN_MESSAGE_KEYS)).toContain(shown);
    });

    it("only ever returns one of the approved sentences", () => {
        const inputs: unknown[] = [
            { code: "auth/popup-blocked" },
            { code: "auth/timeout" },
            { message: "NetworkError when attempting to fetch resource." },
            { code: "SOMETHING_NEW" },
            new Error(""),
            {},
        ];
        for (const input of inputs) {
            expect(Object.values(GOOGLE_SIGNIN_MESSAGE_KEYS)).toContain(classifyGoogleSignInError(input));
        }
    });
});

describe("login page Google wiring", () => {
    it("has no bare onClick={loginWithGoogle} left", () => {
        // The original defect: the context function used directly as a handler,
        // so nothing navigated and rejections were unhandled.
        //
        // Anchored to an attribute position (start of line, JSX indentation) so
        // the explanatory comment in the source, which quotes the old code
        // verbatim, does not count as a live handler.
        expect(LOGIN_SOURCE).not.toMatch(/^\s*onClick=\{loginWithGoogle\}/m);
    });

    it("routes both the mobile and desktop buttons through the shared handler", () => {
        const handlerUses = LOGIN_SOURCE.match(/onClick=\{handleGoogleSignIn\}/g) ?? [];
        expect(handlerUses.length).toBe(2);
        expect(LOGIN_SOURCE).toContain('data-testid="button-mobile-google-signin"');
        expect(LOGIN_SOURCE).toContain('data-testid="button-google-signin"');
    });

    it("navigates on success and shows the success toast", () => {
        const handler = LOGIN_SOURCE.slice(
            LOGIN_SOURCE.indexOf("const handleGoogleSignIn"),
            LOGIN_SOURCE.indexOf("useEffect(() => {"),
        );
        expect(handler).toContain("await loginWithGoogle()");
        // Translated, not hardcoded English. The failure path was translated
        // while success was not, so a Bangla customer saw their own language
        // only when something went wrong.
        expect(handler).toContain('title: t("login.successTitle")');
        expect(handler).toContain('description: t("login.successDesc")');
        expect(handler).not.toContain('"Login Successful"');
        expect(handler).toContain('setLocation("/")');
        // No reload, and no redundant /me after a confirmed success.
        expect(handler).not.toContain("location.reload");
        expect(handler).not.toContain("checkAuth");
    });

    it("does not navigate when sign-in fails", () => {
        const handler = LOGIN_SOURCE.slice(
            LOGIN_SOURCE.indexOf("const handleGoogleSignIn"),
            LOGIN_SOURCE.indexOf("useEffect(() => {"),
        );
        const catchBlock = handler.slice(handler.indexOf("} catch"));
        expect(catchBlock).not.toContain("setLocation");
        // And the toast uses the classifier, never the raw message.
        // Classified to a translation key, then translated for display.
        expect(catchBlock).toContain("t(classifyGoogleSignInError(error))");
        expect(catchBlock).not.toContain("error.message");
        expect(catchBlock).not.toContain("error?.message");
    });

    it("serializes authentication: one action owns the page", () => {
        expect(LOGIN_SOURCE).toContain('useExclusiveAuthAction()');

        // Each handler refuses to start while another action is running, which
        // is what stops Enter-in-the-phone-form racing an open Google popup and
        // stops a second tap opening a second popup.
        // Each handler takes the lock SYNCHRONOUSLY before its first await.
        // React state cannot do this — see tests/exclusive-auth-action.test.ts,
        // whose negative control shows a state-only guard letting both
        // same-tick callers through.
        const guards = LOGIN_SOURCE.match(/if \(!auth\.acquire\(/g) ?? [];
        expect(guards.length).toBe(3);

        // Every handler releases the lock it owns.
        const releases = LOGIN_SOURCE.match(/auth\.release\(/g) ?? [];
        expect(releases.length).toBeGreaterThanOrEqual(3);

        // Independent flags are gone; buttons disable on the shared state.
        expect(LOGIN_SOURCE).not.toMatch(/setIsGoogleLoading\(/);
        expect(LOGIN_SOURCE).not.toMatch(/setIsLoading\(/);
        expect(LOGIN_SOURCE).not.toMatch(/disabled=\{isLoading\}/);
        expect(LOGIN_SOURCE).not.toMatch(/disabled=\{isGoogleLoading\}/);
        expect((LOGIN_SOURCE.match(/disabled=\{isAuthBusy\}/g) ?? []).length).toBe(6);
    });

    it("has no hardcoded English toast text left in either login path", () => {
        // Both the Google handler and the phone handler showed the same
        // hardcoded pair. Fixing only the Google one would have left the mixed
        // language behaviour on the more common path.
        expect(LOGIN_SOURCE).not.toContain("Login Successful");
        expect(LOGIN_SOURCE).not.toContain("Welcome back to Promise Electronics!");
        expect((LOGIN_SOURCE.match(/t\("login\.successTitle"\)/g) ?? []).length).toBe(2);
        expect((LOGIN_SOURCE.match(/t\("login\.successDesc"\)/g) ?? []).length).toBe(2);
    });

    it("keeps each button's own loading wording", () => {
        expect(LOGIN_SOURCE).toContain('isGoogleLoading ? t("login.googleSigningIn")');
        expect(LOGIN_SOURCE).toContain("isLoading ?");
    });
});
