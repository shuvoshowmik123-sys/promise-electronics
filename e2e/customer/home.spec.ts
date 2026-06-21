import { test, expect, setLanguage } from '../fixtures/auth';

test.describe('customer home page @customer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
  });

  test('hero section renders with CTA buttons', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: /book repair|রিপেয়ার/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /track|ট্র্যাক/i }).first()).toBeVisible();
  });

  test('quick actions grid has action cards', async ({ page }) => {
    const bookRepairCard = page.getByRole('link', { name: /book repair.*schedule/i });
    await expect(bookRepairCard).toBeVisible();
    const trackJobCard = page.getByRole('link', { name: /track job.*status/i });
    await expect(trackJobCard).toBeVisible();
  });

  test('what\'s wrong section shows problem shortcuts', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /what.*wrong/i });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();

    const repairLinks = page.getByRole('link', { name: /power|picture|screen|sound|wifi|lines/i });
    expect(await repairLinks.count()).toBeGreaterThanOrEqual(4);
  });

  test('why choose us section renders', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /why choose/i });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();
  });

  test('language toggle switches to Bangla and back', async ({ page }) => {
    const toggleBtn = page.getByRole('button', { name: /switch language/i });
    await expect(toggleBtn).toBeVisible();

    const heroText1 = await page.getByRole('heading', { level: 1 }).first().textContent();
    await toggleBtn.click();
    await page.waitForTimeout(300);
    const heroText2 = await page.getByRole('heading', { level: 1 }).first().textContent();
    expect(heroText2).not.toBe(heroText1);

    await page.getByRole('button', { name: /switch language/i }).click();
    await page.waitForTimeout(300);
    const heroText3 = await page.getByRole('heading', { level: 1 }).first().textContent();
    expect(heroText3).toBe(heroText1);
  });

  test('language persists across navigation', async ({ page }) => {
    await page.getByRole('button', { name: /switch language/i }).click();
    await page.waitForTimeout(300);

    const nav = page.getByRole('navigation', { name: /customer navigation/i });
    await nav.getByRole('link', { name: /শপ|shop/i }).click();
    await page.waitForURL(/\/shop/);

    const dockLabels = await nav.getByRole('button').allTextContents();
    const hasAnyBangla = dockLabels.some(t => /[ঀ-৿]/.test(t));
    expect(hasAnyBangla).toBe(true);
  });

  test('get a quick quote link navigates correctly', async ({ page }) => {
    const quoteLink = page.getByRole('link', { name: /quick quote/i });
    await quoteLink.scrollIntoViewIfNeeded();
    await quoteLink.click();
    await expect(page).toHaveURL(/\/get-quote/);
  });
});
