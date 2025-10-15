/**
 * computeMonthlySeries
 * --------------------
 * Aggregate customer records into a monthly series. For each month this returns
 * an object: { period: 'YYYY-MM', total, new, expansion, churn }
 *
 * Input: records[] where each record may contain a date-like field (date, month, createdAt, etc.) and MRR numeric.
 * The function will attempt to find a date-like key automatically. It de-duplicates customers by `id` or `name`.
 */
export function computeMonthlySeries(records) {
  if (!records || records.length === 0) return null;

  const dateKeys = ['date', 'month', 'created_at', 'createdAt', 'uploadedAt', 'start_date', 'signupDate'];
  let foundKey = null;
  // Find a key that yields at least one valid date when parsed
  for (const k of dateKeys) {
    if (records.some(r => {
      const v = r[k]; if (v === undefined || v === null || v === '') return false; if (typeof v !== 'string' && !(v instanceof Date)) return false; const d = new Date(v); return !isNaN(d.getTime());
    })) { foundKey = k; break; }
  }
  if (!foundKey) {
    // try any field name by inspecting values for a parseable date
    const candidate = Object.keys(records[0]).find(k => records.some(r => {
      const v = r[k]; if (v === undefined || v === null || v === '') return false; if (typeof v !== 'string' && !(v instanceof Date)) return false; const d = new Date(v); return !isNaN(d.getTime());
    }));
    if (candidate) foundKey = candidate;
  }
  if (!foundKey) return null;

  const monthCustomerMap = {};
  records.forEach(r => {
    const raw = r[foundKey];
    if (raw === undefined || raw === null || raw === '') return;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthCustomerMap[key] = monthCustomerMap[key] || {};
    const id = r.id || r.name || `${Math.random().toString(36).slice(2,8)}`;
    monthCustomerMap[key][id] = (Number(r.MRR) || 0);
  });

  const months = Object.keys(monthCustomerMap).sort();
  if (months.length === 0) return null;

  const series = months.map(m => ({ period: m, customers: monthCustomerMap[m] }));

  const enriched = series.map((row, idx) => {
    const ids = Object.keys(row.customers || {});
    const total = ids.reduce((s, id) => s + (row.customers[id] || 0), 0);
    if (idx === 0) return { period: row.period, total, new: total, expansion: 0, churn: 0 };
    const prev = series[idx - 1];
    const prevCustomers = prev.customers || {};
    let newAmount = 0, churnAmount = 0, expansionAmount = 0;
    ids.forEach(id => {
      const cur = row.customers[id] || 0;
      const p = prevCustomers[id];
      if (p === undefined) {
        newAmount += cur;
      } else if (cur > p) {
        expansionAmount += (cur - p);
      } else if (cur < p) {
        churnAmount += (p - cur);
      }
    });
    Object.keys(prevCustomers || {}).forEach(id => {
      if (!(row.customers && row.customers[id])) {
        churnAmount += prevCustomers[id];
      }
    });
    return { period: row.period, total, new: newAmount, expansion: expansionAmount, churn: churnAmount };
  });

  return enriched;
}

/**
 * linearForecast
 * --------------
 * Simple OLS linear regression using index as the independent variable (time index).
 * Returns slope/intercept/residualStd and forecast array with 95% CI (lower/upper).
 */
export function linearForecast(series, monthsOut = 12) {
  if (!series || series.length === 0) return null;
  const n = series.length;
  const xs = series.map((_, i) => i);
  const ys = series.map(s => Number(s.total || 0));
  const xMean = xs.reduce((a,b) => a+b,0)/n;
  const yMean = ys.reduce((a,b) => a+b,0)/n;
  let num = 0, den = 0;
  for (let i=0;i<n;i++){ num += (xs[i]-xMean)*(ys[i]-yMean); den += (xs[i]-xMean)*(xs[i]-xMean); }
  const slope = den === 0 ? 0 : num/den;
  const intercept = yMean - slope * xMean;

  let rss = 0;
  for (let i=0;i<n;i++){ const pred = intercept + slope*xs[i]; rss += Math.pow(ys[i]-pred,2); }
  const residualStd = n > 1 ? Math.sqrt(rss / (n-1)) : 0;

  const forecast = [];
  const last = series[series.length - 1].period; // YYYY-MM
  const [yy,mm] = last.split('-').map(Number);
  for (let k=1;k<=monthsOut;k++){
    const idx = n - 1 + k;
    const pred = intercept + slope * idx;
    const lower = pred - 1.96 * residualStd;
    const upper = pred + 1.96 * residualStd;
    const dt = new Date(yy, mm - 1 + k, 1);
    const period = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    forecast.push({ period, predicted: Math.max(0, pred), lower: Math.max(0, lower), upper: Math.max(0, upper) });
  }

  return { slope, intercept, residualStd, forecast };
}

