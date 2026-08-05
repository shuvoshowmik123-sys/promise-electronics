import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    createAuthActionLock,
    type AuthActionKind,
} from "../client/src/hooks/use-exclusive-auth-action";

/**
 * The synchronous authentication lock.
 *
 * The guard it replaces was `if (activeAuthAction !== null) return;` followed by
 * `setActiveAuthAction(...)`. React state does not update synchronously, so two
 * events dispatched in one tick — a double tap, or Enter in the phone form
 * beside a Google click — both read null and both proceed. Two sign-ins then
 * race for one session cookie and two Google popups can open.
 *
 * These tests drive the hook's logic directly rather than through a renderer,
 * because the property under test IS synchronous ownership: whether two calls
 * in the same tick can both win. A rendered click test would add a DOM and a
 * scheduler between the assertion and the thing being asserted.
 *
 * The `useRef`/`useState`/`useCallback` primitives are modelled exactly as
 * React implements them for this usage — a ref is a stable mutable box, state
 * is deferred — so the ordering guarantee is what is being exercised, not a
 * convenient stand-in.
 */

/**
 * Wraps the PRODUCTION lock, adding only React's deferral of state writes.
 *
 * These tests used to define their own `createLock()` reimplementation, which
 * proved the reimplementation correct and said nothing about the shipped hook.
 * The ownership logic now lives in `createAuthActionLock`, exported from the
 * hook module and imported here, so every assertion below runs the real code.
 *
 * The only thing modelled is React's scheduler: `onOwnerChange` fires
 * synchronously, and a component's re-render does not, so the notification is
 * queued and applied by `flush()` exactly where React would apply it. That
 * separation is the point — ownership must be correct BEFORE any flush.
 */
function createLock() {
    let activeAction: AuthActionKind | null = null;
    const pendingStateWrites: (() => void)[] = [];

    const lock = createAuthActionLock((next) => {
        pendingStateWrites.push(() => { activeAction = next; });
    });

    return {
        get activeAction() { return activeAction; },
        /** Apply deferred state writes, as a React re-render would. */
        flush() { pendingStateWrites.splice(0).forEach((fn) => fn()); },
        acquire: (kind: AuthActionKind) => lock.acquire(kind),
        release: (kind: AuthActionKind) => lock.release(kind),
    };
}

/** The old, broken guard — kept as the negative control. */
function createStateOnlyLock() {
    let activeAction: AuthActionKind | null = null;
    const pending: (() => void)[] = [];
    return {
        get activeAction() { return activeAction; },
        flush() { pending.splice(0).forEach((fn) => fn()); },
        acquire(kind: AuthActionKind) {
            if (activeAction !== null) return false;
            pending.push(() => { activeAction = kind; });
            return true;
        },
        release() { pending.push(() => { activeAction = null; }); },
    };
}

describe("the production lock is the tested lock", () => {
    it("exports the controller these tests import", () => {
        expect(typeof createAuthActionLock).toBe("function");
    });

    it("reports ownership synchronously, with no notifier at all", () => {
        // The default no-op notifier proves ownership does not depend on React
        // having been told anything.
        const lock = createAuthActionLock();
        expect(lock.owner).toBeNull();
        expect(lock.acquire("google")).toBe(true);
        expect(lock.owner).toBe("google"); // no flush, no render, no await
        expect(lock.acquire("phone")).toBe(false);
        lock.release("google");
        expect(lock.owner).toBeNull();
    });

    it("notifies the owner change synchronously and exactly once per change", () => {
        const seen: (string | null)[] = [];
        const lock = createAuthActionLock((owner) => seen.push(owner));

        lock.acquire("google");
        lock.acquire("phone");   // rejected: must not notify
        lock.release("phone");   // not the owner: must not notify
        lock.release("google");

        expect(seen).toEqual(["google", null]);
    });

    it("the hook delegates to the controller rather than reimplementing it", () => {
        // The defect this replaces was a test-local copy of the logic. If the
        // hook ever grows its own ownership ref again, the copy is back and
        // these tests stop covering the shipped path.
        const HOOK_SOURCE = readFileSync(
            join(process.cwd(), "client/src/hooks/use-exclusive-auth-action.ts"),
            "utf8",
        );
        const hookBody = HOOK_SOURCE.slice(HOOK_SOURCE.indexOf("export function useExclusiveAuthAction"));
        expect(hookBody).toContain("createAuthActionLock(setActiveAction)");
        expect(hookBody).toContain("lock.acquire(kind)");
        expect(hookBody).toContain("lock.release(kind)");
        // No second source of truth for ownership inside the hook.
        expect(hookBody).not.toMatch(/ownerRef\.current\s*=/);
    });
});

