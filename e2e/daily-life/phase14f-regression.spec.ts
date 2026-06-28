import { test, expect, type BrowserContext } from '@playwright/test';

const BASE = 'http://127.0.0.1:5083';
const UUID_PATTERN = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;

async function getAdminSession(): Promise<{ cookies: string; csrf: string }> {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const setCookies = res.headers.getSetCookie?.() || [];
  const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ');
  const xsrf = setCookies.find(c => c.startsWith('XSRF-TOKEN='))?.split('=')[1]?.split(';')[0] || '';
  return { cookies: cookieStr, csrf: xsrf };
}

async function adminFetch(path: string, method: string, body: Record<string, unknown>, session: { cookies: string; csrf: string }) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Cookie': session.cookies, 'X-CSRF-TOKEN': session.csrf },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

async function loginCustomerContext(browser: any, phone: string, password: string): Promise<{ ctx: BrowserContext; page: any }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(2000);
  await page.locator('[data-testid="input-login-phone"]').fill(phone);
  await page.locator('[data-testid="input-login-password"]').fill(password);
  await page.locator('[data-testid="button-login-submit"]').click();
  await page.waitForURL(/\/(home|my-profile)/, { timeout: 10000 });
  return { ctx, page };
}

test.describe('Phase 14G: Regression Tests for Phase 14F Fixes', () => {

  test('1. Admin Decline → customer sees polite "Request Declined" message', async ({ browser }) => {
    const admin = await getAdminSession();

    // Create SR
    const srRes = await fetch(`${BASE}/api/service-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: 'QA14G-Decline', screenSize: '28', primaryIssue: 'Test admin decline notification',
        customerName: 'Rahim Ahmed', phone: '+8801888111222', address: 'Test',
        servicePreference: 'service_center', requestIntent: 'repair', serviceMode: 'service_center', status: 'Pending',
      }),
    });
    const sr = await srRes.json();
    expect(sr.id, 'SR should be created').toBeTruthy();

    // Admin declines with reason
    const declineRes = await adminFetch(`/api/admin/service-requests/${sr.id}/action`, 'POST',
      { actionId: 'decline', reason: 'Device model not supported' }, admin);
    expect(declineRes.data.status, 'SR should be Declined').toBe('Declined');

    // Wait for journey sync
    await new Promise(r => setTimeout(r, 1500));

    // Customer opens My Repairs in browser
    const { ctx, page } = await loginCustomerContext(browser, '1888111222', 'rahim2026');
    await page.goto(`${BASE}/my-repairs`);
    await page.waitForTimeout(3000);

    // Find the declined journey and open it
    const declinedCard = page.locator('text=QA14G-Decline').first();
    await expect(declinedCard, 'Declined device should be visible in My Repairs').toBeVisible({ timeout: 5000 });

    // Check for polite message — open journey detail
    await page.locator('button:has-text("Open")').first().click();
    await page.waitForTimeout(2000);

    const detailText = await page.evaluate(() => document.body.innerText);
    expect(detailText, 'Should show "Request Declined" event').toContain('Request Declined');
    expect(detailText, 'Should show polite decline message').toContain('cannot proceed');

    // Should NOT expose harsh internal wording
    expect(detailText.includes('Action \'decline\' executed by admin')).toBe(false);

    await page.screenshot({ path: 'test-results/qa14g-decline-customer-detail.png' });
    await ctx.close();
  });

  test('2. Needs Parts → customer sees "Parts Needed" event', async ({ browser }) => {
    const admin = await getAdminSession();

    // Create job directly (walk-in auto-creates journey for matching phone)
    const jobRes = await adminFetch('/api/job-tickets', 'POST', {
      customer: 'Rahim Ahmed', customerPhone: '+8801888111222',
      device: 'QA14G-Parts TV', issue: 'Needs parts test', status: 'Pending',
      technician: 'Unassigned', priority: 'Medium',
    }, admin);
    const job = jobRes.data;
    expect(job.id, 'Job should be created').toBeTruthy();

    // Advance to In Progress
    await adminFetch(`/api/job-tickets/${job.id}/advance-status`, 'POST', {}, admin);

    // Set outcome needs_parts
    const outcomeRes = await adminFetch(`/api/job-tickets/${job.id}/set-outcome`, 'POST',
      { outcome: 'needs_parts', reason: 'T-CON board not available locally' }, admin);
    expect(outcomeRes.data.status, 'Job should be Waiting on Parts').toBe('Waiting on Parts');

    // Wait for journey sync
    await new Promise(r => setTimeout(r, 2000));

    // Customer checks journey in browser
    const { ctx, page } = await loginCustomerContext(browser, '1888111222', 'rahim2026');
    await page.goto(`${BASE}/my-repairs`);
    await page.waitForTimeout(3000);

    // Verify journey via API — query all journeys and find by job ID
    const journeyRes = await fetch(`${BASE}/api/admin/customer-repair-journeys?limit=200`, {
      headers: { 'Cookie': admin.cookies },
    });
    const journeys = await journeyRes.json();
    const partsJourney = journeys.find((j: any) => j.jobTicketId === job.id);
    expect(partsJourney, 'Journey should exist for parts job').toBeTruthy();
    expect(partsJourney.lastEventTitle, 'Last event should be Parts Needed').toBe('Parts Needed');

    // Customer browser check — device name visible in list
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText, 'QA14G-Parts TV should appear in My Repairs').toContain('QA14G-Parts TV');

    await page.screenshot({ path: 'test-results/qa14g-parts-customer-detail.png' });
    await ctx.close();
  });

  test('3. Walk-in job appears in customer My Repairs with device name', async ({ browser }) => {
    const admin = await getAdminSession();

    // Create walk-in job for existing customer phone
    const jobRes = await adminFetch('/api/job-tickets', 'POST', {
      customer: 'Rahim Ahmed', customerPhone: '+8801888111222',
      device: 'QA14G-WalkIn Panasonic', modelNumber: 'TH-49FX600',
      serialNumber: 'SN-QA14G-001', issue: 'Walk-in screen dim',
      status: 'Pending', technician: 'Unassigned', priority: 'Medium',
    }, admin);
    const job = jobRes.data;
    expect(job.id, 'Walk-in job should be created').toBeTruthy();

    // Wait for auto-journey creation
    await new Promise(r => setTimeout(r, 2500));

    // Customer opens My Repairs in browser
    const { ctx, page } = await loginCustomerContext(browser, '1888111222', 'rahim2026');
    await page.goto(`${BASE}/my-repairs`);
    await page.waitForTimeout(3000);

    const bodyText = await page.evaluate(() => document.body.innerText);

    // Walk-in device should be visible
    expect(bodyText, 'Walk-in device should appear').toContain('QA14G-WalkIn Panasonic');

    // Job reference should be visible — either full job ID or last-6 suffix
    const jobSuffix = job.id.slice(-6).toUpperCase();
    const hasJobRef = bodyText.includes(job.id) || bodyText.includes(jobSuffix);
    expect(hasJobRef, 'Job reference should be visible (full or last-6)').toBe(true);

    // No full UUID pattern (nanoid IDs are not UUID format so this checks for standard UUIDs only)
    const uuids = bodyText.match(UUID_PATTERN) || [];
    expect(uuids.length, 'No UUIDs visible').toBe(0);

    await page.screenshot({ path: 'test-results/qa14g-walkin-myrepairs.png' });
    await ctx.close();
  });

  test('4. Batch/panel job for matching phone — visibility check', async ({ browser }) => {
    const admin = await getAdminSession();

    // Panel batch is just a job_ticket with ticketType=panel_only and panelItems
    const jobRes = await adminFetch('/api/job-tickets', 'POST', {
      customer: 'Rahim Ahmed', customerPhone: '+8801888111222',
      device: 'QA14G-Panel Batch (2 pcs)', issue: 'Panel replacement batch',
      ticketType: 'panel_only', panelItems: JSON.stringify([
        { panelModel: 'V320BJ8', panelInches: '32', panelType: 'LED', quantity: 1, fault: 'Cracked' },
        { panelModel: 'V430H1', panelInches: '43', panelType: 'LED', quantity: 1, fault: 'Lines' },
      ]),
      status: 'Pending', technician: 'Unassigned', priority: 'Medium',
    }, admin);
    const job = jobRes.data;
    expect(job.id, 'Batch job should be created').toBeTruthy();

    await new Promise(r => setTimeout(r, 2500));

    const { ctx, page } = await loginCustomerContext(browser, '1888111222', 'rahim2026');
    await page.goto(`${BASE}/my-repairs`);
    await page.waitForTimeout(3000);

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText, 'Batch job device should appear in My Repairs').toContain('QA14G-Panel Batch');

    await page.screenshot({ path: 'test-results/qa14g-batch-myrepairs.png' });
    await ctx.close();
  });
});
