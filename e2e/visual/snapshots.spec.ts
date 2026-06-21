import { test, expect } from '../fixtures/auth';

test.describe('visual regression @visual @customer', () => {
  test.beforeEach(async ({ page }) => {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });
  });

  test('home hero EN', async ({ page }) => {
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    const hero = page.locator('main').first();
    await expect(hero).toHaveScreenshot('home-hero-en.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('home hero BN', async ({ page }) => {
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.setItem('customerLanguage', 'bn'));
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    const hero = page.locator('main').first();
    await expect(hero).toHaveScreenshot('home-hero-bn.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('repair wizard step 1', async ({ page }) => {
    await page.goto('/repair');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('repair-step1.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('login page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('login-page.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('404 page', async ({ page }) => {
    await page.goto('/nonexistent-12345');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('not-found.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('support page top', async ({ page }) => {
    await page.goto('/support');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('support-top.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
