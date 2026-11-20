import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import Avatar from '../../components/Avatar.jsx';
import Coins from '../../components/Coins.jsx';
import Sheet from '../../components/Sheet.jsx';

export default function AdminHosts() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', city: '', languages: 'Hindi,English', gender: 'female' });
  const load = () => api('/admin/hosts').then(setRows);
  useEffect(() => { load(); }, []);

  const patch = async (h, body, msg) => {
    try { await api(`/admin/hosts/${h.id}`, { method: 'PATCH', body }); if (msg) toast(msg, 'success'); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const create = async (e) => {
    e.preventDefault();
    try { await api('/admin/hosts', { method: 'POST', body: f }); toast('Host created and approved', 'success'); setAdding(false); load(); }
    catch (err) { toast(err.message, 'error'); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <div className="admin-top"><h1>Hosts</h1><div className="spacer" /><button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add host</button></div>
      {!rows ? <div className="spinner" /> : (
        <div className="card table-wrap"><table className="t">
          <thead><tr><th>Host</th><th>Status</th><th>Audio /min</th><th>Video /min</th><th>Calls</th><th>Minutes</th><th>Balance</th><th /></tr></thead>
          <tbody>{rows.map((h) => (
            <tr key={h.id}>
              <td><div className="row"><Avatar src={h.avatar} name={h.name} size={34} online={!!h.online} busy={!!h.busy} /><div><b>{h.name}</b><div className="faint">{h.email}</div></div></div></td>
              <td>{!h.approved ? <span className="chip chip-amber">pending</span> : h.status === 'blocked' ? <span className="chip chip-red">blocked</span>
                : h.busy ? <span className="chip chip-amber">on call</span> : h.online ? <span className="chip chip-green">online</span> : <span className="chip chip-grey">offline</span>}</td>
              <td><input className="rate-input" type="number" min={0} defaultValue={h.audio_rate} aria-label="Audio rate" onBlur={(e) => Number(e.target.value) !== h.audio_rate && patch(h, { audio_rate: e.target.value }, 'Audio rate saved')} /></td>
              <td><input className="rate-input" type="number" min={0} defaultValue={h.video_rate} aria-label="Video rate" onBlur={(e) => Number(e.target.value) !== h.video_rate && patch(h, { video_rate: e.target.value }, 'Video rate saved')} /></td>
              <td>{h.calls}</td>
              <td>{Math.round(h.seconds / 60)}</td>
              <td><Coins value={h.earnings} /></td>
              <td><div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                {!h.approved ? <button className="btn btn-green btn-sm" onClick={() => patch(h, { approved: true }, `${h.name} approved`)}>Approve</button>
                  : <button className="btn btn-outline btn-sm" onClick={() => patch(h, { approved: false })}>Unapprove</button>}
                {h.status === 'active' ? <button className="btn btn-outline btn-sm" onClick={() => confirm(`Block ${h.name}?`) && patch(h, { status: 'blocked' })}>Block</button>
                  : <button className="btn btn-outline btn-sm" onClick={() => patch(h, { status: 'active' })}>Unblock</button>}
              </div></td>
            </tr>))}
            {rows.length === 0 && <tr><td colSpan={8} className="faint">No hosts yet</td></tr>}
          </tbody></table></div>
      )}
      {adding && (
        <Sheet title="Add a host" onClose={() => setAdding(false)}>
          <form onSubmit={create}>
            <div className="field"><label>Name</label><input className="input" value={f.name} onChange={set('name')} required /></div>
            <div className="field"><label>Email</label><input className="input" type="email" value={f.email} onChange={set('email')} required /></div>
            <div className="field"><label>Temporary password</label><input className="input" type="text" value={f.password} onChange={set('password')} required minLength={6} /></div>
            <div className="field"><label>City</label><input className="input" value={f.city} onChange={set('city')} /></div>
            <div className="field"><label>Languages</label><input className="input" value={f.languages} onChange={set('languages')} /></div>
            <div className="field"><label>Gender</label><select className="input" value={f.gender} onChange={set('gender')}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></div>
            <button className="btn btn-primary btn-block">Create host</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
