import { test } from "node:test";
import assert from "node:assert/strict";
import { carryable, goalsFor, periodKey, periodLabel, previousKey } from "../src/lib/goals.js";

test("period keys and the previous period", () => {
  assert.equal(periodKey("week", "2026-10-08"), "2026-10-05"); // Thursday -> its Monday
  assert.equal(periodKey("month", "2026-10-08"), "2026-10");
  assert.equal(previousKey("week", "2026-10-05"), "2026-09-28");
  assert.equal(previousKey("month", "2026-10"), "2026-09");
  assert.equal(previousKey("month", "2026-01"), "2025-12");
  assert.equal(periodLabel("month", "2026-10"), "octombrie 2026");
});

test("goals are filtered by period, and unfinished ones can be carried over", () => {
  const g = (id, period, key, text, done = false) => ({ id, period, key, text, done });
  const goals = [
    g("a", "week", "2026-09-28", "Alergare 3 ori"),
    g("b", "week", "2026-09-28", "Citit o carte", true),
    g("c", "week", "2026-09-28", "Fără zahăr"),
    g("d", "week", "2026-10-05", "fără zahăr"), // already written this week, different case
    g("e", "month", "2026-09", "Un proiect"),
  ];
  assert.equal(goalsFor(goals, "week", "2026-09-28").length, 3);
  assert.deepEqual(carryable(goals, "week", "2026-10-05").map((x) => x.id), ["a"]);
  assert.deepEqual(carryable(goals, "month", "2026-10").map((x) => x.id), ["e"]);
  assert.deepEqual(carryable(goals, "month", "2026-11"), []);
});
