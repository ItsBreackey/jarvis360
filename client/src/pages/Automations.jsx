import React, { useEffect, useState } from 'react';

const Automations = () => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nl, setNl] = useState('');
  const [name, setName] = useState('');

  const fetchList = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/automations/');
      const j = await r.json();
      setList(j || []);
    } catch (e) {
      console.error('fetch automations failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const handleCreate = async () => {
    try {
      const payload = { name: name || (nl.slice(0,40) || 'Automation'), natural_language: nl };
      const r = await fetch('/api/automations/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.ok) {
        setNl(''); setName(''); fetchList();
      } else {
        const txt = await r.text(); alert('Create failed: ' + txt);
      }
    } catch (e) { alert('Create error: ' + String(e)); }
  };

  const handleRun = async (id) => {
    try {
      const r = await fetch(`/api/automations/${id}/run/`, { method: 'POST' });
      if (r.ok) {
        alert('Run started');
      } else {
        const txt = await r.text(); alert('Run failed: ' + txt);
      }
    } catch (e) { alert('Run error: ' + String(e)); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Automations</h1>
      <p className="text-sm text-gray-600 mb-4">Create automations using natural language. This is an MVP — actions are simulated.</p>

      <div className="mb-4 p-4 border rounded bg-white">
        <input className="w-full mb-2 p-2 border rounded" placeholder="Name (optional)" value={name} onChange={(e)=>setName(e.target.value)} />
        <textarea className="w-full mb-2 p-2 border rounded" rows={3} placeholder="Describe the automation in plain English (e.g. 'Send weekly sales report every Friday')" value={nl} onChange={(e)=>setNl(e.target.value)} />
        <div className="flex space-x-2">
          <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={handleCreate}>Create Automation</button>
          <button className="px-3 py-2 bg-gray-100 rounded" onClick={()=>{ setNl(''); setName(''); }}>Clear</button>
        </div>
      </div>

      <div className="space-y-2">
        {loading && <div>Loading...</div>}
        {list.length === 0 && !loading && <div className="text-gray-500">No automations yet.</div>}
        {list.map(a => (
          <div key={a.id} className="p-3 border rounded bg-white flex justify-between items-center">
            <div>
              <div className="font-semibold">{a.name}</div>
              <div className="text-sm text-gray-600">{a.natural_language}</div>
            </div>
            <div>
              <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={()=>handleRun(a.id)}>Run</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Automations;
