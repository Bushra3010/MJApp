import { useEffect, useState } from 'react';
import { api, timeAgo } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import Avatar from '../../components/Avatar.jsx';
import Coins from '../../components/Coins.jsx';
import Sheet from '../../components/Sheet.jsx';

export default function AdminUsers() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [credit, setCredit] = useState(null);
  const [amt, setAmt] = useState('');
  const load = () => api(`/admin/users?q=${encodeURIComponent(q)}`).then(setRows);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]); // eslint-disable-line

  const setStatus = async (u, status) => {
    if (status === 'blocked' && !confirm(`Block ${u.name}? They will be logged out.`)) return;
    try { await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status } }); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (u) => {
    const typed = prompt(`Permanently delete ${u.name}${u.email ? ` (${u.email})` : ''}?\n\nTheir account, chats, photos and reviews are removed and cannot be restored. Call and payment records stay, anonymised.\n\nType DELETE to confirm.`);
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== 'DELETE') { toast('Not deleted — type DELETE to confirm', 'error'); return; }
    try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); toast(`${u.name} deleted`, 'success'); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const doCredit = async (e) => {
    e.preventDefault();
    try { await api(`/admin/users/${credit.id}/credit`, { method: 'POST', body: { amount: Number(amt) } }); toast('Balance updated', 'success'); setCredit(null); setAmt(''); load(); }
    catch (err) { toast(err.message, 'error'); }
  };
  return (
    <>
      <div className="admin-top"><h1>Users</h1><div className="spacer" /><input className="input" style={{ maxWidth: 280 }} placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!rows ? <div className="spinner" /> : (
        <div className="card table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="t">
          <thead><tr><th>User</th><th>Email</th><th>Coins</th><th>Joined</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id}>
              <td><div className="row"><Avatar src={u.avatar} name={u.name} size={34} /><b>{u.name}</b></div></td>
              <td className="muted">{u.email}</td>
              <td><Coins value={u.coins} /></td>
              <td className="muted">{timeAgo(u.created_at)}</td>
              <td><span className={`chip ${u.status === 'active' ? 'chip-green' : 'chip-red'}`}>{u.status}</span></td>
              <td><div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setCredit(u)}>Coins</button>
                {u.status === 'active' ? <button className="btn btn-outline btn-sm" onClick={() => setStatus(u, 'blocked')}>Block</button>
                  : <button className="btn btn-outline btn-sm" onClick={() => setStatus(u, 'active')}>Unblock</button>}
                <button className="btn btn-danger btn-sm" onClick={() => remove(u)}>Delete</button>
              </div></td>
            </tr>))}
            {rows.length === 0 && <tr><td colSpan={6} className="faint">No users found</td></tr>}
          </tbody></table></div>
      )}
      {credit && (
        <Sheet title={`Adjust coins — ${credit.name}`} onClose={() => setCredit(null)}>
          <form onSubmit={doCredit}>
            <p className="faint" style={{ marginBottom: 10 }}>Current balance: <Coins value={credit.coins} />. Use a negative number to deduct.</p>
            <div className="field"><input className="input" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="e.g. 100" autoFocus /></div>
            <button className="btn btn-primary btn-block">Apply</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
