// Host app: "Rahul just came online" pop-up whenever a member opens the app.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useCall } from '../lib/call.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

const SHOW_MS = 7_000;

export default function CustomerPopup() {
  const { socket } = useAuth();
  const { call } = useCall();
  const nav = useNavigate();
  const [shown, setShown] = useState(null);
  const [more, setMore] = useState(0);
  const busy = useRef(false); busy.current = call.phase !== 'idle';
  const hideT = useRef(null);
  const cur = useRef(null);

  useEffect(() => {
    const on = (c) => {
      if (busy.current) return;
      if (cur.current && cur.current.id !== c.id) setMore((n) => n + 1);
      cur.current = c;
      setShown(c);
      clearTimeout(hideT.current);
      hideT.current = setTimeout(() => { cur.current = null; setShown(null); setMore(0); }, SHOW_MS);
    };
    socket?.on('customer:online', on);
    return () => { socket?.off('customer:online', on); clearTimeout(hideT.current); };
  }, [socket]);
  useEffect(() => { if (busy.current) setShown(null); }, [call.phase]);

  if (!shown) return null;
  const close = () => { cur.current = null; setShown(null); setMore(0); };
  return (
    <div className="avail-pop cust-pop" role="status" aria-live="polite">
      <button className="ap-body" onClick={() => { close(); nav(`/host/customer/${shown.id}`); }} aria-label={`Open ${shown.name}'s profile`}>
        <Avatar src={shown.avatar} name={shown.name} size={46} online busy={false} />
        <span className="ap-txt">
          <b>{shown.isNew ? `New member ${shown.name} is online` : `${shown.name} just came online`}</b>
          <span><i className="live-dot" />{[shown.city, more > 0 ? `+${more} more online` : 'Stay online to get their call'].filter(Boolean).join(' · ')}</span>
        </span>
      </button>
      <button className="ap-call list" onClick={() => { close(); nav('/host/customers'); }} aria-label="See everyone online"><Icon name="users" size={20} /></button>
      <button className="ap-x" onClick={close} aria-label="Dismiss"><Icon name="x" size={14} strokeWidth="3" /></button>
      <span className="ap-bar" style={{ animationDuration: `${SHOW_MS}ms` }} />
    </div>
  );
}
