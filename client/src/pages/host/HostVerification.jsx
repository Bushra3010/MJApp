// Host verification: a photo of a government ID + a selfie. Reviewed by admins; photos are deleted after approval.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import { preparePhoto } from '../../lib/image.js';
import Icon from '../../components/Icon.jsx';

const IDS = [['aadhaar', 'Aadhaar card'], ['pan', 'PAN card'], ['voter', 'Voter ID'], ['driving', 'Driving licence'], ['passport', 'Passport']];
const STATUS = {
  none: ['Not verified', 'chip-grey', 'Verified hosts get a ✓ badge and more calls.'],
  pending: ['Under review', 'chip-amber', "We'll check your photos within 24 hours."],
  verified: ['Verified', 'chip-green', 'Members see a ✓ badge on your profile.'],
  rejected: ['Not approved', 'chip-red', ''],
};

function PhotoPick({ label, hint, file, onPick, capture }) {
  const ref = useRef(null);
  const url = file ? URL.createObjectURL(file) : null;
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return (
    <button type="button" className="kyc-pick card" onClick={() => ref.current?.click()}>
      {url ? <img src={url} alt="" /> : <Icon name="camera" size={26} />}
      <b>{label}</b><span>{file ? 'Tap to retake' : hint}</span>
      <input ref={ref} type="file" accept="image/*" capture={capture} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
    </button>
  );
}

export default function HostVerification() {
  const { setUser } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [v, setV] = useState(null);
  const [idType, setIdType] = useState('aadhaar');
  const [idFile, setIdFile] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/host/verification').then(setV); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!idFile || !selfie) { toast('Add both photos', 'error'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('idType', idType);
      fd.append('id', await preparePhoto(idFile, 1400, { crop: false }), 'id.jpg');
      fd.append('selfie', await preparePhoto(selfie, 900, { crop: false }), 'selfie.jpg');
      const r = await api('/host/verification', { method: 'POST', form: fd });
      setV(r); setUser((u) => ({ ...u, host: { ...u.host, kyc_status: r.status } }));
      toast('Sent for review', 'success');
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  if (!v) return <div className="spinner" />;
  const [label, chip, help] = STATUS[v.status] || STATUS.none;
  const canSubmit = v.status === 'none' || v.status === 'rejected';
  return (
    <>
      <header className="topbar"><button className="icon-btn press" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button><h1>Verification</h1></header>
      <div className="page">
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div className="row"><b>Status</b><div className="spacer" /><span className={`chip ${chip}`}>{label}</span></div>
          <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>{v.status === 'rejected' && v.note ? `Reason: ${v.note}. Please try again.` : help}</p>
        </div>
        {canSubmit && (
          <form onSubmit={submit}>
            <div className="field"><label htmlFor="idt">ID type</label>
              <select id="idt" className="input" value={idType} onChange={(e) => setIdType(e.target.value)}>{IDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
            <div className="kyc-grid">
              <PhotoPick label="Photo of your ID" hint="Front side, all corners visible" file={idFile} onPick={setIdFile} capture="environment" />
              <PhotoPick label="Selfie" hint="Your face, clearly lit" file={selfie} onPick={setSelfie} capture="user" />
            </div>
            <p className="faint" style={{ margin: '12px 0', display: 'flex', gap: 6, alignItems: 'flex-start' }}><Icon name="shield" size={14} />Only our verification team sees these photos. They're deleted once you're verified.{idType === 'aadhaar' ? ' You can cover the first 8 digits of your Aadhaar number.' : ''}</p>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Uploading…' : 'Submit for verification'}</button>
          </form>
        )}
      </div>
    </>
  );
}
