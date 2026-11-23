import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

/** Unread alert count for hosts, updated live. */
export function useAlertCount() {
  const { socket } = useAuth();
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => api('/host/alerts').then((r) => setN(r.unread)).catch(() => {});
    load();
    socket?.on('alert:new', load);
    window.addEventListener('mj:alerts-read', load);
    return () => { socket?.off('alert:new', load); window.removeEventListener('mj:alerts-read', load); };
  }, [socket]);
  return n;
}
