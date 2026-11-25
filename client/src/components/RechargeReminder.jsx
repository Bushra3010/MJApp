// Customer app: a recharge offer reminder that comes up now and then (sooner and more often when the balance is low).
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useCall } from '../lib/call.jsx';
import { useRecharge } from '../lib/recharge.jsx';
import Icon from './Icon.jsx';
import Coins from './Coins.jsx';

const FIRST_MS = 25_000;      // first reminder after opening the app
const EVERY_MS = 3 * 60_000;  // then every 3 minutes
const LOW_EVERY_MS = 90_000;  // every 90 s when the balance can't cover a call
const SHOW_MS = 12_000;
const LOW = 30;               // a video call minute
const SNOOZE_KEY = 'mj.rechargeSnooze';

const snoozed = () => { try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch { return false; } };
const snooze = (ms) => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + ms)); } catch { /* private mode */ } };

export default function RechargeReminder() {
  const { user } = useAuth();
  const { call } = useCall();
  const { openRecharge, rechargeOpen } = useRecharge();
  const loc = useLocation();
  const [shown, setShown] = useState(false);
  const block = useRef(false);
  block.current = call.phase !== 'idle' || rechargeOpen || loc.pathname.startsWith('/app/wallet');
  const lastAt = useRef(0);
  const hideT = useRef(null);
  const low = (user?.coins ?? 0) < LOW;
  const lowRef = useRef(low); lowRef.current = low;

  useEffect(() => {
    const tick = () => {
      if (block.current || snoozed() || document.hidden) return;
      const gap = lowRef.current ? LOW_EVERY_MS : EVERY_MS;
      if (lastAt.current && Date.now() - lastAt.current < gap) return;
      lastAt.current = Date.now();
      setShown(true);
      clearTimeout(hideT.current);
      hideT.current = setTimeout(() => setShown(false), SHOW_MS);
    };
    const first = setTimeout(tick, FIRST_MS);
    const every = setInterval(tick, 15_000);
    return () => { clearTimeout(first); clearInterval(every); clearTimeout(hideT.current); };
  }, []);
  useEffect(() => { if (block.current) setShown(false); }, [call.phase, rechargeOpen, loc.pathname]);

  if (!shown) return null;
  const close = () => { setShown(false); snooze(10 * 60_000); };
  const go = () => { setShown(false); openRecharge({ reason: low ? 'Your coins are running low. Recharge to keep calling.' : 'Pick a pack: coins are added instantly.' }); };
  return (
    <div className="avail-pop rc-pop" role="status" aria-live="polite">
      <button className="ap-body" onClick={go} aria-label="Recharge coins">
        <span className="rc-ic" aria-hidden="true">🎁</span>
        <span className="ap-txt">
          {low
            ? <><b>Low balance, recharge now</b><span>You have <Coins value={user?.coins ?? 0} /> · calls need coins</span></>
            : <><b>Recharge offer: 250 coins for ₹99</b><span>Most popular pack · talk longer with your favourites</span></>}
        </span>
      </button>
      <button className="ap-call rc-go" onClick={go} aria-label="Recharge"><Icon name="plus" size={20} strokeWidth="3" /></button>
      <button className="ap-x" onClick={close} aria-label="Remind me later"><Icon name="x" size={14} strokeWidth="3" /></button>
      <span className="ap-bar" style={{ animationDuration: `${SHOW_MS}ms` }} />
    </div>
  );
}
