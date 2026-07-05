import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import type { User } from '../types';
import { sessionsApi } from '../api';

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isAdmin: boolean;
  isRep: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = 'vm_session_id';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutos

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cargar usuario guardado al iniciar
  useEffect(() => {
    const stored = localStorage.getItem('vm_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('vm_user');
      }
    }
  }, []);

  // Heartbeat: cada 5 min actualizar sesión activa
  useEffect(() => {
    if (!user?.rep_id) return;
    const sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) return;

    heartbeatRef.current = setInterval(() => {
      sessionsApi.heartbeat(parseInt(sessionId)).catch(() => {});
    }, HEARTBEAT_INTERVAL);

    // También enviar heartbeat al volver a la pestaña
    const handleVisibility = () => {
      if (!document.hidden) {
        const sid = localStorage.getItem(SESSION_KEY);
        if (sid) sessionsApi.heartbeat(parseInt(sid)).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.rep_id]);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('vm_user', JSON.stringify(userData));
    // Iniciar sesión de tracking solo para reps
    if (userData.rep_id) {
      sessionsApi.start(userData.rep_id)
        .then(res => {
          if (res.session_id) localStorage.setItem(SESSION_KEY, String(res.session_id));
        })
        .catch(() => {});
    }
  };

  const logout = () => {
    // Cerrar sesión de tracking
    const sessionId = localStorage.getItem(SESSION_KEY);
    if (sessionId) {
      sessionsApi.end(parseInt(sessionId)).catch(() => {});
      localStorage.removeItem(SESSION_KEY);
    }
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    setUser(null);
    localStorage.removeItem('vm_user');
  };

  const isAdmin = user?.role === 'admin';
  const isRep = user?.role === 'rep';

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, isRep }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
