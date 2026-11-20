import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useCall } from '../../lib/call.jsx';
import { useToast } from '../../lib/toast.jsx';
import TopBar from '../../components/TopBar.jsx';
import Icon from '../../components/Icon.jsx';
import Avatar, { gradFor, initials } from '../../components/Avatar.jsx';

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
  const { user } = useAuth();
  const { startCall } = useCall();
  const nav = useNavigate();
  const toast = useToast();

  const list = useMemo(() => {
    if (!hosts) return null;
    const sorted = [...hosts].sort((a, b) => (b.online && !b.busy) - (a.online && !a.busy) || b.online - a.online);
    return onlyOnline ? sorted.filter((h) => h.online) : sorted;
  }, [hosts, onlyOnline]);
  const live = useMemo(() => (hosts || []).filter((h) => h.online && !h.busy), [hosts]);

  const call = (e, h, type) => {
    e.preventDefault();
    startCall({ id: h.id, name: h.name, avatar: h.avatar }, type).then((r) => { if (r?.code === 'LOW_BALANCE') nav('/app/wallet'); });
  };
  const first = (user?.name || '').split(' ')[0];

  return (
    <>
      <TopBar title="Milo Julo" />
      <div className="page">
        <div className="hello">
          <h2>Hi {first} 👋</h2>
          <p>Who would you like to talk to today?</p>
        </div>

        {live.length > 0 && (<>
          <div className="section-head"><h3>Online now</h3><span>{live.length} available</span></div>
          <div className="stories">
            {live.map((h) => (
              <Link key={h.id} to={`/app/host/${h.id}`} className="story">
                <div className="ring"><div><Avatar src={h.avatar} name={h.name} size={62} /></div></div>
                <span>{h.name}</span>
              </Link>
            ))}
          </div>
        </>)}

        <div className="section-head"><h3>Discover</h3>{list && <span>{list.length} {list.length === 1 ? 'person' : 'people'}</span>}</div>
        <div className="filters">
          <button className={onlyOnline ? 'on' : ''} onClick={() => setOnlyOnline(!onlyOnline)} aria-pressed={onlyOnline}><i className="live-dot" />Online</button>
          {LANGS.map((l) => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={lang === l}>{l}</button>)}
        </div>
        {!list ? (
          <div className="host-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel-card" />)}</div>
        ) : list.length === 0 ? (
          <div className="empty"><div className="big">🌙</div><b>No one here right now</b><p>Try another language or check back soon — hosts come online all day.</p></div>
        ) : (
          <div className="host-grid">
            {list.map((h, i) => {
              const avail = h.online && !h.busy;
              return (
                <Link key={h.id} to={`/app/host/${h.id}`} className="host-card rise" style={{ '--i': i }}>
                  <div className="photo">
                    {h.avatar ? <img src={h.avatar} alt="" loading="lazy" /> : <div className="initials-big" style={{ background: gradFor(h.name) }}>{initials(h.name)}</div>}
                    <span className={`status-pill ${avail ? 'on' : h.busy ? 'busy' : ''}`}><i />{avail ? 'Online' : h.busy ? 'On a call' : 'Offline'}</span>
                    <div className="overlay">
                      <div className="name-row"><span className="name">{h.name}</span>{h.video_rate > 0 && <span className="rate-tag coin">{h.video_rate}</span>}</div>
                      <div className="meta">{[h.city, h.languages.split(',').slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  <div className="actions">
                    <button className="mini-btn" aria-label={`Chat with ${h.name}`} onClick={(e) => { e.preventDefault(); openChat(nav, h.id, toast); }}><Icon name="chat" size={19} /></button>
                    <button className="mini-btn" disabled={!avail} aria-label={`Audio call ${h.name}`} onClick={(e) => call(e, h, 'audio')}><Icon name="phone" size={19} /></button>
                    <button className="mini-btn video" disabled={!avail} aria-label={`Video call ${h.name}`} onClick={(e) => call(e, h, 'video')}><Icon name="video" size={20} /></button>
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
