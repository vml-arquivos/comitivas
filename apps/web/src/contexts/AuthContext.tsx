import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  nome: string;
  tipo: 'cliente' | 'vendedor' | 'admin';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    delete api.defaults.headers.common['Authorization'];
    void api.post('/auth/logout').catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        const response = await api.get('/auth/perfil');
        const currentUser = response.data.usuario as User;
        if (!currentUser?.id || !currentUser?.tipo) throw new Error('Sessão inválida');
        if (active) setUser(currentUser);
      } catch {
        if (active) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
          setToken(null);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    restoreSession();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        const url = String(error.config?.url || '');
        const publicAuthRequest = url.includes('/auth/login') || url.includes('/auth/cadastro') || url.includes('/auth/logout');
        if (error.response?.status === 401 && !publicAuthRequest) clearSession();
        return Promise.reject(error);
      },
    );
    return () => api.interceptors.response.eject(interceptor);
  }, [clearSession]);

  const login = (_newToken: string, newUser: User) => {
    setToken(null);
    setUser(newUser);
    delete api.defaults.headers.common['Authorization'];
  };

  const logout = clearSession;

  return <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
