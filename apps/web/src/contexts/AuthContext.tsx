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
  baseURL: '/api'
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
  }, []);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      if (!storedToken || !storedUser) {
        clearSession();
        if (active) setIsLoading(false);
        return;
      }

      try {
        JSON.parse(storedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        const response = await api.get('/auth/perfil');
        const currentUser = response.data.usuario as User;
        if (!currentUser?.id || !currentUser?.tipo) throw new Error('Sessão inválida');

        if (active) {
          setToken(storedToken);
          setUser(currentUser);
          localStorage.setItem('user', JSON.stringify(currentUser));
        }
      } catch {
        if (active) clearSession();
      } finally {
        if (active) setIsLoading(false);
      }
    };

    restoreSession();
    return () => { active = false; };
  }, [clearSession]);

  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        const url = String(error.config?.url || '');
        const publicAuthRequest = url.includes('/auth/login') || url.includes('/auth/cadastro');
        if (error.response?.status === 401 && !publicAuthRequest && localStorage.getItem('token')) {
          clearSession();
        }
        return Promise.reject(error);
      },
    );

    return () => api.interceptors.response.eject(interceptor);
  }, [clearSession]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const logout = clearSession;

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
