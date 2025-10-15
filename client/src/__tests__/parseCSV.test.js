import { parseCSV } from '../utils/csv';

describe('parseCSV helper', () => {
  test('parses a basic CSV with headers and numeric MRR', () => {
    const csv = `name,MRR,date\nA,100,2023-01-01\nB,200,2023-02-01`;
    const out = parseCSV(csv, {});
    expect(out.length).toBe(2);
    expect(out[0].MRR).toBe(100);
    expect(out[1].MRR).toBe(200);
  });

  test('handles alternate header names via mapping', () => {
    const csv = `customer,amount,created_at\nC,300,2023-03-01`;
    const out = parseCSV(csv, { mrrKey: 'amount', dateKey: 'created_at', idKey: 'customer' });
    expect(out.length).toBe(1);
    expect(out[0].MRR).toBe(300);
    expect(out[0].date).toBe('2023-03-01');
  });

  test('returns empty for header-only CSV or invalid input', () => {
    expect(parseCSV('', {})).toEqual([]);
    expect(parseCSV('name,MRR,date\n', {})).toEqual([]);
  });

  test('handles quoted fields and commas inside fields', () => {
    const csv = `name,MRR,date\n"Smith, John",150,"2023-04-01"\n"Doe, Jane",250,"2023-05-01"`;
    const out = parseCSV(csv, {});
    expect(out.length).toBe(2);
    expect(out[0].name).toBe('Smith, John');
    expect(out[0].MRR).toBe(150);
    expect(out[1].name).toBe('Doe, Jane');
    expect(out[1].MRR).toBe(250);
  });
});
