Title: Feature B.2 — Insights: ARR/MRR calculation, API, and tests

Summary
-------
This PR bundles the Insights work (B.1–B.4) and makes the feature self-contained for review. Key contents:

- Service implementation: `api/services/insights.py` (compute_org_kpis)
- API wiring and small view fixes: `api/views.py` (`ARRSummaryAPIView` / `insights` endpoint) — includes `since` filtering for subscriptions and a safer task-resolution change used by automations tests.
- Serializers: `api/serializers.py` additions (InsightsSerializer and response helpers)
- Tests: `api/tests/test_insights_*` (scoping, since-filter, edge cases, service unit tests) and regression tests for automation run mocking.

What changed
------------
- Added `compute_org_kpis()` to centralize MRR/ARR calculation and top-customer selection.
- Wired the `insights` (ARR summary) endpoint and added an optional `since` query param to limit subscriptions by `start_date`.
- Added comprehensive tests that assert org scoping, `since` filtering, edge-case behavior (no subscriptions, zero MRR), and that the Automation run view respects different patch targets used by tests.
- Minor URL/view fixes to use the actual function-based auth helpers (avoids ImportError during test startup).

Test & verification
-------------------
- I ran the project's per-module test runner: `python scripts/run_tests_per_module.py` on Windows (unittest discovery is flaky on Windows; the per-module runner avoids that). Result: All test modules passed locally.
- Verified the insights tests specifically pass and that `compute_org_kpis` behaves correctly in unit tests.
- No database migrations are included in this change.

Acceptance criteria
-------------------
- All unit and integration tests pass locally and in CI (insights and related API/tests).
- `schema.json` generation via `python scripts/generate_schema.py` completes without drf-spectacular warnings related to the changed endpoints.
- No eager Celery or external broker imports occur during test runs (we avoid importing Celery tasks at module load and expose a module-level symbol for tests to patch).

Notes for reviewers
-------------------
- This branch is self-contained for the Insights feature; it intentionally does not include unrelated automation-mock-fix changes. If you want both sets of fixes in one PR, either merge the automation branch first or request that I open a combined PR.
- Files to focus on for a quick review:
	- `api/services/insights.py` — core logic (compute_org_kpis)
	- `api/views.py` — how the insights endpoint collects and filters subscriptions; small changes to task resolution for automations tests
	- `api/serializers.py` — response shapes and examples for OpenAPI
	- `api/tests/test_insights_*` — tests that define expected behavior and edge cases

How to run the tests locally (Windows PowerShell)
-----------------------------------------------
```powershell
# use the per-module test runner (recommended on Windows)
python scripts/run_tests_per_module.py

# or run Django tests (may require fixing discovery on Windows):
python manage.py test
```

Next steps
----------
- Open/refresh the PR on GitHub (pushing this file updates the PR body). The branch has already been pushed to `feature/insights-b2`.
- Add a CI workflow that runs the per-module test runner and regenerates `schema.json` (I can add this as a follow-up PR).
- After review feedback, I can iterate on fixes and follow-ups (large-scale performance tests, caching, dashboard UI examples).

PR URL (opens a new PR if one is not already open):

https://github.com/ItsBreackey/jarvis360/pull/new/feature/insights-b2

Thank you — let me know if you want me to also add a GitHub Actions job to run the tests and schema generation as part of this PR.