// Holt's linear (double exponential smoothing) forecast
// series: [{period, total}], monthsOut: int, options: { alpha, beta }
export function holtLinearForecast(series, monthsOut = 12, options = {}) {
  /**
   * Implementation details:
   * - Supports options.alpha and options.beta as numbers in (0,1).
   * - If options.alpha === 'auto' or options.beta === 'auto' (or missing), we run a small grid search
   *   (holtFit) to find alpha/beta minimizing one-step-ahead in-sample MSE.
   * - Computes in-sample residuals to estimate a residualStd which we use to create approximate
   *   Gaussian 95% confidence intervals for h-step forecasts: pred +/- 1.96 * residualStd.
   */
  if (!series || series.length === 0) return null;
  const n = series.length;
  const y = series.map((s) => Number(s.total || 0));

  // Helper: fit alpha/beta via grid search minimizing one-step MSE
  const holtFit = (yArr, alphaStep = 0.05, betaStep = 0.05) => {
    let best = { alpha: 0.5, beta: 0.3, mse: Infinity };
    for (let a = alphaStep; a < 1.0; a += alphaStep) {
      for (let b = betaStep; b < 1.0; b += betaStep) {
        // compute one-step-ahead forecasts and mse
        let l = yArr[0];
        let bt = yArr.length > 1 ? (yArr[1] - yArr[0]) : 0;
        const preds = [];
        for (let t = 1; t < yArr.length; t++) {
          const pred = l + bt; // forecast for t
          preds.push(pred);
          const yt = yArr[t];
          const lPrev = l;
          l = a * yt + (1 - a) * (l + bt);
          bt = b * (l - lPrev) + (1 - b) * bt;
        }
        // compute mse of predictions vs actuals (skip first)
        let sse = 0;
        for (let i = 0; i < preds.length; i++) { const err = yArr[i + 1] - preds[i]; sse += err * err; }
        const mse = preds.length > 0 ? sse / preds.length : Infinity;
        if (mse < best.mse) best = { alpha: a, beta: b, mse };
      }
    }
    return best;
  };

  // Decide parameters
  let alpha = options.alpha;
  let beta = options.beta;
  if (alpha === undefined || alpha === 'auto' || beta === undefined || beta === 'auto') {
    const fit = holtFit(y, 0.05, 0.05);
    alpha = fit.alpha;
    beta = fit.beta;
  }

  // Now run Holt smoothing while capturing one-step-ahead residuals for CI estimation
  let level = y[0];
  let trend = n > 1 ? (y[1] - y[0]) : 0;
  const residuals = [];
  for (let t = 1; t < n; t++) {
    const pred = level + trend; // one-step forecast for time t
    const yt = y[t];
    residuals.push(yt - pred);
    const lPrev = level;
    level = alpha * yt + (1 - alpha) * (level + trend);
    trend = beta * (level - lPrev) + (1 - beta) * trend;
  }

  // Estimate residual standard deviation (sample std)
  const m = residuals.length;
  const residualStd = m > 1 ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, m - 1)) : 0;

  // h-step forecasts with CI
  const forecast = [];
  const lastPeriod = series[series.length - 1].period;
  const [yy, mm] = lastPeriod.split('-').map(Number);
  for (let h = 1; h <= monthsOut; h++) {
    const pred = level + h * trend;
    const dt = new Date(yy, mm - 1 + h, 1);
    const period = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const lower = Math.max(0, pred - 1.96 * residualStd);
    const upper = Math.max(0, pred + 1.96 * residualStd);
    forecast.push({ period, predicted: Math.max(0, pred), lower, upper });
  }

  // If bootstrap option requested, compute bootstrap percentile bands
  if (options && options.bootstrap) {
    const samples = typeof options.bootstrapSamples === 'number' ? options.bootstrapSamples : 200;
      if (options.bootstrapAsync) {
        // Return a promise resolving to the full object once async bands are computed using a cancellable worker
        const wb = createBootstrapWorker(series, monthsOut, { alpha, beta }, residuals, samples);
        // wrap the worker promise so we can attach a revoke() method to the returned Promise
        const prom = wb.promise.then((bands) => {
          for (let i = 0; i < forecast.length; i++) {
            if (bands[i]) {
              forecast[i].lower = Math.max(0, bands[i].lower);
              forecast[i].upper = Math.max(0, bands[i].upper);
            }
          }
          return { level, trend, residualStd, alpha, beta, forecast, bootstrapSamples: samples };
        });
        // attach revoke so callers can cancel the underlying worker
        try { prom.revoke = wb.revoke; } catch (e) { /* ignore if not writable */ }
        return prom;
      }
    const bootstrapBands = bootstrapHoltIntervals(series, monthsOut, { alpha, beta }, residuals, samples);
    // Merge bootstrap bands into forecast entries (override lower/upper)
    for (let i = 0; i < forecast.length; i++) {
      if (bootstrapBands[i]) {
        forecast[i].lower = Math.max(0, bootstrapBands[i].lower);
        forecast[i].upper = Math.max(0, bootstrapBands[i].upper);
      }
    }
    return { level, trend, residualStd, alpha, beta, forecast, bootstrapSamples: samples };
  }

  // Optionally include residuals for callers that need them (e.g., async bootstrap worker)
  if (options && options.returnResiduals) {
    return { level, trend, residualStd, alpha, beta, forecast, residuals };
  }

  return { level, trend, residualStd, alpha, beta, forecast };
}

