import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import auth from '../utils/auth';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [uid, setUid] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const u = searchParams.get('uid');
    const t = searchParams.get('token');
    if (u) setUid(u);
    if (t) setToken(t);
  }, [searchParams]);

  const submit = async (e) => {
    e && e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const resp = await auth.apiFetch('/api/password-reset/confirm/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, token, new_password: newPassword }),
      });
      if (resp.ok) {
        setStatus('Password reset. You may now sign in.');
        setTimeout(() => navigate('/login'), 1400);
      } else {
        const body = await resp.json().catch(() => null);
        setStatus((body && (body.error || body.detail)) || 'Reset failed');
      }
    } catch (err) {
      setStatus('Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">
        <aside className="hidden md:flex flex-col justify-center bg-white p-8 rounded-xl shadow">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Set a new password</h1>
          <p className="text-gray-700">Choose a strong password. You'll be redirected to sign in after resetting your password.</p>
        </aside>

        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="text-2xl font-bold mb-4">Set a new password</h2>
          <form onSubmit={submit} className="space-y-3">
            <div className="relative">
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                type={showPassword ? 'text' : 'password'}
                className="w-full p-2 border rounded pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 focus:outline-none"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-4.97 0-9.27-3.11-11-7 1.06-2.5 2.86-4.58 5.06-5.94" />
                    <path d="M1 1l22 22" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {status && <div className="text-sm text-gray-700">{status}</div>}

            <div className="flex items-center justify-between">
              <button type="submit" disabled={loading} className="px-4 py-2 bg-[#BFA5FF] hover:bg-[#FFADDF] text-white rounded">
                {loading ? 'Setting...' : 'Set password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
