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
  const [review, setReview] = useState(null); // { host, id, selfie } object URLs while reviewing verification
  const openReview = async (h) => {
    const get = async (kind) => {
      const r = await fetch(`/api/admin/hosts/${h.id}/verification/${kind}`, { credentials: 'same-origin' });
      return r.ok ? URL.createObjectURL(await r.blob()) : null;
    };
    setReview({ host: h, id: await get('id'), selfie: await get('selfie') });
  };
  const closeReview = () => { if (review) { [review.id, review.selfie].forEach((u) => u && URL.revokeObjectURL(u)); } setReview(null); };
  const decide = async (verification) => {
    const note = verification === 'rejected' ? prompt('Reason shown to the host', 'Photo is blurry — please upload a clearer one') : null;
    if (verification === 'rejected' && note === null) return;
    await patch(review.host, { verification, note }, verification === 'verified' ? `${review.host.name} verified` : 'Verification rejected');
    closeReview();
  };
  const bonus = async (h) => {
    const v = prompt(`Bonus coins for ${h.name}`, '100');
    if (!v) return;
    const note = prompt('Note shown to the host', 'Daily bonus') || 'Bonus';
    try { await api(`/admin/hosts/${h.id}/bonus`, { method: 'POST', body: { amount: Number(v), note } }); toast(`+${v} bonus sent to ${h.name}`, 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const KYC = { none: ['—', 'chip-grey'], pending: ['Review', 'chip-amber'], verified: ['Verified', 'chip-green'], rejected: ['Rejected', 'chip-red'] };
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
        <div className="card table-wrap" tabIndex={0} role="region" aria-label="Table"><table className="t">
          <thead><tr><th>Host</th><th>Status</th><th>Verification</th><th>Level</th><th>Rate (video · audio)</th><th>Calls</th><th>Minutes</th><th>Balance</th><th /></tr></thead>
          <tbody>{rows.map((h) => (
            <tr key={h.id}>
              <td><div className="row"><Avatar src={h.avatar} name={h.name} size={34} online={!!h.online} busy={!!h.busy} /><div><b>{h.name}</b><div className="faint">{h.email}</div></div></div></td>
              <td>{!h.approved ? <span className="chip chip-amber">pending</span> : h.status === 'blocked' ? <span className="chip chip-red">blocked</span>
                : h.busy ? <span className="chip chip-amber">on call</span> : h.online ? <span className="chip chip-green">online</span> : <span className="chip chip-grey">offline</span>}</td>
              <td>{h.kyc_status === 'pending'
                ? <button className="btn btn-sm btn-primary" onClick={() => openReview(h)}>Review ID</button>
                : <span className={`chip ${(KYC[h.kyc_status] || KYC.none)[1]}`} title={h.kyc_note || ''}>{(KYC[h.kyc_status] || KYC.none)[0]}</span>}</td>
              <td>
                <select className="rate-input" style={{ width: 92 }} aria-label="Level" value={h.level_override ?? ''} onChange={(e) => patch(h, { level: e.target.value === '' ? null : Number(e.target.value) }, e.target.value === '' ? 'Level set automatically' : `Level set to ${e.target.value}`)}>
                  <option value="">Auto ★{h.level}</option>
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>★ {n}</option>)}
                </select>
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{h.video_rate} · {h.audio_rate}<span className="faint"> (tier {h.rate_level})</span></td>
              <td>{h.calls}</td>
              <td>{Math.round(h.seconds / 60)}</td>
              <td><Coins value={h.earnings} /></td>
              <td><div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                {!h.approved ? <button className="btn btn-green btn-sm" onClick={() => patch(h, { approved: true }, `${h.name} approved`)}>Approve</button>
                  : <button className="btn btn-outline btn-sm" onClick={() => patch(h, { approved: false })}>Unapprove</button>}
                <button className="btn btn-sm btn-outline" onClick={() => bonus(h)}>Bonus</button>
                {h.status === 'active' ? <button className="btn btn-outline btn-sm" onClick={() => confirm(`Block ${h.name}?`) && patch(h, { status: 'blocked' })}>Block</button>
                  : <button className="btn btn-outline btn-sm" onClick={() => patch(h, { status: 'active' })}>Unblock</button>}
              </div></td>
            </tr>))}
            {rows.length === 0 && <tr><td colSpan={8} className="faint">No hosts yet</td></tr>}
          </tbody></table></div>
      )}
      {review && (
        <Sheet title={`Verify ${review.host.name}`} onClose={closeReview}>
          <p className="faint" style={{ marginBottom: 10 }}>ID type: <b>{review.host.kyc_id_type || '—'}</b>. Check the name and face match, and the ID looks genuine.</p>
          <div className="kyc-grid" style={{ marginBottom: 14 }}>
            <figure style={{ margin: 0 }}>{review.id ? <img src={review.id} alt="ID document" style={{ width: '100%', borderRadius: 10 }} /> : <p className="faint">No ID photo</p>}<figcaption className="faint">ID</figcaption></figure>
            <figure style={{ margin: 0 }}>{review.selfie ? <img src={review.selfie} alt="Selfie" style={{ width: '100%', borderRadius: 10 }} /> : <p className="faint">No selfie</p>}<figcaption className="faint">Selfie</figcaption></figure>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => decide('rejected')}>Reject</button>
            <button className="btn btn-green" style={{ flex: 1 }} onClick={() => decide('verified')}>Verify</button>
          </div>
          <p className="faint" style={{ marginTop: 10 }}>Photos are deleted automatically once the host is verified.</p>
        </Sheet>
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