// Small helper to compute bootstrap-based forecast intervals for Holt
// We resample residuals with replacement, generate many bootstrap forecasts and
// compute percentile bands (e.g., 2.5/97.5 for 95% CI).
function bootstrapHoltIntervals(series, monthsOut, { alpha, beta }, residuals, samples = 200) {
  const y = series.map(s => Number(s.total || 0));
  const n = y.length;
  const lastPeriod = series[series.length - 1].period;
  const [yy, mm] = lastPeriod.split('-').map(Number);

  // Build array to collect sample forecasts for each horizon
  const coll = Array.from({ length: monthsOut }, () => []);

  for (let s = 0; s < samples; s++) {
    // restart with fitted level/trend using original data but add resampled residuals to simulate future
    let level = y[0];
    let trend = n > 1 ? (y[1] - y[0]) : 0;
    // run through in-sample to update level/trend
    for (let t = 1; t < n; t++) {
      const yt = y[t];
      const lPrev = level;
      level = alpha * yt + (1 - alpha) * (level + trend);
      trend = beta * (level - lPrev) + (1 - beta) * trend;
    }

    // simulate future h steps by adding resampled residuals
    for (let h = 1; h <= monthsOut; h++) {
      // sample a residual
      const r = residuals.length > 0 ? residuals[Math.floor(Math.random() * residuals.length)] : 0;
      const pred = level + h * trend + r; // add residual noise
      coll[h-1].push(Math.max(0, pred));
    }
  }

  // compute percentiles per horizon
  const percentiles = coll.map(arr => {
    arr.sort((a,b) => a-b);
    const p25 = arr[Math.floor(0.025 * arr.length)] || arr[0] || 0;
    const p975 = arr[Math.floor(0.975 * arr.length)] || arr[arr.length-1] || 0;
    return { lower: p25, upper: p975 };
  });

  // Map to forecast periods
  const periods = [];
  for (let h = 1; h <= monthsOut; h++) {
    const dt = new Date(yy, mm - 1 + h, 1);
    const period = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    periods.push({ period, lower: percentiles[h-1].lower, upper: percentiles[h-1].upper });
  }

  return periods;
}

