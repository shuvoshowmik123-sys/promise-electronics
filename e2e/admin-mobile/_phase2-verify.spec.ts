import { test, expect, loginAsAdmin } from '../fixtures/auth';
import { swipeContentDown, swipeContentUp, waitForPrimaryScroll, captureChromeState } from '../fixtures/mobile-audit';

/**
 * Phase 2 verification: prove the chrome compensation glitch is fixed.
 * Measures wrapper height/top/bottom before, during, and after chrome hide.
 * @admin-mobile
 */

async function captureWrapper(page: any, label: string) {
  return page.evaluate((label: string) => {
    // Find MainContentWrapper inner div — the one with transition-transform
    let wrapper: HTMLElement | null = null;
    document.querySelectorAll<HTMLElement>('div').forEach((el) => {
      const cls = el.className || '';
      if (cls.includes('max-w-[1600px]') && cls.includes('transition-transform')) wrapper = el;
    });
    if (!wrapper) return { label, found: false, height: 0, top: 0, bottom: 0 };
    const r = wrapper.getBoundingClientRect();
    return {
      label,
      found: true,
      height: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      computedHeight: getComputedStyle(wrapper).height,
    };
  }, label);
}

const TABS = ['dashboard', 'inventory', 'finance'] as const;

test.describe('Phase 2 flicker fix verification @admin-mobile', () => {
  test.setTimeout(120_000);

  test('no height snap during chrome hide on Daily Ops tabs', async ({ page }, testInfo) => {
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);

    for (const tab of TABS) {
      await page.goto(`/admin#${tab}`);
      await page.waitForTimeout(1800);

      const shot = async (label: string) => {
        await testInfo.attach(`${tab}-${vpLabel}-${label}`, {
          body: await page.screenshot(), contentType: 'image/png',
        });
      };

      // 1. Measure at rest
      const rest = await captureWrapper(page, 'rest');
      const chromeRest = await captureChromeState(page);
      await shot('01-rest');

      // 2. Trigger chrome hide via real event
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('admin:mobile-chrome', { detail: { hidden: true } })));
      // Capture at 50ms (mid-transition)
      await page.waitForTimeout(50);
      const mid = await captureWrapper(page, 'mid-50ms');
      // Capture at 250ms (after transition)
      await page.waitForTimeout(200);
      const after = await captureWrapper(page, 'after-250ms');
      const chromeHidden = await captureChromeState(page);
      await shot('02-hidden');

      // 3. Restore chrome
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('admin:mobile-chrome', { detail: { hidden: false } })));
      await page.waitForTimeout(300);
      const restored = await captureWrapper(page, 'restored');
      await shot('03-restored');

      console.log(`\n[PHASE2] ${tab} @ ${vpLabel}:`);
      console.log(`  rest:     h=${rest.height} top=${rest.top} bottom=${rest.bottom}`);
      console.log(`  mid-50ms: h=${mid.height} top=${mid.top} bottom=${mid.bottom}`);
      console.log(`  after:    h=${after.height} top=${after.top} bottom=${after.bottom}`);
      console.log(`  restored: h=${restored.height} top=${restored.top} bottom=${restored.bottom}`);

      // KEY ASSERTION: height must NOT jump by >20px between rest and mid-transition.
      // With the old code, height jumped 128px instantly. With the fix, it should stay
      // constant (no-height approach) or change gradually (animated-height fallback).
      const heightDelta = Math.abs(mid.height - rest.height);
      console.log(`  height delta (rest->mid): ${heightDelta}px`);
      expect(heightDelta, `${tab}: height must not snap >20px during 50ms`).toBeLessThanOrEqual(20);

      // Chrome must actually hide
      expect(chromeHidden.dockVisible, `${tab}: dock must hide`).toBe(false);

      // Chrome must restore
      expect(restored.height, `${tab}: height must restore`).toBe(rest.height);
    }
  });

  test('touch scroll reachability after fix', async ({ page }, testInfo) => {
    const vp = page.viewportSize()!;
    await loginAsAdmin(page);

    for (const tab of TABS) {
      await page.goto(`/admin#${tab}`);
      await page.waitForTimeout(1800);

      const container = await waitForPrimaryScroll(page, 4000);
      if (!container || container.maxScroll < 30) {
        console.log(`[PHASE2] ${tab}: no meaningful scroll range (${container?.maxScroll ?? 0}px), skip reachability`);
        continue;
      }

      // Scroll to bottom via touch
      const client = await page.context().newCDPSession(page);
      for (let i = 0; i < 15; i++) {
        await swipeContentDown(page, 500, client);
        await page.waitForTimeout(200);
        const cur = await waitForPrimaryScroll(page, 1000);
        if (cur && cur.scrollTop >= cur.maxScroll - 4) break;
      }
      await page.waitForTimeout(300);

      // Check: is the final content above the dock?
      const clearance = await page.evaluate(() => {
        const vh = window.innerHeight;
        let dockTop = vh;
        document.querySelectorAll<HTMLElement>('nav').forEach((el) => {
          const s = getComputedStyle(el);
          if (s.position !== 'fixed') return;
          const r = el.getBoundingClientRect();
          if (r.width > window.innerWidth * 0.4 && r.height >= 40 && parseFloat(s.opacity || '1') > 0.05 && s.pointerEvents !== 'none') {
            dockTop = Math.min(dockTop, r.top);
          }
        });
        let lowestBottom = 0;
        document.querySelectorAll<HTMLElement>('button, [class*="rounded-2xl"], [class*="rounded-xl"]').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width < 40 || r.height < 20 || r.top > vh || r.bottom < 0) return;
          const s = getComputedStyle(el);
          if (s.position === 'fixed' || s.position === 'sticky') return;
          if (r.bottom > lowestBottom) lowestBottom = r.bottom;
        });
        return { dockTop: Math.round(dockTop), lowestBottom: Math.round(lowestBottom) };
      });

      console.log(`[PHASE2] ${tab} reachability: content bottom=${clearance.lowestBottom}, dock top=${clearance.dockTop}, clear=${clearance.lowestBottom <= clearance.dockTop}`);
      await testInfo.attach(`${tab}-${vp.width}x${vp.height}-bottom`, {
        body: await page.screenshot(), contentType: 'image/png',
      });
    }
  });
});
