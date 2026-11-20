import { useEffect, useState } from 'react';
import { api, timeAgo } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import TopBar from '../../components/TopBar.jsx';
import Coins from '../../components/Coins.jsx';

export default function HostEarnings() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [s, setS] = useState(null);
  const [amount, setAmount] = useState('');
  const [upi, setUpi] = useState('');
  const load = () => api('/host/stats').then(setS);
  useEffect(() => { load(); }, []);

  const request = async (e) => {
    e.preventDefault();
    try { await api('/host/payouts', { method: 'POST', body: { amount: Number(amount), upi } }); toast('Payout requested', 'success'); setAmount(''); load(); refresh(); }
    catch (err) { toast(err.message, 'error'); }
  };
  if (!s) return <div className="spinner" />;
  const inr = (c) => `₹${(c * s.coinToInr).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return (
    <>
      <TopBar title="Earnings" right={null} />
      <div className="page">
        <div className="balance-card" style={{ background: 'linear-gradient(135deg,#1fcf7c,#13a35d)' }}>
          <div style={{ fontWeight: 800, opacity: .9 }}>Available to withdraw</div>
          <div className="amt"><Coins value={s.profile.earnings} /></div>
          <div style={{ fontWeight: 700, opacity: .9, fontSize: 13 }}>≈ {inr(s.profile.earnings)} · lifetime <Coins value={s.profile.total_earned} /></div>
        </div>
        <form className="card" style={{ padding: 16 }} onSubmit={request}>
          <b style={{ display: 'block', marginBottom: 10 }}>Request payout</b>
          <div className="field"><label htmlFor="amt">Coins (min 100)</label><input id="amt" type="number" min={100} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(s.profile.earnings)} /></div>
          {amount > 0 && <p className="faint" style={{ marginTop: -6, marginBottom: 10 }}>You'll receive {inr(amount)}</p>}
          <div className="field"><label htmlFor="upi">UPI ID</label><input id="upi" className="input" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@bank" /></div>
          <button className="btn btn-green btn-block">Request payout</button>
        </form>
        {s.payouts.length > 0 && <>
          <div className="section-title">Payouts</div>
          {s.payouts.map((p) => (
            <div key={p.id} className="txn"><div><b>{inr(p.amount)}</b><div className="faint">{p.amount} coins · {p.upi} · {timeAgo(p.created_at)}</div></div>
              <span className={`chip ${p.status === 'paid' ? 'chip-green' : p.status === 'rejected' ? 'chip-red' : 'chip-amber'}`}>{p.status}</span></div>
          ))}
        </>}
        <div className="section-title">Earnings history</div>
        {s.earnings.length === 0 ? <p className="faint">Nothing yet.</p> : s.earnings.map((t) => (
          <div key={t.id} className="txn"><div style={{ minWidth: 0 }}><b>{t.note}</b><div className="faint">{timeAgo(t.created_at)}</div></div>
            <div className={`amt ${t.amount > 0 ? 'plus' : 'minus'}`}>{t.amount > 0 ? '+' : ''}{t.amount}</div></div>
        ))}
      </div>
    </>
  );
}
