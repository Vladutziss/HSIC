// Renders Molt with the same pixel sprites as the app (shared via @molted/ui).
import { spriteRuns } from "@molted/ui/sprites.js";

const svg = (opts) =>
  `<svg viewBox="0 0 32 32" shape-rendering="crispEdges" class="block h-full w-full" aria-hidden="true">${spriteRuns(opts)
    .map(([x, y, w, c]) => `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`)
    .join("")}</svg>`;

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

for (const el of document.querySelectorAll("[data-sprite]")) {
  const [path, stage, mood] = el.dataset.sprite.split(",");
  el.innerHTML = svg({ path, stage, mood });
  if (!el.classList.contains("block")) el.classList.add("block");
  if (!still) el.firstChild.classList.add(`anim-${el.dataset.anim || (stage === "egg" ? "wobble" : "bob")}`);
}

// hero: the egg cracks, hatches and grows
const FRAMES = [
  { stage: "egg", crack: 0, name: "Ou" },
  { stage: "egg", crack: 2, name: "Ou" },
  { stage: "hatchling", name: "Pui" },
  { stage: "apprentice", name: "Ucenic" },
  { stage: "adept", name: "Adept" },
  { stage: "master", name: "Maestru" },
];
const hero = document.getElementById("hero-molt");
const label = document.getElementById("hero-stage");
const show = (i) => {
  const f = FRAMES[i];
  hero.innerHTML = svg({ path: "sport", stage: f.stage, mood: i === FRAMES.length - 1 ? "joy" : "idle", crack: f.crack || 0 });
  hero.firstChild.classList.add(f.stage === "egg" ? "anim-wobble" : "anim-bob", "anim-pop");
  label.textContent = f.name;
};
if (hero) {
  if (still) show(FRAMES.length - 1);
  else {
    let i = 0;
    show(0);
    setInterval(() => show(++i % FRAMES.length), 2200);
  }
}
