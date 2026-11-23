// Host programme: weekly levels & call-rate tiers, online time, alerts, referrals, earnings breakdown.
// Weeks run Monday 00:00 → Sunday 23:59 India time (IST, UTC+5:30).

const IST_MS = 330 * 60_000;

/** Default levels for Milo Julo's coin economy. Admin can edit them (stored in meta 'levels'). */
export const DEFAULT_LEVELS = [
  { level: 1, weekly: 0, video: 30, audio: 10 },
  { level: 2, weekly: 500, video: 40, audio: 13 },
  { level: 3, weekly: 1000, video: 50, audio: 16 },
  { level: 4, weekly: 2000, video: 60, audio: 19 },
  { level: 5, weekly: 3000, video: 70, audio: 22 },
  { level: 6, weekly: 5000, video: 80, audio: 25 },
  { level: 7, weekly: 10000, video: 90, audio: 28 },
  { level: 8, weekly: 15000, video: 100, audio: 31 },
  { level: 9, weekly: 20000, video: 120, audio: 35 },
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
  const row = db.prepare("SELECT value FROM meta WHERE key = 'levels'").get();
  try { const t = row && JSON.parse(row.value); if (Array.isArray(t) && t.length) return t; } catch { /* default */ }
  return DEFAULT_LEVELS;
}
export function saveLevelsTable(db, table) {
  db.prepare("INSERT INTO meta (key, value) VALUES ('levels', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(table));
}
export const tierOf = (table, level) => table.find((t) => t.level === level) || table[0];

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
 * Make sure the host's level is up to date for this week: level = highest tier whose weekly
 * threshold last week's earnings reached (or the admin's override). The chosen rate tier is
 * raised automatically on a level-up and capped on a level-down.
 */
export function ensureLevel(h, hostId, now = Date.now()) {
  const db = h.db;
  const hp = db.prepare('SELECT level, rate_level, level_week, level_override FROM host_profiles WHERE user_id = ?').get(hostId);
  if (!hp) return null;
  const week = weekOf(now);
  if (hp.level_week === week.id) return hp;
  const table = levelsTable(db);
  const prev = weekOf(now, -1);
  const lastWeek = earningsBetween(db, hostId, prev.startMs, prev.endMs).total;
  const earned = table.filter((t) => lastWeek >= t.weekly).map((t) => t.level);
  let level = earned.length ? Math.max(...earned) : 1;
  if (hp.level_override) level = hp.level_override;
  const firstTime = !hp.level_week;
  if (firstTime) {
    // First calculation (new host, or existing host when levels launched). New hosts start on tier 1;
    // hosts whose rates were set by hand keep them, shown as a custom rate (rate_level 0) until they pick a tier.
    const cur = db.prepare('SELECT video_rate, audio_rate FROM host_profiles WHERE user_id = ?').get(hostId);
    const match = table.find((t) => t.level <= level && t.video === cur.video_rate && t.audio === cur.audio_rate);
    const isDefault = cur.video_rate === h.setting('default_video_rate') && cur.audio_rate === h.setting('default_audio_rate');
    if (match) db.prepare('UPDATE host_profiles SET level = ?, rate_level = ?, level_week = ? WHERE user_id = ?').run(level, match.level, week.id, hostId);
    else if (isDefault) applyRate(h, hostId, 1, level, week.id);
    else db.prepare('UPDATE host_profiles SET level = ?, rate_level = 0, level_week = ? WHERE user_id = ?').run(level, week.id, hostId);
    return db.prepare('SELECT level, rate_level, level_week, level_override FROM host_profiles WHERE user_id = ?').get(hostId);
  }
  const rateLevel = level > (hp.level || 1) ? level : Math.min(hp.rate_level || level, level);
  applyRate(h, hostId, rateLevel, level, week.id);
  if (level !== hp.level) {
    addAlert(h, hostId, 'level', level > hp.level ? `You reached Level ${level}! 🎉` : `You're now Level ${level}`,
      `Your call rate is now ${tierOf(table, Math.min(rateLevel, level)).video}/min for video.`, '/host/rate');
  }
  return db.prepare('SELECT level, rate_level, level_week, level_override FROM host_profiles WHERE user_id = ?').get(hostId);
}

/** Set the host's chosen rate tier (must be ≤ their level) and the per-minute rates that go with it. */
export function applyRate(h, hostId, rateLevel, level, weekId) {
  const t = tierOf(levelsTable(h.db), rateLevel);
  h.db.prepare('UPDATE host_profiles SET level = COALESCE(?, level), rate_level = ?, video_rate = ?, audio_rate = ?, level_week = COALESCE(?, level_week) WHERE user_id = ?')
    .run(level ?? null, t.level, t.video, t.audio, weekId ?? null, hostId);
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