// Create a cancellable bootstrap worker and return { promise, worker, revoke }
export function createBootstrapWorker(series, monthsOut, params, residuals, samples = 200) {
  const y = series.map(s => Number(s.total || 0));
  let worker = null;
  let url = null;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { if (worker) worker.terminate(); } catch (e) {}
    try { if (url) URL.revokeObjectURL(url); } catch (e) {}
    worker = null; url = null;
  };

  // If running in a non-browser environment (e.g. Node.js), Worker is not available.
  // Fall back to a synchronous computation and resolve a promise so callers (and tests)
  // can use the same async pattern without needing a browser Worker.
  if (typeof Worker === 'undefined') {
    return { promise: Promise.resolve(bootstrapHoltIntervals(series, monthsOut, params, residuals, samples)), worker: null, revoke: () => {} };
  }

  const promise = new Promise(async (resolve, reject) => {
    try {
      const mod = await import('../workers/bootstrapHoltWorker.js');
      const script = (mod && mod.getBootstrapHoltWorkerScript) ? mod.getBootstrapHoltWorkerScript() : (mod && mod.default ? mod.default() : null);
      if (!script) throw new Error('Failed to load worker script');
      const blob = new Blob([script], { type: 'application/javascript' });
      url = URL.createObjectURL(blob);
      worker = new Worker(url);
      worker.onmessage = function(ev) { resolve(ev.data.percentiles); cleanup(); };
      worker.onerror = function(err) { reject(err); cleanup(); };
      worker.postMessage({ y, monthsOut, alpha: params.alpha, beta: params.beta, residuals, samples });
    } catch (err) { reject(err); cleanup(); }
  });

  return { promise, worker, revoke: cleanup };
}

/**
 * holtAutoTune
 * -------------
 * Lightweight coordinate-descent based auto-tuner for Holt's alpha/beta
 * Minimizes one-step-ahead in-sample MSE. Designed to be fast in-browser.
 * Returns { alpha, beta, mse }
 */
export function holtAutoTune(series, opts = {}) {
  if (!series || series.length < 2) return { alpha: 0.6, beta: 0.2, mse: Infinity };
  const y = series.map(s => Number(s.total || 0));

  // MSE evaluator (one-step-ahead) for given (a,b)
  const evalMse = (a, b) => {
    let l = y[0];
    let bt = y.length > 1 ? (y[1] - y[0]) : 0;
    const preds = [];
    for (let t = 1; t < y.length; t++) {
      const pred = l + bt;
      preds.push(pred);
      const yt = y[t];
      const lPrev = l;
      l = a * yt + (1 - a) * (l + bt);
      bt = b * (l - lPrev) + (1 - b) * bt;
    }
    let sse = 0;
    for (let i = 0; i < preds.length; i++) { const err = y[i + 1] - preds[i]; sse += err * err; }
    return preds.length > 0 ? sse / preds.length : Infinity;
  };

  // start from provided guess or defaults
  let alpha = (opts && typeof opts.alpha === 'number') ? Math.max(0.01, Math.min(0.99, opts.alpha)) : 0.5;
  let beta = (opts && typeof opts.beta === 'number') ? Math.max(0.01, Math.min(0.99, opts.beta)) : 0.2;

  let bestMse = evalMse(alpha, beta);

  // Coordinate descent with progressively smaller step sizes
  const steps = [0.08, 0.04, 0.02, 0.01];
  for (let s = 0; s < steps.length; s++) {
    const step = steps[s];
    let improved = true;
    // iterate until no improvement at this resolution
    let iter = 0;
    while (improved && iter < 8) {
      improved = false;
      iter++;
      // optimize alpha while holding beta
      let localBest = { a: alpha, mse: bestMse };
      for (let a = Math.max(0.01, alpha - step * 4); a <= Math.min(0.99, alpha + step * 4); a += step) {
        const mse = evalMse(a, beta);
        if (mse < localBest.mse - 1e-9) { localBest = { a, mse }; }
      }
      if (localBest.mse < bestMse - 1e-9) { alpha = localBest.a; bestMse = localBest.mse; improved = true; }

      // optimize beta while holding alpha
      localBest = { b: beta, mse: bestMse };
      for (let b = Math.max(0.01, beta - step * 4); b <= Math.min(0.99, beta + step * 4); b += step) {
        const mse = evalMse(alpha, b);
        if (mse < localBest.mse - 1e-9) { localBest = { b, mse }; }
      }
      if (localBest.mse < bestMse - 1e-9) { beta = localBest.b; bestMse = localBest.mse; improved = true; }
    }
  }

  // clamp and return
  alpha = Math.max(0.01, Math.min(0.99, alpha));
  beta = Math.max(0.01, Math.min(0.99, beta));
  return { alpha, beta, mse: bestMse };
}

/**
 * Nelder-Mead optimizer (simple 2D implementation) for improving alpha/beta
 * Minimizes objective fn(x) where x = [alpha, beta]. Returns { x, fx }
 */
