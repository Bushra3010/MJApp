import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useCall } from '../lib/call.jsx';
import { useHosts, isFree, pickRandom } from '../lib/hosts.js';
import { useRecharge, useStartCall } from '../lib/recharge.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Coins from './Coins.jsx';

const FIRST_MS = 6_000;     // first popup shortly after opening the app
const EVERY_MS = 40_000;    // then one every 40 seconds
const SHOW_MS = 9_000;      // each stays up for 9 seconds
const MIN_GAP_MS = 15_000;  // never two popups closer than this

export const popupsOn = () => { try { return localStorage.getItem('mj.popups') !== 'off'; } catch { return true; } };

/**
 * "Priya is available for a video call" cards. Only real hosts who are online,
 * free and taking video calls right now are shown; a host who just came online pops up at once.
 */
export default function AvailabilityPopup() {
  const { socket } = useAuth();
  const { call } = useCall();
  const startCall = useStartCall();
  const { rechargeOpen } = useRecharge();
  const nav = useNavigate();
  const hosts = useHosts('', 45_000);
  const [shown, setShown] = useState(null);
  const hostsRef = useRef(hosts); hostsRef.current = hosts;
  const busyRef = useRef(false); busyRef.current = call.phase !== 'idle' || rechargeOpen;
  const recent = useRef([]);
  const lastAt = useRef(0);
  const hideT = useRef(null);

  const show = (h) => {
    if (!h || busyRef.current || !popupsOn() || document.hidden) return;
    if (Date.now() - lastAt.current < MIN_GAP_MS) return;
    lastAt.current = Date.now();
    recent.current = [h.id, ...recent.current.filter((x) => x !== h.id)].slice(0, 3);
    setShown(h);
    clearTimeout(hideT.current);
    hideT.current = setTimeout(() => setShown(null), SHOW_MS);
  };
  const pick = () => {
    const free = (hostsRef.current || []).filter((h) => isFree(h, 'video'));
    const fresh = free.filter((h) => !recent.current.includes(h.id));
    return pickRandom(fresh.length ? fresh : free);
  };

  useEffect(() => {
    const first = setTimeout(() => show(pick()), FIRST_MS);
    const every = setInterval(() => show(pick()), EVERY_MS);
    return () => { clearTimeout(first); clearInterval(every); clearTimeout(hideT.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A host just went online → show them right away.
  useEffect(() => {
    const on = (s) => {
      if (!s.online || s.busy) return;
      const h = hostsRef.current?.find((x) => x.id === s.id);
      if (h && !h.online && h.accept_video) setTimeout(() => show({ ...h, online: 1, busy: 0 }), 400);
    };
    socket?.on('host:status', on);
    return () => socket?.off('host:status', on);
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide if that host gets busy or a call starts.
  const live = shown && hosts?.find((h) => h.id === shown.id);
  useEffect(() => { if (shown && (busyRef.current || (live && !isFree(live, 'video')))) setShown(null); }, [live, call.phase, rechargeOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null;
  const h = shown;
  return (
    <div className="avail-pop" role="alert" aria-live="polite">
      <button className="ap-body" onClick={() => { setShown(null); nav(`/app/host/${h.id}`); }} aria-label={`Open ${h.name}'s profile`}>
        <Avatar src={h.avatar} name={h.name} size={50} online busy={false} />
        <span className="ap-txt">
          <b>{h.name} is available for a video call</b>
          <span><i className="live-dot" />Online now · <Coins value={h.video_rate} />/min{h.city ? ` · ${h.city}` : ''}</span>
        </span>
      </button>
      <button className="ap-call" onClick={() => { setShown(null); startCall({ id: h.id, name: h.name, avatar: h.avatar }, 'video'); }} aria-label={`Video call ${h.name}`}>
        <Icon name="video" size={20} fill />
      </button>
      <button className="ap-x" onClick={() => setShown(null)} aria-label="Dismiss"><Icon name="x" size={14} strokeWidth="3" /></button>
      <span className="ap-bar" style={{ animationDuration: `${SHOW_MS}ms` }} />
    </div>
  );
}
