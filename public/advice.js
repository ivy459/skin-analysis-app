let lastOutput = null;

const CONCERNS = {
  pore: { label: "Pores", step: "Niacinamide serum", time: "PM",
    tip: "Niacinamide or a gentle salicylic acid (BHA) product helps keep pores clear.",
    gentleTip: "Niacinamide helps keep pores clear." },
  moisture: { label: "Moisture", step: "Hyaluronic acid serum", time: "both",
    tip: "Apply a hydrating serum on damp skin, then seal it in with a moisturizer." },
  dark_circle_v2: { label: "Dark circles", step: "Eye cream (caffeine or vitamin C)", time: "both",
    tip: "Sleep, sunscreen around the eyes and a brightening eye cream can help over time." },
  eye_bag: { label: "Eye bags", step: "Cold compress for 5 minutes", time: "AM",
    tip: "Cold compresses, enough sleep and less salt late in the day reduce puffiness." },
  oiliness: { label: "Oiliness", step: null, moisturizer: "Oil-free gel moisturizer", time: "both",
    tip: "Use a gel cleanser and a light, oil-free moisturizer. Skipping moisturizer can make oil worse." },
  redness: { label: "Redness", step: "Calming serum (centella or azelaic acid)", time: "PM",
    tip: "Keep it gentle: fragrance-free products and no harsh scrubs." },
  acne: { label: "Acne", step: "Salicylic acid on breakouts", time: "PM", strong: true,
    tip: "Salicylic acid or benzoyl peroxide on affected areas. See a dermatologist if it is painful, scarring or will not clear.",
    gentleTip: "Keep to a gentle routine and see a doctor or dermatologist for breakout treatments that suit you." },
  texture: { label: "Texture", step: "Gentle AHA/BHA exfoliant, 1-2 nights a week", time: "PM", strong: true,
    tip: "Exfoliate gently, no more than twice a week.",
    gentleTip: "Skip scrubs and keep to a gentle cleanser and moisturizer." },
  wrinkle: { label: "Wrinkles", step: "Retinol, start 2 nights a week", time: "PM", strong: true,
    tip: "Daily sunscreen matters most. Retinol works slowly, so start low.",
    gentleTip: "Daily sunscreen matters most." },
  firmness: { label: "Firmness", step: "Peptide serum", time: "PM",
    tip: "Daily sunscreen plus a peptide or retinol product supports firmness.",
    gentleTip: "Daily sunscreen and a peptide serum support firmness." },
  age_spot: { label: "Age spots", step: "Vitamin C serum", time: "AM",
    tip: "Daily sunscreen stops spots from darkening. Vitamin C can help fade them." },
  radiance: { label: "Radiance", step: "Vitamin C serum", time: "AM",
    tip: "Hydration, gentle exfoliation and vitamin C bring back glow.",
    gentleTip: "Hydration and vitamin C bring back glow." },
};

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function flags() {
  const sensitive = Boolean(document.getElementById("sensitive")?.checked);
  const pregnant = Boolean(document.getElementById("pregnant")?.checked);
  return { sensitive, pregnant, skipStrong: sensitive || pregnant };
}

