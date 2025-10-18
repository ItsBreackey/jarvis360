// client/src/utils/auth.js
// Single, concise auth helper for cookie-based JWT + token fallback

// Allow overriding the API base (use REACT_APP_API_BASE). When developing with CRA on localhost:3000
// prefer relative paths so the dev-server proxy (`src/setupProxy.js`) can forward /api to the Django backend
let API_ROOT = '';
if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_BASE) {
  API_ROOT = process.env.REACT_APP_API_BASE;
} else if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '3000') {
  API_ROOT = ''; // relative -> proxy (handle both localhost and 127.0.0.1 dev hosts)
} else {
  API_ROOT = 'http://127.0.0.1:8000';
}

async function safeJson(resp) {
  try { return await resp.json(); } catch (e) { return null; }
}

async function refreshAccessCookie() {
  try {
    const resp = await fetch(`${API_ROOT}/api/token/refresh-cookie/`, { method: 'POST', credentials: 'include' });
    return resp.ok;
  } catch (e) {
    return false;
  }
}

// apiFetch will include credentials and retry once after attempting refresh on 401
async function apiFetch(path, opts = {}) {
  const retry = opts._retry || false;
  const fetchOpts = {
    credentials: 'include',
    headers: { ...(opts.headers || {}) },
    method: opts.method || 'GET',
    body: opts.body,
  };
  const url = path.startsWith('http') ? path : `${API_ROOT}${path}`;
  const resp = await fetch(url, fetchOpts);
  if (resp.status === 401 && !retry) {
    const ok = await refreshAccessCookie();
    if (ok) return apiFetch(path, { ...opts, _retry: true });
  }
  return resp;
}

async function register({ username, password, email, org_name, set_cookie = true }) {
  const resp = await apiFetch('/api/register/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, email, org_name, set_cookie }) });
  const body = await safeJson(resp);
  if (!resp.ok) {
    const msg = (body && (body.error || body.detail || JSON.stringify(body))) || 'register failed';
    throw new Error(msg);
  }
  try { const user = await me(); window.dispatchEvent(new CustomEvent('jarvis:auth-changed', { detail: { user } })); } catch (e) {}
  return body;
}

async function login({ username, password, use_cookie = true }) {
  if (use_cookie) {
    const resp = await apiFetch('/api/login-cookie/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const body = await safeJson(resp);
    if (!resp.ok) {
      const msg = (body && (body.error || body.detail || JSON.stringify(body))) || 'login failed';
      throw new Error(msg);
    }
    // After setting HttpOnly cookies server-side, browsers may take a short moment to process them.
    // Retry `me()` a few times with small backoff so callers receive the authenticated user when possible.
    let user = null;
    for (let i = 0; i < 6; i++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        user = await me();
        if (user) break;
      } catch (e) { /* ignore */ }
      // small delay (200ms)
      // eslint-disable-next-line no-await-in-loop
      await new Promise((res) => setTimeout(res, 200));
    }
    try { window.dispatchEvent(new CustomEvent('jarvis:auth-changed', { detail: { user } })); } catch (e) {}
    return body;
  }
  const resp = await apiFetch('/api/token-auth/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const body = await safeJson(resp);
  if (!resp.ok) {
    const msg = (body && (body.error || body.detail || JSON.stringify(body))) || 'login failed';
    throw new Error(msg);
  }
  return body;
}

async function logout() {
  try { await apiFetch('/api/token/logout/', { method: 'POST' }); } catch (e) { /* ignore */ }
  try { await apiFetch('/api/logout-cookie/', { method: 'POST' }); } catch (e) { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent('jarvis:auth-changed', { detail: { user: null } })); } catch (e) {}
  return true;
}

async function me() {
  try {
    const resp = await apiFetch('/api/me/', { method: 'GET' });
    if (!resp.ok) return null;
    const body = await safeJson(resp);
    return body?.user || null;
  } catch (e) { return null; }
}

const api = { apiFetch, register, login, logout, me, refreshAccessCookie };
export default api;
