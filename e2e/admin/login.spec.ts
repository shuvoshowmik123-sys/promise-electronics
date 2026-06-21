import { test, expect } from '../fixtures/auth';

test.describe('admin login @admin @desktop', () => {
  test('admin login page renders', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByTestId('input-admin-username')).toBeVisible();
    await expect(page.getByTestId('input-admin-password')).toBeVisible();
    await expect(page.getByTestId('button-admin-login')).toBeVisible();
  });

  test('empty submit shows validation', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByTestId('input-admin-username').fill('');
    await page.getByTestId('input-admin-password').fill('');
    await page.getByTestId('button-admin-login').click();

    // Should stay on login page or show error
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('wrong credentials show error', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByTestId('input-admin-username').fill('wronguser');
    await page.getByTestId('input-admin-password').fill('wrongpass');
    await page.getByTestId('button-admin-login').click();

    // Should remain on login or show toast/error
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
