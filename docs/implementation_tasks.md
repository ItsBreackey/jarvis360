Implementation Tasks — prioritized PR checklist
===============================================

This file lists small, PR-sized tasks converted from the feature roadmap. Each task is intended to be clear, testable, and small enough to review quickly.

Top immediate PRs (priority order)
---------------------------------

PR A.1 — Automations: finalize models + migrations (backend)
- Scope: finalize `Automation` and `AutomationExecution` Django models, add migrations, wire admin registration, add `api/automations` URLs and a basic DRF viewset/list-create.
- Acceptance: `python manage.py migrate` creates tables; `GET /api/automations/` returns 200 and JSON list.
- Labels: backend, db
- Estimate: 0.5–1 day

PR A.2 — Automations: frontend list/create (frontend)
- Scope: `client/src/pages/Automations.jsx` to list automations and open a modal/form to create one (name + NL description).
- Acceptance: create form posts to API; list updates.
- Labels: frontend, ux
- Estimate: 1 day

PR A.3 — Automations: run endpoint + Celery stub (backend)
- Scope: add `POST /api/automations/:id/run/` that enqueues a Celery task; provide `dry_run` flag and a synchronous fallback if Celery isn't running.
- Acceptance: POST returns 202 if queued or 200 in sync/dev; execution row created.
- Labels: backend, celery
- Estimate: 1 day

PR B.1 — Insights: CSV upload endpoint (backend)
- Scope: `/api/insights/` accepts CSV file, runs `analyze_dataframe`, and returns `{ sample, charts, summary }`.
- Acceptance: returns JSON structure and status 200.
- Labels: backend, analytics
- Estimate: 1–2 days

PR B.2 — Insights UI: upload + preview (frontend)
- Scope: minimal page to upload CSV, show sample rows, display suggested charts and a one-click 'create automation' button.
- Acceptance: page demonstrates full flow with sample CSV.
- Labels: frontend
- Estimate: 1–2 days

PR C.1 — Feedback: CSV ingestion + lexicon sentiment (backend)
- Scope: upload endpoint for feedback CSV; returns sentiment counts and top-3 keywords.
- Acceptance: can upload and receive sentiment JSON.
- Labels: backend, nlp
- Estimate: 1 day

Infra PR infra.1 — Connector developer playbook (devops/docs)
- Scope: `docs/CONNECTORS.md` with steps to provision test Gmail/Sheets credentials and `.env.example` for local dev.
- Acceptance: developer can follow steps and store test creds locally.
- Estimate: 0.5 day

Cross-cutting tasks (follow-up)
-------------------------------
- Add unit tests for automations model and run API (backend).
- Add Playwright e2e spec: create automation -> run -> view execution log.
- Add `dry_run` mode to automation run endpoint and UI.
- Add fixtures under `datasets/fixtures/`.

How to use this checklist
-------------------------
- Pick the next-highest PR (A.1 recommended).
- Create a branch `feature/a-1-automations-models`.
- Implement and include tests where reasonable.
- Run local migrations and start the dev server for a smoke test.
- Open PR and reference this file in the description with the acceptance criteria.
