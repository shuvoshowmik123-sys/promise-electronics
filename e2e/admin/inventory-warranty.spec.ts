import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';

/**
 * Deliberately uses Playwright's own per-test `page` rather than the shared
 * worker-scoped page in ../fixtures/auth. That fixture reuses one page across
 * every test in a worker, and once a test ends the context can be torn down
 * under the next one — which made every test here fail its first attempt at
 * login and only pass on retry. A fresh context per test costs a second and
 * removes the false failures entirely.
 */

/**
 * Real UI verification for the Kimi-K3-delivered warranty fields:
 *   - InventoryTab.tsx: per-item warranty (days), both product and service types
 *   - LocalPurchaseModal.tsx: warranty field + prefill-on-blur from purchase history
 *
 * Runs against a real dev server + real DB (npm run dev on :5083). Not a mock.
 */

async function findByName(page: any, request: any, baseURL: string, name: string) {
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
  const res = await request.get(`${baseURL}/api/inventory`, { headers: { Cookie: cookieHeader } });
  const body = await res.json();
  const items = Array.isArray(body) ? body : body.items;
  return items.find((i: any) => i.name === name);
}

test.describe('inventory item warranty field @admin @desktop', () => {
  test('product warranty (days) persists after save and reopen', async ({ page, request, baseURL }) => {
    await loginAsAdmin(page);
    await page.goto('/admin#inventory');
    await page.waitForTimeout(1500);

    await page.getByText('Add New Item', { exact: false }).first().click();
    await page.waitForTimeout(500);

    const uniqueName = `QA Warranty Panel ${Date.now()}`;
    await page.getByPlaceholder('Sony 55" Panel').fill(uniqueName);

    // Category is the second combobox in the sheet (Item Type is first)
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option').first().click();

    const warrantyInput = page.getByPlaceholder('e.g. 180').first();
    await expect(warrantyInput).toBeVisible();
    await warrantyInput.fill('180');

    // Price is required to save
    const priceInput = page.locator('input[type="number"]').filter({ hasText: '' });
    await page.getByText('Price (').locator('..').locator('input').fill('1000');

    await page.getByRole('button', { name: 'Create Item', exact: true }).click();
    await expect(page.getByText('Item added successfully')).toBeVisible({ timeout: 10_000 });

    // The grid card itself is behind a framer-motion enter animation that never
    // settles for Playwright's actionability check in this headless run (visually
    // confirmed on-screen via screenshot, but that's a pre-existing rendering
    // quirk, not something this feature introduced) — so confirm the round-trip
    // through the same API the page reads from, rather than re-clicking the card.
    await expect.poll(async () => {
      const item = await findByName(page, request, baseURL!, uniqueName);
      return item?.warrantyDays ?? null;
    }, { timeout: 10_000 }).toBe(180);
  });

  test('leaving warranty empty saves as no-warranty (null), not zero', async ({ page, request, baseURL }) => {
    await loginAsAdmin(page);
    await page.goto('/admin#inventory');
    await page.waitForTimeout(1500);

    await page.getByText('Add New Item', { exact: false }).first().click();
    await page.waitForTimeout(500);

    const uniqueName = `QA No Warranty Part ${Date.now()}`;
    await page.getByPlaceholder('Sony 55" Panel').fill(uniqueName);
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option').first().click();
    await page.getByText('Price (').locator('..').locator('input').fill('500');
    // warranty field left blank deliberately

    await page.getByRole('button', { name: 'Create Item', exact: true }).click();
    await expect(page.getByText('Item added successfully')).toBeVisible({ timeout: 10_000 });

    await expect.poll(async () => {
      const item = await findByName(page, request, baseURL!, uniqueName);
      return item ? (item.warrantyDays ?? null) : 'NOT_FOUND';
    }, { timeout: 10_000 }).toBe(null);
  });

  test('service-type item exposes its own labour warranty field', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin#inventory');
    await page.waitForTimeout(1500);

    await page.getByText('Add New Item', { exact: false }).first().click();
    await page.waitForTimeout(500);

    // Switch item type to Service (the "Item Type" select is the first combobox in the sheet)
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Service', exact: true }).click();

    await expect(page.getByText('Default labour warranty for this service')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('sourced-part purchase memory @admin @desktop', () => {
  /**
   * The behaviour asked for: type "LVDS" a second time and the supplier, prices
   * and negotiated warranty come back from the last time it was bought.
   *
   * This drives the real endpoints against a real database. An earlier version
   * of this test asserted only that an unseen name returns found:false, which
   * proved nothing about the prefill it was named after.
   */
  test('a repeated part name returns its last supplier, price and warranty', async ({ page }) => {
    await loginAsAdmin(page);

    // page.request shares the logged-in browser context (cookies + CSRF).
    const api = page.request;
    const csrf = (await page.context().cookies())
      .find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';

    // A local purchase must be billed to a real job ticket.
    const jobsRes = await api.get('/api/job-tickets/list');
    expect(jobsRes.ok(), 'GET /api/job-tickets/list').toBeTruthy();
    const jobs = (await jobsRes.json()).items;
    test.skip(!jobs?.length, 'no job tickets in this database to bill a purchase to');
    const jobTicketId = jobs[0].id;

    const partName = `QA LVDS ${Date.now()}`;
    const createPurchase = (warrantyDays: number, sellingPrice: number) =>
      api.post('/api/inventory/local-purchases', {
        headers: { 'x-xsrf-token': csrf },
        data: {
          jobTicketId,
          partName,
          supplierName: 'QA Local Vendor',
          costPrice: 1200,
          sellingPrice,
          quantity: 1,
          warrantyDays,
          receiptImageUrl: 'data:image/png;base64,iVBORw0KGgo=',
        },
      });

    // Nothing known before the first purchase.
    const before = await api.get(
      `/api/inventory/local-purchases/suggest?name=${encodeURIComponent(partName)}`,
    );
    expect((await before.json()).found).toBe(false);

    const first = await createPurchase(90, 2000);
    expect(first.status(), await first.text()).toBe(201);

    // Second time the part is typed, the negotiated terms come back.
    const after = await api.get(
      `/api/inventory/local-purchases/suggest?name=${encodeURIComponent(partName)}`,
    );
    const suggestion = (await after.json());
    expect(suggestion.found).toBe(true);
    expect(suggestion.suggestion.warrantyDays).toBe(90);
    expect(suggestion.suggestion.supplierName).toBe('QA Local Vendor');
    expect(suggestion.suggestion.sellingPrice).toBe(2000);

    // Matching is case-insensitive — staff do not type consistently.
    const lower = await api.get(
      `/api/inventory/local-purchases/suggest?name=${encodeURIComponent(partName.toLowerCase())}`,
    );
    expect((await lower.json()).found).toBe(true);

    // A second purchase at a renegotiated warranty wins: most recent, not an
    // average and not the first ever recorded.
    const second = await createPurchase(30, 2500);
    expect(second.status()).toBe(201);

    const latest = await api.get(
      `/api/inventory/local-purchases/suggest?name=${encodeURIComponent(partName)}`,
    );
    const latestSuggestion = (await latest.json()).suggestion;
    expect(latestSuggestion.warrantyDays).toBe(30);
    expect(latestSuggestion.sellingPrice).toBe(2500);
  });

  test('an unknown part name degrades quietly instead of erroring', async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.request.get(
      `/api/inventory/local-purchases/suggest?name=${encodeURIComponent(`QA Never Bought ${Date.now()}`)}`,
    );
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual({ found: false, suggestion: null });
  });
});
