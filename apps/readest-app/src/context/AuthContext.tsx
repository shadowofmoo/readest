'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';

interface LocalUser {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
}

interface AuthContextType {
  token: string | null;
  user: LocalUser | null;
  login: (token: string, user: LocalUser) => void;
  logout: () => void;
  refresh: () => void;
}

const LOCAL_USER: LocalUser = {
  id: 'local-user',
  email: 'local@readest',
  user_metadata: { full_name: 'Local User' },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const value = useMemo<AuthContextType>(
    () => ({
      token: 'local-token',
      user: LOCAL_USER,
      login: () => {},
      logout: () => {},
      refresh: () => {},
    }),
    [],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
