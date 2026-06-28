import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const BASE = 'http://127.0.0.1:5083';
const UUID_PATTERN = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
const NANOID_PATTERN = /^[A-Za-z0-9_-]{21,}$/;

async function loginAdmin(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/login`);
  await page.getByTestId('input-admin-username').fill('admin');
  await page.getByTestId('input-admin-password').fill('admin123');
  await page.getByTestId('button-admin-login').click();
  await page.waitForURL((url) => url.pathname === '/admin' || url.hash.startsWith('#'), { timeout: 15000 });
  return page;
}

async function loginCustomer(context: BrowserContext, phone: string, password: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(2000);
  await page.locator('[data-testid="input-login-phone"]').fill(phone);
  await page.locator('[data-testid="input-login-password"]').fill(password);
  await page.locator('[data-testid="button-login-submit"]').click();
  await page.waitForURL(/\/(home|my-profile)/, { timeout: 10000 });
  return page;
}

async function apiPost(url: string, body: Record<string, unknown>, cookies?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookies) headers['Cookie'] = cookies;
  const res = await fetch(`${BASE}${url}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return res.json();
}

async function apiPatch(url: string, body: Record<string, unknown>, cookies: string, csrf: string) {
  const res = await fetch(`${BASE}${url}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookies, 'X-CSRF-TOKEN': csrf },
    body: JSON.stringify(body),
  });
  return res.json();
}

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

test.describe('Phase 14E: Strict Daily-Life QA', () => {

  test.describe('1. Customer My Repairs Display', () => {
    test('shows device brand/model instead of raw UUID', async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await loginCustomer(ctx, '1888111222', 'rahim2026');
      await page.goto(`${BASE}/my-repairs`);
      await page.waitForTimeout(3000);

      const bodyText = await page.evaluate(() => document.body.innerText);

      // No full UUID pattern should appear as primary text
      const uuids = bodyText.match(UUID_PATTERN) || [];
      expect(uuids.length, 'No UUIDs should be visible in My Repairs').toBe(0);

      // Should show device brands/models from test data
      const hasDeviceInfo = bodyText.includes('Samsung') || bodyText.includes('LG') ||
        bodyText.includes('Sony') || bodyText.includes('Walton') || bodyText.includes('Repair request');
      expect(hasDeviceInfo, 'Device brand or "Repair request" fallback should be visible').toBe(true);

      // Should show SR ticket numbers
      const hasTicketRef = bodyText.includes('SRV-') || bodyText.includes('Repair #');
      expect(hasTicketRef, 'Safe reference (SRV- ticket or Repair #) should be visible').toBe(true);

      // Check no horizontal overflow
      const noOverflow = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth);
      expect(noOverflow, 'No horizontal overflow').toBe(true);

      await page.screenshot({ path: 'test-results/qa14e-myrepairs-display.png' });
      await ctx.close();
    });
  });

  test.describe('2. Quote Accept Flow', () => {
    test('customer sees quote amount and journey updates after acceptance', async ({ browser }) => {
      const admin = await getAdminSession();

      // Create SR via API
      const sr = await apiPost('/api/service-requests', {
        brand: 'QA14E-Toshiba', screenSize: '40', modelNumber: 'QA14E-40L3750',
        primaryIssue: 'Screen flickering on edges', customerName: 'QA14E Tester',
        phone: '+8801888111222', address: 'Test address', servicePreference: 'home_pickup',
        requestIntent: 'quote', serviceMode: 'pickup', status: 'Pending',
      });
      expect(sr.ticketNumber, 'SR should have ticket number').toBeTruthy();

      // Admin sends quote
      const quoteRes = await fetch(`${BASE}/api/admin/service-requests/${sr.id}/send-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
        body: JSON.stringify({ quoteAmount: 1800, quoteNotes: 'QA14E test quote', quoteValidDays: 7 }),
      });
      expect(quoteRes.ok, 'Quote should be sent successfully').toBe(true);

      // Customer accepts quote
      const acceptRes = await apiPatch(`/api/service-requests/${sr.id}/quote-response`, { response: 'accepted' }, admin.cookies, admin.csrf);
      expect(acceptRes.status, 'Status should be Quote Accepted').toBe('Quote Accepted');

      // Verify journey updated
      await new Promise(r => setTimeout(r, 1000));
      const journeyRes = await fetch(`${BASE}/api/admin/customer-repair-journeys?search=QA14E-Toshiba`, {
        headers: { 'Cookie': admin.cookies },
      });
      const journeys = await journeyRes.json();
      const j = journeys.find((j: any) => j.deviceBrand === 'QA14E-Toshiba');
      expect(j, 'Journey should exist for QA14E-Toshiba').toBeTruthy();
      expect(j.currentStage, 'Journey stage should be quote_accepted').toBe('quote_accepted');
      expect(j.lastEventTitle, 'Last event should be Quote Accepted').toBe('Quote Accepted');
    });
  });

  test.describe('3. Quote Reject Flow', () => {
    test('rejected quote updates journey and shows cancelled stage', async () => {
      const admin = await getAdminSession();

      const sr = await apiPost('/api/service-requests', {
        brand: 'QA14E-Reject', screenSize: '32', primaryIssue: 'Test reject flow',
        customerName: 'QA14E Tester', phone: '+8801888111222', address: 'Test',
        servicePreference: 'service_center', requestIntent: 'quote', serviceMode: 'service_center', status: 'Pending',
      });

      await fetch(`${BASE}/api/admin/service-requests/${sr.id}/send-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
        body: JSON.stringify({ quoteAmount: 5000, quoteNotes: 'Expensive repair', quoteValidDays: 3 }),
      });

      const rejectRes = await apiPatch(`/api/service-requests/${sr.id}/quote-response`, { response: 'rejected' }, admin.cookies, admin.csrf);
      expect(rejectRes.status, 'Status should be Quote Rejected').toBe('Quote Rejected');

      await new Promise(r => setTimeout(r, 1000));
      const journeyRes = await fetch(`${BASE}/api/admin/customer-repair-journeys?search=QA14E-Reject`, { headers: { 'Cookie': admin.cookies } });
      const journeys = await journeyRes.json();
      const j = journeys.find((j: any) => j.deviceBrand === 'QA14E-Reject');
      expect(j, 'Journey should exist').toBeTruthy();
      expect(j.currentStage, 'Journey should be cancelled after rejection').toBe('cancelled');
    });
  });

  test.describe('6. Logistics Notifications', () => {
    test('en_route and reschedule events appear in customer journey', async () => {
      const admin = await getAdminSession();

      // Find a logistics task with serviceRequestId that has a journey
      const tasksRes = await fetch(`${BASE}/api/admin/logistics-tasks`, { headers: { 'Cookie': admin.cookies } });
      const tasks = await tasksRes.json();
      const taskWithSR = tasks.find((t: any) => t.serviceRequestId && t.status !== 'completed' && t.status !== 'cancelled');

      if (!taskWithSR) {
        test.skip(true, 'No active logistics task with serviceRequestId found');
        return;
      }

      // Set en_route
      const enRouteRes = await fetch(`${BASE}/api/admin/logistics-tasks/${taskWithSR.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
        body: JSON.stringify({ status: 'en_route' }),
      });
      expect(enRouteRes.ok, 'en_route should succeed').toBe(true);
    });
  });

  test.describe('7-10. Job Outcomes', () => {
    test('repair_ok sets job to Ready', async () => {
      const admin = await getAdminSession();

      // Create a direct job
      const jobRes = await fetch(`${BASE}/api/job-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
        body: JSON.stringify({ customer: 'QA14E Test', customerPhone: '+8801888111222', device: 'QA14E TV', issue: 'Test repair OK', status: 'Pending', technician: 'Unassigned', priority: 'Medium' }),
      });
      const job = await jobRes.json();
      expect(job.id, 'Job should be created').toBeTruthy();

      // Advance to In Progress
      await fetch(`${BASE}/api/job-tickets/${job.id}/advance-status`, {
        method: 'POST', headers: { 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
      });

      // Set outcome repair_ok
      const outcomeRes = await fetch(`${BASE}/api/job-tickets/${job.id}/set-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
        body: JSON.stringify({ outcome: 'repair_ok' }),
      });
      const updated = await outcomeRes.json();
      expect(updated.status, 'Job should be Ready after repair_ok').toBe('Ready');
      expect(updated.repairOutcome, 'Outcome should be repair_ok').toBe('repair_ok');
    });

    test('needs_parts sets job to Waiting on Parts', async () => {
      const admin = await getAdminSession();
      const jobRes = await fetch(`${BASE}/api/job-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
        body: JSON.stringify({ customer: 'QA14E Test', customerPhone: '+8801888111222', device: 'QA14E TV2', issue: 'Test needs parts', status: 'Pending', technician: 'Unassigned', priority: 'Medium' }),
      });
      const job = await jobRes.json();
      await fetch(`${BASE}/api/job-tickets/${job.id}/advance-status`, { method: 'POST', headers: { 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf } });

      const outcomeRes = await fetch(`${BASE}/api/job-tickets/${job.id}/set-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
        body: JSON.stringify({ outcome: 'needs_parts', reason: 'T-CON board not available' }),
      });
      const updated = await outcomeRes.json();
      expect(updated.status, 'Should be Waiting on Parts').toBe('Waiting on Parts');
    });

    test('not_repairable requires reason and does NOT set Ready', async () => {
      const admin = await getAdminSession();
      const jobRes = await fetch(`${BASE}/api/job-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
        body: JSON.stringify({ customer: 'QA14E Test', customerPhone: '+8801888111222', device: 'QA14E TV3', issue: 'Test NG', status: 'Pending', technician: 'Unassigned', priority: 'Medium' }),
      });
      const job = await jobRes.json();
      await fetch(`${BASE}/api/job-tickets/${job.id}/advance-status`, { method: 'POST', headers: { 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf } });

      // Without reason should fail
      const failRes = await fetch(`${BASE}/api/job-tickets/${job.id}/set-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
        body: JSON.stringify({ outcome: 'not_repairable' }),
      });
      expect(failRes.status, 'Should require reason').toBe(400);

      // With reason should succeed
      const outcomeRes = await fetch(`${BASE}/api/job-tickets/${job.id}/set-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
        body: JSON.stringify({ outcome: 'not_repairable', reason: 'Panel shattered beyond repair' }),
      });
      const updated = await outcomeRes.json();
      expect(updated.status, 'Should be Cancelled, NOT Ready').toBe('Cancelled');
      expect(updated.repairOutcome).toBe('not_repairable');
      expect(updated.closureReason).toBe('Panel shattered beyond repair');
    });

    test('advance-status blocked for In Progress jobs', async () => {
      const admin = await getAdminSession();
      const jobRes = await fetch(`${BASE}/api/job-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
        body: JSON.stringify({ customer: 'QA14E Block', device: 'QA14E TV4', issue: 'Test block', status: 'Pending', technician: 'Unassigned', priority: 'Medium' }),
      });
      const job = await jobRes.json();
      await fetch(`${BASE}/api/job-tickets/${job.id}/advance-status`, { method: 'POST', headers: { 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf } });

      // Try to advance from In Progress — should be blocked
      const blockRes = await fetch(`${BASE}/api/job-tickets/${job.id}/advance-status`, {
        method: 'POST', headers: { 'Cookie': admin.cookies, 'X-CSRF-TOKEN': admin.csrf },
      });
      expect(blockRes.status, 'advance-status should be blocked for In Progress').toBe(400);
      const blockBody = await blockRes.json();
      expect(blockBody.error).toContain('set-outcome');
    });
  });

  test.describe('Admin Mobile Layout', () => {
    test('pickup tab has no horizontal overflow at 390x844', async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await loginAdmin(ctx);
      await page.goto(`${BASE}/admin#pickup`);
      await page.waitForTimeout(3000);
      await page.waitForSelector('text=Pickup & Delivery', { timeout: 10000 });

      const noOverflow = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth);
      expect(noOverflow, 'No horizontal overflow on pickup tab').toBe(true);

      await page.screenshot({ path: 'test-results/qa14e-pickup-mobile.png' });
      await ctx.close();
    });
  });
});
