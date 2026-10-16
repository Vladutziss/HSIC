import { test } from "node:test";
import assert from "node:assert/strict";
import { CODE, companionInfo, computeTimeline, evolutionPoints, reviveInfo, streakInfo } from "../src/lib/engine.js";
import { retireHabit, retiredOf, withHistory } from "../src/lib/retired.js";
import { addDays } from "../src/lib/dates.js";
import { fromRows, toRows } from "../src/lib/remote.js";

const TODAY = "2026-10-05";
const ALL = [0, 1, 2, 3, 4, 5, 6];
const habit = (id, extra = {}) => ({ id, name: id, diff: 3, days: ALL, createdAt: "2026-08-01", ...extra });
const range = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

// two hard habits, ticked every day for two months: the companion is well past the egg
function veteran() {
  const habits = [habit("a"), habit("b")];
  const log = {};
  for (const d of range("2026-08-01", addDays(TODAY, -1))) log[d] = { a: CODE.DONE, b: CODE.DONE };
  return { meta: { start: "2026-08-01" }, habits, log, reviews: {}, todos: [], companion: { name: "Molt" } };
}

const deleteAll = (s) => ["a", "b"].reduce((acc, id) => retireHabit(acc, id, TODAY), s);

test("deleting every habit keeps the companion's stage and the evolution points", () => {
  const before = veteran();
  const evBefore = companionInfo(before, computeTimeline(before, TODAY), TODAY);
  assert.notEqual(evBefore.stage.id, "egg");

  const after = deleteAll(before);
  assert.equal(after.habits.length, 0);
  assert.deepEqual(after.log, {});
  const evAfter = companionInfo(after, computeTimeline(after, TODAY), TODAY);
  assert.equal(evAfter.ep, evBefore.ep);
  assert.equal(evAfter.checkins, evBefore.checkins);
  assert.equal(evAfter.stage.id, evBefore.stage.id);
});

test("momentum up to the day of the deletion is exactly what it was", () => {
  const before = veteran();
  const after = deleteAll(before);
  const tb = computeTimeline(before, TODAY);
  const ta = computeTimeline(after, TODAY);
  const yesterday = addDays(TODAY, -1);
  assert.equal(ta.byDay[yesterday].momentum, tb.byDay[yesterday].momentum);
  assert.equal(ta.byDay["2026-09-01"].momentum, tb.byDay["2026-09-01"].momentum);
});

test("the streak and the revives still see the days the deleted habits were ticked", () => {
  const before = veteran();
  const after = deleteAll(before);
  assert.equal(streakInfo(after, TODAY).current, streakInfo(before, TODAY).current);
  assert.equal(streakInfo(after, TODAY).best, streakInfo(before, TODAY).best);
  assert.deepEqual(reviveInfo(after, TODAY).offer, reviveInfo(before, TODAY).offer);
});

test("a deleted habit is no longer scheduled from the day it was deleted", () => {
  const before = veteran();
  const after = retireHabit(before, "a", TODAY);
  const tb = computeTimeline(before, TODAY);
  const ta = computeTimeline(after, TODAY);
  assert.equal(ta.byDay[TODAY].schedCount, 1);
  assert.equal(tb.byDay[TODAY].schedCount, 2);
});

test("a habit created today and never ticked leaves no trace", () => {
  const s = { ...veteran(), habits: [...veteran().habits, habit("fresh", { createdAt: TODAY })] };
  const after = retireHabit(s, "fresh", TODAY);
  assert.equal(after.habits.length, 2);
  assert.equal(retiredOf(after).length, 0);
});

test("to-dos linked to the deleted habit stay, as plain to-dos", () => {
  const s = { ...veteran(), todos: [{ id: "t1", title: "x", habitId: "a" }, { id: "t2", title: "y", habitId: "b" }] };
  const after = retireHabit(s, "a", TODAY);
  assert.equal(after.todos[0].habitId, null);
  assert.equal(after.todos[1].habitId, "b");
});

test("withHistory puts the deleted habits and their check-ins back, and leaves a plain state alone", () => {
  const plain = veteran();
  assert.equal(withHistory(plain), plain);
  const full = withHistory(retireHabit(plain, "a", TODAY));
  assert.equal(full.habits.length, 2);
  assert.equal(full.log["2026-09-01"].a, CODE.DONE);
  assert.equal(evolutionPoints(retireHabit(plain, "a", TODAY)).ep, evolutionPoints(plain).ep);
});

test("the history survives a round trip through the database rows", () => {
  const after = deleteAll(veteran());
  const rows = toRows(after, "u1");
  const back = fromRows({ ...rows, groups: [] });
  assert.equal(retiredOf(back).length, 2);
  assert.equal(evolutionPoints(back).ep, evolutionPoints(veteran()).ep);
});
