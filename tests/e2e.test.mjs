// End-to-end checks against the Cloudflare Worker running locally in `wrangler dev`:
// calls, billing, chat, Razorpay payments (mock API), sessions, uploads, push, account lifecycle.
// Run: npm test
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const PORT = 8799, base = `http://localhost:${PORT}`;
const RZP = { key: 'rzp_test_dummy', secret: 'secret_dummy', wh: 'whsec_dummy' };
const DEMO = 'demo-pass-123';

// --- mock Razorpay orders API ---
let orderSeq = 0;
const rzp = http.createServer((req, res) => {
  let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
    const ok = req.headers.authorization === 'Basic ' + Buffer.from(`${RZP.key}:${RZP.secret}`).toString('base64');
    if (req.url !== '/v1/orders' || !ok) { res.writeHead(401).end('{}'); return; }
    const o = JSON.parse(b);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: `order_M${++orderSeq}`, amount: o.amount, currency: 'INR' }));
  });
}).listen(4555);

// --- mock Supabase Auth signing keys (JWKS) + helper to mint access tokens like Supabase does after Google login ---
const SB_URL = 'https://test-project.supabase.co';
const gKey = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const evilKey = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const gJwk = { ...gKey.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'ES256', use: 'sig', key_ops: ['verify'] };
const jwks = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [gJwk] }))).listen(4556);
function googleToken(claims = {}, { key = gKey.privateKey, kid = 'k1' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const { email_verified = true, name = 'Google Person', provider = 'google', ...rest } = claims;
  const head = enc({ alg: 'ES256', kid, typ: 'JWT' });
  const body = enc({ iss: `${SB_URL}/auth/v1`, aud: 'authenticated', role: 'authenticated', sub: crypto.randomUUID(), email: `g${Date.now()}${Math.random()}@gmail.com`,
    app_metadata: { provider, providers: [provider] }, user_metadata: { full_name: name, email_verified }, iat: now, exp: now + 3600, ...rest });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const vars = {
  JWT_SECRET: 'test-secret-0123456789abcdef0123456789abcdef', ADMIN_EMAILS: 'boss@test.io', ALLOW_DEMO_SEED: 'true', DEMO_PASSWORD: DEMO,
  BILLING_PERIOD_MS: '1000', DISABLE_RATE_LIMIT: 'true', RAZORPAY_KEY_ID: RZP.key, RAZORPAY_KEY_SECRET: RZP.secret,
  RAZORPAY_WEBHOOK_SECRET: RZP.wh, TRUST_APP_HEADER: 'true', SUPABASE_URL: SB_URL, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_JWKS_URL: 'http://localhost:4556/jwks', RAZORPAY_API_BASE: 'http://localhost:4555', TURN_URL: 'turn:turn.example.com:3478', TURN_SECRET: 'turnsecret',
};
const args = ['wrangler', 'dev', '--port', String(PORT), '--persist-to', mkdtempSync(path.join(tmpdir(), 'mjw-')), '--log-level', 'log',
  ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])];
const srv = spawn('npx', args, { cwd: 'worker', stdio: ['ignore', 'pipe', 'pipe'] });
let serverOut = '';
srv.stdout.on('data', (d) => { serverOut += d; });
srv.stderr.on('data', (d) => { serverOut += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60 && !(await fetch(base + '/api/health').then((r) => r.ok).catch(() => false)); i++) await sleep(500);

// A session is { token, app }: every request says which app (friends 'user' / 'host' / 'admin') it comes from.
const req = async (p, opts = {}, sess) => {
  const app = opts.app || sess?.app || 'user';
  const headers = { 'x-mj-app': app, ...(opts.form ? {} : { 'content-type': 'application/json' }), ...(sess?.token && { authorization: 'Bearer ' + sess.token }), ...(opts.headers || {}) };
  const r = await fetch(base + '/api' + p, { method: opts.method || 'GET', headers, body: opts.form || opts.raw || (opts.body && JSON.stringify(opts.body)) });
  return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
};
const login = async (e, p, app = 'user') => ({ ...(await req('/auth/login', { method: 'POST', app, body: { email: e, password: p } })).body, app });
const signupRes = (over = {}, app = 'user') => req('/auth/register', { method: 'POST', app, body: { name: 'Test', email: `t${Date.now()}${Math.random()}@x.io`, password: 'secret123', birthDate: '1995-05-05', acceptTerms: true, ...over } });
const signup = async (over = {}, app = 'user') => { const r = await signupRes(over, app); return { ...r, body: { ...r.body, app } }; };

// minimal client for the Hub's WebSocket protocol
function sock(sess) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { authorization: `Bearer ${sess.token}`, 'x-mj-app': sess.app } });
    const handlers = new Map(); const pending = new Map(); let seq = 0;
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'ev') for (const fn of [...(handlers.get(m.e) || [])]) fn(m.d);
      if (m.t === 'ack') { pending.get(m.id)?.(m.d); pending.delete(m.id); }
    });
    const api = {
      emit: (e, d) => ws.send(JSON.stringify({ t: 'emit', e, d })),
      ack: (e, d) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ t: 'emit', e, d, id })); }),
      once: (e) => new Promise((r) => { const fn = (d) => { handlers.get(e).delete(fn); r(d); }; if (!handlers.has(e)) handlers.set(e, new Set()); handlers.get(e).add(fn); }),
      close: () => ws.close(),
    };
    ws.on('open', () => resolve(api));
    ws.on('error', reject);
  });
}
const ok = (m) => console.log('✓', m);
const hmac = (k, s, alg = 'sha256') => crypto.createHmac(alg, k).update(s).digest('hex');

