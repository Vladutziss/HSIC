// What Molt can wear, and how each piece is earned. Like engine.js, everything here is a pure function of the stored
// state. The rules say when an item is earned; the moment it is, it is written to `state.unlocked` ({ id: day }, the
// table wardrobe_items) and from then on it counts whatever the history does, so it can never be lost (a momentum
// reset lowers the level, not `bestLevel`) and it is the same on every device. What Molt wears is
// `state.companion.look`. See docs/PLAN_MOLT_CUSTOMIZARE.md.
//
// The renderer (packages/ui/sprites.js) draws four slots by itself (hat, held, aura, dye); the other slots (effect,
// scene, pet, title) are drawn by the screens. Phase 1 brings the hats and the auras; the other slots only have their
// defaults until their phase.

import { LEVELS, STAGES } from "./engine.js";
import { tr } from "./i18n.js";

export const SLOTS = ["hat", "aura", "effect", "held", "dye", "scene", "pet", "title"];
export const SLOT_LABEL = { hat: tr("Pălărie"), aura: tr("Aură"), effect: tr("Efect"), held: tr("În mână"), dye: tr("Culoare"), scene: tr("Scenă"), pet: tr("Companion"), title: tr("Titlu") };
export const RARITIES = ["common", "rare", "epic", "legendary"];
export const RARITY_LABEL = { common: tr("Comun"), rare: tr("Rar"), epic: tr("Epic"), legendary: tr("Legendar") };

// What an empty slot holds. "signature" is the piece the class has always worn on its own, "none" is nothing.
export const DEFAULT_LOOK = { hat: "signature", aura: "none", effect: "none", held: "signature", dye: "none", scene: "none", pet: "none", title: "none" };

/**
 * An item: { id, slot, rarity, name, hint, rule }. `rule` says what unlocks it:
 *   { type: "always" }
 *   { type: "stage", min }   evolution stage index reached (0 egg … 5 legend)
 *   { type: "level", min }   best momentum level ever reached (not the current one)
 *   { type: "streak", min }  longest streak, in days
 *   { type: "count", fact, min }  any other number in `facts` (focus sessions, evening reports, …)
 * The defaults are free; every real item is added in the phase that draws it.
 */
const free = (slot, id, name) => ({ id, slot, rarity: "common", name, hint: "", rule: { type: "always" } });
const item = (slot, id, rarity, name, rule) => ({ id, slot, rarity, name, rule });

// What a count fact is called, as [one, few (2-19), many (20+)], for the hint "încă 6 sesiuni Focus".
const COUNT_LABEL = {
  focusSessions: [tr("sesiune Focus"), tr("sesiuni Focus"), tr("de sesiuni Focus")],
  studySessions: [tr("sesiune de studiu"), tr("sesiuni de studiu"), tr("de sesiuni de studiu")],
  reviews: [tr("raport de seară"), tr("rapoarte de seară"), tr("de rapoarte de seară")],
  goalsDone: [tr("obiectiv terminat"), tr("obiective terminate"), tr("de obiective terminate")],
};

// The auras follow the momentum levels (their names are flames, so the auras are too): level 2 = Jar … 10 = Supernovă.
const AURA_LEVELS = [
  ["embers", 2, "common", tr("Licurici")],
  ["warm", 3, "common", tr("Contur cald")],
  ["torch", 4, "rare", tr("Flăcărui la picioare")],
  ["sparks", 5, "rare", tr("Scântei care urcă")],
  ["beam", 6, "rare", tr("Fascicul de far")],
  ["blaze", 7, "epic", tr("Aură roșu-aurie")],
  ["comet", 8, "epic", tr("Coadă de cometă")],
  ["constellation", 9, "legendary", tr("Constelație")],
  ["nova", 10, "legendary", tr("Explozie de culori")],
];

