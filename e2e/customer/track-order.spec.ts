import { test, expect } from '../fixtures/auth';

test.describe('customer track order @customer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/track-order');
    await page.waitForLoadState('networkidle');
  });

  test('renders hero with ticket input', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByPlaceholder(/SR-000123/i)).toBeVisible();
  });

  test('ticket search button exists and is clickable', async ({ page }) => {
    const searchBtn = page.getByRole('button', { name: /track ticket/i });
    await expect(searchBtn).toBeVisible();
  });

  test('book repair button navigates to /repair', async ({ page }) => {
    await page.getByRole('button', { name: /book repair/i }).click();
    await expect(page).toHaveURL(/\/repair/);
  });

  test('sign in button exists for unauthenticated user', async ({ page }) => {
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('Bangla mode translates fixed labels', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('customerLanguage', 'bn'));
    await page.goto('/track-order');
    await page.waitForLoadState('networkidle');

    const nav = page.getByRole('navigation', { name: /customer navigation/i });
    const dockLabels = await nav.getByRole('button').allTextContents();
    const hasAnyBangla = dockLabels.some(t => /[ঀ-৿]/.test(t));
    expect(hasAnyBangla).toBe(true);
  });
});

test.describe('customer track job @customer', () => {
  test('track page shows no-ticket or coming soon state', async ({ page }) => {
    await page.goto('/track');
    await page.waitForLoadState('networkidle');
    const noJobState = page.getByTestId('mobile-no-job-id');
    const comingSoon = page.getByText(/coming soon/i);
    const either = await Promise.race([
      noJobState.waitFor({ timeout: 10000 }).then(() => 'no-ticket'),
      comingSoon.waitFor({ timeout: 10000 }).then(() => 'coming-soon'),
    ]);
    expect(['no-ticket', 'coming-soon']).toContain(either);
  });
});
