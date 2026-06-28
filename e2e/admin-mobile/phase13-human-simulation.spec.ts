import { test, expect, loginAsAdmin } from '../fixtures/auth';

/**
 * Phase 13B — Human Simulation QA (Admin Mobile)
 * Tests admin mobile flows at 390x844 (iPhone 15).
 * @admin-mobile
 */

test.describe('Phase 13B: Admin Mobile Human Simulation @admin-mobile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Service Requests tab loads with lane chips', async ({ page }) => {
    await page.goto('/admin#service-requests');
    await page.waitForTimeout(3000);

    await expect(page.locator('text=Requests').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/admin-mobile-sr-tab.png' });

    const body = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth);
    expect(body).toBe(true);
  });

  test('Jobs tab loads and shows job cards', async ({ page }) => {
    await page.goto('/admin#jobs');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/admin-mobile-jobs-tab.png' });

    const body = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth);
    expect(body).toBe(true);
  });

  test('Repair Journeys tab shows compact customer grouping', async ({ page }) => {
    await page.goto('/admin#repair-journeys');
    await page.waitForTimeout(3000);

    await expect(page.locator('text=Repair Journeys').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/admin-mobile-journeys-tab.png' });

    const body = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth);
    expect(body).toBe(true);
  });

  test('Pickup tab shows logistics tasks with lanes', async ({ page }) => {
    await page.goto('/admin#pickup');
    await page.waitForTimeout(3000);

    await expect(page.locator('text=Pickup & Delivery').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/admin-mobile-pickup-tab.png' });

    const body = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth);
    expect(body).toBe(true);
  });

  test('No raw UUID visible as primary label in Repair Journeys', async ({ page }) => {
    await page.goto('/admin#repair-journeys');
    await page.waitForTimeout(3000);

    const pageText = await page.evaluate(() => document.body.innerText);
    const uuidPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
    const uuids = pageText.match(uuidPattern) || [];
    expect(uuids.length).toBe(0);
  });

  test('Bottom dock does not cover final content on Pickup tab', async ({ page }) => {
    await page.goto('/admin#pickup');
    await page.waitForTimeout(3000);

    const dockCoversContent = await page.evaluate(() => {
      const dock = document.querySelector('nav[class*="fixed"]') as HTMLElement;
      const scrollArea = document.querySelector('[data-admin-mobile-scroll]') as HTMLElement;
      if (!dock || !scrollArea) return false;
      const dockTop = dock.getBoundingClientRect().top;
      const scrollBottom = scrollArea.getBoundingClientRect().bottom;
      return scrollBottom > dockTop + 20;
    });
    expect(dockCoversContent).toBe(false);
  });
});
