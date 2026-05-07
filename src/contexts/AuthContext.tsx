import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, Session } from '../services/authService';
import { api } from '../services/apiClient';

interface AuthContextType {
  user: Session | null;
  loading: boolean;
  login: (session: Session) => void;
  logout: () => Promise<void>;
  updateUser: (session: Session) => void;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // 先尝试从本地获取（优化体验）
        const localSession = authService.getSession();
        if (localSession) {
          setUser(localSession);
        }
        
        // 异步从远端获取/校验会话
        const remoteSession = await authService.fetchSession();
        if (remoteSession) {
          setUser(remoteSession);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Failed to restore session:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = (session: Session) => {
    setUser(session);
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  const deleteAccount = async () => {
    await authService.deleteAccount();
    setUser(null);
  };

  const updateUser = (session: Session) => {
    setUser(session);
    authService.setSession(session);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
