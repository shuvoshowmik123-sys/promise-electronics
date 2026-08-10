/**
 * The observatory: one call to watch a page, one short report back.
 *
 * Written for an agent that pays by the token. An iPhone-15 screenshot costs
 * roughly two thousand tokens to look at, catches nothing that moves, and has
 * to be taken again for every state. A run of eighteen of them — which is what
 * a careful manual audit of the POS tab took — is forty thousand tokens of
 * pictures to find defects that are all measurable in text.
 *
 * So the deal here is: measure everything continuously, report almost nothing,
 * and spend a screenshot only where a rule actually fired. The agent gets two
 * images tied to two defects instead of twenty to sift through.
 *
 * Usage:
 *
 *     const obs = await observe(page);
 *     await obs.mark("opened the cart");
 *     await obs.check("cart");
 *     console.log(obs.report());
 */
import type { ConsoleMessage, Page, Request, Response } from "@playwright/test";

import { RECORDER_SOURCE, type Recording } from "./recorder.js";
import { auditState, type AuditResult, type Finding } from "./audit.js";

export type ObservatoryOptions = {
    /** Where to drop the few screenshots a finding earns. */
    screenshotDir?: string;
    /** Layout shifts below this are ordinary reflow, not jitter worth reading. */
    shiftThreshold?: number;
    /** Anything that lived for less than this and vanished was a flash. */
    flashMs?: number;
    /** A frozen frame nobody notices is not worth a line. */
    longTaskMs?: number;
};

type StateReport = {
    label: string;
    audit: AuditResult;
    recording: Recording;
    screenshot?: string;
};

const DEFAULTS: Required<Omit<ObservatoryOptions, "screenshotDir">> = {
    shiftThreshold: 0.05,
    flashMs: 900,
    longTaskMs: 120,
};

