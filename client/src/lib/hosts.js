import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

/** Online, not on a call, and taking calls of this type. */
export const isFree = (h, type = 'video') => !!(h && h.online && !h.busy && (type === 'audio' ? h.accept_audio : h.accept_video));

export const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

/** Approved hosts with live presence. `refreshMs` re-fetches the list (new hosts, new photos). */
export function useHosts(params = '', refreshMs = 0) {
  const { socket } = useAuth();
  const [hosts, setHosts] = useState(null);
  useEffect(() => {
    let dead = false;
    const load = () => api(`/hosts${params}`).then((x) => !dead && setHosts(x)).catch(() => !dead && setHosts((h) => h || []));
    load();
    const t = refreshMs ? setInterval(load, refreshMs) : null;
    return () => { dead = true; clearInterval(t); };
  }, [params, refreshMs]);
  useEffect(() => {
    const on = (s) => setHosts((hs) => hs?.map((h) => (h.id !== s.id ? h : {
      ...h, ...(s.online !== undefined ? { online: s.online, busy: s.busy } : {}),
      ...(s.acceptAudio !== undefined ? { accept_audio: s.acceptAudio, accept_video: s.acceptVideo } : {}) })));
    socket?.on('host:status', on);
    return () => socket?.off('host:status', on);
  }, [socket]);
  return hosts;
}

export async function openChat(nav, hostId, toast) {
  try { const c = await api('/conversations', { method: 'POST', body: { hostId } }); nav(`/app/chat/${c.id}`); }
  catch (e) { toast(e.message, 'error'); }
}
