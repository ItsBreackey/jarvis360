# Authentication & Password Reset (developer notes)

This document explains the cookie-based auth flows used in development for jArvIs360, how the CRA proxy is configured for local testing, and how password reset works in debug mode.

## Cookie-based auth

- Backend issues JWT access and refresh tokens as HttpOnly cookies (`access_token`, `refresh_token`).
- API endpoints used by the frontend:
  - `POST /api/login-cookie/` — set `access_token`/`refresh_token` cookies, also sets a DRF `auth_token` cookie as fallback.
  - `POST /api/logout-cookie/` — clears cookies.
  - `GET /api/me/` — returns current user if auth cookie is valid.
  - `POST /api/register/` — creates user and sets cookies when `set_cookie=true`.

Notes:
- All frontend `fetch` calls use `credentials: 'include'` so cookies are sent.
- When running CRA dev server (localhost:3000) and backend on 127.0.0.1:8000, the CRA dev proxy rewrites `Set-Cookie` domain to `localhost` so cookies become visible to the browser.

## CRA dev proxy

- `client/src/setupProxy.js` proxies `/api` requests to `http://127.0.0.1:8000` and rewrites cookie domains to `localhost` to avoid cross-origin cookie issues in dev.
- Keep `CORS_ALLOW_CREDENTIALS=True` set in Django settings when testing locally.

## Password reset (development/test behavior)

- `POST /api/password-reset/` expects `{ email }` and will send an email with a reset URL containing `uid` and `token`.
- In DEBUG mode the API also returns `reset_url` in the JSON response to make local testing and Playwright e2e simpler.
- `POST /api/password-reset/confirm/` expects `{ uid, token, new_password }` and will set the user's password if the token is valid.

Testing locally:
- Call `/api/password-reset/` with the test user's email. When running Django with `DEBUG=True`, the response will include the reset URL which you can open in the browser (or use in Playwright tests).

Playwright notes:
- For deterministic CI tests prefer a test-only email backend or a captured email store. For quick local runs using `DEBUG` response is acceptable.

## Troubleshooting

- If `me()` returns null after login in the browser, the likely causes are:
  - Cookies not set due to domain mismatch (check proxy logs for `Set-Cookie` headers and cookieDomainRewrite behavior).
  - Browser blocked cookies due to SameSite or secure flags when using https locally.
  - Race condition: the frontend now retries `me()` briefly after login to allow the browser to process HttpOnly cookie set by the proxy.

If you need more details on Playwright test wiring or want a robust test-only email capture service, I can add an SMTP test backend and a small helper API to fetch the last message for tests.
