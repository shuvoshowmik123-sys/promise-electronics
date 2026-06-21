import { test, expect } from '../fixtures/auth';

const MOBILE_VIEWPORTS = [
  { name: '390x844 (iPhone 15)', width: 390, height: 844 },
  { name: '430x932 (iPhone 15 Pro Max)', width: 430, height: 932 },
  { name: '582x918 (wide mobile)', width: 582, height: 918 },
];

const PAGES_TO_CHECK = ['/home', '/shop', '/track-order', '/support', '/login'];

for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`responsive ${viewport.name} @responsive @customer`, () => {
    for (const route of PAGES_TO_CHECK) {
      test(`${route} has no horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasOverflow).toBe(false);
      });
    }

    test('bottom dock is centered and not wider than viewport', async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/home');
      const nav = page.getByRole('navigation', { name: /customer navigation/i });
      await expect(nav).toBeVisible();

      const navBox = await nav.boundingBox();
      expect(navBox).toBeTruthy();
      if (navBox) {
        expect(navBox.x).toBeGreaterThanOrEqual(0);
        expect(navBox.x + navBox.width).toBeLessThanOrEqual(viewport.width + 1);
      }
    });

    test('hero section fits within viewport width', async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/home');
      const heading = page.getByRole('heading', { level: 1 }).first();
      const box = await heading.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
    });
  });
}

test.describe('desktop layout @desktop', () => {
  test('desktop header visible, bottom dock hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/home');
    const header = page.getByTestId('link-logo');
    await expect(header).toBeVisible();

    const nav = page.getByRole('navigation', { name: /customer navigation/i });
    await expect(nav).toBeHidden();
  });

  test('desktop nav links are visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/home');
    await expect(page.getByRole('link', { name: /^home$/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^shop$/i }).first()).toBeVisible();
  });
});
