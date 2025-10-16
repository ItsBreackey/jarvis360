import { test, expect } from '@playwright/test';
import path from 'path';

test('register -> login via API cookies -> upload -> save scenario -> server has dashboard', async ({ page, request }) => {
  const CLIENT_BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
  const API_BASE = process.env.E2E_API_URL || 'http://localhost:8000';

  // Create a unique test user via the backend API
  const username = `e2e_user_${Date.now()}`;
  const password = 'TestPass123!';
  const org = `e2e_org_${Date.now()}`;

  const reg = await request.post(`${API_BASE}/api/register/`, {
    data: { username, password, org_name: org, set_cookie: false },
  });
  expect(reg.ok()).toBeTruthy();

  // Login via API to obtain Set-Cookie headers with JWTs
  const loginResp = await request.post(`${API_BASE}/api/login-cookie/`, { data: { username, password } });
  expect(loginResp.ok()).toBeTruthy();

  // Extract cookies from response headers (may be multiple Set-Cookie headers)
  const sc = loginResp.headers()['set-cookie'];
  // support both string and array
  const setCookies = Array.isArray(sc) ? sc : (sc ? [sc] : []);
  const cookieMap = {};
  for (const c of setCookies) {
    // parse like 'access_token=...; Path=/; HttpOnly; SameSite=Lax'
    const parts = c.split(';').map(p => p.trim());
    const [nameValue] = parts;
    const eq = nameValue.indexOf('=');
    if (eq > 0) {
      const name = nameValue.slice(0, eq);
      const value = nameValue.slice(eq + 1);
      cookieMap[name] = value;
    }
  }

  // Set the access/refresh cookies in the browser context so client requests are authenticated
  const cookiesToSet = [];
  if (cookieMap['access_token']) cookiesToSet.push({ name: 'access_token', value: cookieMap['access_token'], domain: 'localhost', path: '/' });
  if (cookieMap['refresh_token']) cookiesToSet.push({ name: 'refresh_token', value: cookieMap['refresh_token'], domain: 'localhost', path: '/' });
  if (cookiesToSet.length) await page.context().addCookies(cookiesToSet as any);

  // Navigate to client UI
  await page.goto(CLIENT_BASE);

  // Upload demo CSV using file input
  const filePath = path.join(__dirname, '..', 'fixtures', 'demo.csv');
  const fileInput = await page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Click Process File
  await page.locator('button:has-text("Process File")').first().click();

  // Wait briefly for processing to run and for Save controls to be available
  await page.waitForTimeout(1000);

  // Save scenario using the Save button (aria-label="Save scenario")
  await page.locator('button[aria-label="Save scenario"]').click();

  // Wait for client to attempt server save
  await page.waitForTimeout(1000);

  // Verify server-side dashboards for the user using Authorization: Bearer <access_token>
  const access = cookieMap['access_token'];
  expect(access).toBeTruthy();
  const dashboardsResp = await request.get(`${API_BASE}/api/dashboards/`, { headers: { Authorization: `Bearer ${access}` } });
  expect(dashboardsResp.ok()).toBeTruthy();
  const list = await dashboardsResp.json();
  expect(Array.isArray(list)).toBeTruthy();
  expect(list.length).toBeGreaterThanOrEqual(1);
});
