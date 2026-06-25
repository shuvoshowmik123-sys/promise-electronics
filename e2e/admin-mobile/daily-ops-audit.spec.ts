import { test, expect, loginAsAdmin } from '../fixtures/auth';
import {
  scrollPass, captureChromeState, findPrimaryScroll, waitForPrimaryScroll,
  swipeContentDown, detectGhostBars, type ScrollPassResult,
} from '../fixtures/mobile-audit';

/**
 * Admin mobile visual-native consistency audit — evidence-first.
 *
 * Gesture method: CDP `Input.dispatchTouchEvent` with ease-out deceleration.
 * mouse.wheel is NOT used for any chrome/native evidence.
 *
 * Runs under admin-mobile-chrome (390×844) and admin-mobile-lg (584×918).
 * @admin-mobile tag routes to the real iPhone-15 touch Playwright projects.
 */

const DAILY_OPS_TABS = [
  'dashboard', 'jobs', 'inventory', 'finance',
  'pos', 'service-requests', 'pickup', 'corp-msg',
] as const;

type TabAuditResult = {
  tab: string;
  viewport: string;
  containerFound: boolean;
  containerCls: string;
  maxScroll: number;
  scrollResult: ScrollPassResult | null;
  chromeAtRest: Awaited<ReturnType<typeof captureChromeState>>;
  detailChromeHid: boolean | null;
  detailChromeRestored: boolean | null;
  ghostIssues: string[];
  dockClearance: 'pass' | 'fail' | 'no-scroll' | 'untestable';
  desktopOk: boolean | null;
  issues: string[];
};

