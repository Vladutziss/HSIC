// What Molt can wear, and how each piece is earned. Like engine.js, everything here is a pure function of the stored
// state: nothing about "owned" items is stored, an item is unlocked when the history says so, which means it can
// never be lost (a momentum reset lowers the level, not `bestLevel`) and it works the same on every device.
// Only the player's choices are stored: `state.companion.look`. See docs/PLAN_MOLT_CUSTOMIZARE.md.
//
// The renderer (packages/ui/sprites.js) draws four slots by itself (hat, held, aura, dye); the other slots (effect,
// scene, pet, title) are drawn by the screens. Phase 0 has only the defaults in the catalog: the items themselves come
// with the next phases.

import { LEVELS } from "./engine.js";

export const SLOTS = ["hat", "aura", "effect", "held", "dye", "scene", "pet", "title"];
export const SLOT_LABEL = { hat: "Pălărie", aura: "Aură", effect: "Efect", held: "În mână", dye: "Culoare", scene: "Scenă", pet: "Companion", title: "Titlu" };
export const RARITIES = ["common", "rare", "epic", "legendary"];
export const RARITY_LABEL = { common: "Comun", rare: "Rar", epic: "Epic", legendary: "Legendar" };

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
export const CATALOG = [
  free("hat", "signature", "Semnul clasei"),
  free("hat", "none", "Fără pălărie"),
  free("held", "signature", "Unealta clasei"),
  free("held", "none", "Mâinile libere"),
  free("aura", "none", "Fără aură"),
  free("dye", "none", "Culoarea clasei"),
  free("effect", "none", "Fără efect"),
  free("scene", "none", "Noaptea înstelată"),
  free("pet", "none", "Fără companion"),
  free("title", "none", "Fără titlu"),
];

/**
 * The numbers the rules read. `companion`, `timeline` and `streak` come from derive(); `extra` holds the few facts
 * that only exist as stored events (see `earned`).
 */
export function collectFacts({ state, timeline, companion, streak }) {
  return {
    stage: companion?.stageIndex ?? 0,
    ep: companion?.ep ?? 0,
    level: timeline?.bestLevel ?? 1,
    streak: streak?.best ?? 0,
    focusSessions: (state?.focusSessions || []).length,
    reviews: Object.keys(state?.reviews || {}).length,
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

/** Ids of the items the player has, as a Set. `earned` = ids written when an event happened (see the plan, section 9). */
export function unlockedIds(facts, earned = {}, catalog = CATALOG) {
  const out = new Set();
  for (const item of catalog) if (ruleMet(item.rule, facts) || earned?.[item.id]) out.add(item.id);
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
export function nextReward(facts, earned = {}, catalog = CATALOG) {
  const have = unlockedIds(facts, earned, catalog);
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

/** The look to draw for this player: their choices, cleaned against what they really have. */
export function currentLook(state, facts, catalog = CATALOG) {
  return normalizeLook(state?.companion?.look, unlockedIds(facts, state?.earned, catalog), catalog);
}

/** Items that are unlocked now and were not in `seen` (the ids already celebrated), newest rules first. */
export function newItems(facts, earned, seen, catalog = CATALOG) {
  const have = unlockedIds(facts, earned, catalog);
  const old = new Set(seen || []);
  return catalog.filter((item) => have.has(item.id) && !old.has(item.id) && item.rule.type !== "always");
}

/** Level name for a hint, e.g. "nivelul 5 (Foc de tabără)". */
export const levelHint = (lvl) => `nivelul ${lvl} (${LEVELS.find((l) => l.lvl === lvl)?.name || "?"})`;
