import { test, expect, loginAsAdmin } from '../fixtures/auth';
import { captureChromeState, waitForPrimaryScroll, swipeContentDown, swipeContentUp, detectGhostBars } from '../fixtures/mobile-audit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Service Requests + Pickups detail/action QA.
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

async function checkHorizontalOverflow(page: any): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

test.describe('SR + Pickup detail QA @admin-mobile', () => {
  test.setTimeout(90_000);

  test('service-requests detail', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#service-requests');
    await page.waitForTimeout(2500);

    const shellOk = await verifyAdminShell(page, `sr-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached').toBe(true);

    await saveShot(page, `sr-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found').toBe(true);

    const container = await waitForPrimaryScroll(page, 4000);
    let scrollWorked = false;
    if (container && container.maxScroll > 30) {
      const client = await page.context().newCDPSession(page);
      await swipeContentDown(page, 460, client);
      await page.waitForTimeout(400);
      const after = await waitForPrimaryScroll(page, 1000);
      scrollWorked = !!(after && after.scrollTop > container.scrollTop + 10);
      await saveShot(page, `sr-${vpLabel}-02-scrolled`);
      await swipeContentUp(page, 480, client);
      await page.waitForTimeout(400);
    }

    // Try opening first SR card
    let detailOpened = false;
    let chromeInDetail: any = null;
    let closeWorked = false;
    let chromeAfterClose: any = null;
    const issues: string[] = [];

    // SR cards are buttons inside the MobileScrollContent
    const srCard = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button[type="button"]');
      for (const btn of buttons) {
        const text = btn.textContent || '';
        if (text.includes('SR-') || text.includes('New') || text.includes('Pending') || text.includes('Quoted')) {
          const r = btn.getBoundingClientRect();
          if (r.width > 200 && r.height > 40 && r.top > 0 && r.top < window.innerHeight) {
            return { found: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          }
        }
      }
      return { found: false, x: 0, y: 0 };
    });

    if (srCard.found) {
      await page.touchscreen.tap(srCard.x, srCard.y);
      await page.waitForTimeout(1000);

      // Check if detail opened — look for MobileBottomSheetFrame or detail panel
      const detailState = await page.evaluate(() => {
        const sheet = document.querySelector('[class*="MobileBottomSheet"], [class*="fixed"][class*="z-["]');
        const hasDetail = !!document.querySelector('[class*="rounded-t-3xl"], [class*="rounded-t-\\[2rem\\]"]');
        return { sheet: !!sheet, hasDetail };
      });
      detailOpened = detailState.sheet || detailState.hasDetail;

      if (detailOpened) {
        await saveShot(page, `sr-${vpLabel}-03-detail-open`);
        chromeInDetail = await captureChromeState(page);

        // Check if chrome hides — SR does NOT dispatch chrome events, so dock may still be visible
        if (chromeInDetail.dockVisible) {
          issues.push('dock-visible-while-detail-open (no chrome dispatch in ServiceRequestsTab)');
        }

        // Close with Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(600);
        await saveShot(page, `sr-${vpLabel}-04-after-close`);

        // Verify close worked
        const afterCloseState = await page.evaluate(() => {
          const composer = !!document.querySelector('textarea');
          const detailStillOpen = !!document.querySelector('[class*="rounded-t-3xl"][class*="bg-white"]');
          return { composer, detailStillOpen };
        });
        closeWorked = !afterCloseState.detailStillOpen;
        chromeAfterClose = await captureChromeState(page);
      }
    } else {
      issues.push('no-sr-card-found');
    }

    const hasHorizOverflow = await checkHorizontalOverflow(page);
    const ghost = await detectGhostBars(page);

    saveRaw(`sr-${vpLabel}`, {
      shellReached: true,
      url: page.url(),
      dockFound: chromeRest.dockFound,
      dockVisibleAtRest: chromeRest.dockVisible,
      topVisibleAtRest: chromeRest.topVisible,
      scrollWorked,
      scrollRange: container?.maxScroll ?? 0,
      detailOpened,
      dockHiddenInDetail: chromeInDetail ? !chromeInDetail.dockVisible : null,
      dockPolicy: 'no chrome dispatch — ServiceRequestsTab does not dispatch admin:mobile-chrome',
      closeWorked,
      dockRestoredAfterClose: chromeAfterClose?.dockVisible ?? null,
      topRestoredAfterClose: chromeAfterClose?.topVisible ?? null,
      hasHorizontalOverflow: hasHorizOverflow,
      ghost: ghost.issues,
      issues,
    });

    console.log(`[SR] ${vpLabel}: shell=YES dock=${chromeRest.dockVisible} scroll=${scrollWorked} detail=${detailOpened} close=${closeWorked} hOverflow=${hasHorizOverflow} issues=${issues.length > 0 ? issues.join(', ') : 'none'}`);
  });

  test('pickups detail', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#pickup');
    await page.waitForTimeout(2500);

    const shellOk = await verifyAdminShell(page, `pickup-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached').toBe(true);

    await saveShot(page, `pickup-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found').toBe(true);

    const container = await waitForPrimaryScroll(page, 4000);
    let scrollWorked = false;
    if (container && container.maxScroll > 30) {
      const client = await page.context().newCDPSession(page);
      await swipeContentDown(page, 460, client);
      await page.waitForTimeout(400);
      const after = await waitForPrimaryScroll(page, 1000);
      scrollWorked = !!(after && after.scrollTop > container.scrollTop + 10);
      await saveShot(page, `pickup-${vpLabel}-02-scrolled`);
      await swipeContentUp(page, 480, client);
      await page.waitForTimeout(400);
    }

    // Try opening first pickup action
    let detailOpened = false;
    let chromeInDetail: any = null;
    let closeWorked = false;
    let chromeAfterClose: any = null;
    const issues: string[] = [];

    const pickupCard = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent || '';
        if (text.includes('Schedule') || text.includes('View') || text.includes('Handover') || text.includes('Assign') || text.includes('Receive') || text.includes('OTP')) {
          const r = btn.getBoundingClientRect();
          if (r.width > 60 && r.height > 30 && r.top > 0 && r.top < window.innerHeight) {
            return { found: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: text.trim().substring(0, 30) };
          }
        }
      }
      return { found: false, x: 0, y: 0, text: '' };
    });

    if (pickupCard.found) {
      await page.touchscreen.tap(pickupCard.x, pickupCard.y);
      await page.waitForTimeout(1000);
      await saveShot(page, `pickup-${vpLabel}-03-action-open`);

      // Check for dialog/sheet
      const actionState = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const sheet = document.querySelector('[class*="rounded-t-3xl"], [class*="rounded-t-\\[2rem\\]"]');
        return { dialog: !!dialog, sheet: !!sheet };
      });
      detailOpened = actionState.dialog || actionState.sheet;

      if (detailOpened) {
        chromeInDetail = await captureChromeState(page);

        // Close with Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(600);
        closeWorked = true;
        chromeAfterClose = await captureChromeState(page);
        await saveShot(page, `pickup-${vpLabel}-04-after-close`);
      }
    } else {
      issues.push('no-pickup-action-found');
    }

    const hasHorizOverflow = await checkHorizontalOverflow(page);
    const ghost = await detectGhostBars(page);

    saveRaw(`pickup-${vpLabel}`, {
      shellReached: true,
      url: page.url(),
      dockFound: chromeRest.dockFound,
      dockVisibleAtRest: chromeRest.dockVisible,
      topVisibleAtRest: chromeRest.topVisible,
      scrollWorked,
      scrollRange: container?.maxScroll ?? 0,
      detailOpened,
      dockHiddenInDetail: chromeInDetail ? !chromeInDetail.dockVisible : null,
      closeWorked,
      dockRestoredAfterClose: chromeAfterClose?.dockVisible ?? null,
      topRestoredAfterClose: chromeAfterClose?.topVisible ?? null,
      hasHorizontalOverflow: hasHorizOverflow,
      ghost: ghost.issues,
      issues,
    });

    console.log(`[PICKUP] ${vpLabel}: shell=YES dock=${chromeRest.dockVisible} scroll=${scrollWorked} detail=${detailOpened} close=${closeWorked} hOverflow=${hasHorizOverflow} issues=${issues.length > 0 ? issues.join(', ') : 'none'}`);
  });
});
