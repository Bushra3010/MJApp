import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import LegalFooter from '../components/LegalFooter.jsx';
import GoogleButton from '../components/GoogleButton.jsx';
import { APP, APP_NAME, APP_URL } from '../apps.js';

const COPY = {
  user: { login: 'Welcome back', signup: 'Create your account', cta: 'Create account' },
  host: { login: 'Host log in', signup: 'Become a host', cta: 'Apply as host' },
  admin: { login: 'Admin log in', signup: 'Set up admin account', cta: 'Create admin account' },
};

const LANGS = ['Hindi', 'English', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Punjabi', 'Odia'];
const maxDob = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10); };

export default function Login() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [wrongApp, setWrongApp] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', gender: '', birthDate: '', languages: ['Hindi', 'English'], acceptTerms: false });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const { login, register, adopt } = useAuth();
  const location = useLocation();
  const [google, setGoogle] = useState(location.state?.oauth || null); // { token, name, email } while finishing a Google sign-up
  const nav = useNavigate();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo(''); setWrongApp(null); setBusy(true);
    try {
      if (mode === 'forgot') {
        await api('/auth/forgot', { method: 'POST', body: { email: form.email } });
        setInfo('If that email has an account, a reset link is on its way. Check your inbox.');
        return;
      }
      const u = mode === 'login'
        ? await login(form.email, form.password)
        : await register({ ...form, languages: form.languages.join(',') });
      nav({ user: '/app', host: '/host', admin: '/admin' }[APP], { replace: true });
    } catch (err) { setError(err.message); if (err.data?.code === 'WRONG_APP') setWrongApp(err.data.role); } finally { setBusy(false); }
  };
  const home = { user: '/app', host: '/host', admin: '/admin' }[APP];
  const sendGoogle = async (accessToken, extra = {}) => {
    setError(''); setWrongApp(null); setBusy(true);
    try {
      const r = await api('/auth/google', { method: 'POST', body: { accessToken, ...extra } });
      if (r.needsProfile) { setGoogle({ token: accessToken, name: r.name, email: r.email }); setMode('signup'); return; }
      adopt(r.user); nav(home, { replace: true });
    } catch (err) { setError(err.message); if (err.data?.code === 'WRONG_APP') setWrongApp(err.data.role); } finally { setBusy(false); }
  };
  const finishGoogle = (e) => {
    e.preventDefault();
    sendGoogle(google.token, { birthDate: form.birthDate, gender: form.gender, languages: form.languages.join(','), acceptTerms: form.acceptTerms });
  };
  const toggleLang = (l) => setForm((f) => ({ ...f, languages: f.languages.includes(l) ? f.languages.filter((x) => x !== l) : [...f.languages, l] }));

  if (google) {
    return (
      <div className="landing">
        <img className="logo" src="/logo.png" alt="Milo Julo" style={{ width: 110, marginBottom: 16 }} />
        <form className="card auth-card" onSubmit={finishGoogle}>
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>Almost done</h2>
          <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>{APP === 'host' ? 'A few details for your host profile.' : 'A few details to finish your account.'}</p>
          <div className="google-who"><span aria-hidden="true">G</span><div><b>{google.name || 'Google account'}</b><span className="faint">{google.email}</span></div></div>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="field" style={{ flex: 1 }}><label htmlFor="gdob">Date of birth</label><input id="gdob" type="date" className="input" value={form.birthDate} onChange={set('birthDate')} max={maxDob()} required /></div>
            {APP !== 'admin' && <div className="field" style={{ flex: 1 }}><label htmlFor="ggender">Gender</label>
              <select id="ggender" className="input" value={form.gender} onChange={set('gender')}>
                <option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
              </select>
            </div>}
          </div>
          {APP !== 'admin' && <div className="field"><label>Languages you speak</label>
            <div className="filters" style={{ flexWrap: 'wrap' }}>
              {LANGS.map((l) => <button type="button" key={l} className={form.languages.includes(l) ? 'on' : ''} onClick={() => toggleLang(l)}>{l}</button>)}
            </div>
          </div>}
          <label className="check">
            <input type="checkbox" checked={form.acceptTerms} onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })} required />
            <span>I'm 18 or older and I agree to the <Link className="link" to="/terms" target="_blank">Terms</Link>, <Link className="link" to="/privacy" target="_blank">Privacy Policy</Link> and <Link className="link" to="/guidelines" target="_blank">Community Guidelines</Link>.</span>
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : COPY[APP].cta}</button>
          <p style={{ textAlign: 'center', marginTop: 14 }}><button type="button" className="link" onClick={() => { setGoogle(null); setError(''); nav('/login', { replace: true, state: null }); }}>Use a different account</button></p>
        </form>
      </div>
    );
  }

  return (
    <div className="landing">
      <Link to="/"><img className="logo" src="/logo.png" alt="Milo Julo" style={{ width: 140, marginBottom: 16 }} /></Link>
      <form className="card auth-card" onSubmit={submit}>
        {APP !== 'user' && <p className="app-badge">{APP_NAME[APP]}</p>}
        {mode === 'forgot' ? (
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 14 }}>Reset your password</h2>
        ) : APP === 'admin' ? (
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 14 }}>{COPY.admin[mode]}</h2>
        ) : (
          <div className="tabs" role="tablist">
            <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Log in</button>
            <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>{APP === 'host' ? 'Become a host' : 'Sign up'}</button>
          </div>
        )}
        {mode === 'signup' && APP === 'host' && <p className="muted" style={{ marginBottom: 14, fontSize: 14 }}>Talk to people in your language and earn for every minute. Your profile goes live after our team approves it.</p>}
        {mode === 'signup' && (<>
          <div className="field"><label htmlFor="name">Name</label><input id="name" className="input" value={form.name} onChange={set('name')} required minLength={2} maxLength={40} autoComplete="name" /></div>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="field" style={{ flex: 1 }}><label htmlFor="dob">Date of birth</label><input id="dob" type="date" className="input" value={form.birthDate} onChange={set('birthDate')} max={maxDob()} required /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="gender">Gender</label>
              <select id="gender" className="input" value={form.gender} onChange={set('gender')}>
                <option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
              </select>
            </div>
          </div>
          {APP !== 'admin' && <div className="field"><label>Languages you speak</label>
            <div className="filters" style={{ flexWrap: 'wrap' }}>
              {LANGS.map((l) => <button type="button" key={l} className={form.languages.includes(l) ? 'on' : ''} onClick={() => toggleLang(l)}>{l}</button>)}
            </div>
          </div>}
        </>)}
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" className="input" value={form.email} onChange={set('email')} required autoComplete="email" /></div>
        {mode !== 'forgot' && (
          <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" className="input" value={form.password} onChange={set('password')} required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            {mode === 'signup' && <span className="faint">At least 8 characters</span>}
          </div>
        )}
        {mode === 'signup' && (
          <label className="check">
            <input type="checkbox" checked={form.acceptTerms} onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })} required />
            <span>I'm 18 or older and I agree to the <Link className="link" to="/terms" target="_blank">Terms</Link>, <Link className="link" to="/privacy" target="_blank">Privacy Policy</Link> and <Link className="link" to="/guidelines" target="_blank">Community Guidelines</Link>.</span>
          </label>
        )}
        {error && <p className="error-text">{error}{wrongApp && <> <a className="link" href={`${APP_URL[wrongApp]}/login`}>Open {APP_NAME[wrongApp]} →</a></>}</p>}
        {info && <p className="test-banner" style={{ background: 'rgba(24,184,107,.12)', color: 'var(--green)' }}>{info}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'forgot' ? 'Send reset link' : COPY[APP].cta}
        </button>
        {mode !== 'forgot' && <GoogleButton label={mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'} onError={setError} />}
        {mode === 'login' && <p style={{ textAlign: 'center', marginTop: 14 }}><button type="button" className="link" onClick={() => { setMode('forgot'); setError(''); }}>Forgot password?</button></p>}
        {mode === 'forgot' && <p style={{ textAlign: 'center', marginTop: 14 }}><button type="button" className="link" onClick={() => { setMode('login'); setInfo(''); }}>Back to log in</button></p>}
        {APP === 'admin' && mode === 'login' && <p className="faint" style={{ textAlign: 'center', marginTop: 10 }}>First time? <button type="button" className="link" onClick={() => { setMode('signup'); setError(''); }}>Set up the admin account</button></p>}
        {APP === 'admin' && mode === 'signup' && <p className="faint" style={{ textAlign: 'center', marginTop: 10 }}>Only approved admin emails can do this. <button type="button" className="link" onClick={() => setMode('login')}>Back to log in</button></p>}
      </form>
      <LegalFooter />
    </div>
  );
}
