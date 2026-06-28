import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:5083';

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

test.describe('Phase 14H: Custody OTP End-to-End', () => {

  test('receive custody OTP: send → confirm → stage advances to device_received', async () => {
    const admin = await getAdminSession();

    // Create SR with pickup preference
    const srRes = await fetch(`${BASE}/api/service-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: 'QA14H-OTP', screenSize: '55', modelNumber: 'OTP-TEST-55',
        primaryIssue: 'OTP custody test', customerName: 'OTP Tester',
        phone: '+8801666777888', address: 'OTP Test Address',
        servicePreference: 'home_pickup', requestIntent: 'repair',
        serviceMode: 'pickup', status: 'Pending',
      }),
    });
    const sr = await srRes.json();
    expect(sr.id, 'SR should be created').toBeTruthy();

    // Advance to pickup_scheduled (non-custody stage)
    const stageRes = await adminFetch(`/api/admin/service-requests/${sr.id}/transition-stage`, 'POST',
      { stage: 'pickup_scheduled', actorName: 'Test Admin' }, admin);
    expect(stageRes.data.serviceRequest?.stage, 'Should advance to pickup_scheduled').toBe('pickup_scheduled');

    // Send custody OTP for receive action
    const otpSendRes = await adminFetch(`/api/admin/service-requests/${sr.id}/custody-otp/send`, 'POST',
      { action: 'receive' }, admin);
    expect(otpSendRes.ok, 'OTP send should succeed (dev fallback)').toBe(true);
    expect(otpSendRes.data.success, 'OTP response should have success=true').toBe(true);
    expect(otpSendRes.data._testCode, 'Dev mode should return _testCode').toBeTruthy();

    const otpCode = otpSendRes.data._testCode;
    expect(otpCode).toMatch(/^\d{6}$/);

    // Negative test: wrong code should fail
    const wrongRes = await adminFetch(`/api/admin/service-requests/${sr.id}/custody-otp/confirm`, 'POST',
      { action: 'receive', code: '000000' }, admin);
    expect(wrongRes.status, 'Wrong OTP should return 400').toBe(400);
    expect(wrongRes.data.error).toContain('Invalid OTP');

    // Positive test: correct code should succeed
    const confirmRes = await adminFetch(`/api/admin/service-requests/${sr.id}/custody-otp/confirm`, 'POST',
      { action: 'receive', code: otpCode }, admin);
    expect(confirmRes.ok, 'Correct OTP should succeed').toBe(true);

    // Verify SR stage from confirm response
    const confirmedStage = confirmRes.data.serviceRequest?.stage;
    expect(['picked_up', 'device_received'].includes(confirmedStage),
      `Stage should be picked_up or device_received after OTP, got: ${confirmedStage}`).toBe(true);

    // Now verify job conversion works (device custody confirmed)
    const convertRes = await adminFetch(`/api/admin/service-requests/${sr.id}/verify-and-convert`, 'POST', {}, admin);
    expect(convertRes.ok, 'Conversion should succeed after custody').toBe(true);
    expect(convertRes.data.jobTicket?.id, 'Job should be created').toBeTruthy();
    expect(convertRes.data.jobTicket?.status, 'Job should be Pending').toBe('Pending');
  });

  test('delivery custody OTP requires linked job', async () => {
    const admin = await getAdminSession();

    // Create SR without job conversion
    const srRes = await fetch(`${BASE}/api/service-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: 'QA14H-NoJob', primaryIssue: 'Delivery OTP test without job',
        customerName: 'OTP Tester', phone: '+8801666777888',
        servicePreference: 'service_center', requestIntent: 'repair',
        serviceMode: 'service_center', status: 'Pending',
      }),
    });
    const sr = await srRes.json();

    // Attempt delivery OTP without job — should fail
    const otpRes = await adminFetch(`/api/admin/service-requests/${sr.id}/custody-otp/send`, 'POST',
      { action: 'delivery' }, admin);
    expect(otpRes.status, 'Delivery OTP without job should be 409').toBe(409);
    expect(otpRes.data.error).toContain('linked job ticket');
  });

  test('OTP confirmation with expired/used code fails gracefully', async () => {
    const admin = await getAdminSession();

    // Try confirming on an SR that has no OTP sent
    const srRes = await fetch(`${BASE}/api/service-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: 'QA14H-NoOTP', primaryIssue: 'No OTP sent test',
        customerName: 'OTP Tester', phone: '+8801666777888',
        servicePreference: 'service_center', requestIntent: 'repair',
        serviceMode: 'service_center', status: 'Pending',
      }),
    });
    const sr = await srRes.json();

    const confirmRes = await adminFetch(`/api/admin/service-requests/${sr.id}/custody-otp/confirm`, 'POST',
      { action: 'receive', code: '123456' }, admin);
    expect(confirmRes.status, 'Confirm without sending should fail').toBe(400);
    expect(confirmRes.data.error).toContain('not found or expired');
  });
});
