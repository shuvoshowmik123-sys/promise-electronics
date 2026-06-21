import { test, expect, loginAsAdmin } from '../fixtures/auth';

test.describe('admin dashboard smoke @admin @desktop', () => {
  test('unauthenticated admin access redirects to login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('admin login and dashboard load', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/admin/);
    // Dashboard should have some visible content
    await expect(page.locator('main, [role="main"], .admin-layout, [data-testid]').first()).toBeVisible();
  });
});
