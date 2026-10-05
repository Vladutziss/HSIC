import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE,
  LEVELS,
  computeTimeline,
  companionInfo,
  levelInfo,
  reviveInfo,
  stageFor,
  streakInfo,
} from "../src/lib/engine.js";
import { addDays } from "../src/lib/dates.js";

const TODAY = "2026-10-05"; // a Monday
const ALL = [0, 1, 2, 3, 4, 5, 6];
const habit = (id, extra = {}) => ({ id, name: id, diff: 2, days: ALL, createdAt: "2026-09-01", ...extra });

function stateWith({ start = "2026-09-20", activeDays = [], habits = [habit("a"), habit("b")], codes = {}, extra = {} } = {}) {
  const log = {};
  for (const d of activeDays) {
    log[d] = {};
    for (const h of habits) log[d][h.id] = codes[d]?.[h.id] ?? CODE.DONE;
  }
  return { meta: { start }, habits, log, reviews: {}, todos: [], ...extra };
}
const daysBetween = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

test("levels follow the thresholds", () => {
  assert.equal(levelInfo(0).lvl, 1);
  assert.equal(levelInfo(149).lvl, 1);
  assert.equal(levelInfo(150).lvl, 2);
  assert.equal(levelInfo(8500).lvl, 10);
  assert.equal(levelInfo(99999).lvl, 10);
  assert.equal(levelInfo(8500).progress, 1);
  assert.equal(levelInfo(200).toNext, 250);
  assert.equal(LEVELS.length, 10);
});

test("momentum grows on active days and stays provisional today", () => {
  const s = stateWith({ activeDays: daysBetween("2026-09-20", TODAY) });
  const t = computeTimeline(s, TODAY);
  const past = t.days.filter((d) => d.closed);
  for (let i = 1; i < past.length; i++) assert.ok(past[i].momentum > past[i - 1].momentum);
  assert.equal(t.current.closed, false);
  assert.equal(t.current.reviewXp, 0, "no review points before the evening review");
  assert.ok(t.level.lvl >= 4);
});

test("an inactive day keeps 85% of momentum", () => {
  const t = computeTimeline(stateWith({ activeDays: daysBetween("2026-09-20", "2026-10-01") }), TODAY);
  const m1 = t.byDay["2026-10-01"].momentum;
  const m2 = t.byDay["2026-10-02"].momentum;
  assert.ok(m1 > 0);
  assert.ok(Math.abs(m2 - m1 * 0.85) <= 1);
});

test("a partly done day keeps growing, just slower", () => {
  const s = stateWith({ activeDays: daysBetween("2026-09-20", "2026-10-01") });
  s.log["2026-10-02"] = { a: CODE.DONE }; // b missed
  const t = computeTimeline(s, TODAY);
  const d = t.byDay["2026-10-02"];
  assert.equal(d.completion, 0.5);
  assert.equal(d.chest, false);
  assert.ok(d.momentum > t.byDay["2026-10-01"].momentum * 0.96);
});

test("three inactive days in a row reset momentum to zero", () => {
  const s = stateWith({ activeDays: daysBetween("2026-09-20", "2026-09-30") });
  const t = computeTimeline(s, TODAY);
  assert.ok(t.byDay["2026-09-30"].momentum > 0);
  assert.ok(t.byDay["2026-10-02"].momentum > 0, "two inactive days only decay");
  assert.equal(t.byDay["2026-10-03"].momentum, 0, "third inactive day resets");
  assert.equal(t.byDay["2026-10-03"].reset, true);
  assert.deepEqual(t.resets, ["2026-10-03"]);
  for (const h of ["a", "b"]) {
    const point = t.habitSeries[h].find((p) => p.day === "2026-10-03");
    assert.equal(point.m, 0, "habit momentum resets too");
  }
});

test("the reset threshold is configurable", () => {
  const s = stateWith({ activeDays: daysBetween("2026-09-20", "2026-09-30"), extra: { settings: { resetAfter: 5 } } });
  const t = computeTimeline(s, TODAY);
  assert.ok(t.byDay["2026-10-03"].momentum > 0);
  assert.ok(t.byDay["2026-10-05"].momentum > 0, "four quiet days are under the threshold of five");
  assert.deepEqual(t.resets, []);
});

