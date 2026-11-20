import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

/** Total unread messages, refreshed when a new message arrives. */
export function useUnread() {
  const { socket, user } = useAuth();
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => api('/conversations').then((cs) => setN(cs.reduce((a, c) => a + c.unread, 0))).catch(() => {});
    load();
    const onMsg = (m) => { if (m.sender_id !== user?.id) load(); };
    socket?.on('message:new', onMsg);
    window.addEventListener('mj:read', load);
    return () => { socket?.off('message:new', onMsg); window.removeEventListener('mj:read', load); };
  }, [socket, user?.id]);
  return n;
}
