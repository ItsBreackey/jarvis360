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
  const churnKey = mapping.churnKey || headerLine.find(h => /churn|churnProbability|churn_prob|churn_rate|churn%/i.test(h)) || null;
  const supportKey = mapping.supportKey || headerLine.find(h => /support|ticket|tickets|open_tickets|num_tickets/i.test(h)) || null;
  const lastActivityKey = mapping.lastActivityKey || headerLine.find(h => /lastActivity|last_activity|last_login|days_ago|days_inactive|inactive_days|lastSeen|last_seen/i.test(h)) || null;

  const normalized = rows.map((r, i) => {
    const out = { isContacted: r.isContacted === 'true' || r.isContacted === true ? true : false, uploadedAt: new Date().toISOString() };
    out.id = (r[idKey] || r.id || r.name || `${i}_${Date.now()}`);
    out.name = r.name || out.id;
    out.MRR = mrrKey && r[mrrKey] ? parseFloat(String(r[mrrKey]).replace(/[^0-9.-]+/g, '')) || 0 : 0;
    if (dateKey && r[dateKey]) {
      // normalize common date formats to YYYY-MM-DD when possible
      const d = new Date(r[dateKey]);
      if (!isNaN(d.getTime())) {
        out.date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } else {
        out.date = r[dateKey];
      }
    }
    // Respect a churnKey mapping if provided; fall back to common field names
    // Track whether the churn value was present in the uploaded CSV
    const rawChurn = (churnKey && (r[churnKey] !== undefined) ? r[churnKey] : (r.churnProbability !== undefined ? r.churnProbability : (r.churn !== undefined ? r.churn : undefined)));
    out._churnProvided = rawChurn !== undefined && rawChurn !== '';
    if (rawChurn !== undefined && rawChurn !== '') {
      let v = parseFloat(String(rawChurn).replace(/[^0-9.-]+/g, '')) || 0;
      // if value looks like a percent (e.g., 12 or 12%), normalize to 0-1
      if (v > 1) v = v / 100;
      out.churnProbability = v;
    } else {
      // leave churnProbability as 0 for now; downstream UI/logic can compute heuristics when desired
      out.churnProbability = 0;
    }
    // support tickets: prefer mapped header, fall back to common names
    if (supportKey && r[supportKey] !== undefined) {
      out.supportTickets = parseFloat(String(r[supportKey]).replace(/[^0-9.-]+/g, '')) || 0;
    } else {
      out.supportTickets = r.supportTickets ? parseFloat(r.supportTickets) || 0 : 0;
    }
    // last activity days: prefer mapped header, fall back to common names (and allow last_login_days_ago)
    if (lastActivityKey && r[lastActivityKey] !== undefined) {
      out.lastActivityDays = parseFloat(String(r[lastActivityKey]).replace(/[^0-9.-]+/g, '')) || 0;
    } else if (r.lastActivityDays !== undefined) {
      out.lastActivityDays = parseFloat(r.lastActivityDays) || 0;
    } else if (r.last_login_days_ago !== undefined) {
      out.lastActivityDays = parseFloat(r.last_login_days_ago) || 0;
    } else {
      out.lastActivityDays = 0;
    }
    out.contractLengthMonths = r.contractLengthMonths ? parseFloat(r.contractLengthMonths) || 12 : 12;
    return out;
  });

  return normalized.filter(c => c.MRR !== undefined && c.MRR !== null && !Number.isNaN(c.MRR));
}

export default parseCSV;
