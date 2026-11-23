import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useCall } from '../../lib/call.jsx';
import { useToast } from '../../lib/toast.jsx';
import { initials, warmFor } from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Coins from '../../components/Coins.jsx';
import ReportSheet from '../../components/ReportSheet.jsx';
import { openChat } from './Discover.jsx';

export default function HostProfile() {
  const { id } = useParams();
  const [h, setH] = useState(null);
  const [menu, setMenu] = useState(false);
  const { socket, user } = useAuth();
  const { startCall } = useCall();
  const nav = useNavigate();
  const toast = useToast();

  useEffect(() => { api(`/hosts/${id}`).then(setH).catch((e) => { toast(e.message, 'error'); nav('/app'); }); }, [id]); // eslint-disable-line
  useEffect(() => {
    const on = (s) => s.id === Number(id) && setH((x) => x && {
      ...x, ...(s.online !== undefined ? { online: s.online, busy: s.busy } : {}),
      ...(s.acceptAudio !== undefined ? { accept_audio: s.acceptAudio, accept_video: s.acceptVideo } : {}) });
    socket?.on('host:status', on);
    return () => socket?.off('host:status', on);
  }, [socket, id]);

  if (!h) return <div className="spinner" />;
  const avail = h.online && !h.busy;
  const call = (type) => startCall({ id: h.id, name: h.name, avatar: h.avatar }, type).then((r) => { if (r?.code === 'LOW_BALANCE') nav('/app/wallet'); });

  return (
    <div className="app-shell">
      <header className="p-head">
        <button className="circle-btn" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" size={18} /></button>
        <div style={{ minWidth: 0 }}>
          <h1>{h.name}{!!h.verified && <span className="verified" title="Verified host"><Icon name="verified" size={20} /></span>}</h1>
          <small>{h.city || 'India'}</small>
        </div>
        <button className="circle-btn" onClick={() => setMenu(true)} aria-label="More"><Icon name="more" size={18} /></button>
      </header>
      <div className="p-photo">
        {h.avatar ? <img src={h.avatar} alt={h.name} /> : <div className="ini" style={{ background: warmFor(h.name) }}>{initials(h.name)}</div>}
        <span className={`hero-tag status ${avail ? 'on' : h.busy ? 'busy' : ''}`}><i />{avail ? 'Online now' : h.busy ? 'On a call' : 'Offline'}</span>
      </div>
      <div className="p-body" style={{ paddingBottom: 130 }}>
        <div className="p-label">About</div>
        <p className="p-text">{h.bio || `${h.name} hasn't written a bio yet.`}</p>
        <div className="p-label">Languages</div>
        <div className="pills">{h.languages.split(',').map((l) => <span key={l} className="pill2">🗣️ {l}</span>)}</div>
        <div className="p-label">Rates</div>
        <div className="pills">
          <span className="pill2"><Icon name="phone" size={16} /> <Coins value={h.audio_rate} /> /min</span>
          <span className="pill2"><Icon name="video" size={16} /> <Coins value={h.video_rate} /> /min</span>
          <span className="pill2">📞 {h.calls} {h.calls === 1 ? 'call' : 'calls'}</span>
        </div>
        {user?.free_trial?.available
          ? <p className="faint"><span className="trial-chip">🎁 First {user.free_trial.seconds} seconds of your first call are free</span><br />After that you're charged per started minute, shown live during the call.</p>
          : <p className="faint">You're charged per started minute. You'll see the coins spent live during the call.</p>}
      </div>
      <div className="p-actions">
        <button className="act violet" onClick={() => openChat(nav, h.id, toast)} aria-label="Chat"><Icon name="chat" size={26} fill /></button>
        <button className="act blue" disabled={!avail || !h.accept_audio} onClick={() => call('audio')} aria-label="Audio call"><Icon name="phone" size={26} fill /></button>
        <button className="act green" disabled={!avail || !h.accept_video} onClick={() => call('video')} aria-label="Video call"><Icon name="video" size={27} fill /></button>
      </div>
      {menu && <ReportSheet target={h} onClose={() => setMenu(false)} onBlocked={() => nav('/app')} />}
    </div>
  );
}
