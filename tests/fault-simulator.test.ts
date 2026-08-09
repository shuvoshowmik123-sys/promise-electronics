/**
 * The simulator's failure mode is silence.
 *
 * Every fault is drawn by a CSS rule keyed on [data-fault="id"]. If an id in
 * the component has no matching rule the tile still highlights, the caption
 * still changes, and the television does nothing at all — which looks like a
 * working feature until someone notices their fault is the one that never
 * animates. A rendered screenshot of one state would not catch it either.
 *
 * So this pairs the two files against each other: every fault must be drawn,
 * every fault must have a price row, and the motion must be switchable off.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const COMPONENT = read("client/src/components/customer/FaultSimulator.tsx");
const CSS = read("client/src/index.css");
const HOME = read("client/src/pages/home.tsx");

/** Ids as the component declares them. */
const FAULT_IDS = [...COMPONENT.matchAll(/^\s*id:\s*"([a-z_]+)",\s*priceKey:/gm)].map((m) => m[1]);
/** Price rows the component points at. */
const PRICE_KEYS = [...COMPONENT.matchAll(/priceKey:\s*"([^"]+)"/g)].map((m) => m[1]);

describe("every fault the customer can pick is actually drawn", () => {
    it("declares the nine faults", () => {
        expect(FAULT_IDS.length).toBe(9);
        for (const id of ["no_power", "no_display", "vlines", "hlines", "backlight", "broken", "hang", "jitter", "sound"]) {
            expect(FAULT_IDS, id).toContain(id);
        }
    });

    it("has a CSS rule for each visual fault", () => {
        /**
         * The two sound faults are the exception on purpose: audio changes
         * nothing on the panel, so they are drawn by the meter rather than by
         * a [data-fault] rule. Everything that should alter the picture must
         * have one.
         */
        const visual = FAULT_IDS.filter((id) => id !== "jitter" && id !== "sound");
        for (const id of visual) {
            expect(CSS, `no CSS draws data-fault="${id}"`).toContain(`.fault-tv[data-fault="${id}"]`);
        }
    });

    it("the sound faults drive the meter instead", () => {
        expect(COMPONENT).toMatch(/audio:\s*"jitter"/);
        expect(COMPONENT).toMatch(/audio:\s*"dead"/);
        expect(CSS).toContain(".fault-bar");
    });

    it("every layer the CSS targets exists in the markup", () => {
        // A rule pointing at a class nobody renders is dead, and silently so.
        for (const cls of ["fault-pic", "fault-glow", "fault-v", "fault-h", "fault-crack", "fault-buffer", "fault-led"]) {
            expect(COMPONENT, cls).toContain(cls);
            expect(CSS, cls).toContain(`.${cls}`);
        }
    });

    it("prices come from the existing matrix, not a second copy", () => {
        /**
         * The shop maintains repair_price_matrix in Settings. A parallel price
         * list inside a component would drift from it within a month, and the
         * customer would be quoted a number nobody at the counter recognises.
         */
        for (const key of new Set(PRICE_KEYS)) {
            expect(HOME, `DEFAULT_PRICE_MATRIX has no row "${key}"`).toContain(`"${key}":`);
        }
        expect(COMPONENT).not.toMatch(/DEFAULT_PRICE_MATRIX|\[\s*\d{3,},\s*\d{3,}\s*\]/);
    });

    it("says the estimate is not a quote, on the screen that shows the money", () => {
        expect(COMPONENT).toMatch(/final quotation/i);
        expect(COMPONENT).toMatch(/nothing is charged until you approve/i);
        // And in Bengali, since half the readers will be reading that.
        expect(COMPONENT).toMatch(/চূড়ান্ত কোটেশন/);
    });

    it("reminds about a mismatched model, and never corrects one silently", () => {
        // The apply button exists, and the state only changes inside it.
        expect(COMPONENT).toMatch(/Mine is correct/);
        expect(COMPONENT).toMatch(/Use that/);
        const effect = COMPONENT.slice(COMPONENT.indexOf("const mismatch = useMemo"));
        expect(effect.slice(0, 600)).not.toMatch(/setBrand\(|setSize\(/);
    });

    it("a failed model check never blocks the customer", () => {
        expect(COMPONENT).toMatch(/\.catch\(\(\) => \{/);
        expect(COMPONENT).toMatch(/courtesy check must never be the reason/i);
    });

    it("motion can be switched off", () => {
        const block = CSS.slice(CSS.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
        for (const cls of [".fault-pic", ".fault-v", ".fault-h", ".fault-bar"]) {
            expect(block, cls).toContain(cls);
        }
    });
});

describe("what the simulator hands to the service request", () => {
    const WIZARD = read("client/src/components/mobile/MobileServiceWizard.tsx");

    it("sends the symptom in the wizard's vocabulary, not the simulator's", () => {
        /**
         * The wizard builds its symptom cards from Settings and selects by
         * exact id. Sending "Vertical Lines" set the state but matched no card,
         * so step 1 arrived looking unanswered and the customer had to answer
         * a question they had already answered. priceKey names the Settings row.
         */
        expect(COMPONENT).toMatch(/new URLSearchParams\(\{ issue: fault\.priceKey \}\)/);
    });

    it("keeps the finer answer instead of flattening it", () => {
        // Vertical and horizontal lines share one Settings row but are very
        // different repairs; the distinction has to survive the handoff.
        expect(COMPONENT).toMatch(/params\.set\("detail", fault\.en\)/);
        expect(WIZARD).toMatch(/params\.get\("detail"\)/);
        expect(WIZARD).toMatch(/setDescription\(decodeURIComponent\(qDetail\)\)/);
    });

    it("carries the model number across", () => {
        expect(COMPONENT).toMatch(/params\.set\("model"/);
        expect(WIZARD).toMatch(/params\.get\("model"\)/);
        expect(WIZARD).toMatch(/setModelNumber\(decodeURIComponent\(qModel\)\)/);
    });

    it("a prefilled symptom the settings list does not contain still shows selected", () => {
        /**
         * Settings can be edited at any time, so the wizard must not silently
         * drop an issue it does not recognise — it renders it as its own card.
         */
        expect(WIZARD).toContain("problemOptionsWithPrefill");
        expect(WIZARD).toMatch(/problemOptionsWithPrefill\.map\(\(problem\)/);
        expect(WIZARD).toMatch(/problemOptions\.some\(\(item\) => item\.id === primaryIssue\)/);
    });

    it("the reminder is scrolled clear of the fixed bottom navigation", () => {
        expect(COMPONENT).toMatch(/scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
        expect(COMPONENT).toMatch(/ref=\{nudgeRef\}/);
    });
});

describe("the homepage uses it in place of what it replaced", () => {
    it("mounts the simulator with settings-driven data", () => {
        expect(HOME).toContain("<FaultSimulator");
        for (const prop of ["brands={CALC_BRANDS}", "sizes={CALC_SIZES}", "priceMatrix={PRICE_MATRIX}", "sizeBucket={calcSizeBucket}"]) {
            expect(HOME, prop).toContain(prop);
        }
    });

    it("no longer renders the mobile symptom grid or the mobile calculator", () => {
        expect(HOME).not.toContain("Problem-Based Navigation (Mobile)");
        expect(HOME).not.toContain("Mobile Estimate Calculator");
    });

    it("leaves the desktop calculator alone", () => {
        // Only the mobile blocks were replaced; the desktop estimator still runs
        // on the same state and must not have been collateral damage.
        expect(HOME).toContain("estBrand");
        expect(HOME).toContain("estIssue");
        expect(HOME).toContain("desktop.calc.title");
    });
});
