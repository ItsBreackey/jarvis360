import './App.css';



import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import logo from './d2m_logo.png';
import Toast from './Toast';
import ChurnChart from './ChurnChart';
import { computeMonthlySeries as computeMonthlySeriesUtil, holtLinearForecast, holtAutoTune, holtAutoTuneAdvanced } from './utils/analytics';
import { generateScenarioSummary } from './utils/summarizer';
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Brush, Legend } from 'recharts';

// --- Utility Functions (Core Logic) ---

/**
 * Calculates a churn risk score (0-100) based on multiple factors.
 * @param {object} customer - Customer data object.
 * @returns {number} The calculated risk score.
 */
const calculateChurnRiskScore = (customer) => {
  const { MRR, churnProbability, supportTickets, lastActivityDays } = customer;

  // Weights for different factors (sum should ideally be 1.0)
  const weightProbability = 0.5;
  const weightTickets = 0.2;
  const weightActivity = 0.2;
  const weightMRR = 0.1; 

  // Normalize data and assign risk components
  let probRisk = parseFloat(churnProbability) || 0;
  let ticketRisk = Math.min((parseFloat(supportTickets) || 0) / 10, 1); // 10+ tickets = max risk component
  let activityRisk = Math.min((parseFloat(lastActivityDays) || 0) / 60, 1); // 60+ days of inactivity = max risk component
  // Lower MRR is higher risk (small customers churn more easily)
  let mrrRisk = 1 - Math.min((parseFloat(MRR) || 0) / 2000, 1); 

  const score = (
    (probRisk * weightProbability) +
    (ticketRisk * weightTickets) +
    (activityRisk * weightActivity) +
    (mrrRisk * weightMRR)
  ) * 100;

  return Math.max(0, Math.min(100, score));
};

