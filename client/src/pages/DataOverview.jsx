import React from 'react';
import ChurnChart from '../components/ChurnChart';
import { formatCurrency } from '../lib/appShared';

const DataOverview = ({ overviewData }) => {
	const StatCard = ({ title, value, description }) => (
		<div className="bg-white p-5 rounded-xl shadow-md border border-gray-200">
			<p className="text-sm font-medium text-gray-500 truncate">{title}</p>
			<p className="mt-1 text-3xl font-extrabold text-gray-900">{value}</p>
			<p className="mt-2 text-xs text-gray-500">{description}</p>
		</div>
	);

	return (
		<div className="p-4 md:p-8">
			<h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2">Overview — Key Metrics</h2>
  
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
		  <StatCard title="Total Customers (Global)" value={overviewData?.customerCount || 'N/A'} description="Current customer count loaded (Global)." />
		  <div className="bg-white p-5 rounded-xl shadow-md border border-gray-200">
			<p className="text-sm font-medium text-gray-500 truncate">Total Monthly Revenue (Global)</p>
			<p className="mt-1 text-3xl font-extrabold text-gray-900">{formatCurrency(overviewData?.totalMRR || 0)}</p>
			<p className="mt-2 text-xs text-gray-500">Sum of all customers' MRR.</p>
		  </div>
		  <StatCard title="Average MRR (Global)" value={formatCurrency(overviewData?.avgMrr || 0)} description="Monthly Recurring Revenue per customer (Global)." />
		  <StatCard title="Est. Annual Revenue (Global)" value={formatCurrency(overviewData?.totalRevenue || 0)} description="Total MRR multiplied by 12 (Global)." />
		</div>
		<div className="mt-2 text-xs text-gray-500">Overview = global snapshot. Use the ARR tab for cohort-level breakdown.</div>

		<div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6">
		  <StatCard title="Churned MRR (est)" value={formatCurrency(overviewData?.churnedMRR || 0)} description="Heuristic of at-risk monthly MRR." />
		  <StatCard title="Estimated NRR" value={`${Math.round((overviewData?.estimatedNRR || 1) * 100)}%`} description="Net Revenue Retention (approx)." />
		  <StatCard title="Churn % (by count)" value={`${Math.round((overviewData?.churnRateByCount || 0) * 100)}%`} description="Percent of customers flagged as at-risk." />
		</div>
		<div className="mt-8 p-6 bg-white shadow-xl rounded-xl border border-gray-100">
		  <h3 className="text-xl font-bold text-gray-800 mb-4">Core Metrics Chart <span className="ml-2 align-middle" title="Monthly revenue flows: New = first-month revenue; Expansion = upsells; Churn = revenue lost."><svg xmlns="http://www.w3.org/2000/svg" className="inline-block w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg><span className="sr-only">Info: Monthly revenue flows — New, Expansion, Churn</span></span></h3>
		  <p className="text-gray-600">New vs Expansion vs Churn (monthly) — simple stacked view. <span className="ml-2 align-middle" title="Hover to read: New = revenue from newly acquired customers this month; Expansion = net positive MRR changes from existing customers; Churn = MRR lost this month."><svg xmlns="http://www.w3.org/2000/svg" className="inline-block w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg><span className="sr-only">Info: New, Expansion, Churn definitions</span></span></p>
		  {overviewData?.monthlySeries && overviewData.monthlySeries.length > 0 ? (
			<ChurnChart data={overviewData.monthlySeries} />
		  ) : (
			<div className="h-48 bg-gray-50 border border-dashed border-gray-300 rounded-lg mt-4 flex items-center justify-center text-gray-400">[Chart Placeholder: Visualizing Loaded Customer Data Distributions]</div>
		  )}
		</div>
	  </div>
	);
};

export default DataOverview;
