# Feature Roadmap — jArvIs360

This consolidated roadmap contains the high-level feature specs (A–E) and an actionable implementation plan plus a developer simulation/sandbox plan so the work can be executed and validated locally and in CI.

---

## Feature A — Data-Driven Business Process Automations for SMEs

Summary
- Turn jArvIs360 into a lightweight automation platform where users can define automations ("skills") that run on schedules, triggers, or on-demand. Examples: onboarding staff, weekly sales reports, follow-up emails.

Why it matters
- High business value: automations reduce manual work and create a direct path to monetization (automation credits, premium connectors).

Components
- Backend: models for `Automation` & `AutomationExecution`, Celery tasks, secure connectors (OAuth+secrets), job scheduler (Celery beat or hosted scheduling), audit logs.
- Frontend: Automations UI (create, list, run, history), settings for connectors and secrets, run reports.
- Integrations: Gmail, Google Sheets, WhatsApp Business, M-Pesa (adapter stubs), Drive.

Acceptance criteria
1. Users can create a new Automation (name + natural-language description) in the UI and persist it to the API.
2. Users can trigger a run on-demand; a background worker executes the automation and an execution log is written.
3. Scheduled runs can be created and show next run time (MVP: human-readable schedule string accepted; later add structured schedules).
4. Execution logs are viewable with success/failure and basic result payload.

Milestones (suggested)
- M1 (MVP): models + simple UI + Celery task stub + run endpoint (scaffolding present).
- M2: Add connectors interface and a Gmail/Sheets stub using dev credentials.
- M3: Add scheduling (Celery beat) and UI to show schedule + next run.
- M4: Secure secrets storage and connector management UI.

Risks
- Connectors need credentials and careful security handling. OAuth flows require app registration and developer accounts.
- Automated actions can incur costs or send messages — need rate-limits and dry-run modes.

Next steps / first tasks
1. Scaffolding: models, serializers, API endpoints, Celery task stub, simple Automations frontend page.
2. Implement a simple NL -> action parser (rule-based) to turn natural-language into a small actions JSON.
3. Add tests for execution logging and run endpoint.
4. Plan secure storage for connector secrets (encrypted fields or secrets manager integration).

---

## Feature B — Data Insights-as-a-Service (for Non-Analysts)

Summary
- Provide an "Insights" panel where users upload/link data and jArvIs360 automatically cleans the data, generates suggested charts, writes a plain-English explanation, and suggests actions (which can map to automations).

Why it matters
- Expands the product toward analysts and non-analysts: customers get actionable insights without building dashboards.

Components
- Backend: endpoints to accept CSVs or data links, data-cleaning pipeline (reuse analysis.* utilities), chart suggestion engine, AI summary generator (LLM adapter), result caching.
- Frontend: Insights panel, chart previews, explainers, "create automation" suggestion flow.

Acceptance criteria
1. Users can upload a CSV to `/api/insights/` and receive a JSON response containing: cleaned sample, suggested charts, key stats, and a short plain-English summary.
2. UI displays suggestions and allows user to export chart, download cleaned CSV, or create a suggested automation (MVP: create automation pre-filled with suggested NL and actions).

Milestones
- M1: Endpoint to accept CSV and return analytic summary (reuse `analyze_dataframe`).
- M2: UI panel that consumes endpoint and shows charts+explanations.
- M3: Action suggestions + one-click create automation path.

Next steps
1. Add `/api/insights/` endpoint and wire into the frontend as an "Insights" panel.
2. Reuse `analyze_dataframe` and expand to chart suggestions (heuristic rules for x/y detection).
3. Prototype LLM adapter for improved explanations (abstracted as a pluggable service).

---

## Feature C — Customer Feedback Intelligence

Summary
- Ingest feedback (Google Forms, WhatsApp, email), auto-summarize reviews, extract sentiment and topics, and surface alerts/automation triggers (e.g., when negative sentiment exceeds a threshold).

Why it matters
- Provides customer intelligence and early warning signals for churn or product issues.

