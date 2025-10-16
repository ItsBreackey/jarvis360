const { test, expect } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');

test('register -> login via API cookies -> upload -> save scenario -> server has dashboard', async ({ page, request }) => {
  const CLIENT_BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
  const API_BASE = process.env.E2E_API_URL || 'http://127.0.0.1:8000';

  // Create a unique test user via the backend API
  const username = `e2e_user_${Date.now()}`;
  const password = 'TestPass123!';
  const org = `e2e_org_${Date.now()}`;

  // Wait for API to be reachable (poll /api/schema/) to avoid immediate ECONNREFUSED if server is still starting
  const waitForApi = async (timeoutMs = 60000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const r = await request.get(`${API_BASE}/api/schema/`);
        if (r && r.ok()) return true;
      } catch (e) {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };

  // Optionally auto-start services if the environment requests it
  const repoRoot = path.resolve(__dirname, '../../..');
  const clientDir = path.resolve(repoRoot, 'client');
  let djangoProc = null;
  let clientProc = null;
  const autoStart = process.env.E2E_AUTO_START === '1';
  if (autoStart) {
    // start Django
    djangoProc = spawn(process.platform === 'win32' ? 'python' : 'python3', ['manage.py', 'runserver', '127.0.0.1:8000'], { cwd: repoRoot, shell: true, env: process.env });
    djangoProc.stdout && djangoProc.stdout.on('data', (d) => console.log('[django]', d.toString().trim()));
    djangoProc.stderr && djangoProc.stderr.on('data', (d) => console.error('[django]', d.toString().trim()));
    // start static server for client build
    clientProc = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['serve', '-s', 'build', '-l', '3000'], { cwd: clientDir, shell: true, env: process.env });
    clientProc.stdout && clientProc.stdout.on('data', (d) => console.log('[serve]', d.toString().trim()));
    clientProc.stderr && clientProc.stderr.on('data', (d) => console.error('[serve]', d.toString().trim()));
  }

  const apiReady = await waitForApi(60000);
  if (!apiReady) console.warn('API did not become ready within timeout; registration attempts may fail');

  // Wait for client static server to be ready (avoid ERR_CONNECTION_REFUSED when navigating)
  const waitForClient = async (timeoutMs = 60000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const r = await request.get(CLIENT_BASE);
        if (r && r.ok()) return true;
      } catch (e) {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };

  const clientReady = await waitForClient(60000);
  if (!clientReady) console.warn('Client did not become ready within timeout; page navigation may fail');

  // Try registering a few times to handle server startup delays
  let reg = null;
  for (let i = 0; i < 12; i++) {
    try {
      reg = await request.post(`${API_BASE}/api/register/`, {
        data: JSON.stringify({ username, password, org_name: org, set_cookie: false }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (reg && reg.ok()) break;
    } catch (e) {
      // ignore connect errors and retry
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!reg || !reg.ok()) {
    console.error('Registration failed after retries. Last response:', reg && reg.status ? reg.status : 'no response');
  }
  expect(reg && reg.ok()).toBeTruthy();

  // Login via API to obtain Set-Cookie headers with JWTs
  const loginResp = await request.post(`${API_BASE}/api/login-cookie/`, { data: JSON.stringify({ username, password }), headers: { 'Content-Type': 'application/json' } });
  expect(loginResp.ok()).toBeTruthy();

  // Extract cookies from response headers (may be multiple Set-Cookie headers)
  const sc = loginResp.headers()['set-cookie'];
  const setCookies = Array.isArray(sc) ? sc : (sc ? [sc] : []);
  const cookieMap = {};
  for (const c of setCookies) {
    const parts = c.split(';').map(p => p.trim());
    const [nameValue] = parts;
    const eq = nameValue.indexOf('=');
    if (eq > 0) {
      const name = nameValue.slice(0, eq);
      const value = nameValue.slice(eq + 1);
      cookieMap[name] = value;
    }
  }

  // Set the access/refresh cookies in the browser context so client requests are authenticated.
  const cookiesToSet = [];
  if (cookieMap['access_token']) cookiesToSet.push({ name: 'access_token', value: cookieMap['access_token'], url: CLIENT_BASE });
  if (cookieMap['refresh_token']) cookiesToSet.push({ name: 'refresh_token', value: cookieMap['refresh_token'], url: CLIENT_BASE });
  const filtered = cookiesToSet.filter(c => c && c.name && c.value);
  if (filtered.length) {
    try {
      await page.context().addCookies(filtered);
    } catch (e) {
      // Playwright may reject url-based cookies in some environments; fallback to domain/path
      const parsedUrl = new URL(CLIENT_BASE);
      const domain = parsedUrl.hostname;
      const fallback = filtered.map(c => ({ name: c.name, value: c.value, domain, path: '/' }));
      if (fallback.length) await page.context().addCookies(fallback);
    }
  }

  // Navigate to client UI
  await page.goto(CLIENT_BASE);

  // Upload demo CSV using file input
  const filePath = path.join(__dirname, '..', 'fixtures', 'demo.csv');
  const fileInput = await page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Click Process File
    // Click Process File (use force to avoid intermittent overlay click interception)
    await page.locator('button:has-text("Process File")').first().click({ force: true });

  // Wait for client processing to settle. Prefer waiting for a known overlay to hide, but fall back to a short timeout.
  try {
    await page.waitForSelector('div.fixed.inset-0.z-50', { state: 'hidden', timeout: 30000 });
  } catch (e) {
    // overlay didn't appear or didn't hide; continue with additional checks
    await page.waitForTimeout(1000);
  }

  // Ensure Save button is visible and enabled
  const saveBtn = page.locator('button[aria-label="Save scenario"]').first();
  // If the Save button isn't present (app may still be on Data Dashboard), navigate to the Scenarios view
  if ((await saveBtn.count()) === 0) {
    const scenariosNav = page.locator('button[aria-label="Go to Scenarios"]').first();
    try { await scenariosNav.click(); } catch (e) { await scenariosNav.click({ force: true }); }
    // Wait for the scenarios view and Save button to render (longer timeout to avoid flakiness)
    await page.waitForSelector('button[aria-label="Save scenario"]', { timeout: 15000 }).catch(() => {});
  }
  // final check: ensure visible with generous timeout
  await expect(saveBtn).toBeVisible({ timeout: 15000 });
  // Wait until the button is enabled (not disabled attribute)
  await page.waitForFunction((sel) => {
    const btn = document.querySelector(sel);
    return !!btn && !btn.disabled;
  }, {}, 'button[aria-label="Save scenario"]');

  // Intercept the dashboard POST request so we can wait for a successful save triggered by the UI
  const [saveReq] = await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/api/dashboards/') && resp.request().method() === 'POST' && resp.status() < 500, { timeout: 15000 }),
    // Click the Save button. Use a normal click first; fallback to force click if blocked.
    (async () => {
      try {
        await saveBtn.click();
      } catch (e) {
        await saveBtn.click({ force: true });
      }
    })(),
  ]);

  // Confirm the save response was successful
  expect(saveReq.ok()).toBeTruthy();

  // Optionally verify server-side dashboards for the user using the API token we obtained earlier
  const access = cookieMap['access_token'];
  expect(access).toBeTruthy();
  const dashboardsResp = await request.get(`${API_BASE}/api/dashboards/`, { headers: { Authorization: `Bearer ${access}` } });
  expect(dashboardsResp.ok()).toBeTruthy();
  const list = await dashboardsResp.json();
  expect(Array.isArray(list)).toBeTruthy();
  expect(list.length).toBeGreaterThanOrEqual(1);

  // Cleanup any started processes
  if (autoStart) {
    try { if (clientProc) clientProc.kill(); } catch (e) {}
    try { if (djangoProc) djangoProc.kill(); } catch (e) {}
  }
});
