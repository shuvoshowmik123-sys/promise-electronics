/**
 * The in-page recorder.
 *
 * A screenshot is a sample. A table that appears at 1.2s and is gone by 1.4s
 * falls between two frames and therefore does not exist, and jitter is motion —
 * a still frame cannot show it at all. So the agent takes more screenshots,
 * spends more tokens, and still misses the thing. That is the trap this exists
 * to leave.
 *
 * Instead of photographing the page, this rides inside it. The browser already
 * measures everything that matters: layout shifts, long tasks, every DOM
 * mutation. None of it costs anything to collect and all of it is text, which
 * is roughly thirty times cheaper to read than an image and catches what an
 * image physically cannot.
 *
 * Everything here runs as a string inside the page via addInitScript, so it
 * starts before the application's own script and survives navigation. It must
 * therefore be self-contained: no imports, no TypeScript that needs compiling
 * away, and nothing that assumes the app has loaded.
 */

/** Caps, so a long session cannot exhaust the tab's memory. */
export const LIMITS = {
    shifts: 300,
    mutations: 600,
    longTasks: 200,
};

/**
 * Runs in the page. Serialised with toString(), so it cannot close over
 * anything from this module — the limits are passed in.
 */
function installRecorder(limits: typeof LIMITS) {
    const w = window as any;
    if (w.__obs) return; // A re-navigation must not double-install.

    const started = performance.now();
    const at = () => Math.round(performance.now() - started);

    /**
     * A short, stable way to name an element in a report.
     *
     * Reports are read by an agent paying per token, so this has to identify
     * the element in a few words rather than dump a selector path. Test id
     * first, then id, then a text snippet, because that is the order a human
     * would use to say which thing they mean.
     */
    const describe = (node: any): string => {
        if (!node || node.nodeType !== 1) return "(text)";
        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        const testId = el.getAttribute("data-testid");
        if (testId) return `${tag}[${testId}]`;
        if (el.id) return `${tag}#${el.id}`;
        const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
        if (text) return `${tag} "${text}"`;
        const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
        return cls ? `${tag}.${cls}` : tag;
    };

    const store = {
        shifts: [] as any[],
        mutations: [] as any[],
        longTasks: [] as any[],
        marks: [] as { at: number; label: string }[],
    };
    w.__obs = store;

    const push = (arr: any[], item: any, cap: number) => {
        if (arr.length < cap) arr.push(item);
    };

    /**
     * Jitter, measured rather than eyeballed.
     *
     * hadRecentInput entries are dropped: a layout shift within half a second
     * of a tap is usually the page responding to that tap, which is intended
     * movement and not a defect. Reporting it would bury the real shifts.
     */
    try {
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as any[]) {
                if (entry.hadRecentInput) continue;
                const sources = (entry.sources || []).map((s: any) => ({
                    node: describe(s.node),
                    from: s.previousRect ? { x: Math.round(s.previousRect.x), y: Math.round(s.previousRect.y) } : null,
                    to: s.currentRect ? { x: Math.round(s.currentRect.x), y: Math.round(s.currentRect.y) } : null,
                }));
                push(store.shifts, { at: at(), score: Number(entry.value.toFixed(4)), sources }, limits.shifts);
            }
        }).observe({ type: "layout-shift", buffered: true });
    } catch { /* not every browser reports layout shifts */ }

    /** Freezes. Over 50ms the page has stopped answering the finger. */
    try {
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                push(store.longTasks, { at: at(), duration: Math.round(entry.duration) }, limits.longTasks);
            }
        }).observe({ type: "longtask", buffered: true });
    } catch { /* Safari does not implement longtask */ }

    /**
     * Every element that appears or disappears, with a timestamp.
     *
     * This is what catches the split-second table: it is not between frames,
     * because there are no frames. Only elements big enough to be seen are
     * recorded — a spinner swapping a class is noise, and noise is what makes
     * a report too expensive to read.
     */
    try {
        const seen = new WeakMap<Node, number>();
        new MutationObserver((records) => {
            for (const record of records) {
                for (const node of Array.from(record.addedNodes)) {
                    if ((node as any).nodeType !== 1) continue;
                    const rect = (node as Element).getBoundingClientRect?.();
                    if (!rect || rect.width < 40 || rect.height < 20) continue;
                    seen.set(node, at());
                    push(store.mutations, { at: at(), kind: "add", node: describe(node) }, limits.mutations);
                }
                for (const node of Array.from(record.removedNodes)) {
                    if ((node as any).nodeType !== 1) continue;
                    const bornAt = seen.get(node);
                    // A lifetime is the interesting part: something that lived
                    // 185ms flashed, and a person watching would have missed it.
                    push(store.mutations, {
                        at: at(),
                        kind: "remove",
                        node: describe(node),
                        livedMs: bornAt === undefined ? null : at() - bornAt,
                    }, limits.mutations);
                }
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
    } catch { /* nothing to record if the observer will not attach */ }

    /** Lets the harness label a moment: "opened the cart". */
    w.__obsMark = (label: string) => store.marks.push({ at: at(), label });
    /** Hands everything over and starts a fresh window. */
    w.__obsDrain = () => {
        const copy = JSON.parse(JSON.stringify(store));
        store.shifts.length = 0;
        store.mutations.length = 0;
        store.longTasks.length = 0;
        store.marks.length = 0;
        return copy;
    };
}

/** The recorder as a string, ready for page.addInitScript. */
export const RECORDER_SOURCE = `(${installRecorder.toString()})(${JSON.stringify(LIMITS)})`;

export type Shift = {
    at: number;
    score: number;
    sources: Array<{ node: string; from: { x: number; y: number } | null; to: { x: number; y: number } | null }>;
};
export type Mutation = { at: number; kind: "add" | "remove"; node: string; livedMs?: number | null };
export type LongTask = { at: number; duration: number };
export type Recording = {
    shifts: Shift[];
    mutations: Mutation[];
    longTasks: LongTask[];
    marks: Array<{ at: number; label: string }>;
};
