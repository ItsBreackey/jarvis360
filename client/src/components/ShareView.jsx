import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import auth from '../utils/auth';
import { generateScenarioSummary } from '../utils/summarizer';
import { readSavedScenarios, mergeAndPersistScenarios, persistScenarios } from '../utils/scenarioPersistence';

const humanDate = (iso) => {
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso || ''; }
};

const ShareView = ({ showToast }) => {
  const { slug: paramSlug } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const slug = paramSlug || (window.location.pathname.split('/')[2] || window.location.pathname.split('/')[1]);
    if (!slug) { setError('Missing slug'); setLoading(false); return; }
    (async () => {
      try {
        const resp = await fetch(`/api/dashboards/slug/${encodeURIComponent(slug)}/`);
        if (!resp.ok) {
          setError('Shared scenario not found');
          setLoading(false);
          return;
        }
        const json = await resp.json();
        setDashboard(json);
        // Auto-persist the shared scenario into local saved scenarios so
        // visiting the share link will make it available immediately in the app.
          try {
            const mapped = {
              id: json && json.id ? `srv-${json.id}` : `imp-${slug}`,
              serverId: json && json.id ? json.id : null,
              name: json && json.name ? json.name : `Shared: ${slug}`,
              createdAt: (json && (json.created_at || json.createdAt)) || new Date().toISOString(),
              data: (json && json.config && (json.config.data || json.config)) || (json && json.config) || {},
            };
            // use merge helper so we don't stomp optimistic inserts from running app
            try { mergeAndPersistScenarios([mapped], 'shareview-autopersist'); } catch (e) { const existing = readSavedScenarios(); const combined = [mapped].concat(existing || []).slice(0,50); persistScenarios(combined); }
            // Set autoload marker so the app will automatically select this scenario.
            try { localStorage.setItem('jarvis_autoload_scenario', mapped.id); } catch (e) { /* ignore */ }
            // Also dispatch a window event so the running app can react immediately
            try { window.dispatchEvent(new CustomEvent('jarvis:shared-scenario', { detail: { id: mapped.id } })); } catch (e) { /* ignore */ }
          } catch (e) { console.error('auto-persist shared scenario failed', e); }
      } catch (e) {
        console.error('Share fetch failed', e);
        setError('Failed to fetch shared scenario');
      } finally { setLoading(false); }
    })();
  }, [paramSlug]);

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast && showToast('Share link copied to clipboard', 'success');
    } catch (e) {
      console.error('copy failed', e);
      showToast && showToast('Failed to copy link', 'error');
    }
  };

  const saveToMyScenarios = async () => {
    if (!dashboard) return;
    setSaving(true);
    try {
      const me = await auth.me();
      if (!me) {
        showToast && showToast('Sign in to import this scenario', 'info');
        // redirect to login with return
        try { sessionStorage.setItem('jarvis_return_to', window.location.pathname + window.location.search); } catch (e) {}
        navigate('/login', { state: { returnTo: window.location.pathname + window.location.search } });
        return;
      }

      const payload = { name: dashboard.name || `Imported ${new Date().toLocaleString()}`, config: dashboard.config || {} };
      const resp = await auth.apiFetch('/api/dashboards/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!resp.ok) {
        let body = null;
        try { body = await resp.json(); } catch (e) { try { body = await resp.text(); } catch (ee) { body = null; } }
        console.error('Import failed', resp.status, body);
        if (resp.status === 401 || resp.status === 403) {
          showToast && showToast('Authentication required to import. Please sign in and try again.', 'info');
        } else {
          showToast && showToast(`Failed to import (${resp.status}): ${body ? (typeof body === 'string' ? body : JSON.stringify(body)) : 'no details'}`, 'error');
        }
        setSaving(false);
        return;
      }
      const created = await resp.json().catch(() => null);

      // persist a local saved-scenarios entry so the Scenarios tab shows it immediately when opened
        try {
          const mapped = {
            id: created && created.id ? `srv-${created.id}` : `srv-${Date.now()}`,
            serverId: created && created.id ? created.id : null,
            name: created && created.name ? created.name : payload.name,
            createdAt: (created && (created.created_at || created.createdAt)) || new Date().toISOString(),
            data: (created && created.config && (created.config.data || created.config)) || (payload.config || {}),
          };
          try { mergeAndPersistScenarios([mapped], 'shareview-import'); } catch (e) { const existing = readSavedScenarios(); const combined = [mapped].concat(existing || []).slice(0,50); persistScenarios(combined); }
      } catch (e) { console.error('local persist failed', e); }

      showToast && showToast('Scenario saved to your dashboards', 'success');
      // navigate back to app home — user can open Scenarios tab
      navigate('/');
    } catch (e) {
      console.error('import failed', e);
      showToast && showToast('Import failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8">Loading shared scenario...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;

  // Friendly summary text when config contains simulation data
  const cfg = dashboard && dashboard.config ? dashboard.config : null;
  const results = cfg && cfg.results ? cfg.results : null;
  const data = cfg && (cfg.data || cfg) ? (cfg.data || cfg) : null;
  const summary = generateScenarioSummary ? generateScenarioSummary(results, data) : '';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">{dashboard.name}</h2>
            <div className="text-sm text-gray-600 mb-2">{dashboard.description || dashboard.summary || ''}</div>
            <div className="text-xs text-gray-500">Shared by <strong>{(dashboard.owner && (dashboard.owner.username || dashboard.owner)) || dashboard.created_by || dashboard.owner_name || 'anonymous'}</strong> • {humanDate(dashboard.created_at || dashboard.createdAt)}</div>
          </div>
          <div className="flex items-center space-x-2">
            <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={copyShareLink}>Copy link</button>
            <button className={`px-3 py-1 ${saving ? 'bg-gray-300 text-gray-700' : 'bg-green-600 text-white'} rounded`} onClick={saveToMyScenarios} disabled={saving}>{saving ? 'Saving...' : 'Save to my scenarios'}</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-gray-50 p-4 rounded">
            {summary ? (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Quick summary</h3>
                <p className="text-sm text-gray-800">{summary}</p>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Scenario Preview</h3>
                <pre className="text-xs bg-white p-3 rounded border overflow-auto" style={{ maxHeight: 260, whiteSpace: 'pre-wrap' }}>{JSON.stringify(dashboard.config || {}, null, 2)}</pre>
              </div>
            )}
          </div>

          <aside className="bg-white p-4 rounded border">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Metadata</h4>
            <div className="text-xs text-gray-600 mb-2"><strong>Name:</strong> {dashboard.name}</div>
            <div className="text-xs text-gray-600 mb-2"><strong>Owner:</strong> {(dashboard.owner && (dashboard.owner.username || dashboard.owner)) || dashboard.created_by || dashboard.owner_name || 'anonymous'}</div>
            <div className="text-xs text-gray-600 mb-2"><strong>Created:</strong> {humanDate(dashboard.created_at || dashboard.createdAt)}</div>
            <div className="text-xs text-gray-600 mb-2"><strong>Visibility:</strong> {dashboard.visibility || 'public'}</div>
            <div className="mt-3">
              <a className="text-xs text-blue-600" href="/">Back to app</a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ShareView;