try {
  // bootstrap: admin from ADMIN_EMAILS, then demo data
  assert.equal((await signupRes({ email: 'intruder@test.io' }, 'admin')).status, 403); ok('admin app refuses sign-up for emails not in ADMIN_EMAILS');
  const plainBoss = (await signup({ email: 'boss@test.io', password: 'boss-pass-123' }, 'user')).body;
  assert.equal(plainBoss.user.role, 'user'); ok('admin email signing up on the friends app gets a normal member account');
  await req('/me', { method: 'DELETE', body: { password: 'boss-pass-123' } }, plainBoss);
  const A = (await signup({ email: 'boss@test.io', password: 'boss-pass-123' }, 'admin')).body;
  assert.equal(A.user.role, 'admin'); ok('admin account created only through the admin app');
  assert.equal((await req('/admin/seed-demo', { method: 'POST' }, A)).status, 200);
  // the paid-call tests below assume no free trial; the free-trial block switches it on for its own checks
  // older flows below run with the rework rules relaxed; each rework rule gets its own checks further down
  await req('/admin/settings', { method: 'PATCH', body: { free_trial_enabled: 0, require_host_verification: 0, min_withdraw_inr: 0, chat_limit: 0, contact_block_after: 0 } }, A);

  const U = await login('rahul@milojulo.app', DEMO, 'user');
  const H = await login('priya@milojulo.app', DEMO, 'host');
  // ---------- three separate apps ----------
  let wrong = await req('/auth/login', { method: 'POST', app: 'user', body: { email: 'priya@milojulo.app', password: DEMO } });
  assert.equal(wrong.status, 403); assert.equal(wrong.body.code, 'WRONG_APP'); assert.equal(wrong.body.role, 'host'); ok('host account cannot log in on the friends app (points to host app)');
  wrong = await req('/auth/login', { method: 'POST', app: 'host', body: { email: 'rahul@milojulo.app', password: DEMO } });
  assert.equal(wrong.body.code, 'WRONG_APP'); ok('member account cannot log in on the host app');
  assert.equal((await req('/auth/login', { method: 'POST', app: 'admin', body: { email: 'rahul@milojulo.app', password: DEMO } })).status, 403); ok('member account cannot log in on the admin app');
  assert.equal((await req('/me', { app: 'host' }, { token: U.token })).status, 401);
  assert.equal((await req('/admin/stats', { app: 'admin' }, { token: H.token })).status, 401); ok("a session from one app doesn't work in another");
  const newHost = (await signup({}, 'host')).body;
  assert.equal(newHost.user.role, 'host'); assert.equal(newHost.user.host.approved, 0); ok('host app sign-up creates a host awaiting approval');
  const newUser = (await signup({ role: 'host' }, 'user')).body;
  assert.equal(newUser.user.role, 'user'); ok("friends app sign-up always creates a member (role can't be chosen by the browser)");
  assert.equal(U.user.coins, 500);
  const us = await sock(U), hs = await sock(H);

  // ---------- calls ----------
  let r = await us.ack('call:start', { hostId: H.user.id, type: 'video' });
  assert.match(r.error, /offline/); ok('offline host rejected');
  assert.equal((await hs.ack('presence:set', { online: true })).online, 1);
  assert.equal((await req('/hosts', {}, U)).body.find((x) => x.id === H.user.id).online, 1); ok('host online shows in discover');
  const M = await login('meera@milojulo.app', DEMO, 'host'); const ms = await sock(M);
  assert.match((await ms.ack('presence:set', { online: true })).error, /approval/); ok('unapproved host blocked from going online');

  let inc = hs.once('call:incoming');
  r = await us.ack('call:start', { hostId: H.user.id, type: 'audio' });
  assert.equal((await inc).from.id, U.user.id);
  let ended = us.once('call:ended'); hs.emit('call:decline', { callId: r.callId });
  assert.equal((await ended).status, 'declined'); ok('decline');

  inc = hs.once('call:incoming');
  r = await us.ack('call:start', { hostId: H.user.id, type: 'video' }); await inc;
  const sig = hs.once('rtc:signal'); const conn = us.once('call:connected');
  assert.ok((await hs.ack('call:accept', { callId: r.callId })).ok);
  assert.equal((await conn).role, 'caller');
  us.emit('rtc:signal', { callId: r.callId, data: { type: 'offer', sdp: 'x' } });
  assert.equal((await sig).data.type, 'offer'); ok('signaling relayed');
  const U2 = (await signup()).body; const u2s = await sock(U2);
  assert.match((await u2s.ack('call:start', { hostId: H.user.id, type: 'audio' })).error, /another call/); ok('busy host rejected');
  await sleep(2400);
  ended = us.once('call:ended'); us.emit('call:end', { callId: r.callId });
  const sum = await ended;
  assert.equal(sum.status, 'ended'); assert.equal(sum.charged, 90);
  const w = (await req('/wallet', {}, U)).body;
  assert.equal(w.coins, 410); ok('billed 3 started minutes at the Level 1 video price = 90 coins (Durable Object alarms)');
  assert.equal((await req('/host/stats', {}, H)).body.profile.earnings, 48); ok('Level 1 host earns ₹8/min on video = 16 coins/min at ₹0.50 a coin (3 × 16)');

  await req(`/admin/users/${U.user.id}/credit`, { method: 'POST', body: { amount: -(w.coins - 35) } }, A);
  inc = hs.once('call:incoming');
  r = await us.ack('call:start', { hostId: H.user.id, type: 'video' }); await inc;
  ended = us.once('call:ended'); await hs.ack('call:accept', { callId: r.callId });
  const e2 = await ended;
  assert.equal(e2.reason, 'balance'); assert.equal(e2.charged, 30);
  assert.equal((await req('/wallet', {}, U)).body.coins, 5); ok('call auto-ended when balance ran out; never negative');
  assert.match((await us.ack('call:start', { hostId: H.user.id, type: 'video' })).code, /LOW_BALANCE/); ok('low balance blocks new call');

  inc = hs.once('call:incoming');
  await req(`/admin/users/${U.user.id}/credit`, { method: 'POST', body: { amount: 100 } }, A);
  r = await us.ack('call:start', { hostId: H.user.id, type: 'audio' }); await inc;
  ended = us.once('call:ended');
  const missed = await Promise.race([ended, sleep(35_000).then(() => null)]);
  assert.equal(missed?.status, 'missed'); ok('unanswered call times out as missed after 30 s');
  await req(`/admin/users/${U.user.id}/credit`, { method: 'POST', body: { amount: -100 } }, A);

  // ---------- chat ----------
  const conv = (await req('/conversations', { method: 'POST', body: { hostId: H.user.id } }, U)).body;
  const earnedBeforeChat = (await req('/host/stats', {}, H)).body.profile.earnings;
  const newMsg = hs.once('message:new');
  assert.equal((await req(`/conversations/${conv.id}/messages`, { method: 'POST', body: { body: 'hi' } }, U)).status, 200);
  assert.equal((await newMsg).body, 'hi'); ok('chat delivered realtime');
  assert.equal((await req(`/conversations/${conv.id}/messages`, { method: 'POST', body: { body: 'second message' } }, U)).status, 200);
  assert.equal((await req('/host/stats', {}, H)).body.profile.earnings - earnedBeforeChat, 1); ok('host earns from chat: two 1-coin messages pay the host 1 coin');
  assert.equal((await req(`/conversations/${conv.id}/gift`, { method: 'POST', body: { giftId: 3 } }, U)).status, 402); ok('gift refused without coins');
  assert.equal((await req(`/conversations/${conv.id}/messages`, { method: 'POST', body: { body: 'hello!' } }, H)).status, 200); ok('host replies free');
  assert.equal((await req(`/conversations/${conv.id}/messages`, {}, U2)).status, 404); ok("other users can't read a conversation");

  // ---------- payments (Razorpay, mocked API) ----------
  const order = (await req('/wallet/order', { method: 'POST', body: { packId: 'p2' } }, U)).body;
  assert.equal(order.mode, 'razorpay'); assert.equal(order.amount, 9900); assert.equal(order.keyId, RZP.key); ok('Razorpay order created server-side for ₹99');
  let v = await req('/wallet/verify', { method: 'POST', body: { razorpay_order_id: order.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'forged' } }, U);
  assert.equal(v.status, 400); ok('forged checkout signature rejected');
  v = await req('/wallet/verify', { method: 'POST', body: { razorpay_order_id: order.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: hmac(RZP.secret, `${order.orderId}|pay_1`) } }, U);
  assert.equal(v.body.coins, 253); ok('verified payment credits 250 coins');
  const wb = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: order.orderId } } } });
  assert.equal((await req('/webhooks/razorpay', { method: 'POST', raw: wb, headers: { 'x-razorpay-signature': 'nope' } })).status, 400); ok('webhook with bad signature rejected');
  for (let i = 0; i < 2; i++) await req('/webhooks/razorpay', { method: 'POST', raw: wb, headers: { 'x-razorpay-signature': hmac(RZP.wh, wb), 'x-razorpay-event-id': 'evt_1' } });
  assert.equal((await req('/wallet', {}, U)).body.coins, 253); ok('webhook + browser callback + retry credit exactly once');
  const order2 = (await req('/wallet/order', { method: 'POST', body: { packId: 'p1' } }, U)).body;
  const wb2 = JSON.stringify({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_2', order_id: order2.orderId } } } });
  await req('/webhooks/razorpay', { method: 'POST', raw: wb2, headers: { 'x-razorpay-signature': hmac(RZP.wh, wb2), 'x-razorpay-event-id': 'evt_2' } });
  assert.equal((await req('/wallet', {}, U)).body.coins, 353); ok('webhook alone credits when the browser closed early');
  assert.equal((await req('/wallet/verify', { method: 'POST', body: { razorpay_order_id: order.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: hmac(RZP.secret, `${order.orderId}|pay_1`) } }, U2)).status, 404); ok("can't claim someone else's order");

  // ---------- TURN ----------
  const turn = (await req('/ice', {}, U)).body.iceServers.find((s) => String(s.urls).includes('turn:'));
  assert.ok(turn?.username.endsWith(`:${U.user.id}`));
  assert.equal(turn.credential, crypto.createHmac('sha1', 'turnsecret').update(turn.username).digest('base64')); ok('short-lived TURN credentials issued');

  // ---------- auth & sessions ----------
  assert.match((await signup({ birthDate: '2012-01-01' })).body.error, /18/); ok('under-18 sign up rejected');
  assert.match((await signup({ acceptTerms: false })).body.error, /Terms/); ok('terms must be accepted');
  assert.match((await signup({ password: 'short' })).body.error, /8 characters/); ok('weak password rejected');
  const reg = await signup();
  assert.match(reg.headers.get('set-cookie') || '', /mj_user=.*HttpOnly/i); ok('session cookie is http-only and per-app');
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('/me', { headers: { cookie } })).status, 200); ok('cookie session works');
  await req('/auth/logout-all', { method: 'POST', headers: { cookie } });
  assert.equal((await req('/me', { headers: { cookie } })).status, 401); ok('sign out everywhere revokes old sessions');

  await req('/auth/forgot', { method: 'POST', app: 'host', body: { email: 'kavya@milojulo.app' } });
  await sleep(500);
  const token = serverOut.match(/\/reset#([\w-]+)/)?.[1];
  assert.ok(token, 'reset link emailed');
  assert.equal((await req('/auth/reset', { method: 'POST', app: 'host', body: { token, password: 'newpass123' } })).status, 200);
  assert.equal((await req('/auth/reset', { method: 'POST', app: 'host', body: { token, password: 'again12345' } })).status, 400);
  assert.ok((await login('kavya@milojulo.app', 'newpass123', 'host')).user); ok('password reset works once');
  assert.equal((await req('/auth/forgot', { method: 'POST', body: { email: 'nobody@x.io' } })).status, 200); ok("reset doesn't reveal which emails exist");

  // ---------- uploads ----------
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  let fd = new FormData(); fd.append('photo', new Blob([png], { type: 'image/png' }), 'me.png');
  const up = await req('/me/avatar', { method: 'POST', form: fd }, U);
  assert.match(up.body.avatar, /^\/uploads\/[a-f0-9]{32}\.png$/);
  const img = await fetch(base + up.body.avatar);
  assert.equal(img.headers.get('content-type'), 'image/png'); assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(Buffer.compare(Buffer.from(await img.arrayBuffer()), png), 0); ok('photo stored and served safely');
  fd = new FormData(); fd.append('photo', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'x.png');
  assert.equal((await req('/me/avatar', { method: 'POST', form: fd }, U)).status, 400); ok('non-image upload rejected');
  assert.equal((await req('/me', { method: 'PATCH', body: { languages: '<img onerror=x>' } }, U)).status, 400); ok('profile input validated');

  // ---------- Sign in with Google (via Supabase Auth) ----------
  const gpost = (app, body) => req('/auth/google', { method: 'POST', app, body });
  assert.equal((await req('/config')).body.supabase?.url, SB_URL); ok('Supabase project published to the apps for Google sign-in');
  const gSub = 'g-new-member', gEmail = `newbie${Date.now()}@gmail.com`;
  let g = await gpost('user', { accessToken: googleToken({ sub: gSub, email: gEmail, name: 'Neha Sharma' }) });
  assert.equal(g.body.needsProfile, true); assert.equal(g.body.email, gEmail); ok('new Google user is asked for date of birth and terms first');
  g = await gpost('user', { accessToken: googleToken({ sub: gSub, email: gEmail }), birthDate: '2011-01-01', acceptTerms: true });
  assert.match(g.body.error, /18/); ok('Google sign-up still enforces 18+');
  g = await gpost('user', { accessToken: googleToken({ sub: gSub, email: gEmail, name: 'Neha Sharma' }), birthDate: '1998-04-04', acceptTerms: true, languages: 'Hindi' });
  assert.equal(g.status, 200); assert.equal(g.body.user.role, 'user'); assert.equal(g.body.user.coins, 50); assert.equal(g.body.user.name, 'Neha Sharma');
  assert.equal(g.body.user.has_password, false); assert.equal(g.body.user.google_linked, true); ok('Google sign-up on friends app creates a member with welcome coins');
  const G = { token: g.body.token, app: 'user' };
  g = await gpost('user', { accessToken: googleToken({ sub: gSub, email: gEmail }) });
  assert.equal(g.body.user?.email, gEmail); ok('returning Google user signs straight in');
  g = await gpost('host', { accessToken: googleToken({ sub: gSub, email: gEmail }) });
  assert.equal(g.body.code, 'WRONG_APP'); ok('Google member account is refused on the host app');
  g = await gpost('host', { accessToken: googleToken({ sub: 'g-new-host' }), birthDate: '1995-01-01', acceptTerms: true });
  assert.equal(g.body.user.role, 'host'); assert.equal(g.body.user.host.approved, 0); ok('Google sign-up on host app creates a host awaiting approval');
  assert.equal((await gpost('admin', { accessToken: googleToken({ sub: 'g-x' }), birthDate: '1990-01-01', acceptTerms: true })).status, 403); ok('Google sign-up on admin app refused for non-admin emails');
  g = await gpost('admin', { accessToken: googleToken({ sub: 'g-boss', email: 'boss@test.io' }) });
  assert.equal(g.body.user?.role, 'admin'); ok('admin can link Google and sign in to the admin app');
  g = await gpost('user', { accessToken: googleToken({ sub: 'g-rahul', email: 'rahul@milojulo.app' }) });
  assert.equal(g.body.user?.id, U.user.id); assert.equal(g.body.user.google_linked, true); ok('existing email/password account is linked on first Google sign-in');
  assert.equal((await gpost('user', { accessToken: googleToken({ sub: 'g-other', email: 'rahul@milojulo.app' }) })).status, 409); ok('a second Google account cannot take over an already linked email');
  // forged / invalid tokens
  assert.equal((await gpost('user', { accessToken: googleToken({ sub: gSub, email: gEmail }, { key: evilKey.privateKey }) })).status, 401); ok('token not signed by the Supabase project is rejected');
  assert.equal((await gpost('user', { accessToken: googleToken({ sub: gSub, email: gEmail, aud: 'anon' }) })).status, 401); ok('token with the wrong audience is rejected');
  assert.equal((await gpost('user', { accessToken: googleToken({ sub: gSub, email: gEmail, exp: Math.floor(Date.now() / 1000) - 600 }) })).status, 401); ok('expired token is rejected');
  assert.equal((await gpost('user', { accessToken: googleToken({ sub: 'g-unv', email_verified: false }) })).status, 401); ok('unverified Google email is rejected');
  assert.equal((await gpost('user', { accessToken: googleToken({ sub: gSub, email: gEmail, iss: 'https://other-project.supabase.co/auth/v1' }) })).status, 401); ok('token from another Supabase project is rejected');
  assert.equal((await gpost('user', { accessToken: googleToken({ sub: 'sb-email-only', provider: 'email' }) })).status, 401); ok('Supabase sessions not from Google are rejected');
  // Google-only accounts
  assert.match((await req('/auth/login', { method: 'POST', body: { email: gEmail, password: '' } })).body.error, /Google/); ok('password login on a Google-only account explains to use Google');
  assert.equal((await req('/me/password', { method: 'POST', body: { password: 'neha-pass-123' } }, G)).status, 200);
  assert.ok((await login(gEmail, 'neha-pass-123', 'user')).user); ok('Google-only user can set a password and then log in with email');
  const G2 = (await gpost('user', { accessToken: googleToken({ sub: 'g-del' }), birthDate: '1990-01-01', acceptTerms: true })).body;
  assert.equal((await req('/me', { method: 'DELETE', body: { confirm: 'nope' } }, { token: G2.token, app: 'user' })).status, 400);
  assert.equal((await req('/me', { method: 'DELETE', body: { confirm: 'DELETE' } }, { token: G2.token, app: 'user' })).status, 200); ok('Google-only account can be deleted by typing DELETE');

  // ---------- push ----------
  const key = (await req('/push/key')).body.publicKey;
  assert.equal(Buffer.from(key, 'base64url').length, 65); ok('VAPID key generated (P-256)');

  // ---------- free trial call ----------
  await req('/admin/settings', { method: 'PATCH', body: { free_trial_enabled: 1, free_trial_seconds: 2 } }, A);
  assert.equal((await req('/config')).body.freeTrial.seconds, 2);
  const HT = (await signup({ name: 'Trial Host' }, 'host')).body;
  await req(`/admin/hosts/${HT.user.id}`, { method: 'PATCH', body: { approved: true } }, A);
  const hts = await sock(HT); await hts.ack('presence:set', { online: true });
  const T1 = (await signup({ name: 'Trial One' }, 'user')).body;
  assert.equal(T1.user.free_trial.available, true); assert.equal(T1.user.free_trial.seconds, 2); ok('new member has a free trial');
  const t1s = await sock(T1);
  // declining doesn't use the trial up
  let tinc = hts.once('call:incoming');
  let tr = await t1s.ack('call:start', { hostId: HT.user.id, type: 'video' });
  assert.equal(tr.freeTrialMs, 2000); assert.equal((await tinc).freeTrialMs, 2000);
  let tend = t1s.once('call:ended'); hts.emit('call:decline', { callId: tr.callId }); await tend;
  assert.equal((await req('/me', {}, T1)).body.free_trial.available, true); ok('a declined call does not use up the free trial');
  // accepted: free for 2 s, then the first paid minute
  tinc = hts.once('call:incoming');
  tr = await t1s.ack('call:start', { hostId: HT.user.id, type: 'video' }); await tinc;
  const tconn = t1s.once('call:connected');
  assert.ok((await hts.ack('call:accept', { callId: tr.callId })).ok);
  assert.equal((await tconn).freeTrialMs, 2000);
  await sleep(1200);
  assert.equal((await req('/me', {}, T1)).body.coins, 50); ok('nothing charged during the free seconds');
  assert.equal((await req('/host/stats', {}, HT)).body.profile.earnings, 0); ok('host earns nothing during the free seconds');
  await sleep(1500);
  assert.equal((await req('/me', {}, T1)).body.coins, 20); ok('billing starts when the free trial ends (first minute charged)');
  tend = t1s.once('call:ended'); t1s.emit('call:end', { callId: tr.callId });
  const tsum = await tend; assert.equal(tsum.status, 'ended'); assert.equal(tsum.charged, 30);
  const tcalls = (await req('/calls', {}, HT)).body;
  assert.equal(tcalls[0].free_seconds, 2); assert.equal(tcalls[0].earned, 16); ok('call records free seconds; host sees what they earned on it');
  assert.equal((await req('/me', {}, T1)).body.free_trial.available, false);
  tinc = hts.once('call:incoming');
  tr = await t1s.ack('call:start', { hostId: HT.user.id, type: 'audio' }); await tinc;
  assert.equal(tr.freeTrialMs, 0); ok('free trial is used only once per member');
  tend = t1s.once('call:ended'); t1s.emit('call:end', { callId: tr.callId }); await tend;
  // member with no coins: gets the free seconds, then the call ends
  const T2 = (await signup({ name: 'Trial Broke' }, 'user')).body;
  await req(`/admin/users/${T2.user.id}/credit`, { method: 'POST', body: { amount: -50 } }, A);
  const t2s = await sock(T2);
  tinc = hts.once('call:incoming');
  tr = await t2s.ack('call:start', { hostId: HT.user.id, type: 'video' });
  assert.ok(tr.callId, 'zero-coin member may start a free-trial call'); await tinc;
  tend = t2s.once('call:ended'); await hts.ack('call:accept', { callId: tr.callId });
  const t2sum = await tend;
  assert.equal(t2sum.reason, 'trial_ended'); assert.equal(t2sum.charged, 0);
  assert.equal((await req('/me', {}, T2)).body.coins, 0); ok('no coins: free seconds, then the call ends; balance never negative');
  // switched off
  await req('/admin/settings', { method: 'PATCH', body: { free_trial_enabled: 0 } }, A);
  const T3 = (await signup({ name: 'Trial Off' }, 'user')).body;
  assert.equal(T3.user.free_trial.available, false);
  await req(`/admin/users/${T3.user.id}/credit`, { method: 'POST', body: { amount: -50 } }, A);
  const t3s = await sock(T3);
  assert.equal((await t3s.ack('call:start', { hostId: HT.user.id, type: 'video' })).code, 'LOW_BALANCE'); ok('free trial can be switched off by admin');
  await req('/admin/settings', { method: 'PATCH', body: { free_trial_enabled: 1, free_trial_seconds: 30 } }, A);
  assert.equal((await req('/admin/settings', { method: 'PATCH', body: { coin_to_inr: 0.5 } }, A)).body.coin_to_inr, 0.5); ok('decimal payout rate survives saving settings');

  // ---------- host app: stats, payout details, withdrawals, verification ----------
  const hst = (await req('/host/stats', {}, HT)).body;
  assert.equal(hst.totalCalls, 2); assert.ok(hst.missedCalls >= 1); assert.equal(hst.profile.total_earned, 16); ok('host stats: total calls, missed calls, total earnings');
  let pd = await req('/host/payouts', { method: 'POST', body: { amount: 100 } }, HT);
  assert.match(pd.body.error, /bank or UPI details/); ok('withdrawal asks for payout details first');
  pd = await req('/host/payout-details', { method: 'PUT', body: { method: 'bank', bank_holder: 'Trial Host', bank_account: '12345678901', bank_ifsc: 'BADIFSC' } }, HT);
  assert.match(pd.body.error, /IFSC/); ok('bad IFSC refused');
  pd = await req('/host/payout-details', { method: 'PUT', body: { method: 'bank', bank_holder: 'Trial Host', bank_account: '12345678901', bank_ifsc: 'sbin0001234' } }, HT);
  assert.equal(pd.status, 200); assert.equal(pd.body.bank_account_last4, '8901'); assert.equal(pd.body.bank_account, undefined); assert.equal(pd.body.bank_ifsc, 'SBIN0001234');
  const meHT = (await req('/me', {}, HT)).body.host;
  assert.equal(meHT.bank_account, undefined); assert.equal(meHT.earn_remainder, undefined); ok('bank details saved; account number masked for the host');
  assert.match((await req('/host/payouts', { method: 'POST', body: { amount: 100 } }, HT)).body.error, /more than your balance/); ok('withdrawal limited to balance');
  // earn enough with a paid call (₹8/min → 16 coins/min to host; ~7 minutes at 1 s each)
  await req(`/admin/users/${T1.user.id}/credit`, { method: 'POST', body: { amount: 500 } }, A);
  tinc = hts.once('call:incoming');
  tr = await t1s.ack('call:start', { hostId: HT.user.id, type: 'video' }); await tinc;
  await hts.ack('call:accept', { callId: tr.callId });
  await sleep(6800);
  tend = t1s.once('call:ended'); t1s.emit('call:end', { callId: tr.callId }); await tend;
  const bal = (await req('/host/stats', {}, HT)).body.profile.earnings;
  assert.ok(bal >= 100, `host balance ${bal}`);
  assert.equal((await req('/host/payouts', { method: 'POST', body: { amount: 100 } }, HT)).status, 200);
  const adminPayout = (await req('/admin/payouts', {}, A)).body.find((p) => p.host_id === HT.user.id);
  assert.equal(adminPayout.destination.account, '12345678901'); assert.equal(adminPayout.destination.ifsc, 'SBIN0001234'); ok('withdrawal uses saved bank details; admin sees the full account to pay');
  // verification
  assert.equal((await req('/host/verification', {}, HT)).body.status, 'none');
  const vpng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  let vfd = new FormData(); vfd.append('idType', 'aadhaar'); vfd.append('id', new Blob([vpng], { type: 'image/png' }), 'id.png');
  assert.match((await req('/host/verification', { method: 'POST', form: vfd }, HT)).body.error, /selfie/); ok('verification needs both ID photo and selfie');
  vfd = new FormData(); vfd.append('idType', 'aadhaar'); vfd.append('id', new Blob([vpng], { type: 'image/png' }), 'id.png'); vfd.append('selfie', new Blob([vpng], { type: 'image/png' }), 's.png');
  assert.equal((await req('/host/verification', { method: 'POST', form: vfd }, HT)).body.status, 'pending'); ok('host submits ID + selfie for verification');
  const doc = await fetch(`${base}/api/admin/hosts/${HT.user.id}/verification/id`, { headers: { authorization: `Bearer ${A.token}`, 'x-mj-app': 'admin' } });
  assert.equal(doc.status, 200); assert.equal(doc.headers.get('content-type'), 'image/png'); assert.match(doc.headers.get('cache-control'), /no-store/);
  assert.ok([401, 403].includes((await fetch(`${base}/api/admin/hosts/${HT.user.id}/verification/id`, { headers: { authorization: `Bearer ${HT.token}`, 'x-mj-app': 'host' } })).status));
  assert.equal((await fetch(`${base}/uploads/${HT.user.id}`)).status, 404); ok('ID photos are private: admin can view, host session and public URLs cannot');
  assert.equal((await req('/hosts', {}, U)).body.find((x) => x.id === HT.user.id)?.verified, 0);
  await req(`/admin/hosts/${HT.user.id}`, { method: 'PATCH', body: { verification: 'verified' } }, A);
  assert.equal((await req('/host/verification', {}, HT)).body.status, 'verified');
  assert.equal((await req('/hosts', {}, U)).body.find((x) => x.id === HT.user.id)?.verified, 1);
  assert.equal((await fetch(`${base}/api/admin/hosts/${HT.user.id}/verification/id`, { headers: { authorization: `Bearer ${A.token}`, 'x-mj-app': 'admin' } })).status, 404); ok('admin verifies: members see the verified badge; ID photos are deleted after the decision');

  // ---------- host programme: levels, call rates, call types, stats, alerts, leaderboard, invites, offers, videos ----------
  let prog = (await req('/host/program', {}, HT)).body;
  assert.equal(prog.levels.length, 3); assert.equal(prog.level, 1); assert.equal(prog.earnAudio, 3); assert.equal(prog.earnVideo, 8); assert.equal(prog.next.target, 70000);
  ok('Level 1: host earns ₹3/min audio, ₹8/min video; next target 70,000');
  assert.equal((await req('/host/rate', { method: 'PUT', body: { rateLevel: 1 } }, HT)).status, 410); ok('hosts no longer pick rates by hand');
  await req(`/admin/hosts/${HT.user.id}`, { method: 'PATCH', body: { level: 2 } }, A);
  prog = (await req('/host/program', {}, HT)).body;
  assert.equal(prog.level, 2); assert.equal(prog.overridden, true); assert.equal(prog.earnVideo, 9); assert.equal(prog.earnAudio, 4); assert.equal(prog.videoRate, 35); assert.equal(prog.audioRate, 12);
  ok('admin can set a level; earnings and member prices follow it');
  assert.equal((await req(`/hosts/${HT.user.id}`, {}, U)).body.video_rate, 35); ok("members see the level's price");
  await req(`/admin/hosts/${H.user.id}`, { method: 'PATCH', body: { video_rate: 22 } }, A);
  let priya = (await req('/host/program', {}, H)).body;
  assert.equal(priya.customRate, true); assert.equal(priya.videoRate, 22); ok('admin can hand-set a host price; it is kept');
  await req(`/admin/hosts/${H.user.id}`, { method: 'PATCH', body: { custom_rate: false } }, A);
  priya = (await req('/host/program', {}, H)).body;
  assert.equal(priya.customRate, false); assert.equal(priya.videoRate, 30); ok('admin can switch a host back to level prices');
  await req(`/admin/hosts/${HT.user.id}`, { method: 'PATCH', body: { level: null } }, A);
  assert.equal((await req('/host/program', {}, HT)).body.level, 1); ok('clearing the override puts the host back on the level their earnings reached');
  assert.equal((await req('/host/call-types', { method: 'PUT', body: { audio: false, video: false } }, HT)).status, 400); ok('at least one call type must stay on');
  await req('/host/call-types', { method: 'PUT', body: { audio: false, video: true } }, HT);
  const hts2 = await sock(HT); await hts2.ack('presence:set', { online: true });
  const t1s2 = await sock(T1);
  assert.match((await t1s2.ack('call:start', { hostId: HT.user.id, type: 'audio' })).error, /isn't taking audio calls/); ok('host can switch off audio calls; members are told');
  assert.equal((await req(`/hosts/${HT.user.id}`, {}, U)).body.accept_audio, 0);
  await req('/host/call-types', { method: 'PUT', body: { audio: true, video: true } }, HT);
  // earnings categories: a gift + an admin bonus
  const convHT = (await req('/conversations', { method: 'POST', body: { hostId: HT.user.id } }, T1)).body;
  await req(`/conversations/${convHT.id}/gift`, { method: 'POST', body: { giftId: 1 } }, T1); // Rose 10 → host 5
  assert.equal((await req(`/admin/hosts/${HT.user.id}/bonus`, { method: 'POST', body: { amount: 40, note: 'Daily bonus' } }, A)).status, 200);
  await sleep(1100);
  const st = (await req('/host/stats', {}, HT)).body;
  assert.ok(st.todayBreakdown.call > 0); assert.equal(st.todayBreakdown.gift, 5); assert.equal(st.todayBreakdown.other, 40);
  assert.equal(st.weekBreakdown.total, st.todayBreakdown.total); assert.ok(st.onlineSecondsToday >= 1); assert.equal(st.minWithdraw, 100); ok('stats: call/gift/other earnings today and this week, time online today');
  // alerts
  let al = (await req('/host/alerts', {}, HT)).body;
  assert.ok(al.alerts.some((a) => a.kind === 'bonus' && /\+40/.test(a.title))); assert.ok(al.alerts.some((a) => a.kind === 'verification')); assert.ok(al.unread >= 2);
  await req('/host/alerts/read', { method: 'POST' }, HT);
  assert.equal((await req('/host/alerts', {}, HT)).body.unread, 0); ok('alerts for bonus and verification; mark as read');
  assert.ok((await req('/host/alerts', {}, H)).body.alerts.some((a) => a.kind === 'missed')); ok('missed calls create an alert');
  // leaderboard
  const lb = (await req('/host/leaderboard', {}, HT)).body;
  assert.ok(lb.top.length >= 1 && lb.top.length <= 10); assert.ok(lb.myRank >= 1); assert.equal(lb.top.find((r) => r.me)?.id, HT.user.id); ok('weekly top-10 leaderboard with my rank');
  // invites: 10% of what the invited host earns
  const inv = (await req('/host/invite', {}, HT)).body;
  assert.match(inv.code, /^[A-Z0-9]{6}$/); assert.match(inv.link, new RegExp(`ref=${inv.code}`)); assert.equal(inv.pct, 10);
  const HI = (await signup({ name: 'Invited Host', refCode: inv.code.toLowerCase() }, 'host')).body;
  await req(`/admin/hosts/${HI.user.id}`, { method: 'PATCH', body: { approved: true } }, A);
  assert.ok((await req('/host/alerts', {}, HT)).body.alerts.some((a) => a.kind === 'referral')); ok('inviting host is told when someone joins with their code');
  const refBefore = (await req('/host/stats', {}, HT)).body.profile.earnings;
  const convHI = (await req('/conversations', { method: 'POST', body: { hostId: HI.user.id } }, T1)).body;
  for (let i = 0; i < 4; i++) await req(`/conversations/${convHI.id}/gift`, { method: 'POST', body: { giftId: 1 } }, T1); // invitee earns 4 × 5 = 20
  assert.equal((await req('/host/stats', {}, HI)).body.profile.earnings, 20);
  assert.equal((await req('/host/stats', {}, HT)).body.profile.earnings - refBefore, 2);
  assert.equal((await req('/host/invite', {}, HT)).body.invited, 1); ok('inviting host earns 10% on top (invitee keeps all of theirs)');
  // offers & help videos
  assert.equal((await req('/host/offers', {}, HT)).body.length, 2);
  assert.equal((await req('/admin/offers', { method: 'POST', body: { title: 'Diwali special', body: 'Double bonus this week', tone: 'gold' } }, A)).status, 200);
  assert.equal((await req('/host/offers', {}, HT)).body.length, 3); ok('admin-managed offers shown to hosts');
  assert.equal((await req('/admin/help-videos', { method: 'POST', body: { title: 'App info', url: 'not a link', language: 'Marathi' } }, A)).status, 400);
  await req('/admin/help-videos', { method: 'POST', body: { title: 'App माहिती', url: 'https://youtu.be/dQw4w9WgXcQ', language: 'Marathi' } }, A);
  await req('/admin/help-videos', { method: 'POST', body: { title: 'How to earn more', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', language: 'Hindi' } }, A);
  const hv = (await req('/host/help-videos?lang=Marathi', {}, HT)).body;
  assert.deepEqual(hv.languages.sort(), ['Hindi', 'Marathi']); assert.equal(hv.videos.length, 1); assert.equal(hv.videos[0].youtube_id, 'dQw4w9WgXcQ'); ok('help videos by language (YouTube links)');
  // levels table editing
  const L = (level, target, ae, ve, a, v) => ({ level, target, audio_earn: ae, video_earn: ve, audio: a, video: v });
  assert.equal((await req('/admin/levels', { method: 'PUT', body: [L(1, 0, 3, 8, 10, 30), L(3, 10, 4, 9, 12, 35)] }, A)).status, 400); ok('level table must be numbered without gaps');
  assert.match((await req('/admin/levels', { method: 'PUT', body: [L(1, 0, 3, 20, 10, 30)] }, A)).body.error, /worth less/); ok('member price must cover what the host earns');
  const nl = await req('/admin/levels', { method: 'PUT', body: [L(1, 0, 3, 8, 10, 30), L(2, 500, 4, 9, 12, 35)] }, A);
  assert.equal(nl.status, 200); assert.equal((await req('/host/program', {}, HT)).body.levels.length, 2); ok('admin edits the level table');
  await req('/admin/levels', { method: 'PUT', body: [L(1, 0, 3, 8, 10, 30), L(2, 70000, 4, 9, 12, 35), L(3, 300000, 5, 10, 14, 40)] }, A);
  hts2.close(); t1s2.close();

  // ================= HOST REWORK (PDF) =================
  // 6. levels go up automatically with lifetime earnings
  const HL = (await signup({ name: 'Level Host' }, 'host')).body;
  await req(`/admin/hosts/${HL.user.id}`, { method: 'PATCH', body: { approved: true } }, A);
  await req(`/admin/hosts/${HL.user.id}/bonus`, { method: 'POST', body: { amount: 70000, note: 'Test' } }, A);
  let hlp = (await req('/host/program', {}, HL)).body;
  assert.equal(hlp.level, 2); assert.equal(hlp.earnVideo, 9); assert.equal(hlp.videoRate, 35);
  assert.ok((await req('/host/alerts', {}, HL)).body.alerts.some((a) => a.kind === 'level')); ok('70,000 coins earned → Level 2 automatically, with an alert');
  await req(`/admin/hosts/${HL.user.id}/bonus`, { method: 'POST', body: { amount: 230000, note: 'Test' } }, A);
  hlp = (await req('/host/program', {}, HL)).body;
  assert.equal(hlp.level, 3); assert.equal(hlp.earnAudio, 5); assert.equal(hlp.earnVideo, 10); assert.equal(hlp.next, null); ok('3,00,000 → Level 3 (top level)');

  // 4. withdrawals: ₹2,000 minimum, due within 18 hours, status visible to host and admin
  await req('/admin/settings', { method: 'PATCH', body: { min_withdraw_inr: 2000 } }, A);
  let hls = (await req('/host/stats', {}, HL)).body;
  assert.equal(hls.minWithdrawInr, 2000); assert.equal(hls.minWithdraw, 4000); assert.equal(hls.payoutSlaHours, 18);
  await req('/host/payout-details', { method: 'PUT', body: { method: 'upi', upi_id: 'level@okbank' } }, HL);
  assert.match((await req('/host/payouts', { method: 'POST', body: { amount: 3999 } }, HL)).body.error, /₹2,000/); ok('withdrawal needs at least ₹2,000');
  assert.equal((await req('/host/payouts', { method: 'POST', body: { amount: 4000 } }, HL)).status, 200);
  hls = (await req('/host/stats', {}, HL)).body;
  const hp1 = hls.payouts[0];
  assert.equal(hp1.status, 'pending'); assert.equal(hp1.inr, 2000); assert.equal(hp1.overdue, false);
  assert.ok(Math.abs(Date.parse(hp1.due_at) - Date.parse(hp1.created_at.replace(' ', 'T') + 'Z') - 18 * 3600_000) < 1000); ok('host sees withdrawal status and the time it is due (18 h)');
  assert.ok((await req('/admin/payouts', {}, A)).body.some((p) => p.host_id === HL.user.id && p.due_at)); ok('admin sees every withdrawal with its due time');

  // 1. audio call → video call without hanging up
  const HV = (await signup({ name: 'Upgrade Host' }, 'host')).body;
  await req(`/admin/hosts/${HV.user.id}`, { method: 'PATCH', body: { approved: true } }, A);
  const hvs = await sock(HV); await hvs.ack('presence:set', { online: true });
  const UV = (await signup({ name: 'Upgrade Member' }, 'user')).body;
  await req(`/admin/users/${UV.user.id}/credit`, { method: 'POST', body: { amount: 300 } }, A);
  const uvs = await sock(UV);
  let vinc = hvs.once('call:incoming');
  const vr = await uvs.ack('call:start', { hostId: HV.user.id, type: 'audio' }); await vinc;
  await hvs.ack('call:accept', { callId: vr.callId });
  assert.equal((await uvs.ack('call:upgrade', { callId: 999999 })).error, 'Call not active');
  let upReq = hvs.once('call:upgrade-request');
  assert.ok((await uvs.ack('call:upgrade', { callId: vr.callId })).ok);
  assert.equal((await upReq).callId, vr.callId);
  const declined = uvs.once('call:upgrade-declined');
  await hvs.ack('call:upgrade-answer', { callId: vr.callId, accept: false }); await declined; ok('host can decline the video request; the audio call continues');
  upReq = hvs.once('call:upgrade-request');
  await uvs.ack('call:upgrade', { callId: vr.callId }); await upReq;
  const upU = uvs.once('call:upgraded'), upH = hvs.once('call:upgraded');
  assert.ok((await hvs.ack('call:upgrade-answer', { callId: vr.callId, accept: true })).ok);
  const [uu] = await Promise.all([upU, upH]);
  assert.equal(uu.type, 'video'); assert.equal(uu.rate, 30);
  const tk1 = await uvs.once('call:tick');
  const tk2 = await uvs.once('call:tick');
  assert.equal(tk2.charged - tk1.charged, 30); ok('audio call switches to video on the same call; next minute billed at the video price');
  const vEnd = uvs.once('call:ended'); uvs.emit('call:end', { callId: vr.callId });
  assert.equal((await vEnd).status, 'ended');
  assert.equal((await req('/calls', {}, UV)).body[0].type, 'video'); ok('the call record shows it ended as a video call');

  // 5. ratings & reviews
  const vrev = await req(`/calls/${vr.callId}/review`, { method: 'POST', body: { stars: 5, body: 'Lovely chat!' } }, UV);
  assert.equal(vrev.status, 200); assert.equal(vrev.body.avg, 5);
  assert.equal((await req(`/calls/${vr.callId}/review`, { method: 'POST', body: { stars: 4 } }, UV)).status, 400); ok('a member rates a call 1–5 stars, once');
  assert.equal((await req(`/calls/${vr.callId}/review`, { method: 'POST', body: { stars: 5 } }, U)).status, 404); ok("can't rate someone else's call");
  const rv = (await req(`/hosts/${HV.user.id}`, {}, UV)).body;
  assert.equal(rv.rating, 5); assert.equal(rv.reviews, 1);
  const rvl = (await req(`/hosts/${HV.user.id}/reviews`, {}, U)).body;
  assert.equal(rvl.reviews[0].body, 'Lovely chat!'); assert.equal(rvl.reviews[0].name, 'Upgrade'); ok('rating and reviews show on the host profile (first name only)');
  assert.equal((await req('/host/reviews', {}, HV)).body.count, 1); ok('host sees their own reviews');

  // 2. hosts see members online / offline / new, and get told when one comes online
  const comeOnline = hvs.once('customer:online');
  const UN = (await signup({ name: 'Fresh Member' }, 'user')).body; const uns = await sock(UN);
  const co = await comeOnline;
  assert.equal(co.id, UN.user.id); assert.equal(co.isNew, true); assert.equal(co.email, undefined); ok('host is notified instantly when a member comes online (no private details)');
  const onlineList = (await req('/host/customers?tab=online', {}, HV)).body;
  assert.ok(onlineList.customers.some((x) => x.id === UN.user.id && x.online === 1)); assert.ok(onlineList.counts.online >= 1);
  assert.ok((await req('/host/customers?tab=new', {}, HV)).body.customers.some((x) => x.id === UN.user.id));
  const allList = (await req('/host/customers?tab=all', {}, HV)).body.customers;
  assert.ok(allList.some((x) => x.online === 0)); ok('host panel: online list, new members, everyone with online/offline status');
  const cp = (await req(`/host/customers/${UN.user.id}`, {}, HV)).body;
  assert.equal(cp.name, 'Fresh Member'); assert.equal(cp.online, 1); assert.equal(cp.email, undefined); ok('host can open a member profile');
  assert.equal((await req(`/host/customers/${UN.user.id}`, {}, UV)).status, 403); ok('members cannot use the host customer list');

  // 3. free call: once per member and once per device
  await req('/admin/settings', { method: 'PATCH', body: { free_trial_enabled: 1, free_trial_seconds: 1 } }, A);
  const DEV = 'device-abc12345';
  const D1 = (await signup({ name: 'Device One' }, 'user')).body; const d1s = await sock(D1);
  assert.equal((await req('/me', { headers: { 'x-mj-device': DEV } }, D1)).body.free_trial.available, true);
  vinc = hvs.once('call:incoming');
  const dr = await d1s.ack('call:start', { hostId: HV.user.id, type: 'audio', device: DEV }); await vinc;
  assert.equal(dr.freeTrialMs, 1000);
  await hvs.ack('call:accept', { callId: dr.callId });
  const dEnd = d1s.once('call:ended'); d1s.emit('call:end', { callId: dr.callId }); await dEnd;
  const D2 = (await signup({ name: 'Device Two' }, 'user')).body; const d2s = await sock(D2);
  assert.equal((await req('/me', { headers: { 'x-mj-device': DEV } }, D2)).body.free_trial.available, false);
  assert.equal((await req('/me', { headers: { 'x-mj-device': 'other-device-999' } }, D2)).body.free_trial.available, true);
  vinc = hvs.once('call:incoming');
  const dr2 = await d2s.ack('call:start', { hostId: HV.user.id, type: 'audio', device: DEV }); await vinc;
  assert.equal(dr2.freeTrialMs, 0); ok('a second account on the same device does not get another free call');
  const d2End = d2s.once('call:ended'); d2s.emit('call:end', { callId: dr2.callId }); await d2End;
  await req('/admin/settings', { method: 'PATCH', body: { free_trial_enabled: 0 } }, A);

  // 8. chat limit: 3 messages each side, calls stay open
  await req('/admin/settings', { method: 'PATCH', body: { chat_limit: 3 } }, A);
  const cv = (await req('/conversations', { method: 'POST', body: { hostId: HV.user.id } }, UV)).body;
  for (const t of ['one', 'two', 'three']) assert.equal((await req(`/conversations/${cv.id}/messages`, { method: 'POST', body: { body: t } }, UV)).status, 200);
  const lim = await req(`/conversations/${cv.id}/messages`, { method: 'POST', body: { body: 'four' } }, UV);
  assert.equal(lim.status, 403); assert.equal(lim.body.code, 'CHAT_LIMIT');
  assert.equal((await req(`/conversations/${cv.id}`, {}, UV)).body.chat.left, 0);
  assert.equal((await req(`/conversations/${cv.id}`, {}, HV)).body.chat.left, 3); ok('member can send 3 messages, then chat stops; host still has 3');
  assert.ok((await req(`/conversations/${cv.id}/gift`, { method: 'POST', body: { giftId: 1 } }, UV)).status === 200); ok('gifts and calls stay available after the limit');

  // 7. contact sharing is blocked; repeat offenders are blocked; admin reviews and unblocks
  await req('/admin/settings', { method: 'PATCH', body: { contact_block_after: 2 } }, A);
  const cs = await req(`/conversations/${cv.id}/messages`, { method: 'POST', body: { body: 'my whatsapp is 98765 43210' } }, HV);
  assert.equal(cs.status, 400); assert.equal(cs.body.code, 'CONTACT_BLOCKED');
  assert.ok((await req('/host/alerts', {}, HV)).body.alerts.some((a) => a.kind === 'warning')); ok('host message with a phone/WhatsApp number is stopped and the host is warned');
  assert.equal((await req('/me', { method: 'PATCH', body: { bio: 'insta id priya_23' } }, HV)).status, 400); ok('contact details are not allowed in the host profile either');
  assert.equal((await req('/me', {}, HV)).status, 401); ok('after 2 attempts the host is blocked automatically');
  const hvLogin = await req('/auth/login', { method: 'POST', app: 'host', body: { email: HV.user.email, password: 'secret123' } });
  assert.equal(hvLogin.status, 403); assert.match(hvLogin.body.error, /contact details/);
  const vio = (await req('/admin/violations', {}, A)).body.filter((v) => v.user_id === HV.user.id);
  assert.equal(vio.length, 2); assert.equal(vio[0].status, 'open');
  await req(`/admin/violations/${vio[0].id}`, { method: 'PATCH', body: { status: 'reviewed' } }, A);
  await req(`/admin/hosts/${HV.user.id}`, { method: 'PATCH', body: { status: 'active' } }, A);
  assert.equal((await req('/auth/login', { method: 'POST', app: 'host', body: { email: HV.user.email, password: 'secret123' } })).status, 200); ok('admin reviews violations and can unblock the host');
  assert.equal((await req(`/conversations/${cv.id}/messages`, { method: 'POST', body: { body: 'call 9876543210' } }, U)).status, 404);
  const cvU = (await req('/conversations', { method: 'POST', body: { hostId: HL.user.id } }, UV)).body;
  assert.equal((await req(`/conversations/${cvU.id}/messages`, { method: 'POST', body: { body: 'call me 9876543210' } }, UV)).body.code, 'CONTACT_BLOCKED'); ok('members cannot send numbers either');
  for (const s of [hvs, uvs, uns, d1s, d2s]) s.close();

  // 9. identity + gender verification before working
  await req('/admin/settings', { method: 'PATCH', body: { require_host_verification: 1 } }, A);
  const HK = (await signup({ name: 'Kyc Host' }, 'host')).body;
  await req(`/admin/hosts/${HK.user.id}`, { method: 'PATCH', body: { approved: true } }, A);
  const hks = await sock(HK);
  assert.equal((await hks.ack('presence:set', { online: true })).code, 'NEEDS_VERIFICATION'); ok('an approved host must verify identity before going online');
  assert.match((await req(`/admin/hosts/${HK.user.id}`, { method: 'PATCH', body: { verification: 'verified' } }, A)).body.error, /gender/); ok('admin must confirm gender to verify');
  await req(`/admin/hosts/${HK.user.id}`, { method: 'PATCH', body: { verification: 'verified', gender: 'female' } }, A);
  assert.equal((await hks.ack('presence:set', { online: true })).online, 1);
  const hkPub = (await req(`/hosts/${HK.user.id}`, {}, U)).body;
  assert.equal(hkPub.verified, 1); assert.equal(hkPub.gender_verified, 1); assert.equal(hkPub.gender, 'female'); ok('verified host (identity + gender) goes online with a verified badge');
  await req(`/admin/hosts/${HK.user.id}`, { method: 'PATCH', body: { status: 'blocked', reason: 'Fake identity' } }, A);
  assert.match((await req('/auth/login', { method: 'POST', app: 'host', body: { email: HK.user.email, password: 'secret123' } })).body.error, /Fake identity/); ok('admin can block a host for a fake identity');
  hks.close();
  await req('/admin/settings', { method: 'PATCH', body: { require_host_verification: 0, chat_limit: 0, contact_block_after: 0, min_withdraw_inr: 0 } }, A);

  // ---------- phone OTP sign-in (via Supabase) ----------
  const ph = { sub: crypto.randomUUID(), provider: 'phone', phone: '919812345678', email: undefined, email_verified: undefined };
  let pr = await req('/auth/phone', { method: 'POST', app: 'host', body: { accessToken: googleToken(ph) } });
  assert.equal(pr.body.needsProfile, true); assert.equal(pr.body.needsName, true); assert.equal(pr.body.phone, '+919812345678'); ok('new phone user is asked for name, date of birth and terms');
  pr = await req('/auth/phone', { method: 'POST', app: 'host', body: { accessToken: googleToken(ph), name: 'Pooja Patil', birthDate: '1997-07-07', acceptTerms: true, refCode: inv.code } });
  assert.equal(pr.status, 200); assert.equal(pr.body.user.role, 'host'); assert.equal(pr.body.user.phone, '+919812345678'); assert.equal(pr.body.user.name, 'Pooja Patil'); ok('phone OTP sign-up creates a host (with invite code)');
  assert.equal((await req('/auth/phone', { method: 'POST', app: 'host', body: { accessToken: googleToken(ph) } })).body.user?.name, 'Pooja Patil'); ok('returning phone user signs straight in');
  assert.equal((await req('/auth/google', { method: 'POST', app: 'host', body: { accessToken: googleToken(ph) } })).status, 401); ok('a phone session is not accepted as a Google sign-in');
  assert.equal((await req('/host/invite', {}, HT)).body.invited, 2);
  for (const s of [hts, t1s, t2s, t3s]) s.close();

  // ---------- roles ----------
  assert.equal((await req('/admin/stats', {}, U)).status, 403);
  assert.equal((await req('/admin/stats', {}, H)).status, 403);
  assert.equal((await req('/admin/stats', {}, A)).status, 200);
  assert.equal((await req('/admin/seed-demo', { method: 'POST' }, U)).status, 403); ok('admin routes guarded');
  assert.equal((await req('/host/payouts', { method: 'POST', body: { amount: 50, upi: 'a@bank' } }, H)).status, 400); ok('payout minimum enforced');

  // ---------- admin deletes accounts ----------
  const DU = (await signup({ name: 'Delete Me' }, 'user')).body;
  assert.equal((await req(`/admin/users/${DU.user.id}`, { method: 'DELETE' }, U)).status, 403); ok('only admins can delete accounts');
  assert.equal((await req(`/admin/users/${A.user.id}`, { method: 'DELETE' }, A)).status, 404); ok('admin accounts cannot be deleted this way');
  assert.equal((await req(`/admin/users/${DU.user.id}`, { method: 'DELETE' }, A)).status, 200);
  assert.equal((await req('/me', {}, DU)).status, 401);
  assert.ok(!(await req('/admin/users', {}, A)).body.some((x) => x.id === DU.user.id)); ok('admin deletes a member account');
  assert.match((await req(`/admin/users/${HL.user.id}`, { method: 'DELETE' }, A)).body.error, /withdrawal waiting/); ok('a host with an unpaid withdrawal cannot be deleted yet');
  const hlPay = (await req('/admin/payouts', {}, A)).body.find((p) => p.host_id === HL.user.id && p.status === 'pending');
  await req(`/admin/payouts/${hlPay.id}`, { method: 'PATCH', body: { status: 'paid' } }, A);
  assert.equal((await req(`/admin/users/${HL.user.id}`, { method: 'DELETE' }, A)).status, 200);
  assert.ok(!(await req('/admin/hosts', {}, A)).body.some((x) => x.id === HL.user.id));
  assert.equal((await req(`/hosts/${HL.user.id}`, {}, U)).status, 404); ok('admin deletes a host account; it disappears for members');

  // ---------- account deletion ----------
  assert.equal((await req('/me', { method: 'DELETE', body: { password: 'wrong' } }, U2)).status, 400);
  assert.equal((await req('/me', { method: 'DELETE', body: { password: 'secret123' } }, U2)).status, 200);
  assert.equal((await req('/me', {}, U2)).status, 401); ok('account deletion removes the user');
  assert.equal((await req('/me', { method: 'DELETE', body: { password: DEMO } }, U)).status, 200);
  assert.ok((await req('/admin/calls', {}, A)).body.some((c) => c.user_name === 'Deleted user'));
  assert.ok((await req('/admin/payments', {}, A)).body.some((p) => p.order_id === order.orderId && p.status === 'paid')); ok('deleting a user keeps anonymous call & payment records');

  for (const s of [us, hs, ms, u2s]) s.close();
  console.log('\nALL PASSED');
} catch (e) {
  console.error('FAILED:', e);
  console.error(serverOut.split('\n').filter((l) => /error|Error|✘/.test(l)).slice(-15).join('\n'));
  process.exitCode = 1;
} finally {
  srv.kill(); rzp.close(); jwks.close();
  setTimeout(() => process.exit(), 300);
}
