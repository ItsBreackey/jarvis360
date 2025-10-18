import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import auth from '../utils/auth';

const RegisterPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate(); 
  const [redirect, setRedirect] = useState(false);

  const doRegister = async (e) => {
    e && e.preventDefault();
    setLoading(true); setError(null);
    try {
  await auth.register({ username, password, email, org_name: orgName || username, set_cookie: true });
      try {
        const meAfter = await auth.me();
        console.debug('auth.me() after register ->', meAfter);
      } catch (e) { console.debug('me() check after register failed', e); }
      window.dispatchEvent(new Event('jarvis:auth-changed'));
      try { navigate('/dashboard/home', { replace: true }); } catch (e) {}
      setRedirect(true);
    } catch (err) {
      console.error('Register failed', err);
      setError(err && err.message ? String(err.message) : 'Registration failed.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const u = await auth.me();
      if (!mounted) return;
      if (u) navigate('/dashboard/home', { replace: true });
    })();
    return () => { mounted = false; };
  }, [navigate]);

  if (redirect) return <Navigate to="/dashboard/home" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">
        <aside className="hidden md:flex flex-col justify-center bg-white p-8 rounded-xl shadow">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Welcome to jArvIs360</h1>
          <p className="text-gray-700 mb-4">Start analyzing churn and forecasting revenue. Create an organization and invite teammates to collaborate.</p>
          <div className="text-sm text-gray-600">
            <strong>Pro tips:</strong>
            <ul className="list-disc ml-5 mt-2">
              <li>Use clear header names in CSVs (date, MRR).</li>
              <li>Invite teammates to share dashboards (coming soon).</li>
            </ul>
          </div>
        </aside>

        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="text-2xl font-bold mb-4">Create an account</h2>
          <form onSubmit={doRegister} className="space-y-3">
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="organization (optional)" className="w-full p-2 border rounded" />
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" className="w-full p-2 border rounded" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" type="email" className="w-full p-2 border rounded" />
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" className="w-full p-2 border rounded pr-10" />
              <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 focus:outline-none">
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-4.97 0-9.27-3.11-11-7 1.06-2.5 2.86-4.58 5.06-5.94"/><path d="M1 1l22 22"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex items-center justify-between">
              <button type="submit" disabled={loading} className="px-4 py-2 bg-[#BFA5FF] hover:bg-[#FFADDF] text-white rounded">{loading ? 'Creating...' : 'Create account'}</button>
              <button type="button" onClick={() => navigate('/login')} className="text-sm text-indigo-700">Have an account?</button>
            </div>
          </form>
          <div className="mt-4 text-xs text-gray-500">Accounts are created with an HttpOnly cookie for session auth.</div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
