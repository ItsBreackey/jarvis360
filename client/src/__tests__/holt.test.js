import { holtLinearForecast } from '../utils/analytics';

test('holtLinearForecast produces forecast length and non-negative predictions', () => {
  const series = [
    { period: '2025-01', total: 100 },
    { period: '2025-02', total: 120 },
    { period: '2025-03', total: 130 },
    { period: '2025-04', total: 150 },
  ];
  const res = holtLinearForecast(series, 6, { alpha: 0.6, beta: 0.2 });
  expect(res).not.toBeNull();
  expect(res.forecast.length).toBe(6);
  res.forecast.forEach(f => expect(f.predicted).toBeGreaterThanOrEqual(0));
});
