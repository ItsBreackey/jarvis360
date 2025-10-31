E2E (Playwright) - local run instructions
=========================================

Quick steps to run Playwright e2e tests locally:

- Ensure Python virtualenv is activated and Django dependencies are installed (project root):

  ```powershell
  & venv\Scripts\Activate.ps1
  pip install -r requirements.txt
  python manage.py migrate
  ```

- From `client/` install node deps and browsers:

  ```powershell
  cd client
  npm ci
  npx playwright install --with-deps
  npm run build
  npm run e2e:serve   # optional: serves the built site at http://127.0.0.1:3000
  ```

- Run Playwright (if you started servers manually, just run):

  ```powershell
  npx playwright test e2e/tests/login_upload_save.spec.js --project=chromium --reporter=list
  ```

Auto-start option (best-effort)
------------------------------
The e2e test supports a best-effort auto-start when `E2E_AUTO_START=1` is set. It will spawn Django and a static server and pipe their logs into `client/test-results/*.log`.

Example (PowerShell):

```powershell
$env:E2E_AUTO_START='1'
cd client
npx playwright test e2e/tests/login_upload_save.spec.js --project=chromium --reporter=list
```

If services fail to start, check `client/test-results/django.log` and `client/test-results/serve.log` for details.
