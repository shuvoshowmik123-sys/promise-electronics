import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { installPointerOverlay } from './gestures';

type WorkerFixtures = {
  sharedContext: BrowserContext;
  sharedPage: Page;
};

export const test = base.extend<{}, WorkerFixtures>({
  sharedContext: [async ({ browser }, use) => {
    const context = await browser.newContext();
    await installPointerOverlay(context);
    await use(context);
    await context.close();
  }, { scope: 'worker' }],

  sharedPage: [async ({ sharedContext }, use) => {
    const page = await sharedContext.newPage();
    await use(page);
  }, { scope: 'worker' }],

  page: async ({ sharedPage }, use) => {
    await sharedPage.evaluate(() => localStorage.clear()).catch(() => {});
    await use(sharedPage);
  },
});

export async function loginAsCustomer(page: Page, phone = '1944488999', password = 'customer123') {
  await page.goto('/login');
  await page.getByPlaceholder('1XXXXXXXXX').fill(phone);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/(home|my-profile)/, { timeout: 10_000 });
}

export async function loginAsAdmin(page: Page, username = 'admin', password = 'admin123') {
  await page.goto('/admin/login');
  await page.getByTestId('input-admin-username').fill(username);
  await page.getByTestId('input-admin-password').fill(password);
  await page.getByTestId('button-admin-login').click();
  await page.waitForURL(/\/admin/, { timeout: 15_000 });
}

export async function setLanguage(page: Page, lang: 'en' | 'bn') {
  await page.evaluate((l) => localStorage.setItem('customerLanguage', l), lang);
}

export async function getLanguage(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('customerLanguage') || 'en');
}

export const TEST_LEVEL = parseInt(process.env.TEST_LEVEL || '3', 10);

export { expect };
