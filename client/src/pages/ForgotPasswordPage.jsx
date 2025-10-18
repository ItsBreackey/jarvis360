import React, { useState } from 'react';
import auth from '../utils/auth';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e && e.preventDefault();
    setLoading(true); setStatus(null);
    try {
      const resp = await auth.apiFetch('/api/password-reset/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      if (resp.ok) {
        const body = await resp.json().catch(() => null);
        // In DEBUG mode the API may return reset_url to facilitate local testing
        if (body && body.reset_url) setStatus(`Reset link (DEBUG): ${body.reset_url}`);
        else setStatus('If an account with that email exists, a reset link has been sent.');
      } else {
        const body = await resp.json().catch(() => null);
        setStatus((body && (body.error || body.detail)) || 'Request failed');
      }
    } catch (e) {
      setStatus('Request failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">
        <aside className="hidden md:flex flex-col justify-center bg-white p-8 rounded-xl shadow">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Reset password</h1>
          <p className="text-gray-700">Enter your account email and we'll send a secure reset link. If you're testing locally the link will be returned in the response in DEBUG mode.</p>
        </aside>

        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="text-2xl font-bold mb-4">Reset your password</h2>
          <form onSubmit={submit} className="space-y-3">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" type="email" className="w-full p-2 border rounded" />
            {status && <div className="text-sm text-gray-700">{status}</div>}
            <div className="flex items-center justify-between">
              <button type="submit" disabled={loading} className="px-4 py-2 bg-[#BFA5FF] hover:bg-[#FFADDF] text-white rounded">{loading ? 'Sending...' : 'Send reset link'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
