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

  // If the caller already passed a monthly series (objects with `period` and `total`),
  // accept it as-is. Otherwise, aggregate raw records into monthly series.
  let monthlySeries = [];
  if (records && records.length && records[0].period !== undefined && (records[0].total !== undefined || records[0].total === 0)) {
    // normalize totals to numbers
    monthlySeries = records.map(r => ({ period: r.period, total: Number(r.total || 0) }));
  } else {
    // If records is falsy or not an array, warn and return
    if (!records || !Array.isArray(records)) {
      console.warn('computeForecastFromRecords: malformed input — expected array of records or monthly-series.');
      return { monthlySeries: [], forecastResult: null };
    }
    monthlySeries = computeMonthlySeries(records) || [];
  }
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

export default computeForecastFromRecords;