Components
- Backend: ingestion endpoints, sentiment analysis (lexicon or ML), summarization pipeline, dashboard endpoint for trends.
- Frontend: Feedback Intelligence panel, trends & alerting UI.
- Integrations: Google Forms, Gmail ingestion, WhatsApp Business API connector.

Acceptance criteria
1. Users can connect a source (or upload a CSV of feedback) and view summarized sentiment trends.
2. The system produces a top-3 topics summary and a time-series sentiment chart.
3. Alerts can be configured based on thresholds and optionally create an automation when triggered.

Milestones
- M1: CSV upload + simple lexicon sentiment summary + UI.
- M2: Add connectors for Gmail/Forms ingestion and periodic polling.
- M3: Add topic extraction (NLP) and alerting rules + automation hooks.

---

## Feature D — Freelancer/Consultant Analytics Dashboard

Summary
- A lighter-weight product (or sub-product) targeted at freelancers: connect payment sources (PayPal, M-Pesa, Upwork, Sheets) and show income, client analytics, and forecasting.

Why it matters
- Opens a new TAM (freelancers/consultants) and provides a monetizable product variant.

Components
- Backend: connectors/adapters for PayPal/M-Pesa/Upwork, normalized income model, forecasting utilities.
- Frontend: simplified dashboard, income timeline, client insights and invoicing reminders.

Acceptance criteria
1. Users can connect a CSV or a sheet and see income summary and a simple income forecast.
2. Forecast uses simple time-series methods and shows confidence intervals (MVP: naive extrapolation).

---

## Feature E — Predictive Insights (Niche Analytics)

Summary
- Add forecasting & predictive modules (sales, churn, demand) with industry templates (real estate, retail, education). These are paid upgrades that provide forecasts and suggested actions.

Why it matters
- Moves the product upmarket and enables an upgrade path; advanced analytics is a clear monetization vector.

Components
- Backend: forecasting pipelines (Prophet, ARIMA, or ML), model management, templated feature engineering for industries.
- Frontend: Predictive Insights panel, model selection UI, interactive parameter tuning.

Acceptance criteria
1. Users can select a dataset and run a forecast job that returns a forecast series and basic accuracy metrics.
2. UI displays the forecast with a confidence band and a short natural-language summary of the key findings.

---

# Actionable Implementation Plan (PR-sized tasks)

This section converts the high-level roadmap into a prioritized list of small, reviewable PRs with acceptance criteria, estimates, and recommended owners.

Top immediate PRs (first 8 — highest impact)

1) PR A.1 — Automations: finalize models + migrations (backend)
- Scope: finalize `Automation` and `AutomationExecution` Django models, add migrations, wire admin registration, add `api/automations` URLs and a basic DRF viewset/list-create.
- Acceptance: `python manage.py migrate` creates tables; `GET /api/automations/` returns 200 and JSON list.
- Labels: backend, db
- Estimate: 0.5–1 day

2) PR A.2 — Automations: frontend list/create (frontend)
- Scope: `client/src/pages/Automations.jsx` to list automations and open a modal/form to create one (name + NL description).
- Acceptance: create form posts to API; list updates.
- Labels: frontend, ux
- Estimate: 1 day

3) PR A.3 — Automations: run endpoint + Celery stub (backend)
- Scope: add `POST /api/automations/:id/run/` that enqueues a Celery task; provide `dry_run` flag and a synchronous fallback if Celery isn't running.
- Acceptance: POST returns 202 if queued or 200 in sync/dev; execution row created.
- Labels: backend, celery
- Estimate: 1 day

4) PR B.1 — Insights: CSV upload endpoint (backend)
- Scope: `/api/insights/` accepts CSV file, runs `analyze_dataframe`, and returns `{ sample, charts, summary }`.
- Acceptance: returns JSON structure and status 200.
- Labels: backend, analytics
- Estimate: 1–2 days

