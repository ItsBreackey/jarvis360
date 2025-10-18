E2E Test runbook

Overview
- Tests live under `client/e2e/tests/` and use Playwright to exercise the static build (`client/build`) served at http://127.0.0.1:3000 and the Django API at http://127.0.0.1:8000 by default.

Common commands
- Build the client (ensure the seeding hook is included):

```powershell
cd client
npm run build
```

- Run the Django server (in project root):

```powershell
& venv\Scripts\Activate.ps1
python manage.py migrate --noinput
python manage.py runserver 127.0.0.1:8000
```

- Serve the static client (if not using `serve` from Playwright):

```powershell
cd client
npx serve -s build -l 3000
```

- Run a single Playwright spec (from `client`):

```powershell
cd client
npx playwright test e2e/tests/login_upload_save.spec.js -g "register -> login via API cookies -> upload -> save scenario -> server has dashboard" --workers=1 --trace=on --reporter=list
```

Debugging & artifacts
- When tests run, Playwright writes artifacts to `client/test-results/` or `client/client/test-results/` depending on the CWD used by the runner. If you forced fallback in earlier runs you may find debug files such as:
  - `debug-token.txt` - token-auth response body and status
  - `debug-create.txt` - dashboard create response
  - `debug-list.txt` - dashboard list response
- If the UI path fails (Save button missing), the test now tries deterministic pre-seed via `localStorage['jarvis_e2e_seed']` and will call `window.seedInitialData()` if present.

Forcing fallback (developer use only)
- You can force server-side fallback by setting the env var when running the test (historical debug mode). The test previously accepted `E2E_FORCE_FALLBACK=1` to force fallback; prefer using the UI-first flow.

API integration check (fast, non-browser)
- The repository contains a small script to check token-auth and dashboard create/list behavior:

```powershell
node scripts/api_check.js http://127.0.0.1:8000 <username> <password>
```

Notes
- The app exposes `window.seedInitialData()` (production build included) and reads `localStorage['jarvis_e2e_seed']` at mount to allow deterministic seeding for E2E runs.
- If you change `client/src/App.jsx`, rebuild the client so Playwright runs against the current build.
