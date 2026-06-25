import { test, expect, loginAsAdmin } from '../fixtures/auth';
import { captureChromeState, waitForPrimaryScroll, swipeContentDown, swipeContentUp, detectGhostBars } from '../fixtures/mobile-audit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Finance retest — verifies invoice dialog no longer crashes with
 * "item.price.replace is not a function" and captures valid evidence.
 * @admin-mobile
 */

const RAW_DIR = path.resolve('d:/PromiseIntegratedSystem/PromiseIntegratedSystem/.qa/admin-mobile-native-audit/raw');
const SHOT_DIR = path.resolve('d:/PromiseIntegratedSystem/PromiseIntegratedSystem/.qa/admin-mobile-native-audit/screenshots');

function ensureDirs() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}
function saveRaw(name: string, data: any) { fs.writeFileSync(path.join(RAW_DIR, `${name}.json`), JSON.stringify(data, null, 2)); }
async function saveShot(page: any, name: string) { fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), await page.screenshot()); }

async function verifyAdminShell(page: any, label: string): Promise<boolean> {
  const state = await page.evaluate(() => ({
    loginVisible: !!document.querySelector('[data-testid="button-admin-login"]'),
    dockExists: !!document.querySelector('nav[class*="fixed"]'),
    sidebarExists: !!document.querySelector('aside'),
  }));
  if (state.loginVisible || (!state.dockExists && !state.sidebarExists)) {
    await saveShot(page, `${label}-LOGIN_FAILED`);
    return false;
  }
  return true;
}

test.describe('Finance retest @admin-mobile', () => {
  test.setTimeout(90_000);

  test('finance invoice dialog does not crash', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#finance');

    // Wait for Finance to finish loading
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading financial data'), { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const shellOk = await verifyAdminShell(page, `finance-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached for finance').toBe(true);

    const finLoaded = await page.evaluate(() => !document.body.textContent?.includes('Loading financial data'));
    expect(finLoaded, 'Finance must finish loading').toBe(true);

    await saveShot(page, `finance-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found at rest').toBe(true);

    const container = await waitForPrimaryScroll(page, 4000);

    // Find and click View button to open invoice dialog
    const viewBtn = page.locator('button').filter({ hasText: /^View$/ }).first();
    let dialogOpened = false;
    let errorBoundary = false;

    if (await viewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await viewBtn.scrollIntoViewIfNeeded();
      await viewBtn.click();
      await page.waitForTimeout(1000);

      // Check for error boundary
      errorBoundary = await page.evaluate(() =>
        !!document.body.textContent?.match(/is not a function|error boundary|something went wrong/i)
      );

      if (errorBoundary) {
        await saveShot(page, `finance-${vpLabel}-02-ERROR-BOUNDARY`);
        dialogOpened = false;
      } else {
        dialogOpened = true;
        await saveShot(page, `finance-${vpLabel}-02-dialog-open`);

        // Close dialog
        await page.keyboard.press('Escape');
        await page.waitForTimeout(600);
        await saveShot(page, `finance-${vpLabel}-03-after-dialog-close`);
      }
    }

    // Scroll test
    let scrollHideWorks = false;
    if (container && container.maxScroll > 30) {
      const client = await page.context().newCDPSession(page);
      await swipeContentDown(page, 460, client);
      await page.waitForTimeout(400);
      const chromeScrolled = await captureChromeState(page);
      scrollHideWorks = !chromeScrolled.dockVisible;

      await swipeContentUp(page, 480, client);
      await page.waitForTimeout(400);
    }
    await saveShot(page, `finance-${vpLabel}-04-scroll-restored`);
    const chromeRestored = await captureChromeState(page);

    const ghost = await detectGhostBars(page);

    saveRaw(`finance-${vpLabel}`, {
      shellReached: true, financeLoaded: true, url: await page.url(),
      chromeRest, chromeRestored,
      dialogOpened, errorBoundary, scrollHideWorks, ghost,
      container: container ? { cls: container.cls, max: container.maxScroll, scrollTop: container.scrollTop } : null,
    });

    console.log(`[RETEST] finance ${vpLabel}: dockFound=${chromeRest.dockFound} dockVisible=${chromeRest.dockVisible} dialog=${dialogOpened} errorBoundary=${errorBoundary} scrollRange=${container?.maxScroll ?? 0} ghost=${ghost.issues.length}`);
    expect(errorBoundary, 'invoice dialog must not crash with error boundary').toBe(false);
  });
});
