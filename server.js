require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const db = require("./db");
const { router: authRouter, requireUser, hashPassword } = require("./auth");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.static("public"));

const API = "https://yce-api-01.makeupar.com/s2s/v2.0";
const authHeaders = {
  Authorization: `Bearer ${process.env.YOUCAM_API_KEY}`,
  "Content-Type": "application/json",
};

const DAY = 24 * 60 * 60 * 1000;
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 5;               // scans per account per day
const GLOBAL_DAILY_LIMIT = Number(process.env.GLOBAL_DAILY_LIMIT) || 10; // scans per day, all accounts
const SCAN_BUDGET = Number(process.env.SCAN_BUDGET) || 50;               // scans in total, all accounts
const DEMO_EMAIL = (process.env.DEMO_EMAIL || "").trim().toLowerCase();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const route = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const analyzeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 6,
  keyGenerator: (req) => String(req.user.id),
  message: { error: "Too many checks in a short time. Try again in a few minutes." },
});

async function yc(path, options = {}) {
  const r = await fetch(API + path, { ...options, headers: authHeaders });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("YouCam error", r.status, j);
    throw new Error(j.error || j.error_code || `YouCam returned ${r.status}`);
  }
  return j;
}

// ---------- Demo account for judges, created on the first API request if missing ----------
let demoReady = null;
function ensureDemoAccount() {
  if (!demoReady) {
    demoReady = (async () => {
      const password = process.env.DEMO_PASSWORD || "";
      if (!DEMO_EMAIL || !password) return;
      const found = await db.get("SELECT 1 AS x FROM users WHERE email = ?", [DEMO_EMAIL]);
      if (!found) {
        await db.run(
          "INSERT INTO users (email, password_hash) VALUES (?, ?)",
          [DEMO_EMAIL, await hashPassword(password)]
        );
        console.log("Demo account created:", DEMO_EMAIL);
      }
    })().catch((err) => {
      demoReady = null;
      console.error("Demo account setup failed:", err.message);
    });
  }
  return demoReady;
}

app.use("/api", async (req, res, next) => {
  await ensureDemoAccount();
  next();
});

app.use("/api/auth", authRouter);

app.get("/api/health", async (req, res) => {
  let dbOk = false;
  try {
    await db.get("SELECT 1 AS ok");
    dbOk = true;
  } catch (err) {
    console.error("Database check failed:", err.message);
  }
  res.json({ ok: true, keyLoaded: Boolean(process.env.YOUCAM_API_KEY), dbOk });
});

