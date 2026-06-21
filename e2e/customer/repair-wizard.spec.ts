import { test, expect } from '../fixtures/auth';

test.describe('customer repair wizard @customer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/repair');
    await page.waitForLoadState('networkidle');
  });

  test('wizard starts at step 1 with problem options', async ({ page }) => {
    await expect(page.getByText(/step 1|ধাপ 1/i)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const options = page.getByRole('button').filter({ hasText: /display|screen|power|sound|smart|other|ডিসপ্লে|পাওয়ার|সাউন্ড/i });
    expect(await options.count()).toBeGreaterThanOrEqual(4);
  });

  test('selecting a problem enables Continue button', async ({ page }) => {
    const problemBtn = page.getByRole('button', { name: /display|power|ডিসপ্লে|পাওয়ার/i }).first();
    await problemBtn.click();

    const continueBtn = page.getByRole('button', { name: /continue|next|পরবর্তী/i });
    await expect(continueBtn).toBeEnabled();
  });

  test('navigates to step 2 after selection', async ({ page }) => {
    await page.getByRole('button', { name: /display|power|ডিসপ্লে|পাওয়ার/i }).first().click();
    await page.getByRole('button', { name: /continue|next|পরবর্তী/i }).click();

    await expect(page.getByText(/step 2|ধাপ 2/i)).toBeVisible();
  });

  test('back button returns to previous step', async ({ page }) => {
    await page.getByRole('button', { name: /display|power|ডিসপ্লে|পাওয়ার/i }).first().click();
    await page.getByRole('button', { name: /continue|next|পরবর্তী/i }).click();
    await expect(page.getByText(/step 2|ধাপ 2/i)).toBeVisible();

    const backBtn = page.getByRole('button').filter({ has: page.locator('svg') }).first();
    await backBtn.click();
    await expect(page.getByText(/step 1|ধাপ 1/i)).toBeVisible();
  });

  test('wizard responds to Bangla language', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('customerLanguage', 'bn'));
    await page.goto('/repair');
    await page.waitForLoadState('networkidle');

    const heading = await page.getByRole('heading', { level: 1 }).textContent();
    expect(heading).toMatch(/[ঀ-৿]/);
  });

  test('no bottom dock on repair page', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: /customer navigation/i });
    await expect(nav).toBeHidden();
  });
});
