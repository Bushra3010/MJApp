// Host app: "Rahul is online — call now" pop-ups. One appears the moment a member opens the app,
// a new member's sign-up is announced, and while members are online a reminder comes up every 40 seconds.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useCall } from '../lib/call.jsx';
import { useToast } from '../lib/toast.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

const FIRST_MS = 6_000;
const EVERY_MS = 40_000;
const SHOW_MS = 9_000;
const MIN_GAP_MS = 12_000;

export default function CustomerPopup() {
  const { socket } = useAuth();
  const { call, startCall } = useCall();
  const toast = useToast();
  const nav = useNavigate();
  const [shown, setShown] = useState(null);
  const busy = useRef(false); busy.current = call.phase !== 'idle';
  const hideT = useRef(null);
  const lastAt = useRef(0);
  const recent = useRef([]);

  const show = (c, { force = false, kind = 'online' } = {}) => {
    if (!c || busy.current || document.hidden) return;
    if (!force && Date.now() - lastAt.current < MIN_GAP_MS) return;
    lastAt.current = Date.now();
    recent.current = [c.id, ...recent.current.filter((x) => x !== c.id)].slice(0, 3);
    setShown({ ...c, kind });
    clearTimeout(hideT.current);
    hideT.current = setTimeout(() => setShown(null), SHOW_MS);
  };
  const remind = async () => {
    if (busy.current || document.hidden) return;
    try {
      const { customers } = await api('/host/customers?tab=online');
      const fresh = customers.filter((c) => !recent.current.includes(c.id));
      const list = fresh.length ? fresh : customers;
      if (list.length) show(list[Math.floor(Math.random() * list.length)]);
    } catch { /* offline */ }
  };

  useEffect(() => {
    const first = setTimeout(remind, FIRST_MS);
    const every = setInterval(remind, EVERY_MS);
    const on = (c) => show(c, { force: true, kind: 'online' });
    const joined = (c) => show(c, { force: true, kind: 'joined' });
    socket?.on('customer:online', on);
    socket?.on('customer:joined', joined);
    return () => { clearTimeout(first); clearInterval(every); clearTimeout(hideT.current); socket?.off('customer:online', on); socket?.off('customer:joined', joined); };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (busy.current) setShown(null); }, [call.phase]);

  if (!shown) return null;
  const c = shown;
  const ring = async (type) => {
    setShown(null);
    const r = await startCall({ id: c.id, name: c.name, avatar: c.avatar }, type);
    if (r?.error && r.code === 'LOW_BALANCE') toast(r.error, 'error');
  };
  const title = c.kind === 'joined' ? `New member ${c.name} just joined` : c.isNew ? `New member ${c.name} is online` : `${c.name} is online`;
  const sub = [c.age && `${c.age} yrs`, c.city, 'Call now'].filter(Boolean).join(' · ');
  return (
    <div className="avail-pop cust-pop" role="status" aria-live="polite">
      <button className="ap-body" onClick={() => { setShown(null); nav(`/host/customer/${c.id}`); }} aria-label={`Open ${c.name}'s profile`}>
        <Avatar src={c.avatar} name={c.name} size={46} online busy={false} />
        <span className="ap-txt">
          <b>{title}</b>
          <span><i className="live-dot" />{sub}</span>
        </span>
      </button>
      <button className="ap-call" onClick={() => ring('video')} aria-label={`Video call ${c.name}`}><Icon name="video" size={20} fill /></button>
      <button className="ap-x" onClick={() => setShown(null)} aria-label="Dismiss"><Icon name="x" size={14} strokeWidth="3" /></button>
      <span className="ap-bar" style={{ animationDuration: `${SHOW_MS}ms` }} />
    </div>
  );
}
