Simulation & Sandbox Plan — jArvIs360
======================================

Purpose
-------
Provide a reproducible local developer sandbox to exercise Automations, Insights, Feedback ingestion, and Predictive flows without requiring live connector credentials. The simulation harness lets devs and CI smoke-test end-to-end flows using mock connectors and pre-baked fixtures.

High-level components
---------------------
- datasets/
  - fixtures/sales_sample.csv
  - fixtures/feedback_sample.csv
  - fixtures/transactions_sample.csv

- scripts/start_simulation.ps1
  - Starts lightweight mock connector servers (Gmail/Sheets/WhatsApp/M-Pesa emulators) and any helper static servers.

- scripts/dev_runner.py
  - Developer runner that performs a smoke sequence:
    1. Create an Automation via the API (POST /api/automations/)
    2. Upload a CSV to /api/insights/ and capture the returned suggested automation
    3. Create the suggested automation
    4. POST /api/automations/:id/run/ with `dry_run=true`
    5. Poll /api/automations/:id/executions/ and write a summary to `client/test-results/dev_run.json`

- scripts/mock_connectors/
  - Simple mock servers (Flask or express) that implement minimal endpoints expected by the adapter interface and return deterministic responses. Keep them simple so they can be run in PowerShell on Windows.

Developer usage (local)
-----------------------
1. Prepare environment

```powershell
# from repo root
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd client
npm ci
cd ..
```

2. Start the Django dev server (in one terminal)

```powershell
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

3. Start mock connectors and the dev runner (new terminal)

```powershell
# starts mock connectors and helper servers
scripts\start_simulation.ps1
# run dev runner to exercise flows
python scripts\dev_runner.py
```

CI integration
--------------
- Add a lightweight CI job that runs `python scripts/dev_runner.py` after migrations. Use mocks instead of real connectors. The job should produce `client/test-results/dev_run.json` as an artifact.

Fixtures & test data
--------------------
- Add example CSVs under `datasets/fixtures/` for sales, feedback, and transactions. Keep them small (<200 rows) and representative.

Acceptance criteria
-------------------
- Running `scripts/start_simulation.ps1` and `python scripts/dev_runner.py` completes a smoke run that:
  - creates an automation
  - uploads CSV and receives suggestions
  - runs automation in dry-run mode
  - writes execution summary file under `client/test-results/`
- CI job can run the dev runner and assert the output JSON contains an execution with `status` in ["queued", "success", "failed"].

Notes & security
----------------
- Mock connectors must never accept real credentials. They should be isolated in the dev environment and clearly documented as mock-only.
- When moving to real connectors, follow the security checklist in `docs/CONNECTORS.md` (OAuth client IDs, secrets, encrypted storage, and RBAC).
