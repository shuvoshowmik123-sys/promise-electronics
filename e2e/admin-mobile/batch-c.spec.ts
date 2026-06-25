import { test, expect, loginAsAdmin } from '../fixtures/auth';
import { captureChromeState, waitForPrimaryScroll, detectGhostBars } from '../fixtures/mobile-audit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Batch C: POS, Corporate Messages
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

test.describe('Batch C @admin-mobile', () => {
  test.setTimeout(90_000);

  test('pos', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#pos');
    await page.waitForTimeout(2500);

    const shellOk = await verifyAdminShell(page, `pos-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached').toBe(true);

    await saveShot(page, `pos-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found').toBe(true);
    const container = await waitForPrimaryScroll(page, 3000);
    const ghost = await detectGhostBars(page);
    const posState = await page.evaluate(() => ({
      hasHorizScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));

    saveRaw(`pos-${vpLabel}`, {
      shellReached: true, url: await page.url(),
      chromeRest, ghost, posState,
      container: container ? { cls: container.cls, max: container.maxScroll } : null,
    });
    console.log(`[BATCH-C] pos ${vpLabel}: dockFound=${chromeRest.dockFound} dockVisible=${chromeRest.dockVisible} hOverflow=${posState.hasHorizScroll} ghost=${ghost.issues.length}`);
  });

  test('corp-msg', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#corp-msg');
    await page.waitForTimeout(2500);

    const shellOk = await verifyAdminShell(page, `corp-msg-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached').toBe(true);

    await saveShot(page, `corp-msg-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found').toBe(true);

    // Try to find and click any thread
    const threadBtns = page.locator('button').filter({ hasText: /Support|Chat|Intake|siko|1000FIX|TechCorp|open/i });
    const threadCount = await threadBtns.count();
    let threadOpened = false;
    let chromeInChat: any = null;
    let chromeAfterBack: any = null;

    if (threadCount > 0) {
      await threadBtns.first().click();
      await page.waitForTimeout(1000);
      threadOpened = true;
      await saveShot(page, `corp-msg-${vpLabel}-02-thread-open`);
      chromeInChat = await captureChromeState(page);

      // Find back button (ChevronLeft svg inside a button)
      const backBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
      if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await backBtn.click();
        await page.waitForTimeout(600);
      }
      await saveShot(page, `corp-msg-${vpLabel}-03-after-back`);
      chromeAfterBack = await captureChromeState(page);
    }

    const ghost = await detectGhostBars(page);

    saveRaw(`corp-msg-${vpLabel}`, {
      shellReached: true, url: await page.url(),
      chromeRest, chromeInChat, chromeAfterBack,
      threadOpened, threadCount, ghost,
    });
    console.log(`[BATCH-C] corp-msg ${vpLabel}: dockFound=${chromeRest.dockFound} threads=${threadCount} opened=${threadOpened} ghost=${ghost.issues.length}`);
  });
});
