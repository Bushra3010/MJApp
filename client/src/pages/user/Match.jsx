import OfferCard from '../../components/OfferCard.jsx';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useHosts, isFree, pickRandom } from '../../lib/hosts.js';
import { useStartCall } from '../../lib/recharge.jsx';
import { useToast } from '../../lib/toast.jsx';
import TopBar from '../../components/TopBar.jsx';
import { initials, warmFor } from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Coins from '../../components/Coins.jsx';

/** Random match: shuffles through who is online, then calls one person who is free right now. */
export default function Match() {
  const { user } = useAuth();
  const hosts = useHosts('', 30_000);
  const call = useStartCall();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [finding, setFinding] = useState(null); // { type, face }
  const timers = useRef([]);

  const free = (type) => (hosts || []).filter((h) => isFree(h, type));
  const video = free('video');
  const audio = free('audio');
  const rates = video.map((h) => h.video_rate);

  const stop = () => { timers.current.forEach(clearTimeout); timers.current.forEach(clearInterval); timers.current = []; setFinding(null); };
  useEffect(() => stop, []);

  const start = (type = 'video') => {
    const pool = free(type);
    if (!pool.length) { toast('No one is free right now. We will pop up when someone comes online.', 'info'); return; }
    const faces = (hosts || []).filter((h) => h.online);
    setFinding({ type, face: pickRandom(faces.length ? faces : pool) });
    const spin = setInterval(() => setFinding((f) => f && { ...f, face: pickRandom(faces.length ? faces : pool) }), 260);
    const go = setTimeout(() => {
      clearInterval(spin);
      const now = free(type);
      const h = pickRandom(now.length ? now : pool);
      setFinding({ type, face: h, found: true });
      timers.current.push(setTimeout(() => { stop(); call({ id: h.id, name: h.name, avatar: h.avatar }, type); }, 700));
    }, 2400);
    timers.current.push(spin, go);
  };

  // "Continue match" from the call summary lands here with ?go=1
  useEffect(() => {
    if (params.get('go') && hosts) { setParams({}, { replace: true }); start('video'); }
  }, [hosts]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <TopBar title="Match" />
      <div className="page">
        <div className="match-hero rise">
          <div className="mh-faces">
            {(video.length ? video : hosts || []).slice(0, 3).map((h, i) => (
              <div key={h.id} className={`mh-face f${i}`}>
                {h.avatar ? <img src={h.avatar} alt="" /> : <div className="ini" style={{ background: warmFor(h.name) }}>{initials(h.name)}</div>}
              </div>
            ))}
          </div>
          <h2>{video.length ? `${video.length} ${video.length === 1 ? 'person is' : 'people are'} ready for a video call` : 'Meet someone new'}</h2>
          <p>Tap Match and we connect you with someone who is online right now.</p>
          {user?.free_trial?.available && <span className="trial-chip">🎁 First {user.free_trial.seconds} seconds free</span>}
          <button className="btn btn-primary btn-block match-btn" onClick={() => start('video')} disabled={!hosts}>
            <Icon name="video" size={20} fill />Match now
          </button>
          <small>You pay only after they answer{rates.length ? <> · from <Coins value={Math.min(...rates)} />/min</> : ''}</small>
        </div>
        <div className="match-tiles">
          <button className="mt press" onClick={() => start('video')}>
            <span className="ic pink"><Icon name="video" size={22} fill /></span>
            <b>Video match</b><span>{video.length} online</span>
          </button>
          <button className="mt press" onClick={() => start('audio')}>
            <span className="ic violet"><Icon name="phone" size={22} fill /></span>
            <b>Audio match</b><span>{audio.length} online</span>
          </button>
        </div>
        <OfferCard style={{ marginTop: 12 }} />
        <p className="faint" style={{ textAlign: 'center', marginTop: 14, display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
          <Icon name="shield" size={14} />Be kind. Anyone who behaves inappropriately will be suspended.
        </p>
      </div>
      {finding && (
        <div className="finding" role="dialog" aria-label="Finding a match">
          <div className={`fd-card ${finding.found ? 'found' : ''}`}>
            {finding.face?.avatar ? <img src={finding.face.avatar} alt="" /> : <div className="ini" style={{ background: warmFor(finding.face?.name) }}>{initials(finding.face?.name)}</div>}
            {finding.found && <span className="fd-name">{finding.face.name}</span>}
          </div>
          <h2>{finding.found ? `Connecting to ${finding.face.name}…` : 'Finding a friend…'}</h2>
          <p>{finding.type === 'audio' ? 'Audio' : 'Video'} match · people who behave inappropriately will be suspended</p>
          {!finding.found && <button className="btn btn-outline" onClick={stop}>Cancel</button>}
        </div>
      )}
    </>
  );
}