5) PR B.2 — Insights UI: upload + preview (frontend)
- Scope: minimal page to upload CSV, show `sample` rows, display suggested charts and a button to 'Create suggested automation'.
- Acceptance: page demonstrates full flow with sample CSV.
- Labels: frontend
- Estimate: 1–2 days

6) PR C.1 — Feedback: CSV ingestion + lexicon sentiment (backend)
- Scope: upload endpoint for feedback CSV; returns sentiment counts and top-3 keywords.
- Acceptance: can upload and receive sentiment JSON.
- Labels: backend, nlp
- Estimate: 1 day

7) Infra PR infra.1 — Connector developer playbook (devops/docs)
- Scope: `docs/CONNECTORS.md` with steps to provision test Gmail/Sheets credentials and `.env.example` for local dev.
- Acceptance: developer can follow the doc to add test creds locally.
- Estimate: 0.5 day

8) Cross-cutting: tests and e2e spec (CI)
- Scope: Add unit tests for automations model/run API and a Playwright e2e that exercises create->run->execution flow with mock connectors.
- Acceptance: tests run in CI, produce artifacts/logs on failure.
- Estimate: 1–2 days

Cross-cutting small tasks (1-day or less)
- Add unit tests for automations model serialization and run API (backend).
- Add Playwright e2e spec: create automation -> run -> view execution log.
- Add `dry_run` mode to automation run endpoint and UI.
- Add fixtures under `datasets/fixtures/`.

## NL -> Actions parser roadmap (iterative)

- Stage 1 (rule-based): small deterministic rules mapping common phrases to action templates. (1–2 days)
- Stage 2 (slot-filling): regex/heuristic extraction for dates, frequencies, and recipients. (2–3 days)
- Stage 3 (LLM adapter): optional LLM-backed parser that emits validated action JSON; abstract adapter interface to swap providers. (3–5 days)

## Connectors (stubs → secure adapters)

- Phase 1: Adapter stubs (Gmail, Sheets, WhatsApp, M-Pesa) for dev mode that return deterministic responses. Add unit tests. (2–3 days)
- Phase 2: OAuth flows, encrypted secret storage, rate-limits, and webhook handling for production connectors. (5–10 days per connector)

---

# Simulation & Sandbox (developer harness)

Goal: provide a reproducible local simulation environment so developers can exercise Automations, Insights, Feedback ingestion, and Predictive flows without live credentials.

Recommended artifacts (repo additions)
1. `docs/simulation_plan.md` — detailed steps (already added).
2. `scripts/start_simulation.ps1` — starts mock connector servers (simple Flask/Express mocks) and helper static servers.
3. `scripts/dev_runner.py` — performs smoke scenarios: create automation -> upload CSV to insights -> create suggested automation -> run automation (dry_run) -> save `client/test-results/dev_run.json`.
4. `scripts/mock_connectors/` — lightweight mocks for Gmail/Sheets/WhatsApp/M-Pesa.

Acceptance criteria for simulation harness
- Developers can run `scripts/start_simulation.ps1` and `python scripts/dev_runner.py` and observe a successful run that exercises Automations and Insights without external APIs.
- CI job can reuse the same runner to smoke-test core flows and upload `client/test-results/dev_run.json` as an artifact.

Quick-win UX improvements (1-day PRs)
- Ensure `/automations` is discoverable in the main nav and add an e2e test that visits the page.
- Add a 'dry run' flag to the run endpoint and the UI.
- Add fixtures under `datasets/fixtures/` (sales_sample.csv, feedback_sample.csv).

Next steps (how I can proceed now)
1. Implement `scripts/dev_runner.py` and `scripts/start_simulation.ps1` skeletons and add fixtures under `datasets/fixtures/`.
2. Open PR A.1: finalize models, create migrations, run them locally, and report results.
3. Implement NL parser Stage 1 (rule-based) and add unit tests.

---

# Where to track progress
Use this file for high-level milestones and link to concrete issues/PRs in the repo. Add PR/issue links inline under each milestone when work begins.
