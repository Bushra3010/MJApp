import { useEffect, useState } from 'react';
import { api, timeAgo } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import TopBar from '../../components/TopBar.jsx';
import Coins from '../../components/Coins.jsx';
import { buyPack } from '../../lib/razorpay.js';
import Icon from '../../components/Icon.jsx';

const KIND = { payout_reversed: 'Payout returned', purchase: 'Bought coins', bonus: 'Bonus', call: 'Call', chat: 'Chat', gift: 'Gift', admin_credit: 'Added by support', admin_debit: 'Adjusted by support' };

export default function Wallet() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [w, setW] = useState(null);
  const [cfg, setCfg] = useState({});
  const [buying, setBuying] = useState(null);
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
        <div className="pack-grid">
          {(w?.packs || cfg.packs || []).map((p) => (
            <button key={p.id} className={`card pack ${p.tag ? 'hot' : ''}`} onClick={() => buy(p)} disabled={!!buying || cfg.payments === 'off'}>
              {p.tag && <span className="tag">{p.tag}</span>}
              <div className="c coin">{p.coins.toLocaleString('en-IN')}</div>
              <div className="p">{buying === p.id ? 'Opening…' : `₹${p.price}`}</div>
            </button>
          ))}
        </div>
        <p className="faint" style={{ marginTop: -10, marginBottom: 8 }}>Secure payments by Razorpay · UPI, cards, netbanking, wallets. <a className="link" href="/refunds">Refund policy</a></p>
        <div className="section-title">Every coin, accounted for</div>
        {!w ? <div className="spinner" /> : w.transactions.length === 0 ? <p className="faint">No transactions yet.</p> : <div className="card txn-list">{w.transactions.map((t) => (
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
