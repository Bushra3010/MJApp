// HTTP API (runs inside the Hub Durable Object). Same routes as the original Node server.
import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { COIN_PACKS, publicUser } from './db.js';
import { hashPassword, verifyPassword, signJwt, randomToken, randomHex, sha256Hex } from './crypto.js';
import { vapidKeys } from './push.js';
import { verifySupabaseGoogle, supabaseGoogleEnabled } from './supabase.js';
import {
  razorpayEnabled, createRazorpayOrder, verifyCheckoutSignature, verifyWebhookSignature, sendEmail, iceServersFor,
} from './services.js';
import { appOf, cookieName } from './hub.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const LANG_RE = /^[\p{L} ,]{0,200}$/u;
const MAX_UPLOAD = 2 * 1024 * 1024;

export function buildApi(h) {
  const db = h.db;
  const env = h.env;
  const app = new Hono().basePath('/api');
  const fresh = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const ip = (c) => c.req.header('cf-connecting-ip') || 'local';
  const isHttps = (c) => new URL(c.req.url).protocol === 'https:';
  const adminEmails = () => (env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);

  // route wrapper: returned objects become JSON; thrown errors become { error }
  const R = (fn) => async (c) => {
    try {
      const out = await fn(c);
      return out instanceof Response ? out : c.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof z.ZodError) return c.json({ error: e.issues[0]?.message || 'Invalid input' }, 400);
      if (!e.status) console.error(e);
      return c.json({ error: e.status ? e.message : 'Something went wrong', ...(e.extra || {}) }, e.status || 500);
    }
  };
  const body = async (c) => { try { return await c.req.json(); } catch { return {}; } };
  const parse = (schema, data) => schema.parse(data ?? {});
  const auth = (...roles) => async (c, next) => {
    const u = await h.userFor(c.req.raw);
    if (!u) return c.json({ error: 'Please log in again' }, 401);
    if (roles.length && !roles.includes(u.role)) return c.json({ error: 'Not allowed' }, 403);
    c.set('user', u);
    return next();
  };
  const limit = (name, max, minutes) => async (c, next) => {
    if (h.limited(`${name}:${ip(c)}`, max, minutes * 60_000)) return c.json({ error: 'Too many attempts. Please wait a few minutes.' }, 429);
    return next();
  };
  const APP_LABEL = { user: 'Milo Julo', host: 'Milo Julo Host', admin: 'Milo Julo Admin' };
  const startSession = async (c, u) => {
    const app = appOf(c.req.raw);
    if (u.role === 'admin' && !h.isAdminEmail(u.email)) throw bad('Admin access for this account has been removed.', 403);
    if (u.role !== app) throw Object.assign(bad(`This is a ${u.role === 'user' ? 'member' : u.role} account. Please use the ${APP_LABEL[u.role]} app.`, 403), { extra: { code: 'WRONG_APP', role: u.role } });
    const token = await signJwt({ id: u.id, role: u.role, app, tv: u.token_version || 0 }, env.JWT_SECRET);
    setCookie(c, cookieName(app), token, { httpOnly: true, sameSite: 'Lax', secure: isHttps(c), maxAge: 30 * 24 * 3600, path: '/' });
    return token;
  };
  const endSession = (c) => deleteCookie(c, cookieName(appOf(c.req.raw)), { path: '/' });

  app.use('*', async (c, next) => {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) return c.json({ error: 'Server not configured: set the JWT_SECRET secret (32+ characters).' }, 500);
    return next();
  });

  app.get('/health', R(() => { db.prepare('SELECT 1').get(); return { ok: true }; }));

  // ================= auth & account =================
  const registerSchema = z.object({
    name: z.string().trim().min(2, 'Enter your name').max(40, 'Name can be up to 40 characters'),
    email: z.string().trim().toLowerCase().email('Enter a valid email').max(120, 'Email is too long'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(100, 'Password can be up to 100 characters'),
    gender: z.enum(['', 'female', 'male', 'other']).default(''),
    languages: z.string().regex(LANG_RE).default('Hindi,English'),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth'),
    acceptTerms: z.boolean({ message: 'Please accept the Terms and Privacy Policy' }).refine((v) => v === true, { message: 'Please accept the Terms and Privacy Policy' }),
  });
  const age = (d) => {
    const b = new Date(d); const n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    return a;
  };

  app.post('/auth/register', limit('auth', 20, 15), R(async (c) => {
    const f = parse(registerSchema, await body(c));
    if (Number.isNaN(Date.parse(f.birthDate)) || age(f.birthDate) < 18) throw bad('You must be 18 or older to use Milo Julo');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(f.email)) throw bad('An account with this email already exists');
    // The app decides the account type: the friends app makes members, the host app makes hosts,
    // and the admin app only accepts emails listed in ADMIN_EMAILS.
    const role = appOf(c.req.raw);
    if (role === 'admin' && !adminEmails().includes(f.email)) throw bad('Admin accounts can only be created for approved admin emails.', 403);
    const pw = await hashPassword(f.password);
    const id = db.prepare('INSERT INTO users (role, name, email, password_hash, gender, languages, birth_date) VALUES (?,?,?,?,?,?,?)')
      .run(role, f.name, f.email, pw, f.gender, f.languages, f.birthDate).lastInsertRowid;
    if (role === 'host') db.prepare('INSERT INTO host_profiles (user_id, audio_rate, video_rate) VALUES (?,?,?)').run(id, h.setting('default_audio_rate'), h.setting('default_video_rate'));
    if (role === 'user' && h.setting('signup_bonus') > 0) h.moveCoins(id, h.setting('signup_bonus'), 'bonus', 'Welcome bonus');
    const u = fresh(id);
    const token = await startSession(c, u);
    return { user: h.me(u), token };
  }));

  app.post('/auth/login', limit('auth', 20, 15), R(async (c) => {
    const { email, password } = parse(z.object({ email: z.string().trim().toLowerCase(), password: z.string() }), await body(c));
    let u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (u && !String(u.password_hash || '').startsWith('pbkdf2$')) throw bad('This account uses Google sign-in. Tap "Continue with Google", or use "Forgot password" to set a password.', 401);
    if (!u || !(await verifyPassword(password, u.password_hash))) throw bad('Wrong email or password', 401);
    if (u.status === 'blocked') throw bad('This account has been blocked. Contact support.', 403);
    if (appOf(c.req.raw) === 'admin' && adminEmails().includes(email) && u.role !== 'admin') {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(u.id);
      db.prepare('DELETE FROM host_profiles WHERE user_id = ?').run(u.id);
      u = fresh(u.id);
    }
    const token = await startSession(c, u);
    return { user: h.me(u), token };
  }));

  // Sign in / sign up with Google via Supabase Auth. The app sends the Supabase access token; new people get
  // { needsProfile } first, then send it again with date of birth, languages and terms (the 18+ rule still applies).
  app.post('/auth/google', limit('auth', 30, 15), R(async (c) => {
    const b = parse(z.object({
      accessToken: z.string().min(20).max(8000),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      gender: z.enum(['', 'female', 'male', 'other']).default(''),
      languages: z.string().regex(LANG_RE).default('Hindi,English'),
      acceptTerms: z.boolean().optional(),
    }), await body(c));
    const g = await verifySupabaseGoogle(b.accessToken, env);
    const app = appOf(c.req.raw);

    let u = db.prepare('SELECT * FROM users WHERE supabase_id = ?').get(g.id);
    if (!u) {
      // Same verified email already registered with a password: link Google to that account.
      u = db.prepare('SELECT * FROM users WHERE email = ?').get(g.email);
      if (u) {
        if (u.supabase_id && u.supabase_id !== g.id) throw bad('This email is linked to a different Google account.', 409);
        db.prepare('UPDATE users SET supabase_id = ? WHERE id = ?').run(g.id, u.id);
        u = fresh(u.id);
      }
    }
    if (u) {
      if (u.status === 'blocked') throw bad('This account has been blocked. Contact support.', 403);
      if (app === 'admin' && adminEmails().includes(u.email) && u.role !== 'admin') {
        db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(u.id);
        db.prepare('DELETE FROM host_profiles WHERE user_id = ?').run(u.id);
        u = fresh(u.id);
      }
      const token = await startSession(c, u);
      return { user: h.me(u), token };
    }

    // New account
    if (app === 'admin' && !adminEmails().includes(g.email)) throw bad('Admin accounts can only be created for approved admin emails.', 403);
    if (!b.birthDate || b.acceptTerms !== true) return { needsProfile: true, name: g.name, email: g.email };
    if (Number.isNaN(Date.parse(b.birthDate)) || age(b.birthDate) < 18) throw bad('You must be 18 or older to use Milo Julo');
    const name = ((g.name || '').trim().length >= 2 ? g.name.trim() : g.email.split('@')[0]).slice(0, 40);
    const id = db.prepare("INSERT INTO users (role, name, email, password_hash, gender, languages, birth_date, supabase_id) VALUES (?,?,?,'',?,?,?,?)")
      .run(app, name, g.email, b.gender, b.languages, b.birthDate, g.id).lastInsertRowid;
    if (app === 'host') db.prepare('INSERT INTO host_profiles (user_id, audio_rate, video_rate) VALUES (?,?,?)').run(id, h.setting('default_audio_rate'), h.setting('default_video_rate'));
    if (app === 'user' && h.setting('signup_bonus') > 0) h.moveCoins(id, h.setting('signup_bonus'), 'bonus', 'Welcome bonus');
    const nu = fresh(id);
    const token = await startSession(c, nu);
    return { user: h.me(nu), token, created: true };
  }));

  app.post('/auth/logout', R((c) => { endSession(c); return { ok: true }; }));

  app.post('/auth/logout-all', auth(), R((c) => {
    const u = c.get('user');
    db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(u.id);
    h.disconnectUser(u.id);
    endSession(c);
    return { ok: true };
  }));

  app.post('/auth/forgot', limit('email', 5, 60), R(async (c) => {
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') }), await body(c));
    const u = db.prepare("SELECT * FROM users WHERE email = ? AND status = 'active' AND role = ?").get(email, appOf(c.req.raw));
    if (u) {
      const token = randomToken(32);
      db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))").run(await sha256Hex(token), u.id);
      const link = `${env.APP_URL || new URL(c.req.url).origin}/reset#${token}`;
      const name = u.name.replace(/[<>&"]/g, '');
      await sendEmail(env, {
        to: u.email,
        subject: 'Reset your Milo Julo password',
        text: `Hi ${u.name},\n\nUse this link to set a new password (valid for 1 hour):\n${link}\n\nIf you didn't ask for this, ignore this email.`,
        html: `<p>Hi ${name},</p><p><a href="${link}">Set a new password</a>. The link works for 1 hour.</p><p>If you didn't ask for this, ignore this email.</p>`,
      });
    }
    return { ok: true };
  }));

  app.post('/auth/reset', limit('auth', 20, 15), R(async (c) => {
    const { token, password } = parse(z.object({ token: z.string().min(10), password: z.string().min(8, 'Password must be at least 8 characters').max(100) }), await body(c));
    const hash = await sha256Hex(token);
    const row = db.prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')").get(hash);
    if (!row) throw bad('This reset link has expired. Request a new one.');
    const pw = await hashPassword(password);
    db.transaction(() => {
      db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(hash);
      db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(pw, row.user_id);
    })();
    h.disconnectUser(row.user_id);
    const u = fresh(row.user_id);
    if (u.role !== appOf(c.req.raw)) return { ok: true, loginElsewhere: u.role };
    await startSession(c, u);
    return { user: h.me(u) };
  }));

  app.get('/me', auth(), R((c) => h.me(c.get('user'))));

  app.patch('/me', auth(), R(async (c) => {
    const f = parse(z.object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters').max(40, 'Name can be up to 40 characters').optional(),
      bio: z.string().max(300, 'About you can be up to 300 characters').optional(),
      gender: z.enum(['', 'female', 'male', 'other']).optional(),
      city: z.string().max(60, 'City can be up to 60 characters').optional(),
      languages: z.string().regex(LANG_RE, 'Languages: letters and commas only').optional(),
    }), await body(c));
    const u = c.get('user');
    for (const [k, v] of Object.entries(f)) db.prepare(`UPDATE users SET ${k} = ? WHERE id = ?`).run(v, u.id);
    return h.me(fresh(u.id));
  }));

  app.post('/me/password', auth(), limit('auth', 20, 15), R(async (c) => {
    const { current, password } = parse(z.object({ current: z.string().default(''), password: z.string().min(8, 'New password must be at least 8 characters').max(100) }), await body(c));
    const u = c.get('user');
    const hasPassword = String(u.password_hash || '').startsWith('pbkdf2$');
    if (hasPassword && !(await verifyPassword(current, u.password_hash))) throw bad('Current password is wrong');
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(await hashPassword(password), u.id);
    await startSession(c, fresh(u.id));
    return { ok: true };
  }));

  // Photos: the app resizes and re-encodes on the device (which strips EXIF/GPS); the server accepts only real
  // JPEG/PNG/WebP files up to 2 MB, stores them under random names and serves them with nosniff.
  app.post('/me/avatar', auth(), limit('upload', 20, 60), R(async (c) => {
    const form = await c.req.parseBody().catch(() => ({}));
    const file = form.photo;
    if (!file || typeof file === 'string') throw bad('Choose a photo');
    if (file.size > MAX_UPLOAD) throw bad('Photo must be under 2 MB');
    const buf = new Uint8Array(await file.arrayBuffer());
    const type = sniffImage(buf);
    if (!type) throw bad('That file is not a supported image');
    const u = c.get('user');
    const name = `${randomHex(16)}.${type.split('/')[1]}`;
    db.prepare('INSERT INTO uploads (name, user_id, type, data) VALUES (?,?,?,?)').run(name, u.id, type, buf.buffer);
    if (u.avatar?.startsWith('/uploads/')) db.prepare('DELETE FROM uploads WHERE name = ?').run(u.avatar.slice(9));
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(`/uploads/${name}`, u.id);
    return h.me(fresh(u.id));
  }));

  app.delete('/me', auth('user', 'host'), R(async (c) => {
    const { password, confirm } = parse(z.object({ password: z.string().default(''), confirm: z.string().default('') }), await body(c));
    const u = c.get('user');
    const hasPassword = String(u.password_hash || '').startsWith('pbkdf2$');
    if (hasPassword ? !(await verifyPassword(password, u.password_hash)) : confirm !== 'DELETE') throw bad(hasPassword ? 'Password is wrong' : 'Type DELETE to confirm');
    for (const lc of db.prepare('SELECT id FROM live_calls WHERE user_id = ? OR host_id = ?').all(u.id, u.id)) h.endCall(lc.id, 'disconnected');
    h.disconnectUser(u.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    endSession(c);
    return { ok: true };
  }));

  app.get('/push/key', R(async () => ({ publicKey: (await vapidKeys(db, env)).publicKey })));
  app.post('/push/subscribe', auth(), R(async (c) => {
    const sub = parse(z.object({ endpoint: z.string().url().max(1000).refine((s) => s.startsWith('https://'), 'Bad endpoint'), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }), await body(c));
    db.prepare('INSERT INTO push_subscriptions (endpoint, user_id, keys) VALUES (?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys = excluded.keys')
      .run(sub.endpoint, c.get('user').id, JSON.stringify(sub.keys));
    return { ok: true };
  }));
  app.post('/push/unsubscribe', auth(), R(async (c) => {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(String((await body(c)).endpoint || ''), c.get('user').id);
    return { ok: true };
  }));

  // ================= config / ice =================
  const testPaymentsAllowed = () => !razorpayEnabled(env) && env.ALLOW_TEST_PAYMENTS === 'true';
  app.get('/ice', auth(), R(async (c) => ({ iceServers: await iceServersFor(env, c.get('user').id) })));
  app.get('/config', R(async () => ({
    chatCost: h.setting('chat_cost'),
    packs: COIN_PACKS,
    payments: razorpayEnabled(env) ? 'razorpay' : testPaymentsAllowed() ? 'test' : 'off',
    supabase: (await supabaseGoogleEnabled(env)) ? { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY } : null,
  })));

  // ================= discover =================
  const hostCols = `u.id, u.name, u.avatar, u.bio, u.gender, u.city, u.languages, u.last_seen_at, h.online, h.busy, h.audio_rate, h.video_rate`;
  const withPresence = (x) => ({ ...x, online: x.online && h.isOnline(x.id) ? 1 : 0 });

  app.get('/hosts', auth('user', 'admin'), R((c) => {
    const me = c.get('user').id;
    const { lang, q } = c.req.query();
    let rows = db.prepare(`SELECT ${hostCols} FROM users u JOIN host_profiles h ON h.user_id = u.id
      WHERE u.role = 'host' AND u.status = 'active' AND h.approved = 1
      AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
      AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
      ORDER BY u.last_seen_at DESC`).all(me, me).map(withPresence);
    if (lang) rows = rows.filter((x) => x.languages.toLowerCase().includes(String(lang).toLowerCase()));
    if (q) rows = rows.filter((x) => x.name.toLowerCase().includes(String(q).toLowerCase()));
    return rows;
  }));

  app.get('/hosts/:id', auth(), R((c) => {
    const x = db.prepare(`SELECT ${hostCols} FROM users u JOIN host_profiles h ON h.user_id = u.id WHERE u.id = ? AND u.role = 'host'`).get(Number(c.req.param('id')));
    if (!x) throw bad('Host not found', 404);
    const stats = db.prepare("SELECT COUNT(*) calls, COALESCE(SUM(seconds),0) seconds FROM calls WHERE host_id = ? AND status = 'ended'").get(x.id);
    return { ...withPresence(x), ...stats };
  }));

  // ================= chat =================
  const convFor = (c, id) => {
    const u = c.get('user');
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(Number(id));
    if (!conv || (conv.user_id !== u.id && conv.host_id !== u.id && u.role !== 'admin')) throw bad('Conversation not found', 404);
    return conv;
  };
  const isBlocked = (a, b) => !!db.prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').get(a, b, b, a);
  const postMessage = (conv, senderId, type, text) => {
    const id = db.prepare('INSERT INTO messages (conversation_id, sender_id, type, body) VALUES (?,?,?,?)').run(conv.id, senderId, type, text).lastInsertRowid;
    db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(conv.id);
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    h.emitTo(conv.user_id, 'message:new', msg);
    h.emitTo(conv.host_id, 'message:new', msg);
    const to = senderId === conv.user_id ? conv.host_id : conv.user_id;
    if (!h.isOnline(to)) {
      const from = db.prepare('SELECT name, role FROM users WHERE id = ?').get(senderId);
      const preview = type === 'gift' ? `🎁 sent you a ${JSON.parse(text).name}` : text.slice(0, 80);
      h.pushTo(to, { title: from.name, body: preview, url: `${from.role === 'host' ? '/app' : '/host'}/chat/${conv.id}`, tag: `chat-${conv.id}` });
    }
    return msg;
  };

  app.get('/conversations', auth('user', 'host'), R((c) => {
    const u = c.get('user');
    const mine = u.role === 'host' ? 'host_id' : 'user_id';
    const other = u.role === 'host' ? 'user_id' : 'host_id';
    return db.prepare(`SELECT c.id, c.host_id, c.last_message_at, o.id other_id, o.name other_name, o.avatar other_avatar, o.role other_role,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY id DESC LIMIT 1) last_body,
        (SELECT type FROM messages m WHERE m.conversation_id = c.id ORDER BY id DESC LIMIT 1) last_type,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) unread,
        h.online, h.busy
      FROM conversations c JOIN users o ON o.id = c.${other} JOIN host_profiles h ON h.user_id = c.host_id
      WHERE c.${mine} = ? ORDER BY c.last_message_at DESC`).all(u.id, u.id)
      .map((x) => ({ ...x, online: x.online && h.isOnline(x.host_id) ? 1 : 0 }));
  }));

  app.post('/conversations', auth('user'), R(async (c) => {
    const hostId = Number((await body(c)).hostId);
    if (!db.prepare('SELECT 1 FROM users u JOIN host_profiles h ON h.user_id = u.id WHERE u.id = ? AND h.approved = 1').get(hostId)) throw bad('Host not found', 404);
    const u = c.get('user');
    db.prepare('INSERT OR IGNORE INTO conversations (user_id, host_id) VALUES (?, ?)').run(u.id, hostId);
    return db.prepare('SELECT * FROM conversations WHERE user_id = ? AND host_id = ?').get(u.id, hostId);
  }));

  app.get('/conversations/:id', auth(), R((c) => {
    const conv = convFor(c, c.req.param('id'));
    const otherId = c.get('user').id === conv.user_id ? conv.host_id : conv.user_id;
    const other = db.prepare('SELECT id, name, avatar, role, city, languages FROM users WHERE id = ?').get(otherId);
    const host = db.prepare('SELECT online, busy, audio_rate, video_rate FROM host_profiles WHERE user_id = ?').get(conv.host_id);
    return { ...conv, other, host: { ...host, online: host.online && h.isOnline(conv.host_id) ? 1 : 0 } };
  }));

  app.get('/conversations/:id/messages', auth(), R((c) => {
    const conv = convFor(c, c.req.param('id'));
    db.prepare("UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL").run(conv.id, c.get('user').id);
    const before = Number(c.req.query('before')) || 1e15;
    return db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND id < ? ORDER BY id DESC LIMIT 100').all(conv.id, before).reverse();
  }));

  app.post('/conversations/:id/messages', auth('user', 'host'), R(async (c) => {
    const conv = convFor(c, c.req.param('id'));
    const text = String((await body(c)).body || '').trim().slice(0, 2000);
    if (!text) throw bad('Message is empty');
    if (isBlocked(conv.user_id, conv.host_id)) throw bad('You can no longer message this person', 403);
    const u = c.get('user');
    if (u.role === 'user') {
      const cost = h.setting('chat_cost');
      if (cost > 0) {
        const bal = h.moveCoins(u.id, -cost, 'chat', 'Chat message', `conv:${conv.id}`);
        h.creditHost(conv.host_id, cost, 'Chat message', `conv:${conv.id}`);
        h.emitTo(u.id, 'wallet:balance', { coins: bal });
      }
    }
    return postMessage(conv, u.id, 'text', text);
  }));

  app.get('/gifts', auth(), R(() => db.prepare('SELECT * FROM gifts ORDER BY price').all()));

  app.post('/conversations/:id/gift', auth('user'), R(async (c) => {
    const conv = convFor(c, c.req.param('id'));
    const g = db.prepare('SELECT * FROM gifts WHERE id = ?').get(Number((await body(c)).giftId));
    if (!g) throw bad('Gift not found');
    const u = c.get('user');
    const bal = h.moveCoins(u.id, -g.price, 'gift', `Gift: ${g.name}`, `conv:${conv.id}`);
    h.creditHost(conv.host_id, g.price, `Gift: ${g.name}`, `conv:${conv.id}`);
    h.emitTo(u.id, 'wallet:balance', { coins: bal });
    return postMessage(conv, u.id, 'gift', JSON.stringify({ name: g.name, emoji: g.emoji, price: g.price }));
  }));

  // ================= wallet & payments =================
  const fulfil = db.transaction((orderId, paymentId) => {
    const p = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
    if (!p) return null;
    if (p.status === 'paid') return { already: true, payment: p };
    db.prepare("UPDATE payments SET status = 'paid', payment_id = ?, paid_at = datetime('now') WHERE id = ?").run(paymentId, p.id);
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(p.user_id)) return { payment: p };
    const coins = h.moveCoins(p.user_id, p.coins, 'purchase', `Bought ${p.coins} coins (₹${p.amount_paise / 100})`, paymentId);
    return { coins, payment: p };
  });

  app.get('/wallet', auth(), R((c) => {
    const u = c.get('user');
    return {
      coins: db.prepare('SELECT coins FROM users WHERE id = ?').get(u.id).coins,
      packs: COIN_PACKS,
      transactions: db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 200').all(u.id),
    };
  }));

  app.post('/wallet/order', auth('user'), R(async (c) => {
    const { packId } = parse(z.object({ packId: z.string() }), await body(c));
    const pack = COIN_PACKS.find((p) => p.id === packId);
    if (!pack) throw bad('Pick a coin pack');
    const u = c.get('user');
    if (!razorpayEnabled(env)) {
      if (!testPaymentsAllowed()) throw bad('Payments are not set up yet', 503);
      const orderId = `test_${Date.now()}_${u.id}`;
      db.prepare("INSERT INTO payments (user_id, pack_id, coins, amount_paise, provider, order_id) VALUES (?,?,?,?, 'test', ?)").run(u.id, pack.id, pack.coins, pack.price * 100, orderId);
      return { mode: 'test', coins: fulfil(orderId, orderId).coins };
    }
    const order = await createRazorpayOrder(env, { amountPaise: pack.price * 100, receipt: `u${u.id}_${Date.now()}`, notes: { userId: String(u.id), packId: pack.id } });
    db.prepare('INSERT INTO payments (user_id, pack_id, coins, amount_paise, order_id) VALUES (?,?,?,?,?)').run(u.id, pack.id, pack.coins, pack.price * 100, order.id);
    return { mode: 'razorpay', keyId: env.RAZORPAY_KEY_ID, orderId: order.id, amount: order.amount, currency: 'INR', name: 'Milo Julo', description: `${pack.coins} coins`, prefill: { name: u.name, email: u.email } };
  }));

  app.post('/wallet/verify', auth('user'), R(async (c) => {
    const f = parse(z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() }), await body(c));
    const u = c.get('user');
    if (!db.prepare('SELECT 1 FROM payments WHERE order_id = ? AND user_id = ?').get(f.razorpay_order_id, u.id)) throw bad('Order not found', 404);
    if (!(await verifyCheckoutSignature(env, f.razorpay_order_id, f.razorpay_payment_id, f.razorpay_signature))) throw bad('Payment could not be verified');
    const out = fulfil(f.razorpay_order_id, f.razorpay_payment_id);
    const coins = db.prepare('SELECT coins FROM users WHERE id = ?').get(u.id).coins;
    h.emitTo(u.id, 'wallet:balance', { coins });
    return { ok: true, coins, already: !!out?.already };
  }));

  app.post('/webhooks/razorpay', async (c) => {
    const raw = await c.req.text();
    if (!(await verifyWebhookSignature(env, raw, c.req.header('x-razorpay-signature')))) return c.json({ error: 'bad signature' }, 400);
    let evt;
    try { evt = JSON.parse(raw); } catch { return c.json({ error: 'bad json' }, 400); }
    const pay = evt.payload?.payment?.entity;
    const eventId = c.req.header('x-razorpay-event-id') || `${evt.event}:${pay?.id || evt.created_at}`;
    if (db.prepare('SELECT 1 FROM webhook_events WHERE id = ?').get(eventId)) return c.json({ ok: true, duplicate: true });
    db.prepare('INSERT INTO webhook_events (id, type) VALUES (?, ?)').run(eventId, String(evt.event));
    if ((evt.event === 'payment.captured' || evt.event === 'order.paid') && pay?.order_id) {
      const out = fulfil(pay.order_id, pay.id);
      if (out?.coins !== undefined) h.emitTo(out.payment.user_id, 'wallet:balance', { coins: out.coins });
    } else if (evt.event === 'payment.failed' && pay?.order_id) {
      db.prepare("UPDATE payments SET status = 'failed', payment_id = ? WHERE order_id = ? AND status = 'created'").run(pay.id, pay.order_id);
    }
    return c.json({ ok: true });
  });

  // ================= calls history =================
  app.get('/calls', auth('user', 'host'), R((c) => {
    const u = c.get('user');
    const col = u.role === 'host' ? 'host_id' : 'user_id';
    const other = u.role === 'host' ? 'user_id' : 'host_id';
    return db.prepare(`SELECT c.*, COALESCE(o.name, 'Deleted account') other_name, o.avatar other_avatar FROM calls c LEFT JOIN users o ON o.id = c.${other}
      WHERE c.${col} = ? ORDER BY c.id DESC LIMIT 100`).all(u.id);
  }));

  // ================= host =================
  app.get('/host/stats', auth('host'), R((c) => {
    const id = c.get('user').id;
    const calls = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(seconds),0) s FROM calls WHERE host_id = ? AND status = 'ended' AND date(created_at) = date('now')").get(id);
    return {
      profile: db.prepare('SELECT * FROM host_profiles WHERE user_id = ?').get(id),
      today: db.prepare("SELECT COALESCE(SUM(amount),0) v FROM transactions WHERE user_id = ? AND kind = 'earning' AND date(created_at) = date('now')").get(id).v,
      callsToday: calls.n, secondsToday: calls.s,
      payouts: db.prepare('SELECT * FROM payouts WHERE host_id = ? ORDER BY id DESC').all(id),
      earnings: db.prepare("SELECT * FROM transactions WHERE user_id = ? AND kind IN ('earning','payout','payout_reversed') ORDER BY id DESC LIMIT 100").all(id),
      coinToInr: h.setting('coin_to_inr'),
    };
  }));

  app.post('/host/payouts', auth('host'), R(async (c) => {
    const b = await body(c);
    const amount = Math.floor(Number(b.amount));
    const upi = String(b.upi || '').trim().slice(0, 100);
    const id = c.get('user').id;
    const hp = db.prepare('SELECT earnings FROM host_profiles WHERE user_id = ?').get(id);
    if (!amount || amount < 100) throw bad('Minimum payout is 100 coins');
    if (amount > hp.earnings) throw bad('Amount is more than your balance');
    if (!/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upi)) throw bad('Enter a valid UPI ID (like name@bank)');
    db.transaction(() => {
      db.prepare('UPDATE host_profiles SET earnings = earnings - ? WHERE user_id = ?').run(amount, id);
      db.prepare('INSERT INTO payouts (host_id, amount, upi) VALUES (?,?,?)').run(id, amount, upi);
      db.prepare('INSERT INTO transactions (user_id, kind, amount, balance_after, note) VALUES (?,?,?,?,?)').run(id, 'payout', -amount, hp.earnings - amount, `Payout requested to ${upi}`);
    })();
    return { ok: true };
  }));

  // ================= safety =================
  app.post('/reports', auth('user', 'host'), R(async (c) => {
    const b = await body(c);
    const targetId = Number(b.targetId);
    const reason = String(b.reason || '').trim().slice(0, 500);
    if (!targetId || !reason) throw bad('Pick a reason');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(targetId)) throw bad('User not found', 404);
    db.prepare('INSERT INTO reports (reporter_id, target_id, reason) VALUES (?,?,?)').run(c.get('user').id, targetId, reason);
    return { ok: true };
  }));
  app.post('/blocks', auth('user', 'host'), R(async (c) => {
    const targetId = Number((await body(c)).targetId);
    const me = c.get('user').id;
    if (!targetId || targetId === me || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(targetId)) throw bad('Invalid user');
    db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)').run(me, targetId);
    return { ok: true };
  }));

  // ================= admin =================
  const A = new Hono();
  A.use('*', auth('admin'));
  const one = (q, ...a) => db.prepare(q).get(...a);

  A.get('/stats', R(() => ({
    users: one("SELECT COUNT(*) n FROM users WHERE role='user'").n,
    hosts: one("SELECT COUNT(*) n FROM users WHERE role='host'").n,
    pendingHosts: one('SELECT COUNT(*) n FROM host_profiles WHERE approved = 0').n,
    onlineHosts: db.prepare('SELECT user_id FROM host_profiles WHERE online = 1').all().filter((x) => h.isOnline(x.user_id)).length,
    liveCalls: h.liveCalls().length,
    callsToday: one("SELECT COUNT(*) n FROM calls WHERE date(created_at) = date('now')").n,
    minutesToday: Math.round(one("SELECT COALESCE(SUM(seconds),0) s FROM calls WHERE date(created_at) = date('now')").s / 60),
    coinsSpentToday: -one("SELECT COALESCE(SUM(amount),0) v FROM transactions WHERE amount < 0 AND kind IN ('call','chat','gift') AND date(created_at) = date('now')").v,
    coinsSoldTotal: one("SELECT COALESCE(SUM(amount),0) v FROM transactions WHERE kind = 'purchase'").v,
    revenueToday: one("SELECT COALESCE(SUM(amount_paise),0) v FROM payments WHERE status='paid' AND provider='razorpay' AND date(paid_at)=date('now')").v / 100,
    revenueTotal: one("SELECT COALESCE(SUM(amount_paise),0) v FROM payments WHERE status='paid' AND provider='razorpay'").v / 100,
    openReports: one("SELECT COUNT(*) n FROM reports WHERE status = 'open'").n,
    pendingPayouts: one("SELECT COUNT(*) n FROM payouts WHERE status = 'pending'").n,
    messagesToday: one("SELECT COUNT(*) n FROM messages WHERE date(created_at) = date('now')").n,
    recentCalls: db.prepare(`SELECT c.*, COALESCE(u.name,'Deleted user') user_name, COALESCE(h.name,'Deleted host') host_name FROM calls c
      LEFT JOIN users u ON u.id=c.user_id LEFT JOIN users h ON h.id=c.host_id ORDER BY c.id DESC LIMIT 8`).all(),
    live: h.liveCalls().map((x) => ({ id: x.id, userName: x.user_name, hostName: x.host_name, type: x.type, status: x.status, charged: x.charged })),
  })));

  A.get('/users', R((c) => {
    const q = `%${c.req.query('q') || ''}%`;
    return db.prepare("SELECT * FROM users WHERE role = 'user' AND (name LIKE ? OR email LIKE ?) ORDER BY id DESC LIMIT 500").all(q, q).map(publicUser);
  }));
  A.patch('/users/:id', R(async (c) => {
    const u = fresh(Number(c.req.param('id')));
    if (!u || u.role === 'admin') throw bad('User not found', 404);
    const { status } = await body(c);
    if (['active', 'blocked'].includes(status)) {
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, u.id);
      if (status === 'blocked') h.disconnectUser(u.id);
    }
    return publicUser(fresh(u.id));
  }));
  A.post('/users/:id/credit', R(async (c) => {
    const b = await body(c);
    const amount = Math.trunc(Number(b.amount));
    if (!amount || Math.abs(amount) > 1_000_000) throw bad('Enter an amount');
    const id = Number(c.req.param('id'));
    const coins = h.moveCoins(id, amount, amount > 0 ? 'admin_credit' : 'admin_debit', String(b.note || 'Adjusted by admin').slice(0, 200));
    h.emitTo(id, 'wallet:balance', { coins });
    return { coins };
  }));

  A.get('/hosts', R(() => db.prepare(`SELECT u.id, u.name, u.email, u.avatar, u.gender, u.city, u.languages, u.status, u.created_at,
      h.approved, h.online, h.busy, h.audio_rate, h.video_rate, h.earnings, h.total_earned,
      (SELECT COUNT(*) FROM calls c WHERE c.host_id = u.id AND c.status='ended') calls,
      (SELECT COALESCE(SUM(seconds),0) FROM calls c WHERE c.host_id = u.id) seconds
    FROM users u JOIN host_profiles h ON h.user_id = u.id ORDER BY h.approved ASC, u.id DESC`).all().map(withPresence)));

  A.post('/hosts', R(async (c) => {
    const f = parse(z.object({
      name: z.string().trim().min(2, 'Enter a name').max(40),
      email: z.string().trim().toLowerCase().email('Enter a valid email'),
      password: z.string().min(8, 'Password must be at least 8 characters').max(100, 'Password can be up to 100 characters'),
      gender: z.enum(['female', 'male', 'other']).default('female'),
      languages: z.string().regex(LANG_RE).default('Hindi,English'),
      city: z.string().max(60).default(''),
      bio: z.string().max(300).default(''),
    }), await body(c));
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(f.email)) throw bad('Email already used');
    const id = db.prepare("INSERT INTO users (role, name, email, password_hash, gender, languages, city, bio) VALUES ('host',?,?,?,?,?,?,?)")
      .run(f.name, f.email, await hashPassword(f.password), f.gender, f.languages, f.city, f.bio).lastInsertRowid;
    db.prepare('INSERT INTO host_profiles (user_id, approved, audio_rate, video_rate) VALUES (?,1,?,?)').run(id, h.setting('default_audio_rate'), h.setting('default_video_rate'));
    return { id };
  }));

  A.patch('/hosts/:id', R(async (c) => {
    const id = Number(c.req.param('id'));
    if (!db.prepare('SELECT 1 FROM host_profiles WHERE user_id = ?').get(id)) throw bad('Host not found', 404);
    const { approved, audio_rate, video_rate, status } = await body(c);
    if (approved !== undefined) db.prepare('UPDATE host_profiles SET approved = ? WHERE user_id = ?').run(approved ? 1 : 0, id);
    if (audio_rate !== undefined) db.prepare('UPDATE host_profiles SET audio_rate = ? WHERE user_id = ?').run(Math.min(100000, Math.max(0, Number(audio_rate) | 0)), id);
    if (video_rate !== undefined) db.prepare('UPDATE host_profiles SET video_rate = ? WHERE user_id = ?').run(Math.min(100000, Math.max(0, Number(video_rate) | 0)), id);
    if (['active', 'blocked'].includes(status)) {
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
      if (status === 'blocked') h.disconnectUser(id);
    }
    h.emitTo(id, 'host:profile', db.prepare('SELECT * FROM host_profiles WHERE user_id = ?').get(id));
    return { ok: true };
  }));

  A.get('/calls', R(() => db.prepare(`SELECT c.*, COALESCE(u.name,'Deleted user') user_name, COALESCE(h.name,'Deleted host') host_name FROM calls c
    LEFT JOIN users u ON u.id=c.user_id LEFT JOIN users h ON h.id=c.host_id ORDER BY c.id DESC LIMIT 500`).all()));
  A.get('/transactions', R(() => db.prepare('SELECT t.*, u.name, u.role FROM transactions t JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 500').all()));
  A.get('/payments', R(() => db.prepare(`SELECT p.*, COALESCE(u.name, 'Deleted user') name, u.email FROM payments p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 500`).all()));

  A.get('/reports', R(() => db.prepare(`SELECT r.*, a.name reporter_name, a.role reporter_role, b.name target_name, b.role target_role, b.status target_status
    FROM reports r JOIN users a ON a.id = r.reporter_id JOIN users b ON b.id = r.target_id ORDER BY (r.status='open') DESC, r.id DESC`).all()));
  A.patch('/reports/:id', R(async (c) => {
    const { status } = await body(c);
    if (!['open', 'resolved', 'dismissed'].includes(status)) throw bad('Bad status');
    db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, Number(c.req.param('id')));
    return { ok: true };
  }));

  A.get('/payouts', R(() => db.prepare(`SELECT p.*, u.name host_name, u.email host_email FROM payouts p JOIN users u ON u.id = p.host_id
    ORDER BY (p.status='pending') DESC, p.id DESC`).all().map((p) => ({ ...p, inr: +(p.amount * h.setting('coin_to_inr')).toFixed(2) }))));
  A.patch('/payouts/:id', R(async (c) => {
    const p = db.prepare('SELECT * FROM payouts WHERE id = ?').get(Number(c.req.param('id')));
    if (!p || p.status !== 'pending') throw bad('Payout is not pending');
    const { status } = await body(c);
    if (!['paid', 'rejected'].includes(status)) throw bad('Bad status');
    db.transaction(() => {
      db.prepare('UPDATE payouts SET status = ? WHERE id = ?').run(status, p.id);
      if (status === 'rejected') {
        db.prepare('UPDATE host_profiles SET earnings = earnings + ? WHERE user_id = ?').run(p.amount, p.host_id);
        const bal = db.prepare('SELECT earnings FROM host_profiles WHERE user_id = ?').get(p.host_id).earnings;
        db.prepare('INSERT INTO transactions (user_id, kind, amount, balance_after, note) VALUES (?,?,?,?,?)').run(p.host_id, 'payout_reversed', p.amount, bal, 'Payout rejected — coins returned');
      }
    })();
    return { ok: true };
  }));

  const allSettings = () => Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((s) => [s.key, Number(s.value)]));
  A.get('/settings', R(allSettings));
  A.patch('/settings', R(async (c) => {
    for (const [k, v] of Object.entries(await body(c))) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && !(k === 'host_share_pct' && n > 100)) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(n), k);
    }
    return allSettings();
  }));

  // local development only: load demo accounts
  A.post('/seed-demo', R(async () => {
    if (env.ALLOW_DEMO_SEED !== 'true') throw bad('Not available', 404);
    return seedDemo(h);
  }));

  app.route('/admin', A);
  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  return app;
}

