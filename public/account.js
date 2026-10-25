const msg = document.getElementById("msg");
const title = document.getElementById("view-title");
const views = {
  login: document.getElementById("form-login"),
  signup: document.getElementById("form-signup"),
  forgot: document.getElementById("form-forgot"),
  reset: document.getElementById("form-reset"),
};
const titles = {
  login: "Log in",
  signup: "Create your account",
  forgot: "Reset your password",
  reset: "Choose a new password",
};
let resetToken = "";

function show(name) {
  Object.entries(views).forEach(([key, el]) => (el.hidden = key !== name));
  title.textContent = titles[name];
  msg.textContent = "";
}

function route() {
  const hash = location.hash.slice(1);
  if (hash.startsWith("reset=")) {
    resetToken = hash.slice("reset=".length);
    history.replaceState(null, "", location.pathname + "#reset");
    show("reset");
  } else if (views[hash]) {
    show(hash);
  } else {
    show("login");
  }
}

async function post(path, body) {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function onSubmit(form, handler) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    msg.textContent = "";
    try {
      await handler(Object.fromEntries(new FormData(form)));
    } catch (err) {
      msg.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
}

onSubmit(views.login, async (f) => {
  await post("login", { email: f.email, password: f.password });
  location.href = "/";
});

onSubmit(views.signup, async (f) => {
  if (f.password !== f.confirm) throw new Error("The two passwords don't match.");
  await post("signup", { email: f.email, password: f.password });
  location.href = "/";
});

onSubmit(views.forgot, async (f) => {
  await post("forgot", { email: f.email });
  msg.textContent = "If an account exists for that email, a reset link is on its way. It works for 30 minutes.";
});

onSubmit(views.reset, async (f) => {
  if (f.password !== f.confirm) throw new Error("The two passwords don't match.");
  await post("reset", { token: resetToken, password: f.password });
  location.href = "/";
});

window.addEventListener("hashchange", route);
route();