test("the AI review weighs 40% of the day score", () => {
  const s = stateWith({ activeDays: ["2026-10-04"], extra: { reviews: { "2026-10-04": { ai: 50 } } } });
  const t = computeTimeline(s, TODAY);
  const d = t.byDay["2026-10-04"];
  assert.equal(d.computed, 100);
  assert.equal(d.score, 80);
});

test("per-habit momentum only decays on scheduled days", () => {
  const h = habit("gym", { days: [1, 3, 5] }); // Mon, Wed, Fri
  const s = stateWith({ habits: [h], activeDays: ["2026-09-28"] }); // Monday
  const t = computeTimeline(s, TODAY);
  const at = (d) => t.habitSeries.gym.find((p) => p.day === d).m;
  assert.ok(at("2026-09-28") > 0);
  assert.equal(at("2026-09-29"), at("2026-09-28"), "Tuesday is a rest day");
  assert.ok(at("2026-09-30") < at("2026-09-29"), "missed Wednesday decays");
});

test("streak counts consecutive days and today does not break it", () => {
  const s = stateWith({ activeDays: daysBetween("2026-09-28", "2026-10-04") });
  const st = streakInfo(s, TODAY);
  assert.equal(st.current, 7);
  assert.equal(st.todayDone, false);
});

test("a revive is offered the day after a miss and restores the streak", () => {
  const active = daysBetween("2026-09-28", "2026-10-03"); // missed Oct 4
  const s = stateWith({ activeDays: active });
  const r = reviveInfo(s, TODAY);
  assert.equal(r.left, 2);
  assert.deepEqual(r.offer.days, ["2026-10-04"]);
  assert.equal(r.offer.streakBefore, 6);
  assert.equal(streakInfo(s, TODAY).current, 0);

  const revived = { ...s, streak: { revived: { "2026-10-04": TODAY } } };
  assert.equal(streakInfo(revived, TODAY).current, 7);
  const r2 = reviveInfo(revived, TODAY);
  assert.equal(r2.left, 1);
  assert.equal(r2.offer, null);
});

test("no revive for three missed days or when the month's revives are used", () => {
  const s = stateWith({ activeDays: daysBetween("2026-09-25", "2026-10-01") }); // missed Oct 2-4
  assert.equal(reviveInfo(s, TODAY).offer, null);

  const s2 = stateWith({
    activeDays: daysBetween("2026-09-25", "2026-10-03"),
    extra: { streak: { revived: { "2026-09-10": "2026-10-01", "2026-09-11": "2026-10-02" } } },
  });
  const r = reviveInfo(s2, TODAY);
  assert.equal(r.left, 0);
  assert.equal(r.offer.affordable, false);
});

test("the companion hatches and evolves from proof points", () => {
  assert.equal(stageFor(0).stage.id, "egg");
  assert.equal(stageFor(3).stage.id, "hatchling");
  assert.equal(stageFor(15).stage.id, "apprentice");
  assert.equal(stageFor(210).stage.id, "legend");

  const codes = { "2026-10-04": { a: CODE.VERIFIED, b: CODE.PLAUSIBLE } };
  const s = stateWith({ activeDays: ["2026-10-04"], codes, extra: { profile: { path: "studiu" } } });
  const t = computeTimeline(s, TODAY);
  const c = companionInfo(s, t, TODAY);
  assert.equal(c.ep, 5);
  assert.equal(c.stage.id, "hatchling");
  assert.equal(c.path, "studiu");
});

test("the companion sleeps while the player is away and is happy on return", () => {
  const s = stateWith({ activeDays: daysBetween("2026-09-25", "2026-10-02") }); // away Oct 3-4
  const t = computeTimeline(s, TODAY);
  assert.equal(companionInfo(s, t, TODAY).mood, "sleep");

  const back = stateWith({ activeDays: [...daysBetween("2026-09-25", "2026-10-02"), TODAY] });
  const t2 = computeTimeline(back, TODAY);
  const c = companionInfo(back, t2, TODAY);
  assert.equal(c.mood, "joy");
  assert.equal(c.awayDays, 2);
});
