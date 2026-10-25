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
app.use("/api/auth", authRouter);

const API = "https://yce-api-01.makeupar.com/s2s/v2.0";
const authHeaders = {
  Authorization: `Bearer ${process.env.YOUCAM_API_KEY}`,
  "Content-Type": "application/json",
};
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 5;
const DEMO_EMAIL = (process.env.DEMO_EMAIL || "").trim().toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

app.get("/api/health", (req, res) => {
  res.json({ ok: true, keyLoaded: Boolean(process.env.YOUCAM_API_KEY) });
});

// ---------- Face scan ----------
app.post("/api/analyze", requireUser, analyzeLimiter, async (req, res) => {
  try {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM checks WHERE user_id = ? AND created_at > ?")
      .get(req.user.id, since);
    if (n >= DAILY_LIMIT) {
      return res.status(429).json({ error: `You've used your ${DAILY_LIMIT} checks for today. Come back tomorrow.` });
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

        const prev = db.prepare(
          "SELECT created_at, scores FROM checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
        ).get(req.user.id);

        db.prepare("INSERT INTO checks (user_id, created_at, scores) VALUES (?, ?, ?)")
          .run(req.user.id, Date.now(), JSON.stringify(scores));

        return res.json({
          ...p.data,
          previous: prev ? { createdAt: prev.created_at, scores: JSON.parse(prev.scores) } : null,
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
app.get("/api/history", requireUser, (req, res) => {
  const rows = db.prepare(
    "SELECT id, created_at, scores FROM checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(req.user.id);

  const quizRows = db.prepare(
    "SELECT id, created_at, scores FROM quiz_checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 20"
  ).all(req.user.id);

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM checks WHERE user_id = ? AND created_at > ?")
    .get(req.user.id, since);

  res.set("Cache-Control", "no-store");
  res.json({
    email: req.user.email,
    checks: rows.map((r) => ({ id: r.id, createdAt: r.created_at, scores: JSON.parse(r.scores) })),
    quizzes: quizRows.map((r) => ({ id: r.id, createdAt: r.created_at, scores: JSON.parse(r.scores) })),
    usedToday: n,
    dailyLimit: DAILY_LIMIT,
  });
});

// ---------- Saved skin-question answers ----------
const QUIZ_TYPES = ["pore", "moisture", "dark_circle_v2", "oiliness", "redness", "acne", "texture", "radiance"];

app.post("/api/quiz", requireUser, (req, res) => {
  const raw = Array.isArray(req.body?.scores) ? req.body.scores : [];
  const valid = raw
    .filter((s) => QUIZ_TYPES.includes(s?.type) && [48, 62].includes(s?.raw_score))
    .map(({ type, raw_score }) => ({ type, raw_score }));
  const scores = [...new Map(valid.map((s) => [s.type, s])).values()];

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM quiz_checks WHERE user_id = ? AND created_at > ?")
    .get(req.user.id, since);
  if (n >= 10) return res.status(429).json({ error: "Too many saved answers today. Try again tomorrow." });

  db.prepare("INSERT INTO quiz_checks (user_id, created_at, scores) VALUES (?, ?, ?)")
    .run(req.user.id, Date.now(), JSON.stringify(scores));
  res.json({ ok: true });
});

// ---------- Delete account ----------
app.delete("/api/account", requireUser, (req, res) => {
  if (DEMO_EMAIL && req.user.email === DEMO_EMAIL) {
    return res.status(403).json({ error: "The demo account can't be deleted." });
  }

  const id = req.user.id;
  db.prepare("DELETE FROM checks WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM quiz_checks WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM reset_tokens WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM users WHERE id = ?").run(id);

  res.clearCookie("sid", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.json({ ok: true });
});

// ---------- Demo account for judges, created at startup if missing ----------
(async () => {
  const password = process.env.DEMO_PASSWORD || "";
  if (!DEMO_EMAIL || !password || typeof hashPassword !== "function") return;
  if (!db.prepare("SELECT 1 FROM users WHERE email = ?").get(DEMO_EMAIL)) {
    db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
      .run(DEMO_EMAIL, await hashPassword(password));
    console.log("Demo account created:", DEMO_EMAIL);
  }
})().catch((err) => console.error("Demo account failed:", err.message));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(3000, () => console.log("Running on http://localhost:3000"));