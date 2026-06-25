import { test, expect, loginAsAdmin } from '../fixtures/auth';
import { captureChromeState, findPrimaryScroll, waitForPrimaryScroll, swipeContentDown, swipeContentUp, detectGhostBars } from '../fixtures/mobile-audit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Batch A: Dashboard, Inventory, Finance — with hardened login + shell verification
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
    url: window.location.href,
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

test.describe('Batch A @admin-mobile', () => {
  test.setTimeout(90_000);

  test('dashboard', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#dashboard');
    await page.waitForTimeout(2500);

    const shellOk = await verifyAdminShell(page, `dashboard-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached for dashboard').toBe(true);

    await saveShot(page, `dashboard-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found at rest').toBe(true);

    const container = await waitForPrimaryScroll(page, 4000);

    // Touch scroll if there's content
    let chromeScrolled = chromeRest;
    let chromeRestored = chromeRest;
    if (container && container.maxScroll > 30) {
      const client = await page.context().newCDPSession(page);
      await swipeContentDown(page, 460, client);
      await page.waitForTimeout(400);
      await saveShot(page, `dashboard-${vpLabel}-02-scrolled`);
      chromeScrolled = await captureChromeState(page);

      await swipeContentUp(page, 480, client);
      await page.waitForTimeout(400);
      chromeRestored = await captureChromeState(page);
    }
    await saveShot(page, `dashboard-${vpLabel}-03-restored`);
    const ghost = await detectGhostBars(page);

    saveRaw(`dashboard-${vpLabel}`, {
      shellReached: true,
      url: await page.url(),
      chromeRest, chromeScrolled, chromeRestored,
      ghost,
      container: container ? { cls: container.cls, max: container.maxScroll } : null,
    });
    console.log(`[BATCH-A] dashboard ${vpLabel}: dockFound=${chromeRest.dockFound} dockVisible=${chromeRest.dockVisible} scrollRange=${container?.maxScroll ?? 0} ghost=${ghost.issues.length}`);
  });

  test('inventory', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#inventory');
    await page.waitForTimeout(2500);

    const shellOk = await verifyAdminShell(page, `inventory-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached for inventory').toBe(true);

    await saveShot(page, `inventory-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found at rest').toBe(true);

    // Open detail
    const card = page.locator('button[type="button"]').filter({ hasText: /Qty/ }).first();
    let detailOpened = false;
    let chromeOpen: any = null;
    let chromeAfterEscape: any = null;
    let backdropRestored = false;

    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click();
      await page.waitForTimeout(800);
      detailOpened = true;
      await saveShot(page, `inventory-${vpLabel}-02-detail-open`);
      chromeOpen = await captureChromeState(page);

      // Escape close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      await saveShot(page, `inventory-${vpLabel}-03-after-escape`);
      chromeAfterEscape = await captureChromeState(page);

      // Reopen + backdrop close
      if (await card.isVisible({ timeout: 2000 }).catch(() => false)) {
        await card.click();
        await page.waitForTimeout(800);
        const backdrop = page.locator('.fixed.inset-0').first();
        await backdrop.click({ position: { x: vp.width / 2, y: 30 } });
        await page.waitForTimeout(600);
        backdropRestored = (await captureChromeState(page)).dockVisible;
        await saveShot(page, `inventory-${vpLabel}-04-after-backdrop`);
      }
    }

    // Dock clearance
    const container = await waitForPrimaryScroll(page, 3000);
    let dockClearance = 'untestable';
    if (container && container.maxScroll > 30) {
      const client = await page.context().newCDPSession(page);
      for (let i = 0; i < 10; i++) {
        await swipeContentDown(page, 500, client);
        await page.waitForTimeout(200);
        const cur = await findPrimaryScroll(page);
        if (cur && cur.scrollTop >= cur.maxScroll - 4) break;
      }
      await page.waitForTimeout(300);
      await saveShot(page, `inventory-${vpLabel}-05-bottom`);
      const c = await page.evaluate(() => {
        let dockTop = window.innerHeight;
        document.querySelectorAll<HTMLElement>('nav').forEach(el => {
          const s = getComputedStyle(el); const r = el.getBoundingClientRect();
          if (s.position === 'fixed' && r.width > window.innerWidth * 0.4 && r.height >= 40 && parseFloat(s.opacity || '1') > 0.05 && s.pointerEvents !== 'none')
            dockTop = Math.min(dockTop, r.top);
        });
        let lowestBottom = 0;
        document.querySelectorAll<HTMLElement>('button, [class*="rounded-2xl"]').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width < 40 || r.height < 20 || r.top > window.innerHeight || r.bottom < 0) return;
          const s = getComputedStyle(el);
          if (s.position === 'fixed' || s.position === 'sticky') return;
          if (r.bottom > lowestBottom) lowestBottom = r.bottom;
        });
        return { dockTop: Math.round(dockTop), lowestBottom: Math.round(lowestBottom) };
      });
      dockClearance = c.lowestBottom <= c.dockTop ? 'pass' : `fail:${c.lowestBottom}>${c.dockTop}`;
    }

    const ghost = await detectGhostBars(page);

    saveRaw(`inventory-${vpLabel}`, {
      shellReached: true, url: await page.url(),
      chromeRest, chromeOpen, chromeAfterEscape,
      detailOpened, backdropRestored, dockClearance, ghost,
      container: container ? { cls: container.cls, max: container.maxScroll } : null,
    });

    console.log(`[BATCH-A] inventory ${vpLabel}: dockFound=${chromeRest.dockFound} escape=${chromeAfterEscape?.dockVisible} backdrop=${backdropRestored} clearance=${dockClearance} ghost=${ghost.issues.length}`);
    if (detailOpened) {
      expect(chromeAfterEscape?.dockVisible, 'dock must restore after Escape').toBe(true);
    }
  });

  test('finance', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#finance');

    // Wait for Finance to finish loading (not just "Loading financial data...")
    await page.waitForFunction(() => {
      const loading = document.body.textContent?.includes('Loading financial data');
      return !loading;
    }, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const shellOk = await verifyAdminShell(page, `finance-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached for finance').toBe(true);

    // Verify Finance UI loaded (not still loading)
    const finLoaded = await page.evaluate(() => !document.body.textContent?.includes('Loading financial data'));
    if (!finLoaded) {
      await saveShot(page, `finance-${vpLabel}-LOAD_FAILED`);
      saveRaw(`finance-${vpLabel}`, { shellReached: true, financeLoaded: false });
      expect(finLoaded, 'Finance must finish loading').toBe(true);
      return;
    }

    await saveShot(page, `finance-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found at rest').toBe(true);

    const container = await waitForPrimaryScroll(page, 4000);

    // Scroll test
    let chromeScrolled = chromeRest;
    if (container && container.maxScroll > 30) {
      const client = await page.context().newCDPSession(page);
      await swipeContentDown(page, 460, client);
      await page.waitForTimeout(400);
      await saveShot(page, `finance-${vpLabel}-02-scrolled`);
      chromeScrolled = await captureChromeState(page);

      await swipeContentUp(page, 480, client);
      await page.waitForTimeout(400);
    }
    await saveShot(page, `finance-${vpLabel}-03-restored`);
    const chromeRestored = await captureChromeState(page);

    // Dialog test
    let dialogOpened = false;
    const actionBtn = page.locator('button, a').filter({ hasText: /View|Settle|Process/ }).first();
    if (await actionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await actionBtn.click();
      await page.waitForTimeout(800);
      dialogOpened = true;
      await saveShot(page, `finance-${vpLabel}-04-dialog-open`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      await saveShot(page, `finance-${vpLabel}-05-after-dialog-close`);
    }

    const ghost = await detectGhostBars(page);

    saveRaw(`finance-${vpLabel}`, {
      shellReached: true, financeLoaded: true, url: await page.url(),
      chromeRest, chromeScrolled, chromeRestored, dialogOpened, ghost,
      container: container ? { cls: container.cls, max: container.maxScroll, scrollTop: container.scrollTop } : null,
    });

    console.log(`[BATCH-A] finance ${vpLabel}: dockFound=${chromeRest.dockFound} dockVisible=${chromeRest.dockVisible} scrollRange=${container?.maxScroll ?? 0} dialog=${dialogOpened} ghost=${ghost.issues.length}`);
  });
});
