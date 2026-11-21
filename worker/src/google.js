// "Sign in with Google": verify the ID token the Google button hands the browser.
// https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
// Checks Google's RS256 signature against its published keys, the audience (our client ID), issuer, expiry
// and that Google has verified the email. Only the public client ID is needed; no client secret.
import { b64u } from './crypto.js';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
let cache = { keys: null, until: 0, url: '' };

async function googleKeys(url) {
  if (cache.keys && cache.url === url && Date.now() < cache.until) return cache.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google keys unavailable (${res.status})`);
  const { keys } = await res.json();
  const maxAge = Number((res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  cache = { keys, until: Date.now() + Math.min(maxAge, 6 * 3600) * 1000, url };
  return keys;
}

const bad = (msg) => Object.assign(new Error(msg), { status: 401 });

/** Returns { sub, email, name, picture } for a valid Google ID token, or throws a 401. */
export async function verifyGoogleIdToken(token, env) {
  if (!env.GOOGLE_CLIENT_ID) throw Object.assign(new Error('Google sign-in is not set up yet'), { status: 503 });
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw bad('Google sign-in failed. Please try again.');
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64u.decode(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64u.decode(parts[1])));
  } catch { throw bad('Google sign-in failed. Please try again.'); }
  if (header.alg !== 'RS256' || !header.kid) throw bad('Google sign-in failed. Please try again.');

  let keys = await googleKeys(env.GOOGLE_CERTS_URL || CERTS_URL);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) { cache.until = 0; keys = await googleKeys(env.GOOGLE_CERTS_URL || CERTS_URL); jwk = keys.find((k) => k.kid === header.kid); }
  if (!jwk) throw bad('Google sign-in failed. Please try again.');

  const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u.decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw bad('Google sign-in failed. Please try again.');

  const now = Math.floor(Date.now() / 1000);
  if (!ISSUERS.includes(payload.iss)) throw bad('Google sign-in failed. Please try again.');
  if (payload.aud !== env.GOOGLE_CLIENT_ID) throw bad('Google sign-in failed. Please try again.');
  if (!payload.exp || payload.exp < now - 30) throw bad('Your Google sign-in expired. Please try again.');
  if (!payload.sub || !payload.email || payload.email_verified !== true) throw bad('Your Google email is not verified.');
  return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name || '').slice(0, 40), picture: payload.picture };
}
