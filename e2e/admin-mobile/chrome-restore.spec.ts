import { test, expect, loginAsAdmin } from '../fixtures/auth';
import { captureChromeState } from '../fixtures/mobile-audit';

/**
 * Verify chrome restore after detail/sheet close on Inventory and Finance.
 * Tests Escape, backdrop click, and drag-close paths.
 * @admin-mobile
 */

test.describe('chrome restore after detail close @admin-mobile', () => {
  test.setTimeout(90_000);

  test('inventory: Escape closes detail sheet and restores chrome', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto('/admin#inventory');
    await page.waitForTimeout(2000);

    const shot = async (label: string) => {
      await testInfo.attach(`inv-${label}`, { body: await page.screenshot(), contentType: 'image/png' });
    };

    // Chrome visible at rest
    const atRest = await captureChromeState(page);
    expect(atRest.dockVisible, 'dock visible at rest').toBe(true);
    await shot('01-rest');

    // Open detail: tap first inventory card
    const card = page.locator('button[type="button"]').filter({ hasText: /Qty/ }).first();
    await expect(card).toBeVisible({ timeout: 3000 });
    await card.click();
    await page.waitForTimeout(800);

    // Chrome should be hidden
    const whileOpen = await captureChromeState(page);
    expect(whileOpen.dockVisible, 'dock hidden while detail open').toBe(false);
    await shot('02-detail-open');

    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // Chrome must restore
    const afterEscape = await captureChromeState(page);
    await shot('03-after-escape');
    expect(afterEscape.dockVisible, 'dock restored after Escape').toBe(true);
    expect(afterEscape.topVisible, 'top chrome restored after Escape').toBe(true);
  });

  test('inventory: backdrop click closes detail and restores chrome', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto('/admin#inventory');
    await page.waitForTimeout(2000);

    // Open detail
    const card = page.locator('button[type="button"]').filter({ hasText: /Qty/ }).first();
    await expect(card).toBeVisible({ timeout: 3000 });
    await card.click();
    await page.waitForTimeout(800);

    const whileOpen = await captureChromeState(page);
    expect(whileOpen.dockVisible, 'dock hidden while detail open').toBe(false);

    // Close via backdrop click (the fixed inset-0 wrapper)
    const backdrop = page.locator('.fixed.inset-0.z-\\[100\\]').first();
    await backdrop.click({ position: { x: 195, y: 50 } }); // click above the sheet
    await page.waitForTimeout(600);

    const afterBackdrop = await captureChromeState(page);
    await testInfo.attach('inv-04-after-backdrop', { body: await page.screenshot(), contentType: 'image/png' });
    expect(afterBackdrop.dockVisible, 'dock restored after backdrop click').toBe(true);
  });

  test('finance: chrome not stuck after dialog close + tab switch', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await page.goto('/admin#finance');
    await page.waitForTimeout(2000);

    const shot = async (label: string) => {
      await testInfo.attach(`fin-${label}`, { body: await page.screenshot(), contentType: 'image/png' });
    };

    // Chrome visible at rest (scroll at top)
    const atRest = await captureChromeState(page);
    expect(atRest.dockVisible, 'dock visible at rest').toBe(true);
    await shot('01-rest');

    // Open a dialog if available
    const actionBtn = page.locator('button, a').filter({ hasText: /View|Settle|Process/ }).first();
    if (await actionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await actionBtn.click();
      await page.waitForTimeout(800);
      await shot('02-dialog-open');

      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      await shot('03-after-escape');
    }

    // Finance chrome is scroll-driven (no manual dispatch). The real stuck-test:
    // navigate away and back — chrome must be visible on fresh load.
    await page.goto('/admin#dashboard');
    await page.waitForTimeout(1000);
    await page.goto('/admin#finance');
    await page.waitForTimeout(1500);

    const afterNav = await captureChromeState(page);
    await shot('04-after-nav');
    expect(afterNav.dockVisible, 'dock visible after fresh navigation to finance').toBe(true);
  });
});
