import { test, expect, loginAsAdmin } from '../fixtures/auth';

/**
 * Diagnostic: capture viewport/responsive state before, during, and after
 * CDP touch scrolling to identify what causes the mobile→desktop flicker.
 * @admin-mobile
 */

async function captureViewportDiag(page: any, label: string) {
  return page.evaluate((label: string) => ({
    label,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    docClientWidth: document.documentElement.clientWidth,
    docClientHeight: document.documentElement.clientHeight,
    dpr: window.devicePixelRatio,
    max767: window.matchMedia('(max-width: 767px)').matches,
    min768: window.matchMedia('(min-width: 768px)').matches,
    visualViewportWidth: window.visualViewport?.width ?? null,
    visualViewportHeight: window.visualViewport?.height ?? null,
    visualViewportScale: window.visualViewport?.scale ?? null,
    userAgent: navigator.userAgent,
  }), label);
}

async function captureBranchState(page: any, label: string) {
  return page.evaluate((label: string) => {
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden'
        && Number(s.opacity || 1) > 0.05 && r.width > 0 && r.height > 0;
    };
    const desktopSidebar = [...document.querySelectorAll('aside')]
      .some((el) => visible(el));
    const mobileDock = [...document.querySelectorAll('nav')]
      .some((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return visible(el) && s.position === 'fixed' && r.width > window.innerWidth * 0.4;
      });
    const topMobileChrome = [...document.querySelectorAll('div')]
      .some((el) => {
        const cls = String(el.className || '');
        return cls.includes('z-[60]') && visible(el);
      });
    return { label, desktopSidebar, mobileDock, topMobileChrome };
  }, label);
}

test.describe('flicker diagnostic @admin-mobile', () => {
  test('capture viewport state before/during/after CDP touch', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin#inventory');
    await page.waitForTimeout(2000);

    const results: any[] = [];
    const capture = async (label: string) => {
      const vp = await captureViewportDiag(page, label);
      const br = await captureBranchState(page, label);
      results.push({ ...vp, ...br });
    };

    await capture('01-before-touch');

    // Start CDP session for touch
    const client = await page.context().newCDPSession(page);
    const vps = page.viewportSize()!;
    const cx = Math.floor(vps.width / 2);
    const startY = Math.floor(vps.height * 0.72);
    const endY = Math.floor(vps.height * 0.28);

    // touchStart
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: cx, y: startY, id: 0 }],
    });
    await page.waitForTimeout(50);
    await capture('02-after-touchStart');

    // mid touchMove (halfway)
    const midY = Math.floor((startY + endY) / 2);
    for (let i = 1; i <= 12; i++) {
      const y = startY + ((midY - startY) * i) / 12;
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: cx, y, id: 0 }],
      });
      await page.waitForTimeout(14);
    }
    await capture('03-mid-touchMove');

    // continue to end
    for (let i = 1; i <= 12; i++) {
      const y = midY + ((endY - midY) * i) / 12;
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: cx, y, id: 0 }],
      });
      await page.waitForTimeout(14);
    }

    // touchEnd
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd', touchPoints: [],
    });
    await page.waitForTimeout(50);
    await capture('04-after-touchEnd');

    // settle
    await page.waitForTimeout(500);
    await capture('05-after-settle');

    console.log('\n[FLICKER-DIAG] RESULTS:\n' + JSON.stringify(results, null, 2));

    // Assert: viewport must NEVER flip to >=768 during touch
    for (const r of results) {
      if (r.innerWidth >= 768 || r.docClientWidth >= 768 || r.min768 === true) {
        console.error('[FLICKER-DIAG] VIEWPORT FLIPPED TO DESKTOP at step: ' + r.label);
      }
      if (r.desktopSidebar) {
        console.error('[FLICKER-DIAG] DESKTOP SIDEBAR VISIBLE at step: ' + r.label);
      }
    }
  });
});
