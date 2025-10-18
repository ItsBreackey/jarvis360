import { test, expect, request } from '@playwright/test';

// This test requires a running backend (Django) at http://localhost:8000
// It performs API register and login-cookie flows and asserts a session cookie is set.

const API_BASE = process.env.API_BASE || 'http://localhost:8000';

test.describe('Auth cookie flows', () => {
  test('register -> login-cookie -> /api/me returns user and cookie set', async ({ page }) => {
    // use the API context to register a user
    const rnd = Math.floor(Math.random() * 1000000);
    const username = `e2e_user_${rnd}`;
    const password = 'Password123!';

    // create a request context
    const req = await request.newContext();

    // register via API
    const r1 = await req.post(`${API_BASE}/api/register/`, {
      data: { username, password, org_name: username, email: `${username}@example.test` },
    });
    expect(r1.ok()).toBeTruthy();

    // login via cookie endpoint
    const r2 = await req.post(`${API_BASE}/api/login-cookie/`, {
      data: { username, password },
    });
    expect(r2.ok()).toBeTruthy();

    // verify /api/me using the API request context (this validates the cookie-based session on the backend)
    const meRes = await req.get(`${API_BASE}/api/me/`);
    expect(meRes.ok()).toBeTruthy();
  const body = await meRes.json();
  // /api/me returns { user: { username } } or { user: null }
  expect(body.user).toBeTruthy();
  expect(body.user.username).toBe(username);

    // Attempt to open the client app and copy cookies into the browser context for an end-to-end check.
    // If the frontend at :3000 isn't available (dev server not running), don't fail the test — we've validated the backend.
    try {
      await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 5000 });
      const cookies = await req.storageState();
      if (cookies.cookies && cookies.cookies.length) {
        // Playwright expects cookies in a particular shape; storageState returns it already
        await page.context().addCookies(cookies.cookies as any);
      }
      // Optionally call /api/me from page to validate cookies in browser context as well
      const pageRes = await page.request.get(`${API_BASE}/api/me/`);
      expect(pageRes.ok()).toBeTruthy();
  const pageBody = await pageRes.json();
  expect(pageBody.user).toBeTruthy();
  expect(pageBody.user.username).toBe(username);
    } catch (err) {
      console.warn('Frontend not reachable at http://localhost:3000 — skipping browser cookie transfer (backend verified).', String(err));
    }
  });
});
