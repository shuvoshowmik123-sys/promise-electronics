import { useCallback, useRef, useState } from "react";

/**
 * One authentication action at a time, decided synchronously.
 *
 * The previous guard was `if (activeAuthAction !== null) return;` followed by
 * `setActiveAuthAction(...)`. React state does not update synchronously, so two
 * events dispatched in the same tick — a double tap on "Continue with Google",
 * or Enter in the phone form landing beside a Google click — both read `null`
 * and both proceed. Two sign-ins then race to establish one session cookie, and
 * two Google popups can open.
 *
 * Ownership therefore lives in a plain closure variable inside
 * `createAuthActionLock`, held across renders by a ref. Assignment to it IS
 * synchronous, so the second caller in the same tick sees the first caller's
 * write. The state value still exists, but only to drive labels and disabled
 * attributes — visual concerns that are allowed to lag a frame. Disabling a
 * button is not a concurrency guarantee; the click can be dispatched before
 * React re-renders, and programmatic submits bypass it entirely.
 *
 * Shared by LoginPage and CustomerAuthModal so the policy exists once. Both are
 * live Google surfaces and they must not drift apart.
 */
export type AuthActionKind = "phone" | "google" | "register";

export interface ExclusiveAuthAction {
    /** The running action, for labels and disabled state. Lags by one render. */
    activeAction: AuthActionKind | null;
    /** True while any action owns the surface. */
    isBusy: boolean;
    /**
     * Try to take the lock. Returns false when another action already owns it.
     *
     * MUST be called before the first `await`, or the synchronous guarantee is
     * lost and the ref is no better than the state it replaced.
     */
    acquire: (kind: AuthActionKind) => boolean;
    /**
     * Release the lock. Ignored unless this action currently owns it, so a
     * late-finishing loser cannot free the winner's lock.
     */
    release: (kind: AuthActionKind) => void;
}

/**
 * The lock itself, with no React in it.
 *
 * Ownership is plain synchronous logic, so it lives in a plain function that a
 * test can call directly. Previously this logic existed only inside the hook,
 * which meant the concurrency tests had to re-declare their own copy of it —
 * and a copy proves only that the copy is correct. A drift between the copy and
 * the hook would leave the real double-tap race untested while the suite stayed
 * green.
 *
 * `onOwnerChange` is how the hook mirrors ownership into render state. It is
 * called synchronously; any lag is React's scheduler, not this controller's.
 */
export function createAuthActionLock(
    onOwnerChange: (owner: AuthActionKind | null) => void = () => {},
): AuthActionLock {
    let owner: AuthActionKind | null = null;

    return {
        get owner() {
            return owner;
        },
        acquire(kind: AuthActionKind) {
            // Synchronous read-and-write: no await, no state, no gap for a
            // second event in the same tick to slip through.
            if (owner !== null) return false;
            owner = kind;
            onOwnerChange(kind);
            return true;
        },
        release(kind: AuthActionKind) {
            if (owner !== kind) return;
            owner = null;
            onOwnerChange(null);
        },
    };
}

export interface AuthActionLock {
    /** Current owner, read synchronously. Never lags. */
    readonly owner: AuthActionKind | null;
    acquire(kind: AuthActionKind): boolean;
    release(kind: AuthActionKind): void;
}

export function useExclusiveAuthAction(): ExclusiveAuthAction {
    const [activeAction, setActiveAction] = useState<AuthActionKind | null>(null);

    // One lock per mounted surface, created on first render and never replaced.
    // A ref rather than useState because the lock is identity-stable machinery,
    // not rendered data.
    const lockRef = useRef<AuthActionLock | null>(null);
    if (lockRef.current === null) {
        lockRef.current = createAuthActionLock(setActiveAction);
    }
    const lock = lockRef.current;

    const acquire = useCallback((kind: AuthActionKind) => lock.acquire(kind), [lock]);
    const release = useCallback((kind: AuthActionKind) => lock.release(kind), [lock]);

    return { activeAction, isBusy: activeAction !== null, acquire, release };
}