/**
 * Formats a number into US dollar currency string.
 * @param {number} amount - The numeric amount to format.
 * @returns {string} Formatted currency string.
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// (svg-to-png helpers removed) use html2canvas-based exporters below for full-container captures

// html2canvas helper (loaded dynamically from CDN as a fallback)
let _html2canvasPromise = null;
const ensureHtml2Canvas = () => {
  if (_html2canvasPromise) return _html2canvasPromise;
  _html2canvasPromise = (async () => {
    // try dynamic import from local node_modules first
    try {
      const mod = await import('html2canvas');
      return mod.default || mod;
    } catch (e) {
      // fallback to global CDN loader
      if (typeof window.html2canvas !== 'undefined') return window.html2canvas;
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload = () => resolve();
        s.onerror = (err) => reject(err);
        document.head.appendChild(s);
      });
      return window.html2canvas;
    }
  })();
  return _html2canvasPromise;
};

// Export any element (container) to PNG using html2canvas
const exportElementToPng = async (el, filename = 'chart.png', scale = 2) => {
  if (!el) return false;
  try {
    const html2canvas = await ensureHtml2Canvas();
    const canvas = await html2canvas(el, { scale: Math.max(1, scale), useCORS: true, backgroundColor: getComputedStyle(document.body).backgroundColor || '#fff' });
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(false);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        resolve(true);
      }, 'image/png');
    });
  } catch (e) {
    console.error('exportElementToPng failed', e);
    return false;
  }
};

// Copy an element's rasterized PNG to clipboard
const copyElementToClipboard = async (el, scale = 2) => {
  if (!el || !navigator.clipboard) return false;
  try {
    const html2canvas = await ensureHtml2Canvas();
    const canvas = await html2canvas(el, { scale: Math.max(1, scale), useCORS: true, backgroundColor: getComputedStyle(document.body).backgroundColor || '#fff' });
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return false;
    const clipboardItem = new ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([clipboardItem]);
    return true;
  } catch (e) {
    console.error('copyElementToClipboard failed', e);
    return false;
  }
};

// CustomModal removed in favor of toasts. showCustomModal routes to showToast below.

  

// --- View Components ---

// Component 1: Data Dashboard (The main hub, includes data upload)
const DataDashboard = ({ onDataUpload, showCustomModal, seedInitialData, showToast = null }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [mapping, setMapping] = useState({ dateKey: null, mrrKey: 'MRR', idKey: 'id' });

  // expected headers kept for reference if needed later

  const parseCSV = (csvText, userMapping = {}) => {
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) return [];
    const headerLine = lines[0].split(',').map(h => h.trim());
    // Build rows as objects using raw headers
    const rows = lines.slice(1).map((line, idx) => {
      const cols = line.split(',');
      const obj = { uploadedAt: new Date().toISOString(), isContacted: false };
      headerLine.forEach((h, j) => { obj[h] = cols[j] ? cols[j].trim() : ''; });
      // ensure an id field
      obj.id = obj.id || obj.name || `${idx + 1}_${Date.now()}`;
      return obj;
    }).filter(r => Object.keys(r).length > 0);

    // If user provided mapping, normalize keys
    const dateKey = userMapping.dateKey || mapping.dateKey || headerLine.find(h => /date|month|created_at|uploadedat/i.test(h)) || null;
    const mrrKey = userMapping.mrrKey || mapping.mrrKey || headerLine.find(h => /mrr|revenue|amount|value/i.test(h)) || null;
    const idKey = userMapping.idKey || mapping.idKey || headerLine.find(h => /id|name|customer/i.test(h)) || 'id';

    const normalized = rows.map((r, i) => {
      const out = { isContacted: r.isContacted || false, uploadedAt: r.uploadedAt };
      out.id = r[idKey] || r.id || (`${i}_${Date.now()}`);
      out.name = r.name || r[out.id] || out.id;
      out.MRR = mrrKey && r[mrrKey] ? parseFloat(String(r[mrrKey]).replace(/[^0-9.-]+/g, '')) || 0 : 0;
      if (dateKey && r[dateKey]) out.date = r[dateKey];
      // preserve churnProbability if present
      out.churnProbability = r.churnProbability !== undefined ? parseFloat(r.churnProbability) || 0 : (r.churn || 0);
      out.supportTickets = r.supportTickets ? parseFloat(r.supportTickets) || 0 : 0;
      out.lastActivityDays = r.lastActivityDays ? parseFloat(r.lastActivityDays) || 0 : 0;
      out.contractLengthMonths = r.contractLengthMonths ? parseFloat(r.contractLengthMonths) || 12 : 12;
      return out;
    });

    return normalized.filter(c => c.MRR !== undefined && c.MRR !== null);
  };


  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
  if (uploadedFile && uploadedFile.name.endsWith('.csv')) {
      setFile(uploadedFile);
      setUploadedCount(0);
      // read header preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result || '';
        const firstLine = text.split('\n')[0] || '';
        const headers = firstLine.split(',').map(h => h.trim());
        setPreviewHeaders(headers);
        // set sensible defaults
        setMapping({ dateKey: headers.find(h => /date|month|created_at|uploadedat/i.test(h)) || null, mrrKey: headers.find(h => /mrr|revenue|amount|value/i.test(h)) || 'MRR', idKey: headers.find(h => /id|name|customer/i.test(h)) || 'id' });
      };
      reader.readAsText(uploadedFile);
    } else {
      setFile(null);
      (showToast || showCustomModal)("Please upload a valid CSV file.", 'error');
    }
  };

  const handleProcessFile = async () => {
    if (!file) {
      (showToast || showCustomModal)("No valid file selected.", 'error');
      return;
    }
    setLoading(true);
    setUploadedCount(0);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const csvText = event.target.result;
        const customerData = parseCSV(csvText, mapping);

        if (customerData.length === 0) {
          (showToast || showCustomModal)("Could not parse any valid data from the CSV. Please check the format.", 'error');
          setLoading(false);
          return;
        }

        onDataUpload(customerData, mapping);
        
        setUploadedCount(customerData.length);
        (showToast || showCustomModal)(`Successfully loaded ${customerData.length} new customer records into memory!`, 'success');
      } catch (error) {
        console.error("Error during file processing:", error);
        (showToast || showCustomModal)(`Error processing data: ${error.message}`, 'error');
      } finally {
        setLoading(false);
        setFile(null);
      }
    };

    reader.onerror = (error) => {
      console.error("File read error:", error);
      (showToast || showCustomModal)("Failed to read the file.", 'error');
      setLoading(false);
    };

    reader.readAsText(file);
  };

  // Mapping preview UI helpers
  const HeaderSelector = ({ label, value, onChange }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 bg-white">
        <option value="">(none)</option>
        {previewHeaders.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2">Data Intake & Preparation</h2>

      <div className="bg-white p-6 shadow-xl rounded-xl border border-gray-100">
        <p className="text-gray-700 mb-4">
            Upload a **CSV file** to populate the customer data. Data is stored **only in your browser's memory** and is not persistent.
        </p>

        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-semibold text-blue-800 mb-2">Required CSV Format (Headers):</h4>
          <code className="block bg-blue-100 p-2 rounded text-sm text-blue-900 overflow-x-auto">
            name,MRR,churnProbability,supportTickets,lastActivityDays,contractLengthMonths
          </code>
        </div>

        <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="flex-1 w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700"
          />
          <button
            onClick={handleProcessFile}
            disabled={!file || loading}
            className="w-full sm:w-auto px-6 py-2 text-white bg-green-600 hover:bg-green-700 focus:ring-4 focus:ring-green-300 font-medium rounded-lg shadow transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : `Process File ${file ? `(${file.name})` : ''}`}
          </button>
        </div>

        {previewHeaders.length > 0 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <HeaderSelector label="Date Column" value={mapping.dateKey} onChange={(v) => setMapping(prev => ({ ...prev, dateKey: v }))} />
            <HeaderSelector label="MRR Column" value={mapping.mrrKey} onChange={(v) => setMapping(prev => ({ ...prev, mrrKey: v }))} />
            <HeaderSelector label="ID / Name Column" value={mapping.idKey} onChange={(v) => setMapping(prev => ({ ...prev, idKey: v }))} />
          </div>
        )}
        
        <div className="mt-4 flex justify-between items-center">
            {uploadedCount > 0 && (
                <p className="text-sm font-medium text-green-700">
                    Loaded {uploadedCount} records.
                </p>
            )}
      <button
        type="button"
        aria-label="Seed initial sample data"
        onClick={seedInitialData}
        className="text-xs text-blue-500 hover:text-blue-700 transition"
      >
        Or, Seed Initial Sample Data
      </button>
        </div>
      </div>
      
      <div className="mt-10 p-6 bg-yellow-50 rounded-xl border border-yellow-200 text-gray-700">
          <h3 className="font-semibold text-lg text-yellow-800 mb-2">Welcome to the SaaS Analytics Suite!</h3>
          <p>
              Use the tabs above to navigate the different modules: view your **Data Overview**, predict churn in the **Churn Predictor**, or run scenarios in the **What-If Simulation**.
          </p>
      </div>
    </div>
  );
};

// Use computeMonthlySeries from utilities
const computeMonthlySeries = computeMonthlySeriesUtil;


// Component 2: Data Overview
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
          <StatCard title="Total Customers" value={overviewData?.customerCount || 'N/A'} description="Current customer count loaded." />
          <StatCard title="Total Monthly Revenue" value={formatCurrency(overviewData?.totalMRR || 0)} description="Sum of all customers' MRR." />
          <StatCard title="Average MRR" value={formatCurrency(overviewData?.avgMrr || 0)} description="Monthly Recurring Revenue per customer." />
          <StatCard title="Est. Annual Revenue" value={formatCurrency(overviewData?.totalRevenue || 0)} description="Total MRR multiplied by 12." />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6">
          <StatCard title="Churned MRR (est)" value={formatCurrency(overviewData?.churnedMRR || 0)} description="Heuristic of at-risk monthly MRR." />
          <StatCard title="Estimated NRR" value={`${Math.round((overviewData?.estimatedNRR || 1) * 100)}%`} description="Net Revenue Retention (approx)." />
          <StatCard title="Churn % (by count)" value={`${Math.round((overviewData?.churnRateByCount || 0) * 100)}%`} description="Percent of customers flagged as at-risk." />
        </div>
        <div className="mt-8 p-6 bg-white shadow-xl rounded-xl border border-gray-100">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Core Metrics Chart</h3>
          <p className="text-gray-600">New vs Expansion vs Churn (monthly) — simple stacked view.</p>
          {overviewData?.monthlySeries && overviewData.monthlySeries.length > 0 ? (
            <ChurnChart data={overviewData.monthlySeries} />
          ) : (
            <div className="h-48 bg-gray-50 border border-dashed border-gray-300 rounded-lg mt-4 flex items-center justify-center text-gray-400">
              [Chart Placeholder: Visualizing Loaded Customer Data Distributions]
            </div>
          )}
        </div>
      </div>
    );
};

// Component 3: Time-Series Forecast (Recharts-based)
const TimeSeriesForecast = ({ chartRef, monthlySeries = [], showCustomModal = () => {}, showToast = null }) => {
  const [monthsOut, setMonthsOut] = useState(12);
  const [method, setMethod] = useState('linear'); // 'linear' or 'holt'
  // Holt smoothing parameters (persisted in localStorage)
  const HOLTPREF = 'jarvis_holt_prefs_v1';
  const storedHolt = (() => { try { return JSON.parse(localStorage.getItem(HOLTPREF) || '{}'); } catch (e) { return {}; } })();
  const [holtAlpha, setHoltAlpha] = useState(storedHolt.alpha || 0.6);
  const [holtBeta, setHoltBeta] = useState(storedHolt.beta || 0.2);
  const [holtBootstrap, setHoltBootstrap] = useState(storedHolt.bootstrap || false);
  const [holtBootstrapSamples, setHoltBootstrapSamples] = useState(storedHolt.bootstrapSamples || 200);
  const [holtBootstrapAsync, setHoltBootstrapAsync] = useState(storedHolt.bootstrapAsync || false);
  const [tuning, setTuning] = useState(false);

  // Prepare numeric series from monthlySeries: [{period: 'YYYY-MM', total}]
  const series = useMemo(() => {
    if (!monthlySeries || !Array.isArray(monthlySeries) || monthlySeries.length === 0) return [];
    // Ensure sorted by period
    const parsed = monthlySeries.map((m) => ({ period: m.period, total: Number(m.total || 0) }));
    parsed.sort((a, b) => a.period.localeCompare(b.period));
    return parsed;
  }, [monthlySeries]);

  // forecastResult is computed via an async-aware flow below (forecastResultState)

  const [forecastResultState, setForecastResultState] = useState(null);

  const combined = useMemo(() => {
    if (!series) return [];
    const actual = series.map(s => ({ period: s.period, actual: s.total }));
    const fc = (forecastResultState || {}).forecast || [];
    // merge by period to single objects Recharts likes
    const map = {};
    actual.forEach(a => { map[a.period] = map[a.period] || {}; map[a.period].period = a.period; map[a.period].actual = a.actual; });
    fc.forEach(f => { map[f.period] = map[f.period] || {}; map[f.period].period = f.period; map[f.period].predicted = f.predicted; map[f.period].lower = f.lower; map[f.period].upper = f.upper; });
    return Object.keys(map).sort().map(k => map[k]);
  }, [series, forecastResultState]);

  const downloadCSV = () => {
    const rows = [];
    // header
    rows.push(['period','actual','predicted','lower','upper'].join(','));
    // merge actuals and forecasts by period
    const map = {};
    series.forEach(s => { map[s.period] = map[s.period] || {}; map[s.period].actual = s.total; });
  (forecastResultState?.forecast || []).forEach(f => { map[f.period] = map[f.period] || {}; map[f.period].predicted = f.predicted; map[f.period].lower = f.lower; map[f.period].upper = f.upper; });
    const periods = Object.keys(map).sort();
    periods.forEach(p => {
      const row = map[p] || {};
      rows.push([
        p,
        (row.actual !== undefined ? row.actual : ''),
        (row.predicted !== undefined ? row.predicted : ''),
        (row.lower !== undefined ? row.lower : ''),
        (row.upper !== undefined ? row.upper : ''),
      ].join(','));
    });

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'forecast.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const [exporting, setExporting] = useState(false);
  const [computingBootstrap, setComputingBootstrap] = useState(false);
  const asyncForecastRef = useRef(null); // holds latest async forecast promise (with revoke)
  // const bootstrapWorkerRef = useRef(null); // reserved for cancellation if needed
  // Linear regression on index -> value (sync + async bootstrap support)

  const computeSyncForecast = useCallback(() => {
    // If no series data, nothing to forecast
    if (!series || series.length === 0) return null;
    // If method is Holt and not requesting async bootstrap, compute synchronously via helper
    if (method === 'holt') {
      if (!holtBootstrap || !holtBootstrapAsync) {
        return holtLinearForecast(series, monthsOut, { alpha: holtAlpha, beta: holtBeta, bootstrap: holtBootstrap, bootstrapSamples: holtBootstrapSamples });
      }
      // otherwise fall through to linear sync (we'll run async below)
    }

    // Linear regression
    const n = series.length;
    const xs = series.map((_, i) => i);
    const ys = series.map(s => s.total);
    const xMean = xs.reduce((a,b) => a+b,0)/n;
    const yMean = ys.reduce((a,b) => a+b,0)/n;
    let num = 0, den = 0;
    for (let i=0;i<n;i++){ num += (xs[i]-xMean)*(ys[i]-yMean); den += (xs[i]-xMean)*(xs[i]-xMean); }
    const slope = den === 0 ? 0 : num/den;
    const intercept = yMean - slope * xMean;

    // residual std dev
    let rss = 0;
    for (let i=0;i<n;i++){ const pred = intercept + slope*xs[i]; rss += Math.pow(ys[i]-pred,2); }
    const residualStd = n > 1 ? Math.sqrt(rss / (n-1)) : 0;

    // forecast points
    const forecast = [];
    for (let k=1;k<=monthsOut;k++){
      const idx = n - 1 + k; // continue index
      const pred = intercept + slope * idx;
      const lower = pred - 1.96 * residualStd;
      const upper = pred + 1.96 * residualStd;
      // compute period label: take last period and add k months
      const last = series[series.length - 1].period; // YYYY-MM
      const [yy,mm] = last.split('-').map(Number);
      const dt = new Date(yy, mm - 1 + k, 1);
      const period = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      forecast.push({ period, predicted: Math.max(0, pred), lower: Math.max(0, lower), upper: Math.max(0, upper) });
    }

    return { slope, intercept, residualStd, forecast };
  }, [series, monthsOut, method, holtAlpha, holtBeta, holtBootstrap, holtBootstrapSamples, holtBootstrapAsync]);

  useEffect(() => {
    let cancelled = false;
    // compute sync result first
    const sync = computeSyncForecast();
    setForecastResultState(sync);

    // if holt + async bootstrap requested, trigger async compute and update when ready
    if (method === 'holt' && holtBootstrap && holtBootstrapAsync && series && series.length > 2) {
      setComputingBootstrap(true);
      // holtLinearForecast will return a Promise when bootstrapAsync is true
      const maybePromise = holtLinearForecast(series, monthsOut, { alpha: holtAlpha, beta: holtBeta, bootstrap: true, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: true });
      if (maybePromise && typeof maybePromise.then === 'function') {
        // store promise so caller can revoke if needed
        asyncForecastRef.current = maybePromise;
        maybePromise.then((res) => {
          asyncForecastRef.current = null;
          if (cancelled) return;
          setForecastResultState(res);
        }).catch((err) => {
          asyncForecastRef.current = null;
          console.error('Async bootstrap failed', err);
          (showToast || showCustomModal)('Async bootstrap failed. See console for details.', 'error');
        }).finally(() => { if (!cancelled) setComputingBootstrap(false); });
      } else {
        // not a promise: set immediately
        setForecastResultState(maybePromise);
        setComputingBootstrap(false);
      }
    }

    return () => { cancelled = true; };
  }, [computeSyncForecast, method, holtBootstrap, holtBootstrapAsync, holtBootstrapSamples, holtAlpha, holtBeta, monthsOut, series, showToast, showCustomModal]);

  // Render the forecast chart UI
  return (
    <div className="p-4 md:p-8">
  <h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2">Forecasting & Trend Analysis</h2>
      <div className="p-6 bg-white rounded-xl shadow-xl border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <p className="text-gray-600">Showing historical Actual monthly MRR and a simple linear projection with a 95% CI band.</p>
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Months to forecast:</label>
            <input aria-label="Months to forecast" type="number" min="1" max="36" value={monthsOut} onChange={(e) => setMonthsOut(Number(e.target.value || 1))} className="w-20 p-1 rounded border" />
            <label className="text-sm text-gray-600">Method:</label>
            <select aria-label="Forecast method" value={method} onChange={(e) => setMethod(e.target.value)} className="p-1 rounded border bg-white">
              <option value="linear">Linear OLS</option>
              <option value="holt">Holt Linear</option>
            </select>
            {/* If Holt is selected, show alpha/beta controls */}
            {method === 'holt' && (
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">α</label>
                <input type="range" min="0.01" max="1" step="0.01" value={holtAlpha} onChange={(e) => { const v = Number(e.target.value); setHoltAlpha(v); localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: v, beta: holtBeta })); }} />
                <label className="text-sm text-gray-600">β</label>
                <input type="range" min="0.01" max="1" step="0.01" value={holtBeta} onChange={(e) => { const v = Number(e.target.value); setHoltBeta(v); localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: holtAlpha, beta: v })); }} />
                <div className="flex items-center space-x-2">
                  <button type="button" disabled={tuning} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm" onClick={async () => {
                    try {
                      if (!series || series.length < 3) { (showToast || showCustomModal)('Not enough data to auto-tune (min 3 months).', 'warn'); return; }
                      (showToast || showCustomModal)('Running Holt auto-tune (fast search)...', 'info');
                      setTuning(true);
                      // run tuner (synchronous but quick)
                      const res = holtAutoTune(series, { alpha: holtAlpha, beta: holtBeta });
                      setHoltAlpha(res.alpha);
                      setHoltBeta(res.beta);
                      localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: res.alpha, beta: res.beta, bootstrap: holtBootstrap, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: holtBootstrapAsync }));
                      (showToast || showCustomModal)(`Auto-tune completed — α=${res.alpha.toFixed(2)}, β=${res.beta.toFixed(2)}, MSE=${res.mse.toFixed(1)}`, 'success');
                    } catch (err) {
                      console.error('Auto-tune failed', err);
                      (showToast || showCustomModal)('Auto-tune failed. See console for details.', 'error');
                    } finally { setTuning(false); }
                  }}>Auto-tune</button>

                  <button type="button" disabled={tuning} className="px-3 py-1 bg-violet-600 text-white rounded text-sm" onClick={async () => {
                    try {
                      if (!series || series.length < 3) { (showToast || showCustomModal)('Not enough data to auto-tune (min 3 months).', 'warn'); return; }
                      (showToast || showCustomModal)('Running Advanced Auto-tune (Nelder-Mead)...', 'info');
                      setTuning(true);
                      const res = await new Promise((resovle) => {
                        // run advanced tuner (may take longer)
                        const out = holtAutoTuneAdvanced(series, { alpha: holtAlpha, beta: holtBeta, maxIter: 300 });
                        resovle(out);
                      });
                      setHoltAlpha(res.alpha);
                      setHoltBeta(res.beta);
                      localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: res.alpha, beta: res.beta, bootstrap: holtBootstrap, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: holtBootstrapAsync }));
                      (showToast || showCustomModal)(`Advanced Auto-tune completed — α=${res.alpha.toFixed(3)}, β=${res.beta.toFixed(3)}, MSE=${res.mse.toFixed(2)}`, 'success');
                    } catch (err) {
                      console.error('Advanced Auto-tune failed', err);
                      (showToast || showCustomModal)('Advanced Auto-tune failed. See console for details.', 'error');
                    } finally { setTuning(false); }
                  }}>Auto-tune (advanced)</button>
                </div>
                <label className="text-sm text-gray-600">Bootstrap CI</label>
                <input type="checkbox" checked={holtBootstrap} onChange={(e) => { const v = !!e.target.checked; setHoltBootstrap(v); localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: holtAlpha, beta: holtBeta, bootstrap: v, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: holtBootstrapAsync })); }} />
                <label className="text-sm text-gray-600">Async Bootstrap</label>
                <input type="checkbox" checked={holtBootstrapAsync} onChange={(e) => { const v = !!e.target.checked; setHoltBootstrapAsync(v); localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: holtAlpha, beta: holtBeta, bootstrap: holtBootstrap, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: v })); }} />
                {holtBootstrap && (
                  <div className="flex items-center space-x-1">
                    <label className="text-sm text-gray-600">Samples</label>
                    <input type="number" min="50" max="2000" step="10" value={holtBootstrapSamples} onChange={(e) => { const v = Math.max(50, Number(e.target.value || 200)); setHoltBootstrapSamples(v); localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: holtAlpha, beta: holtBeta, bootstrap: holtBootstrap, bootstrapSamples: v })); }} className="w-20 p-1 rounded border" />
                    {computingBootstrap && (
                      <span className="text-sm text-gray-500 ml-2">Computing CI...</span>
                    )}
                  </div>
                )}
              </div>
            )}
            <button type="button" aria-label="Download forecast CSV" className="px-3 py-1 bg-green-500 text-white rounded text-sm" onClick={downloadCSV}>Download CSV</button>
            <button type="button" aria-label="Download forecast image" disabled={exporting} className="px-3 py-1 bg-blue-500 text-white rounded text-sm" onClick={async () => {
              const container = chartRef && chartRef.current ? chartRef.current : null;
              if (!container) { (showToast || showCustomModal)('No chart available to export.', 'error'); return; }
              setExporting(true);
              try {
                const ok = await exportElementToPng(container, 'forecast_chart.png', 2);
                if (ok) (showToast || showCustomModal)('Chart image downloaded.', 'success'); else (showToast || showCustomModal)('Failed to export chart image.', 'error');
              } finally { setExporting(false); }
            }}>{exporting ? 'Exporting...' : 'Download Image'}</button>
            <button type="button" aria-label="Copy forecast image to clipboard" disabled={exporting} className="px-3 py-1 bg-gray-500 text-white rounded text-sm" onClick={async () => {
              const container = chartRef && chartRef.current ? chartRef.current : null;
              if (!container) { (showToast || showCustomModal)('No chart available to copy.', 'error'); return; }
              setExporting(true);
              try {
                const ok = await copyElementToClipboard(container, 2);
                if (ok) (showToast || showCustomModal)('Chart image copied to clipboard.', 'success'); else (showToast || showCustomModal)('Failed to copy chart to clipboard. Your browser may block clipboard image writes.', 'error');
              } finally { setExporting(false); }
            }}>{exporting ? 'Exporting...' : 'Copy Image'}</button>
            {computingBootstrap && (
              <button type="button" aria-label="Cancel CI" className="px-3 py-1 bg-red-500 text-white rounded text-sm" onClick={() => {
                try {
                  if (asyncForecastRef.current && typeof asyncForecastRef.current.revoke === 'function') asyncForecastRef.current.revoke();
                } catch (e) { console.error('Cancel revoke failed', e); }
                asyncForecastRef.current = null;
                setComputingBootstrap(false);
                (showToast || showCustomModal)('Bootstrap CI cancelled.', 'info');
              }}>Cancel CI</button>
            )}
          </div>
        </div>

        <div ref={chartRef} className="mt-4 h-64">
          {combined.length === 0 ? (
            <div className="h-56 bg-gray-50 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400">No monthly series data — load a dataset with a date and MRR column in the Data Dashboard.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={combined} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <ReTooltip formatter={(value) => typeof value === 'number' ? formatCurrency(value) : value} />
                <Legend />
                <Area type="monotone" dataKey="upper" stroke="none" fill="#BFDBFE" fillOpacity={0.4} isAnimationActive={false} />
                <Area type="monotone" dataKey="lower" stroke="none" fill="#BFDBFE" fillOpacity={0.4} isAnimationActive={false} />
                <Line type="monotone" dataKey="actual" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="predicted" stroke="#1D4ED8" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="6 4" />
                <Brush dataKey="period" height={30} stroke="#8884d8" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

// Component 4: What-If Simulation
const WhatIfSimulation = ({ enhancedCustomers, showCustomModal, chartRef, showToast = null }) => {
    const [whatIfData, setWhatIfData] = useState({
        discountEffect: 0.1, // Expected churn rate reduction from discount
        supportEffect: 0.05, // Expected churn rate reduction from proactive support
        campaignEffect: 0.15, // Expected churn rate reduction from re-engagement campaign
        selectedRiskLevel: 'High',
      });

      // Scenario persistence (localStorage)
      const STORAGE_KEY = 'jarvis_saved_scenarios_v1';
      const [savedScenarios, setSavedScenarios] = useState([]);
      const [scenarioName, setScenarioName] = useState('');
      const [selectedScenarioId, setSelectedScenarioId] = useState(null);

      // On mount, load any previously saved scenarios from localStorage
      useEffect(() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) setSavedScenarios(JSON.parse(raw));
        } catch (e) {
          // ignore parse errors
        }
      }, []);

      const persistScenarios = (list) => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
      };

      const saveScenario = () => {
        const name = scenarioName && scenarioName.trim() ? scenarioName.trim() : `Scenario ${new Date().toLocaleString()}`;
        const id = Date.now().toString();
        const payload = { id, name, createdAt: new Date().toISOString(), data: whatIfData };
        const next = [payload].concat(savedScenarios).slice(0, 50); // keep recent 50
        setSavedScenarios(next);
        persistScenarios(next);
        setScenarioName('');
        setSelectedScenarioId(id);
        (showToast || showCustomModal)(`Saved scenario "${name}"`, 'success');
      };

      // Autosave current draft to localStorage on every change so users can restore later
      useEffect(() => {
        try {
          const draftKey = 'jarvis_autosave_whatif_v1';
          localStorage.setItem(draftKey, JSON.stringify(whatIfData));
        } catch (e) { /* ignore write errors (storage full) */ }
      }, [whatIfData]);

      // Export current target customers for the selected risk level as CSV
      const exportScenarioCsv = () => {
        const headers = ['id','name','MRR','riskScore','riskLevel','supportTickets','lastActivityDays'];
        const rows = [headers.join(',')];
        const { selectedRiskLevel } = whatIfData;
        const target = enhancedCustomers.filter(c => selectedRiskLevel === 'All' || c.riskLevel === selectedRiskLevel);
        target.forEach(c => {
          rows.push([c.id, c.name || '', c.MRR || 0, c.riskScore || 0, c.riskLevel || '', c.supportTickets || 0, c.lastActivityDays || 0].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
        });
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'scenario_customers.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        (showToast || showCustomModal)(`Exported ${target.length} customer rows.`, 'success');
      };

      // Generate a short local summary string for the current scenario
      const [scenarioSummary, setScenarioSummary] = useState('');
      const generateSummary = () => {
        const s = generateScenarioSummary(simulationResults, whatIfData);
        setScenarioSummary(s);
      };

      const loadScenario = (s) => {
        if (!s || !s.data) return;
        setWhatIfData(s.data);
        setSelectedScenarioId(s.id);
        (showToast || showCustomModal)(`Loaded scenario "${s.name}"`, 'info');
      };

      const deleteScenario = (id) => {
        const next = savedScenarios.filter(s => s.id !== id);
        setSavedScenarios(next);
        persistScenarios(next);
        if (selectedScenarioId === id) setSelectedScenarioId(null);
      };

      // Simulation Logic (Memoized calculation for performance)
      const simulationResults = useMemo(() => {
        const { discountEffect, supportEffect, campaignEffect, selectedRiskLevel } = whatIfData;
    
        if (enhancedCustomers.length === 0) {
            return { currentTotalMRR: 0, potentialMRRLoss: 0, simulatedMRRLoss: 0, projectedMRRSaved: 0, targetCustomerCount: 0 };
        }

        // Filter customers based on the simulation target risk level
        const targetCustomers = enhancedCustomers.filter(c => 
            selectedRiskLevel === 'All' || c.riskLevel === selectedRiskLevel
        );
    
        const currentTotalMRR = enhancedCustomers.reduce((sum, c) => sum + (c.MRR || 0), 0);
    
        // 1. Baseline calculation (What we expect to lose without intervention among target customers)
        const potentialMRRLoss = targetCustomers.reduce((loss, c) => {
          const estimatedChurnRate = c.riskScore / 100;
          return loss + (c.MRR * estimatedChurnRate);
        }, 0);
    
        // 2. Simulated calculation (applying mitigation effects to reduce the rate)
        const simulatedMRRLoss = targetCustomers.reduce((loss, c) => {
          const estimatedChurnRate = c.riskScore / 100;
          let reduction = 0;
          
          // Apply reduction based on customer characteristics and strategy effectiveness
          if (c.MRR > 500) reduction += discountEffect;
          if (c.supportTickets > 3) reduction += supportEffect;
          if (c.lastActivityDays > 14) reduction += campaignEffect;
          
          reduction = Math.min(reduction, 0.95);
    
          // Calculate the new, reduced churn rate
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
            <p className={`text-3xl font-extrabold ${isLarge ? 'text-5xl my-2' : 'mt-1'}`}>{value}</p>
          </div>
        );
      };

  return (
    <div className="p-4 md:p-8" ref={chartRef}>
          <h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2">Scenario Modeling: MRR Retention</h2>
          
          {enhancedCustomers.length === 0 ? (
            <NoDataMessage />
          ) : (
            <div className="bg-white p-6 shadow-xl rounded-xl border border-blue-100 mb-8">
              <h3 className="text-xl font-extrabold text-blue-800 mb-4 flex items-center">
                <svg className="w-6 h-6 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                Forecasted MRR Savings
              </h3>
              <p className="text-gray-600 mb-4">Simulate the impact of retention strategies by adjusting their estimated effectiveness on high-risk customers.</p>
        
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Target Risk Level</label>
                  <select
                    aria-label="Target risk level selector"
                    value={whatIfData.selectedRiskLevel}
                    onChange={(e) => setWhatIfData({ ...whatIfData, selectedRiskLevel: e.target.value })}
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 bg-gray-50 focus:ring-blue-500 focus:border-blue-500 transition"
                  >
                    <option value="All">All Customers</option>
                    <option value="High">High Risk Only (Score &ge; 70)</option>
                    <option value="Medium">Medium Risk Only (Score 40-69)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Saved Scenarios</label>
                  <div className="mt-1 flex space-x-2">
                    <input aria-label="Scenario name" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="Name scenario (optional)" className="flex-1 p-2 rounded border bg-white" />
                        <button aria-label="Save scenario" onClick={saveScenario} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Save</button>
                        <button aria-label="Export scenario CSV" onClick={exportScenarioCsv} className="px-3 py-1 bg-green-500 text-white rounded text-sm">Export CSV</button>
                        <button aria-label="Generate summary" onClick={generateSummary} className="px-3 py-1 bg-gray-500 text-white rounded text-sm">Summary</button>
                  </div>
                  <div className="mt-2 max-h-40 overflow-auto border rounded bg-gray-50 p-2">
                    {savedScenarios.length === 0 ? (
                      <div className="text-xs text-gray-500">No saved scenarios</div>
                    ) : (
                      (() => {
                        // build refs for the list
                        const itemRefs = savedScenarios.map(() => React.createRef());
                        return savedScenarios.map((s, idx) => {
                          const ref = itemRefs[idx];
                          const onKey = (e) => {
                            if (e.key === 'ArrowDown') { e.preventDefault(); const next = itemRefs[idx+1] || itemRefs[0]; next && next.current && next.current.focus(); }
                            if (e.key === 'ArrowUp') { e.preventDefault(); const prev = itemRefs[idx-1] || itemRefs[itemRefs.length-1]; prev && prev.current && prev.current.focus(); }
                            if (e.key === 'Home') { e.preventDefault(); itemRefs[0] && itemRefs[0].current && itemRefs[0].current.focus(); }
                            if (e.key === 'End') { e.preventDefault(); itemRefs[itemRefs.length-1] && itemRefs[itemRefs.length-1].current && itemRefs[itemRefs.length-1].current.focus(); }
                            if (e.key === 'Enter') { e.preventDefault(); loadScenario(s); }
                          };

                          return (
                            <div key={s.id} className={`flex items-center justify-between p-1 rounded ${selectedScenarioId === s.id ? 'bg-indigo-50 border border-indigo-100' : ''}`}>
                    <button ref={ref} tabIndex={0} onKeyDown={onKey} aria-label={`Load scenario ${s.name}`} onClick={() => loadScenario(s)} className="text-left text-sm text-gray-800 truncate focus:outline-none focus:ring-2 focus:ring-indigo-500">{s.name}</button>
                              <div className="flex items-center space-x-2">
                                <button aria-label={`Load scenario ${s.name}`} title="Load" onClick={() => loadScenario(s)} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Load</button>
            <div className="mt-3 flex items-center space-x-2">
              <button aria-label="Export scenario JSON" onClick={() => {
                const payload = { meta: { generatedAt: new Date().toISOString(), name: scenarioName || null }, data: whatIfData, results: simulationResults };
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'scenario.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                (showToast || showCustomModal)('Scenario JSON exported.', 'success');
              }} className="px-3 py-1 bg-gray-700 text-white rounded text-sm">Export JSON</button>

              <label className="px-3 py-1 bg-gray-100 rounded text-sm cursor-pointer">
                Import JSON
                <input type="file" accept="application/json" onChange={(e) => {
                  const f = e.target.files && e.target.files[0]; if (!f) return;
                  const r = new FileReader(); r.onload = (ev) => {
                    try {
                      const obj = JSON.parse(ev.target.result);
                      if (obj && obj.data) { setWhatIfData(obj.data); (showToast || showCustomModal)('Imported scenario JSON.', 'success'); }
                    } catch (err) { (showToast || showCustomModal)('Failed to import JSON.', 'error'); }
                  }; r.readAsText(f);
                }} style={{ display: 'none' }} />
              </label>

              <button aria-label="Restore autosaved draft" onClick={() => {
                try {
                  const draftKey = 'jarvis_autosave_whatif_v1';
                  const raw = localStorage.getItem(draftKey);
                  if (!raw) { (showToast || showCustomModal)('No autosave draft found.', 'warn'); return; }
                  const d = JSON.parse(raw);
                  setWhatIfData(d);
                  (showToast || showCustomModal)('Restored autosaved draft.', 'success');
                } catch (e) { (showToast || showCustomModal)('Failed to restore draft.', 'error'); }
              }} className="px-3 py-1 bg-yellow-500 text-white rounded text-sm">Restore Draft</button>
            </div>
                                <button aria-label={`Delete scenario ${s.name}`} title="Delete" onClick={() => deleteScenario(s.id)} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Delete</button>
                              </div>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
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
                        min="0"
                        max="0.3" 
                        step="0.01"
                        value={effect}
                        aria-label={`${label} effectiveness`}
                        onChange={(e) => setWhatIfData({ ...whatIfData, [key]: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer range-lg focus:outline-none focus:ring-2 focus:ring-500 mt-1"
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
                <p className="text-xs text-gray-500 mt-3 text-right">Targeting {simulationResults.targetCustomerCount} customer(s).</p>
                {scenarioSummary && (
                  <div className="mt-4 p-3 bg-gray-50 rounded border text-sm text-gray-700">{scenarioSummary}</div>
                )}
              </div>
            </div>
          )}
        </div>
    );
};


// Component 5: Churn Predictor (High-Risk Tracker)
const ChurnPredictor = ({ enhancedCustomers, handleContactCustomer, seedInitialData }) => {

    const CustomerTable = ({ customers, onContact, seedInitialData }) => (
        <div className="bg-white p-6 shadow-xl rounded-xl border border-red-100">
          <h3 className="text-xl font-extrabold text-red-800 mb-4 flex items-center">
            <svg className="w-6 h-6 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            High-Risk Customers & Contact Tracker
          </h3>
          {customers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
                No customer data loaded. Please use the **Data Dashboard** to load or seed initial data.
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
                    <p className="text-gray-600 mb-6">
                        This list ranks customers with a churn risk score of **40 or higher**. Prioritize contacting the highest-risk customers to improve retention.
                    </p>
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


// Component 6: Settings (Placeholder)
const Settings = () => (
    <div className="p-4 md:p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2">Settings & Configuration</h2>
        <div className="p-8 bg-white rounded-xl shadow-xl border border-gray-200 space-y-4">
            <div className="flex justify-between items-center border-b pb-4">
                <label className="text-lg font-medium text-gray-700">Churn Model Weights</label>
                <button className="text-blue-600 hover:text-blue-800 transition text-sm">Edit</button>
            </div>
            <p className="text-gray-600">
                This section would allow users to adjust the weights used in the `calculateChurnRiskScore` function (e.g., how much `supportTickets` matters vs. `MRR`).
            </p>
            <div className="h-24 bg-gray-50 border border-dashed border-gray-300 rounded-lg mt-4 flex items-center justify-center text-gray-400">
                [UI Placeholder for Weight Adjustment Sliders]
            </div>
        </div>
    </div>
);

// No Data Message
const NoDataMessage = () => (
    <div className="text-center py-16 text-xl text-gray-500 font-medium border border-dashed border-gray-300 rounded-xl bg-white shadow-inner">
        <p className="mb-4">No customer data loaded.</p>
        <p className="text-base text-gray-400">Please go to the **Data Dashboard** tab to load data from a CSV file or seed sample data.</p>
    </div>
);


// --- Main App Component ---

const App = () => {
  const [view, setView] = useState('dashboard'); 
  const [customers, setCustomers] = useState([]);
  // modal state removed; use toasts instead

  // Toast state: array of { id, message, type }
  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((message, type = 'info', timeout = 3500) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2,6);
    setToasts((t) => [{ id, message, type, timeout }].concat(t).slice(0,6));
    return id;
  }, []);
  const removeToast = useCallback((id) => setToasts((t) => t.filter(x => x.id !== id)), []);
  // Chart refs for reliable exports
  const forecastChartRef = useRef(null);
  const simulationChartRef = useRef(null);

  const showToast = useCallback((message, type = 'info', timeout = 3500) => {
    pushToast(message, type, timeout);
  }, [pushToast]);

  // Legacy showCustomModal now routes to non-blocking toast (keeps API compatible)
  const showCustomModal = useCallback((message, type = 'info', timeout = 3500) => {
    showToast(message, type, timeout);
  }, [showToast]);

  // Handler to receive uploaded data
  const handleDataUpload = (newCustomers) => {
    setCustomers(newCustomers);
  };

  // Function to seed initial dummy data
  const seedInitialData = useCallback(() => {
    const dummyCustomers = [
      { id: 'd1', name: 'Northbridge Systems', MRR: 4200, churnProbability: 0.12, supportTickets: 1, lastActivityDays: 5, contractLengthMonths: 12, isContacted: false },
      { id: 'd2', name: 'Atlas Financial', MRR: 12500, churnProbability: 0.05, supportTickets: 0, lastActivityDays: 2, contractLengthMonths: 24, isContacted: false },
      { id: 'd3', name: 'Horizon HealthTech', MRR: 3200, churnProbability: 0.28, supportTickets: 3, lastActivityDays: 18, contractLengthMonths: 12, isContacted: false },
      { id: 'd4', name: 'Vertex Logistics', MRR: 900, churnProbability: 0.62, supportTickets: 5, lastActivityDays: 40, contractLengthMonths: 6, isContacted: false },
      { id: 'd5', name: 'Aurora Retail', MRR: 2400, churnProbability: 0.18, supportTickets: 2, lastActivityDays: 7, contractLengthMonths: 12, isContacted: false },
      { id: 'd6', name: 'Stratus AI', MRR: 7800, churnProbability: 0.09, supportTickets: 0, lastActivityDays: 1, contractLengthMonths: 36, isContacted: false },
      { id: 'd7', name: 'Bluewater Media', MRR: 600, churnProbability: 0.55, supportTickets: 2, lastActivityDays: 30, contractLengthMonths: 12, isContacted: false },
    ];
    setCustomers(dummyCustomers);
    (showToast || showCustomModal)(`Successfully added ${dummyCustomers.length} initial customers to memory!`, 'success');
  }, [setCustomers, showCustomModal, showToast]);

  // Calculate enhanced customer list (including risk score) whenever the raw customer list changes
  const enhancedCustomers = useMemo(() => {
    return customers.map(c => {
      // Calculate the custom risk score
      const riskScore = calculateChurnRiskScore(c);
      const riskLevel = riskScore >= 70 ? 'High' : riskScore >= 40 ? 'Medium' : 'Low';
      return {
        ...c,
        riskScore,
        riskLevel,
      };
    }).sort((a, b) => b.riskScore - a.riskScore); // Sort by highest risk
  }, [customers]);

  // Handler to mark customer as contacted
  const handleContactCustomer = useCallback((customerId) => {
    setCustomers(prevCustomers => 
        prevCustomers.map(c => 
            c.id === customerId ? { ...c, isContacted: true } : c
        )
    );
    (showToast || showCustomModal)("Customer marked as contacted! (Local update)", 'info');
  }, [setCustomers, showCustomModal, showToast]);


  // Calculate Overview Data based on current customers
  const overviewData = useMemo(() => {
    let totalMRR = 0;
    let customerCount = 0;
  // Basic aggregations
  customers.forEach(data => {
    totalMRR += Number(data.MRR) || 0;
    customerCount += 1;
  });

  const avgMrr = customerCount > 0 ? totalMRR / customerCount : 0;
  const totalRevenue = totalMRR * 12; // Annualized

  // Heuristic churn and NRR estimates (best-effort without event history)
  // We approximate 'at-risk' customers as churnProbability >= 0.5
  const atRiskCustomers = customers.filter(c => Number(c.churnProbability) >= 0.5);
  const churnedMRR = atRiskCustomers.reduce((s, c) => s + (Number(c.MRR) || 0), 0);
  const churnRateByCount = customerCount > 0 ? (atRiskCustomers.length / customerCount) : 0;

  // Estimated expansion MRR heuristic: customers with churnProbability < 0.2 are 'expanding' slightly
  const expansionCustomers = customers.filter(c => Number(c.churnProbability) < 0.2);
  const expansionMRR = expansionCustomers.reduce((s, c) => s + ((Number(c.MRR) || 0) * 0.02), 0); // assume 2% expansion

  // NRR estimate: (startingMRR + expansion - churn) / startingMRR
  const estimatedNRR = totalMRR > 0 ? ((totalMRR + expansionMRR - churnedMRR) / Math.max(1, totalMRR)) : 1;

  const monthlySeries = computeMonthlySeries(customers);

  return {
    customerCount,
    totalMRR,
    avgMrr,
    totalRevenue,
    churnedMRR,
    churnRateByCount,
    expansionMRR,
    estimatedNRR,
    monthlySeries,
  };
  }, [customers]);


  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <DataDashboard onDataUpload={handleDataUpload} showCustomModal={showCustomModal} seedInitialData={seedInitialData} showToast={showToast} />;
      case 'overview':
        return <DataOverview overviewData={overviewData} />;
      case 'forecast':
        return <TimeSeriesForecast chartRef={forecastChartRef} monthlySeries={overviewData.monthlySeries} showCustomModal={showCustomModal} showToast={showToast} />;
      case 'simulation':
        return <WhatIfSimulation enhancedCustomers={enhancedCustomers} showCustomModal={showCustomModal} chartRef={simulationChartRef} showToast={showToast} />;
      case 'churn':
        return <ChurnPredictor enhancedCustomers={enhancedCustomers} handleContactCustomer={handleContactCustomer} seedInitialData={seedInitialData} />;
      case 'settings':
        return <Settings />;
      default:
        return <DataDashboard onDataUpload={handleDataUpload} showCustomModal={showCustomModal} seedInitialData={seedInitialData} />;
    }
  };

  const navItemClass = (currentView) => (
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors duration-150 ${
      view === currentView
        ? 'bg-white text-blue-700 border-b-2 border-blue-700 font-semibold'
        : 'text-gray-500 hover:text-blue-600 hover:bg-gray-100'
    }`
  );

  return (
    <div className="min-h-screen bg-gray-50 antialiased">
        {/* Load Tailwind CSS */}
        <script src="https://cdn.tailwindcss.com"></script>
        {/* Set Inter font */}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap'); body { font-family: 'Inter', sans-serif; }`}</style>
      
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row justify-between items-center">
      <div className="flex items-center space-x-3">
        <img src={logo} alt="jArvIs360 by Data2Metrics" className="h-10 w-10 object-contain" />
        <div>
          <div className="text-xs text-gray-500">Data2Metrics</div>
          <h1 className="text-2xl font-extrabold text-gray-900">jArvIs360</h1>
        </div>
      </div>
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              Local Memory Mode
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Tabs */}
        <nav className="flex space-x-1 mt-4 border-b border-gray-200 overflow-x-auto whitespace-nowrap">
            <button type="button" aria-label="Go to Data Intake" onClick={() => setView('dashboard')} className={navItemClass('dashboard')}>
            Data Intake
          </button>
          <button type="button" aria-label="Go to Overview" onClick={() => setView('overview')} className={navItemClass('overview')}>
            Overview
          </button>
          <button type="button" aria-label="Go to Forecasting" onClick={() => setView('forecast')} className={navItemClass('forecast')}>
            Forecasting
          </button>
          <button type="button" aria-label="Go to Scenarios" onClick={() => setView('simulation')} className={navItemClass('simulation')}>
            Scenarios
          </button>
          <button type="button" aria-label="Go to Risk & Actions" onClick={() => setView('churn')} className={navItemClass('churn')}>
            Risk & Actions
          </button>
          <button type="button" aria-label="Go to Administration" onClick={() => setView('settings')} className={navItemClass('settings')}>
            Administration
          </button>
        </nav>
        
        {/* Content Area */}
        <main className="py-6 min-h-[70vh]">
          {renderView()}
        </main>
      </div>
      
      {/* Toast container (bottom-right) */}
      <div aria-live="polite" className="fixed right-4 bottom-4 z-50 flex flex-col-reverse space-y-reverse space-y-2 w-80">
        {toasts.map(t => (
          <div key={t.id} className="mb-2">
            <Toast id={t.id} message={t.message} type={t.type} duration={t.timeout} onClose={removeToast} />
          </div>
        ))}
      </div>

  {/* CustomModal removed; toasts used instead */}
    </div>
  );
};

export default App;