export const CATALOG = [
  free("hat", "signature", tr("Semnul clasei")),
  free("hat", "none", tr("Fără pălărie")),
  item("hat", "focus-cap", "common", tr("Cască de focus"), { type: "count", fact: "focusSessions", min: 10 }),
  item("hat", "night-cap", "common", tr("Fes de noapte"), { type: "count", fact: "reviews", min: 7 }),
  item("hat", "grad-cap", "rare", tr("Beretă de absolvent"), { type: "count", fact: "studySessions", min: 10 }),
  item("hat", "wizard", "epic", tr("Pălărie de vrăjitor"), { type: "streak", min: 30 }),
  item("hat", "laurel", "epic", tr("Coroană de lauri"), { type: "count", fact: "goalsDone", min: 1 }),
  item("hat", "crown", "legendary", tr("Coroană"), { type: "stage", min: 5 }),
  free("held", "signature", tr("Unealta clasei")),
  free("held", "none", tr("Mâinile libere")),
  free("aura", "none", tr("Fără aură")),
  ...AURA_LEVELS.map(([id, min, rarity, name]) => item("aura", id, rarity, name, { type: "level", min })),
  free("dye", "none", tr("Culoarea clasei")),
  free("effect", "none", tr("Fără efect")),
  free("scene", "none", tr("Noaptea înstelată")),
  free("pet", "none", tr("Fără companion")),
  free("title", "none", tr("Fără titlu")),
];

export const itemsFor = (slot, catalog = CATALOG) => catalog.filter((i) => i.slot === slot);
/** An earnable item by id (ids of earnable items are unique across slots; the always-free defaults are not). */
export const itemById = (id, catalog = CATALOG) => catalog.find((i) => i.id === id && i.rule.type !== "always") || null;
export const findItem = (slot, id, catalog = CATALOG) => catalog.find((i) => i.slot === slot && i.id === id) || null;

/**
 * The numbers the rules read. `companion`, `timeline` and `streak` come from derive().
 */
export function collectFacts({ state, timeline, companion, streak }) {
  return {
    stage: companion?.stageIndex ?? 0,
    ep: companion?.ep ?? 0,
    level: timeline?.bestLevel ?? 1,
    streak: streak?.best ?? 0,
    focusSessions: (state?.focusSessions || []).length,
    studySessions: (state?.schoolPlanner?.sessions || []).length,
    reviews: Object.keys(state?.reviews || {}).length,
    // goals with steps that were finished
    goalsDone: (state?.objectives || []).filter((o) => o.doneOn && (o.steps || []).length > 0).length,
  };
}

/** Whether the facts satisfy a rule. A rule that is missing or of an unknown type never unlocks (safe default). */
export function ruleMet(rule, facts) {
  switch (rule?.type) {
    case "always":
      return true;
    case "stage":
      return (facts.stage ?? 0) >= rule.min;
    case "level":
      return (facts.level ?? 1) >= rule.min;
    case "streak":
      return (facts.streak ?? 0) >= rule.min;
    case "count":
      return (facts[rule.fact] ?? 0) >= rule.min;
    default:
      return false;
  }
}

/** Ids of the items the player has, as a Set: the rules are met, or the item was already recorded in `unlocked` ({ id: day }). */
export function unlockedIds(facts, unlocked = {}, catalog = CATALOG) {
  const out = new Set();
  for (const item of catalog) if (ruleMet(item.rule, facts) || unlocked?.[item.id]) out.add(item.id);
  return out;
}

/** How far a locked item is: { have, need, ratio } (1 when unlocked), or null for a rule that cannot be measured. */
export function progressToward(item, facts) {
  const r = item.rule;
  const [have, need] =
    r.type === "stage" ? [facts.stage ?? 0, r.min] : r.type === "level" ? [facts.level ?? 1, r.min] : r.type === "streak" ? [facts.streak ?? 0, r.min] : r.type === "count" ? [facts[r.fact] ?? 0, r.min] : r.type === "always" ? [1, 1] : [null, null];
  if (have === null || !(need > 0)) return null;
  return { have: Math.min(have, need), need, ratio: Math.min(1, have / need) };
}

