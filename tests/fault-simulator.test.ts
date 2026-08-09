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

    it("the desktop repair page reads the same two fields", () => {
        /**
         * A /repair link is shareable and survives a rotation to landscape, so
         * the desktop form can receive answers the simulator already collected.
         * Asking for them again reads as the form having lost them.
         */
        const DESKTOP = read("client/src/pages/repair-request.tsx");
        expect(DESKTOP).toMatch(/params\.get\("model"\)/);
        expect(DESKTOP).toMatch(/params\.get\("detail"\)/);
        expect(DESKTOP).toMatch(/setModelNumber\(decodeURIComponent\(qModel\)\)/);
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

    it("desktop and mobile run the same component, not two of them", () => {
        /**
         * Two implementations of one promise would disagree within a month —
         * different symptom names reaching the service request, different
         * prices on screen, and eventually two vocabularies landing in
         * service_requests for the same fault. One component cannot drift
         * from itself.
         */
        expect((HOME.match(/<FaultSimulator/g) ?? []).length).toBe(2);
        expect(HOME).toContain("hidden md:block");
    });

    it("both views are one component with two layouts, not two components", () => {
        /**
         * The state lives in a single hook and each layout is a rendering of
         * it. Two independent implementations would disagree within a month,
         * and the disagreement would reach service_requests as two
         * vocabularies for the same fault.
         */
        expect(COMPONENT).toContain("function useFaultSimulator");
        expect(COMPONENT).toMatch(/props\.variant === "desktop" \? <DesktopLayout/);
        // One television, one meter, shared by both — a fault layer cannot
        // exist on one screen and be missing from the other.
        expect((COMPONENT.match(/<FaultTv /g) ?? []).length).toBeGreaterThanOrEqual(2);
        expect((COMPONENT.match(/<FaultMeter /g) ?? []).length).toBeGreaterThanOrEqual(2);
        // Neither layout may declare its own fault list or price logic.
        expect((COMPONENT.match(/const FAULTS: Fault\[\]/g) ?? []).length).toBe(1);
        expect((COMPONENT.match(/const REFINE: Record/g) ?? []).length).toBe(1);
    });

    it("nothing on the desktop appears out of nothing", () => {
        /**
         * Three things used to materialise mid-interaction and shove the
         * controls down the page: the estimate replacing its placeholder
         * (59px), the follow-up question appearing (111px), and the audio
         * meter on the two sound faults (30px). Each is now a slot that is
         * always there, so the row height never changes and a picker never
         * moves out from under the cursor that just clicked it.
         */
        expect(COMPONENT).toMatch(/min-h-\[248px\]/);   // estimate slot
        expect(COMPONENT).toMatch(/min-h-\[104px\]/);   // question slot
        expect(COMPONENT).toMatch(/h-\[248px\]/);       // placeholder matches the card
        // the meter row renders even when the fault makes no sound
        const meter = COMPONENT.slice(COMPONENT.indexOf("function FaultMeter"));
        expect(meter.slice(0, 900)).not.toMatch(/if \(!fault\?\.audio\) return null/);
    });

    it("brand and size sit with the television, not in a distant strip", () => {
        // 550px from the set they describe, and below the column that grew.
        const desktop = COMPONENT.slice(COMPONENT.indexOf("function DesktopLayout"));
        const tvZone = desktop.slice(desktop.indexOf("{/* watch it */}"), desktop.indexOf("{/* price it */}"));
        expect(tvZone).toContain("EdgeFadeRail");
        expect(tvZone).toMatch(/Screen size/);
    });

    it("the desktop mount is not squeezed by an outer max-width", () => {
        // The desktop layout sets its own 1320px frame; an outer max-w-4xl
        // would fold three columns back into one.
        // Only the element that wraps the mount matters. A max-width on the
        // subtitle paragraph is deliberate — that is prose, not the layout.
        const section = HOME.slice(HOME.indexOf("hidden md:block bg-white"));
        const mount = section.indexOf("<FaultSimulator");
        const wrapper = section.slice(section.lastIndexOf("<motion.div", mount), mount);
        expect(wrapper).not.toMatch(/max-w-/);
        expect(HOME).toContain('variant="desktop"');
    });

    it("the dropdown estimator it replaced is gone from both views", () => {
        // Leaving it would give a desktop customer two different answers to
        // the same question on one page.
        for (const dead of ["estBrand", "estIssue", "CALC_ISSUES", "SelectTrigger"]) {
            expect(HOME, `${dead} is dead code now`).not.toContain(dead);
        }
    });

});
