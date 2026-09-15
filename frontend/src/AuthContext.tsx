import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, type CurrentUser } from './api';

type AuthState = {
  user: CurrentUser | null;
  loading: boolean;
  /** admin or contributor — viewer is read-only everywhere. Mirrors the backend's own gate in index.php. */
  canWrite: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const loggedIn = await authApi.login(username, password);
    setUser(loggedIn);
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const value: AuthState = {
    user,
    loading,
    canWrite: user?.role === 'admin' || user?.role === 'contributor',
    isAdmin: user?.role === 'admin',
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>');
  return ctx;
}
