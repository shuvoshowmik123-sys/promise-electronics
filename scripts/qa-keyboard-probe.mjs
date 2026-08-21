/**
 * Does the on-screen keyboard hide anything a person is typing into?
 *
 * No browser can raise a real keyboard. Chrome DevTools, Playwright, and every
 * "mobile view" extension change the viewport size and the user agent and
 * nothing else — so "does the keyboard cover the Save button" has been marked
 * NOT VERIFIED in six consecutive QA rounds, and it is the one mobile question
 * that actually decides whether a form is usable.
 *
 * What a keyboard does is take the bottom of the screen away. That part is
 * reproducible: shrink the viewport to what a keyboard would leave, keep the
 * field focused, and ask whether the field and the controls beneath it are
 * still on screen. It is not the real thing, but it is deterministic and it
 * answers the real question — which a real keyboard, being hand-driven, never
 * does the same way twice.
 *
 * Heights are measured, not invented: a Gboard on a 393x852 phone occupies
 * roughly 336px in portrait, more with the suggestion strip and more again with
 * a numeric pad on some skins. Both are checked, because a form that survives
 * the smaller keyboard and drowns under the larger one is still broken.
 *
 *   node scripts/qa-keyboard-probe.mjs [url]
 */
import { chromium } from "playwright";

const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const URL = process.argv[2] || "http://127.0.0.1:5083/admin/catch-up";

/** Portrait phone, and what is left of it once a keyboard is up. */
const PHONE = { width: 393, height: 852 };
const KEYBOARDS = [
    { name: "text keyboard", takes: 336 },
    { name: "tall keyboard (suggestions)", takes: 400 },
];

const browser = await chromium.launch({
    headless: false,
    executablePath: BRAVE,
    slowMo: 120,
});

const context = await browser.newContext({
    viewport: PHONE,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
});
const page = await context.newPage();

console.log(`opening ${URL}`);
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const fields = await page.locator("input:visible, textarea:visible").all();
if (!fields.length) {
    console.log("no visible fields — is this the right page, and are you signed in?");
    await browser.close();
    process.exit(0);
}
console.log(`${fields.length} visible fields\n`);

for (const keyboard of KEYBOARDS) {
    const visible = PHONE.height - keyboard.takes;
    console.log(`── ${keyboard.name}: ${visible}px of screen left ──`);

    /**
     * The viewport is resized rather than scrolled, because that is what a
     * keyboard actually does to the page: the layout viewport shrinks and
     * anything below the fold becomes unreachable without scrolling past it.
     */
    await page.setViewportSize({ width: PHONE.width, height: visible });

    let hidden = 0;
    for (const field of fields) {
        try {
            await field.focus({ timeout: 1500 });
            await page.waitForTimeout(120);

            const report = await field.evaluate((el) => {
                const r = el.getBoundingClientRect();
                const label = el.getAttribute("placeholder")
                    || el.getAttribute("aria-label")
                    || el.previousElementSibling?.textContent?.trim()
                    || el.getAttribute("name")
                    || "(unlabelled)";
                return {
                    label: String(label).slice(0, 34),
                    top: Math.round(r.top),
                    bottom: Math.round(r.bottom),
                    offScreen: r.bottom > window.innerHeight || r.top < 0,
                };
            });

            if (report.offScreen) {
                hidden += 1;
                console.log(`   HIDDEN  ${report.label.padEnd(36)} bottom ${report.bottom} > ${visible}`);
            }
        } catch {
            // A field that cannot be focused is not what this probe measures.
        }
    }

    console.log(hidden === 0
        ? `   every field stayed on screen\n`
        : `   ${hidden} field(s) would be under the keyboard\n`);
}

/**
 * The submit control is checked separately and last. A form whose fields all
 * survive but whose Save button sits under the keyboard is exactly as unusable,
 * and it is the failure people describe as "it just does nothing".
 */
await page.setViewportSize({ width: PHONE.width, height: PHONE.height - KEYBOARDS[0].takes });
const submits = await page.locator("button:visible").all();
for (const b of submits) {
    const t = (await b.textContent())?.trim() ?? "";
    if (!/save|record|pay|confirm/i.test(t)) continue;
    const r = await b.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { bottom: Math.round(box.bottom), under: box.bottom > window.innerHeight };
    });
    console.log(r.under
        ? `SUBMIT HIDDEN: "${t.slice(0, 30)}" at ${r.bottom}px — under the keyboard`
        : `submit visible: "${t.slice(0, 30)}"`);
}

console.log("\nleaving the window open for 20 seconds — look at it");
await page.waitForTimeout(20000);
await browser.close();