export async function observe(page: Page, options: ObservatoryOptions = {}) {
    const opts = { ...DEFAULTS, ...options };
    const states: StateReport[] = [];
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const networkProblems: string[] = [];
    /** Things the walk itself noticed, such as a tap that could not land. */
    const notes: string[] = [];
    /** Findings already photographed once; the second sighting is not news. */
    const seenFindings = new Set<string>();

    /**
     * Injected before the application's own script and re-injected on every
     * navigation, because a recorder that starts late misses the first second —
     * which is exactly where loading jitter lives.
     */
    await page.addInitScript(RECORDER_SOURCE);
    // The page may already be open; install now as well so nothing is lost.
    await page.evaluate(RECORDER_SOURCE).catch(() => { /* about:blank */ });

    page.on("console", (msg: ConsoleMessage) => {
        if (msg.type() !== "error" && msg.type() !== "warning") return;
        const text = msg.text().slice(0, 200);
        // React and Vite repeat the same warning on every render; one line is
        // the finding, five hundred is a denial of service on the reader.
        if (!consoleErrors.includes(text)) consoleErrors.push(text);
    });

    page.on("pageerror", (error: Error) => {
        const text = String(error?.message ?? error).slice(0, 200);
        if (!pageErrors.includes(text)) pageErrors.push(text);
    });

    page.on("requestfailed", (request: Request) => {
        const why = request.failure()?.errorText ?? "unknown";
        /**
         * ERR_ABORTED is almost always the browser cancelling in-flight
         * requests because the page navigated — a normal part of moving
         * between screens, and it produced twelve lines of noise per run that
         * described nothing wrong.
         */
        if (why.includes("ERR_ABORTED")) return;
        const line = `FAILED ${request.method()} ${short(request.url())} — ${why}`;
        if (!networkProblems.includes(line)) networkProblems.push(line);
    });

    page.on("response", (response: Response) => {
        if (response.status() < 400) return;
        const line = `${response.status()} ${response.request().method()} ${short(response.url())}`;
        if (!networkProblems.includes(line)) networkProblems.push(line);
    });

    return {
        /** Record something the walk observed, such as a blocked tap. */
        note(line: string) {
            if (!notes.includes(line)) notes.push(line);
        },

        /** Label a moment, so the timeline reads in the shop's own words. */
        async mark(label: string) {
            await page.evaluate((l) => (window as any).__obsMark?.(l), label).catch(() => { });
        },

        /**
         * Audit the screen as it stands and drain everything recorded since the
         * last check. A screenshot is taken only if something was found.
         */
        async check(label: string) {
            const audit = await auditState(page);
            const recording = (await page.evaluate(() => (window as any).__obsDrain?.() ?? {
                shifts: [], mutations: [], longTasks: [], marks: [],
            })) as Recording;

            const state: StateReport = { label, audit, recording };

            /**
             * A screenshot is spent only on something NEW.
             *
             * A 24px button that is present on every screen is one defect, not
             * nineteen, and photographing every state it appears in produced
             * sixteen images for a walk that had four things worth looking at.
             * That is the exact bill this whole harness exists to avoid.
             */
            const fresh = audit.findings.filter(
                (f) => f.severity === "high" && !seenFindings.has(`${f.rule}|${f.element}|${f.detail}`),
            );
            for (const f of audit.findings) seenFindings.add(`${f.rule}|${f.element}|${f.detail}`);

            const worthLooking = fresh.length > 0
                || recording.shifts.some((s) => s.score >= opts.shiftThreshold);
            if (worthLooking && options.screenshotDir) {
                const file = `${options.screenshotDir}/${slug(label)}.png`;
                await page.screenshot({ path: file }).catch(() => { });
                state.screenshot = file;
            }

            states.push(state);
            return state;
        },

        /**
         * Swipe through a screen and watch what happens on the way.
         *
         * Most of a mobile screen's misbehaviour only appears in motion: a
         * sticky header that detaches, an image that loads and shoves the list
         * down, a bottom bar that covers the last row, content that never
         * settles. A still audit of the top of a page sees none of it.
         *
         * Real touch swipes, not scrollTo — momentum scrolling, sticky
         * positioning and scroll-linked chrome all behave differently under a
         * synthetic jump than under a finger.
         */
        async scroll(label: string, opts: { steps?: number; distance?: number } = {}) {
            const steps = opts.steps ?? 3;
            const distance = opts.distance ?? 380;
            const box = page.viewportSize() ?? { width: 390, height: 844 };
            const midX = Math.round(box.width / 2);
            const from = Math.round(box.height * 0.72);
            const to = Math.max(60, from - distance);

            const swipe = async (startY: number, endY: number) => {
                await page.touchscreen.tap(midX, startY).catch(() => { });
                await page.mouse.move(midX, startY);
                await page.mouse.down();
                // Several small moves rather than one jump: a single leap is
                // read as a flick and the momentum hides what happens between.
                for (let i = 1; i <= 6; i++) {
                    await page.mouse.move(midX, startY + ((endY - startY) * i) / 6);
                    await page.waitForTimeout(40);
                }
                await page.mouse.up();
                await page.waitForTimeout(650);
            };

            for (let i = 0; i < steps; i++) {
                await this.mark(`${label}: swipe down ${i + 1}`);
                await swipe(from, to);
                await this.check(`${label}-down-${i + 1}`);
            }
            for (let i = 0; i < steps; i++) {
                await this.mark(`${label}: swipe up ${i + 1}`);
                await swipe(to, from);
                await this.check(`${label}-up-${i + 1}`);
            }

            /**
             * The bottom is where lists get eaten by fixed chrome, so it gets
             * its own look after the momentum has died.
             */
            await page.evaluate(() => {
                const scroller = Array.from(document.querySelectorAll("div"))
                    .find((d) => d.scrollHeight > d.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(d).overflowY));
                if (scroller) scroller.scrollTop = scroller.scrollHeight;
                else window.scrollTo(0, document.body.scrollHeight);
            }).catch(() => { });
            await page.waitForTimeout(800);
            await this.mark(`${label}: at the bottom`);
            await this.check(`${label}-bottom`);
        },

        /** The whole run, as text an agent can afford to read. */
        report(): string {
            return buildReport(states, { consoleErrors, pageErrors, networkProblems, notes }, opts);
        },

        /** For a caller that would rather assert than read prose. */
        raw() {
            return { states, consoleErrors, pageErrors, networkProblems, notes };
        },
    };
}

