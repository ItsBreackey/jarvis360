// Lightweight cancelable Holt auto-tune helper using a Blob worker.
// Exports runCancelableHoltAutoTune(series, options) -> { promise, revoke }
// - series: array of numbers (training series)
// - options: { alphaStart, alphaEnd, alphaStep, betaStart, betaEnd, betaStep, onProgress }
// The returned object contains:
// - promise: resolves to { sse, alpha, beta }
// - revoke(): terminate the worker and cancel work

export function runCancelableHoltAutoTune(series, options = {}) {
  const onProgress = options.onProgress;

  // Build discrete alpha/beta value arrays
  const buildRange = (start, end, step) => {
    const out = [];
    for (let v = start; v <= end + 1e-12; v = +(v + step).toFixed(12)) out.push(v);
    return out;
  };

  const alphaStart = options.alphaStart ?? 0.1;
  const alphaEnd = options.alphaEnd ?? 0.9;
  const alphaStep = options.alphaStep ?? 0.1;
  const betaStart = options.betaStart ?? 0.1;
  const betaEnd = options.betaEnd ?? 0.9;
  const betaStep = options.betaStep ?? 0.1;

  const alphaValues = buildRange(alphaStart, alphaEnd, alphaStep);
  const betaValues = buildRange(betaStart, betaEnd, betaStep);

  // Worker source: evaluate Holt SSE over the grid and post progress
  const workerSource = `
    self.onmessage = function(e){
      const { series, alphaValues, betaValues } = e.data;
      function evaluate(series, alpha, beta){
        if(!Array.isArray(series) || series.length < 2) return Infinity;
        let level = series[0];
        let trend = (series[1] - series[0]) || 0;
        let sse = 0;
        for(let t=1;t<series.length;t++){
          const forecast = level + trend;
          const obs = series[t];
          const err = obs - forecast;
          sse += err*err;
          const newLevel = alpha*obs + (1-alpha)*(level + trend);
          const newTrend = beta*(newLevel - level) + (1-beta)*trend;
          level = newLevel;
          trend = newTrend;
        }
        return sse;
      }

      let best = { sse: Infinity, alpha: null, beta: null };
      const total = alphaValues.length * betaValues.length;
      let count = 0;
      const progressInterval = Math.max(1, Math.floor(total / 20));

      for(let ai=0; ai<alphaValues.length; ai++){
        for(let bi=0; bi<betaValues.length; bi++){
          const alpha = alphaValues[ai];
          const beta = betaValues[bi];
          const sse = evaluate(series, alpha, beta);
          count++;
          if(sse < best.sse){
            best = { sse, alpha, beta };
          }
          if(count % progressInterval === 0){
            self.postMessage({ type: 'progress', progress: Math.round(100 * count / total), best });
          }
        }
      }

      self.postMessage({ type: 'result', best });
    };
  `;

  const blob = new Blob([workerSource], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { type: 'module' });

  let terminated = false;

  const promise = new Promise((resolve, reject) => {
    worker.onmessage = (ev) => {
      const msg = ev.data;
      if (msg && msg.type === 'progress') {
        try { if (onProgress) onProgress(msg.progress, msg.best); } catch (err) { /* ignore user errors */ }
      } else if (msg && msg.type === 'result') {
        cleanup();
        resolve(msg.best);
      }
    };
    worker.onerror = (err) => { cleanup(); reject(err); };
    // Start
    worker.postMessage({ series, alphaValues, betaValues });
  });

  function cleanup(){
    if (!terminated){
      terminated = true;
      try { worker.terminate(); } catch (e) { /* ignore */ }
      try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
    }
  }

  function revoke(){
    cleanup();
  }

  return { promise, revoke };
}

export default runCancelableHoltAutoTune;