/**
 * The locked item the player is closest to (the most useful hint, not the rarest). Items already unlocked and those
 * that cannot be measured are skipped. Ties go to the earlier item in the catalog.
 */
export function nextReward(facts, unlocked = {}, catalog = CATALOG) {
  const have = unlockedIds(facts, unlocked, catalog);
  let best = null;
  for (const item of catalog) {
    if (have.has(item.id)) continue;
    const p = progressToward(item, facts);
    if (!p) continue;
    if (!best || p.ratio > best.progress.ratio) best = { item, progress: p };
  }
  return best;
}

/**
 * A look that is safe to draw: only known slots, and in each only an item that exists in the catalog for that slot and
 * is unlocked. Anything else becomes the slot's default. Also the way to read a look that came from outside (a group
 * member's published stats), with `unlocked` = null to skip the unlock check (we cannot know theirs).
 */
export function normalizeLook(look, unlocked = null, catalog = CATALOG) {
  const out = { ...DEFAULT_LOOK };
  if (!look || typeof look !== "object") return out;
  for (const slot of SLOTS) {
    const id = look[slot];
    if (typeof id !== "string") continue;
    const item = catalog.find((x) => x.slot === slot && x.id === id);
    if (item && (!unlocked || unlocked.has(id))) out[slot] = id;
  }
  return out;
}

/** The slots that differ from the default, as the few ids that other members get to see (published with the group stats). */
export function compactLook(look) {
  const out = {};
  for (const slot of SLOTS) if (look?.[slot] && look[slot] !== DEFAULT_LOOK[slot]) out[slot] = look[slot];
  return out;
}

/** The look to draw for this player: their choices, cleaned against what they really have. */
export function currentLook(state, facts, catalog = CATALOG) {
  return normalizeLook(state?.companion?.look, unlockedIds(facts, state?.unlocked, catalog), catalog);
}

/** Earnable items whose rule is met but are not recorded yet: the ones to celebrate and to write to `unlocked`. */
export function newItems(facts, unlocked, catalog = CATALOG) {
  return catalog.filter((item) => item.rule.type !== "always" && ruleMet(item.rule, facts) && !unlocked?.[item.id]);
}

/** `unlocked` with `ids` added for `day` (an id already there keeps its first day). */
export function recordUnlocks(unlocked, ids, day) {
  const out = { ...(unlocked || {}) };
  for (const id of ids) if (!out[id]) out[id] = day;
  return out;
}

/** Level name for a hint, e.g. "nivelul 5 (Foc de tabără)". */
export const levelHint = (lvl) => tr("nivelul {lvl} ({v})", { lvl, v: LEVELS.find((l) => l.lvl === lvl)?.name || "?" });

const countText = (fact, n) => {
  const [one, few, many] = COUNT_LABEL[fact] || [tr("lucru"), tr("lucruri"), tr("de lucruri")];
  return `${n} ${n === 1 ? one : n < 20 ? few : many}`;
};

/**
 * What the player has to do for a locked item, in words: { text, progress } where `text` is e.g. "Încă 6 sesiuni Focus"
 * and `progress` is progressToward(). An unlocked item has no hint ("").
 */
export function hintFor(item, facts) {
  const r = item.rule;
  const progress = progressToward(item, facts);
  if (!progress || progress.ratio >= 1) return { text: "", progress };
  const left = progress.need - progress.have;
  let text;
  switch (r.type) {
    case "count":
      text = tr("Încă {countText}", { countText: countText(r.fact, left) });
      break;
    case "level":
      text = tr("Atinge {levelHint}", { levelHint: levelHint(r.min) });
      break;
    case "streak":
      text = tr("Serie de {min} de zile (recordul tău: {have})", { min: r.min, have: progress.have });
      break;
    case "stage":
      text = tr("Evoluează până la {v}", { v: STAGES[r.min]?.name || tr("următorul stadiu") });
      break;
    default:
      text = "";
  }
  return { text, progress };
}
