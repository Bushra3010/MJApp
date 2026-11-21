import { useEffect, useState } from 'react';
import { api, mmss } from '../../lib/api.js';

export default function AdminCalls() {
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState('calls');
  const [txns, setTxns] = useState(null);
  const [pays, setPays] = useState(null);
  useEffect(() => { api('/admin/calls').then(setRows); api('/admin/transactions').then(setTxns); api('/admin/payments').then(setPays); }, []);
  const dt = (s) => s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString() : '—';
  return (
    <>
      <div className="admin-top"><h1>Activity</h1></div>
      <div className="tabs" style={{ maxWidth: 420 }}>
        <button className={tab === 'calls' ? 'on' : ''} onClick={() => setTab('calls')}>Calls</button>
        <button className={tab === 'txns' ? 'on' : ''} onClick={() => setTab('txns')}>Coin ledger</button>
        <button className={tab === 'pays' ? 'on' : ''} onClick={() => setTab('pays')}>Payments</button>
      </div>
      {tab === 'pays' && (!pays ? <div className="spinner" /> : (
        <div className="card table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="t">
          <thead><tr><th>When</th><th>User</th><th>Coins</th><th>Amount</th><th>Provider</th><th>Status</th><th>Payment ID</th></tr></thead>
          <tbody>{pays.map((p) => <tr key={p.id}><td className="muted">{dt(p.created_at)}</td><td>{p.name}<div className="faint">{p.email}</div></td><td>{p.coins}</td><td><b>₹{p.amount_paise / 100}</b></td><td>{p.provider}</td>
            <td><span className={`chip ${p.status === 'paid' ? 'chip-green' : p.status === 'failed' ? 'chip-red' : 'chip-grey'}`}>{p.status}</span></td><td className="muted">{p.payment_id || '—'}</td></tr>)}
            {pays.length === 0 && <tr><td colSpan={7} className="faint">No payments yet</td></tr>}</tbody></table></div>
      ))}
      {tab === 'pays' ? null : tab === 'calls' ? (!rows ? <div className="spinner" /> : (
        <div className="card table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="t">
          <thead><tr><th>#</th><th>Started</th><th>User</th><th>Host</th><th>Type</th><th>Status</th><th>Duration</th><th>Rate</th><th>Coins</th><th>End reason</th></tr></thead>
          <tbody>{rows.map((c) => <tr key={c.id}><td>{c.id}</td><td className="muted">{dt(c.created_at)}</td><td>{c.user_name}</td><td>{c.host_name}</td><td>{c.type}</td><td>{c.status}</td><td>{mmss(c.seconds)}</td><td>{c.rate}</td><td>{c.coins_charged}</td><td className="muted">{c.end_reason || ''}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={10} className="faint">No calls yet</td></tr>}</tbody></table></div>
      )) : (!txns ? <div className="spinner" /> : (
        <div className="card table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="t">
          <thead><tr><th>When</th><th>Account</th><th>Kind</th><th>Amount</th><th>Balance after</th><th>Note</th></tr></thead>
          <tbody>{txns.map((t) => <tr key={t.id}><td className="muted">{dt(t.created_at)}</td><td>{t.name} <span className="faint">({t.role})</span></td><td>{t.kind}</td><td style={{ color: t.amount > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>{t.amount}</td><td>{t.balance_after}</td><td className="muted">{t.note}</td></tr>)}</tbody></table></div>
      ))}
    </>
  );
}
