import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UCUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  token: string;
}

interface AuthContextValue {
  user: UCUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  logout: async () => {},
});

const TOKEN_KEY = 'uc_auth_token';
const USER_KEY = 'uc_auth_user';

const getBase = () =>
  process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : 'http://localhost:8080';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UCUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch(`${getBase()}/api/uc/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as { token?: string; user?: UCUser; error?: string };
      if (!res.ok || data.error) return { success: false, error: data.error || 'Login failed' };
      const u = data.user!;
      await AsyncStorage.setItem(TOKEN_KEY, data.token!);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
      setToken(data.token!);
      setUser(u);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const register = async (d: RegisterData) => {
    try {
      const res = await fetch(`${getBase()}/api/uc/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      const data = await res.json() as { token?: string; user?: UCUser; error?: string };
      if (!res.ok || data.error) return { success: false, error: data.error || 'Registration failed' };
      await AsyncStorage.setItem(TOKEN_KEY, data.token!);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user!));
      setToken(data.token!);
      setUser(data.user!);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
