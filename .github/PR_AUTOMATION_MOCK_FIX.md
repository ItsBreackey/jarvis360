Title: Make AutomationRun endpoint robust for unit tests (avoid Celery import + respect mocks)

Summary
-------
This PR fixes test flakiness and avoids importing Celery/kombu during test runs by changing how the Automation run endpoint resolves the background task.

What I changed
-------------
- `api/views.py`
  - Removed the eager import of `automation_execute_task` at module import time.
  - Exposed `automation_execute_task = None` at module level so tests can patch `api.views.automation_execute_task` reliably.
  - Implemented a safe runtime resolution in `AutomationRunAPIView.post()` that:
    - prefers any already-imported `api.tasks.automation_execute_task` (so tests patching `api.tasks` are honored),
    - prefers a patched `api.views.automation_execute_task` when present (so tests patching the view-level symbol are honored),
    - avoids importing `api.tasks` unless necessary to prevent initializing Celery/kombu during tests, and
    - falls back to running the synchronous `_execute_automation_sync` when enqueueing fails.

Why
---
- Tests in this repo sometimes patch `api.views.automation_execute_task` and sometimes `api.tasks.automation_execute_task`. Importing/re-binding the real task at module import time caused some mocks to be bypassed.
- Importing `api.tasks` during tests can trigger Celery/kombu to try and initialize transports (redis) and crash in lightweight test environments.
- This change makes the view deterministic and test-friendly while keeping the runtime behavior unchanged for production (the view still attempts to enqueue the Celery task and falls back to sync execution).

Tests run
---------
- Ran the project per-module test runner (`python scripts/run_tests_per_module.py`): all modules in the suite passed locally (automation unit & integration tests included).
- Ran `python -m py_compile api/views.py` to ensure syntax correctness.

Follow-ups / suggestions
-----------------------
- Consider documenting the preferred mocking pattern in CONTRIBUTING.md (either patch `api.tasks` or `api.views`), and why the runtime resolution is implemented this way.
- Optionally add a small unit test that asserts the view uses the patched symbol (both variants) to prevent regressions.

If you want, I can push this branch to origin and open the GitHub PR; let me know if you'd like me to push (I may need credentials/access) or if you prefer to push from your machine.