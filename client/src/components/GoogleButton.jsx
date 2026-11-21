// "Continue with Google" using Google Identity Services. Renders nothing until the server reports a client ID.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

let scriptPromise;
const loadGsi = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { scriptPromise = null; reject(new Error('Could not load Google sign-in')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
};

export default function GoogleButton({ onCredential, text = 'continue_with' }) {
  const box = useRef(null);
  const [clientId, setClientId] = useState(undefined);
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => { api('/config').then((c) => setClientId(c.googleClientId || null)).catch(() => setClientId(null)); }, []);

  useEffect(() => {
    if (!clientId || !box.current) return;
    let cancelled = false;
    loadGsi().then(() => {
      if (cancelled || !box.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => cb.current(r.credential),
        ux_mode: 'popup',
        itp_support: true,
        cancel_on_tap_outside: true,
      });
      box.current.innerHTML = '';
      window.google.accounts.id.renderButton(box.current, {
        type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text,
        logo_alignment: 'center', width: Math.min(box.current.offsetWidth || 320, 400),
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [clientId, text]);

  if (!clientId) return null;
  return (
    <>
      <div className="or-divider"><span>or</span></div>
      <div ref={box} className="google-btn" />
    </>
  );
}
