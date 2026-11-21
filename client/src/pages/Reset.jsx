import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { APP, APP_URL } from '../apps.js';

export default function Reset() {
  const token = window.location.hash.slice(1); // in the fragment, so it never reaches server logs
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { adopt } = useAuth();
  const nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const res = await api('/auth/reset', { method: 'POST', body: { token, password: pw } });
      history.replaceState(null, '', '/reset');
      if (res.loginElsewhere) { window.location.href = `${APP_URL[res.loginElsewhere]}/login`; return; }
      adopt(res.user); nav({ user: '/app', host: '/host', admin: '/admin' }[APP], { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="landing">
      <img className="logo" src="/logo.png" alt="Milo Julo" style={{ width: 140, marginBottom: 16 }} />
      <form className="card auth-card" onSubmit={submit}>
        <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 14 }}>Choose a new password</h2>
        {!token ? <p className="error-text">This link is incomplete. <Link className="link" to="/login">Request a new one</Link>.</p> : (<>
          <div className="field"><label htmlFor="pw">New password</label><input id="pw" type="password" className="input" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save password & log in'}</button>
        </>)}
      </form>
    </div>
  );
}
