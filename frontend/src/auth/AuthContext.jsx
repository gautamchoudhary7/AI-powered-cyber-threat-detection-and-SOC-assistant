import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { changePassword as changePasswordRequest, getMe, loginUser, registerUser, setToken, setUnauthorizedHandler, updateProfile as updateProfileRequest } from '../api/client.js';

// The token is kept in sessionStorage: it survives a page refresh but disappears when the tab is closed.
// (Any browser storage can be read by injected scripts, so this app must never render untrusted HTML.)
const KEY = 'soc_token';
const store = {
  read() {
    try {
      return window.sessionStorage.getItem(KEY);
    } catch {
      return null; // storage can be blocked (private windows); the app still works without it
    }
  },
  write(value) {
    try {
      window.sessionStorage.setItem(KEY, value);
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(store.read()));

  const logout = useCallback(() => {
    store.clear();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // On first load, check that a saved token is still valid.
  useEffect(() => {
    const saved = store.read();
    if (!saved) {
      setLoading(false);
      return undefined;
    }
    setToken(saved);
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch((err) => {
        // Only a 401 means the token is bad. If the server is just down, keep the token for the next refresh.
        if (err?.response?.status === 401) logout();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [logout]);

  const accept = useCallback((data) => {
    store.write(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async (email, password) => accept(await loginUser({ email, password })), [accept]);
  const register = useCallback(async (name, email, password) => accept(await registerUser({ name, email, password })), [accept]);

  const updateProfile = useCallback(async (name) => {
    const updated = await updateProfileRequest(name);
    setUser(updated);
    return updated;
  }, []);
  // The server signs out every other session and returns a fresh token for this one.
  const changePassword = useCallback(async (currentPassword, newPassword) => accept(await changePasswordRequest(currentPassword, newPassword)), [accept]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateProfile, changePassword }),
    [user, loading, login, register, logout, updateProfile, changePassword]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
