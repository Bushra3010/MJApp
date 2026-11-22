import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useCall } from '../../lib/call.jsx';
import { useToast } from '../../lib/toast.jsx';
import Icon from '../../components/Icon.jsx';
import Avatar, { initials, warmFor } from '../../components/Avatar.jsx';
import Coins from '../../components/Coins.jsx';

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
  const [showFilters, setShowFilters] = useState(false);
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(null);
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
  useEffect(() => { setIdx(0); }, [lang, onlyOnline]);

  const n = list?.length || 0;
  const h = n ? list[idx % n] : null;
  const avail = !!(h && h.online && !h.busy);
  const go = (step) => { if (n > 1) { setDx(step * -420); setTimeout(() => { setIdx((i) => (i + step + n) % n); setDx(0); }, 200); } };
  const call = (type) => startCall({ id: h.id, name: h.name, avatar: h.avatar }, type).then((r) => { if (r?.code === 'LOW_BALANCE') nav('/app/wallet'); });

  const down = (e) => { setDrag({ x: e.clientX, moved: false }); e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (drag) { const d = e.clientX - drag.x; if (Math.abs(d) > 6) drag.moved = true; setDx(d); } };
  const up = () => {
    if (!drag) return;
    const moved = drag.moved; setDrag(null);
    if (dx < -90) go(1); else if (dx > 90) go(-1); else { setDx(0); if (!moved) nav(`/app/host/${h.id}`); }
  };

  return (
    <>
      <header className="d-head">
        <Link to="/app/me" aria-label="Your profile"><Avatar src={user?.avatar} name={user?.name} size={42} /></Link>
        <div style={{ minWidth: 0 }}>
          <div className="hi">Hello {(user?.name || '').split(' ')[0]}!</div>
          <div className="loc"><Icon name="pin" size={14} />{user?.city || 'India'}</div>
        </div>
        <div className="spacer" />
        <Link to="/app/wallet" className="coin-pill press" style={{ background: 'transparent', borderColor: '#4a4a4c', boxShadow: 'none', paddingRight: 12 }} aria-label={`Wallet: ${user?.coins} coins`}><Coins value={user?.coins} /></Link>
        <button className="circle-btn" onClick={() => setShowFilters((v) => !v)} aria-label="Filters" aria-expanded={showFilters}><Icon name="search" size={19} /></button>
      </header>
      <div className="d-wrap">
        {showFilters && (
          <div className="filters d-filters rise">
            <button className={onlyOnline ? 'on' : ''} onClick={() => setOnlyOnline(!onlyOnline)} aria-pressed={onlyOnline}><i className="live-dot" />Online</button>
            {LANGS.map((l) => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={lang === l}>{l}</button>)}
          </div>
        )}
        {!list ? <div className="skeleton hero-card" /> : !h ? (
          <div className="empty"><div className="big">🌙</div><b>No one here right now</b><p>Try another language or check back soon — hosts come online all day.</p></div>
        ) : (<>
          <div className={`hero-card ${drag ? '' : 'anim'}`} role="link" tabIndex={0} aria-label={`Open ${h.name}'s profile`}
            onKeyDown={(e) => { if (e.key === 'Enter') nav(`/app/host/${h.id}`); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}
            style={{ transform: `translateX(${dx}px) rotate(${dx / 28}deg)`, opacity: 1 - Math.min(Math.abs(dx) / 700, 0.4) }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { setDrag(null); setDx(0); }}>
            <div className="ph">{h.avatar ? <img src={h.avatar} alt="" draggable="false" /> : <div className="ini" style={{ background: warmFor(h.name) }}>{initials(h.name)}</div>}</div>
            <span className={`tag ${avail ? 'on' : h.busy ? 'busy' : ''}`}><i />{avail ? 'Online now' : h.busy ? 'On a call' : 'Offline'}</span>
            <span className="rate-chip coin">{h.video_rate}/min</span>
            {n > 1 && <div className="prog"><span style={{ top: `${(idx % n) * (100 / n)}%`, height: `${100 / n}%` }} /></div>}
            <div className="info">
              <h2>{h.name}{!!h.verified && <span className="verified" title="Verified host"><Icon name="verified" size={18} /></span>}{avail && <span className="live" />}</h2>
              <p>{[h.city, h.languages.split(',').slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="act-row">
            <button className="act red" onClick={() => go(1)} aria-label="Next person" disabled={n < 2}><Icon name="x" size={28} strokeWidth="2.6" /></button>
            <button className="act violet" onClick={() => openChat(nav, h.id, toast)} aria-label={`Chat with ${h.name}`}><Icon name="chat" size={26} fill /></button>
            <button className="act green" onClick={() => call('video')} disabled={!avail} aria-label={`Video call ${h.name}`}><Icon name="video" size={27} fill /></button>
          </div>
          {user?.free_trial?.available && <p style={{ textAlign: 'center', marginTop: 10 }}><span className="trial-chip">🎁 Your first call is free for {user.free_trial.seconds} seconds</span></p>}
          <p className="swipe-hint">Swipe to see more · tap the card for profile</p>
        </>)}
      </div>
    </>
  );
}
