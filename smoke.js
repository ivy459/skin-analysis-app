const base = "http://localhost:3000";

const tests = [
  { name: "Health, key loaded", path: "/api/health", status: 200, has: '"keyLoaded":true' },
  { name: "Home page", path: "/", status: 200, has: "See what your skin needs next" },
  { name: "Questions page", path: "/questions.html", status: 200 },
  { name: "Account page", path: "/account.html", status: 200 },
  { name: "Dashboard page", path: "/dashboard.html", status: 200 },
  { name: "advice.js", path: "/advice.js", status: 200 },
  { name: "progress.js", path: "/progress.js", status: 200 },
  { name: "Logged-out session", path: "/api/auth/me", status: 200, has: '"user":null' },
  { name: "History needs login", path: "/api/history", status: 401 },
  { name: "Scan needs login", path: "/api/analyze", status: 401, method: "POST" },
];

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      const res = await fetch(base + t.path, { method: t.method || "GET" });
      const text = await res.text();
      const ok = res.status === t.status && (!t.has || text.includes(t.has));
      if (!ok) failed++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${t.name} (got ${res.status})`);
    } catch (err) {
      failed++;
      console.log(`FAIL  ${t.name} (${err.message})`);
    }
  }
  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
})();