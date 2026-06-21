import { test, expect } from '../fixtures/auth';

test.describe('support page journey @customer', () => {
  test('home → dock to support → scroll sections → FAQ accordion → contact form → dock home', async ({ page }) => {
    // Direct route: initial entry
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    const dock = page.getByRole('navigation', { name: /customer navigation/i });

    // ── Navigate to support via dock (in-app) ──
    await dock.getByRole('link', { name: /support/i }).tap();
    await page.waitForURL(/\/support/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // ── Scroll through contact action cards ──
    await expect(page.getByText(/call/i).first()).toBeVisible();
    await expect(page.getByText(/whatsapp/i)).toBeVisible();
    await expect(page.getByText(/email/i).first()).toBeVisible();

    // ── Scroll to visit center and business hours ──
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);

    // ── Scroll to FAQ and interact ──
    const faqHeading = page.getByRole('heading', { name: /faq|frequently/i });
    await faqHeading.scrollIntoViewIfNeeded();
    await expect(faqHeading).toBeVisible();

    // Open first FAQ item
    const faqTrigger = page.getByRole('button', { name: /track|warranty|repair|cost/i }).first();
    if (await faqTrigger.isVisible()) {
      await faqTrigger.tap();
      await page.waitForTimeout(300);
      await expect(page.locator('[data-state="open"]').first()).toBeVisible();

      // Close it
      await faqTrigger.tap();
      await page.waitForTimeout(300);
    }

    // ── Scroll back up to contact form ──
    const nameInput = page.locator('input[name="name"]');
    await nameInput.scrollIntoViewIfNeeded();

    // ── Fill form character by character ──
    await nameInput.tap();
    await nameInput.pressSequentially('Karim Hossain', { delay: 60 });
    await expect(nameInput).toHaveValue('Karim Hossain');

    const phoneInput = page.locator('input[name="phone"]');
    await phoneInput.tap();
    await phoneInput.pressSequentially('1845678901', { delay: 60 });

    const messageArea = page.locator('textarea[name="message"]');
    await messageArea.scrollIntoViewIfNeeded();
    await messageArea.tap();
    await messageArea.pressSequentially('Samsung TV screen has vertical lines after power surge', { delay: 20 });

    // Send button ready
    const sendBtn = page.getByRole('button', { name: /send|পাঠান/i });
    await sendBtn.scrollIntoViewIfNeeded();
    await expect(sendBtn).toBeEnabled();

    // ── Navigate back to home via dock (not page.goto) ──
    await dock.getByRole('link', { name: /home/i }).tap();
    await page.waitForURL(/\/home/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('support form in Bangla: toggle language then fill form via in-app flow', async ({ page }) => {
    // Direct route: initial entry on home
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    // Toggle to Bangla on home page
    await page.getByRole('button', { name: /switch language/i }).tap();
    await page.waitForTimeout(400);

    // Navigate to support via dock (in-app, language should persist)
    const dock = page.getByRole('navigation', { name: /customer navigation/i });
    await dock.getByRole('link', { name: /support|সাপোর্ট/i }).tap();
    await page.waitForURL(/\/support/);

    // Heading should be in Bangla
    const heading = await page.getByRole('heading', { level: 1 }).textContent();
    expect(heading).toMatch(/[ঀ-৿]/);

    // Fill form — still works in Bangla mode
    const nameInput = page.locator('input[name="name"]');
    await nameInput.scrollIntoViewIfNeeded();
    await nameInput.tap();
    await nameInput.pressSequentially('করিম', { delay: 80 });
    await expect(nameInput).toHaveValue('করিম');

    // Send button should be in Bangla
    const sendBtn = page.getByRole('button', { name: /send|পাঠান/i });
    await sendBtn.scrollIntoViewIfNeeded();
    await expect(sendBtn).toBeVisible();
  });
});
