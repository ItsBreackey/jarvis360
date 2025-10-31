import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import auth from '../utils/auth';

const AuthContext = createContext({ user: null, loading: true, refresh: async () => {}, login: async () => {}, logout: async () => {} });

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const u = await auth.me();
      setUser(u || null);
      return u;
    } catch (e) {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Listen for global auth-changed events so other parts of the app (or the
  // low-level auth helper) can notify this provider when login/logout occurs.
  // Some code dispatches a CustomEvent with detail:{user}, other places may
  // dispatch a plain Event — handle both cases.
  useEffect(() => {
    const handler = (ev) => {
      try {
        const userFromDetail = ev && ev.detail && Object.prototype.hasOwnProperty.call(ev.detail, 'user') ? ev.detail.user : undefined;
        if (typeof userFromDetail !== 'undefined') {
          setUser(userFromDetail || null);
          setLoading(false);
        } else {
          // fallback: re-run a full refresh which calls /api/me
          refresh();
        }
      } catch (e) {
        // ignore handler errors
        refresh();
      }
    };
    window.addEventListener('jarvis:auth-changed', handler);
    return () => { window.removeEventListener('jarvis:auth-changed', handler); };
  }, [refresh]);

  const login = useCallback(async (credentials) => {
    // auth.login expects an object { username, password, use_cookie }
    const resp = await auth.login(credentials);
    // after login, refresh
    await refresh();
    return resp;
  }, [refresh]);

  const logout = useCallback(async () => {
    await auth.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
