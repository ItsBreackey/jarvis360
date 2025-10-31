# Operational Notes — jArvIs360

A compact reference of keys, helpers, and behaviors used across the client for persistence and events.

## localStorage keys (short)
- `jarvis_saved_scenarios_v1` — canonical list of saved scenarios. Each item shape expected:
  {
    id: string, // may be temporary optimistic id or canonical server id
    title: string,
    payload: object,
    updatedAt: number | ISO timestamp,
    serverId?: string // optional server-provided id
  }

- `jarvis_autosave_whatif_v1` — single draft object for the What-If page.
- `jarvis_autoload_scenario` — optional marker that tells the What‑If page to auto-load a scenario on page open.

## Key client helpers
- `mergeAndPersistScenarios(incomingList, source)`
  - Location: `client/src/utils/scenarioPersistence.js`
  - Purpose: canonicalize keys, merge by `updatedAt`, cap list (50), persist to `jarvis_saved_scenarios_v1`, and dispatch events.
  - Contract: callers should always pass canonical-ish items and prefer server-provided `updatedAt` when available.

- `readSavedScenarios()` / `persistScenarios(list)`
  - Read/write helpers with JSON parse/stringify and safe fallback to an empty array.

## Events & payloads
- `window.dispatchEvent(new CustomEvent('jarvis:scenarios-changed', { detail: { source } }))`
  - Fired after any successful write by `mergeAndPersistScenarios`.
- `jarvis:shared-scenario` — payload contains the canonical scenario url or id used by the share flow.

## Merge rules (summary)
1. Each incoming item maps to a canonical key: if `serverId` present, key = `srv-${serverId}`; else key = `id`.
2. Maintain ordering: incoming items first, then existing items not present in incoming.
3. When canonical keys match, pick the item with the later `updatedAt`.
4. Cap the resulting list to 50 items (drop the oldest by `updatedAt`).

## UX & retry guidance
- Optimistic saves should surface a non-blocking error UI when server confirm fails and allow manual retry.
- On server-confirm success the client should highlight the updated scenario briefly (a ring or badge) to show success.
- If `updatedAt` appears older on server response, treat server `updatedAt` as authoritative; if server `updatedAt` missing, use client `updatedAt` but label as "client-only".

## Quick debug checklist
- If saved scenarios disappear:
  - Check console for `[persistScenarios]` instrumentation logs which include source and count.
  - Check other tabs for `jarvis:scenarios-changed` events firing (use `window.addEventListener('jarvis:scenarios-changed', e => console.log(e.detail))`).
  - Inspect `localStorage.getItem('jarvis_saved_scenarios_v1')` to confirm stored objects.

## Test data & fixtures
- Minimal scenario payload sample to use in tests:
{
  id: 'opt-1234',
  title: 'My test scenario',
  payload: { sliders: { price: 100 }, customers: [] },
  updatedAt: Date.now()
}

## Recommended next tests (short)
1. `mergeAndPersistScenarios` handles duplicate server confirm replacing optimistic id.
2. Autosave restore logic prompting user when draft newer.
3. Cross-tab event listeners reconcile state after external write.

## Usage examples (quick)

Below are small copy-paste examples showing the canonical persistence helper usage and how to supply a chart container ref to the forecast/simulation pages so the export helpers receive a DOM node.

1) Persistence helpers (read / merge & persist)

```javascript
// client-side example (e.g. inside a component handler)
import { readSavedScenarios, mergeAndPersistScenarios } from '../client/src/utils/scenarioPersistence';

// read current saved list (safe, returns [] when absent)
const current = readSavedScenarios();

// create an optimistic scenario object
const optimistic = {
  id: 'opt-1234',
  title: 'My optimistic scenario',
  payload: { sliders: { price: 100 } },
  updatedAt: Date.now()
};

// merge and persist from an optimistic writer (source helps debugging/logs)
mergeAndPersistScenarios([optimistic], 'whatif-optimistic');

// when server confirms, merge the authoritative item (serverId and updatedAt)
// server-side handler should call the same helper with source 'server-confirm'
// e.g. mergeAndPersistScenarios([serverItem], 'server-confirm')
```

2) Forwarded ref / chartRef usage (export helpers)

```javascript
// Parent component that wants to export the Forecast chart
import React, { useRef } from 'react';
import TimeSeriesForecast from '../client/src/pages/TimeSeriesForecast';
import { exportElementToPng } from '../client/src/lib/appShared';

function Parent() {
  const forecastRef = useRef(null);

  return (
    <div>
      {/* TimeSeriesForecast accepts either a forwarded ref (ref) or a chartRef prop */}
      <TimeSeriesForecast ref={forecastRef} monthlySeries={[] /* ... */} />

      <button onClick={async () => {
        const container = forecastRef.current || null;
        if (!container) return; // nothing to export
        await exportElementToPng(container, 'forecast.png', 2);
      }}>Download Forecast Image</button>
    </div>
  );
}
```

Notes:
- Components that render charts (e.g. `TimeSeriesForecast`, `WhatIfSimulation`) now accept a forwarded ref and also honor an explicit `chartRef` prop. The helper export functions (`exportElementToPng` / `copyElementToClipboard`) expect a DOM node (the container element), so prefer supplying a ref rather than querying the DOM.



---

If you want I can create a small `docs/diagrams/` folder and add SVG sequence diagrams (Mermaid) for the scenario persistence and forecast job lifecycle flows.