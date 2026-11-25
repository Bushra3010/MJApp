// Host programme: weekly levels & call-rate tiers, online time, alerts, referrals, earnings breakdown.
// Weeks run Monday 00:00 → Sunday 23:59 India time (IST, UTC+5:30).

const IST_MS = 330 * 60_000;

/**
 * Host levels. A host moves up when their lifetime earnings (coins, `total_earned`) reach `target`, and never moves down.
 *   audio_earn / video_earn — rupees the host earns per minute of call at this level
 *   audio / video           — coins the member is charged per minute for this host
 * Admin can edit the table (stored in meta 'levels_v2').
 */
export const DEFAULT_LEVELS = [
  { level: 1, target: 0, audio_earn: 3, video_earn: 8, audio: 10, video: 30 },
  { level: 2, target: 70000, audio_earn: 4, video_earn: 9, audio: 12, video: 35 },
  { level: 3, target: 300000, audio_earn: 5, video_earn: 10, audio: 14, video: 40 },
];

const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

/** { id, startMs, endMs } of the IST week containing `now` (+ offset weeks). */
export function weekOf(now = Date.now(), offset = 0) {
  const ist = new Date(now + IST_MS);
  const day = (ist.getUTCDay() + 6) % 7; // Monday = 0
  const startIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - day) + offset * 7 * 86_400_000;
  const startMs = startIst - IST_MS;
  return { id: new Date(startIst).toISOString().slice(0, 10), startMs, endMs: startMs + 7 * 86_400_000 };
}
/** { id, startMs, endMs } of the IST day containing `now`. */
export function dayOf(now = Date.now()) {
  const ist = new Date(now + IST_MS);
  const startMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_MS;
  return { id: new Date(startMs + IST_MS).toISOString().slice(0, 10), startMs, endMs: startMs + 86_400_000 };
}

