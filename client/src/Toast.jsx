import React, { useEffect } from 'react';

export default function Toast({ id, message, type = 'info', duration = 3500, onClose }) {
  useEffect(() => {
    const t = setTimeout(() => onClose && onClose(id), duration);
    return () => clearTimeout(t);
  }, [id, duration, onClose]);

  const base = 'w-full p-3 rounded shadow-lg text-white';
  const colors = {
    info: 'bg-blue-600',
    success: 'bg-green-600',
    error: 'bg-red-600',
    warn: 'bg-yellow-600 text-black'
  };

  return (
    <div className={`${base} ${colors[type] || colors.info}`} role="status" aria-live="polite">
      <div className="flex-1 pr-2">{message}</div>
      <div>
        <button aria-label="Dismiss toast" className="ml-2 px-2 py-1 rounded bg-white/20 text-sm" onClick={() => onClose && onClose(id)}>✕</button>
      </div>
    </div>
  );
}
