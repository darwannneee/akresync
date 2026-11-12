import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken, setAuthLostHandler } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    setAuthLostHandler(() => { setAccessToken(null); setUser(null); qc.clear(); });
    return () => setAuthLostHandler(null);
  }, [qc]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (await refreshSession()) {
          const me = await api.get<User>('/auth/me');
          if (alive) setUser(me.data);
        }
      } catch { /* belum masuk */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string; user?: User }>('/auth/login', { email, password });
    setAccessToken(res.data.accessToken);
    const u = res.data.user ?? (await api.get<User>('/auth/me')).data;
    setUser(u);
    return u;
  }, []);

  const signOut = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* tetap keluar */ }
    setAccessToken(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth di luar AuthProvider');
  return c;
}
