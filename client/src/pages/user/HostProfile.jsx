import { useEffect, useState } from 'react';
import Gallery from '../../components/Gallery.jsx';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useStartCall } from '../../lib/recharge.jsx';
import Stars from '../../components/Stars.jsx';
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
  const startCall = useStartCall();
  const [rev, setRev] = useState(null);
  const nav = useNavigate();
  const toast = useToast();

  useEffect(() => { api(`/hosts/${id}`).then(setH).catch((e) => { toast(e.message, 'error'); nav('/app'); }); api(`/hosts/${id}/reviews`).then(setRev).catch(() => {}); }, [id]); // eslint-disable-line
  useEffect(() => {
    const on = (s) => s.id === Number(id) && setH((x) => x && {
      ...x, ...(s.online !== undefined ? { online: s.online, busy: s.busy } : {}),
      ...(s.acceptAudio !== undefined ? { accept_audio: s.acceptAudio, accept_video: s.acceptVideo } : {}) });
    socket?.on('host:status', on);
    return () => socket?.off('host:status', on);
  }, [socket, id]);

  if (!h) return <div className="spinner" />;
  const avail = h.online && !h.busy;
  const call = (type) => startCall({ id: h.id, name: h.name, avatar: h.avatar }, type);

  return (
    <div className="app-shell">
      <header className="p-head">
        <button className="circle-btn" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" size={18} /></button>
        <div style={{ minWidth: 0 }}>
          <h1>{h.name}{!!h.verified && <span className="verified" title="Verified host"><Icon name="verified" size={20} /></span>}</h1>
          <small>{h.city || 'India'}{h.reviews > 0 && <> · ★ {h.rating} ({h.reviews})</>}</small>
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
        <Gallery hostId={h.id} />
        <div className="p-label">Languages</div>
        <div className="pills">{h.languages.split(',').map((l) => <span key={l} className="pill2">🗣️ {l}</span>)}</div>
        <div className="p-label">Rates</div>
        <div className="pills">
          <span className="pill2"><Icon name="phone" size={16} /> <Coins value={h.audio_rate} /> /min</span>
          <span className="pill2"><Icon name="video" size={16} /> <Coins value={h.video_rate} /> /min</span>
          <span className="pill2">📞 {h.calls} {h.calls === 1 ? 'call' : 'calls'}</span>
        </div>
        <div className="p-label">Ratings & reviews</div>
        {!rev || rev.count === 0 ? <p className="p-text muted">No ratings yet — be the first after your call.</p> : (<>
          <div className="rev-head">
            <b>{rev.avg}</b>
            <div><Stars value={rev.avg} size={18} /><span className="faint">{rev.count} {rev.count === 1 ? 'rating' : 'ratings'}</span></div>
          </div>
          <div className="rev-list">{rev.reviews.filter((r) => r.body).slice(0, 5).map((r) => (
            <div key={r.id} className="rev"><div className="row"><b>{r.name}</b><Stars value={r.stars} size={12} /></div><p>{r.body}</p></div>
          ))}</div>
        </>)}
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
