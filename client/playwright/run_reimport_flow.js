const { chromium } = require('playwright');

(async () => {
  const BASE = 'http://127.0.0.1:8000';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  // Navigate to the backend origin so fetch() from page context is same-origin
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // Helper to run fetch in page context for same-origin requests so cookies are set
  async function pageFetch(path, opts = {}) {
    return await page.evaluate(async ({ fullPath, opts }) => {
      const res = await fetch(fullPath, opts);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text) } catch(e) {}
      const headers = {};
      for (const pair of res.headers.entries()) headers[pair[0]] = pair[1];
      return { status: res.status, ok: res.ok, text, json, headers };
    }, { fullPath: BASE + path, opts });
  }

  const ts = Date.now();
  const username = `pw_user_${ts}`;
  const password = 'pw123456';
  const email = `${username}@example.com`;
  const org = `pworg${ts}`;

  console.log('Registering...');
  let r = await pageFetch('/api/register/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, email, org_name: org }) });
  console.log('register', r.status);

  console.log('Logging in (cookie)...');
  r = await pageFetch('/api/login-cookie/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  console.log('login', r.status, 'cookies in context:', (await context.cookies()).map(c => ({ name: c.name })));

  // Upload CSV using FormData in page context
  console.log('Uploading CSV...');
  const uploadResult = await page.evaluate(async () => {
    const f = new Blob(['id,MRR,signup_date\nplay,99,2024-01-01\n'], { type: 'text/csv' });
    const fd = new FormData();
    fd.append('file', f, 'play.csv');
    const res = await fetch('/api/uploads/', { method: 'POST', body: fd, credentials: 'include' });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text) } catch(e) {}
    const headers = {};
    for (const pair of res.headers.entries()) headers[pair[0]] = pair[1];
    return { status: res.status, ok: res.ok, text, json, headers };
  });
  console.log('upload status', uploadResult.status);
  const uploadId = uploadResult.json && uploadResult.json.id;
  console.log('upload id', uploadId);
  if (!uploadId) {
    console.error('Upload failed, aborting');
    await browser.close();
    process.exit(1);
  }

  // Now emulate the client handleRetry: POST reimport and, if Retry-After present, write to sessionStorage/localStorage
  console.log('Calling reimport in page context...');
  const reimportRes = await page.evaluate(async (uploadId) => {
    const r = await fetch(`/api/uploads/${uploadId}/reimport/`, { method: 'POST', credentials: 'include' });
    const text = await r.text();
    const headers = {};
    for (const pair of r.headers.entries()) headers[pair[0]] = pair[1];
    // client behavior: if 429, read Retry-After and set storage; if success and header present, also set storage
    const ra = headers['retry-after'];
    if (r.status === 429 || ra) {
      const seconds = ra ? parseInt(ra, 10) : 60;
      const expiry = Date.now() + seconds * 1000;
      const payload = JSON.stringify({ expiry, total: seconds });
      try { sessionStorage.setItem(`reimport_cooldown:${uploadId}`, payload) } catch (e) {}
      try { localStorage.setItem(`reimport_cooldown:${uploadId}`, payload) } catch (e) {}
    }
    return { status: r.status, text, headers };
  }, uploadId);

  console.log('reimport status', reimportRes.status, 'Retry-After:', reimportRes.headers['retry-after']);

  // Read back storage
  const stor = await page.evaluate((uploadId) => {
    const key = `reimport_cooldown:${uploadId}`;
    return { session: sessionStorage.getItem(key), local: localStorage.getItem(key) };
  }, uploadId);

  console.log('storage readback:', stor);

  await browser.close();
})();
