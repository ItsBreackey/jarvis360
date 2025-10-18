// cohort utilities
export function monthKeyFromDate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function monthsBetween(a, b) {
  // months from a to b (b may be after a)
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
}

// generateCohortTable(records, { dateKey, valueKey })
// returns { headers: ['0','1','2'...], rows: [{ cohort: '2025-01', values: [100, 80, ...] }] }
export function generateCohortTable(records = [], opts = {}) {
  const { dateKey = 'signup_date', valueKey = 'mrr', months = 12 } = opts;
  // buckets: cohortKey -> array[months] sums
  const buckets = new Map();

  for (const r of records) {
    const signup = r[dateKey];
    const cohort = monthKeyFromDate(signup);
    if (!cohort) continue;
    const eventDate = r.event_date || r.date || signup;
    const offset = monthsBetween(signup, eventDate);
    if (offset === null || offset < 0 || offset >= months) {
      // only count into window 0..months-1
      continue;
    }
    const val = Number(r[valueKey]) || 0;
    if (!buckets.has(cohort)) buckets.set(cohort, new Array(months).fill(0));
    const arr = buckets.get(cohort);
    arr[offset] += val;
  }

  const headers = Array.from({ length: months }).map((_, i) => String(i));
  const rows = Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([cohort, arr]) => ({ cohort, values: arr }));

  return { headers, rows };
}

// compute retention percentages per cohort where baseline is month 0
export function generateCohortRetention(records = [], opts = {}) {
  const { dateKey = 'signup_date', valueKey = 'mrr', months = 12 } = opts;
  const { headers, rows } = generateCohortTable(records, { dateKey, valueKey, months });
  const retentionRows = rows.map(r => {
    const baseline = r.values[0] || 0;
    const pct = r.values.map(v => (baseline > 0 ? (v / baseline) * 100 : 0));
    return { cohort: r.cohort, values: r.values, retention: pct };
  });
  return { headers, rows: retentionRows };
}

export function topCustomers(records = [], opts = {}) {
  const { valueKey = 'mrr', idKey = 'customer_id', limit = 10 } = opts;
  const map = new Map();
  for (const r of records) {
    const id = r[idKey] || r.id || r.name || 'unknown';
    const v = Number(r[valueKey]) || 0;
    map.set(id, (map.get(id) || 0) + v);
  }
  return Array.from(map.entries()).map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total).slice(0, limit);
}

// listCustomersForCell(records, { dateKey, months, cohort, monthIndex })
// returns array of record objects that contributed to a given cohort and month offset
export function listCustomersForCell(records = [], opts = {}) {
  const { dateKey = 'signup_date', cohort, monthIndex } = opts;
  if (!cohort || typeof monthIndex !== 'number') return [];
  const out = [];
  for (const r of records) {
    const signup = r[dateKey];
    const c = monthKeyFromDate(signup);
    if (c !== cohort) continue;
    const eventDate = r.event_date || r.date || signup;
    const offset = monthsBetween(signup, eventDate);
    if (offset === monthIndex) out.push(r);
  }
  return out;
}

const exported = { monthKeyFromDate, generateCohortTable, monthsBetween, listCustomersForCell };
export default exported;
