const CHANGE_MIN = 5;

function renderProgress(data) {
  const box = document.getElementById("progress");
  if (!box) return;
  box.replaceChildren();

  const prev = data.previous;
  if (!prev) {
    box.append(el("h2", "Your first check"));
    box.append(el("p", "This is your starting point. Check again in a couple of weeks and this section shows what changed.", "sub"));
    return;
  }

  const before = new Map(prev.scores.map((s) => [s.type, Math.round(s.raw_score)]));
  const rows = (data.results?.output || [])
    .filter((o) => Number.isFinite(o.raw_score) && before.has(o.type))
    .map((o) => {
      const now = Math.round(o.raw_score);
      const was = before.get(o.type);
      const delta = now - was;
      const verdict = delta >= CHANGE_MIN ? "better" : delta <= -CHANGE_MIN ? "worse" : "same";
      return { type: o.type, was, now, delta, verdict };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const count = (v) => rows.filter((r) => r.verdict === v).length;
  const date = new Date(prev.createdAt).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });

  box.append(el("h2", "Since your last check"));
  box.append(el("p", `${count("better")} improved, ${count("worse")} slipped, ${count("same")} no clear change`, "progress-summary"));
  box.append(el("p", `Compared with ${date}. Changes under ${CHANGE_MIN} points can come from lighting or angle, so they count as no clear change.`, "sub"));

  const words = { better: "Improved", worse: "Slipped", same: "No clear change" };
  rows.slice(0, 5).forEach((r) => {
    const row = el("div", null, `change ${r.verdict}`);
    row.append(
      el("span", CONCERNS[r.type]?.label ?? r.type.replace(/_/g, " "), "name"),
      el("span", `${r.was} → ${r.now}`, "arrow"),
      el("span", `${r.delta > 0 ? "+" : ""}${r.delta}`, "delta"),
      el("span", words[r.verdict], "verdict")
    );
    box.append(row);
  });
}