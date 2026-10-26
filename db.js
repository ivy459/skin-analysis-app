const { createClient } = require("@libsql/client");

const url = process.env.TURSO_DATABASE_URL;
if (!url && process.env.NODE_ENV === "production") {
  throw new Error("TURSO_DATABASE_URL is not set");
}

const client = createClient({
  url: url || "file:app.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    scores TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS quiz_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    scores TEXT NOT NULL
  )`,
];

let ready = null;
function init() {
  if (!ready) {
    ready = client.batch(SCHEMA, "write").catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

async function all(sql, args = []) {
  await init();
  const result = await client.execute({ sql, args });
  return result.rows;
}

async function get(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0];
}

async function run(sql, args = []) {
  await init();
  const result = await client.execute({ sql, args });
  return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
}

module.exports = { get, all, run };