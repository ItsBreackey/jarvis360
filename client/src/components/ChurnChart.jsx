import React from 'react';
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

export default function ChurnChart({ data }) {
  if (!data || !Array.isArray(data) || data.length === 0) return (
    <div className="h-48 bg-gray-50 border border-dashed border-gray-300 rounded-lg mt-4 flex items-center justify-center text-gray-400">[No data]</div>
  );

  // Normalize fields to numbers
  const payload = data.map(d => ({ period: d.period, New: Number(d.new || 0), Expansion: Number(d.expansion || 0), Churn: Number(d.churn || 0) }));

  return (
    <div className="mt-4 h-48">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={payload} margin={{ top: 6, right: 20, left: 0, bottom: 6 }}>
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis />
          <Tooltip formatter={(v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)} />
          <Legend />
          <Bar dataKey="New" stackId="a" fill="#10B981" />
          <Bar dataKey="Expansion" stackId="a" fill="#3B82F6" />
          <Bar dataKey="Churn" stackId="a" fill="#EF4444" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
