import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { homeFor } from '../lib/roles.js';
import LegalFooter from '../components/LegalFooter.jsx';

const LANGS = ['Hindi', 'English', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Punjabi', 'Odia'];
const maxDob = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10); };

export default function Login() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', gender: '', birthDate: '', languages: ['Hindi', 'English'], acceptTerms: false });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const { login, register } = useAuth();
  const nav = useNavigate();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'forgot') {
        await api('/auth/forgot', { method: 'POST', body: { email: form.email } });
        setInfo('If that email has an account, a reset link is on its way. Check your inbox.');
        return;
      }
      const u = mode === 'login'
        ? await login(form.email, form.password)
        : await register({ ...form, languages: form.languages.join(',') });
      nav(homeFor(u.role), { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const toggleLang = (l) => setForm((f) => ({ ...f, languages: f.languages.includes(l) ? f.languages.filter((x) => x !== l) : [...f.languages, l] }));

  return (
    <div className="landing">
      <Link to="/"><img className="logo" src="/logo.png" alt="Milo Julo" style={{ width: 140, marginBottom: 16 }} /></Link>
      <form className="card auth-card" onSubmit={submit}>
        {mode === 'forgot' ? (
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 14 }}>Reset your password</h2>
        ) : (
          <div className="tabs" role="tablist">
            <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Log in</button>
            <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Sign up</button>
          </div>
        )}
        {mode === 'signup' && (<>
          <div className="role-pick">
            <button type="button" className={form.role === 'user' ? 'on' : ''} onClick={() => setForm({ ...form, role: 'user' })}>
              <b>Make friends</b><span>Chat & call people</span>
            </button>
            <button type="button" className={form.role === 'host' ? 'on' : ''} onClick={() => setForm({ ...form, role: 'host' })}>
              <b>Become a host</b><span>Talk & earn</span>
            </button>
          </div>
          <div className="field"><label htmlFor="name">Name</label><input id="name" className="input" value={form.name} onChange={set('name')} required minLength={2} maxLength={40} autoComplete="name" /></div>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="field" style={{ flex: 1 }}><label htmlFor="dob">Date of birth</label><input id="dob" type="date" className="input" value={form.birthDate} onChange={set('birthDate')} max={maxDob()} required /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="gender">Gender</label>
              <select id="gender" className="input" value={form.gender} onChange={set('gender')}>
                <option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="field"><label>Languages you speak</label>
            <div className="filters" style={{ flexWrap: 'wrap' }}>
              {LANGS.map((l) => <button type="button" key={l} className={form.languages.includes(l) ? 'on' : ''} onClick={() => toggleLang(l)}>{l}</button>)}
            </div>
          </div>
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
        {error && <p className="error-text">{error}</p>}
        {info && <p className="test-banner" style={{ background: 'rgba(24,184,107,.12)', color: 'var(--green)' }}>{info}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'forgot' ? 'Send reset link' : form.role === 'host' ? 'Apply as host' : 'Create account'}
        </button>
        {mode === 'login' && <p style={{ textAlign: 'center', marginTop: 14 }}><button type="button" className="link" onClick={() => { setMode('forgot'); setError(''); }}>Forgot password?</button></p>}
        {mode === 'forgot' && <p style={{ textAlign: 'center', marginTop: 14 }}><button type="button" className="link" onClick={() => { setMode('login'); setInfo(''); }}>Back to log in</button></p>}
        {mode === 'signup' && form.role === 'host' && <p className="faint" style={{ marginTop: 10 }}>Host accounts go live after admin approval.</p>}
      </form>
      <LegalFooter />
    </div>
  );
}
