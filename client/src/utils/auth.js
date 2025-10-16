// Minimal auth helper for storing token and calling the API with Authorization header
// Cookie-only auth: do not persist token in localStorage. Rely on HttpOnly cookie 'auth_token' and /api/me() for status.
const getToken = () => null;
const getUsername = () => null;
const setToken = () => {};
const clearToken = () => {};

// wrapper for fetch that supports auto-refresh-on-401 using refresh-cookie endpoint
let _refreshPromise = null;
const _doRefresh = async () => {
  try {
    const r = await fetch('/api/token/refresh-cookie/', { method: 'POST', credentials: 'same-origin' });
    if (!r.ok) throw new Error('refresh failed');
    return true;
  } finally {
    // clear the promise so subsequent 401s can attempt refresh again if needed
    _refreshPromise = null;
  }
};

const apiFetch = async (path, opts = {}) => {
  const headers = new Headers(opts.headers || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const final = Object.assign({}, opts, { headers });

  // helper to do the actual fetch with credentials included
  const doFetch = () => fetch(path, Object.assign({}, final, { credentials: 'same-origin' }));

  let resp = await doFetch();
  if (resp.status !== 401) return resp;

  // If a refresh is already in progress, wait for it. Otherwise start one.
  if (!_refreshPromise) _refreshPromise = _doRefresh();
  try {
    await _refreshPromise;
  } catch (e) {
    // refresh failed — return original 401
    return resp;
  }

  // After refresh, retry original request once
  try {
    resp = await doFetch();
    return resp;
  } catch (e) {
    return resp;
  }
};

// register and login helpers
const register = async ({ username, password, org_name, set_cookie = true }) => {
  const resp = await fetch('/api/register/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username, password, org_name, set_cookie }),
  });
  if (!resp.ok) throw resp;
  const body = await resp.json();
  // when cookie mode is used, server sets HttpOnly cookie; we do not store token client-side
  return body;
};

const login = async ({ username, password, use_cookie = true }) => {
  // If use_cookie, call cookie login endpoint which will set HttpOnly cookie
    if (use_cookie) {
    const resp = await fetch('/api/login-cookie/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'same-origin',
    });
    if (!resp.ok) throw resp;
    const body = await resp.json();
    return body;
  }
  const resp = await fetch('/api/token-auth/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) throw resp;
  const body = await resp.json();
  if (body.token) setToken(body.token, username);
  return body;
};

const logout = async () => {
  try {
    // call server logout which will blacklist refresh token and clear cookies
    await fetch('/api/token/logout/', { method: 'POST', credentials: 'same-origin' });
    return true;
  } catch (e) {
    return false;
  }
};

const me = async () => {
  try {
    const resp = await fetch('/api/me/', { method: 'GET', credentials: 'same-origin' });
    if (!resp.ok) return null;
    const body = await resp.json();
    return body.user || null;
  } catch (e) {
    return null;
  }
};

const api = {
  setToken,
  getToken,
  clearToken,
  getUsername,
  apiFetch,
  register,
  login,
  logout,
  me,
};

export default api;
