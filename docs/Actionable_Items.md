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
