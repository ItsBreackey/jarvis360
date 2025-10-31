import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'jarvis_churn_weights_v1';

export default function Settings() {
  const [weights, setWeights] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { tickets: 0.5, activity: 0.35, mrr: 0.15 };
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(weights)); } catch (e) {}
  }, [weights]);

  const update = (k, v) => setWeights(prev => {
    // ensure sum remains ~1 by normalizing after update
    const next = { ...prev, [k]: v };
    const s = (next.tickets || 0) + (next.activity || 0) + (next.mrr || 0) || 1;
    return { tickets: (next.tickets || 0) / s, activity: (next.activity || 0) / s, mrr: (next.mrr || 0) / s };
  });

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2">Settings & Configuration</h2>
      <div className="p-8 bg-white rounded-xl shadow-xl border border-gray-200 space-y-4">
        <div className="flex justify-between items-center border-b pb-4">
          <label className="text-lg font-medium text-gray-700">Churn Estimator Weights</label>
        </div>
        <p className="text-gray-600">Adjust how the churn estimator weights features: Support Tickets, Last Activity (days), and MRR (lower MRR — higher risk).</p>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Support Tickets ({Math.round(weights.tickets * 100)}%)</label>
            <input type="range" min="0" max="1" step="0.01" value={weights.tickets} onChange={(e) => update('tickets', Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Last Activity ({Math.round(weights.activity * 100)}%)</label>
            <input type="range" min="0" max="1" step="0.01" value={weights.activity} onChange={(e) => update('activity', Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">MRR ({Math.round(weights.mrr * 100)}%)</label>
            <input type="range" min="0" max="1" step="0.01" value={weights.mrr} onChange={(e) => update('mrr', Number(e.target.value))} className="w-full" />
          </div>
        </div>
        <div className="mt-4 p-4 bg-gray-50 rounded border text-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-700 font-semibold">Estimator preview</div>
            <div className="text-xs text-gray-500">Sample customer</div>
          </div>
          {/* sample customer used to preview weights */}
          {(() => {
            const sample = { MRR: 1200, supportTickets: 2, lastActivityDays: 10 };
            const res = require('../utils/churn').default(sample, weights);
            const estVal = res && typeof res === 'object' ? (res.estimate ?? 0) : Number(res) || 0;
            return (
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-600">MRR 1200 • 2 tickets • 10 days inactive</div>
                <div className="text-sm font-mono text-blue-700">{(estVal * 100).toFixed(1)}%</div>
              </div>
            );
          })()}
          <div className="mt-2 text-xs text-gray-500">This preview shows how the current slider weights influence a simple churn estimate. Values are illustrative.</div>
        </div>
      </div>
    </div>
  );
}
 
