import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { useCall } from './call.jsx';
import { useToast } from './toast.jsx';
import { buyPack } from './razorpay.js';
import Sheet from '../components/Sheet.jsx';
import PackList from '../components/PackList.jsx';
import Avatar from '../components/Avatar.jsx';
import Coins from '../components/Coins.jsx';

const Ctx = createContext({ openRecharge: () => {}, rechargeOpen: false });

/**
 * "Not enough coins" bottom sheet. Opens with the host the user was trying to reach;
 * after a successful top-up the call is placed again automatically.
 */
export function RechargeProvider({ children }) {
  const { user, setUser } = useAuth();
  const { startCall } = useCall();
  const toast = useToast();
  const [state, setState] = useState(null); // { host, type, reason }
  const [cfg, setCfg] = useState(null);
  const [buying, setBuying] = useState(null);

  useEffect(() => { if (state && !cfg) api('/config').then(setCfg).catch(() => setCfg({ packs: [] })); }, [state, cfg]);

  const openRecharge = useCallback((s = {}) => setState(s), []);
  const close = () => setState(null);

  const buy = async (p) => {
    setBuying(p.id);
    try {
      const coins = await buyPack(p.id);
      if (coins === null) return;
      setUser((u) => ({ ...u, coins }));
      toast(`+${p.coins} coins added`, 'success');
      const again = state;
      close();
      if (again?.host) setTimeout(() => startCall(again.host, again.type || 'video'), 300);
    } catch (e) { toast(e.message, 'error'); } finally { setBuying(null); }
  };

  return (
    <Ctx.Provider value={{ openRecharge, rechargeOpen: !!state }}>
      {children}
      {state && (
        <Sheet title="" onClose={close}>
          <div className="recharge-head">
            {state.host && <Avatar src={state.host.avatar} name={state.host.name} size={64} />}
            <h3>{state.host ? `Connect with ${state.host.name}` : 'Add coins'}</h3>
            <p>{state.reason || 'Not enough coins. Recharge to continue.'}</p>
            <span className="faint">Your balance: <Coins value={user?.coins} /></span>
          </div>
          {cfg?.payments === 'test' && <div className="test-banner">Test mode: packs are credited instantly without payment.</div>}
          {cfg?.payments === 'off' && <div className="test-banner">Buying coins is temporarily unavailable.</div>}
          {!cfg ? <div className="spinner" /> : <PackList packs={cfg.packs} onBuy={buy} buying={buying} disabled={cfg.payments === 'off'} />}
        </Sheet>
      )}
    </Ctx.Provider>
  );
}

export const useRecharge = () => useContext(Ctx);

/** startCall that opens the recharge sheet when the balance is too low. */
export function useStartCall() {
  const { startCall } = useCall();
  const { openRecharge } = useRecharge();
  return useCallback(async (host, type = 'video') => {
    const r = await startCall(host, type);
    if (r?.code === 'LOW_BALANCE') openRecharge({ host, type, reason: r.error });
    return r;
  }, [startCall, openRecharge]);
}
