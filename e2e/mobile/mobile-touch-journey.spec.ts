import { test, expect } from '../fixtures/auth';
import { swipeUp, tapLikeHuman, typeLikeHuman } from '../fixtures/gestures';

test.describe('mobile navigation and touch journey @customer @responsive', () => {
  test('full mobile session: home → scroll → dock to each page → scroll each → dock back', async ({ page }) => {
    // Direct route: session start
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    const dock = page.getByRole('navigation', { name: /customer navigation/i });

    // ── Home: scroll down through sections ──
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await swipeUp(page, 350);
    }
    // Dock stays visible after scrolling
    await expect(dock).toBeVisible();

    // ── Dock → Shop ──
    await dock.getByRole('link', { name: /shop/i }).tap();
    await page.waitForURL(/\/shop/);
    await expect(page.getByTestId('input-shop-search')).toBeVisible();

    // Scroll shop products
    for (let i = 0; i < 3; i++) {
      await swipeUp(page, 300);
    }
    await expect(dock).toBeVisible();

    // ── Dock → Track ──
    await dock.getByRole('link', { name: /track/i }).tap();
    await page.waitForURL(/\/track-order/);
    await expect(page.getByPlaceholder(/SR-000123/i)).toBeVisible();

    // ── Dock → Support ──
    await dock.getByRole('link', { name: /support/i }).tap();
    await page.waitForURL(/\/support/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Scroll support page
    for (let i = 0; i < 3; i++) {
      await swipeUp(page, 300);
    }
    await expect(dock).toBeVisible();

    // ── Dock → Home (full circle) ──
    await dock.getByRole('link', { name: /home/i }).tap();
    await page.waitForURL(/\/home/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('repair page: dock hidden, wizard footer stays fixed during scroll', async ({ page }) => {
    // Direct route: repair has no dock path, need direct entry
    await page.goto('/repair');
    await page.waitForLoadState('networkidle');

    // Dock should be hidden
    await expect(page.getByRole('navigation', { name: /customer navigation/i })).toBeHidden();

    // Wizard footer buttons should be visible
    const continueBtn = page.getByRole('button', { name: /continue|পরবর্তী/i });
    await expect(continueBtn).toBeVisible();

    // Select a problem to make content taller
    await page.locator('button').filter({ hasText: /No Display/i }).first().tap();

    // Scroll — footer should stay fixed
    await swipeUp(page, 300);
    await expect(continueBtn).toBeVisible();

    // Use wizard back button to return home (in-app navigation)
    const backBtn = page.getByRole('button').filter({ has: page.locator('svg') }).first();
    await backBtn.tap();
    await page.waitForURL(/\/home/);

    // Dock should reappear on home
    await expect(page.getByRole('navigation', { name: /customer navigation/i })).toBeVisible();
  });

  test('support form: dock does not cover input fields while filling', async ({ page }) => {
    // Direct route: initial entry for form testing
    await page.goto('/support');
    await page.waitForLoadState('networkidle');

    const dock = page.getByRole('navigation', { name: /customer navigation/i });
    const dockBox = await dock.boundingBox();

    // Scroll to form
    const nameInput = page.locator('input[name="name"]');
    await nameInput.scrollIntoViewIfNeeded();

    // Check input is not covered by dock
    const inputBox = await nameInput.boundingBox();
    expect(inputBox).toBeTruthy();
    expect(dockBox).toBeTruthy();
    if (inputBox && dockBox) {
      expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(dockBox.y + 10);
    }

    // Fill the input — should work without dock interference
    await typeLikeHuman(nameInput, 'Test User', 80);
    await expect(nameInput).toHaveValue('Test User');

    // Scroll to message textarea
    const messageArea = page.locator('textarea[name="message"]');
    await messageArea.scrollIntoViewIfNeeded();
    const messageBox = await messageArea.boundingBox();
    if (messageBox && dockBox) {
      expect(messageBox.y + messageBox.height).toBeLessThanOrEqual(dockBox.y + 10);
    }
  });

  test('track order: type ticket number and tap track', async ({ page }) => {
    // Direct route: initial entry
    await page.goto('/track-order');
    await page.waitForLoadState('networkidle');

    const ticketInput = page.getByPlaceholder(/SR-000123/i);
    await typeLikeHuman(ticketInput, 'SR-000456', 80);
    await expect(ticketInput).toHaveValue('SR-000456');

    const trackBtn = page.getByRole('button', { name: /track ticket/i });
    await tapLikeHuman(trackBtn, page);
    await page.waitForTimeout(1000);
    // Result or not-found state — both valid
  });

  test('keyboard tab reaches important controls on login', async ({ page }) => {
    // Direct route: accessibility test for specific page
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Tab through form controls
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }

    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.tagName.toLowerCase() : null;
    });
    expect(['input', 'button', 'a', 'select', 'textarea']).toContain(focused);
  });

  test('404 page: tap quick link to navigate back into app', async ({ page }) => {
    // Direct route: intentionally hit a nonexistent page
    await page.goto('/nonexistent-test-page');
    await page.waitForLoadState('networkidle');

    const quickLinks = page.getByTestId('mobile-quick-links');
    await expect(quickLinks).toBeVisible();

    // Tap first quick link to navigate back (in-app)
    const firstLink = quickLinks.locator('div[class*="cursor-pointer"]').first();
    await firstLink.tap();
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('nonexistent');
  });

  test('multi-page journey: home → support FAQ → form → dock home → repair CTA', async ({ page }) => {
    // Direct route: initial entry
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    const dock = page.getByRole('navigation', { name: /customer navigation/i });

    // ── Dock → Support (in-app) ──
    await dock.getByRole('link', { name: /support/i }).tap();
    await page.waitForURL(/\/support/);

    // Scroll to FAQ section
    const faqHeading = page.getByRole('heading', { name: /faq|frequently/i });
    await faqHeading.scrollIntoViewIfNeeded();

    // Open FAQ item
    const faqTrigger = page.getByRole('button', { name: /track|warranty|repair|cost/i }).first();
    if (await faqTrigger.isVisible()) {
      await faqTrigger.tap();
      await page.waitForTimeout(300);
    }

    // Scroll to form, type a name
    const nameField = page.locator('input[name="name"]');
    await nameField.scrollIntoViewIfNeeded();
    await typeLikeHuman(nameField, 'Quick Test', 40);

    // ── Dock → Home (in-app) ──
    await dock.getByRole('link', { name: /home/i }).tap();
    await page.waitForURL(/\/home/);

    // ── Tap Book Repair CTA (in-app) ──
    const repairCta = page.getByRole('link', { name: /book repair/i }).first();
    await repairCta.tap();
    await page.waitForURL(/\/repair/);

    // Wizard loaded
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Dock hidden on repair
    await expect(dock).toBeHidden();

    // Use wizard back to return home
    await page.getByRole('button').filter({ has: page.locator('svg') }).first().tap();
    await page.waitForURL(/\/home/);

    // Dock visible again
    await expect(dock).toBeVisible();
  });
});