// ---------- Face scan ----------
app.post("/api/analyze", requireUser, analyzeLimiter, async (req, res) => {
  try {
    const since = Date.now() - DAY;

    const mine = await db.get(
      "SELECT COUNT(*) AS n FROM checks WHERE user_id = ? AND created_at > ?",
      [req.user.id, since]
    );
    if (Number(mine.n) >= DAILY_LIMIT) {
      return res.status(429).json({ error: `You've used your ${DAILY_LIMIT} checks for today. Come back tomorrow.` });
    }

    const today = await db.get("SELECT COUNT(*) AS n FROM checks WHERE created_at > ?", [since]);
    const total = await db.get("SELECT COUNT(*) AS n FROM checks");
    if (Number(total.n) >= SCAN_BUDGET || Number(today.n) >= GLOBAL_DAILY_LIMIT) {
      return res.status(429).json({
        error: "This demo has reached its scan limit, which protects its free credits. The sample result and the six skin questions still work, with no scan needed.",
      });
    }

    const image = req.body?.image;
    if (typeof image !== "string" || !/^data:image\/(jpeg|png);base64,/.test(image)) {
      return res.status(400).json({ error: "Send a JPG or PNG photo." });
    }
    const contentType = image.match(/^data:(.*?);/)[1];
    const buffer = Buffer.from(image.split(",")[1], "base64");

    // 1. Register the file
    const reg = await yc("/file", {
      method: "POST",
      body: JSON.stringify({
        files: [{ content_type: contentType, file_name: "selfie.jpg", file_size: buffer.length }],
      }),
    });
    const file = reg.data.files[0];
    const upload = file.requests[0];

    // 2. Upload the bytes to the pre-signed URL
    const up = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: buffer,
    });
    if (!up.ok) throw new Error(`Upload failed (${up.status})`);

    // 3. Create the task
    const task = await yc("/task/skin-analysis", {
      method: "POST",
      body: JSON.stringify({
        src_file_id: file.file_id,
        dst_actions: [
          "wrinkle", "pore", "texture", "acne", "moisture", "oiliness",
          "redness", "dark_circle_v2", "age_spot", "radiance", "firmness", "eye_bag",
        ],
        format: "json",
      }),
    });
    const taskId = task.data.task_id;

    // 4. Poll until done
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const p = await yc(`/task/skin-analysis/${taskId}`);
      const status = p.data?.task_status;

      if (status === "success") {
        // Save the scores only, never the photo
        const scores = (p.data.results?.output || [])
          .filter((o) => Number.isFinite(o.raw_score))
          .map(({ type, raw_score }) => ({ type, raw_score }));

        const prev = await db.get(
          "SELECT created_at, scores FROM checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
          [req.user.id]
        );

        await db.run(
          "INSERT INTO checks (user_id, created_at, scores) VALUES (?, ?, ?)",
          [req.user.id, Date.now(), JSON.stringify(scores)]
        );

        return res.json({
          ...p.data,
          previous: prev
            ? { createdAt: Number(prev.created_at), scores: JSON.parse(String(prev.scores)) }
            : null,
        });
      }

      if (status === "error") {
        console.error("Task error", p);
        return res.status(422).json({ error: p.data?.error || p.data?.error_code || "Analysis failed" });
      }
    }

    res.status(504).json({ error: "Analysis timed out" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Dashboard data ----------
app.get("/api/history", requireUser, route(async (req, res) => {
  const rows = await db.all(
    "SELECT id, created_at, scores FROM checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    [req.user.id]
  );
  const quizRows = await db.all(
    "SELECT id, created_at, scores FROM quiz_checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
    [req.user.id]
  );
  const mine = await db.get(
    "SELECT COUNT(*) AS n FROM checks WHERE user_id = ? AND created_at > ?",
    [req.user.id, Date.now() - DAY]
  );

  const shape = (r) => ({ id: Number(r.id), createdAt: Number(r.created_at), scores: JSON.parse(String(r.scores)) });

  res.set("Cache-Control", "no-store");
  res.json({
    email: req.user.email,
    checks: rows.map(shape),
    quizzes: quizRows.map(shape),
    usedToday: Number(mine.n),
    dailyLimit: DAILY_LIMIT,
  });
}));

// ---------- Saved skin-question answers ----------
const QUIZ_TYPES = ["pore", "moisture", "dark_circle_v2", "oiliness", "redness", "acne", "texture", "radiance"];

app.post("/api/quiz", requireUser, route(async (req, res) => {
  const raw = Array.isArray(req.body?.scores) ? req.body.scores : [];
  const valid = raw
    .filter((s) => QUIZ_TYPES.includes(s?.type) && [48, 62].includes(s?.raw_score))
    .map(({ type, raw_score }) => ({ type, raw_score }));
  const scores = [...new Map(valid.map((s) => [s.type, s])).values()];

  const recent = await db.get(
    "SELECT COUNT(*) AS n FROM quiz_checks WHERE user_id = ? AND created_at > ?",
    [req.user.id, Date.now() - DAY]
  );
  if (Number(recent.n) >= 10) {
    return res.status(429).json({ error: "Too many saved answers today. Try again tomorrow." });
  }

  await db.run(
    "INSERT INTO quiz_checks (user_id, created_at, scores) VALUES (?, ?, ?)",
    [req.user.id, Date.now(), JSON.stringify(scores)]
  );
  res.json({ ok: true });
}));

// ---------- Delete account ----------
app.delete("/api/account", requireUser, route(async (req, res) => {
  if (DEMO_EMAIL && req.user.email === DEMO_EMAIL) {
    return res.status(403).json({ error: "The demo account can't be deleted." });
  }

  const id = req.user.id;
  await db.run("DELETE FROM checks WHERE user_id = ?", [id]);
  await db.run("DELETE FROM quiz_checks WHERE user_id = ?", [id]);
  await db.run("DELETE FROM sessions WHERE user_id = ?", [id]);
  await db.run("DELETE FROM reset_tokens WHERE user_id = ?", [id]);
  await db.run("DELETE FROM users WHERE id = ?", [id]);

  res.clearCookie("sid", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

// Run a local server only when started with "node server.js". Hosts like Vercel import the app instead.
if (require.main === module) {
  app.listen(process.env.PORT || 3000, () => console.log("Running on http://localhost:3000"));
}

module.exports = app;