function sniffImage(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** Fictional demo accounts for local testing. Passwords come from the DEMO_PASSWORD var. */
export async function seedDemo(h) {
  const db = h.db;
  const pw = await hashPassword(h.env.DEMO_PASSWORD || 'demo-password');
  const add = (role, name, email, x = {}) => {
    const found = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (found) return found.id;
    const id = db.prepare('INSERT INTO users (role, name, email, password_hash, gender, city, languages, bio) VALUES (?,?,?,?,?,?,?,?)')
      .run(role, name, email, pw, x.gender || '', x.city || '', x.languages || 'Hindi,English', x.bio || '').lastInsertRowid;
    if (role === 'host') db.prepare('INSERT INTO host_profiles (user_id, approved, audio_rate, video_rate) VALUES (?,?,?,?)').run(id, x.approved ?? 1, x.audio ?? 10, x.video ?? 30);
    return id;
  };
  add('host', 'Priya', 'priya@milojulo.app', { gender: 'female', city: 'Mumbai', languages: 'Hindi,English,Marathi', bio: "Chai lover ☕ Let's talk movies & music", audio: 8, video: 25 });
  add('host', 'Ananya', 'ananya@milojulo.app', { gender: 'female', city: 'Bengaluru', languages: 'Kannada,English,Hindi', bio: 'Bookworm and late-night talker 📚' });
  add('host', 'Riya', 'riya@milojulo.app', { gender: 'female', city: 'Delhi', languages: 'Hindi,Punjabi,English', bio: 'Your friendly listener. Bas baat karo 😊', audio: 12, video: 35 });
  add('host', 'Kavya', 'kavya@milojulo.app', { gender: 'female', city: 'Chennai', languages: 'Tamil,English', bio: 'Dancer, foodie, good vibes only ✨' });
  add('host', 'Meera', 'meera@milojulo.app', { gender: 'female', city: 'Kolkata', languages: 'Bengali,Hindi,English', bio: 'New here, waiting for approval', approved: 0 });
  const u = add('user', 'Rahul', 'rahul@milojulo.app', { gender: 'male', city: 'Pune' });
  if (!db.prepare('SELECT 1 FROM transactions WHERE user_id = ?').get(u)) h.moveCoins(u, 500, 'bonus', 'Demo coins');
  return { ok: true };
}
