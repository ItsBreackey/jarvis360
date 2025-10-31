import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Brush, Legend } from 'recharts';
import { computeForecastFromRecords } from '../utils/forecast';
import runCancelableHoltAutoTune from '../utils/holtWorker';
import { exportElementToPng, copyElementToClipboard, formatCurrency } from '../lib/appShared';

const TimeSeriesForecast = (props, forwardedRef) => {
  const { chartRef, monthlySeries = [], records = [], showCustomModal = () => {}, showToast = null, showToastRef = { current: null }, showCustomModalRef = { current: null } } = props || {};
  const [monthsOut, setMonthsOut] = useState(12);
  const [method, setMethod] = useState('linear');
  // Holt smoothing parameters (persisted in localStorage)
  const HOLTPREF = 'jarvis_holt_prefs_v1';
  const storedHolt = (() => { try { return JSON.parse(localStorage.getItem(HOLTPREF) || '{}'); } catch (e) { return {}; } })();
  const [holtAlpha, setHoltAlpha] = useState(storedHolt.alpha || 0.6);
  const [holtBeta, setHoltBeta] = useState(storedHolt.beta || 0.2);
  const [holtBootstrap, setHoltBootstrap] = useState(storedHolt.bootstrap || false);
  const [holtBootstrapSamples, setHoltBootstrapSamples] = useState(storedHolt.bootstrapSamples || 200);
  const [holtBootstrapAsync, setHoltBootstrapAsync] = useState(storedHolt.bootstrapAsync || false);
  const [tuning, setTuning] = useState(false);
  const tuningRef = useRef(null);
  const [tuningProgress, setTuningProgress] = useState(0);

  const series = useMemo(() => {
    if (!monthlySeries || !Array.isArray(monthlySeries) || monthlySeries.length === 0) return [];
    const parsed = monthlySeries.map((m) => ({ period: m.period, total: Number(m.total || 0) }));
    parsed.sort((a, b) => a.period.localeCompare(b.period));
    return parsed;
  }, [monthlySeries]);

  const [forecastResultState, setForecastResultState] = useState(null);

  const combined = useMemo(() => {
    if (!series) return [];
    const actual = series.map(s => ({ period: s.period, actual: s.total }));
    const fc = (forecastResultState || {}).forecast || [];
    const map = {};
    actual.forEach(a => { map[a.period] = map[a.period] || {}; map[a.period].period = a.period; map[a.period].actual = a.actual; });
    fc.forEach(f => { map[f.period] = map[f.period] || {}; map[f.period].period = f.period; map[f.period].predicted = f.predicted; map[f.period].lower = f.lower; map[f.period].upper = f.upper; });
    return Object.keys(map).sort().map(k => map[k]);
  }, [series, forecastResultState]);

  const downloadCSV = () => {
    const rows = [];
    // header
    rows.push(['period','actual','predicted','lower','upper'].join(','));
    // merge actuals and forecasts by period
    const map = {};
    series.forEach(s => { map[s.period] = map[s.period] || {}; map[s.period].actual = s.total; });
  (forecastResultState?.forecast || []).forEach(f => { map[f.period] = map[f.period] || {}; map[f.period].predicted = f.predicted; map[f.period].lower = f.lower; map[f.period].upper = f.upper; });
    const periods = Object.keys(map).sort();
    periods.forEach(p => {
      const row = map[p] || {};
      rows.push([
        p,
        (row.actual !== undefined ? row.actual : ''),
        (row.predicted !== undefined ? row.predicted : ''),
        (row.lower !== undefined ? row.lower : ''),
        (row.upper !== undefined ? row.upper : ''),
      ].join(','));
    });

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'forecast.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const [exporting, setExporting] = useState(false);
  const [computingBootstrap, setComputingBootstrap] = useState(false);
  const asyncForecastRef = useRef(null);
  const prevForecastInputKeyRef = useRef(null);
  const localChartRef = useRef(null);
  const effectiveChartRef = chartRef || forwardedRef || localChartRef;
  const devDiag = typeof window !== 'undefined' && !!localStorage.getItem('JARVIS_DEV_DIAG');

  useEffect(() => {
    let cancelled = false;

    // Build a compact, stable input key using a streaming FNV-1a hash so we avoid
    // allocating a giant string for large datasets. We update the hash with
    // small chunks (settings and each row) to produce a deterministic key.
    const fnv1aInit = () => 2166136261 >>> 0;
    const fnv1aUpdate = (h, str) => {
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h;
    };
    const fnv1aDigest = (h) => (h >>> 0).toString(16);

    let h = fnv1aInit();
    // Add the config/settings
    h = fnv1aUpdate(h, String(method));
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, String(monthsOut));
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, String(holtAlpha));
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, String(holtBeta));
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, holtBootstrap ? 'b' : 'n');
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, String(holtBootstrapSamples));
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, holtBootstrapAsync ? 'a' : 's');
    h = fnv1aUpdate(h, '|');

    // Stream the row data from monthlySeries (preferred) or fallback to records
    if (monthlySeries && monthlySeries.length) {
      h = fnv1aUpdate(h, String(monthlySeries.length));
      for (let i = 0; i < monthlySeries.length; i++) {
        const ms = monthlySeries[i];
        // include period and numeric total as small updates
        h = fnv1aUpdate(h, '|');
        h = fnv1aUpdate(h, String(ms.period));
        h = fnv1aUpdate(h, ':');
        h = fnv1aUpdate(h, String(ms.total));
      }
    } else if (records && records.length) {
      h = fnv1aUpdate(h, String(records.length));
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const period = r.period || r.date || '';
        const val = r.total || r.MRR || '';
        h = fnv1aUpdate(h, '|');
        h = fnv1aUpdate(h, String(period));
        h = fnv1aUpdate(h, ':');
        h = fnv1aUpdate(h, String(val));
      }
    } else {
      h = fnv1aUpdate(h, '0');
    }

    const inputKey = fnv1aDigest(h);

    // If inputs haven't changed, skip recomputing
    if (prevForecastInputKeyRef.current === inputKey) {
      if (devDiag) console.debug('[jarvis] forecast effect skipped (inputKey unchanged)', inputKey);
      return () => { cancelled = true; };
    }
    prevForecastInputKeyRef.current = inputKey;

    if (devDiag) console.debug('[jarvis] forecast effect running, inputKey=', inputKey, { method, monthsOut, holtAlpha, holtBeta, holtBootstrap, holtBootstrapSamples, holtBootstrapAsync });

    setComputingBootstrap(true);

    // Use computeForecastFromRecords helper — it will aggregate monthly series and run forecast
    try {
      const maybe = computeForecastFromRecords(records && records.length ? records : (monthlySeries && monthlySeries.length ? monthlySeries.map(ms => ({ period: ms.period, total: ms.total })) : []), { method: method === 'holt' ? 'holt' : 'linear', monthsOut, holtOptions: { alpha: holtAlpha, beta: holtBeta, bootstrap: holtBootstrap, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: holtBootstrapAsync } });
      // The helper may return a Promise (if holt with async bootstrap), or an object
      if (maybe && typeof maybe.then === 'function') {
        asyncForecastRef.current = maybe;
        maybe.then((res) => {
          asyncForecastRef.current = null;
          if (cancelled) return;
          // res is the full object { monthlySeries, forecastResult }
          setForecastResultState(res.forecastResult || res);
        }).catch((err) => {
          asyncForecastRef.current = null;
          console.error('Async forecast failed', err);
          // use refs to stable toast functions
          try { (showToastRef.current || showCustomModalRef.current)('Async forecast failed. See console for details.', 'error'); } catch (e) {}
        }).finally(() => { if (!cancelled) setComputingBootstrap(false); });
      } else {
        // synchronous result
        const res = maybe || {};
        setForecastResultState(res.forecastResult || res);
        setComputingBootstrap(false);
      }
    } catch (err) {
      console.error('Forecast compute failed', err);
      try { (showToastRef.current || showCustomModalRef.current)('Forecast compute failed. See console for details.', 'error'); } catch (e) {}
      setComputingBootstrap(false);
    }

    return () => { cancelled = true; };
  // note: showToast/showCustomModal use refs above so they are omitted from deps to avoid identity churn
  }, [records, monthlySeries, method, monthsOut, holtAlpha, holtBeta, holtBootstrap, holtBootstrapSamples, holtBootstrapAsync, devDiag, showCustomModalRef, showToastRef]);

  // Render the forecast chart UI
  return (
    <div className="p-4 md:p-8">
  <h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2">Forecasting & Trend Analysis</h2>
      <div className="p-6 bg-white rounded-xl shadow-xl border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <p className="text-gray-600">Showing historical Actual monthly MRR and a simple linear projection with a 95% CI band.</p>
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Months to forecast:</label>
            <input aria-label="Months to forecast" type="number" min="1" max="36" value={monthsOut} onChange={(e) => setMonthsOut(Number(e.target.value || 1))} className="w-20 p-1 rounded border" />
            <label className="text-sm text-gray-600">Method:</label>
            <select aria-label="Forecast method" value={method} onChange={(e) => setMethod(e.target.value)} className="p-1 rounded border bg-white">
              <option value="linear">Linear OLS</option>
              <option value="holt">Holt Linear</option>
            </select>
            {/* If Holt is selected, show alpha/beta controls */}
            {method === 'holt' && (
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">α</label>
          <input type="range" min="0.01" max="1" step="0.01" value={holtAlpha} onChange={(e) => { const v = Number(e.target.value); setHoltAlpha(v); localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: v, beta: holtBeta })); }} />
                <label className="text-sm text-gray-600">β</label>
          <input type="range" min="0.01" max="1" step="0.01" value={holtBeta} onChange={(e) => { const v = Number(e.target.value); setHoltBeta(v); localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: holtAlpha, beta: v })); }} />
                <div className="flex items-center space-x-2">
                  <button type="button" disabled={tuning} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm" onClick={async () => {
                    try {
                      if (!series || series.length < 3) { (showToast || showCustomModal)('Not enough data to auto-tune (min 3 months).', 'warn'); return; }
                      (showToast || showCustomModal)('Running Holt auto-tune (fast search)...', 'info');
                      setTuning(true);
                      setTuningProgress(0);
                      // Use cancelable worker
                      const numericSeries = series.map(s => Number(s.total || 0));
                      const runner = runCancelableHoltAutoTune(numericSeries, {
                        alphaStart: 0.05, alphaEnd: 0.95, alphaStep: 0.05,
                        betaStart: 0.05, betaEnd: 0.95, betaStep: 0.05,
                        onProgress: (pct, best) => {
                          setTuningProgress(pct);
                          if (pct % 20 === 0) {
                            try { (showToast || showCustomModal)(`Auto-tune progress ${pct}% — best MSE ${Number((best && best.sse) || 0).toFixed(1)}`, 'info'); } catch (e) {}
                          }
                        }
                      });
                      tuningRef.current = runner;
                      const out = await runner.promise;
                      tuningRef.current = null;
                      if (out && out.alpha != null) {
                        setHoltAlpha(out.alpha);
                        setHoltBeta(out.beta);
                        localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: out.alpha, beta: out.beta, bootstrap: holtBootstrap, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: holtBootstrapAsync }));
                        (showToast || showCustomModal)(`Auto-tune completed — α=${out.alpha.toFixed(2)}, β=${out.beta.toFixed(2)}, SSE=${out.sse.toFixed(1)}`, 'success');
                      }
                    } catch (err) {
                      if (err && err.message && err.message.indexOf('terminated') >= 0) {
                        (showToast || showCustomModal)('Auto-tune cancelled.', 'info');
                      } else {
                        console.error('Auto-tune failed', err);
                        (showToast || showCustomModal)('Auto-tune failed. See console for details.', 'error');
                      }
                    } finally { setTuning(false); setTuningProgress(0); }
                  }}>Auto-tune</button>

                  <button type="button" disabled={tuning} className="px-3 py-1 bg-violet-600 text-white rounded text-sm" onClick={async () => {
                    try {
                      if (!series || series.length < 3) { (showToast || showCustomModal)('Not enough data to auto-tune (min 3 months).', 'warn'); return; }
                      (showToast || showCustomModal)('Running Advanced Auto-tune (Nelder-Mead)...', 'info');
                        setTuning(true);
                        const res = await new Promise((resovle) => {
                          // run advanced tuner (may take longer) — prefer worker-provided advanced method if available
                          const out = runCancelableHoltAutoTune.advanced ? runCancelableHoltAutoTune.advanced(series, { alpha: holtAlpha, beta: holtBeta, maxIter: 300 }) : null;
                          resovle(out);
                        });
                        if (res) {
                          setHoltAlpha(res.alpha);
                          setHoltBeta(res.beta);
                          localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: res.alpha, beta: res.beta, bootstrap: holtBootstrap, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: holtBootstrapAsync }));
                          (showToast || showCustomModal)(`Advanced Auto-tune completed — α=${res.alpha.toFixed(3)}, β=${res.beta.toFixed(3)}, MSE=${res.mse.toFixed(2)}`, 'success');
                        }
                    } catch (err) {
                      console.error('Advanced Auto-tune failed', err);
                      (showToast || showCustomModal)('Advanced Auto-tune failed. See console for details.', 'error');
                    } finally { setTuning(false); }
                  }}>Auto-tune (advanced)</button>
                  {tuning && (
                    <div className="ml-3 text-sm text-gray-600">Auto-tune: {Math.round(tuningProgress)}%</div>
                  )}
                </div>
                <label className="text-sm text-gray-600">Bootstrap CI</label>
                <input type="checkbox" checked={holtBootstrap} onChange={(e) => { const v = !!e.target.checked; setHoltBootstrap(v); localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: holtAlpha, beta: holtBeta, bootstrap: v, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: holtBootstrapAsync })); }} />
                <label className="text-sm text-gray-600">Async Bootstrap</label>
                <input type="checkbox" checked={holtBootstrapAsync} onChange={(e) => { const v = !!e.target.checked; setHoltBootstrapAsync(v); localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: holtAlpha, beta: holtBeta, bootstrap: holtBootstrap, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: v })); }} />
                {holtBootstrap && (
                  <div className="flex items-center space-x-1">
                    <label className="text-sm text-gray-600">Samples</label>
                    <input type="number" min="50" max="2000" step="10" value={holtBootstrapSamples} onChange={(e) => { const v = Math.max(50, Number(e.target.value || 200)); setHoltBootstrapSamples(v); localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: holtAlpha, beta: holtBeta, bootstrap: holtBootstrap, bootstrapSamples: v })); }} className="w-20 p-1 rounded border" />
                    {computingBootstrap && (
                      <span className="text-sm text-gray-500 ml-2">Computing CI...</span>
                    )}
                  </div>
                )}
              </div>
            )}
            <button type="button" aria-label="Download forecast CSV" className="px-3 py-1 bg-green-500 text-white rounded text-sm" onClick={downloadCSV}>Download CSV</button>
            <button type="button" aria-label="Download forecast image" disabled={exporting || chartRef === null || !(effectiveChartRef && effectiveChartRef.current)} aria-disabled={exporting || chartRef === null || !(effectiveChartRef && effectiveChartRef.current)} className="px-3 py-1 bg-blue-500 text-white rounded text-sm" onClick={async () => {
              const container = effectiveChartRef && effectiveChartRef.current ? effectiveChartRef.current : null;
              if (!container) { (showToast || showCustomModal)('No chart available to export.', 'error'); return; }
              setExporting(true);
              try {
                const ok = await exportElementToPng(container, 'forecast_chart.png', 2);
                if (ok) (showToast || showCustomModal)('Chart image downloaded.', 'success'); else (showToast || showCustomModal)('Failed to export chart image.', 'error');
              } finally { setExporting(false); }
            }}>{exporting ? 'Exporting...' : 'Download Image'}</button>
            <button type="button" aria-label="Copy forecast image to clipboard" disabled={exporting || chartRef === null || !(effectiveChartRef && effectiveChartRef.current)} aria-disabled={exporting || chartRef === null || !(effectiveChartRef && effectiveChartRef.current)} className="px-3 py-1 bg-gray-500 text-white rounded text-sm" onClick={async () => {
              const container = effectiveChartRef && effectiveChartRef.current ? effectiveChartRef.current : null;
              if (!container) { (showToast || showCustomModal)('No chart available to copy.', 'error'); return; }
              setExporting(true);
              try {
                const ok = await copyElementToClipboard(container, 2);
                if (ok) (showToast || showCustomModal)('Chart image copied to clipboard.', 'success'); else (showToast || showCustomModal)('Failed to copy chart to clipboard. Your browser may block clipboard image writes.', 'error');
              } finally { setExporting(false); }
            }}>{exporting ? 'Exporting...' : 'Copy Image'}</button>
            {computingBootstrap && (
              <div className="flex items-center space-x-2">
                <div className="text-sm text-gray-500">Computing CI...</div>
                <button type="button" aria-label="Cancel CI" className="px-3 py-1 bg-red-500 text-white rounded text-sm" onClick={() => {
                  try {
                    if (asyncForecastRef.current && typeof asyncForecastRef.current.revoke === 'function') asyncForecastRef.current.revoke();
                  } catch (e) { console.error('Cancel revoke failed', e); }
                  asyncForecastRef.current = null;
                  setComputingBootstrap(false);
                  // keep last known forecast displayed — avoid calling setState with same value
                  (showToast || showCustomModal)('Bootstrap CI cancelled.', 'info');
                }}>Cancel CI</button>
              </div>
            )}
          </div>
        </div>

  <div ref={effectiveChartRef} className="mt-4 h-64">
          {combined.length === 0 ? (
            <div className="h-56 bg-gray-50 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400">No monthly series data — load a dataset with a date and MRR column in the Data Dashboard.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={combined} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <ReTooltip formatter={(value) => typeof value === 'number' ? formatCurrency(value) : value} />
                <Legend />
                <Area type="monotone" dataKey="upper" stroke="none" fill="#BFDBFE" fillOpacity={0.4} isAnimationActive={false} />
                <Area type="monotone" dataKey="lower" stroke="none" fill="#BFDBFE" fillOpacity={0.4} isAnimationActive={false} />
                <Line type="monotone" dataKey="actual" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="predicted" stroke="#1D4ED8" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="6 4" />
                <Brush dataKey="period" height={30} stroke="#8884d8" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        {/* Explainability panel: shows chosen model and parameters in friendly text */}
        <div className="mt-4 p-3 bg-gray-50 border border-dashed rounded text-sm text-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <strong>Model:</strong> {method === 'holt' ? 'Holt Linear (double exponential smoothing)' : 'Linear regression (OLS)'}
              <div className="text-xs text-gray-600 mt-1">{method === 'holt' ? `α=${holtAlpha.toFixed(2)}, β=${holtBeta.toFixed(2)}${holtBootstrap ? `, bootstrap=${holtBootstrapSamples} samples${holtBootstrapAsync ? ' (async)' : ''}` : ''}` : `Slope projection over historical period`}</div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>{series.length} months of history</div>
              <div>{monthsOut} months forecast</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500">Tip: use Auto-tune for Holt when you have at least 6 months of history. Bootstrap CIs estimate uncertainty — enable async mode for large sample counts.</div>
        </div>
      </div>
    </div>
  );
};

export default React.forwardRef(TimeSeriesForecast);
