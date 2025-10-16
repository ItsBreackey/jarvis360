import { estimateChurnFromFeatures } from '../utils/churn';

test('estimateChurnFromFeatures returns values in 0-1 and higher for risky features', () => {
  const lowRisk = { MRR: 10000, supportTickets: 0, lastActivityDays: 1 };
  const midRisk = { MRR: 2000, supportTickets: 2, lastActivityDays: 10 };
  const highRisk = { MRR: 100, supportTickets: 8, lastActivityDays: 45 };

  const a = estimateChurnFromFeatures(lowRisk);
  const b = estimateChurnFromFeatures(midRisk);
  const c = estimateChurnFromFeatures(highRisk);

  expect(typeof a).toBe('number');
  expect(a).toBeGreaterThanOrEqual(0);
  expect(a).toBeLessThanOrEqual(1);

  expect(b).toBeGreaterThanOrEqual(0);
  expect(b).toBeLessThanOrEqual(1);

  expect(c).toBeGreaterThanOrEqual(0);
  expect(c).toBeLessThanOrEqual(1);

  // check ordering low < mid < high (likely)
  expect(a).toBeLessThanOrEqual(b + 1e-6);
  expect(b).toBeLessThanOrEqual(c + 1e-6);
});
