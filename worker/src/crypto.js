// WebCrypto helpers: password hashing (PBKDF2), session tokens (HS256 JWT), HMACs, base64url.
const enc = new TextEncoder();

export const b64u = {
  encode(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    const s = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  },
};
export const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const randomToken = (n = 32) => b64u.encode(crypto.getRandomValues(new Uint8Array(n)));
export const randomHex = (n = 16) => toHex(crypto.getRandomValues(new Uint8Array(n)));

export function safeEqual(a, b) {
  const x = enc.encode(String(a)); const y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

async function hmacKey(secret, hash = 'SHA-256') {
  return crypto.subtle.importKey('raw', typeof secret === 'string' ? enc.encode(secret) : secret, { name: 'HMAC', hash }, false, ['sign']);
}
export async function hmac(secret, data, hash = 'SHA-256') {
  return crypto.subtle.sign('HMAC', await hmacKey(secret, hash), typeof data === 'string' ? enc.encode(data) : data);
}
export const hmacHex = async (secret, data) => toHex(await hmac(secret, data));
export const sha256Hex = async (s) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

// ---- passwords: PBKDF2-SHA256, 100k iterations (the Workers maximum) ----
const ITER = 100_000;
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
  return `pbkdf2$${ITER}$${b64u.encode(salt)}$${b64u.encode(bits)}`;
}
export async function verifyPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored || '').split('$');
  if (alg !== 'pbkdf2') return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64u.decode(salt), iterations: Number(iter) }, key, 256);
  return safeEqual(b64u.encode(bits), hash);
}

// ---- JWT (HS256) ----
export async function signJwt(payload, secret, ttlSec = 30 * 24 * 3600) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u.encode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64u.encode(enc.encode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec })));
  const sig = b64u.encode(await hmac(secret, `${head}.${body}`));
  return `${head}.${body}.${sig}`;
}
export async function verifyJwt(token, secret) {
  const [head, body, sig] = String(token || '').split('.');
  if (!head || !body || !sig) return null;
  const expected = b64u.encode(await hmac(secret, `${head}.${body}`));
  if (!safeEqual(expected, sig)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(b64u.decode(body)));
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch { return null; }
}
