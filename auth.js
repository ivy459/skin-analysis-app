const crypto = require("crypto");
const { promisify } = require("util");
const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("./db");
const { sendResetEmail } = require("./mailer");

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_MS = 30 * 60 * 1000;
const COOKIE = "sid";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DUMMY_HASH = `${"00".repeat(16)}:${"00".repeat(64)}`;

const router = express.Router();

// ---------- helpers ----------
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");
const cleanEmail = (value) => String(value ?? "").trim().toLowerCase();
const validEmail = (value) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value) => value.length >= 8 && value.length <= 128;
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function checkPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length, SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}

function startSession(res, userId) {
  const now = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM reset_tokens WHERE expires_at < ?").run(now);

  const token = newToken();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(sha256(token), userId, now + SESSION_MS);
  res.cookie(COOKIE, token, { ...COOKIE_OPTS, maxAge: SESSION_MS });
}

function currentUser(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const row = db.prepare(`
    SELECT users.id AS id, users.email AS email
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(sha256(token), Date.now());
  return row ? { id: row.id, email: row.email } : null;
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Log in to run a skin check." });
  req.user = user;
  next();
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});

// ---------- routes ----------
router.post("/signup", authLimiter, wrap(async (req, res) => {
  const body = req.body ?? {};
  const email = cleanEmail(body.email);
  const password = String(body.password ?? "");

  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!validPassword(password)) return res.status(400).json({ error: "Use a password of 8 to 128 characters." });
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "An account with this email already exists. Log in or reset your password." });
  }

  const info = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run(email, await hashPassword(password));
  startSession(res, Number(info.lastInsertRowid));
  res.json({ email });
}));

router.post("/login", authLimiter, wrap(async (req, res) => {
  const body = req.body ?? {};
  const email = cleanEmail(body.email);
  const password = String(body.password ?? "");

  const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
  const ok = await checkPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || !user.password_hash || !ok) {
    return res.status(401).json({ error: "Email or password is wrong." });
  }

  startSession(res, user.id);
  res.json({ email: user.email });
}));

router.post("/logout", (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  res.clearCookie(COOKIE, COOKIE_OPTS);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ user: currentUser(req) });
});

router.post("/forgot", authLimiter, wrap(async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const user = validEmail(email)
    ? db.prepare("SELECT id, email FROM users WHERE email = ?").get(email)
    : null;

  if (user) {
    const token = newToken();
    db.prepare("DELETE FROM reset_tokens WHERE user_id = ?").run(user.id);
    db.prepare("INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(sha256(token), user.id, Date.now() + RESET_MS);
    try {
      await sendResetEmail(user.email, `${BASE_URL}/account.html#reset=${token}`);
    } catch (err) {
      console.error("Reset email failed:", err.message);
    }
  }

  // Same answer whether or not the account exists
  res.json({ ok: true });
}));

router.post("/reset", authLimiter, wrap(async (req, res) => {
  const body = req.body ?? {};
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");

  if (!validPassword(password)) return res.status(400).json({ error: "Use a password of 8 to 128 characters." });

  const row = db.prepare("SELECT user_id FROM reset_tokens WHERE token_hash = ? AND expires_at > ?")
    .get(sha256(token), Date.now());
  if (!row) return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });

  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(password), row.user_id);
  db.prepare("DELETE FROM reset_tokens WHERE user_id = ?").run(row.user_id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id);

  startSession(res, row.user_id);
  res.json({ ok: true });
}));

module.exports = { router, requireUser, currentUser, hashPassword };