import React, { useEffect, useState } from 'react';
import { estimateChurnFromFeaturesDetailed } from '../utils/churn';

const BarChart = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="13" width="3" height="8" rx="1" fill="#ec4899" />
    <rect x="9" y="9" width="3" height="12" rx="1" fill="#f472b6" />
    <rect x="15" y="5" width="3" height="16" rx="1" fill="#fb7185" />
  </svg>
);

const ExpandedChurnAnalysis = ({ calculateChurnRisk, customers = [] }) => {
  const [daysSinceLogin, setDaysSinceLogin] = useState(15);
  const [supportTickets, setSupportTickets] = useState(3);
  const [featuresUsed, setFeaturesUsed] = useState(5);
  const [predictedChurnRisk, setPredictedChurnRisk] = useState(0);

  const mockChurnDrivers = [
    { driver: 'Poor Onboarding Experience', impactPercentage: 35, priority: 'High' },
    { driver: 'High Pricing Perceived Value', impactPercentage: 25, priority: 'High' },
    { driver: 'Lack of Key Feature X', impactPercentage: 18, priority: 'Medium' },
    { driver: 'Low Customer Service Responsiveness', impactPercentage: 12, priority: 'Medium' },
  ];

  const computeTelemetryAvg = (custs) => {
    try {
      if (!custs || custs.length === 0) return null;
      const sum = custs.reduce((s, c) => s + (c.riskScore || 0), 0);
      const avg = sum / custs.length;
      return Math.max(0, Math.min(100, Math.round(avg)));
    } catch (e) { return null; }
  };

  const telemetryAvg = computeTelemetryAvg(customers);

  useEffect(() => {
    const handler = setTimeout(() => {
      try {
        const sample = { supportTickets, lastActivityDays: daysSinceLogin, MRR: 0 };
        const res = estimateChurnFromFeaturesDetailed(sample);
        let score = Math.round((res && typeof res.estimate === 'number') ? (res.estimate * 100) : 0);
        // Blend with telemetry average when available (60% local input, 40% telemetry)
        if (typeof telemetryAvg === 'number' && !Number.isNaN(telemetryAvg)) {
          score = Math.round((0.6 * score) + (0.4 * telemetryAvg));
        }
        setPredictedChurnRisk(Math.max(0, Math.min(100, score)));
      } catch (e) {
        setPredictedChurnRisk(0);
      }
    }, 100);
    return () => clearTimeout(handler);
  }, [daysSinceLogin, supportTickets, featuresUsed, telemetryAvg]);

  const renderChurnRiskGauge = (risk, populationAvg = null) => {
    let color = 'text-green-600';
    let strokeColor = '#10b981';
    let message = 'Low Risk';
    if (risk > 50) { color = 'text-yellow-600'; strokeColor = '#f59e0b'; message = 'Moderate Risk'; }
    if (risk > 75) { color = 'text-red-600'; strokeColor = '#ef4444'; message = 'High Risk - Intervention Needed'; }

    const dashArrayLength = Math.PI * 40;
    const dashOffset = dashArrayLength * (1 - risk / 100);

    return (
      <div className="flex flex-col items-center mt-4">
        <div className="w-32 h-16 relative overflow-hidden">
          <svg viewBox="0 0 100 50" className="w-full h-full">
            <path d="M 10 40 A 40 40 0 0 1 90 40" fill="none" stroke="#e5e7eb" strokeWidth="10" />
            <circle
              cx="50"
              cy="40"
              r="40"
              fill="none"
              stroke={strokeColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={dashArrayLength}
              strokeDashoffset={dashOffset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 100%', transition: 'stroke-dashoffset 0.5s ease-out' }}
            />
          </svg>
          <div className="absolute inset-x-0 bottom-0 text-center -mt-2">
            <p className={`text-xl font-bold ${color}`}>{risk}%</p>
          </div>
          {typeof populationAvg === 'number' && !Number.isNaN(populationAvg) && (
            <div className="absolute left-1/2 transform -translate-x-1/2 -top-2">
              <div className="w-px h-3 bg-gray-400" style={{ transform: `rotate(${(populationAvg / 100) * 180 - 90}deg)`, transformOrigin: '50% 100%' }} />
            </div>
          )}
        </div>
        <p className={`mt-2 font-medium ${color}`}>{message}</p>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
      <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg border border-pink-100 h-full">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Predictive Model Test</h3>
        <p className="text-sm text-gray-600 mb-4">Input user activity metrics to estimate churn risk score instantly.</p>
        <div className="space-y-4">
          <div>
            <label htmlFor="daysLogin" className="block text-sm font-medium text-gray-700">Days Since Last Login (<span className="font-bold">{daysSinceLogin}</span>)</label>
            <input id="daysLogin" type="range" min="1" max="60" value={daysSinceLogin} onChange={(e) => setDaysSinceLogin(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:ring-pink-500 focus:border-pink-500 transition"/>
          </div>
          <div>
            <label htmlFor="tickets" className="block text-sm font-medium text-gray-700">Open Support Tickets (<span className="font-bold">{supportTickets}</span>)</label>
            <input id="tickets" type="range" min="0" max="10" value={supportTickets} onChange={(e) => setSupportTickets(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:ring-pink-500 focus:border-pink-500 transition"/>
          </div>
          <div>
            <label htmlFor="features" className="block text-sm font-medium text-gray-700">Core Features Used Monthly (<span className="font-bold">{featuresUsed}</span>)</label>
            <input id="features" type="range" min="1" max="10" value={featuresUsed} onChange={(e) => setFeaturesUsed(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:ring-pink-500 focus:border-pink-500 transition"/>
          </div>
        </div>
        <div className="mt-6 border-t border-pink-200 pt-4">
          <p className="text-sm font-semibold text-gray-500">Predicted Churn Risk:</p>
          {renderChurnRiskGauge(predictedChurnRisk, telemetryAvg)}
        </div>
      </div>

      <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border border-pink-100">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Retention Strategy Prioritizer (ROI)</h3>
        <p className="text-sm text-gray-600 mb-4">Analyze the potential return on investment (ROI) for targeted retention campaigns by driver.</p>
        <div className="space-y-4">
          {mockChurnDrivers.map((driver, index) => {
            const retentionImpact = driver.impactPercentage * 0.4 * (driver.priority === 'High' ? 1.5 : 1);
            const roiPercentage = retentionImpact * (driver.priority === 'High' ? 6 : 4);
            return (
              <div key={index} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-xl transition hover:shadow-md">
                <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-pink-100 text-pink-600 rounded-full">
                  <BarChart className="w-6 h-6" />
                </div>
                <div className="flex-grow">
                  <p className="font-semibold text-gray-800">{driver.driver}</p>
                  <p className="text-sm text-gray-500">Targeted Campaign Potential: Reduce churn by ~<span className="font-bold text-pink-600">{retentionImpact.toFixed(1)}%</span></p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">Est. ROI</p>
                  <p className={`text-xl font-bold ${roiPercentage > 50 ? 'text-green-600' : 'text-orange-500'}`}>{roiPercentage.toFixed(0)}%</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-gray-500 border-t pt-3">
          <span className="font-bold text-gray-700">Recommendation:</span> Prioritize campaigns targeting **Poor Onboarding Experience** and **Pricing Value** for the highest estimated ROI.
        </p>
      </div>
    </div>
  );
};

export default ExpandedChurnAnalysis;
