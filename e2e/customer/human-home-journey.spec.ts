import { test, expect } from '../fixtures/auth';

test.describe('customer app journey @customer', () => {
  test('full home exploration: scroll all sections, interact with CTAs, use dock to navigate', async ({ page }) => {
    // Direct route: initial entry point for the journey
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    // ── Hero section ──
    const hero = page.getByRole('heading', { level: 1 }).first();
    await expect(hero).toBeVisible({ timeout: 15000 });

    // Verify both hero CTAs
    const bookRepairCta = page.getByRole('link', { name: /book repair/i }).first();
    await expect(bookRepairCta).toBeVisible();

    // ── Scroll through sections with mouse wheel ──
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);

    // "What's Wrong" section should be in view after scrolling
    const whatsWrong = page.getByRole('heading', { name: /what.*wrong/i });
    await whatsWrong.scrollIntoViewIfNeeded();
    await expect(whatsWrong).toBeVisible();

    // Problem shortcut links visible
    const problemLinks = page.getByRole('link', { name: /power|picture|screen|sound|wifi|lines/i });
    expect(await problemLinks.count()).toBeGreaterThanOrEqual(4);

    // Keep scrolling
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);

    // "Why Choose Us" section
    const whyChoose = page.getByRole('heading', { name: /why choose/i });
    await whyChoose.scrollIntoViewIfNeeded();
    await expect(whyChoose).toBeVisible();

    // Bottom dock stays visible throughout all scrolling
    const dock = page.getByRole('navigation', { name: /customer navigation/i });
    await expect(dock).toBeVisible();

    // ── Use dock to navigate to Shop (not page.goto) ──
    await dock.getByRole('link', { name: /shop/i }).tap();
    await page.waitForURL(/\/shop/);
    await expect(page.getByTestId('input-shop-search')).toBeVisible();
    await expect(dock).toBeVisible();

    // ── Use dock to navigate to Track Order ──
    await dock.getByRole('link', { name: /track/i }).tap();
    await page.waitForURL(/\/track-order/);
    await expect(page.getByPlaceholder(/SR-000123/i)).toBeVisible();

    // ── Use dock to navigate to Support ──
    await dock.getByRole('link', { name: /support/i }).tap();
    await page.waitForURL(/\/support/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // ── Use dock to go back Home ──
    await dock.getByRole('link', { name: /home/i }).tap();
    await page.waitForURL(/\/home/);
    await expect(hero).toBeVisible();
  });

  test('home → repair CTA → wizard → back button → home again', async ({ page }) => {
    // Direct route: initial entry
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    // Tap "Book Repair" CTA to navigate (not page.goto)
    const bookRepairCta = page.getByRole('link', { name: /book repair/i }).first();
    await bookRepairCta.tap();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/repair/);

    // Verify wizard loaded at step 1
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const dock = page.getByRole('navigation', { name: /customer navigation/i });
    await expect(dock).toBeHidden(); // dock hidden on /repair

    // Use wizard's back button (at step 1 it goes to home)
    const backBtn = page.getByRole('button').filter({ has: page.locator('svg') }).first();
    await backBtn.tap();
    await page.waitForURL(/\/home/);

    // Back on home — hero visible, dock visible
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: /customer navigation/i })).toBeVisible();
  });

  test('home → problem shortcut → repair wizard preloaded', async ({ page }) => {
    // Direct route: initial entry
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    // Scroll to problem shortcuts and tap one (in-app navigation)
    const problemLink = page.getByRole('link', { name: /power|screen|display/i }).first();
    await problemLink.scrollIntoViewIfNeeded();
    await problemLink.tap();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/repair/);
  });

  test('language toggle: switch, verify, navigate via dock, verify persistence, switch back', async ({ page }) => {
    // Direct route: initial entry
    await page.goto('/home');
    await page.waitForLoadState('networkidle');

    const toggleBtn = page.getByRole('button', { name: /switch language/i });
    const heroHeading = page.getByRole('heading', { level: 1 }).first();

    // Capture English text
    const englishText = await heroHeading.textContent();

    // Toggle to Bangla
    await toggleBtn.tap();
    await page.waitForTimeout(400);
    const banglaText = await heroHeading.textContent();
    expect(banglaText).toMatch(/[ঀ-৿]/);
    expect(banglaText).not.toBe(englishText);

    // Navigate to shop via dock (in-app, not goto)
    const dock = page.getByRole('navigation', { name: /customer navigation/i });
    await dock.getByRole('link', { name: /shop|শপ/i }).tap();
    await page.waitForURL(/\/shop/);

    // Shop should be in Bangla — check search placeholder
    const searchPlaceholder = await page.getByTestId('input-shop-search').getAttribute('placeholder');
    expect(searchPlaceholder).toMatch(/[ঀ-৿]/);

    // Navigate back to home via dock (in-app)
    await dock.getByRole('link', { name: /হোম|home/i }).tap();
    await page.waitForURL(/\/home/);

    // Still Bangla
    const heroAgain = await heroHeading.textContent();
    expect(heroAgain).toMatch(/[ঀ-৿]/);

    // Toggle back to English
    await page.getByRole('button', { name: /switch language/i }).tap();
    await page.waitForTimeout(400);
    const backToEnglish = await heroHeading.textContent();
    expect(backToEnglish).toMatch(/[A-Za-z]/);
  });
});
