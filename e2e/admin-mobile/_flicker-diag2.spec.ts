import { test, loginAsAdmin } from '../fixtures/auth';

/**
 * Diagnostic phase 2: capture the MainContentWrapper transform/height changes
 * during chrome hide to prove the "desktop flash" is actually the chrome
 * compensation animation.
 * @admin-mobile
 */
test.describe('flicker diagnostic phase 2 @admin-mobile', () => {
  test('capture content wrapper state during chrome hide transition', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin#inventory');
    await page.waitForTimeout(2000);

    const captureWrapper = (label: string) => page.evaluate((label: string) => {
      // Find the MainContentWrapper inner div (has translate-y transition)
      const wrapper = document.querySelector('[class*="max-w-\\[1600px\\]"][class*="transition-transform"]') as HTMLElement;
      if (!wrapper) return { label, found: false };
      const s = getComputedStyle(wrapper);
      const r = wrapper.getBoundingClientRect();
      const parent = wrapper.parentElement;
      const ps = parent ? getComputedStyle(parent) : null;
      return {
        label,
        found: true,
        wrapperTransform: s.transform,
        wrapperTranslateClass: [...wrapper.classList].find(c => c.includes('translate-y')) || 'none',
        wrapperHeight: s.height,
        wrapperTop: Math.round(r.top),
        wrapperBottom: Math.round(r.bottom),
        parentPaddingTop: ps?.paddingTop ?? 'n/a',
        parentHeight: ps?.height ?? 'n/a',
      };
    }, label);

    const results: any[] = [];
    results.push(await captureWrapper('01-rest'));

    // Trigger chrome hide via the app's own event
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('admin:mobile-chrome', { detail: { hidden: true } })));
    // Capture mid-transition (50ms into 200ms transition)
    await page.waitForTimeout(50);
    results.push(await captureWrapper('02-mid-transition'));
    // Capture end of transition
    await page.waitForTimeout(200);
    results.push(await captureWrapper('03-after-transition'));

    // Restore
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('admin:mobile-chrome', { detail: { hidden: false } })));
    await page.waitForTimeout(300);
    results.push(await captureWrapper('04-restored'));

    console.log('\n[FLICKER-DIAG-2] WRAPPER STATE:\n' + JSON.stringify(results, null, 2));
  });
});