function routine(concerns, time, opts) {
  const usable = concerns.filter((c) => !(opts.skipStrong && c.strong));

  // One strong active per routine, for the weakest concern
  let usedStrong = false;
  const steps = usable
    .filter((c) => c.step && (c.time === time || c.time === "both"))
    .filter((c) => {
      if (!c.strong) return true;
      if (usedStrong) return false;
      usedStrong = true;
      return true;
    })
    .map((c) => c.step);

  const custom = usable.find((c) => c.moisturizer);
  const gentle = opts.sensitive ? " (fragrance-free)" : "";
  const list = [
    `Gentle cleanser${gentle}`,
    ...new Set(steps),
    `${custom ? custom.moisturizer : "Moisturizer"}${gentle}`,
  ];
  if (time === "AM") list.push("Sunscreen SPF 30+");
  return list;
}
const LABEL_TIPS = {
  "Gentle cleanser": "Look for a mild, fragrance-free formula. Your skin shouldn't feel tight after rinsing.",
  "Moisturizer": "Look for glycerin or ceramides in the ingredients.",
  "Oil-free gel moisturizer": 'Look for "oil-free" or "non-comedogenic" on the label, in a light gel texture.',
  "Sunscreen SPF 30+": 'Look for SPF 30 or higher and "broad spectrum" on the label. Reapply every 2 hours in strong sun.',
  "Niacinamide serum": 'Look for "niacinamide" (vitamin B3) in the ingredient list.',
  "Hyaluronic acid serum": 'Look for "hyaluronic acid" or "sodium hyaluronate" in the ingredients.',
  "Vitamin C serum": 'Look for "ascorbic acid" or "ascorbyl glucoside". Keep it away from heat and light.',
  "Eye cream (caffeine or vitamin C)": 'Look for "caffeine" or vitamin C, in a fragrance-free cream made for the eye area.',
  "Calming serum (centella or azelaic acid)": 'Look for "centella asiatica" (also called cica) or "azelaic acid".',
  "Salicylic acid on breakouts": 'Look for "salicylic acid" or "BHA", and use it only on breakouts.',
  "Gentle AHA/BHA exfoliant, 1-2 nights a week": 'Look for "lactic acid", "glycolic acid" or "salicylic acid", in a low strength.',
  "Retinol, start 2 nights a week": 'Look for "retinol" and start with a low strength. Use it at night only.',
  "Peptide serum": 'Look for "peptide" in the ingredient list.',
};

function stepItem(step) {
  const li = document.createElement("li");
  const body = document.createElement("div");
  body.append(el("span", step, "step-name"));

  // Cleanser and moisturizer get "(fragrance-free)" added for sensitive skin
  const tip = LABEL_TIPS[step.replace(" (fragrance-free)", "")];
  if (tip) body.append(el("span", tip, "step-meta"));

  li.append(body);
  return li;
}

function renderAdvice(output) {
  lastOutput = output;
  const opts = flags();
  const box = document.getElementById("advice");

  const weakest = output
    .filter((i) => Number.isFinite(i.raw_score) && CONCERNS[i.type] && i.raw_score < 70)
    .sort((a, b) => a.raw_score - b.raw_score)
    .slice(0, 3)
    .map((i) => CONCERNS[i.type]);

  box.replaceChildren();

  if (weakest.length === 0) {
    box.append(el("h2", "Looking good"));
    box.append(el("p", "Nothing stands out. Keep up a gentle cleanser, moisturizer and daily sunscreen."));
    return;
  }

  box.append(el("h2", "Your focus areas"));
  weakest.forEach((c) => {
    const card = el("div", null, "tip");
    card.append(el("strong", c.label), el("p", opts.skipStrong && c.gentleTip ? c.gentleTip : c.tip));
    box.append(card);
  });

  if (opts.pregnant) {
    box.append(el("p", "Because you're pregnant or breastfeeding, retinol, salicylic acid and exfoliating acids are left out. Check any new product with your doctor or pharmacist first.", "gate"));
  }
  if (opts.sensitive) {
    box.append(el("p", "Because your skin is sensitive, strong actives are left out and every step is fragrance-free. Patch test anything new on your inner arm first.", "gate"));
  }
  const left = weakest.filter((c) => c.strong && opts.skipStrong).map((c) => c.label);
  if (left.length) {
    box.append(el("p", `Left out of your routine for now: ${left.join(", ")}. A doctor or pharmacist can suggest options that suit you.`, "gate"));
  }

  box.append(el("h2", "Your routine"));
 box.append(el("p", "Not sure what to buy? Each step says what to look for on the label.", "sub"));
  ["AM", "PM"].forEach((time) => {
    box.append(el("h3", time === "AM" ? "Morning" : "Night"));
    const ol = document.createElement("ol");
   routine(weakest, time, opts).forEach((s) => ol.append(stepItem(s)));
    box.append(ol);
  });

  box.append(el("p", "Add one new active product at a time and patch test first. Don't use retinol and exfoliating acids on the same night. Skip retinol if you are pregnant. This is cosmetic guidance, not medical advice.", "note"));
}

// Re-draw the advice when a tick-box changes
["sensitive", "pregnant"].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", () => {
    if (lastOutput) renderAdvice(lastOutput);
  });
});