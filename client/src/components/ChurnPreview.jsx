import React, { useMemo } from 'react';

// Compact churn preview used in the Simulation page. Accepts either a full customers array
// or a precomputed telemetryAvg (0-100). Renders a small gauge and 2-3 top drivers summary.
const ChurnPreview = ({ customers = [], telemetryAvg = null }) => {
  const computeTelemetryAvg = (custs) => {
    try {
      if (!custs || custs.length === 0) return null;
      const sum = custs.reduce((s, c) => s + (c.riskScore || 0), 0);
      return Math.max(0, Math.min(100, Math.round(sum / custs.length)));
    } catch (e) { return null; }
  };

  const avg = telemetryAvg === null ? computeTelemetryAvg(customers) : telemetryAvg;

  // small gauge renderer (semi-circle) — keeps markup minimal
  const Gauge = ({ value = 0, populationAvg = null }) => {
    const risk = Math.max(0, Math.min(100, Math.round(value)));
    let color = 'text-green-600';
    let stroke = '#10b981';
    if (risk > 50) { color = 'text-yellow-600'; stroke = '#f59e0b'; }
    if (risk > 75) { color = 'text-red-600'; stroke = '#ef4444'; }
    const dash = Math.PI * 40;
    const offset = dash * (1 - risk / 100);
    return (
      <div className="flex items-center space-x-4">
        <div className="w-28 h-14 relative">
          <svg viewBox="0 0 100 50" className="w-full h-full">
            <path d="M 10 40 A 40 40 0 0 1 90 40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            <circle cx="50" cy="40" r="40" fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={offset} style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 100%' }} />
          </svg>
          <div className="absolute inset-x-0 bottom-0 text-center -mt-1">
            <div className={`text-sm font-bold ${color}`}>{risk}%</div>
          </div>
        </div>
        <div className="text-xs text-gray-600">
          <div>Population avg: {typeof populationAvg === 'number' ? `${populationAvg}%` : '—'}</div>
          <div className="mt-1">Top drivers: Onboarding, Pricing</div>
        </div>
      </div>
    );
  };

  // For preview we show the telemetry avg (if available) and a quick indicator blended
  const blended = useMemo(() => {
    // fallback simple heuristic: if we have telemetry avg, use it; else show 35 as neutral
    if (typeof avg === 'number' && !Number.isNaN(avg)) return avg;
    return 35;
  }, [avg]);

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-800">Churn Preview</div>
        <div className="text-xs text-gray-500">Quick insight</div>
      </div>
      <div className="mt-3">
        <Gauge value={blended} populationAvg={avg} />
      </div>
      <div className="mt-3 text-xs text-gray-600">Use the full <strong>Churn Predictor</strong> page for detailed drivers and contact lists.</div>
    </div>
  );
};

export default ChurnPreview;
