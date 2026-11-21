import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../lib/push.js';
import Icon from '../components/Icon.jsx';
import Sheet from '../components/Sheet.jsx';
import LegalFooter from '../components/LegalFooter.jsx';

export default function Settings() {
  const { user, logout, endSession, refresh } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [push, setPush] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [pw, setPw] = useState({ current: '', password: '' });
  const [delPw, setDelPw] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { currentSubscription().then((s) => setPush(!!s)).catch(() => {}); }, []);

  const togglePush = async () => {
    try {
      if (push) { await disablePush(); setPush(false); toast('Notifications off'); }
      else { await enablePush(); setPush(true); toast('Notifications on', 'success'); }
    } catch (e) { toast(e.message, 'error'); }
  };
  const changePw = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/me/password', { method: 'POST', body: pw }); toast(user.has_password ? 'Password changed. Other devices were signed out.' : 'Password set. You can now also log in with email.', 'success'); setSheet(null); setPw({ current: '', password: '' }); refresh?.(); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const del = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api('/me', { method: 'DELETE', body: user.has_password ? { password: delPw } : { confirm: delPw } }); endSession(); nav('/', { replace: true }); toast('Your account has been deleted'); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <header className="topbar"><button className="icon-btn press" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button><h1>Settings</h1></header>
      <div className="page settings-list">
        <div className="section-title">Notifications</div>
        <button className="card list-row" onClick={togglePush} aria-pressed={push}>
          <div className="txt"><b>{user.role === 'host' ? 'Incoming calls & messages' : 'New messages'}</b>
            <span>{pushSupported() ? (push ? 'On for this device' : 'Off for this device') : 'Not supported in this browser'}</span></div>
          <span className={`switch ${push ? 'on' : ''}`} style={push ? { background: 'var(--pink-500)' } : {}} />
        </button>
        <div className="section-title">Security</div>
        <div className="card">
          <button className="list-row" onClick={() => setSheet('pw')}><div className="txt"><b>{user.has_password ? 'Change password' : 'Set a password'}</b>{user.google_linked && <span>Signed in with Google</span>}</div></button>
          <button className="list-row" onClick={() => logout(true).then(() => nav('/'))}><div className="txt"><b>Sign out of all devices</b><span>Use this if you lost a phone</span></div></button>
          <button className="list-row" style={{ borderBottom: 0 }} onClick={() => logout().then(() => nav('/'))}><div className="txt"><b>Log out</b></div></button>
        </div>
        <div className="section-title">Account</div>
        <div className="card">
          {user.role === 'user' && <Link className="list-row" to="/app/wallet"><div className="txt"><b>Payment history</b><span>In Wallet → every coin, accounted for</span></div></Link>}
          <Link className="list-row" to="/contact"><div className="txt"><b>Help & contact</b></div></Link>
          <button className="list-row" style={{ borderBottom: 0 }} onClick={() => setSheet('delete')}><div className="txt"><b className="danger-text">Delete account</b><span>Permanently removes your profile, photos and chats</span></div></button>
        </div>
        <LegalFooter />
      </div>
      {sheet === 'pw' && (
        <Sheet title={user.has_password ? 'Change password' : 'Set a password'} onClose={() => setSheet(null)}>
          <form onSubmit={changePw}>
            {user.has_password && <div className="field"><label htmlFor="cur">Current password</label><input id="cur" type="password" className="input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required autoComplete="current-password" /></div>}
            <div className="field"><label htmlFor="new">New password</label><input id="new" type="password" className="input" minLength={8} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} required autoComplete="new-password" /></div>
            <button className="btn btn-primary btn-block" disabled={busy}>Save</button>
          </form>
        </Sheet>
      )}
      {sheet === 'delete' && (
        <Sheet title="Delete your account?" onClose={() => setSheet(null)}>
          <form onSubmit={del}>
            <p className="muted" style={{ marginBottom: 12 }}>
              This can't be undone. Your profile, photo, chats and {user.role === 'user' ? <>your <b>{user.coins} unused coins</b></> : <>your <b>unpaid earnings</b></>} will be gone for good.
            </p>
            {user.has_password
              ? <div className="field"><label htmlFor="dp">Enter your password to confirm</label><input id="dp" type="password" className="input" value={delPw} onChange={(e) => setDelPw(e.target.value)} required autoComplete="current-password" /></div>
              : <div className="field"><label htmlFor="dp">Type DELETE to confirm</label><input id="dp" className="input" value={delPw} onChange={(e) => setDelPw(e.target.value)} required autoCapitalize="characters" autoComplete="off" /></div>}
            <button className="btn btn-danger btn-block" disabled={busy}>{busy ? 'Deleting…' : 'Delete my account'}</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
