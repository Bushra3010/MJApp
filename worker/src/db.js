// SQLite inside the Hub Durable Object. A tiny better-sqlite3-style adapter over ctx.storage.sql
// so queries read the same as before: db.prepare(sql).get/all/run(...params), db.transaction(fn).

const clean = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

export function makeDb(storage) {
  const sql = storage.sql;
  const db = {
    exec: (q) => sql.exec(q),
    prepare(q) {
      return {
        all: (...a) => sql.exec(q, ...a.map(clean)).toArray(),
        get: (...a) => sql.exec(q, ...a.map(clean)).toArray()[0],
        run: (...a) => {
          const c = sql.exec(q, ...a.map(clean));
          c.toArray();
          const lastInsertRowid = sql.exec('SELECT last_insert_rowid() AS id').one().id;
          return { changes: c.rowsWritten, lastInsertRowid };
        },
      };
    },
    transaction: (fn) => (...args) => storage.transactionSync(() => fn(...args)),
  };
  return db;
}

const SCHEMA = [
  // v1 — full schema
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK (role IN ('user','host','admin')),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    gender TEXT DEFAULT '',
    city TEXT DEFAULT '',
    languages TEXT DEFAULT 'Hindi,English',
    coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
    token_version INTEGER NOT NULL DEFAULT 0,
    birth_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT
  );
  CREATE TABLE IF NOT EXISTS host_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    approved INTEGER NOT NULL DEFAULT 0,
    online INTEGER NOT NULL DEFAULT 0,
    busy INTEGER NOT NULL DEFAULT 0,
    audio_rate INTEGER NOT NULL DEFAULT 10,
    video_rate INTEGER NOT NULL DEFAULT 30,
    earnings INTEGER NOT NULL DEFAULT 0,
    total_earned INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, host_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','gift','system','call')),
    body TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    host_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('audio','video')),
    status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','active','ended','missed','declined','failed')),
    rate INTEGER NOT NULL,
    started_at TEXT, ended_at TEXT,
    seconds INTEGER NOT NULL DEFAULT 0,
    coins_charged INTEGER NOT NULL DEFAULT 0,
    end_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_calls_user ON calls(user_id);
  CREATE INDEX IF NOT EXISTS idx_calls_host ON calls(host_id);
  -- live state of ringing/active calls; survives Durable Object hibernation
  CREATE TABLE IF NOT EXISTS live_calls (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL, host_id INTEGER NOT NULL,
    type TEXT NOT NULL, rate INTEGER NOT NULL, status TEXT NOT NULL,
    minutes INTEGER NOT NULL DEFAULT 0, charged INTEGER NOT NULL DEFAULT 0,
    started_ms INTEGER, ring_deadline_ms INTEGER, next_charge_ms INTEGER,
    user_name TEXT, host_name TEXT
  );
  -- delayed jobs (offline grace periods)
  CREATE TABLE IF NOT EXISTS timers (key TEXT PRIMARY KEY, due_ms INTEGER NOT NULL, kind TEXT NOT NULL, ref INTEGER);
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL,
    note TEXT DEFAULT '', ref TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_txn_user ON transactions(user_id, id);
  CREATE TABLE IF NOT EXISTS gifts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, emoji TEXT NOT NULL, price INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, upi TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (blocker_id, blocked_id)
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    pack_id TEXT NOT NULL, coins INTEGER NOT NULL, amount_paise INTEGER NOT NULL,
    provider TEXT NOT NULL DEFAULT 'razorpay',
    order_id TEXT UNIQUE, payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')), paid_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
  CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, received_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keys TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS uploads (
    name TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, data BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // v2 — Sign in with Google
  `ALTER TABLE users ADD COLUMN google_sub TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_sub);`,
  // v3 — Google sign-in runs through Supabase Auth; link accounts by Supabase user id
  `ALTER TABLE users ADD COLUMN supabase_id TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase ON users(supabase_id);`,
];

export const DEFAULT_SETTINGS = {
  chat_cost: '1', host_share_pct: '50', signup_bonus: '50',
  default_audio_rate: '10', default_video_rate: '30', coin_to_inr: '0.5',
};

export const COIN_PACKS = [
  { id: 'p1', coins: 100, price: 49 },
  { id: 'p2', coins: 250, price: 99, tag: 'Popular' },
  { id: 'p3', coins: 700, price: 249 },
  { id: 'p4', coins: 1500, price: 499, tag: 'Best value' },
  { id: 'p5', coins: 3500, price: 999 },
];

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const v = Number(db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()?.value || 0);
  for (let i = v; i < SCHEMA.length; i++) {
    db.exec(SCHEMA[i]);
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(i + 1));
  }
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, val] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, val);
  if (db.prepare('SELECT COUNT(*) c FROM gifts').get().c === 0) {
    const g = db.prepare('INSERT INTO gifts (name, emoji, price) VALUES (?, ?, ?)');
    [['Rose', '🌹', 10], ['Chai', '☕', 20], ['Heart', '💖', 50], ['Teddy', '🧸', 100], ['Ring', '💍', 500], ['Crown', '👑', 1000]].forEach((r) => g.run(...r));
  }
}

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, token_version, ...rest } = u;
  return rest;
}
