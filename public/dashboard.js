const CHANGE_MIN = 5;

const labelOf = (type) => CONCERNS[type]?.label ?? type.replace(/_/g, " ");
const toMap = (check) => new Map(check.scores.map((s) => [s.type, Math.round(s.raw_score)]));

const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (ms) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function renderStats(data) {
  const last = data.checks[0];
  const items = [
    [String(data.checks.length), "Checks so far"],
    [String(Math.max(data.dailyLimit - data.usedToday, 0)), "Left today"],
    [last ? fmtDate(last.createdAt) : "None yet", "Last check"],
  ];

  const box = document.getElementById("stats");
  box.replaceChildren();
  items.forEach(([value, label]) => {
    const stat = el("div", null, "stat");
    stat.append(el("strong", value), el("span", label));
    box.append(stat);
  });
}

function renderChanges(data) {
  const box = document.getElementById("changes");
  box.replaceChildren();

  if (data.checks.length < 2) {
    box.append(el("p", "Run a second check in a couple of weeks and this shows what changed.", "sub"));
    return;
  }

  const [latest, previous] = data.checks;
  const before = toMap(previous);
  const rows = [];

  toMap(latest).forEach((now, type) => {
    if (before.has(type)) rows.push({ type, before: before.get(type), now, delta: now - before.get(type) });
  });
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  box.append(
    el(
      "p",
      `Compared with your check on ${fmtDate(previous.createdAt)}. Changes under ${CHANGE_MIN} points can come from lighting or angle, so they count as no clear change.`,
      "sub"
    )
  );

  rows.forEach((r) => {
    const verdict = r.delta >= CHANGE_MIN ? "better" : r.delta <= -CHANGE_MIN ? "worse" : "same";
    const word = { better: "Improved", worse: "Slipped", same: "No clear change" }[verdict];

    const row = el("div", null, `change ${verdict}`);
    row.append(
      el("span", labelOf(r.type), "name"),
      el("span", `${r.before} → ${r.now}`, "arrow"),
      el("span", `${r.delta > 0 ? "+" : ""}${r.delta}`, "delta"),
      el("span", word, "verdict")
    );
    box.append(row);
  });
}

function renderHistory(data) {
  const box = document.getElementById("history");
  box.replaceChildren();

  if (data.checks.length === 0) {
    box.append(el("p", "No checks yet. Run your first one to start your history.", "sub"));
    return;
  }

  data.checks.forEach((check) => {
    const sorted = [...check.scores].sort((a, b) => a.raw_score - b.raw_score);
    const weak = sorted.filter((s) => s.raw_score < 70).slice(0, 3);

    const details = document.createElement("details");
    details.className = "check";

    const summary = document.createElement("summary");
    summary.append(
      el("strong", `${fmtDate(check.createdAt)}, ${fmtTime(check.createdAt)}`),
      el(
        "span",
        weak.length
          ? "Needs care: " + weak.map((s) => `${labelOf(s.type)} ${Math.round(s.raw_score)}`).join(", ")
          : "Nothing under 70",
        "weak"
      )
    );

    const list = el("div", null, "check-scores");
    sorted.forEach((s) => {
      const row = el("div", null, "mini");
      row.append(el("span", labelOf(s.type)), el("strong", String(Math.round(s.raw_score))));
      list.append(row);
    });

    details.append(summary, list);
    box.append(details);
  });
}
function renderQuizzes(data) {
  const box = document.getElementById("quizzes");
  box.replaceChildren();
  const list = data.quizzes || [];

  if (list.length === 0) {
    box.append(el("p", "No answers saved yet. Prefer not to use the camera? Answer six questions and they appear here.", "sub"));
    return;
  }

  box.append(el("p", "Based on your own answers, not a measurement.", "sub"));

  if (list.length >= 2) {
    const now = new Map(list[0].scores.map((s) => [s.type, s.raw_score]));
    const before = new Map(list[1].scores.map((s) => [s.type, s.raw_score]));
    const names = (types) => types.map(labelOf).join(", ");

    const cleared = [...before.keys()].filter((t) => !now.has(t));
    const eased = [...now.keys()].filter((t) => before.has(t) && now.get(t) > before.get(t));
    const added = [...now.keys()].filter((t) => !before.has(t));
    const stronger = [...now.keys()].filter((t) => before.has(t) && now.get(t) < before.get(t));

    const lines = [];
    if (cleared.length) lines.push(`No longer a focus: ${names(cleared)}`);
    if (eased.length) lines.push(`Eased: ${names(eased)}`);
    if (added.length) lines.push(`New focus: ${names(added)}`);
    if (stronger.length) lines.push(`Stronger: ${names(stronger)}`);
    if (!lines.length) lines.push("Your answers match your previous ones.");

    const summary = el("div", null, "quiz-change");
    summary.append(el("strong", `Since ${fmtDate(list[1].createdAt)}`));
    lines.forEach((line) => summary.append(el("p", line)));
    box.append(summary);
  }

  list.forEach((q) => {
    const row = el("div", null, "quiz-row");
    row.append(el("strong", `${fmtDate(q.createdAt)}, ${fmtTime(q.createdAt)}`));

    const chips = el("div", null, "chips");
    if (q.scores.length === 0) chips.append(el("span", "Nothing stood out", "chip"));
    q.scores.forEach((s) => {
      chips.append(el("span", `${labelOf(s.type)}: ${s.raw_score <= 48 ? "a lot" : "some"}`, "chip"));
    });
    row.append(chips);
    box.append(row);
  });
}

async function load() {
  try {
    const res = await fetch("/api/history");
    if (res.status === 401) {
      location.href = "account.html#login";
      return;
    }
    const data = await res.json();

    document.getElementById("who").textContent = data.email;
    document.getElementById("avatar").textContent = data.email[0].toUpperCase();
    renderStats(data);
    renderChanges(data);
    renderHistory(data);
     renderQuizzes(data);
  } catch (err) {
    console.error(err);
    document.getElementById("msg").textContent = "Couldn't load your history. Refresh the page to try again.";
  }
}

document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  location.href = "/";
});

document.getElementById("delete").addEventListener("click", async () => {
  if (!confirm("Delete your account? This permanently removes your email and all saved checks.")) return;
  const res = await fetch("/api/account", { method: "DELETE" });
  if (res.ok) location.href = "/";
  else alert("Couldn't delete the account. Please try again.");
});

load();