import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useCall } from '../../lib/call.jsx';
import { useToast } from '../../lib/toast.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Coins from '../../components/Coins.jsx';
import ReportSheet from '../../components/ReportSheet.jsx';
import { openChat } from './Discover.jsx';

export default function HostProfile() {
  const { id } = useParams();
  const [h, setH] = useState(null);
  const [menu, setMenu] = useState(false);
  const { socket } = useAuth();
  const { startCall } = useCall();
  const nav = useNavigate();
  const toast = useToast();

  useEffect(() => { api(`/hosts/${id}`).then(setH).catch((e) => { toast(e.message, 'error'); nav('/app'); }); }, [id]); // eslint-disable-line
  useEffect(() => {
    const on = (s) => s.id === Number(id) && setH((x) => x && { ...x, online: s.online, busy: s.busy });
    socket?.on('host:status', on);
    return () => socket?.off('host:status', on);
  }, [socket, id]);

  if (!h) return <div className="spinner" />;
  const avail = h.online && !h.busy;
  const call = (type) => startCall({ id: h.id, name: h.name, avatar: h.avatar }, type).then((r) => { if (r?.code === 'LOW_BALANCE') nav('/app/wallet'); });

  return (
    <div className="app-shell">
      <div className="cover">
        {h.avatar && <img src={h.avatar} alt="" />}
        <div className="cover-bar">
          <button className="icon-btn press" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button>
          <button className="icon-btn press" onClick={() => setMenu(true)} aria-label="More"><Icon name="more" /></button>
        </div>
      </div>
      <div className="page">
        <div className="profile-hero">
          <Avatar src={h.avatar} name={h.name} size={132} online={!!h.online} busy={!!h.busy} className="ringed" />
          <h2>{h.name}</h2>
          <p className="muted" style={{ fontWeight: 700 }}>{[h.city, h.gender && h.gender[0].toUpperCase() + h.gender.slice(1)].filter(Boolean).join(' · ')}</p>
          <div style={{ marginTop: 10 }}>
            <span className={`chip ${avail ? 'chip-green' : h.busy ? 'chip-amber' : 'chip-grey'}`}>{avail ? '● Online now' : h.busy ? 'On another call' : 'Offline'}</span>
          </div>
        </div>
        <div className="card stat-group">
          <div><b>{h.calls}</b><span>Calls</span></div>
          <div><b>{Math.round(h.seconds / 60)}</b><span>Minutes</span></div>
          <div><b>{h.languages.split(',').length}</b><span>Languages</span></div>
        </div>
        {h.bio && <div className="card" style={{ padding: 16, marginBottom: 14 }}><div className="faint" style={{ fontWeight: 800, marginBottom: 4 }}>About</div><p style={{ lineHeight: 1.5 }}>{h.bio}</p></div>}
        <div className="lang-chips">{h.languages.split(',').map((l) => <span key={l} className="chip">{l}</span>)}</div>
        <div className="rate-row">
          <div className="card rate"><span className="ic"><Icon name="phone" size={20} /></span><b><Coins value={h.audio_rate} /></b><span className="faint">per min · audio</span></div>
          <div className="card rate"><span className="ic"><Icon name="video" size={20} /></span><b><Coins value={h.video_rate} /></b><span className="faint">per min · video</span></div>
        </div>
        <p className="faint" style={{ textAlign: 'center', padding: '0 12px' }}>You're charged per started minute. You'll see the coins spent live during the call.</p>
      </div>
      <div className="cta-bar">
        <button className="btn btn-ghost" onClick={() => openChat(nav, h.id, toast)}><Icon name="chat" size={18} />Chat</button>
        <button className="btn btn-outline" disabled={!avail} onClick={() => call('audio')}><Icon name="phone" size={18} />Audio</button>
        <button className="btn btn-primary" disabled={!avail} onClick={() => call('video')}><Icon name="video" size={18} />Video</button>
      </div>
      {menu && <ReportSheet target={h} onClose={() => setMenu(false)} onBlocked={() => nav('/app')} />}
    </div>
  );
}
