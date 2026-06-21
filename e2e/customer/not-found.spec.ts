import { test, expect } from '../fixtures/auth';

test.describe('customer 404 page @customer', () => {
  test('shows 404 with quick links', async ({ page }) => {
    await page.goto('/nonexistent-route-12345');
    await page.waitForLoadState('networkidle');
    const quickLinks = page.getByTestId('mobile-quick-links');
    await expect(quickLinks).toBeVisible();
    await expect(page.getByTestId('mobile-go-back')).toBeVisible();
  });

  test('quick links navigate correctly', async ({ page }) => {
    await page.goto('/nonexistent-route-12345');
    await page.waitForLoadState('networkidle');
    const quickLinks = page.getByTestId('mobile-quick-links');
    const firstLink = quickLinks.locator('div[class*="cursor-pointer"]').first();
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).not.toContain('nonexistent');
  });

  test('Bangla mode translates 404 page', async ({ page }) => {
    await page.goto('/nonexistent-route-12345');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.setItem('customerLanguage', 'bn'));
    await page.goto('/nonexistent-route-12345');
    await page.waitForLoadState('networkidle');
    const heading = await page.getByRole('heading', { level: 1 }).first().textContent();
    expect(heading).toMatch(/[ঀ-৿]/);
  });
});
