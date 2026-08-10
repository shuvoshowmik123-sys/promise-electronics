/**
 * The POS tab, watched rather than photographed.
 *
 * This is the same walk that took eighteen screenshots and roughly forty
 * thousand tokens of images to audit by hand. It reports in text instead, and
 * spends a screenshot only where a rule fired.
 *
 * It asserts nothing about pass or fail on purpose. Its job is to produce a
 * report an agent reads and judges — a failing assertion here would just hide
 * the findings behind a stack trace.
 *
 * Live shop: opens surfaces and looks at them. Never submits a blind count,
 * never confirms a payment, creates nothing.
 */
import { test } from "@playwright/test";

import { observe } from "../fixtures/observatory/index.js";

const BASE = process.env.BASE_URL || "https://promiseelectronics.com";
const SHOTS = "mobile-qa/observatory";

/**
 * A tap that cannot land is a finding, not a crash.
 *
 * Playwright's default is to throw when something intercepts the click, which
 * ends the walk and throws away every state after it — so one blocked button
 * costs the whole report. Recording it and carrying on is what turns "the run
 * failed" into "this control is unreachable, and here is everything else".
 */
async function tap(obs: { note: (s: string) => void }, label: string, locator: any): Promise<boolean> {
    try {
        await locator.click({ timeout: 8000 });
        return true;
    } catch (error) {
        const reason = String((error as Error)?.message ?? error);
        const blocker = /intercepts pointer events/.test(reason)
            ? reason.split("from ")[1]?.slice(0, 120) ?? "another element"
            : reason.split(/\r?\n/)[0].slice(0, 120);
        obs.note(`BLOCKED tap on "${label}" — ${blocker}`);
        return false;
    }
}

test("POS mobile — observatory pass @admin-mobile", async ({ page }) => {
    test.setTimeout(180_000);

    const obs = await observe(page, { screenshotDir: SHOTS });

    // ── sign in ──────────────────────────────────────────────────────────
    await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("input-admin-username").fill(process.env.ADMIN_USER || "admin");
    await page.getByTestId("input-admin-password").fill(process.env.ADMIN_PASS || "admin123");
    await page.getByTestId("button-admin-login").click();
    await page.waitForURL(/\/admin/, { timeout: 25_000 });
    // The session needs a moment to settle; navigating immediately bounces
    // straight back to the login form.
    await page.waitForTimeout(3500);

    // ── reach POS the way a person does ──────────────────────────────────
    const onPos = () => page.getByPlaceholder(/search items/i).count();
    for (let attempt = 0; attempt < 3 && !(await onPos()); attempt++) {
        await page.getByText(/^POS$/).first().click().catch(() => { });
        await page.waitForTimeout(2000);
        if (!(await onPos())) {
            await page.goto(`${BASE}/admin/pos`, { waitUntil: "domcontentloaded" }).catch(() => { });
            await page.waitForTimeout(3000);
        }
    }
    await obs.mark("landed on POS");
    await obs.check("pos-landing");

    // Most mobile misbehaviour only shows in motion: a sticky header that
    // detaches, an image that loads and shoves the list down, a bottom bar
    // that eats the last row.
    await obs.scroll("pos-list");

    // ── the sourced-part form, which could not be submitted at all ───────
    const search = page.getByPlaceholder(/search items/i).first();
    if (await search.count()) {
        await search.fill("zzz-observatory-probe");
        await page.waitForTimeout(1200);
        await obs.check("no-catalogue-match");

        const open = page.getByRole("button", { name: /sourc/i }).first();
        if (await open.count()) {
            await obs.mark("opened the sourced-part form");
            await tap(obs, "Add as a sourced part", open);
            // Deliberately generous: this is where loading jitter lives, and a
            // check taken too early records a page that has not settled.
            await page.waitForTimeout(1500);
            await obs.check("sourced-form");

            const numbers = page.locator("input[inputmode='numeric'], input[inputmode='decimal']");
            const count = await numbers.count();
            for (let i = 0; i < count; i++) {
                await numbers.nth(i).fill(String(100 + i * 50)).catch(() => { });
            }
            await obs.check("sourced-form-filled");

            const add = page.getByRole("button", { name: /add to sale/i }).last();
            if (await add.count()) {
                await obs.mark("added a sourced part");
                await tap(obs, "Add to sale", add);
                await page.waitForTimeout(1500);
                await obs.check("after-add");
            }
        }
    }

    // ── the cart ─────────────────────────────────────────────────────────
    const viewCart = page.getByRole("button", { name: /view cart/i }).first();
    if (await viewCart.count()) {
        await obs.mark("opened the cart");
        await tap(obs, "View Cart", viewCart);
        await page.waitForTimeout(1300);
        await obs.check("cart");
        await obs.scroll("cart", { steps: 2 });

        const choose = page.getByRole("button", { name: /choose/i }).first();
        if (await choose.count()) {
            await tap(obs, "Choose customer", choose);
            await page.waitForTimeout(1300);
            await obs.check("customer-sheet");
            await page.keyboard.press("Escape").catch(() => { });
            await page.waitForTimeout(900);
        }

        // Opened and photographed. Never submitted — that ends a real shift.
        const closeRegister = page.getByRole("button", { name: /close/i }).first();
        if (await closeRegister.count()) {
            await obs.mark("opened Close Register (not submitted)");
            await tap(obs, "Close Register", closeRegister);
            await page.waitForTimeout(1600);
            await obs.check("close-register");
            await page.keyboard.press("Escape").catch(() => { });
            await page.waitForTimeout(800);
        }
    }

    // The whole point: one block of text, cheap to read.
    console.log("\n" + obs.report() + "\n");
});
