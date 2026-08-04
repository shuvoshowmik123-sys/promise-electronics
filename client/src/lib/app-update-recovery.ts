const RECOVERY_FLAG = "promise:stale-build-recovery";

/**
 * Minimum gap between two recovery reloads.
 *
 * The flag used to be a plain "1" cleared on every window `load`, which
 * defeated its own purpose: the reload that recovery triggered fired `load`,
 * which wiped the flag, so a chunk that stayed broken — a half-finished deploy,
 * a CDN serving a partial build — could reload the page forever with the
 * customer unable to read anything or navigate away.
 *
 * A timestamp cannot be cleared by the reload it is guarding. One recovery per
 * minute is enough for a genuine deploy (the reload fixes it and no second
 * attempt is needed) and stops a permanent failure from becoming a loop.
 */
const RECOVERY_COOLDOWN_MS = 60_000;

function recoveryAttemptedRecently(): boolean {
    try {
        const raw = sessionStorage.getItem(RECOVERY_FLAG);
        if (!raw) return false;
        // "1" is the legacy value written by earlier builds; treat as recent so
        // a tab mid-upgrade cannot slip past the cooldown.
        if (raw === "1") return true;
        const last = Number(raw);
        return Number.isFinite(last) && Date.now() - last < RECOVERY_COOLDOWN_MS;
    } catch {
        // Storage unavailable (private mode). Without a guard, refuse to reload
        // at all — a loop is worse than an error message.
        return true;
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return `${error.name} ${error.message}`;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message || "");
    }
    return "";
}

export function isStaleBuildError(error: unknown): boolean {
    const message = getErrorMessage(error).toLowerCase();
    return (
        message.includes("failed to fetch dynamically imported module") ||
        message.includes("error loading dynamically imported module") ||
        message.includes("importing a module script failed") ||
        message.includes("chunkloaderror") ||
        message.includes("loading chunk")
    );
}

export async function recoverFromStaleBuild(): Promise<boolean> {
    if (recoveryAttemptedRecently()) return false;

    try {
        sessionStorage.setItem(RECOVERY_FLAG, String(Date.now()));
    } catch {
        return false;
    }

    try {
        if ("caches" in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map((name) => caches.delete(name)));
        }

        if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.update().catch(() => undefined)));
        }
    } finally {
        window.location.reload();
    }

    return true;
}

/**
 * Kept for callers that want to reset the cooldown explicitly. It is
 * deliberately NOT wired to window `load` any more — see RECOVERY_COOLDOWN_MS.
 */
export function clearStaleBuildRecoveryFlag(): void {
    try {
        sessionStorage.removeItem(RECOVERY_FLAG);
    } catch {
        /* storage unavailable — nothing to clear */
    }
}

export function installStaleBuildRecovery(): void {
    window.addEventListener("error", (event) => {
        if (!isStaleBuildError(event.error || event.message)) return;
        event.preventDefault();
        void recoverFromStaleBuild();
    });

    window.addEventListener("unhandledrejection", (event) => {
        if (!isStaleBuildError(event.reason)) return;
        event.preventDefault();
        void recoverFromStaleBuild();
    });
}
