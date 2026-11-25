import { useEffect, useState } from 'react';
import { api, timeAgo } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import TopBar from '../../components/TopBar.jsx';
import Coins from '../../components/Coins.jsx';
import { buyPack } from '../../lib/razorpay.js';
import Icon from '../../components/Icon.jsx';
import PackList from '../../components/PackList.jsx';
import { useSearchParams } from 'react-router-dom';

const KIND = { payout_reversed: 'Payout returned', purchase: 'Bought coins', bonus: 'Bonus', call: 'Call', chat: 'Chat', gift: 'Gift', admin_credit: 'Added by support', admin_debit: 'Adjusted by support' };

export default function Wallet() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [w, setW] = useState(null);
  const [cfg, setCfg] = useState({});
  const [buying, setBuying] = useState(null);
  const [params, setParams] = useSearchParams();
  const f = params.get('f') || 'all';
  const txns = (w?.transactions || []).filter((t) => f === 'all' || (f === 'topup' ? t.amount > 0 : t.amount < 0));
  const load = () => api('/wallet').then(setW);
  useEffect(() => { load(); api('/config').then(setCfg); }, [user.coins]);

  const buy = async (p) => {
    setBuying(p.id);
    try {
      const coins = await buyPack(p.id);
      if (coins !== null) { setUser((u) => ({ ...u, coins })); toast(`+${p.coins} coins added`, 'success'); }
    }
    catch (e) { toast(e.message, 'error'); } finally { setBuying(null); }
  };

  return (
    <>
      <TopBar title="Wallet" right={null} />
      <div className="page">
        <div className="balance-card">
          <div className="row" style={{ fontWeight: 800, opacity: .92 }}><Icon name="wallet" size={18} />Your balance</div>
          <div className="amt"><Coins value={user.coins} /></div>
          <div style={{ fontWeight: 700, opacity: .9, fontSize: 13 }}>Use coins for calls, chats and gifts</div>
        </div>
        {cfg.payments === 'test' && <div className="test-banner">Test mode: packs are credited instantly without payment. Add your Razorpay keys to take real payments.</div>}
        {cfg.payments === 'off' && <div className="test-banner">Buying coins is temporarily unavailable.</div>}
        <div className="section-title">Add coins</div>
        <PackList packs={w?.packs || cfg.packs || []} onBuy={buy} buying={buying} disabled={cfg.payments === 'off'} />
        <div className="section-title">Every coin, accounted for</div>
        <div className="filters">
          {[['all', 'All'], ['topup', 'Top-up record'], ['spend', 'Spending history']].map(([k, l]) => (
            <button key={k} className={f === k ? 'on' : ''} aria-pressed={f === k} onClick={() => setParams(k === 'all' ? {} : { f: k }, { replace: true })}>{l}</button>
          ))}
        </div>
        {!w ? <div className="spinner" /> : txns.length === 0 ? <p className="faint">Nothing here yet.</p> : <div className="card txn-list">{txns.map((t) => (
          <div key={t.id} className="txn">
            <span className={`ic ${t.amount > 0 ? 'plus' : ''}`}><Icon name={t.kind === 'call' ? 'phone' : t.kind === 'chat' ? 'chat' : t.kind === 'gift' ? 'gift' : t.amount > 0 ? 'plus' : 'coin'} size={18} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ display: 'block' }}>{KIND[t.kind] || t.kind}</b>
              <span className="faint">{t.note} · {timeAgo(t.created_at)}{t.kind === 'purchase' && t.ref ? ` · ${t.ref}` : ''}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={`amt ${t.amount > 0 ? 'plus' : 'minus'}`}>{t.amount > 0 ? '+' : ''}{t.amount}</div>
              <div className="faint">bal {t.balance_after}</div>
            </div>
          </div>
        ))}</div>}
      </div>
    </>
  );
}
