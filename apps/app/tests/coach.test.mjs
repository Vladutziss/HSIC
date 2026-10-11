import { test } from "node:test";
import assert from "node:assert/strict";
import { coachData, hasHistory } from "../src/lib/coach.js";
import { addDays, weekday } from "../src/lib/dates.js";

const TODAY = "2026-10-12";

test("coachData counts scheduled and done per weekday over the last 28 days", () => {
  const habit = { id: "h1", name: "Alergat", diff: 2, days: [1, 3], createdAt: "2026-01-01" };
  const log = {};
  // done on every scheduled day in the window except Wednesdays
  for (let i = 1; i <= 28; i++) {
    const day = addDays(TODAY, -i);
    if (weekday(day) === 1) log[day] = { h1: 1 };
  }
  const data = coachData({ profile: { goal: "g" }, habits: [habit], log }, TODAY);
  const h = data.habits[0];
  assert.equal(h.sched, 8); // 4 Mondays + 4 Wednesdays
  assert.equal(h.done, 4);
  assert.deepEqual(h.wd[1], [4, 4]);
  assert.deepEqual(h.wd[3], [4, 0]);
  assert.equal(data.count, 1);
  assert.ok(hasHistory(data));
});

test("archived habits are left out and a new habit has no history", () => {
  const data = coachData(
    { habits: [{ id: "a", name: "A", diff: 1, days: [0, 1, 2, 3, 4, 5, 6], archivedAt: "2026-10-01" }, { id: "b", name: "B", diff: 1, days: [1], createdAt: TODAY }], log: {} },
    TODAY
  );
  assert.equal(data.habits.length, 1);
  assert.equal(data.habits[0].sched, 0);
  assert.ok(!hasHistory(data));
});