function nelderMead2D(fn, start = [0.5, 0.2], opts = {}) {
  const maxIter = opts.maxIter || 200;
  const tol = opts.tol || 1e-6;
  // simplex of 3 points in 2D
  let simplex = [
    [start[0], start[1]],
    [Math.min(0.99, start[0] + 0.05), start[1]],
    [start[0], Math.min(0.99, start[1] + 0.05)],
  ];

  const value = (v) => fn(Math.max(0.01, Math.min(0.99, v[0])), Math.max(0.01, Math.min(0.99, v[1])));
  let fv = simplex.map(s => value(s));

  for (let iter = 0; iter < maxIter; iter++) {
  // sort simplex by value ascending (avoid unsafe mutation in callbacks)
  // build index-value pairs and sort by value to avoid closures over fv
  const pairs = [ {i:0, v: fv[0]}, {i:1, v: fv[1]}, {i:2, v: fv[2]} ];
  pairs.sort(function(a,b){ return a.v - b.v; });
  const newSimplex = [simplex[pairs[0].i], simplex[pairs[1].i], simplex[pairs[2].i]];
  const newFv = [pairs[0].v, pairs[1].v, pairs[2].v];
  simplex = newSimplex; fv = newFv;
    const best = simplex[0], worst = simplex[2], second = simplex[1];
    // centroid of best & second
    const centroid = [(best[0] + second[0]) / 2, (best[1] + second[1]) / 2];
    // reflection
    const refl = [centroid[0] + (centroid[0] - worst[0]), centroid[1] + (centroid[1] - worst[1])];
    const fr = value(refl);
    if (fr < fv[0]) {
      // expansion
      const exp = [centroid[0] + 2 * (centroid[0] - worst[0]), centroid[1] + 2 * (centroid[1] - worst[1])];
      const fe = value(exp);
      if (fe < fr) { simplex[2] = exp; fv[2] = fe; }
      else { simplex[2] = refl; fv[2] = fr; }
    } else if (fr < fv[1]) {
      simplex[2] = refl; fv[2] = fr;
    } else {
      // contraction
      const cont = [centroid[0] + 0.5 * (worst[0] - centroid[0]), centroid[1] + 0.5 * (worst[1] - centroid[1])];
      const fc = value(cont);
      if (fc < fv[2]) { simplex[2] = cont; fv[2] = fc; }
      else {
        // shrink
        simplex[1] = [best[0] + 0.5 * (simplex[1][0] - best[0]), best[1] + 0.5 * (simplex[1][1] - best[1])];
        simplex[2] = [best[0] + 0.5 * (simplex[2][0] - best[0]), best[1] + 0.5 * (simplex[2][1] - best[1])];
        fv[1] = value(simplex[1]); fv[2] = value(simplex[2]);
      }
    }
    // check convergence
    const fmean = (fv[0] + fv[1] + fv[2]) / 3;
    const sqsum = fv.reduce((s, x) => s + (x - fmean) * (x - fmean), 0);
    if (Math.sqrt(sqsum / 3) < tol) break;
  }
  // return best
  const bestIdx = [0,1,2].reduce((a,b) => fv[a] < fv[b] ? a : b, 0);
  return { x: simplex[bestIdx], fx: fv[bestIdx] };
}

/**
 * Advanced Holt auto-tune using Nelder-Mead (slower but often more accurate)
 */
export function holtAutoTuneAdvanced(series, opts = {}) {
  if (!series || series.length < 3) return { alpha: 0.6, beta: 0.2, mse: Infinity };
  const y = series.map(s => Number(s.total || 0));
  const evalMse = (a, b) => {
    let l = y[0];
    let bt = y.length > 1 ? (y[1] - y[0]) : 0;
    let sse = 0; let count = 0;
    for (let t = 1; t < y.length; t++) {
      const pred = l + bt;
      const yt = y[t];
      const err = yt - pred; sse += err * err; count++;
      const lPrev = l;
      l = a * yt + (1 - a) * (l + bt);
      bt = b * (l - lPrev) + (1 - b) * bt;
    }
    return count > 0 ? sse / count : Infinity;
  };

  const start = [opts.alpha || 0.5, opts.beta || 0.2];
  const out = nelderMead2D(evalMse, start, { maxIter: opts.maxIter || 200, tol: opts.tol || 1e-6 });
  return { alpha: Math.max(0.01, Math.min(0.99, out.x[0])), beta: Math.max(0.01, Math.min(0.99, out.x[1])), mse: out.fx };
}
