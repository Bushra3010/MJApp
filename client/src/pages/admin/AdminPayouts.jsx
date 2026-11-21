import { useEffect, useState } from 'react';
import { api, timeAgo } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';

export default function AdminPayouts() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const load = () => api('/admin/payouts').then(setRows);
  useEffect(() => { load(); }, []);
  const act = async (p, status) => {
    if (!confirm(status === 'paid' ? `Mark ₹${p.inr} to ${p.upi} as paid? Send the money first.` : 'Reject and return coins to the host?')) return;
    try { await api(`/admin/payouts/${p.id}`, { method: 'PATCH', body: { status } }); toast('Payout updated', 'success'); load(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <>
      <h1>Payouts</h1>
      {!rows ? <div className="spinner" /> : (
        <div className="card table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="t">
          <thead><tr><th>Requested</th><th>Host</th><th>Coins</th><th>Amount</th><th>UPI</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}>
              <td className="muted">{timeAgo(p.created_at)}</td><td><b>{p.host_name}</b><div className="faint">{p.host_email}</div></td>
              <td>{p.amount}</td><td><b>₹{p.inr}</b></td><td>{p.upi}</td>
              <td><span className={`chip ${p.status === 'paid' ? 'chip-green' : p.status === 'rejected' ? 'chip-red' : 'chip-amber'}`}>{p.status}</span></td>
              <td>{p.status === 'pending' && <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn btn-green btn-sm" onClick={() => act(p, 'paid')}>Mark paid</button>
                <button className="btn btn-outline btn-sm" onClick={() => act(p, 'rejected')}>Reject</button>
              </div>}</td>
            </tr>))}
            {rows.length === 0 && <tr><td colSpan={7} className="faint">No payout requests</td></tr>}
          </tbody></table></div>
      )}
    </>
  );
}
