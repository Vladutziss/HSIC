// AI features run on Claude through the artifact's `sample` capability, on the
// viewer's own account. Every feature has a written fallback for when Claude
// is unavailable (outside claude.ai, consent declined, an error).

import { PATHS } from "./catalog.js";
import { fmtLong } from "./dates.js";
import { capability } from "./platform.js";

const HIDE = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]);
let disabled = false;

const clip = (s, n) => {
  const t = String(s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

export async function aiStatus() {
  if (disabled) return { available: false, images: false };
  const sample = await capability("sample");
  if (!sample) return { available: false, images: false };
  let images = false;
  try {
    images = !!(await sample.limits())?.images;
  } catch {
    images = false;
  }
  return { available: true, images };
}

async function askJson(prompt, opts) {
  if (disabled) throw { code: "not_granted" };
  const sample = await capability("sample");
  if (!sample) throw { code: "unavailable" };
  try {
    return await sample.json(prompt, opts);
  } catch (e) {
    if (e && HIDE.has(e.code)) disabled = true;
    throw e;
  }
}

export function aiErrorCopy(code) {
  switch (code) {
    case "not_granted":
    case "sampling_disabled":
      return "AI-ul nu are permisiune în această pagină.";
    case "rate_limited":
      return "Prea multe cereri către AI acum. Încearcă din nou peste puțin timp.";
    case "session_expired":
      return "Sesiunea a expirat. Reîncarcă pagina și autentifică-te din nou.";
    case "image_rejected":
      return "AI-ul nu a putut citi poza. Încearcă o altă imagine.";
    case "unavailable":
      return "AI-ul nu e disponibil aici.";
    case "cancelled":
      return "";
    default:
      return "AI-ul nu a răspuns de data asta.";
  }
}

// ------------------------------------------------------------ proof check + story

export async function verifyProof({ habit, type, note, image, seconds, companion, recent = [], pathId, canSeeImage }, signal) {
  const cls = PATHS[pathId]?.cls || "Atlet";
  const story = recent.length ? recent.slice(-3).map((s) => `- ${s}`).join("\n") : "- (the story is just beginning)";
  const kind =
    type === "photo"
      ? canSeeImage
        ? "a photo (attached)"
        : "a photo you cannot see (judge from the player's note only)"
      : type === "voice"
        ? `a voice note of about ${seconds || "?"} seconds (you cannot hear it; judge from the player's description only)`
        : "a written note";
  const prompt = `You are the game master of "Momentum", a self-improvement RPG. The player submitted proof for today's habit check-in.

Habit: "${habit.name}". Target: "${habit.target || "-"}".
Proof: ${kind}.
Player's note: "${clip(note, 500)}"

The player's companion is ${companion.name || "a small creature"}, a ${cls} at the "${companion.stage}" stage.
Story so far (newest last):
${story}

1. Decide whether the proof plausibly shows the habit was done today:
   - "verified": the photo clearly matches the habit (a gym, a running route, an open notebook with solved problems, a budget table, a sketch...).
   - "plausible": consistent but not conclusive, such as a specific written or voice note, or a photo that only loosely fits.
   - "rejected": empty, unrelated, or clearly not this habit.
   Be fair rather than strict, and never reject a photo only for low quality.
2. Write the next story fragment: 2-3 sentences, at most 300 characters, in Romanian, third person, present tense, about the companion continuing its adventure, inspired by what the player did. Warm and playful, never guilt-tripping. If rejected, the companion waits patiently and cheers the player on.
3. Give the fragment a title of 2-4 words in Romanian.

Reply with only JSON: {"verdict":"verified|plausible|rejected","reason":"<one short sentence in Romanian about the verdict, addressing the player as tu>","title":"...","story":"..."}`;
  const opts = { modelTier: "quick", cache: false, signal };
  if (type === "photo" && image && canSeeImage) opts.images = [image];
  const r = await askJson(prompt, opts);
  let verdict = ["verified", "plausible", "rejected"].includes(r?.verdict) ? r.verdict : "plausible";
  if (verdict === "verified" && !(type === "photo" && canSeeImage)) verdict = "plausible";
  return {
    verdict,
    reason: clip(r?.reason, 220),
    title: clip(r?.title, 40) || "Un pas înainte",
    story: clip(r?.story, 420) || templateStory({ pathId, name: companion.name, habitName: habit.name, verdict }),
    ai: true,
  };
}

// ------------------------------------------------------------ daily review

export async function dailyReview(p, signal) {
  const lines = p.habits
    .map((h) => `- ${h.name} (${h.diffLabel}${h.scheduled ? "" : ", optional today"}): ${h.done ? `done${h.proof ? `, proof ${h.proof}` : ""}` : "not done"}`)
    .join("\n");
  const prompt = `You are the evening coach in "Momentum", a self-improvement RPG. Review the player's day and score it.

Player: ${p.name || "the player"}. Goal: "${clip(p.goal, 200) || "-"}" (path: ${PATHS[p.pathId]?.label || "-"}).
Day: ${fmtLong(p.day)}.
Habits:
${lines || "- nothing scheduled"}
To-dos done: ${p.todos.done} of ${p.todos.total}${p.todos.titles.length ? ` (${p.todos.titles.slice(0, 5).join("; ")})` : ""}.
Momentum: level ${p.level.lvl} (${p.level.name}), ${p.momentum} points. Streak: ${p.streak} days.

Score the day from 0 to 100 for effort and consistency against the plan: 100 = everything scheduled done, most with proof; about 60 = most of it done; about 30 = a small start; 0 = nothing. Then write, in Romanian, addressing the player as "tu":
- summary: 2 sentences, specific to what was done today, honest and encouraging, without guilt or pressure.
- highlight: the best thing today, at most 8 words.
- tip: one concrete suggestion for tomorrow, at most 18 words.

Reply with only JSON: {"score": <integer 0-100>, "summary": "...", "highlight": "...", "tip": "..."}`;
  const r = await askJson(prompt, { modelTier: "quick", cache: false, signal });
  const score = Math.round(Number(r?.score));
  if (!Number.isFinite(score)) throw { code: "invalid_json" };
  return {
    score: Math.max(0, Math.min(100, score)),
    summary: clip(r.summary, 420),
    highlight: clip(r.highlight, 90),
    tip: clip(r.tip, 180),
    ai: true,
  };
}

// ------------------------------------------------------------ moments

export async function momentLineAI(situation, quote, signal) {
  const prompt = `In one sentence in Romanian (at most 170 characters), connect this quote to the player's situation in a self-improvement game. Address the player as "tu", be warm and concrete, and do not repeat the quote.
Situation: ${situation}.
Quote: "${quote.text}" (${quote.author}).
Reply with only JSON: {"line":"..."}`;
  const r = await askJson(prompt, { modelTier: "quick", signal });
  return clip(r?.line, 200);
}

export async function evolutionChapter({ name, pathId, from, to, recent = [] }, signal) {
  const prompt = `In "Momentum", a self-improvement RPG, the player's companion ${name || "the creature"} (a ${PATHS[pathId]?.cls || "hero"}) just evolved from "${from}" to "${to}" thanks to the player's proofs of effort.
Recent story (newest last):
${recent.slice(-3).map((s) => `- ${s}`).join("\n") || "- (none yet)"}
Write a short celebratory chapter: 3 sentences, at most 380 characters, in Romanian, third person, present tense, describing the transformation and what the companion can do now. Give it a title of 2-4 words.
Reply with only JSON: {"title":"...","story":"..."}`;
  const r = await askJson(prompt, { modelTier: "quick", cache: false, signal });
  return { title: clip(r?.title, 40) || to, story: clip(r?.story, 460), ai: true };
}

// ------------------------------------------------------------ written fallbacks

const STORIES = {
  sport: [
    "{n} își strânge bentița și urcă în fugă dealul din spatele satului. La fiecare pas își amintește de „{h}” și zâmbește.",
    "Pe terenul de antrenament, {n} ridică o piatră cât el de mare. Un cor de greieri aplaudă din iarbă.",
    "{n} descoperă o potecă nouă prin pădure și o parcurge în pas alert, până când soarele se lasă după munți.",
    "Inspirat de efortul tău, {n} exersează săritura peste pârâu până o reușește fără să-și ude lăbuțele.",
  ],
  studiu: [
    "{n} deschide un manuscris vechi din biblioteca turnului și mai descifrează o pagină. Lumânarea arde parcă mai luminos.",
    "Cu „{h}” în minte, {n} rezolvă ghicitoarea bufniței de la intrarea în arhivă. Ușa grea se deschide scârțâind.",
    "{n} adaugă o notiță nouă în caietul de explorator și desenează harta ideilor de azi.",
    "Bătrânul cărturar din turn îi dă lui {n} o carte nouă. „Ai câștigat-o”, îi spune.",
  ],
  bani: [
    "{n} își numără monedele la lumina felinarului și pune deoparte una strălucitoare pentru drumul lung.",
    "În piața din port, {n} face primul schimb cinstit al zilei și primește în dar o hartă veche.",
    "{n} trece fiecare bănuț în registrul de negustor. Registrul în ordine pare mai ușor de purtat.",
    "Un negustor bătrân îl învață pe {n} cum crește o monedă pusă la loc sigur. {n} ascultă cu ochii mari.",
  ],
  minte: [
    "{n} se așază sub stejarul bătrân și ascultă vântul. Frunzele de pe capul lui se înverzesc puțin mai tare.",
    "Într-o dimineață liniștită, {n} respiră adânc de zece ori, iar ceața din vale se ridică încet.",
    "{n} scrie trei rânduri în jurnalul lui din scoarță de mesteacăn și pornește la drum cu mintea limpede.",
    "La izvorul din munte, {n} bea apă rece și privește apusul fără nicio grabă.",
  ],
  creativ: [
    "{n} își acordează lăuta și compune un vers nou despre „{h}”. Păsările din jur prind refrenul.",
    "Pe zidul tavernei, {n} pictează un dragon mic. Hangiul jură că l-a văzut clipind.",
    "{n} adună culori din petale și pietre lucioase pentru marea lui lucrare.",
    "Seara, la focul de tabără, {n} spune o poveste nouă, iar toată lumea tace să asculte.",
  ],
};
const WAITING = [
  "{n} se uită lung la dovadă, își drege glasul și zice: „Mai încercăm și mâine?” Apoi se așază lângă foc și te așteaptă.",
  "{n} nu e sigur că asta se pune, dar îți face cu ochiul și îți ține locul pe potecă până data viitoare.",
];
const EGG = [
  "Oul se încălzește și se clatină ușor. Dinăuntru se aude un ciocănit mic.",
  "O crăpătură subțire apare pe coaja oului. Ceva dinăuntru pare nerăbdător să te cunoască.",
];

const pick = (list, seed) => list[Math.abs(seed) % list.length];
const seedOf = (s) => [...String(s)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

export function templateStory({ pathId, name, habitName, verdict, stage, seed = Date.now() }) {
  const n = name || "Puiul";
  const list = verdict === "rejected" ? WAITING : stage === "Ou" ? EGG : STORIES[pathId] || STORIES.sport;
  return pick(list, seedOf(seed)).replaceAll("{n}", n).replaceAll("{h}", (habitName || "").toLowerCase());
}

export const TEMPLATE_TITLES = ["Pas cu pas", "O zi bună", "Drumul continuă", "Încă o pagină", "Focul crește", "Mic, dar sigur"];

export function templateReview(p, score) {
  const done = p.habits.filter((h) => h.done);
  const missed = p.habits.filter((h) => h.scheduled && !h.done);
  const names = (list) => list.map((h) => h.name.toLowerCase());
  const join = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} și ${arr[arr.length - 1]}`);
  const proofs = done.filter((h) => h.proof).length;
  if (score >= 85) {
    return {
      summary: `Ai bifat aproape tot ce ți-ai propus azi${proofs ? `, cu ${proofs} ${proofs === 1 ? "dovadă" : "dovezi"}` : ""}. Ziua asta adaugă serios la momentum.`,
      highlight: "Toate misiunile duse la capăt",
      tip: `Păstrează aceeași oră pentru ${(done[0]?.name || "misiunile tale").toLowerCase()} și mâine.`,
    };
  }
  if (score >= 55) {
    return {
      summary: `Ai făcut cea mai mare parte din plan: ${join(names(done.slice(0, 3)))}. ${missed.length ? `${missed[0].name} rămâne pe mâine, fără grabă.` : "Restul a fost opțional."}`,
      highlight: `${done[0]?.name || "Ziua"} bifat`,
      tip: missed.length ? `Mâine, începe ziua cu ${missed[0].name.toLowerCase()}, cât ai energie.` : "Mâine, adaugă o dovadă la o misiune.",
    };
  }
  if (score >= 25) {
    return {
      summary: `Ai pornit motorul azi cu ${join(names(done.slice(0, 2))) || "câteva lucruri mici"}. Și pașii mici țin focul aprins.`,
      highlight: "Ai pornit, și asta contează",
      tip: "Alege o singură misiune ușoară pentru mâine dimineață și fă-o prima.",
    };
  }
  const easiest = [...p.habits].sort((a, b) => a.diff - b.diff)[0];
  return {
    summary: "Azi a fost o zi liniștită. Mâine e o pagină nouă, iar personajul tău te așteaptă.",
    highlight: "O zi de odihnă",
    tip: `Începe mâine cu cea mai ușoară misiune${easiest ? `: ${easiest.name.toLowerCase()}` : ""}.`,
  };
}
