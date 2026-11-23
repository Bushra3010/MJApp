// Google sign-in through Supabase Auth. The browser completes Google login on Supabase and gets a Supabase
// access token; we verify that token here against the project's public signing keys (JWKS) before trusting it.
// https://supabase.com/docs/guides/auth/signing-keys
import { b64u } from './crypto.js';

let cache = { keys: null, until: 0, url: '' };
const fail = (msg = 'Sign-in failed. Please try again.') => Object.assign(new Error(msg), { status: 401 });

async function projectKeys(url, force = false) {
  if (!force && cache.keys && cache.url === url && Date.now() < cache.until) return cache.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Supabase keys unavailable (${res.status})`);
  const { keys } = await res.json();
  cache = { keys, until: Date.now() + 10 * 60_000, url };
  return keys;
}

const ALGS = {
  ES256: { imp: { name: 'ECDSA', namedCurve: 'P-256' }, ver: { name: 'ECDSA', hash: 'SHA-256' } },
  RS256: { imp: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, ver: { name: 'RSASSA-PKCS1-v1_5' } },
};

/**
 * Verify a Supabase access token from a Google or phone-OTP sign-in.
 * Returns { id, provider, email, phone, name, avatar } or throws a 401.
 */
export async function verifySupabaseSession(token, env, want = ['google', 'phone']) {
  if (!env.SUPABASE_URL) throw Object.assign(new Error('Google sign-in is not set up yet'), { status: 503 });
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw fail();
  let header, p;
  try {
    header = JSON.parse(new TextDecoder().decode(b64u.decode(parts[0])));
    p = JSON.parse(new TextDecoder().decode(b64u.decode(parts[1])));
  } catch { throw fail(); }
  const alg = ALGS[header.alg];
  if (!alg || !header.kid) throw fail();

  const jwksUrl = env.SUPABASE_JWKS_URL || `${base}/auth/v1/.well-known/jwks.json`;
  let jwk = (await projectKeys(jwksUrl)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await projectKeys(jwksUrl, true)).find((k) => k.kid === header.kid);
  if (!jwk) throw fail();
  const { kid, key_ops, ...pub } = jwk; // eslint-disable-line no-unused-vars
  const key = await crypto.subtle.importKey('jwk', { ...pub, ext: true }, alg.imp, false, ['verify']);
  const ok = await crypto.subtle.verify(alg.ver, key, b64u.decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw fail();

  const now = Math.floor(Date.now() / 1000);
  if (p.iss !== `${base}/auth/v1`) throw fail();
  if (p.aud !== 'authenticated' && !(Array.isArray(p.aud) && p.aud.includes('authenticated'))) throw fail();
  if (!p.exp || p.exp < now - 30) throw fail('Your sign-in expired. Please try again.');
  const providers = p.app_metadata?.providers || [p.app_metadata?.provider];
  const meta = p.user_metadata || {};
  if (!p.sub) throw fail();
  if (want.includes('google') && providers.includes('google')) {
    if (!p.email || meta.email_verified === false) throw fail('Your Google email is not verified.');
    return { id: String(p.sub), provider: 'google', email: String(p.email).toLowerCase(), phone: null,
      name: String(meta.full_name || meta.name || '').slice(0, 40), avatar: meta.avatar_url || meta.picture || '' };
  }
  if (want.includes('phone') && providers.includes('phone')) {
    const phone = String(p.phone || '').replace(/\D/g, '');
    if (phone.length < 10) throw fail('Phone number could not be verified.');
    return { id: String(p.sub), provider: 'phone', email: null, phone: `+${phone}`, name: '', avatar: '' };
  }
  throw fail(want.length === 1 && want[0] === 'google' ? 'Please sign in with Google.' : 'Please sign in with Google or your phone number.');
}
export const verifySupabaseGoogle = (token, env) => verifySupabaseSession(token, env, ['google']);

/** Which sign-in methods are switched on in the Supabase project ({ google, phone }). Cached for a minute. */
let enabledCache = { at: 0, value: { google: false, phone: false } };
export async function supabaseProviders(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return { google: false, phone: false };
  if (env.SUPABASE_JWKS_URL) return { google: true, phone: true }; // local tests use a mock project
  if (Date.now() - enabledCache.at < 60_000) return enabledCache.value;
  try {
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
    const d = await res.json();
    enabledCache = { at: Date.now(), value: { google: !!d?.external?.google, phone: !!d?.external?.phone } };
  } catch { enabledCache = { at: Date.now(), value: { google: false, phone: false } }; }
  return enabledCache.value;
}
export const supabaseGoogleEnabled = async (env) => (await supabaseProviders(env)).google;
