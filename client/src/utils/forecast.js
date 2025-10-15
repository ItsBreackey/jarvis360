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
    return { monthlySeries, forecastResult: res };
  }

  // default to linear
  const res = linearForecast(monthlySeries, monthsOut);
  return { monthlySeries, forecastResult: res };
}

export default { computeForecastFromRecords };
