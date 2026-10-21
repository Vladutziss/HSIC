import { test } from "node:test";
import assert from "node:assert/strict";
import { isScheduled } from "../src/lib/engine.js";
import { occursOn } from "../src/lib/todos.js";
import { fromRows, toRows } from "../src/lib/remote.js";
import { goalTodoIndex } from "../src/lib/objectives.js";

const h = { id: "h1", name: "Sală", days: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-10-01" };

test("a skipped day takes a repeating habit off that day only", () => {
  const s = { ...h, skip: ["2026-10-21"] };
  assert.equal(isScheduled(s, "2026-10-21"), false);
  assert.equal(isScheduled(s, "2026-10-22"), true);
});

test("a skipped day takes one occurrence of a repeating to-do off", () => {
  const t = { id: "t1", date: "2026-10-01", repeat: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6], until: null }, skipDays: ["2026-10-21"] };
  assert.equal(occursOn(t, "2026-10-21"), false);
  assert.equal(occursOn(t, "2026-10-22"), true);
});

test("skips survive the trip through the database rows", () => {
  const state = {
    profile: { nick: "V" },
    habits: [{ ...h, skip: ["2026-10-21"] }],
    todos: [{ id: "t1", title: "x", date: "2026-10-01", repeat: { kind: "daily", days: [1], until: null }, doneDays: [], skipDays: ["2026-10-20"] }],
    log: {},
    meta: { start: "2026-10-01" },
  };
  const rows = toRows(state, "u1");
  const back = fromRows({ ...rows, profile: { ...rows.profile, name: "V" }, completions: rows.completions, todos: rows.todos.map((t) => ({ ...t, created_at: null })) });
  assert.deepEqual(back.habits[0].skip, ["2026-10-21"]);
  assert.deepEqual(back.todos[0].skipDays, ["2026-10-20"]);
});

test("to-dos made from goals are marked", () => {
  const idx = goalTodoIndex({
    objectives: [{ id: "o1", title: "Lot AI", color: "#3987e5", steps: [{ id: "s1", todoId: "t1" }] }],
    goals: [{ id: "g1", text: "Capitolul 3", todoIds: ["t2"] }],
  });
  assert.equal(idx.t1.label, "Lot AI");
  assert.equal(idx.t1.oid, "o1");
  assert.equal(idx.t2.label, "Capitolul 3");
  assert.equal(idx.t3, undefined);
});
