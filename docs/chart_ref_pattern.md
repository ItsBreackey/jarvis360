## Chart ref pattern — small developer note

Purpose
-------
This short note documents the recommended pattern for components that render charts and need to support image export / copy helpers (e.g. `exportElementToPng`, `copyElementToClipboard`). The goal is to make it trivial for parent components to target the correct DOM container without brittle DOM queries.

Contract (summary)
- Components that render charts should:
  - accept an optional `chartRef` prop (a React ref object),
  - be wrapped with `React.forwardRef` so callers can pass `ref` as well,
  - compute an `effectiveChartRef` using: `chartRef || forwardedRef || localRef` and attach that to the chart container DOM element.

Why this helps
- Export helpers require a DOM node (container) to rasterize. By exposing a stable ref you avoid querySelector hacks, ensure correctness when multiple charts exist, and make testing reliable.

Pattern (example)

```javascript
// client/src/pages/TimeSeriesForecast.jsx (illustrative)
import React, { useRef } from 'react';

const TimeSeriesForecast = React.forwardRef((props, forwardedRef) => {
  const { chartRef, monthlySeries = [], ...rest } = props || {};
  // local fallback ref
  const localChartRef = useRef(null);
  // effective ref (preference order: explicit prop -> forwarded ref -> local ref)
  const effectiveChartRef = chartRef || forwardedRef || localChartRef;

  return (
    <div className="forecast-view">
      {/* attach the ref to the chart container */}
      <div ref={effectiveChartRef} className="forecast-chart-container">
        {/* chart rendering (Recharts / other) goes here */}
      </div>

      {/* export button reads effectiveChartRef.current */}
      <button
        type="button"
        aria-label="Download forecast image"
        disabled={!effectiveChartRef || !effectiveChartRef.current}
        onClick={async () => {
          const container = effectiveChartRef && effectiveChartRef.current ? effectiveChartRef.current : null;
          if (!container) return; // no-op when nothing to export
          // call helper: exportElementToPng(container, 'forecast.png', 2)
        }}
      >Download Image</button>
    </div>
  );
});

export default TimeSeriesForecast;
```

Parent usage (two options)

1) Pass a ref via `ref` (preferred):

```javascript
import React, { useRef } from 'react';
import TimeSeriesForecast from 'client/src/pages/TimeSeriesForecast';

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

2) Pass an explicit `chartRef` prop (useful in some composition scenarios):

```javascript
const explicitRef = React.createRef();
<TimeSeriesForecast chartRef={explicitRef} />
```

Testing notes
- In tests, create a ref and attach a DOM node (jsdom will provide an element when you render the component). Assert that export buttons are disabled when `ref.current` is null and enabled after the node exists. Mock `exportElementToPng` / `copyElementToClipboard` to avoid heavy html2canvas interactions in unit tests.

Accessibility & behavior
- Treat `chartRef === null` as an explicit opt-out (components may disable export buttons when a caller intentionally passes `chartRef={null}`).
- Use `aria-label` on export buttons and keep disabled state in sync with the availability of `effectiveChartRef.current`.

Further reading
- `docs/operational_notes.md` — usage snippets (persistence + refs)
- `docs/flows.md` — flow-level guidance on exports and persistence

That's it — small pattern, big reliability win for exports and tests.
