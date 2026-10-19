// Renders Molt with the same pixel sprites as the app (shared via @molted/ui).
import { spriteSvg as svg } from "./sprite.js";

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

// Molted in numbers: one public, aggregate-only RPC; the section stays hidden if the call fails
const base = import.meta.env.VITE_SUPABASE_URL?.trim();
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const cifre = document.getElementById("cifre");
const put = (id, v) => (document.getElementById(id).textContent = Number(v).toLocaleString("ro-RO"));
if (cifre && base && anon) {
  fetch(`${base}/rest/v1/rpc/public_stats`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: "{}" })
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      if (!m || !m.users) return;
      put("c-users", m.users);
      put("c-active7", m.active7);
      put("c-checkins", m.checkins);
      put("c-objectives", m.objectives);
      put("c-todos", m.todosDone);
      const a = m.agent; // null until there is enough data
      if (a?.decided) {
        put("c-decided", a.decided);
        document.getElementById("c-applied").textContent = `${Math.round((a.applied / a.decided) * 100)}%`;
        document.getElementById("c-improved").textContent = a.measured ? `${a.improved} din ${a.measured}` : "în curs";
        document.getElementById("c-agent").hidden = false;
      }
      cifre.hidden = false;
    })
    .catch(() => {});
}