export function levelsTable(db) {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'levels_v2'").get();
  try { const t = row && JSON.parse(row.value); if (Array.isArray(t) && t.length) return t; } catch { /* default */ }
  return DEFAULT_LEVELS;
}
export function saveLevelsTable(db, table) {
  db.prepare("INSERT INTO meta (key, value) VALUES ('levels_v2', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(table));
}
export const tierOf = (table, level) => table.find((t) => t.level === level) || table[0];
/** Level reached with this much lifetime earning. */
export const levelFor = (table, totalEarned) => Math.max(1, ...table.filter((t) => totalEarned >= t.target).map((t) => t.level));

/** Host earnings (coins) between two times, split into call / gift / other. */
export function earningsBetween(db, hostId, startMs, endMs) {
  const rows = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN ref LIKE 'call:%' THEN amount END), 0) AS call,
      COALESCE(SUM(CASE WHEN ref NOT LIKE 'call:%' AND note LIKE 'Gift%' THEN amount END), 0) AS gift,
      COALESCE(SUM(CASE WHEN ref NOT LIKE 'call:%' AND note NOT LIKE 'Gift%' THEN amount END), 0) AS other
    FROM transactions WHERE user_id = ? AND kind = 'earning' AND created_at >= ? AND created_at < ?`).get(hostId, sqlTime(startMs), sqlTime(endMs));
  return { call: rows.call, gift: rows.gift, other: rows.other, total: rows.call + rows.gift + rows.other };
}

export function addAlert(h, userId, kind, title, body = '', url = '') {
  h.db.prepare('INSERT INTO alerts (user_id, kind, title, body, url) VALUES (?,?,?,?,?)').run(userId, kind, title, body, url);
  h.emitTo(userId, 'alert:new', { kind, title, body, url });
}

/**
 * Make sure the host's level matches their lifetime earnings (or the admin's override) and that their
 * per-minute prices match that level. Levels only go up on their own. Hosts whose prices an admin set
 * by hand (rate_custom) keep those prices.
 */
export function ensureLevel(h, hostId) {
  const db = h.db;
  const hp = db.prepare('SELECT level, level_override, total_earned, rate_custom, audio_rate, video_rate FROM host_profiles WHERE user_id = ?').get(hostId);
  if (!hp) return null;
  const table = levelsTable(db);
  let level = hp.level_override || Math.max(levelFor(table, hp.total_earned || 0), Math.min(hp.level || 1, table.length));
  level = Math.min(level, table.length);
  const t = tierOf(table, level);
  if (level !== hp.level || (!hp.rate_custom && (hp.audio_rate !== t.audio || hp.video_rate !== t.video))) {
    applyRate(h, hostId, level);
    if (level > (hp.level || 1) && !hp.level_override) {
      addAlert(h, hostId, 'level', `You reached Level ${level}! 🎉`,
        `You now earn ₹${t.video_earn}/min on video calls and ₹${t.audio_earn}/min on audio calls.`, '/host/rate');
    }
  }
  return db.prepare('SELECT level, rate_level, level_override FROM host_profiles WHERE user_id = ?').get(hostId);
}

/** Put the host on a level and (unless an admin set custom prices) that level's per-minute prices. */
export function applyRate(h, hostId, level) {
  const t = tierOf(levelsTable(h.db), level);
  const hp = h.db.prepare('SELECT rate_custom FROM host_profiles WHERE user_id = ?').get(hostId);
  if (hp?.rate_custom) h.db.prepare('UPDATE host_profiles SET level = ?, rate_level = ? WHERE user_id = ?').run(t.level, t.level, hostId);
  else h.db.prepare('UPDATE host_profiles SET level = ?, rate_level = ?, video_rate = ?, audio_rate = ? WHERE user_id = ?').run(t.level, t.level, t.video, t.audio, hostId);
}

/** Rupees per minute this host earns for a call type at their current level. */
export function earnPerMinute(h, hostId, type) {
  const hp = h.db.prepare('SELECT level FROM host_profiles WHERE user_id = ?').get(hostId);
  const t = tierOf(levelsTable(h.db), hp?.level || 1);
  return type === 'video' ? t.video_earn : t.audio_earn;
}

// ---------- online time ----------
export function onlineStart(h, hostId, now = Date.now()) {
  h.db.prepare('UPDATE host_profiles SET online_since_ms = COALESCE(online_since_ms, ?) WHERE user_id = ?').run(now, hostId);
}
export function onlineStop(h, hostId, now = Date.now()) {
  const hp = h.db.prepare('SELECT online_since_ms FROM host_profiles WHERE user_id = ?').get(hostId);
  if (!hp?.online_since_ms) return;
  let t = hp.online_since_ms;
  while (t < now) { // split across IST midnights
    const d = dayOf(t);
    const end = Math.min(now, d.endMs);
    h.db.prepare('INSERT INTO online_log (host_id, day, seconds) VALUES (?,?,?) ON CONFLICT(host_id, day) DO UPDATE SET seconds = seconds + excluded.seconds')
      .run(hostId, d.id, Math.round((end - t) / 1000));
    t = end;
  }
  h.db.prepare('UPDATE host_profiles SET online_since_ms = NULL WHERE user_id = ?').run(hostId);
}
export function onlineSecondsToday(h, hostId, now = Date.now()) {
  const d = dayOf(now);
  const logged = h.db.prepare('SELECT seconds FROM online_log WHERE host_id = ? AND day = ?').get(hostId, d.id)?.seconds || 0;
  const since = h.db.prepare('SELECT online_since_ms FROM host_profiles WHERE user_id = ?').get(hostId)?.online_since_ms;
  return logged + (since ? Math.round((now - Math.max(since, d.startMs)) / 1000) : 0);
}

// ---------- referrals ----------
/** Pay the inviting host a share of what their invitee just earned (paid by the platform, not taken from the invitee). */
export function creditReferrer(h, hostId, earned) {
  if (earned <= 0) return;
  const db = h.db;
  const hp = db.prepare('SELECT referrer_id FROM host_profiles WHERE user_id = ?').get(hostId);
  if (!hp?.referrer_id) return;
  const ref = db.prepare('SELECT ref_remainder FROM host_profiles WHERE user_id = ?').get(hp.referrer_id);
  if (!ref) return;
  const total = earned * h.setting('referral_pct') + (ref.ref_remainder || 0);
  const pay = Math.floor(total / 100);
  db.prepare('UPDATE host_profiles SET ref_remainder = ? WHERE user_id = ?').run(total % 100, hp.referrer_id);
  if (pay <= 0) return;
  db.prepare('UPDATE host_profiles SET earnings = earnings + ?, total_earned = total_earned + ? WHERE user_id = ?').run(pay, pay, hp.referrer_id);
  const bal = db.prepare('SELECT earnings FROM host_profiles WHERE user_id = ?').get(hp.referrer_id).earnings;
  db.prepare("INSERT INTO transactions (user_id, kind, amount, balance_after, note, ref) VALUES (?, 'earning', ?, ?, 'Referral bonus', ?)").run(hp.referrer_id, pay, bal, `ref:${hostId}`);
}

export function inviteCodeFor(h, hostId) {
  const db = h.db;
  const row = db.prepare('SELECT invite_code FROM host_profiles WHERE user_id = ?').get(hostId);
  if (row?.invite_code) return row.invite_code;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    if (!db.prepare('SELECT 1 FROM host_profiles WHERE invite_code = ?').get(code)) {
      db.prepare('UPDATE host_profiles SET invite_code = ? WHERE user_id = ?').run(code, hostId);
      return code;
    }
  }
}
