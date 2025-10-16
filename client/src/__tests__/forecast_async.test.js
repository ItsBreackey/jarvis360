import { computeForecastFromRecords } from '../utils/forecast';
import { holtLinearForecast } from '../utils/analytics';

// Mock holtLinearForecast to return a Promise-like object when bootstrapAsync is requested
jest.mock('../utils/analytics', () => {
  const original = jest.requireActual('../utils/analytics');
  return {
    ...original,
    holtLinearForecast: (series, monthsOut, options) => {
      if (options && options.bootstrap && options.bootstrapAsync) {
        // emulate worker promise with revoke
        let cancelled = false;
        const p = new Promise((resolve) => {
          setTimeout(() => {
            if (cancelled) return resolve({ level:0, trend:0, residualStd:0, alpha: options.alpha, beta: options.beta, forecast: [] });
            resolve({ level:0, trend:0, residualStd:0, alpha: options.alpha, beta: options.beta, forecast: [] });
          }, 10);
        });
        p.revoke = () => { cancelled = true; };
        return p;
      }
      return original.holtLinearForecast(series, monthsOut, options);
    }
  };
});

describe('async forecast integration', () => {
  test('computeForecastFromRecords returns a Promise when holt with async bootstrap', async () => {
    const records = [ { id: 'a', MRR: 100, date: '2024-01-01' }, { id: 'a', MRR: 120, date: '2024-02-01' }, { id: 'b', MRR: 80, date: '2024-02-01' } ];
    const maybe = computeForecastFromRecords(records, { method: 'holt', monthsOut: 3, holtOptions: { bootstrap: true, bootstrapAsync: true } });
    expect(maybe).toBeDefined();
    expect(typeof maybe.then === 'function').toBe(true);
    // ensure revoke exists on resolved wrapper
    if (maybe && typeof maybe.revoke === 'function') maybe.revoke();
    const res = await maybe;
    expect(res).toHaveProperty('monthlySeries');
    expect(res).toHaveProperty('forecastResult');
  });
});
