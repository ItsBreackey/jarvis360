import React from 'react';
import { formatCurrency, NoDataMessage } from '../lib/appShared';

const ChurnPredictor = ({ enhancedCustomers, handleContactCustomer, seedInitialData, computeChurnWhenMissing, setComputeChurnWhenMissing }) => {

    const CustomerTable = ({ customers, onContact, seedInitialData }) => (
        <div className="bg-white p-6 shadow-xl rounded-xl border border-red-100">
          <h3 className="text-xl font-extrabold text-red-800 mb-4 flex items-center">
            <svg className="w-6 h-6 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            High-Risk Customers & Contact Tracker
          </h3>
          {customers.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
        No customer data loaded. Please use the <strong>Data Dashboard</strong> to load or seed initial data.
      </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MRR</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Activity (Days)</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Filter for High and Medium Risk for the tracker, ignoring Low Risk */}
                  {customers.filter(c => c.riskLevel !== 'Low').map((c) => {
                    const isHighRisk = c.riskLevel === 'High';
                    const rowClass = isHighRisk ? 'bg-red-50 hover:bg-red-100 transition' : 'bg-yellow-50 hover:bg-yellow-100 transition';
    
                    return (
                      <tr key={c.id} className={rowClass}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {c.name}
                          <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.riskLevel === 'High' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {c.riskLevel}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(c.MRR)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="w-20 bg-gray-200 rounded-full h-2.5">
                            <div
                              className={`h-2.5 rounded-full ${c.riskLevel === 'High' ? 'bg-red-600' : 'bg-yellow-500'}`}
                              style={{ width: `${c.riskScore.toFixed(0)}%` }}
                              title={`${c.riskScore.toFixed(0)}%`}
                            ></div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {c.lastActivityDays} days
                            {c._churnComputed && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">computed churn</span>
                            )}
                            {c._churnProvided && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">provided</span>
                            )}
                            {c._churnComputed && c._churnDriver && (
                              <span
                                className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800"
                                title={c._churnContributions ? c._churnContributions.map(x => `${x.label}: ${(x.value*100).toFixed(0)}%`).join(' • ') : ''}
                              >
                                {c._churnDriver}
                              </span>
                            )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {c.isContacted ? (
                            <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                              Contacted
                            </span>
                          ) : (
                            <button
                              onClick={() => onContact(c.id)}
                              className="text-white bg-red-500 hover:bg-red-600 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-xs px-3 py-1.5 transition shadow"
                            >
                              Mark Contacted
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              aria-label="Seed initial dummy data"
              onClick={seedInitialData}
              className="text-xs text-blue-500 hover:text-blue-700 transition"
            >
              Seed Initial Dummy Data
            </button>
          </div>
        </div>
      );
    
  return (
    <div className="p-4 md:p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2">Churn Predictor: High-Risk Action List</h2>
      {enhancedCustomers.length === 0 ? (
        <NoDataMessage />
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-gray-600">This list ranks customers with a churn risk score of <strong>40 or higher</strong>. Prioritize contacting the highest-risk customers to improve retention.</p>
            <div className="flex items-center space-x-3">
            <label className="flex items-center text-sm text-gray-600">
              <input type="checkbox" checked={computeChurnWhenMissing} onChange={(e) => setComputeChurnWhenMissing(e.target.checked)} className="mr-2" />
              Compute churn heuristically when missing
            </label>
            <button title="When enabled, the app will estimate churnProbability for rows that didn't provide it using a simple heuristic based on the computed risk score. Values computed this way will be marked in the table." className="text-xs text-gray-500 hover:text-gray-700">?</button>
            </div>
            <div className="mt-2 p-3 bg-gray-50 rounded text-sm text-gray-700">
              <div className="mb-1 font-medium">How the toggle works</div>
              <div className="text-xs mb-2">When enabled, the app will estimate a missing churnProbability from three observable features: Support Tickets, Days since last activity, and MRR. Use the <strong>Settings</strong> tab to adjust the relative importance (weights) of those features; weights are saved to your browser.</div>
              {(() => {
                // read current weights for a tiny inline preview
                let current = { tickets: 0.5, activity: 0.35, mrr: 0.15 };
                try { const raw = localStorage.getItem('jarvis_churn_weights_v1'); if (raw) current = JSON.parse(raw); } catch (e) {}
                const sample = { MRR: 1200, supportTickets: 2, lastActivityDays: 10 };
                // reuse estimator module
                const estMod = require('../utils/churn');
                const res = estMod.default(sample, current);
                const est = (res && typeof res === 'object') ? (res.estimate || 0) : Number(res) || 0;
                return (
                  <div className="text-xs text-gray-600">
                    <div>Current weights: Tickets {Math.round((current.tickets||0)*100)}% • Activity {Math.round((current.activity||0)*100)}% • MRR {Math.round((current.mrr||0)*100)}%</div>
                    <div className="mt-1">Example (MRR 1200, 2 tickets, 10 days inactive): estimated churn ~ <strong className="text-blue-700">{(est*100).toFixed(1)}%</strong></div>
                  </div>
                );
              })()}
            </div>
          </div>
          <CustomerTable
            customers={enhancedCustomers}
            onContact={handleContactCustomer}
            seedInitialData={seedInitialData}
          />
        </>
      )}
    </div>
  );
};

export default ChurnPredictor;
