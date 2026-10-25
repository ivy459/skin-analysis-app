const QUESTIONS = [
  {
    id: "midday",
    text: "By midday, how does your skin feel?",
    options: [
      { label: "Shiny, especially forehead and nose", set: { oiliness: 48 } },
      { label: "Tight or dry", set: { moisture: 48 } },
      { label: "Shiny in the middle, dry on the cheeks", set: { oiliness: 62, moisture: 62 } },
      { label: "Comfortable", set: {} },
    ],
  },
  {
    id: "breakouts",
    text: "How often do you get breakouts?",
    options: [
      { label: "Rarely or never", set: {} },
      { label: "Now and then", set: { acne: 62 } },
      { label: "Most weeks", set: { acne: 48 } },
    ],
  },
  {
    id: "redness",
    text: "Does your skin turn red or sting with new products?",
    options: [
      { label: "No", set: {} },
      { label: "Sometimes", set: { redness: 62 } },
      { label: "Often", set: { redness: 48 } },
    ],
  },
  {
    id: "circles",
    text: "How noticeable are dark circles under your eyes?",
    options: [
      { label: "Barely", set: {} },
      { label: "Some", set: { dark_circle_v2: 62 } },
      { label: "Very noticeable", set: { dark_circle_v2: 48 } },
    ],
  },
  {
    id: "pores",
    text: "How visible are your pores?",
    options: [
      { label: "Hardly visible", set: {} },
      { label: "Visible on nose and cheeks", set: { pore: 62 } },
      { label: "Visible across my face", set: { pore: 48 } },
    ],
  },
  {
    id: "dull",
    text: "Does your skin look dull or feel uneven?",
    options: [
      { label: "No, it looks fresh", set: {} },
      { label: "A little", set: { texture: 62 } },
      { label: "Yes, often", set: { texture: 48, radiance: 62 } },
    ],
  },
];

const form = document.getElementById("quiz");

QUESTIONS.forEach((q) => {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = q.text;
  group.append(legend);

  q.options.forEach((opt, i) => {
    const label = document.createElement("label");
    label.className = "choice";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = q.id;
    input.value = i;
    input.required = true;

    const text = document.createElement("span");
    text.textContent = opt.label;

    label.append(input, text);
    group.append(label);
  });

  form.append(group);
});

const submit = document.createElement("button");
submit.type = "submit";
submit.textContent = "Show my routine";
form.append(submit);

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const scores = {};

  QUESTIONS.forEach((q) => {
    const choice = q.options[Number(data.get(q.id))];
    Object.entries(choice.set).forEach(([type, score]) => {
      scores[type] = Math.min(scores[type] ?? 100, score);
    });
  });

  const output = Object.entries(scores).map(([type, raw_score]) => ({ type, raw_score }));
  renderAdvice(output);
 saveAnswers(output);

  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("advice").scrollIntoView({ behavior: calm ? "auto" : "smooth" });
});
async function saveAnswers(output) {
  const note = document.getElementById("save-note");
  note.textContent = "";
  try {
    const res = await fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores: output }),
    });

    if (res.ok) {
      note.textContent = "Saved to your dashboard. Answer again in a few weeks to see what changed.";
    } else if (res.status === 401) {
      note.textContent = "Want to keep these answers and track changes? ";
      const link = document.createElement("a");
      link.href = "account.html#signup";
      link.textContent = "Create a free account";
      note.append(link, ".");
    } else {
      const data = await res.json().catch(() => ({}));
      note.textContent = data.error || "Couldn't save your answers.";
    }
  } catch (err) {
    console.error(err);
  }
}