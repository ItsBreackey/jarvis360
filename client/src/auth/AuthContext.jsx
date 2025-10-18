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

  const login = useCallback(async (credentials) => {
    const resp = await auth.login(credentials.username, credentials.password);
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
