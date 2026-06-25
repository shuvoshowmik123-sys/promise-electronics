import { test, expect, loginAsAdmin } from '../fixtures/auth';
import { captureChromeState, waitForPrimaryScroll, detectGhostBars } from '../fixtures/mobile-audit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Batch B: Service Requests, Pickups — corrected routes
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

test.describe('Batch B @admin-mobile', () => {
  test.setTimeout(90_000);

  test('service-requests', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#service-requests');
    await page.waitForTimeout(2500);

    const shellOk = await verifyAdminShell(page, `service-requests-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached').toBe(true);

    await saveShot(page, `service-requests-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found').toBe(true);
    const container = await waitForPrimaryScroll(page, 3000);
    const ghost = await detectGhostBars(page);

    saveRaw(`service-requests-${vpLabel}`, {
      shellReached: true, url: await page.url(),
      chromeRest, ghost,
      container: container ? { cls: container.cls, max: container.maxScroll } : null,
    });
    console.log(`[BATCH-B] service-requests ${vpLabel}: dockFound=${chromeRest.dockFound} dockVisible=${chromeRest.dockVisible} scroll=${container?.maxScroll ?? 'NONE'} ghost=${ghost.issues.length}`);
  });

  test('pickups', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#pickup');
    await page.waitForTimeout(2500);

    const shellOk = await verifyAdminShell(page, `pickups-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached').toBe(true);

    await saveShot(page, `pickups-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found').toBe(true);
    const container = await waitForPrimaryScroll(page, 3000);
    const ghost = await detectGhostBars(page);

    saveRaw(`pickups-${vpLabel}`, {
      shellReached: true, url: await page.url(),
      chromeRest, ghost,
      container: container ? { cls: container.cls, max: container.maxScroll } : null,
    });
    console.log(`[BATCH-B] pickups ${vpLabel}: dockFound=${chromeRest.dockFound} dockVisible=${chromeRest.dockVisible} scroll=${container?.maxScroll ?? 'NONE'} ghost=${ghost.issues.length}`);
  });
});
