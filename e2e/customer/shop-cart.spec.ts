import { test, expect } from '../fixtures/auth';

test.describe('customer shop @customer', () => {
  test('shop page loads with search and filters', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('textbox', { name: /search/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /filter/i })).toBeVisible();
  });

  test('sort dropdown has options', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');
    const sort = page.getByRole('combobox');
    await expect(sort).toBeVisible();
    const options = await sort.locator('option').allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(2);
  });

  test('Bangla mode translates shop labels', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.setItem('customerLanguage', 'bn'));
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');

    const searchInput = page.getByRole('textbox');
    const placeholder = await searchInput.getAttribute('placeholder');
    expect(placeholder).toMatch(/[ঀ-৿]/);
  });
});

test.describe('customer cart @customer', () => {
  test('empty cart shows empty state', async ({ page }) => {
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue|shopping|browse|শপিং/i })).toBeVisible();
  });

  test('empty cart Bangla mode', async ({ page }) => {
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.setItem('customerLanguage', 'bn'));
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');
    const heading = await page.getByRole('heading', { level: 2 }).textContent();
    expect(heading).toMatch(/[ঀ-৿]/);
  });
});
