import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { readSavedScenarios, mergeAndPersistScenarios, persistScenarios } from '../utils/scenarioPersistence';

const humanDate = (iso) => {
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso || ''; }
};

const ReadOnlyScenarioView = ({ showToast }) => {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const resp = await fetch(`/api/dashboards/slug/${encodeURIComponent(slug)}/`);
        if (!resp.ok) { setError('Not found'); setLoading(false); return; }
        const json = await resp.json();
        setDashboard(json);
        setLoading(false);
        // Persist into local scenarios for autoload behavior
        try {
          const mapped = {
            id: json && json.id ? `srv-${json.id}` : `imp-${slug}`,
            serverId: json && json.id ? json.id : null,
            name: json && json.name ? json.name : `Shared: ${slug}`,
            createdAt: (json && (json.created_at || json.createdAt)) || new Date().toISOString(),
            data: (json && json.config && (json.config.data || json.config)) || (json && json.config) || {},
          };
          try { mergeAndPersistScenarios([mapped], 'readonly-autopersist'); } catch (e) { const existing = readSavedScenarios(); const combined = [mapped].concat(existing || []).slice(0,50); persistScenarios(combined); }
          try { localStorage.setItem('jarvis_autoload_scenario', mapped.id); } catch (e) {}
          try { window.dispatchEvent(new CustomEvent('jarvis:shared-scenario', { detail: { id: mapped.id } })); } catch (e) {}
        } catch (e) { /* ignore */ }
      } catch (e) {
        setError('Failed to load');
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;

  const cfg = dashboard && dashboard.config ? dashboard.config : null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">{dashboard.name}</h2>
            <div className="text-sm text-gray-600 mb-2">{dashboard.description || ''}</div>
            <div className="text-xs text-gray-500">Shared by <strong>{(dashboard.owner && (dashboard.owner.username || dashboard.owner)) || dashboard.created_by || dashboard.owner_name || 'anonymous'}</strong> • {humanDate(dashboard.created_at || dashboard.createdAt)}</div>
          </div>
          <div className="flex items-center space-x-2">
            <a className="px-3 py-1 bg-blue-600 text-white rounded" href="/">Open App</a>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-gray-50 p-4 rounded">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Scenario Preview</h3>
            <pre className="text-xs bg-white p-3 rounded border overflow-auto" style={{ maxHeight: 360, whiteSpace: 'pre-wrap' }}>{JSON.stringify(cfg || {}, null, 2)}</pre>
          </div>

          <aside className="bg-white p-4 rounded border">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Metadata</h4>
            <div className="text-xs text-gray-600 mb-2"><strong>Name:</strong> {dashboard.name}</div>
            <div className="text-xs text-gray-600 mb-2"><strong>Owner:</strong> {(dashboard.owner && (dashboard.owner.username || dashboard.owner)) || dashboard.created_by || dashboard.owner_name || 'anonymous'}</div>
            <div className="text-xs text-gray-600 mb-2"><strong>Created:</strong> {humanDate(dashboard.created_at || dashboard.createdAt)}</div>
            <div className="text-xs text-gray-600 mb-2"><strong>Visibility:</strong> {dashboard.visibility || 'public'}</div>
            <div className="mt-3">
              <Link className="text-xs text-blue-600" to="/">Back to app</Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ReadOnlyScenarioView;
