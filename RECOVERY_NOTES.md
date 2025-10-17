Recovery snapshot
=================

Branch: recovery/restore-files-2025-10-17

Restored files (from history):
- client/src/App.jsx (from f206ed8)
- client/src/utils/analytics.js (from f206ed8)
- client/src/workers/bootstrapHoltWorker.js (from 0eb0ac7)
- client/src/utils/summarizer.js (from f206ed8)
- client/src/ChurnChart.jsx (from 0eb0ac7)
- client/src/Toast.jsx (from f206ed8)
- client/src/__tests__/computeMonthlySeries.test.js (from 0eb0ac7)
- client/src/__tests__/computeMonthlySeries_edge.test.js (from f206ed8)
- client/src/__tests__/linearForecast.test.js (from 0eb0ac7)
- client/src/__tests__/holt.test.js (from 0eb0ac7)
- client/src/__tests__/summarizer.test.js (from f206ed8)
- client/package.json (from f206ed8)
- client/PINNED_VERSIONS.md (from 0eb0ac7)
- client/EXPORT_NOTES.md (from f206ed8)
- client/src/firebaseConfig.js (from f206ed8)
- client/.env.example (from f206ed8)
- client/.gitignore (from f206ed8)
- api/views.py (from f206ed8)
- api/tests.py (from f206ed8)
- api/urls.py (from f206ed8)
- api/auth.py (from f206ed8)
- analysis/__init__.py (from 64640c6)
- analysis/urls.py (from 86ab099)
- analysis/migrations/__init__.py (from 64640c6)
- scripts/post_overview.py (from f206ed8)
- scripts/post_overview_capture.py (from f206ed8)
- test_overview.csv (from f206ed8)
- docs/System_Documentation.md (from f206ed8)
- jarvis360/settings.py (from f206ed8)
- .gitignore (from f206ed8)
- requirements.txt (from f206ed8)

Notes:
- I did not restore any .env or credential files. The client `.env.example` was restored as a template.
- The recovery operation checked out the listed files from the last commit that touched them and left them in the current working tree on the recovery branch.
- Django tests: no tests discovered in the current tree ("NO TESTS RAN").
- Client tests: ran but multiple suites failed. See test output in terminal for details. Likely root cause: mismatched exports/imports between modules; I can attempt to fix and re-run tests if you want.

Next steps suggested:
1. Fix failing client unit tests (likely missing named/default exports in `client/src/utils/analytics.js` or `client/src/forecast.js`).
2. Run `npm install` in `client` and re-run tests if there are missing deps.
3. Run a full client build (`npm run build`) and run the API smoke test (`scripts/post_overview.py`).

If you want me to proceed, say "Fix client tests now" or "Stop; don't change anything else".
