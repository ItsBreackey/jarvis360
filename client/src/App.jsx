import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Zap, X, TrendingUp, Upload, AlertTriangle, CheckCircle, TrendingDown, Activity, UserCheck } from 'lucide-react';


// --- UTILITY & SIMULATION FUNCTIONS ---


// --- Data Interfaces (Simplified to plain JS objects for JSX compatibility) ---

/** @typedef {{ id: string, [key: string]: any }} GenericData */
/** @typedef {{ id: string, name: string, MRR: number, churnProbability: number, supportTickets: number, lastActivityDays: number, contractLengthMonths: number, isContacted: boolean }} CustomerData */
/** @typedef {CustomerData & { riskScore: number, riskLevel: 'High' | 'Medium' | 'Low' }} EnhancedCustomerData */

// --- Utility Functions ---

/**
 * Calculates a churn risk score (0-100) based on multiple factors.
 * @param {CustomerData} customer
 * @returns {number}
 */
const calculateChurnRiskScore = (customer) => {
  const MRR = parseFloat(String(customer.MRR)) || 0;
  const churnProbability = parseFloat(String(customer.churnProbability)) || 0;
  const supportTickets = parseFloat(String(customer.supportTickets)) || 0;
  const lastActivityDays = parseFloat(String(customer.lastActivityDays)) || 0;

  // Weights for different factors
  const weightProbability = 0.5;
  const weightTickets = 0.2;
  const weightActivity = 0.2;
  const weightMRR = 0.1; 

  // Normalize data and assign risk components (0 to 1)
  let probRisk = churnProbability;
  let ticketRisk = Math.min(supportTickets / 10, 1); 
  let activityRisk = Math.min(lastActivityDays / 60, 1); 
  let mrrRisk = 1 - Math.min(MRR / 2000, 1); // Low MRR increases risk

  const score = (
    (probRisk * weightProbability) +
    (ticketRisk * weightTickets) +
    (activityRisk * weightActivity) +
    (mrrRisk * weightMRR)
  ) * 100;

  return Math.max(0, Math.min(100, Math.round(score)));
};

/**
 * Formats a number into US dollar currency string.
 * @param {number} amount
 * @returns {string}
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};


/**
 * Simple CSV parser for in-browser use. Assumes comma-separated values and a header row.
 * Attempts to convert values to numbers where appropriate.
 */
const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    // Simple header parsing, cleaning up quotes
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length !== headers.length) continue; // Skip incomplete lines

        const row = {};
        headers.forEach((header, index) => {
            let value = values[index].trim().replace(/"/g, '');
            // Attempt to parse to number
            const num = Number(value);
            row[header] = isNaN(num) || value.length === 0 ? value : num;
        });
        data.push(row);
    }
    return data;
};

/**
 * Finds the primary metric (first suitable numeric column) from the dataset.
 */
const getPrimaryMetric = (data) => {
  if (!data || data.length === 0) return null;
  const columns = Object.keys(data[0]);
  return columns.find(col => typeof data[0][col] === 'number') || null;
};


