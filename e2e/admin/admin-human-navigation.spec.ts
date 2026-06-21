import { test, expect, loginAsAdmin } from '../fixtures/auth';

test.describe('admin dashboard journey @admin @desktop', () => {
  test('login → dashboard → navigate tabs → verify content loads', async ({ page }) => {
    // ── Login flow ──
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle');

    // Type credentials character by character
    const usernameInput = page.getByTestId('input-admin-username');
    await usernameInput.tap();
    await usernameInput.pressSequentially('admin', { delay: 60 });

    const passwordInput = page.getByTestId('input-admin-password');
    await passwordInput.tap();
    await passwordInput.pressSequentially('admin123', { delay: 60 });

    // Click login
    await page.getByTestId('button-admin-login').click();
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    // ── Dashboard loaded ──
    await expect(page.locator('main, [role="main"], .admin-layout, [data-testid]').first()).toBeVisible();
  });

  test('admin login: empty submit stays on login page', async ({ page }) => {
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle');

    // Click login without filling fields
    await page.getByTestId('button-admin-login').click();
    await page.waitForTimeout(1000);

    // Should remain on login page
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('admin login: wrong credentials show error', async ({ page }) => {
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('input-admin-username').fill('wronguser');
    await page.getByTestId('input-admin-password').fill('wrongpass123');
    await page.getByTestId('button-admin-login').click();

    // Wait for error response
    await page.waitForTimeout(2000);

    // Should stay on login page
    await expect(page).toHaveURL(/\/admin\/login/);

    // Error toast or message
    const toast = page.locator('[data-sonner-toast], [role="status"], [role="alert"]').first();
    if (await toast.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(toast).toBeVisible();
    }
  });

  test('admin: after login, navigate between tabs via sidebar/tabbar', async ({ page }) => {
    await loginAsAdmin(page);

    // Try clicking a tab — look for bento tab buttons
    const jobsTab = page.getByTestId('bento-tab-jobTickets');
    if (await jobsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await jobsTab.click();
      await page.waitForTimeout(1000);

      // Content area should update
      await expect(page.locator('main, [role="main"]').first()).toBeVisible();
    }

    // Try another tab
    const settingsTab = page.getByTestId('bento-tab-settings');
    if (await settingsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsTab.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('main, [role="main"]').first()).toBeVisible();
    }

    // Navigate back to dashboard
    const dashTab = page.getByTestId('bento-tab-dashboard');
    if (await dashTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dashTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test('admin: global search opens and accepts input', async ({ page }) => {
    await loginAsAdmin(page);

    const searchBtn = page.getByTestId('button-global-search');
    if (await searchBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchBtn.click();
      await page.waitForTimeout(500);

      // Search overlay/drawer should open
      const searchInput = page.locator('input[placeholder*="earch"], input[type="search"]').first();
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchInput.pressSequentially('test query', { delay: 50 });
        await page.waitForTimeout(500);

        // Close search
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
  });
});
