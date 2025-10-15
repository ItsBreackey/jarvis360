import Papa from 'papaparse';

// Robust CSV parsing helper using PapaParse. Returns an array of normalized customer objects.
export function parseCSV(csvText, mapping = {}) {
  if (!csvText || typeof csvText !== 'string') return [];

  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  if (parsed.errors && parsed.errors.length > 0) {
    // For MVP, ignore parse errors and continue with valid rows.
    // Could surface errors to the UI later.
    // console.warn('CSV parse errors', parsed.errors);
  }

  const rows = parsed.data;
  if (!rows || rows.length === 0) return [];

  const headerLine = Object.keys(rows[0]).map(h => String(h).trim());

  const dateKey = mapping.dateKey || headerLine.find(h => /date|month|created_at|uploadedat/i.test(h)) || null;
  const mrrKey = mapping.mrrKey || headerLine.find(h => /mrr|revenue|amount|value/i.test(h)) || null;
  const idKey = mapping.idKey || headerLine.find(h => /id|name|customer/i.test(h)) || 'id';

  const normalized = rows.map((r, i) => {
    const out = { isContacted: r.isContacted === 'true' || r.isContacted === true ? true : false, uploadedAt: new Date().toISOString() };
    out.id = (r[idKey] || r.id || r.name || `${i}_${Date.now()}`);
    out.name = r.name || out.id;
    out.MRR = mrrKey && r[mrrKey] ? parseFloat(String(r[mrrKey]).replace(/[^0-9.-]+/g, '')) || 0 : 0;
    if (dateKey && r[dateKey]) out.date = r[dateKey];
    out.churnProbability = (r.churnProbability !== undefined && r.churnProbability !== '') ? parseFloat(r.churnProbability) || 0 : (r.churn || 0);
    out.supportTickets = r.supportTickets ? parseFloat(r.supportTickets) || 0 : 0;
    out.lastActivityDays = r.lastActivityDays ? parseFloat(r.lastActivityDays) || 0 : 0;
    out.contractLengthMonths = r.contractLengthMonths ? parseFloat(r.contractLengthMonths) || 12 : 12;
    return out;
  });

  return normalized.filter(c => c.MRR !== undefined && c.MRR !== null && !Number.isNaN(c.MRR));
}

export default { parseCSV };
