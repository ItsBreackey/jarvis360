import { computeForecastFromRecords } from '../utils/forecast';

describe('computeForecastFromRecords', () => {
  test('returns null forecast when no records', () => {
    const res = computeForecastFromRecords([], { monthsOut: 3 });
    expect(res.monthlySeries).toEqual([]);
    expect(res.forecastResult).toBeNull();
  });

  test('computes linear forecast for simple monthly series', () => {
    const records = [
      { id: 'a', MRR: 100, date: '2023-01-01' },
      { id: 'b', MRR: 200, date: '2023-02-01' },
      { id: 'c', MRR: 300, date: '2023-03-01' },
    ];
    const res = computeForecastFromRecords(records, { monthsOut: 2, method: 'linear' });
    expect(res.monthlySeries.length).toBeGreaterThan(0);
    expect(res.forecastResult).not.toBeNull();
    expect(Array.isArray(res.forecastResult.forecast)).toBe(true);
    expect(res.forecastResult.forecast.length).toBe(2);
  });
});
