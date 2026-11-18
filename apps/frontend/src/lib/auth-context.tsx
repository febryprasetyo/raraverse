'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createBackendClient, resolveApiBaseUrl } from './api-client';

const TOKEN_STORAGE_KEY = 'ebieshop_admin_token';

interface AuthContextValue {
  token: string | null;
  isReady: boolean;
  login: (newToken: string) => void;
  logout: () => void;
  client: ReturnType<typeof createBackendClient> | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      if (saved) {
        setToken(saved);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    } finally {
      setIsReady(true);
    }
  }, []);

  const login = useCallback((newToken: string) => {
    const trimmed = newToken.trim();
    if (!trimmed) return;
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
    } catch {
      // Ignore storage errors
    }
    setToken(trimmed);
  }, []);

  const logout = useCallback(() => {
    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    setToken(null);
  }, []);

  const client = useMemo(() => {
    if (!token) return null;
    return createBackendClient({
      baseUrl: resolveApiBaseUrl(),
      token,
    });
  }, [token]);

  const value = useMemo(
    () => ({ token, isReady, login, logout, client }),
    [token, isReady, login, logout, client]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