test.describe('Daily Ops admin mobile native audit @admin-mobile', () => {
  test.setTimeout(360_000); // 6 min for 8 tabs with scroll passes + detail opens

  test('full audit across all Daily Ops tabs', async ({ page }, testInfo) => {
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);

    const results: TabAuditResult[] = [];

    for (const tab of DAILY_OPS_TABS) {
      const hash = tab === 'service-requests' ? 'requests' :
                   tab === 'pickup' ? 'pickup' :
                   tab === 'corp-msg' ? 'corp-msg' : tab;
      await page.goto(`/admin#${hash}`);
      await page.waitForTimeout(2000);

      // --- Screenshots ---
      const shot = async (label: string) => {
        await testInfo.attach(`${tab}-${vpLabel}-${label}`, {
          body: await page.screenshot(), contentType: 'image/png',
        });
      };

      await shot('01-initial');

      // --- Chrome at rest ---
      const chromeAtRest = await captureChromeState(page);

      // --- Scroll container ---
      const container = await waitForPrimaryScroll(page, 4000);
      const containerFound = !!container;
      const containerCls = container?.cls ?? '';
      const maxScroll = container?.maxScroll ?? 0;

      // --- Scroll pass (touch) ---
      let scrollResult: ScrollPassResult | null = null;
      let dockClearance: TabAuditResult['dockClearance'] = 'no-scroll';
      const issues: string[] = [];

      if (container && maxScroll > 30) {
        scrollResult = await scrollPass(page, tab, shot);
        if (!scrollResult.reachedBottom) issues.push('could-not-reach-bottom');
        if (scrollResult.ghostIssues.length > 0) issues.push(`ghost-bars: ${scrollResult.ghostIssues.join(', ')}`);

        // Dock clearance: scroll to bottom, check last content vs dock
        await page.goto(`/admin#${hash}`);
        await page.waitForTimeout(1500);
        const client = await page.context().newCDPSession(page);
        for (let i = 0; i < 15; i++) {
          await swipeContentDown(page, 500, client);
          await page.waitForTimeout(200);
          const cur = await findPrimaryScroll(page);
          if (cur && cur.scrollTop >= cur.maxScroll - 4) break;
        }
        await page.waitForTimeout(300);

        const clearanceResult = await page.evaluate(() => {
          const vh = window.innerHeight;
          // find dock
          let dockTop = vh;
          document.querySelectorAll<HTMLElement>('nav').forEach((el) => {
            const s = getComputedStyle(el);
            if (s.position !== 'fixed') return;
            const r = el.getBoundingClientRect();
            if (r.width > window.innerWidth * 0.4 && r.height >= 40 && r.height <= 120) {
              if (parseFloat(s.opacity || '1') > 0.05 && s.pointerEvents !== 'none') {
                dockTop = Math.min(dockTop, r.top);
              }
            }
          });
          // find lowest visible content element (cards, buttons, list items)
          let lowestBottom = 0;
          document.querySelectorAll<HTMLElement>('button, [class*="card"], [class*="rounded-2xl"], [class*="rounded-xl"]').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 40 || r.height < 20) return;
            if (r.top > vh || r.bottom < 0) return;
            const s = getComputedStyle(el);
            if (s.position === 'fixed' || s.position === 'sticky') return;
            if (r.bottom > lowestBottom) lowestBottom = r.bottom;
          });
          return { dockTop: Math.round(dockTop), lowestBottom: Math.round(lowestBottom), overlap: lowestBottom > dockTop };
        });

        dockClearance = clearanceResult.overlap ? 'fail' : 'pass';
        if (clearanceResult.overlap) issues.push(`dock-overlap: content bottom ${clearanceResult.lowestBottom} > dock top ${clearanceResult.dockTop}`);
        await shot('03-bottom');
      } else if (!container) {
        issues.push('no-scroll-container-found');
        dockClearance = 'untestable';
      }

      // --- Detail surface test ---
      let detailChromeHid: boolean | null = null;
      let detailChromeRestored: boolean | null = null;

      await page.goto(`/admin#${hash}`);
      await page.waitForTimeout(1500);

      // Tab-specific detail open
      let detailOpened = false;
      try {
        if (tab === 'jobs') {
          const card = page.locator('[class*="cursor-pointer"]').first();
          if (await card.isVisible({ timeout: 2000 })) {
            await card.click();
            await page.waitForTimeout(800);
            detailOpened = true;
          }
        } else if (tab === 'inventory') {
          const card = page.locator('button[type="button"]').filter({ hasText: /Qty/ }).first();
          if (await card.isVisible({ timeout: 2000 })) {
            await card.click();
            await page.waitForTimeout(800);
            detailOpened = true;
          }
        } else if (tab === 'finance') {
          // Try opening a sales invoice "View" link
          const viewBtn = page.locator('button, a').filter({ hasText: /View|Settle|Process/ }).first();
          if (await viewBtn.isVisible({ timeout: 2000 })) {
            await viewBtn.click();
            await page.waitForTimeout(800);
            detailOpened = true;
          }
        } else if (tab === 'service-requests') {
          const card = page.locator('button[type="button"]').filter({ hasText: /SR-|JOB-|Lines|Backlight|No power|FLICRING/ }).first();
          if (await card.isVisible({ timeout: 2000 })) {
            await card.click();
            await page.waitForTimeout(800);
            detailOpened = true;
          }
        } else if (tab === 'pickup') {
          const card = page.locator('button[type="button"]').filter({ hasText: /Scheduled|Pending|Picked/ }).first();
          if (await card.isVisible({ timeout: 2000 })) {
            await card.click();
            await page.waitForTimeout(800);
            detailOpened = true;
          }
        } else if (tab === 'corp-msg') {
          // Corp messages: click first thread
          const thread = page.locator('button').filter({ hasText: /Support Chat|Intake dispute/ }).first();
          if (await thread.isVisible({ timeout: 2000 })) {
            await thread.click();
            await page.waitForTimeout(800);
            detailOpened = true;
          }
        } else if (tab === 'pos') {
          // POS: try opening any action
          const action = page.locator('button').filter({ hasText: /New Sale|Open Register|Start/ }).first();
          if (await action.isVisible({ timeout: 2000 })) {
            await action.click();
            await page.waitForTimeout(800);
            detailOpened = true;
          }
        }
      } catch { /* detail open failed — record as null */ }

      if (detailOpened) {
        await shot('04-detail-open');
        const chromeWhileDetail = await captureChromeState(page);
        detailChromeHid = !chromeWhileDetail.dockVisible && !chromeWhileDetail.topVisible;
        if (chromeWhileDetail.dockVisible) issues.push('dock-visible-while-detail-open');
        if (chromeWhileDetail.topVisible) issues.push('top-chrome-visible-while-detail-open');

        const ghostAfterDetail = await detectGhostBars(page);
        if (ghostAfterDetail.issues.length > 0) issues.push(`ghost-in-detail: ${ghostAfterDetail.issues.join(', ')}`);

        // Close detail: tab-specific close, then fallback to Escape
        try {
          if (tab === 'corp-msg') {
            // Corp-msg chat uses a back chevron button, not Escape
            const backBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
            if (await backBtn.isVisible({ timeout: 1000 })) await backBtn.click();
          } else if (tab === 'jobs') {
            // Job detail has a back arrow button inside the sheet
            const backBtn = page.locator('button[class*="rounded-full"]').filter({ has: page.locator('svg') }).first();
            if (await backBtn.isVisible({ timeout: 1000 })) await backBtn.click();
            else await page.keyboard.press('Escape');
          } else {
            await page.keyboard.press('Escape');
          }
        } catch { await page.keyboard.press('Escape'); }
        await page.waitForTimeout(600);
        const chromeAfterClose = await captureChromeState(page);
        detailChromeRestored = chromeAfterClose.dockVisible;
        if (!chromeAfterClose.dockVisible) issues.push('dock-not-restored-after-detail-close');
        await shot('05-after-detail-close');
      } else {
        if (tab !== 'dashboard' && tab !== 'pos') {
          issues.push('could-not-open-detail-surface');
        }
      }

      let finalGhostIssues: string[] = [];
      try {
        const ghostFinal = await detectGhostBars(page);
        finalGhostIssues = ghostFinal.issues;
        if (finalGhostIssues.length > 0) issues.push(`final-ghost: ${finalGhostIssues.join(', ')}`);
      } catch { /* page may have navigated during detail close */ }

      results.push({
        tab, viewport: vpLabel,
        containerFound, containerCls, maxScroll,
        scrollResult, chromeAtRest,
        detailChromeHid, detailChromeRestored,
        ghostIssues: scrollResult?.ghostIssues ?? finalGhostIssues,
        dockClearance, desktopOk: null, issues,
      });
    }

    // --- Write evidence JSON ---
    await testInfo.attach(`audit-results-${vpLabel}`, {
      body: Buffer.from(JSON.stringify(results, null, 2)),
      contentType: 'application/json',
    });

    // --- Print summary ---
    const summary = results.map(r => ({
      tab: r.tab, vp: r.viewport,
      scroll: r.containerFound ? `${r.maxScroll}px range` : 'NONE',
      dockClear: r.dockClearance,
      chromeHideOnScroll: r.scrollResult ? `top:${r.scrollResult.chromeTopHidWhileScrolling} dock:${r.scrollResult.chromeDockHidWhileScrolling}` : 'n/a',
      detailChromeHid: r.detailChromeHid,
      detailRestored: r.detailChromeRestored,
      ghosts: r.ghostIssues.length,
      issues: r.issues.length > 0 ? r.issues.join(' | ') : 'clean',
    }));
    console.log('\n[AUDIT] ' + vpLabel + ' RESULTS:\n' + JSON.stringify(summary, null, 2));
  });
});
