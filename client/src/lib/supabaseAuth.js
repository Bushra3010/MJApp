// Google sign-in through Supabase Auth using the PKCE flow (no extra library).
// https://supabase.com/docs/guides/auth/sessions/pkce-flow
import { api } from './api.js';

const KEY = 'mj_pkce';
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const store = {
  set: (v) => { try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ } },
  take: () => { try { const v = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return v; } catch { return null; } },
};

let cfgPromise;
export const supabaseConfig = () => (cfgPromise ||= api('/config').then((c) => c.supabase).catch(() => null));

/** Send the browser to Google (via Supabase). It comes back to /auth/callback. */
export async function startGoogleSignIn() {
  const cfg = await supabaseConfig();
  if (!cfg) throw new Error('Google sign-in is not available right now.');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  store.set(verifier);
  const q = new URLSearchParams({
    provider: 'google',
    redirect_to: `${location.origin}/auth/callback`,
    code_challenge: challenge,
    code_challenge_method: 's256',
    prompt: 'select_account',
  });
  location.assign(`${cfg.url}/auth/v1/authorize?${q}`);
}

/** On /auth/callback: swap the one-time code for a Supabase access token. */
export async function finishGoogleSignIn(code) {
  const cfg = await supabaseConfig();
  const verifier = store.take();
  if (!cfg || !verifier) throw new Error('This sign-in link has expired. Please try again.');
  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: { apikey: cfg.key, 'content-type': 'application/json' },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.msg || 'Google sign-in failed. Please try again.');
  return data.access_token;
}

// ---------- phone OTP (Supabase Auth, SMS sent by the project's SMS provider) ----------
/** Send a 6-digit code by SMS. `phone` in E.164 form, e.g. +919876543210. */
export async function sendPhoneOtp(phone) {
  const cfg = await supabaseConfig();
  if (!cfg?.phone) throw new Error('Phone login is not available right now. Use Google or email.');
  const res = await fetch(`${cfg.url}/auth/v1/otp`, {
    method: 'POST', headers: { apikey: cfg.key, 'content-type': 'application/json' },
    body: JSON.stringify({ phone, create_user: true }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.msg || d.error_description || 'Could not send the code. Check the number and try again.');
  }
}
/** Check the code; returns a Supabase access token for the server. */
export async function verifyPhoneOtp(phone, code) {
  const cfg = await supabaseConfig();
  const res = await fetch(`${cfg.url}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: cfg.key, 'content-type': 'application/json' },
    body: JSON.stringify({ phone, token: code, type: 'sms' }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) throw new Error(d.msg || d.error_description || 'That code is wrong or has expired.');
  return d.access_token;
}

// invite code from a host's invite link survives the trip to Google and back
const REF_KEY = 'mj_ref';
export const rememberRef = (code) => { try { if (code) sessionStorage.setItem(REF_KEY, code); } catch { /* */ } };
export const recallRef = () => { try { return sessionStorage.getItem(REF_KEY) || undefined; } catch { return undefined; } };
