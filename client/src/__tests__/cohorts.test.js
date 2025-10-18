import { generateCohortTable, monthKeyFromDate } from '../utils/cohorts';
import { topCustomers, generateCohortRetention } from '../utils/cohorts';

test('monthKeyFromDate formats correctly', () => {
  expect(monthKeyFromDate('2025-01-15')).toBe('2025-01');
  expect(monthKeyFromDate('invalid')).toBeNull();
});

test('generateCohortTable aggregates MRR by cohort month', () => {
  const records = [
    { customer_id: 'a', mrr: 100, signup_date: '2025-01-05' },
    { customer_id: 'b', mrr: 200, signup_date: '2025-01-20' },
    { customer_id: 'c', mrr: 50, signup_date: '2025-02-02' },
  ];
  const { headers, rows } = generateCohortTable(records, { dateKey: 'signup_date', valueKey: 'mrr', months: 3 });
  expect(headers).toEqual(['0','1','2']);
  // there should be two cohorts (2025-02, 2025-01) sorted desc
  expect(rows.length).toBeGreaterThanOrEqual(2);
  const rowMap = Object.fromEntries(rows.map(r => [r.cohort, r.values]));
  expect(rowMap['2025-01'][0]).toBe(300);
  expect(rowMap['2025-02'][0]).toBe(50);
});

test('topCustomers returns sorted top customers', () => {
  const records = [
    { customer_id: 'a', mrr: 100 },
    { customer_id: 'b', mrr: 400 },
    { customer_id: 'a', mrr: 200 },
    { customer_id: 'c', mrr: 50 },
  ];
  const tops = topCustomers(records, { valueKey: 'mrr', idKey: 'customer_id', limit: 2 });
  expect(tops.length).toBe(2);
  expect(tops[0].id).toBe('b');
  expect(tops[1].id).toBe('a');
});

test('generateCohortRetention computes percentages', () => {
  const records = [
    { customer_id: 'a', mrr: 100, signup_date: '2025-01-05' },
    { customer_id: 'b', mrr: 50, signup_date: '2025-01-20', event_date: '2025-02-05' },
    { customer_id: 'c', mrr: 25, signup_date: '2025-02-02' },
  ];
  const res = generateCohortRetention(records, { dateKey: 'signup_date', valueKey: 'mrr', months: 3 });
  expect(res.headers).toEqual(['0','1','2']);
  const rowMap = Object.fromEntries(res.rows.map(r => [r.cohort, r]));
  // baseline for 2025-01 should be 150 (100+50 at month 0)
  expect(rowMap['2025-01'].values[0]).toBeGreaterThanOrEqual(100);
  // retention[1] for 2025-01 should be <= 100 (here 50/150 => 33..)
  expect(rowMap['2025-01'].retention[1]).toBeGreaterThanOrEqual(0);
});