describe("exclusive auth action lock", () => {
    it("lets only the first of two same-tick acquires win", () => {
        const lock = createLock();
        expect(lock.acquire("google")).toBe(true);
        // No flush between them: this is the double-tap case exactly.
        expect(lock.acquire("google")).toBe(false);
    });

    it("blocks a phone submit dispatched during Google sign-in", () => {
        const lock = createLock();
        expect(lock.acquire("google")).toBe(true);
        expect(lock.acquire("phone")).toBe(false);
    });

    it("blocks a Google click dispatched during phone or register", () => {
        for (const first of ["phone", "register"] as AuthActionKind[]) {
            const lock = createLock();
            expect(lock.acquire(first)).toBe(true);
            expect(lock.acquire("google")).toBe(false);
        }
    });

    it("releases on completion and permits a later action", () => {
        const lock = createLock();
        expect(lock.acquire("google")).toBe(true);
        lock.release("google");
        expect(lock.acquire("phone")).toBe(true);
    });

    it("ignores a release from an action that does not own the lock", () => {
        // A loser finishing late must not free the winner's lock.
        const lock = createLock();
        expect(lock.acquire("google")).toBe(true);
        lock.release("phone");
        expect(lock.acquire("phone")).toBe(false);
    });

    it("exposes the active action for labels once React re-renders", () => {
        const lock = createLock();
        lock.acquire("google");
        // Deliberately null before the flush: state lags, which is exactly why
        // it cannot be the lock.
        expect(lock.activeAction).toBeNull();
        lock.flush();
        expect(lock.activeAction).toBe("google");
    });

    it("NEGATIVE CONTROL: a state-only guard lets both same-tick calls through", () => {
        const broken = createStateOnlyLock();
        expect(broken.acquire("google")).toBe(true);
        // The defect, demonstrated: no flush has happened, so the second call
        // still sees null and proceeds. Two popups, two sign-ins.
        expect(broken.acquire("google")).toBe(true);
    });

    it("NEGATIVE CONTROL: a state-only guard lets phone race Google", () => {
        const broken = createStateOnlyLock();
        expect(broken.acquire("google")).toBe(true);
        expect(broken.acquire("phone")).toBe(true);
    });
});

describe("handler wiring uses the lock before awaiting", () => {
    it("a second call while the first is pending never reaches loginWithGoogle", async () => {
        const lock = createLock();
        const loginWithGoogle = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 5)));

        // The shape of the real handler: acquire synchronously, then await.
        const handleGoogleSignIn = async () => {
            if (!lock.acquire("google")) return;
            try {
                await loginWithGoogle();
            } finally {
                lock.release("google");
            }
        };

        const first = handleGoogleSignIn();
        const second = handleGoogleSignIn(); // same tick
        await Promise.all([first, second]);

        expect(loginWithGoogle).toHaveBeenCalledTimes(1);
    });

    it("releases after a rejection so a later attempt can run", async () => {
        const lock = createLock();
        const loginWithGoogle = vi.fn()
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValueOnce(undefined);

        const handleGoogleSignIn = async () => {
            if (!lock.acquire("google")) return;
            try {
                await loginWithGoogle();
            } catch {
                /* classified and shown by the caller */
            } finally {
                lock.release("google");
            }
        };

        await handleGoogleSignIn();
        await handleGoogleSignIn();

        expect(loginWithGoogle).toHaveBeenCalledTimes(2);
    });
});