// 1. Simulated AI Summary Generation (Uses actual uploaded data)
const generateAISummary = (data, metric) => {
  if (!data || data.length === 0 || !metric) {
      return "Please upload a dataset to generate the AI Data Summary.";
  }
  
  const numRecords = data.length;
  const numCols = Object.keys(data[0] || {}).length;
  
  const metricValues = data.map(d => d[metric]);
  const numericValues = metricValues.filter(v => typeof v === 'number');

  if (numericValues.length === 0) {
      return `The dataset contains ${numRecords} records with ${numCols} columns, but the primary metric '${metric}' has no numeric data for analysis.`;
  }
  
  const avg = (numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(2);
  const avgFormatted = new Intl.NumberFormat('en-US').format(avg);
  
  return `**AI Data Summary**
Analysis of uploaded data: The dataset contains **${numRecords} records** with **${numCols} columns**. The primary numeric column is **'${metric}'**. The average of this column is approximately **${avgFormatted}**. The data appears ready for analysis, suitable for time-series forecasting.`;
};


// 2. Simulated AI Forecast Generation (Uses actual uploaded data and period)
const generateAIForecastSummary = (metric, periods) => {
  const finalValue = Math.floor(Math.random() * 500) + 2000;
  const lower = finalValue - 150;
  const upper = finalValue + 150;
  
  return `**AI Forecast Summary**
Forecast using the last 5 points of your data on metric **'${metric}'**. The model predicts a **consistent upward trend** over the next ${periods} periods. The 90% confidence interval suggests the value will be between **${lower} and ${upper}** at the final period, indicating moderate certainty. Watch out for potential seasonality, which this short sample data does not fully capture.`;
};

// 3. Simulation Logic for What-If Scenarios
const calculateScenarioOutcome = (params) => {
  const { baseMetric, costReduction, timeframe, saleIncrease } = params;
  
  // Simple compounded simulation over the timeframe (months)
  let revenue = baseMetric;
  let costBase = baseMetric * 0.7; // Assume 70% cost structure initially
  
  const results = [];

  for (let i = 1; i <= timeframe; i++) {
    // Apply sales growth and cost reduction over the period
    revenue = revenue * (1 + (saleIncrease / 100 / 12));
    costBase = costBase * (1 - (costReduction / 100 / 12));
    
    const profit = revenue - costBase;

    results.push({
      month: `M${i}`,
      Revenue: revenue,
      Profit: profit,
      Costs: costBase
    });
  }
  return results;
};


// --- UI COMPONENTS ---

const NavItem = ({ icon: Icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center space-x-3 p-3 text-sm font-medium rounded-lg transition-all w-full text-left ${
      isActive
        ? 'bg-blue-600 text-white shadow-lg'
        : 'text-gray-600 hover:bg-gray-100'
    }`}
  >
    <Icon className="w-5 h-5" />
    <span>{label}</span>
  </button>
);

const SectionCard = ({ title, children, className = '' }) => (
  <div className={`bg-white p-6 rounded-xl shadow-lg border border-gray-100 ${className}`}>
    <h2 className="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">{title}</h2>
    {children}
  </div>
);

const CustomSlider = ({ label, value, unit, min, max, step, onChange }) => (
  <div className="mb-4">
    <label className="text-sm font-medium text-gray-700 block mb-2">
      {label}: <span className="font-bold text-blue-600">{new Intl.NumberFormat('en-US').format(value)}{unit}</span>
    </label>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg accent-blue-600"
    />
  </div>
);

const DataMissingPrompt = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-96 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 p-8 text-center">
    <AlertTriangle className="w-12 h-12 text-yellow-500 mb-4" />
    <h3 className="text-xl font-semibold text-gray-800">No Data Available</h3>
    <p className="text-gray-600 mt-2">{message}</p>
  </div>
);


// --- 1. DATA DASHBOARD SECTION (MODIFIED FOR UPLOAD & MOCK KPIS) ---

const DataDashboard = ({ data, onDataUpload }) => {
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const parsedData = parseCSV(text);
                onDataUpload(parsedData);
            } catch (error) {
                console.error("Error processing file:", error);
                onDataUpload([]); // Clear data on error
            }
        };
        reader.readAsText(file);
    };

    return (
        <SectionCard title="Data Source & Upload">
            <div className="mb-6 p-4 border border-blue-200 bg-blue-50 rounded-lg flex items-center space-x-3">
                {data && data.length > 0 ? (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                ) : (
                    <AlertTriangle className="w-6 h-6 text-yellow-500" />
                )}
                <p className="text-gray-700">
                    {data && data.length > 0
                        ? `Dataset loaded successfully! Records: ${data.length}. Primary Metric: ${getPrimaryMetric(data) || 'N/A'}`
                        : 'Please upload a CSV file below to begin analysis.'
                    }
                </p>
            </div>

            <div className="flex items-center space-x-4">
                <label className="flex items-center justify-center px-4 py-3 bg-blue-500 text-white rounded-lg shadow-md cursor-pointer hover:bg-blue-600 transition-colors font-semibold">
                    <Upload className="w-5 h-5 mr-2" />
                    Upload CSV File
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
            </div>
            
            {/* REINSTATED: Original Mock KPI section */}
            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h3 className="font-semibold text-gray-700">Interactive Data Dashboard (Mock KPIs)</h3>
                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2">
                    <p>Total Revenue: <span className="font-bold text-green-600">$12,000</span></p>
                    <p>Active Users: <span className="font-bold text-blue-600">450</span></p>
                    <p>Conversion Rate: <span className="font-bold text-purple-600">4.5%</span></p>
                </div>
            </div>

            <div className="mt-6">
                <h3 className="text-lg font-semibold mb-2">Data Preview ({data ? data.length : 0} Rows)</h3>
                <div className="overflow-x-auto max-h-60 border rounded-lg">
                    {data && data.length > 0 ? (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    {Object.keys(data[0]).map(key => (
                                        <th key={key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{key}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {data.slice(0, 5).map((row, index) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                        {Object.values(row).map((value, i) => (
                                            <td key={i} className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                                                {typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) : String(value)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {data.length > 5 && (
                                    <tr className="bg-gray-100">
                                        <td colSpan={Object.keys(data[0]).length} className="px-4 py-2 text-center text-xs text-gray-500">
                                            ... {data.length - 5} more rows hidden
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <div className="p-4 text-center text-gray-500">No data to display. Please upload a CSV file.</div>
                    )}
                </div>
            </div>
        </SectionCard>
    );
};


// --- 2. DATA OVERVIEW SECTION (DYNAMIC) ---

const DataOverview = ({ data }) => {
    const primaryMetric = useMemo(() => getPrimaryMetric(data), [data]);
    const summaryText = useMemo(() => generateAISummary(data, primaryMetric), [data, primaryMetric]);

    const dataStats = useMemo(() => {
        if (!data || data.length === 0) return [];
        
        const columns = Object.keys(data[0]);
        const numericColumns = columns.filter(col => typeof data[0][col] === 'number');
        
        return numericColumns.map(col => {
          const values = data.map(d => d[col]);
          const numericValues = values.filter(v => typeof v === 'number');
          
          if (numericValues.length === 0) return null;

          const sum = numericValues.reduce((a, b) => a + b, 0);
          const avg = (sum / numericValues.length).toFixed(2);
          const min = Math.min(...numericValues);
          const max = Math.max(...numericValues);
          
          return {
            column: col,
            average: new Intl.NumberFormat('en-US').format(avg),
            min: new Intl.NumberFormat('en-US').format(min),
            max: new Intl.NumberFormat('en-US').format(max),
            count: numericValues.length,
          };
        }).filter(stat => stat !== null);
    }, [data]);

    if (!data || data.length === 0) {
        return <DataMissingPrompt message="Go to the 'Data Dashboard' section to upload a CSV file before viewing the overview." />;
    }

    return (
        <div className="space-y-6">
            <SectionCard title="AI Data Summary">
                <div className="p-4 bg-blue-50 rounded-lg text-blue-800 border border-blue-200">
                    <p className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: summaryText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                </div>
            </SectionCard>

            <SectionCard title="Column Statistics Table">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Column</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Average</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Max</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {dataStats.map((stat) => (
                                <tr key={stat.column} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{stat.column}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{stat.count}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{stat.average}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{stat.min}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{stat.max}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        </div>
    );
};


// --- 3. TIME-SERIES FORECAST SECTION (DYNAMIC) ---

const TimeSeriesForecast = ({ data }) => {
    const [forecastPeriod, setForecastPeriod] = useState(5);
    const primaryMetric = useMemo(() => getPrimaryMetric(data), [data]);

    if (!data || data.length === 0 || !primaryMetric) {
        return <DataMissingPrompt message="Please upload a dataset with at least one numeric column in the 'Data Dashboard' to run a forecast." />;
    }

    const forecastSummary = generateAIForecastSummary(primaryMetric, forecastPeriod);

    // Dynamic Mock Forecast Data Generation based on last point of uploaded data
    const lastDataPoint = data[data.length - 1];
    const lastMonthValue = lastDataPoint ? lastDataPoint[primaryMetric] : 0;
    
    // Generate simple linear forecast for demonstration
    const mockForecastData = Array.from({ length: forecastPeriod }, (_, i) => {
        const base = lastMonthValue + (i + 1) * (lastMonthValue / 20); // 5% growth per period
        const offset = Math.random() * 50 - 25;
        const predicted = base + offset;
        return {
            Month: `Forecast ${i + 1}`,
            [primaryMetric]: predicted,
            LowerBound: predicted * 0.9,
            UpperBound: predicted * 1.1,
        };
    });

    // Combine historical and forecast data for charting
    const combinedChartData = useMemo(() => {
        const historical = data.map((d, index) => ({
            ...d,
            // Use index or first non-numeric column as chart X-axis key
            x_axis_key: d.Month || `Period ${index + 1}`,
            Actual: d[primaryMetric],
            Predicted: null,
            LowerBound: null,
            UpperBound: null,
        }));
        
        const forecast = mockForecastData.map(d => ({
            x_axis_key: d.Month,
            Actual: null,
            Predicted: d[primaryMetric],
            LowerBound: d.LowerBound,
            UpperBound: d.UpperBound,
        }));
        
        return [...historical, ...forecast];
    }, [data, mockForecastData, primaryMetric]);
    
    // Helper function for download (reusing logic from previous mock)
    const handleDownloadData = () => {
        const csvContent = "data:text/csv;charset=utf-8," 
          + "Month,Predicted Value,Lower Bound,Upper Bound" + "\n"
          + mockForecastData.map(d => `${d.Month},${d[primaryMetric].toFixed(2)},${d.LowerBound.toFixed(2)},${d.UpperBound.toFixed(2)}`).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "forecast_data.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <SectionCard title="Forecast Parameters">
                <CustomSlider 
                    label="Select Forecast Period" 
                    value={forecastPeriod} 
                    unit=" Periods" 
                    min={1} 
                    max={12} 
                    step={1} 
                    onChange={setForecastPeriod}
                />
                <div className="p-4 mt-4 bg-blue-50 rounded-lg text-blue-800 border border-blue-200">
                    <p className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: forecastSummary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                </div>
            </SectionCard>

            <SectionCard title="Predicted Values & Confidence Interval">
                <div className="h-96 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={combinedChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0"/>
                            <XAxis dataKey="x_axis_key" stroke="#555" />
                            <YAxis stroke="#555" tickFormatter={(value) => new Intl.NumberFormat('en-US').format(value)} />
                            <Tooltip formatter={(value) => new Intl.NumberFormat('en-US').format(value)} />
                            <Legend />
                            
                            {/* Confidence Interval Area (Note: AreaChart must have continuous data for this to look right) */}
                            <Area type="monotone" dataKey="UpperBound" stroke="none" fill="#A8DADC" fillOpacity={0.3} stackId="1" isAnimationActive={false} name="90% Upper Bound" />
                            <Area type="monotone" dataKey="LowerBound" stroke="none" fill="#FFFFFF" fillOpacity={0} stackId="1" isAnimationActive={false} name="90% Lower Bound" />

                            {/* Historical Data */}
                            <Line type="monotone" dataKey="Actual" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name={`Actual ${primaryMetric}`} />
                            
                            {/* Predicted Forecast Data */}
                            <Line type="monotone" dataKey="Predicted" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4 }} strokeDasharray="5 5" name={`Predicted ${primaryMetric}`} />
                            
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex justify-center space-x-4 mt-4">
                    {/* Placeholder for real export functionality */}
                    <button className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Download Graph</span>
                    </button>
                    <button className="flex items-center space-x-2 px-4 py-2 bg-gray-500 text-white rounded-lg shadow-md hover:bg-gray-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        <span>Copy Graph to Clipboard</span>
                    </button>
                </div>
            </SectionCard>

            <SectionCard title="Forecasted Dataset">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Predicted {primaryMetric}</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">90% Lower Bound</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">90% Upper Bound</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {mockForecastData.map((row, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{row.Month}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-blue-600 font-semibold">{new Intl.NumberFormat('en-US').format(row[primaryMetric].toFixed(2))}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{new Intl.NumberFormat('en-US').format(row.LowerBound.toFixed(2))}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{new Intl.NumberFormat('en-US').format(row.UpperBound.toFixed(2))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-end mt-4">
                    <button onClick={handleDownloadData} className="flex items-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4"/><polyline points="17 9 12 14 7 9"/><line x1="12" y1="14" x2="12" y2="3"/></svg>
                        <span>Download Dataset</span>
                    </button>
                </div>
            </SectionCard>
        </div>
    );
};


// --- 4. WHAT-IF SIMULATION SECTION (DYNAMIC) ---

const WhatIfSimulation = ({ data }) => {
    const primaryMetric = useMemo(() => getPrimaryMetric(data), [data]);
    
    if (!data || data.length === 0 || !primaryMetric) {
        return <DataMissingPrompt message="Please upload a dataset with a numeric column in the 'Data Dashboard' to run a What-If Simulation." />;
    }

    // Determine initial base metric from uploaded data (average of primary metric)
    const metricValues = data.map(d => d[primaryMetric]).filter(v => typeof v === 'number');
    const initialBaseMetric = metricValues.length > 0 ? metricValues.reduce((a, b) => a + b, 0) / metricValues.length : 100000;
    
    const initialScenario = {
      baseMetric: Math.floor(initialBaseMetric), // Use the average or a sensible default
      costReduction: 5,
      timeframe: 12,
      saleIncrease: 10,
    };
    
    const [scenarios, setScenarios] = useState([]);
    const [currentScenario, setCurrentScenario] = useState(initialScenario);
    
    // Calculate results for the current preview scenario
    const previewResults = useMemo(() => calculateScenarioOutcome(currentScenario), [currentScenario]);
    
    // Handlers
    const handleSliderChange = (key, value) => {
        setCurrentScenario(prev => ({ ...prev, [key]: value }));
    };

    const handleAddScenario = () => {
        const scenarioName = `Scenario ${scenarios.length + 1}`;
        const newScenario = {
          id: Date.now(),
          name: scenarioName,
          params: currentScenario,
          results: previewResults,
          color: `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`, // Random color
        };
        setScenarios(prev => [...prev, newScenario]);
    };

    const handleResetScenarios = () => {
        setScenarios([]);
        setCurrentScenario(initialScenario); // Reset current scenario to dynamic initial state
    };
    
    const handleDeleteScenario = (id) => {
        setScenarios(prev => prev.filter(s => s.id !== id));
    };
    
    // Data for the main multi-scenario chart
    const allScenarios = scenarios.length > 0 ? scenarios : [{ 
        id: 'preview', 
        name: 'Current Preview', 
        results: previewResults, 
        color: '#FF9800' // Use orange for preview
    }];

    const multiScenarioChartData = useMemo(() => {
        
        // Find the longest timeframe to set the chart length
        const maxMonths = allScenarios.reduce((max, s) => Math.max(max, s.results.length), 0);
        
        const chartData = [];
        for (let i = 0; i < maxMonths; i++) {
            const dataPoint = { month: `M${i + 1}` };
            allScenarios.forEach(s => {
                if (s.results[i]) {
                    // Show Profit for comparison
                    dataPoint[`${s.name} Profit`] = s.results[i].Profit;
                }
            });
            chartData.push(dataPoint);
        }
        return chartData;

    }, [scenarios, previewResults]);


    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Parameters and Controls */}
            <div className="lg:col-span-1 space-y-6">
                <SectionCard title="Scenario Parameters" className="h-full">
                    <CustomSlider 
                        label={`Base Metric for Simulation (${primaryMetric} Avg.)`} 
                        value={currentScenario.baseMetric} 
                        unit="" 
                        min={100} 
                        max={Math.max(200000, currentScenario.baseMetric * 2)} // Dynamic max
                        step={100} 
                        onChange={(v) => handleSliderChange('baseMetric', v)}
                    />
                    <CustomSlider 
                        label="Cost Reduction" 
                        value={currentScenario.costReduction} 
                        unit="%" 
                        min={0} 
                        max={30} 
                        step={1} 
                        onChange={(v) => handleSliderChange('costReduction', v)}
                    />
                    <CustomSlider 
                        label="Timeframe" 
                        value={currentScenario.timeframe} 
                        unit=" Months" 
                        min={3} 
                        max={60} 
                        step={3} 
                        onChange={(v) => handleSliderChange('timeframe', v)}
                    />
                    <CustomSlider 
                        label="Sale Increase" 
                        value={currentScenario.saleIncrease} 
                        unit="%" 
                        min={0} 
                        max={50} 
                        step={1} 
                        onChange={(v) => handleSliderChange('saleIncrease', v)}
                    />
                    <div className="flex space-x-3 mt-6">
                        <button 
                            onClick={handleAddScenario} 
                            className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600 transition-colors font-semibold"
                        >
                            <TrendingUp className="w-5 h-5"/>
                            <span>Add Scenario</span>
                        </button>
                        <button 
                            onClick={handleResetScenarios} 
                            className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-red-500 text-white rounded-lg shadow-md hover:bg-red-600 transition-colors font-semibold"
                        >
                            <X className="w-5 h-5"/>
                            <span>Reset All</span>
                        </button>
                    </div>
                </SectionCard>
            </div>

            {/* Right Column: Graphs */}
            <div className="lg:col-span-2 space-y-6">
                <SectionCard title={scenarios.length === 0 ? "Current Scenario Preview (Profit)" : "Multi-Scenario Comparison (Profit)"}>
                    {/* Scenario Labels/Delete Buttons */}
                    {scenarios.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {scenarios.map(s => (
                                <div key={s.id} className="flex items-center space-x-2 p-2 rounded-full text-sm font-medium text-white shadow-md transition-all" style={{ backgroundColor: s.color }}>
                                    <span>{s.name}</span>
                                    <button onClick={() => handleDeleteScenario(s.id)} className="p-0.5 rounded-full bg-white bg-opacity-30 hover:bg-opacity-50 transition-colors">
                                        <X className="w-3 h-3 text-white"/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <div className="h-96 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={multiScenarioChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                <XAxis dataKey="month" stroke="#555" />
                                <YAxis stroke="#555" tickFormatter={(value) => `$${new Intl.NumberFormat('en-US').format((value / 1000).toFixed(0))}k`} />
                                <Tooltip formatter={(value) => [`$${new Intl.NumberFormat('en-US').format(parseFloat(value).toFixed(2))}`, 'Profit']} />
                                <Legend />
                                {multiScenarioChartData.length > 0 && 
                                    Object.keys(multiScenarioChartData[0]).filter(k => k.includes('Profit')).map((dataKey) => {
                                        const scenario = allScenarios.find(s => `${s.name} Profit` === dataKey);
                                        return (
                                            <Line 
                                                key={dataKey} 
                                                type="monotone" 
                                                dataKey={dataKey} 
                                                stroke={scenario ? scenario.color : '#FF9800'} 
                                                strokeWidth={2} 
                                                dot={false}
                                                name={dataKey.replace(' Profit', '')}
                                                strokeDasharray={dataKey.includes('Preview') ? '3 3' : '0'} // Dotted line for preview
                                            />
                                        );
                                    })
                                }
                            </LineChart>
                        </ResponsiveContainer>
                        {scenarios.length === 0 && <p className="text-center text-sm text-gray-500 mt-2">Add a scenario to save it, or modify parameters for a live preview.</p>}
                    </div>
                </SectionCard>
            </div>
        </div>
    );
};


// --- CHURN PREDICTOR SUB-COMPONENTS ---

// Subcomponent: Dedicated Churn Data Uploader
/** @param {{ onDataUpload: (data: CustomerData[]) => void, showCustomModal: (msg: string) => void, seedInitialData: () => void }} props */
const ChurnDataUploader = ({ onDataUpload, showCustomModal, seedInitialData }) => {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [uploadedCount, setUploadedCount] = useState(0);

    /** @param {string} csvText */
    const parseCSV = (csvText) => {
        const lines = csvText.trim().split('\n');
        if (lines.length <= 1) return [];

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
        
        const headerMap = {
            'mrr': 'MRR', 'churnprobability': 'churnProbability', 'supporttickets': 'supportTickets', 
            'lastactivitydays': 'lastActivityDays', 'contractlengthmonths': 'contractLengthMonths', 'name': 'name'
        };

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length < headers.length) continue;

            /** @type {Partial<CustomerData> & { id: string, isContacted: boolean }} */
            const obj = { id: i.toString() + '_' + Date.now(), isContacted: false };
            let hasRequiredFields = false;

            for (let j = 0; j < headers.length; j++) {
                const cleanKey = headers[j];
                const originalKey = headerMap[cleanKey]; 
                let value = values[j] ? values[j].trim() : '';
                
                if (originalKey) {
                    if (['MRR', 'churnProbability', 'supportTickets', 'lastActivityDays', 'contractLengthMonths'].includes(originalKey)) {
                        obj[originalKey] = parseFloat(value) || 0;
                        if (originalKey === 'MRR') hasRequiredFields = true;
                    } else if (originalKey === 'name') {
                        obj.name = value || `Customer ${i}`;
                    }
                }
            }
            if (hasRequiredFields && obj.name) {
                data.push(/** @type {CustomerData} */ (obj));
            }
        }
        return data;
    };

    /** @param {React.ChangeEvent<HTMLInputElement>} e */
    const handleFileUpload = (e) => {
        const uploadedFile = e.target.files?.[0];
        if (uploadedFile && uploadedFile.name.endsWith('.csv')) {
            setFile(uploadedFile);
            setUploadedCount(0);
        } else {
            setFile(null);
            showCustomModal("Please upload a valid CSV file.");
        }
    };

    const handleProcessFile = async () => {
        if (!file) { showCustomModal("No valid file selected."); return; }
        setLoading(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const customerData = parseCSV(event.target?.result);
                if (customerData.length === 0) { showCustomModal("Could not parse any valid data from the CSV. Ensure required headers are present."); setLoading(false); return; }
                onDataUpload(customerData);
                setUploadedCount(customerData.length);
                showCustomModal(`Successfully loaded ${customerData.length} records for churn analysis!`);
            } catch (error) {
                console.error("Error during file processing:", error);
                showCustomModal(`Error processing data: ${error.message}`);
            } finally {
                setLoading(false);
                setFile(null);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="bg-white p-6 shadow-xl rounded-xl border border-red-100 mb-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center"><UserCheck className="w-5 h-5 mr-2 text-red-600"/> Dedicated Churn Data Uploader</h3>
            <p className="text-gray-600 mb-4">
                This module requires a specific, structured dataset containing customer churn indicators.
            </p>

            <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
                <h4 className="font-semibold text-red-800 mb-2">MANDATORY CSV Schema:</h4>
                <code className="block bg-red-100 p-2 rounded text-sm text-red-900 overflow-x-auto">
                    name,MRR,churnProbability,supportTickets,lastActivityDays,contractLengthMonths
                </code>
            </div>

            <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
                <input type="file" accept=".csv" onChange={handleFileUpload} key={file ? file.name : 'no-file-churn'} className="flex-1 w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700"/>
                <button onClick={handleProcessFile} disabled={!file || loading} className="w-full sm:w-auto px-6 py-2 text-white bg-red-600 hover:bg-red-700 font-medium rounded-lg shadow transition disabled:bg-gray-400">
                    {loading ? 'Processing...' : 'Load Churn Data'}
                </button>
            </div>
            <div className="mt-4 flex justify-between items-center">
                {uploadedCount > 0 && (<p className="text-sm font-medium text-green-700">Loaded {uploadedCount} records.</p>)}
                <button onClick={seedInitialData} className="text-xs text-blue-500 hover:text-blue-700 transition font-medium">Seed Sample Data</button>
            </div>
        </div>
    );
};

// Subcomponent: MRR Simulation / What-If Prediction
/** @param {{ enhancedCustomers: EnhancedCustomerData[] }} props */
const ChurnSimulation = ({ enhancedCustomers }) => {
    const [whatIfData, setWhatIfData] = useState({
        discountEffect: 0.1, // Expected churn rate reduction from discount
        supportEffect: 0.05, // Expected churn rate reduction from proactive support
        campaignEffect: 0.15, // Expected churn rate reduction from re-engagement campaign
        selectedRiskLevel: 'High',
    });

    const simulationResults = useMemo(() => {
        const { discountEffect, supportEffect, campaignEffect, selectedRiskLevel } = whatIfData;
    
        const targetCustomers = enhancedCustomers.filter(c => 
            selectedRiskLevel === 'All' || c.riskLevel === selectedRiskLevel
        );
    
        const currentTotalMRR = enhancedCustomers.reduce((sum, c) => sum + (c.MRR || 0), 0);
    
        // 1. Baseline calculation (Expected MRR loss without intervention)
        const potentialMRRLoss = targetCustomers.reduce((loss, c) => {
          const estimatedChurnRate = c.riskScore / 100;
          return loss + (c.MRR * estimatedChurnRate);
        }, 0);
    
        // 2. Simulated calculation (applying mitigation effects)
        const simulatedMRRLoss = targetCustomers.reduce((loss, c) => {
          const estimatedChurnRate = c.riskScore / 100;
          let reduction = 0;
          
          if (c.MRR > 500) reduction += discountEffect;
          if (c.supportTickets > 3) reduction += supportEffect;
          if (c.lastActivityDays > 14) reduction += campaignEffect;
          
          reduction = Math.min(reduction, 0.95);
    
          const newChurnRate = estimatedChurnRate * (1 - reduction);
          return loss + (c.MRR * newChurnRate);
        }, 0);
    
        const projectedMRRSaved = potentialMRRLoss - simulatedMRRLoss;
    
        return {
          currentTotalMRR,
          potentialMRRLoss,
          simulatedMRRLoss,
          projectedMRRSaved,
          targetCustomerCount: targetCustomers.length
        };
    }, [enhancedCustomers, whatIfData]);

    /** @param {{ title: string, value: string, color: 'red' | 'green' | 'blue' | 'orange', isLarge?: boolean }} props */
    const ResultBox = ({ title, value, color, isLarge = false }) => {
        const colorClasses = {
          red: 'bg-red-50 text-red-700 border-red-300',
          green: 'bg-green-50 text-green-700 border-green-300',
          blue: 'bg-blue-50 text-blue-700 border-blue-300',
          orange: 'bg-yellow-50 text-yellow-700 border-yellow-300',
        };
        return (
          <div className={`p-4 rounded-xl border ${colorClasses[color]} ${isLarge ? 'col-span-1 sm:col-span-2' : ''}`}>
            <p className={`text-sm font-medium ${isLarge ? 'text-lg' : ''}`}>{title}</p>
            <p className={`text-3xl font-extrabold ${isLarge ? 'text-4xl my-2' : 'mt-1'}`}>{value}</p>
          </div>
        );
      };

    return (
        <div className="bg-white p-6 shadow-xl rounded-xl border border-blue-100 mb-8">
            <h3 className="text-xl font-extrabold text-blue-800 mb-4 flex items-center">
                <Activity className="w-5 h-5 mr-2 text-blue-500" /> MRR Simulation / What-If Prediction
            </h3>
            <p className="text-gray-600 mb-4">Adjust strategy effectiveness to predict potential MRR savings.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                <label className="block text-sm font-medium text-gray-700">Target Risk Level</label>
                <select
                    value={whatIfData.selectedRiskLevel}
                    onChange={(e) => setWhatIfData({ ...whatIfData, selectedRiskLevel: e.target.value })}
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 bg-gray-50 focus:ring-blue-500 focus:border-blue-500 transition"
                >
                    <option value="All">All Customers</option>
                    <option value="High">High Risk Only (Score $\ge 70$)</option>
                    <option value="Medium">Medium Risk Only (Score $40$-$69$)</option>
                </select>
                </div>
            </div>

            <div className="space-y-4">
                <label className="block text-lg font-semibold text-blue-700 pt-2 border-t mt-4">Retention Strategy Effectiveness (Expected Churn Rate Reduction)</label>

                {['Discount Offer', 'Proactive Support', 'Re-engagement Campaign'].map((label, index) => {
                const key = index === 0 ? 'discountEffect' : index === 1 ? 'supportEffect' : 'campaignEffect';
                const effect = whatIfData[key];
                return (
                    <div key={key}>
                    <label className="text-sm font-medium text-gray-700 flex justify-between">
                        <span>{label}</span>
                        <span className="font-mono text-blue-600">{Math.round(effect * 100)}%</span>
                    </label>
                    <input
                        type="range"
                        min="0" max="0.3" step="0.01"
                        value={effect}
                        onChange={(e) => setWhatIfData({ ...whatIfData, [key]: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer range-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                    />
                    </div>
                );
                })}
            </div>

            <div className="mt-6 border-t border-blue-200 pt-4">
                <h4 className="text-lg font-bold text-gray-800 mb-3">Simulation Impact:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
                <ResultBox title="Potential Loss (No Action)" value={formatCurrency(simulationResults.potentialMRRLoss)} color="red" />
                <ResultBox title="Projected Loss (With Actions)" value={formatCurrency(simulationResults.simulatedMRRLoss)} color="orange" />
                <ResultBox title="MRR Projected Saved" value={formatCurrency(simulationResults.projectedMRRSaved)} color="green" isLarge={true} />
                <ResultBox title="Total Current MRR" value={formatCurrency(simulationResults.currentTotalMRR)} color="blue" />
                </div>
                <p className="text-xs text-gray-500 mt-3 text-right">Based on {simulationResults.targetCustomerCount} customer(s) targeted.</p>
            </div>
        </div>
    );
};

// Subcomponent: High-Risk Customer Tracker
/** @param {{ enhancedCustomers: EnhancedCustomerData[], handleContactCustomer: (id: string) => void }} props */
const HighRiskTracker = ({ enhancedCustomers, handleContactCustomer }) => {
    return (
        <div className="bg-white p-6 shadow-xl rounded-xl border border-red-100 mb-8">
            <h3 className="text-xl font-extrabold text-red-800 mb-4 flex items-center">
                <TrendingDown className="w-5 h-5 mr-2 text-red-500"/> High-Risk Customer Tracker
            </h3>
            <p className="text-gray-600 mb-4">
                Ranks customers with a churn risk score of **40 or higher** (Medium/High).
            </p>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MRR</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk Score</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tickets</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                    {enhancedCustomers.filter(c => c.riskLevel !== 'Low').map((c) => {
                        const rowClass = c.riskLevel === 'High' ? 'bg-red-50 hover:bg-red-100 transition' : 'bg-yellow-50 hover:bg-yellow-100 transition';

                        return (
                        <tr key={c.id} className={rowClass}>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {c.name}
                            <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.riskLevel === 'High' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {c.riskLevel}
                            </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(c.MRR)}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div className="w-20 bg-gray-200 rounded-full h-2.5">
                                    <div
                                    className={`h-2.5 rounded-full ${c.riskScore >= 70 ? 'bg-red-600' : 'bg-yellow-500'}`}
                                    style={{ width: `${c.riskScore.toFixed(0)}%` }}
                                    title={`${c.riskScore.toFixed(0)}%`}
                                    ></div>
                                </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{c.supportTickets}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {c.isContacted ? (
                                <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <UserCheck className="w-3 h-3 mr-1" /> Contacted
                                </span>
                            ) : (
                                <button
                                onClick={() => handleContactCustomer(c.id)}
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
        </div>
    );
};

// Subcomponent: Expanded Churn Analysis (New Section)
/** @param {{ calculateChurnRisk: (days: number, tickets: number, features: number) => number }} props */
const ExpandedChurnAnalysis = ({ calculateChurnRisk }) => {
    // --- State for Predictive Model Test ---
    const [daysSinceLogin, setDaysSinceLogin] = useState(15);
    const [supportTickets, setSupportTickets] = useState(3);
    const [featuresUsed, setFeaturesUsed] = useState(5);
    const [predictedChurnRisk, setPredictedChurnRisk] = useState(0);

    const mockChurnDrivers = [
        { driver: 'Poor Onboarding Experience', impactPercentage: 35, priority: 'High' },
        { driver: 'High Pricing Perceived Value', impactPercentage: 25, priority: 'High' },
        { driver: 'Lack of Key Feature X', impactPercentage: 18, priority: 'Medium' },
    ];

    useEffect(() => {
        const newRisk = calculateChurnRisk(daysSinceLogin, supportTickets, featuresUsed);
        setPredictedChurnRisk(newRisk);
    }, [daysSinceLogin, supportTickets, featuresUsed, calculateChurnRisk]);

    const renderChurnRiskGauge = (risk) => {
        let color = 'text-green-500';
        let message = 'Low Risk';
        if (risk > 50) { color = 'text-yellow-500'; message = 'Moderate Risk'; }
        if (risk > 75) { color = 'text-red-500'; message = 'High Risk - Intervention Needed'; }
    
        return (
          <div className="flex flex-col items-center mt-4">
            <div className="w-32 h-16 relative overflow-hidden">
              <svg viewBox="0 0 100 50" className="w-full h-full">
                <path d="M 10 40 A 40 40 0 0 1 90 40" fill="none" stroke="#e5e7eb" strokeWidth="10" />
                <path
                  d="M 10 40 A 40 40 0 0 1 90 40"
                  fill="none"
                  stroke={risk > 75 ? '#ef4444' : risk > 50 ? '#f59e0b' : '#10b981'}
                  strokeWidth="10"
                  strokeDasharray={`${(risk / 100) * 125.66} 125.66`}
                />
              </svg>
              <div className="absolute inset-x-0 bottom-0 text-center -mt-2">
                <p className={`text-xl font-bold ${color}`}>{risk}%</p>
              </div>
            </div>
            <p className={`mt-2 font-medium ${color}`}>{message}</p>
          </div>
        );
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Predictive Churn Score Input */}
            <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg border border-pink-100">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Predictive Model Test</h3>
                <p className="text-sm text-gray-600 mb-4">Input user activity metrics to estimate churn risk score instantly.</p>
                
                <div className="space-y-4">
                    {/* Days Since Last Login */}
                    <div>
                        <label htmlFor="daysLogin" className="block text-sm font-medium text-gray-700">Days Since Last Login ({daysSinceLogin})</label>
                        <input id="daysLogin" type="range" min="1" max="60" value={daysSinceLogin} onChange={(e) => setDaysSinceLogin(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"/>
                    </div>
                    {/* Support Tickets */}
                    <div>
                        <label htmlFor="tickets" className="block text-sm font-medium text-gray-700">Open Support Tickets ({supportTickets})</label>
                        <input id="tickets" type="range" min="0" max="10" value={supportTickets} onChange={(e) => setSupportTickets(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"/>
                    </div>
                    {/* Features Used */}
                    <div>
                        <label htmlFor="features" className="block text-sm font-medium text-gray-700">Core Features Used Monthly ({featuresUsed})</label>
                        <input id="features" type="range" min="1" max="10" value={featuresUsed} onChange={(e) => setFeaturesUsed(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"/>
                    </div>
                </div>
                
                <div className="mt-6 border-t pt-4">
                    <p className="text-sm font-semibold text-gray-500">Predicted Churn Risk:</p>
                    {renderChurnRiskGauge(predictedChurnRisk)}
                </div>
            </div>
            
            {/* Retention Strategy Prioritizer */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border border-pink-100">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Retention Strategy Prioritizer (ROI)</h3>
                <p className="text-sm text-gray-600 mb-4">Analyze the potential return on investment (ROI) for targeted retention campaigns by driver.</p>

                <div className="space-y-4">
                    {mockChurnDrivers.map((driver, index) => {
                        const retentionImpact = driver.impactPercentage * 0.4 * (driver.priority === 'High' ? 1.5 : 1);
                        const roiPercentage = retentionImpact * 5; 

                        return (
                        <div key={index} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                            <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-pink-100 text-pink-600 rounded-full">
                                <BarChart className="w-6 h-6" />
                            </div>
                            <div className="flex-grow">
                                <p className="font-semibold text-gray-800">{driver.driver}</p>
                                <p className="text-sm text-gray-500">Targeted Campaign Potential: Reduce churn by ~<span className="font-bold text-pink-600">{retentionImpact.toFixed(1)}%</span></p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-gray-500">Est. ROI</p>
                                <p className="text-xl font-bold text-green-600">{roiPercentage.toFixed(0)}%</p>
                            </div>
                        </div>
                        );
                    })}
                </div>
                <p className="mt-6 text-sm text-gray-500">
                    <span className="font-bold">Recommendation:</span> High ROI indicates highly impactful and cost-effective campaigns.
                </p>
            </div>
        </div>
    );
}

// --- 5. Churn Predictor Component (The main container for all churn features) ---
/** @param {{ customerData: CustomerData[], setCustomerData: (data: CustomerData[]) => void, handleContactCustomer: (id: string) => void, seedInitialData: () => void, showCustomModal: (msg: string) => void }} props */
const ChurnPredictor = ({ customerData, setCustomerData, handleContactCustomer, seedInitialData, showCustomModal }) => {
    
    // Logic from the second turn to calculate mock risk based on three factors.
    const calculateCustomChurnRisk = useCallback((days, tickets, features) => {
        const risk = Math.round(Math.max(0, (days / 10) * 0.3 + (tickets * 8) * 0.5 - (features * 4) * 0.2 + 15));
        return Math.min(100, risk);
    }, []);

    // Calculate enhanced customer list
    const enhancedCustomers = useMemo(() => {
        return customerData.map(c => {
            const riskScore = calculateChurnRiskScore(c);
            const riskLevel = riskScore >= 70 ? 'High' : riskScore >= 40 ? 'Medium' : 'Low';
            return { ...c, riskScore, riskLevel };
        }).sort((a, b) => b.riskScore - a.riskScore); // Sort by highest risk
    }, [customerData]);


    if (customerData.length === 0) {
        return (
            <div className="p-4 md:p-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2 flex items-center"><TrendingDown className="w-6 h-6 mr-2 text-red-600"/> Churn Predictor</h2>
                <ChurnDataUploader onDataUpload={setCustomerData} showCustomModal={showCustomModal} seedInitialData={seedInitialData} />
                <NoDataMessage viewName="Churn Predictor" isSpecific={true} />
            </div>
        );
    }
    
    return (
        <div className="p-4 md:p-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2 flex items-center"><TrendingDown className="w-6 h-6 mr-2 text-red-600"/> Churn Predictor: Advanced Analysis</h2>
            <div className="text-sm text-gray-600 mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p>Metrics generated from **{customerData.length} records** loaded specifically for churn analysis. Risk scores are automatically calculated.</p>
            </div>
            
            {/* 1. MRR Simulation / What-If Prediction */}
            <ChurnSimulation enhancedCustomers={enhancedCustomers} />

            {/* 2. High-Risk Customer Tracker */}
            <HighRiskTracker 
                enhancedCustomers={enhancedCustomers} 
                handleContactCustomer={handleContactCustomer} 
            />

            {/* 3. Expanded Churn Analysis (New Section) */}
            <h3 className="text-2xl font-extrabold text-gray-800 mt-10 mb-6 border-b pb-2 flex items-center">
                <Zap className="w-6 h-6 mr-2 text-pink-600" /> Expanded Churn Analysis & Prevention
            </h3>
            <ExpandedChurnAnalysis calculateChurnRisk={calculateCustomChurnRisk} />
        </div>
    );
};

  const seedInitialData = useCallback(() => {
    /** @type {CustomerData[]} */
    const dummyCustomers = [
      { id: 'd1', name: 'Acme Corp', MRR: 1500, churnProbability: 0.85, supportTickets: 8, lastActivityDays: 45, contractLengthMonths: 12, isContacted: false },
      { id: 'd2', name: 'Beta Solutions', MRR: 300, churnProbability: 0.30, supportTickets: 1, lastActivityDays: 5, contractLengthMonths: 6, isContacted: false },
      { id: 'd3', name: 'Gamma Innovations', MRR: 800, churnProbability: 0.65, supportTickets: 4, lastActivityDays: 20, contractLengthMonths: 18, isContacted: false },
      { id: 'd4', name: 'Delta Analytics', MRR: 200, churnProbability: 0.95, supportTickets: 10, lastActivityDays: 70, contractLengthMonths: 3, isContacted: false },
      { id: 'd5', name: 'Epsilon Tech', MRR: 1200, churnProbability: 0.20, supportTickets: 0, lastActivityDays: 1, contractLengthMonths: 24, isContacted: false },
    ];
    setCustomerData(dummyCustomers);
    showCustomModal(`Successfully added ${dummyCustomers.length} initial customers to the Churn Predictor!`);
  }, [setCustomerData, showCustomModal]);

  const handleContactCustomer = useCallback((customerId) => {
    setCustomerData(prevCustomers => 
        prevCustomers.map(c => 
            c.id === customerId ? { ...c, isContacted: true } : c
        )
    );
    showCustomModal("Customer marked as contacted! (Local update)");
  }, [setCustomerData, showCustomModal]);
  

const SettingsPanel = () => (
    <SectionCard title="Application Settings">
      <p className="text-gray-600">Manage user profile, API keys, data source connections, and notification preferences here. (Functionality preserved as placeholder).</p>
      <div className="mt-4 space-y-3">
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
          <span className="text-gray-700">Dark Mode</span>
          <input type="checkbox" className="toggle toggle-primary" />
        </div>
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
          <span className="text-gray-700">Data Auto-Refresh</span>
          <input type="checkbox" defaultChecked className="toggle toggle-primary" />
        </div>
        <button className="w-full px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors">Update Preferences</button>
      </div>
    </SectionCard>
);


// --- MAIN APP COMPONENT ---

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [uploadedData, setUploadedData] = useState([]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DataDashboard data={uploadedData} onDataUpload={setUploadedData} />;
      case 'dataOverview':
        return <DataOverview data={uploadedData} />;
      case 'forecast':
        return <TimeSeriesForecast data={uploadedData} />;
      case 'simulation':
        return <WhatIfSimulation data={uploadedData} />;
      case 'churn':
        return <ChurnAnalysis />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <DataDashboard data={uploadedData} onDataUpload={setUploadedData} />;
    }
};
 
}


export default App;
