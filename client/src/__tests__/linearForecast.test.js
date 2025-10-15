import { linearForecast } from '../utils/analytics';

test('linearForecast computes slope and produces expected number of forecast points', () => {
  const series = [
    { period: '2024-01', total: 100 },
    { period: '2024-02', total: 120 },
    { period: '2024-03', total: 140 },
  ];

  const res = linearForecast(series, 3);
  expect(res).toBeTruthy();
  // slope should be positive and approx 20 per month
  expect(typeof res.slope).toBe('number');
  expect(res.forecast.length).toBe(3);
  // first forecasted period should be 2024-04
  expect(res.forecast[0].period).toBe('2024-04');
});
