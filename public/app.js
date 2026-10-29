console.log("app.js loaded v5");

// ---------- Elements ----------
const startBtn = document.getElementById("start");
const uploadInput = document.getElementById("upload");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const consentBox = document.getElementById("consent");

// ---------- UI helpers ----------
function setStatus(message) {
  statusEl.textContent = message;
}

let signedIn = false;

function setBusy(isBusy) {
  const off = isBusy || !signedIn || !consentBox.checked;
  startBtn.disabled = off;
  if (uploadInput) uploadInput.disabled = off;
}

async function loadSession() {
  try {
    const res = await fetch("/api/auth/me");
    const { user } = await res.json();
    signedIn = Boolean(user);
    document.getElementById("who").textContent = user ? user.email : "";
    document.getElementById("avatar").textContent = user ? user.email[0].toUpperCase() : "";
    document.getElementById("nav-out").hidden = signedIn;
    document.getElementById("nav-in").hidden = !signedIn;
    document.getElementById("gate").hidden = signedIn;
  } catch (err) {
    console.error(err);
  }
  setBusy(false);
}
loadSession();

document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  location.reload();
});

function formatLabel(type) {
  return type.replace(/_/g, " ").replace(/\bv2\b/, "").trim();
}

function statusOf(score) {
  if (score < 70) return { word: "Needs care", cls: "needs" };
  if (score < 85) return { word: "Fair", cls: "fair" };
  return { word: "Strong", cls: "strong" };
}
function renderResults(data) {
  const items = data.results.output
    .filter((item) => Number.isFinite(item.raw_score))
    .sort((a, b) => a.raw_score - b.raw_score);

  const rows = items.map(({ type, raw_score }, i) => {
    const score = Math.round(raw_score);
    const status = statusOf(score);

    const row = document.createElement("div");
    row.className = `reading ${status.cls}`;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = CONCERNS[type]?.label ?? formatLabel(type);

    const number = document.createElement("strong");
    number.textContent = score;
    const value = document.createElement("span");
    value.className = "val";
    value.append(number, status.word);

    const top = document.createElement("div");
    top.className = "reading-top";
    top.append(name, value);

    const marker = document.createElement("span");
    marker.className = "marker";
    marker.style.transitionDelay = `${i * 40}ms`;
    const meter = document.createElement("div");
    meter.className = "meter";
    meter.append(marker);

    row.append(top, meter);
    return row;
  });

  resultsEl.replaceChildren(...rows);

  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      items.forEach(({ raw_score }, i) => {
        const pos = Math.min(Math.max(raw_score, 3), 97);
        rows[i].querySelector(".marker").style.left = `${pos}%`;
      })
    )
  );

  renderAdvice(data.results.output);
}


// ---------- Image helper ----------
function cropCenter(dataUrl, keep = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.round(img.width * keep);
      const x = Math.round((img.width - w) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, x, 0, w, img.height, 0, 0, w, img.height);
      console.log(`Photo ${img.width}x${img.height} -> ${w}x${img.height}`);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ---------- Server request ----------//
async function analyzePhoto(image) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Analysis failed");
  return data;
}
function friendlyError(message = "") {
  if (message && !message.startsWith("error_")) return message;
  if (message.includes("face_too_small")) return "Your face looks too small. Move closer so it fills the oval, then try again.";
  if (message.includes("lighting")) return "The lighting is too dark or uneven. Face a window or lamp and try again.";
  if (message.includes("out_of_bound")) return "Part of your face is outside the frame. Center your face and try again.";
  if (message.includes("min_image_size")) return "That photo is too small. Use a larger one.";
  if (message.includes("face")) return "We couldn't read your face clearly. Look straight at the camera in even light and try again.";
  return "Something went wrong analyzing your photo. Please try again.";
}

async function runAnalysis(image) {
  resultsEl.replaceChildren();
  setStatus("Analyzing your skin...");
  setBusy(true);

  try {
    const data = await analyzePhoto(image);
    console.log("Full response:", data);
    renderResults(data);
     renderProgress(data);
    localStorage.setItem("lastResult", JSON.stringify(data));
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(friendlyError(err.message));
  } finally {
    setBusy(false);
  }
}


// ---------- Camera Kit ----------
async function handleCapture(captured) {
  console.log("Captured:", captured);
  setStatus("Photo captured, preparing...");
  YMK.close();
  await runAnalysis(captured.images[0].image);
}

let listenersAttached = false;

function attachCameraListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  ["opened", "loaded", "cameraOpened", "faceDetectionStarted",
   "faceDetectionCaptured", "cameraFailed", "closed"].forEach((name) =>
    YMK.addEventListener(name, (e) => console.log("EVENT:", name, e))
  );

  YMK.addEventListener("faceDetectionCaptured", handleCapture);
  YMK.addEventListener("cameraFailed", () =>
    setStatus("Camera blocked or not found. Allow camera access and try again.")
  );
}

window.YMKAsyncInit = function () {
  console.log("YMKAsyncInit ran");
};

// ---------- Start button ----------
startBtn.addEventListener("click", () => {
  if (typeof YMK === "undefined") {
    setStatus("Camera is still loading. Try again in a moment.");
    return;
  }

  setStatus("");
  YMK.init({
    faceDetectionMode: "skincare",
    imageFormat: "base64",
    qualityLevel: "moderate",
    videoQuality: "1080p",
    qualityOverrides: { face_ratio_lower_threshold: 0.75 },
  });
  attachCameraListeners();
  YMK.openCameraKit();
});

// ---------- Upload fallback ----------
if (uploadInput) {
  uploadInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => runAnalysis(reader.result);
    reader.readAsDataURL(file);
  });
}
// ---------- Consent gate ----------
consentBox.addEventListener("change", () => setBusy(false));
setBusy(false);
// ---------- Demo mode: reuse the last result without spending units ----------
if (location.search.includes("demo")) {
  const saved = localStorage.getItem("lastResult");
  if (saved) {
    const data = JSON.parse(saved);
    renderResults(data);
    renderProgress(data);
  }
}
// ---------- Sample result for visitors ----------
if (location.search.includes("sample")) {
  const SAMPLE = {
    results: {
      output: [
        { type: "pore", raw_score: 52 },
        { type: "moisture", raw_score: 61 },
        { type: "dark_circle_v2", raw_score: 66 },
        { type: "eye_bag", raw_score: 72 },
        { type: "oiliness", raw_score: 78 },
        { type: "texture", raw_score: 81 },
        { type: "acne", raw_score: 84 },
        { type: "redness", raw_score: 88 },
        { type: "wrinkle", raw_score: 90 },
        { type: "age_spot", raw_score: 91 },
        { type: "firmness", raw_score: 92 },
        { type: "radiance", raw_score: 86 },
      ],
    },
    previous: {
      createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
      scores: [
        { type: "pore", raw_score: 49 },
        { type: "moisture", raw_score: 48 },
        { type: "dark_circle_v2", raw_score: 65 },
        { type: "eye_bag", raw_score: 70 },
        { type: "oiliness", raw_score: 74 },
        { type: "texture", raw_score: 80 },
        { type: "acne", raw_score: 83 },
        { type: "redness", raw_score: 87 },
        { type: "wrinkle", raw_score: 90 },
        { type: "age_spot", raw_score: 90 },
        { type: "firmness", raw_score: 91 },
        { type: "radiance", raw_score: 84 },
      ],
    },
  };
  document.getElementById("sample-note").hidden = false;
  renderResults(SAMPLE);
  renderProgress(SAMPLE);
}

  