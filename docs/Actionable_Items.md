# Jarvis360 — Actionable Items (prioritized)

Date: 2025-10-16

This file contains concrete, prioritized tasks to move Jarvis360 toward a Mosaic-like dashboard offering. Tasks are ordered for quick business value first.

1. Backend persistence & auth (High priority)
   - Add server-side storage (Postgres) and a minimal REST API to persist uploaded CSVs and saved dashboards.
   - Implement basic user auth and organization/tenant scoping.
   - Deliverable: user can log in and their uploaded data and scenarios persist across sessions.

2. ARR dashboard + cohort engine (High priority)
   - Implement an ARR dashboard view that shows ARR, ARR composition, top customers, and a cohort heatmap.
   - Add cohort aggregation utilities (signup-month cohortization, cohort retention table).
   - Deliverable: one composite dashboard with exportable charts.

3. Stripe connector (High value)
   - Build a connector to ingest Stripe billing data (OAuth or API key) into the backend normalized schema.
   - Deliverable: automated MRR/ARR ingestion that removes CSV friction for billing data.

4. Churn explainability + UI polish (Quick wins)
   - Improve visibility for `_churnProvided` vs `_churnComputed` in the preview and Churn Predictor table.
   - Add a developer/debug button that lists which rows were computed and the reasons (missing churn, missing features).
   - Deliverable: small UX improvements to increase user trust in computed churn values.

5. Dashboard templates & sharing (Medium)
   - Persist dashboard configurations as named templates and add shareable links (ACL-limited).
   - Deliverable: “CFO template” and “Acquisition template” saved and shareable between team members.

6. Scheduled reports & alerting (Medium)
   - Background jobs that generate PDF/CSV exports and email them on a schedule; add anomaly alert rules.
   - Deliverable: weekly ARR snapshot emails and MRR drop alerts.

7. Additional connectors (Ongoing)
   - HubSpot/CRM, GA/Amplitude, Chargebee, QuickBooks depending on user demand.

8. Hardening & enterprise features (Later)
   - RBAC, SSO, audit logs, encryption, tenancy isolation, monitoring and scale.

Next steps

- Pick one or two top items to start. I can scaffold the backend API and a first connector, or implement the ARR + cohort dashboard purely in the frontend as a next step.
- Tell me which you'd like and I'll create a scoped plan, add tasks to the repo TODO, and begin implementation (including tests where appropriate).

API Usage & Local Demo
----------------------

Quick reference for the local API endpoints implemented during the persistence work. These are useful for manual testing and for wiring the frontend.

- Register a new user (creates or uses the provided org):

   POST /api/register/
   Content-Type: application/json
   Body: { "username": "user1", "password": "s3cret", "org_name": "ExampleCo" }
   Response: { "token": "<token>" }

- Obtain a token for an existing user:

   POST /api/token-auth/
   Content-Type: application/json
   Body: { "username": "user1", "password": "s3cret" }
   Response: { "token": "<token>" }

- Upload a CSV (authenticated):

   POST /api/uploads/
   Authorization: Token <token>
   Content-Type: multipart/form-data
   Form field: file=@customers.csv
   Response: 201 Created (UploadedCSV resource)

- Save a dashboard (authenticated):

   POST /api/dashboards/
   Authorization: Token <token>
   Content-Type: application/json
   Body: { "name": "My Scenario", "config": { ... } }
   Response: 201 Created (Dashboard resource)

   - Cookie-based auth helpers:

      POST /api/login-cookie/  (body: { username, password }) — sets HttpOnly cookie "auth_token" and returns token in body.
      POST /api/logout-cookie/ — clears the cookie.
      GET  /api/me/ — returns { user: { username } } when authenticated via cookie or token.

   Developer notes:

   - An integration test `api/tests.py::APIPersistenceTests::test_login_upload_save_flow` performs a server-side E2E test (register → token auth → upload → save). CI runs the Django tests as part of the `backend-tests` job.

Seeding a local demo org & user
-------------------------------

For local development we included a management command to create a demo org and demo user. Run inside your virtualenv:

```powershell
python manage.py create_demo_org
# then print the token for the demo user
python - <<'PY'
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
u = get_user_model().objects.get(username='demo')
print('demo token:', Token.objects.get_or_create(user=u)[0].key)
PY
```

Notes
-----

- The server-side API enforces tenant isolation: users are scoped to their organization and may only see uploads and dashboards for their org.
- For quick local testing the frontend will fall back to localStorage when not authenticated.

E2E & Auth (new)
---------------

Recent changes in this branch introduce cookie-based JWT authentication and an end-to-end test scaffold using Playwright.

- Auth flow (browser-safe):
   - POST `/api/login-cookie/` now issues HttpOnly cookies: `access_token` (short-lived) and `refresh_token` (longer-lived). The frontend calls `/api/me/` to determine user state.
   - POST `/api/token/refresh-cookie/` rotates the refresh token (if configured) and sets a new `access_token` cookie. The client includes `credentials: 'same-origin'` so cookies are sent automatically.
   - POST `/api/token/logout/` blacklists the refresh token server-side (requires `rest_framework_simplejwt.token_blacklist` app) and clears both cookies.

- Frontend behavior:
   - `client/src/utils/auth.js` provides `apiFetch` which will attempt one refresh using `/api/token/refresh-cookie/` when it receives a 401 from the API and then retry the original request once.
   - `client/src/App.jsx` merges server-saved dashboards into the local scenario list on mount when authenticated.

- Running E2E locally (developer quickstart):
   1. Start the Django backend (from repo root):

```powershell
& venv\Scripts\Activate.ps1
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

   2. In a separate shell, build and serve the client:

```powershell
cd client
npm ci
npm run build
npx serve -s build -l 3000
```

   3. Run Playwright tests:

```powershell
cd client
npx playwright test
```

- CI notes:
   - A GitHub Actions workflow `.github/workflows/playwright.yml` is included to run Playwright E2E on pushes/PRs to `master`. It builds the client, starts a static server on `:3000`, runs Django on `:8000`, and executes Playwright tests (Chromium-only by default in the config).

   Local auto-run helper
   ---------------------

   I added a convenience PowerShell helper to run E2E locally and auto-start required services. From the repository root run:

   ```powershell
   & .\client\e2e\run_e2e_local.ps1
   ```

   This will: build the client, start Django (127.0.0.1:8000) and a static server for the client (127.0.0.1:3000), then run the Playwright test. It sets `E2E_AUTO_START=1` for the test so the test knows to clean up processes when finished. Note: on Windows you may need to run PowerShell as Administrator to start background processes.

Limitations & next steps
------------------------
- Playwright tests are a scaffold and conservative: they register a test user via the backend API and exercise the upload and flow. You may want to harden selectors and extend assertions to validate server-side dashboard creation and listing.
- In CI we currently build the client and serve it with `serve`. For an integrated test suite you can also run the dev server in the container, or use Docker to orchestrate services.


