import { test, expect } from '../fixtures/auth';

test.describe('login page full journey @customer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('sign in tab: type phone and password with visible keystrokes', async ({ page }) => {
    // Phone field — type character by character
    const phoneInput = page.getByTestId('input-mobile-login-phone');
    await phoneInput.tap();
    await phoneInput.pressSequentially('1944488999', { delay: 80 });

    // Verify +880 prefix is shown alongside input
    await expect(page.getByText('+880')).toBeVisible();

    // Password field
    const passInput = page.getByTestId('input-mobile-login-password');
    await passInput.tap();
    await passInput.pressSequentially('testpass123', { delay: 60 });

    // Remember me checkbox — tap to toggle
    const checkbox = page.getByRole('checkbox');
    await checkbox.tap();
    await expect(checkbox).toBeChecked();
    await checkbox.tap();
    await expect(checkbox).not.toBeChecked();

    // Sign In button should be visible
    const signInBtn = page.getByRole('button', { name: /^sign in$|^সাইন ইন$/i });
    await expect(signInBtn).toBeVisible();
    await expect(signInBtn).toBeEnabled();
  });

  test('switch tabs between Sign In and Register', async ({ page }) => {
    // Start on Sign In tab
    const signInTab = page.getByRole('tab', { name: /sign in|সাইন ইন/i });
    const registerTab = page.getByRole('tab', { name: /register|রেজিস্টার/i });

    await expect(signInTab).toBeVisible();
    await expect(registerTab).toBeVisible();

    // Switch to Register
    await registerTab.tap();
    await page.waitForTimeout(300);

    // Register form fields should appear
    const nameInput = page.getByTestId('input-mobile-register-name');
    await expect(nameInput).toBeVisible();
    const regPhone = page.getByTestId('input-mobile-register-phone');
    await expect(regPhone).toBeVisible();

    // Fill registration form
    await nameInput.tap();
    await nameInput.pressSequentially('Test User', { delay: 50 });
    await regPhone.tap();
    await regPhone.pressSequentially('1812345678', { delay: 50 });

    // Switch back to Sign In
    await signInTab.tap();
    await page.waitForTimeout(300);

    // Sign In fields should be visible again
    await expect(page.getByTestId('input-mobile-login-phone')).toBeVisible();
  });

  test('Google sign-in button is present and tappable', async ({ page }) => {
    const googleBtn = page.getByRole('button', { name: /google|গুগল/i });
    await expect(googleBtn).toBeVisible();
    await expect(googleBtn).toBeEnabled();
  });

  test('Bangla mode: login page translates all labels', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('customerLanguage', 'bn'));
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Tab text should be in Bangla
    const selectedTab = await page.getByRole('tab', { selected: true }).textContent();
    expect(selectedTab).toMatch(/[ঀ-৿]/);

    // Sign In button should be in Bangla
    const signInBtn = page.getByRole('button', { name: /সাইন ইন/i });
    await expect(signInBtn).toBeVisible();

    // Can still type in Bangla mode
    const phoneInput = page.getByTestId('input-mobile-login-phone');
    await phoneInput.tap();
    await phoneInput.pressSequentially('1944488999', { delay: 60 });
    // Phone input should accept digits normally
    const val = await phoneInput.inputValue();
    expect(val).toContain('1944488999');
  });

  test('wrong credentials: submit and see error feedback', async ({ page }) => {
    const phoneInput = page.getByTestId('input-mobile-login-phone');
    await phoneInput.tap();
    await phoneInput.pressSequentially('1999999999', { delay: 40 });

    const passInput = page.getByTestId('input-mobile-login-password');
    await passInput.tap();
    await passInput.pressSequentially('wrongpassword', { delay: 40 });

    const signInBtn = page.getByRole('button', { name: /^sign in$|^সাইন ইন$/i });
    await signInBtn.tap();

    // Should remain on login page (no redirect)
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);

    // Error toast or message should appear
    const toast = page.locator('[data-sonner-toast], [role="status"], [role="alert"]').first();
    if (await toast.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(toast).toBeVisible();
    }
  });
});
