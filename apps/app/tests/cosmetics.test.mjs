import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, DEFAULT_LOOK, RARITIES, SLOTS, collectFacts, currentLook, findItem, hintFor, itemsFor, compactLook, levelHint, newItems, nextReward, normalizeLook, progressToward, ruleMet, unlockedIds } from "../src/lib/cosmetics.js";
import { computeTimeline, streakInfo, companionInfo } from "../src/lib/engine.js";
import { AURAS, HATS, HELD_ITEMS, resolveLook, spriteRuns, auraRuns } from "../src/lib/sprites.js";
import { seedHistory } from "./fixtures/history.mjs";
import { CATALOG as GAME_CATALOG, habitFromCatalog } from "../src/lib/catalog.js";
import { addDays } from "../src/lib/dates.js";

const TODAY = "2026-10-05";

// a small catalog that exercises every rule type
const item = (id, slot, rule, rarity = "common") => ({ id, slot, rarity, name: id, hint: "", rule });
const TEST = [
  item("signature", "hat", { type: "always" }),
  item("none", "hat", { type: "always" }),
  item("focus-cap", "hat", { type: "count", fact: "focusSessions", min: 10 }),
  item("wizard", "hat", { type: "streak", min: 30 }, "epic"),
  item("crown", "hat", { type: "stage", min: 5 }, "legendary"),
  item("embers", "aura", { type: "level", min: 2 }),
  item("star", "aura", { type: "level", min: 9 }, "epic"),
  item("mystery", "effect", { type: "who-knows" }),
  item("none", "aura", { type: "always" }),
];
const facts = (over = {}) => ({ stage: 0, ep: 0, level: 1, streak: 0, focusSessions: 0, reviews: 0, ...over });

