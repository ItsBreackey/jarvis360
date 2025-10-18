import { test, expect, request } from '@playwright/test';

// Full reset flow: register -> request reset -> open reset link -> set password -> login
// This test assumes the Django backend is running in DEBUG mode and will return
// a `reset_url` (for testing) from the /api/password-reset/ endpoint. If it doesn't,
// the test will attempt to derive the uid/token from the response body.

const API_BASE = process.env.API_BASE || 'http://localhost:8000';

// APP_BASE may be 3000 or 3001 depending on whether port 3000 is taken.
const DEFAULT_APP_PORTS = [3000, 3001];

async function detectAppBase() {
  if (process.env.APP_BASE) return process.env.APP_BASE;
  const playwright = require('@playwright/test');
  for (const p of DEFAULT_APP_PORTS) {
    try {
      const ctx = await playwright.request.newContext();
      const res = await ctx.get(`http://localhost:${p}`);
      await ctx.dispose();
      if (res && res.status() === 200) return `http://localhost:${p}`;
    } catch (e) {
      // ignore
    }
  }
  // fallback
  return 'http://localhost:3000';
}

test('forgot -> email -> reset -> sign-in', async ({ page }) => {
  const rnd = Math.floor(Math.random() * 1000000);
  const username = `e2e_reset_${rnd}`;
  const oldPassword = 'OldPass123!';
  const newPassword = 'NewPass456!';
  const email = `${username}@example.test`;
  console.log('DEBUG username ->', username, 'email ->', email);

  const APP_BASE = await detectAppBase();

  const req = await request.newContext();

  // 1) register
  const r1 = await req.post(`${API_BASE}/api/register/`, { data: { username, password: oldPassword, org_name: username, email } });
  expect(r1.ok()).toBeTruthy();

  // 2) request password reset -> backend in DEBUG may return a JSON with `reset_url`
  const r2 = await req.post(`${API_BASE}/api/password-reset/`, { data: { email } });
  expect(r2.ok()).toBeTruthy();
  const r2body = await r2.json().catch(() => null);

  // Try extracting reset_url directly from response (Django DEBUG helper may include it),
  // otherwise try to construct one from uid and token returned or fallback to parsing text.
  let resetUrl: string | null = null;
  if (r2body && r2body.reset_url) {
    resetUrl = r2body.reset_url;
  } else if (r2body && r2body.uid && r2body.token) {
    // assume frontend reset route: /reset-password?uid=...&token=...
    resetUrl = `${APP_BASE}/reset-password?uid=${encodeURIComponent(r2body.uid)}&token=${encodeURIComponent(r2body.token)}`;
  } else {
    // try reading text for urls
    const text = await r2.text().catch(() => '');
    const m = text.match(/https?:\/\/[^\s"'<>]+/i);
    if (m) resetUrl = m[0];
  }

  expect(resetUrl).toBeTruthy();

  // normalize resetUrl: if backend returned a URL hosted on API_BASE, switch host to the detected APP_BASE
  try {
    const parsed = new URL(resetUrl as string);
    if (parsed.host === new URL(API_BASE).host) {
      // rebuild URL using APP_BASE as origin
      resetUrl = `${APP_BASE}${parsed.pathname}${parsed.search}`;
    }
  } catch (e) {
    // ignore parse errors; keep resetUrl as-is
  }

  // 3) open reset URL in browser and set new password
  await page.goto(resetUrl as string, { waitUntil: 'load' });
  // wait for the ResetPasswordPage input to appear
  await page.waitForSelector('input[placeholder="New password"]', { timeout: 5000 });
  await page.fill('input[placeholder="New password"]', newPassword);
  await page.click('button:has-text("Set password")');

  // wait for redirect to login or success text emitted by the ResetPasswordPage
  await page.waitForSelector('text=Password reset. You may now sign in.', { timeout: 3000 }).catch(() => null);

  // 4) Sign in through the UI (mimic real user interaction)
  // navigate to the login page on the detected app host
  await page.goto(`${APP_BASE}/login`, { waitUntil: 'load' });
  // fill and submit the login form
  await page.fill('input[placeholder="username"]', username);
  await page.fill('input[placeholder="password"]', newPassword);
  await page.click('button:has-text("Sign in")');

  // wait for navigation to the dashboard (app navigates to /dashboard/home on success)
  await page.waitForURL('**/dashboard/**', { timeout: 5000 });
  // verify a dashboard element exists (fallback to checking the URL)
  expect(page.url()).toContain('/dashboard');

});
