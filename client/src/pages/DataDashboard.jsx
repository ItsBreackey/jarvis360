import React, { useState, useEffect } from 'react';
import auth from '../utils/auth';
import { parseCSV } from '../utils/csv';
import UploadStatusPoller from '../components/UploadStatusPoller';
// Modal previously imported but not needed in this extracted page
import { InfoIcon } from '../lib/appShared';

const DataDashboard = ({ onDataUpload, showCustomModal, seedInitialData, showToast = null }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [latestUploadId, setLatestUploadId] = useState(null);
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
    // clear any previous server-upload status when a new file is selected
    setLatestUploadId(null);
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
              try {
                const uploadJson = await resp.json();
                if (uploadJson && uploadJson.id) setLatestUploadId(uploadJson.id);
              } catch (e) { /* ignore JSON parse errors */ }
            } else {
              // Try to parse response JSON and show the poller if server still returned an upload id
              let uploadJson = null
              try {
                uploadJson = await resp.json();
              } catch (e) {
                // Not JSON
              }
              if (uploadJson && uploadJson.id) {
                setLatestUploadId(uploadJson.id);
                (showToast || showCustomModal)(`Server accepted file but returned ${resp.status}; polling status...`, 'warn');
              } else {
                console.warn('Server upload failed', resp.status);
                (showToast || showCustomModal)(`Local load succeeded; server upload failed (${resp.status}).`, 'warn');
                setLatestUploadId(null);
              }
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
      <h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2">Data Intake & Preparation<InfoIcon title="Upload CSVs and map columns (date, MRR, id)." srText="Data intake information" /></h2>

      <div className="bg-white p-6 shadow-xl rounded-xl border border-gray-100">
    <p className="text-gray-700 mb-4">
      Upload a <strong>CSV file</strong> to populate the customer data. Data is stored <strong>only in your browser's memory</strong> and is not persistent.
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
        {latestUploadId && (
          <div className="mt-4">
            <UploadStatusPoller uploadId={latestUploadId} />
          </div>
        )}

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
        Use the tabs above to navigate the different modules: view your <strong>Data Overview</strong>, predict churn in the <strong>Churn Predictor</strong>, or run scenarios in the <strong>What-If Simulation</strong>.
      </p>
      </div>
    </div>
  );
};

export default DataDashboard;
