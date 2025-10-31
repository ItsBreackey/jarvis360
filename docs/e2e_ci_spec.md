E2E & CI stabilization spec
============================

Goal
----
Make Playwright-based end-to-end tests reliable both locally and in CI. Provide developer-friendly commands, capture logs/artifacts for failures, and add a sample CI workflow suitable for GitHub Actions.

Acceptance criteria
-------------------
- Playwright tests run locally via `cd client; npx playwright test` when services are available.
- Tests can optionally auto-start the static client server when a built `client/build` dir exists (Playwright webServer handles this).
- When `E2E_AUTO_START=1` the local test will attempt to spawn Django and the static server; their stdout/stderr must be saved under `client/test-results/` for debugging.
- A reference GitHub Actions workflow exists that demonstrates how to build the client, run migrations, start servers, install Playwright browsers, and execute the test suite.

Implementation notes
--------------------
- Use Playwright's `webServer` option to start/attach to a static server for the client at port 3000. Set `reuseExistingServer: true` so local dev servers are not re-created.
- Keep the e2e tests resilient: prefer Playwright locators, long-ish polling for server readiness, and clear debug artifact outputs.
- Capture spawned process logs (Django and static server) to `client/test-results/*.log` when auto-starting.
- Provide an optional helper PowerShell script at `scripts/start_e2e_env.ps1` to start services manually for development.

CI considerations
-----------------
- In CI, start both Django and the static client server in the background before running Playwright. Use SQLite for DB to avoid heavy infra in CI when possible.
- Ensure Python dependencies are installed, run `manage.py migrate`, and build the client before starting a static server.
- Always install Playwright browsers (npx playwright install --with-deps) in CI before running tests.

Next steps
----------
1. Iterate on the sample GitHub Actions workflow with project-specific adjustments (secrets, environment variables).  
2. Add test markers to isolate slow e2e tests and speed up CI by gating them separately.  
3. Optionally, provide a Docker-based test runner image for more reproducible CI runs.
