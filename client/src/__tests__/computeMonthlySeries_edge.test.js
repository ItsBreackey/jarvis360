import { computeMonthlySeries } from '../utils/analytics';

test('computeMonthlySeries returns null for empty or date-less data', () => {
  expect(computeMonthlySeries([])).toBeNull();

  const dataNoDates = [
    { id: 'a', MRR: 100 },
    { id: 'b', MRR: 200 }
  ];
  expect(computeMonthlySeries(dataNoDates)).toBeNull();
});
