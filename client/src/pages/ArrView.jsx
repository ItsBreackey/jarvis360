import React, { useState, useEffect, useMemo } from 'react';
import { toCSV, downloadCSV } from '../utils/csv';
import { generateCohortTable, generateCohortRetention, topCustomers, listCustomersForCell } from '../utils/cohorts';
import { InfoIcon } from '../lib/appShared';
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip as ReTooltip, LineChart, Line, BarChart, Bar, Area } from 'recharts';

// Lightweight Modal used by this page (kept local to avoid new global deps)
const Modal = ({ title = '', open = false, children, onClose = () => {} }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="text-sm text-gray-500">Close</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};

const ArrView = ({ records = [] }) => {
  const [serverSummary, setServerSummary] = useState(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const auth = require('../utils/auth').default;
        const me = await auth.me();
        if (!me || !me.user) return;
        const resp = await auth.apiFetch('/api/arr-summary/', { method: 'GET' });
        if (!resp.ok) return;
        const data = await resp.json();
        if (mounted) setServerSummary(data);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const cohorts = generateCohortTable(records, { dateKey: 'signup_date', valueKey: 'mrr', months: 12 });
  const tops = topCustomers(records, { valueKey: 'mrr', idKey: 'customer_id', limit: 5 });
  const [showRetention, setShowRetention] = useState(true);
  const retention = useMemo(() => generateCohortRetention(records, { dateKey: 'signup_date', valueKey: 'mrr', months: 12 }), [records]);
  const formatCurrencyLocal = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const chartMonthly = useMemo(() => {
    const months = cohorts.headers.length;
    const data = cohorts.rows.map(r => r.values);
    const out = [];
    for (let i = 0; i < months; i++) {
      let sum = 0;
      for (const arr of data) sum += Number(arr[i] || 0);
      out.push({ month: String(i), mrr: sum });
    }
    return out;
  }, [cohorts]);

  const stackedSeries = useMemo(() => {
    const months = cohorts.headers.length;
    const series = [];
    for (let i = 0; i < months; i++) {
      const item = { month: String(i) };
      for (const r of cohorts.rows) item[r.cohort] = Number(r.values[i] || 0);
      series.push(item);
    }
    return series;
  }, [cohorts]);

  const sparkline = useMemo(() => chartMonthly.slice(Math.max(0, chartMonthly.length - 6)), [chartMonthly]);
  const cohortBars = useMemo(() => cohorts.rows.map(r => ({ cohort: r.cohort, initial: r.values[0] || 0 })), [cohorts]);
  const totalMRR = useMemo(() => records.reduce((s, r) => s + (Number(r.mrr) || 0), 0), [records]);
  const totalCustomers = useMemo(() => Array.from(new Set(records.map(r => r.customer_id))).length, [records]);
  const ARR = totalMRR * 12;
  const churnRate = useMemo(() => {
    const rows = retention.rows || [];
    let base = 0; let next = 0; const N = 1;
    for (const r of rows) { base += Number(r.values[0] || 0); next += Number(r.values[N] || 0); }
    if (base <= 0) return 0; return Math.max(0, Math.min(100, Math.round((1 - next / base) * 100)));
  }, [retention]);

  const [hover, setHover] = useState(null);
  const [drill, setDrill] = useState(null);
  const colorForPct = (pct) => { const h = Math.round((pct / 100) * 120); return `hsl(${h}, 70%, ${pct > 50 ? 40 : 60}%)`; };
  const onCellClick = (cohort, idx) => { const rows = listCustomersForCell(records, { cohort, monthIndex: idx }); setDrill({ cohort, monthIndex: idx, rows }); };

  const exportCohortCSV = () => {
    const headers = ['cohort', ...cohorts.headers];
    const rows = cohorts.rows.map(r => {
      const out = { cohort: r.cohort };
      cohorts.headers.forEach((h, i) => { out[h] = r.values[i] || 0; });
      return out;
    });
    const text = toCSV(rows, headers);
    downloadCSV('cohorts.csv', text);
  };

  return (
    <div className="p-6">
  <h1 className="text-2xl font-bold mb-4">ARR Dashboard<InfoIcon title="Cohort-based ARR, retention matrix, drilldowns, and CSV export." srText="ARR information" /></h1>
      <section className="mb-6">
        <h2 className="text-lg font-semibold">ARR Summary</h2>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="p-3 bg-white rounded shadow-sm border">
            <div className="text-xs text-gray-500">MRR (Cohort)</div>
            <div className="text-xl font-semibold">{formatCurrencyLocal(totalMRR)}</div>
            <div className="text-xs text-gray-400">Monthly recurring revenue (cohort view)</div>
          </div>
          <div className="p-3 bg-white rounded shadow-sm border">
            <div className="text-xs text-gray-500">ARR (Cohort)</div>
            <div className="text-xl font-semibold">{serverSummary && serverSummary.arr_kpis ? formatCurrencyLocal(serverSummary.arr_kpis.ARR) : formatCurrencyLocal(ARR)}</div>
            <div className="text-xs text-gray-400">Annual recurring revenue (cohort view)</div>
          </div>
          <div className="p-3 bg-white rounded shadow-sm border">
            <div className="text-xs text-gray-500">Customers (Cohort)</div>
            <div className="text-xl font-semibold">{serverSummary && serverSummary.top_customers ? (serverSummary.top_customers.length) : totalCustomers}</div>
            <div className="text-xs text-gray-400">Active customers (cohort view)</div>
          </div>
          <div className="p-3 bg-white rounded shadow-sm border">
            <div className="text-xs text-gray-500">Churn (month 0→1)</div>
            <div className="text-xl font-semibold">{churnRate}%</div>
            <div className="text-xs text-gray-400">Estimated</div>
          </div>
        </div>
      </section>

      <section className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded border p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">ARR trend (monthly MRR)<InfoIcon title="Stacked cohort MRR by month (used to derive ARR)" srText="ARR trend information" /></div>
            <div>
              <button className="text-xs px-2 py-1 border rounded bg-gray-50" onClick={exportCohortCSV}>Export cohorts CSV</button>
            </div>
          </div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <AreaChart data={stackedSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <ReTooltip formatter={(v) => formatCurrencyLocal(v)} />
                {cohorts.rows.map((r, idx) => (
                  <Area key={r.cohort} stackId="1" dataKey={r.cohort} stroke={idx % 2 ? '#60A5FA' : '#34D399'} fill={idx % 2 ? '#60A5FA' : '#34D399'} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ width: 120, height: 40, marginTop: 8 }}>
            <ResponsiveContainer>
              <LineChart data={sparkline}>
                <Line dataKey="mrr" stroke="#2563EB" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-1 bg-white rounded border p-3">
          <div className="text-sm font-medium mb-2">Cohort initial MRR</div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={cohortBars} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="cohort" type="category" />
                <ReTooltip formatter={(v) => formatCurrencyLocal(v)} />
                <Bar dataKey="initial" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {tops.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-medium mb-1">Top customers</div>
              <table className="w-full text-sm border-t">
                <tbody>
                  {tops.map(t => (
                    <tr key={t.id} className="border-b">
                      <td className="py-1">{t.id}</td>
                      <td className="py-1 text-right">{formatCurrencyLocal(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Cohort table (signup-month)</h2>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-600">Toggle: <label className="ml-2"><input type="checkbox" checked={showRetention} onChange={(e) => setShowRetention(e.target.checked)} /> Show retention %</label></div>
        </div>
          <div className="overflow-x-auto bg-white p-3 rounded border">
            <table className="w-full text-sm mb-4">
              <thead>
                <tr>
                  <th className="text-left">Cohort</th>
                  {cohorts.headers.map(h => <th key={h} className="text-right">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {cohorts.rows.map(row => (
                  <tr key={row.cohort} className="border-t">
                    <td className="font-medium py-2">{row.cohort}</td>
                    {row.values.map((v, i) => <td key={i} className="text-right py-2">{formatCurrencyLocal(v)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>

            {showRetention && (
              <div className="overflow-auto">
                <div className="inline-block align-top">
                  <table className="border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="p-2 text-left">Cohort</th>
                        {retention.headers.map(h => <th key={h} className="p-2 text-center">+{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {retention.rows.map(r => (
                        <tr key={r.cohort}>
                          <td className="p-2 font-medium">{r.cohort}</td>
                          {r.retention.map((pct, idx) => (
                            <td key={idx} className="p-1">
                              <div
                                role="button"
                                tabIndex={0}
                                onMouseEnter={() => setHover({ cohort: r.cohort, monthIndex: idx, pct: Math.round(pct), value: r.values[idx] })}
                                onMouseLeave={() => setHover(null)}
                                onClick={() => onCellClick(r.cohort, idx)}
                                style={{ width: 60, height: 30, background: colorForPct(pct), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, cursor: 'pointer' }}
                                aria-label={`Cohort ${r.cohort} month ${idx} retention ${Math.round(pct)}%`}
                              >
                                <span style={{ color: pct > 50 ? '#fff' : '#000', fontWeight: 600 }}>{Math.round(pct)}%</span>
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {hover && (
                  <div className="mt-2 p-2 bg-white border rounded shadow text-sm inline-block">
                    <div><strong>{hover.cohort}</strong> +{hover.monthIndex} month</div>
                    <div>Retention: <strong>{hover.pct}%</strong></div>
                    <div>MRR: {formatCurrencyLocal(hover.value || 0)}</div>
                  </div>
                )}

                <Modal title={drill ? `${drill.cohort} +${drill.monthIndex} customers` : ''} open={!!drill} onClose={() => setDrill(null)}>
                  {drill && (
                    <div>
                      <div className="text-sm text-gray-600 mb-2">{drill.rows.length} customers</div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr><th className="text-left">Customer</th><th className="text-right">MRR</th></tr>
                        </thead>
                        <tbody>
                          {drill.rows.map((row, i) => (
                            <tr key={i}><td>{row.customer_id || row.id || 'unknown'}</td><td className="text-right">{formatCurrencyLocal(row.mrr || 0)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-3 text-right">
                        <button className="px-2 py-1 border rounded bg-gray-50" onClick={() => {
                          const headers = ['customer_id','mrr','signup_date'];
                          const rows = drill.rows.map(r => ({ customer_id: r.customer_id || r.id, mrr: r.mrr, signup_date: r.signup_date }));
                          downloadCSV(`${drill.cohort}_${drill.monthIndex}_customers.csv`, toCSV(rows, headers));
                        }}>Export CSV</button>
                      </div>
                    </div>
                  )}
                </Modal>
              </div>
            )}
          </div>
      </section>
    </div>
  );
};

export default ArrView;
