import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Recovery for a tab left open across a deploy.
 *
 * Routes are code-split by content hash, so a deploy removes the exact chunk
 * filenames a running tab is holding. The next navigation 404s with
 * "Failed to fetch dynamically imported module" and the page is stuck: React
 * re-rendering requests the same dead URL forever.
 *
 * The cooldown test is the important one. The guard used to be a plain "1"
 * cleared on every window `load` — the very event the recovery reload fires —
 * so a chunk that stayed broken could reload the page endlessly.
 */

const FLAG = "promise:stale-build-recovery";

function installStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    const storage = {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
        clear: () => data.clear(),
        key: () => null,
        length: 0,
    };
    vi.stubGlobal("sessionStorage", storage);
    return data;
}

async function loadModule() {
    vi.resetModules();
    return import("../client/src/lib/app-update-recovery");
}

describe("isStaleBuildError", () => {
    it.each([
        "Failed to fetch dynamically imported module: https://x/assets/repair-request-CoZg7mXq.js",
        "error loading dynamically imported module",
        "Importing a module script failed.",
        "Loading chunk 42 failed",
    ])("recognises %s", async (message) => {
        const { isStaleBuildError } = await loadModule();
        expect(isStaleBuildError(new Error(message))).toBe(true);
    });

    it("does not claim ordinary application errors", async () => {
        const { isStaleBuildError } = await loadModule();
        expect(isStaleBuildError(new Error("Cannot read properties of undefined"))).toBe(false);
        expect(isStaleBuildError(null)).toBe(false);
    });
});

describe("recoverFromStaleBuild", () => {
    const reload = vi.fn();

    beforeEach(() => {
        reload.mockClear();
        // The module reads `window.location` and probes `"caches" in window`,
        // so the stub has to be a window object, not bare globals.
        vi.stubGlobal("window", { location: { reload } });
        vi.stubGlobal("navigator", {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reloads once when no attempt has been made", async () => {
        const store = installStorage();
        const { recoverFromStaleBuild } = await loadModule();

        await expect(recoverFromStaleBuild()).resolves.toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(store.get(FLAG)).toBeTruthy();
    });

    it("refuses a second reload inside the cooldown — the loop guard", async () => {
        installStorage({ [FLAG]: String(Date.now()) });
        const { recoverFromStaleBuild } = await loadModule();

        await expect(recoverFromStaleBuild()).resolves.toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });

    it("allows another attempt once the cooldown has passed", async () => {
        installStorage({ [FLAG]: String(Date.now() - 120_000) });
        const { recoverFromStaleBuild } = await loadModule();

        await expect(recoverFromStaleBuild()).resolves.toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("treats the legacy \"1\" flag as a recent attempt", async () => {
        // A tab upgrading from the previous build carries "1". Parsing that as a
        // timestamp would yield 1ms since the epoch and reload immediately.
        installStorage({ [FLAG]: "1" });
        const { recoverFromStaleBuild } = await loadModule();

        await expect(recoverFromStaleBuild()).resolves.toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });

    it("declines to reload when storage is unavailable", async () => {
        // Private browsing can throw on access. With no way to record the
        // attempt there is no way to stop a loop, so do not start one.
        vi.stubGlobal("sessionStorage", {
            getItem: () => { throw new Error("denied"); },
            setItem: () => { throw new Error("denied"); },
            removeItem: () => {},
        });
        const { recoverFromStaleBuild } = await loadModule();

        await expect(recoverFromStaleBuild()).resolves.toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });
});
