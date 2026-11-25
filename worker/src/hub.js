// The Hub Durable Object: one instance holds the database, every WebSocket, presence, live calls and billing.
// Calls and timers are kept in SQLite and driven by the DO alarm, so nothing is lost if the object hibernates.
import { DurableObject } from 'cloudflare:workers';
import { makeDb, migrate, publicUser, safeHost } from './db.js';
import { verifyJwt } from './crypto.js';
import { vapidKeys, sendPush } from './push.js';
import { buildApi } from './routes.js';
import { ensureLevel, onlineStart, onlineStop, addAlert, creditReferrer, earnPerMinute } from './host-program.js';

const RING_MS = 30_000;
const OFFLINE_GRACE_MS = 8_000;
export const APPS = ['user', 'host', 'admin'];
// Each app (friends / host / admin) has its own session cookie, and a session only works in the app it was made for.
export const cookieName = (app) => `mj_${app}`;
/** Which app a request came from. The app's Worker stamps this header; browsers can't reach the Hub directly. */
export const appOf = (req) => (APPS.includes(req.headers.get('x-mj-app')) ? req.headers.get('x-mj-app') : 'user');

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.db = makeDb(ctx.storage);
    migrate(this.db);
    // once, after the move to lifetime levels: put every host on the level and prices their earnings give them
    if (!this.db.prepare("SELECT 1 FROM meta WHERE key = 'levels_v2_applied'").get()) {
      for (const r of this.db.prepare('SELECT user_id FROM host_profiles').all()) ensureLevel(this, r.user_id);
      this.db.prepare("INSERT INTO meta (key, value) VALUES ('levels_v2_applied', '1')").run();
    }
    this.minuteMs = Number(env.BILLING_PERIOD_MS || 60_000);
    this.rl = new Map();
    this.api = buildApi(this);
    // keep-alive pings are answered without waking the object from hibernation
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    this.moveCoins = this.db.transaction((userId, amount, kind, note = '', ref = '') => {
      const u = this.db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
      if (!u) throw Object.assign(new Error('User not found'), { status: 404 });
      const next = u.coins + amount;
      if (next < 0) throw Object.assign(new Error('Not enough coins'), { status: 402 });
      this.db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(next, userId);
      this.db.prepare('INSERT INTO transactions (user_id, kind, amount, balance_after, note, ref) VALUES (?,?,?,?,?,?)').run(userId, kind, amount, next, note, String(ref));
      return next;
    });
  }

  // ---------- helpers shared with routes ----------
  setting(key) { return Number(this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? 0); }

  /** Credit the host's share of coins spent on them. Fractions of a coin carry over, so 1-coin messages still pay. */
  creditHost(hostId, coinsSpent, note, ref) {
    const hp = this.db.prepare('SELECT earn_remainder FROM host_profiles WHERE user_id = ?').get(hostId);
    if (!hp) return 0;
    const total = coinsSpent * this.setting('host_share_pct') + (hp.earn_remainder || 0);
    const earned = Math.floor(total / 100);
    this.db.prepare('UPDATE host_profiles SET earn_remainder = ? WHERE user_id = ?').run(total % 100, hostId);
    if (earned <= 0) return 0;
    this.db.prepare('UPDATE host_profiles SET earnings = earnings + ?, total_earned = total_earned + ? WHERE user_id = ?').run(earned, earned, hostId);
    const bal = this.db.prepare('SELECT earnings FROM host_profiles WHERE user_id = ?').get(hostId)?.earnings ?? 0;
    this.db.prepare('INSERT INTO transactions (user_id, kind, amount, balance_after, note, ref) VALUES (?,?,?,?,?,?)').run(hostId, 'earning', earned, bal, note, String(ref));
    creditReferrer(this, hostId, earned);
    return earned;
  }

  /** Pay the host a fixed rupee amount (their per-minute call earning), stored as coins; fractions carry over. */
  creditHostInr(hostId, inr, note, ref) {
    const hp = this.db.prepare('SELECT earn_remainder FROM host_profiles WHERE user_id = ?').get(hostId);
    const perCoin = this.setting('coin_to_inr') || 0.5;
    if (!hp || inr <= 0) return 0;
    const total = Math.round((inr / perCoin) * 100) + (hp.earn_remainder || 0); // in 1/100 coin
    const earned = Math.floor(total / 100);
    this.db.prepare('UPDATE host_profiles SET earn_remainder = ? WHERE user_id = ?').run(total % 100, hostId);
    if (earned <= 0) return 0;
    this.db.prepare('UPDATE host_profiles SET earnings = earnings + ?, total_earned = total_earned + ? WHERE user_id = ?').run(earned, earned, hostId);
    const bal = this.db.prepare('SELECT earnings FROM host_profiles WHERE user_id = ?').get(hostId)?.earnings ?? 0;
    this.db.prepare('INSERT INTO transactions (user_id, kind, amount, balance_after, note, ref) VALUES (?,?,?,?,?,?)').run(hostId, 'earning', earned, bal, note, String(ref));
    creditReferrer(this, hostId, earned);
    return earned;
  }

  me(u, device) {
    const out = publicUser(u);
    out.has_password = String(u.password_hash || '').startsWith('pbkdf2$');
    out.google_linked = !!u.supabase_id;
    delete out.google_sub;
    delete out.supabase_id;
    if (u.role === 'host') ensureLevel(this, u.id);
    if (u.role === 'host') out.host = safeHost(this.db.prepare('SELECT * FROM host_profiles WHERE user_id = ?').get(u.id));
    if (u.role === 'user') out.free_trial = { available: this.freeTrialAvailable(u, device), seconds: this.setting('free_trial_seconds') };
    delete out.free_trial_used_at;
    delete out.block_reason;
    return out;
  }

  /** ADMIN_EMAILS is the source of truth for who may use the admin app. */
  isAdminEmail(email) {
    return (this.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).includes(String(email || '').toLowerCase());
  }

  /** A member's first call starts with free seconds (once per member, if switched on in admin). */
  freeTrialAvailable(u, device) {
    if (u.role !== 'user' || u.free_trial_used_at || this.setting('free_trial_enabled') !== 1 || this.setting('free_trial_seconds') <= 0) return false;
    // one free call per device: a second account on the same phone/browser doesn't get another one
    const d = cleanDevice(device);
    return !(d && this.db.prepare('SELECT 1 FROM trial_devices WHERE device = ? AND user_id != ?').get(d, u.id));
  }

  /** The signed-in user for a request, only if their session was issued by this same app and matches their role. */
  async userFor(req) {
    const app = appOf(req);
    const token = this.tokenFrom(req, app);
    if (!token || !this.env.JWT_SECRET) return null;
    const p = await verifyJwt(token, this.env.JWT_SECRET);
    if (!p || p.app !== app) return null;
    const u = this.db.prepare('SELECT * FROM users WHERE id = ?').get(p.id);
    if (!u || u.status === 'blocked' || u.role !== app || (u.token_version || 0) !== (p.tv || 0)) return null;
    if (u.role === 'admin' && !this.isAdminEmail(u.email)) return null; // removed from ADMIN_EMAILS → admin access ends immediately
    return u;
  }

  tokenFrom(req, app) {
    const bearer = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (bearer) return bearer;
    const name = cookieName(app);
    const m = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${name}=`));
    return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
  }

  /** In-memory sliding-window limiter (per Durable Object instance). */
  limited(key, max, windowMs) {
    if (this.env.DISABLE_RATE_LIMIT === 'true') return false;
    const now = Date.now();
    const hits = (this.rl.get(key) || []).filter((t) => now - t < windowMs);
    hits.push(now);
    this.rl.set(key, hits);
    if (this.rl.size > 5000) this.rl.clear();
    return hits.length > max;
  }

  // ---------- sockets ----------
  socketsOf(userId) { return this.ctx.getWebSockets(`u:${userId}`).filter((w) => w.readyState === 1); }
  isOnline(userId) { return this.socketsOf(userId).length > 0; }
  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* closed */ } }
  emitTo(userId, e, d) { for (const ws of this.socketsOf(userId)) this.send(ws, { t: 'ev', e, d }); }
  broadcast(e, d) { for (const ws of this.ctx.getWebSockets()) if (ws.readyState === 1) this.send(ws, { t: 'ev', e, d }); }
  disconnectUser(userId) { for (const ws of this.ctx.getWebSockets(`u:${userId}`)) { try { ws.close(4001, 'signed out'); } catch { /* */ } } }

  pushTo(userId, payload, opts = {}) {
    const subs = this.db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
    if (!subs.length) return;
    this.ctx.waitUntil((async () => {
      const keys = await vapidKeys(this.db, this.env);
      for (const s of subs) {
        try {
          const status = await sendPush({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, payload, keys, { subject: this.env.VAPID_SUBJECT || 'mailto:support@example.com', ...opts });
          if (status === 404 || status === 410) this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint);
        } catch (e) { console.error('push failed', e); }
      }
    })());
  }

  /** Send an event to every host who has the app open. */
  toHosts(e, d) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== 1) continue;
      const who = ws.deserializeAttachment();
      if (who?.role === 'host') this.send(ws, { t: 'ev', e, d });
    }
  }
  /** What hosts may see about a member. */
  customerCard(u) {
    const isNew = Date.now() - Date.parse(String(u.created_at).replace(' ', 'T') + 'Z') < 7 * 86_400_000;
    return { id: u.id, name: u.name, avatar: u.avatar, city: u.city, languages: u.languages, created_at: u.created_at, online: this.isOnline(u.id) ? 1 : 0, isNew };
  }

  setHostFlags(hostId, fields) {
    for (const [k, v] of Object.entries(fields)) this.db.prepare(`UPDATE host_profiles SET ${k} = ? WHERE user_id = ?`).run(v, hostId);
    const hp = this.db.prepare('SELECT online, busy FROM host_profiles WHERE user_id = ?').get(hostId);
    if (!hp) return;
    this.broadcast('host:status', { id: hostId, online: hp.online && this.isOnline(hostId) ? 1 : 0, busy: hp.busy });
  }

  // ---------- entry ----------
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') return this.openSocket(req);
    if (url.pathname.startsWith('/uploads/')) {
      const row = this.db.prepare('SELECT type, data FROM uploads WHERE name = ?').get(url.pathname.slice(9));
      if (!row) return new Response('Not found', { status: 404 });
      return new Response(row.data, { headers: {
        'content-type': row.type, 'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'",
      } });
    }
    return this.api.fetch(req, this.env);
  }

  async openSocket(req) {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const u = await this.userFor(req);
    if (!u) return new Response('unauthorized', { status: 401 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // a member counts as "just came online" only if they had no open app and weren't in the reconnect grace period
    const cameOnline = u.role === 'user' && !this.isOnline(u.id) && !this.db.prepare('SELECT 1 FROM timers WHERE key = ?').get(`offline:${u.id}`);
    this.ctx.acceptWebSocket(server, [`u:${u.id}`]);
    server.serializeAttachment({ id: u.id, role: u.role });
    this.db.prepare('DELETE FROM timers WHERE key = ?').run(`offline:${u.id}`);
    if (cameOnline) this.toHosts('customer:online', this.customerCard(u));
    this.db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(u.id);
    if (u.role === 'host') {
      const hp = this.db.prepare('SELECT online, busy FROM host_profiles WHERE user_id = ?').get(u.id);
      this.broadcast('host:status', { id: u.id, online: hp?.online ? 1 : 0, busy: hp?.busy || 0 });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (msg.t === 'ping') return this.send(ws, { t: 'pong' });
    const who = ws.deserializeAttachment();
    const u = who && this.db.prepare('SELECT * FROM users WHERE id = ?').get(who.id);
    if (!u || u.status === 'blocked') { ws.close(4001, 'unauthorized'); return; }
    let out;
    try { out = await this.handleEvent(u, msg.e, msg.d || {}); } catch (e) { console.error(e); out = { error: 'Something went wrong' }; }
    if (msg.id) this.send(ws, { t: 'ack', id: msg.id, d: out ?? null });
  }

  async webSocketClose(ws) { this.onSocketGone(ws); }
  async webSocketError(ws) { this.onSocketGone(ws); }

  onSocketGone(ws) {
    const who = ws.deserializeAttachment();
    if (!who) return;
    const others = this.ctx.getWebSockets(`u:${who.id}`).filter((w) => w !== ws && w.readyState === 1);
    if (others.length) return;
    // short grace period so a page refresh doesn't drop a call or flip presence
    this.db.prepare('INSERT INTO timers (key, due_ms, kind, ref) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET due_ms = excluded.due_ms')
      .run(`offline:${who.id}`, Date.now() + OFFLINE_GRACE_MS, 'offline', who.id);
    this.scheduleAlarm();
  }

  // ---------- realtime events ----------
  async handleEvent(u, e, d) {
    const db = this.db;
    switch (e) {
      case 'presence:set': {
        if (u.role !== 'host') return { error: 'Only hosts' };
        const hp = db.prepare('SELECT approved, kyc_status FROM host_profiles WHERE user_id = ?').get(u.id);
        if (d.online && !hp?.approved) return { error: 'Your profile is waiting for admin approval' };
        if (d.online && this.setting('require_host_verification') === 1 && hp.kyc_status !== 'verified') {
          return { error: hp.kyc_status === 'pending' ? 'Your identity verification is under review. You can go online once it is approved.' : 'Complete identity verification (Account → Verification) before going online.', code: 'NEEDS_VERIFICATION' };
        }
        this.setHostFlags(u.id, { online: d.online ? 1 : 0 });
        if (d.online) { ensureLevel(this, u.id); onlineStart(this, u.id); } else onlineStop(this, u.id);
        return { ok: true, online: d.online ? 1 : 0 };
      }
      case 'call:start': return this.startCall(u, Number(d.hostId), d.type, d.device);
      case 'call:upgrade': return this.requestUpgrade(u, Number(d.callId));
      case 'call:upgrade-answer': return this.answerUpgrade(u, Number(d.callId), !!d.accept);
      case 'call:accept': return this.acceptCall(u, Number(d.callId));
      case 'call:decline': {
        const c = this.liveCallOf(u, d.callId);
        if (c && c.status === 'ringing') this.endCall(c.id, c.host_id === u.id ? 'declined' : 'cancelled');
        return { ok: true };
      }
      case 'call:end': {
        const c = this.liveCallOf(u, d.callId);
        if (c) this.endCall(c.id, c.status === 'ringing' ? 'cancelled' : (c.user_id === u.id ? 'user_hangup' : 'host_hangup'));
        return { ok: true };
      }
      case 'call:failed': {
        const c = this.liveCallOf(u, d.callId);
        if (c) this.endCall(c.id, 'failed');
        return { ok: true };
      }
      case 'rtc:signal': {
        const c = this.liveCallOf(u, d.callId);
        if (!c) return { error: 'No such call' };
        this.emitTo(c.user_id === u.id ? c.host_id : c.user_id, 'rtc:signal', { callId: c.id, data: d.data });
        return null;
      }
      case 'typing': {
        const to = Number(d.to);
        const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(Number(d.conversationId));
        if (conv && [conv.user_id, conv.host_id].includes(u.id) && [conv.user_id, conv.host_id].includes(to)) this.emitTo(to, 'typing', { conversationId: conv.id, from: u.id });
        return null;
      }
      default: return { error: 'Unknown event' };
    }
  }

  liveCallOf(u, callId) {
    const c = this.db.prepare('SELECT * FROM live_calls WHERE id = ?').get(Number(callId));
    return c && (c.user_id === u.id || c.host_id === u.id) ? c : null;
  }

  startCall(u, hostId, type, device) {
    const db = this.db;
    if (u.role !== 'user') return { error: 'Only users can start calls' };
    if (!['audio', 'video'].includes(type)) return { error: 'Bad call type' };
    if (db.prepare('SELECT 1 FROM live_calls WHERE user_id = ?').get(u.id)) return { error: 'You are already in a call' };
    ensureLevel(this, hostId);
    const h = db.prepare('SELECT u.name, u.avatar, u.status, hp.* FROM users u JOIN host_profiles hp ON hp.user_id = u.id WHERE u.id = ?').get(hostId);
    if (h && type === 'video' && !h.accept_video) return { error: `${h.name} isn't taking video calls right now. Try an audio call.` };
    if (h && type === 'audio' && !h.accept_audio) return { error: `${h.name} isn't taking audio calls right now. Try a video call.` };
    if (!h || !h.approved || h.status !== 'active') return { error: 'Host not available' };
    if (db.prepare('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)').get(u.id, hostId, hostId, u.id)) return { error: 'Host not available' };
    if (!h.online || !this.isOnline(hostId)) return { error: `${h.name} is offline right now` };
    if (h.busy || db.prepare('SELECT 1 FROM live_calls WHERE host_id = ?').get(hostId)) return { error: `${h.name} is on another call. Try again in a bit.` };
    const rate = type === 'video' ? h.video_rate : h.audio_rate;
    const trialMs = this.freeTrialAvailable(u, device) ? this.setting('free_trial_seconds') * 1000 : 0;
    if (u.coins < rate && !trialMs) return { error: `You need at least ${rate} coins for a ${type} call`, code: 'LOW_BALANCE' };

    const callId = Number(db.prepare('INSERT INTO calls (user_id, host_id, type, rate) VALUES (?,?,?,?)').run(u.id, hostId, type, rate).lastInsertRowid);
    db.prepare(`INSERT INTO live_calls (id, user_id, host_id, type, rate, status, ring_deadline_ms, user_name, host_name, free_trial_ms, trial_device)
      VALUES (?,?,?,?,?, 'ringing', ?, ?, ?, ?, ?)`).run(callId, u.id, hostId, type, rate, Date.now() + RING_MS, u.name, h.name, trialMs, trialMs ? cleanDevice(device) : null);
    this.setHostFlags(hostId, { busy: 1 });
    this.emitTo(hostId, 'call:incoming', { callId, type, rate, freeTrialMs: trialMs, from: { id: u.id, name: u.name, avatar: u.avatar } });
    this.pushTo(hostId, { title: `Incoming ${type} call`, body: `${u.name} is calling you`, url: '/host', tag: `call-${callId}`, call: true }, { urgency: 'high', ttl: 30 });
    this.scheduleAlarm();
    return { ok: true, callId, rate, freeTrialMs: trialMs, host: { id: hostId, name: h.name, avatar: h.avatar } };
  }

  acceptCall(u, callId) {
    const c = this.db.prepare('SELECT * FROM live_calls WHERE id = ?').get(callId);
    if (!c || c.host_id !== u.id || c.status !== 'ringing') return { error: 'Call no longer available' };
    const now = Date.now();
    let trialMs = c.free_trial_ms || 0;
    if (trialMs) {
      // claim the trial now (once per member); if it was used meanwhile, fall back to a paid call
      const deviceTaken = c.trial_device && this.db.prepare('SELECT 1 FROM trial_devices WHERE device = ? AND user_id != ?').get(c.trial_device, c.user_id);
      const claimed = !deviceTaken && this.db.prepare("UPDATE users SET free_trial_used_at = datetime('now') WHERE id = ? AND free_trial_used_at IS NULL").run(c.user_id).changes;
      if (claimed && c.trial_device) this.db.prepare('INSERT OR IGNORE INTO trial_devices (device, user_id) VALUES (?, ?)').run(c.trial_device, c.user_id);
      if (!claimed) { trialMs = 0; this.db.prepare('UPDATE live_calls SET free_trial_ms = 0 WHERE id = ?').run(c.id); }
    }
    this.db.prepare("UPDATE live_calls SET status = 'active', started_ms = ?, ring_deadline_ms = NULL, next_charge_ms = ? WHERE id = ?")
      .run(now, now + (trialMs || this.minuteMs), c.id);
    this.db.prepare("UPDATE calls SET status = 'active', started_at = datetime('now') WHERE id = ?").run(c.id);
    if (!trialMs && !this.chargeMinute(c.id)) return { error: 'Caller has no coins' };
    const payload = { callId: c.id, type: c.type, rate: c.rate, startedAt: now, freeTrialMs: trialMs };
    this.emitTo(c.user_id, 'call:connected', { ...payload, role: 'caller' });
    this.emitTo(c.host_id, 'call:connected', { ...payload, role: 'callee' });
    this.scheduleAlarm();
    return { ok: true };
  }

  /** Charge the user one minute up front. Ends the call and returns false if they can't pay. */
  chargeMinute(callId) {
    const c = this.db.prepare('SELECT * FROM live_calls WHERE id = ?').get(callId);
    if (!c) return false;
    let coins;
    try {
      coins = this.moveCoins(c.user_id, -c.rate, 'call', `${c.type === 'video' ? 'Video' : 'Audio'} call minute ${c.minutes + 1}`, `call:${c.id}`);
    } catch {
      this.endCall(c.id, c.minutes === 0 && c.free_trial_ms ? 'trial_ended' : 'balance');
      return false;
    }
    // the host earns a fixed rupee amount per minute, set by their level (not a share of the price)
    const got = this.creditHostInr(c.host_id, earnPerMinute(this, c.host_id, c.type), `${c.type === 'video' ? 'Video' : 'Audio'} call minute`, `call:${c.id}`);
    const minutes = c.minutes + 1;
    const charged = c.charged + c.rate;
    const earned = (c.earned || 0) + got;
    this.db.prepare('UPDATE live_calls SET minutes = ?, charged = ?, earned = ? WHERE id = ?').run(minutes, charged, earned, c.id);
    this.emitTo(c.user_id, 'wallet:balance', { coins });
    const t = { callId: c.id, charged, minutes, lowBalance: coins < c.rate, nextChargeInMs: this.minuteMs };
    this.emitTo(c.user_id, 'call:tick', { ...t, coins });
    this.emitTo(c.host_id, 'call:tick', { ...t, earned });
    return true;
  }

  /** Member asks to turn an audio call into a video call. The host decides; the call keeps running meanwhile. */
  requestUpgrade(u, callId) {
    const c = this.liveCallOf(u, callId);
    if (!c || c.user_id !== u.id || c.status !== 'active') return { error: 'Call not active' };
    if (c.type === 'video') return { error: 'This is already a video call' };
    const hp = this.db.prepare('SELECT video_rate, accept_video FROM host_profiles WHERE user_id = ?').get(c.host_id);
    if (!hp?.accept_video) return { error: `${c.host_name} isn't taking video calls right now` };
    const me = this.db.prepare('SELECT coins FROM users WHERE id = ?').get(u.id);
    if (me.coins < hp.video_rate) return { error: `You need at least ${hp.video_rate} coins for video`, code: 'LOW_BALANCE', rate: hp.video_rate };
    this.db.prepare('UPDATE live_calls SET upgrade_pending = 1 WHERE id = ?').run(c.id);
    this.emitTo(c.host_id, 'call:upgrade-request', { callId: c.id, rate: hp.video_rate, from: c.user_name });
    return { ok: true, rate: hp.video_rate };
  }

  /** Host accepts or declines the switch to video. On accept the same call continues as video, billed at the video rate from the next minute. */
  answerUpgrade(u, callId, accept) {
    const c = this.liveCallOf(u, callId);
    if (!c || c.host_id !== u.id || c.status !== 'active' || !c.upgrade_pending) return { error: 'No video request' };
    this.db.prepare('UPDATE live_calls SET upgrade_pending = 0 WHERE id = ?').run(c.id);
    if (!accept) { this.emitTo(c.user_id, 'call:upgrade-declined', { callId: c.id }); return { ok: true }; }
    const rate = this.db.prepare('SELECT video_rate FROM host_profiles WHERE user_id = ?').get(c.host_id).video_rate;
    this.db.prepare("UPDATE live_calls SET type = 'video', rate = ? WHERE id = ?").run(rate, c.id);
    this.db.prepare("UPDATE calls SET type = 'video', rate = ? WHERE id = ?").run(rate, c.id);
    const payload = { callId: c.id, type: 'video', rate };
    this.emitTo(c.user_id, 'call:upgraded', payload);
    this.emitTo(c.host_id, 'call:upgraded', payload);
    return { ok: true, rate };
  }

  endCall(callId, reason) {
    const db = this.db;
    const c = db.prepare('SELECT * FROM live_calls WHERE id = ?').get(callId);
    if (!c) return;
    db.prepare('DELETE FROM live_calls WHERE id = ?').run(callId);
    const status = c.status === 'active' ? 'ended' : reason === 'declined' ? 'declined' : reason === 'failed' ? 'failed' : 'missed';
    const seconds = c.started_ms ? Math.round((Date.now() - c.started_ms) / 1000) : 0;
    const freeSeconds = c.free_trial_ms ? Math.min(seconds, Math.round(c.free_trial_ms / 1000)) : 0;
    db.prepare("UPDATE calls SET status = ?, ended_at = datetime('now'), seconds = ?, coins_charged = ?, end_reason = ?, free_seconds = ? WHERE id = ?").run(status, seconds, c.charged, reason, freeSeconds, c.id);
    this.setHostFlags(c.host_id, { busy: 0 });

    const label = c.type === 'video' ? 'Video call' : 'Audio call';
    const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    try {
      db.prepare('INSERT OR IGNORE INTO conversations (user_id, host_id) VALUES (?, ?)').run(c.user_id, c.host_id);
      const conv = db.prepare('SELECT * FROM conversations WHERE user_id = ? AND host_id = ?').get(c.user_id, c.host_id);
      const id = db.prepare("INSERT INTO messages (conversation_id, sender_id, type, body) VALUES (?, ?, 'call', ?)")
        .run(conv.id, c.user_id, status === 'ended' ? `${label} · ${mmss} · ${c.charged ? `${c.charged} coins` : 'free trial'}` : `${label} · ${status}`).lastInsertRowid;
      db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(conv.id);
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
      this.emitTo(c.user_id, 'message:new', msg);
      this.emitTo(c.host_id, 'message:new', msg);
    } catch { /* one side deleted their account */ }
    if (status === 'missed' && reason === 'no_answer') {
      this.pushTo(c.host_id, { title: 'Missed call', body: `You missed a ${c.type} call from ${c.user_name}`, url: '/host', tag: `call-${c.id}` });
      addAlert(this, c.host_id, 'missed', 'Missed call', `You missed a ${c.type} call from ${c.user_name}`, '/host/calls');
    }
    const summary = { callId: c.id, status, reason, seconds, charged: c.charged };
    this.emitTo(c.user_id, 'call:ended', { ...summary, reviewable: status === 'ended' && seconds > 0 });
    this.emitTo(c.host_id, 'call:ended', { ...summary, earned: c.earned || 0 });
    this.scheduleAlarm();
  }

  liveCalls() { return this.db.prepare('SELECT * FROM live_calls').all(); }

  // ---------- alarms: ring timeouts, per-minute billing, offline grace ----------
  scheduleAlarm() {
    const next = this.db.prepare(`SELECT MIN(t) AS t FROM (
      SELECT ring_deadline_ms AS t FROM live_calls WHERE status = 'ringing'
      UNION ALL SELECT next_charge_ms FROM live_calls WHERE status = 'active'
      UNION ALL SELECT due_ms FROM timers)`).get()?.t;
    if (next) this.ctx.storage.setAlarm(Math.max(next, Date.now() + 50));
    else this.ctx.storage.deleteAlarm();
  }

  async alarm() {
    const now = Date.now();
    for (const c of this.db.prepare("SELECT * FROM live_calls WHERE status = 'ringing' AND ring_deadline_ms <= ?").all(now)) this.endCall(c.id, 'no_answer');
    for (const c of this.db.prepare("SELECT * FROM live_calls WHERE status = 'active' AND next_charge_ms <= ?").all(now)) {
      if (!this.isOnline(c.user_id) && !this.isOnline(c.host_id)) { this.endCall(c.id, 'disconnected'); continue; }
      this.db.prepare('UPDATE live_calls SET next_charge_ms = next_charge_ms + ? WHERE id = ?').run(this.minuteMs, c.id);
      this.chargeMinute(c.id);
    }
    for (const t of this.db.prepare('SELECT * FROM timers WHERE due_ms <= ?').all(now)) {
      this.db.prepare('DELETE FROM timers WHERE key = ?').run(t.key);
      if (t.kind === 'offline' && !this.isOnline(t.ref)) {
        for (const c of this.db.prepare('SELECT id FROM live_calls WHERE user_id = ? OR host_id = ?').all(t.ref, t.ref)) this.endCall(c.id, 'disconnected');
        const u = this.db.prepare('SELECT role FROM users WHERE id = ?').get(t.ref);
        if (u?.role === 'host') { this.setHostFlags(t.ref, { online: 0 }); onlineStop(this, t.ref); }
        if (u?.role === 'user') this.toHosts('customer:offline', { id: t.ref });
        this.db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(t.ref);
      }
    }
    this.scheduleAlarm();
  }
}

/** Device ids come from the app (a random id kept on the device). Only short, plain ids are accepted. */
export function cleanDevice(d) {
  const s = String(d || '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : null;
}
