import React, { useState } from 'react';

const DebugHelpers = () => {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState(null);

  const load = () => {
    try {
      const raw = localStorage.getItem('jarvis_last_server_response');
      if (!raw) { setPayload('No snapshot found in localStorage.jarvis_last_server_response'); setOpen(true); return; }
      try { setPayload(JSON.parse(raw)); } catch (e) { setPayload(raw); }
      setOpen(true);
    } catch (e) { setPayload(`Failed to read snapshot: ${String(e)}`); setOpen(true); }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="flex items-center space-x-2">
        <button onClick={load} className="px-2 py-1 bg-gray-800 text-white rounded text-xs">Debug</button>
      </div>
      {open && (
        <div className="mt-2 max-w-sm w-96 bg-white p-3 rounded shadow-lg border">
          <div className="flex justify-between items-center mb-2">
            <div className="font-medium text-sm">Last server response</div>
            <button onClick={() => setOpen(false)} className="text-xs text-gray-500">Close</button>
          </div>
          <pre className="text-xs max-h-64 overflow-auto bg-gray-50 p-2 rounded">{typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default DebugHelpers;
