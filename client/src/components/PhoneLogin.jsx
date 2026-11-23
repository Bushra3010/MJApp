// Phone number + OTP sign-in (Supabase Auth). Shown only when SMS sign-in is switched on.
import { useEffect, useState } from 'react';
import { sendPhoneOtp, supabaseConfig, verifyPhoneOtp } from '../lib/supabaseAuth.js';

export default function PhoneLogin({ onToken, busy }) {
  const [on, setOn] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [err, setErr] = useState('');
  const [working, setWorking] = useState(false);
  useEffect(() => { supabaseConfig().then((c) => setOn(!!c?.phone)); }, []);
  useEffect(() => { if (!wait) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  if (!on) return null;
  const e164 = `+91${phone.replace(/\D/g, '').slice(-10)}`;

  const send = async (e) => {
    e?.preventDefault(); setErr('');
    if (phone.replace(/\D/g, '').length !== 10) { setErr('Enter your 10-digit mobile number'); return; }
    setWorking(true);
    try { await sendPhoneOtp(e164); setSent(true); setWait(30); } catch (x) { setErr(x.message); } finally { setWorking(false); }
  };
  const verify = async (e) => {
    e.preventDefault(); setErr(''); setWorking(true);
    try { onToken(await verifyPhoneOtp(e164, code.trim())); } catch (x) { setErr(x.message); } finally { setWorking(false); }
  };
  return !sent ? (
    <form onSubmit={send}>
      <label htmlFor="ph" className="sr-only">Phone number</label>
      <div className="phone-field"><span className="cc">🇮🇳 +91</span><input id="ph" className="input" inputMode="numeric" autoComplete="tel-national" placeholder="Enter phone number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, '').slice(0, 12))} /></div>
      {err && <p className="error-text" style={{ marginTop: 8 }}>{err}</p>}
      <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={working}>{working ? 'Sending…' : 'Send OTP'}</button>
      <div className="or-divider"><span>OR</span></div>
    </form>
  ) : (
    <form onSubmit={verify}>
      <p className="muted" style={{ fontSize: 14, marginBottom: 8 }}>Enter the 6-digit code sent to {e164}. <button type="button" className="link" onClick={() => { setSent(false); setCode(''); }}>Change</button></p>
      <label htmlFor="otp" className="sr-only">One-time code</label>
      <input id="otp" className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
      {err && <p className="error-text" style={{ marginTop: 8 }}>{err}</p>}
      <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={working || busy || code.length !== 6}>{working || busy ? 'Checking…' : 'Verify & continue'}</button>
      <p className="faint" style={{ textAlign: 'center', marginTop: 8 }}>{wait ? `Resend code in ${wait}s` : <button type="button" className="link" onClick={send}>Resend code</button>}</p>
      <div className="or-divider"><span>OR</span></div>
    </form>
  );
}
