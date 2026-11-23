// Google (via Supabase) sends people back here with ?code=…; we finish sign-in and continue into the app.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { finishGoogleSignIn, recallRef } from '../lib/supabaseAuth.js';
import { APP, APP_NAME, APP_URL } from '../apps.js';

const HOME = { user: '/app', host: '/host', admin: '/admin' };

export default function AuthCallback() {
  const nav = useNavigate();
  const { adopt } = useAuth();
  const [error, setError] = useState('');
  const [wrongApp, setWrongApp] = useState(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const q = new URLSearchParams(location.search);
    const fail = q.get('error_description') || q.get('error');
    const code = q.get('code');
    history.replaceState(null, '', '/auth/callback'); // keep the code out of history
    if (fail) { setError(fail.includes('cancel') || fail.includes('denied') ? 'Google sign-in was cancelled.' : fail); return; }
    if (!code) { setError('Google sign-in did not complete. Please try again.'); return; }
    (async () => {
      try {
        const accessToken = await finishGoogleSignIn(code);
        const refCode = APP === 'host' ? recallRef() : undefined;
        const r = await api('/auth/google', { method: 'POST', body: { accessToken, ...(refCode ? { refCode } : {}) } });
        if (r.needsProfile) { nav('/login?mode=signup', { replace: true, state: { oauth: { token: accessToken, provider: 'google', name: r.name, email: r.email } } }); return; }
        adopt(r.user);
        nav(HOME[APP], { replace: true });
      } catch (e) {
        setError(e.message);
        if (e.data?.code === 'WRONG_APP') setWrongApp(e.data.role);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="landing">
      <img className="logo" src="/logo.png" alt="Milo Julo" style={{ width: 110, marginBottom: 16 }} />
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        {!error ? (<><div className="spinner" style={{ margin: '8px auto 14px' }} /><p className="muted">Signing you in with Google…</p></>) : (<>
          <p className="error-text" style={{ margin: '0 0 14px' }}>{error}</p>
          {wrongApp && <a className="btn btn-primary btn-block" href={`${APP_URL[wrongApp]}/login`} style={{ marginBottom: 10 }}>Open {APP_NAME[wrongApp]}</a>}
          <Link className="btn btn-outline btn-block" to="/login">Back to log in</Link>
        </>)}
      </div>
    </div>
  );
}
