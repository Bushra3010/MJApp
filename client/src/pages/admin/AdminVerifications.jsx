// Host identity verification queue: ID photo + selfie side by side, confirm gender, verify or reject.
import { useEffect, useState } from 'react';
import { api, timeAgo } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import Avatar from '../../components/Avatar.jsx';

const TABS = [['pending', 'To review'], ['verified', 'Verified'], ['rejected', 'Rejected']];
const ID_NAMES = { aadhaar: 'Aadhaar card', pan: 'PAN card', voter: 'Voter ID', driving: 'Driving licence', passport: 'Passport' };

/** Loads a private verification photo (admin session cookie) as an object URL. */
function useDoc(hostId, kind, on) {
  const [url, setUrl] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!on) return undefined;
    let u = null; let dead = false;
    fetch(`/api/admin/hosts/${hostId}/verification/${kind}`, { credentials: 'same-origin' })
      .then(async (r) => { if (!r.ok) { if (!dead) setMissing(true); return; } u = URL.createObjectURL(await r.blob()); if (!dead) setUrl(u); })
      .catch(() => !dead && setMissing(true));
    return () => { dead = true; if (u) URL.revokeObjectURL(u); };
  }, [hostId, kind, on]);
  return { url, missing };
}

function Photo({ hostId, kind, label, on }) {
  const { url, missing } = useDoc(hostId, kind, on);
  return (
    <figure className="vr-photo">
      {url ? <a href={url} target="_blank" rel="noreferrer" title="Open full size"><img src={url} alt={label} /></a>
        : <div className="vr-empty">{missing ? 'Photo not available' : 'Loading…'}</div>}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function Card({ h, onDone }) {
  const toast = useToast();
  const [gender, setGender] = useState(h.gender || '');
  const [approve, setApprove] = useState(!h.approved);
  const [busy, setBusy] = useState(false);
  const pending = h.kyc_status === 'pending';

  const decide = async (verification) => {
    let note;
    if (verification === 'rejected') {
      note = prompt(`Why is ${h.name}'s verification rejected? (shown to the host)`, 'Photo is blurry — please upload a clearer one');
      if (note === null) return;
    } else if (!gender) { toast("Choose the gender shown on the ID first", 'error'); return; }
    setBusy(true);
    try {
      await api(`/admin/hosts/${h.id}`, { method: 'PATCH', body: {
        verification, note, ...(verification === 'verified' ? { gender, ...(approve && !h.approved ? { approved: true } : {}) } : {}),
      } });
      toast(verification === 'verified' ? `${h.name} verified${approve && !h.approved ? ' and approved' : ''}` : `${h.name}'s verification rejected`, 'success');
      onDone();
      window.dispatchEvent(new Event('mj:verification'));
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="card vr-card">
      <div className="row vr-head">
        <Avatar src={h.avatar} name={h.name} size={44} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b>{h.name}</b>
          <div className="faint">{[h.email, h.phone].filter(Boolean).join(' · ')}</div>
        </div>
        <span className={`chip ${h.kyc_status === 'verified' ? 'chip-green' : h.kyc_status === 'rejected' ? 'chip-red' : 'chip-amber'}`}>
          {h.kyc_status === 'pending' ? 'Waiting' : h.kyc_status === 'verified' ? `Verified${h.gender_verified ? ` · ${h.gender}` : ''}` : 'Rejected'}
        </span>
      </div>
      <div className="vr-meta">
        <span><b>ID:</b> {ID_NAMES[h.kyc_id_type] || h.kyc_id_type || '—'}</span>
        <span><b>Profile gender:</b> {h.gender || 'not set'}</span>
        {h.city && <span><b>City:</b> {h.city}</span>}
        {h.submitted_at && <span><b>Sent:</b> {timeAgo(h.submitted_at)}</span>}
        <span><b>Account:</b> {h.approved ? 'approved' : 'not approved yet'}{h.status === 'blocked' ? ' · blocked' : ''}</span>
      </div>
      {pending ? (<>
        <div className="vr-photos">
          <Photo hostId={h.id} kind="id" label="ID document" on />
          <Photo hostId={h.id} kind="selfie" label="Selfie" on />
        </div>
        <p className="faint" style={{ margin: '8px 0' }}>Check the face on the ID matches the selfie, the ID looks genuine, and note the gender on the ID.</p>
        <div className="vr-actions">
          <label className="field" style={{ margin: 0 }}>
            <span className="faint">Gender on the ID</span>
            <select className="input" value={gender} onChange={(e) => setGender(e.target.value)} aria-label={`Gender on ${h.name}'s ID`}>
              <option value="">Choose…</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
            </select>
          </label>
          {!h.approved && (
            <label className="check" style={{ margin: 0 }}>
              <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
              <span>Also approve the host account</span>
            </label>
          )}
          <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => decide('rejected')}>Reject</button>
            <button className="btn btn-green btn-sm" disabled={busy} onClick={() => decide('verified')}>{approve && !h.approved ? 'Verify & approve' : 'Verify'}</button>
          </div>
        </div>
        {h.gender && gender && gender !== h.gender && <p className="faint" style={{ color: 'var(--amber)', marginTop: 6 }}>The profile says {h.gender}; it will be corrected to {gender}.</p>}
      </>) : h.kyc_status === 'rejected' ? (
        <p className="faint" style={{ marginTop: 8 }}>Reason given: {h.kyc_note || '—'}. The host can send new photos.</p>
      ) : (
        <p className="faint" style={{ marginTop: 8 }}>Photos were deleted after verification.</p>
      )}
    </div>
  );
}

export default function AdminVerifications() {
  const { socket } = useAuth();
  const [tab, setTab] = useState('pending');
  const [data, setData] = useState(null);
  const load = () => api(`/admin/verifications?status=${tab}`).then(setData).catch(() => setData({ counts: {}, hosts: [] }));
  useEffect(() => {
    setData(null); load();
    const on = () => load();
    socket?.on('admin:verification', on);
    return () => socket?.off('admin:verification', on);
  }, [tab, socket]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <h1>Host verification</h1>
      <p className="faint" style={{ marginBottom: 12 }}>Hosts send a photo of a government ID and a selfie from the host app (Account → Verification). Only verified hosts can go online.</p>
      <div className="filters" style={{ margin: '0 0 14px', padding: 0 }}>
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {l}{data?.counts?.[k] !== undefined ? ` (${data.counts[k]})` : ''}
          </button>
        ))}
      </div>
      {!data ? <div className="spinner" /> : data.hosts.length === 0 ? (
        <div className="empty"><div className="big">{tab === 'pending' ? '✅' : '🗂️'}</div>
          <b>{tab === 'pending' ? 'Nothing to review' : 'None yet'}</b>
          <p>{tab === 'pending' ? 'New verification requests appear here the moment a host sends them.' : ''}</p></div>
      ) : <div className="vr-list">{data.hosts.map((h) => <Card key={h.id} h={h} onDone={load} />)}</div>}
    </>
  );
}
