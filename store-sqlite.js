import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.SQLITE_PATH || "./push.sqlite");

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS subscriptions (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    timezone TEXT,
    lat REAL,
    lng REAL,
    prayer INTEGER NOT NULL DEFAULT 0,
    hisn INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS timings_cache (
    spot TEXT NOT NULL,
    day TEXT NOT NULL,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (spot, day)
  );
  CREATE TABLE IF NOT EXISTS sent_log (
    endpoint TEXT NOT NULL,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    PRIMARY KEY (endpoint, day, kind, key)
  );
  CREATE TABLE IF NOT EXISTS one_shots (
    endpoint TEXT NOT NULL,
    tag TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT NOT NULL,
    fire_at INTEGER NOT NULL,
    PRIMARY KEY (endpoint, tag)
  );
`);

export async function upsertSubscription(sub) {
  db.prepare(
    `INSERT INTO subscriptions
       (endpoint, p256dh, auth, timezone, lat, lng, prayer, hisn, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       timezone = excluded.timezone,
       lat = excluded.lat,
       lng = excluded.lng,
       prayer = excluded.prayer,
       hisn = excluded.hisn`,
  ).run(
    sub.endpoint,
    sub.p256dh,
    sub.auth,
    sub.timezone ?? null,
    sub.lat ?? null,
    sub.lng ?? null,
    sub.prayer ? 1 : 0,
    sub.hisn ? 1 : 0,
    Date.now(),
  );
}

export async function deleteSubscription(endpoint) {
  db.prepare(`DELETE FROM subscriptions WHERE endpoint = ?`).run(endpoint);
  db.prepare(`DELETE FROM sent_log WHERE endpoint = ?`).run(endpoint);
}

export async function allSubscriptions() {
  return db.prepare(`SELECT * FROM subscriptions`).all();
}

export async function getSubscription(endpoint) {
  return (
    db
      .prepare(`SELECT * FROM subscriptions WHERE endpoint = ?`)
      .get(endpoint) ?? null
  );
}

export async function addOneShot(shot) {
  db.prepare(
    `INSERT OR REPLACE INTO one_shots
       (endpoint, tag, title, body, url, fire_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    shot.endpoint,
    shot.tag,
    shot.title,
    shot.body,
    shot.url,
    shot.fire_at,
  );
}

export async function getDueOneShots(nowMs) {
  return db
    .prepare(`SELECT * FROM one_shots WHERE fire_at <= ?`)
    .all(nowMs);
}

export async function deleteOneShot(endpoint, tag) {
  db
    .prepare(`DELETE FROM one_shots WHERE endpoint = ? AND tag = ?`)
    .run(endpoint, tag);
}

export async function getTimingsCache(spot, day) {
  const row = db
    .prepare(`SELECT payload FROM timings_cache WHERE spot = ? AND day = ?`)
    .get(spot, day);
  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

export async function setTimingsCache(spot, day, payload) {
  db.prepare(
    `INSERT INTO timings_cache (spot, day, payload, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(spot, day) DO UPDATE SET
       payload = excluded.payload,
       fetched_at = excluded.fetched_at`,
  ).run(spot, day, JSON.stringify(payload), Date.now());
}

export async function wasSent(endpoint, day, kind, key) {
  return (
    db
      .prepare(
        `SELECT 1 FROM sent_log
         WHERE endpoint = ? AND day = ? AND kind = ? AND key = ?`,
      )
      .get(endpoint, day, kind, key) !== undefined
  );
}

export async function markSent(endpoint, day, kind, key) {
  db.prepare(
    `INSERT OR IGNORE INTO sent_log (endpoint, day, kind, key, sent_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(endpoint, day, kind, key, Date.now());
}

/* Timings older than 3 days + sent marks older than 3 days. */
export async function prune() {
  const cutoff = Date.now() - 3 * 24 * 3600 * 1000;
  db.prepare(`DELETE FROM timings_cache WHERE fetched_at < ?`).run(cutoff);
  db.prepare(`DELETE FROM sent_log WHERE sent_at < ?`).run(cutoff);
}
