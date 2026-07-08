import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../api/types';
import { getToken, setToken } from '../api/client';
import { login as apiLogin, me as apiMe, logout as apiLogout } from '../api/endpoints';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    apiMe()
      .then(setUser)
      .catch(() => { setToken(null); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      const result = await apiLogin(email, password);
      setUser(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка входа');
      throw e;
    }
  }

  function logout() {
    apiLogout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
