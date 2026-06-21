import { defineConfig, devices } from '@playwright/test';

const TEST_LEVEL = parseInt(process.env.TEST_LEVEL || '3', 10);
const HEADED = process.env.HEADED === '1';
const SLOW_MO = parseInt(process.env.SLOW_MO || '0', 10);

const tracePolicy = TEST_LEVEL >= 3 ? 'on-first-retry' : 'off';
const screenshotPolicy = TEST_LEVEL >= 2 ? 'only-on-failure' : 'off';
const videoPolicy = TEST_LEVEL >= 3 ? 'on-first-retry' : 'off';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5083',
    headless: process.env.CI ? true : !HEADED,
    launchOptions: {
      slowMo: Number.isFinite(SLOW_MO) && SLOW_MO > 0 ? SLOW_MO : undefined,
    },
    trace: tracePolicy,
    screenshot: screenshotPolicy,
    video: videoPolicy,
    locale: 'en-US',
    timezoneId: 'Asia/Dhaka',
  },

  projects: [
    {
      name: 'mobile-chrome',
      use: {
        ...devices['iPhone 15'],
        browserName: 'chromium',
        channel: 'chrome',
      },
      grep: [/customer/, /responsive/, /visual/, /a11y/],
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 15'] },
      grep: /customer/,
    },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
      grep: [/admin/, /desktop/, /a11y/],
    },
    {
      name: 'desktop-safari',
      use: { ...devices['Desktop Safari'] },
      grep: /admin/,
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5083',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
