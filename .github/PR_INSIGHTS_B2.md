Title: Feature B.2 — Insights: ARR/MRR calculation and API

Summary
-------
This PR collects the scaffold and tests for the Insights work (B.1–B.3) and prepares the code for integration into mainline. The branch will include:

- Service implementation: `api/services/insights.py` (compute_org_kpis)
- API wiring: `api/views.py` (`ARRSummaryAPIView` / `insights` endpoint)
- Serializers: `api/serializers.py` additions (InsightsSerializer)
- Unit + integration tests: `api/tests/test_insights_*` (scoping, since-filter, edge cases, large-data)
- Documentation: acceptance criteria and examples in `docs/implementation_tasks.md` and `docs/feature_roadmap_combined.md`.

What this PR will change
------------------------
- Adds/updates the centralized insights service used by `ARRSummaryAPIView` used by the frontend dashboard.
- Adds tests covering org scoping, since filter, permission checks, and aggregation correctness.
- Adds OpenAPI annotations and example responses to improve schema generation.

Acceptance criteria (before merge)
----------------------------------
- All unit and integration tests pass locally and in CI (insights tests included).
- `schema.json` generation via `python scripts/generate_schema.py` runs without drf-spectacular warnings for the changed endpoints.
- No eager Celery or external broker imports occur during test runs.
- New code includes docstrings and minimal inline comments explaining behavior and edge cases.

How I tested locally
--------------------
- Ran the per-module test runner (`python scripts/run_tests_per_module.py`) and inspected outputs for the `api.tests.test_insights_*` modules.
- Verified `compute_org_kpis` returns zeroed KPIs when no subscriptions exist, correct scoping per-organization, and that the `since` query param filters subscriptions.

Follow-ups / TODOs
------------------
- B.4: add additional heavy-integration tests for large datasets and performance characterization (can be marked integration-only in CI).
- CI: add a GitHub Actions job that runs tests and regenerates `schema.json`.

Notes for reviewers
------------------
- The branch is based on `master` and does not include the recent automation-mock-fix changes (those exist on a separate branch). If you want the automation test improvements included, merge that branch first or rebase accordingly.

Commands I ran locally
----------------------
```powershell
# create branch locally (already performed by this agent)
git checkout master; git pull origin master; git checkout -b feature/insights-b2
# commit files for the branch
# push
git push --set-upstream origin feature/insights-b2
```

Next steps
----------
- Open the PR from branch `feature/insights-b2` to `master` on GitHub and assign reviewers.
- Iterate on reviewer feedback and run CI; I can help with any follow-up fixes.
