// Returns the worker script as a string. This keeps worker code in a module while
// allowing creation via Blob URLs without changing build configuration.
export function getBootstrapHoltWorkerScript() {
  return `
    self.onmessage = function(e) {
      const { y, monthsOut, alpha, beta, residuals, samples } = e.data;
      const n = y.length;
      const coll = Array.from({ length: monthsOut }, () => []);
      for (let s = 0; s < samples; s++) {
        let level = y[0];
        let trend = n > 1 ? (y[1] - y[0]) : 0;
        for (let t = 1; t < n; t++) {
          const yt = y[t];
          const lPrev = level;
          level = alpha * yt + (1 - alpha) * (level + trend);
          trend = beta * (level - lPrev) + (1 - beta) * trend;
        }
        for (let h = 1; h <= monthsOut; h++) {
          const r = residuals.length > 0 ? residuals[Math.floor(Math.random() * residuals.length)] : 0;
          const pred = level + h * trend + r;
          coll[h-1].push(Math.max(0, pred));
        }
      }
      const percentiles = coll.map(arr => {
        arr.sort(function(a,b){ return a-b; });
        const p25 = arr[Math.floor(0.025 * arr.length)] || arr[0] || 0;
        const p975 = arr[Math.floor(0.975 * arr.length)] || arr[arr.length-1] || 0;
        return { lower: p25, upper: p975 };
      });
      self.postMessage({ percentiles });
      self.close();
    };
  `;
}

export default getBootstrapHoltWorkerScript;
