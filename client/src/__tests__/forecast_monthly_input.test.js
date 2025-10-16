import computeForecastFromRecords from '../utils/forecast';

test('computeForecastFromRecords accepts monthly-series input and returns forecast', () => {
  const monthly = [
    { period: '2024-01', total: 1000 },
    { period: '2024-02', total: 1100 },
    { period: '2024-03', total: 1200 },
    { period: '2024-04', total: 1300 },
  ];
  const res = computeForecastFromRecords(monthly, { method: 'linear', monthsOut: 3 });
  expect(res).toBeDefined();
  expect(res.monthlySeries).toHaveLength(4);
  expect(res.forecastResult).toBeDefined();
  expect(res.forecastResult.forecast).toHaveLength(3);
  // predictions should be positive numbers
  res.forecastResult.forecast.forEach(f => {
    expect(typeof f.predicted).toBe('number');
    expect(f.predicted).toBeGreaterThanOrEqual(0);
  });
});
