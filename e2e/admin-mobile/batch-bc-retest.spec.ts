import { test, expect, loginAsAdmin } from '../fixtures/auth';
import { captureChromeState, waitForPrimaryScroll, swipeContentDown, detectGhostBars } from '../fixtures/mobile-audit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Corrected retest for Corp Messages and Jobs.
 * Corp Messages: stable thread selector with scrollIntoView fallback.
 * Jobs: proper shell + detail test.
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

test.describe('Corrected retest @admin-mobile', () => {
  test.setTimeout(90_000);

  test('jobs', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#jobs');
    await page.waitForTimeout(2500);

    const shellOk = await verifyAdminShell(page, `jobs-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached for jobs').toBe(true);

    await saveShot(page, `jobs-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found').toBe(true);

    const container = await waitForPrimaryScroll(page, 3000);
    const ghost = await detectGhostBars(page);

    // Try opening a job detail
    let detailOpened = false;
    let chromeInDetail: any = null;
    let chromeAfterClose: any = null;

    // Job cards are in a grid — find any card with a job ticket number
    const jobCard = page.locator('[class*="cursor-pointer"]').filter({ hasText: /#\d+-\d+/ }).first();
    if (await jobCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await jobCard.click();
      await page.waitForTimeout(1000);
      detailOpened = true;
      await saveShot(page, `jobs-${vpLabel}-02-detail-open`);
      chromeInDetail = await captureChromeState(page);

      // Close with Escape (job detail sheet has MobileBottomSheetFrame with Escape handler)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      await saveShot(page, `jobs-${vpLabel}-03-after-close`);
      chromeAfterClose = await captureChromeState(page);
    }

    saveRaw(`jobs-${vpLabel}`, {
      shellReached: true, url: await page.url(),
      chromeRest, chromeInDetail, chromeAfterClose,
      detailOpened, ghost,
      container: container ? { cls: container.cls, max: container.maxScroll } : null,
    });

    console.log(`[RETEST] jobs ${vpLabel}: dockFound=${chromeRest.dockFound} dockVisible=${chromeRest.dockVisible} detail=${detailOpened} scroll=${container?.maxScroll ?? 'NONE'} ghost=${ghost.issues.length}`);
  });

  test('corp-msg', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#corp-msg');
    await page.waitForTimeout(2500);

    const shellOk = await verifyAdminShell(page, `corp-msg-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached for corp-msg').toBe(true);

    await saveShot(page, `corp-msg-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found').toBe(true);

    // Find thread cards — they are <button> elements with thread content inside
    // Use a more permissive selector and scrollIntoView before clicking
    const allButtons = page.locator('button');
    const buttonCount = await allButtons.count();
    let threadBtn: any = null;
    let threadCount = 0;

    // Scan buttons for ones that look like thread cards (contain "open" badge text or client names)
    for (let i = 0; i < Math.min(buttonCount, 30); i++) {
      const btn = allButtons.nth(i);
      const text = await btn.textContent().catch(() => '');
      if (text && (text.toLowerCase().includes('support chat') || text.toLowerCase().includes('intake dispute'))) {
        threadCount++;
        if (!threadBtn) threadBtn = btn;
      }
    }

    let threadOpened = false;
    let chromeInChat: any = null;
    let chromeAfterBack: any = null;
    let clickMethod = 'none';

    if (threadBtn) {
      // Try scrollIntoView first, then click
      try {
        await threadBtn.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await threadBtn.click({ timeout: 5000 });
        clickMethod = 'normal';
        threadOpened = true;
      } catch {
        // If normal click fails, try force click and record it
        try {
          await threadBtn.click({ force: true, timeout: 5000 });
          clickMethod = 'force';
          threadOpened = true;
        } catch {
          clickMethod = 'failed';
        }
      }

      if (threadOpened) {
        await page.waitForTimeout(1000);
        try {
          await saveShot(page, `corp-msg-${vpLabel}-02-thread-open`);
          chromeInChat = await captureChromeState(page);
        } catch { /* capture what we can */ }

        // Navigate back to thread list to test chrome restore
        try {
          await page.goto('/admin#corp-msg');
          await page.waitForTimeout(1500);
          await saveShot(page, `corp-msg-${vpLabel}-03-after-back`);
          chromeAfterBack = await captureChromeState(page);
        } catch { /* page may have navigated */ }
      }
    }

    let ghost = { issues: [] as string[] };
    try { ghost = await detectGhostBars(page); } catch { /* page may have closed */ }

    saveRaw(`corp-msg-${vpLabel}`, {
      shellReached: true, url: page.url(),
      chromeRest, chromeInChat, chromeAfterBack,
      threadOpened, threadCount, clickMethod, ghost,
    });

    console.log(`[RETEST] corp-msg ${vpLabel}: dockFound=${chromeRest.dockFound} dockVisible=${chromeRest.dockVisible} threads=${threadCount} opened=${threadOpened} click=${clickMethod} ghost=${ghost.issues.length}`);
  });
});
