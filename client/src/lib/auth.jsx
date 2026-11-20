import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { connectSocket, disconnectSocket } from './socket.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [socket, setSocket] = useState(null);

  const endSession = useCallback(() => {
    disconnectSocket();
    setSocket(null);
    setUser(null);
  }, []);

  const startSession = useCallback((u) => {
    setUser(u);
    const s = connectSocket();
    setSocket(s);
    s.on('wallet:balance', ({ coins }) => setUser((p) => (p ? { ...p, coins } : p)));
    s.on('host:profile', (host) => setUser((p) => (p ? { ...p, host: { ...p.host, ...host } } : p)));
    s.on('connect_error', (e) => { if (e.message === 'unauthorized') endSession(); });
    s.on('disconnect', (reason) => { if (reason === 'io server disconnect') api('/me').catch(endSession); });
  }, [endSession]);

  useEffect(() => {
    api('/me').then(startSession).catch(() => {}).finally(() => setReady(true));
  }, [startSession]);

  const login = async (email, password) => {
    const { user: u } = await api('/auth/login', { method: 'POST', body: { email, password } });
    startSession(u);
    return u;
  };
  const register = async (form) => {
    const { user: u } = await api('/auth/register', { method: 'POST', body: form });
    startSession(u);
    return u;
  };
  const adopt = (u) => startSession(u);
  const logout = async (everywhere = false) => {
    await api(everywhere ? '/auth/logout-all' : '/auth/logout', { method: 'POST' }).catch(() => {});
    endSession();
  };
  const refresh = async () => setUser(await api('/me'));

  return <AuthCtx.Provider value={{ user, setUser, ready, socket, login, register, logout, refresh, adopt, endSession }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
