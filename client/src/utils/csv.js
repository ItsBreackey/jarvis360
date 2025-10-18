export function toCSV(rows = [], headers = []) {
  // headers: array of column names
  const all = [];
  if (headers && headers.length) all.push(headers.join(','));
  for (const row of rows) {
    const line = headers.map(h => {
      const v = row[h] == null ? '' : String(row[h]);
      // escape quotes
      return `"${v.replace(/"/g, '""')}"`;
    }).join(',');
    all.push(line);
  }
  return all.join('\n');
}

export function downloadCSV(filename = 'export.csv', text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Minimal CSV parser for tests and small payloads. Produces array of objects.
export function parseCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim()));
  return rows.map(cols => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = cols[i] === undefined ? '' : cols[i];
      // coerce small numeric strings
      if (/^-?\d+(?:\.\d+)?$/.test(v)) obj[h] = Number(v);
      else obj[h] = v;
    });
    return obj;
  });
}
// Note: CSV parsing helper removed to avoid adding a runtime dependency in this patch.
