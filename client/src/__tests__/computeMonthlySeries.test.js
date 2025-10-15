import { computeMonthlySeries } from '../utils/analytics';

test('computeMonthlySeries aggregates monthly totals and diffs correctly', () => {
  const data = [
    { id: 'a', MRR: 100, date: '2024-01-05' },
    { id: 'b', MRR: 200, date: '2024-01-15' },
    { id: 'a', MRR: 120, date: '2024-02-01' }, // expansion for a
    { id: 'c', MRR: 50, date: '2024-02-10' },
  ];

  const months = computeMonthlySeries(data);
  expect(Array.isArray(months)).toBe(true);
  // Should include 2024-01 and 2024-02
  const jan = months.find(m => m.period === '2024-01');
  const feb = months.find(m => m.period === '2024-02');
  expect(jan.total).toBe(300);
  expect(jan.new).toBe(300);
  expect(feb.total).toBe(170);
  // expansion: a increased 20
  expect(feb.expansion).toBe(20);
  // new: c=50
  expect(feb.new).toBe(50);
  // churn: b missing in feb -> 200
  expect(feb.churn).toBe(200);
});
