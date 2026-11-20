// Third-party services through their official public APIs, with the owner's own keys.
import { hmac, hmacHex, safeEqual, b64u } from './crypto.js';

// ---------- Razorpay (https://razorpay.com/docs/api/) ----------
export const razorpayEnabled = (env) => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export async function createRazorpayOrder(env, { amountPaise, receipt, notes }) {
  const base = env.RAZORPAY_API_BASE || 'https://api.razorpay.com';
  const res = await fetch(`${base}/v1/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Basic ' + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`) },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.description || 'Could not start payment'), { status: 502 });
  return data;
}
export const verifyCheckoutSignature = async (env, orderId, paymentId, signature) =>
  safeEqual(await hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
export const verifyWebhookSignature = async (env, raw, signature) =>
  Boolean(env.RAZORPAY_WEBHOOK_SECRET && signature) && safeEqual(await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw), signature);

// ---------- Email via Resend (https://resend.com/docs/api-reference/emails/send-email) ----------
export async function sendEmail(env, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${text}`);
    return { dev: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM || 'Milo Julo <no-reply@example.com>', to, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status})`);
  return res.json();
}

// ---------- ICE / TURN ----------
// 1) Cloudflare Realtime TURN (TURN_KEY_ID + TURN_KEY_API_TOKEN), or
// 2) your own coturn with use-auth-secret (TURN_URL + TURN_SECRET).
const STUN = { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] };

export async function iceServersFor(env, userId) {
  if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) {
    const base = `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials`;
    const opts = { method: 'POST', headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: 12 * 3600 }) };
    try {
      let res = await fetch(`${base}/generate-ice-servers`, opts);
      if (res.status === 404) res = await fetch(`${base}/generate`, opts);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
        return [STUN, ...list.filter(Boolean)];
      }
      console.error('TURN credentials failed', res.status);
    } catch (e) { console.error('TURN credentials failed', e); }
  }
  if (env.TURN_URL && env.TURN_SECRET) {
    const username = `${Math.floor(Date.now() / 1000) + 12 * 3600}:${userId}`;
    const credential = btoa(String.fromCharCode(...new Uint8Array(await hmac(env.TURN_SECRET, username, 'SHA-1'))));
    return [STUN, { urls: env.TURN_URL.split(',').map((s) => s.trim()), username, credential }];
  }
  return [STUN];
}

export { b64u };
