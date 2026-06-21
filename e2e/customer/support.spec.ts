import { test, expect } from '../fixtures/auth';

test.describe('customer support page @customer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/support');
    await page.waitForLoadState('networkidle');
  });

  test('renders contact action buttons', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/call/i).first()).toBeVisible();
    await expect(page.getByText(/whatsapp/i)).toBeVisible();
    await expect(page.getByText(/email/i).first()).toBeVisible();
  });

  test('message form has required fields', async ({ page }) => {
    const nameInput = page.locator('input[name="name"]');
    await nameInput.scrollIntoViewIfNeeded();
    await expect(nameInput).toBeVisible();
    await expect(page.locator('textarea[name="message"]')).toBeVisible();
  });

  test('FAQ accordion opens and closes', async ({ page }) => {
    const faqHeading = page.getByRole('heading', { name: /faq|frequently/i });
    await faqHeading.scrollIntoViewIfNeeded();
    await expect(faqHeading).toBeVisible();

    const firstFaqTrigger = page.getByRole('button', { name: /track my repair|warranty period/i }).first();
    await firstFaqTrigger.click();
    const faqContent = page.locator('[data-state="open"]').last();
    await expect(faqContent).toBeVisible();

    await firstFaqTrigger.click();
    await expect(faqContent).toBeHidden();
  });

  test('send button is visible and labeled', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: /send/i });
    await sendBtn.scrollIntoViewIfNeeded();
    await expect(sendBtn).toBeVisible();
  });

  test('Bangla mode translates fixed labels', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('customerLanguage', 'bn'));
    await page.goto('/support');
    await page.waitForLoadState('networkidle');
    const heading = await page.getByRole('heading', { level: 1 }).textContent();
    expect(heading).toMatch(/[ঀ-৿]/);
  });
});
