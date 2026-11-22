import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import TopBar from '../../components/TopBar.jsx';
import Coins from '../../components/Coins.jsx';
import Icon from '../../components/Icon.jsx';

export default function HostWallet() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [s, setS] = useState(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api('/host/stats').then(setS);
  useEffect(() => { load(); }, []);

  const hp = s?.profile || user.host || {};
  const dest = hp.payout_method === 'upi' ? `UPI · ${hp.upi_id}` : hp.payout_method === 'bank' ? `Bank ••••${hp.bank_account_last4} · ${hp.bank_ifsc}` : null;

  const withdraw = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/host/payouts', { method: 'POST', body: { amount: Number(amount) } }); toast('Withdrawal requested', 'success'); setAmount(''); load(); refresh(); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  if (!s) return <div className="spinner" />;
  const inr = (c) => `₹${(c * s.coinToInr).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return (
    <>
      <TopBar title="Wallet" right={null} />
      <div className="page">
        <div className="balance-card" style={{ background: 'linear-gradient(135deg,#1fcf7c,#13a35d)' }}>
          <div style={{ fontWeight: 800, opacity: .9 }}>Available balance</div>
          <div className="amt"><Coins value={s.profile.earnings} /></div>
          <div style={{ fontWeight: 700, opacity: .9, fontSize: 13 }}>≈ {inr(s.profile.earnings)}</div>
        </div>
        <div className="h-stats two">
          <div className="card stat"><b><Coins value={s.today} /></b><span>Today's income</span></div>
          <div className="card stat"><b><Coins value={s.profile.total_earned} /></b><span>Total income</span></div>
        </div>

        <form className="card" style={{ padding: 16 }} onSubmit={withdraw}>
          <b style={{ display: 'block', marginBottom: 10 }}>Withdraw money</b>
          {dest ? (
            <div className="google-who" style={{ justifyContent: 'space-between' }}>
              <span><Icon name="cash" size={16} /> {dest}</span>
              <Link className="link" to="/host/bank">Change</Link>
            </div>
          ) : (
            <p className="muted" style={{ marginBottom: 12 }}>Add where you want to be paid first. <Link className="link" to="/host/bank">Add bank or UPI details →</Link></p>
          )}
          <div className="field"><label htmlFor="amt">Coins (min 100)</label><input id="amt" type="number" min={100} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(s.profile.earnings)} disabled={!dest} /></div>
          {amount > 0 && <p className="faint" style={{ marginTop: -6, marginBottom: 10 }}>You'll receive {inr(amount)}</p>}
          <button className="btn btn-green btn-block" disabled={!dest || busy}>{busy ? 'Requesting…' : 'Withdraw'}</button>
        </form>

        {s.payouts.length > 0 && <>
          <div className="section-title">Withdrawals</div>
          {s.payouts.map((p) => (
            <div key={p.id} className="txn"><div><b>{inr(p.amount)}</b><div className="faint">{p.amount} coins · {p.upi} · {timeAgo(p.created_at)}</div></div>
              <span className={`chip ${p.status === 'paid' ? 'chip-green' : p.status === 'rejected' ? 'chip-red' : 'chip-amber'}`}>{p.status}</span></div>
          ))}
        </>}
        <div className="section-title">Transaction history</div>
        {s.earnings.length === 0 ? <p className="faint">Nothing yet.</p> : s.earnings.map((t) => (
          <div key={t.id} className="txn"><div style={{ minWidth: 0 }}><b>{t.note}</b><div className="faint">{timeAgo(t.created_at)}</div></div>
            <div className={`amt ${t.amount > 0 ? 'plus' : 'minus'}`}>{t.amount > 0 ? '+' : ''}{t.amount}</div></div>
        ))}
      </div>
    </>
  );
}
