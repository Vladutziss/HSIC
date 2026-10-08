import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStats } from "../src/lib/stats.js";
import { computeTimeline, streakInfo } from "../src/lib/engine.js";

const TODAY = "2026-10-05";
const state = {
  habits: [{ id: "h1", diff: 2, days: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-10-01" }],
  log: { "2026-10-02": { h1: 4 }, "2026-10-03": { h1: 1 }, "2026-10-04": { h1: 2 } },
  reviews: {},
  todos: [],
  streak: { revived: {} },
  settings: {},
  meta: { start: "2026-10-01" },
};

test("buildStats matches the engine and survives JSON", () => {
  const s = JSON.parse(JSON.stringify(buildStats(state, TODAY)));
  const t = computeTimeline(state, TODAY);
  assert.equal(s.days.length, t.days.length);
  assert.equal(s.bestMomentum, t.bestMomentum);
  assert.deepEqual(s.streak, streakInfo(state, TODAY));
  assert.equal(s.checkins, 3);
  assert.deepEqual(s.evolution, { ep: 6, checkins: 3 }); // three check-ins of a medium habit
});
