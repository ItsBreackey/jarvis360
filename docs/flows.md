# jArvIs360 Flows

This document captures canonical client-side flows and event contracts used by jArvIs360. It's intentionally concise and focuses on the operational sequences developers need to implement or test.

## 1. Scenario persistence flow (client-side)

Sequence (happy path):

1. User clicks Save in the What‑If UI.
2. Client creates an optimistic scenario object with a temporary id (e.g., `opt-{uuid}`) and `updatedAt = Date.now()` and immediately calls `mergeAndPersistScenarios([optimistic], 'optimistic-save')` to persist locally and notify other tabs.
3. Client issues POST to server `/api/scenarios` with the scenario payload.
4. Server responds with canonical scenario object with `id` and `serverId` (if the server uses `srv-` keys) and authoritative `updatedAt` timestamp.
5. Client receives server-confirm and calls `mergeAndPersistScenarios([serverItem], 'server-confirm')` which:
   - maps items to canonical keys (e.g., `srv-{serverId}` when available or `id`),
   - merges by canonical key using the `updatedAt` field,
   - replaces optimistic items if they correspond to the same canonical key,
   - writes the capped list back to `localStorage` under `jarvis_saved_scenarios_v1` and dispatches `jarvis:scenarios-changed` and `storage` events.
6. Other tabs/listeners observe the event and call the read/merge helpers to keep UIs in sync.

Failure modes:
- Server POST fails: show a transient error, keep the optimistic item, and schedule a retry (exponential backoff) or allow manual retry.
- Clock skew: prefer server-provided `updatedAt` if present; otherwise use client timestamp but mark source as "unstable".


## 2. Autosave / Restore (What‑If)

- Autosave key: `jarvis_autosave_whatif_v1` stores a draft object for the current user and UI state.
- On load, the What‑If page compares `jarvis_autosave_whatif_v1` to the last persisted scenario's `updatedAt` and prompts the user to restore the draft if the draft is newer.
- Autosave policy: keep the most recent draft for 7 days; clear on explicit Save or when the user discards the draft.


## 3. Cross-tab synchronization

- Protocol:
  - Writers always call `mergeAndPersistScenarios(incoming, source)` which writes to `localStorage` and dispatches a synthetic event `window.dispatchEvent(new CustomEvent('jarvis:scenarios-changed', { detail: { source } }))`.
  - Readers listen for both the `jarvis:scenarios-changed` event and the `storage` event for the `jarvis_saved_scenarios_v1` key as a fallback.
- Merge rule: callers should always re-load the persisted list and run the same merge logic rather than applying local-only diffs.


## 4. Import / Export flow (CSV / JSON)

Import (CSV/JSON → persist):
1. User uploads file.
2. Client parses CSV using a header-mapping UI (attempt auto-mapping; allow manual adjustments).
3. Client validates required columns (customer.id, MRR, date fields) and shows preview rows.
4. After confirmation, transform to normalized snapshots and persist via `mergeAndPersistScenarios` or the canonical snapshots writer.

Export:
- Use chart refs (React refs passed to export helpers) to target the correct chart DOM node for image exports. Avoid querySelector lookups.
- Export CSV/JSON by serializing the canonical snapshot list or the KPI timeseries.

## Usage examples (quick)

Small copy-paste examples for developers showing the canonical persistence helper usage and how to supply a chart container ref to the forecast/simulation pages for exports.

```javascript
// Persistence helpers (client-side)
import { readSavedScenarios, mergeAndPersistScenarios } from '../client/src/utils/scenarioPersistence';

// read current saved list (safe fallback to [])
const list = readSavedScenarios();

// optimistic write
mergeAndPersistScenarios([{ id: 'opt-123', title: 'Draft', payload: {}, updatedAt: Date.now() }], 'optimistic-save');

// merge server-confirmed item
mergeAndPersistScenarios([{ id: 'srv-987', serverId: '987', title: 'Saved', updatedAt: Date.now() }], 'server-confirm');
```

```javascript
// Forwarded ref example — parent passes a ref to TimeSeriesForecast so export helpers get a DOM node
import React, { useRef } from 'react';
import TimeSeriesForecast from '../client/src/pages/TimeSeriesForecast';
import { exportElementToPng } from '../client/src/lib/appShared';

function Parent() {
  const forecastRef = useRef(null);
  return (
    <>
      <TimeSeriesForecast ref={forecastRef} monthlySeries={[]} />
      <button onClick={() => exportElementToPng(forecastRef.current, 'forecast.png', 2)}>Download</button>
    </>
  );
}
```


## 5. Forecast / AI job lifecycle (client-side contract)

Sequence:
1. User requests a forecast (scenario run or "Explain this forecast").
2. Client creates a job record (client-only job id) and shows a pending UI state.
3. Client calls server/LLM with the normalized input and job id, using exponential backoff on transient failures.
4. On response, the server returns structured forecast JSON and optional narrative; the client stores the result as a forecast snapshot and merges it into the UI.
5. Client renders forecast + confidence intervals and stores a copy in local storage and (when available) server-side snapshots.

Notes: LLM calls must be asynchronous and tolerant of retries. The client should surface progress and cancellation.


## 6. Versioning & Snapshot contract

Snapshot schema (minimal):
- id: string (canonical id or `snap-{uuid}`)
- type: 'scenario' | 'forecast' | 'snapshot'
- authorId: string
- createdAt: ISO timestamp
- updatedAt: ISO timestamp
- payload: object (serialized scenario or forecast)
- metadata: {source, tags, notes}

Snapshots are append-only; restore creates a new snapshot with the restored payload.


## Event & key quick reference
- localStorage keys:
  - `jarvis_saved_scenarios_v1` — canonical list of saved scenarios (merged + capped)
  - `jarvis_autosave_whatif_v1` — current draft autosave for the What‑If page
  - `jarvis_autoload_scenario` — marker to auto-load a specific scenario on page load
- Custom events:
  - `jarvis:scenarios-changed` — dispatched after any canonical write; detail: { source }
  - `jarvis:shared-scenario` — used by the ShareView to notify other tabs of an incoming shared scenario


## Testing checklist
- Unit tests:
  - `scenarioPersistence.mergeAndPersistScenarios` deduping and ordering
  - Optimistic-save then server confirm path
  - Autosave restore compare logic
- Integration test:
  - Cross-tab flow: writer in tab A creates optimistic, server responds, tab B sees merged canonical list.


For deeper operational patterns and key names see `docs/operational_notes.md`.
