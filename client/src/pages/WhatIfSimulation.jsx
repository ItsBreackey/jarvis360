import React, { useEffect, useState, useMemo, useRef } from 'react';
import auth from '../utils/auth';
import { generateScenarioSummary } from '../utils/summarizer';
import { NoDataMessage, formatCurrency } from '../lib/appShared';
import { STORAGE_KEY, readSavedScenarios, persistScenarios, mergeAndPersistScenarios } from '../utils/scenarioPersistence';
import ChurnPreview from '../components/ChurnPreview';

const WhatIfSimulation = (props, forwardedRef) => {
  const { enhancedCustomers, showCustomModal, chartRef, showToast = null } = props || {};
  const { user } = require('../auth/AuthContext').useAuth();
  // prefer explicit prop `chartRef`, otherwise accept forwarded ref (React.forwardRef)
  const localChartRef = useRef(null);
  const effectiveChartRef = chartRef || forwardedRef || localChartRef;
  const [whatIfData, setWhatIfData] = useState({ discountEffect: 0.1, supportEffect: 0.05, campaignEffect: 0.15, selectedRiskLevel: 'High' });
  // persistence key and helpers moved to utils/scenarioPersistence
  const [savedScenarios, setSavedScenarios] = useState(() => readSavedScenarios());
  const [scenarioName, setScenarioName] = useState('');
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);
  const [justSavedId, setJustSavedId] = useState(null);
  const justSavedTimerRef = useRef(null);
  const [newBadgeIds] = useState([]);

  useEffect(() => {
    // On mount: load persisted scenarios, fetch server dashboards and merge, and wire listeners
    try {
      const stored = readSavedScenarios();
      if (stored) setSavedScenarios(stored);
    } catch (e) {
      // ignore
    }

    let mounted = true;

    const fetchAndMerge = async () => {
      try {
        let meUser = null;
        try { meUser = await auth.me(); } catch (e) { meUser = null; }
        if (!meUser) return;
        const resp = await auth.apiFetch('/api/dashboards/', { method: 'GET' });
        if (!resp || !resp.ok) return;
        const list = await resp.json().catch(() => null);
        if (!Array.isArray(list)) return;
        const mapped = list.map(d => ({ id: `srv-${d.id}`, serverId: d.id, name: d.name || `Server Dashboard ${d.id}`, createdAt: d.created_at || d.createdAt || new Date().toISOString(), data: (d.config && d.config.data) || {}, owner: d.owner || null, owner_name: d.owner_name || (d.owner && (d.owner.username || d.owner.name)) || null }));
        if (!mounted) return;
        try {
          // Use centralized merge to avoid races with optimistic saves/server confirms
          const out = mergeAndPersistScenarios(mapped, 'server-fetch');
          setSavedScenarios(out);
        } catch (e) {
          // fallback: just keep previous state
        }
      } catch (e) {
        // ignore
      }
    };

    // Handler for custom events — allows other tabs/components to push new payloads
    const handleLocalScenariosChanged = (ev) => {
      try {
        const payload = ev && ev.detail && ev.detail.payload;
        if (payload && payload.id) {
          try {
            const out = mergeAndPersistScenarios([payload], 'local-event');
            setSavedScenarios(out);
            return;
          } catch (e) {
            // fallback to reading storage below
          }
        }
        // otherwise read from storage
        setSavedScenarios(readSavedScenarios());
      } catch (e) {}
    };

    const handleStorage = (ev) => {
      try {
        if (!ev || ev.key !== STORAGE_KEY) return;
        const stored = readSavedScenarios();
        setSavedScenarios(stored || []);
      } catch (e) {}
    };

    const handleSharedScenarioEvent = (ev) => {
      // placeholder: if another tab set an autoload marker, we can read it here
      try {
        const raw = localStorage.getItem('jarvis_autoload_scenario');
        if (!raw) return;
        const id = raw;
        const list = readSavedScenarios();
        if (!list) return;
        const found = (list || []).find(x => x.id === id || x.serverId === id || x.id === `srv-${id}`);
        if (found) {
          setWhatIfData(found.data || found);
          setSelectedScenarioId(found.id);
        }
      } catch (e) {}
    };

    window.addEventListener('jarvis:scenarios-changed', handleLocalScenariosChanged);
    window.addEventListener('jarvis:shared-scenario', handleSharedScenarioEvent);
    window.addEventListener('storage', handleStorage);

    // initial fetch
    fetchAndMerge();

    return () => {
      mounted = false;
      window.removeEventListener('jarvis:scenarios-changed', handleLocalScenariosChanged);
      window.removeEventListener('jarvis:shared-scenario', handleSharedScenarioEvent);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Backwards-compatible alias for instrumentation use sites (imported)
  // track local-origin updates so we can dispatch event with payload after persistence
  const lastLocalUpdateRef = useRef(null);

  // centralize persistence and event dispatch: whenever savedScenarios changes, persist and notify
  useEffect(() => {
    try {
      persistScenarios(savedScenarios || []);
      // if we initiated the update, dispatch payload so listeners can update deterministically
      if (lastLocalUpdateRef.current && lastLocalUpdateRef.current.payload) {
        try { window.dispatchEvent(new CustomEvent('jarvis:scenarios-changed', { detail: { id: lastLocalUpdateRef.current.id, payload: lastLocalUpdateRef.current.payload } })); } catch (e) {}
        lastLocalUpdateRef.current = null;
      } else {
        // otherwise notify other tabs/windows that list changed
        try { window.dispatchEvent(new CustomEvent('jarvis:scenarios-changed', { detail: {} })); } catch (e) {}
      }
    } catch (e) {}
  }, [savedScenarios]);

  const saveScenario = () => {
    const name = scenarioName && scenarioName.trim() ? scenarioName.trim() : `Scenario ${new Date().toLocaleString()}`;
    const id = Date.now().toString();
    const payload = { id, name, createdAt: new Date().toISOString(), data: whatIfData };
  // keep a snapshot of previous list for potential rollback (not currently used)
    // Optimistically insert at top, removing any existing with the same id (merge with latest persisted copy)
    try {
      // mark update source so the persistence effect dispatches a detailed event
      lastLocalUpdateRef.current = { id, payload, source: 'optimistic-save' };
      // Centralized merge/persist — returns the final list we should display
      const out = mergeAndPersistScenarios([payload], 'optimistic-save');
      setSavedScenarios(out);
      setScenarioName('');
      setSelectedScenarioId(id);
      setJustSavedId(id);
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
      justSavedTimerRef.current = setTimeout(() => setJustSavedId(null), 3000);

      // Fire-and-forget: attempt to persist to server and on success merge the server-backed item
      (async () => {
        try {
          const me = await auth.me();
          if (!me) return;
          const resp = await auth.apiFetch('/api/dashboards/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, config: { data: payload.data } }) });
          if (resp && resp.ok) {
            const created = await resp.json().catch(() => null);
            const serverId = created && created.id;
            if (serverId) {
              const serverItem = { ...payload, serverId, id: `srv-${serverId}`, createdAt: created.created_at || new Date().toISOString(), owner: created.owner || null, owner_name: created.owner_name || (created.owner && (created.owner.username || created.owner.name)) || null };
              try { const out2 = mergeAndPersistScenarios([serverItem], 'server-confirm'); setSavedScenarios(out2); } catch (e) { /* ignore */ }
            }
          }
        } catch (e) {
          // server save failed — we keep optimistic local copy
        }
      })();
    } catch (e) {
      // fallback optimistic insertion if merge helper fails
      const fallback = [payload, ...(savedScenarios || [])].slice(0,50);
      lastLocalUpdateRef.current = { id, payload, source: 'optimistic-save' };
      try { persistScenarios(fallback); } catch (e2) {}
      setSavedScenarios(fallback);
    }
  };

  // Normalize current user identifiers
  const currentUserId = user && user.id ? user.id : null;
  const currentUsername = user && (user.username || user.name) ? (user.username || user.name) : null;

  // Autosave current draft to localStorage on every change so users can restore later
  useEffect(() => {
    try {
      const draftKey = 'jarvis_autosave_whatif_v1';
      localStorage.setItem(draftKey, JSON.stringify(whatIfData));
    } catch (e) { /* ignore write errors (storage full) */ }
  }, [whatIfData]);

  // Export current target customers for the selected risk level as CSV
  const exportScenarioCsv = () => {
    try {
      const headers = ['id','name','MRR','riskScore','riskLevel','supportTickets','lastActivityDays'];
      const rows = [headers.join(',')];
      const { selectedRiskLevel } = whatIfData;
      const target = (enhancedCustomers || []).filter(c => selectedRiskLevel === 'All' || c.riskLevel === selectedRiskLevel);
      target.forEach(c => {
        rows.push([c.id, (c.name || '').replace(/,/g, ''), c.MRR || 0, c.riskScore || 0, c.riskLevel || '', c.supportTickets || 0, c.lastActivityDays || c.lastActivityDays || 0].join(','));
      });
      const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'scenario_customers.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      (showToast || showCustomModal)(`Exported ${target.length} customer rows.`, 'success');
    } catch (e) { (showToast || showCustomModal)('Failed to export CSV.', 'error'); }
  };

  // Generate a short local summary string for the current scenario
  const [scenarioSummary, setScenarioSummary] = useState('');
  const generateSummary = () => {
    try {
      const s = generateScenarioSummary(simulationResults, whatIfData);
      setScenarioSummary(s);
    } catch (e) { setScenarioSummary(''); }
  };

  const loadScenario = (s) => {
    if (!s || !s.data) return;
    setWhatIfData(s.data);
    setSelectedScenarioId(s.id);
    (showToast || showCustomModal)(`Loaded scenario "${s.name}"`, 'info');
  };

  const deleteScenario = (id) => {
    try {
      const next = (savedScenarios || []).filter(s => s.id !== id);
      setSavedScenarios(next);
      persistScenarios(next);
      if (selectedScenarioId === id) setSelectedScenarioId(null);
    } catch (e) {}
  };

  // Simulation Logic (Memoized calculation for performance)
  const simulationResults = useMemo(() => {
    const { discountEffect = 0, supportEffect = 0, campaignEffect = 0, selectedRiskLevel = 'All' } = whatIfData || {};
    if (!enhancedCustomers || enhancedCustomers.length === 0) {
      return { currentTotalMRR: 0, potentialMRRLoss: 0, simulatedMRRLoss: 0, projectedMRRSaved: 0, targetCustomerCount: 0 };
    }
    const targetCustomers = enhancedCustomers.filter(c => selectedRiskLevel === 'All' || c.riskLevel === selectedRiskLevel);
    const currentTotalMRR = targetCustomers.reduce((s, c) => s + (Number(c.MRR) || 0), 0);
    const potentialMRRLoss = targetCustomers.reduce((sum, c) => sum + ((Number(c.MRR) || 0) * (Number(c.churnProbability) || 0)), 0);
    const simulatedMRRLoss = targetCustomers.reduce((sum, c) => {
      const reduction = Math.min(0.99, (Number(discountEffect) || 0) + (Number(supportEffect) || 0) + (Number(campaignEffect) || 0));
      const newChurn = Math.max(0, (Number(c.churnProbability) || 0) * (1 - reduction));
      return sum + ((Number(c.MRR) || 0) * newChurn);
    }, 0);
    const projectedMRRSaved = potentialMRRLoss - simulatedMRRLoss;
    return { currentTotalMRR, potentialMRRLoss, simulatedMRRLoss, projectedMRRSaved, targetCustomerCount: targetCustomers.length };
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
        <div className="text-sm text-gray-500">{title}</div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
      </div>
    );
  };

  // NOTE: churn scoring is provided by `client/src/utils/churn.js` – components should import from there when needed.

  const myScenarios = (savedScenarios || []).filter(s => {
    // Local-only scenarios belong to me
    if (!s.serverId) return true;
    try {
      const ownerId = s.owner && s.owner.id ? s.owner.id : null;
      const ownerUsername = s.owner && (s.owner.username || s.owner.name) ? (s.owner.username || s.owner.name) : (s.owner_name || null);
      if (ownerId && currentUserId && ownerId === currentUserId) return true;
      if (ownerUsername && currentUsername && ownerUsername === currentUsername) return true;
    } catch (e) {}
    return false;
  });

  const shared = (savedScenarios || []).filter(s => {
    // Only server-saved scenarios can be shared
    if (!s.serverId) return false;
    try {
      const ownerId = s.owner && s.owner.id ? s.owner.id : null;
      const ownerUsername = s.owner && (s.owner.username || s.owner.name) ? (s.owner.username || s.owner.name) : (s.owner_name || null);
      // If we cannot determine an owner, treat as not-shared
      if (!ownerId && !ownerUsername) return false;
      if (ownerId && currentUserId && ownerId === currentUserId) return false;
      if (ownerUsername && currentUsername && ownerUsername === currentUsername) return false;
      // Otherwise it's a shared scenario from another user
      return true;
    } catch (e) { return false; }
  });

  return (
    <div className="p-4 md:p-8" ref={effectiveChartRef}>
      <h2 className="text-3xl font-bold text-gray-900 mb-6 border-b pb-2">Scenario Modeling: MRR Retention</h2>
      {(!enhancedCustomers || enhancedCustomers.length === 0) ? (<NoDataMessage />) : (
        <div className="bg-white p-6 shadow-xl rounded-xl border border-blue-100 mb-8">
          <h3 className="text-xl font-extrabold text-blue-800 mb-4 flex items-center"><svg className="w-6 h-6 mr-2 text-blue-500" /* icon */></svg>Forecasted MRR Savings</h3>

            <div className="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Target Risk Level</label>
                <select
                  aria-label="Target risk level selector"
                  value={whatIfData.selectedRiskLevel}
                  onChange={(e) => setWhatIfData({ ...whatIfData, selectedRiskLevel: e.target.value })}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 bg-gray-50"
                >
                  <option value="All">All Customers</option>
                  <option value="High">High Risk Only (Score ≥ 70)</option>
                  <option value="Medium">Medium Risk Only (Score 40-69)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Scenarios</label>
                <div id="senarios" data-testid="senarios" className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3" role="region" aria-labelledby="senarios-heading">
                  <h4 id="senarios-heading" className="sr-only">Scenarios panels</h4>
                  <div className="p-3 bg-gray-50 rounded border flex flex-col h-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">My Scenarios</div>
                    </div>
                    <div className="mb-2 flex items-center space-x-2">
                      <input aria-label="Scenario name" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="Name scenario (optional)" className="flex-1 p-2 rounded border bg-white text-sm" />
                      <button aria-label="Save scenario" onClick={saveScenario} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-300">Save</button>
                      <button aria-label="Export scenario CSV" onClick={exportScenarioCsv} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-300">Export CSV</button>
                      <button aria-label="Generate summary" onClick={generateSummary} className="px-2 py-0.5 bg-gray-100 text-gray-800 rounded text-xs hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300">Summary</button>
                    </div>
                    <div className="mt-1 max-h-40 overflow-auto border rounded bg-white p-2 flex-1">
                      {myScenarios.length === 0 ? <div className="text-xs text-gray-500">No saved scenarios</div> : (
                        myScenarios.map(s => (
                          <div key={s.id} data-scenario-id={s.id} className={`flex items-center justify-between p-1 rounded transition-all duration-300 ${selectedScenarioId === s.id ? 'bg-indigo-50 border border-indigo-100' : ''} ${justSavedId === s.id ? 'ring-2 ring-indigo-300 bg-indigo-100 animate-pulse' : ''}`}>
                            <div className="text-left text-sm text-gray-800 truncate flex items-center space-x-2">
                              <span>{s.name}</span>
                              {newBadgeIds && newBadgeIds.includes(s.id) && (<span className="text-xs bg-indigo-600 text-white px-1 rounded">New</span>)}
                            </div>
                            <div className="flex items-center space-x-2">
                              <button aria-label={`Load scenario ${s.name}`} title="Load" onClick={() => loadScenario(s)} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-300">Load</button>

                              <div className="mt-3 flex items-center space-x-2">
                                <button aria-label="Export scenario JSON" onClick={() => {
                                  try {
                                    const payload = { meta: { generatedAt: new Date().toISOString(), name: scenarioName || null }, data: whatIfData, results: simulationResults };
                                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a'); a.href = url; a.download = 'scenario.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                                    (showToast || showCustomModal)('Scenario JSON exported.', 'success');
                                  } catch (e) { (showToast || showCustomModal)('Failed to export JSON.', 'error'); }
                                }} className="px-2 py-0.5 bg-gray-100 text-gray-800 rounded text-xs hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300">Export JSON</button>

                                <label className="px-2 py-0.5 bg-gray-50 rounded text-xs cursor-pointer text-blue-700 hover:bg-blue-50 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-200">
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
                                }} className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-yellow-300">Restore Draft</button>
                              </div>

                              <button aria-label={`Share scenario ${s.name}`} title="Share" onClick={async () => {
                                try {
                                  const meUser = await auth.me();
                                  if (!meUser) { (showToast || showCustomModal)('Sign in to share scenarios', 'info'); return; }

                                  // If already server-saved, toggle visibility public and copy link
                                  if (s.serverId) {
                                    try {
                                      const resp = await auth.apiFetch(`/api/dashboards/${s.serverId}/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility: 'public' }) });
                                      if (!resp.ok) { (showToast || showCustomModal)('Failed to make scenario public', 'error'); return; }
                                      const updated = await resp.json().catch(() => null);
                                      const slug = (updated && updated.slug) || (s.name && s.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')) || `scenario-${s.id}`;
                                      const shareUrl = `${window.location.origin}/share/${slug}`;
                                      try { await navigator.clipboard.writeText(shareUrl); } catch (e) { /* ignore */ }
                                      (showToast || showCustomModal)('Share link copied to clipboard', 'success');
                                    } catch (e) { console.error('Share failed', e); (showToast || showCustomModal)('Share failed (see console)', 'error'); }
                                    return;
                                  }

                                  // For local-only scenario: create on server, then make public and copy link
                                  const payloadToServer = { name: s.name || `Scenario ${new Date().toLocaleString()}`, config: { data: s.data || s } };
                                  const createResp = await auth.apiFetch('/api/dashboards/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadToServer) });
                                  if (!createResp.ok) {
                                    if (createResp.status === 401 || createResp.status === 403) {
                                      (showToast || showCustomModal)('Authentication required to share scenarios. Please sign in and try again.', 'info');
                                    } else {
                                      (showToast || showCustomModal)(`Failed to save to server (${createResp.status}).`, 'error');
                                    }
                                    return;
                                  }
                                  const created = await createResp.json().catch(() => null);
                                  const serverId = created && created.id;
                                  // make public
                                  let slug = null;
                                  if (serverId) {
                                    try {
                                      const patchResp = await auth.apiFetch(`/api/dashboards/${serverId}/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility: 'public' }) });
                                      if (patchResp.ok) {
                                        const patched = await patchResp.json().catch(() => null);
                                        slug = patched && patched.slug;
                                      }
                                    } catch (e) { console.error('visibility patch failed', e); }
                                  }
                                  slug = slug || (s.name && s.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')) || `scenario-${serverId || Date.now()}`;
                                  const shareUrl = `${window.location.origin}/share/${slug}`;
                                  try { await navigator.clipboard.writeText(shareUrl); } catch (e) { /* ignore */ }
                                  (showToast || showCustomModal)('Share link copied to clipboard', 'success');
                                } catch (e) { console.error('Share flow failed', e); (showToast || showCustomModal)('Share failed (see console)', 'error'); }
                              }} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-200">Share</button>

                              <button aria-label={`Delete scenario ${s.name}`} title="Delete" onClick={() => deleteScenario(s.id)} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-200">Delete</button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-gray-50 rounded border flex flex-col h-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">Shared Scenarios</div>
                    </div>
                    <div className="mt-1 max-h-40 overflow-auto border rounded bg-white p-2 flex-1">
                      {shared.length === 0 ? <div className="text-xs text-gray-500">No shared scenarios</div> : (
                        shared.map(s => (
                          <div key={s.id} data-scenario-id={s.id} className={`flex items-center justify-between p-1 rounded transition-all duration-300 ${selectedScenarioId === s.id ? 'bg-indigo-50 border border-indigo-100' : ''} ${justSavedId === s.id ? 'ring-2 ring-indigo-300 bg-indigo-100 animate-pulse' : ''}`}>
                            <div className="text-left text-sm text-gray-800 truncate">
                              <div className="flex items-center space-x-2">
                                <span>{s.name}</span>
                                {newBadgeIds && newBadgeIds.includes(s.id) && (<span className="text-xs bg-indigo-600 text-white px-1 rounded">New</span>)}
                              </div>
                              {s.owner_name && <div className="text-xs text-gray-500">Shared by {s.owner_name}</div>}
                            </div>
                            <div className="flex items-center space-x-2">
                              <button aria-label={`Load scenario ${s.name}`} title="Load" onClick={() => loadScenario(s)} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Load</button>
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs" title="This scenario was created by another user and is read-only in your account">Read-only</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
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
            {scenarioSummary && (<div className="mt-4 p-3 bg-gray-50 rounded border text-sm text-gray-700">{scenarioSummary}</div>)}
            {/* Compact churn preview (summary only) */}
            <div className="mt-6">
              <ChurnPreview customers={enhancedCustomers} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.forwardRef(WhatIfSimulation);