test("the catalog has every slot's default, unique ids per slot and valid rules", () => {
  for (const slot of SLOTS) assert.ok(CATALOG.some((i) => i.slot === slot && i.id === DEFAULT_LOOK[slot]), `default for ${slot}`);
  const keys = CATALOG.map((i) => `${i.slot}:${i.id}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const i of CATALOG) assert.ok(ruleMet(i.rule, facts({ stage: 5, level: 10, streak: 999, focusSessions: 999, studySessions: 999, reviews: 999, goalsDone: 99 })) || i.rule.type === "never", i.id);
});

test("the renderer knows every default the catalog hands out", () => {
  const look = resolveLook(DEFAULT_LOOK);
  for (const k of ["hat", "held", "aura", "dye"]) assert.equal(look[k], DEFAULT_LOOK[k]);
});

test("rules: each type unlocks at its threshold, an unknown type never does", () => {
  assert.equal(ruleMet({ type: "always" }, facts()), true);
  assert.equal(ruleMet({ type: "stage", min: 2 }, facts({ stage: 1 })), false);
  assert.equal(ruleMet({ type: "stage", min: 2 }, facts({ stage: 2 })), true);
  assert.equal(ruleMet({ type: "level", min: 5 }, facts({ level: 4 })), false);
  assert.equal(ruleMet({ type: "level", min: 5 }, facts({ level: 5 })), true);
  assert.equal(ruleMet({ type: "streak", min: 7 }, facts({ streak: 7 })), true);
  assert.equal(ruleMet({ type: "count", fact: "reviews", min: 3 }, facts({ reviews: 2 })), false);
  assert.equal(ruleMet({ type: "count", fact: "reviews", min: 3 }, facts({ reviews: 3 })), true);
  assert.equal(ruleMet({ type: "count", fact: "nothing", min: 1 }, facts()), false);
  assert.equal(ruleMet({ type: "who-knows" }, facts({ stage: 5 })), false);
  assert.equal(ruleMet(undefined, facts()), false);
});

test("unlockedIds: thresholds, and an item written to `earned` counts even when the rule is not met", () => {
  const a = unlockedIds(facts({ level: 2, focusSessions: 9 }), {}, TEST);
  assert.deepEqual([...a].sort(), ["embers", "none", "signature"]);
  const b = unlockedIds(facts({ level: 9, focusSessions: 10, streak: 30, stage: 5 }), {}, TEST);
  for (const id of ["focus-cap", "wizard", "crown", "embers", "star"]) assert.ok(b.has(id), id);
  assert.ok(!b.has("mystery"));
  assert.ok(unlockedIds(facts(), { mystery: "2026-10-01" }, TEST).has("mystery"));
});

test("progressToward: have, need and ratio, capped at 1", () => {
  assert.deepEqual(progressToward(TEST[2], facts({ focusSessions: 4 })), { have: 4, need: 10, ratio: 0.4 });
  assert.equal(progressToward(TEST[2], facts({ focusSessions: 40 })).ratio, 1);
  assert.equal(progressToward(TEST[7], facts()), null);
  assert.equal(progressToward(TEST[0], facts()).ratio, 1);
});

test("nextReward is the closest locked item and skips unlocked and unmeasurable ones", () => {
  // focus 8/10 = 0.8, level 1/2 = 0.5, streak 3/30 = 0.1, stage 0/5 = 0
  assert.equal(nextReward(facts({ level: 1, focusSessions: 8, streak: 3 }), {}, TEST).item.id, "focus-cap");
  assert.equal(nextReward(facts({ level: 1, focusSessions: 8, streak: 3 }), {}, TEST).progress.have, 8);
  // with the cap unlocked the next one is the embers aura
  assert.equal(nextReward(facts({ level: 1, focusSessions: 10 }), {}, TEST).item.id, "embers");
  // everything measurable unlocked: nothing left to point at (the "mystery" item cannot be measured)
  assert.equal(nextReward(facts({ level: 9, focusSessions: 10, streak: 30, stage: 5 }), {}, TEST), null);
  assert.equal(nextReward(facts(), { "focus-cap": "x", wizard: "x", crown: "x", embers: "x", star: "x" }, TEST), null);
});

test("normalizeLook keeps only known slots with items of that slot that exist and are unlocked", () => {
  const have = new Set(["signature", "none", "focus-cap"]);
  const look = normalizeLook({ hat: "focus-cap", aura: "none", effect: "nope", bogus: "x", title: 5 }, have, TEST);
  assert.equal(look.hat, "focus-cap");
  for (const slot of SLOTS) if (slot !== "hat") assert.equal(look[slot], DEFAULT_LOOK[slot], slot);
  // locked: back to the default
  assert.equal(normalizeLook({ hat: "wizard" }, have, TEST).hat, "signature");
  // an id that exists, but in another slot, does not count
  assert.equal(normalizeLook({ aura: "wizard" }, new Set(["wizard", "none"]), TEST).aura, "none");
  // no unlock list (someone else's look): only the catalog check
  assert.equal(normalizeLook({ hat: "wizard" }, null, TEST).hat, "wizard");
  for (const bad of [null, undefined, "x", 3, []]) assert.deepEqual(normalizeLook(bad, null, TEST), DEFAULT_LOOK);
});

test("currentLook draws what the player chose among what they really have", () => {
  const state = { companion: { look: { hat: "focus-cap", aura: "star" } } };
  const look = currentLook(state, facts({ focusSessions: 10, level: 3 }), TEST);
  assert.equal(look.hat, "focus-cap");
  assert.equal(look.aura, "none"); // level 9 not reached
  assert.deepEqual(currentLook({}, facts(), TEST), DEFAULT_LOOK);
});

test("newItems lists unlocked items not yet celebrated, never the always-free ones", () => {
  const f = facts({ level: 2, focusSessions: 10 });
  assert.deepEqual(newItems(f, {}, [], TEST).map((i) => i.id).sort(), ["embers", "focus-cap"]);
  assert.deepEqual(newItems(f, {}, ["embers"], TEST).map((i) => i.id), ["focus-cap"]);
  assert.deepEqual(newItems(f, {}, ["embers", "focus-cap"], TEST), []);
});

test("levelHint names the level", () => {
  assert.equal(levelHint(5), "nivelul 5 (Foc de tabără)");
});

// the facts come from the real engine, and what was earned stays earned
function playerState() {
  const state = {
    v: 2,
    profile: { nick: "T", path: "sport" },
    companion: { name: "Ecou" },
    habits: [],
    log: {},
    reviews: {},
    todos: [],
    streak: { revived: {} },
    settings: { reviewTime: "21:00", autoReview: true, resetAfter: 3 },
    meta: { start: TODAY },
  };
  for (const c of GAME_CATALOG.slice(0, 3)) state.habits.push(habitFromCatalog(c, state.habits, TODAY));
  seedHistory(state, TODAY);
  return state;
}

test("collectFacts reads the best level and streak, so a momentum reset takes nothing away", () => {
  const state = playerState();
  const timeline = computeTimeline(state, TODAY);
  assert.ok(timeline.resets.length > 0, "the history has a reset");
  assert.ok(timeline.bestLevel >= timeline.level.lvl);
  const streak = streakInfo(state, TODAY);
  const companion = companionInfo(state, timeline, TODAY);
  const f = collectFacts({ state, timeline, companion, streak });
  assert.equal(f.level, timeline.bestLevel);
  assert.equal(f.streak, streak.best);
  assert.equal(f.stage, companion.stageIndex);
  assert.equal(f.reviews, Object.keys(state.reviews).length);
  assert.equal(f.focusSessions, 0);
  // the same player after more quiet days: facts only ever go up
  const later = computeTimeline(state, addDays(TODAY, 10));
  const f2 = collectFacts({ state, timeline: later, companion: companionInfo(state, later, addDays(TODAY, 10)), streak: streakInfo(state, addDays(TODAY, 10)) });
  assert.ok(f2.level >= f.level && f2.streak >= f.streak && f2.stage >= f.stage);
});

test("the catalog: six hats and nine auras, every rule measurable, every rarity valid", () => {
  const earnable = (slot) => itemsFor(slot).filter((i) => i.rule.type !== "always");
  assert.equal(earnable("hat").length, 6);
  assert.equal(earnable("aura").length, 9);
  for (const i of CATALOG) {
    assert.ok(RARITIES.includes(i.rarity), i.id);
    assert.ok(i.name, i.id);
    assert.ok(progressToward(i, facts()), `${i.id} can be measured`);
  }
});

test("every hat and aura in the catalog can be drawn, and each one looks different", () => {
  for (const slot of ["hat", "aura", "held"]) {
    for (const i of itemsFor(slot)) {
      const reg = slot === "hat" ? HATS : slot === "aura" ? AURAS : HELD_ITEMS;
      assert.ok(Object.hasOwn(reg, i.id), `${slot}:${i.id} is drawn by the renderer`);
    }
  }
  const seen = new Set();
  for (const i of itemsFor("hat")) seen.add(JSON.stringify(spriteRuns({ path: "sport", stage: "legend", look: { hat: i.id } })));
  assert.equal(seen.size, itemsFor("hat").length);
  const auras = new Set();
  for (const i of itemsFor("aura").filter((x) => x.id !== "none")) {
    const a = auraRuns({ path: "sport", stage: "apprentice", look: { aura: i.id } });
    assert.ok(a && a.runs.length > 5 && a.anim, i.id);
    auras.add(JSON.stringify(a.runs));
  }
  assert.equal(auras.size, 9);
  assert.equal(auraRuns({ path: "sport", stage: "legend" }), null);
  assert.equal(auraRuns({ path: "sport", stage: "legend", look: { aura: "bogus" } }), null);
});

test("auras follow the level: Jar (2) up to Supernova (10), one level each", () => {
  const levels = itemsFor("aura").filter((i) => i.rule.type === "level").map((i) => i.rule.min);
  assert.deepEqual(levels, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(findItem("aura", "nova").rule.min, 10);
  assert.equal(findItem("aura", "nova").rarity, "legendary");
});

test("hintFor says what is missing, in Romanian, and nothing once unlocked", () => {
  const cap = findItem("hat", "focus-cap");
  assert.equal(hintFor(cap, facts({ focusSessions: 4 })).text, "Încă 6 sesiuni Focus");
  assert.equal(hintFor(cap, facts({ focusSessions: 9 })).text, "Încă 1 sesiune Focus");
  assert.equal(hintFor(cap, facts({ focusSessions: 10 })).text, "");
  assert.equal(hintFor(findItem("hat", "night-cap"), facts({ reviews: 0 })).text, "Încă 7 rapoarte de seară");
  assert.equal(hintFor(findItem("hat", "wizard"), facts({ streak: 12 })).text, "Serie de 30 de zile (recordul tău: 12)");
  assert.equal(hintFor(findItem("hat", "crown"), facts({ stage: 3 })).text, "Evoluează până la Legendă");
  assert.equal(hintFor(findItem("aura", "torch"), facts({ level: 2 })).text, "Atinge nivelul 4 (Torță)");
  assert.equal(hintFor(findItem("hat", "laurel"), facts()).text, "Încă 1 obiectiv terminat");
  assert.equal(hintFor(findItem("hat", "grad-cap"), facts({ studySessions: 3 })).progress.ratio, 0.3);
});

test("collectFacts counts study sessions and finished goals with steps", () => {
  const state = {
    schoolPlanner: { sessions: [{}, {}, {}] },
    objectives: [
      { doneOn: "2026-10-01", steps: [{ id: "a" }] },
      { doneOn: "2026-10-02", steps: [] }, // no steps: not "with steps"
      { doneOn: null, steps: [{ id: "b" }] },
    ],
    focusSessions: [{}],
    reviews: { "2026-10-01": {}, "2026-10-02": {} },
  };
  const f = collectFacts({ state, timeline: { bestLevel: 4 }, companion: { stageIndex: 2, ep: 20 }, streak: { best: 5 } });
  assert.deepEqual(f, { stage: 2, ep: 20, level: 4, streak: 5, focusSessions: 1, studySessions: 3, reviews: 2, goalsDone: 1 });
});

test("compactLook keeps only the choices that differ from the default, and nothing else", () => {
  assert.deepEqual(compactLook(DEFAULT_LOOK), {});
  assert.deepEqual(compactLook({ ...DEFAULT_LOOK, hat: "wizard", aura: "nova" }), { hat: "wizard", aura: "nova" });
  assert.deepEqual(compactLook({ hat: "none" }), { hat: "none" });
  assert.deepEqual(compactLook(null), {});
  assert.deepEqual(compactLook({ bogus: "x" }), {});
});

test("what a group member publishes is read back safely, whatever it contains", () => {
  const published = compactLook({ ...DEFAULT_LOOK, hat: "crown", aura: "nova" });
  assert.deepEqual(normalizeLook(published), { ...DEFAULT_LOOK, hat: "crown", aura: "nova" });
  // unknown ids, wrong slots, wrong types: the defaults
  assert.deepEqual(normalizeLook({ hat: "nova", aura: "crown", effect: 3, evil: "<script>" }), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook(undefined), DEFAULT_LOOK);
});

test("derive publishes the look to the group unless the player turns it off", async () => {
  const { derive } = await import("../src/lib/derive.js");
  const state = playerState();
  state.companion = { name: "Ecou", look: { hat: "none" } };
  assert.deepEqual(derive(state, TODAY).publicStats.look, { hat: "none" });
  assert.deepEqual(derive(state, TODAY).companion.look.hat, "none");
  state.settings.shareLook = false;
  assert.deepEqual(derive(state, TODAY).publicStats.look, {});
  // what Molt wears for itself is not hidden
  assert.equal(derive(state, TODAY).look.hat, "none");
});
