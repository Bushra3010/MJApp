import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import TopBar from '../components/TopBar.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { preparePhoto } from '../lib/image.js';

export default function Me() {
  const { user, setUser } = useAuth();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const [f, setF] = useState({ name: user.name, bio: user.bio || '', city: user.city || '', languages: user.languages || '' });
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { setUser(await api('/me', { method: 'PATCH', body: f })); toast('Profile saved', 'success'); }
    catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };
  const onPhoto = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const blob = await preparePhoto(file);
      const fd = new FormData(); fd.append('photo', blob, blob.type === 'image/webp' ? 'photo.webp' : 'photo.jpg');
      setUser(await api('/me/avatar', { method: 'POST', form: fd })); toast('Photo updated', 'success'); }
    catch (err) { toast(err.message, 'error'); } finally { setUploading(false); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const base = user.role === 'host' ? '/host' : '/app';
  return (
    <>
      <TopBar title="Profile" />
      <div className="page">
        <div className="profile-hero">
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Change photo" style={{ position: 'relative', display: 'block', margin: '0 auto' }}>
            <Avatar src={user.avatar} name={user.name} size={96} />
            <span className="chip" style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>{uploading ? '…' : '📷 Edit'}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
          <h2 style={{ fontSize: 22, marginTop: 14 }}>{user.name}</h2>
          <p className="faint">{user.email} · {user.role === 'host' ? 'Host' : 'Member'}</p>
        </div>
        <Link to={`${base}/calls`} className="card list-row" style={{ padding: '14px 16px', marginBottom: 16 }}>
          <Icon name="history" /><div className="txt"><b>Call history</b></div><Icon name="back" style={{ transform: 'rotate(180deg)' }} />
        </Link>
        <form onSubmit={save} className="card" style={{ padding: 16 }}>
          <div className="field"><label htmlFor="n">Name</label><input id="n" className="input" value={f.name} onChange={set('name')} /></div>
          <div className="field"><label htmlFor="c">City</label><input id="c" className="input" value={f.city} onChange={set('city')} /></div>
          <div className="field"><label htmlFor="l">Languages (comma separated)</label><input id="l" className="input" value={f.languages} onChange={set('languages')} /></div>
          <div className="field"><label htmlFor="b">About you</label><textarea id="b" rows={3} className="input" value={f.bio} onChange={set('bio')} maxLength={300} /></div>
          <button className="btn btn-primary btn-block" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        </form>
        <Link to={`${base}/settings`} className="btn btn-outline btn-block" style={{ marginTop: 16 }}><Icon name="gear" size={18} />Settings & account</Link>
      </div>
    </>
  );
}
