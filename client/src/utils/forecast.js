import { computeMonthlySeries } from './analytics';
import { linearForecast, holtLinearForecast } from './analytics';

/**
 * computeForecastFromRecords
 * - Accepts raw customer records (as used in the app) and returns an object:
 *   { monthlySeries, forecastResult }
 * - Options: { method: 'linear'|'holt', monthsOut, holtOptions }
 */
export function computeForecastFromRecords(records, options = {}) {
  const monthsOut = options.monthsOut || 12;
  const method = options.method || 'linear';

  const monthlySeries = computeMonthlySeries(records) || [];
  if (!monthlySeries || monthlySeries.length === 0) return { monthlySeries: [], forecastResult: null };

  if (method === 'holt') {
    const holtOptions = options.holtOptions || {};
    const res = holtLinearForecast(monthlySeries, monthsOut, holtOptions);
    // If holtLinearForecast returns a Promise (async bootstrap), wrap it so callers
    // receive a Promise that resolves to the full object { monthlySeries, forecastResult }
    if (res && typeof res.then === 'function') {
      const wrapper = res.then((forecastResult) => ({ monthlySeries, forecastResult }));
      // attach revoke if available on inner promise/worker
      try { if (typeof res.revoke === 'function') wrapper.revoke = () => res.revoke(); } catch (e) { /* ignore */ }
      return wrapper;
    }
    return { monthlySeries, forecastResult: res };
  }

  // default to linear
  const res = linearForecast(monthlySeries, monthsOut);
  return { monthlySeries, forecastResult: res };
}

export default { computeForecastFromRecords };
