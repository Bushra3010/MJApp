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

const vars = {
  JWT_SECRET: 'test-secret-0123456789abcdef0123456789abcdef', ADMIN_EMAILS: 'boss@test.io', ALLOW_DEMO_SEED: 'true', DEMO_PASSWORD: DEMO,
  BILLING_PERIOD_MS: '1000', DISABLE_RATE_LIMIT: 'true', RAZORPAY_KEY_ID: RZP.key, RAZORPAY_KEY_SECRET: RZP.secret,
  RAZORPAY_WEBHOOK_SECRET: RZP.wh, TRUST_APP_HEADER: 'true', RAZORPAY_API_BASE: 'http://localhost:4555', TURN_URL: 'turn:turn.example.com:3478', TURN_SECRET: 'turnsecret',
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
  assert.equal(sum.status, 'ended'); assert.equal(sum.charged, 75);
  const w = (await req('/wallet', {}, U)).body;
  assert.equal(w.coins, 425); ok('billed 3 started minutes = 75 coins (Durable Object alarms)');
  assert.equal((await req('/host/stats', {}, H)).body.profile.earnings, 36); ok('host earned 50% of each minute');

  await req(`/admin/users/${U.user.id}/credit`, { method: 'POST', body: { amount: -(w.coins - 30) } }, A);
  inc = hs.once('call:incoming');
  r = await us.ack('call:start', { hostId: H.user.id, type: 'video' }); await inc;
  ended = us.once('call:ended'); await hs.ack('call:accept', { callId: r.callId });
  const e2 = await ended;
  assert.equal(e2.reason, 'balance'); assert.equal(e2.charged, 25);
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
  const newMsg = hs.once('message:new');
  assert.equal((await req(`/conversations/${conv.id}/messages`, { method: 'POST', body: { body: 'hi' } }, U)).status, 200);
  assert.equal((await newMsg).body, 'hi'); ok('chat delivered realtime');
  assert.equal((await req(`/conversations/${conv.id}/gift`, { method: 'POST', body: { giftId: 3 } }, U)).status, 402); ok('gift refused without coins');
  assert.equal((await req(`/conversations/${conv.id}/messages`, { method: 'POST', body: { body: 'hello!' } }, H)).status, 200); ok('host replies free');
  assert.equal((await req(`/conversations/${conv.id}/messages`, {}, U2)).status, 404); ok("other users can't read a conversation");

  // ---------- payments (Razorpay, mocked API) ----------
  const order = (await req('/wallet/order', { method: 'POST', body: { packId: 'p2' } }, U)).body;
  assert.equal(order.mode, 'razorpay'); assert.equal(order.amount, 9900); assert.equal(order.keyId, RZP.key); ok('Razorpay order created server-side for ₹99');
  let v = await req('/wallet/verify', { method: 'POST', body: { razorpay_order_id: order.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'forged' } }, U);
  assert.equal(v.status, 400); ok('forged checkout signature rejected');
  v = await req('/wallet/verify', { method: 'POST', body: { razorpay_order_id: order.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: hmac(RZP.secret, `${order.orderId}|pay_1`) } }, U);
  assert.equal(v.body.coins, 254); ok('verified payment credits 250 coins');
  const wb = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: order.orderId } } } });
  assert.equal((await req('/webhooks/razorpay', { method: 'POST', raw: wb, headers: { 'x-razorpay-signature': 'nope' } })).status, 400); ok('webhook with bad signature rejected');
  for (let i = 0; i < 2; i++) await req('/webhooks/razorpay', { method: 'POST', raw: wb, headers: { 'x-razorpay-signature': hmac(RZP.wh, wb), 'x-razorpay-event-id': 'evt_1' } });
  assert.equal((await req('/wallet', {}, U)).body.coins, 254); ok('webhook + browser callback + retry credit exactly once');
  const order2 = (await req('/wallet/order', { method: 'POST', body: { packId: 'p1' } }, U)).body;
  const wb2 = JSON.stringify({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_2', order_id: order2.orderId } } } });
  await req('/webhooks/razorpay', { method: 'POST', raw: wb2, headers: { 'x-razorpay-signature': hmac(RZP.wh, wb2), 'x-razorpay-event-id': 'evt_2' } });
  assert.equal((await req('/wallet', {}, U)).body.coins, 354); ok('webhook alone credits when the browser closed early');
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

  // ---------- push ----------
  const key = (await req('/push/key')).body.publicKey;
  assert.equal(Buffer.from(key, 'base64url').length, 65); ok('VAPID key generated (P-256)');

  // ---------- roles ----------
  assert.equal((await req('/admin/stats', {}, U)).status, 403);
  assert.equal((await req('/admin/stats', {}, H)).status, 403);
  assert.equal((await req('/admin/stats', {}, A)).status, 200);
  assert.equal((await req('/admin/seed-demo', { method: 'POST' }, U)).status, 403); ok('admin routes guarded');
  assert.equal((await req('/host/payouts', { method: 'POST', body: { amount: 50, upi: 'a@bank' } }, H)).status, 400); ok('payout minimum enforced');

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
  srv.kill(); rzp.close();
  setTimeout(() => process.exit(), 300);
}
