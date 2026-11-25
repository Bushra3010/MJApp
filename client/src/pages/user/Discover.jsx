import OfferCard from '../../components/OfferCard.jsx';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useHosts, isFree, openChat } from '../../lib/hosts.js';
import { useStartCall } from '../../lib/recharge.jsx';
import Icon from '../../components/Icon.jsx';
import Avatar, { initials, warmFor } from '../../components/Avatar.jsx';
import Coins from '../../components/Coins.jsx';

export { useHosts, openChat };

const LANGS = ['All', 'Hindi', 'English', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Bengali', 'Punjabi'];

export function HostTile({ h, i = 0, onCall }) {
  const nav = useNavigate();
  const free = isFree(h, 'video');
  return (
    <div className="h-tile rise" style={{ '--i': i }} role="link" tabIndex={0} aria-label={`Open ${h.name}'s profile`}
      onClick={() => nav(`/app/host/${h.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/app/host/${h.id}`)}>
      {h.avatar ? <img src={h.avatar} alt="" loading="lazy" /> : <div className="ini" style={{ background: warmFor(h.name) }}>{initials(h.name)}</div>}
      <span className={`h-status ${free ? 'on' : h.online && h.busy ? 'busy' : ''}`}><i />{free ? 'Online' : h.online && h.busy ? 'On a call' : 'Offline'}</span>
      <div className="h-foot">
        <div style={{ minWidth: 0 }}>
          <b>{h.name}{!!h.verified && <Icon name="verified" size={14} className="h-ver" />}</b>
          <span><Coins value={h.video_rate} />/min{h.reviews > 0 && <em className="h-rate">★ {h.rating}</em>}</span>
        </div>
        <button className={`h-call ${free ? '' : 'off'}`} disabled={!free} aria-label={`Video call ${h.name}`}
          onClick={(e) => { e.stopPropagation(); onCall(h); }}>
          <Icon name="video" size={20} fill />
        </button>
      </div>
    </div>
  );
}

export default function Discover() {
  const [lang, setLang] = useState('All');
  const [onlyOnline, setOnlyOnline] = useState(false);
  const hosts = useHosts(lang === 'All' ? '' : `?lang=${encodeURIComponent(lang)}`, 60_000);
  const { user } = useAuth();
  const call = useStartCall();

  const list = useMemo(() => {
    if (!hosts) return null;
    const rank = (h) => (isFree(h) ? 2 : h.online ? 1 : 0);
    const sorted = [...hosts].sort((a, b) => rank(b) - rank(a));
    return onlyOnline ? sorted.filter((h) => h.online) : sorted;
  }, [hosts, onlyOnline]);
  const freeCount = hosts?.filter((h) => isFree(h)).length || 0;
  const faces = (hosts || []).filter((h) => isFree(h)).slice(0, 3);

  return (
    <>
      <header className="d-head">
        <Link to="/app/me" aria-label="Your profile"><Avatar src={user?.avatar} name={user?.name} size={42} /></Link>
        <div style={{ minWidth: 0 }}>
          <h1 className="d-title">Discover</h1>
          <div className="loc"><i className="live-dot" />{freeCount} online now</div>
        </div>
        <div className="spacer" />
        <Link to="/app/wallet" className="coin-pill press" aria-label={`Wallet: ${user?.coins} coins. Add coins`}>
          <Coins value={user?.coins} /><span className="plus"><Icon name="plus" size={16} strokeWidth="3" /></span>
        </Link>
      </header>
      <div className="page" style={{ paddingTop: 0 }}>
        <Link to="/app/match" className="match-strip press">
          <div className="faces">{faces.length ? faces.map((f) => <Avatar key={f.id} src={f.avatar} name={f.name} size={34} />) : <span className="mi"><Icon name="cards" size={18} /></span>}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b>Random video match</b>
            <span>{freeCount ? `${freeCount} ready for a video call` : 'Meet someone new in seconds'}</span>
          </div>
          <Icon name="chevron" size={20} />
        </Link>
        <OfferCard style={{ marginBottom: 12 }} />
        {user?.free_trial?.available && <div className="trial-chip" style={{ marginBottom: 12 }}>🎁 Your first call is free for {user.free_trial.seconds} seconds</div>}
        <div className="filters">
          <button className={onlyOnline ? 'on' : ''} onClick={() => setOnlyOnline(!onlyOnline)} aria-pressed={onlyOnline}><i className="live-dot" />Online</button>
          {LANGS.map((l) => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={lang === l}>{l}</button>)}
        </div>
        {!list ? (
          <div className="h-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-tile" />)}</div>
        ) : list.length === 0 ? (
          <div className="empty"><div className="big">🌙</div><b>No one here right now</b><p>Try another language or check back soon — hosts come online all day.</p></div>
        ) : (
          <div className="h-grid">{list.map((h, i) => <HostTile key={h.id} h={h} i={i} onCall={(x) => call(x, 'video')} />)}</div>
        )}
      </div>
    </>
  );
}
