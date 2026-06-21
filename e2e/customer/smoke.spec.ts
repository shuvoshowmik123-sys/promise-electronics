import { test, expect } from '../fixtures/auth';
import { CUSTOMER_ROUTES, CORE_CUSTOMER_ROUTES, HIDE_DOCK_ROUTES } from '../fixtures/routes';

test.describe('customer smoke @customer', () => {
  for (const route of CORE_CUSTOMER_ROUTES) {
    test(`${route} loads without crash`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(500);
      await expect(page.locator('main')).toBeVisible();
    });
  }

  test('bottom dock visible on standard pages', async ({ page }) => {
    await page.goto('/home');
    const nav = page.getByRole('navigation', { name: /customer navigation/i });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(5);
  });

  test('bottom dock hidden on /repair', async ({ page }) => {
    await page.goto('/repair');
    const nav = page.getByRole('navigation', { name: /customer navigation/i });
    await expect(nav).toBeHidden();
  });

  test('bottom dock hidden on /get-quote', async ({ page }) => {
    await page.goto('/get-quote');
    const nav = page.getByRole('navigation', { name: /customer navigation/i });
    await expect(nav).toBeHidden();
  });

  test('dock navigation works between pages', async ({ page }) => {
    await page.goto('/home');
    const nav = page.getByRole('navigation', { name: /customer navigation/i });

    await nav.getByRole('link', { name: /shop/i }).click();
    await expect(page).toHaveURL(/\/shop/);

    await nav.getByRole('link', { name: /track/i }).click();
    await expect(page).toHaveURL(/\/track-order/);

    await nav.getByRole('link', { name: /home/i }).click();
    await expect(page).toHaveURL(/\/home/);
  });

  test('unauthenticated checkout shows login gate', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('unauthenticated profile redirects to login', async ({ page }) => {
    await page.goto('/my-profile');
    await expect(page).toHaveURL(/\/login/);
  });
});
