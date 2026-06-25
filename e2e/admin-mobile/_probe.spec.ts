import { test, expect, loginAsAdmin } from '../fixtures/auth';
import { findPrimaryScroll, waitForPrimaryScroll, swipeContentDown, scrollPass, captureChromeState } from '../fixtures/mobile-audit';

/**
 * Trustworthiness proof for the admin-mobile audit method.
 * Runs in admin-mobile-chrome / admin-mobile-lg (real iPhone-15 touch).
 * Proves CDP touch drives real scroll AND the evidence pipeline works.
 */
test.describe('admin mobile audit method @admin-mobile', () => {
  test('CDP touch drives real scroll + evidence pipeline works', async ({ page }, testInfo) => {
    await loginAsAdmin(page);

    // Inventory reliably overflows — use it as the hard trustworthiness assertion.
    await page.goto('/admin#inventory');
    const container = await waitForPrimaryScroll(page);
    expect(container, 'inventory must expose a scroll container').not.toBeNull();
    expect(container!.maxScroll, 'inventory must have real scroll range').toBeGreaterThan(50);

    // Validate the chrome detector actually SEES global chrome at rest, so a
    // later "chrome hid" = false is a real result, not a blind detector.
    const restChrome = await captureChromeState(page);
    console.log('[method-proof] chrome at rest: ' + JSON.stringify(restChrome));
    expect(restChrome.dockFound, 'chrome detector must locate the bottom dock at rest').toBe(true);
    expect(restChrome.topFound, 'chrome detector must locate the top glass island at rest').toBe(true);
    expect(restChrome.dockVisible && restChrome.topVisible, 'both chrome elements visible at rest').toBe(true);

    // Validate the hide-detector against the app's REAL hide mechanism: dispatch
    // the admin:mobile-chrome event and confirm the detector flips both to hidden,
    // then restores. This proves "chrome hid" results are trustworthy.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('admin:mobile-chrome', { detail: { hidden: true } })));
    await page.waitForTimeout(350);
    const hiddenChrome = await captureChromeState(page);
    console.log('[method-proof] chrome after hide event: ' + JSON.stringify(hiddenChrome));
    expect(hiddenChrome.dockVisible, 'detector must see dock hide').toBe(false);
    expect(hiddenChrome.topVisible, 'detector must see top island hide').toBe(false);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('admin:mobile-chrome', { detail: { hidden: false } })));
    await page.waitForTimeout(350);
    const reshownChrome = await captureChromeState(page);
    expect(reshownChrome.dockVisible && reshownChrome.topVisible, 'detector must see chrome restore').toBe(true);

    const before = container!.scrollTop;
    await swipeContentDown(page, 460);
    await page.waitForTimeout(400);
    const after = (await findPrimaryScroll(page))!.scrollTop;
    console.log(`[method-proof] viewport=${JSON.stringify(page.viewportSize())} touch scroll ${before} -> ${after}`);
    expect(after, 'CDP touch must move the container (proves trustworthy method)').toBeGreaterThan(before + 20);

    // Full evidence pipeline on inventory: screenshots + chrome/ghost capture.
    const shot = async (label: string) => {
      await testInfo.attach(`inventory-${label}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    };
    await page.goto('/admin#inventory');
    await page.waitForTimeout(800);
    const result = await scrollPass(page, 'inventory', shot);
    console.log('[method-proof] scrollPass result:\n' + JSON.stringify(result, null, 2));

    expect(result.reachedBottom, 'must be able to reach the bottom of the list').toBe(true);
    expect(result.ghostIssues, 'no ghost/white bottom bar allowed').toEqual([]);
  });
});
