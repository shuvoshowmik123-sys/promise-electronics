const RECOVERY_FLAG = "promise:stale-build-recovery";

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
    if (sessionStorage.getItem(RECOVERY_FLAG) === "1") return false;

    sessionStorage.setItem(RECOVERY_FLAG, "1");

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

export function clearStaleBuildRecoveryFlag(): void {
    sessionStorage.removeItem(RECOVERY_FLAG);
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
