import { test, expect } from '../fixtures/auth';

test.describe('customer login page @customer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('renders sign in and register tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /sign in|সাইন ইন/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /register|রেজিস্টার/i })).toBeVisible();
  });

  test('sign in tab shows phone and password fields', async ({ page }) => {
    await expect(page.getByTestId('input-mobile-login-phone')).toBeVisible();
    await expect(page.getByTestId('input-mobile-login-password')).toBeVisible();
  });

  test('sign in button exists', async ({ page }) => {
    const signInBtn = page.getByRole('button', { name: /^sign in$|^সাইন ইন$/i });
    await expect(signInBtn).toBeVisible();
  });

  test('google sign-in button exists', async ({ page }) => {
    await expect(page.getByRole('button', { name: /google|গুগল/i })).toBeVisible();
  });

  test('register tab switches to registration form', async ({ page }) => {
    await page.getByRole('tab', { name: /register|রেজিস্টার/i }).click();
    const registerPanel = page.getByRole('tabpanel');
    await expect(registerPanel).toBeVisible();
  });

  test('remember me checkbox exists', async ({ page }) => {
    await expect(page.getByRole('checkbox')).toBeVisible();
  });

  test('Bangla mode translates form labels', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('customerLanguage', 'bn'));
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    const tabText = await page.getByRole('tab', { selected: true }).textContent();
    expect(tabText).toMatch(/[ঀ-৿]/);
  });
});
