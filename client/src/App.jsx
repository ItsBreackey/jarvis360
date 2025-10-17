import './App.css';



import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import auth from './utils/auth';
import { parseCSV } from './utils/csv';
import logo from './d2m_logo.png';
import Toast from './Toast';
import ChurnChart from './ChurnChart';
import { computeMonthlySeries as computeMonthlySeriesUtil, holtAutoTuneAdvanced } from './utils/analytics';
import runCancelableHoltAutoTune from './utils/holtWorker';
import { generateScenarioSummary } from './utils/summarizer';
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Brush, Legend } from 'recharts';
import { computeForecastFromRecords } from './utils/forecast';

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
  const [previewRows, setPreviewRows] = useState([]);
  const [showMalformed, setShowMalformed] = useState(false);
  // Persisted header mapping (loads from localStorage if present)
  const HEADER_MAPPING_KEY = 'jarvis_header_mapping_v1';
  const defaultMapping = { dateKey: null, mrrKey: 'MRR', idKey: 'id', churnKey: null, supportKey: null, lastActivityKey: null };
  const [mapping, setMapping] = useState(() => {
    try {
      const raw = localStorage.getItem(HEADER_MAPPING_KEY);
      if (raw) return { ...defaultMapping, ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
    return defaultMapping;
  });

  // save mapping to localStorage when it changes
  useEffect(() => {
    try { localStorage.setItem(HEADER_MAPPING_KEY, JSON.stringify(mapping)); } catch (e) { /* ignore */ }
  }, [mapping]);

  // expected headers kept for reference if needed later

  // parseCSV moved to ./utils/csv.js


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
        // parse preview rows (first 10) quickly
        try {
          const lines = text.split('\n').slice(1, 11);
          const previews = lines.map(l => {
            const cols = l.split(',');
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = cols[idx] !== undefined ? cols[idx].trim() : ''; });
            return obj;
          }).filter(r => Object.keys(r).length > 0);
          setPreviewRows(previews);
        } catch (e) { setPreviewRows([]); }
        // set sensible defaults
        setMapping({ dateKey: headers.find(h => /date|month|created_at|uploadedat/i.test(h)) || null, mrrKey: headers.find(h => /mrr|revenue|amount|value/i.test(h)) || 'MRR', idKey: headers.find(h => /id|name|customer/i.test(h)) || 'id' });
      };
      reader.readAsText(uploadedFile);
    } else {
      setFile(null);
      (showToast || showCustomModal)("Please upload a valid CSV file.", 'error');
    }
  };

  // Detect malformed uploads (missing date or MRR-like columns)
  useEffect(() => {
    try {
      // only evaluate after we have detected headers (i.e., after a file preview)
      if (!previewHeaders || previewHeaders.length === 0) {
        setShowMalformed(false);
        return;
      }
      const dateCandidate = mapping.dateKey || previewHeaders.find(h => /date|month|created_at|uploadedat|start_date|signupDate/i.test(h));
      const mrrCandidate = mapping.mrrKey || previewHeaders.find(h => /mrr|revenue|amount|value/i.test(h));
      setShowMalformed(!(dateCandidate && mrrCandidate));
    } catch (e) { setShowMalformed(false); }
  }, [previewHeaders, mapping]);

  const handleProcessFile = async () => {
    if (!file) {
      (showToast || showCustomModal)("No valid file selected.", 'error');
      return;
    }
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

        // If authenticated, try to upload to server for persistence
        try {
          const meUser = await auth.me();
          if (meUser && file) {
            const form = new FormData();
            form.append('file', file, file.name);
            const resp = await auth.apiFetch('/api/uploads/', { method: 'POST', body: form });
            if (resp.ok) {
              (showToast || showCustomModal)(`Uploaded ${customerData.length} rows to server.`, 'success');
            } else {
              console.warn('Server upload failed', resp.status);
              (showToast || showCustomModal)(`Local load succeeded; server upload failed (${resp.status}).`, 'warn');
            }
          }
        } catch (e) {
          console.error('Upload to server failed', e);
          (showToast || showCustomModal)('Local load succeeded; server upload error. See console.', 'warn');
        }

        setUploadedCount(customerData.length);
        (showToast || showCustomModal)(`Successfully loaded ${customerData.length} new customer records into memory!`, 'success');
      } catch (error) {
        console.error("Error during file processing:", error);
        (showToast || showCustomModal)(`Error processing data: ${error.message}`, 'error');
      } finally {
        setLoading(false);
        setFile(null);
        setPreviewRows([]);
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
          <p className="text-sm text-blue-800 mb-2">At minimum include a Date column and an MRR (revenue) column. Common header names:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-blue-700 font-semibold">Date aliases</div>
              <code className="block bg-blue-100 p-2 rounded text-sm text-blue-900 overflow-x-auto">date, month, created_at, createdAt, uploadedAt, start_date, signupDate</code>
            </div>
            <div>
              <div className="text-xs text-blue-700 font-semibold">MRR / Revenue aliases</div>
              <code className="block bg-blue-100 p-2 rounded text-sm text-blue-900 overflow-x-auto">MRR, revenue, amount, value, price, monthly_revenue</code>
            </div>
          </div>
          <div className="mt-3 text-sm text-blue-700">Other helpful columns: <code className="bg-blue-100 p-1 rounded">name</code>, <code className="bg-blue-100 p-1 rounded">churnProbability</code>, <code className="bg-blue-100 p-1 rounded">supportTickets</code></div>
          <div className="mt-2 text-xs text-blue-600">
            Churn formats accepted: decimal probability (e.g., <code className="bg-blue-50 p-1 rounded">0.12</code>) or percent (e.g., <code className="bg-blue-50 p-1 rounded">12%</code>). The parser normalizes percent values to 0–1. Empty churn values will be set to 0 and can be estimated by the Churn Predictor if you enable the heuristic.
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="flex-1 w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700"
          />
        </div>

        {showMalformed && (
          <div className="mt-4 p-3 rounded bg-red-50 border border-red-100 text-red-700 text-sm">
            Warning: uploaded CSV does not appear to contain a recognizable Date, Name and/or MRR column. Please verify your headers or adjust the column selectors below.
          </div>
        )}
        {previewHeaders.length > 0 && (
          <>
            {/* Suggested header picks (moved above preview) */}
            <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-100 text-sm">
              {(() => {
                    const suggestedDate = previewHeaders.find(h => /date|month|created_at|createdAt|uploadedAt|start_date|signupDate/i.test(h));
                    const suggestedMrr = previewHeaders.find(h => /mrr|revenue|amount|value|price|monthly_revenue/i.test(h));
                    const suggestedChurn = previewHeaders.find(h => /churn|churnProbability|churn_prob|churn_rate|churn%/i.test(h));
                    const suggestedSupport = previewHeaders.find(h => /support|ticket|tickets|open_tickets|num_tickets/i.test(h));
                    const suggestedLastActivity = previewHeaders.find(h => /lastActivity|last_activity|last_login|days_ago|days_inactive|inactive_days|lastSeen|last_seen/i.test(h));
                    return (
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                        <div className="mb-2 sm:mb-0">
                          <div><strong>Suggested Date:</strong> {suggestedDate || <span className="text-gray-500">(none detected)</span>}</div>
                          <div><strong>Suggested MRR:</strong> {suggestedMrr ? suggestedMrr : <span className="text-gray-500">(none detected)</span>}</div>
                          <div><strong>Suggested Churn:</strong> {suggestedChurn || <span className="text-gray-500">(none detected)</span>}</div>
                          <div><strong>Suggested Support Tickets:</strong> {suggestedSupport || <span className="text-gray-500">(none detected)</span>}</div>
                          <div><strong>Suggested Last Activity:</strong> {suggestedLastActivity || <span className="text-gray-500">(none detected)</span>}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button className="px-3 py-1 bg-green-600 text-white rounded text-sm" onClick={() => {
                            // accept suggestions into mapping if present
                            setMapping(prev => ({ ...prev, dateKey: suggestedDate || prev.dateKey, mrrKey: suggestedMrr || prev.mrrKey, churnKey: suggestedChurn || prev.churnKey, supportKey: suggestedSupport || prev.supportKey, lastActivityKey: suggestedLastActivity || prev.lastActivityKey }));
                            (showToast || showCustomModal)('Suggested header mapping applied.', 'success');
                          }}>Accept Suggestions</button>
                          <button className="px-3 py-1 bg-gray-100 rounded text-sm" onClick={() => { setMapping({ dateKey: null, mrrKey: 'MRR', idKey: 'id', churnKey: null, supportKey: null, lastActivityKey: null }); (showToast || showCustomModal)('Reset header mapping.', 'info'); }}>Reset</button>
                        </div>
                      </div>
                    );
                  })()}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
              <HeaderSelector label="Date Column" value={mapping.dateKey} onChange={(v) => setMapping(prev => ({ ...prev, dateKey: v }))} />
              <HeaderSelector label="MRR Column" value={mapping.mrrKey} onChange={(v) => setMapping(prev => ({ ...prev, mrrKey: v }))} />
              <HeaderSelector label="Churn Column" value={mapping.churnKey} onChange={(v) => setMapping(prev => ({ ...prev, churnKey: v }))} />
              <HeaderSelector label="Support Tickets Column" value={mapping.supportKey} onChange={(v) => setMapping(prev => ({ ...prev, supportKey: v }))} />
              <HeaderSelector label="Last Activity Column" value={mapping.lastActivityKey} onChange={(v) => setMapping(prev => ({ ...prev, lastActivityKey: v }))} />
              <HeaderSelector label="ID / Name Column" value={mapping.idKey} onChange={(v) => setMapping(prev => ({ ...prev, idKey: v }))} />
            </div>
          </>
        )}

        {/* Preview rows only */}
            <div className="mt-6">
          <div className="bg-white p-4 rounded border overflow-x-auto">
            <h4 className="font-semibold text-gray-700 mb-2">Preview Rows</h4>
            {previewRows.length === 0 ? (
              <div className="text-xs text-gray-500">No preview available.</div>
            ) : (
              <div style={{ minWidth: Math.max(previewHeaders.length * 140, 600) }}>
                <table className="w-full text-sm table-auto whitespace-nowrap">
                  <thead>
                    <tr>
                          {previewHeaders.map(h => (
                                      <th key={h} className={`text-left pr-4 font-medium text-gray-600`}>{h}</th>
                                    ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, idx) => (
                          <tr key={idx} className="border-t">
                        {previewHeaders.map(h => <td key={h} className="py-1 pr-4">{r[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-4 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleProcessFile}
                disabled={!file || loading}
                className="px-4 py-2 text-white bg-green-600 hover:bg-green-700 rounded shadow disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : `Process File ${file ? `(${file.name})` : ''}`}
              </button>
              {uploadedCount > 0 && (
                <p className="text-sm font-medium text-green-700">Loaded {uploadedCount} records.</p>
              )}
            </div>
      <button id="load-demo-btn"
        type="button"
        aria-label="Load demo dataset"
        onClick={async () => {
          setLoading(true);
          try {
            const resp = await fetch('/demo_sample.csv');
            const txt = await resp.text();
            const parsed = parseCSV(txt, { dateKey: 'date', mrrKey: 'MRR', idKey: 'name' });
            if (parsed && parsed.length) {
              onDataUpload(parsed, { dateKey: 'date', mrrKey: 'MRR', idKey: 'name' });
              setUploadedCount(parsed.length);
              (showToast || showCustomModal)(`Loaded demo dataset (${parsed.length} rows)`, 'success');
            } else {
              (showToast || showCustomModal)('Demo data failed to parse.', 'error');
            }
          } catch (e) {
            console.error('Load demo failed', e);
            // Fallback for test environments (jsdom/no network): seed local dummy data instead
            try {
              seedInitialData();
              (showToast || showCustomModal)('Loaded demo dataset (fallback seed).', 'info');
            } catch (se) {
              console.error('Fallback seed failed', se);
              (showToast || showCustomModal)('Failed to load demo data.', 'error');
            }
          } finally { setLoading(false); }
        }}
        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
      >
        Load Demo
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

// Small AuthPanel to register/login/logout
const AuthPanel = ({ showToast = null }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [meUser, setMeUser] = useState(null);

  const refreshMe = useCallback(async () => {
    const u = await auth.me();
    setMeUser(u ? u.username : null);
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  const doRegister = async () => {
    setLoading(true); setError(null);
    try {
      await auth.register({ username, password, org_name: orgName || username, set_cookie: true });
      (showToast || (()=>{}))('Registration successful — logged in (cookie set).', 'success');
      setUsername(''); setPassword(''); setOrgName('');
      await refreshMe();
    } catch (e) {
      console.error('Register failed', e);
      setError('Registration failed.');
    } finally { setLoading(false); }
  };

  const doLogin = async () => {
    setLoading(true); setError(null);
    try {
      await auth.login({ username, password, use_cookie: true });
      (showToast || (()=>{}))('Login successful.', 'success');
      setUsername(''); setPassword('');
      await refreshMe();
    } catch (e) {
      console.error('Login failed', e);
      setError('Login failed. Check credentials.');
    } finally { setLoading(false); }
  };

  const doLogout = async () => {
    await auth.logout();
    (showToast || (()=>{}))('Logged out.', 'info');
    setMeUser(null);
  };

  if (meUser) {
    return (
      <div className="flex items-center space-x-2">
        <div className="text-xs text-gray-600">{meUser ? `Signed in as ${meUser}` : `Signed in`}</div>
        <button className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded" onClick={doLogout}>Logout</button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <input placeholder="org (for register)" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="text-xs p-1 rounded border" />
      <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} className="text-xs p-1 rounded border" />
      <input placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="text-xs p-1 rounded border" />
      <button className="px-3 py-1 bg-green-600 text-white rounded text-xs" disabled={loading} onClick={doLogin}>Login</button>
      <button className="px-3 py-1 bg-blue-600 text-white rounded text-xs" disabled={loading} onClick={doRegister}>Register</button>
      {error && <div className="text-xs text-red-600">{error}</div>}
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
const TimeSeriesForecast = ({ chartRef, monthlySeries = [], records = [], showCustomModal = () => {}, showToast = null, showToastRef = { current: null }, showCustomModalRef = { current: null } }) => {
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
  const tuningRef = useRef(null);
  const [tuningProgress, setTuningProgress] = useState(0);

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
  const prevForecastInputKeyRef = useRef(null);
  // Dev diagnostic flag: set localStorage.setItem('JARVIS_DEV_DIAG','1') to enable lightweight logs
  const devDiag = typeof window !== 'undefined' && !!localStorage.getItem('JARVIS_DEV_DIAG');
  // const bootstrapWorkerRef = useRef(null); // reserved for cancellation if needed
  // Linear regression on index -> value (sync + async bootstrap support)

  useEffect(() => {
    let cancelled = false;

    // Build a compact, stable input key using a streaming FNV-1a hash so we avoid
    // allocating a giant string for large datasets. We update the hash with
    // small chunks (settings and each row) to produce a deterministic key.
    const fnv1aInit = () => 2166136261 >>> 0;
    const fnv1aUpdate = (h, str) => {
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h;
    };
    const fnv1aDigest = (h) => (h >>> 0).toString(16);

    let h = fnv1aInit();
    // Add the config/settings
    h = fnv1aUpdate(h, String(method));
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, String(monthsOut));
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, String(holtAlpha));
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, String(holtBeta));
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, holtBootstrap ? 'b' : 'n');
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, String(holtBootstrapSamples));
    h = fnv1aUpdate(h, '|');
    h = fnv1aUpdate(h, holtBootstrapAsync ? 'a' : 's');
    h = fnv1aUpdate(h, '|');

    // Stream the row data from monthlySeries (preferred) or fallback to records
    if (monthlySeries && monthlySeries.length) {
      h = fnv1aUpdate(h, String(monthlySeries.length));
      for (let i = 0; i < monthlySeries.length; i++) {
        const ms = monthlySeries[i];
        // include period and numeric total as small updates
        h = fnv1aUpdate(h, '|');
        h = fnv1aUpdate(h, String(ms.period));
        h = fnv1aUpdate(h, ':');
        h = fnv1aUpdate(h, String(ms.total));
      }
    } else if (records && records.length) {
      h = fnv1aUpdate(h, String(records.length));
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const period = r.period || r.date || '';
        const val = r.total || r.MRR || '';
        h = fnv1aUpdate(h, '|');
        h = fnv1aUpdate(h, String(period));
        h = fnv1aUpdate(h, ':');
        h = fnv1aUpdate(h, String(val));
      }
    } else {
      h = fnv1aUpdate(h, '0');
    }

    const inputKey = fnv1aDigest(h);

    // If inputs haven't changed, skip recomputing
    if (prevForecastInputKeyRef.current === inputKey) {
      if (devDiag) console.debug('[jarvis] forecast effect skipped (inputKey unchanged)', inputKey);
      return () => { cancelled = true; };
    }
    prevForecastInputKeyRef.current = inputKey;

    if (devDiag) console.debug('[jarvis] forecast effect running, inputKey=', inputKey, { method, monthsOut, holtAlpha, holtBeta, holtBootstrap, holtBootstrapSamples, holtBootstrapAsync });

    setComputingBootstrap(true);

    // Use computeForecastFromRecords helper — it will aggregate monthly series and run forecast
    try {
      const maybe = computeForecastFromRecords(records && records.length ? records : (monthlySeries && monthlySeries.length ? monthlySeries.map(ms => ({ period: ms.period, total: ms.total })) : []), { method: method === 'holt' ? 'holt' : 'linear', monthsOut, holtOptions: { alpha: holtAlpha, beta: holtBeta, bootstrap: holtBootstrap, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: holtBootstrapAsync } });
      // The helper may return a Promise (if holt with async bootstrap), or an object
      if (maybe && typeof maybe.then === 'function') {
        asyncForecastRef.current = maybe;
        maybe.then((res) => {
          asyncForecastRef.current = null;
          if (cancelled) return;
          // res is the full object { monthlySeries, forecastResult }
          setForecastResultState(res.forecastResult || res);
        }).catch((err) => {
          asyncForecastRef.current = null;
          console.error('Async forecast failed', err);
          // use refs to stable toast functions
          try { (showToastRef.current || showCustomModalRef.current)('Async forecast failed. See console for details.', 'error'); } catch (e) {}
        }).finally(() => { if (!cancelled) setComputingBootstrap(false); });
      } else {
        // synchronous result
        const res = maybe || {};
        setForecastResultState(res.forecastResult || res);
        setComputingBootstrap(false);
      }
    } catch (err) {
      console.error('Forecast compute failed', err);
      try { (showToastRef.current || showCustomModalRef.current)('Forecast compute failed. See console for details.', 'error'); } catch (e) {}
      setComputingBootstrap(false);
    }

    return () => { cancelled = true; };
  // note: showToast/showCustomModal use refs above so they are omitted from deps to avoid identity churn
  }, [records, monthlySeries, method, monthsOut, holtAlpha, holtBeta, holtBootstrap, holtBootstrapSamples, holtBootstrapAsync, devDiag, showCustomModalRef, showToastRef]);

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
                      setTuningProgress(0);
                      // Use cancelable worker
                      const numericSeries = series.map(s => Number(s.total || 0));
                      const runner = runCancelableHoltAutoTune(numericSeries, {
                        alphaStart: 0.05, alphaEnd: 0.95, alphaStep: 0.05,
                        betaStart: 0.05, betaEnd: 0.95, betaStep: 0.05,
                        onProgress: (pct, best) => {
                          setTuningProgress(pct);
                          if (pct % 20 === 0) {
                            try { (showToast || showCustomModal)(`Auto-tune progress ${pct}% — best MSE ${Number((best && best.sse) || 0).toFixed(1)}`, 'info'); } catch (e) {}
                          }
                        }
                      });
                      tuningRef.current = runner;
                      const out = await runner.promise;
                      tuningRef.current = null;
                      if (out && out.alpha != null) {
                        setHoltAlpha(out.alpha);
                        setHoltBeta(out.beta);
                        localStorage.setItem(HOLTPREF, JSON.stringify({ alpha: out.alpha, beta: out.beta, bootstrap: holtBootstrap, bootstrapSamples: holtBootstrapSamples, bootstrapAsync: holtBootstrapAsync }));
                        (showToast || showCustomModal)(`Auto-tune completed — α=${out.alpha.toFixed(2)}, β=${out.beta.toFixed(2)}, SSE=${out.sse.toFixed(1)}`, 'success');
                      }
                    } catch (err) {
                      if (err && err.message && err.message.indexOf('terminated') >= 0) {
                        (showToast || showCustomModal)('Auto-tune cancelled.', 'info');
                      } else {
                        console.error('Auto-tune failed', err);
                        (showToast || showCustomModal)('Auto-tune failed. See console for details.', 'error');
                      }
                    } finally { setTuning(false); setTuningProgress(0); }
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
            <button type="button" aria-label="Download forecast image" disabled={exporting || !(chartRef && chartRef.current)} aria-disabled={exporting || !(chartRef && chartRef.current)} className="px-3 py-1 bg-blue-500 text-white rounded text-sm" onClick={async () => {
              const container = chartRef && chartRef.current ? chartRef.current : null;
              if (!container) { (showToast || showCustomModal)('No chart available to export.', 'error'); return; }
              setExporting(true);
              try {
                const ok = await exportElementToPng(container, 'forecast_chart.png', 2);
                if (ok) (showToast || showCustomModal)('Chart image downloaded.', 'success'); else (showToast || showCustomModal)('Failed to export chart image.', 'error');
              } finally { setExporting(false); }
            }}>{exporting ? 'Exporting...' : 'Download Image'}</button>
            <button type="button" aria-label="Copy forecast image to clipboard" disabled={exporting || !(chartRef && chartRef.current)} aria-disabled={exporting || !(chartRef && chartRef.current)} className="px-3 py-1 bg-gray-500 text-white rounded text-sm" onClick={async () => {
              const container = chartRef && chartRef.current ? chartRef.current : null;
              if (!container) { (showToast || showCustomModal)('No chart available to copy.', 'error'); return; }
              setExporting(true);
              try {
                const ok = await copyElementToClipboard(container, 2);
                if (ok) (showToast || showCustomModal)('Chart image copied to clipboard.', 'success'); else (showToast || showCustomModal)('Failed to copy chart to clipboard. Your browser may block clipboard image writes.', 'error');
              } finally { setExporting(false); }
            }}>{exporting ? 'Exporting...' : 'Copy Image'}</button>
            {computingBootstrap && (
              <div className="flex items-center space-x-2">
                <div className="text-sm text-gray-500">Computing CI...</div>
                <button type="button" aria-label="Cancel CI" className="px-3 py-1 bg-red-500 text-white rounded text-sm" onClick={() => {
                  try {
                    if (asyncForecastRef.current && typeof asyncForecastRef.current.revoke === 'function') asyncForecastRef.current.revoke();
                  } catch (e) { console.error('Cancel revoke failed', e); }
                  asyncForecastRef.current = null;
                  setComputingBootstrap(false);
                  // keep last known forecast displayed — avoid calling setState with same value
                  (showToast || showCustomModal)('Bootstrap CI cancelled.', 'info');
                }}>Cancel CI</button>
              </div>
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
        {/* Explainability panel: shows chosen model and parameters in friendly text */}
        <div className="mt-4 p-3 bg-gray-50 border border-dashed rounded text-sm text-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <strong>Model:</strong> {method === 'holt' ? 'Holt Linear (double exponential smoothing)' : 'Linear regression (OLS)'}
              <div className="text-xs text-gray-600 mt-1">{method === 'holt' ? `α=${holtAlpha.toFixed(2)}, β=${holtBeta.toFixed(2)}${holtBootstrap ? `, bootstrap=${holtBootstrapSamples} samples${holtBootstrapAsync ? ' (async)' : ''}` : ''}` : `Slope projection over historical period`}</div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>{series.length} months of history</div>
              <div>{monthsOut} months forecast</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500">Tip: use Auto-tune for Holt when you have at least 6 months of history. Bootstrap CIs estimate uncertainty — enable async mode for large sample counts.</div>
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
        // Also attempt to fetch server-saved dashboards and merge when authenticated
        (async () => {
          try {
            const meUser = await auth.me();
            if (!meUser) return;
            const resp = await auth.apiFetch('/api/dashboards/', { method: 'GET' });
            if (!resp || !resp.ok) return;
            const list = await resp.json().catch(() => null);
            if (!Array.isArray(list)) return;
            // Map server dashboards into local scenario shape if possible
            const mapped = list.map(d => ({ id: `srv-${d.id}`, serverId: d.id, name: d.name || `Server Dashboard ${d.id}`, createdAt: d.created_at || d.createdAt || new Date().toISOString(), data: (d.config && d.config.data) || {} }));
            // Merge server-saved dashboards before local ones (server-first)
            setSavedScenarios(prev => {
              // dedupe by serverId or id
              const seen = new Set();
              const combined = (mapped.concat(prev || [])).filter(s => {
                const key = s.serverId ? `srv-${s.serverId}` : s.id;
                if (seen.has(key)) return false; seen.add(key); return true;
              }).slice(0,50);
              try { localStorage.setItem(STORAGE_KEY, JSON.stringify(combined)); } catch (e) {}
              return combined;
            });
          } catch (e) {
            // ignore fetch errors (e.g., not authenticated or offline)
          }
        })();
      }, []);

      const persistScenarios = (list) => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
      };

      const saveScenario = () => {
        const name = scenarioName && scenarioName.trim() ? scenarioName.trim() : `Scenario ${new Date().toLocaleString()}`;
        const id = Date.now().toString();
        const payload = { id, name, createdAt: new Date().toISOString(), data: whatIfData };
        const next = [payload].concat(savedScenarios).slice(0, 50); // keep recent 50
        // if authenticated, persist to server as a Dashboard
        (async () => {
          try {
            const meUser = await auth.me();
            if (meUser) {
              const payloadToServer = { name, config: { data: whatIfData } };
              try {
                const resp = await auth.apiFetch('/api/dashboards/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadToServer) });
                if (resp.ok) {
                  const body = await resp.json().catch(() => null);
                  if (body && body.id) {
                    const merged = [{ ...payloadToServer, serverId: body.id, id }].concat(savedScenarios).slice(0,50);
                    setSavedScenarios(merged);
                    persistScenarios(merged);
                  }
                  (showToast || showCustomModal)(`Saved scenario "${name}" to server.`, 'success');
                  return;
                }
                console.warn('Server save failed', resp.status);
              } catch (e) {
                console.error('Server save error', e);
              }
            }
            // fallback local
            setSavedScenarios(next);
            persistScenarios(next);
            (showToast || showCustomModal)(`Saved scenario "${name}"`, 'success');
          } catch (e) {
            console.error('Save scenario failed', e);
            setSavedScenarios(next);
            persistScenarios(next);
            (showToast || showCustomModal)(`Saved scenario "${name}"`, 'success');
          }
        })();

        setScenarioName('');
        setSelectedScenarioId(id);
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
const ChurnPredictor = ({ enhancedCustomers, handleContactCustomer, seedInitialData, computeChurnWhenMissing, setComputeChurnWhenMissing }) => {

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
                const estMod = require('./utils/churn');
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


// Component 6: Settings (Placeholder)
const Settings = () => (
    <SettingsInner />
);

// Separate component to enable hooks usage for settings
const SettingsInner = () => {
  const STORAGE_KEY = 'jarvis_churn_weights_v1';
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
            const res = require('./utils/churn').default(sample, weights);
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
};

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

  // Provide stable refs to the toast/modal functions so deeply nested effects
  // (like TimeSeriesForecast) can call them without needing to include them
  // in dependency lists which can cause identity churn.
  const showToastRef = useRef(showToast);
  const showCustomModalRef = useRef(showCustomModal);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);
  useEffect(() => { showCustomModalRef.current = showCustomModal; }, [showCustomModal]);

  // notify helper removed (unused) — use showToast directly via refs where needed

  // Handler to receive uploaded data (memoized to avoid identity churn)
  const handleDataUpload = useCallback((newCustomers) => {
    setCustomers(newCustomers);
  }, [setCustomers]);

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
    // ensure seeded customers include churn provenance where churnProbability is provided
    const seeded = dummyCustomers.map(c => ({ ...c, _churnProvided: !!(c.churnProbability || c.churnProbability === 0) }));
    setCustomers(seeded);
    (showToast || showCustomModal)(`Successfully added ${dummyCustomers.length} initial customers to memory!`, 'success');
  }, [setCustomers, showCustomModal, showToast]);

  // Toggle: compute churn heuristics for rows that did not provide churnProbability
  const [computeChurnWhenMissing, setComputeChurnWhenMissing] = useState(true);
  // churn estimator (require to keep module resolution simple in CRA tests)
  // we use the detailed estimator export from utils/churn
  const estimateChurnFromFeaturesDetailed = require('./utils/churn').default; // detailed

  // Calculate enhanced customer list (including risk score) whenever the raw customer list changes
  const enhancedCustomers = useMemo(() => {
    return customers.map(c => {
      // If churn was not provided and user wants heuristics, compute from riskScore heuristically after riskScore calculation
      const riskScore = calculateChurnRiskScore(c);
      const riskLevel = riskScore >= 70 ? 'High' : riskScore >= 40 ? 'Medium' : 'Low';
      const base = {
        ...c,
        riskScore,
        riskLevel,
      };

      // churn provenance flags: supplied (_churnProvided) vs computed (_churnComputed)
      let churnProvided = !!c._churnProvided;
      let churnComputed = false;

  // Compute churn when the user enabled heuristics AND either the CSV didn't provide churn
  // or the churn value is missing/zero. This makes the toggle more robust to uploads
  // where the churn column may be present but cells are empty/zero.
  if (computeChurnWhenMissing && (!churnProvided || !c.churnProbability || Number(c.churnProbability) === 0)) {
        // try estimator using supportTickets / lastActivityDays / MRR
        try {
          // load persisted weights from Settings (if any)
          let weights = null;
          try { const raw = localStorage.getItem('jarvis_churn_weights_v1'); if (raw) weights = JSON.parse(raw); } catch (e) { weights = null; }
          const res = estimateChurnFromFeaturesDetailed(c, weights || undefined);
          // estimator returns { estimate, contributions, mainDriver, raw }
          base.churnProbability = Math.max(0, Math.min(1, Number(res?.estimate) || 0));
          // attach explainability info for UI
          base._churnDriver = res?.mainDriver ? (res.mainDriver.label || res.mainDriver.key) : null;
          base._churnContributions = res?.contributions || null;
          churnComputed = true;
        } catch (e) {
          // fallback to riskScore heuristic
          const v = Math.min(1, Math.max(0, riskScore / 100));
          base.churnProbability = v;
          base._churnDriver = null;
          base._churnContributions = null;
          churnComputed = true;
        }
      }

      base._churnProvided = churnProvided;
      base._churnComputed = churnComputed;

      return base;
    }).sort((a, b) => b.riskScore - a.riskScore); // Sort by highest risk
  }, [customers, computeChurnWhenMissing, estimateChurnFromFeaturesDetailed]);

  // When the user enables/disables the heuristic toggle, apply or revert computed churn into
  // the canonical `customers` state so Overview/Forecast views (which read `customers`) reflect it.
  useEffect(() => {
    // avoid running until estimator is available
    if (!estimateChurnFromFeaturesDetailed) return;

    if (computeChurnWhenMissing) {
      // compute for rows that did not provide churn and aren't already computed
      const weightsRaw = (() => { try { const raw = localStorage.getItem('jarvis_churn_weights_v1'); return raw ? JSON.parse(raw) : null;} catch (e) { return null; } })();
      const updated = customers.map(c => {
        const provided = !!c._churnProvided;
        const hasChurn = c.churnProbability !== undefined && Number(c.churnProbability) !== 0;
        if (!provided && !hasChurn && !c._churnComputed) {
          try {
            const res = estimateChurnFromFeaturesDetailed(c, weightsRaw || undefined);
            return { ...c, _prevChurn: c.churnProbability, churnProbability: Math.max(0, Math.min(1, Number(res?.estimate) || 0)), _churnComputed: true, _churnDriver: res?.mainDriver ? (res.mainDriver.label || res.mainDriver.key) : null, _churnContributions: res?.contributions || null };
          } catch (e) {
            const fallback = Math.min(1, Math.max(0, calculateChurnRiskScore(c) / 100));
            return { ...c, _prevChurn: c.churnProbability, churnProbability: fallback, _churnComputed: true };
          }
        }
        return c;
      });
      // only set when something changed
      const changed = updated.some((u, i) => u !== customers[i]);
      if (changed) setCustomers(updated);
    } else {
      // revert computed churns back to previous values when toggle is disabled
      const reverted = customers.map(c => {
        if (c._churnComputed) {
          const nc = { ...c };
          if (nc._prevChurn !== undefined) {
            nc.churnProbability = nc._prevChurn;
          }
          delete nc._prevChurn;
          delete nc._churnComputed;
          delete nc._churnDriver;
          delete nc._churnContributions;
          return nc;
        }
        return c;
      });
      const changed = reverted.some((u, i) => u !== customers[i]);
      if (changed) setCustomers(reverted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeChurnWhenMissing, customers]);

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

  // Onboarding modal (show once)
  const [showOnboard, setShowOnboard] = useState(() => {
    try { return !localStorage.getItem('jarvis_onboard_shown_v1'); } catch (e) { return true; }
  });
  const dismissOnboard = useCallback(() => {
    try { localStorage.setItem('jarvis_onboard_shown_v1', '1'); } catch (e) {}
    setShowOnboard(false);
  }, []);


  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <DataDashboard onDataUpload={handleDataUpload} showCustomModal={showCustomModal} seedInitialData={seedInitialData} showToast={showToast} />;
      case 'overview':
        return <DataOverview overviewData={overviewData} />;
      case 'forecast':
        return <TimeSeriesForecast chartRef={forecastChartRef} monthlySeries={overviewData.monthlySeries} showCustomModal={showCustomModal} showToast={showToast} showToastRef={showToastRef} showCustomModalRef={showCustomModalRef} />;
      case 'simulation':
        return <WhatIfSimulation enhancedCustomers={enhancedCustomers} showCustomModal={showCustomModal} chartRef={simulationChartRef} showToast={showToast} />;
      case 'churn':
        return <ChurnPredictor enhancedCustomers={enhancedCustomers} handleContactCustomer={handleContactCustomer} seedInitialData={seedInitialData} computeChurnWhenMissing={computeChurnWhenMissing} setComputeChurnWhenMissing={setComputeChurnWhenMissing} />;
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
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800`}>
                Local Memory Mode
              </span>
              <AuthPanel showToast={showToast} />
            </div>
        </div>
      </header>
      {showOnboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h2 className="text-2xl font-bold mb-2">Welcome to Jarvis360</h2>
            <p className="text-gray-600 mb-4">Quickly upload a CSV or load the demo data to see MRR forecasting, churn risk, and run what-if simulations — no setup required.</p>
            <div className="flex justify-end space-x-2">
              <button className="px-4 py-2 rounded text-sm bg-gray-100" onClick={dismissOnboard}>Dismiss</button>
              <button className="px-4 py-2 rounded text-sm bg-blue-600 text-white" onClick={() => { dismissOnboard(); document.getElementById('load-demo-btn')?.click?.(); }}>Load Demo</button>
            </div>
          </div>
        </div>
      )}

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