function short(url: string): string {
    try {
        const u = new URL(url);
        return u.pathname + (u.search ? "?…" : "");
    } catch {
        return url.slice(0, 80);
    }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

function buildReport(
    states: StateReport[],
    events: { consoleErrors: string[]; pageErrors: string[]; networkProblems: string[]; notes: string[] },
    opts: Required<Omit<ObservatoryOptions, "screenshotDir">>,
): string {
    const out: string[] = [];
    const viewport = states[0]?.audit.viewport;
    out.push(`OBSERVATORY REPORT — ${states.length} state(s)${viewport ? ` · ${viewport.width}x${viewport.height}` : ""}`);

    /**
     * Findings are deduped across states and counted.
     *
     * The same 36px input appears in every state it is visible in. Printing it
     * eight times is eight times the tokens for one defect, and it buries the
     * things that only happened once.
     */
    const byRule = new Map<string, { finding: Finding; states: Set<string>; count: number }>();
    for (const state of states) {
        for (const finding of state.audit.findings) {
            const key = `${finding.rule}|${finding.element}|${finding.detail}`;
            const entry = byRule.get(key) ?? { finding, states: new Set<string>(), count: 0 };
            entry.states.add(state.label);
            entry.count++;
            byRule.set(key, entry);
        }
    }

    const order = { high: 0, medium: 1, low: 2 } as const;
    const findings = Array.from(byRule.values()).sort(
        (a, b) => order[a.finding.severity] - order[b.finding.severity],
    );

    if (findings.length === 0) {
        out.push("\nSCREEN CHECKS: clean.");
    } else {
        out.push(`\nSCREEN CHECKS — ${findings.length} distinct finding(s):`);
        for (const { finding, states: where } of findings) {
            const seen = where.size > 1 ? ` [${where.size} states]` : ` [${Array.from(where)[0]}]`;
            out.push(`  ${finding.severity.toUpperCase().padEnd(6)} ${finding.rule.padEnd(13)} ${finding.element} — ${finding.detail}${seen}`);
        }
    }

    // ── the things a screenshot cannot show ──────────────────────────────
    const jitter: string[] = [];
    const flashes: string[] = [];
    const freezes: string[] = [];

    for (const state of states) {
        for (const shift of state.recording.shifts) {
            if (shift.score < opts.shiftThreshold) continue;
            const source = shift.sources[0];
            const moved = source?.from && source?.to
                ? ` — ${source.node} moved ${Math.round(Math.hypot(source.to.x - source.from.x, source.to.y - source.from.y))}px`
                : source ? ` — ${source.node}` : "";
            jitter.push(`  ${state.label} @${shift.at}ms  score ${shift.score}${moved}`);
        }
        for (const m of state.recording.mutations) {
            if (m.kind !== "remove" || m.livedMs == null || m.livedMs > opts.flashMs) continue;
            flashes.push(`  ${state.label} @${m.at}ms  ${m.node} appeared and vanished after ${m.livedMs}ms`);
        }
        for (const t of state.recording.longTasks) {
            if (t.duration < opts.longTaskMs) continue;
            freezes.push(`  ${state.label} @${t.at}ms  page frozen ${t.duration}ms`);
        }
    }

    // First, because an unreachable control outranks everything else.
    section(out, "BLOCKED INTERACTIONS", events.notes.map((n) => `  ${n}`));
    section(out, "JITTER (things that moved on their own)", jitter);
    section(out, "FLASHES (appeared and disappeared too fast to see)", flashes);
    section(out, "FREEZES (page stopped responding)", freezes);
    section(out, "PAGE ERRORS", events.pageErrors.map((e) => `  ${e}`));
    section(out, "CONSOLE", events.consoleErrors.slice(0, 15).map((e) => `  ${e}`));
    section(out, "NETWORK", events.networkProblems.slice(0, 15).map((e) => `  ${e}`));

    // Layers are printed only where they look wrong — a translucent full-screen
    // panel over another panel is how a sheet ends up showing the cart through
    // it, and no single element is at fault.
    const suspicious = states
        .filter((s) => s.audit.layers.filter((l) => l.translucent).length >= 1 && s.audit.layers.length >= 3)
        .map((s) => `  ${s.label}: ` + s.audit.layers.map((l) => `z${l.z}${l.translucent ? "*" : ""} ${l.element}`).join(" over "));
    section(out, "STACKED LAYERS (* = see-through)", suspicious);

    const shots = states.filter((s) => s.screenshot);
    if (shots.length > 0) {
        out.push(`\nSCREENSHOTS — only where something was found:`);
        for (const s of shots) out.push(`  ${s.label}: ${s.screenshot}`);
    }

    return out.join("\n");
}

function section(out: string[], title: string, lines: string[]) {
    if (lines.length === 0) return;
    out.push(`\n${title}:`);
    out.push(...lines.slice(0, 25));
    if (lines.length > 25) out.push(`  … and ${lines.length - 25} more`);
}
