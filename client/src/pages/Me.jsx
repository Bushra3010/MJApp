import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { initials, warmFor } from '../components/Avatar.jsx';
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
  const [editing, setEditing] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { setUser(await api('/me', { method: 'PATCH', body: f })); toast('Profile saved', 'success'); setEditing(false); }
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
  const langs = (user.languages || '').split(',').map((l) => l.trim()).filter(Boolean);
  return (
    <>
      <header className="p-head">
        <Link className="circle-btn" to={`${base}/settings`} aria-label="Settings"><Icon name="gear" size={18} /></Link>
        <div style={{ minWidth: 0 }}>
          <h1>{user.name}{user.role === 'host' && <span className="verified"><Icon name="verified" size={20} /></span>}</h1>
          <small>{user.city || 'Add your city'}</small>
        </div>
        <button className="circle-btn" onClick={() => setEditing((v) => !v)} aria-label="Edit profile" aria-expanded={editing}><Icon name="edit" size={17} /></button>
      </header>
      <div className="p-photo">
        {user.avatar ? <img src={user.avatar} alt="" /> : <div className="ini" style={{ background: warmFor(user.name) }}>{initials(user.name)}</div>}
        <button type="button" className="cam press" onClick={() => fileRef.current?.click()} aria-label="Change photo">{uploading ? '…' : <Icon name="camera" size={20} />}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
      </div>
      <div className="p-body">
        {editing ? (
          <form onSubmit={save} className="rise">
            <div className="field"><label htmlFor="n">Name</label><input id="n" className="input" value={f.name} onChange={set('name')} /></div>
            <div className="field"><label htmlFor="c">City</label><input id="c" className="input" value={f.city} onChange={set('city')} /></div>
            <div className="field"><label htmlFor="l">Languages (comma separated)</label><input id="l" className="input" value={f.languages} onChange={set('languages')} /></div>
            <div className="field"><label htmlFor="b">About you</label><textarea id="b" rows={3} className="input" value={f.bio} onChange={set('bio')} maxLength={300} placeholder="Hi there! I love coffee, travel and late-night talks…" /></div>
            <div className="row"><button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>Cancel</button><button className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></div>
          </form>
        ) : (<>
          <div className="p-label">About</div>
          <p className="p-text">{user.bio || <span className="muted">Tell people a little about yourself — tap the pencil to add a bio.</span>}</p>
          {langs.length > 0 && <><div className="p-label">Languages</div><div className="pills">{langs.map((l) => <span key={l} className="pill2">🗣️ {l}</span>)}</div></>}
        </>)}
        <div className="p-label">Account</div>
        <div className="p-menu">
          {user.role === 'user' && (
            <Link to="/app/wallet" className="menu-row"><span className="ic amber"><Icon name="wallet" size={20} /></span><span className="t">Wallet<small>Balance and coin history</small></span><Coins value={user.coins} /><Icon name="chevron" size={18} className="chev" /></Link>
          )}
          <Link to={`${base}/calls`} className="menu-row"><span className="ic violet"><Icon name="history" size={20} /></span><span className="t">Call history<small>Every call you've made</small></span><Icon name="chevron" size={18} className="chev" /></Link>
          <Link to={`${base}/settings`} className="menu-row"><span className="ic green"><Icon name="gear" size={20} /></span><span className="t">Settings & account<small>Notifications, password, privacy</small></span><Icon name="chevron" size={18} className="chev" /></Link>
        </div>
        <p className="faint" style={{ textAlign: 'center', display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}><Icon name="shield" size={14} />Your email is never shown to others</p>
      </div>
    </>
  );
}
