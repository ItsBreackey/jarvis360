# Forecasting Runbook

Last updated: 2025-10-16

Purpose
- Provide engineers and product owners a compact reference for how forecasting works in Jarvis360, what inputs matter, common pitfalls, and quick troubleshooting steps.

Models supported
- Linear OLS (index → value)
  - Simple ordinary least-squares regression on a time index.
  - Good for long-term steady trends with monotonic growth/decline.
- Holt Linear (double exponential smoothing)
  - Captures level and trend components; better for short-to-medium horizons.
  - Supports alpha/beta tuning and bootstrap confidence intervals.

Data expectations
- Input: records with a date-like field and an MRR/amount field. Dates should be ISO-8601 (YYYY-MM-DD) where possible.
- Aggregation: `computeMonthlySeries(records)` groups records by month (YYYY-MM) and sums MRR to produce monthly totals.
- Minimum data: 3+ months for Holt tuning; 6+ months recommended for stable CI estimates.

Parameters exposed to users
- monthsOut: months to forecast (1–36)
- method: `linear` or `holt`
- holtAlpha / holtBeta: smoothing parameters (0.01–1.0)
- holtBootstrap: whether to compute bootstrap-based CI
- holtBootstrapSamples: number of bootstrap samples (50–2000)
- holtBootstrapAsync: run bootstrap in an async worker-like path to avoid blocking UI

Quick troubleshooting
- Forecast missing or empty:
  - Verify `computeMonthlySeries` produced a non-empty monthlySeries (check for parsable dates).
  - Confirm monthsOut > 0 and series contains numeric totals.
- Slow UI when computing CI:
  - Enable Async Bootstrap (toggle in UI) or reduce sample count.
  - Use the Cancel CI button to revoke long-running computations.
- "Maximum update depth exceeded" loop:
  - Ensure parent data (`records` or `monthlySeries`) isn't recreated each render. Memoize upstream data with `useMemo` or pass stable references.
  - The app includes a streaming input-key guard; ensure you don't mutate the logged-in state or toasts in a way that changes identities every render.

Developer checks
- Unit tests:
  - `client/src/__tests__/computeMonthlySeries.test.js` validates aggregation.
  - `client/src/__tests__/holt.test.js` checks Holt forecast results.
- Async bootstrap
  - `client/src/__tests__/forecast_async.test.js` exercises the Promise-style async bootstrap and ensures revoke semantics.
- Performance:
  - `client/src/__tests__/streamingHash.test.js` is a micro-benchmark for the streaming hash used to detect meaningful input changes.

Implementation notes
- Core algorithms live in `client/src/utils/analytics.js` and are wrapped by `client/src/utils/forecast.js` which normalizes inputs and exposes a consistent return shape.
- For heavy or server-side forecasting (Prophet, ARIMA), move computation to the backend or use a separate worker with transferable memory to avoid blocking the main thread.

When to escalate to backend
- Large datasets (>100k rows) where browser memory or CPU becomes a bottleneck.
- Need for scheduled recurring forecasts, model retraining, or storing historical forecast accuracy metrics.

Contacts
- Prefer opening a PR and tagging the project owner for review when changing forecasting logic or CI parameters.
