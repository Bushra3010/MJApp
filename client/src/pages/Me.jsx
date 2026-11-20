import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import TopBar from '../components/TopBar.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import Coins from '../components/Coins.jsx';
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
        <div className="me-hero">
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Change photo" className="press" style={{ position: 'relative', borderRadius: '50%' }}>
            <Avatar src={user.avatar} name={user.name} size={76} />
            <span className="cam-badge">{uploading ? '…' : <Icon name="camera" size={16} />}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
          <div style={{ minWidth: 0 }}>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
            <span className="chip" style={{ marginTop: 8, background: 'rgba(255,255,255,.22)', color: '#fff' }}>{user.role === 'host' ? '★ Host' : '♥ Member'}</span>
          </div>
        </div>

        <div className="card menu-card">
          {user.role === 'user' && (
            <Link to="/app/wallet" className="menu-row"><span className="ic amber"><Icon name="wallet" size={20} /></span><span className="t">Wallet<small>Balance and coin history</small></span><Coins value={user.coins} /><Icon name="chevron" size={18} className="chev" /></Link>
          )}
          <Link to={`${base}/calls`} className="menu-row"><span className="ic violet"><Icon name="history" size={20} /></span><span className="t">Call history<small>Every call you've made</small></span><Icon name="chevron" size={18} className="chev" /></Link>
          <Link to={`${base}/settings`} className="menu-row"><span className="ic green"><Icon name="gear" size={20} /></span><span className="t">Settings & account<small>Notifications, password, privacy</small></span><Icon name="chevron" size={18} className="chev" /></Link>
        </div>

        <details className="card menu-card">
          <summary className="menu-row"><span className="ic"><Icon name="edit" size={20} /></span><span className="t">Edit profile<small>Name, city, languages, about you</small></span><Icon name="chevron" size={18} className="chev" /></summary>
          <form onSubmit={save} className="edit-body">
            <div className="field"><label htmlFor="n">Name</label><input id="n" className="input" value={f.name} onChange={set('name')} /></div>
            <div className="field"><label htmlFor="c">City</label><input id="c" className="input" value={f.city} onChange={set('city')} /></div>
            <div className="field"><label htmlFor="l">Languages (comma separated)</label><input id="l" className="input" value={f.languages} onChange={set('languages')} /></div>
            <div className="field"><label htmlFor="b">About you</label><textarea id="b" rows={3} className="input" value={f.bio} onChange={set('bio')} maxLength={300} placeholder="A line or two about what you love to talk about" /></div>
            <button className="btn btn-primary btn-block" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
          </form>
        </details>
        <p className="faint" style={{ textAlign: 'center', display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}><Icon name="shield" size={14} />Your email is never shown to others</p>
      </div>
    </>
  );
}
