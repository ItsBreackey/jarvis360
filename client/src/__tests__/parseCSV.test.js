import { parseCSV } from '../utils/csv';

test('parseCSV parses simple CSV text', () => {
	const txt = 'a,b\n1,2\n3,4\n';
	const rows = parseCSV(txt);
	expect(Array.isArray(rows)).toBe(true);
	expect(rows.length).toBe(2);
	expect(rows[0].a).toBe(1);
});

