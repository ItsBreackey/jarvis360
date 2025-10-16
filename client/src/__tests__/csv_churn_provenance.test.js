import parseCSV from '../utils/csv';

test('parseCSV sets _churnProvided and normalizes percent and decimal churn values', () => {
  const csv = `id,name,MRR,churn,other
1,Acme,1000,12%,x
2,Beta,2000,0.05,y
3,Gamma,1500,,z
`;

  const rows = parseCSV(csv, { idKey: 'id', mrrKey: 'MRR', churnKey: 'churn' });
  expect(rows).toHaveLength(3);

  const [r1, r2, r3] = rows;
  // row1 provided as percent -> normalized to 0.12
  expect(r1._churnProvided).toBe(true);
  expect(typeof r1.churnProbability).toBe('number');
  expect(Math.abs(r1.churnProbability - 0.12)).toBeLessThan(1e-6);

  // row2 provided as decimal
  expect(r2._churnProvided).toBe(true);
  expect(Math.abs(r2.churnProbability - 0.05)).toBeLessThan(1e-6);

  // row3 missing churn: _churnProvided false and churnProbability 0 (parser leaves 0)
  expect(r3._churnProvided).toBe(false);
  expect(r3.churnProbability).toBe(0);
});
