import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import auth from '../utils/auth';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [redirect, setRedirect] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const doLogin = async (e) => {
    e && e.preventDefault();
    setLoading(true); setError(null);
    try {
      await auth.login({ username, password, use_cookie: true });
      // debug: log me() after login to verify cookie visibility
      try {
        const meAfter = await auth.me();
        console.debug('auth.me() after login ->', meAfter);
      } catch (e) { console.debug('me() check after login failed', e); }
      // notify app and redirect to the return target (if provided) or dashboard
      window.dispatchEvent(new Event('jarvis:auth-changed'));
      // determine return target: prefer state.returnTo, then sessionStorage, else dashboard
      let returnTo = null;
      try {
        const st = window.history && window.history.state && window.history.state && window.history.state.usr ? window.history.state.usr : null;
        // prefer navigation state (React Router passes state in location.state but we can't access it here easily)
        // fallback to sessionStorage set by ShareView
        returnTo = (st && st.returnTo) || sessionStorage.getItem('jarvis_return_to') || null;
      } catch (e) { returnTo = null; }
      try { if (returnTo) { sessionStorage.removeItem('jarvis_return_to'); navigate(returnTo, { replace: true }); } else { navigate('/dashboard/home', { replace: true }); } } catch (e) { /* ignore */ }
      setRedirect(true);
    } catch (err) {
      console.error('Login failed', err);
      setError(err && err.message ? String(err.message) : 'Login failed. Check credentials.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const u = await auth.me();
      if (!mounted) return;
      if (u) {
        // if a return target was stored (share link -> login), honor it
        const returnTo = sessionStorage.getItem('jarvis_return_to');
        try { if (returnTo) { sessionStorage.removeItem('jarvis_return_to'); navigate(returnTo, { replace: true }); return; } } catch (e) {}
        navigate('/dashboard/home', { replace: true });
      }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  if (redirect) return <Navigate to="/dashboard/home" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">
        <aside className="hidden md:flex flex-col justify-center bg-white p-8 rounded-xl shadow">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Welcome to jArvIs360</h1>
          <p className="text-gray-700 mb-4">A lightweight SaaS for customer churn analysis and MRR forecasting. Upload CSVs, explore churn drivers, and surface actionable retention opportunities.</p>
          <ul className="text-sm text-gray-600 space-y-2">
            <li>• Upload CSV data and preview mappings</li>
            <li>• Forecast MRR and simulate scenarios</li>
            <li>• Visualize churn drivers and export charts</li>
          </ul>
        </aside>

        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="text-2xl font-bold mb-4">Sign in to jArvIs360</h2>
          <form onSubmit={doLogin} className="space-y-3">
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" className="w-full p-2 border rounded" />
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" className="w-full p-2 border rounded pr-10" />
              <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 focus:outline-none">
                {showPassword ? (
                  // eye-off icon
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-4.97 0-9.27-3.11-11-7 1.06-2.5 2.86-4.58 5.06-5.94"/><path d="M1 1l22 22"/></svg>
                ) : (
                  // eye icon
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            <div className="text-sm"><a href="/forgot-password" className="text-indigo-700">Forgot password?</a></div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex items-center justify-between">
              <button type="submit" disabled={loading} className="px-4 py-2 bg-[#BFA5FF] hover:bg-[#FFADDF] text-white rounded">{loading ? 'Signing in...' : 'Sign in'}</button>
              <button type="button" onClick={() => navigate('/register')} className="text-sm text-indigo-700">Create account</button>
            </div>
          </form>
          <div className="mt-4 text-xs text-gray-500">You will be redirected to the dashboard after signing in.</div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
