import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useCall } from '../../lib/call.jsx';
import { useToast } from '../../lib/toast.jsx';
import TopBar from '../../components/TopBar.jsx';
import Icon from '../../components/Icon.jsx';
import { colorFor, initials } from '../../components/Avatar.jsx';

const LANGS = ['All', 'Hindi', 'English', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Bengali', 'Punjabi'];

export function useHosts(params = '') {
  const { socket } = useAuth();
  const [hosts, setHosts] = useState(null);
  useEffect(() => { api(`/hosts${params}`).then(setHosts).catch(() => setHosts([])); }, [params]);
  useEffect(() => {
    const on = (s) => setHosts((hs) => hs?.map((h) => (h.id === s.id ? { ...h, online: s.online, busy: s.busy } : h)));
    socket?.on('host:status', on);
    return () => socket?.off('host:status', on);
  }, [socket]);
  return hosts;
}

export async function openChat(nav, hostId, toast) {
  try { const c = await api('/conversations', { method: 'POST', body: { hostId } }); nav(`/app/chat/${c.id}`); }
  catch (e) { toast(e.message, 'error'); }
}

export default function Discover() {
  const [lang, setLang] = useState('All');
  const [onlyOnline, setOnlyOnline] = useState(false);
  const hosts = useHosts(lang === 'All' ? '' : `?lang=${encodeURIComponent(lang)}`);
  const { startCall } = useCall();
  const nav = useNavigate();
  const toast = useToast();

  const list = useMemo(() => {
    if (!hosts) return null;
    const sorted = [...hosts].sort((a, b) => (b.online && !b.busy) - (a.online && !a.busy) || b.online - a.online);
    return onlyOnline ? sorted.filter((h) => h.online) : sorted;
  }, [hosts, onlyOnline]);

  const call = (e, h, type) => {
    e.preventDefault();
    startCall({ id: h.id, name: h.name, avatar: h.avatar }, type).then((r) => { if (r?.code === 'LOW_BALANCE') nav('/app/wallet'); });
  };

  return (
    <>
      <TopBar title="Milo Julo" />
      <div className="page">
        <div className="filters">
          <button className={onlyOnline ? 'on' : ''} onClick={() => setOnlyOnline(!onlyOnline)}>● Online now</button>
          {LANGS.map((l) => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l}</button>)}
        </div>
        {!list ? <div className="spinner" /> : list.length === 0 ? (
          <div className="empty"><div className="big">🌙</div><b>No one here right now</b><p>Try another language or check back soon — hosts come online all day.</p></div>
        ) : (
          <div className="host-grid">
            {list.map((h) => {
              const avail = h.online && !h.busy;
              return (
                <Link key={h.id} to={`/app/host/${h.id}`} className="card host-card">
                  <div className="photo">
                    {h.avatar ? <img src={h.avatar} alt="" loading="lazy" /> : <div className="initials-big" style={{ background: colorFor(h.name) }}>{initials(h.name)}</div>}
                    <span className={`status chip ${avail ? 'chip-green' : h.busy ? 'chip-amber' : 'chip-grey'}`}>
                      {avail ? '● Online' : h.busy ? 'On a call' : 'Offline'}
                    </span>
                  </div>
                  <div className="body">
                    <div className="name">{h.name}</div>
                    <div className="meta">{[h.city, h.languages.split(',').slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</div>
                    <div className="actions">
                      <button className="mini-btn" aria-label={`Chat with ${h.name}`} onClick={(e) => { e.preventDefault(); openChat(nav, h.id, toast); }}><Icon name="chat" size={18} /></button>
                      <button className="mini-btn" disabled={!avail} aria-label={`Audio call ${h.name}`} onClick={(e) => call(e, h, 'audio')}><Icon name="phone" size={18} /></button>
                      <button className="mini-btn video" disabled={!avail} aria-label={`Video call ${h.name}`} onClick={(e) => call(e, h, 'video')}><Icon name="video" size={18} /></button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
